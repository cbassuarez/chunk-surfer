# Chunk Surfer dialogue-image production list

Status: production brief and checklist

Audit basis: current repository and authored narrative, 14 July 2026

This is the still-image bank the dialogue, thought, playback, battle, source-space, tower, and ending presentations should be built around. It is ordered by player value rather than story chronology. The first sections correct images the game already asks to show; the later sections deepen continuity and give major turns their own plates.

World textures, 3D props, the portrait atlas, menu illustration, promotional art, and storefront images are outside this list. An object or room is included only when dialogue presents it as evidence, memory, playback, or a story beat.

## Regional and editorial baseline

Use contemporary English institutional details throughout. The existing script already establishes the baseline through Croydon, quid, a post box, skips, a torch, hi-vis, a condemned conservatory, a collegiate chapel, and an English full-circle ring of eight. Do not add a county, city, crest, uniform patch, registration plate, named contractor, or other location lore.

Visible language must use British English. Use `torch`, `programme`, `grey`, `metres` for distance, and `meter` for a measuring instrument. Avoid generated pseudo-text. Where a document must be readable, deliver a clean layered master so its final wording can come from the script.

## Priority notation

- **P0 — continuity-critical:** the runtime already calls for it, it appears early or often, or the present image is wrong or missing.
- **P1 — signature:** a major room, reveal, encounter, source-space turn, tower beat, or ending.
- **P2 — branch polish:** a meaningful choice, investigation detail, or alternate state.
- **P3 — deep polish:** low-frequency variants, replay continuity, and unusually specific payoff images.
- **Minimum** means enough unique plates to stop unrelated or placeholder reuse.
- **Strong ship** means every recurring object and major scene has a correct image.
- **Full polish** means the state and ending variants below are also delivered.

## Highest wins first

| Rank | Production family | Why it wins | Ship target |
|---:|---|---|---|
| 1 | Correct the six live art identities and add a real torch slot | The game currently has 52 authored art references routed through only six IDs. Four are unmounted placeholders, the torch borrows the tuning-fork ID, and the interface file on disk duplicates the door. | Seven truthful base plates |
| 2 | Cold-open booth, paperwork, kit, and threshold sequence | It is the first sustained dialogue and establishes the guard, player profession, work order, radio, previous recordist, and service door. | 10–14 plates |
| 3 | Five recording-room identities | Listening to rooms is the core verb. Every target room should be recognisable from a dialogue plate before horror distorts it. | Five establishing plates plus 10 detail plates |
| 4 | Radio condition sequence | The radio appears in 21 authored art references, but every clean, open, looping, wrong-room, and dead state currently shares one placeholder. | Six to eight matched states |
| 5 | Bent rig, tuning fork, recorder, and playback evidence | These objects explain the rules and unlock ending routes. Their construction must be legible at dialogue scale. | 10–14 plates |
| 6 | Playback and redaction encounters | These are the emotional and mechanical centre of the run. The art must intensify without supplying a literal Sarah, Surfer, or HUSH portrait. | 12–18 plates |
| 7 | Source-space and bell-tower passage | These are the most visually singular late-game chapters and currently have no dedicated dialogue still bank. | 16–22 plates |
| 8 | Endings and booth returns | Ending routes need distinct final evidence rather than one guard still or no image at all. | 12–16 plates |

If only one art sprint is possible, complete ranks 1–3. If a second sprint follows, complete ranks 4–6 before producing minor choice variants.

## Current runtime contract and faults

The current story-art manifest exposes `guard`, `door`, `surfer`, `circuitBentInterface`, `tuningFork`, and `walkie` in `compact`, `hero`, or `boss` mode.

| Existing ID | Authored uses | Present state | Required action |
|---|---:|---|---|
| `guard` | 11 | Mounted `guard.png`; reused for the booth, coffee, work order, threshold, and five epilogues | Keep the stable ID for the opening guard plate; add separate IDs for paperwork and ending states |
| `door` | 2 | Mounted `door.png` | Replace with the interior missing-push-bar threshold; add exterior, closure, false-door, and rescue variants |
| `surfer` | 6 | Placeholder in the manifest; an unused file exists on disk | Make an ambiguous transferred-signal subject, not a clean character portrait |
| `circuitBentInterface` | 9 | Placeholder in the manifest; the unused file on disk visually duplicates the door | Make the actual opened, circuit-bent recorder/monitor path |
| `tuningFork` | 3 | Placeholder in the manifest; the unused file is a generic glowing fork | Make the engraved A=440 fork; remove the torch node's misuse of this ID |
| `walkie` | 21 | Placeholder in the manifest; an unused file exists on disk | Make one coherent radio with matched clean, open, loop, wrong-room, and dead states |

The mounted stills are 3:2 images. The fixed side-by-side dialogue card is much narrower and displays only roughly the central 42% of a 3:2 source when cover-cropped. Keep the decisive subject inside that central band, retain vertical context, and keep critical detail out of the bottom metadata rail. The manifest stores a focal point, but the present renderer does not apply it; composition, not metadata, is the current guarantee.

## Spoiler and identity rules

- Do not show a canonical protagonist face. First-person hands, coat sleeves, knees, recorder reflections, and an obscured silhouette are enough.
- Do not create a canonical Sarah portrait. Her presence is a recording, an absent domestic space, a voice behind glass, or a face the chapel cannot hold. Naming her changes dialogue, not her visual identity.
- Do not show the previous recordist clearly before the source-space body return. Use waveform evidence, a chair, head-torch residue, hands, shoes, or a body interrupted by reflection and UI noise.
- Do not draw the HUSH or Chunk Surfer as a monster. Show displaced silence, negative space, pressure in architecture, an outline that fails to resolve, or a signal using an object badly.
- The rescue route explicitly withholds the door-holder's face. Preserve that.
- The client is a good coat, hands, paperwork, and posture. A face adds nothing and closes useful ambiguity.
- The guard may be recognisable, but booth glass, television light, and working posture should remain more important than a glamour portrait.
- Never illustrate a hallucinated piano as an ordinary real piano standing in the natatorium. The threat is that the sound has no visible source.
- Do not use separate “named” and “unnamed” Sarah images. That would make a dialogue flag invent visual canon.

---

# Master production checklist

## 1. Correct the live base set — P0

These seven plates are the minimum corrective delivery. Preserve the six existing IDs and add `torch`.

- [ ] `guard` → `guard-booth-2138.webp` — guard behind wet booth glass; dead television, key hooks, forms, failed pens, and coffee readable as one practical workplace.
- [ ] `door` → `service-door-missing-pushbar.webp` — interior painted breeze block and mortar seam exactly where the protagonist's hand expects the push bar; no supernatural glow.
- [ ] `surfer` → `recordist-transferred-signal.webp` — headphones/recorder playback with an incomplete human subject assembled from room noise; no readable face.
- [ ] `circuitBentInterface` → `bent-interface-feedback-path.webp` — older recorder open, converter output wired back into its own input; soldering and feedback path readable.
- [ ] `tuningFork` → `tuning-fork-a440-reference.webp` — worn steel fork, hand-cut `A=440` and `AND NOTHING ELSE`, photographed as evidence rather than fantasy loot.
- [ ] `walkie` → `radio-issued-clean.webp` — one period-plausible handheld set, belt clip, grille, small display, and Channel 2 context; no invented brand.
- [ ] `torch` → `torch-maglite-kit-check.webp` — worn three-cell black Maglite, anodising rubbed to metal at the grip, tested against a palm; this replaces the tuning-fork image on the torch node.

Acceptance for this set: all six existing IDs resolve to their intended subject, no source is missing, the interface no longer duplicates the door, and the torch no longer displays the tuning fork. The contextual plates in the following sections then remove generic reuse such as guard art standing in for paperwork or an epilogue.

## 2. Cold open, gate booth, and threshold

### 2.1 Booth and guard — P0/P1

- [ ] `booth.establishing.rain` — exterior vehicle gate at 21:38; small lit booth, covered perch, rain on roof and skips, conservatory mass beyond without a new establishing landmark.
- [ ] `booth.guard.window` — closer version of the `guard` base; glass reflections preserve the workplace and stop it reading as a character-select portrait.
- [ ] `booth.pen.failure` — guard's hand testing a dead pen over the form; pot full of identical pens, television glow behind.
- [ ] `booth.coffee.form` — second paper cup sliding across the work order; the offer is ordinary and should remain visually innocent.
- [ ] `booth.return-checkin` — same booth and camera on replay, but work order 4417-C is already waiting on the glass; continuity should make the repetition obvious.
- [ ] `booth.guard.not-interested` — television turned down despite already being silent; guard receding into booth routine while the player asks about the building.
- [ ] `booth.guard.ledger-search` — finger running up the old ledger, the previous recordist's received box filled and returned box blank; writing may be indistinct but column structure must be real.

### 2.2 Work order and issue kit — P0/P1

- [ ] `work-order.overview` — creased commercial work order under booth glass: five rooms, clean-minute language, signature block repeatedly photocopied; final readable type supplied as a separate layer.
- [ ] `work-order.payment` — detail of four hundred pounds and half on acceptance without inventing a bank, logo, or payment platform.
- [ ] `work-order.wording` — detail plate for “the room as it is”, “one clean minute”, and self-noise restart rule; typeset from final script, not generated inside the image.
- [ ] `work-order.client` — W. Ellery Holdings, landline, and Croydon post-box detail; no website, logo, or corporate mythology beyond the script.
- [ ] `work-order.deadline` — Thursday 06:00 demolition deadline and five-or-none requirement; cold office typography, not a horror prop.
- [ ] `work-order.previous-contractor` — four accepted rooms, fifth undelivered, account still open; make the administrative trap legible without red ink or occult symbols.
- [ ] `issue.ledger.returned-column` — two boxes on the protagonist's line, `RECEIVED` and narrow empty `RETURNED`; signature hand may enter frame, face may not.
- [ ] `issue.keys-radio` — keys and the same `walkie` set slid beneath booth glass in one gesture; Channel 2 and the C-17 absence must not be invented here.
- [ ] `issue.kit-layout` — torch, recorder, headphones, radio, keys, and twice-folded order as a believable working kit; use for the spoken inventory beat.

### 2.3 Yard and door — P0/P1

- [ ] `threshold.yard-wide` — wet skips, booth behind, roughly a hundred metres of exposed yard, grey service door ahead; this is spatial evidence, not a heroic exterior.
- [ ] `threshold.grey-door-exterior` — grey service leaf at the end of the yard, correct push bar/closer construction, rain-darkened wall.
- [ ] `threshold.door-closing` — interior view as the service door closes behind the protagonist; the last wedge of wet exterior light disappears.
- [ ] `threshold.missing-pushbar` — use the `door` base: hand on cold painted block and mortar seam, two metres of searched wall implied.
- [ ] `threshold.previous-take-continues` — missing doorway wall overlaid by playback evidence from the previous recordist; do not put a ghost in the corridor.

## 3. Recorder, evidence objects, and investigation details

### 3.1 Recorder and room-tone craft — P0/P1

- [ ] `recorder.level-check` — protagonist's recorder awake in hand; fluorescent display and eleven-segment level meter sharp enough to read as equipment.
- [ ] `recorder.monitor-open` — headphones, cable, recorder, and room entering the monitor path; visual language for “the room comes up in the cans”.
- [ ] `recorder.rig-on-floor` — Studio B3 microphone/recorder wrongly set directly on the floor; the mistake should be immediately understandable.
- [ ] `recorder.rig-on-risers` — corrected setup on four gum-rubber and silicone risers, same angle for before/after comparison.
- [ ] `recorder.archive-card-four-files` — four files on a card, three cleanly slated and one anomalous; use a real interface layout with layered final text.
- [ ] `recorder.archive-chair-move` — a chair and the suggestion of a man standing within playback, never a clean reenactment.
- [ ] `recorder.archive-no-slate` — take-four evidence with absent slate and a long continuing waveform; neutral forensic presentation.

### 3.2 Bent rig — P0/P1/P2

- [ ] `rig.plant-floor-found` — older matching recorder on the plant-room floor, lid off, torch catching it among lagged pipework.
- [ ] `rig.converter-close` — macro evidence of wires soldered across the converter and returned to input; circuit topology must be plausible.
- [ ] `rig.cracked-joint` — grey cracked final joint and unused cells in tray; the interrupted work is the subject.
- [ ] `rig.reflowed` — repaired joint and completed feedback path, with the protagonist's soldering iron or hands but no face.
- [ ] `rig.gutted` — cells removed and feedback wires slack in the tray; same camera as the repaired route so the choice reads clearly.
- [ ] `rig.in-bag` — bent recorder against the folded work order, visibly the heaviest object carried; optional route-continuity plate.

### 3.3 Tuning fork — P0/P1/P2

- [ ] `fork.on-sill` — fork in practice-wing dust on a windowsill, steel older than the refit.
- [ ] `fork.engraving` — `A=440` and `AND NOTHING ELSE`, visibly hand-cut with a knife rather than factory engraving.
- [ ] `fork.struck` — hand holding the struck fork conventionally; no magic particles, only an unnaturally stable evidence read.
- [ ] `fork.damped` — fist closed round perfectly still cold steel while the room, not the fork, retains A.
- [ ] `fork.pocketed` — top-pocket professional tool continuity; optional compact plate.

### 3.4 Front-of-house key evidence — P1/P2

- [ ] `foh.rekey-ledger` — replacement core, chapel, Cabinet C-17 in an ordinary office ledger; final words delivered as a clean type layer.
- [ ] `foh.key-cabinet` — shallow steel cabinet, three tagged rings and one empty hook.
- [ ] `foh.wrong-key-ring` — wrong ring dropping against the cabinet; image should imply the loud mistake without action blur obscuring the tags.
- [ ] `foh.c17-key` — C-17 brass key, cuts visibly newer than the other keys on its ring.

## 4. Five target rooms and adjacent story spaces

Every target gets one neutral establishing plate before any distorted variant. Reuse the neutral plate for ordinary room-listen dialogue; never introduce the horror version first.

### 4.1 Studio B3 — P0/P1

- [ ] `room.b3.establishing` — foam on three walls, carpet, dead ceiling, small cupboard-like volume; the quietest room in the building.
- [ ] `room.b3.foam` — wedge foam going brown and powdery above four hundred hertz.
- [ ] `room.b3.patchbay` — every cable pulled, coiled, and hung; tidiness that implies somebody planned to return.
- [ ] `room.b3.music-stand` — folded stand, clipped sheet with two pencil bars, handwriting unreadable.
- [ ] `room.b3.dark-monitor` — same room with torch off and only equipment/display evidence; no hidden figure.

### 4.2 Natatorium — P0/P1

- [ ] `room.natatorium.establishing` — drained six-metre-tile basin, deck, hard ceiling, deep end descending into black; no water in the ordinary run.
- [ ] `room.natatorium.deep-end` — ladder descending into the dry dark, floor withheld but not populated.
- [ ] `room.natatorium.acoustic` — hard surfaces and four-return geometry expressed through framing/reflection, not drawn sound waves.
- [ ] `room.natatorium.playback-step` — one wet footprint or small wet contact at the bottom of a basin dry since April; no person attached to it.
- [ ] `room.natatorium.water-route` — later dark water keeping a low patient shape; surface may follow the player's shoes, but must not reveal a creature.

### 4.3 Concert hall — P0/P1

- [ ] `room.hall.establishing` — empty seats receding beyond torch reach, dust, stage, balconies, and long return.
- [ ] `room.hall.seats` — horsehair, dust, and rows once warmed by an audience; no spectral audience.
- [ ] `room.hall.stage` — empty stage and grand piano waiting with lid or cover state matching the 3D room.
- [ ] `room.hall.behind-glass` — playback image for Sarah's “behind the glass” line: control-room/window geometry and a recorder on a knee, face absent.
- [ ] `room.hall.house-return` — stage/balcony reflections returning at the same level; architecture is the antagonist.

### 4.4 Practice wing — P0/P1

- [ ] `room.practice.establishing` — eight rooms plus ensemble room off one corridor, every door open, seven uprights with lids up.
- [ ] `room.practice.pianos` — multiple uprights, broken strings and open lids, clearly stationary.
- [ ] `room.practice.open-doors` — every practice door left as if someone went for coffee and expected to return.
- [ ] `room.practice.file-kitchen` — domestic recording residue: tap, washing-up space, recorder or waveform context; no Sarah face.
- [ ] `room.practice.far-music` — the room arranged around a sound with no powered source; no visible performer.

### 4.5 Chapel — P0/P1

- [ ] `room.chapel.establishing` — two banks of pews, organ with wind isolated, ribbed stone vault, cold scale, fifth-room composition.
- [ ] `room.chapel.broken-clerestory` — broken high pane and weather entering; snow drifting onto stone if the run presents that text.
- [ ] `room.chapel.organ-no-wind` — console/pipes or case with blower isolated while the room claims sound; no organist.
- [ ] `room.chapel.fifth-take` — recorder on floor between positions, take five running; human bodies remain outside clean focus.
- [ ] `room.chapel.borrowed-face` — an outline or monitor subject attempting Sarah/recordist identity and failing at the edges; never a definitive face.

### 4.6 Plant, corridor, and HUSH pressure — P1/P2

- [ ] `room.plant.establishing` — chillers, header tank, old lagged pipework, practical maintenance space.
- [ ] `space.corridor.settling` — ordinary dark corridor with thermal/structural movement only.
- [ ] `space.corridor.hush-shape` — the silence behind the player changes shape; negative space and absorption, no body or eyes.
- [ ] `space.corridor.professional-stillness` — first-person frozen posture, dark corridor behind, visual emphasis on not turning round.

## 5. Radio dialogue state family

All radio plates must use the same physical handset, camera, wear pattern, display, clip, and grille. State is communicated by display/carrier evidence, moisture-like signal behaviour, and framing—not by changing to a different prop.

- [ ] `radio.issued-clean` — use the `walkie` base; Channel 2, clean carrier, belt-issue condition.
- [ ] `radio.live-call` — PTT/receive state for ordinary 4417-C exchanges.
- [ ] `radio.carrier-open` — carrier stays open after speech; same set, display and grille held in an unresolved receive state.
- [ ] `radio.internal-click` — close grille/speaker detail for the dry click arriving before the voice.
- [ ] `radio.breath-close` — evidence of a breath arriving too close to the grille without drawing a mouth.
- [ ] `radio.looping-return` — `RECEIVING` or waveform repetition stepping smaller and wetter; final text must be a UI layer.
- [ ] `radio.wrong-room` — room label appears before entry and in the protagonist's voice; avoid literal wet gore or a face in the speaker.
- [ ] `radio.dead` — carrier dropped to a hard dead click, blank display or physically plausible dead state.
- [ ] `radio.shaken-squelch` — radio in hand after the one loud shake; use only for the dead-radio choice.
- [ ] `radio.dropped` and `radio.recovered` — optional matched pair on floor/back on belt for equipment-loss continuity.

Minimum: clean, open, loop, wrong-room, and dead. Ideal: all ten plates or state overlays derived from one locked master.

## 6. Playback, battle, and redaction images

### 6.1 Previous recordist and transferred signal — P0/P1

- [ ] `playback.recordist.take-three` — recorder display, chair, and a man rising beyond the evidence plane; face excluded.
- [ ] `playback.recordist.come-closer` — the room-tone signal gathers an incomplete human outline as it speaks; keep it deniable as playback corruption.
- [ ] `playback.recordist.nine-minutes` — long clean waveform and empty chair after speech ends; the absence is the payoff.
- [ ] `playback.recordist.reference-file` — prior contractor flattened into a file/room relationship for later chapel dialogue.

### 6.2 Natatorium encounter — P1

- [ ] `battle.natatorium.wrong-two-notes` — empty pool and meter at floor while two-note evidence appears without an instrument.
- [ ] `battle.natatorium.meter-moving` — meter moving despite no visible source; recorder foreground, empty basin background.
- [ ] `battle.natatorium.sarah-pressure` — Sarah represented as captured domestic/voice evidence intruding on tile, not a person in the pool.
- [ ] `battle.natatorium.clean-hold` — empty basin restored to neutrality, meter held, no victory spectacle.
- [ ] `battle.natatorium.lose-piano` — player motion towards an absent piano represented by false alignment or impossible shadow, not a real piano prop.

### 6.3 Practice-wing encounter — P1

- [ ] `battle.practice.file-source` — distant music resolves into a stored file/drive in a spare-room box.
- [ ] `battle.practice.kept-voice` — hours of domestic recordings arranged as unconsented archive evidence; no romantic montage.
- [ ] `battle.practice.pianos-still` — seven open uprights, no moving keys, some strings broken.
- [ ] `battle.practice.clean-hold` — empty rooms and ordinary pianos after the far music stops.
- [ ] `battle.practice.lose-playback-hand` — protagonist's hand moving towards the recorder/playback control, halted too late; first-person only.

### 6.4 Hall and chapel encounters — P1

- [ ] `battle.hall.return` — full hall geometry returning the protagonist's voice at the same level; no audience bodies.
- [ ] `battle.hall.full-house-absence` — lose-state image in which empty seats frame the sensation of listening without populating them.
- [ ] `battle.chapel.signal-not-body` — damaged monitor path asserting body/instrument while the room remains visibly empty.
- [ ] `battle.chapel.previous-recordist` — borrowed outline resolved only enough to recognise workwear/headphones, face occluded.
- [ ] `battle.chapel.face-cycle` — one master or controlled sequence where Sarah, reason, wound, and prior recordist are attempted as unstable masks; use abstraction so branch text supplies identity.
- [ ] `battle.chapel.organ-sounding` — organ visibly inactive while the monitor and room indicate impossible sound.
- [ ] `battle.chapel.faces-exhausted` — only the previous-recordist outline remains after the chapel runs out of faces.
- [ ] `battle.chapel.take-dies` — body agreement route; recorder stops and the player's first-person body is claimed without body horror that invents anatomy.

### 6.5 Redaction-machine support — P1/P2

The redaction interface draws its own text. These plates sit behind or beside it and must not contain the challenge wording.

- [ ] `redaction.natatorium-paper` — damp tile/paper evidence surface.
- [ ] `redaction.practice-paper` — staff paper, archive box, and tuning-fork reference surface.
- [ ] `redaction.hall-paper` — programme/house-return evidence surface.
- [ ] `redaction.chapel-paper` — contract, organ, recorder, and body-outline evidence surface.
- [ ] `redaction.other-hand` — recurring opposing hand/mark presence with no owner, suitable across all encounters.
- [ ] `redaction.composure-broken` — damaged evidence plate that does not obscure selectable words.
- [ ] `redaction.composure-held` — plate settles and clears; no approval glow.

## 7. Source-space dialogue and transition

The source chapter may be more graphic than the conservatory plates, but it must remain built from the game's actual pages, code, staff lines, and evidence. Do not substitute generic cyberpunk glitch art.

### 7.1 Approach and page field — P1

- [ ] `source.long-hall` — chapel corridor refusing to end, walls becoming clauses from the job.
- [ ] `source.pages-collect` — pages accumulating along the walls, mostly the same page pretending to be separate sheets.
- [ ] `source.clean-page` — one clean face-up page waiting; ordinary enough that touching it is a choice.
- [ ] `source.page-storm` — density transition as the hall becomes hundreds of pages.
- [ ] `source.haystack` — navigable paper field with one still page visually recoverable, not a random collage.
- [ ] `source.page-found` — exact source line rises before the paper; final line rendered by UI or supplied as a clean layer.
- [ ] `source.landscape-transform` — paper field opening into a navigable landscape while preserving page provenance.

### 7.2 Landmarks — P1/P2

- [ ] `source.fork-room` — thin steel fork hanging in black air, unlit and sounding.
- [ ] `source.previous-contractor` — four accepted room-tone tiles in the floor and a fifth tile behaving like a mouth; keep it graphic, not fleshy.
- [ ] `source.student-file` — rehearsal room made of staff lines, every measure becoming a rule about endurance.
- [ ] `source.work-order-loop` — desk containing no paper while the paper contains the desk.
- [ ] `source.body-return` — room full of outlines, none empty; one resists turning towards the fork.
- [ ] `source.final-page` — floor printed on the page rather than page lying on the floor.

### 7.3 Final redactions and completion — P1

- [ ] `source.redact-return-inside` — mercy clause blacked out and given to the wrong body.
- [ ] `source.redact-body-borrowed` — borrowed body becomes a bad reference and the Surfer loses its edge; correct route.
- [ ] `source.redact-source-surfer` — word `SURFER` removed while the thing wearing it remains.
- [ ] `source.recordist-release` — page gives up the body it was using; previous recordist becomes carryable but still not a clean portrait.
- [ ] `source.wound-close` — source closes without sealing; chapel destination remains ahead.
- [ ] `source.fold-back` — source folds into the actual chapel corridor.
- [ ] `source.to-tower-datamosh` — reversible visual crossing from exact source material to eight real ropes; needs coherent forward, hold, and reverse frames if implemented as a sequence.

## 8. Chapel tower and change-ringing dialogue

The tower is a real compact English ring of eight: ropes, sallies, wheels, headstocks, stays/sliders, frame, shutters, winch, service stairs, and organ-loft route must agree with the 3D build. Do not draw clock-hammer strikes as the moving-bell performance.

- [ ] `tower.outer-screen` — collegiate chapel screen locked from within, ordinary and architectural.
- [ ] `tower.ringing-room-quiet` — eight ropes and sallies hanging correctly before motion; no ringers present.
- [ ] `tower.tenor-begins` — tenor rope/structure takes load alone above the room; the first change in the frame is visible.
- [ ] `tower.ringing-room-live` — all eight ropes moving in a plausible staggered full-circle pattern; no identical rope phase.
- [ ] `tower.bell-chamber-live` — moving bells, wheels, clappers, and English frame under load; composition must respect collision route and walkable frame.
- [ ] `tower.clock-hammer-isolated` — stationary tenor clock-hammer linkage falling out of tension, clearly distinct from bell clapper action.
- [ ] `tower.winch-under-load` — pawl held while the touch is mid-course; refusal is mechanical, not magical.
- [ ] `tower.shutters-opening` — shutters release as the ring finds rounds and begins to stand.
- [ ] `tower.bells-stood` — final bell at balance, frame settling, silence larger than ringing.
- [ ] `tower.service-leaf-release` — service leaf opening towards the organ loft after the bells stand.
- [ ] `tower.organ-loft` — console, isolated blower, rail, and service stair down to the nave.
- [ ] `tower.nave-return` — actual chapel waiting below after the physical descent.

## 9. Endings and epilogues

### 9.1 Choice, sacrifice, inversion, and rescue — P1

- [ ] `ending.choice-floor` — recorder running on the chapel floor between positions; last page, fork, and rig all legible as available route evidence.
- [ ] `ending.sacrifice-agreement` — sentence completed for the room; recorder central, body ownership implied without a literal possession effect.
- [ ] `ending.sacrifice-clock` — 05:5? demolition clock and a sealed room nearing closure.
- [ ] `ending.inversion-feedback` — bent rig playing the room back into itself, agreement losing its addressee.
- [ ] `ending.inversion-organ-choke` — organ stops and first wall below begins to fail.
- [ ] `ending.false-door-present` — grey service door exactly where the plan says, relief staged honestly.
- [ ] `ending.false-door-slip` — same door displaced a foot left and becoming wall; matching camera is essential.
- [ ] `ending.rescue-open-door` — new unmarked door held open by a backlit shape whose face cannot be seen.
- [ ] `ending.yard-absent` — protagonist exits into a missing yard, blank clock, and another identical grey door further off.
- [ ] `ending.recordist-laugh` — previous recordist laughing while sound continues after his mouth stops; use reflection/signal separation rather than a comic portrait.

### 9.2 Surfaced and drugged routes — P1/P2

- [ ] `ending.surfaced-service-road` — chapel door opening onto the service road instead of the nave; route remains physically ordinary.
- [ ] `ending.surfaced-recordist-carried` — released recordist supported/carried in morning light; face still not required.
- [ ] `ending.surfaced-page-afterimage` — source clause follows as an afterimage, with dynamic line kept in UI.
- [ ] `ending.drugged-car-park` — actual car park, skips where expected, unlit four-storey building, no supernatural distortion.
- [ ] `ending.drugged-playback` — headphones on; five bad files represented as breath, steps, spoken names, and failed room tone without literal flashback portraits.
- [ ] `ending.helped-coffee` — coffee as an ordinary kind act that was insufficient; avoid syringe, tablets, or invented drug evidence.

### 9.3 Gate-booth epilogues — P1/P2

Use one locked dawn camera and consistent booth layout so branch differences carry the meaning.

- [ ] `epilogue.returned` — protagonist and guard; returned column receives its first entry.
- [ ] `epilogue.account-closed` — client in a good coat, hands signing, face outside frame; demolition machines booked for 06:00.
- [ ] `epilogue.nobody` — guard, book, and no returning person; empty right column dominates.
- [ ] `epilogue.helped` — guard no longer bored, watching the service door and admitting the coffee may not have been enough.
- [ ] `epilogue.drugged` — one paper cup in the bin and one empty cup still in the protagonist's hand; continuity must make the discrepancy readable.
- [ ] `epilogue.second-recordist-returned` — optional surfaced route: guard, book, and second man behind the protagonist with no shoes; face may remain hidden.

## 10. State variants and overlays — P2/P3

Prefer overlays or matched plates when only a small state changes. Do not regenerate a whole room and accidentally move doors, furniture, or equipment.

- [ ] Clean/open/loop/wrong-room/dead radio display and waveform overlays from one locked radio master.
- [ ] Recorder meter flat/moving/recording/playback/dead overlays from one locked recorder master.
- [ ] Work-order readable-text layer, signature layer, received/returned ledger layer, and account-closed layer.
- [ ] Torch on/off/yellow-brownout/dead variants with identical grip and camera.
- [ ] Door open/closing/missing/false-position variants from matched cameras where architecture allows.
- [ ] Bent-rig found/repaired/gutted variants with identical camera and circuit geometry.
- [ ] Tuning-fork neutral/struck/damped variants with identical wear and engraving.
- [ ] Room neutral/monitor/playback/battle-pressure grades; geometry must remain unchanged.
- [ ] HUSH pressure mask that can alter absorption or negative space without drawing a creature.
- [ ] Source redaction masks supplied separately from background plates.
- [ ] Tower shutters closed/open and bells moving/stood state plates from the same physical layout.
- [ ] Dawn, morning, and 21:38 booth grades from one set, with practical light changes rather than unrelated weather.
- [ ] Reduced-distortion versions for accessibility where a plate uses strong signal breakup, contrast flicker, or rapid frame alternation.

---

# Production standards

## Visual language

- Treat every still as an evidence plate inside a field recorder or VFD-adjacent machine, not a conventional visual-novel portrait.
- Start with practical documentary photography or restrained painted realism, then reduce colour and resolution deliberately. The existing heavy blue posterisation can inform the palette but should not erase object identity.
- Use cold blue/black for trusted observation, restrained amber for device/signal warning, and neutral wet sodium/fluorescent practicals in the booth and yard.
- Supernatural pressure should enter through framing, reflection, absorption, repetition, and impossible continuity. Avoid smoke wisps, glowing eyes, runes, magic particles, and generic glitch faces.
- Keep room architecture consistent with the floor plan and 3D props. A dialogue still is not permission to redesign a door, staircase, piano count, organ, key cabinet, or bell frame.
- Preserve darkness without crushing every midtone. The current unused recordist image is too dark to communicate its subject at card scale.

## Composition and crop safety

- Master canvas: 1600 × 1067 pixels or larger at the same 3:2 ratio; retain a layered high-resolution master.
- Put the primary subject inside the central 40% of the frame width. The side-by-side dialogue layout cover-crops a 3:2 image to a narrow portrait-like pane.
- Keep hands, object labels, eyes if any, and decisive evidence out of the outer 30% on both sides.
- Keep critical evidence above the bottom 18%; the runtime identification rail overlays the lower image.
- Test every plate in `compact`, `hero`, and `boss` presentation where the ID can appear in more than one mode.
- Compose for small output. If an object is not recognisable at roughly 200 × 320 pixels, the plate is not finished.

## Files and naming

- Delivery: lossless layered master plus shipping WebP or optimised PNG in sRGB.
- Shipping target: below 300 KB per still unless a measured visual-quality review justifies more.
- No baked UI frame, caption, status word, scanline, VFD tint, or dialogue text; the renderer supplies those.
- Use alpha only where a true overlay is required. Ordinary plates should be opaque.
- Strip camera/device metadata from shipping files while preserving rights and source records outside the build.
- Use lower-case kebab-case filenames:

```text
<chapter>-<subject>-<state>-<variation>.webp
```

Examples:

```text
booth-guard-window-01.webp
radio-carrier-open-01.webp
room-natatorium-playback-step-01.webp
source-body-return-01.webp
ending-false-door-slip-01.webp
```

Stable manifest IDs may use dots even when filenames use hyphens. Do not rename the six existing IDs; save-game and narrative references treat stable IDs as permanent.

## Text and documents

- Supply work order, ledger, radio display, recorder display, source clause, and redaction wording as separate editable layers.
- British spelling is mandatory in visible text. Keep `meter` for the recorder and `metres` for distance.
- Do not ask an image generator to typeset final copy. Use the authored script after the image is approved.
- Do not invent signatures, names, addresses, company divisions, dates, or room numbers beyond those already present.
- Alt text must describe the evidence without revealing route spoilers the player has not reached.

## Rights and provenance

- Record the creator, source, model or stock licence if relevant, edit history, and perpetual commercial interactive-game rights for every plate.
- Obtain model releases for recognisable people. Avoid using a real person's likeness for Sarah, the previous recordist, guard, client, or protagonist without an explicit release covering interactive use.
- Keep stock and generated-source receipts outside `public/`; ship only the final approved derivative and its credit record.
- Paintings already referenced in the 3D foyer/hall must remain genuinely open-licensed or separately cleared; this dialogue-art list does not broaden their licence.

# Manifest and authoring plan

- Keep `content/media/story-art.media.json` as the single art manifest.
- Mount every approved file through an `assets` entry; an unused file under `public/story-art` is not production coverage.
- Add a dedicated `torch` story-art ID and update the cold-open torch node to use it.
- Use node-level art for a whole stable conversation beat and line-level art only when the physical or signal state truly changes.
- Give radio state changes line-level refs; do not create duplicate narrative nodes solely to change an image.
- Give room-listen entry nodes the neutral room plate. Exploration choices may switch to one detail plate and then return.
- Use separate art IDs for booth epilogues so one guard image does not imply the same time, attendance, paperwork, or outcome.
- Preload the P0 base set for the cold open; late source, tower, and ending plates can load by chapter boundary.
- Extend the art contract test from six hard-coded files to manifest-driven existence, dimensions, byte budget, and non-placeholder status.
- Add a contact-sheet or automated screenshot pass for every art ID in each authored mode.

# Acceptance passes

- [ ] Start a fresh run and complete every cold-open branch; no object or paperwork choice shows the guard by default unless the guard is actually the subject.
- [ ] Check the torch node: it shows the worn Maglite, never the tuning fork.
- [ ] Play the previous contractor's file: the plate communicates playback and a human subject without establishing a canonical face.
- [ ] Enter through the service door: exterior, closure, missing push bar, and later false-door images share one architecture.
- [ ] Listen to all five target rooms before battle pressure; each room is recognisable at card scale with no caption.
- [ ] Run every radio branch; clean, open, loop, wrong-room, and dead states remain the same handset and are distinguishable without status text.
- [ ] Inspect, repair, and gut the bent rig; circuit changes are physically coherent between plates.
- [ ] Pick up, strike, and damp the tuning fork; engraving and wear remain identical.
- [ ] Complete named and unnamed playback/battle variants; art does not change Sarah's appearance or reveal a new person.
- [ ] Complete all chapel face variants; the branch label supplies identity while the plate remains deliberately unstable.
- [ ] Traverse the full source-space route; every required landmark and final redaction has correct evidence without generic cyberpunk imagery.
- [ ] Cross into the bell tower; rope, bell, frame, clock hammer, shutters, and service route agree with the 3D tower.
- [ ] Play every ending and booth epilogue; route outcome is readable from the image while forbidden faces remain hidden.
- [ ] Test narrow, standard, ultrawide, and large-text layouts; critical evidence survives the centre crop and bottom rail.
- [ ] Test reduced distortion/flash settings; no necessary clue depends on high-frequency breakup or rapid alternation.
- [ ] Remove all unmounted placeholder files in a test build; no narrative reference silently falls back to missing or unrelated art.
- [ ] Review every visible word for British English and against the final authored script.
- [ ] Review every final asset's rights record before release packaging.

# Repository touchpoints covered by this audit

- Canonical dialogue and art refs: `content/narrative/*.story.json`.
- Story-art manifest: `content/media/story-art.media.json`.
- Current still directory: `public/story-art/`.
- Resolution, missing-state, and preload logic: `src/game/story-art.js`.
- Crop, rail, and mode layout: `src/game/story-art-card.js`.
- Dialogue presenters: `src/game/coldopen.js`, `src/game/dialogue.js`, `src/game/thoughts.js`, `src/game/battle.js`.
- Legacy import parity: `src/data/conservatory-script.js`, `src/data/battles.js`, `src/data/radio-script.js`.
- Room, prop, source-space, and tower continuity: `src/data/conservatory-props.js`, `src/data/chunk-surf-script.js`, `src/game/source-space-runtime.js`, `src/game/bell-tower-runtime.js`, `src/main.js`.
- Validation and tests: `src/narrative/contracts.js`, `test/story-art.test.mjs`, `test/story-art-contract.test.mjs`, `test/story-art-card.test.mjs`, `test/narrative-studio.spec.mjs`.
