use tauri_plugin_log::{Target, TargetKind};

mod desktop_menu;
mod display_policy;
mod identity;
mod lens_service;

pub fn run() {
    let app = tauri::Builder::default()
        .manage(lens_service::LensServiceState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .targets([Target::new(TargetKind::LogDir {
                    file_name: Some("chunksurfer".into()),
                })])
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.state::<lens_service::LensServiceState>().stop();
            }
        })
        .invoke_handler(tauri::generate_handler![
            display_policy::chunk_window_metrics,
            display_policy::chunk_set_window_size,
            display_policy::chunk_reset_window,
            display_policy::chunk_set_game_mode,
            display_policy::chunk_minimize,
            display_policy::chunk_restore,
            display_policy::chunk_window_is_focused,
            display_policy::chunk_quit,
            identity::chunk_ephemeral_display_names,
            lens_service::chunk_lens_bootstrap,
            lens_service::chunk_lens_retry,
            lens_service::chunk_lens_stop,
        ])
        .setup(|app| {
            desktop_menu::install(app)?;
            display_policy::enforce_window_floor(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Chunk Surfer");
    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            use tauri::Manager;
            app.state::<lens_service::LensServiceState>().stop();
        }
    });
}
