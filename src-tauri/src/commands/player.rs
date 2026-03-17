use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_track_info(track_id: String, access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get(&format!("/songs/{}", track_id), &access_token).await
}
