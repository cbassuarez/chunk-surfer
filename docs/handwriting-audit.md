# Handwriting audit

Every piece of handwriting in the game, in one place. The point of this list:
each item can be rewritten by hand, photographed or scanned, and dropped back
in as a replacement image. Pickup pages are excluded for now (they get their
own pass later).

Legend:

- **[baked]** — exists as a texture/mesh in an asset; redo = replace that image/mesh bake.
- **[live]** — drawn at runtime from text through the game's own hand font; redo = replace the glyph table or the look of the strokes.
- **[diegetic]** — handwriting described in prose but never shown; nothing to redo unless we decide to render it.

---

## 1. The works order (the sheet)

**The deliverable for printing is ready:** `output/handwriting-handoff/`

- `work-order-print-clean.pdf` — the printed form only (paper stock + stationery), 4 × A4. Print this, write on it, rescan it.
- `work-order-print-game-look.pdf` — the same pages with the current in-game wear, as a look reference.
- One PNG per page per variant, `work-order-{clean,game}-{0..3}.png`.

What is printed on the form (typed, not handwriting — stays as is):

- **Sheet 1 (page 0)** — W. ELLERY / WORKS letterhead (Calder Works, Bradford Road, Brighouse HD6 4AA, phone/fax), `WORKS ORDER`, `Works Ref. 4417-C`, SITE `Ellery Conservatoire of Music (condemned)`, WINDOW `one night. Demolition begins 06:00 Thursday.` Then the form: SHIFT tick boxes (`STORY — 12 CASS. — easier`, `CONTRACT — 8 CASS. — recommended`, `NIGHT SHIFT — 6 CASS. — hard`, `DEAD AIR — 5 CASS. — very hard`); ROOMS checklist (`1 STUDIO B3`, `2 THE NATATORIUM`, `3 THE CONCERT HALL`, `4 THE PRACTICE WING`, `5 THE CHAPEL`), each with two ruled lines; CASSETTES strip (14 boxes, numbered 1–14, `ISSUED` line); `Rejected takes are not paid. Cassettes are not replaced.` / `Five clean minutes received satisfies the account.`; `RECEIVED BY CONTRACTOR` signature line and `TIME` line; footer `W. ELLERY / WORKS · JOB 4417-C · SHEET 1 OF 4`.
- **Sheet 2 (page 1)** — `WORKS ORDER — INSTRUCTIONS` (the key-ring / do-not-force / building access instructions).
- **Sheet 3 (page 2)** — `WORKS ORDER — CONTINUATION` (continued instructions).
- **Sheet 4 (page 3)** — continuation end, `When five clean minutes are received, the account is satisfied.` and the signature block `W. Ellery Holdings, per pro.` — in-game this carries the printed `(signature illegible)`; the clean print leaves the line blank so a real illegible signature can go in by hand.

**What he writes on sheet 1 during the night [live]** — `src/game/work-order-ink.js`, biro blue (`#22384a`), drawn stroke by stroke:

- a tick in the chosen shift box (or `CUSTOM SHIFT` written above the four),
- `ISSUED` cassette count written on the line,
- a tick / a cross / a strike through each room as takes happen, plus re-ticked-in-margin variants,
- small notes in the room bands,
- labels written under cassette boxes (his names for takes),
- a ring around a cassette box,
- the signature squiggle and the time on the `RECEIVED BY CONTRACTOR` line.

His hand itself is `src/data/recordist-hand.js` — single-stroke capitals A–Z, digits with a slashed zero, `: - + / ? , .`. It also draws the cab notes (below). If the whole hand is being redone, this glyph table is the thing to replace with real strokes.

## 2. His handwriting elsewhere

- **Cab reminders [baked]** — `src/data/opening-cab-objects.js`, `OPENING_CAB_PAPERS`. Two blue-ink notes on the dash:
  - `REBOOK THE PRACTICE ROOM`
  - `DON'T ERASE THE FIRST TAKE`
  (drawn from the same single-stroke hand table, baked by `tools/chunk_surfer/build-opening-cab-objects.mjs`).

## 3. Baked handwriting props

- **STOP LISTENING take sheet [baked]** — `assets/paper/inspect/stop-listening-take-sheet.webp` (`src/data/stop-listening.js`). One of Ellery's own take sheets, the form he fills in every night, with every field and margin written over in biro: `STOP LISTENING`, over and over, pressed hard.
- **STOP LISTENING wall writing [baked, painted not pen]** — the ear-room walls. `STOP LISTENING TO ME`, once large, once as four lines, and `STOP LISTENING` scrawl crowding — painted on in something that has not finished running. Meshes `stop_listening_writing_line / block / scrawl` in `assets/stop-listening.glb`.
- **Key cabinet tags [baked]** — `src/data/conservatory-props.js`, three brass tags:
  - **CH-04** — stamped `CHAPEL — MAIN` (a stamp, older than the ring).
  - **C-17** — `C-17` in biro, written over a scratched-out number; the only tag newer than its ring.
  - **FOH-M** — stamped `FRONT OF HOUSE — MASTER`, worn smooth.
- **Rekey ledger [baked]** — `box-office-ledger` prop (`rekey_ledger` mesh, box office wall). `REPLACEMENT LOCK — CHAPEL — CABINET C-17`; the page the player reads it from is baked in the prop mesh.
- **Guard ledger [baked + live-ish]** — `yard-booth-guard-ledger` prop in the lodge. A ruled `RETURNED` column; during the surfaced ending the player writes his name across the ruled column (and `ALAN` / `RETURNED` entries get added by hand).
- **HOME cassette and envelope [baked]** — roof/Ren (`src/data/roof-ren-dialogue.js`). The cassette label reads `HOME` in handwriting — neither a date nor a surname. The thick cream envelope carries the same cramped handwriting on the front.
- **The damaged ledger [baked]** — the guarantor-trace document beside the HOME cassette: entries with the same cramped hand, three entries still legible including ones after the signature, dated decades apart.
- **Lyle's note in the music box [baked]** — `src/data/coastal-memory-note.js`. Folded in the broken music box on the shingle, and kept under the lid: `For the part that wouldn't play.` signed `— L.`
- **The order book's pencilled number [baked]** — The Lyric's order book, brown cover, red cloth spine; a pencilled telephone number in the back that Iona recognises. Baked in the item portrait/model.

## 4. Documents that are printed, not handwritten (listed so they are not confused with handwriting)

- The students' notice and incident sheet / register entries (`src/data/student-strike-evidence.js`): `ATTACHED: STUDENTS' NOTICE`, `Acknowledge that his body was recovered here…`, internal sheet `RECOVERED`, external register `retain MISSING`, `RECEIVED BY THE OFFICE. NO REPLY FILED.` — typed, filed documents; the prologue's "in a clean hand" remark describes the register entry, which is typed.
- The recital programme in the cab (printed): `RECITAL — J. S. BACH — Chaconne — Marimba — LEAVE TIME AT THE END.`

## 5. Diegetic-only handwriting (spoken about, never shown)

- The illegible signature under `W. Ellery Holdings, per pro.` (prologue) — now the blank signature line on the clean print.
- "The public register says MISSING, in a clean hand." (prologue).
- "The signature is illegible. The authorising officer's field is blank under every carbon." (prologue).
- Ren's handwriting — "the same cramped hand that damaged the ledger" (roof).
- Iona: "There. I knew I had not imagined that handwriting." — the pencilled number in the order book (pub).

## 6. Excluded for now (as agreed)

- The pages picked up off the floor (`src/data/source-pages.js` and the objectives/bag notes) — too much for this pass.
