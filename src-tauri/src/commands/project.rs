use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p: PathBuf| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Inspect metadata before reading, so a cloud placeholder cannot silently block import.
#[tauri::command]
pub fn inspect_audio_file(path: String) -> Result<u64, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("无法访问音频文件：{e}"))?;
    if !meta.is_file() {
        return Err("请选择音频文件，而不是文件夹。".into());
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::macos::fs::MetadataExt;
        if meta.st_flags() & 0x40000000 != 0 {
            return Err("此音频是云端占位文件，内容尚未下载到这台 Mac。请先下载到本机，再打开本地副本。".into());
        }
    }
    if meta.len() == 0 {
        return Err("此文件为空，无法作为音频打开。".into());
    }
    Ok(meta.len())
}
