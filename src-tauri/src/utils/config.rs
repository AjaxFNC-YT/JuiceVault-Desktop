use std::path::PathBuf;

pub fn app_data_dir() -> Option<PathBuf> {
    std::env::var("APPDATA")
        .ok()
        .map(|p| PathBuf::from(p).join("juicevault"))
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .map(|p| PathBuf::from(p).join(".juicevault"))
        })
}

pub fn ensure_app_dirs() -> Result<(), std::io::Error> {
    if let Some(dir) = app_data_dir() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(())
}
