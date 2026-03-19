#![allow(unused_variables)]

use tauri::{AppHandle, Runtime};

use crate::models::*;
use crate::Error;

#[cfg(mobile)]
use crate::mobile::NativeAudioExt;

fn desktop_idle() -> AudioState {
    AudioState {
        status: "idle".into(),
        current_time: 0.0,
        duration: 0.0,
        is_playing: false,
        volume: 1.0,
    }
}

#[tauri::command]
pub async fn initialize<R: Runtime>(app: AppHandle<R>) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().initialize();
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn play_track<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    title: Option<String>,
    artist: Option<String>,
    artwork_url: Option<String>,
) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app
        .nativeaudio()
        .play_track(PlayTrackPayload { url, title, artist, artwork_url });
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn pause<R: Runtime>(app: AppHandle<R>) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().pause();
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn resume<R: Runtime>(app: AppHandle<R>) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().resume();
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().stop();
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn seek<R: Runtime>(app: AppHandle<R>, time: f64) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().seek(SeekPayload { time });
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn set_volume<R: Runtime>(app: AppHandle<R>, volume: f64) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().set_volume(VolumePayload { volume });
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn set_eq<R: Runtime>(
    app: AppHandle<R>,
    bass: f64,
    mid: f64,
    treble: f64,
    reverb: f64,
    gain: f64,
) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app
        .nativeaudio()
        .set_eq(EqPayload { bass, mid, treble, reverb, gain });
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn set_crossfade<R: Runtime>(
    app: AppHandle<R>,
    seconds: f64,
) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app
        .nativeaudio()
        .set_crossfade(CrossfadePayload { seconds });
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<AudioState, Error> {
    #[cfg(mobile)]
    return app.nativeaudio().get_state();
    #[cfg(not(mobile))]
    Ok(desktop_idle())
}

#[tauri::command]
pub async fn dispose<R: Runtime>(app: AppHandle<R>) -> Result<(), Error> {
    #[cfg(mobile)]
    return app.nativeaudio().dispose();
    #[cfg(not(mobile))]
    Ok(())
}
