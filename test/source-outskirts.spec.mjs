// THE WALK OUT IS THE NIGHT HE ARRIVED ON, EMPTIED; AND THE DOORS AT THE ROADS'
// ENDS GO NOWHERE.
//
// Behind the grey doors the first outskirts are one road straight out toward
// the picture — the arrival stretch, three times, more wrong each time — and
// then dark ground (src/data/source-outskirts-arrival.js). The roads' own
// outskirts are corridors of doors: open onto somewhere impossible (walking
// through erases the door), or shut (they block, and refuse when tried).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_CHAPEL_OUTSKIRTS, SOURCE_HORIZON, SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import {
  OUTSKIRT_BEATS, OUTSKIRT_BREAKS, OUTSKIRT_FOLD_ENCOUNTER, OUTSKIRT_PASSES, OUTSKIRT_REPEAT_COUNT, OUTSKIRT_ROAD_END, OUTSKIRT_STRETCH, OUTSKIRT_STRETCH_METRES,
  outskirtsArrivalLayout,
} from '../src/data/source-outskirts-arrival.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';
import { createSourceSpaceRuntime, torchFlickerAt } from '../src/game/source-space-runtime.js';
import { applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';
import { sourceFocusActionLabel } from '../src/game/source-haystack.js';
import { sourceShoreOutside } from '../src/game/source-sensory.js';
import { buildChapelOutskirtsGodPreset, buildHorizonGodPreset, buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { DOOR_ARCHETYPES } from '../src/data/conservatory-doors.js';
import { DOOR_FRAME_OPENINGS, DOOR_FIELD_PLANTING_MESHES } from '../src/data/source-door-fields.js';

// ── STILL GROUND, THEN ONE ROAD THAT DOES NOT END ──────────────────────────
{
  const layout = outskirtsArrivalLayout();
  for (const piece of layout) {
    // The skinned guard is built in the character pack, with an explicit body
    // footprint. It must not inherit a static prop's outstretched-arm bounds.
    if (piece.id === 'r2-booth-guard' || piece.id === 'r6-booth-guard') {
      assert.equal(piece.mesh, OUTSKIRT_FOLD_ENCOUNTER.mesh);
      if (piece.id === 'r6-booth-guard') assert.equal(piece.encounter, 'wrong-fold');
      else assert.equal(piece.character?.clip, 'idle');
      assert.ok(piece.collision?.length, 'the character has no explicit footprint');
    } else if (['outskirts_overprint_body', 'outskirts_dog_handler', 'outskirts_vacant_dog'].includes(piece.mesh)) {
      assert.ok(piece.collision?.length, `${piece.id} has no authored foot and lower-leg clearance`);
    } else if (piece.mesh === 'outskirts_slack_lead') {
      assert.equal(piece.collision, 'none', 'the loose lead blocks the road');
    } else assert.ok(PROP_BOUNDS[piece.mesh], `${piece.id} names ${piece.mesh}, which the prop pack does not build`);
  }
  assert.equal(new Set(layout.map((piece) => piece.id)).size, layout.length, 'a piece stands twice');
  // One road section per pass — except on a pass that breaks by losing it.
  const roads = layout.filter((piece) => piece.mesh === 'outskirts_road');
  const roadless = OUTSKIRT_PASSES.filter((pass) => pass.break === 'no-road').length;
  // The road itself goes late on (losing himself), so there is at most one section per pass.
  assert.ok(roads.length <= OUTSKIRT_REPEAT_COUNT - roadless && roads.length >= 12, `the road is ${roads.length} sections`);
  assert.ok(new Set(roads.map((road) => road.stretch)).size === roads.length, 'a pass has two road sections');
  assert.ok(roads.every((road) => road.across === 0), 'the road leaves the axis');
  const sectionStart = (k) => 6 + k * OUTSKIRT_STRETCH_METRES;
  assert.ok(roads.every((road) => Math.abs(road.along - (sectionStart(road.stretch) + OUTSKIRT_STRETCH_METRES / 2)) < 1e-9), 'a road section is not where its pass is');
  assert.equal(sectionStart(OUTSKIRT_REPEAT_COUNT), OUTSKIRT_ROAD_END, 'the road ends somewhere else');
  // About a kilometre: the feeling is that it goes on, not that it repeats.
  assert.ok(OUTSKIRT_ROAD_END >= 900, `the road is only ${OUTSKIRT_ROAD_END} m long`);
  assert.ok(OUTSKIRT_ROAD_END <= SOURCE_PRE_TAPE.roadLength * CELL, 'the road runs past the head of the tape');
  // THE STILL STRETCH COMES FIRST: nothing stands between the doors and the road.
  assert.ok(SOURCE_PRE_TAPE.stillLength > 0 && SOURCE_PRE_TAPE.roadFrom < SOURCE_PRE_TAPE.from, 'there is no still ground before the road');
  // THE SAME SCENE, OVER AND OVER — worn more each pass, and more likely to
  // break. Every pass that has not broken is recognisably the scene: the road,
  // the gate and the four lamps, where they were.
  assert.equal(OUTSKIRT_PASSES.length, OUTSKIRT_REPEAT_COUNT);
  assert.ok(!OUTSKIRT_PASSES[0].break && !OUTSKIRT_PASSES[1].break, 'the scene breaks before it has been learned');
  OUTSKIRT_PASSES.slice(1).forEach((pass, k) => {
    assert.ok(pass.wear >= OUTSKIRT_PASSES[k].wear, 'a pass is less worn than the one before it');
    assert.ok(pass.breakChance >= OUTSKIRT_PASSES[k].breakChance, 'a pass is less likely to break than the one before it');
  });
  const half = Math.floor(OUTSKIRT_PASSES.length / 2);
  const brokenIn = (from, to) => OUTSKIRT_PASSES.slice(from, to).filter((pass) => pass.break).length;
  assert.ok(brokenIn(half, OUTSKIRT_PASSES.length) > brokenIn(0, half), 'the scene breaks as often early as late');
  assert.ok(brokenIn(0, OUTSKIRT_PASSES.length) >= 6, 'the scene hardly ever goes badly wrong');
  // Early on (before anything has started to go), every pass is recognisably the scene.
  for (const pass of OUTSKIRT_PASSES.filter((entry) => entry.wear < 0.3 && (!entry.break || entry.break === 'mirrored' || entry.break === 'turned'))) {
    const keys = new Set(layout.filter((piece) => piece.stretch === pass.k).map((piece) => piece.key));
    for (const key of ['road', 'gate', 'lamp-0', 'lamp-1', 'lamp-2', 'lamp-3']) assert.ok(keys.has(key), `pass ${pass.k + 1} is not the scene: no ${key}`);
  }
  for (const pass of OUTSKIRT_PASSES.filter((entry) => entry.break)) {
    assert.ok(OUTSKIRT_BREAKS.includes(pass.break), `pass ${pass.k + 1} breaks in a way nobody wrote: ${pass.break}`);
  }
  // The first pass that breaks each way says so.
  for (const kind of new Set(OUTSKIRT_PASSES.filter((pass) => pass.break).map((pass) => pass.break))) {
    assert.ok(OUTSKIRT_BEATS.some((beat) => beat.id === `break-${kind}`), `nobody notices the ${kind} pass`);
  }
  assert.ok(layout.filter((piece) => piece.key === 'booth').length >= 12, 'the road has lost its lodges too early');
  // THE ROAD GOES: by the last pass there is nothing but lamps, and after it one faulty light over the recorder.
  const lastPass = layout.filter((piece) => piece.stretch === OUTSKIRT_REPEAT_COUNT - 1);
  assert.ok(lastPass.length && lastPass.every((piece) => piece.lamp), `the last pass still has ${[...new Set(lastPass.filter((p) => !p.lamp).map((p) => p.key))].join(', ')}`);
  const endPieces = layout.filter((piece) => piece.stretch === OUTSKIRT_REPEAT_COUNT);
  assert.deepEqual(endPieces.filter((piece) => piece.faulty || piece.lastRecorder).map((piece) => piece.key).sort(), ['last-light', 'last-recorder']);
  assert.ok(endPieces.filter((piece) => !piece.faulty && !piece.lastRecorder).every((piece) => piece.lastThreshold), 'unrelated scenery returns after the lamps-only pass');
  assert.ok(endPieces.every((piece) => piece.along > OUTSKIRT_ROAD_END + 40 && piece.along < SOURCE_PRE_TAPE.roadLength * CELL - 10), 'the last light is not a short black walk short of the tape');
  assert.ok(endPieces.find((piece) => piece.key === 'last-light').faulty, 'the last light is not faulty');
  for (const kind of ['played-back', 'unfinished', 'already-walked', 'silent']) assert.ok(OUTSKIRT_BREAKS.includes(kind), `no ${kind} break`);
  assert.ok(layout.some((piece) => piece.unfinished) || !OUTSKIRT_PASSES.some((pass) => pass.break === 'unfinished'), 'an unfinished pass is finished');
  assert.ok(layout.some((piece) => piece.stretch === 2 && piece.unwatched === 'vanish'), 'nothing out there is gone when you look back');
  // Fewer of them late on, because the people go with the rest of the road.
  assert.ok(layout.filter((piece) => piece.watcher).length >= 1, 'nothing out there turns to face you');
  assert.ok(layout.some((piece) => piece.dark), 'no lamp on the road has gone out');
  // The phone box repeats with the scene until, last of all, it goes too.
  const boxPasses = new Set(layout.filter((piece) => piece.payphone).map((piece) => piece.stretch));
  assert.ok(OUTSKIRT_PASSES.filter((pass) => pass.wear < 0.75 && pass.break !== 'emptied').every((pass) => boxPasses.has(pass.k)), 'a phone box is missing before the road goes');
  assert.ok(!boxPasses.has(OUTSKIRT_REPEAT_COUNT - 1), 'the last pass still has its phone box');
  assert.ok(OUTSKIRT_STRETCH.filter((piece) => piece.lamp).length >= 4, 'the road is not lit at a regular spacing');
  // Nothing broken, fallen, giant or floating: the uncanny is in the order of things.
  assert.ok(layout.every((piece) => !piece.roll && !piece.pitch && !piece.scale), 'a piece is posed, scaled or knocked over');
  assert.equal(new Set(OUTSKIRT_BEATS.map((beat) => beat.id)).size, OUTSKIRT_BEATS.length);
  assert.ok(OUTSKIRT_BEATS.every((beat) => ['reach', 'lookBack', 'unseen'].includes(beat.trigger)));
}

const packMeshes = new Set(['vegetation', 'conservatory-doors', 'conservatory-acquisitions', 'source-structures', 'conservatory-props', 'outskirts-characters', 'outskirts-dog-handler', 'bus-woman-character', 'outskirts-bus-woman-wrong-origin', 'outskirts-vacant-dog'].flatMap((name) => {
  const bytes = readFileSync(new URL(`../public/assets/${name}.glb`, import.meta.url));
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')).meshes.map((mesh) => mesh.name);
}));
const FURNITURE_OR_ROOM = /^(hall_|chapel_|pew$|organ_|tower_|upright_piano|grand_piano|marimba|timpani|altar_|lectern|hymn_board|portrait_frame|green_chair|arm_chair|sofa_|classic_console|gothic_cabinet|wooden_chair|chandelier|lantern_chandelier)/;
const at = (seed, build = (options) => buildPreTapeGodPreset(0, options)) => {
  const built = build({ seed, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  return { runtime, position: built.position, origin: built.state.landscapeOrigin || { x: 0, y: -252 } };
};
{
  const { runtime, position } = at(4417);
  const outskirts = runtime.propInstances(position.x, position.y).filter((entry) => entry.sourceStructure === 'outskirts');
  assert.ok(outskirts.length > 0, 'the field’s edge stands empty');
  for (const entry of outskirts) {
    assert.doesNotMatch(entry.mesh, FURNITURE_OR_ROOM, `${entry.id} is conservatory furniture or a room (${entry.mesh})`);
    assert.ok(packMeshes.has(entry.mesh), `${entry.id} names ${entry.mesh}, which no loaded GLB contains`);
    assert.doesNotMatch(entry.mesh, /^door_(frame|leaf)_/, `${entry.id} is a door standing on the road out; the only door here is the grey pair`);
  }
  assert.deepEqual(runtime.outskirtPortals(position.x, position.y), [], 'the pre-tape outskirts show elsewhere');
}

// ── THE PHONE BOX: SOLID, WITH A DOOR, AND STOOD IN ONLY WHEN USED ─────────
{
  const { runtime, position } = at(4417, (options) => buildPreTapeGodPreset(12, options));
  const pose = runtime.phoneBoxPose();
  assert.ok(pose, 'the phone box has nowhere to stand');
  const door = runtime.propInstances(position.x, position.y).find((entry) => entry.mesh === 'city_phone_box_door');
  assert.ok(door, 'the phone box has no door');
  assert.ok(packMeshes.has('city_phone_box_door'), 'the phone box door is in no loaded GLB');
  const inside = { x: Math.round(pose.inside.x), y: Math.round(pose.inside.y) };
  const outside = { x: Math.round(pose.outside.x), y: Math.round(pose.outside.y) };
  assert.equal(runtime.geometry.canStep(outside.x, outside.y, inside.x, inside.y).ok, false, 'the body walks into the box');
  runtime.setPhoneBoxInside(true);
  assert.equal(runtime.geometry.canStep(inside.x, inside.y, outside.x, outside.y).ok, false, 'he walks out of the box with the handset up');
  runtime.setPhoneBoxInside(false);
  assert.equal(pose.door, 0, 'the door stands open');
  runtime.setPhoneBoxDoor(true);
  assert.ok(runtime.phoneBoxPose().open);
  const turn = Math.atan2(Math.sin(pose.faceSet - pose.faceRoad), Math.cos(pose.faceSet - pose.faceRoad));
  assert.ok(Math.abs(Math.abs(turn) - Math.PI) < 1e-6, 'the set and the road are not opposite');
}

// ── DOORS THAT OPEN ONTO NOWHERE, IN A HEDGED CORRIDOR ──────────────────────
const inDoorField = (seed) => at(seed, (options) => buildChapelOutskirtsGodPreset(SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom + 40, options));
const facingToward = (normal) => [[0, -1], [1, 0], [0, 1], [-1, 0]]
  .map(([dx, dy], index) => ({ index, dot: -(dx * normal[0] + dy * normal[2]) }))
  .sort((a, b) => b.dot - a.dot)[0].index;
const middleOf = (door) => ({ x: (door.threshold[0].x + door.threshold[1].x) / 2, y: (door.threshold[0].y + door.threshold[1].y) / 2 });
const outFrom = (door, cells) => { const m = middleOf(door); return { x: m.x + door.normal[0] * cells, y: m.y + door.normal[2] * cells }; };
{
  const { runtime, position, origin } = inDoorField(4417);
  assert.equal(runtime.state().phase, 'chapel-outskirts');
  const doors = runtime.doorFieldDoors();
  const field = doors.filter((door) => !door.route);
  assert.ok(field.length >= 12, 'the chapel door field is thin');
  assert.equal(doors.filter((door) => door.route === 'chapel').length, 1, 'the chapel road does not end at exactly one chapel door');
  assert.ok(field.every((door) => !door.opened), 'a field door starts open');
  assert.ok(field.some((door) => door.shut) && field.some((door) => !door.shut), 'either every door opens or none does');
  // EVERY WORLD ON THE ROAD HAS A DOOR THAT OPENS. The station's errand wants
  // one thing out of each of the five worlds beside the whiteout, and the way
  // home only opens while he carries all five, so a seed that bars every door
  // onto a world — or deals it none — puts the way home out of reach. It did,
  // in seven runs out of eight, silently.
  {
    const { CHAPEL_WORLD_SET } = await import('../src/data/elsewhere-worlds.js');
    for (const seed of [1, 5, 7, 12, 23, 40, 4417]) {
      const dealt = inDoorField(seed).runtime.doorFieldDoors().filter((door) => !door.route);
      const opens = new Set(dealt.filter((door) => !door.shut).map((door) => door.variant));
      for (const variant of CHAPEL_WORLD_SET) {
        assert.ok(opens.has(variant), `seed ${seed} leaves no door that opens onto world ${variant}`);
      }
      assert.ok(dealt.some((door) => door.shut), `seed ${seed} bars nothing`);
    }

    // The tower road is dealt the same way, and its keys have to be doors that
    // open, so its own five worlds each need an opener too.
    const { buildBellsGodPreset } = await import('../src/game/chunk-surf-god.js');
    const { TOWER_WORLD_SET } = await import('../src/data/elsewhere-worlds.js');
    for (const seed of [1, 5, 31, 40, 4417]) {
      const built = buildBellsGodPreset(40, { seed, marbleEyes: 'returned' });
      const tower = createSourceSpaceRuntime({ initialState: built.state });
      tower.setPlayerPosition(built.position);
      const dealt = tower.doorFieldDoors().filter((door) => !door.route);
      const opens = new Set(dealt.filter((door) => !door.shut).map((door) => door.variant));
      for (const variant of TOWER_WORLD_SET) {
        assert.ok(opens.has(variant), `tower seed ${seed} leaves no door that opens onto world ${variant}`);
      }
      assert.ok(dealt.some((door) => door.key && !door.shut), `tower seed ${seed} has no key door that opens`);
      assert.ok(dealt.some((door) => door.shut), `tower seed ${seed} bars nothing`);
    }
  }
  const instances = runtime.propInstances(position.x, position.y, { time: 0 });
  for (const entry of instances.filter((item) => ['door-field', 'door-planting'].includes(item.sourceStructure))) {
    assert.ok(packMeshes.has(entry.mesh), `${entry.id} names ${entry.mesh}, which no loaded GLB contains`);
  }
  for (const door of field) assert.ok(instances.some((entry) => entry.id.startsWith(`${door.id}:leaf-`)), `${door.id} has no leaf`);
  assert.deepEqual(runtime.outskirtPortals(position.x, position.y), [], 'a closed door already shows elsewhere');
  // THE BUILDING'S OWN DOORS: each field door is one assembly — its frame, its
  // head, its own leaves — at its own size, never a frame with somebody else's
  // leaf stretched across it.
  const scaleOf = (m) => [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])];
  for (const door of doors) {
    const archetype = DOOR_ARCHETYPES[door.archetype];
    assert.ok(archetype, `${door.id} is not one of the building's door assemblies`);
    assert.equal(door.mesh, archetype.frameMesh, `${door.id} stands in another assembly's frame`);
    const parts = instances.filter((entry) => entry.id === door.id || entry.id.startsWith(`${door.id}:`));
    assert.deepEqual(parts.filter((entry) => entry.id.includes(':leaf-')).map((entry) => entry.mesh), Array(archetype.leafCount).fill(archetype.mesh), `${door.id} hangs the wrong leaves`);
    const masonry = ['masonry-infill', 'low-stone-lintel'].includes(archetype.head);
    assert.equal(parts.find((entry) => entry.id === `${door.id}:head`)?.mesh ?? null, masonry ? null : archetype.headMesh,
      masonry ? `${door.id} carries a lump of wall with no wall under it` : `${door.id} has another assembly's head`);
    for (const part of parts) for (const k of scaleOf(part.matrix)) assert.ok(Math.abs(k - 1) < 1e-5, `${part.id} is stretched (${k.toFixed(3)})`);
    const [a, b] = door.threshold;
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) * CELL - DOOR_FRAME_OPENINGS[archetype.frameMesh].width) < 1e-3, `${door.id}'s opening is not its frame's`);
  }
  assert.equal(doors.find((door) => door.route === 'chapel').archetype, 'chapel-oak-pair', 'the chapel road does not end at the chapel\'s own pair');
  // PLANTED THE WAY THE YARD IS: hedges for walls, street trees behind them,
  // grass and nettles against the boundaries, every one upright at its own size.
  const planting = instances.filter((entry) => entry.sourceStructure === 'door-planting');
  assert.ok(planting.length >= 60, `the corridor is barely planted (${planting.length})`);
  for (const entry of planting) {
    assert.ok(DOOR_FIELD_PLANTING_MESHES.includes(entry.mesh), `${entry.id} is not from the vegetation pack's planting (${entry.mesh})`);
    const [sx, sy, sz] = scaleOf(entry.matrix);
    assert.ok(sx >= .68 && sx <= 1.13 && Math.abs(sx - sy) < 1e-5 && Math.abs(sx - sz) < 1e-5, `${entry.id} is not at its own size (${sx.toFixed(2)})`);
    assert.ok(Math.abs(entry.matrix[5] / sy - 1) < 1e-5, `${entry.id} leans`);
  }
  for (const mesh of ['yard_hedge_run', 'vegetation_grass_edge']) assert.ok(planting.some((entry) => entry.mesh === mesh), `the corridor has no ${mesh}`);
  assert.ok(planting.some((entry) => /^opening_street_tree_small/.test(entry.mesh)), 'no street trees stand behind the hedges');
  const hedges = planting.filter((entry) => /^yard_hedge_/.test(entry.mesh));
  assert.ok(hedges.some((entry) => entry.matrix[12] / CELL - origin.x > 12) && hedges.some((entry) => entry.matrix[12] / CELL - origin.x < -12),
    'the corridor is not hedged on both sides');
  const rows = Array.from({ length: 12 }, (_, k) => position.y - 10 - k * 6);
  assert.ok(rows.some((y) => runtime.geometry.canStep(origin.x, y, origin.x + 2, y).ok), 'the corridor is not walkable');
  assert.ok(rows.every((y) => !runtime.geometry.canStep(origin.x + 10, y, origin.x + 16, y).ok), 'the hedge lets the body wander off');
  assert.ok(runtime.doorFieldWeather().rain > .9 && runtime.doorFieldWeather().sky, 'it is not raining in the corridor');
  const before = at(4417, (options) => buildChapelOutskirtsGodPreset(20, options)).runtime.doorFieldWeather();
  assert.deepEqual(before, { rain: 0, sky: false }, 'it rains in the nothing before the corridor');
}
{
  // CLOSED, THEN OPEN, THEN THROUGH, THEN GONE.
  const { runtime, position } = inDoorField(4417);
  const door = runtime.doorFieldDoors().find((entry) => !entry.route && !entry.shut);
  const middle = middleOf(door), front = outFrom(door, 1.5), back = outFrom(door, -1.5);
  assert.equal(runtime.geometry.canStep(front.x, front.y, middle.x, middle.y).ok, false, 'a closed door lets the body through');
  const standing = outFrom(door, 3), facing = facingToward(door.normal);
  runtime.setPlayerPosition({ ...standing, facing });
  const focus = runtime.focusAt(standing.x, standing.y, facing, null);
  assert.equal(focus?.kind, 'outskirt-door', 'a closed door cannot be tried');
  // A door is looked at before it is tried: the first press looks, the next opens it.
  let result;
  if (focus.id === door.id) {
    assert.equal(sourceFocusActionLabel(focus), 'LOOK AT THE DOOR');
    const look = runtime.inspectFocused(standing.x, standing.y, facing, null);
    assert.equal(look.event, 'door-field-look', 'the first press on a door does not look at it');
    assert.ok(look.archetype && look.world, 'looking at a door does not say which door or which world');
    assert.equal(sourceFocusActionLabel(runtime.focusAt(standing.x, standing.y, facing, null)), 'OPEN DOOR');
    result = runtime.inspectFocused(standing.x, standing.y, facing, null);
  } else result = runtime.openDoorFieldDoor(door.id);
  assert.equal(result.event, 'outskirt-door-opened', 'trying an unlocked door does not open it');
  assert.equal(runtime.doorFieldDoors().find((entry) => entry.id === door.id).opened, true, 'the opened door is not remembered');
  const portal = runtime.outskirtPortals(position.x, position.y).find((entry) => entry.id === door.id);
  assert.ok(portal, 'an opened door does not show elsewhere');
  const [bl, br, , tl] = portal.corners;
  const width = Math.hypot(br[0] - bl[0], br[2] - bl[2]), height = tl[1] - bl[1];
  assert.ok(width > .75 && width < 4.2 && height > 1.6 && height < 4.2, 'the opening is not door sized');
  assert.ok(Math.abs(portal.normal[1]) < 1e-6, 'an open door leans');
  assert.equal(runtime.geometry.canStep(front.x, front.y, middle.x, middle.y).ok, true, 'an opened door still refuses the body');
  runtime.setPlayerPosition({ ...front, facing: 0 });
  runtime.onStep(front, back);
  assert.equal(runtime.state().phase, 'chapel-outskirts', 'walking through a door went somewhere');
  assert.ok(!runtime.outskirtPortals(back.x, back.y).some((entry) => entry.id === door.id), 'the opening still shows elsewhere after being walked through');
  // Physically retrace the entrance. Take-back begins only once he is out.
  runtime.moveStationRealm({ dz: -1.2 });
  runtime.advanceStationTime(.5);
  // TAKEN BACK: its world pulls it in, slowly, and then only its mark is left.
  const now = runtime.stationTime();
  assert.ok(!runtime.propInstances(back.x, back.y, { time: 0, now }).some((entry) => entry.id === door.id), 'the door is still an ordinary door after being walked through');
  const mid = runtime.propInstances(back.x, back.y, { time: 0, now: now + runtime.TAKE_BACK_SECONDS * 0.3 });
  assert.ok(mid.some((entry) => entry.id === `taking:${door.id}:frame`), 'the door is not being taken back');
  const after = runtime.propInstances(back.x, back.y, { time: 0, now: now + 60 });
  assert.ok(!after.some((entry) => entry.id.startsWith(`taking:${door.id}:frame`) || entry.id.startsWith(`taking:${door.id}:leaf`)), 'the door is never fully taken back');
  assert.ok(after.some((entry) => entry.id === `taking:${door.id}:scar` && /^door_scar_/.test(entry.mesh)), 'its world leaves nothing where it stood');
}
{
  // THE WAY HOME. Carrying the five others' things, a whiteout door holds the
  // crossing open until main lets him go; then it folds and is taken back.
  const { runtime } = inDoorField(4417);
  const whiteout = runtime.doorFieldDoors().find((entry) => !entry.route && !entry.shut && entry.variant === 5);
  // Not conditional any more: a whiteout door that opens is guaranteed, and
  // wrapping these in `if (whiteout)` is what hid the way home being unreachable.
  assert.ok(whiteout, 'no whiteout door opens, so the way home cannot be walked');
  {
    runtime.setStationHomeOpen(true);
    runtime.openDoorFieldDoor(whiteout.id);
    const front = outFrom(whiteout, 1.5), back = outFrom(whiteout, -1.5);
    runtime.setPlayerPosition({ ...front, facing: 0 });
    runtime.onStep(front, back);
    runtime.advanceStationTime(60);
    const held = runtime.doorCrossingFrame();
    assert.ok(held?.home && held.reveal === 1, 'the way home does not hold open');
    assert.equal(runtime.doorTakeBackFrame(whiteout.id).phase, 'gone', 'the way home is taken back before he is let go');
    for (let step = 0; !runtime.stationRealmFrame().atWindow && step < 1000; step += 1) runtime.moveStationRealm({ dz: .085 });
    assert.equal(runtime.markHomeWindowReached(), true);
    assert.equal(runtime.releaseHomeCrossing(), true, 'the way home cannot be let go');
    runtime.advanceStationTime(.5);
    assert.equal(runtime.doorCrossingFrame(), null, 'the way home does not fold once let go');
    assert.equal(runtime.doorTakeBackFrame(whiteout.id).phase, 'taking', 'the way home is not taken back once let go');
  }
  const { resolveBagOwnership, bagInspectionDialogue } = await import('../src/game/bag-items.js');
  const bag = resolveBagOwnership({ bagTaken: true, relicsCarried: 3, jumperOwned: true });
  assert.ok(bag.kit.includes('station-relics') && bag.kit.includes('lyle-jumper'), 'the case does not carry what the worlds left, or the jumper');
  assert.ok(bagInspectionDialogue('lyle-jumper', {}), 'the jumper cannot be looked at');
}
{
  // SOME DOORS NEVER OPEN.
  const { runtime } = inDoorField(4417);
  const door = runtime.doorFieldDoors().find((entry) => !entry.route && entry.shut);
  const refused = runtime.openDoorFieldDoor(door.id);
  assert.equal(refused.opened, false, 'a locked door opened');
  assert.equal(refused.event, 'outskirt-door-shut');
  assert.ok(refused.line, 'trying a locked door says nothing');
  assert.equal(runtime.doorFieldDoors().find((entry) => entry.id === door.id).opened, false);
  const middle = middleOf(door), front = outFrom(door, 1.5);
  assert.equal(runtime.geometry.canStep(front.x, front.y, middle.x, middle.y).ok, false, 'a locked door lets the body through');
}

// The renderer and main are wired to the same doors, torch and rain.
{
  const props = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(props, /export function renderSourcePortals\(/);
  const portalFrag = props.slice(props.indexOf('const PORTAL_FRAG'), props.indexOf('let portalProgram'));
  assert.match(portalFrag, /if\(dot\(ray,vNormal\)>=0\.0\)discard;/, 'the back of an open door shows elsewhere too');
  const draw = r3d.slice(r3d.indexOf('function drawSourceVoidPhysical'), r3d.indexOf('function drawTextSpace'));
  const pass = draw.indexOf('P3.renderPropPass('), portals = draw.indexOf('P3.renderSourcePortals'), targets = draw.indexOf('P3.propTargets()');
  assert.ok(pass >= 0 && pass < portals && portals < targets, 'openings are not drawn into the physical void’s own prop targets');
  assert.match(draw, /light:voidTorch/, 'the torch is no stronger out where there is nothing to light');
  assert.match(r3d, /uniform vec4 uTorch;[\s\S]*pool/, 'the void shader draws no torch pool');
  assert.match(r3d, /const RAIN_GLSL = `[\s\S]*float rainVolume\(/, 'the rain is not one piece of GLSL');
  assert.equal((r3d.match(/`\+RAIN_GLSL\+/g) || []).length, 2, 'the building and the corridors do not fall through the same rain');
  assert.match(r3d, /uniform float uRain;[\s\S]*rainVolume\(uEyeCells,wd,distanceM\)/, 'the void shader draws no rain');
  assert.doesNotMatch(r3d, /streak\*clamp\(uRain/, 'the painted rain streaks are back');
  const sync = main.slice(main.indexOf('function syncSourceRender('), main.indexOf('// ── ARRIVING IN THE BELFRY'));
  assert.match(sync, /r3dSetSourcePortals\?\.\(chunkSurfRuntime\.outskirtPortals\?\.\(x,y\)/, 'the Source render sync does not tell the renderer where the openings are');
  assert.match(main, /result\.event==='outskirt-door-shut'\)\{ STORY\.menuDenied\(\)/, 'a locked door refuses silently');
  assert.match(main, /result\.event==='outskirt-door-opened'\)\{ CUES\.playCue\(CUES\.CUE\.door/, 'a door opens without a sound');
  const voidRainArgument=main.match(/sourceVoidRain:(usingSourceSpace\(\)[^\n]+),/)?.[1];
  assert.ok(voidRainArgument,'main never submits physical-void weather');
  const voidRainFor=new Function('usingSourceSpace','sourceShoreOutside','chunkSurfRuntime','sourceDemolitionBlackActive=()=>false',`return (${voidRainArgument});`);
  const weatherRuntime={sourceShoreFrame:()=>null,doorFieldWeather:()=>({rain:.6}),outskirtsWeather:()=>({rain:.8})};
  assert.equal(voidRainFor(()=>true,sourceShoreOutside,weatherRuntime,()=>true),0,'the finite demolition nothingness excludes visible rain');
  assert.equal(voidRainFor(()=>true,sourceShoreOutside,weatherRuntime),.8,'later Source keeps its stronger local weather');
  assert.equal(voidRainFor(()=>true,sourceShoreOutside,{...weatherRuntime,sourceShoreFrame:()=>({active:true,outside:true,proper:false})}),0,'the first nothingness excludes weather');
  assert.match(main, /const sky=!usingSpecialSpace\(\)\|\|sourceDoorFieldSky\(\);/, 'the storm never reaches the corridor');
  assert.match(main, /function skyOverhead\(\)\{\s*if\(sourceDoorFieldSky\(\)\)return true;/, 'the corridor\'s flash is dimmed as if under a roof');
  const corridorRainArgument=main.match(/syncSourceCorridorRain\(([^;]+),\{hall:inHall\}\);/)?.[1];
  assert.ok(corridorRainArgument,'the corridor no longer submits its own rain');
  const corridorRainFor=new Function('firstNothingness','inHall','hallWeather','chunkSurfRuntime','inRealm','inPersonal','demolitionBlack=false',`return (${corridorRainArgument});`);
  assert.equal(corridorRainFor(false,false,{rain:.4},weatherRuntime,false,false,true),0,'the finite demolition nothingness excludes the corridor rain bed');
  assert.equal(corridorRainFor(false,true,{rain:.4},weatherRuntime,false),.4,'the hall keeps its authored rain');
  assert.equal(corridorRainFor(false,false,{rain:.4},weatherRuntime,false),.6,'the door field keeps its own rain');
  assert.equal(corridorRainFor(true,false,{rain:.4},weatherRuntime,false),0,'the first nothingness stays silent');
  assert.equal(corridorRainFor(false,false,{rain:.4},weatherRuntime,true),0,'the station rain leaks into an elsewhere realm');
  assert.equal(corridorRainFor(false,false,{rain:.4},weatherRuntime,false,true),0,'the station rain leaks into the tower\'s personal land');
}

// ── NIGHT FROM THE FIRST STEP, LAMPS THAT GO OUT BEHIND ─────────────────────
{
  for (const depth of [6, 40, 160]) {
    const built = at(4417, (options) => buildPreTapeGodPreset(depth, options));
    assert.equal(built.runtime.sourceVoidDawn(), 0, `the field's paper is still on the ground ${depth} cells out`);
  }
  // Walk the whole road looking ahead: every beat that asks only to be reached
  // fires once, and the lamps go out behind.
  const { runtime, position, origin } = at(4417, (options) => buildPreTapeGodPreset(6, options));
  const fired = [], lampsOff = [];
  let y = position.y;
  // The whole walk out: the still ground, then all of the road.
  for (let k = 0; k < SOURCE_PRE_TAPE.length; k += 1) {
    runtime.setPlayerPosition({ x: position.x, y, facing: 0 });
    runtime.propInstances(position.x, y, { time: 0, viewYaw: 0 });
    for (const event of runtime.outskirtsBeatFrame({ viewYaw: 0 }).events) (event.cue === 'lamp-off' ? lampsOff : fired).push(event.id);
    y -= 1;
  }
  assert.equal(new Set(fired).size, fired.length, 'a beat fired twice');
  for (const beat of OUTSKIRT_BEATS.filter((entry) => entry.trigger === 'reach')) assert.ok(fired.includes(beat.id), `${beat.id} never happened`);
  assert.ok(!fired.includes('lamps-behind'), 'looking back fired without looking back');
  assert.ok(lampsOff.length >= 8, `the lamps stay on behind him (${lampsOff.length})`);
  // Back on the first stretch, past its lodge, to look back at the dark road.
  runtime.setPlayerPosition({ x: position.x, y: position.y - (SOURCE_PRE_TAPE.stillLength + Math.round(40 / CELL)), facing: 0 });
  assert.ok(runtime.outskirtsBeatFrame({ viewYaw: Math.PI }).events.some((event) => event.id === 'lamps-behind'), 'looking back at the dark road says nothing');
  runtime.setPlayerPosition({ x: position.x, y, facing: 0 });
  // The pools are the lit lamps', and only near.
  const fresh = at(4417, (options) => buildPreTapeGodPreset(20, options));
  const pools = fresh.runtime.outskirtLampPools(fresh.position.x, fresh.position.y);
  assert.ok(pools.length > 0 && pools.length <= 3 && pools.every((pool) => pool.pool && pool.distanceM <= 45), 'the road has no light on it');
  // Past the road's own lamps there is only the faulty last light over the
  // recorder (OUTSKIRT_LAST_LIGHT); nothing else out there is lit.
  assert.deepEqual(runtime.outskirtLampPools(position.x, y).map((pool) => pool.id), ['end-last-light'], 'the nothing is lit');
}

// ── THE ORDINARY TORCH, TIRED ───────────────────────────────────────────────
{
  const { runtime } = at(4417, (options) => buildPreTapeGodPreset(40, options));
  assert.equal(runtime.sourceFlashlightFrame({ time: 1 }).mode, 'normal', 'the outskirts torch is not the ordinary beam');
  assert.equal(runtime.sourceFlashlightFrame({ time: 1 }).xray, false);
  let dimmed = 0, blackedOut = 0;
  const samples = 60000;
  for (let i = 0; i < samples; i += 1) {
    const value = torchFlickerAt(i / 1000, 4417);
    assert.ok(value >= 0 && value <= 1, 'the voltage leaves the torch range');
    if (value < .5) dimmed += 1;
    if (value === 0) blackedOut += 1;
  }
  assert.ok(dimmed / samples > .2, 'the outskirts torch is almost always bright');
  assert.ok(blackedOut / samples > .06 && blackedOut / samples < .25, 'the torch has no bounded blackouts');
  for (let t = 0; t < 60; t += .013) {
    assert.equal(runtime.sourceFlashlightFrame({ time: t, flashMode: 'off' }).flicker, 1, 'reduced flashing still flickers the torch');
  }
  const base = resolveTorchLook({ on: true, battery: 1 });
  const dipped = applySourceEmergencyTorch(base, { flicker: .2 });
  assert.ok(dipped.power < base.power && dipped.power > 0, 'the flicker does not reach the beam');
  assert.equal(applySourceEmergencyTorch(base, {}).power, base.power);
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(r3d, /empty=mix\(empty,[\s\S]*uVoidDawn/, 'the void shader does not carry the field\'s paper out');
  assert.match(r3d, /sourceVoidPhysicalU\('uVoidDawn'\),sourceVoidDawn/, 'the fade never reaches the shader');
  assert.match(main, /sourceVoidDawn:usingSourceSpace\(\)\?chunkSurfRuntime\.sourceVoidDawn/, 'main never sends the fade');
}

// ── SOMEWHERE TO WALK TO ────────────────────────────────────────────────────
{
  const near = at(4417, (options) => buildPreTapeGodPreset(40, options));
  const far = at(4417, (options) => buildPreTapeGodPreset(300, options));
  const objective = near.runtime.sourceObjective();
  assert.ok(objective.bearing, 'the walk out gives no bearing');
  assert.match(objective.label, /PICTURE/, 'the walk out does not say where it goes');
  assert.equal(objective.target.y, near.origin.y + SOURCE_HORIZON.from, 'the walk out points somewhere other than the head of the tape');
  const a = near.runtime.sourceVoidBeacon(), b = far.runtime.sourceVoidBeacon();
  assert.ok(a && b, 'there is nothing to see ahead in the dark');
  assert.ok(b.distanceM < a.distanceM && b.strength > a.strength, 'the picture ahead does not get nearer as you walk');
  const onTape = at(4417, (options) => buildHorizonGodPreset(20, options));
  assert.equal(onTape.runtime.sourceVoidBeacon(), null, 'the beacon is still drawn on the tape itself');
  const chapel = at(4417, (options) => buildChapelOutskirtsGodPreset(20, options));
  assert.ok(chapel.runtime.sourceObjective().bearing, 'the chapel outskirts give no bearing to the chapel door');
  const r3d = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(r3d, /uniform vec4 uBeacon;[\s\S]*empty=mix\(empty,picture/, 'the void shader does not draw the picture ahead');
  assert.match(r3d, /sourceVoidPhysicalU\('uBeacon'\)/, 'the beacon never reaches the shader');
  assert.match(main, /sourceVoidBeacon:usingSourceSpace\(\)\?chunkSurfRuntime\.sourceVoidBeacon/, 'main never sends the beacon');
}
// ── STILL, EXCEPT WHAT SHOULD NOT BE ────────────────────────────────────────
{
  const matrices = (runtime, position, viewYaw) => new Map(runtime.propInstances(position.x, position.y, { time: 0, viewYaw })
    .filter((entry) => entry.sourceStructure === 'outskirts').map((entry) => [entry.id, [...entry.matrix].join(',')]));
  // Standing at the third lodge: look at it, look away, look back.
  const depth = SOURCE_PRE_TAPE.stillLength + Math.round((6 + 2 * OUTSKIRT_STRETCH_METRES + 4) / CELL);
  const { runtime, position } = at(4417, (options) => buildPreTapeGodPreset(depth, options));
  const watched = matrices(runtime, position, 0);
  assert.ok([...watched.keys()].some((id) => /r2-booth-guard/.test(id)), 'the guard is not at the third lodge');
  matrices(runtime, position, Math.PI);
  const returned = matrices(runtime, position, 0);
  assert.ok(![...returned.keys()].some((id) => /r2-booth-guard/.test(id)), 'the guard is still there after you looked away');
  const moved = [...returned].filter(([id, matrix]) => watched.has(id) && watched.get(id) !== matrix).map(([id]) => id);
  assert.ok(moved.every((id) => /bus-woman/.test(id)), `something other than a watcher moved: ${moved.join(', ')}`);
  assert.ok(runtime.outskirtsBeatFrame({ viewYaw: 0 }).events.some((event) => event.id === 'guard-gone'), 'nobody notices the guard is gone');

  const still = at(4417, (options) => buildPreTapeGodPreset(depth, options));
  const before = new Map(still.runtime.propInstances(still.position.x, still.position.y, { time: 0, viewYaw: 0, reducedMotion: true })
    .filter((entry) => entry.sourceStructure === 'outskirts').map((entry) => [entry.id, [...entry.matrix].join(',')]));
  still.runtime.propInstances(still.position.x, still.position.y, { time: 0, viewYaw: Math.PI, reducedMotion: true });
  const reduced = new Map(still.runtime.propInstances(still.position.x, still.position.y, { time: 0, viewYaw: 0, reducedMotion: true })
    .filter((entry) => entry.sourceStructure === 'outskirts').map((entry) => [entry.id, [...entry.matrix].join(',')]));
  assert.ok(!reduced.has('r2-booth-guard'), 'reduced motion loses the discrete guard disappearance');
  for (const [id, matrix] of reduced) {
    if (!/bus-woman/.test(id)) assert.equal(matrix, before.get(id), `reduced motion displaces ${id}`);
  }

  const walk = at(4417, (options) => buildPreTapeGodPreset(40, options)).runtime;
  const paces = Array.from({ length: 600 }, (_, k) => walk.pressureFrame({ time: k * .05 }).movementMultiplier);
  const sorted = [...paces].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(median < 2, `the outskirts still walk at the tape's crawl (median ${median.toFixed(2)})`);
  assert.ok(Math.max(...paces) > 2.5, 'the body never stumbles');
  const body = walk.outskirtsBodyFrame({ time: 1.3 });
  assert.ok(body && Math.abs(body.sway) > 0, 'the camera has no body in it');
  const calm = walk.outskirtsBodyFrame({ time: 1.3, reducedMotion: true });
  assert.equal(calm.sway, 0); assert.equal(calm.eyeDropM, 0);
  const tape = at(4417, (options) => buildHorizonGodPreset(40, options)).runtime;
  tape.tickHorizon(.1);
  assert.ok(tape.pressureFrame({ time: 3 }).movementMultiplier < 3, 'the early recording snaps to its settled pace');
  assert.ok(tape.outskirtsBodyFrame({ time: 3 }), 'the tired street body vanishes at the old tape seam');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /viewYaw:R3\.r3dLookAngles\?\.\(\)\?\.yaw/, 'the outskirts never learn where you are looking');
  assert.match(main, /outskirtsBody\?outskirtsBody\.eyeDropM\+outskirtsStride:0/, 'the stumble never reaches the eye');
  assert.match(main, /syncOutskirtsNight\(\);/, 'nothing happens on the road');
}
// ── SOLID ON THE ROAD, RAIN ON THE ROAD, AND THE PICTURE COMES CLOSER ───────
{
  const still = at(4417, (options) => buildPreTapeGodPreset(Math.round(SOURCE_PRE_TAPE.stillLength / 2), options));
  assert.equal(still.runtime.outskirtsWeather().rain, 0, 'it rains on the still ground');
  const mid = at(4417, (options) => buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength + Math.round(SOURCE_PRE_TAPE.roadLength / 2), options));
  assert.ok(mid.runtime.outskirtsWeather().rain > 0.9, 'it does not rain on the road');

  // THE BODY WALKED THROUGH THE BUS. The lodge, the bus and a lamp post refuse;
  // the road down the middle and the gap between the gate piers do not.
  const { runtime, origin } = mid;
  const cell = (piece) => ({ x: Math.round(piece.x / CELL - 0.5), y: Math.round(piece.z / CELL - 0.5) });
  const solid = (id, localX = 0, localZ = 0) => {
    const piece = runtime.outskirtsPiece(id);
    assert.ok(piece, `there is no ${id} on the road`);
    const c = { x: (piece.x + localX * Math.cos(piece.yaw) + localZ * Math.sin(piece.yaw)) / CELL - 0.5,
      y: (piece.z - localX * Math.sin(piece.yaw) + localZ * Math.cos(piece.yaw)) / CELL - 0.5 };
    return runtime.geometry.canStep(c.x, c.y + 1, c.x, c.y);
  };
  assert.equal(solid('r0-booth', -0.48, -1.41).ok, false, 'the body walks through the lodge counter');
  assert.equal(solid('r0-bus', 1.165, 0).ok, false, 'the body walks through the closed bus side');
  assert.equal(solid('r0-lamp-1').ok, false, 'the body walks through a lamp post');
  const lodgeRow = cell(runtime.outskirtsPiece('r0-booth')).y;
  assert.equal(runtime.geometry.canStep(origin.x, lodgeRow + 1, origin.x, lodgeRow).ok, true, 'the road itself refuses the body');
  const gateRow = cell(runtime.outskirtsPiece('r0-gate')).y;
  assert.equal(runtime.geometry.canStep(origin.x, gateRow + 1, origin.x, gateRow).ok, true, 'the gate piers close the road');

  // FURTHER OFF, AND IT ARRIVES: small from the doors, several times larger by
  // the last stretch.
  const angle = (beacon) => Math.atan2(beacon.halfWidthM, beacon.distanceM);
  const far = at(4417, (options) => buildPreTapeGodPreset(SOURCE_PRE_TAPE.entryStandoff, options)).runtime.sourceVoidBeacon();
  const near = at(4417, (options) => buildPreTapeGodPreset(SOURCE_PRE_TAPE.length - 40, options)).runtime.sourceVoidBeacon();
  assert.ok(angle(far) < 0.06, `the picture looks close from the doors (${angle(far).toFixed(3)} rad)`);
  assert.ok(angle(near) > angle(far) * 3, 'the picture does not grow as you walk at it');

  // A CATCH, NOT A LUNGE.
  const { outskirtsGaitAt } = await import('../src/game/source-space-runtime.js');
  let worst = 0;
  for (let t = 0; t < 120; t += 0.05) worst = Math.max(worst, outskirtsGaitAt(t, 4417).eyeDropM);
  assert.ok(worst <= 0.08, `a stumble drops the eye ${worst.toFixed(3)} m`);
}

// ── THINGS TO LOOK AT, AND WORDS FOR ALL OF THEM ───────────────────────────
{
  const story = JSON.parse(readFileSync(new URL('../content/narrative/source-space.outskirts.story.json', import.meta.url), 'utf8'));
  const keys = new Set(outskirtsArrivalLayout().filter((piece) => piece.inspect).map((piece) => piece.inspect));
  assert.ok(keys.size >= 10, `the road has only ${keys.size} things to look at`);
  for (const key of keys) assert.ok((story.nodes[key] || story.nodes[`${key}.b0`]), `${key} can be looked at but the outskirts document has no words for it`);
  // Three errands pay, once each (the ledger, the ticket, the letter he never
  // posted); the rest go nowhere, or get worse down the road.
  const rewards = Object.values(story.nodes).flatMap((node) => node.choices || []).filter((choice) => choice.reward === 'composure');
  assert.deepEqual([...new Set(rewards.map((choice) => choice.rewardId))].sort(), ['ledger', 'letter', 'ticket'], 'the errands that pay are not the ledger, the letter and the ticket');
  for (const key of ['van', 'bin', 'bench', 'car']) assert.ok(story.nodes[`${key}.b5`], `${key} does not change by the end of the road`);
  // Standing at the first lodge, it can be looked at, and looking says which.
  const { runtime } = at(4417, (options) => buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength + Math.round((6 + 12) / CELL), options));
  const lodge = runtime.outskirtsPiece('r0-booth');
  // Beside it on the road, facing it (facing 3 is west, toward the lodge).
  const stand = { x: Math.round(lodge.x / CELL - 0.5) + 5, y: Math.round(lodge.z / CELL - 0.5) };
  runtime.setPlayerPosition({ ...stand, facing: 3 });
  const inspected = runtime.inspectFocused(stand.x, stand.y, 3, null);
  assert.equal(inspected?.event, 'outskirts-inspect', `looking at the lodge does nothing (${JSON.stringify(inspected)})`);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /result\.event==='outskirts-inspect'\)\{ openOutskirtsInspection\(result\)/, 'main never opens what he looks at');
  assert.match(main, /const OUTSKIRTS_STORY=runtimeTree\('source-space\.outskirts'\)/, 'main never loads the outskirts document');
}

console.log('source outskirts specs passed');
