# Chunk Surfer

Chunk Surfer is a web-native horror game about recording room tone inside Ellery Conservatory. This repository is the standalone extraction from `cbassuarez.github.io` with a Tauri v2 desktop shell for macOS, Windows, and Linux.

Status: desktop port in progress. The browser game remains the canonical runtime, and the desktop shell packages that web build rather than rewriting the game in another engine.

## Run the latest playable desktop build

```sh
npm install
npm run lens:setup       # one time; installs the local GPU lens runtime
npm run play:latest
```

`play:latest` starts the separately managed development lens and the native
Tauri app together. On a fresh cache the calibration screen generates all six
ten-tile material banks. The authored 18-second opening credits begin only
after calibration succeeds, and their clock pauses whenever the game is hidden
or unfocused so the opening cannot expire behind another app.

Do not use plain `npm run tauri:dev` for normal playtesting. Production owns a
bundled sidecar; development deliberately supplies the same service protocol
from the local Python environment. Plain Tauri development does not start that
service, so calibration cannot complete.

For browser-only work, run `npm run lens:local` in one terminal and `npm run
dev` in another, then open the Vite URL.

## Web build

```sh
npm run build
npm run preview
```

The Vite build uses `base: './'` so generated assets are safe for static preview and Tauri packaging.

## Package the macOS Beta 3 candidate

```sh
npm run beta:build:mac
```

This downloads the pinned model resources, builds the Apple Silicon sidecar,
merges `src-tauri/tauri.lens.conf.json`, and creates the DMG under
`src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`. It is intentionally
large and can take a long time on its first run.

The Beta 3 source version is `0.1.0-beta.4`; the release tag is
`v0.1.0-beta.4`. Before creating that tag, run:

```sh
npm test
npm run test:acoustic
npm run test:desktop
npm run tauri:check
npm run beta:preflight
```

`beta:preflight` intentionally requires a clean worktree. Pushing the tag starts
the release workflow, which builds the mandatory lens package independently on
macOS Apple Silicon, Windows x64/NVIDIA, and Linux x64/NVIDIA runners and
publishes a GitHub prerelease. Unsigned local bundles are expected at this
stage. Signing, notarization, and storefront automation are tracked in
`STORE_PREP.md`.

## Tests

```sh
npm test
npm run test:acoustic
```

Browser smoke tests under `tools/chunk_surfer/tests/` expect a running Vite dev server and a local Chrome/Chromium compatible with `puppeteer-core`.

## Migration note

Extracted from `/Users/seb/cbassuarez.github.io` after source snapshot commit:

```txt
d75d9f189883ca4eb48008bb164d2c190afdc3f8
```

History is partially preserved via a filtered clone containing the game, its toolchain, and required audio sample pools. The original repo remains untouched after the snapshot commit except for its pre-existing untracked ZIP snapshots.

## Native Desktop Storage

The game still renders as a web app, but persistence now goes through `src/platform/storage/`.

### Browser mode

Browser mode uses `localStorage` through `BrowserStorage`:

- `chunk-surfer:settings:v1`
- `chunk-surfer:profile:v1`
- `chunk-surfer:save:autosave:v1`

It also reads legacy keys such as `chunk-surfer:save:v3` and `chunk-surfer:meta:v2` once and leaves them in place for compatibility.

### Desktop mode

Tauri mode uses explicit JSON files in app directories:

- AppConfig: `settings.json`
- AppData: `profile.json` and `saves/*.json`
- AppData: `saves/backup/*.previous.json` for recovery
- AppData: `migration/localstorage-import-v1.json`
- AppLog: `chunksurfer.log` / Tauri log target

### Recovery

JSON files use versioned envelopes. Saves are written through a temp-file + readback path and the previous primary file is copied to `saves/backup/` before replacement. If a primary save is corrupt, the app attempts to load and restore the previous backup. Unknown newer schema versions are not overwritten in that session.

### Support

The diagnostics service can export app version, schema versions, platform mode, renderer/lens query settings, storage layout, migration status, and recent storage/log errors. Desktop builds can reveal save/log folders through Tauri opener APIs.

### Steam Cloud

Cloud-sync `profile.json` and `saves/*.json` only. Do not sync `settings.json`, input/window state, migration logs, diagnostics logs, renderer caches, or temp files. See `docs/storage-and-cloud.md`.

## Troubleshooting

### Blank screen / missing assets

Run `npm run build` and verify that `dist/assets`, `dist/audio`, and `dist/index.html` exist. Runtime asset paths are relative to the app base, not `/labs/chunk-surfer/`.

### Linux WebKit dependencies

Tauri Linux builds require WebKitGTK and related system packages. The release workflow installs `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, and `xdg-utils`.

### macOS unsigned app warning

Local builds are unsigned. macOS may warn when opening the app. Developer ID signing and notarization are not configured yet.

### Audio unlock behavior

The game uses Web Audio. If a WebView applies autoplay restrictions, the first explicit menu/title input should unlock the audio context. Do not rely on hover or cursor movement to start title/menu hiss.

## Creating the GitHub remote

Do not run this until you have decided private vs public and are ready to push.

```sh
cd /Users/seb/chunk-surfer
gh repo create cbassuarez/chunk-surfer --private --source=. --remote=origin --push
```

If you choose public later, replace `--private` with `--public`.
