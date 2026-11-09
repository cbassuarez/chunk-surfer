import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { freshWinding, stepWinding, coastalHandsMechanism, windingCylinderAngle, windingKeyAngle, WINDING_PHASE } from '../src/game/coastal-memory/winding.js';
import { COASTAL_MUSIC_BOX_MECHANISM } from '../src/game/coastal-memory/mechanism.js';
import { makeCoastalMemoryScene } from '../src/game/coastal-memory/scene.js';
import { coastalMemoryRenderFrame } from '../src/render/coastal-memory-renderer.js';
import { COASTAL_MEMORY_LAYOUT as L } from '../src/data/coastal-memory.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const cranked = () => { let s = freshWinding(); for (let i = 0; i < 12; i++) s = stepWinding(s, { held: true, turn: 1 }, 0.25).state; return s; };
const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

test('coastalHandsMechanism mirrors the autonomous mechanism shape but is winding-driven', () => {
  const m = coastalHandsMechanism(freshWinding());
  assert.equal(m.cylinderAngle, 0);
  assert.equal(m.fanAngle, 0);
  assert.equal(m.liveTines.length, COASTAL_MUSIC_BOX_MECHANISM.liveTines.length);
  // The tine geometry is unchanged from the plinth mechanism.
  const first = m.liveTines[0], authored = COASTAL_MUSIC_BOX_MECHANISM.liveTines[0];
  assert.equal(first.x, authored.x);
  assert.equal(first.rootZ, authored.rootZ);
  assert.ok(first.length > 0);
});

test('a cranked winding turns the cylinder, fan and key through the hands mechanism', () => {
  const w = cranked();
  assert.ok(w.score > 0);
  const m = coastalHandsMechanism(w);
  assert.equal(m.cylinderAngle, windingCylinderAngle(w));
  assert.equal(m.keyAngle, windingKeyAngle(w));
  assert.ok(m.cylinderAngle > 0);
  assert.ok(m.fanAngle > 0);
  // The gear is coupled 1:1 with the cylinder, as on the plinth.
  assert.equal(m.gearAngle, m.cylinderAngle);
});

test('the scene draws the box in hand, not on its plinth, when handling', () => {
  const w = cranked();
  const scene = makeCoastalMemoryScene({ worldFromLocal: identity, hands: { handling: true, heldLocal: translate(5, 2, 3), winding: w } });
  assert.equal(scene.props.some((p) => p.id === 'coastal-music-box-plinth'), false, 'no plinth while held');
  const body = scene.props.find((p) => p.id === 'coastal-broken-music-box');
  assert.ok(body);
  assert.deepEqual([body.x, body.y, body.z], [5, 2, 3]);
  // Only the actual external key is visible. Hidden construction stays hidden.
  for (const id of ['coastal-music-box-cylinder','coastal-music-box-gear','coastal-music-box-fan','coastal-music-box-live-tine'])
    assert.equal(scene.props.some((p) => p.id === id), false, id + ' must stay inside the closed case');
  assert.deepEqual(body.matrix, translate(5,2,3), 'pickup must preserve physical dimensions');
  const key=scene.props.find(p=>p.id==='coastal-music-box-key');
  assert.equal(key.mesh,'cm_broken_music_box_key');
  assert.notDeepEqual(key.matrix,body.matrix,'winding must turn the independent external key');
});

test('without hands the scene keeps the box on its authored plinth', () => {
  const scene = makeCoastalMemoryScene({ worldFromLocal: identity });
  assert.ok(scene.props.some((p) => p.id === 'coastal-music-box-plinth'));
  const body = scene.props.find((p) => p.id === 'coastal-broken-music-box');
  assert.ok(body);
  // The authored box sits at its local site (not at the origin held pose).
  assert.notDeepEqual([body.x, body.y, body.z], [5, 2, 3]);
});

test('the render frame carries hands into the scene: box in hand, no plinth', () => {
  const metrics = JSON.parse(fs.readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json', import.meta.url)));
  const w = cranked();
  const frame = { pose: { ...L.spawn, yaw: 0.5, pitch: -0.2 }, elapsed: 4, recordingOffset: 0,
    hands: { handling: true, winding: w, boxPose: { yaw: 0.2, pitch: 0.1 }, shakeLevel: 0.4 } };
  const out = coastalMemoryRenderFrame(frame, { vehicleMetrics: metrics });
  assert.equal(out.scene.props.some((p) => p.id === 'coastal-music-box-plinth'), false, 'no plinth while holding');
  const body = out.scene.props.find((p) => p.id === 'coastal-broken-music-box');
  assert.ok(body);
  // The held box floats in front of the eye, not at its coastal site.
  assert.ok(Math.hypot(body.x - out.eye[0], body.z - out.eye[2]) < 1, 'box must be near the eye when held');
});
