use tauri_plugin_dialog::DialogExt;

const BASE_URL: &str = "https://api.juicevault.xyz";

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

    let full_url = format!("{}{}", BASE_URL, url_path);

    let response = reqwest::get(&full_url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    std::fs::write(file_path.as_path().unwrap(), &bytes)
        .map_err(|e| format!("Failed to save file: {}", e))?;

    Ok("ok".to_string())
}
