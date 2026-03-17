use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Emitter};
use rayon::prelude::*;
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus", "aiff"];
const HASH_CHUNK: usize = 16384;
const BATCH_SIZE: usize = 50;
const COVER_SIZE: u32 = 200;

#[derive(Clone, Serialize, Deserialize)]
pub struct LocalFileInfo {
    pub path: String,
    pub file_name: String,
    pub file_hash: String,
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
    let mut dir = std::env::temp_dir();
    dir.push("juicevault_covers");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn save_cover(data: &[u8], file_hash: &str) -> Option<String> {
    let out = cover_cache_dir().join(format!("{}.webp", file_hash));
    if out.exists() {
        return Some(out.to_string_lossy().to_string());
    }
    let img = image::load_from_memory(data).ok()?;
    let thumb = img.resize(COVER_SIZE, COVER_SIZE, image::imageops::FilterType::Triangle);
    let mut buf = Cursor::new(Vec::new());
    thumb.write_to(&mut buf, image::ImageFormat::WebP).ok()?;
    fs::write(&out, buf.into_inner()).ok()?;
    Some(out.to_string_lossy().to_string())
}

struct AudioMeta {
    title: String,
    artist: String,
    album: String,
    duration: f64,
    cover_path: Option<String>,
}

fn read_metadata(path: &Path, file_hash: &str) -> AudioMeta {
    use lofty::prelude::*;
    use lofty::probe::Probe;

    let tagged = Probe::open(path).ok().and_then(|p| p.read().ok());

    let Some(tagged_file) = tagged else {
        return AudioMeta { title: String::new(), artist: String::new(), album: String::new(), duration: 0.0, cover_path: None };
    };

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
    let duration = tagged_file.properties().duration().as_secs_f64();

    let (title, artist, album) = tag.map(|t| {
        (
            t.title().map(|s| s.to_string()).unwrap_or_default(),
            t.artist().map(|s| s.to_string()).unwrap_or_default(),
            t.album().map(|s| s.to_string()).unwrap_or_default(),
        )
    }).unwrap_or_default();

    let cover_path = tag.and_then(|t| {
        let pics = t.pictures();
        let pic = pics.iter().find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront).or_else(|| pics.first())?;
        save_cover(pic.data(), file_hash)
    });

    AudioMeta { title, artist, album, duration, cover_path }
}

fn process_file(path: &Path) -> Option<LocalFileInfo> {
    let file_name = path.file_name()?.to_str()?.to_string();
    let file_size = fs::metadata(path).ok()?.len();
    let file_hash = fast_hash(path, file_size).ok()?;
    let meta = read_metadata(path, &file_hash);
    let title = if meta.title.is_empty() {
        path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string()
    } else {
        meta.title
    };
    Some(LocalFileInfo {
        path: path.to_string_lossy().to_string(),
        file_name,
        file_hash,
        title,
        artist: if meta.artist.is_empty() { "Unknown".into() } else { meta.artist },
        album: meta.album,
        duration: meta.duration,
        file_size,
        cover: meta.cover_path,
    })
}

#[tauri::command]
pub async fn scan_local_directory(app: AppHandle, directory: String, known_hashes: Option<Vec<String>>) -> Result<Value, String> {
    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Directory does not exist".into());
    }

    let skip: HashSet<String> = known_hashes.unwrap_or_default().into_iter().collect();

    let mut candidates: Vec<(PathBuf, u64)> = Vec::new();
    for entry in WalkDir::new(&dir_path).follow_links(true).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() { continue; }
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        if !AUDIO_EXTENSIONS.contains(&ext.as_str()) { continue; }
        let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if !skip.is_empty() {
            if let Ok(h) = fast_hash(path, size) {
                if skip.contains(&h) { continue; }
            }
        }
        candidates.push((path.to_path_buf(), size));
    }

    let total_files = candidates.len();
    let _ = app.emit("local-files-batch", json!({ "files": [], "total": 0, "scanning": total_files }));

    let counter = AtomicU32::new(0);
    let batch_buf: Arc<Mutex<Vec<LocalFileInfo>>> = Arc::new(Mutex::new(Vec::with_capacity(BATCH_SIZE)));
    let app_ref = &app;
    let counter_ref = &counter;
    let batch_ref = &batch_buf;

    candidates.par_iter().for_each(|(path, _)| {
        if let Some(info) = process_file(path) {
            let cnt = counter_ref.fetch_add(1, Ordering::Relaxed) + 1;
            let mut buf = batch_ref.lock().unwrap();
            buf.push(info);
            if buf.len() >= BATCH_SIZE {
                let _ = app_ref.emit("local-files-batch", json!({ "files": &*buf, "total": cnt }));
                buf.clear();
            }
        }
    });

    let count = counter.load(Ordering::Relaxed);
    let mut remaining = batch_buf.lock().unwrap();
    if !remaining.is_empty() {
        let _ = app.emit("local-files-batch", json!({ "files": &*remaining, "total": count }));
        remaining.clear();
    }

    let _ = app.emit("local-scan-complete", json!({ "directory": directory, "count": count }));
    Ok(json!({ "directory": directory, "count": count }))
}

#[tauri::command]
pub async fn show_in_explorer(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() { return Err("File does not exist".into()); }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg("/select,").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg("-R").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { if let Some(dir) = path.parent() { std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?; } }
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
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(json!({
        "path": file_path,
        "fileName": file_name,
        "fileHash": hash,
        "title": if meta.title.is_empty() { path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string() } else { meta.title },
        "artist": if meta.artist.is_empty() { "Unknown".to_string() } else { meta.artist },
        "album": meta.album,
        "duration": meta.duration,
        "fileSize": file_size,
        "cover": meta.cover_path,
    }))
}
