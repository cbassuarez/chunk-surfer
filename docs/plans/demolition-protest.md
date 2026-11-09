# The demolition protest: the Friends of Ellery

Decided with Seb, 2026-11-07. Everything marked **Proposed** is open to
change. This is the scene bible for the protest outside Ellery, the one the
recordist walks past on the way in. It is the *wrong* protest — reactionary,
posh, wimpier and weirder than a strike — and it is the mirror that makes the
later student strike the *right* one. Companion docs: `work-order.md` (the
demolition deadline), `outskirts-losing-himself.md` (the road in), and the
demolition ending (chunk-surfer's "it all comes down at once").

## 1. Rulings

- The protest is a **Committee, not a strike.** They have minutes. They have
  written to the council, the paper, their MP. They hold a **vigil**, not a
  march. Nothing they do stops anything, and they know it.
- The demolition **happens.** "All at once at 6am" is real and is the
  demolition ending. The protest exists to plant the questions that ending
  detonates.
- The "all at once" is a **dodge**, not a description. A listing order was
  coming; the contractor took the building in a single six-am seizure to beat
  the paperwork. The Committee's grief is therefore also **guilt** — they were
  told the building was being saved, they signed, and then someone in a good
  coat signed the order that let it be "saved" by coming down before the ink
  dried.
- The politics are **reactionary, not progressive.** This stands in the face of
  student rights and the workers' economy. The student strike, later, is the
  justified one. The two say the *same words*; the whole politics is the
  difference in who "we" is.

## 2. The five strains (not five people — one continuum)

The horror of these people is that the five are one smooth surface, and a
single person can carry all five without feeling a seam:

- **a. Professors.** The acoustics, the architecture, the history. Genuine
  grief, correctly framed, for the wrong object.
- **b. Gnostics and sophists.** The building as a Neoplatonic form, a body,
  something whose demolition is a *desecration* rather than a civic act. They
  argue beautifully and miss the people.
- **c. Neoliberal.** "Adaptive reuse." Save the building by turning it into
  flats. This is the most insidious strain: it *is* preservation, of the shell,
  while pricing out everyone who used the rooms.
- **d. Anti-immigrant NIMBY.** "The area is changing." "Regeneration." They
  believe they are getting affordable housing or a curry shop nearby, and they
  mean it as a complaint. They blame the wrong thing and never once the
  developer.
- **e. The retvrn lobby.** Traditionalist, perennialist, a young man in a tweed
  coat who found Guénon in the library. The demolition is the modern fall; the
  building is a symbol of a golden age that never was.

## 3. The through-line figure

**Dr. [name], retired professor of acoustics.** She knows the hall's
reverberation time to the millisecond and can describe what the room did to a
cello in 1974. She also believes, without felt contradiction, that the building
is a form, that adaptive reuse would be a mercy, that "the area is changing" is
a sentence about the curry shop, and that all of it is the modern fall. She
signs the letter. Her signature is the most legible one on it. She is not a
villain. She is recognizable — the player's own aunt, or their old professor —
and that is the unease.

The rest of the Committee are **tableau, not cast**: a folding chair, a
thermos, a placard in a good serif ("SAVE THE ELLERY", slightly wrong — a
misspelling, or it names a different building), a man in a good coat who is
cold. They can be written as ghosts later; the point now is that they are
*frozen*, mid-sip, mid-sentence, forever. Nobody asked them to keep the vigil.
They are still being polite about it.

## 4. The false-prophecy register

The Committee's language overlaps the game's own horror exactly, in the wrong
key. The demolition ending pays this off: they were right about the building
and wrong about everything that mattered.

| The Committee says | The game means |
|---|---|
| "The building is a living body." | It *is* — the company, the ghosts. |
| "Demolition is a desecration." | It *is* — the Source chunks it. |
| "A form worth preserving." | The building *resists* its own end. |
| "The acoustics must be saved." | The rooms *remember* — "the only address that still knows them." |

They are grieving a **property**; the students are grieving an **address**. The
whole politics lives in that gap and is never stated.

## 5. The six-am dodge (Firestone texture)

The raw precedent is the Firestone Factory, Brentford, 1980 — demolished over
a bank-holiday weekend to preempt its listing. That is why "all in one go at
6am" reads as a *dodge*, not a description: the conservation order was coming,
and the seizure beat it. The Committee's letters, their vigil, their
"victory" — none of it mattered, and part of them knew the order that let it
happen was signed by one of their own.

## 6. The student strike as the mirror

Later, the students say the *same words* — "save the school." The difference is
the referent: the Committee means *the building as an object*; the students
mean *the people, the rooms, the address, the right to keep existing in it*.
The protest scene's job is to have already soiled the phrase, so that when the
students say it the player feels the difference in their gut and understands,
without being told, that the Committee's "we" never included the students.

## 7. Concrete swaps (for implementation, later)

**Demolition equipment** — manual, not modern:

- `demolition_excavator` → a **jib/wrecking-ball crane** (the one machine that
  can take a first bite, and stays ambiguous: crane or Source).
- `demolition_generator` → a **compressor** (for the pneumatic drills).
- Keep `demolition_scaffold_run`, `demolition_heras_fence`,
  `demolition_light_tower` (all period-fine).
- Add the **manual layer**: a wheelbarrow, a sledgehammer leaning on the fence,
  and the **brick workers** — donkey jackets, flat caps, thermoses. They are the
  ones physically inside the building, and the only ones positioned to notice
  it is resisting.

**Committee members** — a handful of tableau figures in good coats, with the
single placard and the thermos, rather than a crowd.

## 8. Model spec (what the meshes look like)

Scene plan, not to exact scale:

```
              ┌───────────────────────────────────┐
              │          ELLERY (east wall)        │
              └──────┬─────────────────────┬───────┘
      [scaffold]     │     [scaffold]       │  [scaffold]
      ┌────────┐     │                      │
 fence│wheelbarrow    │   [CRANE + ball]     │  replaces excavator
 Heras│+sledgehammer  │       jib ↑          │
      │+pick +bricks  │                      │
      └────────┘     │                      │
      [COMPRESSOR]    │   [brick workers ×3] │  donkey jackets,
        trailer       │     one on the kango │  flat caps, thermos
                     │                      │
      ───────────────┼──────────────────────┼──── road/verge
                     │   [the Committee]     │
                     │   folding chair       │
                     │   thermos · placard   │  "SAVE THE ELLERY"
                     │   the good coats      │
```

**Equipment:**

- **`demolition_crane`** — replaces `demolition_excavator`. 1980s mobile lattice
  crane (Coles/Jones look), cream + orange, wrecking ball (~0.8 m) on the jib
  tip. Footprint ~2.5 m wide × 4 m long, jib up ~18 m. This is the "machine
  [that] takes the first bite," and it stays ambiguous: crane or Source.
- **`demolition_compressor`** — replaces `demolition_generator`. Towable air
  compressor, weathered grey/yellow trailer box, one round tank, hose reel,
  faded CAUTION decal. ~2 m long × 1 m tall × 1 m wide, two wheels + jockey leg.
- **`demolition_wheelbarrow` + hand tools** — galvanised barrow, sledgehammer,
  pick, a few scaffold boards, a spill of brick rubble. The manual layer.
- **Kept as-is:** `demolition_scaffold_run`, `demolition_heras_fence`,
  `demolition_light_tower`.

**People:**

- **Brick workers ×3** — 1980s demolition gang: donkey jacket (dark wool,
  leather shoulder yoke), flat cap or woolly hat, steel-toe boots, no hi-vis
  (a yellow armband at most). One on the kango, one leaning on a sledgehammer,
  one with a thermos. The only ones physically inside the building.
- **The Committee (tableau)** — the acoustics professor (long good coat, silk
  scarf, holding the letter); the gnostic (long dark coat, a book); the retvrn
  young man (tweed, earnest); the NIMBY (anorak, shopping bag, watching the
  road). Props: folding chair, thermos, placard "SAVE THE ELLERY" with one
  letter slightly wrong.

**Fresh vs reused:**

| Model | Status |
|---|---|
| crane, compressor, wheelbarrow, sledgehammer, pick, rubble | new meshes (Blender / procedural in `build-props.mjs`) |
| brick workers ×3, Committee ×4 | new character meshes (or wardrobe re-skins of existing `outskirts_*` / `exterior_*`) |
| scaffold, Heras fence, light tower | reused as-is |

## 9. Sources (the raw material, to be read before rewriting lines)

- **Firestone Factory, Brentford, 1980** — the bank-holiday demolition.
- **The "monstrous carbuncle" speech**, 1984 — the conservationist voice raw.
- **Victorian Society / SAVE Britain's Heritage** pamphlets — the class tone of
  correct architectural grief that is also property grief.
- **René Guénon, "The Crisis of the Modern World"**, and a sliver of **Evola** —
  the retvrn / traditionalist source.
- **Temenos Academy / Kathleen Raine** — the posh-esoteric London the gnostics
  are drawn from.
- **1980s "inner city" and "regeneration"** discourse — where "the area is
  changing" and the curry shop are braided together.

## 10. What shows the result is right

- **Recognition, not smugness:** the player sees their own people in the
  Committee and feels unease, never a cartoon villain.
- **No editorializing:** the game never says "these are reactionaries"; the
  curry-shop line and the gnostic talk do the work.
- **The mirror:** the later student strike lands harder because the phrase
  "save the building" was already spent on the wrong people.
- **The re-read:** after the demolition ending, the Committee's gnostic talk is
  heard as half-true — the building *was* a body, the demolition *was* a
  desecration, but not in the way they meant.
- **Primary texture:** a reader who knows 1980s UK conservation recognises the
  Firestone dodge and the carbuncle tone without either being named.
