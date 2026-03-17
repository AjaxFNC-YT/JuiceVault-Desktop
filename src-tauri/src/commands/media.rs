use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_all_media() -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get("/media/list").await
}

#[tauri::command]
pub async fn get_media_metadata(media_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get(&format!("/media/{}/metadata", media_id)).await
}

#[tauri::command]
pub async fn log_media_view(media_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_post(&format!("/media/{}/view", media_id)).await
}
