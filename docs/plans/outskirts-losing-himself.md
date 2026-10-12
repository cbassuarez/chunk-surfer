# The outskirts, retold: losing himself

Decided with Seb, 2026-09-14, iterating on the repeating arrival road
(`src/data/source-outskirts-arrival.js`) and the 1988 phone box
(`docs/plans/phone-box-1988.md`). Everything here was chosen, not assumed.

## What the walk is

- **About losing himself.** By the tape, the arrival night has become him. Not
  guilt closing in, not a chase.
- **The length is the point.** Keep about 1 km and 29 passes, with no
  shortcuts. Polish what's there.
- **The road ends in one lone, faulty streetlight** on one thing: his DA-1000,
  on the tarmac, playing back.

## The recording under the last light

- **Content:** early days, the two of them out at night with this same recorder,
  narrating an ordinary street like a nature documentary. Voices for the lamps
  and the bus, laughing, her taking the mic off him. Joie de vivre; innocent
  intimacy turned outward.
- **Audio:** script only for now. Room tone and tape hiss play, and the voices
  are Seb's to record. The scene and its cue points are written and timed.
- **It plays out**, and he can't stop it. The light fails on the last word, and
  in the dark he's standing on the tape.
- **Reward:** nothing but the recording. Errands keep paying as they do.

## Losing himself, and how it shows

- **His sound replaces the world's.** The rain, the lamps' hum and the road give
  way, pass by pass, to generated breathing and voice: his, too close.
- **His tools fail:**
  - the recorder: opens late or wrong, the transport runs by itself, the TRACE
    shows the wrong place, the counter counts down;
  - the torch: flickers, points a little off, late on lights things not there;
  - his movement: steps land late, he drifts off line, turning lags.
- **The road disappears,** down to the lamps and then one. Piece by piece the
  scene stops being there: fence, kerbs, the lodge, the road itself. The last
  passes are lamps standing in black, then only the faulty light.
- **More and more uncanny,** shown rather than said.

## The double

- **Only ever seen in reflections.**
- **Always a pass ahead,** doing what he did.
- **Reaches the light first.** From far off its reflection stands in the wet
  under the last light with nobody above it. When he walks in, he's standing
  where the reflection's feet are, and it's gone.
- **Reflections are real:** wet-road reflections, not faked sprites.

## Sarah

- **Fades mid-road.** Strong early; after the loop pass her traces go.
- **Traces of him replace them** on the late passes: his name in the ledger in
  someone else's hand, his slate on the bench, his van's plate on the car, his
  coat on the shelter.
- **The woman at the shelter is nobody.** A figure the road keeps, like the
  guard. Nothing about her points at Sarah.

## The phone box

- **Keep the escalation:** the van rings, the loop pass, himself on the line late.
- **Retune the late end:** the late call is the double's end of the line, the box
  he's in, from inside a reflection.

## There won't be another take

- **The pages stay.** They start as Sarah and gradually become about him: not
  only tonight but beyond it, and not her or Lyle but how he messed those up the
  way he messes up takes. His mistake is thinking there will be another. That
  might have been all he got.
  ("That" is Lyle and Sarah.)
- **The parable is rationale, not a mechanic.** The man in the flood waves off
  the lifeboat, the rescuers and the helicopter because he's waiting for God to
  send a sign. There are no "boats" on the road, no chances to take, and no
  change to the recorder: out here it works as it does everywhere.
- **The pages are everyone's, about him.**
  - Sarah and Lyle;
  - the building's people: the guard, the ledger's form, the office;
  - the ones who answered his calls: the student at Lyle's hall, the man at Sarah's,
    directory enquiries;
  - his own answerphone.
- **Their register is his worst moments reflected back to him:** breakup
  messages, fights, the things said at the end. Not kind, not a track sheet.
- **Form: whatever they really were.** Mixed like a life: printed texts with
  timestamps, a letter, a card torn in half, an answerphone message typed out.
  Only the phone box is pinned to 1988.
- **Specific, drafted by me for Seb to revise in the studio:** dates and details,
  the night he didn't show, what she said at the end, Lyle's last message.
- **Both sides:** his replies are there too, the excuses, the "next time", the
  "I'll ring you tomorrow", so the pattern shows.

## The end of the road

- **A short black walk.** The last lamp of the last pass goes out behind him,
  then about 60 m of nothing, with the faulty light visible the whole way,
  flickering, the reflection standing in its pool.
- **The late phone call** is his box from underwater: his own breathing and
  this box's rain, low and smeared as if heard up through wet tarmac, a beat
  late. Wordless.

## Build stages and task tracking

Built in stages. After each stage Seb gets a look, and what's left is reported.

**Stage 1: the road goes, the new breaks, the last light**
- [x] Road disappearing on a steady ramp: fence, kerbs, lodge, road itself;
      late passes are lamps in black (`GONE_AT` / `outskirtGoneAt` in
      source-outskirts-arrival.js; what belongs to something goes with it)
- [x] Break: played back (rain up for a moment via `uRainBack`, lamps on in
      reverse via `relightPassLamps`, a 0.9 s dropout of all sound). Pass 14.
- [x] Break: unfinished (pieces drawn as `set_beam` timber frames). Passes 20
      and 23.
- [x] Break: already walked (wet footprints ahead in his gait, doors open).
      Pinned to pass 17; footprints sit 30 mm up (road markings top out at
      24 mm) and glint.
- [x] Break: silent (world ducked, rain off, close breathing). Pass 24.
- [x] The black walk after the last pass (road tier 2060 → 2180 cells, atlas
      regenerated), and the lone faulty streetlight (`faultyLightLevel`)
- [x] The DA-1000 on the road under it, starting as he reaches the mark,
      holding him in the light; the light fails at the end and he is placed
      on the tape
- [x] The recording: a ~90 s script (`source-space.last-light`) with cue
      points. Plays `public/assets/audio/outskirts/last-light.mp3` when it
      exists; until then hiss and the script as placeholder captions
- [x] Specs (outskirts, payphone, source-level, audits, trace, horizon, edge
      door), source path audit, live check

**Stage 2: reflections and the double**
- [x] Mirrored prop pass under the road, seen through rippling puddle patches
      (props3d `renderPropPass({reflection:true})` into a half-size target, the
      road's own meshes left out; composite in `SOURCE_VOID_PHYSICAL_FRAG`;
      runtime `outskirtsReflection` sets how wet the road is and places the pool
      under the last light). 60 fps live. Probes: `reflection(debug)`,
      `flurryOff()`.
- [x] The double, drawn only in the reflection (`reflectionOnly` instances are
      skipped by the main and shadow passes), a pass ahead on his line, facing
      where he looks
- [x] Its reflection standing in the pool under the last light; gone once the
      recording starts
- [x] Tone check: reflected mids go down (`given*given*1.25`) so a figure in a
      lit pool reads; from 5–8 m the double stands upside down in the pool under
      the last light with nobody above it

**Stage 3: losing himself**
- [x] His sound replaces the world's: rain level `1 − .85·losing`
      (`STORY.setRainLevel`), close breathing from losing .15, a formant murmur
      from .4, the closed recorder turning over from .6. Ramp:
      `runtime.outskirtsLosing()` 0 → 1 from pass 3 to the road's end.
- [x] Recorder failing: opens late (from .4; live, 1–2 of 4 presses at pass 26),
      TRACE pointing wrong (from .5; live, SIGNAL · RIGHT and weak where pass 2
      reads AHEAD and strong), the blanked counter coming back and running down
      (from .3; applied after the trace face), faster under a TAPE RETURN label
      while it turns by itself (from .55)
- [x] Torch failing: catches (off with reduced flashing), beam yaw offset
      (`torch.yawOffset` → props3d `torchYawOffset`, the aim never moves), a
      figure in the beam for half a second late on (`setTorchPhantom`)
- [x] Movement: speed cap (`pace × (1 + .45·losing)`), long-short step cadence
      (weak step +22%), weak-step scuff, deeper bob and tip on the weak step
      (drawn only, off with reduced motion). No input lag. Live: 49 → 38 → 34
      steps per 3 s at passes 4, 16, 26.

**Stage 4: the pages and the late call**
- [x] Pages drift from Sarah to him: `flurry` (Sarah, pass 15), `flurry.lyle`
      (18), `flurry.them` (21: the guard's form, the office, the student, the
      man at Sarah's, enquiries, her sister, his answerphone), `flurry.him` (24).
      Texts, a letter, a torn card, answerphone typed out; his replies too.
      Each set bleeds into the next. The storm now starts after the loop pass,
      peaks at 24 and is gone by 28.
- [x] Sarah's traces fade after the loop pass; his replace them: the take sheet
      on the gate (`page-fence`), the track sheet on the dash (`page-dash`), take
      sheets in the bin, the slate on the bench, his van's plate on the car, his
      name in the ledger (`ledger-him`, 15 on), his coat on the shelter (`coat`,
      12 on)
- [x] The woman is nobody: her lines never pointed at Sarah and are kept; the
      ticket errand stands as it was
- [x] The late call retuned: `self-line` / `self-line-mic` are his box heard
      from underneath (`murk`: low pass and a wobbling delay on the breathing and
      his delayed voice)
- [x] Studio registry, specs (payphone, duplex, outskirts, audits, narrative
      studio, trace, dialogue corpus), source path audit, live check: page storm
      .29 / .56 / .82 / .75 / .25 / 0 at passes 16 / 19 / 22 / 25 / 27 / 28,
      the voices drifting as planned, the late box answering with `self-line`.
      Memory updated.
- [ ] Not yet done: one unbroken walk from the grey doors to the tape (every
      stage was checked by jumping to its passes)

## His movement, failing (research)

Shipped games sell a hurt body through presentation layered on top of fully
responsive control, never through lag:
- **Limp and exhaustion states cap speed and lock running** (the Resident Evil
  Danger status, Senua's injured walk). The character is slower; input isn't
  later.
- **Body language carries it:** from Resident Evil 2 on, health reads through
  the walk itself, not UI.
- **Additive offsets on top of the base motion:** an asymmetric step (one leg
  weak), a lean, a catch. Authored as offset curves over the normal walk, never
  replacing where the player aims.
- **Uneven rhythm beats a sine bob,** which reads as artificial. A long-short
  step cadence with the dip on the weak step reads as a limp.
- **Accessibility:** head bob and additive camera motion are a leading
  motion-sickness trigger (Xbox Accessibility Guideline 117). Scale them, and
  switch them off with reduced motion.

So, for him:
- responsive look and move always;
- a slowly lowering speed cap and shorter strides as the road goes on;
- a long-short step cadence in the bob, with a scuff on the weak step and
  footsteps and breath that fall with it;
- rare catches as additive position and roll offsets that never touch yaw or
  pitch aim;
- all bob and catch motion gated by reduced motion.

Sources:
- [Injured Player Character Stage (TV Tropes)](https://tvtropes.org/pmwiki/pmwiki.php/Main/InjuredPlayerCharacterStage)
- [Resident Evil Wiki: Health](https://residentevil.fandom.com/wiki/Health)
- [Hellblade Wiki: Senua](https://thehellblade.fandom.com/wiki/Senua)
- [Procedural first-person animation (Sam Reitich)](https://sreitich.github.io/fpp-animation/)
- [Walk cycle animation guide (MoCap Online)](https://mocaponline.com/blogs/mocap-news/walk-cycle-animation)
- [Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117)
- [Motion sickness accessibility (Maddy Miller)](https://madelinemiller.dev/blog/motion-sickness-accessibility/)
- **Under the last light, the DA-1000 is silent** until he's standing where the
  reflection was. Then the transport clunks and it starts.
- **The recording is always the same,** about 90 seconds. Nothing he does on the
  road changes it.
- **His voice is breath and murmur only,** with no words.
- **His movement fails without touching the controls:** no camera lag, no input
  delay. Built from how games that do hurt, stifled movement well actually do it
  (researched before building).

## How it's built

- **Reflections:** a mirrored prop pass, rendered under the road surface and
  seen through puddle-shaped wet patches that ripple with the rain. It truly
  reflects the scene, and it is the only place the double is drawn.
- **Pacing:** a steady ramp. Every effect grows continuously from pass 1 to 28,
  with no clean act breaks. Sarah's fade still centres on the loop pass.
- **The ticket errand stays, retargeted to nobody.** She still loses the return
  half and takes it back, but nothing about her points at Sarah. Late on she
  isn't there to give it to, and the shelter has his coat on it.
- **New break kinds,** added to the existing nine:
  - *played back*: rain falling upward for a moment, lamps coming on in reverse,
    a dropout of all sound;
  - *unfinished*: pieces only half there, like a set not built;
  - *already walked*: wet footprints ahead in his gait, doors already open;
  - *silent*: no sound but his breathing, too close.

## Physical street integration · 2026-10-11

The staged street now owns the figures and physical consequences. The former
random torch figure in front of the camera is retired; the torch still loses
power and its beam drifts without moving the player's aim. These are presentation
failures, not a new pursuer or an explanation of the double.

`syncOutskirtsNight` projects the letter, ticket and ledger save flags into the
runtime. Choosing to knock, reach for the lodge phone, sign, post, or return the
ticket calls the matching physical runtime action. Reading an inspection by
itself does not perform those actions. Runtime queues each sound alongside its
world change; main consumes that queue once, rather than playing it again from
the choice callback.

`src/audio/outskirts-street.js` gives the actual nearby car, lodge and bus quiet
positioned beds. Cooling metal and a muffled radio carrier/pips belong to the
parked car; electrical hum belongs to the lodge; settling air belongs to the
bus, whose engine remains off. Finite air releases, coat/paper rustles, footfalls,
glass knocks, hatch impacts, telephone bells, pen scratches, posting and ticket
handling follow their world positions and the player's facing. They use the
existing world SFX bus, including its volume, pause, mute and acoustic treatment.
They stop when their sources go, on Source teardown, and on a new run. No new
spoken lines or synthetic clock voice have been invented.

The final recording's script and cue times are unchanged. Its playback progress
is written to Source state roughly once a second and on pause; a restored run
continues at that offset. Real audio starts at the saved offset. Until
`public/assets/audio/outskirts/last-light.mp3` is supplied, only hiss and the
remaining timed, unvoiced captions play. Caption timing follows the audio clock,
so gameplay pause cannot consume the memory. A completed recording never starts
again on reload. Warps and new runs cancel its pending decode, playback and
handoff timer.

The real, intimate recording by Seb and Sarah's performer remains an asset
requirement. Procedural foley and lifecycle tests do not verify its performance,
final mix, or the emotional effect of the complete unbroken walk; those still
need listening and a full playthrough.

The street now has a stable carriageway, connected pavements, drains, masonry
and rail boundaries. New bus, shelter, lodge and car shells have actual openings,
interiors and close hardware. Vehicle steps use their visible heights. Explicit
shell and seat colliders replace whole-building bounds; ground paper and wet
footprints remain passable. Painted metal, coachwork and iron use the existing
street texture sets in the production prop renderer.

Pass eight places the bus across the street, with a 1.7 m physical opening at
its nose (1.2 m for the body's centre). Visible rails close the other routes.
The woman remains inside the bus at the gap. Watching from afar cannot consume
the close movement; approaching turns her toward the player and opens the real
door. A single footstep follows crossing. Encounter stages, vanished guards,
actions and extinguished lamps survive a save. The reflection replays recorded
positions, turns and pauses from the preceding pass on its own recorded clock.
The new road is excluded from the mirrored pass so its underside cannot hide
that replay.

After the lamps-only final repeat, the distant tape beacon fades away. At the
end of the black approach, remnants of the service railing converge on the
recorder's pool and a visible stop rail. This replaces the invisible playback
cage: the player can retreat while the recording continues. Its existing final
dark handoff places him onto the tape. The service threshold is a physical
addition to the original lone-light staging.

Developer review stops cover the bus approach, the close windscreen encounter,
the lodge hatch and Last Light through the production shader. The continuous
headless route covers 1,120.5 m through all 29 passes, preserves state across a
halfway reload, submits the staged changes, and checks the final threshold
across the complete field width. This verifies movement and render submission;
it does not substitute for listening or an uninterrupted first-person playthrough.
