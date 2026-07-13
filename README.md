# Chunk Surfer

Chunk Surfer is a web-native horror game about recording room tone inside Ellery Conservatory. This repository is the standalone extraction from `cbassuarez.github.io` with a Tauri v2 desktop shell for macOS, Windows, and Linux.

Status: desktop port in progress. The browser game remains the canonical runtime, and the desktop shell packages that web build rather than rewriting the game in another engine.

## Local web development

```sh
npm install
npm run dev
```

Open the local Vite URL. Query parameters such as `?renderer=3d&lens=1` are preserved.

## Web build

```sh
npm run build
npm run preview
```

The Vite build uses `base: './'` so generated assets are safe for static preview and Tauri packaging.

## Desktop development

```sh
npm run tauri:dev
```

The Tauri shell uses the Vite dev server at `http://localhost:5173` and packages `dist/` for production.

## Desktop build

```sh
npm run tauri:build
```

Unsigned local bundles are expected at this stage. Signing, notarization, and storefront automation are tracked in `STORE_PREP.md`.

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

## Saves and settings

The initial desktop port still uses the browser-compatible localStorage save path to minimize gameplay risk. The platform boundary is in `src/platform/` and is intended to move persistent data to app-data JSON files later:

- `settings.json`
- `save.json`
- `profile.json`
- `logs/diagnostics.log`

This layout is intended to be Steam Cloud friendly.

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
