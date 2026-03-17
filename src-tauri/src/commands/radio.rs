use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_radio_now_playing() -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get("/radio/now-playing").await
}

#[tauri::command]
pub async fn get_radio_schedule(count: Option<u32>) -> Result<Value, String> {
    let client = ApiClient::new();
    let c = count.unwrap_or(10).min(50);
    client.public_get(&format!("/radio/schedule?count={}", c)).await
}

#[tauri::command]
pub async fn get_radio_listeners() -> Result<Value, String> {
    let client = ApiClient::new();
    client.public_get("/radio/listeners").await
}

#[tauri::command]
pub async fn vote_skip_radio(access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_post("/radio/skip", &access_token, serde_json::json!({})).await
}
