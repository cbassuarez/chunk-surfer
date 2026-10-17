# Bust and eyes performance design

October 12–13, 2026. **The Bronze Reliquary was selected and implemented.** The three treatments below are the selection study; the shared interaction and persistence contract remains the acceptance standard. The production asset, runtime, and actual-game captures are tracked in [the production master](/Users/seb/chunk-surfer/artifacts/bust-reliquary-production/README.md).

The implemented construction uses the retained CC0 portrait as separately closed rigid head and shoulders, sixteen joints, physical eye bores with protected shutters, and three LODs. The original stone lids were sculpted to temper the scan's wide-eyed expression. A hand-shaped opening is cut through the plain stone pedestal face; a dark inlay surrounds the recessed moving palm at 1.25 metres. The exposed linkage, service plate and metal neck choker from the first implementation were removed after live review; the neck pivot is now concealed behind the portrait's silhouette. The complete bust is 6.5 metres high in the game. The ritual is a five-second response to an already committed choice, and the road opens immediately. A clean physical render pass keeps the sculpture legible after the recording's image treatment. The water, bag and gallery use the same differentiated mineral eye geometry, with distinct poses for each location.

## Selection-era scene and required repairs

At selection, the Horizon bust was a static CC0 sculpture with a modeled pedestal and seal. Its renderer rejected skinning and animation; recognition only changed the seal’s color. The existing [Poly Haven portrait](https://polyhaven.com/a/marble_bust_01) supplied the likeness, silhouette and material reference for all options.

The design target was **6.5 metres tall in world space**, after the tape transform. The old seal center was about **1.8 metres** high. The new palm was placed at **1.25 metres**. The audience apron and standing camera remain the proportion checks; no forced framing or zoom is used.

At selection, the gallery swapped a lower-face fragment for a whole head when two eyes were returned. The production host is a complete damaged head with physical empty sockets. Its restored appearance now rebuilds from saved state as well as the immediate interaction.

## Three final treatments

All durations, angles and distances below are authored proposals to tune in the game, not research findings. Recognition and seal commitment are separate events.

| Treatment | Body and eyes | Returned-eye recognition | Seal response after commitment |
| --- | --- | --- | --- |
| **The Patient Stone** | Weighted neck and slight head inclination; shoulders stay anchored. Stone eyelids; independently aimed marble eyes. Voice mostly issues from an unmoving mouth. | **8 seconds:** wet impressions resolve within the sockets; one eye finds the player, the second converges; the head follows slowly and settles. One deliberate lid closure ends the recognition. | **4 seconds:** bronze contact darkens, the chin acknowledges the seal, a small neck correction directs attention toward the already open road. |
| **The Bronze Reliquary** | Old museum repairs expose a bronze neck bearing, eye gimbals and sliding shutters. Rigid pieces rotate around visible pivots; stone never stretches. | **10 seconds:** shutters unlock separately; the two eye bearings seat and converge; the neck moves after the mechanism takes its weight. | **5 seconds:** the palm inset depresses slightly; a linkage takes load, neck turns toward the road, then the bearing locks. |
| **The Unassembled Witness** | Pre-cut face sectors shift a few centimetres around an exposed dark interior. Genuine capped geometry, occlusion and internal surfaces; particles never substitute for construction. | **12 seconds:** eyes converge first inside the openings; cheek, brow and jaw sectors close around that regard, retaining thin dark seams. | **6 seconds:** sectors part just enough to expose the fixed interior, the seal answers, and the face reforms looking toward the road. |

Patient Stone offers the strongest continuity and the hardest subtle performance problem: careless weights make marble rubbery. Reliquary offers the clearest physical causality but risks looking like a machine attraction. Witness offers the strongest supernatural image but needs exceptional close-range topology and restraint. Select one treatment; do not ship a style selector or combine their material rules.

## The same eyes throughout the game

Create two identifiable objects, with different chips, vein patterns and worn iris cuts. Reuse their geometry and material identity in water, inventory and gallery; coins remain separate environment dressing. The current inventory asset includes the fountain’s coin scatter.

Preserve discovery through torch, facing and reach. Taking them commits the existing carried state once, then presents water release, brief droplets and weight settling into the case. Declining commits the existing terminal refusal and lets silt cover them. Neither action requires watching its animation. Inventory shows the two objects at readable scale, without coins or a generic glowing reward frame.

Returning them seats each eye in the gallery’s actual socket, with a small stone contact sound. The first gaze remains toward the doorway, matching what the bust says it watched. Restore geometry, gaze and eligibility from saved state. The separate gallery scare retains its authored once-only, unseen turn; save that receipt and apply its pose before the beam returns rather than snapping during a focused interaction.

At the Horizon, **carried eyes remain in the case**. Their knock draws an eyeless listening response: head turns toward the sound; empty sockets stay empty. **Returned eyes remain in the gallery**. Their recognition manifests a corresponding regard within the Horizon sockets, not a second inventory transfer. The copy must make that distinction clear. Neither branch consumes eyes or reverses the earlier return.

## Gaze and performance direction

Coordinate eyes, lids and head around chosen targets rather than running independent idle oscillations. Eye and head coordination is central to the reviewed animation literature; gaze timing and head/blink combinations can also affect perceived personality. These findings motivate controlled attention, not a claim that a particular clip guarantees a response. [Gaze review](https://www.scss.tcd.ie/Rachel.McDonnell/papers/CGF2015.pdf), [personality study](https://www.scss.tcd.ie/Rachel.McDonnell/papers/SAP2015.pdf).

Use player, case, seal and road as semantic targets. Eyes acquire before the head; fixation survives the slower head motion. Permit brief, intentional aversion on a joke, then stillness. Clamp eye rotation and neck reach; the head stops following when the player leaves the audience area. Returned-eye pupils gain restrained wet reflection, not neon emission. Carried and absent-eye variants never acquire invisible eyeballs.

## Interaction and durable outcomes

Preserve identity, humor, both eligible evidence branches and the full warning: commitment closes the other route; the first two defeats return the player; the third is final. Questions, recognition and approach cannot commit. After questions, the player can walk to the reachable seal; present the existing final choice there, rather than pretending a distant dialogue selection touched bronze. This relocates the one explicit choice and adds no second confirmation. It commits and saves before presentation.

At commitment the road becomes **visible and walkable immediately**. Close the choice overlay and deliver remaining lines in the world with movement enabled. The seal animation cannot gate walking, hide usable ground or require a witnessed ending. Bronze contact uses geometry, cloth/breath and sound without requiring visible player hands. Present a remapped contextual action and the existing consequence text; add no ritual meter, timed hold or second confirmation.

Keep look available throughout. Captions occupy the existing safe lane without covering the seal or eyes. Both defeat returns use the embodied world presentation; fix their current omission of `embodied:true` ([return presenter](/Users/seb/chunk-surfer/src/main.js:22169)). Repeat responses acknowledge an already open road rather than replaying initiation.

Use one versioned semantic performance state: recognition receipt, phase, scene time, committed outcome and consumed cue markers. Pause/hidden time freezes performance and sound. Reload settles completed events without replaying ritual effects; an interrupted committed ritual restores its settled pose and open road. Skipping settles presentation only. Reduced motion removes tracking jitter and sector travel while preserving clear poses, information and the same outcomes.

## Implementation plan

[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) supports skinning, morph targets and animation channels. The game already has a bounded character path: **48 joints, four morphs**, clip blending and joint overrides. Reuse that path; no replacement renderer ships. Bake the current anisotropic tape placement into a documented world-space bind shape before rigging, so neck rotation does not change head proportions. Keep the original pedestal collision envelope; bound moving geometry independently for render culling.

The shared [option manifest](/Users/seb/chunk-surfer/artifacts/bust-performance-design/options.json) sets proposal timings and angular limits. Patient Stone budgets 14 joints and four morphs; Reliquary 20 joints with rigid weights; Witness 26 joints and four corrective morphs. These are caps for this asset, not promised engine performance. Use named, baked clips and procedural gaze overlays; a state-driven semantic beat, never subtitle character count or unrelated wall-clock sine waves, selects the pose. Explicitly export normal deltas and check normals after both morphing and skinning. Start with three LODs and hold eye shape and socket depth in the close and audience variants; tune triangle counts from actual captures rather than shrinking every feature equally.

| Files | Work |
| --- | --- |
| [Bust builder](/Users/seb/chunk-surfer/tools/chunk_surfer/build-horizon-bust.mjs), bust GLB/stats/credits | Retopology, capped sockets, canonical eyes, selected rig/clips, reachable bevel; retain provenance and validated bounds. |
| [Props builder](/Users/seb/chunk-surfer/tools/chunk_surfer/build-props.mjs), eye item asset builder | Separate eyes/coins; socketed gallery host, wet/dry materials and state-derived poses. |
| [Character assets](/Users/seb/chunk-surfer/src/render/character-asset.js), [props](/Users/seb/chunk-surfer/src/render/props3d.js), [Horizon](/Users/seb/chunk-surfer/src/render/horizon3d.js), [renderer](/Users/seb/chunk-surfer/src/render/r3d.js) | Share pose sampling and skin/morph conventions; integrate existing Horizon transform, normals, depth, lighting and post effects. |
| New `/Users/seb/chunk-surfer/src/game/bust-performance.js` | Pure event-driven controller and deterministic gaze targets; one frame for rendering, sound and probes. |
| [Eyes state](/Users/seb/chunk-surfer/src/game/marble-head.js), [route state](/Users/seb/chunk-surfer/src/game/chunk-surf-state.js), [Source runtime](/Users/seb/chunk-surfer/src/game/source-space-runtime.js) | Versioned receipts, migration, appearance restoration, immutable evidence and immediate route availability. |
| [Main](/Users/seb/chunk-surfer/src/main.js), [bust dialogue](/Users/seb/chunk-surfer/src/game/horizon-bust.js), relevant narrative stories | Beat hooks, spatial cues, embodied returns, captions and consistent anatomical wording. |

## Acceptance

| Check | Required evidence |
| --- | --- |
| Object life | Water, carried, returned and declined save/reload produce correct inventory, gallery mesh and Horizon response. |
| Consent | Recognition never commits; explicit choice saves exactly once; road renders and collides consistently from that frame. |
| Interruption | Pause, hidden window, skip, looking away and mid-ritual reload cannot repeat effects or strand the player. |
| Performance | Ground-level front/side/near views show seated eyes, sound pivots, no neck tearing, detached normals or clipping. |
| Returns and accessibility | Both defeat returns retain the physical bust; remapped keyboard/controller, captions and reduced motion preserve every outcome. |

The accompanying motion study used the existing scan with schematic eyes and temporary weighting. The production asset supersedes it. Current isolated model, item portrait, gallery and actual Horizon captures are linked from the production master; the live scene, rather than the study render, is the visual acceptance surface.
