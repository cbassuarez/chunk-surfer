use libloading::Library;
use serde::Serialize;
use std::{
    ffi::CStr,
    os::raw::{c_char, c_void},
    path::PathBuf,
};
use tauri::Manager;

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

#[cfg(target_os = "windows")]
const STEAM_LIBRARY: &str = "steam_api64.dll";
#[cfg(target_os = "macos")]
const STEAM_LIBRARY: &str = "libsteam_api.dylib";
#[cfg(all(unix, not(target_os = "macos")))]
const STEAM_LIBRARY: &str = "libsteam_api.so";

fn steam_library_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("steamworks").join(STEAM_LIBRARY));
        candidates.push(resources.join(STEAM_LIBRARY));
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.join(STEAM_LIBRARY));
            candidates.push(parent.join("steamworks").join(STEAM_LIBRARY));
        }
    }
    // This final candidate is resolved by the platform loader and supports the
    // ordinary Steam launch environment and local SDK development setup.
    candidates.push(PathBuf::from(STEAM_LIBRARY));
    candidates
}

unsafe fn persona_from_library(library: &Library) -> Option<String> {
    type SteamInit = unsafe extern "C" fn() -> u8;
    type SteamShutdown = unsafe extern "C" fn();
    type SteamFriends = unsafe extern "C" fn() -> *mut c_void;
    type GetPersonaName = unsafe extern "C" fn(*mut c_void) -> *const c_char;

    let init = *library.get::<SteamInit>(b"SteamAPI_Init\0").ok()?;
    let shutdown = *library.get::<SteamShutdown>(b"SteamAPI_Shutdown\0").ok()?;
    if init() == 0 {
        return None;
    }
    let result = (|| {
        let friends = [
            b"SteamAPI_SteamFriends_v017\0".as_slice(),
            b"SteamAPI_SteamFriends_v016\0".as_slice(),
            b"SteamAPI_SteamFriends_v015\0".as_slice(),
        ]
        .iter()
        .find_map(|symbol| library.get::<SteamFriends>(symbol).ok().map(|value| *value))?;
        let get_persona = *library
            .get::<GetPersonaName>(b"SteamAPI_ISteamFriends_GetPersonaName\0")
            .ok()?;
        let interface = friends();
        if interface.is_null() {
            return None;
        }
        let value = get_persona(interface);
        if value.is_null() {
            return None;
        }
        sanitize_candidate(
            Some(CStr::from_ptr(value).to_string_lossy().into_owned()),
            64,
        )
    })();
    shutdown();
    result
}

fn steam_persona_name(app: &tauri::AppHandle) -> Option<String> {
    for candidate in steam_library_candidates(app) {
        let library = unsafe { Library::new(candidate) }.ok();
        if let Some(library) = library {
            if let Some(display) = unsafe { persona_from_library(&library) } {
                return Some(display);
            }
        }
    }
    None
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
