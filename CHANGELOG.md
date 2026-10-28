# Changelog

Notable changes per release. The GitHub release notes for a tag are read from
the matching section below, so a tag without one will not pass preflight.

The 0.1.x betas were not sectioned here; see the git history for those.

## 0.3.0

- Local debug dialogue review: god-menu toggle, Shift-click editing of dialogue,
  thoughts and battle lines, independent picker/spoken strings, persistent local
  edits, review flags and JSON export. Unavailable in ordinary release builds.

### Distribution

- Standard desktop releases use the authored renderer without a bundled Stable
  Diffusion service, chunk-lens executable, Python environment, model weights,
  or CUDA runtime. Production URL flags and saved settings cannot enable SD.
- Supported release targets remain macOS Apple Silicon DMG, Windows x64
  portable ZIP, and Linux x64 AppImage and Debian packages. The existing beta
  storefront channels and unsigned-build notices remain in use.
- Packaging validates the shipped payload for accidental SD content. Optional
  local SD development tools stay separate from the release pipeline.

### Source and world

- Source continues through the false Ellery return, Earthfall, Wrong Return and
  the overhead Catch, retaining the original onward route and voluntary Contact.
- Source materials now carry the cyanotype blueprint treatment through the real
  gameplay recording renderer. Existing supports, depth and occlusion remain
  physical; instrument surfaces retain their own material identities.
- The Catch's counterweight begins after restored agency and keeps its physical
  return cycle. Capture, landing and recovery discard stale held movement;
  interrupted terminal crossings resume their original destination.
- Source IV keeps its ending-owned aftermath and deliberate far-door crossing,
  with an existing giant piano placed over the ordinary walkable route.
- The conservatory's Standing Tear develops the Surfer's first confinement
  through moving architecture and spatialised musical memories.
- Pub furniture has fitted shelf stock, joined chairs and tables, and a grounded
  bar rail. Service visibly transfers glasses between tray and tables; patrons
  have supported seats and distinct drinking, polishing and listening motions.
- Stair landing signs have worn, attached mounting boards at readable heights;
  waiting areas gain supported sofas and wall-backed portraits. Main stair
  camera placement now follows the actual tread centres in both directions.
- Defeat recovery removes only its own presentation scene, including when its
  completion callback arrives after the watchdog.
- Pub life, Iona's favors and the optional Source pub, academic-floor populations,
  roof and vigil scenes, world lettering, journals and physical field preparation
  expand the existing authored experience.
- Telephone story calls arrive for the player to answer, and the physical booth,
  receiver and recording sequence share the game's world presentation.

### Release validation

- The full npm suite, authoring/media build and native packaging checks are
  release gates. Cross-platform binaries and publication are verified separately
  from local source checks; this entry records the prepared release, not a claim
  that storefront uploads have already happened.

## 0.2.1-beta.1
### Release notes
- Version sync completed for package, tauri, and cargo metadata.
- Windows release pipeline prepared.
- In-flight test failures are deferred; resolve them in a dedicated follow-up pass.
- Standard desktop packaging no longer includes Stable Diffusion, the chunk-lens
  sidecar, Python runtime, or model weights. The authored renderer is always usable.
- Local SD experimentation remains available through `npm run play:latest -- --sd`.
- Release preflight and portable packaging now reject accidental SD payloads.


## 0.2.0

First release since v0.1.2-beta.3, and still a beta: the itch channels remain
`win-beta`, `mac-arm64-beta`, `linux-appimage-beta` and `linux-deb-beta`, and
the desktop builds remain unsigned.

### Added

- **The opening is a walk.** Launch now plays as road → lodge → yard → grey door
  → title, rather than dropping straight into the menu, and the camera behind
  the title and menu is the live world.
- **Source space and the hush adversary.** The hush has an implementation of its
  own, and source space was refactored around it.
- **HORIZON.** An entry transport puzzle with its own tape, bust and score.
- **Endings.** Twelve authored endings and epilogues — surfaced, helped,
  sacrifice, inversion, drugged, contact won/lost, tower won/lost, and the
  arrival failures — behind a declared endings contract.
- **The loose windows.** Compositions of real OS windows that leave the game and
  stand on the desktop for the title, a death, an ending, and the aperture and
  sector beats.
- **A spiral main stair**, on real helical geometry rather than a straight run,
  and eight one-cell seams onto the chapel landings.
- **Rugs and carpets**, on CC0 Poly Haven textiles, as the only soft ground in
  the building — and the only thing that quiets a footfall.
- **Radio guidance**, including a hush/rupture help layer.
- **A christmas-tree microgame** on the heating plant header, and the apparition
  it reveals.

### Changed

- **The front end is printed, not lit.** The composite behind the opening and
  the menu is graded to the reference stack — inverted, curved, and screened by
  the renderer's own dither rather than a second halftone. The grade is measured
  off the plate's own black and white points, not a nominal full scale.
- **The loose windows are one instrument.** The media surfaces run a 16-bit look
  — a nine-step ramp dithered between its steps and again into a 5/6/5 grid — on
  a pixel lattice anchored in desktop points, so the cells line up across every
  window. While the opening and menu are up they wear the front end's plate
  instead of their own violet.
- **Paper is readable.** 12pt body and 16pt headings on vendored faces, one
  derived rule pitch instead of nine hand-typed ones, and a fit-width reading
  view for documents the object framing cannot make legible.
- **The map is the page.** The bag's map is full-bleed with the floors drawn as
  a stack in perspective; the waypoint verb sits on the selected room, and
  recordable rooms are marked as such.
- **Concert hall lighting and the outside sprawl** were reworked; the hall is
  one ramp and its light carries meaning.
- **Combat tuning.** A perfect counter no longer deletes the enemy's turn.
- **THE HUSH** title corruption is more frequent.

### Fixed

- Restarting a run from source space no longer starts you back in source space.
- Movement keys work again after enabling mouse look — both movement branches
  called `preventDefault()` before the fallback handler, and the input manager
  refuses events already defaulted.
- The pointer no longer escapes the window during mouse look; confinement now
  keeps the edge recentre that is the only real confinement on macOS.
- The main window keeps its native title bar when a run starts. Leaving
  fullscreen now restores the mode that was actually left.
- Apparition tuning, bust dialogue, puzzle and build-dependency fixes.

### Known issues

- Desktop builds are unsigned and not notarized.
- Signing, notarization and Steam automation remain open; see `STORE_PREP.md`.

## 0.1.0

- Extracted Chunk Surfer from `cbassuarez.github.io` into a standalone repository.
- Added a Tauri v2 desktop shell for macOS, Windows, and Linux.
- Kept the browser/Vite build path active.
- Added CI and desktop release workflow scaffolding.
