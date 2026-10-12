# Source arrival — final live evidence

`final/` is the corrected-state capture set. Run against the development server:

```sh
SOURCE_ARRIVAL_URL=http://127.0.0.1:5296 node tools/chunk_surfer/verify-source-arrival-live.mjs
```

The harness seeds the authored still-sheet encounter, then uses real E and W input. Camera aim is set through the review probe; player position, portal state and room geometry are not warped during the measured sequence. The default run applies no diagnostic look or exposure overrides.

Verified in `final/report.json` (three checks, no JavaScript or shader errors):

- The sheet opens and lowers onto the same physical rear-aperture position: `(-1.5, -210)` in half-meter cells.
- E opens the existing FOH leaf without moving the body or admitting the red emergency wash into Scene Dock.
- W walks through the aperture at `x=5.5` into the white approach; final position `(5.5, -247)`, white exposure `0.92`.

Useful captures:

- `03-scene-dock-arrival.png`: actual view on lowering the page, with neutral gameplay exposure and a normal carried torch.
- `06-foh-closed.png`: closed leaf illuminated by its local work light; readable **[E] OPEN DOOR**. The torch is off here to verify the practical independently.
- `07-foh-opening.png` / `08-foh-open.png`: real hinged opening and threshold exposure.
- `09-white-approach.png`: first physical step into nothingness.

Raw `-props`, `-scene` and `-vfd` captures plus camera, cells, lighting and loaded-prop submission evidence are retained for diagnosis. Scene Dock submits the existing 17 room/door instances, not replacement geometry. The rear-aperture snapshot shows front-end inversion and exposure amount both at zero. The separate work light is filtered out after leaving the dock; Source proper keeps its authored emergency lighting.

Earlier investigation and failed harness-steering captures were moved outside the repository to `/private/tmp/source-arrival-debug-xMT8CT`; this folder contains only the final passing run. Evidence covers local desktop Chrome/WebGL visuals and synthetic keyboard input, not native external-window behavior, perceived audio, a complete playthrough from the title, or deployment.
