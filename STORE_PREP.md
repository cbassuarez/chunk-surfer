# Storefront Prep

## Canonical storefront copy

Use [`docs/storefront-copy.md`](docs/storefront-copy.md) as the canonical source for manual itch.io and Steam updates. It contains paste-ready descriptions, the research rationale, release-managed beta and privacy notices, media order, and the pre-publication verification checklist.

Publication remains a webmaster action. After updating itch.io, verify the page while logged out and on a mobile viewport; preview the Steam short description and About section in Steamworks before submission.

## v0.3.0 candidate status

`0.3.0` is the prepared source version, not a publication receipt. Before release,
require a green `npm test`, production build, `npm run release:preflight` on the
clean release commit, and successful packaging/launch checks on every supported
platform. Validate extracted artifacts with `npm run lean:verify`; source config
alone does not prove a package is free of SD. Record download and installed sizes
from those exact artifacts. Native signing, notarization and unfamiliar-player
acceptance remain separate checks.

The supported release matrix is macOS Apple Silicon DMG, Windows x64 portable
ZIP, and Linux x64 AppImage/deb. macOS Intel and Steam Deck/Proton are not release
platforms unless separately built and validated. Keep the existing beta channels
and unsigned warnings for this candidate.

A manual workflow run with `publish: false` performs validation only. A pushed
release tag or an explicit publish run publishes through the existing itch/GitHub
workflow; do not use either merely to test preparation.

## itch.io

- Use the validated native artifact for each platform; only the Windows portable
  payload is a required ZIP.
- Storefront uploads must contain **no** Stable Diffusion sidecar, model weights,
  or Python environment. Validate the expanded package with `npm run lean:verify`.
  The separately maintained lens is development-only and no models are downloaded
  on first launch.
- List the full installed size plainly on the project page/release notes once
  measured from the final artifact.
- Current package formats and channels:
  - macOS Apple Silicon: DMG on `mac-arm64-beta`.
  - Windows x64: `*windows-x64.zip` on `win-beta`; extract the whole folder.
  - Linux x64: AppImage on `linux-appimage-beta`, deb on `linux-deb-beta`.
- Use the actual generated filenames and version from the CI artifacts. The
  `scripts/itch-release.mjs` staging command resolves these four channels; there
  is no current macOS Intel channel.
- Optional web build: upload `dist/` as a browser demo if desired.

## Steam

- App id placeholder: TBD.
- Depot layout proposal:
  - Windows depot: lean portable application, EULA, optional Steamworks DLL.
  - macOS Apple Silicon depot: ordinary authored-material app bundle.
  - macOS Intel depot if separately supported and tested.
  - Linux depot: lean AppImage or Debian package.
- Keep model weights and the diffusion sidecar out of all distribution depots.
  Development SD remains available only in the local repository checkout.
- Upload [`LEGAL/EULA.md`](LEGAL/EULA.md) in Steamworks as the required
  third-party EULA before submitting the build. The same file is also bundled as
  `EULA.md` in packaged app resources.
- Review Steam's AI-content survey for any generated assets actually included
  in the final game. Do not claim live AI generation or bundled models for a
  standard build that does neither. Reassess disclosure if SD later ships.
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
- macOS Intel only if separately added to the supported build/test matrix
- Windows 10/11
- Linux Ubuntu
- Steam Deck/Proton
