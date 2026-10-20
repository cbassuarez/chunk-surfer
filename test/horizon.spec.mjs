import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCE_BELLS, SOURCE_HORIZON } from '../src/data/source-level.js';
import { ELSEWHERE_CROSSING_SECONDS } from '../src/data/elsewhere-worlds.js';
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
    runtime.tickHorizon(.001);
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

  // Spatial loss is remembered even when the score is walked backwards.
  assert.equal(at(SOURCE_HORIZON.length * 0.5).collapsing, false);
  const worn = at(SOURCE_HORIZON.length * 0.95);
  assert.equal(worn.collapsing, true);
  assert.equal(at(60).unravelling.amount, worn.unravelling.amount, 'retreat rewinds the score without restoring the image');
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
  // It does not end at the last frame any more. The tape runs out into nothing,
  // then a field of doors, and the chapel's own door is the way out.
  assert.equal(runtime.state().phase, 'chapel-outskirts');
  assert.equal(runtime.state().completed, false);
  assert.equal(completion, null, 'the end of the tape ended the chapter');
  assert.ok(runtime.geometry.cellAt(end.x, end.y), 'the body is not standing on ground at the end of the tape');
  const chapelDoor = runtime.doorFieldDoors().find((door) => door.route === 'chapel');
  assert.ok(chapelDoor, 'the chapel outskirts have no chapel door');
  const [doorA, doorB] = chapelDoor.threshold, doorX = (doorA.x + doorB.x) / 2, doorY = (doorA.y + doorB.y) / 2;
  const front = { x: doorX + chapelDoor.normal[0] * 1.5, y: doorY + chapelDoor.normal[2] * 1.5 };
  const back = { x: doorX - chapelDoor.normal[0] * 1.5, y: doorY - chapelDoor.normal[2] * 1.5 };
  runtime.onStep({ x: front.x + 6, y: front.y }, { x: back.x + 6, y: back.y });
  assert.equal(completion, null, 'walking past beside the chapel door ended the chapter');
  runtime.setPlayerPosition({ ...front, facing: 0 });
  runtime.onStep(front, back);
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
  // The bust opens the promised route without moving the body. The player
  // walks that route into the bell field; neither accepting nor reopening the
  // offer can silently teleport them into a different scene.
  const before=runtime.horizonFrame();
  const taken = runtime.takeHorizonBustDetour();
  assert.equal(taken.handled, true);
  assert.equal(taken.pathOpened, true);
  assert.equal(taken.exit, undefined);
  assert.equal(taken.entered, undefined);
  assert.equal(taken.completion, undefined, 'nothing is reported to the world yet');
  assert.equal(runtime.state().phase, CHUNK_SURF_PHASE.HORIZON);
  assert.equal(runtime.horizonFrame().depth,before.depth);
  assert.equal(runtime.horizonFrame().lateral,before.lateral);
  assert.equal(runtime.state().completed, false, 'the chapter is still open');
  assert.equal(runtime.state().active, true);
  // The route is committed at the bust, though: reloading inside the passage
  // must not offer the choice a second time.
  assert.equal(runtime.state().finale.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(runtime.state().finale.stage, SOURCE_FINALE_STAGE.TOWER_COMMITTED);

  // Stepping the returned route, not accepting the offer, crosses the seam.
  let from={x:origin.x+taken.path[0].x,y:origin.y+taken.path[0].y};
  runtime.setPlayerPosition({...from,facing:0});
  for(const target of taken.path.slice(1)){
    const world={x:origin.x+target.x,y:origin.y+target.y};
    const start={...from},steps=Math.ceil(Math.hypot(world.x-from.x,world.y-from.y)/.75);
    for(let i=1;i<=steps;i++){
      const to={x:start.x+(world.x-start.x)*i/steps,y:start.y+(world.y-start.y)*i/steps};
      assert.equal(runtime.geometry.canStep(from.x,from.y,to.x,to.y).ok,true,'the revealed route is continuously walkable');
      runtime.onStep(from,to);from=to;
    }
  }
  assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.BELLS);
  const bells = runtime.bellsFrame();
  assert.equal(bells.active, true);
  assert.ok(bells.depth >= 0 && bells.depth < 20, 'he starts at the head of the passage');
  assert.equal(bells.resolve, 0, 'and the room is not there yet');

  // Walking to the room resolves it, and walking INTO it is the commit.
  const origin2 = runtime.state().landscapeOrigin || { x: 0, y: -252 };
  runtime.setPlayerPosition({ x: origin2.x, y: origin2.y + SOURCE_BELLS.resolveTo, facing: 0 });
  assert.ok(runtime.bellsFrame().resolve > 0.99, 'the room is fully arrived by the time you reach it');
  // The tower door stands in the missing wall, locked until the two seeded doors
  // in its field have been walked through.
  const keys = runtime.doorFieldDoors().filter((door) => door.key);
  assert.equal(keys.length, 2);
  for (const [index, key] of keys.entries()) {
    assert.equal(runtime.doorCrossingFrame(), null, 'the previous visit has finished before entering the next door');
    assert.equal(runtime.openDoorFieldDoor(key.id).opened, true, `${key.id} opens for a real visit`);
    const [a, b] = key.threshold, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const from = { x: cx + key.normal[0] * 1.5, y: cy + key.normal[2] * 1.5 };
    runtime.setPlayerPosition({ ...from, facing: 0 });
    runtime.onStep(from, { x: cx - key.normal[0] * 1.5, y: cy - key.normal[2] * 1.5 });
    assert.equal(runtime.doorCrossingFrame()?.id, key.id, 'walking through the key begins its actual crossing');
    assert.equal(runtime.doorCrossingFrame()?.key, true);
    assert.ok(runtime.state().station.entries.some((entry) => entry.doorId === key.id), 'the visit enters the persistent journal');
    assert.equal(runtime.doorFieldDoors().find((door) => door.route === 'tower')?.unlocked, index === 1,
      'one distinct key leaves the tower locked; two distinct keys open it');
    runtime.advanceStationTime(ELSEWHERE_CROSSING_SECONDS - .01);
    assert.equal(runtime.doorCrossingFrame()?.id, key.id, 'the visit remains active until its full public-clock duration');
    runtime.advanceStationTime(.02);
    assert.equal(runtime.doorCrossingFrame(), null, 'the completed crossing releases the next door visit');
  }
  assert.equal(runtime.doorFieldDoors().find((door) => door.route === 'tower')?.unlocked, true, 'the key doors did not unlock the tower door');
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
  assert.ok(runtime.beginHushContact(), 'HUSH within reach offers the voluntary conversation');
  assert.equal(runtime.resolveHushContactChoice('contact.warning').combat, false);
  assert.equal(runtime.resolveHushContactChoice('contact.confirm').combat, true);
  const lost = runtime.failFinalEncounter();
  assert.equal(lost.completion.route,SOURCE_FINALE_ROUTE.CONTACT);
  assert.equal(lost.completion.result,'lost');
  assert.equal(runtime.state().phase,'completed');
  assert.equal(runtime.state().horizon.entered,false);
  assert.equal(runtime.state().finalEncounter.outcome, 'submit');

  const walked = onTape();
  assert.equal(walked.state().horizon.reason, HORIZON_REASON.WALKED_AWAY);
  assert.equal(walked.state().finalEncounter.outcome, null, 'walking onward does not invent a combat result');
  assert.equal(walked.state().finale.route, null, 'the route remains uncommitted before the bust so HUSH can still be revisited');
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

// ── THE SCORE STANDS AT THE NEXT CHECKPOINT ─────────────────────────────────
{
  const runtime = onTape({ marbleEyes: 'carried' });
  const origin = runtime.state().landscapeOrigin;
  for (const depth of [10, 120, 300]) {
    const y = origin.y + SOURCE_HORIZON.from - depth;
    runtime.setPlayerPosition({ x: origin.x, y, facing: 0 });
    const frame = runtime.horizonFrame();
    assert.equal(frame.guide?.kind, 'path', `there is no checkpoint on the tape at ${depth}`);
    assert.ok(frame.guide.y < y, 'the checkpoint is not ahead of him');
    assert.ok(Math.abs(frame.guide.y - (y - 48)) < 1e-9, 'the checkpoint is not a steady distance on along the route');
  }
  // The guide holds a dependable forward axis while the picture drifts.
  const lateral = new Set([60, 200, 380].map((depth) => {
    runtime.setPlayerPosition({ x: origin.x, y: origin.y + SOURCE_HORIZON.from - depth, facing: 0 });
    return Math.round(runtime.horizonFrame().guide.x);
  }));
  assert.deepEqual([...lateral], [Math.round(origin.x)], 'picture drift cannot pull the walking guide off the fixed axis');
  // Short of the tape it is the head of the tape; at its end it holds.
  runtime.setPlayerPosition({ x: origin.x, y: origin.y + SOURCE_HORIZON.from + 20, facing: 0 });
  assert.equal(runtime.horizonFrame().guide.kind, 'head');
  runtime.setPlayerPosition({ x: origin.x, y: origin.y + SOURCE_HORIZON.to + 4, facing: 0 });
  assert.ok(runtime.horizonFrame().guide.y >= origin.y + SOURCE_HORIZON.to, 'the checkpoint runs off the end of the tape');
  // Once the bust has cut the tower road, the checkpoint is on that road.
  for (let beat = 0; beat < 3; beat += 1) runtime.talkToHorizonBust();
  runtime.decideHorizonBust(true);
  runtime.setPlayerPosition({ x: origin.x - 76, y: origin.y + SOURCE_HORIZON.from - 250, facing: 0 });
  const tower = runtime.horizonFrame().guide;
  assert.equal(tower.kind, 'tower', 'the accepted road does not move the checkpoint');
  assert.ok(Math.abs(tower.x - (origin.x - 76)) < 1e-6 && tower.y < origin.y + SOURCE_HORIZON.from - 250, 'the checkpoint is not along the tower road');
}

console.log('horizon specs passed');
