# The last minutes

Decided with Seb, 2026-11-04. Applies to the whole game. Research behind it:
`artifacts/deepen-dying/research.md`. Sections 1 and 2 are rulings. Everything
marked **Proposed** is mine and open to change.

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
| 2 | Drive-off on the remaining endings | S | Needs decision A |
| 3 | The prologue, re-cut for discovery | S | Needs decision B |
| 4 | Faculty loss from the first second | M | Ready |
| 5 | Interruption director | L | After 4 |
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
| `surfaced` | "Nobody in it." | Alan stays in the chair at the barrier, and you're the one who leaves. |
| `tower-won` | Institutional record | One closing line handing over to the van, after the record. |

**Done when**
- [x] Cold, Bitter, Gone, The Other Recordist and Exit Through the Gift Shop play
      through coda, drive and credits to the return report, in the real game.
- [ ] The Other Door has not been run end to end. It needs a completed Source IV
      journey. The wiring is the same and it has a spec.
- [x] Letting go of the controls still finishes. Holding only the throttle cannot
      end on a guardrail, because a lane assist works while nobody is steering.
- [x] Holding E skips it. Window panes left by the ending are cleared first.
- [ ] Not verified: Tauri build, the feel of the steering, the mix. Nobody has
      heard it.

**Found while building:** today's flow never reaches the `out` coda. `finishEnding`
only lets The Other Door through once Source IV is complete, and that path goes
straight to credits. So The Other Door now goes from the grey door to the wheel,
and the new line in `out` waits for that coda to be reachable.

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

## Stage 9: collapse audit

Go through all 1,985 authored lines, plus the epilogues, against rule 1. List lines
that kill a reading. Keep a ledger with components as rows (Surfer, HUSH, coffee,
guard, doors, moon) and mechanisms as columns, each cell citing its evidence.

## Stage 10: outside checks

| Check | Passes if |
|---|---|
| Strangers, 5–8, unspoiled, today's build: "what is this about?" | Baseline only |
| After Stages 4–8: "what is the Surfer?" | Each gives at least two explanations, and they disagree with each other |
| "What was that place?" | Most answer with a person, not a building |
| Hospice nurse reads the interruption list | Nothing left marked "would hurt a family" |

## Decisions still open

- **A.** Do the terminal endings get the same drive? Recommended: yes.
- **B.** Cut the prologue's fate hub? Recommended: yes.
- **C.** Should Alan ride in the van in `surfaced`? Built for now with him staying
  at the barrier, because no passenger model exists.
