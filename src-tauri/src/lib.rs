mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::transcribe::AsrState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::get_app_data_dir,
            commands::project::inspect_audio_file,
            commands::transcribe::transcribe_audio,
            commands::transcribe::cancel_transcription,
            commands::library::library_list,
            commands::library::library_open,
            commands::library::library_add,
            commands::library::library_save_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
