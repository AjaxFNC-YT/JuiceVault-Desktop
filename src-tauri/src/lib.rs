mod commands;
mod models;
mod services;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::discord::DiscordRpcState {
            client: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::login,
            commands::auth::register,
            commands::auth::refresh_auth,
            commands::player::get_track_info,
            commands::playlist::get_my_playlists,
            commands::stats::get_listening_stats,
            commands::stats::get_listening_activity,
            commands::stats::get_archive_stats,
            commands::songs::get_all_songs,
            commands::songs::search_songs,
            commands::songs::get_song_metadata,
            commands::songs::like_song,
            commands::songs::unlike_song,
            commands::songs::get_liked_songs,
            commands::songs::log_listen,
            commands::songs::get_tracker_info,
            commands::media::get_all_media,
            commands::media::get_media_metadata,
            commands::media::log_media_view,
            commands::playlists::get_playlist,
            commands::playlists::create_playlist,
            commands::playlists::update_playlist,
            commands::playlists::delete_playlist,
            commands::playlists::add_songs_to_playlist,
            commands::playlists::remove_song_from_playlist,
            commands::playlists::upload_playlist_cover,
            commands::playlists::remove_playlist_cover,
            commands::download::download_file,
            commands::radio::get_radio_now_playing,
            commands::radio::get_radio_schedule,
            commands::radio::get_radio_listeners,
            commands::radio::vote_skip_radio,
            commands::profile::get_current_user,
            commands::profile::update_user_preferences,
            commands::local_files::scan_local_directory,
            commands::local_files::hash_single_file,
            commands::local_files::show_in_explorer,
            commands::discord::init_discord_rpc,
            commands::discord::update_discord_presence,
            commands::discord::clear_discord_presence,
            commands::discord::disconnect_discord_rpc,
            commands::updater::get_app_version,
            commands::updater::check_for_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
