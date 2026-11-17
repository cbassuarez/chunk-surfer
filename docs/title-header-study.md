# CASE SELECT header study

Quiet carrier is implemented in the normal title scene. The other two compositions remain in the review tool.

The original header divides attention between a small title, a location strip driven by audio, a tagline, a profile sentence and action help. The final alternatives reduce the illuminated copy to the title and one short action line. An active run selects Continue, so its line becomes “CONTINUE THE NIGHT.” First-night and filed-return profiles both begin with “START A NEW NIGHT.” History remains available through the existing menu.

## The three compositions

- **Quiet carrier:** a broad title suspended in the dark glass, then one action line. The existing bezel meter remains live. Recommended: the title has room to establish the game’s identity without a second large instrument competing with it.
- **Wideband:** a left-aligned title above a wide output-level meter, with the action at the lower left. The meter uses the actual production RMS/peak signal and its existing dB scale.
- **Stacked signal:** CHUNK and SURFER occupy two large centered rows. A short signal strip separates the wordmark from the action. Internal renderer id: `split-register`.

The 5×7 ROM, character aspect, amber palette, dormant dots, cached emission and cover-glass pass are unchanged. Scaled word origins and character advances align to framebuffer pixels. The lower menu still starts at `body.y + 12`.

## Material inspected

Production sources: `vfd-font.js`, `atlas.js`, `ui.js`, `presentation.js`, `palette.js`, `meter.js`, the title scene and the program-output monitor. Captures include the UI framebuffer, the panel before its glass pass, and the game’s composed output.

Primary hardware references:

- [Original Akai AM-M5/M7 service manual](https://retronik.silicium.org/DOCUMENTS/Audiovideo/Akai/Akai-AM-M5-M7-Service-Manual.pdf#page=44): cover, front-panel drawings and uncovered FL display/PCB photographs were inspected. These support separating the principal readout, smaller signal elements and printed hardware. The composition choices are an interpretation; the game retains its own ROM.
- [Original Akai HX-M5 service manual, principal parts](https://www.manualslib.com/manual/3658220/Akai-Hx-M5.html?page=9): the FL display and hardware control locations were consulted.
- [Original Hitachi advertisement in High Fidelity, July 1983](https://device.report/m/b40e62b6ce4c9ee5394f442d860efad3fa583985c504ea7dbf720c9a98199050.pdf#page=95): manufacturer text was accessible; the colour plate could not be inspected reliably. It was not used to recalibrate phosphor or glass.

## Collected evidence

The live capture tool substitutes only the header callback inside the actual title scene’s `withMachinePanel` call. It pins one measured program-bus sample and the optical clock, so background, signal, brightness and scale match across the alternatives and current header. Three profile states were captured. Native PNGs and source hashes are in `artifacts/title-header-study/live/`.

The layout test checks every supported window preset and UI scale, at DPR 1 and 2, for bounds, core overlap, pixel origins/advances and ROM coverage. The browser check renders 288 window/scale/DPR/direction combinations. It also compares the lower-menu pixels with the current header. Existing glow-cache rounding can change a few RGB values by one byte at UI 150%/DPR 2; opacity and geometry do not change.

Native captures at the minimum, design and large sizes were inspected for clipped dots, merged rows and glow separation. These are renderer checks and author inspection, not unfamiliar-player reading results.

The implemented title was also checked in the running game without any header substitution, including its first frame and empty, saved-night and filed-return profiles. Its display well matches the approved captures within three RGB bytes of glow rounding, with identical alpha. Keyboard selection updates the action and restores the identical header when moved back. No browser errors were observed. Captures and results are in `artifacts/title-header-implemented/`. The focused title/menu tests, 10,080 layout cases and production bundle build pass.

## Blind reading test — outstanding

Use eight unfamiliar players, randomly split between the original header and Quiet carrier. Show the full menu at native size for five seconds without direction labels. Ask for the game title and what Enter will do. Then show the saved-night state with the treatments exchanged and ask whether Enter resumes or replaces the night. Record errors and time to identify the action. A useful result preserves action/save comprehension while improving first-exposure title reading. This small test is directional; mixed results require further testing. No participant results have been collected.

## Reproduction and implementation

Run `node tools/chunk_surfer/title-header-study.mjs --live` for game captures, and `node tools/chunk_surfer/title-header-study.mjs --qa` for the display matrix. Run `node test/title-header-directions.spec.mjs` for layout checks.

The title calls `drawTitleHeaderDirection('quiet-carrier', …)` inside `withMachinePanel`, passing the current body and selected item. The drawing remains before the cover glass. Menu hit regions and actions keep their existing coordinates. The review tool’s `current` option now renders this implementation; the original baseline remains in the earlier captures.
