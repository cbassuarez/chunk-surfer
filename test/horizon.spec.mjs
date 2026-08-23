import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCE_HORIZON } from '../src/data/source-level.js';
import { HORIZON_EXIT, HORIZON_REASON } from '../src/game/chunk-surf-state.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { applyRigAdvantage } from '../src/game/source-rig-bridge.js';
import { sourceCombatBattle } from '../src/data/combat-definitions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function onTape() {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state, onComplete: () => {} });
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  return runtime;
}

// ── the walk is the playhead ────────────────────────────────────────────────
{
  const runtime = onTape();
  const origin = runtime.state().landscapeOrigin;
  const at = (depth) => {
    const y = origin.y + SOURCE_HORIZON.from - depth;
    runtime.setPlayerPosition({ x: origin.x, y, facing: 0 });
    return runtime.horizonFrame();
  };

  // Depth, time and slice move together and never disagree. This is the whole
  // contract the renderer and the score both hang off.
  const quarter = at(SOURCE_HORIZON.length * 0.25);
  assert.ok(Math.abs(quarter.progress - 0.25) < 1e-6);
  assert.ok(Math.abs(quarter.seconds - SOURCE_HORIZON.tapeSeconds * 0.25) < 1e-6);
  assert.equal(quarter.slice, Math.floor(SOURCE_HORIZON.slices * 0.25));

  // Standing still is not the same as the tape running on without him.
  const a = at(120), b = at(120);
  assert.equal(a.seconds, b.seconds, 'a stationary body holds the playhead');

  // And walking back up the tape genuinely goes backwards.
  assert.ok(at(60).seconds < at(120).seconds, 'backing up rewinds the score');

  // The collapse is the recording's own tail, not a timer.
  assert.equal(at(SOURCE_HORIZON.length * 0.5).collapsing, false);
  assert.equal(at(SOURCE_HORIZON.length * 0.95).collapsing, true);
}

// ── walking to the end is the exit you cannot miss ──────────────────────────
{
  let completion = null;
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state, onComplete: (v) => { completion = v; } });
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  const origin = runtime.state().landscapeOrigin;

  // Most of the way is still just walking.
  const mid = { x: origin.x, y: origin.y + SOURCE_HORIZON.from - SOURCE_HORIZON.length * 0.6 };
  runtime.onStep({ x: origin.x, y: origin.y }, mid);
  assert.equal(runtime.state().phase, 'horizon');
  assert.equal(completion, null);
  assert.ok(runtime.state().horizon.maxDepth > 0, 'the tape he has decoded is remembered');

  // The far end is the nave, and it costs nothing and gives nothing.
  const end = { x: origin.x, y: origin.y + SOURCE_HORIZON.to };
  runtime.onStep(mid, end);
  assert.equal(runtime.state().completed, true);
  assert.equal(completion?.horizonExit, HORIZON_EXIT.CHAPEL);
  assert.ok(completion.flags.includes('chunkSurf.horizon.exit.chapel'));
  assert.ok(!completion.flags.includes('chunkSurf.horizon.exit.tower'));
}

// ── the bust, and the detour he keeps telling you about ─────────────────────
{
  const runtime = onTape();
  const bust = runtime.horizonBustPoint();
  const origin = runtime.state().landscapeOrigin;
  // He stands beside the walk, not across it — you can reach the chapel without
  // ever meeting him.
  assert.ok(Math.abs(bust.x - origin.x) > 8, 'the bust is not standing in the path');
  const depth = (origin.y + SOURCE_HORIZON.from) - bust.y;
  assert.ok(depth > 40 && depth < SOURCE_HORIZON.length - 40, 'the bust is somewhere in the middle of the tape');

  // He does not hand over the detour on the first word. He warns you first, at
  // length, which is the joke: nobody can say they were not told.
  let offered = false;
  for (let i = 0; i < 5; i += 1) offered = offered || runtime.talkToHorizonBust().offers;
  assert.equal(offered, false, 'the bust warns you before he offers anything');
  assert.equal(runtime.talkToHorizonBust().offers, true, 'and then he offers');

  const taken = runtime.takeHorizonBustDetour();
  assert.equal(taken.handled, true);
  assert.equal(taken.exit, HORIZON_EXIT.TOWER);
  assert.equal(runtime.state().completed, true);
  assert.ok(taken.completion.flags.includes('chunkSurf.horizon.exit.tower'));
}

// ── losing and walking away arrive in the same place, differently ───────────
{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  runtime.requestBossBattle();
  const lost = runtime.failFinalEncounter();
  assert.equal(lost.reason, HORIZON_REASON.LOST);
  assert.equal(runtime.state().finalEncounter.outcome, 'submit');

  const walked = onTape();
  assert.equal(walked.state().horizon.reason, HORIZON_REASON.WALKED_AWAY);
  assert.equal(walked.state().finalEncounter.outcome, 'contain');
}

// ── the rig is an advantage, not a key ──────────────────────────────────────
{
  const bare = applyRigAdvantage(sourceCombatBattle({}), { hasRig: false });
  const kitted = applyRigAdvantage(sourceCombatBattle({}), { hasRig: true });
  assert.equal(bare.combat.rigAdvantage, false);
  assert.equal(kitted.combat.rigAdvantage, true);
  assert.ok(kitted.combat.baseComposure > bare.combat.baseComposure, 'the rig buys composure');
  const clause = (battle) => battle.combat.movements.find((m) => m.id === 'final-clause').coherence;
  assert.ok(clause(kitted) < clause(bare), 'and a notch off the last clause');
  // Both are playable: the point of the change is that the bare-handed fight
  // exists at all.
  assert.ok(bare.combat.movements.every((m) => m.coherence >= 1));
  assert.notEqual(bare.intro[0].text, kitted.intro[0].text, 'and it is a different room to walk into');
}

// ── the baked tape, if it has been built ────────────────────────────────────
{
  const manifestPath = path.join(ROOT, 'public/assets/horizon-tape.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('horizon specs passed (tape not baked — run npm run assets:horizon-tape)');
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const bin = fs.statSync(path.join(ROOT, 'public/assets/horizon-tape.bin'));

    assert.equal(manifest.slices, SOURCE_HORIZON.slices, 'the bake and the level disagree about slice count');
    assert.equal(manifest.sliceMetres, SOURCE_HORIZON.sliceMetres);
    assert.equal(manifest.length, SOURCE_HORIZON.length);
    assert.equal(manifest.ranges.length, manifest.slices);
    assert.equal(bin.size, manifest.splats * manifest.recordBytes, 'the tape is not the size the manifest claims');

    // The ranges have to be contiguous and in order, because the render pass
    // draws a slice as an attribute offset and an instance count and would
    // silently draw somebody else's frame if they ever drifted.
    let cursor = 0;
    for (const range of manifest.ranges) {
      assert.equal(range.first, cursor, 'slice ranges are not contiguous — the draw would tear');
      assert.ok(range.count > 0, 'a slice with no splats is a hole in the tape');
      cursor += range.count;
    }
    assert.equal(cursor, manifest.splats);

    // Budget. Not a style rule: this is uploaded once as a single static VBO and
    // it has to stay something a low-end machine will accept.
    assert.ok(bin.size < 6e6, `tape is ${(bin.size / 1e6).toFixed(1)}MB — over budget`);
    assert.ok(manifest.splats / manifest.slices < 1600, 'too many splats per slice to hold a frame rate');
  }
}

console.log('horizon specs passed');
