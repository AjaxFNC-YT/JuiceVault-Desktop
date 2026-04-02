use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(mobile)]
use tauri::Manager;

mod commands;
mod error;
mod models;

#[cfg(mobile)]
mod mobile;

pub use error::Error;
pub use models::*;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nativeaudio")
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::play_track,
            commands::pause,
            commands::resume,
            commands::stop,
            commands::seek,
            commands::set_volume,
            commands::set_eq,
            commands::set_crossfade,
            commands::get_state,
            commands::dispose,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            {
                let handle = mobile::init(app, api)?;
                app.manage(handle);
            }
            #[cfg(not(mobile))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
