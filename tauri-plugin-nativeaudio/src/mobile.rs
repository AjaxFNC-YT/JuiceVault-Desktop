use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.nativeaudio";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_nativeaudio);

pub struct NativeAudio<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeAudio<R> {
    pub fn initialize(&self) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("initialize", ())
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn play_track(&self, payload: PlayTrackPayload) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("playTrack", payload)
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn pause(&self) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("pause", ())
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn resume(&self) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("resume", ())
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn stop(&self) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("stop", ())
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn seek(&self, payload: SeekPayload) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("seek", payload)
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn set_volume(&self, payload: VolumePayload) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("setVolume", payload)
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn set_eq(&self, payload: EqPayload) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("setEq", payload)
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn set_crossfade(&self, payload: CrossfadePayload) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("setCrossfade", payload)
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn get_state(&self) -> Result<AudioState, crate::Error> {
        self.0
            .run_mobile_plugin("getState", ())
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }

    pub fn dispose(&self) -> Result<(), crate::Error> {
        self.0
            .run_mobile_plugin::<()>("dispose", ())
            .map_err(|e| crate::Error::Plugin(e.to_string()))
    }
}

pub fn init<R: Runtime>(
    _app: &AppHandle<R>,
    api: PluginApi<R, ()>,
) -> Result<NativeAudio<R>, Box<dyn std::error::Error>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "NativeAudioPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_nativeaudio)?;
    Ok(NativeAudio(handle))
}

pub trait NativeAudioExt<R: Runtime> {
    fn nativeaudio(&self) -> &NativeAudio<R>;
}

impl<R: Runtime> NativeAudioExt<R> for AppHandle<R> {
    fn nativeaudio(&self) -> &NativeAudio<R> {
        self.state::<NativeAudio<R>>().inner()
    }
}
