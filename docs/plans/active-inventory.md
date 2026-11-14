# One case, four reachable items, one held object

## Working brief

Make the existing field case read and behave as an inventory. Start with actual ownership flags, physical item assets, the saved four-slot tray, ordinary commands, battle preparation, reducer availability and saved data. Reuse that authority for the visible hand and equipped positions; do not create another item list. Adopt the supplied references' equipped-view / backpack-grid / persistent-inspector structure using the recordist's existing hands and tools.

A specialist would first distinguish ownership, readiness and holding, then verify every transition between them. The raw evidence is the executing item owners and saved payloads, actual input routes, physical tool geometry and captured frames. Methods are a source-to-runtime state map, migration and loss/consumption matrices, real reducer counterexamples, shared drawing/picking geometry, bounded native input walks and matched rendering checks. Objective state invariants and unfamiliar-player interpretation provide acceptance beyond an attractive mockup.

## Reviewed decisions

- Four reachable slots govern **battle only**. Exploration can still reach a tool in the case.
- One selected reachable item appears in hand. The other reachable items remain available for battle.
- The inventory center uses existing recordist hands and the actual held tool, independent of the backpack item being browsed.
- The existing keyring, fitted hardware, documents and quest keepsakes retain their own rules. The large plant Stillson remains an externally dragged object.

Later reviewed decisions: selected keepsakes can occupy a reachable bay and be held without a combat move; inspection exposes specific physical evidence. Keep the B3 session card, Vale guarantor slip and recovered Lyle music box only through explicit choices. Existing numbered recording stock now appears in the bag. Battery cache packages remain intact until explicitly fitted, preserving the original finite amounts and legacy receipts. Patch leads project the existing skill owner. A single recoverable B2 rubber wedge can hold an eligible ordinary open acoustic door, trading an open route against sound attenuation. It cannot unlock or alter emergency, roof, authored one-way or sequence doors.

Interchangeable stock shares backpack cells through a derived stack projection. Blank cassettes retain their numbered identities; recorded and tutorial contents remain separate. Supply packages retain their individual source and charge. Member selection precedes EQUIP or FIT. Quantities are derived from owners, never a second saved counter.

Inventory copy, item labels, controls, selector legends and inspection text use the existing VFD character renderer. The case retains its physical maker’s markings. The rotation hint has its own row below the held object.

## The revision

`bagLoadout` remains the saved owner of the reachable tray. Schema 2 gives each numbered bay a stable address and adds a `heldSlot` preference. Old compact arrays migrate with their prior semantics; interior empty bays now survive assignment, removal, reordering and reload. Explicit null means lowered hands. Missing and deployed items keep their preference while actual presence controls drawing and battle availability. Consuming the cup clears its bay without moving its neighbors.

The case has equipped cards, a center hand/tool view and a backpack portrait grid with a persistent inspector. Browsing is not equipping. EQUIP assigns a bay; HOLD selects a ready item; LOWER puts the visible hand down. The same geometry owns paint, pointer contacts, grid movement and scrolling. Existing Map, Sheets, Skills and Journal presenters stay in the same case. The ordinary field strip reads the same bays; 1–4 selects one and Q/Tab cycles present ready items. Authored cameras, scenes and active transports withdraw the ordinary field presentation.

The held view reuses the existing anatomical battle hands, physical grips, tools, material lettering and dither renderer. Ordinary field lighting comes from the actual rendered torch and room ambient; inventory and battle restore their own preview lighting. The film badge reuses its retained dosimeter model. No new combat action is implied by holding it.

READY continues to commit the existing battle preparation draft. Once contact starts, the case can inspect but cannot repack or operate a second world tool behind the battle deck. Real battle commands remain the action authority; hands and bodily actions stay available with an empty tray.

## Findings and causal corrections

| Raw failure | Method | Correction |
| --- | --- | --- |
| Assigning bay 4 with one item put the new item in bay 2; removing a bay shifted later labels. | Execute the existing assignment/removal functions against sparse positions. | Schema-2 stable positions, old-schema migration and explicit empty bays. |
| Preparation compacted gaps and discarded missing/deployed reservations. | Follow the saved tray through the actual draft and READY commit. | Preserve owned reservations; null unowned entries in place; count actual readiness separately. |
| A direct SWING or ON THE STEEL command worked without a spanner even though the menu hid it. | Run the actual combat reducer with explicit absent/present tools and compare all resources. | Enforce spanner availability in the reducer. All physical-tool refusals have executable coverage. |
| A spanner-only kit was treated as unable to make progress. | Compare actual repeatable SWING availability with the stranded/recovery predicate. | Count an available SWING as progress; keep the truly bare kit's recovery behavior. No balance values changed. |
| The old case described every owned item as carried but did not show what was held. | Trace the same source item across ownership, tray, hand and combat. | Derived read model, one persisted held-slot preference and actual presence checks. |
| Bag actions could offer changes after combat had latched a different kit. | Compare the mutable bag with the immutable current battle snapshot. | Lock repacking/world tool use during contact; retain inspection and the battle's own controls. |

## Claims that can fail

1. An unfamiliar player can find an item in the grid, equip it into a chosen numbered bay, and predict which item it replaces. The bay number does not change behind their back.
2. Browsed, owned, reachable and held items are visibly distinct, and the battle receives exactly the present reachable tools at READY. A missing/deployed/consumed item never becomes a ghost object or an unauthorized action.
3. The held object belongs to the player and lighting, stays clear of the reticle and essential controls, and the inventory remains navigable at supported small windows and larger text settings.

## Validation and limits

`artifacts/active-inventory/implementation-receipt.json` records the final checks, captures and remaining acceptance. The focused inventory suites passed 133 checks. The isolated production build and lean bundle check passed. Browser replays used Chrome with Metal, the game's real input paths and declared developer checkpoints. Packaged Tauri, physical controller and unfamiliar-player acceptance remain pending.

Focused suites exercise actual loadout/migration/save owners, bag actions, grid contacts/navigation, hand geometry/lighting and combat reducers. Native evidence is prepared at `artifacts/active-inventory/verify-native.mjs`: real B, pointer and keyboard actions, 1280×800 / 960×600 / larger UI, true reload, loss/deployment fixtures and real encounter preparation/READY. Source and graphics inputs are frozen at launch. Checkpoint grants are explicitly disclosed; this is not earned progression or packaged-Tauri acceptance.

The wedge replay uses the actual B2 and B1 thresholds, ordinary movement and door controls, and autosave followed by a real reload. It measures attenuation along the same line on both crossings. The 16 dB closed-door loss drops to 0 dB while the wedge holds the door open. This measures the game's acoustic calculation. Listening acceptance remains pending.

## Unfamiliar-player acceptance: pending

Use a consenting person who has not seen this change. Give them the prepared ordinary-play checkpoint, without showing implementation notes or naming controls. Ask: “Look through your case. Put together what you would want within reach for a difficult encounter, then return to the room.” Afterward ask what was in the case, what was ready, what was actually held, and what they expect to have available in battle. Have a second observer code these answers before reading the implementation claims.

Record unassisted discovery, wrong-slot replacements, accidental use/consumption, actions that appeared available but did nothing, ability to lower/change the held object, and frustration. Then enter the actual preparation screen and compare the participant's prediction with the real tools after READY. Do not coach a correct kit or count a successful battle as proof of inventory comprehension. Retain mistakes and uncertainty. No unfamiliar human acceptance is claimed until this is run.
