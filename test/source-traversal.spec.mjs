import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SOURCE_CHUTES, SOURCE_HORIZON, SOURCE_LIFTS } from '../src/data/source-level.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const ORIGIN = { x: 0, y: -252 };

const runtimeSource=await readFile(new URL('../src/game/source-space-runtime.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
assert.doesNotMatch(runtimeSource,/emitNoise|MONITOR\./,'Source weather, contacts and traversal never enter the player-noise path');

{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  const from = { x: ORIGIN.x, y: ORIGIN.y - 39, facing: 0 };
  const step = runtime.geometry.canStep(from.x, from.y, from.x, from.y - 1);
  assert.deepEqual({ ok: step.ok, via: step.via, feature: step.feature }, { ok: true, via: 'lift', feature: 'lift-fork' });
  const started = runtime.beginTraversal({ move: step, from });
  assert.equal(started.handled, true);
  assert.equal(runtime.traversalFrame().locksMovement, true);
  assert.equal(runtime.traversalFrame().grounded, false);
  assert.equal(runtime.beginHushContact(), null, 'HUSH cannot capture during committed travel');
  let result;
  for (let i = 0; i < 120 && !result?.completed; i += 1) result = runtime.tickTraversal(1 / 60);
  assert.equal(result.completed, true);
  assert.ok(result.frame.active === false);
  assert.equal(runtime.state().firstLiftCompleted, true);
  assert.equal(runtime.state().checkpoint.id, 'landing-fork');
  assert.ok(result.position.y < ORIGIN.y - 40);

  const reverseFrom = { x: ORIGIN.x, y: ORIGIN.y - 41, facing: 2 };
  const reverse = runtime.geometry.canStep(reverseFrom.x, reverseFrom.y, reverseFrom.x, reverseFrom.y + 2);
  assert.equal(reverse.via, 'lift');
  runtime.beginTraversal({ move: reverse, from: reverseFrom });
  for (let i = 0; i < 120 && runtime.traversalFrame().active; i += 1) runtime.tickTraversal(1 / 60);
  assert.equal(runtime.traversalFrame().active, false, 'lifts work in reverse');
}

// Every authored lift commits on the first step into its volume from either
// side. Exercise the edge lanes too: these are the routes players reach from the
// optional spokes, and a centre-line happy path cannot prove them.
{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
  const origin=built.state.landscapeOrigin;
  const finish=(runtime)=>{
    let result;
    for(let i=0;i<180&&!result?.completed;i+=1)result=runtime.tickTraversal(1/60);
    assert.equal(result?.completed,true);
    return result;
  };
  for(const lift of SOURCE_LIFTS){
    for(const offset of [-lift.halfWidth+.5,0,lift.halfWidth-.5]){
      const lower={x:origin.x+lift.x+offset,y:origin.y+lift.y+lift.depth+1,facing:0};
      const upRuntime=createSourceSpaceRuntime({initialState:built.state});
      const up=upRuntime.geometry.canStep(lower.x,lower.y,lower.x,lower.y-1);
      assert.deepEqual({via:up.via,feature:up.feature,travel:up.travel},{via:'lift',feature:lift.id,travel:'up'});
      assert.equal(upRuntime.beginTraversal({move:up,from:lower}).handled,true);
      const raised=finish(upRuntime);
      assert.ok(raised.position.y<origin.y+lift.y,`${lift.id} did not land on its upper side`);

      const upper={x:origin.x+lift.x+offset,y:origin.y+lift.y-lift.depth-1,facing:2};
      const downRuntime=createSourceSpaceRuntime({initialState:built.state});
      const down=downRuntime.geometry.canStep(upper.x,upper.y,upper.x,upper.y+1);
      assert.deepEqual({via:down.via,feature:down.feature,travel:down.travel},{via:'lift',feature:lift.id,travel:'down'});
      assert.equal(downRuntime.beginTraversal({move:down,from:upper}).handled,true);
      const lowered=finish(downRuntime);
      assert.ok(lowered.position.y>origin.y+lift.y,`${lift.id} did not land on its lower side`);
    }
  }
}

// Chutes keep the inverse contract across every authored return: downhill
// commits, uphill is rejected even while both samples are on the chute surface.
{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
  const origin=built.state.landscapeOrigin;
  for(const chute of SOURCE_CHUTES){
    const top={x:origin.x+chute.x-chute.dir.x,y:origin.y+chute.y-chute.dir.y,facing:2};
    const downTo={x:top.x+chute.dir.x,y:top.y+chute.dir.y};
    const runtime=createSourceSpaceRuntime({initialState:built.state});
    const down=runtime.geometry.canStep(top.x,top.y,downTo.x,downTo.y);
    assert.deepEqual({via:down.via,feature:down.feature},{via:'chute',feature:chute.id});
    assert.equal(runtime.beginTraversal({move:down,from:top}).handled,true);

    const low={
      x:origin.x+chute.x+chute.dir.x*(chute.run-1),
      y:origin.y+chute.y+chute.dir.y*(chute.run-1),
    };
    const upTo={x:low.x-chute.dir.x,y:low.y-chute.dir.y};
    const uphill=createSourceSpaceRuntime({initialState:built.state}).geometry.canStep(low.x,low.y,upTo.x,upTo.y);
    assert.equal(uphill.ok,false,`${chute.id} became climbable`);
    assert.equal(uphill.why,'one-way chute');
  }
}

{
  const sourceTick=mainSource.slice(mainSource.indexOf('function tickSourceSpace'),mainSource.indexOf('function tickStairAnomaly'));
  assert.match(sourceTick,/traversal\?\.completed[\s\S]*armHeldMovement\(performance\.now\(\)\)/,
    'a completed Source traversal does not re-arm held movement');
  assert.doesNotMatch(sourceTick,/resetMotionInput/,'traversal completion clears the player\'s held key');
}

{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  const mouth = { x: ORIGIN.x + 12, y: ORIGIN.y - 40, facing: 2 };
  const down = runtime.geometry.canStep(mouth.x, mouth.y, mouth.x, mouth.y + 1);
  assert.equal(down.via, 'chute');
  assert.equal(runtime.geometry.canStep(mouth.x, mouth.y + 1, mouth.x, mouth.y).ok, false, 'a chute remains one-way');
  runtime.beginTraversal({ move: down, from: mouth });
  let completed;
  for (let i = 0; i < 90 && !completed?.completed; i += 1) completed = runtime.tickTraversal(1 / 60);
  assert.equal(completed.completed, true);
  assert.ok(completed.dropHeight>0&&completed.impact>0,'landing feedback is scaled from the completed drop');
  assert.ok(completed.duration == null || completed.duration <= 1.1);
  assert.equal(runtime.state().checkpoint.id, 'landing-arrival');
  assert.equal(runtime.geometry.canStep(ORIGIN.x + 30, ORIGIN.y - 39, ORIGIN.x + 30, ORIGIN.y - 40).ok, false,
    'unsupported cliffs are impassable');
}

{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition({ x: ORIGIN.x + 30, y: ORIGIN.y - 240, facing: 0 });
  const encounter = runtime.beginHushContact();
  assert.ok(encounter);
  const aligned = encounter.choices.find((choice) => choice.aligns);
  const captured = runtime.resolveHushContactChoice(aligned.id);
  assert.equal(captured.checkpoint.y, ORIGIN.y - 128, 'return capture removes exactly one tier');
  assert.equal(runtime.state().sourceContacts.captures, 1);
  runtime.setPlayerPosition(captured.checkpoint);
  runtime.tick(6, { px: captured.checkpoint.x, py: captured.checkpoint.y, facing: 0 });
  assert.equal(runtime.beginHushContact(), null, 'waiting out grace is insufficient without subsequent movement');
  const moved = { ...captured.checkpoint, x: captured.checkpoint.x + 2 };
  runtime.onStep(captured.checkpoint, moved);
  runtime.tick(.01, { px: moved.x, py: moved.y, facing: 0 });
  assert.ok(runtime.beginHushContact(), 'capture becomes eligible after grace and renewed movement');
}

{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,{seed:4417});
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  runtime.setPlayerPosition(built.position);
  assert.equal(runtime.finalEncounterRequest().battleAvailable,true);
  const insights=[...runtime.state().sourceContacts.insights];
  // LOSING COSTS THE CHAPTER, NOT A TIER. It used to drop him one plateau and
  // re-arm the fight, which is the same as losing not counting. Now it submits
  // on his behalf and puts him out past the perimeter, on the tape.
  const loss=runtime.failFinalEncounter();
  assert.equal(loss.handled,true);
  assert.equal(loss.horizon,true,'a lost fault puts him out on the tape');
  assert.equal(loss.reason,'lost');
  assert.equal(runtime.state().phase,'horizon');
  assert.deepEqual(runtime.state().sourceContacts.insights,insights,'battle loss retains contact knowledge');
  assert.equal(runtime.state().finalEncounter.status,'resolved','the fault does not stay open behind him');
  assert.equal(runtime.state().finalEncounter.won,false);
  assert.equal(runtime.state().finalEncounter.outcome,'submit','losing submits');
  assert.equal(runtime.state().bestEligible,false,'a loss cannot reach the rescue');
  assert.equal(runtime.state().completed,false,'the chapter closes at an exit, not at the loss');
  // And he is actually standing on it, at the head of the recording.
  const frame=runtime.horizonFrame();
  assert.equal(frame.active,true);
  assert.equal(frame.depth,SOURCE_HORIZON.entryStandoff,'he arrives just past the seam, not clipping it');
  assert.equal(frame.slice,SOURCE_HORIZON.entryStandoff/SOURCE_HORIZON.sliceMetres);
  assert.ok(frame.seconds<5,'the tape is only just running when he gets there');
  assert.equal(frame.collapsing,false);
}

{
  // WALKING AWAY GOES TO THE SAME PLACE. Declining the fault still reads as
  // contain — the dossier is unchanged — but it no longer closes the chapter.
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT,{seed:4417});
  const runtime=createSourceSpaceRuntime({initialState:built.state,onComplete:()=>{
    throw new Error('walking away must not complete the chapter — that happens at an exit');
  }});
  runtime.setPlayerPosition(built.position);
  const out=runtime.completeNormalExit();
  assert.equal(out.horizon,true);
  assert.equal(out.reason,'walked-away');
  assert.equal(runtime.state().phase,'horizon');
  assert.equal(runtime.state().finalEncounter.outcome,'contain','declining the fault still contains it');
  assert.equal(runtime.state().redaction,'comfort');
  assert.equal(runtime.state().completed,false);
}

{
  // THE TWO WAYS OFF THE TAPE. Only an exit completes, and the exit travels out
  // on the completion so main.js knows whether it owes him a tower.
  for (const exit of ['chapel','tower']) {
    const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT,{seed:4417});
    let completion=null;
    const runtime=createSourceSpaceRuntime({initialState:built.state,onComplete:(value)=>{completion=value;}});
    runtime.setPlayerPosition(built.position);
    runtime.completeNormalExit();
    assert.equal(completion,null,'the tape has not been walked yet');
    const chosen=runtime.chooseHorizonExit(exit);
    assert.equal(chosen.handled,true);
    assert.equal(runtime.state().completed,true);
    assert.equal(completion?.horizonExit,exit,'the chosen exit reaches main.js');
    assert.ok(completion.flags.includes(`chunkSurf.horizon.exit.${exit}`));
  }
  // And nothing else gets you off it.
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT,{seed:4417});
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  assert.equal(runtime.chooseHorizonExit('nave').handled,false,'an unauthored exit is not an exit');
  assert.equal(runtime.state().phase,'horizon');
}

{
  // THE GATE ON THE FAULT. Three insights are not enough on their own: the night
  // has to have taken him at least once before he ever walked in here.
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,{seed:4417,injuries:0});
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  runtime.setPlayerPosition(built.position);
  const request=runtime.finalEncounterRequest();
  assert.equal(request.exposed,true,'the insights are still earned');
  assert.equal(request.hurtBefore,false);
  assert.equal(request.battleAvailable,false,'an unhurt recordist has no reason to believe there is anything to argue with');
  assert.equal(runtime.requestBossBattle().available,false);
  assert.equal(request.normalExitAvailable,true,'and the way past is never closed');
}

{
  // THE RIG IS NOT A GATE ANY MORE. Without it the fight opens; what it still
  // buys is the rescue.
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,{seed:4417,hasRig:false});
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  runtime.setPlayerPosition(built.position);
  const request=runtime.finalEncounterRequest();
  assert.equal(request.rigAvailable,false);
  assert.equal(request.battleAvailable,true,'no rig still gets you the argument');
  assert.equal(request.rescueEligible,false,'but not the rescue — inverting the contract is what the rig is for');
}

console.log('source traversal specs passed');
