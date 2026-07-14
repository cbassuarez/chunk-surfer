use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct EphemeralDisplayName {
    pub source: String,
    pub display: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EphemeralDisplayNames {
    pub names: Vec<EphemeralDisplayName>,
}

fn sanitize_candidate(value: Option<String>) -> Option<String> {
    let mut text = value.unwrap_or_default();
    text = text
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>();
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut text = text.trim().to_string();
    if text.len() > 32 {
        text.truncate(32);
        text = text.trim().to_string();
    }
    if text.len() < 2 {
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
        sanitize_candidate(std::env::var("USERNAME").ok())
    }
    #[cfg(not(windows))]
    {
        sanitize_candidate(std::env::var("USER").ok())
            .or_else(|| sanitize_candidate(std::env::var("LOGNAME").ok()))
    }
}

fn steam_persona_name() -> Option<String> {
    // Placeholder for a future official Steamworks provider. Do not read Steam
    // config files or registry entries here; persona access must come from the
    // Steamworks API when that integration exists.
    None
}

#[tauri::command]
pub fn chunk_ephemeral_display_names(allow_steam: bool, allow_os: bool) -> EphemeralDisplayNames {
    let mut names = Vec::new();
    if allow_steam {
        if let Some(display) = steam_persona_name() {
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
    EphemeralDisplayNames { names }
}
