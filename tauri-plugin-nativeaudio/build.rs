const COMMANDS: &[&str] = &[
    "initialize",
    "play_track",
    "pause",
    "resume",
    "stop",
    "seek",
    "set_volume",
    "set_eq",
    "set_crossfade",
    "get_state",
    "dispose",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
