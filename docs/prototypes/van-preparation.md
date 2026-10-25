# Van preparation

The van offers an open, already-filled field case. The ordinary route through
the workbench is one explicit **TAKE CASE** action: accept its offered equipment
and visible shift order, acknowledge the save, close the van and resume play.
There is no required pickup checklist, equipment page, Review screen, separate
shift-confirmation detour or departure conversation.

Opening, browsing and examining the offer grant nothing and perform no save.
Equipment changes, finishes, the shift order, shelf notes and the spanner remain
optional physical interactions before taking the case.

## Ownership and progression contract

- New preparation runs retain `van.preparation.v1`, `van.bench.v2` and
  `van.difficulty.pending`. `offeredVanPreparation` derives a presentation of the
  included case, survey indicator and four hardware families without changing
  the underlying save. An offered object is not already acquired.
- Empty hardware bays are offered as neutral Reference equipment. Existing
  packed alternatives, cosmetics and legacy run rules are preserved. Unlocked
  appearance still resolves against the current profile; the offer grants no
  ending, finish, item or difficulty unlock.
- The physical shift order displays the accepted draft, or the allowed saved
  preference when no draft exists, with CONTRACT as its fallback. Changing that
  order is optional. Explicit shift confirmation saves a revisable draft and
  returns to the bench; it does not start the run or take the case.
- TAKE CASE calls `prepareVanCaseTake` against current state. One complete owner
  patch includes case ownership, the survey indicator, four packed groups and
  the current visible order. A pending preparation run finalizes its initial
  rules/integrity and publishes `RUN_STARTED` once. An already-finalized or
  legacy run retains its identity and rules.
- Departure waits for queued save/profile acknowledgment and scoped authoritative
  readback. A pending action cannot double-fire. Failure shows RETRY SAVE and
  keeps the van open. Retrying a requested take completes that same departure
  after persistence succeeds; it must not award or publish another run start.
- On acknowledged TAKE CASE, the workbench closes and `shutTheVan` begins the
  existing physical door swing directly. There is no mandatory `van-kit`
  thought, review or second leave confirmation. The latch sound and lamp removal
  remain tied to the leaves landing, rather than to the start of the swing.
- The guard and map acquisition firewalls remain intact. Player-facing plans,
  marks and minimap require actual acquisition, not the uncommitted offer.

## Optional actions

The full-width bench is the inventory. Selecting an actual model opens one
small action surface attached to that object. Hover and keyboard focus do not
replace a deliberate selection. No category tabs, duplicate option lists,
progress dashboard, parallel case manifest or preparation modes are present.

- Hardware uses a named SWAP action. The previous item returns to its tray and
  the chosen model occupies its case bay. The existing equipment effects apply.
- Faceplates are handled on their physical rack. Recorder button/phosphor
  controls and flashlight shell choices stay attached to the relevant object.
  Choosing a sample previews it; FIT commits it. WITNESS retains its existing
  ending visibility and ownership rules. Its inspection is read-only.
- An explicit Swap, Fit or PUT IN CASE action can save the offered contents and
  selected change as a partial preparation before TAKE CASE. It does not finalize
  the shift or close the van. Browsing or backing out never performs that write.
- The spanner is optional and uses an explicit PUT IN CASE action instead of a
  required Yes/No prompt. This saves actual plant-incident ownership. Leaving it
  on the shelf is not a missing preparation task.
- The physical work order offers CHANGE SHIFT and READ NOTES. Shelf lore and
  badge/work-order choices remain available through the optional notes tree.
  Its leave branch returns to the bench; reading or cancelling never shoulders
  the case or closes the van.
- Examination and returning from an inspector do not fit equipment. Back closes
  the current object action surface, then returns to the yard when no object is
  selected. Already acknowledged optional changes remain saved.

## Hardware

Reference equipment has no modifiers. All combinations use the same allowlisted
catalog in `src/game/field-kit.js`; arbitrary saved effects are discarded.

| Fitting | Benefit | Cost |
| --- | --- | --- |
| Closed-back headphones | Monitor +15% | Surroundings −10% while listening |
| Open-back headphones | Surroundings +10% while listening | Monitor −15% |
| Directional microphone | Incidental recording noise −15% | Clean takes +10% longer |
| Wide-field microphone | Clean takes −10% shorter | Incidental recording noise +15% |
| Low-draw amp | Field-cell drain −15% | Overload margin −10% |
| High-headroom amp | Overload margin +10% | Field-cell drain +15% |
| Long-throw flashlight | Reach +25%, narrower beam | Light drain +20% |
| Inspection flashlight | Wider beam, light drain −10% | Reach −25% |

Headphone changes are output-side only. Microphone fitting changes recorder
contamination, not acoustic emissions or what HUSH hears. Recorder headroom can
therefore save a take from a noise which still attracts something. Take duration
is latched on rolling and stored with the take; playback markers and discrete
events use that duration. The fixed level-check lesson is unaffected.

Amp and flashlight battery factors multiply, including combat torch expenditure;
the practice fight's house equipment remains neutral. Lens geometry composes
before HUSH/Source interference and does not override their authored failures.
The persisted `fieldKit.recorder` key selects the amp for save compatibility;
the physical recorder remains a separate device.

Faceplate, plastic-key sets, VFD phosphor, and flashlight housing are cosmetic. Accessibility display
overrides retain priority. Fictional hardware never changes microphone consent,
physical device selection, calibration, or user volume settings.

## Physical equipment and rendering

The field case, DA–1000 recorder, AUDIOCORP SI–1 Survey Indicator, headphones,
microphone, radio and light use their existing independent GLBs. Headphones,
microphones, amplifiers, flashlights and standard faceplates retain their own
alternative models. Offered Reference equipment is visibly in the open case;
replacements remain on the labelled trays. The recorder uses its existing live
under-glass readout and physical cover.

The scene-local Three renderer runs both its bench and component-detail paths
through `createTransparentPixelMesh`, which uses the same `PIXEL_MESH_FRAG`
source as the game. This is the shared pixel-mesh acquisition pass, not a fake
noise overlay and not the entire world lens/post-processing stack. The stage
keeps the existing renderer instance and disposes the acquisition resources on
exit. Printed physical labels enter that pass with the models; minimal action
labels are drawn afterward for legibility.

The game's display/settings authority supplies the profile, screen, cell size
and reduced-motion/reduced-flash preferences. Marks are acquired at the actual
output pixel resolution, with screen offset and DPR handled once; source geometry
may be bounded separately. Bench and detail use this same mapping. Do not infer
native readability, complete shader parity or performance from source wiring.

The stage caches settled frames, caps moving-frame work, suspends while a child
inspection or shift selector owns input, and releases GPU resources on exit.
Physical objects have one semantic keyboard navigation hierarchy alongside
pointer picking; there is no duplicate text equipment menu.

Regenerate original kit, WITNESS and bench-stock assets with
`npm run assets:van-kit`. Prefer narrow targets, such as
`-- --only=amp-headroom,flashlight-throw`. The builder does not overwrite the old
composite `recorder.glb` or unrelated item manifest. The independent Survey
Indicator uses `node scripts/build-item-models.mjs --only=map`.

## Verification boundaries

This direct-case contract supersedes the earlier Preparation / Equipment /
Appearance / Review structure. Its native screenshots, videos, counts and proof
scripts cannot establish this version's behavior merely because files still
exist. Update selectors and assertions rather than preserving the old flow with
compatibility actions.

Required source coverage: opening/Back/inspection perform zero writes; an offered
case does not acquire its map; one Take preserves customized partial bays and
current allowed order; optional Swap/Fit and notes have their exact consequences;
failed save/retry cannot duplicate finalization or depart early; legacy rules
and unlocks survive; pointer and keyboard share named actions; the physical
bench and detail use the shared pixel-mesh pass and current display settings.

Native acceptance must use the final assets and source: inspect the dithered
bench, optional object changes, direct Take, door landing, actual saved state
and resumed walking. Human first-use comprehension, physical mouse-look and
actual OS-focus recovery remain separate checks. The direct version now has a
2026-10-25 native ready-case take: one confirmation, acknowledged acquisition
and finalization, physical door landing and resumed walking. Fourteen checks
against native snapshots and actual post-quit save/profile files pass; the
focused source batch passes 135 checks. The isolated QA profile is restored.
This does not establish first-time comprehension, physical mouse-look, actual
OS-focus recovery, native compact/WITNESS behavior, injected native save failure
or fresh reload for this version. Do not carry forward the previous pass's
native acceptance claims or test totals.

Earlier tools such as `verify-van-opening.mjs`, `verify-physical-bench-live.mjs`
and prior component hosts describe previous interaction structures. They are
historical aids until adapted to this contract. A disposable component adapter
cannot establish authoritative native persistence or player comprehension.
