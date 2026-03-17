use serde_json::Value;
use crate::services::api::ApiClient;
use crate::models::user::AuthData;

#[tauri::command]
pub async fn login(login: String, password: String) -> Result<AuthData, String> {
    let client = ApiClient::new();
    client.login(&login, &password).await
}

#[tauri::command]
pub async fn register(
    username: String,
    display_name: String,
    email: String,
    password: String,
) -> Result<AuthData, String> {
    let client = ApiClient::new();
    client.register(&username, &display_name, &email, &password).await
}

#[tauri::command]
pub async fn refresh_auth(refresh_token: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.refresh_tokens(&refresh_token).await
}
