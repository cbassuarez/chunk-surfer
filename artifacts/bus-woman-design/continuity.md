# Bus woman: continuity audit

Audit date: 2026-10-12. The requested deliverable is three character directions, with shared continuity corrections made before a final look is selected.

## What the game establishes

- The ordinary street woman is unnamed. She is a resident whose flat is three streets away, remembers the municipal baths where her daughter learned to swim, and returns to the discontinued number 48 stop because she can see the baths windows. Her conversation is grounded, dry and observant. The same `yard-bus-waiter` placement owns first visit and return dialogue; there is no separate return-visit model. See `src/data/exterior-lore.js` and `src/data/conservatory-props.js:645`.
- The Outskirts woman is explicitly **not Sarah**. The authored plan calls her “nobody,” a figure the road keeps. Her repeated wrong-buttoned coat and ticket task establish recurrence within the road, without a name, family revelation or identification as the ordinary resident. See `docs/plans/outskirts-losing-himself.md:57` and `content/narrative/source-space.outskirts.story.json` notes and woman nodes.
- A shared visual model across ordinary street and Outskirts is a continuity choice authorized by the present request. It need not turn that visual recurrence into a literal identity explanation. Do not import the resident's daughter into the Outskirts plot or give the woman the boy's absent face.
- Her age is not specified. Both previous generators targeted approximately 1.70 m. An older adult reading is a design interpretation supported by her history, not an established age.

## Appearance inventory

| Surface | Placement / implementation | Current behavior |
| --- | --- | --- |
| Ordinary arrival and all return visits | `yard-bus-waiter`, `exterior_bus_woman`; yard `(54.15,206.55)`, yaw 0 | Standing beside the shelter; optional conversation tree, normal personal history. |
| Outskirts passes 1–13 | Thirteen entries in `outskirtsArrivalLayout()`, all `outskirts_bus_woman` | One repeated woman per pass; the original coat and bag continue through the road. |
| Pass 2 aboard | `r1-bus-woman-aboard` | Standing inside the saloon. No dialogue focus. Corrected to the aisle on the actual bus floor. |
| Pass 8 bus gap | `r7-bus-woman`, `encounter: 'bus-close'` | Inside the transverse bus at the nose gap; sight/approach/crossing advances the saved, once-only encounter. She acknowledges the player and makes a retained 18 cm step inside the bus. |
| Unseen watchers | Current passes 6 and 11 (`r5`, `r10`) | Turn only after being seen and then looked away from; keep the remembered target heading. |
| Authored crowd / stutter / mirrored / turned variants | `outskirtsPassLayout(k, {break})` | Reuse the same mesh. These variants are supported authoring possibilities; today's deterministic schedule does **not** run them while the woman is present. Do not present them as additional current story encounters. |
| Rain reflections | Shared Outskirts render instances mirrored by the wet-road pass | No separate woman model. The reflection-only double is the player's body, not her. |
| Recorded Outskirts presentation | `preTapeInstances` supports the recorded presentation | Reuses the same instance builder and material path. This audit does not constitute a captured-recording acceptance test. |
| Late road | Lifecycle `busWoman: 12`; absent from pass 14 onward | Her disappearance is intentional. The later coat on the shelter belongs to him; it must not become her abandoned costume. |

No other named bus-woman model placements were found in source, content or prop generators. Vigil women and generic ambient pedestrians have separate authorship; resemblance is not enough to merge their identities.

## Defects found and corrected independently of selection

1. **Two incompatible baselines.** The yard used a navy coat, mustard scarf, wool cap and deep skin; Outskirts used municipal green material, a different head, no scarf or cap. The main task is unifying the two existing mesh names behind the more anatomical existing Outskirts builder, while retaining the yard's appearance cues. This is baseline continuity work, not the final selected hero model.
2. **Standing through a bus seat.** The pass-2 figure was bus-local x=.6, z=1.3, in the fourth seat column. She now stands bus-local `[0,.50,1.3]` and is attached to the actual bus placement. The pass-8 feet now also use the .50 m saloon floor rather than hovering 5 cm above it.
3. **Showing her back when meant to acknowledge the player.** The woman geometry faces local −Z; watcher and gap code aimed local +Z at the player. The family-specific watcher and gap headings now face the player with the front of the model. The regular shelter and authored crowd placements also face toward the road, with the shelter conversation anchor on that side.
4. **Returned ticket left behind.** The ticket used a static authored transform, so it stayed behind when a watcher turned or the gap woman stepped. It now uses the body's rendered parent transform. Every `bus-woman` family member, including the aboard recurrence and authored duplicate variants, gets the same returned-state prop.
5. **Ticket floating away from the hand.** Its old local position `[-.25,1.05,-.2]` was above and in front of the glove. Shared interim contact is now `[.28,.98,-.12]`, yaw .4, at the top of the current right hand. A final skinned model should supply a bone-driven contact instead of preserving this number blindly.
6. **Crowd ticket action ignored.** The physical action searched only `key === 'bus-woman'`. It now finds the current pass's `inspect === 'woman'` target, including the inspectable crowd copy.
7. **Prose contradicted aboard staging.** Two lines insisted she was at the shelter even when inspected inside the bus. They now describe the same waiting/pocket/ticket action without an incorrect location. Wrong buttons, pocket order, the right-pocket transfer, the existing reward and her unnamed identity remain.

## Contracts for each proposed final model

- Keep one source body, face, skin response, hair silhouette, garment construction and bag across ordinary world, repeated road, aboard view and wet reflection. Stable recognition should survive dither, rain, distance and flashlight changes.
- Preserve the navy/mustard/deep-skin visual lineage unless the chosen option deliberately replaces it everywhere. Current close geometry has a normal face. Do not confuse uncertain identity with featureless anatomy.
- Standing is the current authored pose everywhere. A seated study is a proposed staging change and needs a real seat contact, feet on the .50 m deck, bag support and appropriate eye-line. No current chair pose exists to preserve.
- The ordinary resident can wait and speak like a person. The repeated version's wrongness should enter through exact pose repetition, timing, pocket search, attention or coat closure. A fixed mesh cannot yet physically perform the described second pocket search or the right-pocket ticket transfer; those are genuine hero-animation requirements.
- Use physical tailoring to show the deliberately wrong closure: displaced fastening, tension, an uneven hem and a visible pocket opening. The interim generator's regular button row does not yet fulfill that line.
- Model fingers and thumb support for ticket and bag. Avoid a black cylinder hand with a detached paper quad. Bag, strap and right pocket need distinct ownership through search, receipt and waiting states.
- Preserve the voluntary dialogue and composure reward, road lifetimes, saved once-only bus encounter, free passage through the measured bus gap, and reduced-motion discrete acknowledgement. Do not add combat or punish conversation.
- Future rig clips should share one surface/dither/lighting path with other world characters. All existing static aliases already use the normal prop path; a hero pack must keep that property.

### Interim coordinate reference

- Model front: local −Z. Ordinary yard yaw 0; regular Outskirts shelter yaw +π/2 points toward the road; gap initial yaw −π/2 points through the east nose gap.
- Existing Outskirts right hand endpoint `[.28,.94,-.10]`, palm center `[.28,.915,-.10]`; carried paper `[.28,.98,-.12]`.
- Existing Outskirts bag center `[.36,.68,.03]`, dimensions `[.26,.39,.17]`, handle from `[.24,.91,.03]` to `[.36,.88,.02]`. It is embedded geometry, not an independently supported accessory.
- Previous yard bag was larger, center `[.36,.68,.05]`, dimensions `[.34,.52,.20]`, shoulder strap `[.20,1.22,.02]` to `[.42,.92,.04]`. A final design must deliberately choose one bag construction; do not let each appearance keep a different bag.

## Validation

- Seven new `test/bus-woman-continuity.spec.mjs` cases pass: inventory/variants, seat clearance, all thirteen returned-state attachments, watcher facing/attachment, close-gap facing/step, crowd physical action and spatially valid narrative.
- Existing `test/outskirts-experience.spec.mjs`, `test/outskirts-main-integration.spec.mjs` and `test/outskirts-geometry.spec.mjs` passed alongside the initial six new cases (16 passing reported tests); the additional gap test passed in the following run.
- The broad `test/source-outskirts.spec.mjs` still stops at its known unrelated `tower seed 31 bars nothing` assertion, line 196. This pass did not alter tower doors or seed generation.
- These checks prove deterministic placement, action and matrix behavior. They do not prove the quality of a new skinned bus woman, since no final design has been selected, or native desktop/recording appearance. The main task owns interim GLB parity and visual study verification.
