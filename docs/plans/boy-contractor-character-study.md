# Boy and contractor character study

October 12, 2026. **Selected: Listening Pair clothing (2), Held Between Takes movement (3), with the boy's face absent.** The contractor remains an unidentified ordinary human. The selected hybrid is being installed in the actual circuit; the original comparison below records the alternatives rather than an open decision.

The boy retains hair, ears, outer head and jaw around a recessed dark opening. Facial triangles and eyes are removed; an opaque rear closes the cavity inside the skull. This uses [the faceless ending image](https://squallsdead.com/img/endshot8.jpg) as a visual reference only. It adds no explanation, injury, reveal or confirmed identity to the story.

This document concerns the boy, the working contractor and their shared recorder. It preserves the concurrent five-stage recordist circuit and the selected **Quiet Threshold** presentation described in [the circuit brief](/Users/seb/chunk-surfer/docs/plans/recordist-circuit-follow-up.md). It does not redesign those worlds, change their mechanics or include the separate guard second pass.

## Story and identity contract

The current circuit passes through the school hall, tape field, dead broadcast and ash-buried Ellery, then returns to the changed school hall. These are distinct stage-local worlds, with forward and reverse physical thresholds, saved poses and receipts: [layout](/Users/seb/chunk-surfer/src/data/tower-personal-journey.js:28), [controller](/Users/seb/chunk-surfer/src/game/tower-personal-journey.js:127). Character work must fit this longer circuit, rather than revive the superseded compact hall and workroom.

The following requirements apply to every option:

- The boy reads as **nine or ten**, with an absent face framed by hair and outer head, waiting with his hands in his lap. He is not confirmed to be the player as a child. Do not introduce a matching scar, face, garment, gesture or caption that resolves that identity.
- The contractor's identity remains **unresolved**, as chosen by the user. Do not identify them as Alan, the player, a parent or a named historical recordist. Give them an ordinary human face. Profile, headphones and concentration can leave recognition unforced; masks, missing features and supernatural skin would change the question.
- The working contractor wears headphones and keeps working. The **raincoat belongs over the chair**, visibly separate from their working clothes. Preserve this staging from the earlier scene text even where the current rewrite or placeholder geometry omits it.
- The returning hall is the same hall. Keep the child's chair, its position, characteristic wear, the boy's seated root, the lead and the lamps fixed. A new actor mesh must not move the chair to improve a selected camera view.
- In the four-second handover, one adult hand supports the recorder while the other clears its strap. The child takes the load **before the adult releases**. Shared support must be visible, not implied by two bodies standing near a moving object.
- Keep free walking and looking throughout. Do not force a camera, require a receive button or punish looking away. Preparation sound, the lasting changed arrangement and the recoverable recording carry the event if the player misses the instant of transfer.
- Use one consistent DA1000 geometry, dimensions and wear pattern across its appearances. The transfer uses one independent machine instance, with continuous placement and orientation; it must not switch between a hand-held copy and a lap copy.
- Nine audible seconds near the working recordist earn the recording. The fixed recording is fourteen seconds long. These are separate from the four-second handover and six-second furnishing dissolution. Preserve the same PCM, saved listening and pause behavior.
- The floor and lit exit survive the dissolution indefinitely. Character disappearance, collision and inspection must agree. There is no escape countdown.

The current narrative establishes the boy's age, waiting and load-sharing order in [the story data](/Users/seb/chunk-surfer/content/narrative/source-space.door-field.story.json). The timing constants are explicit in [the layout](/Users/seb/chunk-surfer/src/data/tower-personal-journey.js:72). Identity ambiguity is a deliberate production constraint, not an invitation to add hidden recognition cues.

## Three character and performance directions

| Direction | Boy | Contractor | Physical relationship | Principal effect |
| --- | --- | --- | --- | --- |
| **1. Work and Waiting** | Navy school knit, soft grey trousers, a creased pale collar, socks and scuffed ordinary shoes. Relaxed seated shoulders; small hands held ready in the lap. | Sturdy, ordinary adult workwear in tobacco, charcoal and grey; practical seams, worn cuffs and reliable shoes. Heavy raincoat draped over the working chair. | Adult stands with soft knees and bends at the hips beside the fixed chair. The boy lifts both palms; a small wrist dip and recovery makes the load legible. | Professional care interrupts a long, ordinary wait. The scene earns its strangeness through recurrence rather than costume. |
| **2. Listening Pair** | Moss or muted ochre knit, slightly loose sleeves and a gently asymmetric seated posture. | Pale workshirt with rolled cuffs, dark waistcoat and practical trousers. The separate raincoat has a readable wet hem and folded shoulders. | Adult lowers onto one knee beside the chair. The child leans forward to receive; one adult palm remains underneath while the other guides the strap clear of the child's wrist. | Shared attention to the machine makes the handover intimate without establishing family or personal recognition. |
| **3. Held Between Takes** | More upright posture, pale collar and dark knit; restrained, deliberate hands. | Tall, lean adult in graphite workwear, with clear cuffs and seams, headphones and a substantial chair-draped coat. | Adult stands in three-quarter profile, one foot forward. The offer follows a short deliberate arc, pauses under shared load, then settles into an ordinary asymmetric rest. | The precise pause echoes the recorded take. Surreality resides in timing and the repeated hall, not in an inhuman body. |

The standing bend, retained from **Held Between Takes**, works because its standing bend leaves the machine and both sets of hands visible from several walking positions. It makes the adult's support easy to understand without turning the transfer into a presentation. Model soft cloth compression at the knees and elbows, the child's narrower wrists and actual finger contact; avoid enlarging the head or hands simply to make a distant silhouette cute.

**Listening Pair** should earn its distinction through genuine lowering and shared eye-line to the machine. The adult's planted foot, knee and trouser folds need a believable load path. Keep the crouch offset from the chair and circulation; it must not form a wall across the aisle. Do not add a comforting touch, smile of recognition or parental framing absent from the story.

**Held Between Takes** needs the most restraint. The held moment is a short shared-load interval, not a frozen statue or uncanny synchronized gesture. Keep breath, weight asymmetry and a small recovery visible. An ordinary face remains inspectable from the side; the figure does not continuously turn away from the player.

These are costume, anatomy and performance alternatives. All three retain the same narrative, fixed chair, machine, contact order, supported floor, controls and save behavior. The selected hybrid uses option 2 clothing, option 3 standing transfer and the explicit faceless-child correction.

## Shared physical authoring

The four-second performance should have a single saved simulation phase. The installed timing pass is below. The near adult hand begins clearing the loose strap late in the shared-load interval.

| Time | Action | Required contact |
| --- | --- | --- |
| 0–0.48 s | Preparation: a clothing sound, a slight bend or lowering, the child's attention moving to the object. | Adult supports the machine; the child begins from the established lap pose. |
| 0.48–1.56 s | Offer and reach. | Adult underbody support remains stable; the other hand keeps the strap away from the receiving fingers. |
| 1.56–3.04 s | Shared load. | Child palms meet actual support points. A small wrist and forearm response conveys weight before adult support diminishes. |
| 3.04–4.0 s | Release, strap clearance and settling. | Adult fingers separate after child support is secure. The machine settles into supported hands or lap, then remains there. |

Author a single recorder root with named underbody grip points, strap attachments, handle and cable socket. Solve hands to those contacts; do not independently animate a machine path and hope the hands coincide. Bake or evaluate all transforms from the same phase so reload, pause and reduced motion preserve the same contact state. A reduced-motion version may remove secondary sway and head movement; it still needs the essential reach, shared support and release.

The strap needs slack, attachment and collision-aware clearance through the offer. It cannot stay rigidly laid on the case while an adult hand supposedly lifts it. Decide which headphone lead is connected, where its plug lives, where the slack rests and whether the contractor remains connected during the return. Keep that decision continuous rather than letting a cable vanish at a pose change. The long magnetic-tape continuity strand is a different object from the headphone lead and recorder shoulder strap.

Keep the fourteen-second recording's material identity intact. Its cloth, chair, two bell notes and recorder contact should have spatial counterparts without compressing every sound into the four-second transfer. Use [the shared master](/Users/seb/chunk-surfer/src/audio/tower-personal-recording.js) and [audio-clock monitoring](/Users/seb/chunk-surfer/src/audio/tower-personal-monitor.js); new animation must not silently replace the master or award listening credit from elapsed animation time.

## Production implementation

- `public/assets/recordist-characters.glb` contains the two independently skinned actors and four baked clips. Both enter the shared material, dither, depth, torch and shadow renderer.
- `src/render/recordist-character-performance.js` owns the saved four-second transfer, actual limb lengths, planted feet, recorder contacts and strap phase. The shared-load interval is 1.56–3.04 seconds; release follows it. Six-second restrained seated breathing uses the saved journey clock.
- `src/render/tower-personal-worlds.js` places the fixed chair, anatomical boy, working contractor, separate desk and raincoat, and independent canonical 44cm-wide DA1000. The returning chair has the same position and wear. All returning bodies, machine, strap and chair share the existing disappearance predicate.
- The machine no longer shrinks between the working desk and handover; the later tower recess also uses the canonical size. Two modelled case scratches agree with inspection copy. The dynamic level bar sits on the real top-panel meter.
- `tools/chunk_surfer/characters/build-recordist-anatomy.py` retains model authoring, source attribution and geometry checks; `build-recordist-characters.mjs` embeds textures and bakes the same contact sampler consumed by runtime props.
- The five stage-local worlds, voluntary exploration, recorded audio and exit behavior remain owned by the existing circuit. These characters do not add a receive button or camera control.

## Research and production provenance

Use these references for bounded physical and rigging decisions. The comparison maquettes use retained MakeHuman anatomical and clothing sources, with official child macro targets downloaded into the study's own anatomy folder. Blender, already installed, produced compact weighted meshes. The selected anatomical sources now feed the production character pack through the retained Blender builder and deterministic GLB exporter. Source URLs, hashes and the preview build script are retained in `artifacts/boy-contractor-design/anatomy/`.

| Primary source | Verified scope | Application and limit |
| --- | --- | --- |
| [MakeHuman licensing](https://static.makehumancommunity.org/about/license.html) | The project distinguishes its software licenses from its core assets; core assets are CC0, while MakeHuman and MPFB source have separate copyleft licensing. | A core base mesh is a possible starting point. Record the exact source and license of each chosen mesh, garment, texture and rig; community downloads do not inherit a blanket license claim. |
| [MakeHuman body modelling](https://static.makehumancommunity.org/makehuman/docs/modeling_the_body.html) | Body controls include age, proportions, height, weight and muscle, with more local modelling controls. | Start from child proportions, then author face, shoulders, limbs and hands for a nine-to-ten-year-old reading. Shrinking an adult is insufficient; an age slider is not verified anthropometry or proof of a particular identity. |
| [Blender Child Of constraint](https://docs.blender.org/manual/en/latest/animation/constraints/relationship/child_of.html) | Constraint influence supports changes in parenting; Set Inverse preserves an object's offset when establishing the relationship. | Author a continuous recorder relationship through adult support, shared contact and child support. Preserve world transforms at the transition and bake or evaluate the result for the game's animation pipeline. Merely switching parent objects will not solve contact or double transforms. |
| [Blender inverse kinematics](https://docs.blender.org/manual/en/latest/animation/constraints/tracking/ik_solver.html) | Targets and pole targets control end-effector placement and limb bend. | Use recorder grip targets and elbow controls, with planted feet or the crouched knee appropriately constrained. Inspect wrists, fingers and cloth after solving; IK is not a substitute for a load-bearing pose. |
| [Nagra IV-S / IV-STC instruction manual](https://www.nagraaudio.com/wp-content/uploads/2020/09/Instruction-Manual-IV-STC-English.pdf), linked by [Nagra's product archive](https://www.nagraaudio.com/product/iv-stc/) | The manufacturer's manual documents portable-recorder operation, carrying cases, handles, carrying straps and headphone accessories. | Study real attachments, underbody support, strap slack and cable clearance. This is a physical field-recorder reference, **not** a claim that the fictional DA1000 is a Nagra or has the Nagra's mass, dimensions, era or exact controls. |

Choose and record the DA1000's fictional production dimensions once. Communicate its weight through the adult's bend, shared support, child wrist response and settling; do not assign it a real recorder's kilogram value without a separate design decision. Keep the familiar object recognizable through wear and repeated geometry rather than readable branding alone.

## Verification

The focused character, world, controller, audio and continuity suite passes 72 tests. The final GLB separately passes six skinning/material/clock checks; the full production build passes. A disposable-browser playthrough passes 123 live checks for entry, stage transitions, actual walking, audition, saved phases, free camera movement and transfer state, with no JavaScript or WebGL errors. Material and final dither captures are retained in `artifacts/recordist-characters/live/`. Final facial geometry has five frontal ray checks proving the closed black rear is visible ahead of any remaining skin. These are browser and authored-geometry results; no native-platform acceptance is implied.

## Production acceptance

Review the chosen candidate inside the game's actual character/material, depth, torch, lighting and shadow passes. A separate polished viewer or generic Three.js render is a design aid, not proof that it works in the game.

- Inspect first hall, working desk and returned hall at ordinary approach distances, then circle front, profile and rear at close range. Confirm the child reads as nine or ten and the adult as an ordinary working person without requiring a caption or a privileged shot.
- At every transfer phase, inspect palm contact, thumb and finger placement, wrist angle, strap slack, headphone cable, chair intersections and planted support. Check several player heights and viewpoints; do not repair one angle by breaking another.
- Compare recorder bounds and wear across desk, offered, shared-load and received states. There is no scale change, duplicate transfer object, frame of unsupported floating, sudden orientation snap or release before child contact.
- Confirm the first and returning child chair roots and wear are identical. The received pose remains legible after the performance; freely walking away does not restart it.
- Pause and reload in preparation, shared load, release and settled states. Restore the exact authoritative phase and object relationship. Hidden-window time must not advance choreography or listening evidence.
- Reduced motion retains the essential contact order. Captions and spatial preparation remain available without requiring headphones, pitch discrimination or watching a fixed direction.
- Through dissolution, rendering, collision and inspection agree; the floor and lit exit remain supported indefinitely. Character assets cannot bring their own independent disappearance timer.

The checklist describes the intended review scope; recorded results are listed above. Existing automated geometry and controller checks remain useful, but they cannot establish whether the hands look natural, the weight is felt or the ambiguity survives ordinary play.

## Follow-on character priorities

After this pair and its machine, prioritize sustained close exposure and identity continuity rather than replacing every background silhouette with a unique hero asset.

1. **Bus woman.** Review the ordinary-yard `exterior_bus_woman` and Outskirts `outskirts_bus_woman` together: [yard placement](/Users/seb/chunk-surfer/src/data/conservatory-props.js), [Outskirts arrival](/Users/seb/chunk-surfer/src/data/source-outskirts-arrival.js). Decide which appearance is a deliberate recurrence and preserve the relevant face, clothing and seated/standing relationships. Do not silently declare two appearances the same person merely because their asset labels resemble one another.
2. **Named vigil.** Ruth, Leila, Owen, Denise, Malcolm and Kit have actual world bodies as well as dialogue and portraits: [cast and approach rules](/Users/seb/chunk-surfer/src/data/exterior-vigil.js). A shared human rig with individual silhouette, clothes, carried objects and small task-specific hand actions is appropriate. Prioritize the figures with the longest close interaction before spending equally on every face.
3. **Ending bodies.** Alan, the player and the Surfer need distinct, consistent carried, prone, dragged and standing forms. Audit actual ending placements in [main](/Users/seb/chunk-surfer/src/main.js), then reuse their established anatomy and costume through those states. Do not resolve the contractor's identity by reusing a recognizable Alan or player head here.
4. **Dog walker.** The timed ambient route uses `ambient_dog_walker`: [route](/Users/seb/chunk-surfer/src/data/exterior-district.js:80), [presentation](/Users/seb/chunk-surfer/src/game/exterior-ambient.js). Separate human and dog gait, foot contact, leash slack and pauses would improve this repeated moving silhouette. It remains ambient rather than becoming a new dialogue character.
5. **Apparitions.** Improve shared human anatomy and readable ordinary poses before multiplying unique supernatural bodies: [staging](/Users/seb/chunk-surfer/src/data/apparition-staging.js). Distinguish actual world apparitions from the Hall Three combat sprites. Preserve short exposure, recording conditions and reduced-motion behavior; their ambiguity does not require blank faces.

Do not turn expressly audio-only students into visible NPCs merely to use a new rig. The separate guard second pass has its own ownership and acceptance; it is not a deliverable or completed result of this study.

## Decision and ownership

The user's selection is implemented as **2's look + 3's movement + the faceless boy**. The old comparison canvas remains a design record, including its approximate dither. Production review uses the game's actual renderer. Contractor identity remains unresolved; later cast and guard work stays outside this character pass.
