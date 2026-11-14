# Transit application artwork

The application and static Dock tile use the transparent van; the original ear
remains a separate alternate. The native launch uses 84 transparent 256px
frames in an eight-column, eleven-row atlas over 3.4 seconds. Its unused final
four cells are transparent. Playback skips to elapsed time, then installs the
ordinary multiresolution ICNS still.

`motion.mjs` is the timing authority for the renderer, packaging, startup
metadata and native include. A measured 1.53m reverse approach accelerates,
brakes and locks the wheels at .95s, then stops at 1.27s after 40cm of slip. Body load and
yaw are separate from grounded tyres. Lamp faces and tyre contacts define the
lighting and friction effects; all transient effects finish before the static
handoff. World-space rain and wet ground share the real source camera. One
restrained illumination peaks at 2.42s and decays to 2.95s; app-only thunder is
timed at 2.90s, never caught up after a late audio grant. No idle loop or sound
is embedded in the native Dock frames.

`acquisition.mjs` invokes the existing `createTransparentPixelMesh` and complete
`PIXEL_MESH_FRAG`, using a calm-derived hero mixture of its VFD form/colour and
acquisition branches. The chosen recording and VFD mixture is stored for each
actual output size. This is not presented as pure one-bit output.
Living Materials, crosshatch, fine-detail stipple, spatial moiré, real inverse
camera depth and separate coverage all remain in the game shader. Source-only,
Pressure and temporal memory branches stay off. Geometry, materials, paint,
lamps and rain enter this same pass; no production raster bypasses it and no
external raw-RGB overlay is added.

The model is the real opening/Source Transit, isolated with its canonical
closed-door transforms and original X-axis wheel pivots. `transit-source.json`
records the shared source hashes, transforms and preserved geometry. No world
model pack is rebuilt by this pipeline.

To regenerate on macOS:

1. `node scripts/prepare-van-icon-model.mjs` if the canonical vehicle changes.
2. First run `node scripts/export-van-icon.mjs --study` for matched raw/acquired
   weather, lightning and actual-size stills without changing production files.
   Then use `node scripts/export-van-icon.mjs` after visual review. Its fresh isolated Vite server uses an
   ephemeral port and temporary dependency cache. Chrome is always muted;
   both close after export. It never loads the game or requests a microphone.
   `VAN_ICON_STUDY_URL` is an optional explicit server override. The full
   browser stage clock must match the exporter to reject stale cached code.
3. Inspect matched frames, including actual 128/256px output, dark/light
   backgrounds, transparent edges and the late illumination. Atlas tiles render
   directly at 256px; static ICNS/ICO/Store sizes each receive their own final
   resolution acquisition, not resized 1024px marks.
4. `node scripts/export-van-icon.mjs --startup` records the app's 42-frame van
   loop at 128 px through the same shader. The export retains its source PNG
   atlas and uses FFmpeg with libx264 to make the silent runtime MP4. The video
   budget is 128 KiB.
5. `node scripts/build-app-icons.mjs`. This uses Apple's `iconutil`, requiring
   normal host access. It verifies and consumes those per-size shader renders,
   then writes ICNS, ICO, desktop PNG sizes and Dock resources.
   `node scripts/build-startup-van-assets.mjs` can package only the app widget,
   without changing or regenerating any native icon.
6. `node --test test/app-icon-dock.spec.mjs test/startup-van-assets.spec.mjs`.
7. `node scripts/build-van-icon-review.mjs` makes a silent VP9 review directly
   from the exported atlas, using CPU processing only. It also mirrors the
   durable renderer and source to `artifacts/van-icon-study/`.

`assets/brand/app-icon-manifest.json` records the final packaged hashes. Small
16–32px versions clear sub-3% alpha fringe and preserve minimum tail-lamp pixel
coverage at positions measured from the master. The source ear PNG and ICNS are
never overwritten.

`assets/brand/app-icon-startup.json` owns the app-only source manifest;
`public/app-icon/van-startup.mp4`, `van-startup-poster.png` and `van-startup.json`
are the runtime files. The van drives into frame, brakes, and leaves before
the video loops. Its stage list times the first pass of game startup audio.
The game takes over as soon as boot and the first frame are ready. Reduced
Motion shows the parked image. The app video uses the reduced-flash render.
stream. Native Dock visibility and unfamiliar-viewer acceptance require
separate inspection.
