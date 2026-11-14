//! Native, finite van arrival and a persistent ear alternate. The native
//! preference is shared with the closed-app Dock plug-in, outside run saves.
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppIconChoice {
    Van,
    Ear,
}

impl AppIconChoice {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "van" => Ok(Self::Van),
            "ear" => Ok(Self::Ear),
            _ => Err("Unknown app icon. Choose van or ear.".into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppIconStatus {
    pub supported: bool,
    pub choice: AppIconChoice,
}

#[cfg(target_os = "macos")]
extern "C" {
    fn chunk_surfer_install_dock_assembly(
        van: *const u8,
        van_length: usize,
        ear: *const u8,
        ear_length: usize,
        atlas: *const u8,
        atlas_length: usize,
    );
    fn chunk_surfer_app_icon_choice() -> i32;
    fn chunk_surfer_set_app_icon(choice: i32) -> i32;
}

#[cfg(target_os = "macos")]
pub fn install() {
    static VAN: &[u8] = include_bytes!("../macos/DockTile/DockTile.icns");
    static EAR: &[u8] = include_bytes!("../macos/DockTile/Ear.icns");
    static ATLAS: &[u8] = include_bytes!("../macos/DockTile/VanLaunch.png");
    // Setup runs on the AppKit main thread. The helper safely dispatches if a
    // caller later invokes it elsewhere, and repeated setup never replays.
    unsafe {
        chunk_surfer_install_dock_assembly(
            VAN.as_ptr(),
            VAN.len(),
            EAR.as_ptr(),
            EAR.len(),
            ATLAS.as_ptr(),
            ATLAS.len(),
        )
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install() {}

#[tauri::command]
pub fn chunk_app_icon_status() -> AppIconStatus {
    #[cfg(target_os = "macos")]
    let choice = if unsafe { chunk_surfer_app_icon_choice() } == 1 {
        AppIconChoice::Ear
    } else {
        AppIconChoice::Van
    };
    #[cfg(not(target_os = "macos"))]
    let choice = AppIconChoice::Van;
    AppIconStatus {
        supported: cfg!(target_os = "macos"),
        choice,
    }
}

#[tauri::command]
pub fn chunk_set_app_icon(choice: String) -> Result<AppIconStatus, String> {
    let choice = AppIconChoice::parse(&choice)?;
    #[cfg(target_os = "macos")]
    {
        let selected =
            unsafe { chunk_surfer_set_app_icon(if choice == AppIconChoice::Ear { 1 } else { 0 }) };
        if selected == 0 {
            return Err("The app icon is not ready. Try again after startup.".into());
        }
        Ok(chunk_app_icon_status())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = choice;
        Err("Alternate app icons are available in the macOS Dock.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::AppIconChoice;
    #[test]
    fn only_the_two_bundled_choices_can_be_selected() {
        assert_eq!(AppIconChoice::parse("van"), Ok(AppIconChoice::Van));
        assert_eq!(AppIconChoice::parse("ear"), Ok(AppIconChoice::Ear));
        for value in ["", "Ear", "VAN", "../ear", "van\0ear", " ear", "other"] {
            assert!(AppIconChoice::parse(value).is_err(), "{value:?}");
        }
    }
}
