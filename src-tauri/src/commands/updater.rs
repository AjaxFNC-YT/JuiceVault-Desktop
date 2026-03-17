use serde_json::Value;
use crate::services::api::ApiClient;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") { "windows" }
    else if cfg!(target_os = "macos") { "mac" }
    else { "linux" }
}

#[tauri::command]
pub async fn get_app_version() -> String {
    APP_VERSION.to_string()
}

#[tauri::command]
pub async fn check_for_update() -> Result<Value, String> {
    let client = ApiClient::new();
    let platform = current_platform();
    let versions = client.public_get("/misc/desktop/versions?channel=stable").await?;

    let current = versions
        .get("data")
        .and_then(|d| d.get(platform))
        .and_then(|p| p.get("current"));

    let latest_version = current
        .and_then(|c| c.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or(APP_VERSION);

    let update_available = version_newer(latest_version, APP_VERSION);

    Ok(serde_json::json!({
        "updateAvailable": update_available,
        "currentVersion": APP_VERSION,
        "latestVersion": latest_version,
        "platform": platform,
        "release": current,
    }))
}

fn version_newer(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let l = parse(latest);
    let c = parse(current);
    for i in 0..l.len().max(c.len()) {
        let lv = l.get(i).copied().unwrap_or(0);
        let cv = c.get(i).copied().unwrap_or(0);
        if lv > cv { return true; }
        if lv < cv { return false; }
    }
    false
}
