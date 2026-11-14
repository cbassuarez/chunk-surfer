//! Temporary fight presentation. The fight, its clock and its outcomes belong to main.
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow, WindowEvent};

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum FightTheme {
    #[default]
    Chapel,
    Tower,
    SourceIi,
    SourceIii,
    SourceFinal,
}

impl FightTheme {
    fn is_source(self) -> bool {
        matches!(self, Self::SourceIi | Self::SourceIii | Self::SourceFinal)
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapelDesktopRequest {
    token: String,
    attack_id: String,
    #[serde(default)]
    theme: FightTheme,
    #[serde(default)]
    response_seconds: Option<f64>,
    #[serde(default)]
    reduced_motion: bool,
    #[serde(default)]
    reduce_flash: bool,
}

#[tauri::command]
pub async fn chunk_chapel_desktop_prepare(
    window: WebviewWindow,
    theme: Option<FightTheme>,
) -> bool {
    if window.label() != "main" {
        return false;
    }
    platform::prepare(window, theme.unwrap_or_default()).await
}

#[tauri::command]
pub async fn chunk_chapel_desktop_begin(
    window: WebviewWindow,
    mut request: ChapelDesktopRequest,
) -> bool {
    if window.label() != "main"
        || !crate::window_choreography::valid_token(&request.token)
        || !crate::window_choreography::valid_token(&request.attack_id)
    {
        return false;
    }
    request.response_seconds = request
        .response_seconds
        .filter(|seconds| seconds.is_finite())
        .map(|seconds| seconds.clamp(0.8, 4.0));
    platform::begin(window, request).await
}

#[tauri::command]
pub async fn chunk_chapel_desktop_end(
    window: WebviewWindow,
    token: String,
    outcome: String,
) -> bool {
    if window.label() != "main" || !matches!(outcome.as_str(), "hit" | "miss" | "cancel") {
        return false;
    }
    platform::end(window, token, outcome).await
}

#[tauri::command]
pub fn chunk_chapel_desktop_surface(
    window: WebviewWindow,
    action: String,
    token: Option<String>,
) -> bool {
    platform::surface(window, &action, token.as_deref())
}

pub(crate) fn note_main_event(app: &AppHandle, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        platform::shutdown(app);
        return;
    }
    if matches!(event, WindowEvent::Focused(false)) {
        platform::check_focus_after_transfer(app);
    } else if matches!(
        event,
        WindowEvent::Moved(_) | WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
    ) {
        platform::cancel(app);
    }
}

pub(crate) fn cancel(app: &AppHandle) {
    platform::cancel(app);
}

pub(crate) fn source_handoff_active() -> bool {
    platform::source_handoff_active(None)
}

pub(crate) fn source_handoff_target_focused(app: &AppHandle) -> bool {
    platform::source_handoff_target_focused(app)
}

#[cfg(target_os = "macos")]
pub(crate) fn reaction_target_at_center(window: &WebviewWindow) -> Option<bool> {
    platform::target_at_center(window)
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::*;
    pub async fn prepare(_: WebviewWindow, _: FightTheme) -> bool {
        false
    }
    pub async fn begin(_: WebviewWindow, request: ChapelDesktopRequest) -> bool {
        let _ = (
            request.theme.is_source(),
            request.reduced_motion,
            request.reduce_flash,
        );
        false
    }
    pub async fn end(_: WebviewWindow, _: String, _: String) -> bool {
        false
    }
    pub fn surface(_: WebviewWindow, _: &str, _: Option<&str>) -> bool {
        false
    }
    pub fn cancel(_: &AppHandle) {}
    pub fn check_focus_after_transfer(_: &AppHandle) {}
    pub fn source_handoff_active(_: Option<&str>) -> bool {
        false
    }
    pub fn source_handoff_target_focused(_: &AppHandle) -> bool {
        false
    }
    pub fn shutdown(_: &AppHandle) {}
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use block2::{Block, RcBlock};
    use serde_json::json;
    use std::{
        cell::Cell,
        ffi::{c_char, c_void},
        sync::{
            atomic::{AtomicU8, Ordering},
            mpsc, Mutex,
        },
        thread,
        time::{Duration, Instant},
    };
    use tauri::{
        Emitter, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, WebviewUrl,
        WebviewWindowBuilder,
    };

    const BACKDROP: &str = "chapel-desktop-backdrop";
    const TARGET: &str = "chapel-desktop-target";
    const BOTH: u8 = 3;
    const COLD_BUDGET: Duration = Duration::from_millis(1800);
    const OUTCOME_TAIL: Duration = Duration::from_millis(550);
    const ABANDONED_LIMIT: Duration = Duration::from_secs(5);
    static READY: AtomicU8 = AtomicU8::new(0);
    static CREATING: Mutex<()> = Mutex::new(());
    static LEASE: Mutex<Option<Lease>> = Mutex::new(None);
    thread_local! {
        // Registered and removed on the AppKit main thread, only for an armed
        // attack. It is an app-local monitor, scoped again to our receiver.
        static TARGET_MOUSE_MONITOR: Cell<*mut c_void> = const { Cell::new(std::ptr::null_mut()) };
    }

    #[repr(C)]
    #[derive(Clone, Copy, Serialize)]
    struct Point {
        x: f64,
        y: f64,
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
    #[serde(rename_all = "kebab-case")]
    enum Edge {
        Left,
        Right,
        Top,
        Bottom,
    }

    impl FightTheme {
        fn target_size(self) -> (f64, f64) {
            match self {
                Self::Chapel => (76.0, 96.0),
                Self::Tower => (92.0, 96.0),
                Self::SourceIi => (104.0, 82.0),
                Self::SourceIii => (104.0, 92.0),
                Self::SourceFinal => (112.0, 100.0),
            }
        }

        fn edges(self) -> [Edge; 4] {
            use Edge::*;
            match self {
                Self::Chapel => [Right, Left, Bottom, Top],
                Self::Tower => [Top, Right, Left, Bottom],
                Self::SourceIi => [Right, Bottom, Left, Top],
                Self::SourceIii => [Left, Bottom, Right, Top],
                Self::SourceFinal => [Top, Left, Right, Bottom],
            }
        }

        fn entry_fraction(self, edge: Edge) -> f64 {
            use Edge::*;
            match (self, edge) {
                (Self::Chapel, Left | Right) => 0.42,
                (Self::Chapel, Top | Bottom) => 0.66,
                (Self::Tower, _) | (Self::SourceFinal, _) => 0.5,
                (Self::SourceIi, _) => 0.70,
                (Self::SourceIii, _) => 0.35,
            }
        }
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Phase {
        Opening,
        Armed,
        Hit,
        Releasing,
        Closing,
    }

    struct Lease {
        request: ChapelDesktopRequest,
        painted: u8,
        phase: Phase,
    }

    struct Placement {
        work: PhysicalRect<i32, u32>,
        main: PhysicalRect<i32, u32>,
        backdrop: PhysicalRect<i32, u32>,
        target: PhysicalPosition<i32>,
        target_size: PhysicalSize<u32>,
        scale: f64,
        direction: Edge,
        source_owner: Option<String>,
        entry: Point,
        receiver: Point,
    }

    impl Placement {
        fn for_window(window: &WebviewWindow, theme: FightTheme) -> Option<Self> {
            let source_owner = crate::source_desktop::fight_reaction_owner().ok()?;
            if source_owner.is_some() && !theme.is_source() {
                return None;
            }
            let (main, work, scale) = Self::window_geometry(window)?;
            Self::fit(main, work, scale, theme, source_owner)
        }

        fn window_geometry(
            window: &WebviewWindow,
        ) -> Option<(PhysicalRect<i32, u32>, PhysicalRect<i32, u32>, f64)> {
            if !window.is_visible().ok()?
                || window.is_minimized().ok()?
                || window.is_fullscreen().ok()?
                || crate::display_policy::simple_fullscreen_active()
            {
                return None;
            }
            let monitor = window.current_monitor().ok()??;
            let main = PhysicalRect {
                position: window.outer_position().ok()?,
                size: window.outer_size().ok()?,
            };
            Some((main, *monitor.work_area(), monitor.scale_factor()))
        }

        fn fit(
            main: PhysicalRect<i32, u32>,
            work: PhysicalRect<i32, u32>,
            scale: f64,
            theme: FightTheme,
            source_owner: Option<String>,
        ) -> Option<Self> {
            if !scale.is_finite() || scale <= 0.0 {
                return None;
            }
            let (logical_w, logical_h) = theme.target_size();
            let pixels = |points: f64| (points * scale).round() as i32;
            let width = pixels(logical_w);
            let height = pixels(logical_h);
            let inset = pixels(14.0);
            let left = work.position.x;
            let top = work.position.y;
            let right = left + work.size.width as i32;
            let bottom = top + work.size.height as i32;
            let main_left = main.position.x.clamp(left, right);
            let main_top = main.position.y.clamp(top, bottom);
            let main_right = (main.position.x + main.size.width as i32).clamp(left, right);
            let main_bottom = (main.position.y + main.size.height as i32).clamp(top, bottom);
            if main_left == main_right || main_top == main_bottom {
                return None;
            }

            for direction in theme.edges() {
                // For the established Source desktop, use only the edge this
                // attack crosses. The underlying Source lease keeps the rest.
                let (band_left, band_top, band_right, band_bottom) = match direction {
                    Edge::Left => (left, top, main_left, bottom),
                    Edge::Right => (main_right, top, right, bottom),
                    Edge::Top => (left, top, right, main_top),
                    Edge::Bottom => (left, main_bottom, right, bottom),
                };
                let band_width = band_right - band_left;
                let band_height = band_bottom - band_top;
                if band_width < width + 2 * inset || band_height < height + 2 * inset {
                    continue;
                }
                let fraction = theme.entry_fraction(direction);
                let (target_x, target_y) = match direction {
                    Edge::Left | Edge::Right => (
                        band_left + (band_width - width) / 2,
                        main_top + ((main_bottom - main_top) as f64 * fraction).round() as i32
                            - height / 2,
                    ),
                    Edge::Top | Edge::Bottom => (
                        main_left + ((main_right - main_left) as f64 * fraction).round() as i32
                            - width / 2,
                        band_top + (band_height - height) / 2,
                    ),
                };
                let target = PhysicalPosition::new(
                    target_x.clamp(band_left + inset, band_right - width - inset),
                    target_y.clamp(band_top + inset, band_bottom - height - inset),
                );
                let backdrop = if source_owner.is_some() {
                    PhysicalRect {
                        position: PhysicalPosition::new(band_left, band_top),
                        size: PhysicalSize::new(band_width as u32, band_height as u32),
                    }
                } else {
                    work
                };
                let cx = target.x + width / 2;
                let cy = target.y + height / 2;
                let (ex, ey) = match direction {
                    Edge::Left => (main_left, cy.clamp(main_top, main_bottom)),
                    Edge::Right => (main_right, cy.clamp(main_top, main_bottom)),
                    Edge::Top => (cx.clamp(main_left, main_right), main_top),
                    Edge::Bottom => (cx.clamp(main_left, main_right), main_bottom),
                };
                let local = |x: i32, y: i32| Point {
                    x: (x - backdrop.position.x) as f64 / scale,
                    y: (y - backdrop.position.y) as f64 / scale,
                };
                return Some(Self {
                    work,
                    main,
                    backdrop,
                    target,
                    scale,
                    direction,
                    source_owner,
                    target_size: PhysicalSize::new(width as u32, height as u32),
                    entry: local(ex, ey),
                    receiver: local(cx, cy),
                });
            }
            None
        }

        fn still_current(&self, main: &WebviewWindow, theme: FightTheme) -> bool {
            Self::for_window(main, theme).is_some_and(|now| {
                now.work.position == self.work.position
                    && now.work.size == self.work.size
                    && now.main.position == self.main.position
                    && now.main.size == self.main.size
                    && now.target == self.target
                    && now.target_size == self.target_size
                    && now.scale == self.scale
                    && now.source_owner == self.source_owner
            })
        }
    }

    fn role(label: &str) -> u8 {
        match label {
            BACKDROP => 1,
            TARGET => 2,
            _ => 0,
        }
    }

    fn phase(token: &str) -> Option<Phase> {
        LEASE
            .lock()
            .ok()?
            .as_ref()
            .filter(|lease| lease.request.token == token)
            .map(|lease| lease.phase)
    }

    fn change_phase(token: &str, from: Phase, to: Phase) -> Option<ChapelDesktopRequest> {
        let mut slot = LEASE.lock().ok()?;
        let lease = slot
            .as_mut()
            .filter(|lease| lease.request.token == token && lease.phase == from)?;
        lease.phase = to;
        Some(lease.request.clone())
    }

    fn ensure_surfaces(app: &AppHandle) -> Result<(), String> {
        let _creation = CREATING.lock().map_err(|error| error.to_string())?;
        for label in [BACKDROP, TARGET] {
            if app.get_webview_window(label).is_some() {
                continue;
            }
            READY.fetch_and(!role(label), Ordering::SeqCst);
            WebviewWindowBuilder::new(
                app,
                label,
                WebviewUrl::App("chapel-desktop-surface.html".into()),
            )
            .title("Chunk Surfer · Desktop Fight")
            .transparent(true)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .focused(false)
            .focusable(label == TARGET)
            .accept_first_mouse(label == TARGET)
            .skip_taskbar(true)
            .inner_size(76.0, 96.0)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .build()
            .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub async fn prepare(main: WebviewWindow, theme: FightTheme) -> bool {
        tauri::async_runtime::spawn_blocking(move || {
            main.is_focused().unwrap_or(false)
                && (theme.is_source() || Placement::for_window(&main, theme).is_some())
                && ensure_surfaces(main.app_handle()).is_ok()
        })
        .await
        .unwrap_or(false)
    }

    fn wait_for(token: &str, timeout: Duration, ready: impl Fn() -> bool) -> bool {
        let deadline = Instant::now() + timeout;
        while phase(token) == Some(Phase::Opening) && Instant::now() < deadline {
            if ready() {
                return true;
            }
            thread::sleep(Duration::from_millis(10));
        }
        false
    }

    fn surface_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
        app.get_webview_window(label)
            .ok_or_else(|| format!("missing {label}"))
    }

    fn open(main: &WebviewWindow, request: &ChapelDesktopRequest) -> Result<Placement, String> {
        let app = main.app_handle();
        if !main.is_focused().unwrap_or(false) {
            return Err("game does not own input".into());
        }
        let placement = Placement::for_window(main, request.theme)
            .ok_or("no exposed desktop beside the game")?;
        ensure_surfaces(app)?;
        if !wait_for(&request.token, COLD_BUDGET, || {
            READY.load(Ordering::SeqCst) == BOTH
        }) {
            return Err("desktop fight webviews did not load".into());
        }
        if !placement.still_current(main, request.theme)
            || phase(&request.token) != Some(Phase::Opening)
        {
            return Err("fight no longer owns the desktop offer".into());
        }
        let backdrop = surface_window(app, BACKDROP)?;
        let target = surface_window(app, TARGET)?;
        backdrop
            .set_ignore_cursor_events(true)
            .map_err(|error| error.to_string())?;
        target
            .set_ignore_cursor_events(true)
            .map_err(|error| error.to_string())?;
        backdrop
            .set_size(placement.backdrop.size.to_logical::<f64>(placement.scale))
            .map_err(|error| error.to_string())?;
        backdrop
            .set_position(
                placement
                    .backdrop
                    .position
                    .to_logical::<f64>(placement.scale),
            )
            .map_err(|error| error.to_string())?;
        target
            .set_size(placement.target_size.to_logical::<f64>(placement.scale))
            .map_err(|error| error.to_string())?;
        target
            .set_position(placement.target.to_logical::<f64>(placement.scale))
            .map_err(|error| error.to_string())?;
        let token = request.token.clone();
        reveal(
            app,
            token,
            backdrop,
            target,
            placement.source_owner.is_some(),
        )?;
        let state = json!({ "token":request.token, "attackId":request.attack_id,
            "entry":placement.entry, "receiver":placement.receiver,
            "theme":request.theme, "direction":placement.direction, "responseSeconds":request.response_seconds,
            "viewport":{"width":placement.backdrop.size.width as f64 / placement.scale,
                "height":placement.backdrop.size.height as f64 / placement.scale},
            "reducedMotion":request.reduced_motion, "reduceFlash":request.reduce_flash });
        for label in [BACKDROP, TARGET] {
            app.emit_to(label, "chapel-desktop:frame", &state)
                .map_err(|error| error.to_string())?;
        }
        if !wait_for(&request.token, Duration::from_millis(650), || {
            LEASE
                .lock()
                .ok()
                .and_then(|slot| slot.as_ref().map(|lease| lease.painted == BOTH))
                .unwrap_or(false)
        }) || !placement.still_current(main, request.theme)
        {
            return Err("desktop fight target was not presented".into());
        }
        let target = surface_window(app, TARGET)?;
        if target.outer_position().ok().is_none_or(|actual| {
            (actual.x - placement.target.x).abs() > 4 || (actual.y - placement.target.y).abs() > 4
        }) || target.inner_size().ok().is_none_or(|actual| {
            actual.width.abs_diff(placement.target_size.width) > 4
                || actual.height.abs_diff(placement.target_size.height) > 4
        }) || !target.is_visible().unwrap_or(false)
        {
            return Err("desktop fight target frame was rejected".into());
        }
        let token = request.token.clone();
        let main = main.clone();
        run_appkit(app, move || {
            if !main.is_focused().unwrap_or(false) {
                return false;
            }
            let Ok(window) = target.ns_window() else {
                return false;
            };
            if change_phase(&token, Phase::Opening, Phase::Armed).is_none() {
                return false;
            }
            unsafe {
                install_mouse_monitor(&target, window, token);
                set_window_bool(window, b"setIgnoresMouseEvents:\0", false);
            }
            true
        })?;
        Ok(placement)
    }

    pub async fn begin(main: WebviewWindow, request: ChapelDesktopRequest) -> bool {
        tauri::async_runtime::spawn_blocking(move || {
            let app = main.app_handle();
            let Ok(mut slot) = LEASE.lock() else {
                return false;
            };
            if slot.is_some() {
                return false;
            }
            *slot = Some(Lease {
                request: request.clone(),
                painted: 0,
                phase: Phase::Opening,
            });
            drop(slot);
            let placement = match open(&main, &request) {
                Ok(placement) => placement,
                Err(error) => {
                    tauri_plugin_log::log::info!(
                        "desktop fight unavailable for {:?}: {error}",
                        request.theme
                    );
                    close(app, Some(&request.token), false);
                    return false;
                }
            };
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let start = Instant::now();
                while matches!(phase(&request.token), Some(Phase::Armed | Phase::Hit)) {
                    if start.elapsed() >= ABANDONED_LIMIT
                        || !placement.still_current(&main, request.theme)
                        || !owns_fight_input(&app)
                    {
                        if placement.source_owner.is_some() && !owns_fight_input(&app) {
                            crate::source_desktop::lose_fight_handoff_focus(&app);
                        }
                        close(&app, Some(&request.token), true);
                        break;
                    }
                    thread::sleep(Duration::from_millis(180));
                }
            });
            true
        })
        .await
        .unwrap_or(false)
    }

    pub async fn end(main: WebviewWindow, token: String, outcome: String) -> bool {
        let app = main.app_handle();
        if outcome == "cancel" {
            return close(app, Some(&token), false);
        }
        // The same parry may be made in-game. The fight owns the result even
        // when a native click and a timeout arrive on opposite sides of IPC.
        if change_phase(&token, Phase::Armed, Phase::Releasing).is_none()
            && change_phase(&token, Phase::Hit, Phase::Releasing).is_none()
        {
            return false;
        }
        if let Some(target) = app.get_webview_window(TARGET) {
            let _ = target.set_ignore_cursor_events(true);
            if target.is_focused().unwrap_or(false) {
                let _ = main.set_focus();
            }
        }
        let _ = app.run_on_main_thread(|| unsafe { remove_mouse_monitor() });
        for label in [BACKDROP, TARGET] {
            let _ = app.emit_to(
                label,
                "chapel-desktop:release",
                json!({"token":token,"outcome":outcome}),
            );
        }
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            thread::sleep(OUTCOME_TAIL);
            close(&app, Some(&token), false);
        });
        true
    }

    pub fn surface(window: WebviewWindow, action: &str, token: Option<&str>) -> bool {
        let bit = role(window.label());
        if bit == 0 {
            return false;
        }
        if action == "ready" {
            READY.fetch_or(bit, Ordering::SeqCst);
            return true;
        }
        let Some(token) = token else {
            return false;
        };
        if action == "painted" {
            let Ok(mut slot) = LEASE.lock() else {
                return false;
            };
            let Some(lease) = slot
                .as_mut()
                .filter(|lease| lease.request.token == token && lease.phase == Phase::Opening)
            else {
                return false;
            };
            lease.painted |= bit;
            return true;
        }
        if action != "hit" || window.label() != TARGET {
            return false;
        }
        accept_hit(&window, token)
    }

    fn accept_hit(window: &WebviewWindow, token: &str) -> bool {
        let app = window.app_handle();
        if !owns_fight_input(app) {
            return false;
        }
        let Some(request) = change_phase(token, Phase::Armed, Phase::Hit) else {
            return false;
        };
        let _ = window.set_ignore_cursor_events(true);
        let delivered = app
            .emit_to(
                "main",
                "chapel-desktop:hit",
                json!({"token":token,"attackId":request.attack_id}),
            )
            .is_ok();
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_focus();
        }
        delivered
    }

    fn owns_fight_input(app: &AppHandle) -> bool {
        ["main", TARGET].iter().any(|label| {
            app.get_webview_window(label).is_some_and(|window| {
                window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
            })
        })
    }

    pub fn source_handoff_active(token: Option<&str>) -> bool {
        LEASE
            .lock()
            .ok()
            .and_then(|lease| {
                lease.as_ref().map(|lease| {
                    token.is_none_or(|token| lease.request.token == token)
                        && lease.request.theme.is_source()
                        && matches!(lease.phase, Phase::Armed | Phase::Hit | Phase::Releasing)
                })
            })
            .unwrap_or(false)
    }

    pub fn source_handoff_target_focused(app: &AppHandle) -> bool {
        source_handoff_active(None)
            && app.get_webview_window(TARGET).is_some_and(|window| {
                window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
            })
    }

    pub fn check_focus_after_transfer(app: &AppHandle) {
        let token = LEASE
            .lock()
            .ok()
            .and_then(|lease| lease.as_ref().map(|lease| lease.request.token.clone()));
        let Some(token) = token else {
            return;
        };
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            thread::sleep(Duration::from_millis(90));
            if !owns_fight_input(&app) {
                if source_handoff_active(Some(&token)) {
                    crate::source_desktop::lose_fight_handoff_focus(&app);
                }
                close(&app, Some(&token), true);
            }
        });
    }

    pub fn cancel(app: &AppHandle) {
        close(app, None, true);
    }

    pub fn shutdown(app: &AppHandle) {
        close(app, None, false);
        for label in [TARGET, BACKDROP] {
            if let Some(surface) = app.get_webview_window(label) {
                let _ = surface.destroy();
            }
        }
    }

    fn close(app: &AppHandle, token: Option<&str>, notify: bool) -> bool {
        let request = {
            let Ok(mut slot) = LEASE.lock() else {
                return false;
            };
            let Some(lease) = slot.as_mut().filter(|lease| {
                token.is_none_or(|value| lease.request.token == value)
                    && lease.phase != Phase::Closing
            }) else {
                return false;
            };
            lease.phase = Phase::Closing;
            lease.request.clone()
        };
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            unsafe { remove_mouse_monitor() };
            // The receiver can legitimately become key between press and
            // release. Retiring the cue must never strand the keyboard there.
            if handle
                .get_webview_window(TARGET)
                .is_some_and(|surface| surface.is_focused().unwrap_or(false))
            {
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.set_focus();
                }
            }
            for label in [TARGET, BACKDROP] {
                if let Some(surface) = handle.get_webview_window(label) {
                    let _ = surface.set_ignore_cursor_events(true);
                    if let Ok(window) = surface.ns_window() {
                        unsafe {
                            order_window(window, b"orderOut:\0");
                        }
                    }
                    let _ = handle.emit_to(
                        label,
                        "chapel-desktop:clear",
                        json!({"token":request.token}),
                    );
                }
            }
            if let Ok(mut slot) = LEASE.lock() {
                *slot = None;
            }
            if notify {
                let _ = handle.emit_to(
                    "main",
                    "chapel-desktop:cancelled",
                    json!({"token":request.token,"attackId":request.attack_id}),
                );
            }
        });
        true
    }

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowLevelForKey(key: i32) -> i32;
    }

    unsafe fn order_window(window: *mut c_void, selector: &'static [u8]) {
        let send: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) =
            std::mem::transmute(objc_msgSend as *const ());
        send(
            window,
            sel_registerName(selector.as_ptr().cast()),
            std::ptr::null_mut(),
        );
    }

    unsafe fn set_window_bool(window: *mut c_void, selector: &'static [u8], value: bool) {
        let send: unsafe extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        send(window, sel_registerName(selector.as_ptr().cast()), value);
    }

    unsafe fn install_mouse_monitor(target: &WebviewWindow, target_ns: *mut c_void, token: String) {
        remove_mouse_monitor();
        let target = target.clone();
        let handler = RcBlock::new(move |event: *mut c_void| {
            let object: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            // Never use the cursor to infer that a different app/window means
            // a strike. Only a native press dispatched to this exact receiver
            // is handled. The token/phase gate also covers the WebKit button.
            if object(event, sel_registerName(b"window\0".as_ptr().cast())) == target_ns
                && accept_hit(&target, &token)
            {
                std::ptr::null_mut()
            } else {
                event
            }
        });
        type Monitor = Block<dyn Fn(*mut c_void) -> *mut c_void>;
        let add: unsafe extern "C" fn(*mut c_void, *mut c_void, usize, *const Monitor) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        const LEFT_MOUSE_DOWN_MASK: usize = 1 << 1;
        let monitor = add(
            objc_getClass(b"NSEvent\0".as_ptr().cast()),
            sel_registerName(b"addLocalMonitorForEventsMatchingMask:handler:\0".as_ptr().cast()),
            LEFT_MOUSE_DOWN_MASK,
            RcBlock::as_ptr(&handler),
        );
        TARGET_MOUSE_MONITOR.set(monitor);
    }

    unsafe fn remove_mouse_monitor() {
        let monitor = TARGET_MOUSE_MONITOR.replace(std::ptr::null_mut());
        if monitor.is_null() { return; }
        let remove: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) =
            std::mem::transmute(objc_msgSend as *const ());
        remove(objc_getClass(b"NSEvent\0".as_ptr().cast()),
            sel_registerName(b"removeMonitor:\0".as_ptr().cast()), monitor);
    }

    pub fn target_at_center(window: &WebviewWindow) -> Option<bool> {
        if window.label() != TARGET { return None; }
        let ns = window.ns_window().ok()?;
        unsafe {
            #[repr(C)]
            struct Frame { origin: Point, size: Point }
            #[cfg(target_arch = "aarch64")]
            let frame = {
                let read: unsafe extern "C" fn(*mut c_void, *mut c_void) -> Frame = std::mem::transmute(objc_msgSend as *const ());
                read(ns, sel_registerName(b"frame\0".as_ptr().cast()))
            };
            #[cfg(target_arch = "x86_64")]
            let frame = {
                extern "C" { fn objc_msgSend_stret(); }
                let read: unsafe extern "C" fn(*mut Frame, *mut c_void, *mut c_void) = std::mem::transmute(objc_msgSend_stret as *const ());
                let mut result = std::mem::MaybeUninit::<Frame>::uninit();
                read(result.as_mut_ptr(), ns, sel_registerName(b"frame\0".as_ptr().cast()));
                result.assume_init()
            };
            let number: unsafe extern "C" fn(*mut c_void, *mut c_void) -> isize = std::mem::transmute(objc_msgSend as *const ());
            let hit_test: unsafe extern "C" fn(*mut c_void, *mut c_void, Point, isize) -> isize = std::mem::transmute(objc_msgSend as *const ());
            let own = number(ns, sel_registerName(b"windowNumber\0".as_ptr().cast()));
            let hit = hit_test(objc_getClass(b"NSWindow\0".as_ptr().cast()),
                sel_registerName(b"windowNumberAtPoint:belowWindowWithWindowNumber:\0".as_ptr().cast()),
                Point { x: frame.origin.x + frame.size.x * 0.5, y: frame.origin.y + frame.size.y * 0.5 }, 0);
            Some(own > 0 && own == hit)
        }
    }

    fn reveal(
        app: &AppHandle,
        token: String,
        backdrop: WebviewWindow,
        target: WebviewWindow,
        source_composited: bool,
    ) -> Result<(), String> {
        run_appkit(app, move || {
            if phase(&token) != Some(Phase::Opening) {
                return false;
            }
            let (Ok(backdrop), Ok(target)) = (backdrop.ns_window(), target.ns_window()) else {
                return false;
            };
            unsafe {
                const DESKTOP_LEVEL_KEY: i32 = 2;
                const NORMAL_LEVEL_KEY: i32 = 4;
                const FLOATING_LEVEL_KEY: i32 = 5;
                let set_level: unsafe extern "C" fn(*mut c_void, *mut c_void, isize) =
                    std::mem::transmute(objc_msgSend as *const ());
                // In ordinary windowed play the plate sits at desktop level.
                // Source already owns a floating underlay, so its clipped cue
                // needs to stack above it, without covering the command frame.
                let levels = if source_composited {
                    let top = CGWindowLevelForKey(FLOATING_LEVEL_KEY);
                    [top + 1, top + 2]
                } else {
                    [
                        CGWindowLevelForKey(DESKTOP_LEVEL_KEY) + 1,
                        CGWindowLevelForKey(NORMAL_LEVEL_KEY),
                    ]
                };
                for (window, level) in [backdrop, target].into_iter().zip(levels) {
                    set_level(
                        window,
                        sel_registerName(b"setLevel:\0".as_ptr().cast()),
                        level as isize,
                    );
                    set_window_bool(window, b"setHidesOnDeactivate:\0", true);
                    set_window_bool(window, b"setIgnoresMouseEvents:\0", true);
                    order_window(window, b"orderFront:\0");
                }
            }
            true
        })
    }

    fn run_appkit(
        app: &AppHandle,
        update: impl FnOnce() -> bool + Send + 'static,
    ) -> Result<(), String> {
        let (send, recv) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let _ = send.send(update());
        })
        .map_err(|error| error.to_string())?;
        if recv
            .recv_timeout(Duration::from_millis(200))
            .unwrap_or(false)
        {
            Ok(())
        } else {
            Err("could not update the desktop fight windows".into())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn rect(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect<i32, u32> {
            PhysicalRect {
                position: PhysicalPosition::new(x, y),
                size: PhysicalSize::new(width, height),
            }
        }

        #[test]
        fn themes_choose_authored_edges_and_keep_the_full_ordinary_backdrop() {
            let work = rect(0, 40, 1600, 1000);
            let main = rect(240, 200, 1120, 700);
            for (theme, expected) in [
                (FightTheme::Chapel, Edge::Right),
                (FightTheme::Tower, Edge::Top),
                (FightTheme::SourceIi, Edge::Right),
                (FightTheme::SourceIii, Edge::Left),
                (FightTheme::SourceFinal, Edge::Top),
            ] {
                let placement = Placement::fit(main, work, 1.0, theme, None).unwrap();
                assert_eq!(placement.direction, expected);
                assert_eq!(placement.backdrop.position, work.position);
                assert_eq!(placement.backdrop.size, work.size);
                let (width, height) = theme.target_size();
                assert_eq!(
                    placement.target_size,
                    PhysicalSize::new(width as u32, height as u32)
                );
            }
        }

        #[test]
        fn source_reaction_uses_one_exposed_band_and_local_pixel_coordinates() {
            let work = rect(-3200, 80, 3200, 2000);
            let main = rect(-2680, 1070, 2160, 920);
            let placement = Placement::fit(
                main,
                work,
                2.0,
                FightTheme::SourceFinal,
                Some("source-owner".into()),
            )
            .unwrap();
            assert_eq!(placement.direction, Edge::Top);
            assert_eq!(placement.backdrop.position, work.position);
            assert_eq!(placement.backdrop.size, PhysicalSize::new(3200, 990));
            assert_eq!(placement.source_owner.as_deref(), Some("source-owner"));
            assert_eq!(placement.target_size, PhysicalSize::new(224, 200));
            assert!((placement.receiver.x - 800.0).abs() < 0.01);
            assert!((placement.entry.y - 495.0).abs() < 0.01);
            assert_eq!(
                placement.target.x * 2 + placement.target_size.width as i32,
                -3200
            );
        }

        #[test]
        fn choice_falls_back_to_the_opposite_edge_or_declines_without_room() {
            let work = rect(0, 0, 1600, 1000);
            let no_left = rect(0, 0, 1300, 1000);
            let placement =
                Placement::fit(no_left, work, 1.0, FightTheme::SourceIii, None).unwrap();
            assert_eq!(placement.direction, Edge::Right);
            assert!(placement.target.x > 1300);
            assert!(Placement::fit(work, work, 1.0, FightTheme::Tower, None).is_none());
        }

        #[test]
        fn old_requests_default_to_chapel_and_unknown_themes_are_rejected() {
            let request: ChapelDesktopRequest =
                serde_json::from_value(json!({"token":"old-attempt","attackId":"chapel:walls"}))
                    .unwrap();
            assert_eq!(request.theme, FightTheme::Chapel);
            assert!(request.response_seconds.is_none());
            for (name, theme) in [
                ("tower", FightTheme::Tower),
                ("source-ii", FightTheme::SourceIi),
                ("source-iii", FightTheme::SourceIii),
                ("source-final", FightTheme::SourceFinal),
            ] {
                let request: ChapelDesktopRequest = serde_json::from_value(
                    json!({"token":"attempt","attackId":"beat","theme":name}),
                )
                .unwrap();
                assert_eq!(request.theme, theme);
            }
            assert!(serde_json::from_value::<ChapelDesktopRequest>(
                json!({"token":"attempt","attackId":"beat","theme":"other"})
            )
            .is_err());
        }
    }
}
