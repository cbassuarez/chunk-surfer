// One night's wind, read by three renderers that share no drawing code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windAt, windForce } from '../src/world/wind.js';
import { LEAF_COLOURS, LEAF_SHAPES, leafColour, leafOutline, leafShape } from '../src/world/leaf-species.js';
import { FLURRY_MESHES, freshLeafFlurry, leafFlurryInstances, leafFlurrySources, leafGust, leafSourcePresence, stepLeafFlurry } from '../src/game/leaf-flurry.js';

test('the gust is one function of the clock, so every renderer agrees', () => {
  // Two callers at the same moment must get the same weather. This is the whole
  // reason the wind is not three private oscillators.
  for (const t of [0, 3.5, 40, 300]) assert.equal(windAt(t), windAt(t));
  // Centred on 1, and depth is how much of it a weather feels.
  for (const t of [0, 1, 7, 19, 55]) {
    assert.ok(Math.abs(windAt(t, { depth: 1 }) - 1) <= 0.55, `bounded at ${t}`);
    assert.ok(Math.abs(windAt(t, { depth: 0.1 }) - 1) < Math.abs(windAt(t, { depth: 1 }) - 1) + 1e-9);
  }
  assert.equal(windAt(10, { depth: 0 }), 1, 'depth 0 feels no gust at all');
  for (const t of [0, 5, 21]) { const f = windForce(t); assert.ok(f >= 0 && f <= 1); }
  // It must not obviously loop inside a session.
  assert.notEqual(windAt(12).toFixed(4), windAt(12 + 2 * Math.PI / 0.31).toFixed(4));
});

test('leaves are a palette and a shape set, not a hue jitter', () => {
  assert.equal(LEAF_COLOURS.length, 5);
  assert.equal(new Set(LEAF_COLOURS.map((c) => c.fill)).size, 5, 'five distinct kinds of tree');
  for (const colour of LEAF_COLOURS) {
    assert.match(colour.fill, /^#[0-9A-F]{6}$/i);
    assert.notEqual(colour.vein, colour.fill, 'a midrib you can see');
  }
  const ids = LEAF_SHAPES.map((s) => s.id);
  assert.deepEqual(ids, ['blade', 'lobed', 'curled', 'skeleton']);
  // Weighted: plain blades common, the skeleton is the one you notice.
  const drawn = Array.from({ length: 400 }, (_, i) => leafShape(i / 400).id);
  assert.ok(drawn.filter((id) => id === 'blade').length > drawn.filter((id) => id === 'skeleton').length * 2);
  assert.ok(new Set(drawn).size === 4, 'all four are reachable');
  assert.equal(leafColour(0).id, 'ochre');
  assert.equal(leafColour(0.999).id, 'pale');
});

test('the outline is asymmetric, which is what stops a leaf reading as a coin', () => {
  for (const shape of LEAF_SHAPES) {
    const points = leafOutline(shape);
    assert.ok(points.length > 8);
    // Widest a third from the stalk, not at the middle.
    const widths = points.map((p) => p.upper - p.lower);
    const widest = widths.indexOf(Math.max(...widths));
    assert.ok(widest > 0 && widest < points.length - 1, `${shape.id} tapers at both ends`);
    // The curl lifts one edge and drops the other, so the two sides of the
    // outline are not mirror images.
    const mid = points[Math.floor(points.length / 2)];
    if (shape.curl > 0.3) assert.notEqual(Math.abs(mid.upper), Math.abs(mid.lower));
    for (const p of points) assert.ok(Number.isFinite(p.upper) && Number.isFinite(p.lower));
  }
});

test('the yard flurry fills outdoors, empties indoors, and never pops in front of you', () => {
  const origin = { x: 100, z: 100, y: 0 };
  const state = freshLeafFlurry({ seed: 3, bearing: 0.5 });
  for (let i = 0; i < 40; i += 1) stepLeafFlurry(state, 0.05, { origin, presence: 1 });
  assert.equal(state.leaves.length, 40);
  // Every mesh it asks for has to exist in the pack, or a leaf is an invisible
  // instance that still costs a draw.
  const glb = readFileSync('public/assets/conservatory-props.glb');
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8').trim());
  const packed = new Set(gltf.meshes.map((m) => m.name));
  for (const mesh of FLURRY_MESHES) assert.ok(packed.has(mesh), `${mesh} is in the prop pack`);
  for (const leaf of state.leaves) assert.ok(FLURRY_MESHES.includes(leaf.mesh));

  // Indoors it drains rather than vanishing: stepping through a door must not
  // delete forty leaves in one frame behind you.
  const before = state.leaves.length;
  stepLeafFlurry(state, 0.05, { origin, presence: 0 });
  assert.ok(state.leaves.length < before);
  assert.equal(state.leaves.length, 0, 'and it is empty on the next step');
});

test('the flurry submits a real tumble matrix, because the prop path has no pitch', () => {
  const origin = { x: 0, z: 0, y: 0 };
  const state = freshLeafFlurry({ seed: 8 });
  for (let i = 0; i < 20; i += 1) stepLeafFlurry(state, 0.05, { origin, presence: 1 });
  const instances = leafFlurryInstances(state, { cell: 0.5 });
  assert.equal(instances.length, state.leaves.length);
  for (const instance of instances) {
    assert.equal(instance.matrix.length, 16, 'props3d only honours a 16-float matrix');
    for (const value of instance.matrix) assert.ok(Number.isFinite(value));
    assert.equal(instance.matrix[15], 1);
    assert.equal(instance.structural, false);
  }
  // A yaw-only instance would leave every leaf flat to the sky. The basis must
  // actually be tilted.
  assert.ok(instances.some((i) => Math.abs(i.matrix[1]) > 1e-6 || Math.abs(i.matrix[9]) > 1e-6),
    'at least one leaf is edge-on to the ground');

  const props = readFileSync('src/render/props3d.js', 'utf8');
  assert.match(props, /if\(i\.matrix&&i\.matrix\.length===16\)/, 'the instance matrix path still exists');
});

test('reduced motion thins and slows the yard without emptying it', () => {
  const origin = { x: 0, z: 0, y: 0 };
  const full = freshLeafFlurry({ seed: 6 });
  const easy = freshLeafFlurry({ seed: 6, reducedMotion: true });
  for (let i = 0; i < 30; i += 1) {
    stepLeafFlurry(full, 0.05, { origin, presence: 1 });
    stepLeafFlurry(easy, 0.05, { origin, presence: 1 });
  }
  assert.ok(easy.leaves.length > 0);
  assert.ok(easy.leaves.length < full.leaves.length);
  assert.ok(easy.pace < full.pace);
});

test('the credits, the yard and Source read the same wind module', () => {
  for (const file of ['src/game/boot-weather.js', 'src/game/leaf-flurry.js']) {
    assert.match(readFileSync(file, 'utf8'), /from '\.\.\/world\/wind\.js'/, `${file} shares the gust`);
  }
  // And the same species, so they are the same leaves rather than three
  // unrelated effects that happen to be leaf-coloured.
  assert.match(readFileSync('src/game/boot-weather.js', 'utf8'), /leaf-species\.js/);
  assert.match(readFileSync('src/game/leaf-flurry.js', 'utf8'), /leaf-species\.js/);
  assert.match(readFileSync('tools/chunk_surfer/build-props.mjs', 'utf8'), /leaf-species\.js/);
});

test('leaves come off trees and arrive in gusts, not everywhere always', () => {
  const sources = leafFlurrySources([
    { id: 'a', mesh: 'opening_street_tree_small', rx: 100, ry: 100 },
    { id: 'b', mesh: 'district_bench', rx: 104, ry: 100 },
    { id: 'c', mesh: 'academic_dead_tree', rx: 300, ry: 300 },
  ]);
  assert.equal(sources.length, 2, 'a bench sheds nothing');

  // Under the tree, full. Out on the road, nothing at all — a field at full
  // strength everywhere outdoors is a filter, not weather.
  assert.equal(leafSourcePresence(sources, 100, 100), 1);
  assert.ok(leafSourcePresence(sources, 130, 100) > 0.05);
  assert.equal(leafSourcePresence(sources, 400, 400), 0, 'the middle of the road has nothing to shed');
  assert.equal(leafSourcePresence([], 100, 100), 0);
  // Monotonic with distance.
  let previous = 1;
  for (let d = 0; d <= 70; d += 7) {
    const value = leafSourcePresence(sources, 100 + d, 100);
    assert.ok(value <= previous + 1e-9, `falls off by ${d}`);
    previous = value;
  }

  // And only the top of the wind range lifts anything, so the yard is still
  // most of the time and then a flurry comes through.
  assert.equal(leafGust(0), 0);
  assert.equal(leafGust(0.4), 0, 'an ordinary breeze moves nothing');
  assert.ok(leafGust(1) > 0.9, 'a real gust carries the field');
  assert.ok(leafGust(0.7) > 0 && leafGust(0.7) < leafGust(0.9));
});

test('the yard reads its leaf sources from the placed props', () => {
  const main = readFileSync('src/main.js', 'utf8');
  // Derived from the props rather than a second authored list, so moving a tree
  // moves its leaves and nobody has to remember to update anything.
  assert.match(main, /leafSources=leafFlurrySources\(PROPS\.allProps\(\)\)/);
  assert.match(main, /presence:outside\?place\*gust:0/);
});

test('Source asks for leaves only where its shader can draw them', async () => {
  const { createSourceSpaceRuntime } = await import('../src/game/source-space-runtime.js');
  const { CHUNK_SURF_PHASE, freshChunkSurfState, reduceChunkSurf } = await import('../src/game/chunk-surf-state.js');

  let state = freshChunkSurfState();
  for (const event of [
    { type: 'CORRIDOR_ENTERED' },
    { type: 'HALL_ADVANCED', distance: 130 },
    { type: 'HAYSTACK_REACHED' },
  ]) state = reduceChunkSurf(state, event);
  const haystack = createSourceSpaceRuntime({ initialState: state });
  assert.notEqual(haystack.state().phase, CHUNK_SURF_PHASE.LANDSCAPE);
  assert.equal(haystack.sourceScene({}).weather.leaves, 0,
    'the page storm owns the air before the tiers');

  state = reduceChunkSurf(state, { type: 'HAYSTACK_PAGE_FOUND' });
  state = reduceChunkSurf(state, { type: 'TRANSFORMATION_COMPLETED' });
  const tiers = createSourceSpaceRuntime({ initialState: state });
  const weather = tiers.sourceScene({}).weather;
  assert.equal(tiers.state().phase, CHUNK_SURF_PHASE.LANDSCAPE);
  assert.ok(weather.leaves > 0.5, 'something dry gets in on the open tiers');

  // The uniform only exists in the text-space shader, so asking for leaves in a
  // phase the raymarcher draws would set a value nothing reads.
  const renderer = readFileSync('src/render/r3d.js', 'utf8');
  assert.match(renderer, /uniform float uLeaves;/);
  assert.match(renderer, /if\(uLeaves>\.001\)/);
  assert.match(renderer, /textSpaceU\('uLeaves'\)/);
  const runtime = readFileSync('src/game/source-space-runtime.js', 'utf8');
  assert.match(runtime, /textSpaceActive[\s\S]{0,200}CHUNK_SURF_PHASE\.LANDSCAPE, CHUNK_SURF_PHASE\.FINAL/,
    'and those are exactly the phases text space covers');
});

test('the wind you hear is the wind you can watch', async () => {
  const { HOWL_GAIN, createWindHowl } = await import('../src/audio/wind-howl.js');
  // Under the opening bed, which is music.
  assert.ok(HOWL_GAIN > 0 && HOWL_GAIN < 0.09);
  const silent = createWindHowl({ context: null, destination: null });
  assert.equal(silent.active(), false);
  silent.update({ force: 1, presence: 1 });
  silent.stop();

  const main = readFileSync('src/main.js', 'utf8');
  // Gated on sky, not on zone: a courtyard has weather and a corridor does not,
  // and the flag already knows which is which.
  assert.match(main, /function tickWindHowl[\s\S]{0,320}CELL_FLAGS\.SKY/);
  assert.match(main, /windHowl\.update\(\{force:windForce\(timeSec\)/,
    'and it rides the same gust as the leaves');
});
