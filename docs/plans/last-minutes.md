# The last minutes

Decided with Seb, 2026-11-04. Applies to the whole game. Research behind it:
`artifacts/deepen-dying/research.md`. Sections 1 and 2 are rulings. Everything
marked **Proposed** is mine and open to change.

## Current implementation ruling · 2026-11-08

Seb’s decision after reviewing the visible interruption rules: **world interruptions are removed; light leaks are transitions into and out of field visits.** This supersedes the ambient interruption proposals and prior Stage 5 implementation claims below.

- No ordinary-world image seeps, media/window takeovers (including the haystack paper window), false door/tool failures, cab-sound bleeds, water-edge plate, or extra random recorder-opening delay.
- Preserve all five authored field visits, safe delivery, the third visit’s post-crash door threshold, the fifth visit’s chapel/tower handoff, and the real ant/door/body mechanics inside the fields.
- Optical light leakage is limited to field entry/arrival and departure/return. Field geometry, colour and gaze may still decay; a settled visit no longer develops an ambient lens/leak event. Reduced Flash finishes its slower departure before returning the body.
- The physical Source paper/search and other authored Source scenes remain. Horizon handoffs wait for renderer readiness and retain their route callbacks without field light leaks.
- Extras offers playable **SCENES** and an explicit **MEDIA ARCHIVE**. Archived clips have no automatic world trigger. The old interruption-preview tab is removed.

Implementation/evidence: `artifacts/interruption-extras-audit/field-only-policy/`. Earlier previews and acceptance reports are historical evidence of the removed treatment.

## 1. Rulings

**What is true**
- Ground truth is a likelihood. He MOST LIKELY dies in the van.
- All endings are superimposed under that as interpretations of it. They do not
  generally sublate the possibility of a clean run.
- A clean run stays possible: he exits Ellery and drives off.
- Every component is overdetermined on purpose. One thing, several mechanisms,
  classically surreal. The Surfer is or maybe isn't the HUSH, pressure, music
  itself, source code, the previous recordist, Sarah/Lyle and the protagonist,
  all at the same time.

**What is known about him**
- Why he took the job: up in the air for now, deliberately.
- The blue-ink notes in the cab are his own.
- "There was someone I meant to play it for" and "For the part that wouldn't
  play" are Lyle/Sarah. The text does not choose between them.

**What it should feel like**
- A job that is secretly about the moment before death. Life, love, energy and
  its fading. A drama hidden inside a horror game.
- After the fear wears off: "wow this is so expansive... yes, because it was my
  life." Interesting by being alive, alive by doing.
- Naked discovery. Memories are met in situ, like a dream, not recognised as
  his own.
- Judge both essence and accident.

**What was asked for**
- Interruptions: road carnage; field, daisies, sun on the face, fresh breath.
  Everyday things his failing mind turns into symbols. He faults like Source,
  from the very beginning. Sometimes the action you expect to get you out does
  nothing, and it looks worse with time.
- External windows take over and become the main window.
- Ellery's props seen on the drive (bust, bus, adverts) become the cast of the
  show.
- **Driving off closes the endings:** first person, then third, then black, then
  credits. This also fixes how abruptly the endings present.
- The tip-off man's warning must fit a supernatural Ellery *and* a man who never
  made it to the job. Taking the job is either meaningless because it isn't
  real, or it means committing, in dream logic, to never getting out of the cab:
  giving up the fight to get out of the car.

**The meaning-making cascade (ruled 2026-11-05).** Moments before death take on
more symbol and grandeur than they can hold. The sun becomes a light at the end of
a tunnel, a plastic bag becomes a spirit, the moon becomes a blood moon. That is
not spiritualism. It happens because the neurons are failing in front of him:
cortical de-inhibition, gamma surges, end-of-life dreams and visions (ELDVs). This
reaches the essence of the game, not its accidents. The moon was an example, not
the request.

**Also ruled 2026-11-05**
- Field, daisies, sun and breath, and the action that does nothing, are to be well
  implemented and extensive, and placed well within the narrative. Not garnish.
- The hypoxia system counts, and reads differently now that the van is underwater.
- Decision A: yes, every terminal ending gets the drive.
- Decision B: no. The prologue stays as it is for now.

## 1a. What the cascade changes

Research notes, not claims about what dying is. Secondary sources, small samples:
see "Cascade sources" at the end of this document.

**Two curves, and they cross.** Faculties fall and meaning rises, from the first
second. Everything else in this plan is one of those two curves reaching a system.
Neither is ever shown as a number, as `game/hypoxia.js` already rules.

**The horror is the top of the curve.** Every mythic thing in the game has a dull
ancestor he has already seen, and nothing says so. A van, a road, a job, a wheel, a
bag. Source, the Ophanim, the Surfer: one reading is that this is what those things
turn into when the brake comes off. That is one mechanism among several (rule 1).
The game never says "it was only a bag", and never says it wasn't.

**How it works in play**

| Mechanism | Fact it borrows | What it does here |
|---|---|---|
| Calibration | Hypoxia costs self-criticism before anything he could notice | `hypoxia.js` `calibration` already models this. It stops being only a combat read. The card stops saying "probably" about everything |
| De-inhibition | Inhibition fails, so more gets through (proposed mechanism, not settled) | What used to be filtered out arrives. This is what a seep is, and why they grow more frequent |
| Gamma surge | A burst of connected activity near the end, in very few patients | Late in the run, brief windows where he is sharper and brighter than he has been all night. Colour comes back, and meaning spikes. It looks like recovery |
| The ladder | Dreams use fragments of waking life | Seen on the road, misread in the building, mythic in Source |
| ELDV themes | Comforting presence, preparing to go, the deceased, loved ones waiting, unfinished business, distress | The tone of the interruptions. See below |

**The game already rhymes with the ELDV themes.** Nobody planned this, so use it.

| Theme | Already in the game |
|---|---|
| Preparing to go (packing, transport) | Van preparation, the bag, the bus, the bus pass, the station of doors |
| Loved ones waiting | The phone box, Row F, Lyle's jumper on the radiator |
| Comforting presence | The bench's other, "There you are" |
| Watching the dead | The vigil: "They agreed to be there when it did" |
| Unfinished business | The work order, "do not erase the first take", "someone I meant to play it for" |
| Distress (a minority) | The crash, the carnage set |

**Hypoxia, submerged.** `hypoxia.js` was written for the plant room: bad air, and the
warning on a separate circuit from the danger. In a sinking van every clause is
literally true, and nothing in the module has to change to be read that way. Its
rules carry over whole: no level, latent values that disagree, the tape stays honest,
perception changes and the simulation doesn't. What's new is a floor under `exposure`
that rises with the run, so fresh air stops getting him all the way back. Every
room's air is the cab's air, and nothing says so.

**The take is the breath.** The client rejects breath on tape, so every take is a
minute of holding it. The field arrives when he lets it go. This is what places the
pastoral set in the narrative: five takes, five breaths, one field, each visit later
in its own day and further gone.

**Outside Source.** Ruled 2026-11-05: daisies, field and interruptions happen
throughout the game, not in Source. Nothing of the kind goes in Source's own spaces,
including Source I's tiered landscape, which the code also calls "the field" and which
is a different place. The last visit fires only as he leaves through its last door.

**Daisies in the real world.** Ruled 2026-11-05: only outside by Ellery and on the road
in the drive, never in Source, not the only flora, not excessive, and not at random. So
they are placed by hand beside the seam planting already there, with dandelions and clover.
`data/ellery-flora.js`, `render/flora-models.js`. The heads are bigger than life, carry a
little light of their own and sit on a dark collar, because this print eats anything truer:
at real size and unlit a daisy is a black disc or nothing. They lean towards the road,
because lying flat they are a pixel thick from the cab. The memory field and the flash of
daisies are separate from this.

**How he gets there and back.** Ruled 2026-11-05: camera light leaks and blinding light,
after the idea in Hertzfeldt of light in the camera meaning the mind has melted. Jarring,
beautiful, and still a picture of cells going out. Film fogs from the gate in order, red
through to white; the lens goes soft and the frame is exposed twice; the room clips to
white; the exposure comes down and the focus comes back last; the sun stays on his eye in
its complement. Condensation was tried and removed: it didn't work or match. This is
technique, not a copy of the film. `game/neural-transition.js`. Reduce Flash caps it.

**The door is the van door.** A car door can't be opened against the water outside
it until the pressure equalises, which means the cab has to fill. So in a stuck
memory the door does nothing while you keep trying, and it opens once you stop. That
reads as a fault, as water pressure, and as giving up: the tip-off man's "Take it,
and you'll stop trying." It also satisfies rule 5, because waiting always gets you
out, and trying can only delay that up to a hard limit.

## 2. Rules for every stage

1. **Never collapse.** No presented line or image may kill a reading. Test a new
   line by what it rules out, not by what it fits.
2. **Authoring tables are not truth.** Every mapping below is one mechanism among
   several. Nothing in this document appears in the game as an explanation.
3. **The game never asserts the ground truth.** Physical evidence only, and each
   piece of evidence should support at least two readings.
4. **The clean run is never refuted.** A voice may doubt it. Nothing may disprove
   it.
5. **Faults are fair.** Input stays responsive, as `outskirts-losing-himself.md`
   already rules. Every stuck state has a real way out. Reduced motion, reduced
   dread and withheld window consent each have a complete path.
6. **Reuse the real thing.** The real hole, moon, van and road, as the prologue
   does, because recognition is the payoff.

## 3. Order

| Stage | What | Size | Status |
|---|---|---|---|
| 0 | Dialog and doctrine edits | S | Done with this plan |
| 1 | Drive-off on the clean endings | M | Built, see its notes |
| 2 | Drive-off on the remaining endings | S | Built, see Status |
| 3 | The prologue, re-cut for discovery | S | Declined for now (decision B) |
| 4 | Faculty loss from the first second | M | Built, see Status |
| 5 | Interruption director | L | Built, see Status; needs playing |
| 6 | Windows take over | M | After 5 |
| 7 | The cast on the road | M | Ready, any time |
| 8 | Whose life: provenance, ownership, hands | L | After 7 |
| 9 | Collapse audit of all lines | M | Runs after each content stage |
| 10 | Outside checks | People | Start now, on today's build |

## Stage 0: dialog and doctrine

- [x] **Prologue.** "Is there one where I'm all right?" now gets: "Who knows?
      Nothing is ever for certain." / "You could always just drive off. People
      have. They never write."
- [x] **The tip-off man** (`src/data/tower-warning.js`). One line per reading:
  - "There is no job. Don't take it." (Not real, or a lure: the signature is
    illegible and the officer's field is blank.)
  - "Whatever they told you, it is not an empty building." (Supernatural. Kept.)
  - "You can still get out. Take it, and you'll stop trying." (He says this on an
    open street, where there is nothing to get out of. Taking the job equals
    giving up.)
- [x] **Doctrine** (`docs/story-doctrine.md`). New top section with the rulings,
      and the rest reframed as one reading plus naming rules for code. Pinned
      strings kept for `test/story-hush-coherence.spec.mjs` and
      `test/causal-naming-contract.test.mjs`.
- [x] **Clean codas** handed over to the van (see Stage 1).

## Stage 1: drive-off on the clean endings

**The clean endings:** The Other Door (`inversion`), Cold, Bitter, Gone
(`drugged`), The Other Recordist (`surfaced`), Exit Through the Gift Shop
(`tower-won`). In each he is physically out at the end.

**The insertion point.** Every ending reaches credits through
`openEndingCredits(summary,...)`, always after `commitReturn`. So:
- Rebind `openEndingCredits` at module level, the way the prologue and crash loop
  rebind their functions. `test/credits.test.mjs` extracts that function's text,
  so the original stays untouched.
- The drive saves nothing. A crash or reload during it lands on the already-queued
  return report.

**The shot.** Drawn with the real van, road and hands, using the drive renderer,
so it doesn't depend on what state the ending left the world in.

| Phase | What happens | Control |
|---|---|---|
| Black | The engine catches before the picture. | None |
| The road | At the wheel, already moving, on the opening approach road. | Full: steer, throttle, brake, look |
| Nothing | With distance, the world goes. Rain stops. Road, then everything but the van. | Full |
| Release | The camera leaves through the driver's glazing, rises and stops, as the return flashback already does. | Ends |
| Third | The van keeps going without you, and dwindles to its lamps. | None |
| Black | Hold. Then credits. | None |

- **It reads every way at once.** A man driving home. A man leaving his body. A
  van going nowhere. Nothing on screen chooses, and no words play.
- **It cannot fail.** The road is guard-railed, and the cliff at d297 is never
  reached. Let go and the van carries on along the road, because a closing beat
  must not be able to stall.
- **Skippable.** Hold E to skip.
- **Reduced motion:** the camera cuts instead of flying.

**Files**
- `src/game/ending-drive-off.js`: state and phases, no rendering
- `src/render/ending-drive-off-renderer.js`
- `src/game/ending-drive-off-scene.js`
- `test/ending-drive-off.spec.mjs`
- `src/main.js`: the rebinding and a review probe

**Lines**

| Coda | Was | Now |
|---|---|---|
| `out` | Ends on the ruled column | Same, then: "The van is where you left it. It starts first time, which it has never done." |
| `drugged` | "...and you drive home in the light." | "...and you drive home into the light." One word, and now you play it. |
| `surfaced` | "Nobody in it." | "Is it far?" He gets up, in no shoes, and the two of you start walking. Closes on the walk, not the drive. |
| `tower-won` | Institutional record | One closing line handing over to the van, after the record. |

**Done when**
- [x] Cold, Bitter, Gone, The Other Recordist and Exit Through the Gift Shop play
      through coda, drive and credits to the return report, in the real game.
- [x] The Other Door played end to end by keys: demolition, Source IV, the `out`
      coda, the drive, credits, the return report.
- [x] Letting go of the controls still finishes. Holding only the throttle cannot
      end on a guardrail, because a lane assist works while nobody is steering.
- [x] Holding E skips it. Window panes left by the ending are cleared first.
- [ ] Not verified: Tauri build, the feel of the steering, the mix. Nobody has
      heard it.

**Found while building:** the flow used to skip the `out` coda. `finishEnding` now
falls through to it once Source IV is complete, so The Other Door goes grey door,
coda, wheel, credits.

**Proposed for later:** small traces in the cab per ending, unexplained. The cup in
the holder if he drank the coffee. The recorder cradle empty if he left it behind.

## Stage 2: the remaining endings

The Seal, He Tried to Help, Open Channel, No Return, The Full Peal, the century
stay and the bench. In these his body stays behind, or the text says so.

**Proposed:** give them the same drive, unchanged and unexplained, directly after
their last line. That is the strongest possible statement of "endings do not
sublate this". The man who sealed himself in also drives off, and the player has
to hold both.

## Stage 3: the prologue, re-cut for discovery

It predates "naked discovery". It names the endings and explains Ellery up front.
Nothing is committed.

**Proposed:** keep the blink, "There you are", the job and the voice. Cut the fate
hub, and let Ellery's history be found in the building. Before Your Eyes is close
to the blink, so check that it stays ours.

## Stage 4: faculty loss from the first second

`outskirtsLosing()` already degrades the recorder, torch, footsteps and sound, but
returns 0 outside Source space (`main.js:20644`).

- [ ] Replace with a whole-run `facultyLoss()` driven by one clock. Very low at
      the start, and it never resets.
- [ ] Keep the outskirts' current peak behaviour at the same point in that curve.
- [ ] **Failure travels.** Region by region across the map, not random noise. A
      place you knew goes wrong and stays wrong. Basis: terminal spreading
      depolarization is a wave.
- [ ] A take can't be spoiled by this alone. Faults must not feel like unfair
      failure of the job.

## Stage 5: interruption director

Attach to verbs, not plot. There are about 386 inspect sites, plus every door,
take, radio call, torch press and bag open. Pattern: `interference-director.js`.
Budget per hour, weighted by the faculty clock.

| Class | Length | Experience | Reuses |
|---|---|---|---|
| Seep | Under 1 s | One frame of hubcap, glass, daisies, on a door press or arming a take | `bumper-intrusion.js` |
| Stuck | 30–90 s | Inside a memory. The action that should get you out does nothing, and it degrades | `crossingFailure`, the lock-in door |
| Takeover | Variable | See Stage 6 | Window choreography |

- **Carnage set:** `dp_wreck_*`, `dp_detached_wheel`, `dp_torn_panel`, plus a new
  hubcap.
- **Pastoral set:** field, daisies, sun on the face, breath. `flowers-seb`,
  `clouds`, `pollination`, `empty-field` exist as window media; a walkable field
  is new.
- **Tone curve (Proposed):** carnage early, pastoral and domestic later. Hospice
  research suggests comfort rises toward the end.
- **Cab bleed (Proposed):** hearing may outlast the rest, so the cab can be heard
  in the rooms. Rain on a roof, the radio, someone at the window.
- **Stuck must end.** Waiting always gets you out, and debug builds show an
  overlay, as the crash loop does, so a designed fault can't be mistaken for a
  real bug.

## Stage 6: windows take over

Today, panes in ordinary rooms may not take input or move the main window.
`source_desktop.rs` already has always-on-top, click-through and non-focusable
windows, so it looks feasible. Untested.

- [ ] New policy class in `windowChoreographyPolicy`.
- [ ] A pane grows until it covers the main window, input still reaching the game.
- [ ] Browser, withheld consent and `reduceDread` get an in-window version.
- [ ] Never traps. A long-press always restores.

## Stage 7: the cast on the road

Today's drive has none of them: trees, ridges, reflectors, guardrail, a bridge.
Each row below is one mechanism among several.

| In the show | Seen on the drive | Needs |
|---|---|---|
| The bust | Flatbed of stripped fittings, a head under a tarp | Flatbed mesh |
| The woman and the bus | A service bus, a shelter, someone at the window | Outskirts meshes |
| Posters | Roadside hoardings carrying the institution's designs | Hoarding mesh |
| Guard and coffee | The last human he saw, at a services till | Services stop, or a cup in the cab |
| Martin on the radio | The cab radio's real voice | Radio roles are still placeholder |
| The Ophanim | His wheel, still spinning. Ophanim means wheels | Exists |
| Eyes on the wheels | Cat's eyes, invented in Halifax | Road studs |
| Metronomes | Wipers | Exists |
| The meter | The speed needle | Exists |
| The double | The mirrors | Exists |
| The blood moon | The real moon through the windscreen | Exists |
| Every locked door | The van door, held shut by water | `post_door` already reads this way |

The crash loop gets all of this for free, because it replays the real drive.

**The walk (decision C):** `src/game/ending-walk-off.js`, `src/render/ending-walk-off-renderer.js`. First person with Alan beside you, on the real road, walking into the real van's lamps. Third person, the world shrinking to the road between you and the van. You stipple out; he stays solid and walks on alone; he goes; black; credits. Played by keys from the coda to the return report. Not heard: it borrows the drive's idling engine and rain.

**Stage 7 status:** built in `src/data/road-cast.js` and `src/game/source-drive/road-cast.js`: hoardings, flatbed and sheet, bus, shelter and figure, studs, cup on the dash. Driven by real keys.

**The Happy Return (services):** six boards count the miles and print the guard's lines before you meet him. The road's left edge really widens through a slip lane into a forecourt and back (-240 to -96), with the rails going round the outside, so you can pull in, stop and rejoin. A purpose-built walk-up stand on the forecourt, the guard behind the counter, a customer with a flask, an unnamed copy of your van. Pitted by real keys. The `stalled` time-skip now starts at -215, so the cut sets you down on the approach whichever way the lorry went.

**Cab radio: built, in `src/data/cab-radio.js`, `src/render/cab-radio-vfd.js`, `src/game/parked-cab-radio.js`, and the pack from `tools/chunk_surfer/source-drive-study/build-cab-radio.mjs`.** The layout comes from the late-80s European Ford radio-cassette: a seller's listing names it for Escort, Fiesta, Sierra, Transit and Granada, and a photo shows it fitted. Top row: display, cassette door with a chunky eject bar, a blank plate where the oval badge went, two seek rockers. Legends: TUNE, STATION, BAND, AUDIO CONTROLS. Bottom row: ribbed tune rocker, keys 1 to 4, a small band cluster, tone knob, volume knob, NR. Screws in the corners. Its model number is unconfirmed, and in the one daylight photo the display looks like LCD. The green VFD comes from the same era's Pioneer KEH units (KEH-6080B, KEH-9080B), and the window is wider than the Ford's to carry it, so this is homage rather than a replica. No maker's name, oval or wordmark anywhere. The pack replaces `drive_radio` and `opening_drive_radio` by name, so a place that never loads it keeps the old unit. The parked cab has no panel now: E leans over to the set and the keys, rockers and knob are the controls, by mouse, keyboard or controller. On the road, keep Q or LB pressed to lean: the head goes down to the set, 1, 2, 3 and O work, the van keeps going and still steers, and a dial cut doesn't lift it. The recorder moved 7 cm left along the dash in the drive, because its cradle stood in front of the left of the set. The tube's clock on the first drive is per stretch, 20:52 running to 21:37, short of 21:38 on the gate's sheet. Parked it reads the night clock. In any drive with no stretch, the endings included, nobody has set it and it blinks an empty colon. From the seat the tube is a lit green display, not legible at 720p. Martin's radio voice is not started. Browser review on 2026-11-08 saw the moved recorder seated on its cradle, clear of the radio, and the full radio view through the real controllerPress path for LB. R, E and X reached the moved recorder targets with contact error below 3e-17 m and neither arm out of range; record uses about 2 cm of left arm posture advance without changing segment lengths. The ordinary seat frames do not clearly show fingertip contact. The focused radio spec passes 25/25. The empty colon is specified and tested, but no readable blink was confirmed in the drive-off frames. No digit sweep was captured during a dial cut. The sunken cab fittings were not visible clearly enough to judge recorder seating or missing radio controls, so no controls were added there. Physical gamepad, Tauri, listening and steering feel remain untested. Evidence and the 49-spec baseline comparison are in `artifacts/cab-radio-finish-2026-11-08/report.json`.

**Stage 6 status:** built in `src/game/window-takeover.js`. In-window and calm versions played in Chrome. The native OS pane is untested on Tauri.

## Stage 8: whose life

- **Provenance.** Each large place traces to a time of his life. Thin today: the
  pub and street, the third-floor reception, the cathedral. Unused and strong: the
  vigil as his own wake.
- **Ownership arrives late (Proposed).** Things start with no owner ("a coat"). At
  a chosen moment the same text resolves to "your coat", through `resolveText` and
  the inspect sites. This includes the blue-ink notes, which are his but shouldn't
  say so at first.
- **Hands before head (Proposed).** The hall marimba is already playable. Let the
  player be good at it before anyone says why. Clive Wearing is the reference.
- **The turn (Proposed).** The client rejects handling noise and breath, and that
  was the life. One line of the work order carries it.
- **Needs Seb:** the Last Light recording, and any real material he wants in it.

**Stage 8 status:** built in `src/data/whose-life.js` and `src/game/whose-life.js`, hooked through `PROPS.setInspectResolver`. Off during the crash loop, so the opening stays identical.
- **Ownership:** 18 inspect lines turn from "somebody" to "you", held at the highest meaning reached. Someone who read one early sees the original sentence change, once. Played by keys on the foam and the stool.
- **Places:** cathedral (two lines), font, rota, plus one line each for the pub, the vigil and the reception. The vigil's is "One or two say he."
- **Hands:** three lines, on any marimba, only after he has played one. First line seen by keys.
- **The turn:** one line on the work order clipboard. That prop only opens during a dock investigation, so it is spec-tested, not played.
- **Blue-ink notes:** the cab can't be revisited this late, so they stay "A reminder in blue ink". The hand turns up on the box office rota instead.
- **Needs Seb:** the Last Light recording, and any real material he wants in it.

## Stage 9: collapse audit

Go through all 1,985 authored lines, plus the epilogues, against rule 1. List lines
that kill a reading. Keep a ledger with components as rows (Surfer, HUSH, coffee,
guard, doors, moon) and mechanisms as columns, each cell citing its evidence.

**Stage 9 status:** ledger and findings in `docs/plans/last-minutes-ledger.md`. Keyword screen of 2,382 lines with 172 read by hand, so it is not the full line-by-line read this stage asks for.

## Stage 10: outside checks

| Check | Passes if |
|---|---|
| Strangers, 5–8, unspoiled, today's build: "what is this about?" | Baseline only |
| After Stages 4–8: "what is the Surfer?" | Each gives at least two explanations, and they disagree with each other |
| "What was that place?" | Most answer with a person, not a building |
| Hospice nurse reads the interruption list | Nothing left marked "would hurt a family" |

## Status, 2026-11-06 (stages 2, 4, 5 and the cascade)

**Built**
- Stage 2: every terminal ending drives off, the bench included. `surfaced` walks instead (decision C).
- Stage 4: `game/last-minutes.js`. A whole-run arc, an exposure floor under hypoxia, de-inhibition, meaning, gamma surges and a front across the map. Colour, contrast and narrowing reach the screen through POST. The recorder, torch and gait losing now runs everywhere.
- Stage 5: the field (`game/memory-field-scene.js` and friends), five visits placed on the takes and the last door, with the van door that gives when you stop. `game/interruption-director.js` for seeps, doors and verbs that don't answer, cab sounds, the water at the pool, and takeovers through `beginWindowTakeover`. Ten painted seeps.
- How he gets there and back: `game/neural-transition.js` and the LIGHT IN THE CAMERA block in POST. Film fog, white, an after-image, focus last. Condensation was tried and is gone.
- Cascade: the real moon grows and reddens and keeps its red, the bag (`world/the-bag.js`), his hypoxia tell in his own words, and rising lines for looked-at objects (`data/meaning-lines.js`).
- Meaning lines land on a reviewed list of real props, never in Source. A pattern over prop names had put water in the organ pipes and told dark lanterns they'd been on all night.
- Flora by hand, outside only: 10 plants in the yard, 15 rows on the verge. `data/ellery-flora.js`.
- Nothing in Source's own spaces. The last visit fires only as he leaves through its last door.

**Checked in the real game** (`artifacts/last-minutes/`)
- `flow2-e2e.mjs`, 23 of 23 on the current tree with takes set by probe: stuck door rules, door after the crash, dead door, torch, cab sounds, pool light, flora outdoors, tower route's last door, then onward. Scene order is threshold, white, field.
- The same script with real takes reached the sheet with the visit pending, 21 passing and none failing, before its time limit. An earlier pass saw the sheet come down and the field open.
- Flora looked at in the yard and from the cab. In the yard they read as small white flowers. From the cab at driving speed they read as outlined growth at the rail foot, not clearly as daisies.
- Crash loop (`loop-e2e.mjs`): the loop begins from exactly a New Run's state, with the night's own identity, and nothing reaches the disk. Its later checks expect a fault to reload the page, which the 2026-11-05 design replaced with being sent back to the step. They fail on `3a024b43` too, and they stop the second-lap comparison from meaning anything.

**Not checked yet**
- The chapel route's last door. The tower route is checked.
- How often seeps and takeovers land over a whole night. Each has fired; the cadence is a guess until someone plays it.
- Nobody has heard any of it. The Tauri build hasn't been run, and Reduce Flash hasn't been looked at.

**Specs.** Everything failing was run against a clean `3a024b43`. All of it fails there too with the same tests, except `chunk-surf-visual`, whose line-exact table still has the `chapel-surfer` meanings reworded in `f8b08a9d`. Nothing here caused those failures and nothing here fixed them. `acquisition-props` times out on both.

**Next:** playing it. Stages 8 and 9 have their own status above. Carrying the daisies into Source's own field was dropped by the ruling.

## Decisions still open

None.

Decided 2026-11-05: **A**, every terminal ending gets the drive. **B**, the
prologue's fate hub stays for now. **C**, Seb: "you and alan walk to the car as the
game fades out. you fade out before him." So `surfaced` is the one exception to A.

## Cascade sources

Seen through secondary pages and abstracts. Read the originals before citing.

- ELDV themes (Nosek, Kerr et al. 2014), as excerpted:
  [six categories](https://rtraer.blogspot.com/2022/06/six-categories-of-eldvs-kerr-excerpt-4.html).
  "Going or preparing to go" in 38.9% of dreams in the longitudinal study, and up to
  18% distressing; figures vary by analysis.
- Gamma surge (Xu, Borjigin et al. 2023): four patients, two showing it, both with a
  seizure history, no way to know what they experienced.
  [Michigan's summary](https://www.futurity.org/dying-brain-consciousness-2913552/),
  [Smithsonian](https://www.smithsonianmag.com/smart-news/surging-brain-activity-in-dying-people-may-be-a-sign-of-near-death-experiences-180982106/).
- Disinhibition is a proposed mechanism, not a demonstrated one:
  [2026 Frontiers paper](https://public-pages-files-2025.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1766053/pdf).
  Whether inhibitory neurons fail first is mixed:
  [rat slice work](https://springerlink.bibliotecabuap.elogim.com/doi/10.1007/BF00228690).
