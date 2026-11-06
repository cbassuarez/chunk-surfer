# Horizon, rebuilt: the mirror

November 6, 2026. Replaces the look of Horizon. Its job as a route stays exactly
as it is. Options canvas: https://claude.ai/artifact/JcZVwg9MpLtF11TZwvKZG4
(rounds 1–4; H4 chosen).

## 1. Rulings (Seb)

- **Rind.** The form is Escher's *Rind*: a thing peeled into a spiral, hollow,
  floating. Chosen as "safe, but easier to inject semiotically, as it repeats an
  earlier trope".
- **H4, the double.** A mirror whose frame has come away in a spiral. The chapel
  is straight on. The tower is only in the mirror, behind whoever is in it.
- **Who is in the mirror is unclear on purpose,** and it is one of four: Sarah,
  Lyle, a daisy or an ant. His own body and the Surfer were dropped as filler.
- **It is where he gets closure, or an ultimate truth,** on his way out.
- **It is entered as an interruption.** Not a Source door, not a drive.
- **The score and the recorded street are not needed.** The tape walk can go.
- **The recursion is wanted. The lens-pass version of it was not convincing.**

## 2. What stays: the route contract

The reducer in `chunk-surf-state.js` is untouched. The new Horizon raises the
same three events the bust does now:

| Event | Today | In the mirror |
|---|---|---|
| `HORIZON_BUST_RECOGNIZED` | the eyes earn the audience (`profile.marbleEyes`) | the occupant's condition is met (section 9) |
| `HORIZON_BUST_DECIDED` accepted / declined | the palm seal, or refusing | stepping into the mirror, or walking on |
| `HORIZON_EXIT_CHOSEN` tower / chapel | the road out | where you come out of the interruption |

Also kept:
- **The bargain** ([bust-bargain]): losing the cathedral brings you back to the
  offer, with the chapel closed, three times, then `tower-lost`. Coming back now
  means coming back to the mirror.
- **Reduce Dread** keeps every figure and drops the parts that aren't kind, as
  the field does.

## 3. What goes

- The splat tape (`horizon3d.js`, `assets/horizon-tape.*`) and its unravelling.
- The scrubbed score (`audio/horizon-score.js`) and its point-source guide.
- The three-dial machine (`horizon-transport.js`). Its answers came from the
  tape, so it cannot outlive it.
- The Reliquary at Horizon. The gallery's own bust and the eyes thread stay.
- The marker lines `street-unravels` / `street-erased` need a new home or retire.

Removal happens only after the new one is playable end to end (stage 3), behind
a switch, so the route is never broken in between.

## 4. The place

One stage, not a 512 m walk. The Source void and palette. A tall mirror whose
frame is unwound into a spiral that drifts around it. The road to the chapel runs
straight past it. In the mirror, behind the figure, is St Brendan's tower, and it
appears nowhere else.

**A standing mirror, rectangular,** as in Escher's *Magic Mirror* (1946): the
captured view is drawn through a four-cornered opening, so the frame and the glass
agree exactly.

**The mirror is a window, not a reflection pass.** Behind the glass is a mirrored
copy of the stage, built by us and captured once with the tower door's machinery
(`r3dCaptureTowerView` → `renderSourceTowerView`, which reprojects it with depth as
he moves and goes full screen as he walks in), so the "reflection" is free to disagree with the
room: the tower stands only on that side, and the figure is not the player's body.
The water reflection pass in `props3d.js` is for horizontal planes and is not used.

**The recursion, done in geometry.** In the copy behind the glass there is a
mirror too, and behind that one another, each smaller and a little later. This is
the *Print Gallery* nesting done as rooms you could walk into, not a screen warp.

**The figure is never settled.** It does not copy him. It is late, or early, or
turned the wrong way, and it is never quite clear who it is. Four can be there:
Sarah, Lyle (he/him), a daisy, an ant (the field's ant, `memory-field-ant.js`).
Which one is decided by the night (section 9). While he watches it does not
change; if it is going to be someone else, that happens off-camera or on a blink,
the way the emergency apparitions move only in the dark.

## 5. What this place is for

**Closure, or an ultimate truth.** He is on his way out, and this is him
soothing himself. Whoever is in the mirror gives him the one true thing he needs
about them, or about himself:

- **Sarah:** the boundary. She never said he could, and it was hers to say.
- **Lyle:** that it never worked, and it did not have to. Lyle lived a full life.
- **The daisy and the ant:** about himself.

The truth is always given, whichever road he then takes. The route is the
offer that follows it: the old audience's shape (who, what happened, the way,
the cost) and the bargain's warning in full survive, re-voiced for whoever is
speaking.

- **The offer opens only on its condition** (section 9). Without it the figure
  still says its truth, but the tower behind it stays dark, and walking on is
  the only way.
- **Accepting is walking into the mirror.** Crossing the glass commits
  `accepted` and comes out on the tower road.
- **Walking on past it** commits `declined` and comes out on the chapel road.

There are no eyes. They were a MacGuffin: something handed over to open a route.
That function survives for some occupants and not others; the eyes as a concept go.

## 6. The way in and out

The field interruption already has the whole pipeline: `beginMemoryField` →
`startNeural('enter')` (the light comes up, his hands aren't his) → a
self-contained scene → `startNeural('emerge')` on the way back. Horizon becomes
another visit on it, of the "stuck" kind in `last-minutes.md`, with three changes:

- **Fixed, not random.** It fires when he reaches the field's edge, never by
  the director's rate.
- **It saves.** Seeps never touch the save; this one commits the route.
- **The mirror waits.** This is the one stuck visit that waiting does not end:
  standing still decides nothing, and walking on is the way out.

## 7. Stages

1. **The stage, in the engine, nowhere near the live route.** Mirror, unwound
   frame, the copy behind the glass with the tower and the nested mirrors, the
   four occupants. Reachable only from a probe. Captures from the player's eye
   for Seb to judge.
2. **The four truths and their offers.** Each occupant's lines and voice, its
   condition, the bargain's return, Reduce Dread. The writing is Seb's; the
   lines here are placeholders for shape.
3. **Wiring.** The interruption at the field's edge, the choice of occupant, the
   three events, coming out onto the right road. The old tape stays behind a switch.
4. **Removal and checks.** The tape, score, machine and the Horizon end of the
   eyes go. God presets, the endings/progression/source-path audits and the
   horizon specs are moved over.

## 8. Answered (Seb, 2026-11-06)

1. **The way in is reaching the field's edge.** No verb.
2. **The mirror waits.** Standing still never decides anything; only walking on
   declines.
3. **No eyes.** They were only a MacGuffin for giving something to unlock a
   route. The concept goes; the function may stay for some occupants.
4. **The voice changes with the occupant**, and which occupant may depend on the
   ending the night is playing.
5. **C:** the night chooses; what he brings is the fallback.
6. **Closure, not filler.** Sarah and the boundary; Lyle and never having made it
   work; the daisy and the ant about himself. His own body and the Surfer are not
   needed.

## 9. The four occupants (proposal)

| In the mirror | Voice | The truth | What opens the offer | Kind |
|---|---|---|---|---|
| Sarah | `sarah` | the boundary was hers | that he never pressed her: her refusals respected (bench question, directory enquiries) | withheld |
| Lyle (he/him) | `lyle` | it never worked, and that was all right; he finishes "the part that wouldn't play" | giving back the music box, broken from the coast or whole from the cab | given |
| A daisy | the petals, no voice | about himself: the last petal says "loves me" | plucking it to the last petal at the mirror | done there |
| An ant | his own line, no voice | about himself: it gets across | that he stopped and watched it cross in the field | done earlier |

**Lyle's conversation depends on which music box he is given** (Seb): the broken
one from the coast, its spring gone in bar 7, or the whole one from the cab seat.

Only Lyle keeps the MacGuffin (something handed over). Sarah's condition is
something he did not do. The daisy's is done on the spot, so it can always be
met.

**Who is there (C).** The night chooses first, from what it has already
recorded:
- `confession.value` names Sarah or Lyle;
- the Sarah page and the bench question;
- the coast and Lyle's music box;
- how far `last.arc` has gone (the pastoral end of the arc leans to the daisy
  and the ant).

If the chosen occupant's condition is not met but another's is, that one comes
instead. The daisy needs nothing carried in, so there is always someone who can
make the offer.

[bust-bargain]: the bargain wired 2026-09-02; see `resolveCathedralLoss`.
