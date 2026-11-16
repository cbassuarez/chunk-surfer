//! WebKitGTK routes every getUserMedia/enumerateDevices call, audio-only
//! included, through the PipeWire Camera portal: players see a camera prompt
//! and the capture manager can abort the process. The game treats a missing
//! mediaDevices as an unavailable microphone, so Linux never exposes capture.
use tauri::{Runtime, Webview};

pub fn harden<R: Runtime>(webview: &Webview<R>) {
    #[cfg(target_os = "linux")]
    {
        let _ = webview.with_webview(|platform| {
            use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
            let view = platform.inner();
            if let Some(settings) = WebViewExt::settings(&view) {
                settings.set_enable_media_stream(false);
            }
            // Deny rather than let WebKit fall through to a system prompt.
            view.connect_permission_request(|_, request| {
                request.deny();
                true
            });
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = webview;
}
