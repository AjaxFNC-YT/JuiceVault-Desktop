use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_my_playlists(access_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get("/user/playlists", &access_token).await
}
