# Migration Notes

## Source snapshot

Original repository: `/Users/seb/cbassuarez.github.io`

Snapshot commit before extraction:

```txt
d75d9f189883ca4eb48008bb164d2c190afdc3f8
```

No push was performed.

## Discovery findings

Canonical Chunk Surfer source was tracked under:

- `public/labs/chunk-surfer/index.html`
- `public/labs/chunk-surfer/styles.css`
- `public/labs/chunk-surfer/src/`
- `public/labs/chunk-surfer/test/`
- `public/labs/chunk-surfer/scripts/`
- `public/labs/chunk-surfer/assets/`
- `public/labs/chunk-surfer/audio/`

Companion tooling was tracked under:

- `tools/chunk_surfer/`

Required shared sample pools were tracked under:

- `public/audio/main_b3/`
- `public/audio/amplifications/`
- `public/audio/lux_nova/`
- `public/audio/soundnoisemusic/`
- `public/audio/the_tub/`

Generated/static output existed under `dist/` in the site repo and was ignored. It was not treated as canonical source.

`public/labs/chunk-surfer/` was both the site deployment location and the canonical lab source in the original repo. The standalone repo re-roots that content to the project root and keeps runtime static assets under `public/`.

## Extraction strategy

History was partially preserved by cloning the site repo into a disposable clone and filtering to the selected game/tool/audio paths with `git filter-repo`. The filtered repository was then moved to `/Users/seb/chunk-surfer`.

This was not a full-history extraction because Chunk Surfer spans multiple original paths and the site-level package/Vite config belonged to the personal site rather than the game.

## Current standalone layout

- `index.html` — browser entry
- `styles.css` — minimal canvas shell
- `src/` — game runtime
- `public/assets/` — GLB/surface/portrait assets
- `public/audio/game/` — game UI/story audio
- `public/audio/*` — sample pools
- `test/` — pure Node tests
- `tools/chunk_surfer/` — build, local lens, and browser smoke tooling
- `src-tauri/` — Tauri v2 shell

## Package manager

The source repo used npm and `package-lock.json`. This standalone repo continues with npm.

## Browser/Tauri pathing

The standalone Vite config uses `base: './'`. Runtime asset helpers live in `src/platform/paths.js`. Hardcoded `/labs/chunk-surfer/...` and `/audio/...` runtime fetch roots were replaced with packaged-relative URLs.

## Platform boundary

`src/platform/` now has browser, desktop, Steam, path, and type modules. The initial Tauri port still uses localStorage-compatible persistence to avoid gameplay regressions. Future work should move settings/save/profile/logs to app-data JSON files through this boundary.

## Audio unlock

Web Audio restrictions may still require an explicit first input in browser or WebView. The intended behavior is that the first title/menu action unlocks audio; title/menu hiss should not depend on cursor hover.

## Local diffusion lens

The local diffusion server remains a development tool under `tools/chunk_surfer/diffusion_server/`. It is not bundled into the Tauri app. Query parameter support for `?lens=1` is preserved, but the runtime only accepts loopback diffusion endpoints.

## Original untracked artifacts left behind

The original site repo still has pre-existing untracked ZIP snapshots that were intentionally not committed or copied as canonical source:

- `public/labs/chunk-surfer 2.zip`
- `public/labs/chunk-surfer.zip`
- `tools/chunk_surfer.zip`
