use tauri_plugin_dialog::DialogExt;
use crate::services::api::ApiClient;

#[tauri::command]
pub async fn download_file(
    app: tauri::AppHandle,
    url_path: String,
    default_name: String,
) -> Result<String, String> {
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();

    let file_path = match file_path {
        Some(p) => p,
        None => return Ok("cancelled".to_string()),
    };

    let client = ApiClient::new();
    let bytes = client
        .public_get_bytes(&url_path)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    std::fs::write(file_path.as_path().unwrap(), &bytes)
        .map_err(|e| format!("Failed to save file: {}", e))?;

    Ok("ok".to_string())
}
