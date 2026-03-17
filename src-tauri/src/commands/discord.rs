use std::sync::Mutex;
use discord_rich_presence::{activity::{self, ActivityType, Button}, DiscordIpc, DiscordIpcClient};
use tauri::State;

const APP_ID: &str = "1482928492344508507";

pub struct DiscordRpcState {
    pub client: Mutex<Option<DiscordIpcClient>>,
}

#[tauri::command]
pub fn init_discord_rpc(state: State<'_, DiscordRpcState>) -> Result<(), String> {
    let mut guard = state.client.lock().map_err(|e| e.to_string())?;
    if guard.is_some() { return Ok(()); }
    let mut client = DiscordIpcClient::new(APP_ID).map_err(|e| e.to_string())?;
    client.connect().map_err(|e| format!("Discord not running or connection failed: {}", e))?;
    *guard = Some(client);
    Ok(())
}

#[tauri::command]
pub fn update_discord_presence(
    state: State<'_, DiscordRpcState>,
    details: String,
    status: String,
    large_image: Option<String>,
    large_text: Option<String>,
    small_image: Option<String>,
    small_text: Option<String>,
    start_timestamp: Option<i64>,
    activity_type: Option<i32>,
) -> Result<(), String> {
    let mut guard = state.client.lock().map_err(|e| e.to_string())?;
    let client = guard.as_mut().ok_or("Discord RPC not connected")?;

    let mut assets = activity::Assets::new();
    if let Some(ref img) = large_image {
        assets = assets.large_image(img.as_str());
    }
    if let Some(ref txt) = large_text {
        assets = assets.large_text(txt.as_str());
    }
    if let Some(ref img) = small_image {
        assets = assets.small_image(img.as_str());
    }
    if let Some(ref txt) = small_text {
        assets = assets.small_text(txt.as_str());
    }

    let act_type = match activity_type.unwrap_or(0) {
        2 => ActivityType::Listening,
        3 => ActivityType::Watching,
        _ => ActivityType::Playing,
    };

    let buttons = vec![
        Button::new("Website", "https://juicevault.xyz"),
        Button::new("Download", "https://juicevault.xyz/download"),
    ];

    let mut act = activity::Activity::new()
        .activity_type(act_type)
        .details(&details)
        .state(&status)
        .assets(assets)
        .buttons(buttons);

    if let Some(ts) = start_timestamp {
        act = act.timestamps(activity::Timestamps::new().start(ts));
    }

    client.set_activity(act).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_discord_presence(state: State<'_, DiscordRpcState>) -> Result<(), String> {
    let mut guard = state.client.lock().map_err(|e| e.to_string())?;
    let client = guard.as_mut().ok_or("Discord RPC not connected")?;
    client.clear_activity().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disconnect_discord_rpc(state: State<'_, DiscordRpcState>) -> Result<(), String> {
    let mut guard = state.client.lock().map_err(|e| e.to_string())?;
    if let Some(mut client) = guard.take() {
        let _ = client.close();
    }
    Ok(())
}
