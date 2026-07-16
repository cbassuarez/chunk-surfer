# Storefront Prep

## Canonical storefront copy

Use [`docs/storefront-copy.md`](docs/storefront-copy.md) as the canonical source for manual itch.io and Steam updates. It contains paste-ready descriptions, the research rationale, release-managed beta and privacy notices, media order, and the pre-publication verification checklist.

Publication remains a webmaster action. After updating itch.io, verify the page while logged out and on a mobile viewport; preview the Steam short description and About section in Steamworks before submission.

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
  - `chunk-surfer-windows-x64.zip`
  - `chunk-surfer-linux-x64.AppImage`
  - `chunk-surfer-linux-x64.deb`
- Butler TODO: add channel naming for `mac`, `mac-intel`, `win`, `linux`.
- Optional web build: upload `dist/` as a browser demo if desired.

## Steam

- App id placeholder: TBD.
- Depot layout proposal:
  - Windows depot: portable/unpacked bundle, including `chunk-lens` and
    `lens/` resources.
  - macOS Apple Silicon depot, including `chunk-lens` and `lens/` resources.
  - macOS Intel depot if retained; do not ship until an offline lens package is
    supported for that target.
  - Linux depot: AppImage or unpacked binary bundle, including `chunk-lens` and
    `lens/` resources.
- Prefer predictable depot/download size over first-launch model downloads. If
  model resources become optional later, ship them as a clearly named Steam
  depot/DLC, not as an implicit runtime fetch.
- Upload [`LEGAL/EULA.md`](LEGAL/EULA.md) in Steamworks as the required
  third-party EULA before submitting the build. The same file is also bundled as
  `EULA.md` in packaged app resources.
- Complete Steam's AI Generated Content disclosure for the local/offline
  material-generation lens. Keep the disclosure narrow: bundled local model
  resources, constrained environmental material generation, no cloud prompt
  upload, no general-purpose player prompt surface, and no live Adult Only
  sexual-content generation path.
- Save/cloud files:
  - Include: `profile.json`, `saves/autosave.json`, `saves/slot-1.json`, `saves/slot-2.json`
  - Exclude: `settings.json`, input/window state, `migration/`, `logs/`, `cache/`, `*.tmp`, `saves/backup/` unless support recovery policy changes.
- Steam Deck/Proton QA: controller mapping, text readability, WebView audio/mic permission, fullscreen, suspend/resume.
- Achievements TODO: map progression achievement ids to Steam stats/achievements.
- Steam Input TODO: controller remapping profiles.
- Screenshots/capsules TODO.

## Microsoft Store

- MSIX/AppX notes: Tauri can be packaged later, but current release pipeline targets unsigned desktop bundles first.
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
