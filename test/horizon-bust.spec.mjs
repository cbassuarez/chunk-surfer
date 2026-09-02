import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { SOURCE_HORIZON } from '../src/data/source-level.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import {
  HORIZON_BUST_AUDIENCE,
  HORIZON_BUST_REFUSAL,
  horizonBustProposition,
} from '../src/game/horizon-bust.js';
import { TOWER_DEFEAT_CEILING } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const asset = fs.readFileSync(new URL('../public/assets/horizon-bust.glb', import.meta.url));
const stats = JSON.parse(fs.readFileSync(new URL('../public/assets/horizon-bust.stats.json', import.meta.url), 'utf8'));
const credits = JSON.parse(fs.readFileSync(new URL('../public/assets/horizon-bust.credits.json', import.meta.url), 'utf8'));
const renderer = fs.readFileSync(new URL('../src/render/horizon3d.js', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../tools/chunk_surfer/build-horizon-bust.mjs', import.meta.url), 'utf8');

assert.equal(asset.toString('ascii', 0, 4), 'glTF');
assert.equal(asset.readUInt32LE(4), 2);
assert.equal(asset.readUInt32LE(8), asset.length);
const jsonLength = asset.readUInt32LE(12);
const json = JSON.parse(asset.subarray(20, 20 + jsonLength).toString('utf8').trim());
assert.deepEqual(json.meshes.map((mesh) => mesh.name), [
  'horizon_bust_portrait',
  'horizon_bust_pedestal',
  'horizon_bust_seal',
]);
assert.ok(json.meshes.every((mesh) => mesh.primitives.every((primitive) => Number.isInteger(primitive.indices)
  && Number.isInteger(primitive.attributes.POSITION) && Number.isInteger(primitive.attributes.NORMAL))));
assert.deepEqual(json.materials.map((material) => material.name), [
  'pale funerary marble', 'black green society stone', 'aged bronze seal',
]);
assert.ok(!json.animations && !json.skins && !json.extensionsUsed && !json.extensionsRequired);

assert.equal(stats.sha256, crypto.createHash('sha256').update(asset).digest('hex'));
assert.equal(credits.pack.sha256, stats.sha256);
assert.equal(credits.source.mesh, 'marble_bust_01');
assert.equal(credits.source.license, 'CC0-1.0');
assert.equal(credits.derivation.externalDownloadsRequired, false);
assert.ok(stats.meshes.horizon_bust_portrait.triangles >= 9000, 'the portrait remains a high-detail sculpt');
assert.ok(stats.meshes.horizon_bust_pedestal.triangles >= 70, 'the pedestal is geometry, not a shader block');
assert.ok(stats.meshes.horizon_bust_seal.triangles >= 300, 'the funerary seal is modeled relief');
assert.ok(stats.totalTriangles < 15000, 'the isolated hero prop stays inside its triangle budget');
assert.ok(asset.length < 1024 * 1024, 'the untextured hero GLB stays below one MiB');
assert.match(builder, /marble_bust_01/);
assert.match(builder, /horizon_bust_pedestal/);
assert.match(builder, /SOCIETAS OSSIUM/);

assert.match(renderer, /loadHorizonBust\(bust\)/, 'the GLB is loaded with the Horizon tape');
assert.match(renderer, /gl\.drawElements\(gl\.TRIANGLES/, 'the portrait is drawn as indexed triangles');
assert.match(renderer, /gl\.enable\(gl\.DEPTH_TEST\)/, 'the model self-occludes');
assert.doesNotMatch(renderer, /markerRecords|markerBuffer/, 'the old splat-built figure is gone');

// Both eligible modes get their own opening pair and then the same six shared
// beats; only the way the bust notices you differs.
for (const mode of ['carried', 'returned']) {
  const lines = HORIZON_BUST_AUDIENCE[mode];
  assert.equal(lines.length, 8, `${mode} receives the full staged audience`);
  assert.deepEqual(lines.slice(2).map((line) => line.text), HORIZON_BUST_AUDIENCE.carried.slice(2).map((line) => line.text));
  const words = lines.reduce((sum, line) => sum + line.text.trim().split(/\s+/).length, 0);
  assert.ok(words >= 80 && words <= 210, `${mode} audience has substance without becoming a monologue (${words} words)`);
  assert.ok(lines.some((line) => /another way/i.test(line.text)), `${mode} arrives at the offer`);
}
assert.equal(HORIZON_BUST_REFUSAL.length, 2);

// ── the first meeting ───────────────────────────────────────────────────────
const proposition = horizonBustProposition(HORIZON_BUST_AUDIENCE.carried.at(-1));
assert.match(proposition.start.lines.at(-1).text, /other way/i);
assert.match(proposition.start.lines.at(1).text, /skull/i);
assert.match(proposition.start.lines.at(1).text, /crossed bones/i);
assert.equal(proposition.start.goto, 'questions', 'a first meeting can be interrogated');
// The four interrogable questions, then the commit. The catch is one of them,
// and what it promises is tested below.
assert.deepEqual(proposition.questions.choices.map((choice) => choice.goto),
  ['identity', 'history', 'route', 'consequence', 'decision']);
assert.deepEqual(proposition.decision.choices.map((choice) => choice.sourceFinaleChoice), ['tower', 'chapel']);
assert.match(proposition.consequence.lines.map((line) => line.text).join(' '),
  /no choice but to continue/i, 'the bust makes the promise this whole mechanism exists to keep');

// ── and the promise, kept ───────────────────────────────────────────────────
//
// "Then I'll see you here again, but you'll have no choice but to continue."
// A return offers exactly one row: its own path. The chapel is BUILT OUT, not
// disabled — an option you can see and cannot take is a menu, not a
// consequence.
for (const defeats of [1, TOWER_DEFEAT_CEILING - 1]) {
  const again = horizonBustProposition(null, { defeats });
  assert.deepEqual(again.decision.choices.map((choice) => choice.sourceFinaleChoice), ['tower'],
    `defeat ${defeats} leaves only the bust's path`);
  assert.equal(again.decision.choices.length, 1);
  assert.equal(again.start.goto, 'decision', 'a return does not re-open the questions');
  assert.match(again.decision.lines.map((line) => line.text).join(' '), /other way|answer/i,
    'he asks to go back and is told');
}
// It notices how many times. The second and third returns do not read the same.
assert.notEqual(
  horizonBustProposition(null, { defeats: 1 }).start.lines.at(-1).text,
  horizonBustProposition(null, { defeats: 2 }).start.lines.at(-1).text,
);
assert.match(proposition.accepted.lines.map((line) => line.text).join(' '), /sigil|bell-like/i);
assert.match(proposition.declined.lines.map((line) => line.text).join(' '), /warn|detour/i);

function onTape(marbleEyes) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: { ...built.state, profile: { ...built.state.profile, marbleEyes } } });
  runtime.setPlayerPosition(built.position); runtime.completeNormalExit();
  return runtime;
}

{
  const runtime = onTape('carried');
  const point = runtime.horizonBustPoint(), origin = runtime.state().landscapeOrigin;
  runtime.setPlayerPosition({ x: point.x, y: point.y + 4, facing: 0 });
  assert.equal(runtime.geometry.canStep(point.x, point.y + 4, point.x, point.y).ok, false, 'the pedestal has truthful collision');
  assert.equal(runtime.geometry.canStep(point.x + 5, point.y + 4, point.x + 5, point.y).ok, true, 'the monument can be passed');
  const depth = (origin.y + SOURCE_HORIZON.from) - point.y;
  assert.ok(depth > 40 && depth < SOURCE_HORIZON.length - 40);
  for (let beat = 1; beat <= HORIZON_BUST_AUDIENCE.carried.length; beat += 1) {
    const response = runtime.talkToHorizonBust();
    assert.equal(response.beat, beat);
    assert.equal(response.offers, beat === HORIZON_BUST_AUDIENCE.carried.length);
  }
}

{
  const runtime = onTape(null);
  for (let beat = 1; beat <= HORIZON_BUST_REFUSAL.length; beat += 1) {
    const response = runtime.talkToHorizonBust();
    assert.equal(response.eligible, false);
    assert.equal(response.offers, false);
  }
  assert.equal(runtime.state().finale.bust.decision, 'declined');
}

console.log('horizon bust asset and audience specs passed');
