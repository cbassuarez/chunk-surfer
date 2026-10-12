// THE BELL PASSAGE: THE TOWER ROAD, WALKED.
//
// This suite replaces test/source-tower-transition.spec.mjs, which proved that
// five wireframe masses on sine waves could be steered around inside eight and a
// half seconds of datamosh. That crossing is gone. Taking the bust's detour now
// opens a tier of Source space — four hundred metres of the ground the tape
// stands on, with the tower's own bell meshes standing in it at every size they
// are not, and St Brendan's belfry resolving out of the far end with one wall
// missing.
//
// What has to hold: is the place coherent, can the bells be dodged, is it made
// of the building's real meshes, does the road end at St Brendan's own door
// with the belfry through it, does walking through it end the chapter exactly
// once, and does the road it commits to still reach the same belfry.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  SOURCE_BELLS,
  SOURCE_HORIZON,
  SOURCE_BELL_PASSAGE,
  SOURCE_TIERS,
  SOURCE_TIER_BY_ID,
  inSourceBellsRoom,
  sourceBellsDepth,
  sourceBellsRoomResolve,
  sourceTierAt,
  sourceTierHeightAt,
  BELL_SWING,
  bellSwingAt,
  SOURCE_RING,
  bellAssemblyPoseAt,
} from '../src/data/source-level.js';
import { ELLERY_BELLS } from '../src/data/bell-tower.js';
import { ELSEWHERE_CROSSING_SECONDS } from '../src/data/elsewhere-worlds.js';
import { fullCircleBellCurve } from '../src/game/bell-tower-runtime.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { CELL, F } from '../src/data/floorplan/legend.js';
import { sourceBellContactShape } from '../src/game/source-bell-field.js';
import {
  CHUNK_SURF_PHASE,
  HORIZON_EXIT,
  SOURCE_FINALE_ROUTE,
  SOURCE_FINALE_STAGE,
  chunkSurfCompletion,
  reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { buildBellsGodPreset, buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

// The runtime must restore with the run's actual rules before sanitizing saves.
{
  const built = buildBellsGodPreset(120, { seed: 4417 });
  const origin = built.state.landscapeOrigin || { x: 0, y: -252 };
  const previous = { x: 40, y: SOURCE_BELLS.from - 120 };
  assert.ok(SOURCE_BELL_PASSAGE.map((entry) => sourceBellContactShape(entry)).filter(Boolean)
    .every((shape) => Math.hypot((previous.x - shape.x) / shape.rx, (previous.y - shape.y) / shape.ry) > 1.4),
  'the resumed position is clear of every actual bell');
  const runtime = createSourceSpaceRuntime({ difficulty: 'story', initialState: {
    ...built.state, bellField: { noise: 3, checkpointDepth: 148, previous },
  } });
  runtime.setPlayerPosition({ x: origin.x + previous.x, y: origin.y + previous.y, facing: 0.37 });
  assert.equal(runtime.bellsFrame().noiseLimit, 4);
  assert.equal(runtime.bellsFrame().noise, 3);
  assert.equal(runtime.bellsFrame().checkpointDepth, 148);
  const frame = runtime.tickBellField(0.016);
  assert.equal(frame.noiseLimit, 4, 'omitted per-tick difficulty retains the authoritative constructor rules');
  assert.equal(frame.noise, 3);
  assert.equal(frame.checkpointDepth, 148);
  assert.equal(frame.moved, false);
  assert.equal(frame.reset, null);
  assert.equal(runtime.state().bellField.checkpointDepth, 148);
}

// ── the ground ──────────────────────────────────────────────────────────────
{
  const tier = SOURCE_TIER_BY_ID.bells;
  assert.ok(tier, 'the passage has a tier of its own');
  assert.equal(tier.field, false, 'it is outside the altitude economy, like the tape');
  assert.equal(tier.height, SOURCE_TIER_BY_ID.horizon.height,
    'walking off the recording into the bells is neither a climb nor a fall');
  const passageMid=(SOURCE_BELLS.from+SOURCE_BELLS.to)/2;
  const horizonMid=(SOURCE_TIER_BY_ID.horizon.from+SOURCE_TIER_BY_ID.horizon.to)/2;
  assert.equal(sourceTierAt(passageMid).id, 'bells');
  assert.equal(sourceTierHeightAt(passageMid), sourceTierHeightAt(horizonMid));
  // It begins exactly where the tape stops. A gap would be undrawn ground.
  assert.equal(SOURCE_BELLS.from, SOURCE_TIER_BY_ID.horizon.to);
  assert.equal(SOURCE_TIERS.at(-1).id, 'bells', 'and nothing is authored past it');
}

// ── the manifest is internally coherent ─────────────────────────────────────
{
  assert.equal(SOURCE_BELLS.from - SOURCE_BELLS.to, SOURCE_BELLS.length);
  const room = SOURCE_BELLS.room;
  assert.ok(room.at < SOURCE_BELLS.from && room.at > SOURCE_BELLS.to,
    'the room stands inside the passage rather than past the end of it');
  assert.ok(room.threshold > room.at, 'you cross the threshold before you reach the middle of the room');
  assert.ok(room.at - room.halfZ > SOURCE_BELLS.to, 'the far wall is still on authored ground');
  // The whole third act is the room getting closer, so the resolve span has to
  // be long, has to end before the door, and has to run the right way.
  assert.ok(SOURCE_BELLS.resolveFrom > SOURCE_BELLS.resolveTo);
  assert.ok(SOURCE_BELLS.resolveTo >= room.at - room.halfZ);
  assert.ok(SOURCE_BELLS.resolveFrom - SOURCE_BELLS.resolveTo >= 150,
    'the room arrives over a long walk, not in the last few strides');
  assert.ok(SOURCE_BELLS.resolveTo > room.threshold,
    'it has finished arriving before the player can walk into it');
}

// ── depth and resolve ───────────────────────────────────────────────────────
{
  assert.equal(sourceBellsDepth(SOURCE_BELLS.from), 0);
  assert.equal(sourceBellsDepth(SOURCE_BELLS.to), SOURCE_BELLS.length);
  assert.equal(sourceBellsDepth(SOURCE_BELLS.from + 500), 0, 'standing short of the seam is the head of the passage');
  assert.equal(sourceBellsDepth(SOURCE_BELLS.to - 500), SOURCE_BELLS.length, 'and it never runs off the end');

  assert.equal(sourceBellsRoomResolve(SOURCE_BELLS.from), 0);
  assert.equal(sourceBellsRoomResolve(SOURCE_BELLS.resolveFrom), 0, 'nothing out there yet');
  assert.equal(sourceBellsRoomResolve(SOURCE_BELLS.resolveTo), 1, 'fully arrived by the time you reach it');
  const mid = sourceBellsRoomResolve((SOURCE_BELLS.resolveFrom + SOURCE_BELLS.resolveTo) / 2);
  assert.ok(mid > .4 && mid < .6, 'and it comes up smoothly in between');
  // Monotone: a room that flickered as you walked would be a switch, not an arrival.
  let previous = -1;
  for (let y = SOURCE_BELLS.from; y >= SOURCE_BELLS.to; y -= 4) {
    const value = sourceBellsRoomResolve(y);
    assert.ok(value >= previous, `the room un-arrives at ${y}`);
    previous = value;
  }
}

// ── the road ends at the tower's own door, and the belfry is through it ────
{
  const room = SOURCE_BELLS.room;
  assert.equal(inSourceBellsRoom(0, room.threshold - 1), true);
  assert.equal(inSourceBellsRoom(0, room.threshold + 1), false, 'the threshold is the way in');
  // No replica of the belfry stands in the field: the door shows the real one.
  const level = readFileSync('src/data/source-level.js', 'utf8');
  assert.doesNotMatch(level, /SOURCE_BELLS_ROOM/, 'a replica belfry still stands in the field');
  const main = readFileSync('src/main.js', 'utf8');
  const capture = main.slice(main.indexOf('function captureBrendanTowerView()'), main.indexOf('function tickSourceDoorArrival('));
  assert.match(capture, /R3\.r3dCaptureTowerView\?\.\(/, 'the belfry is never rendered for the door');
  assert.match(capture, /chunkSurfRuntime=null;px=door\.arrival\.x;py=door\.arrival\.y;/, 'the capture is not taken from the belfry arrival');
  assert.match(capture, /finally\{\s*chunkSurfRuntime=runtime;px=at\.x;py=at\.y;/, 'the capture can strand the body in the building');
  assert.match(main, /R3\.r3dSetSourceTowerView\?\.\(syncBrendanTowerView\(x,y\)\)/, 'the door never learns it has a belfry behind it');
  assert.match(main, /if\(chunkSurfRuntime\.crossesRouteDoor\?\.\(stepFrom,\{x:px,y:py\}\)\)\{\s*sourceDoorArrival=/, 'the step through the door is cut on its first frame');
  assert.match(main, /if\(completion\.horizonExit&&route!==SOURCE_FINALE_ROUTE\.CONTACT\)\{leave\(\);return;\}/, 'walking through a road\'s door still stops at a slate');
  assert.match(main, /function brendanTowerInstances\([\s\S]*?out\.push\(\.\.\.brendanTowerDoorInstances\(\)\);/, 'the belfry has no door behind the arrival');
  const props = readFileSync('src/render/props3d.js', 'utf8');
  assert.match(props, /export function renderSourceTowerView\(/);
  assert.match(props, /float towerDepth\(vec2 uv\)\{float a=texture\(uViewDepth,uv\)\.a;return \(1\.0\/max\(a,1e-4\)-1\.0\)\/\.14;\}/,
    'the door does not read the depth the march writes (1/(1+z*.14))');
  const r3d = readFileSync('src/render/r3d.js', 'utf8');
  assert.match(r3d, /o = vec4\(clamp\(col,0\.0,1\.0\), 1\.0 \/ \(1\.0 \+ zView \* 0\.14\)\);/, 'the march no longer writes the depth the door reads');
  const draw = r3d.slice(r3d.indexOf('function drawSourceVoidPhysical'), r3d.indexOf('function drawTextSpace'));
  assert.ok(draw.indexOf('P3.renderSourceTowerView') > draw.indexOf('P3.renderSourcePortals') && draw.indexOf('P3.renderSourceTowerView') < draw.indexOf('P3.propTargets()'),
    'the belfry is not drawn into the void\'s own prop targets');
}

// ── EVERYTHING OUT THERE CAN ACTUALLY BE REACHED ───────────────────────────
//
// The contract this file was missing, and it cost the whole third act.
//
// Crossing the room's threshold completes the chapter, and past it `inBells`
// clamps the world to the room's own width. So a piece authored beyond the
// threshold is not "further along the walk" — it is scenery nobody will ever
// stand next to. The room used to sit at depth 274 of a passage declared 432
// long, which put all six true-scale bells, their frame, and the entire
// resolution act behind the door. Every other assertion in this file passed
// while that was true.
{
  const depth = (entry) => SOURCE_BELLS.from - entry.y;
  const thresholdDepth = SOURCE_BELLS.from - SOURCE_BELLS.room.threshold;

  for (const entry of SOURCE_BELL_PASSAGE) {
    assert.ok(entry.y > SOURCE_BELLS.room.threshold,
      `${entry.id} stands at depth ${depth(entry).toFixed(0)}, past the threshold at ${thresholdDepth.toFixed(0)} — nobody can reach it`);
  }

  // And the walk uses the length it declares, rather than stopping two thirds
  // of the way down it.
  assert.ok(thresholdDepth > SOURCE_BELLS.length * 0.9,
    `the door is at depth ${thresholdDepth.toFixed(0)} of an authored ${SOURCE_BELLS.length}`);

  // THE LAST HUNDRED AND FORTY METRES IS THE RING. The prose above the act says
  // so, and 432 - 140 = 292, which is where it starts.
  const ring = SOURCE_BELL_PASSAGE.filter((entry) => /^bells-ring-\d/.test(entry.id));
  assert.equal(ring.length, ELLERY_BELLS.length);
  const first = depth(ring[0]), last = depth(ring[ring.length - 1]);
  assert.ok(first >= 280 && first <= 300, `the ring starts at ${first.toFixed(0)}, not ~292`);
  assert.ok(last > SOURCE_BELLS.from - SOURCE_BELLS.doors.from - 20, 'and it runs up to the tower door field rather than stopping short');
  assert.ok(SOURCE_BELLS.doors.to > SOURCE_BELLS.room.threshold, 'the door field runs into the belfry');
  assert.ok(last - first >= 100, 'spread across the act, not bunched into forty metres of it');
}

// ── ONE RING, THREE SIZES ───────────────────────────────────────────────────
//
// Every bell in the passage is one of St Brendan's eight, lifted out of the
// chapel ring with its own wheel, clapper, stay and slider. The passage chooses
// only size and place: miniature, the ring's own size, architectural. Nothing is
// invented — no loose wheels or clappers, no frame standing on its own, no bell
// that is not in the ring, and no motion the chapel does not make.
{
  const act = (prefix) => SOURCE_BELL_PASSAGE.filter((entry) => entry.id.startsWith(prefix));
  assert.ok(SOURCE_BELL_PASSAGE.length >= 20, 'fewer than twenty bells to walk between');
  for (const entry of SOURCE_BELL_PASSAGE) {
    assert.match(entry.mesh, /^tower_bell_0[1-8]$/, `${entry.id} is not a ring bell`);
    assert.equal(entry.assembly, true, `${entry.id} is a loose casting rather than the ring's assembly`);
    assert.equal(entry.mesh, `tower_bell_0${entry.ring}`, `${entry.id} names a ring bell it does not draw`);
    for (const part of ['wheel', 'clapper', 'stay', 'slider']) {
      assert.ok(PROP_BOUNDS[`tower_${part}_0${entry.ring}`], `${entry.id} has no ${part} in the prop pack`);
    }
  }
  assert.equal(new Set(SOURCE_BELL_PASSAGE.map((entry) => entry.ring)).size, ELLERY_BELLS.length, 'the passage leaves a ring bell out');
  const sized = (size) => SOURCE_BELL_PASSAGE.filter((entry) => entry.size === size);
  assert.ok(sized('miniature').length >= 8, 'too few miniatures');
  assert.ok(sized('regular').length >= 8, 'too few bells at the ring’s own size');
  assert.ok(sized('architectural').length >= 4, 'too few architectural bells');
  assert.equal(sized('miniature').length + sized('regular').length + sized('architectural').length, SOURCE_BELL_PASSAGE.length,
    'a bell is outside the three sizes');
  for (const entry of sized('regular')) {
    assert.equal(entry.scale, SOURCE_RING[entry.ring - 1].visualScale, `${entry.id} is called regular but is not the chapel's size`);
  }
  assert.ok(sized('miniature').every((entry) => entry.scale < .6 && !entry.blocks && !entry.contact), 'a miniature trips or shoves the player');
  assert.ok(sized('architectural').every((entry) => entry.scale >= 4), 'an architectural bell is not large');

  // ARCHITECTURE: nothing moves. Too big, half sunk, indifferent to you.
  for (const entry of act('bells-arch')) {
    assert.equal(entry.swing, undefined, `${entry.id} moves, and act one does not`);
    assert.equal(bellSwingAt(entry, 7.3), 0);
  }

  // When a ring bell moves, it moves as the chapel moves it.
  for (const entry of SOURCE_BELL_PASSAGE.filter((entry) => entry.swing)) {
    assert.equal(entry.swing.kind, 'full-circle', `${entry.id} moves in a way the chapel ring never does`);
  }
  const ring = act('bells-ring-');
  assert.equal(ring.length, ELLERY_BELLS.length);
  assert.deepEqual(ring.map((entry) => entry.ring), ELLERY_BELLS.map((bell) => bell.id), 'the ring is not walked in bell order');
  assert.equal(new Set(ring.map((entry) => entry.swing.phase)).size, ELLERY_BELLS.length, 'two ring bells strike together — not rounds');
  for (const entry of ring) {
    const bell = ELLERY_BELLS[entry.ring - 1];
    for (let t = 0; t < 6; t += 0.137) {
      const strokes = t / entry.swing.period + entry.swing.phase / (Math.PI * 2);
      const stroke = Math.floor(strokes), direction = stroke % 2 ? -1 : 1;
      assert.equal(bellSwingAt(entry, t), fullCircleBellCurve({ phase: strokes - stroke, direction, balanceHold: bell.balanceHold, strikePhase: bell.strikePhase }),
        `${entry.id} does not swing on the chapel's full-circle curve`);
    }
  }
  const pose = bellAssemblyPoseAt(ring[0], 0.9);
  assert.notEqual(pose.clapperAngle, pose.angle, 'the clapper does not lag the bell');
  assert.ok(Math.abs(pose.angle) <= Math.PI * .94 + .03, 'a ring bell swings through the balance');

  // No moving bell is also a hard grid wall.
  for (const entry of SOURCE_BELL_PASSAGE) assert.ok(!(entry.swing && entry.blocks), `${entry.id} blocks and swings`);

  // The swing is a pure function of the piece and the clock, and it is bounded.
  for (const entry of SOURCE_BELL_PASSAGE) {
    assert.equal(bellSwingAt(entry, 4.2), bellSwingAt(entry, 4.2), 'deterministic');
    for (let t = 0; t < 40; t += 0.37) {
      assert.ok(Number.isFinite(bellSwingAt(entry, t)), `${entry.id} produced a non-finite roll`);
    }
  }
  assert.equal(bellSwingAt({}, 3), 0, 'a piece with no swing does not move');
  assert.equal(bellSwingAt(null, 3), 0);
}

// ── the passage is made of the building ─────────────────────────────────────
{
  const all = [...SOURCE_BELL_PASSAGE];
  assert.equal(new Set(all.map((entry) => entry.id)).size, all.length, 'nothing is placed twice');
  for (const entry of all) {
    assert.ok(PROP_BOUNDS[entry.mesh], `${entry.id} uses ${entry.mesh}, which is not in the built prop pack`);
    assert.ok(Number.isFinite(entry.x) && Number.isFinite(entry.y), `${entry.id} has no position`);
    assert.ok(entry.scale > 0, `${entry.id} has no size`);
    assert.ok(entry.y <= SOURCE_BELLS.from && entry.y >= SOURCE_BELLS.to - 10,
      `${entry.id} stands outside the passage`);
    assert.ok(Math.abs(entry.x) <= SOURCE_BELLS.halfWidth, `${entry.id} stands outside the open ground`);
  }
  assert.ok(all.every((entry) => entry.mesh.startsWith('tower_')),
    'the passage is built from St Brendan’s belfry and nothing else');

  const scales = SOURCE_BELL_PASSAGE.map((entry) => entry.scale);
  assert.ok(Math.max(...scales) >= 20, 'something out there is the size of a building');
  assert.ok(Math.min(...scales) <= .5, 'and something out there is the size of a penny');
  const ring = SOURCE_BELL_PASSAGE.filter((entry) => /^bells-ring-\d+$/.test(entry.id));
  for (let i = 1; i < ring.length; i += 1) {
    assert.ok(ring[i].y < ring[i - 1].y, 'the ring is walked through in order');
  }
  // One thing you pass underneath. Its mouth has to clear a standing body.
  const canopy = SOURCE_BELL_PASSAGE.find((entry) => entry.id === 'bells-null-canopy');
  assert.ok(canopy, 'there is a bell you walk under');
  assert.ok(canopy.elevation - 1.02 * canopy.scale > 2.2, 'and it clears your head');
}

// ── the walk ────────────────────────────────────────────────────────────────
{
  const completions = [];
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const state = { ...built.state, profile: { ...built.state.profile, marbleEyes: 'returned' } };
  const runtime = createSourceSpaceRuntime({
    initialState: state,
    onComplete: (completion) => completions.push(completion),
  });
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  for (let beat = 0; beat < 3; beat += 1) runtime.talkToHorizonBust();
  runtime.decideHorizonBust(true);

  // Taking the detour reveals a physical path. It neither teleports the body
  // nor leaves the horizon; crossing the seam on foot opens the bell field.
  const before = runtime.horizonFrame();
  const taken = runtime.takeHorizonBustDetour();
  assert.equal(taken.pathOpened, true);
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.HORIZON);
  assert.equal(runtime.horizonFrame().depth, before.depth);
  assert.equal(runtime.horizonFrame().lateral, before.lateral);
  assert.equal(runtime.state().active, true);
  assert.equal(runtime.state().completed, false);
  assert.equal(completions.length, 0, 'nothing is reported to the world yet');
  // The route commits at the bust, so a reload in the passage cannot re-choose.
  assert.equal(runtime.state().finale.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(runtime.state().finale.stage, SOURCE_FINALE_STAGE.TOWER_COMMITTED);

  const origin = runtime.state().landscapeOrigin || { x: 0, y: -252 };
  // Begin where a player can actually speak to the bust, not already standing
  // on its new road. The near-side bend must clear the solid pedestal too.
  let from = { x: origin.x, y: origin.y + SOURCE_HORIZON.from - 168 };
  runtime.setPlayerPosition({ ...from, facing: 0 });
  for (const target of taken.path) {
    const world = { x: origin.x + target.x, y: origin.y + target.y };
    const start = { ...from }, steps = Math.ceil(Math.hypot(world.x - from.x, world.y - from.y) / 0.75);
    for (let i = 1; i <= steps; i += 1) {
      const to = { x: start.x + (world.x - start.x) * i / steps, y: start.y + (world.y - start.y) * i / steps };
      const cell = runtime.geometry.cellAt(to.x, to.y);
      assert.ok(cell, 'revealed path owns every cell along its visible ribbon');
      assert.equal(cell.ceil, null, 'the tower road has open sky, not a zero-height roof');
      assert.ok(cell.flags & F.SKY, 'the packed render plan must preserve its no-ceiling intent');
      assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true,
        'no-ceiling ground must not fail the headroom check');
      runtime.onStep(from, to);
      from = to;
    }
  }
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.BELLS);
  const head = runtime.bellsFrame();
  assert.equal(head.active, true);
  assert.equal(head.depth, SOURCE_BELLS.from - taken.path.at(-1).y, 'the walked position survives the seam unchanged');
  assert.equal(head.resolve, 0);
  assert.equal(head.atRoom, false);
  for (const entry of SOURCE_BELL_PASSAGE.filter((entry) => entry.contact)) {
    assert.ok(runtime.geometry.cellAt(origin.x + entry.x, origin.y + entry.y),
      `${entry.id} uses soft body contact, not an impassable cell`);
  }

  const entry = SOURCE_BELL_PASSAGE.find((entry) => entry.id === 'bells-field-14');
  const body = sourceBellContactShape(entry);
  runtime.setPlayerPosition({ x: origin.x + body.x, y: origin.y + body.y + body.ry - 0.1, facing: 0.37 });
  const contact = runtime.tickBellField(0.1);
  assert.equal(contact.moved, true, 'live runtime consumes the physical field collision');
  assert.equal(contact.contacts[0].id, entry.id);
  assert.equal(contact.noise, 0, 'this authored bell is mute');
  assert.equal(contact.reset, null);
  assert.equal(runtime.state().bellField.hits, 1, 'contact state is carried into the Source save snapshot');

  // Halfway down, the room is on its way and the walk has something left in it.
  runtime.setPlayerPosition({ x: origin.x, y: origin.y + (SOURCE_BELLS.resolveFrom + SOURCE_BELLS.resolveTo) / 2, facing: 0 });
  const middle = runtime.bellsFrame();
  assert.ok(middle.resolve > .4 && middle.resolve < .6);
  assert.ok(middle.remaining > 0);

  // THE TOWER DOOR IS LOCKED until the two seeded doors have been walked through.
  const doors = runtime.doorFieldDoors();
  const keys = doors.filter((door) => door.key);
  assert.ok(doors.some((door) => door.route === 'tower'), 'the belfry has no tower door');
  assert.equal(keys.length, 2, 'the tower door field does not seed exactly two key doors');
  assert.ok(keys.every((door) => !door.shut), 'a key door cannot be walked through');
  assert.ok(doors.filter((door) => !door.route).length >= 12, 'the tower door field is thin');
  {
    const outsideLocked = { x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold + 2 };
    const insideLocked = { x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold - 1 };
    assert.equal(runtime.geometry.canStep(outsideLocked.x, outsideLocked.y, insideLocked.x, insideLocked.y).ok, false,
      'the locked tower door lets the body into the belfry');
    runtime.setPlayerPosition({ ...outsideLocked, facing: 0 });
    runtime.onStep(outsideLocked, insideLocked);
    assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.BELLS, 'a locked tower door ended the chapter');
    assert.equal(completions.length, 0);
  }
  const towerDoor = () => runtime.doorFieldDoors().find((door) => door.route === 'tower');
  const through = (door) => {
    assert.equal(runtime.doorCrossingFrame(), null, 'only one real door visit can own the crossing at a time');
    assert.equal(runtime.openDoorFieldDoor(door.id).opened, true, `${door.id} will not open`);
    const [a, b] = door.threshold, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const from = { x: cx + door.normal[0] * 1.5, y: cy + door.normal[2] * 1.5 };
    const to = { x: cx - door.normal[0] * 1.5, y: cy - door.normal[2] * 1.5 };
    runtime.setPlayerPosition({ ...from, facing: 0 });
    runtime.onStep(from, to);
    assert.equal(runtime.doorCrossingFrame()?.id, door.id, 'the intended door starts an actual crossing');
    assert.equal(runtime.doorCrossingFrame()?.key, door.key);
    assert.ok(runtime.state().station.entries.some((entry) => entry.doorId === door.id), 'the visit is journaled');
    runtime.advanceStationTime(ELSEWHERE_CROSSING_SECONDS - .01);
    assert.equal(runtime.doorCrossingFrame()?.id, door.id, 'the crossing cannot finish before the authored duration');
    runtime.advanceStationTime(.02);
    assert.equal(runtime.doorCrossingFrame(), null, 'the public station clock completes this visit before another begins');
  };
  through(keys[0]);
  assert.equal(towerDoor().unlocked, false, 'one key door unlocked the tower door');
  const decoy = doors.find((door) => !door.route && !door.shut && !door.key && !door.personal && !door.home && !door.lockIn);
  if (decoy) {
    through(decoy);
    assert.equal(towerDoor().unlocked, false, 'an ordinary door counted as a key');
  }
  assert.equal(runtime.towerDoorView(), null, 'the locked tower door already shows the belfry');
  through(keys[1]);
  assert.equal(towerDoor().unlocked, true, 'walking through both key doors left the tower door locked');
  {
    runtime.setPlayerPosition({ x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold + 6, facing: 0 });
    const view = runtime.towerDoorView();
    assert.ok(view, 'the open tower door shows nothing');
    assert.equal(view.width, .94, 'the opening is not the tower door frame\'s');
    assert.deepEqual(view.forward, [0, -1], 'the belfry is not through the door the way the road runs');
    // The eye walks through the middle of it: its cell's eye is on the door's centre line.
    assert.ok(Math.abs(view.origin[0] - (origin.x + .5) * CELL) < 1e-6, 'the road does not walk through the middle of the tower door');
    const [a] = towerDoor().threshold;
    const past = Math.ceil(a.y) - 1;
    assert.ok(Math.abs((a.y - past) * CELL - .245) < .01, 'the first cell past the door does not put the eye a quarter metre inside');
    assert.equal(runtime.crossesRouteDoor({ x: origin.x, y: Math.ceil(a.y) }, { x: origin.x, y: past }), true, 'main cannot see the step through the door coming');
    assert.equal(runtime.crossesRouteDoor({ x: origin.x, y: Math.ceil(a.y) + 1 }, { x: origin.x, y: Math.ceil(a.y) }), false);
    assert.equal(runtime.geometry.canStep(origin.x + 3, Math.ceil(a.y), origin.x + 3, past).ok, false, 'the hedge beside the door lets the body round it');
  }
  assert.ok(runtime.state().routeDoorsErased.includes(keys[0].id), 'the explored doors are not saved');

  // And walking in through the tower door ends the chapter, once.
  const outside = { x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold + 2 };
  const doorway = { x: origin.x, y: origin.y + SOURCE_BELLS.room.threshold - 1 };
  runtime.setPlayerPosition({ ...outside, facing: 0 });
  assert.equal(runtime.bellsFrame().atRoom, false);
  runtime.onStep(outside, doorway);
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.COMPLETED);
  assert.equal(completions.length, 1, 'the room reports exactly once');
  runtime.onStep(doorway, { x: origin.x, y: doorway.y - 1 });
  assert.equal(completions.length, 1, 'and walking further into it does not report again');

  const completion = completions[0];
  assert.equal(completion.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(completion.transitionTarget, 'cathedral', 'the road still ends in the belfry');
  assert.ok(completion.flags.includes('chunkSurf.horizon.exit.tower'));
}

// ── the reducer grammar ─────────────────────────────────────────────────────
{
  const dispatch = (state, type, details = {}) => reduceChunkSurf(state, { type, ...details });
  let state = dispatch(buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL, { seed: 4417, marbleEyes: 'returned' }).state, 'SOURCE_NORMAL_EXIT');
  state = dispatch(state, 'HORIZON_BUST_RECOGNIZED', { eligible: true });
  state = dispatch(state, 'HORIZON_BUST_DECIDED', { decision: 'accepted' });
  state = dispatch(state, 'HORIZON_EXIT_CHOSEN', { exit: HORIZON_EXIT.TOWER });
  assert.equal(state.phase, CHUNK_SURF_PHASE.BELLS);
  // The room is the only way out of the passage.
  assert.deepEqual(dispatch(state, 'SOURCE_NORMAL_EXIT'), state);
  const done = dispatch(state, 'BELLS_ROOM_ENTERED');
  assert.equal(done.completed, true);
  assert.equal(chunkSurfCompletion(done).transitionTarget, 'cathedral');
  // And it only fires from inside the passage.
  assert.deepEqual(dispatch(done, 'BELLS_ROOM_ENTERED'), done);
}

// ── the datamosh is gone ────────────────────────────────────────────────────
{
  assert.equal(existsSync('src/game/source-tower-transition-scene.js'), false,
    'the crossing scene was deleted, not left behind as dead code');
  const main = readFileSync('src/main.js', 'utf8');
  assert.doesNotMatch(main, /createSourceTowerTransitionScene/,
    'and nothing in the game still reaches for it');
  const handover = main.slice(
    main.indexOf('function beginSourceTowerTransition()'),
    main.indexOf('function resumeSourceTowerTransitionFromSave()'),
  );
  assert.ok(handover.length > 200);
  assert.doesNotMatch(handover, /Datamosh/, 'the tower road is a place, not an encoder effect');
  assert.match(handover, /GOD_LOCATION_HOOKS\['cathedral-belfry'\]/, 'it hands over into the real bell chamber');
}

console.log(`source bell passage specs passed (${SOURCE_BELL_PASSAGE.length} placements, ${SOURCE_BELLS.length * CELL}m)`);
