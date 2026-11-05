# The work order

Decided with Seb, 2026-11-04. Section 1 is his. Everything marked **Proposed**
is mine and open to change. Layout candidates, baked through the real paper
pipeline: `artifacts/work-order-layouts/` (gitignored), on the canvas at
https://claude.ai/artifact/SFFb9j6DRES3kZRAVKEfxN

## 1. Rulings

- The work order becomes a clear, readable form, more like UI. It is still
  printed by the paper pipeline and shown through the paper shader (`paper3d`).
- After a recording he checks it off, like a level-clear screen: a tick and a
  strike-through for a clean take, and notes in his own hand, legible, when the
  take went wrong or has to be done again.
- **The check-off happens in the live room.** The world keeps running while he
  writes. That is the vulnerability.
- Difficulty must be clear, chosen in the van cab, among the first things you
  touch.
- **Tape is whole cassettes.** Every attempt uses one, kept or not.
- **Out of cassettes, you can still record, but only over a take you already
  have.**
- **The client rejects weak takes.** Only clean takes count toward the five.
  A weak one has to be done again or the account stays open.
- Tape connects to contact (losing your things), to finding more in B3, and to
  difficulty.
- What the sheet records feeds the ending metrics.
- **Layout: a mix of B and C** (2026-11-04, second pass). Two mixes are on the
  canvas: BC1, B's sheet typed throughout, and BC2, C's typed checklist at B's
  scale. Awaiting the pick.
- **The level check is recorded on cassette 1, and the first take goes over
  it** (normally B3).
- **Being taken costs cassettes on Contract (rarely), Night Shift and Dead Air
  (more), never on Story.** He comes for you more on the harder shifts.

## 2. What exists today

| Thing | Where | State |
|---|---|---|
| Work order text | `WORK_ORDER`, `src/data/conservatory-script.js` | Prose letter, three sheets |
| Its paper | `scripts/build-paper-assets.mjs` (`templateWorkOrder`), `assets/paper/inspect/work-order-*` | Baked offline; biro marks are baked too |
| Paper shader | `src/render/paper3d.js`, `src/game/document.js` | Samples page + material textures. No runtime ink |
| His handwriting | `strokes` in `tools/chunk_surfer/build-opening-cab-objects.mjs` | Single-stroke capitals, A–Z only |
| Reading it in the cab | `job-papers` in `src/game/opening-cab-inspection.js` | First cab object |
| Difficulty | `src/progression/difficulty-defs.js`, chosen at the rear workbench on TAKE CASE | Four presets: Story, Contract, Night Shift, Dead Air |
| Tape | `src/game/playback.js` | One continuous tape, no limit. A spoiled take rewinds and costs nothing |
| Losing things | `takeAnItem()`, `LOSABLE` in `src/main.js` | Being taken loses recorder, torch, map or radio into a room |

## 3. Proposed

**Cassettes issued per shift.** Story 12, Contract 8, Night Shift 6, Dead Air 5.
Five rooms, so Dead Air has no spare unless you find one or record over.
Built in `src/game/cassette-ledger.js` (not wired yet). The printed strip needs
twelve boxes for Story; the two B3 cassettes are written in after the issued ones.

**Loss when taken.** Contract 1 in 6, Night Shift and Dead Air 1 in 2. The lost
cassette is chosen from everything he carries.

**What a take is worth.** From data the take already keeps (`discrete` events,
`presence.peak`, `contaminated`, the spoil trip):

| Outcome | When | On the sheet |
|---|---|---|
| Clean | Sixty seconds, nothing the client forbids on the tape | Tick, strike the room, `4 CLEAN` |
| Rejected | Sixty seconds, but breath, handling, clothing or the presence is audible on it | No tick, `3 BREATH 0:41 - REJECT. REDO` |
| Spoilt | The take died before sixty seconds | No tick, `2 SPOILT 0:23 HANDLING` |

The rejection floor sits below the spoil trip and follows the shift's existing
`recordingForgiveness`. A rejected take is still on its cassette.

**The check-off.** After every take that ends, the sheet comes up low on one
side, off the DA-1000's centre, and the pen writes in real time: tick, strike,
note, cassette slash, a few seconds in all. The room stays live and HUSH can
come. Lowering the sheet early is allowed; the ink is already on it next time.
Reduced motion: the marks appear without the stroke animation.

**The ink layer.** His marks are drawn at runtime into a texture in page space,
using his stroke hand moved into a shared module (with digits and `: - + / ?`
added), and composited as biro inside `paper3d`. The printed form stays baked.

**Choosing the shift.** On sheet 1 of the work order, read in the cab: tick a
shift, sign RECEIVED. This replaces the choice at the rear workbench. Shifts
not yet unlocked print as not offered. Signed means locked, as today.

**Contact.** The lost cassette is placed like any lost item and found the same
way. A cassette with a take on it loses that take with it, and finding it gives
the room back.

**B3.** A tape store in the studio has two blank cassettes, found once.

**Recording over.** With no blank left, the DA-1000 asks which cassette to
record over, rejected and spoilt ones first. Recording over a clean take
un-ticks that room: he strikes his own tick and writes `ERASED`. The cab note
"DON'T ERASE THE FIRST TAKE" is his.

**The first take.** The first take of the night goes over the level check on
cassette 1, wherever it is recorded. If it fails, the next one takes cassette 2.

**Ending metrics.** `buildRunSummary` gains a `workOrder` record: shift, issued,
used, lost, found, rejected, spoilt, erased, rooms accepted, and the notes. The
return report shows the sheet as he left it.

## 4. Order

| Stage | What | Status |
|---|---|---|
| 0 | Pick the layout | BC2, 2026-11-04 |
| 1 | His hand and the live ink layer | Built: `src/data/recordist-hand.js`, `src/game/work-order-ink.js`, `src/render/work-order-ink-canvas.js`, `uInk` in `paper3d.js`, ink in the reader's flat and fallback views |
| 2 | Sheet 1 in the bake | Built: `templateWorkOrderChecklist` from `src/data/work-order-sheet.js`; the instructions are sheets 2–4 |
| 3 | Cassette ledger, saved and wired | Built: `save.cassettes`, signed at the lodge line, level check on cassette 1, every attempt filed in `stopTake` |
| 4 | Clean / rejected / spoilt | Built: `src/game/take-acceptance.js`. **Proposed numbers:** rejected at 85% / 60% / 45% of the spoil line for pause / standard / strict forgiveness; a take called off in its first 2 s uses no cassette |
| 5 | The check-off in the live room | Built: `src/game/work-order-checkoff.js`. The sheet comes up close on the left and follows the pen; world runs, walking waits until he lowers it |
| 6 | The shift on the form in the cab | Built: reading the work order in the cab offers T TICK A SHIFT (the existing shift selector); the tick and the count go on in ink and the choice is locked. TAKE CASE finalises it. A run that skips the cab can still choose at the workbench; that shift is inked when TAKE CASE finalises it |
| 7 | Contact and the B3 store | Built: being taken may lose a cassette (Story never, Contract 1 in 6, Night Shift and Dead Air 1 in 2), placed in a room and found by walking over it; a clean take on it stops counting until then (`lost` on the tape, saved). The B3 session flight case has two blanks in its lid pocket, once |
| 8 | Recording over | Built: out of blanks, a picker lists every cassette he has, spoilt and rejected first, and says which room a clean one would erase; "Not yet" leaves the take unrolled |
| 9 | Ending metrics and the return report | Built: the run summary carries `workOrder` (cassettes, clean/rejected/spoilt, lost, recorded over, blanks, his notes, account satisfied at five clean rooms); the return report prints a CASSETTES section |

**The chapel finale** counts its room however the fight ends and now files that minute on a blank, or over a spoilt or rejected cassette; it never erases another room, and with nothing else left it uses no cassette.
The paper bake now skips documents that have their own isolated edition (the two student-strike records); a full bake used to put them in the shared catalogue too.
