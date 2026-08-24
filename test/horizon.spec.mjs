import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCE_BELLS, SOURCE_HORIZON } from '../src/data/source-level.js';
import {
  CHUNK_SURF_PHASE, HORIZON_EXIT, HORIZON_REASON,
  SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE,
} from '../src/game/chunk-surf-state.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { HORIZON_BUST_AUDIENCE } from '../src/game/horizon-bust.js';
import { applyRigAdvantage } from '../src/game/source-rig-bridge.js';
import { sourceCombatBattle } from '../src/data/combat-definitions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function onTape({marbleEyes=null,completions=null}={}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const state={...built.state,profile:{...built.state.profile,marbleEyes}};
  const runtime = createSourceSpaceRuntime({
    initialState: state,
    onComplete: (completion) => { if (completions) completions.push(completion); },
  });
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  return runtime;
}

// ── the walk is the playhead ────────────────────────────────────────────────
{
  const runtime = onTape({marbleEyes:'carried'});
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
  const completions = [];
  const runtime = onTape({marbleEyes:'carried',completions});
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
  for (let i = 0; i < HORIZON_BUST_AUDIENCE.carried.length - 1; i += 1) {
    offered = offered || runtime.talkToHorizonBust().offers;
  }
  assert.equal(offered, false, 'recognition, history, route, and consequence precede the invitation');
  assert.equal(runtime.talkToHorizonBust().offers, true, 'the final audience beat offers the seal');
  assert.equal(runtime.decideHorizonBust(true).accepted,true,'the proposition, not the eyes, commits Tower');

  // THE DETOUR OPENS A PLACE, IT DOES NOT CLOSE THE CHAPTER.
  //
  // It used to complete Source space on the spot and hand main.js a datamosh to
  // play over a warp. Taking it now puts the body at the head of the bell
  // passage and the chapter stays open — and stays ACTIVE — for the four hundred
  // metres it takes to walk to the room at the end.
  const taken = runtime.takeHorizonBustDetour();
  assert.equal(taken.handled, true);
  assert.equal(taken.exit, HORIZON_EXIT.TOWER);
  assert.equal(taken.entered, 'bells');
  assert.equal(taken.completion, undefined, 'nothing is reported to the world yet');
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.BELLS);
  assert.equal(runtime.state().completed, false, 'the chapter is still open');
  assert.equal(runtime.state().active, true);
  // The route is committed at the bust, though: reloading inside the passage
  // must not offer the choice a second time.
  assert.equal(runtime.state().finale.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(runtime.state().finale.stage, SOURCE_FINALE_STAGE.TOWER_COMMITTED);

  // He is put over the seam rather than walked there, facing into the passage.
  const bells = runtime.bellsFrame();
  assert.equal(bells.active, true);
  assert.ok(bells.depth >= 0 && bells.depth < 20, 'he starts at the head of the passage');
  assert.equal(bells.resolve, 0, 'and the room is not there yet');

  // Walking to the room resolves it, and walking INTO it is the commit.
  const origin2 = runtime.state().landscapeOrigin || { x: 0, y: -252 };
  runtime.setPlayerPosition({ x: origin2.x, y: origin2.y + SOURCE_BELLS.resolveTo, facing: 0 });
  assert.ok(runtime.bellsFrame().resolve > 0.99, 'the room is fully arrived by the time you reach it');
  const doorway = { x: origin2.x, y: origin2.y + SOURCE_BELLS.room.threshold - 1 };
  runtime.onStep({ x: origin2.x, y: origin2.y + SOURCE_BELLS.room.threshold + 2 }, doorway);
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.COMPLETED, 'the missing wall is the end of the chapter');
  assert.equal(completions.length, 1, 'and it reports exactly once');
  assert.ok(completions[0].flags.includes('chunkSurf.horizon.exit.tower'));
  assert.equal(completions[0].transitionTarget, 'cathedral');
}

// ── Contact loss is terminal; only deliberate refusal opens Horizon ─────────
{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  runtime.requestBossBattle();
  runtime.commitContact();
  const lost = runtime.failFinalEncounter();
  assert.equal(lost.completion.route,SOURCE_FINALE_ROUTE.CONTACT);
  assert.equal(lost.completion.result,'lost');
  assert.equal(runtime.state().phase,'completed');
  assert.equal(runtime.state().horizon.entered,false);
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
