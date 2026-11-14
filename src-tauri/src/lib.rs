use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

mod desktop_menu;
mod chapel_desktop;
mod display_policy;
mod dock_tile;
mod identity;
mod steam_achievements;
mod lens_service;
mod startup_cleanup;
mod graphics_recovery;
mod graphics_recovery_policy;
mod source_desktop;
mod window_choreography;
#[cfg(target_os = "windows")]
mod graphics_backend;

pub fn run() {
    let graphics_recovery = graphics_recovery::GraphicsRecoveryState::prepare();
    #[cfg(target_os = "windows")]
    graphics_backend::configure_from_environment();
    let app = tauri::Builder::default()
        .manage(graphics_recovery)
        .manage(steam_achievements::SteamAchievementsState::default())
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
        .on_page_load(|webview, payload| {
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Started
            {
                webview.state::<graphics_recovery::GraphicsRecoveryState>().begin_document();
                chapel_desktop::cancel(webview.app_handle());
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                // Return the physical cursor even if the WebView is busy or its
                // blur/pagehide handler cannot run. Capture is focus-scoped.
                if matches!(event, tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Destroyed) {
                    let _ = window.set_cursor_grab(false);
                    let _ = window.set_cursor_visible(true);
                }
                window_choreography::note_main_window_event(window.app_handle(), event);
                chapel_desktop::note_main_event(window.app_handle(), event);
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<lens_service::LensServiceState>().stop();
            }
        })
        .invoke_handler(tauri::generate_handler![
            dock_tile::chunk_app_icon_status,
            dock_tile::chunk_set_app_icon,
            graphics_recovery::chunk_graphics_info,
            graphics_recovery::chunk_graphics_recover,
            graphics_recovery::chunk_graphics_ready,
            display_policy::chunk_window_metrics,
            display_policy::chunk_set_window_size,
            display_policy::chunk_reset_window,
            display_policy::chunk_set_game_mode,
            display_policy::chunk_minimize,
            display_policy::chunk_restore,
            display_policy::chunk_window_is_focused,
            display_policy::chunk_quit,
            identity::chunk_ephemeral_identity,
            steam_achievements::chunk_steam_initialize,
            steam_achievements::chunk_steam_unlock,
            steam_achievements::chunk_steam_set_stat,
            steam_achievements::chunk_steam_flush,
            window_choreography::chunk_fireball_cast_place,
            window_choreography::chunk_fireball_cast_hide_all,
            window_choreography::chunk_fireball_cast_step,
            window_choreography::chunk_fireball_cast_focus_main,
            window_choreography::chunk_window_choreography_begin,
            window_choreography::chunk_window_choreography_execute,
            window_choreography::chunk_window_choreography_restore,
            window_choreography::chunk_window_surface_place,
            window_choreography::chunk_window_media_place,
            window_choreography::chunk_window_media_position,
            window_choreography::chunk_window_media_hide_all,
            window_choreography::chunk_window_surfaces_sync_app_activation,
            source_desktop::chunk_source_desktop_begin,
            source_desktop::chunk_source_desktop_update,
            source_desktop::chunk_source_desktop_end,
            source_desktop::chunk_source_desktop_suspend,
            source_desktop::chunk_source_desktop_probe,
            chapel_desktop::chunk_chapel_desktop_prepare,
            chapel_desktop::chunk_chapel_desktop_begin,
            chapel_desktop::chunk_chapel_desktop_end,
            chapel_desktop::chunk_chapel_desktop_surface,
            lens_service::chunk_lens_bootstrap,
            lens_service::chunk_lens_retry,
            lens_service::chunk_lens_stop,
            lens_service::chunk_lens_nuke,
            lens_service::chunk_lens_scan,
        ])
        .setup(|app| {
            // setup runs on the main thread, which AppKit's Dock tile requires.
            dock_tile::install();
            startup_cleanup::recover_orphaned_helpers(app.handle());
            window_choreography::recover_stale_snapshot(app.handle());
            desktop_menu::install(app)?;
            display_policy::enforce_window_floor(app.handle());
            source_desktop::open_native_probe(app.handle());
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
            app.state::<steam_achievements::SteamAchievementsState>().stop();
            chapel_desktop::cancel(app);
            window_choreography::restore_on_exit(app);
        }
    });
}
