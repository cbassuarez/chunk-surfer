# Storefront Prep

## itch.io

- Zip artifacts per OS after unsigned build validation.
- Recommended filenames:
  - `chunk-surfer-macos-arm64.zip`
  - `chunk-surfer-macos-x64.zip`
  - `chunk-surfer-windows-x64.zip`
  - `chunk-surfer-linux-x64.AppImage`
  - `chunk-surfer-linux-x64.deb`
- Butler TODO: add channel naming for `mac`, `mac-intel`, `win`, `linux`.
- Optional web build: upload `dist/` as a browser demo if desired.

## Steam

- App id placeholder: TBD.
- Depot layout proposal:
  - Windows depot: NSIS/MSI or unpacked bundle.
  - macOS Apple Silicon depot.
  - macOS Intel depot if retained.
  - Linux depot: AppImage or unpacked binary bundle.
- Save/cloud files:
  - Include: `profile.json`, `saves/autosave.json`, `saves/slot-1.json`, `saves/slot-2.json`
  - Exclude: `settings.json`, input/window state, `migration/`, `logs/`, `cache/`, `*.tmp`, `saves/backup/` unless support recovery policy changes.
- Steam Deck/Proton QA: controller mapping, text readability, WebView audio/mic permission, fullscreen, suspend/resume.
- Achievements TODO: map progression achievement ids to Steam stats/achievements.
- Steam Input TODO: controller remapping profiles.
- Screenshots/capsules TODO.

## Microsoft Store

- MSIX/AppX notes: Tauri can be packaged later, but current release pipeline targets unsigned desktop installers first.
- Identity/publisher TODO.
- Signing TODO.
- Certification risks: microphone permission, WebView runtime, unsigned native shell, content warnings.

## Linux

- AppImage enabled in Tauri bundle targets.
- deb enabled in Tauri bundle targets.
- rpm optional later.
- Flatpak/Snap optional later.

## Signing

- macOS Developer ID TODO.
- Windows certificate TODO.
- Linux checksums TODO.
- Tauri updater signing TODO.

## QA Matrix

- macOS Apple Silicon
- macOS Intel if possible
- Windows 10/11
- Linux Ubuntu
- Steam Deck/Proton
