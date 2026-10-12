# The door fields: a station

Decided with Seb, 2026-09-14. Applies to both route door fields (chapel road and
tower road). The chapel road is done first.

## What the door fields are

- **Not a continuation of the outskirts story.** The roads past the tape are a
  hub for other realms: a station where forces enter and exit, like a spirit
  realm. The doors are the biggest hint of that already.
- **The worlds behind the doors stay as they are** (burning, flood, inverted,
  two moons, glass storm, whiteout). What needs work is how the doors are
  inhabited, and how they pop out of existence: travel mortals aren't privy to.
- **No traffic for now.** No travellers, glimpses or traces of them.

## Shared decisions

- **A door vanishing is its world taking it back.** The world behind it pulls
  the door in: the frame's edges burn, frost or blow away in that world's
  weather, and its outline hangs in the air for a moment, then nothing.
- **The outskirts creep in at the edges but cannot get in.** Way off to the left
  and right:
  - the repeating road's lamp line and its phone box, in the black, flickering,
    a little nearer each time he looks, never closing the distance;
  - the building, Ellery's elevation, lit windows, pressed against an invisible
    edge;
  - their sound, muffled, as if through a thick wall: the phone ringing,
    the rain, breathing.
- **Depth:** things to look at, and errands.
- **Quality:** better implementation, more depth, better models, polish and look.

## The chapel road

- **The nothing before the station** stays black, but it is where the edges first
  appear: the outskirts' lamps, phone box and building off to the sides, and
  their muffled sound starting. He walks into the station already hemmed in.
- **Layout:** keep the corridor of doors between the planting, and polish it.
- **Things to look at:**
  - the doors themselves, readable before they are opened: which of the
    building's doors each was taken from, its wear, and what seeps under it from
    its world;
  - thresholds, and what a taken-back door's world left behind there;
  - the chapel door: its tympanum, carvings and ironwork;
  - the edges: the lamps, phone box and building, which can be looked at from
    here but never reached.
- **The errand:** each world he crosses leaves something. Assembling them lets
  him step into the whiteout and find his childhood home. It reminds him of Lyle
  and of warmth, even though it is freezing and he met Lyle years after he left
  home.
  - **What each world leaves:** crossing a door, he comes back carrying one small
    thing found just past its threshold: a still-warm cinder, a wet shell, a
    pebble that falls upward, sand in a matchbox, a shard of black glass. They
    go in the bag like the sheet music.
  - **Assembling:** once he carries something from each of the other five
    worlds, the whiteout's door lets him walk in instead of crossing for a few
    seconds and being put back.
  - **The home:** the one lit window already across the whiteout is it. A long
    cold walk through the snow, the house getting no nearer, then suddenly there.
    He stands at the window and looks in; he does not go in.
  - **Lyle, unsaid:** Lyle's jumper, the one he used to wear sitting on the
    radiator in his hall, is drying on the radiator in the childhood kitchen,
    where it could never have been. (Lyle is he/him.)

- **The doors, before they're opened** (all of these):
  - its world seeping under it: heat shimmer and embers, water spreading, snow
    drifting in, glass dust, sand, dust falling upward from the inverted one;
  - worn by use that isn't his: handles polished by hands, thresholds hollowed
    by feet, scorch around a frame;
  - grounded properly on a threshold slab and a little plinth of the building's
    stone, not floating in the black;
  - a sound behind each, faint, up close: that world's wind, water, fire.
- **Some extra doors that can't be reached:** floating, or clipping into the
  ground, inaccessible even though they could open. Not too many. Kinds:
  - domestic doors: a front door with a letterbox and a number, a bedroom door
    with a hook on the back, a wardrobe door;
  - old station and church doors: a Victorian waiting-room door with a brass push
    plate, a vestry door with iron strap hinges;
  - doors from the building he would give anything to reach, recognisably
    themselves: "oh, if only you COULD reach the loading dock door".
- **A door taken back is slow, and he can only watch:** the world pulls it in
  piece by piece over ten seconds or more, whether or not he's there. Touching it
  does nothing.
- **Polish covers all of it:** the doors and frames up close (leaves, hinges,
  ironwork), the planting (denser, more varied, less repeated), the ground (worn
  stone or gravel along the corridor, fading at the edges), and the chapel door
  as the best-looking thing on the road.
- **Reaching the window in the snow:** composure back to full, and he keeps
  Lyle's jumper.
- **The edges:** two or three hundred metres out on either side, a little nearer
  each time he turns to look, never past a line he can't see; their muffled
  sound rises when he faces them.

## Chapel road: build stages and task tracking

Built in stages; after each, a look and what's left.

**Stage 1: the doors themselves**
- [x] Grounding: `door_threshold_slab` (worn hollow) and `door_plinth` under
      every door, as `dress:` instances so the assembly's own parts stay pure
      (runtime `doorDressing`). Applies to both roads' fields.
- [x] Wear by use: polished handle (`door_wear_polish`), frame wear per world
      (scorch / damp / sand / scour / frost; inverted wears from the top)
- [x] Each door's world coming under it: embers, water breathing, dust falling
      upward, sand fan, glinting glass dust, a snow drift with flakes. Moves
      only without reduced motion.
- [x] A faint sound of its world behind each door, up close (was already there:
      elsewhere-beds shut doors play muffled; kept)
- [x] Door inspections: the first [e] looks (`door-field-look`, label LOOK AT
      THE DOOR), the next opens it. Doc `source-space.door-field`: the
      building's door it was, joined to what comes under it. Live: works.
- [x] Unreachable doors: seven (front door, bedroom door, wardrobe door,
      waiting room door, vestry door, the dock's goods pair, the building's
      front pair), floating or sunk, looked at from afar (`door-extra` focus,
      LOOK). Live: they read in the air and half sunk off the corridor; the dock
      pair moved out over the hedge after it filled the view hanging over the
      walk.

**Stage 2: taken back**
- [x] The slow vanish (runtime `doorTakeBack` / `doorTakenBackInstances`):
      starts when he is out of the crossing, 12 s, leaves first, then head,
      then frame. Burning chars and sinks, glowing, embers rising; flood goes
      under; inverted falls upward, turning; two-moons erodes and blows
      sideways; glass-storm shatters inward, glinting; whiteout frosts and
      blows away. Its world's light and sound swell and cut
      (`doorFieldLeaks` keeps it while `taking`). Live: burning verified.
- [x] The outline in its world's light for 3 s, then nothing; the slab,
      plinth and the world's mark stay (`door_scar_burn/tide/hole/sand/glass/
      frost`). A door erased in an earlier session is simply its scar.
- [x] Threshold inspections: `door-scar` focus (priority 7, above the floating
      doors now) → `scar.<world>` in `source-space.door-field`. Spec updated:
      after walking through, the door is being taken back; later only the scar.
- [x] Live check: every crossing takes its door back and every scar look opens
      its node (whiteout, flood, inverted, burning). Seen clearly: burning,
      flood, inverted, the tide-line scar. Whiteout's take-back not yet seen
      unobstructed (a neighbouring door stood in every watch spot).
      Fixed on the way: flood and burning sank below the plinth into a field
      with no ground; both now shorten into the slab instead.

**Stage 3: the errand**
- [x] One found thing per world, in the bag: coming back out of a crossing
      sets `station.relic.<world>` (main `syncStationErrand`), the case shows
      "what the worlds left, N OF 5" with each named, inspectable
      (`station-relics`). Live: a burning crossing left the cinder.
- [x] Carrying all five: runtime `setStationHomeOpen` makes a whiteout crossing
      stay open (`doorCrossing.home`) instead of folding after 3 s; it is taken
      back only once `releaseHomeCrossing` lets him go. Spec'd.
- [x] The whiteout walk: forward input advances `stationWay.walk` instead of
      moving the body (about 40 s of walking), the crossing camera heads for the
      world's one lit house (`uWorld.w` drift, props3d leans toward x 70 /
      z 420), no nearer for most of it (`progress⁵`), then the window:
      `render/childhood-window.js` painted and printed through the game's look
      (r3dSetTableau). Kitchen, tiles, clock, table, radiator, the jumper.
      Seen for 7 s with nothing over it, then `home.window`.
- [x] Reward: composure to the ceiling, `station.jumper` → "Lyle's jumper,
      WARM" in the case (`lyle-jumper`, inspectable). Live: flags set, the
      crossing folds, the door is taken back. Composure restore not observed
      (the test run was already at full).

**Stage 4: the edges and the approach**
- [x] The outskirts' lamp line (every other lit, one catching), a lit phone box
      each side, and the building's west side, 280 m off either side, stepping
      .14 nearer each time he turns to face a side, never past 140 m (runtime
      `stationEdgeInstances`). Drawn scaled along his line of sight at 38 m,
      which projects as the real distance (the prop pass stops at 90 m and hazes
      from 52 m). Live: after four looks each side, .56 near, 202 m. They read as
      a far line of small lamps and a building on the horizon: small, as they
      would be.
- [x] Their sound through a thick wall (main `syncStationEdgeSound`): rain
      and breathing under a 420 Hz low pass, a muffled phone ring every 9–16 s,
      louder and panned toward the side he faces. Not yet listened to.
- [x] The black approach: the edges stand there from the tape end onward
- [x] Edge inspections (`station-edge` focus, lowest priority, whichever side he
      faces → `edge.building` / `edge.lamps`); the chapel door looked at first
      (`door.chapel-oak-pair`): stone jambs and arch of voussoirs, a tympanum
      relief of seven little doors with the middle one cut through and a bell
      over them, strap hinges, studs, ring handles, a stone step, two lanterns
      lit and flickering. Live: both looks open.
- [x] Polish: a stone flag path down the corridor thinning toward the hedges
      (`station_flag`; its worn inset printed as black squares and was removed),
      denser tufts along the path edges from the allowed planting meshes, hinge
      knuckles on every field door's frame
- [x] Live: whiteout, glass storm and flood take-backs seen unobstructed; the
      way home restores composure (set to 20, back at the ceiling of 40 after
      the window) and leaves the jumper in the case
- [ ] Not done: one unbroken walk from the tape end to the chapel door (every
      stage was checked by jumping to it); listening to the edge sound

## The tower road

Decided with Seb, 2026-09-14.

- **Its character: the service side.** Where the chapel road is the
  concourse, this is where the station is kept: doors stored, repaired,
  half-assembled, frames stacked, a workbench.
- **Key doors: their taking back answers the tower.** Still unmarked. When a
  key door is taken back into its world, the tower door's lock turns over
  audibly and a bell in the passage sounds, so the player learns which ones
  mattered after the fact.
- **Edges: St Brendan's, and the chapel road.** To one side, the cathedral's
  tower far off with its belfry lit; to the other, the chapel road's lanterns
  and door field seen across the black, like a platform opposite. Both nearer
  each time he looks.
- **Errand: the ring, rung, and a homecoming of its own; this one can be
  long.** The passage's bells can each be struck, and ringing them in the order
  the key doors were taken back opens something in the belfry room. There is
  also a second personal errand, like the whiteout home, tied to a different
  world and someone else in his life. The tower road is the long, hard,
  punishing route, taken for some reason (achievements, story); so there has to
  be story here.
- **Whose story: himself as a boy, and the last recordist, back to back.** The
  errand starts with the boy, and it turns out there is a connection between
  him and the recordist before him.
- **Its worlds: not the chapel road's.** The tower field gets its own set of
  worlds: one kept from the chapel's six, the rest new. More degraded, with more
  problems, and at least one that works with the story.
- **Service side, all of it:** doors in store (stacked, tagged, wrapped),
  half-built doors (a frame with no leaf, a leaf on trestles), a ledger of doors
  (every door listed by world, the taken-back ones crossed out, his included),
  and a workbench and tools (a leaf clamped half-planed, hinges in a tin,
  shavings, a lamp nobody put out).
- **Length: one long set piece.** Short to unlock, then one long, slow sequence
  inside its world.
- **The connection:** the DA-1000 he carries was the last recordist's, who gave
  it to the boy; and the last recordist is still in there, waiting, still
  recording.
- **The tower road's worlds:** the flood (kept from the chapel road), and four
  new ones:
  - a school hall, snowed in: the roof gone, snow on chairs set out for a
    concert, the stage lights still on (the boy's world, where the story
    starts);
  - a field of tape: magnetic tape unspooled over a landscape like dead grass,
    reels as big as hills, the wind making it sing;
  - the building drowned in ash: Ellery far in the future, half buried, its
    towers the only thing above the ash;
  - a dead broadcast: a plain of television snow, flickering, a transmitter mast
    whose light still blinks.
- **Its doors misbehave:**
  - crossings go wrong: some put him back somewhere else in the field, facing
    the wrong way, the door gone from where he left it;
  - worlds that fail: some open onto a world that stutters, tears or goes to
    black for a moment;
  - doors that shut and lock him in: he has to find another door close by to
    open again, and it lets him out not into tower space (at least not at
    first) but into another land. This can be part of the errand.
- **The other lands are built from the game's own kit:** real walkable places
  made of the building's props and the station's doors, in the new worlds'
  weather, with collision, inspections and the full look.
- **The set piece runs hall, tape, broadcast, ash, and back to the hall.**
  Locked in, out into the snowed-in school hall and the boy; through the field
  of tape; across the dead broadcast toward the mast; to the building drowned
  in ash, where the last recordist is still recording; and back to the hall.
- **The last recordist, found:** their back, still working. Headphones on, a
  DA-1000 identical to his, levels moving; they never turn round. What they are
  recording is heard through his own recorder.
- **Reward:** the recordist's tape, a take on his DA-1000 playable later in the
  run with a flag endings may quote; and an advantage for what is past the tower
  door: the cathedral fight starts in his favour (the bell alarm at zero, the
  first exchange his).
- **Back in the hall, the second time:** from the back of the hall he watches
  the last recordist hand the boy the machine. He can't reach them before it's
  done: the world is unstable and collapses.
- **About half an hour** to play.
- **Between lands:** every land has one of the station's doors standing in it;
  walking through leads to the next land. The last, back in the hall, leads
  out onto the tower road where he was locked in.

## Tower road: build stages and task tracking

**Stage T1: the service side and the key doors**
- [x] Doors in store: the building's frames and leaves stood against the hedges,
      leaning back, tagged, some wrapped in paper (runtime
      `stationServicePieces`, `stored_door_wrapped`, `door_tag`); kept clear of
      the bench and the half-built doors
- [x] Half-built doors in the field: a frame alone, a leaf on trestles
      (`door_trestle`)
- [x] The workbench: a leaf clamped half-planed, a tin of hinges, a plane on its
      side, shavings on the bench and ground, a hurricane lamp lit and
      flickering (`station_workbench`, `station_work_lamp`)
- [x] The ledger of doors on a lectern (`door_ledger_lectern`): main
      `openDoorLedger` writes every field door's number, building door and world
      from the live list, TAKEN BACK against the ones gone. Live: the key doors
      show TAKEN BACK after crossing. World names are the chapel set until T2
      gives this field its own.
- [x] Key doors answer: main `syncTowerKeyAnswers` sees a key door start being
      taken back and plays a synthesized passage bell (`passageToll`), then the
      tower lock turning over (keys + door, low). Live: both key doors answered;
      the tower door unlocked. Not yet listened to.
- [x] Inspections: `station-service` focus → `service.*` in
      `source-space.door-field`. Live: ledger, bench, trestles and lone frame
      all open.

**Stage T2: the tower road's worlds and its misbehaving doors**
- [x] Four new worlds drawn in `elsewhere-glsl.js` (v==6..9) with beds of their
      own, plus the flood kept: `TOWER_WORLD_SET = [1, 6, 7, 8, 9]`, the chapel
      road keeping `CHAPEL_WORLD_SET`. Live, stood inside each:
      - the school hall: rows of chairs, the stage and its lights, no roof,
        snow coming down into it;
      - the field of tape: reels the size of hills with flanges and wound drums,
        tape combed into the distance, snarled loops standing out of it;
      - the building in ash: Ellery's range buried to the first-floor sills,
        window slots going under, its two towers clear of the dunes;
      - the dead broadcast: a static sky, a streaked plain, the lattice mast
        with its guy wires and a light that blinks.
      Seep and scar words written for all four.
- [x] Crossings that go wrong (seeded, ~1 in 3 tower doors): main `putBackWrong`
      puts him out somewhere else along the corridor facing back the way he came.
      Live: in at (-4, -4075), out at (-7, -4143), 34 m away.
- [x] Worlds that fail (seeded, ~1 in 3): `crossingFailure` drops the reveal to
      nothing at three seeded moments and brings it back. Live: the world tears
      at the edges and goes out twice while he stands in it.
- [x] The door that shuts behind him: one seeded tower door (`door.lockIn`)
      keeps its crossing open instead of folding. A door shutting and a lock
      turning are heard, and a second door stands out in that world about
      twenty-six metres off (`uWayOut` in the shader, through
      `renderSourceCrossing({wayOut})`). Forward input walks him at it for about
      twelve seconds; reaching it opens it, sets `station.lockIn.seen` and puts
      him back on the road. Live: no errors, walk advances, flag set, returned.
      T4 sends that exit into the school hall instead of the field.

**Stage T3: the edges**
- [x] The chapel road's edge machinery made route-aware (`stationEdgeInstances`
      takes the route; the frame, the focus and the sound now serve both roads).
- [x] One side: St Brendan's itself (`st_brendan_church`, drawn 3.4x so it reads
      as a cathedral rather than the parish church it is modelled as), its belfry
      lit and flickering. Looked at: `edge.tower`.
- [x] The other: the chapel road across the black — its door frames, its hedge
      run and its lanterns, the lanterns being what carries at that distance.
      Looked at: `edge.chapel-road`.
- [x] Nearer each look, never past the line, and the same muffled bed as the
      chapel road's edges (rain, breathing, a phone ringing, panned to the side
      he faces). Live: 260 m to 182 m over four looks each way, 40 edge
      instances drawn, both looks open, no errors. Not listened to.

**Stage T4: the optional recordist walk (selected revision, October 2026)**

The saved design choices supersede the earlier thirty-minute set piece and
forced lock-in above. One unbarred service invitation remains available on
every tower-road seed. It can be passed or entered voluntarily; an early return
keeps it available. The compact connector was the saved tape selection.

- [x] One continuous floor: snowed-in school hall, a short service connector,
      the ash workroom, then the same hall. Its placement follows the current
      bell road rather than the former absolute coordinates. Collision,
      movement, view, listening and stage are saved with the body.
- [x] A seated boy, a loose lead from his chair, three distant reels beside the
      clear connector, the mast beyond the service window, and the previous
      contractor at work with his back turned, headphones on and a moving level
      on the recorder. Actual mesh geometry, anchored lamps, snow and ash use
      the ordinary renderer.
- [x] Raise the DA1000 beside the contractor without blocking movement. Partial
      listening resumes at the corresponding point in the same fixed recording;
      nine seconds includes its two bell notes. Reload retains the evidence.
- [x] Returning to the hall changes its occupants. Approaching the boy starts
      the four-second handover; the independent recorder moves into his lap.
      The room then loses its furnishings over six seconds. Floor and lit exit
      remain usable, including with reduced motion.
- [x] The last door restores the exact entrance position and view. Completion
      retires this invitation. Old lock-in saves migrate to supported ground.
- [x] The ring answers the two notes once at the final clearing. The two
      distinct key-door answers withdraw the two actual tower-lock bolts;
      the former extra order puzzle is superseded.
- [x] The fixed recording becomes a playable archived take, preserved across
      reload without inflating ordinary work counts. Completion sets
      `station.recordist.complete` and `chunkSurf.optional.recordist`, and
      grants a first-phase Cathedral opening that explicit interaction spends
      once. Arrival does not start the encounter.
- [x] Reconcile the received tape after the ordinary tape store is restored;
      cold-starting a heard journey preserves the player's existing recordings.
- [x] Authored looks and focused runtime, save, reward, audio and mesh checks.
- [x] Chromium/Metal normal/reduced-motion walkthroughs and six actual reloads;
      the received tape, handover, safe exit and exact return pose persist.
      Targeted ordinary key visits unlock the real belfry. Results and steering
      tolerances are recorded in `artifacts/bust-route-implementation/live/`.
      Diagnostic approaches were used; a full earned campaign and native Tauri
      acceptance are outside this verification.

The other selected route revisions retain the quiet trial with saved clearings,
make the Bust's commitment and final defeat explicit at the seal, and keep
service repairs causally tied to the doors they answer. The recordist walk does
not replace the Source palette or add another required ordeal.

## Order

1. Chapel road: questions specific to it, then a plan and a staged build with
   checklists.
2. Tower road, the same way.
