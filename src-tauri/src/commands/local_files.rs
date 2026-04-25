use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus", "aiff",
];
const HASH_CHUNK: usize = 16384;
const BATCH_SIZE: usize = 50;
const COVER_SIZE: u32 = 200;
const MAX_EMBEDDED_COVER_BYTES: usize = 32 * 1024 * 1024;
const MAX_COVER_DIMENSION: u32 = 8000;
const MAX_COVER_ALLOC_BYTES: u64 = 256 * 1024 * 1024;
const MAX_PARSER_THREADS: usize = 4;
const CACHE_SAVE_INTERVAL: usize = 500;

#[derive(Default, Serialize, Deserialize)]
struct LocalFilesCache {
    files: HashMap<String, LocalFileInfo>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LocalFileInfo {
    pub path: String,
    pub file_name: String,
    pub file_hash: String,
    pub modified_at: u64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub file_size: u64,
    pub cover: Option<String>,
}

fn fast_hash(path: &Path, size: u64) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("Open: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(size.to_le_bytes());
    let mut buf = vec![0u8; HASH_CHUNK];
    let n = file.read(&mut buf).map_err(|e| format!("Read: {}", e))?;
    hasher.update(&buf[..n]);
    Ok(format!("{:x}", hasher.finalize()))
}

fn cover_cache_dir() -> PathBuf {
    let mut dir = crate::utils::config::app_data_dir().unwrap_or_else(std::env::temp_dir);
    dir.push("covers");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn cached_cover_path(file_hash: &str) -> Option<String> {
    let path = cover_cache_dir().join(format!("{}.webp", file_hash));
    path.exists().then(|| path.to_string_lossy().to_string())
}

fn local_files_cache_path() -> PathBuf {
    let mut dir = crate::utils::config::app_data_dir().unwrap_or_else(std::env::temp_dir);
    let _ = fs::create_dir_all(&dir);
    dir.push("local_files_cache_v1.json");
    dir
}

fn load_local_files_cache() -> LocalFilesCache {
    let path = local_files_cache_path();
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_local_files_cache(cache: &LocalFilesCache) {
    let path = local_files_cache_path();
    if let Ok(raw) = serde_json::to_vec(cache) {
        let _ = fs::write(path, raw);
    }
}

fn parser_thread_count() -> usize {
    std::thread::available_parallelism()
        .map(|count| count.get().saturating_sub(1).clamp(2, MAX_PARSER_THREADS))
        .unwrap_or(2)
}

fn build_parser_pool() -> Option<rayon::ThreadPool> {
    rayon::ThreadPoolBuilder::new()
        .num_threads(parser_thread_count())
        .thread_name(|index| format!("juicevault-local-parser-{index}"))
        .build()
        .ok()
}

fn save_cover(data: &[u8], file_hash: &str) -> Option<String> {
    if data.len() > MAX_EMBEDDED_COVER_BYTES {
        return None;
    }

    let out = cover_cache_dir().join(format!("{}.webp", file_hash));
    if out.exists() {
        return Some(out.to_string_lossy().to_string());
    }
    let mut reader = image::ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .ok()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_COVER_DIMENSION);
    limits.max_image_height = Some(MAX_COVER_DIMENSION);
    limits.max_alloc = Some(MAX_COVER_ALLOC_BYTES);
    reader.limits(limits);
    let img = reader.decode().ok()?;
    let thumb = img.resize(
        COVER_SIZE,
        COVER_SIZE,
        image::imageops::FilterType::Triangle,
    );
    let mut buf = Cursor::new(Vec::new());
    thumb.write_to(&mut buf, image::ImageFormat::WebP).ok()?;
    fs::write(&out, buf.into_inner()).ok()?;
    Some(out.to_string_lossy().to_string())
}

fn synchsafe_to_u32(bytes: &[u8]) -> Option<u32> {
    if bytes.len() != 4 || bytes.iter().any(|byte| byte & 0x80 != 0) {
        return None;
    }

    Some(
        ((bytes[0] as u32) << 21)
            | ((bytes[1] as u32) << 14)
            | ((bytes[2] as u32) << 7)
            | bytes[3] as u32,
    )
}

fn find_image_magic(data: &[u8]) -> Option<&[u8]> {
    const MAGIC_PATTERNS: &[&[u8]] = &[
        b"\xFF\xD8\xFF",
        b"\x89PNG\r\n\x1A\n",
        b"RIFF",
        b"GIF87a",
        b"GIF89a",
        b"BM",
        b"II*\0",
        b"MM\0*",
    ];

    MAGIC_PATTERNS
        .iter()
        .filter_map(|magic| {
            data.windows(magic.len())
                .position(|window| window == *magic)
        })
        .min()
        .map(|index| &data[index..])
}

fn extract_id3_cover(path: &Path, file_hash: &str) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut header = [0u8; 10];
    file.read_exact(&mut header).ok()?;
    if &header[..3] != b"ID3" {
        return None;
    }

    let major_version = header[3];
    let flags = header[5];
    let tag_size = synchsafe_to_u32(&header[6..10])? as usize;
    if tag_size == 0 || tag_size > 64 * 1024 * 1024 {
        return None;
    }

    let mut tag = vec![0u8; tag_size];
    file.read_exact(&mut tag).ok()?;

    let mut pos = 0usize;
    if flags & 0x40 != 0 && tag.len() >= 4 {
        let extended_size = if major_version == 4 {
            synchsafe_to_u32(&tag[..4])? as usize
        } else {
            u32::from_be_bytes(tag[..4].try_into().ok()?) as usize
        };
        pos = pos.saturating_add(extended_size.min(tag.len()));
    }

    while pos < tag.len() {
        if major_version == 2 {
            if pos + 6 > tag.len() {
                break;
            }
            let frame_id = &tag[pos..pos + 3];
            if frame_id.iter().all(|byte| *byte == 0) {
                break;
            }
            let frame_size = ((tag[pos + 3] as usize) << 16)
                | ((tag[pos + 4] as usize) << 8)
                | tag[pos + 5] as usize;
            pos += 6;
            if pos + frame_size > tag.len() {
                break;
            }
            if frame_id == b"PIC" {
                if let Some(data) = find_image_magic(&tag[pos..pos + frame_size]) {
                    if let Some(path) = save_cover(data, file_hash) {
                        return Some(path);
                    }
                }
            }
            pos += frame_size;
            continue;
        }

        if pos + 10 > tag.len() {
            break;
        }
        let frame_id = &tag[pos..pos + 4];
        if frame_id.iter().all(|byte| *byte == 0) {
            break;
        }
        let frame_size = if major_version == 4 {
            synchsafe_to_u32(&tag[pos + 4..pos + 8])? as usize
        } else {
            u32::from_be_bytes(tag[pos + 4..pos + 8].try_into().ok()?) as usize
        };
        pos += 10;
        if pos + frame_size > tag.len() {
            break;
        }
        if frame_id == b"APIC" {
            if let Some(data) = find_image_magic(&tag[pos..pos + frame_size]) {
                if let Some(path) = save_cover(data, file_hash) {
                    return Some(path);
                }
            }
        }
        pos += frame_size;
    }

    None
}

struct AudioMeta {
    title: String,
    artist: String,
    album: String,
    duration: f64,
    cover_path: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct KnownLocalFile {
    pub path: String,
    #[serde(rename = "file_hash")]
    pub _file_hash: String,
    pub file_size: u64,
    pub modified_at: u64,
}

struct CandidateFile {
    path: PathBuf,
    file_hash: Option<String>,
    modified_at: u64,
}

fn file_modified_at(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn read_metadata(path: &Path, file_hash: &str) -> AudioMeta {
    read_metadata_with_options(path, file_hash, false)
}

fn read_cover_metadata(path: &Path, file_hash: &str) -> Option<String> {
    read_metadata_with_options(path, file_hash, true)
        .cover_path
        .or_else(|| extract_id3_cover(path, file_hash))
}

fn read_metadata_with_options(path: &Path, file_hash: &str, read_cover_art: bool) -> AudioMeta {
    use lofty::config::ParseOptions;
    use lofty::prelude::*;
    use lofty::probe::Probe;

    let tagged = Probe::open(path).ok().and_then(|p| {
        p.options(ParseOptions::new().read_cover_art(read_cover_art))
            .read()
            .ok()
    });

    let Some(tagged_file) = tagged else {
        return AudioMeta {
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            duration: 0.0,
            cover_path: None,
        };
    };

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let duration = tagged_file.properties().duration().as_secs_f64();

    let (title, artist, album) = tag
        .map(|t| {
            (
                t.title().map(|s| s.to_string()).unwrap_or_default(),
                t.artist().map(|s| s.to_string()).unwrap_or_default(),
                t.album().map(|s| s.to_string()).unwrap_or_default(),
            )
        })
        .unwrap_or_default();

    let cover_path = if read_cover_art {
        find_best_cover(tagged_file.tags()).and_then(|pic| save_cover(pic.data(), file_hash))
    } else {
        None
    };

    AudioMeta {
        title,
        artist,
        album,
        duration,
        cover_path,
    }
}

fn find_best_cover<'a>(tags: &'a [lofty::tag::Tag]) -> Option<&'a lofty::picture::Picture> {
    tags.iter()
        .flat_map(|tag| tag.pictures())
        .find(|pic| pic.pic_type() == lofty::picture::PictureType::CoverFront)
        .or_else(|| tags.iter().flat_map(|tag| tag.pictures()).next())
}

fn process_file(
    path: &Path,
    precomputed_hash: Option<String>,
    modified_at: u64,
) -> Option<LocalFileInfo> {
    let file_name = path.file_name()?.to_str()?.to_string();
    let file_size = fs::metadata(path).ok()?.len();
    let file_hash = precomputed_hash.or_else(|| fast_hash(path, file_size).ok())?;
    let meta = read_metadata(path, &file_hash);
    let title = if meta.title.is_empty() {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string()
    } else {
        meta.title
    };
    Some(LocalFileInfo {
        path: path.to_string_lossy().to_string(),
        file_name,
        file_hash,
        modified_at,
        title,
        artist: if meta.artist.is_empty() {
            "Unknown".into()
        } else {
            meta.artist
        },
        album: meta.album,
        duration: meta.duration,
        file_size,
        cover: meta.cover_path,
    })
}

fn emit_files_batch(app: &AppHandle, files: Vec<LocalFileInfo>, processed_total: &mut usize) {
    if files.is_empty() {
        return;
    }

    *processed_total += files.len();
    let _ = app.emit(
        "local-files-batch",
        json!({
            "files": files,
            "total": *processed_total,
        }),
    );
}

fn process_and_cache_batch(
    app: &AppHandle,
    cache: &mut LocalFilesCache,
    parser_pool: Option<&rayon::ThreadPool>,
    batch: Vec<CandidateFile>,
    processed_total: &mut usize,
) -> usize {
    if batch.is_empty() {
        return 0;
    }

    let files: Vec<LocalFileInfo> = if let Some(pool) = parser_pool {
        pool.install(|| {
            batch
                .into_par_iter()
                .filter_map(|candidate| {
                    process_file(&candidate.path, candidate.file_hash, candidate.modified_at)
                })
                .collect()
        })
    } else {
        batch
            .into_iter()
            .filter_map(|candidate| {
                process_file(&candidate.path, candidate.file_hash, candidate.modified_at)
            })
            .collect()
    };

    let processed = files.len();

    for file in &files {
        cache.files.insert(file.path.clone(), file.clone());
    }

    emit_files_batch(app, files, processed_total);
    processed
}

#[tauri::command]
pub async fn scan_local_directory(
    app: AppHandle,
    directory: String,
    known_files: Option<Vec<KnownLocalFile>>,
    allow_updates: Option<bool>,
) -> Result<Value, String> {
    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Directory does not exist".into());
    }

    let directory_prefix = dir_path.to_string_lossy().to_string();
    let allow_updates = allow_updates.unwrap_or(false);
    let known_files = known_files.unwrap_or_default();
    let mut cache = load_local_files_cache();
    let parser_pool = build_parser_pool();
    let known_by_path: HashMap<String, KnownLocalFile> = known_files
        .iter()
        .cloned()
        .map(|entry| (entry.path.clone(), entry))
        .collect();
    let known_paths_in_directory: HashSet<String> = known_files
        .iter()
        .filter(|entry| entry.path.starts_with(&directory_prefix))
        .map(|entry| entry.path.clone())
        .collect();
    let mut processed_total = 0usize;
    let mut changed_paths = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut pending = Vec::with_capacity(BATCH_SIZE);
    let mut cached_pending = Vec::with_capacity(BATCH_SIZE);
    let mut changed_since_cache_save = 0usize;
    let _ = app.emit(
        "local-files-batch",
        json!({ "files": [], "total": 0, "scanning": true }),
    );

    for entry in WalkDir::new(&dir_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        if !AUDIO_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        let path_string = path.to_string_lossy().to_string();
        seen_paths.insert(path_string.clone());
        let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let modified_at = file_modified_at(path);

        if let Some(existing) = cache.files.get(&path_string) {
            if existing.file_size == size && existing.modified_at == modified_at {
                let mut cached = existing.clone();
                if cached.cover.is_none() {
                    cached.cover = cached_cover_path(&cached.file_hash);
                }
                cached_pending.push(cached);
                if cached_pending.len() >= BATCH_SIZE {
                    emit_files_batch(
                        &app,
                        std::mem::take(&mut cached_pending),
                        &mut processed_total,
                    );
                }
                continue;
            }
        }

        if let Some(existing) = known_by_path.get(&path_string) {
            if existing.file_size == size && existing.modified_at == modified_at {
                continue;
            }

            if !allow_updates {
                changed_paths.push(path_string);
                continue;
            }
        }

        pending.push(CandidateFile {
            path: path.to_path_buf(),
            file_hash: None,
            modified_at,
        });

        if pending.len() >= BATCH_SIZE {
            changed_since_cache_save += process_and_cache_batch(
                &app,
                &mut cache,
                parser_pool.as_ref(),
                std::mem::take(&mut pending),
                &mut processed_total,
            );

            if changed_since_cache_save >= CACHE_SAVE_INTERVAL {
                save_local_files_cache(&cache);
                changed_since_cache_save = 0;
            }
        }
    }

    emit_files_batch(&app, cached_pending, &mut processed_total);
    let _ = process_and_cache_batch(
        &app,
        &mut cache,
        parser_pool.as_ref(),
        pending,
        &mut processed_total,
    );

    let removed_paths: Vec<String> = known_paths_in_directory
        .into_iter()
        .filter(|path| !seen_paths.contains(path))
        .collect();

    let cached_removed_paths: Vec<String> = cache
        .files
        .keys()
        .filter(|path| path.starts_with(&directory_prefix) && !seen_paths.contains(*path))
        .cloned()
        .collect();

    for path in &cached_removed_paths {
        cache.files.remove(path);
    }

    save_local_files_cache(&cache);

    let removed_paths: Vec<String> = removed_paths
        .into_iter()
        .chain(cached_removed_paths.into_iter())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let summary = json!({
        "directory": directory,
        "count": processed_total,
        "changedCount": changed_paths.len(),
        "changedPaths": changed_paths,
        "removedPaths": removed_paths,
    });

    let _ = app.emit("local-scan-complete", summary.clone());
    Ok(summary)
}

#[tauri::command]
pub async fn show_in_explorer(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(dir) = path.parent() {
            std::process::Command::new("xdg-open")
                .arg(dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn hash_single_file(file_path: String) -> Result<Value, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }
    let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let hash = fast_hash(&path, file_size)?;
    let meta = read_metadata(&path, &hash);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(json!({
        "path": file_path,
        "fileName": file_name,
        "fileHash": hash,
        "modifiedAt": file_modified_at(&path),
        "title": if meta.title.is_empty() { path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string() } else { meta.title },
        "artist": if meta.artist.is_empty() { "Unknown".to_string() } else { meta.artist },
        "album": meta.album,
        "duration": meta.duration,
        "fileSize": file_size,
        "cover": meta.cover_path,
    }))
}

#[tauri::command]
pub async fn get_local_file_cover(
    file_path: String,
    file_hash: String,
) -> Result<Option<String>, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Ok(None);
    }

    if let Some(cover_path) = cached_cover_path(&file_hash) {
        return Ok(Some(cover_path));
    }

    let cover = read_cover_metadata(&path, &file_hash);
    if let Some(cover_path) = &cover {
        let mut cache = load_local_files_cache();
        if let Some(file) = cache.files.get_mut(&file_path) {
            file.cover = Some(cover_path.clone());
            save_local_files_cache(&cache);
        }
    }

    Ok(cover)
}
