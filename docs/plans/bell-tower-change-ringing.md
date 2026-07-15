# The Changes — Complete Bell-Tower Implementation Plan

## Documentation-only boundary

The next authorized change is only to create `docs/plans/bell-tower-change-ringing.md` containing this specification. Do not implement gameplay, geometry, assets or audio until separately requested.

The eventual chapter is mandatory and does not add a sixth take:

`four ordinary takes → outer chapel → Long Hall/source-space → datamosh crossing → ringing room → live bell frame → organ loft → chapel confrontation/fifth take`

---

## 1. Canonical Experience

### Chapel access

- C-17 continues to unlock the existing external chapel door.
- That door opens only into the narthex/outer chapel.
- Before four takes, the player can:
  - inspect the narthex and tower history;
  - climb to the quiet ringing room;
  - audition the stationary tenor clock hammer;
  - inspect the tied bell ropes and locked bell-chamber hatch.
- The chapel nave remains physically sealed behind an inner screen.
- The bell chamber remains locked until source-space has been completed.
- The final battle remains in the chapel nave.

### Chapter progression

1. The fourth ordinary recording completes.
2. Chapter state advances to `source_ready`.
3. The inner chapel screen becomes the explicit Long Hall interaction point.
4. The player completes the existing source-space/redaction sequence.
5. Source-space does not fold back into the corridor. Its final image becomes the first frame of a reversible datamosh.
6. Holding forward advances into the ringing room; backward input scrubs toward source-space; releasing movement freezes the transition.
7. At 100%, the transition commits and creates the tower checkpoint.
8. The Surfer begins an eight-bell full-circle ringing sequence.
9. The player climbs through the live bell frame and reaches the acoustic-shutter winch.
10. Releasing the shutters causes the current touch to resolve into rounds and the bells to stand.
11. An organ-loft route unlocks into the chapel.
12. The player may backtrack through the now-inert tower.
13. Using the recorder in the nave starts the existing chapel battle and grants the existing `lux_nova` fifth take.

---

## 2. Persisted Chapter State

Add a pure state module at `src/game/chapel-tower-state.js`.

```js
export const CHAPEL_TOWER_PHASE = Object.freeze({
  FORESHADOW: 'foreshadow',
  SOURCE_READY: 'source_ready',
  TRANSITION_READY: 'transition_ready',
  TOWER_ACTIVE: 'tower_active',
  TOWER_CLEARED: 'tower_cleared',
  CHAPEL_FINAL: 'chapel_final',
});

export function freshChapelTowerState() {
  return {
    schema: 1,
    phase: CHAPEL_TOWER_PHASE.FORESHADOW,
    ropeRoomVisited: false,
    attempts: 0,
    shuttersReleased: false,
  };
}
```

Do not persist:

- partial datamosh progress;
- feedback textures;
- active bell angles;
- score time;
- audio node state;
- player position inside an active bell frame.

### Reducer

```js
export function reduceChapelTower(state, event) {
  const s = normalizeChapelTowerState(state);

  switch (event.type) {
    case 'ROPE_ROOM_VISITED':
      return { ...s, ropeRoomVisited: true };

    case 'FOURTH_TAKE_COMPLETED':
      return s.phase === 'foreshadow'
        ? { ...s, phase: 'source_ready' }
        : s;

    case 'SOURCE_COMPLETED':
      assertPhase(s, 'source_ready');
      return { ...s, phase: 'transition_ready' };

    case 'TRANSITION_COMMITTED':
      assertPhase(s, 'transition_ready');
      return {
        ...s,
        phase: 'tower_active',
        shuttersReleased: false,
      };

    case 'TOWER_COLLISION':
      assertPhase(s, 'tower_active');
      return { ...s, attempts: s.attempts + 1 };

    case 'SHUTTERS_RELEASED':
      assertPhase(s, 'tower_active');
      return { ...s, shuttersReleased: true };

    case 'BELLS_STOOD':
      assertPhase(s, 'tower_active');
      return {
        ...s,
        phase: 'tower_cleared',
        shuttersReleased: true,
      };

    case 'CHAPEL_FINALE_STARTED':
      assertPhase(s, 'tower_cleared');
      return { ...s, phase: 'chapel_final' };

    default:
      return s;
  }
}
```

### Save integration

Add `chapelTower` to `freshSave()` and normalize it within save v3. This is an additive field and does not require a global save-version increment.

Legacy normalization:

```js
function inferLegacyChapelTower(source) {
  if (
    source.takes?.includes('lux_nova') ||
    source.encounters?.cleared?.includes('chapel')
  ) {
    return { ...freshChapelTowerState(), phase: 'chapel_final' };
  }

  if (source.flags?.['chunkSurf.completed']) {
    return { ...freshChapelTowerState(), phase: 'transition_ready' };
  }

  const ordinaryTakes =
    (source.takes || []).filter(id => id && id !== 'lux_nova').length;

  if (ordinaryTakes >= 4) {
    return { ...freshChapelTowerState(), phase: 'source_ready' };
  }

  return freshChapelTowerState();
}
```

Load rules:

- `transition_ready`: restore the player safely to the outer chapel; the inner screen restarts the transition at zero.
- `tower_active`: ignore the saved position and restore the tower-arrival checkpoint with score time zero.
- `tower_cleared` or `chapel_final`: restore ordinary saved positions and keep the tower inert.
- Any legacy save inside the newly sealed nave before `tower_cleared` moves to the nearest valid narthex cell.

---

## 3. Chapel and Tower Geometry

### Zone separation

The current chapel is one continuous `lux_nova` zone. Split it into:

```js
ZONE.chapelOuter // non-recordable narthex and ringing access
ZONE.chapel      // recordable nave/finale arena
ZONE.bellTower   // ringing room, bell chamber and organ loft
```

Add new floorplan glyphs without changing existing glyph meanings:

```js
'N': { zone: 'chapelOuter', material: 'chapelStone', ... }
'G': { zone: 'bellTower',   material: 'chapelStone', ... }
'C': { zone: 'chapel',      material: 'chapelStone', ... }
```

Expand the renderer’s zone-tint arrays beyond the current ten entries in both the world and prop shaders.

Separate the overloaded room lookup:

```js
const ZONE_RECORDING_ROOM = {
  [ZONE.studio]: 'main_b3',
  [ZONE.natatorium]: 'the_tub',
  [ZONE.hall]: 'amplifications',
  [ZONE.practice]: 'soundnoisemusic',
  [ZONE.chapel]: 'lux_nova',
};

const ZONE_ACOUSTIC_ROOM = {
  ...ZONE_RECORDING_ROOM,
  [ZONE.chapelOuter]: 'chapel_outer',
  [ZONE.bellTower]: 'bell_tower',
};

function recordableRoomAt(x, y) {
  return ZONE_RECORDING_ROOM[FP.zoneAt(x, y)] || null;
}

function acousticRoomAt(x, y) {
  return ZONE_ACOUSTIC_ROOM[FP.zoneAt(x, y)] || null;
}
```

Use `acousticRoomAt()` for HUSH propagation. Only use `recordableRoomAt()` for work-order and recorder eligibility.

### Physical arrangement

Retain the current chapel at physical origin approximately `(86,58)`.

- Narthex: chapel floor, 4.8m elevation.
- Inner screen: approximately eight authored metres south of the C-17 entrance.
- Ringing room: physically above the narthex, approximately 8.6m elevation.
- Bell chamber: same tower footprint, approximately 13.2m elevation.
- Bell-chamber roof: approximately 22m.
- Organ loft: approximately 8.6m elevation, projecting from the tower into the west end of the nave.
- A stone/service stair connects narthex to ringing room.
- A locked maintenance hatch connects ringing room to bell chamber.
- A bell-frame catwalk connects to the acoustic-shutter winch.
- After clearance, a service door connects the bell chamber to the organ loft and nave stair.

Allocate the stacked rooms at new logical coordinates beyond the existing logical drawing and map them onto the chapel’s physical footprint with `physicalOrigin`. Increase the logical plan height without moving any existing coordinates, preserving old saves.

### Doors and gates

- Existing C-17 door: unchanged key requirement; now opens the outer chapel.
- Inner chapel screen: scripted gate, never opened by C-17.
- Bell-chamber hatch:
  - locked during `foreshadow` and `source_ready`;
  - automatically released when transition commits;
  - permanently open after `tower_cleared`.
- Organ-loft service door:
  - locked until `BELLS_STOOD`;
  - permanently open afterward.
- Inner chapel screen also unlocks after the tower clears, providing a conventional return route from the nave.

---

## 4. Source-Space Integration

Change source-space from optional/coffee-dependent to mandatory for all profiles after four takes. Route-profile differences continue to affect dialogue, redaction results and ending eligibility, but not whether the chapter occurs.

Replace the current completion behavior:

```js
onComplete(completion) {
  applyChunkSurfFlags(completion);

  presentFinale(chunkSurfCompletionLines(completion), {
    slate: 'SOURCE FAULT',
    onDone: beginSourceTowerTransition,
  });
}
```

Remove:

- the coffee-only `chunkSurfMandatory()` finale gate;
- the generic chapel-area interaction fallback;
- direct source-space entry from `recordAction()`.

Add an explicit `source-threshold` interaction to the inner chapel screen:

```js
function interactChapelScreen() {
  const tower = getSave().chapelTower;

  if (completedRecordingTakes() < 4) {
    SPEECH.say(LINES.chapelInnerBeforeFour);
    return true;
  }

  if (tower.phase === 'source_ready') {
    beginChunkSurf({ forced: true });
    return true;
  }

  if (tower.phase === 'transition_ready') {
    beginSourceTowerTransition();
    return true;
  }

  if (tower.phase === 'tower_active') {
    SPEECH.say(LINES.towerAlreadyLive);
    return true;
  }

  return false;
}
```

Update the sober/rig source introduction so it no longer claims the page can simply be avoided.

---

## 5. Movement-Controlled Datamosh

Create `src/game/source-tower-transition-scene.js`.

### Scene contract

```js
{
  id: 'source-tower-transition',
  blocksInput: true,
  blocksWorld: true,
  tracksMotion: true,
  lookProfile: 'rupture',
  worldView() {
    return TOWER_ENTRY_VIEW;
  },
}
```

Extend the scene stack with:

```js
export function tracksMotion() {
  return !!top()?.tracksMotion;
}

export function worldView() {
  return top()?.worldView?.() || null;
}
```

Allow movement state to be sampled by scenes declaring `tracksMotion`:

```js
const worldCanTrackMotion =
  moveKey &&
  inRogue &&
  !paused &&
  (!scenes.blocksInput() || scenes.tracksMotion()) &&
  !onboardingBlocksMove;
```

Reset `motionInput` when the transition exits so held forward does not produce an immediate physical step in the tower.

### Progress

Use the normalized `InputManager.snapshot().moveY` axis:

```js
const CROSSING_SECONDS = 8.5;

update(dt) {
  const axis = motionInput.snapshot().moveY;
  progress = clamp01(progress + axis * dt / CROSSING_SECONDS);

  R3.r3dSetDatamoshProgress(progress);

  transitionAudio.setProgress(progress);

  if (progress >= 1) commit();
}
```

Behavior:

- full forward: approximately 8.5 seconds;
- partial analog input: proportionally slower;
- release: progress remains fixed;
- backward: progress decreases;
- progress zero: source-space remains fully visible;
- progress one: irreversible commit;
- no automatic drift;
- no keyboard-specific handling.

### Source frame

Create a deterministic source-exit renderer from the completed source-space state and flags. This allows the final source image to be reconstructed after reload without persisting pixels.

```js
const sourceFrame = renderChunkSurfExitFrame({
  redaction: flagGet('chunkSurf.correctRedaction'),
  savedRecordist: flagGet('chunkSurf.bestEligible'),
  width,
  height,
});
```

### World rendering override

While the scene is active:

- leave logical `px/py` at the outer-chapel checkpoint;
- render the tower-entry camera through `scenes.worldView()`;
- do not write tower coordinates to autosave;
- suppress HUSH, keys, objective markers and other ordinary world actors in the destination view.

On commit:

```js
function commit() {
  const next = reduceChapelTower(getSave().chapelTower, {
    type: 'TRANSITION_COMMITTED',
  });

  px = TOWER_ENTRY.x;
  py = TOWER_ENTRY.y;
  R3.r3dSetFacing(TOWER_ENTRY.facing);
  clearRenderInterpolation();

  saveCommit({
    chapelTower: next,
    px,
    py,
  });

  R3.r3dEndDatamosh();
  scenes.pop();
  startBellTowerRuntime({ retry: false });
}
```

### Render pass

Insert a datamosh pass between the pixel-mesh output and the existing final post pass.

Resources:

- source-space texture;
- live tower texture;
- two feedback textures/FBOs;
- datamosh shader;
- progress, time, reduced-motion and resolution uniforms.

Approximate fragment logic:

```glsl
vec2 uv = gl_FragCoord.xy / uResolution;
vec2 blockId = floor(uv * vec2(40.0, 23.0));
float seed = hash(blockId + floor(uProgress * 36.0));

vec2 motion = vec2(
  hash(blockId + 11.0) - 0.5,
  hash(blockId + 29.0) - 0.5
);

motion *= mix(0.002, 0.045, uProgress);
motion.x += sin(uTime * 1.7 + blockId.y) * 0.006 * uProgress;

vec3 source = texture(uSourceSpace, uv + motion * 0.25).rgb;
vec3 tower = texture(uTowerFrame, uv - motion).rgb;
vec3 previous = texture(uPreviousFeedback, uv - motion * 0.7).rgb;

float reveal = smoothstep(seed - 0.12, seed + 0.12, uProgress);
vec3 current = mix(source, tower, reveal);

float retention = (1.0 - uReducedMotion) *
                  mix(0.15, 0.78, uProgress) *
                  step(0.18, seed);

vec3 carried = mix(current, previous, retention);

float chroma = 0.009 * uProgress * (1.0 - uReducedMotion);
carried.r = mix(carried.r, texture(uTowerFrame, uv + vec2(chroma, 0)).r, reveal);
carried.b = mix(carried.b, texture(uSourceSpace, uv - vec2(chroma, 0)).b, 1.0 - reveal);

outColor = vec4(carried, 1.0);
```

Reduced-motion mode:

- disable feedback retention;
- disable motion smear and chromatic displacement;
- reveal deterministic macroblocks using the same progress value;
- preserve full forward/backward interaction;
- obey the existing flash and shake settings;
- never strobe.

---

## 6. Ring and Method Data

Create a fictional English ring of eight:

| Bell | Name | Nominal note | Approximate mass |
|---:|---|---|---:|
| 1 | Treble | B♭4 | 290kg |
| 2 | Second | A4 | 370kg |
| 3 | Third | G4 | 490kg |
| 4 | Fourth | F4 | 650kg |
| 5 | Fifth | E♭4 | 870kg |
| 6 | Sixth | D4 | 1,160kg |
| 7 | Seventh | C4 | 1,590kg |
| 8 | Tenor | B♭3 | 2,200kg |

The exact tuning may be adjusted during audio production, but the tenor remains approximately 2.2 tonnes.

Use mechanically accurate full-circle assemblies: bell, headstock, gudgeons/bearings, wheel, stay, slider and clapper. Taylor’s documentation is a component reference only; all shipped branding, inscriptions and recordings must be original. [Taylor components](https://taylorbells.co.uk/our-products-and-services/), [full-circle ringing overview](https://bellringing.org/discover-bellringing/your-first-lesson/).

### Score

Create `src/data/bell-tower.js` and a committed, validated Stedman row file.

```js
export const RINGING_SCORE = [
  { id: 'tenor-awakens', type: 'toll', bell: 8, strokes: 4 },
  { id: 'rounds', type: 'rows', source: rounds(8, 8) },
  { id: 'plain-hunt', type: 'rows', source: plainHuntMajor({ courses: 2 }) },
  { id: 'stedman', type: 'rows', source: STEDMAN_TRIPLES_84_WITH_TENOR },
  { id: 'holding-course', type: 'loop', source: plainHuntMajor({ courses: 1 }) },
];
```

Use the documented 84-change Stedman Triples composition as the finite central touch, adding the eighth bell as tenor cover. Commit its row data and source metadata; do not fetch it at runtime. Validate that it contains 84 true Triples rows and returns correctly before adding the cover. [84 Stedman Triples composition](https://complib.org/composition/155286), [CCCBR Stedman introduction](https://cccbr.org.uk/wp-content/uploads/2016/05/triples-and-major-for-beginners.pdf).

Do not call this sequence a peal.

### Place-notation generator

```js
function applyPlaceNotation(row, notation, stage) {
  const fixed = parsePlaces(notation, stage);
  const next = [...row];

  for (let place = 1; place <= stage;) {
    if (fixed.has(place)) {
      next[place - 1] = row[place - 1];
      place += 1;
      continue;
    }

    if (place === stage || fixed.has(place + 1)) {
      throw new Error(`invalid place notation at ${place}`);
    }

    next[place - 1] = row[place];
    next[place] = row[place - 1];
    place += 2;
  }

  assertPermutation(next, stage);
  return next;
}
```

Use CCCBR place-notation conventions as the parser contract. [CCCBR place notation](https://framework.cccbr.org.uk/version2/placenotation.html).

### Strike scheduler

```js
const PLACE_MS = 190;
const SCHEDULE_AHEAD_SEC = 0.20;

function scheduleRow(row, stroke, rowStartMs) {
  const handstrokeGap = stroke === 'hand' ? PLACE_MS : 0;

  return {
    strikes: row.map((bell, place) => ({
      bell,
      stroke,
      rowIndex,
      place,
      atMs: rowStartMs + place * PLACE_MS,
    })),
    nextRowAtMs:
      rowStartMs +
      row.length * PLACE_MS +
      handstrokeGap,
  };
}
```

The score, bell animation, collision volumes, audio and acoustic events must all consume the same strike records.

---

## 7. Articulated Bell Runtime

Create `src/game/bell-tower-runtime.js`.

Runtime states:

```js
'idle'
'tenor'
'ringing'
'stop_requested'
'standing'
'cleared'
```

Core API:

```js
createBellTowerRuntime({
  score,
  bells,
  audio,
  emitAcousticEvent,
  onCollision,
  onCleared,
});

runtime.start({ retry });
runtime.tick(dt, playerCapsule);
runtime.requestStop();
runtime.renderInstances();
runtime.maskingDb();
runtime.reset();
runtime.destroy();
```

### Animation

Each bell receives scheduled handstroke/backstroke strike times. Interpolate between physically authored key angles rather than using a decorative sinusoid.

```js
function bellPoseAt(bell, nowMs) {
  const stroke = activeStrokeForBell(bell.id, nowMs);
  if (!stroke) return bell.downPose;

  const phase = clamp01(
    (nowMs - stroke.motionStartMs) /
    (stroke.motionEndMs - stroke.motionStartMs)
  );

  const angle = fullCircleBellCurve({
    phase,
    direction: stroke.stroke === 'hand' ? 1 : -1,
    balanceHold: bell.balanceHold,
    strikePhase: bell.strikePhase,
  });

  return {
    bellMatrix: pivotRotation(bell.pivot, angle),
    wheelMatrix: pivotRotation(bell.pivot, angle),
    clapperMatrix: clapperLagMatrix(angle, stroke, bell),
  };
}
```

The audible strike occurs at the scheduled clapper/casting contact, not when the rope begins moving.

### Dynamic rendering

Keep GLB parts unanimated and separately pivoted:

- `tower_bell_01` through `tower_bell_08`;
- matching wheels;
- matching clappers;
- static frame and bearings;
- ropes, roller boxes, stays and sliders;
- shutter assembly and winch.

Extend `props3d`:

```js
let staticInstances = [];
let dynamicInstances = [];

export function setPropInstances(next) {
  staticInstances = next || [];
}

export function setDynamicPropInstances(next) {
  dynamicInstances = next || [];
}

function modelMatrix(instance, base) {
  if (instance.matrix) return multiply(instance.matrix, base);
  return legacyYawScaleMatrix(instance, base);
}
```

`main.render3d()` supplies `runtime.renderInstances()` every active tower frame. Clear dynamic instances outside the tower.

### Collision

Represent the player as a swept upright capsule. Represent machinery as transformed OBBs/capsules:

- bell casting/body;
- wheel rim and spokes;
- clapper sweep;
- stay/slider where relevant;
- open shaft/fall volumes.

```js
function tickTowerCollision(previousPlayer, currentPlayer) {
  const sweep = makeSweptPlayerCapsule(previousPlayer, currentPlayer);

  for (const hazard of runtime.hazardVolumes()) {
    if (!hazard.moving) continue;
    if (intersects(sweep, hazard.worldVolume)) {
      failTower({ hazardId: hazard.id });
      return;
    }
  }

  if (runtime.inFallVolume(currentPlayer)) {
    failTower({ hazardId: 'fall' });
  }
}
```

Check continuously during camera interpolation so grid movement cannot tunnel through a wheel.

### Failure

There is one checkpoint: tower arrival after the datamosh.

```js
function failTower({ hazardId }) {
  runtime.stopImmediately();

  const next = reduceChapelTower(getSave().chapelTower, {
    type: 'TOWER_COLLISION',
    hazardId,
  });

  saveCommit({ chapelTower: next });

  scenes.push(makeTowerImpactScene({
    durationMs: 600,
    reducedFlash: getSave().settings.flash !== 'full',
    onDone() {
      px = TOWER_ENTRY.x;
      py = TOWER_ENTRY.y;
      R3.r3dSetFacing(TOWER_ENTRY.facing);
      clearRenderInterpolation();
      runtime.start({ retry: true });
    },
  }));
}
```

The impact produces an abrupt acoustic cut followed by approximately half a second of absolute silence. Retries skip the source transition and extended arrival dialogue. The ring restarts with a short tenor warning before rounds.

### Completion

The player’s only required tower interaction is the shutter winch.

- Before the central touch can resolve, the winch reports that it is under load.
- Once the stop boundary is available, interacting sets `stop_requested`.
- The score completes its current valid block, returns to rounds, rings two closing rows and stands the bells in order.
- The shutters open over roughly six seconds, crossfading resonance from internal tower to exterior spill.
- When all bells are stable, emit `BELLS_STOOD`, unlock the organ-loft route and save immediately.

---

## 8. Audio, Recordings and Agency

### Three distinct bell actors

1. **Environment**
   - A stationary clock hammer can strike the tenor while the bell is down.
   - A single environmental tenor strike occurs during the second ordinary take as authored foreshadowing.
   - It does not spoil the take.
   - It is retained on playback.

2. **HUSH**
   - Once the player auditions the accessible clock hammer, it becomes an ordinary learned instrument under the existing HUSH system.
   - HUSH may wake only that isolated hammer.
   - It cannot move a full-circle bell or ring changes.
   - The take stalls until the player reaches the rope-room isolation control, silences it and returns to the recorder.

3. **Surfer**
   - The Surfer never rings during the first four ordinary takes.
   - After source-space, it controls the coordinated full ring.
   - Its full-ring events cannot be learned or mimicked by HUSH.

### Acoustic catalogue

Add:

```js
bell_tenor_toll: {
  levelDb: -4,
  durationMs: 9000,
  spectrum: { low: 1.0, mid: 0.78, high: 0.34 },
  impulsiveness: 0.82,
  family: 'bell',
  canBeMimicked: true,
},

bell_change_strike: {
  levelDb: -2,
  durationMs: 11000,
  spectrum: { low: 0.94, mid: 0.86, high: 0.52 },
  impulsiveness: 0.88,
  family: 'bell',
  canBeMimicked: false,
},
```

Full-ring event metadata:

```js
emitAcousticEvent({
  kind: 'bell_change_strike',
  source: { kind: 'surfer', id: `tower-bell-${bell}` },
  spatial: towerBellSpatial(bell),
  semantics: {
    audibleToHush: true,
    audibleToMonitor: true,
    audibleInWorld: true,
    canBeMimicked: false,
    canSpoilTake: false,
    family: 'bell',
    tags: [stroke, `row:${rowIndex}`, `place:${place}`],
  },
  provenance: {
    system: 'bell-tower',
    bell,
    stroke,
    rowIndex,
    place,
  },
});
```

### HUSH hammer playback

The existing instrument runtime loops samples continuously, which is unsuitable for bells. Extend playable-prop metadata:

```js
{
  id: 'tower-tenor-clock-hammer',
  sampleFamily: ['bell.tenor.clock'],
  acousticKind: 'bell_tenor_toll',
  hushPlayback: {
    mode: 'interval',
    minMs: 4200,
    maxMs: 6800,
  },
}
```

Refactor instrument playback:

```js
if (prop.hushPlayback?.mode === 'interval') {
  if (now >= instr.nextTriggerAt) {
    playInstrumentOneShot(prop, sample);
    emitInstrumentAcousticEvent(prop);

    instr.nextTriggerAt =
      now + deterministicInterval(
        prop.hushPlayback,
        PROPS.currentHushSeed()
      );
  }
} else {
  maintainExistingLoopPlayback();
}
```

The hammer uses the normal reachable/auditioned HUSH selection rules. Do not add a special bell-only selection system.

### Recorded bell events

Extend `src/game/playback.js` with discrete events:

```js
export function noteDiscrete(roomId, event) {
  const take = state.takes.get(roomId);
  if (!take || take.sealed) return;

  take.discrete.push({
    cueId: event.cueId,
    atSec: event.atSec,
    gain: event.gain,
    pan: event.pan,
    provenance: event.provenance,
  });
}
```

On playback, map the original 60-second location proportionally into the existing 22-second playback excerpt:

```js
const playbackAt =
  t0 + clamp(event.atSec / 60, 0, 1) * (PLAYBACK.seconds - 1);

scheduleCue(event.cueId, playbackAt, {
  gain: event.gain,
  pan: event.pan,
});
```

Do not record HUSH hammer strikes while the take clock is explicitly held. Record the environmental tenor strike because the recorder remains rolling.

### Bell audio runtime

Create `src/audio/bell-tower-audio.js` with:

- eight original/licensed bell strike buffers;
- distinct handstroke/backstroke mechanical layers;
- rope, bearing, frame and shutter sounds;
- internal bell-chamber resonance;
- ringing-room transmission;
- nave transmission;
- exterior spill;
- schedule-ahead Web Audio playback;
- per-bell spatial panners;
- a masking envelope.

Pass its masking value into the existing HUSH runtime:

```js
maskingDb: () =>
  bellTowerRuntime?.isRinging()
    ? bellTowerRuntime.maskingDb()
    : 0,
```

During `tower_active`:

- suspend physical HUSH movement and catch behavior;
- hide its rendered presence;
- disable HUSH mischief;
- retain its underlying saved state;
- resume normal behavior after the tower clears.

No audio from Taylor’s website may ship without licensing. Use it only as a reference for relative character and scale. [Taylor bell recordings](https://taylorbells.co.uk/bell-sounds/).

---

## 9. Map and Objective Contracts

Upgrade `BUILDING_MAP` to version 2 and add non-objective landmarks:

```js
landmarks: [
  {
    id: 'landmark:ringing-room',
    label: 'RINGING ROOM',
    shortLabel: 'RING',
    logical: RINGING_ROOM_ANCHOR,
    visibility: 'discovered',
    selectable: true,
    waypointable: false,
  },
  {
    id: 'landmark:bell-chamber',
    label: 'BELL CHAMBER',
    shortLabel: 'BELL',
    logical: BELL_CHAMBER_ANCHOR,
    visibility: 'discovered',
    selectable: true,
    waypointable: false,
  },
],
```

Add a new `u3` floor band for the bell chamber. Keep the ringing room on `u2`.

Extend map capture and validation to project landmarks like targets, but model them as:

```js
{
  kind: 'landmark',
  objective: null,
  ...
}
```

Visibility:

- ringing room appears after it has been visited;
- bell chamber appears as `ACCESS RESTRICTED` after the player inspects its hatch;
- both remain visible after the tower clears;
- neither changes `progress.total`, work-order completion or waypoint selection;
- work-order progress remains exactly five rooms.

---

## 10. Narrative and Setting

Make Ellery explicitly English through restrained institutional evidence:

- work-order address ends in `ENGLAND`;
- fire and electrical signage uses British terminology;
- old chapel records call it a collegiate chapel;
- the tower plaque dates the fictional ring to the early twentieth century;
- use pounds, metres and British administrative language where appropriate;
- leave the town and county unnamed.

Use a fictional inscription such as:

> J. VALE & SONS<br>
> CAST FOR ELLERY COLLEGIATE CHAPEL<br>
> 1908

Do not imply Taylor cast the fictional ring.

Aickman influence is limited to structure:

- one unexpectedly deep bell;
- an orderly expansion into many;
- beauty becoming intolerable through duration and physical force;
- deserted surroundings;
- the eventual stopping feeling worse than the noise.

Do not use his dead-awakening plot, crowd behavior, dialogue or prose. The local reference remains [Ringing the Changes](/Users/paul/Downloads/Ringing_the_Changes-Robert_Aickman.txt).

---

## 11. Implementation Order

1. Create `docs/plans/bell-tower-change-ringing.md` and stop.
2. Later, add the pure chapter state, normalization and legacy-save repair.
3. Split chapel zones and build the narthex, tower stack, inner screen and organ-loft route.
4. Make source-space mandatory and replace corridor return with `transition_ready`.
5. Add movement-tracking scene support and the reversible datamosh render pass.
6. Add map landmarks and the new bell-chamber floor band.
7. Add static tower assets, arbitrary prop matrices and dynamic prop instances.
8. Add method data, score scheduler, articulated animation and collision runtime.
9. Add bell audio, environmental foreshadowing, discrete playback events and HUSH interval playback.
10. Connect tower completion to the organ-loft route and existing chapel confrontation.
11. Add narrative content through the authoring source and regenerate the content registry.
12. Run full functional, audio, rendering and migration verification.

---

## 12. Test and Acceptance Plan

### Pure tests

Add tests for:

- every legal/illegal chapter-state transition;
- legacy save inference;
- active-tower load returning to the arrival checkpoint;
- old nave positions being repaired;
- forward, release and backward transition behavior;
- 8.5-second full-forward timing;
- reduced-motion datamosh selection;
- place-notation parsing;
- every generated row being a valid permutation;
- Plain Hunt returning to rounds;
- the Stedman data containing 84 true rows before tenor cover;
- strike ordering matching every row;
- deterministic retry scheduling;
- bell transforms and strike times sharing one score;
- swept collision catching high-speed crossings;
- environmental/HUSH/Surfer acoustic semantics;
- interval-mode HUSH instruments;
- discrete playback timing;
- map landmarks not affecting five-room progress.

### Browser integration

Add a `window.__probe.chapelTower()` surface exposing only diagnostic state:

```js
{
  phase,
  attempts,
  shuttersReleased,
  runtimeState,
  scoreSection,
  scoreRow,
  transitionProgress,
  activeBellAngles,
}
```

Browser scenarios:

1. Fresh game cannot open C-17 door without the replacement key.
2. C-17 opens the narthex and ringing room but not the nave or bell chamber.
3. Fewer than four takes cannot enter source-space.
4. Four ordinary takes enable the inner-screen source threshold.
5. Every route profile must complete source-space.
6. Transition responds to remapped keyboard and controller movement.
7. Backward input visibly restores the source frame.
8. Reload before transition commitment returns to the outer chapel.
9. Reload after commitment returns to the tower checkpoint.
10. Tower collision resets score, machinery and position without replaying source-space.
11. Shutter release returns the ring to rounds and stands all bells.
12. Tower becomes inert and revisitable.
13. Organ loft reaches the chapel nave.
14. Recorder use in the nave starts the existing battle.
15. `lux_nova` is the fifth take and no sixth take exists.
16. HUSH can wake the auditioned clock hammer but never the full ring.
17. Environmental tenor strike is present on playback.
18. Map progress remains `5 / 5`.

### Visual/audio QA

- Verify clapper contact and sound are frame-aligned at both strokes.
- Inspect wheels, stays, sliders and ropes from below and within the frame.
- Confirm the player always has a readable safe window without needing to understand change permutations.
- Confirm the datamosh never reveals a black or unloaded tower frame.
- Confirm reduced-motion mode has no feedback smear or strobe.
- Confirm bell tails remain spatially distinct before building into a mass.
- Confirm the sudden cut on failure and final stand are not painful at maximum configured volume.
- Confirm headphones and ordinary stereo speakers preserve the tenor’s weight without uncontrolled sub-bass.
- Validate fictional weights against comparable eight-bell rings in [Dove’s Guide](https://dove.cccbr.org.uk/dove.php?bells=8&order=Tenor&order_dir=Desc).

### Commands

Run:

```text
npm run studio:validate
npm run test:acoustic
npm test
npm run build
node tools/chunk_surfer/tests/floorplan.mjs --plan=conservatory --map
```

Capture the current floorplan-test baseline before implementation because the clean branch already reports unrelated failures; only newly introduced or worsened failures belong to this feature.
