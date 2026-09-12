# Van preparation

The opening has three essentials: collect the field case, collect
the AUDIOCORP SI–1 Survey Indicator, and confirm a shift. Then explicitly pack
headphones, microphone, amplifier, and flashlight. Fitting follows the
player's taste and preferred trade-offs; it does not silently pick a difficulty.

## Progression contract

- New runs enter the yard with `van.preparation.v1`, `van.bench.v2`, and
  `van.difficulty.pending`. The old pre-arrival difficulty screen is gone.
- Each pickup saves immediately. Back, inspection, and reload never grant a
  missing item or confirm a shift.
- The shift sheet saves a revisable draft. Packing finalizes the initial rules
  and integrity once, preserves run identity, and publishes one `RUN_STARTED`.
- The spanner is an optional physical workbench choice, with a separate Yes/No
  prompt defaulting to No. It is never required for departure; Yes saves actual
  plant-incident ownership. The later dialogue does not ask again.
- Lore and the remaining badge/work-order branches follow fitting. Choosing to
  leave starts the physical door animation. Its latch sounds at landing, not
  at the start of the swing. No second interaction is required.
- The guard will not hand over the building while a new preparation run is
  unfinished. Older bag-owning saves retain their existing equipment and rules.
- The map's player-facing plan, marks, and minimap require acquisition. Internal
  geometry and story guidance remain available for the opening and simulation.

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

## Physical equipment

The workbench composites one scene-local PBR renderer into the game's normal
input/UI scene. The field case, DA–1000 recorder, SI–1, headphones, microphone,
radio, and light are independent GLBs. Headphone and microphone alternatives
have their own geometry files, as do all three amplifiers, all three flashlights,
and the three standard replacement faceplates. All alternatives coexist in
labeled trays. The case lid stays shut until acquisition; the case, uncollected
map, and unsigned form have soft edge glows. Opening the case packs its fixed
recorder and radio, not the default hardware choices. Selecting an item puts it
in a real case bay; a replacement returns the previous model to its tray. Fitted
faceplates mount on the recorder instead. The spanner uses the accessory bay.
Objects remain separately inspectable from the workbench and
carried inventory. The recorder's live under-glass texture uses the same native
readout painter as the playing interface, with its own physical cover above it.

The stage caches settled frames, caps resolution and moving-frame rate, suspends
under inspection/shift selection, and releases its GPU resources on exit.
Acquisition and fitting also have keyboard/text controls so a failed model load
does not strand progression.

Regenerate the original kit, WITNESS, and bench-stock assets with
`npm run assets:van-kit`. Prefer a narrow target list when changing a model,
for example `-- --only=amp-headroom,flashlight-throw`. The builder does not overwrite the older composite
`recorder.glb` or the unrelated item manifest. The independent Survey Indicator
uses `node scripts/build-item-models.mjs --only=map`.

## Verification

`tools/chunk_surfer/verify-van-opening.mjs` exercises the production opening in an
isolated browser profile. It warps position to the actual van interaction target,
then uses E, real controls, and real save/reload. It is not a claim of a native
desktop, controller-device, full walking route, or audio-perception playthrough.

The workbench and recorder cosmetic proof scripts exercise their production
renderers separately. Pure and VM integration tests cover gating, finalization,
legacy migration, equipment effects, and door timing.

The physical-bench acceptance is
`tools/chunk_surfer/verify-physical-bench-live.mjs`: actual production van entry,
closed-case inspection, No/Yes spanner input, all four packing groups, amp and
flashlight replacement, faceplate/shell selection, reopen persistence, compact
layout, finalization, and selected carried-light inspection. Boot/tutorial and
the final Bag prerequisites are explicitly seeded, not presented as a full
playthrough. Captures and results are in `artifacts/physical-bench/live/`.
`verify-workbench-catalog.mjs` covers the isolated stage at normal, compact and
Retina scales, and `verify-kit-inspection.mjs` covers cached ordinary-recorder
cosmetics, flashlight housing, and closed-case framing.
