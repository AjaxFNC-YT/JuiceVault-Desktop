use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_all_songs() -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get("/music/list").await
}

#[tauri::command]
pub async fn search_songs(query: String) -> Result<Value, String> {
    let client = ApiClient::new();
    let encoded: String = query.chars().map(|c| {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
            c.to_string()
        } else {
            format!("%{:02X}", c as u32)
        }
    }).collect();
    client.public_get(&format!("/music/search?q={}", encoded)).await
}

#[tauri::command]
pub async fn get_song_metadata(song_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get(&format!("/music/{}/metadata", song_id)).await
}

#[tauri::command]
pub async fn like_song(access_token: String, song_id: String, local_meta: Option<Value>) -> Result<Value, String> {
    let client = ApiClient::new();
    let body = local_meta.map(|m| serde_json::json!({ "localMeta": m })).unwrap_or(serde_json::json!({}));
    client.authed_post(&format!("/user/likes/{}", song_id), &access_token, body).await
}

#[tauri::command]
pub async fn unlike_song(access_token: String, song_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_delete(&format!("/user/likes/{}", song_id), &access_token).await
}

#[tauri::command]
pub async fn get_liked_songs(access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get("/user/likes?limit=200", &access_token).await
}

#[tauri::command]
pub async fn get_tracker_info(song_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get(&format!("/music/tracker/info/{}", song_id)).await
}

#[tauri::command]
pub async fn log_listen(access_token: String, song_id: String, duration: u32, completed: bool) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_post("/user/history", &access_token, serde_json::json!({
        "songId": song_id,
        "duration": duration,
        "completed": completed,
        "source": "app"
    })).await
}
