import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSourceBellField, sourceBellContactShape, sourceBellFieldRules } from '../src/game/source-bell-field.js';
import { SOURCE_BELLS, SOURCE_BELL_PASSAGE, bellSwingAt } from '../src/data/source-level.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

const y = SOURCE_BELLS.from - 30;
const bell = (extra = {}) => ({ id: 'test-bell', mesh: 'tower_bell_01', x: 0, y, scale: 2, elevation: 2.04, contact: true, ...extra });
const contact = (runtime, entry) => {
  const shape = sourceBellContactShape(entry);
  runtime.step({ x: shape.x, y: shape.y + shape.ry + 2, dt: 0.1 });
  return runtime.step({ x: shape.x, y: shape.y + shape.ry - 0.15, dt: 0.1 });
};
const release = (runtime, entry) => {
  const shape = sourceBellContactShape(entry);
  for (let index = 0; index < 30; index += 1) runtime.step({ x: shape.x, y: shape.y + shape.ry + 3, dt: 0.1 });
};

// A new or partially saved field cannot impart recoil before the first contact.
{
  for (const initialState of [null, {}, { velocity: {} }, { velocity: { x: 0 } }, { velocity: { x: NaN, y: Infinity } }]) {
    const runtime = createSourceBellField({ initialState, placements: [] });
    assert.deepEqual(runtime.snapshot().velocity, { x: 0, y: 0 });
    assert.equal(runtime.frame().recoiling, false);
    const position = { x: 0, y: SOURCE_BELLS.from - SOURCE_BELLS.entryStandoff };
    for (const dt of [0, 0.001, 0.016, 0.1]) {
      const result = runtime.step({ ...position, dt });
      assert.equal(result.moved, false);
      assert.deepEqual(result.position, position);
      assert.equal(result.contacts.length, 0);
    }
  }
}

// Story's first checkpoint and third warning survive reload after backtracking.
{
  const previous = { x: 40, y: SOURCE_BELLS.from - 120 };
  const runtime = createSourceBellField({ difficulty: 'story', placements: [],
    initialState: { checkpointDepth: 148, noise: 3, previous } });
  assert.equal(runtime.frame().checkpointDepth, 148);
  assert.equal(runtime.frame().noise, 3);
  const result = runtime.step({ ...previous, dt: 0.016 });
  assert.equal(result.checkpointDepth, 148);
  assert.equal(result.noise, 3);
  assert.equal(result.reset, null);
  assert.equal(result.moved, false);
}

// Every field object uses a named mesh that is really inside the shipped GLB.
{
  const bytes = readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonSize = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString('utf8'));
  const meshes = new Set(gltf.meshes.map((mesh) => mesh.name));
  for (const entry of SOURCE_BELL_PASSAGE) assert.ok(meshes.has(entry.mesh), entry.mesh);
  const collidable = SOURCE_BELL_PASSAGE.filter((entry) => entry.contact);
  assert.ok(collidable.length >= 18, 'a field of physical bells, not six distant scenery props');
  assert.ok(collidable.every((entry) => !entry.blocks), 'no conflicting hard grid wall prevents soft contact');
  const sounding = collidable.filter((entry) => entry.sounds).length;
  assert.ok(sounding > 1 && sounding <= collidable.length / 3, 'most collisions are silent');
  assert.ok(new Set(collidable.map((entry) => entry.scale)).size >= 10);
}

// Mesh metres become local cells exactly once; overhead bells do not collide.
{
  const entry = bell();
  const shape = sourceBellContactShape(entry);
  assert.equal(shape.rx, (PROP_BOUNDS[entry.mesh].max[2] * 2 + 0.24) / CELL);
  assert.equal(shape.ry, (PROP_BOUNDS[entry.mesh].max[2] * 2 + 0.24) / CELL);
  assert.equal(sourceBellContactShape(bell({ elevation: 8 })), null);
  assert.equal(sourceBellContactShape(bell({ contact: false })), null);
  assert.equal(sourceBellContactShape(bell({ mesh: 'imaginary-bell' })), null);
  const tilted = sourceBellContactShape(bell({ roll: 0.3 }));
  assert.ok(tilted.x > shape.x, 'rolling the mesh moves its body around the headstock pivot');
  const turned = sourceBellContactShape(bell({ yaw: Math.PI / 4 }));
  assert.ok(Math.abs(turned.rx - shape.rx) < 0.01, 'turning a circular bell does not inflate its collision envelope');
}

// A silent contact pushes the body clear without touching health, view or input.
{
  const entry = bell(), runtime = createSourceBellField({ placements: [entry] });
  const result = contact(runtime, entry);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].sounded, false);
  assert.equal(result.strikes.length, 0);
  assert.equal(result.noise, 0);
  assert.equal(result.reset, null);
  assert.equal(result.moved, true);
  for (const key of ['damage', 'health', 'yaw', 'pitch', 'blocksInput']) assert.equal(result[key], undefined);
  const shape = sourceBellContactShape(entry);
  assert.ok(result.position.y > shape.y + shape.ry, 'resolved outside the visible body');
  const recoil = runtime.step({ ...result.position, dt: 0.1 });
  assert.ok(recoil.position.y > result.position.y, 'short continuous shove continues after contact');
}

// Swept collision catches a one-frame crossing rather than tunnelling through.
{
  const entry = bell({ scale: 1, elevation: 1.02 }), runtime = createSourceBellField({ placements: [entry] });
  runtime.step({ x: 0, y: y + 6, dt: 0.1 });
  const result = runtime.step({ x: 0, y: y - 6, dt: 0.1 });
  assert.equal(result.contacts.length, 1);
  assert.ok(result.position.y > y, 'the body remains on the approached side');
}

// Holding into one bell is not dozens of strikes. Leave, cool down, then return.
{
  const entry = bell({ sounds: true }), runtime = createSourceBellField({ placements: [entry] });
  let result = contact(runtime, entry);
  assert.equal(result.strikes.length, 1);
  assert.equal(result.strikes[0].bell, 1);
  const shape = sourceBellContactShape(entry);
  for (let index = 0; index < 80; index += 1) result = runtime.step({ x: 0, y: shape.y + shape.ry - 0.1, dt: 0.1 });
  assert.equal(result.rings, 1);
  assert.equal(result.resets, 0);
  release(runtime, entry);
  result = contact(runtime, entry);
  assert.equal(result.rings, 2);
}

// Difficulty changes the noise budget, while each completed cluster is safe.
{
  for (const difficulty of ['story', 'contract', 'night', 'dead-air']) {
    const entry = bell({ sounds: true });
    const runtime = createSourceBellField({ placements: [entry], difficulty });
    runtime.step({ x: 0, y: SOURCE_BELLS.from - 290, dt: 0.1 });
    const expectedDepth = 282;
    assert.equal(runtime.frame().checkpointDepth, expectedDepth);
    let result;
    for (let hit = 0; hit < sourceBellFieldRules(difficulty).noiseLimit; hit += 1) {
      release(runtime, entry);
      result = contact(runtime, entry);
    }
    assert.equal(result.resets, 1, difficulty);
    assert.equal(result.reset.reason, 'noise');
    assert.equal(result.position.y, SOURCE_BELLS.from - (expectedDepth || SOURCE_BELLS.entryStandoff));
    assert.equal(result.noise, 0);
    assert.equal(result.recoiling, false);
  }
}

// Quiet clearings settle warnings, and changing difficulty or reloading cannot
// force a completed cluster to be replayed. The final mistake returns only to
// the current cluster, even after the player looked back along the route.
{
  for (const difficulty of ['story', 'contract', 'night', 'dead-air']) {
    const entry = bell({ sounds: true, y: SOURCE_BELLS.from - 470 });
    const original = createSourceBellField({ placements: [entry], difficulty });
    for (const [index, checkpoint] of SOURCE_BELLS.checkpoints.entries()) {
      const result = original.step({ x: checkpoint.x, y: SOURCE_BELLS.from - checkpoint.depth - 1, dt: 0.1 });
      assert.equal(result.checkpoint.depth, checkpoint.depth, difficulty);
      assert.equal(result.completedClusters, index + 1, difficulty);
    }
    const restored = createSourceBellField({ placements: [entry], difficulty: 'dead-air',
      initialState: JSON.parse(JSON.stringify(original.snapshot())) });
    assert.equal(restored.frame().checkpointDepth, 424, difficulty);
    assert.equal(restored.frame().completedClusters, 3, difficulty);
    restored.step({ x: 40, y: SOURCE_BELLS.from - 80, dt: 0.1, difficulty });
    assert.equal(restored.frame().checkpointDepth, 424, 'backtracking and changing difficulty retain earned ground');
    let result;
    for (let hit = 0; hit < sourceBellFieldRules(difficulty).noiseLimit; hit += 1) {
      release(restored, entry);
      result = contact(restored, entry);
    }
    assert.equal(result.resets, 1, difficulty);
    assert.equal(result.reset.y, SOURCE_BELLS.from - 424, difficulty);
    assert.equal(result.completedClusters, 3, difficulty);
  }
  const entry = bell({ sounds: true });
  const runtime = createSourceBellField({ placements: [entry], difficulty: 'dead-air' });
  assert.equal(contact(runtime, entry).noise, 1);
  const clearing = runtime.step({ x: 0, y: SOURCE_BELLS.from - 149, dt: 0.1 });
  assert.equal(clearing.noise, 0, 'a newly earned quiet clearing settles the last cluster’s warning');
  assert.equal(clearing.checkpoint.depth, 148);
  const repeated = runtime.step({ x: 0, y: SOURCE_BELLS.from - 150, dt: 0.1 });
  assert.equal(repeated.checkpoint, null, 'one completion event per clearing');
}

// A shove over a cluster boundary does not complete the walk for the player.
{
  const runtime = createSourceBellField({ placements: [], initialState: { velocity: { x: 0, y: -10 } } });
  const result = runtime.step({ x: 0, y: SOURCE_BELLS.from - 147.9, dt: 0.1 });
  assert.ok(SOURCE_BELLS.from - result.position.y > 148, 'the initial recoil crosses the boundary');
  assert.equal(result.checkpointDepth, 0);
  assert.equal(result.checkpoint, null);
}

// Snapshot round trips preserve ringing/cooldown, but never retain unknown ids.
{
  const entry = bell({ sounds: true }), original = createSourceBellField({ placements: [entry] });
  contact(original, entry);
  const saved = JSON.parse(JSON.stringify(original.snapshot()));
  const restored = createSourceBellField({ initialState: saved, placements: [entry] });
  assert.deepEqual(restored.snapshot(), saved);
  for (let index = 0; index < 50; index += 1) {
    const input = { x: Math.sin(index) * 2, y: y + 7, dt: 0.016 };
    assert.deepEqual(original.step(input), restored.step(input));
  }
  const corrupt = createSourceBellField({ initialState: { noise: Infinity, elapsed: NaN, checkpointDepth: 900, touching: ['missing'], cooldowns: [['missing', 99]] } });
  assert.ok(Number.isFinite(corrupt.snapshot().elapsed));
  assert.deepEqual(corrupt.snapshot().touching, []);
  assert.deepEqual(corrupt.snapshot().cooldowns, []);
  assert.equal(corrupt.snapshot().checkpointDepth, 424);
}

// No stale jump across the route after suspension; reduced motion keeps contact.
{
  const entry = bell(), runtime = createSourceBellField({ placements: [entry] });
  contact(runtime, entry);
  runtime.step({ x: 0, y: y + 10, active: false });
  const resumed = runtime.step({ x: 0, y: y - 10, dt: 0.1 });
  assert.equal(resumed.contacts.length, 0);
  const standard = createSourceBellField({ placements: [entry] });
  const reduced = createSourceBellField({ placements: [entry] });
  const shape = sourceBellContactShape(entry);
  const standardHit = standard.step({ x: 0, y: shape.y + shape.ry - 0.1, dt: 0.1 });
  const reducedHit = reduced.step({ x: 0, y: shape.y + shape.ry - 0.1, dt: 0.1, reducedMotion: true });
  assert.equal(reducedHit.contacts.length, standardHit.contacts.length);
  assert.ok(Math.abs(reduced.snapshot().velocity.y) < Math.abs(standard.snapshot().velocity.y));
}

// The fixed manifest has a connected route from the seam to the existing room.
// A conservative 1-cell occupancy flood catches impossible walls/clearings.
{
  const shapes = SOURCE_BELL_PASSAGE.map((entry) => sourceBellContactShape(entry)).filter(Boolean);
  for (const body of shapes.filter((entry) => entry.id.startsWith('bells-field-'))) {
    for (const other of shapes.filter((entry) => entry.id !== body.id)) {
      assert.ok(Math.hypot((body.x - other.x) / other.rx, (body.y - other.y) / other.ry) > 1.05,
        `${body.id} must not be buried inside ${other.id}`);
    }
  }
  const free = (x, depth) => shapes.every((shape) => Math.hypot((x - shape.x) / (shape.rx + 0.8), (SOURCE_BELLS.from - depth - shape.y) / (shape.ry + 0.8)) > 1);
  for (const checkpoint of SOURCE_BELLS.checkpoints) assert.ok(free(checkpoint.x, checkpoint.depth), `checkpoint ${checkpoint.depth} must be clear`);
  const queue = [[0, 8]], seen = new Set(['0:8']);
  let reached = false;
  for (let index = 0; index < queue.length; index += 1) {
    const [x, depth] = queue[index];
    if (depth >= SOURCE_BELLS.from - SOURCE_BELLS.room.threshold - 1 && Math.abs(x) <= 4) { reached = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nd = depth + dy, key = `${nx}:${nd}`;
      if (Math.abs(nx) > SOURCE_BELLS.halfWidth - 3 || nd < 2 || nd > SOURCE_BELLS.from - SOURCE_BELLS.room.threshold + 2 || seen.has(key) || !free(nx, nd)) continue;
      seen.add(key); queue.push([nx, nd]);
    }
  }
  assert.equal(reached, true, 'at least one generous physical route survives the full field');
}

console.log('source bell field specs passed');
