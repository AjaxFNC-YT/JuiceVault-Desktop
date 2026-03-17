use std::collections::HashMap;
use std::sync::Mutex;
use std::path::PathBuf;
use serde_json::Value;
use reqwest::multipart;

pub struct CoverUploadCache {
    pub urls: Mutex<HashMap<String, String>>,
}

impl CoverUploadCache {
    pub fn new() -> Self {
        Self { urls: Mutex::new(HashMap::new()) }
    }
}

fn cover_cache_dir() -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push("juicevault_covers");
    dir
}

#[tauri::command]
pub async fn upload_cover_temp(
    file_hash: String,
    state: tauri::State<'_, CoverUploadCache>,
) -> Result<Value, String> {
    {
        let cache = state.urls.lock().map_err(|e| e.to_string())?;
        if let Some(url) = cache.get(&file_hash) {
            return Ok(serde_json::json!({ "url": url }));
        }
    }

    let path = cover_cache_dir().join(format!("{}.webp", file_hash));
    if !path.exists() {
        return Err("Cover file not found in cache".into());
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("Read error: {}", e))?;

    let part = multipart::Part::bytes(bytes)
        .file_name(format!("{}.webp", file_hash))
        .mime_str("image/webp")
        .map_err(|e| e.to_string())?;

    let form = multipart::Form::new()
        .text("reqtype", "fileupload")
        .text("time", "72h")
        .part("fileToUpload", part);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://litterbox.catbox.moe/resources/internals/api.php")
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;

    let url = resp.text().await.map_err(|e| format!("Read response: {}", e))?;
    let url = url.trim().to_string();

    if !url.starts_with("https://") {
        return Err(format!("Upload failed: {}", url));
    }

    {
        let mut cache = state.urls.lock().map_err(|e| e.to_string())?;
        cache.insert(file_hash, url.clone());
    }

    Ok(serde_json::json!({ "url": url }))
}
