use serde_json::Value;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn get_playlist(access_token: String, playlist_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_get(&format!("/user/playlists/{}", playlist_id), &access_token).await
}

#[tauri::command]
pub async fn create_playlist(access_token: String, name: String, description: String, is_public: bool) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_post("/user/playlists", &access_token, serde_json::json!({
        "name": name,
        "description": description,
        "isPublic": is_public
    })).await
}

#[tauri::command]
pub async fn update_playlist(access_token: String, playlist_id: String, name: String, description: String, is_public: bool) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_put(&format!("/user/playlists/{}", playlist_id), &access_token, serde_json::json!({
        "name": name,
        "description": description,
        "isPublic": is_public
    })).await
}

#[tauri::command]
pub async fn delete_playlist(access_token: String, playlist_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_delete(&format!("/user/playlists/{}", playlist_id), &access_token).await
}

#[tauri::command]
pub async fn add_songs_to_playlist(access_token: String, playlist_id: String, song_ids: Vec<String>) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_post(&format!("/user/playlists/{}/songs", playlist_id), &access_token, serde_json::json!({
        "songIds": song_ids
    })).await
}

#[tauri::command]
pub async fn remove_song_from_playlist(access_token: String, playlist_id: String, song_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_delete(&format!("/user/playlists/{}/songs/{}", playlist_id, song_id), &access_token).await
}

#[tauri::command]
pub async fn upload_playlist_cover(access_token: String, playlist_id: String, file_data: Vec<u8>, file_name: String) -> Result<Value, String> {
    let client = ApiClient::new();
    let ca = crate::services::api::extract_ca_pub(&access_token).unwrap_or_default();
    let resp = client.send(|http| {
        let part = reqwest::multipart::Part::bytes(file_data.clone())
            .file_name(file_name.clone())
            .mime_str("image/png")
            .expect("static image/png MIME type must be valid");
        let form = reqwest::multipart::Form::new().part("cover", part);

        let mut req = http
            .post(format!("https://api.juicevault.xyz/user/playlists/{}/cover", playlist_id))
            .header("Authorization", format!("Bearer {}", access_token))
            .multipart(form);

        if !ca.is_empty() {
            req = req.header("X-CA", &ca);
        }

        req
    }).await?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(text); }
    let val: Value = serde_json::from_str(&text).map_err(|_| text.clone())?;
    Ok(val)
}

#[tauri::command]
pub async fn remove_playlist_cover(access_token: String, playlist_id: String) -> Result<Value, String> {
    let client = ApiClient::new();
    client.authed_delete(&format!("/user/playlists/{}/cover", playlist_id), &access_token).await
}
