use std::collections::HashMap;
use std::sync::Mutex;
use serde_json::Value;
use crate::services::api::ApiClient;

const CONCURRENCY: usize = 30;

pub struct EraCache {
    pub data: Mutex<HashMap<String, String>>,
}

impl EraCache {
    pub fn new() -> Self {
        Self { data: Mutex::new(HashMap::new()) }
    }
}

async fn fetch_tracker_era(client: &ApiClient, song_id: &str) -> Option<(String, String)> {
    let val = client
        .public_get(&format!("/music/tracker/info/{}", song_id))
        .await
        .ok()?;

    if let Some(obj) = val.as_object() {
        for (key, v) in obj {
            let norm = key.replace(['-', '_', ' '], "").to_lowercase();
            if norm == "era" {
                if let Some(s) = v.as_str() {
                    if !s.is_empty() {
                        return Some((song_id.to_string(), s.to_string()));
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn fetch_song_eras(
    song_ids: Vec<String>,
    state: tauri::State<'_, EraCache>,
) -> Result<Value, String> {
    let mut result: HashMap<String, String> = HashMap::new();
    let mut missing: Vec<String> = Vec::new();

    {
        let cache = state.data.lock().map_err(|e| e.to_string())?;
        for id in &song_ids {
            if let Some(era) = cache.get(id) {
                result.insert(id.clone(), era.clone());
            } else {
                missing.push(id.clone());
            }
        }
    }

    if missing.is_empty() {
        return Ok(serde_json::json!(result));
    }

    let client = ApiClient::new();
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(CONCURRENCY));
    let client = std::sync::Arc::new(client);

    let mut handles = Vec::with_capacity(missing.len());
    for id in missing {
        let sem = sem.clone();
        let client = client.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.ok()?;
            fetch_tracker_era(&client, &id).await
        }));
    }

    let mut new_eras: HashMap<String, String> = HashMap::new();
    for handle in handles {
        if let Some((id, era)) = handle.await.unwrap_or(None) {
            new_eras.insert(id, era);
        }
    }

    {
        let mut cache = state.data.lock().map_err(|e| e.to_string())?;
        for (id, era) in &new_eras {
            cache.insert(id.clone(), era.clone());
        }
    }

    result.extend(new_eras);
    Ok(serde_json::json!(result))
}
