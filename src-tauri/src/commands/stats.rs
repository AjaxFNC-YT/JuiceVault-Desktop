use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_listening_stats(access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get("/user/history/stats", &access_token).await
}

#[tauri::command]
pub async fn get_listening_activity(access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get("/user/history/activity?days=90", &access_token).await
}

#[tauri::command]
pub async fn get_archive_stats() -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get("/stats").await
}
