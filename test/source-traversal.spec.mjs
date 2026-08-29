import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SOURCE_CHUTES, SOURCE_HORIZON, SOURCE_LIFTS, SOURCE_TIERS } from '../src/data/source-level.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const ORIGIN = { x: 0, y: -252 };

const runtimeSource=await readFile(new URL('../src/game/source-space-runtime.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
assert.doesNotMatch(runtimeSource,/emitNoise|MONITOR\./,'Source weather, contacts and traversal never enter the player-noise path');

// THE FIRST TIER IS CLIMBED, NOT RIDDEN.
//
// This used to assert a committed lift ride out of the arrival: canStep handing
// back {via:'lift'}, beginTraversal locking movement, ninety ticks of animation,
// and a one-way refusal on the way back down. There are no lifts now — the way
// up is a staircase and it is walked, in both directions, under the same step
// rule as every other cell in Source.
{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  const arrivalStair=SOURCE_CHUTES.find((chute)=>chute.id==='chute-fork');
  const arrivalFoot=arrivalStair.y+arrivalStair.run;

  // Walk the whole arrival stair, one cell at a time, uphill.
  let climbed = 0;
  for (let step = 0; step < 15; step += 1) {
    const y = ORIGIN.y + arrivalFoot - step;
    const move = runtime.geometry.canStep(ORIGIN.x, y, ORIGIN.x, y - 1);
    assert.equal(move.ok, true, `the arrival stair blocks the climb ${step} steps up`);
    assert.equal(move.via, undefined, 'a staircase must never hand the body to a ride');
    climbed += 1;
  }
  assert.equal(climbed, 15, 'the arrival stair is climbable for its whole run');

  // And back down it, which a chute would have refused.
  for (let step = 0; step < 15; step += 1) {
    const y = ORIGIN.y + arrivalStair.y + step;
    const move = runtime.geometry.canStep(ORIGIN.x, y, ORIGIN.x, y + 1);
    assert.equal(move.ok, true, `the arrival stair blocks the descent ${step} steps down`);
    assert.equal(move.via, undefined, 'a staircase is walked downhill too');
  }

  // Nothing is ever committed, so nothing ever locks movement.
  assert.equal(runtime.traversalFrame().active, false, 'walking a staircase starts no traversal');
  assert.equal(runtime.traversalFrame().locksMovement, false);
}

// EVERY STAIRCASE IS WALKABLE ACROSS ITS FULL WIDTH AND ON A DIAGONAL.
//
// This block used to exercise the lift volumes: edge lanes and a diagonal
// segment, each committing to a ride so controller cadence could not skip the
// capture. There are no volumes to skip into now, and the property that matters
// is the opposite one — that the stair is ordinary walkable ground everywhere
// across its width, including on the diagonals a controller actually produces.
{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
  const origin=built.state.landscapeOrigin;
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  for(const stair of SOURCE_CHUTES){
    for(const offset of [-stair.halfWidth+.5,0,stair.halfWidth-.5]){
      // A cell partway up the run, so both samples are on the ramp itself.
      const y=origin.y+stair.y+Math.floor(stair.run/2);
      const x=origin.x+stair.x+offset;
      const up=runtime.geometry.canStep(x,y,x,y-1);
      assert.equal(up.ok,true,`${stair.id} blocks the climb at offset ${offset}`);
      assert.equal(up.via,undefined,`${stair.id} committed a ride instead of being walked`);
      const down=runtime.geometry.canStep(x,y,x,y+1);
      assert.equal(down.ok,true,`${stair.id} blocks the descent at offset ${offset}`);
      assert.equal(down.via,undefined,`${stair.id} committed a ride going down`);
    }
    // And a diagonal across the ramp, which is what controller cadence produces.
    const y=origin.y+stair.y+Math.floor(stair.run/2);
    const x=origin.x+stair.x;
    const diagonal=runtime.geometry.canStep(x,y,x+.6,y-.8);
    assert.equal(diagonal.ok,true,`${stair.id} blocks a diagonal step`);
    assert.equal(diagonal.via,undefined,`${stair.id} committed a ride on a diagonal`);
  }
}

// Chutes keep the inverse contract across every authored return: downhill
// commits, uphill is rejected even while both samples are on the chute surface.
{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
  const origin=built.state.landscapeOrigin;
  for(const chute of SOURCE_CHUTES){
    // chute-fork is authored `ascendable` — it lands beside the FOH leaf and is
    // the first object the player meets, so it is a staircase and is walked in
    // both directions. The inverse contract below is about the slides, and it
    // is asserted for the staircase separately underneath.
    if(chute.ascendable)continue;
    const top={x:origin.x+chute.x,y:origin.y+chute.y,facing:2};
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
    void 0;

    let landed;
    for(let i=0;i<180&&!landed?.completed;i+=1)landed=runtime.tickTraversal(1/60);
    assert.equal(landed?.completed,true,`${chute.id} did not finish`);
    const exit=runtime.geometry.canStep(
      landed.position.x,landed.position.y,
      landed.position.x+chute.dir.x,landed.position.y+chute.dir.y,
    );
    assert.equal(exit.ok,true,`${chute.id} trapped the player on its bottom lip`);
  }
}

{
  const sourceTick=mainSource.slice(mainSource.indexOf('function tickSourceSpace'),mainSource.indexOf('function tickStairAnomaly'));
  assert.match(sourceTick,/traversal\?\.completed[\s\S]*armHeldMovement\(performance\.now\(\)\)/,
    'a completed Source traversal does not re-arm held movement');
  assert.doesNotMatch(sourceTick,/resetMotionInput/,'traversal completion clears the player\'s held key');
}

// NOTHING IN THE FIELD IS RIDDEN, AND THE SPINE IS WALKABLE END TO END.
//
// This block asserted a committed chute ride and then, separately, that the
// arrival stair could be climbed. Both connectors are staircases now, so the
// ride is gone and the property worth pinning is the one the lifts used to
// provide: that walking straight down the centre line never meets a cliff.
{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });

  // From past the Scene Dock's far wall (the room ends around local -12; its
  // only way out is the FOH leaf off the centre line) down to the perimeter.
  for (let y = ORIGIN.y - 22; y >= ORIGIN.y - 330; y -= 1) {
    const move = runtime.geometry.canStep(ORIGIN.x, y, ORIGIN.x, y - 1);
    assert.equal(move.ok, true, `the spine is impassable at ${y - ORIGIN.y}`);
    assert.equal(move.via, undefined, `the spine committed a ride at ${y - ORIGIN.y}`);
  }
  assert.equal(runtime.traversalFrame().active, false, 'walking the spine starts no traversal');

  // A tier boundary away from any staircase is still a cliff. Sampled at the
  // arrival/fork seam, which the approach extension moved out to -160.
  const seam = SOURCE_TIERS.find((tier) => tier.id === 'fork').from;
  assert.equal(runtime.geometry.canStep(ORIGIN.x + 30, ORIGIN.y + seam + 1, ORIGIN.x + 30, ORIGIN.y + seam).ok, false,
    'unsupported cliffs are impassable');
}

{
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  // Stand on the return tier, wherever the field currently puts it.
  const returnTier = SOURCE_TIERS.find((tier) => tier.id === 'return');
  const traceTier = SOURCE_TIERS.find((tier) => tier.id === 'trace');
  runtime.setPlayerPosition({ x: ORIGIN.x + 30, y: ORIGIN.y + returnTier.from - 20, facing: 0 });
  const encounter = runtime.beginHushContact();
  assert.ok(encounter);
  const aligned = encounter.choices.find((choice) => choice.aligns);
  const captured = runtime.resolveHushContactChoice(aligned.id);
  // One tier back: the trace checkpoint, eight cells past its own start.
  assert.equal(captured.checkpoint.y, ORIGIN.y + traceTier.from - 8, 'return capture removes exactly one tier');
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
  runtime.requestBossBattle();
  runtime.commitContact();
  // LOSING CONTACT COSTS THE RUN. It used to drop him one plateau and then put
  // him on the tape; the declared no-return route now terminates where he fell.
  const loss=runtime.failFinalEncounter();
  assert.equal(loss.handled,true);
  assert.equal(loss.completion.endingId,'contact-lost');
  assert.equal(runtime.state().phase,'completed');
  assert.equal(runtime.state().horizon.entered,false);
  assert.deepEqual(runtime.state().sourceContacts.insights,insights,'battle loss retains contact knowledge');
  assert.equal(runtime.state().finalEncounter.status,'resolved','the fault does not stay open behind him');
  assert.equal(runtime.state().finalEncounter.won,false);
  assert.equal(runtime.state().finalEncounter.outcome,'submit','losing submits');
  assert.equal(runtime.state().bestEligible,false,'a loss cannot reach the rescue');
  assert.equal(runtime.state().completed,true,'Contact loss is terminal');
  assert.equal(runtime.horizonFrame().active,false);
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
    if(exit==='tower')built.state={...built.state,profile:{...built.state.profile,marbleEyes:'carried'}};
    let completion=null;
    const runtime=createSourceSpaceRuntime({initialState:built.state,onComplete:(value)=>{completion=value;}});
    runtime.setPlayerPosition(built.position);
    runtime.completeNormalExit();
    assert.equal(completion,null,'the tape has not been walked yet');
    if(exit==='tower'){
      for(let beat=0;beat<3;beat+=1)runtime.talkToHorizonBust();
      runtime.decideHorizonBust(true);
    }
    const chosen=runtime.chooseHorizonExit(exit);
    assert.equal(chosen.handled,true);
    if(exit==='tower'){
      assert.equal(runtime.state().phase,'bells','the accepted bust opens the current bell passage');
      assert.equal(runtime.state().completed,false,'the Tower route is not complete before the belfry room');
      assert.equal(completion,null,'main.js is not handed the Tower before the bell passage is walked');
      assert.equal(runtime.enterBellsRoom().handled,true);
    }
    assert.equal(runtime.state().completed,true);
    assert.equal(completion?.horizonExit,exit,'the completed route reaches main.js');
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
