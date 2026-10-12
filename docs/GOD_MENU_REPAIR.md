# God-menu integration repair

This patch is based on the `src/` snapshot in
`0b3901a1-ac8b-4c0d-b560-2e68ec905ef9.zip`. It does not require new packages,
asset builds, or a save-schema migration. It deliberately changes developer
operations rather than relaxing gameplay recording, acquisition, or collision
rules. Developer operations still affect the active save; use a test save.

## Applying and verifying

From the repository root, with `god-menu-repair.patch` in that directory:

```sh
git apply --check god-menu-repair.patch
git apply god-menu-repair.patch
node --test test/god-menu-repair.test.mjs
```

The patch contains the regression suite and this document. It was checked with
Node 22.16.0. Run the project's normal test/build commands afterward in the full
repository. To reverse this patch before making further changes to these files:

```sh
git apply --reverse --check god-menu-repair.patch
git apply --reverse god-menu-repair.patch
```

Do not force a patch with failed context checks onto a different source revision.
Review or rebase the affected hunks instead.

## Source destinations and menu contract

OUT, BELLS, CHAPEL, and HORIZON all use the same action-row constructor:
stable `id`, display value, `activate`, and close-on-activation behavior.
`run` is rejected, not accepted as a second callback spelling. Read-only rows
are marked `kind: 'info'` and are not selectable. The full menu validates tab
and row IDs and callback shapes when opened.

Handlers may return promises. Pending actions cannot be invoked repeatedly;
closing is idempotent and failures reach the God-menu event log. The four
Source families share one preparation/activation path, serialize their review
state, and request a camera snap. Source review and facility warps cannot
race each other while asynchronous preparation is outstanding.

Source review hooks retain their existing qualified-review presets, including
returned marble-eye evidence. They are not simulations of a natural playthrough.

## Tape grants

`PB.debugSetTakes(roomIds, present, options)` is the explicit fixture boundary.
It creates sealed, accepted, counted tapes with real history/transport intervals,
current requested take duration, clean evidence, and a serialized `debug: true`
marker. The main menu supplies the authored room recording mark and place label.
The recordist projects the store, and its save carries the same tapes.

An existing accepted recording is preserved, including its contamination,
location, timestamp, guest, and transport position. Grant-all is idempotent.
Removing a room voids its historical recordings; re-granting appends a new
recording rather than erasing or rewriting the old history. Other rooms remain
unchanged. Batch validation happens before publication.

Recording, open/unsealed tapes, playback, and seeking block debug grants/removal.
The menu does not abort recording implicitly. `PB.markTake` remains strict and
never manufactures a missing recording. Granting tapes does not emit historical
recording-completion, encounter, or narrative-progression events. A tape fixture
is not a progression fixture.

`REC.setTake` delegates to the explicit debug sink when wired to the game. Its
standalone/no-sink behavior remains available for isolated labs. Custom test
sinks that exercise this developer setter must implement `debugSet`; normal
`mark` is not a substitute for record creation.

## Equipment

`createGodInventory` defines adapters over the actual state owners rather than
a new generic inventory. The Items tab includes field-case/map acquisition,
packing and fitting, all hardware models, available finishes, the rig interface,
tuning fork, plant spanner, marble-eye phases, badge, access keys, coffee owned
and consumed separately, named sheets, field-cell charge, and radio operating
state/deployment. Locked profile finishes remain locked.

The field-ready preset supplies and fits ordinary field equipment, restores
temporary equipment loss, recalls a deployed radio, and supplies at least one
cell. It does not consume coffee, grant quest objects, complete the marble-eye
quest, replay radio cues, or revive a dead radio. Those are separate controls.

Hardware changes reapply the real fitted-kit recording/audio/appearance policy.
Inventory changes synchronize relevant key, story-object, sheet, spanner, eye,
and dropped-radio props. Restoring an authored pickup does not rebuild unrelated
props or replace its contact anchor with an approximate loose-prop position.
Named sheet grants are idempotent and preserve acquisition order.

Marble-eye state selection is an explicitly reversible developer edit; normal
quest decisions remain governed by the original state machine. A plant spanner
cannot be removed from an active repair. A radio phase change is refused while
a cue or call owns the channel. Radio dropping is refused in special worlds or
while the radio is missing.

The master-key developer override and developer equipment loss are explicit
save flags. Ordinary historical `lost.*` flags are not reinterpreted as a saved
recovery location. An explicitly missing developer item stays missing until
restored in the menu. Map removal suppresses only the legacy starter-map
fallback; collecting a real map still reacquires it.

## Locations and camera

A location activation prepares the run and performs the requested warp in one
operation, including a cold boot before the world runtime has been entered.
The building-load barrier waits for all outstanding builds, so an older load
cannot overwrite the requested pose after the newer load finishes.

Targets are validated against the real floorplan and prop occupancy before a
live special world or scene-owned camera is surrendered. Invalid/unknown,
blocked, or failed-preparation requests do not call the warp commit. The belfry
review anchor moves from the bell-frame collider to the clear ring walk.

There are 22 facility location hooks: the existing 19 plus distinct concert-hall
stage, lower-balcony, and upper-balcony positions. The two balconies share
physical horizontal coordinates but keep distinct logical layer/height
addresses. Door-review hooks use the same strict resolver. Values show their
floor/component. No nearest-zone fallback or weaker collision check is used.

Successful facility warps clear obsolete scene ownership without resuming
intermediate scenes, leave special-world runtime state, clear stale motion and
ending ownership, set the complete destination pose, and persist the building
location. A one-frame renderer request snaps height, yaw offset, pitch, and lean
and clears afterimage memory. The next ordinary frame resumes the original
smoothing, including stairs. A missing GL frame does not consume the request.

Expected validation/busy/loading failures are handled before commit. This is
not a general rollback engine for arbitrary renderer exceptions or failed
external storage; such unexpected action failures are reported rather than
claimed successful.

## Developer harness compatibility

Destination operations now have asynchronous readiness semantics. Await them
before inspecting the resulting state. The four Source probe wrappers await
their presets; `testRun` and facility/door warps also return promises. Cathedral
and ending-review consumers await their destination before installing a new
scene or camera.

```js
await window.__probe.testRun();
await window.__probe.godWarpHook('hall-upper-balcony');
const snapshot = await window.__probe.horizonPreset(168);
```

## Verification boundary

The included suite runs 82 tests. It covers all 16 Source review rows; the real
menu dispatcher and full production tab construction; the production recorder
sink; real-tape preservation, removal/re-grant and save round-trips; authoritative
inventory owners and the actual bag presentation function; all 22 location and
8 door-review anchors; cold/preparation failure and concurrent transitions;
production warp teardown ordering; and the actual renderer's camera-update
portion, including preserved ordinary smoothing.

Owners and compiled geometry are imported directly. The suite evaluates the
unchanged main orchestration functions with explicit browser/audio/rendering
stand-ins. Radio fear gating and the unused Source-contact authoring registry
are isolated because the archive omits generated narrative content. These are
not full browser/native or WebGL-rendered end-to-end tests.

The supplied archive does not contain the complete project's package manifest,
existing test suite, content bundle, or assets. A full game build/playthrough and
those existing tests were not run. Final in-app checks should include opening
F10 from a cold launch, all Source families, item changes followed by reload,
basement-to-balcony warps, and warps out of Source and an ending/camera scene.
