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
- **Who is in the mirror is unclear on purpose:** you, the Surfer, Lyle or
  Sarah, "or it could be a daisy or an ant or something". The text never decides.
- **It is entered as an interruption.** Not a Source door, not a drive.
- **The score and the recorded street are not needed.** The tape walk can go.
- **The recursion is wanted. The lens-pass version of it was not convincing.**

## 2. What stays: the route contract

The reducer in `chunk-surf-state.js` is untouched. The new Horizon raises the
same three events the bust does now:

| Event | Today | In the mirror |
|---|---|---|
| `HORIZON_BUST_RECOGNIZED` | the eyes earn the audience (`profile.marbleEyes`) | the figure in the mirror looks back at you |
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

**The mirror is a window, not a reflection pass.** Behind the glass is a mirrored
copy of the stage, built by us, so the "reflection" is free to disagree with the
room: the tower stands only on that side, and the figure is not the player's body.
The water reflection pass in `props3d.js` is for horizontal planes and is not used.

**The recursion, done in geometry.** In the copy behind the glass there is a
mirror too, and behind that one another, each smaller and a little later. This is
the *Print Gallery* nesting done as rooms you could walk into, not a screen warp.

**The figure is never settled.** It does not copy him. It is late, or early, or
turned the wrong way. Between one look and the next it can be someone else: his
own body, the Surfer, Lyle (he/him), Sarah, a daisy, an ant (the field's ant,
`memory-field-ant.js`, at the size of a man, or a man at the size of an ant). The
change happens only off-camera or on a blink, the way the emergency apparitions
move only in the dark.

## 5. The offer

The bust's audience tree (`horizon-bust.js`) becomes the figure's: identity,
history, route and consequence can still all be asked before anything is touched,
and the bargain's warning is still said in full. The answers are rewritten so that
no line pins down who is speaking.

- **Without the eyes** the figure cannot see him. It looks past him; the tower
  behind it is dark; the refusal beats play; walking on is the only way.
- **With the eyes** it finds him, and the tower lights.
- **Accepting is walking into the mirror.** Crossing the glass commits
  `accepted` and comes out on the tower road.
- **Walking on past it** commits `declined` and comes out on the chapel road.

## 6. The way in and out

The field interruption already has the whole pipeline: `beginMemoryField` →
`startNeural('enter')` (the light comes up, his hands aren't his) → a
self-contained scene → `startNeural('emerge')` on the way back. Horizon becomes
another visit on it, of the "stuck" kind in `last-minutes.md`, with three changes:

- **Fixed, not random.** It fires on one verb at the field edge, where the
  machine used to stand, never by the director's rate.
- **It saves.** Seeps never touch the save; this one commits the route.
- **Waiting still gets you out**, as every stuck visit must. What waiting does is
  an open question (section 8).

## 7. Stages

1. **The stage, in the engine, nowhere near the live route.** Mirror, unwound
   frame, the copy behind the glass with the tower and the nested mirrors, the
   figure and its changes. Reachable only from a probe. Captures from the
   player's eye for Seb to judge.
2. **The offer.** The rewritten tree, the eyes gate, the bargain's return, Reduce
   Dread.
3. **Wiring.** The interruption on the field-edge verb, the three events, coming
   out onto the right road. The old tape stays behind a switch.
4. **Removal and checks.** The tape, score and machine go. God presets, the
   endings/progression/source-path audits and the horizon specs are moved over.

## 8. Open, for Seb

1. **The verb.** The first [E] at the field edge where the machine stood, or
   just reaching the edge?
2. **What waiting does.** Walking away is declining. Does standing still for
   long enough also decline (the mirror clouds over, only the chapel road is
   left), or does the mirror wait for ever?
3. **The eyes gate.** Keep it as is (no eyes, no offer)?
4. **The voice.** One voice whatever is in the mirror (`unknown`, the mouth he
   can't account for), or does it change with the figure, a daisy included?

[bust-bargain]: the bargain wired 2026-09-02; see `resolveCathedralLoss`.
