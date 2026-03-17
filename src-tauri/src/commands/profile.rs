use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_current_user(access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get("/user/auth/me", &access_token).await
}

#[tauri::command]
pub async fn update_user_preferences(access_token: String, preferences: Value) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_put("/user/profile", &access_token, serde_json::json!({ "preferences": preferences })).await
}
