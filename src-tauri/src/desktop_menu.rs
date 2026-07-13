use crate::display_policy;
use tauri::{menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder}, App, AppHandle, Emitter, Manager};

const DESKTOP_MENU_EVENT: &str = "chunk-surfer://desktop-menu";

fn emit_frontend(app: &AppHandle, id: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(DESKTOP_MENU_EVENT, id.to_string());
    }
}

fn toggle_fullscreen(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let next = !window.is_fullscreen().unwrap_or(false);
        let _ = window.set_fullscreen(next);
        emit_frontend(app, "fullscreen");
    }
}

fn minimize(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
        emit_frontend(app, "minimize");
    }
}

fn reset_window(app: &AppHandle) {
    let _ = display_policy::reset_main_window(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    emit_frontend(app, "reset_window");
}

pub fn install(app: &mut App) -> tauri::Result<()> {
    let about = MenuItemBuilder::with_id("about", "About Chunk Surfer").build(app)?;
    let preferences = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let diagnostics = MenuItemBuilder::with_id("diagnostics", "Diagnostics…").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Chunk Surfer")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Chunk Surfer")
        .item(&about)
        .item(&preferences)
        .item(&diagnostics)
        .separator()
        .hide_with_text("Hide Chunk Surfer")
        .hide_others_with_text("Hide Others")
        .show_all_with_text("Show All")
        .separator()
        .item(&quit)
        .build()?;

    let new_game = MenuItemBuilder::with_id("new_game", "New Game…")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let continue_game = MenuItemBuilder::with_id("continue", "Continue").build(app)?;
    let restart_run = MenuItemBuilder::with_id("restart_run", "Restart Run…").build(app)?;
    let pause = MenuItemBuilder::with_id("pause", "Pause / Resume")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let difficulty = MenuItemBuilder::with_id("difficulty", "Difficulty…").build(app)?;
    let achievements = MenuItemBuilder::with_id("achievements", "Achievements").build(app)?;
    let return_to_title = MenuItemBuilder::with_id("return_to_title", "Return to Title").build(app)?;

    let game_menu = SubmenuBuilder::new(app, "Game")
        .item(&new_game)
        .item(&continue_game)
        .item(&restart_run)
        .item(&pause)
        .separator()
        .item(&difficulty)
        .item(&achievements)
        .item(&return_to_title)
        .build()?;

    let game_mode = MenuItemBuilder::with_id("game_mode", "Enter Game Mode")
        .accelerator("F11")
        .build(app)?;
    let fullscreen = MenuItemBuilder::with_id("fullscreen", "Toggle Fullscreen")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let minimize_item = MenuItemBuilder::with_id("minimize", "Minimize")
        .accelerator("CmdOrCtrl+M")
        .build(app)?;
    let reset_window_item = MenuItemBuilder::with_id("reset_window", "Reset Window").build(app)?;
    let reduce_motion = MenuItemBuilder::with_id("reduce_motion", "Reduce Motion").build(app)?;
    let reduce_flash = MenuItemBuilder::with_id("reduce_flash", "Reduce Flash").build(app)?;
    let high_contrast = MenuItemBuilder::with_id("high_contrast", "High Contrast / VFD Boost").build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&game_mode)
        .item(&fullscreen)
        .item(&minimize_item)
        .item(&reset_window_item)
        .separator()
        .item(&reduce_motion)
        .item(&reduce_flash)
        .item(&high_contrast)
        .build()?;

    let mute = MenuItemBuilder::with_id("mute", "Mute")
        .accelerator("CmdOrCtrl+Shift+M")
        .build(app)?;
    let restart_audio = MenuItemBuilder::with_id("restart_audio", "Restart Audio Engine").build(app)?;
    let audio_diagnostics = MenuItemBuilder::with_id("audio_diagnostics", "Audio Diagnostics").build(app)?;

    let audio_menu = SubmenuBuilder::new(app, "Audio")
        .item(&mute)
        .item(&restart_audio)
        .item(&audio_diagnostics)
        .build()?;

    let controls = MenuItemBuilder::with_id("controls", "Controls").build(app)?;
    let open_save_folder = MenuItemBuilder::with_id("open_save_folder", "Open Save Folder").build(app)?;
    let open_release_page = MenuItemBuilder::with_id("open_release_page", "Open Release Page").build(app)?;
    let report_issue = MenuItemBuilder::with_id("report_issue", "Report Issue").build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&controls)
        .item(&open_save_folder)
        .item(&open_release_page)
        .item(&report_issue)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&game_menu)
        .item(&view_menu)
        .item(&audio_menu)
        .item(&help_menu)
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        match id {
            "quit" => app.exit(0),
            "minimize" => minimize(app),
            // Route fullscreen through the same frontend game-mode path so the
            // DOM stage, focus profile, and native fullscreen state stay in sync.
            "fullscreen" | "game_mode" => emit_frontend(app, "game_mode"),
            "reset_window" => reset_window(app),
            "about"
            | "preferences"
            | "diagnostics"
            | "new_game"
            | "continue"
            | "restart_run"
            | "pause"
            | "difficulty"
            | "achievements"
            | "return_to_title"
            | "reduce_motion"
            | "reduce_flash"
            | "high_contrast"
            | "mute"
            | "restart_audio"
            | "audio_diagnostics"
            | "controls"
            | "open_save_folder"
            | "open_release_page"
            | "report_issue" => emit_frontend(app, id),
            _ => {}
        }
    });

    Ok(())
}
