use tauri_plugin_log::{Target, TargetKind};

mod desktop_menu;
mod display_policy;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .targets([Target::new(TargetKind::LogDir { file_name: Some("chunksurfer".into()) })])
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            display_policy::chunk_window_metrics,
            display_policy::chunk_set_window_size,
            display_policy::chunk_reset_window,
            display_policy::chunk_set_game_mode,
            display_policy::chunk_minimize,
            display_policy::chunk_window_is_focused,
            display_policy::chunk_quit,
        ])
        .setup(|app| {
            desktop_menu::install(app)?;
            display_policy::enforce_window_floor(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Chunk Surfer");
}
