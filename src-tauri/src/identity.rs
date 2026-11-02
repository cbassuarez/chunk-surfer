use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct EphemeralDisplayName {
    pub source: String,
    pub display: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EphemeralIdentity {
    pub names: Vec<EphemeralDisplayName>,
    pub hostname: Option<String>,
}

fn sanitize_candidate(value: Option<String>, max_chars: usize) -> Option<String> {
    let text = value
        .unwrap_or_default()
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>();
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = text.trim().chars().take(max_chars).collect::<String>();
    let text = text.trim().to_string();
    if text.chars().count() < 2 {
        return None;
    }
    if text.contains('@') || text.contains('/') || text.contains('\\') {
        return None;
    }
    if text.chars().all(|ch| matches!(ch, '.' | '_' | '-')) {
        return None;
    }
    Some(text)
}

fn os_username() -> Option<String> {
    #[cfg(windows)]
    {
        sanitize_candidate(std::env::var("USERNAME").ok(), 64)
    }
    #[cfg(not(windows))]
    {
        sanitize_candidate(std::env::var("USER").ok(), 64)
            .or_else(|| sanitize_candidate(std::env::var("LOGNAME").ok(), 64))
    }
}

#[cfg(windows)]
fn computer_name() -> Option<String> {
    // GetComputerNameW lives in Win32::System::WindowsProgramming, which this
    // crate does not enable; only Win32_System_SystemInformation is on, and the
    // import failed to resolve there. GetComputerNameExW is the same call in the
    // module we already have -- and the one Microsoft points at, the plain form
    // being the legacy shim over it -- so it needs no new feature.
    use windows_sys::Win32::System::SystemInformation::{ComputerNameNetBIOS, GetComputerNameExW};
    let mut buffer = [0_u16; 256];
    let mut length = buffer.len() as u32;
    let ok = unsafe { GetComputerNameExW(ComputerNameNetBIOS, buffer.as_mut_ptr(), &mut length) };
    if ok == 0 {
        return None;
    }
    // `length` comes back as the count written, excluding the terminator. Clamp
    // it anyway: it indexes a fixed buffer, and trusting a returned length is
    // how that kind of slice panics.
    let end = (length as usize).min(buffer.len());
    sanitize_candidate(String::from_utf16(&buffer[..end]).ok(), 96)
}

#[cfg(not(windows))]
fn computer_name() -> Option<String> {
    let mut buffer = [0_i8; 256];
    let ok = unsafe { libc::gethostname(buffer.as_mut_ptr(), buffer.len()) };
    if ok != 0 {
        return None;
    }
    let end = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    let bytes = buffer[..end]
        .iter()
        .map(|value| *value as u8)
        .collect::<Vec<_>>();
    sanitize_candidate(String::from_utf8(bytes).ok(), 96)
}

// The persistent Steam owner also serves optional persona reads. Identity
// inspection must never shut down the achievements client's callback pump.
fn steam_persona_name(app: &tauri::AppHandle) -> Option<String> {
    sanitize_candidate(crate::steam_achievements::persona_name(app), 64)
}

#[tauri::command]
pub fn chunk_ephemeral_identity(
    app: tauri::AppHandle,
    allow_steam: bool,
    allow_os: bool,
    allow_hostname: bool,
) -> EphemeralIdentity {
    let mut names = Vec::new();
    if allow_steam {
        if let Some(display) = steam_persona_name(&app) {
            names.push(EphemeralDisplayName {
                source: "steam".into(),
                display,
            });
        }
    }
    if allow_os {
        if let Some(display) = os_username() {
            names.push(EphemeralDisplayName {
                source: "os".into(),
                display,
            });
        }
    }
    EphemeralIdentity {
        names,
        hostname: if allow_hostname {
            computer_name()
        } else {
            None
        },
    }
}
