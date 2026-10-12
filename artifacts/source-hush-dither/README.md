# Hush shared dither acceptance

2026-10-12. The real `pressure-character.glb` now enters the shared pixel-mesh acquisition in the ordinary world, Source, and the contained/native desktop fight. Mesh relief and finite glow are composed before acquisition; later world presentation no longer redraws smooth relief. Legacy text/shore restoration copies only already-acquired pixels within the actual material footprint. The physical depth and occlusion remain authoritative.

Source's exposure of 8 initially turned the acquired body into a solid pale silhouette. Pressure's authored relief is now expressed in the current sensor units before acquisition, preserving its dark volume without changing the room exposure. Covered body pixels also stop inheriting background wall engraving.

## GPU evidence

| Surface | Check | Result |
| --- | --- | --- |
| [Ordinary building](ordinary/report.json) | Real live Presence spawned on a walkable path; actual world renderer and GLB | 12,436 covered model pixels; 83.4% dark, 16.6% light; 2,020 contrasting edges; no shader/feedback errors |
| [Source first contact](source/report.json) | Actual authored checkpoint; same-frame material, geometry and acquisition buffers | 5,478 covered model pixels; 69.0% dark, 31.0% light; two ink colors; no shader/feedback errors |
| [Contained and desktop view](desktop/report.json) | Actual Three renderer, GLB, shared shader and blue-noise asset | 32/32 checks; dark/light torso marks; transparent exterior; exact paused-pixel equality; resize, command clearance and disposal pass |
| [macOS native WebKit](native/report.json) | Production view in instrumented sibling WebKit canvas, plus actual passive overlay lifecycle | 22/22 checks; shared shader compiled/linked without GL errors; actual overlay presented and restored original window geometry |

The native run preceded the world-only background-engraving mask addition. That addition is preprocessor-excluded from `SOURCE_DESKTOP_TRANSPARENT`; the desktop compiled shader path is unchanged. The final Chromium desktop run passed afterward. See [native evidence limits](native/README.md) for the distinction between shader instrumentation and the actual overlay lifecycle.

The first ordinary-world attempt used an older plant tableau fixture whose actor was behind machinery. It correctly produced no visible body pixels in the acquired frame. The final ordinary fixture uses the live Presence scheduler and a walkable nearby placement. Screenshots are rendered gameplay; these are targeted fixture checks, not a complete playthrough or Windows/Linux acceptance.

## Validation

53 focused tests passed across source-desktop view/session, pixel-mesh contract/dither/quantization/memory, Hush visual field, Pressure renderer/volume, Source physical void, and unravelling. Production Vite compilation passed with `publicDir: false` into a temporary output directory (asset copies skipped). Task-owned tracked files passed `git diff --check`.

Repeat GPU checks against a local dev server:

```sh
HUSH_DITHER_URL=http://127.0.0.1:5307 HUSH_DITHER_OUT=/private/tmp/hush-source node tools/chunk_surfer/verify-hush-dither-live.mjs
HUSH_DITHER_URL=http://127.0.0.1:5307 HUSH_DITHER_SCENE=ordinary HUSH_DITHER_OUT=/private/tmp/hush-ordinary node tools/chunk_surfer/verify-hush-dither-live.mjs
SOURCE_DESKTOP_URL=http://127.0.0.1:5307 SOURCE_DESKTOP_OUT=/private/tmp/hush-desktop node tools/chunk_surfer/verify-source-desktop-view.mjs
```
