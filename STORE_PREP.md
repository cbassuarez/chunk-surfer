# Storefront Prep

## itch.io

- Zip artifacts per OS after unsigned build validation.
- Storefront uploads must include the offline lens sidecar and pinned diffusion
  model resources in the initial download. Do not publish a build that downloads
  model weights on first launch.
- List the full installed size plainly on the project page/release notes once
  measured from the final artifact.
- Recommended filenames:
  - `chunk-surfer-macos-arm64.zip`
  - `chunk-surfer-macos-x64.zip`
  - `chunk-surfer-windows-x64.msi`
  - `chunk-surfer-linux-x64.AppImage`
  - `chunk-surfer-linux-x64.deb`
- Butler TODO: add channel naming for `mac`, `mac-intel`, `win`, `linux`.
- Optional web build: upload `dist/` as a browser demo if desired.

## Steam

- App id placeholder: TBD.
- Depot layout proposal:
  - Windows depot: MSI or unpacked bundle, including `chunk-lens` and
    `lens/` resources.
  - macOS Apple Silicon depot, including `chunk-lens` and `lens/` resources.
  - macOS Intel depot if retained; do not ship until an offline lens package is
    supported for that target.
  - Linux depot: AppImage or unpacked binary bundle, including `chunk-lens` and
    `lens/` resources.
- Prefer predictable depot/download size over first-launch model downloads. If
  model resources become optional later, ship them as a clearly named Steam
  depot/DLC, not as an implicit runtime fetch.
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
