// THE RED APPROACH: the extension between the Scene Dock and the first staircase.
//
// The FOH leaf used to open four metres from the foot of the stairs — you left a
// room and were immediately climbing. This is the empty ground between them, and
// the three things that make it what it is: its length, its light, and the fact
// that both of those stop at the stair.
import assert from 'node:assert/strict';

import { CELL, MATERIAL } from '../src/data/floorplan/legend.js';
import { MOVE_MS } from '../src/config.js';
import {
  SOURCE_APPROACH_CELLS,
  SOURCE_CHUTES,
  SOURCE_LIFTS,
  SOURCE_TIERS,
  SOURCE_TIER_BY_ID,
} from '../src/data/source-level.js';
import {
  SOURCE_LANDING_PORTAL_LOCAL,
  sourceApproachLights,
  sourceApproachSpan,
  sourceLandingLights,
} from '../src/data/source-landing.js';
import {
  SOURCE_APPROACH_PACE,
  SOURCE_APPROACH_RED_ONSET_SECONDS,
  SOURCE_APPROACH_TARGET_SECONDS,
  SOURCE_APPROACH_TRAVEL_CELLS,
  SOURCE_PLAN_WINDOW,
  createSourceSpaceRuntime,
  sourceLandscapeFloorAt,
} from '../src/game/source-space-runtime.js';
import { freshChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { SOURCE_TORCH_MODE, applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';

// ── 1. IT IS LONG ENOUGH TO BE A PLACE ─────────────────────────────────────
{
  const stair = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
  const foot = stair.y + stair.run;
  const gap = Math.abs(SOURCE_LANDING_PORTAL_LOCAL.y - foot);

  assert.ok(gap >= SOURCE_APPROACH_CELLS,
    `the approach is ${gap} cells, short of the authored ${SOURCE_APPROACH_CELLS}`);

  // The pace is derived from the live move clock and the real endpoints. It is
  // not a hand-tuned constant that drifts when either one moves.
  const crossing = gap * MOVE_MS * SOURCE_APPROACH_PACE / 1000;
  assert.equal(SOURCE_APPROACH_TARGET_SECONDS,30);
  assert.equal(SOURCE_APPROACH_RED_ONSET_SECONDS,10);
  assert.equal(SOURCE_APPROACH_TRAVEL_CELLS,gap);
  assert.ok(crossing >= 29, `the approach crosses in ${crossing.toFixed(1)}s, under the authored band`);
  assert.ok(crossing <= 31, `the approach crosses in ${crossing.toFixed(1)}s, over the authored band`);
}

// ── 2. THE FIELD MOVED WITH IT, KEEPING ITS OWN PACING ─────────────────────
//
// Only the arrival tier grew. Every tier below it kept its depth and shifted, so
// the walk past the approach is exactly the walk it always was.
{
  const depth = (id) => {
    const tier = SOURCE_TIER_BY_ID[id];
    return Math.abs(tier.from - tier.to);
  };
  assert.equal(depth('fork'), 80, 'the fork tier changed depth');
  assert.equal(depth('trace'), 100, 'the trace tier changed depth');
  assert.equal(depth('return'), 120, 'the return tier changed depth');
  assert.equal(depth('arrival'), 16 + 320, 'the arrival tier is the one that grew');

  // Tiers still tile without gap or overlap, or the field has a hole in it.
  const field = SOURCE_TIERS.filter((tier) => tier.field);
  for (let i = 1; i < field.length; i += 1) {
    assert.equal(field[i].from, field[i - 1].to, `${field[i].id} does not begin where ${field[i - 1].id} ends`);
  }
}

// ── 3. THE SPINE IS STILL WALKABLE, ALL THE WAY DOWN ───────────────────────
//
// The check that caught the real hole when the lifts came out. The field is 120
// cells deeper now, so it has to run that much further.
{
  const deepest = SOURCE_TIERS.filter((tier) => tier.field).at(-1).to;
  let worst = 0;
  for (let y = -10; y >= deepest + 10; y -= 1) {
    const rise = Math.abs(sourceLandscapeFloorAt(0, y) - sourceLandscapeFloorAt(0, y - 1));
    assert.ok(rise <= 0.45, `the spine has an uncrossable cliff at ${y}: ${rise.toFixed(2)}m`);
    if (rise > worst) worst = rise;
  }
  assert.ok(worst > 0.2, 'the spine has no climb left on it at all — the tiers have gone flat');
}

// ── 4. THE PLAN WINDOW COVERS THE FIELD ────────────────────────────────────
//
// The landscape uses the ANCHORED branch of renderPlanFor, so the whole field
// must fit in one window. Growing the field past the window would silently stop
// rendering its far end.
{
  const deepest = Math.abs(SOURCE_TIERS.filter((tier) => tier.field).at(-1).to);
  assert.ok(SOURCE_PLAN_WINDOW >= deepest + 32,
    `a ${deepest}-deep field does not fit a ${SOURCE_PLAN_WINDOW} plan window`);
}

// ── 5. THE SEA IS WHITE, WIDE, AND MEASURED IN PATH DISTANCE ──────────────
function landscapeState(){
  let state=freshChunkSurfState({seed:4417,returnPoint:{x:0,y:0,facing:0}});
  const apply=(type,details={})=>{state=reduceChunkSurf(state,{type,...details});};
  apply('SOURCE_ENTERED',{returnPoint:state.returnPoint});
  apply('HALL_ADVANCED',{distance:112});
  apply('HAYSTACK_REACHED',{origin:{x:0,y:-224},slot:0});
  apply('HAYSTACK_PAGE_FOUND',{landscapeOrigin:{x:0,y:-252}});
  apply('TRANSFORMATION_COMPLETED');
  apply('SOURCE_LANDING_DOOR_OPENED');
  apply('SOURCE_LANDING_DOOR_SEALED');
  return state;
}

{
  const runtime=createSourceSpaceRuntime({initialState:landscapeState()});
  const origin=runtime.state().landscapeOrigin;
  const at={
    x:origin.x+SOURCE_LANDING_PORTAL_LOCAL.x,
    y:origin.y+SOURCE_LANDING_PORTAL_LOCAL.y-3,
    facing:0,
  };
  runtime.setPlayerPosition(at);
  assert.equal(runtime.geometry.cellAt(at.x,at.y).material,MATERIAL.sourceVoid);
  assert.equal(runtime.geometry.cellAt(at.x,at.y).floor,0,'the nothingness acquired terrain relief');
  assert.equal(runtime.geometry.cellAt(origin.x+340,at.y).material,MATERIAL.sourceVoid,
    'walking sideways discovers the field wall before the thirty-second beat ends');
  assert.equal(runtime.sourceObjective().target,null,'the white walk must not expose a compass destination');
  assert.ok(runtime.sourceVoidFrame().whiteout>.8,'the first interval is not white enough to erase the room');
  assert.equal(runtime.sourceEmergencyLightingFrame().active,false,'the red arrives before ten seconds');
  assert.ok(runtime.localLights().every((light)=>light.kind!=='emergency'),'red emitters exist before the onset');
  assert.ok(runtime.propInstances(at.x,at.y,{reducedMotion:true})
    .some((entry)=>entry.sourceVoidHorizon),'Source proper never appears as the distant dot');

  let current={...at};
  let completion=null;
  for(let step=1;step<=SOURCE_APPROACH_TRAVEL_CELLS;step+=1){
    const to={...current,x:current.x+(step%2?1:-1)};
    assert.equal(runtime.geometry.canStep(current.x,current.y,to.x,to.y).ok,true,
      `sideways movement was refused at approach step ${step}`);
    completion=runtime.onStep(current,to);
    current=completion?.relocate?{...completion.relocate}:{...to};
    runtime.setPlayerPosition(current);
    if(step===95)assert.equal(runtime.sourceEmergencyLightingFrame().active,false,'red begins before 10 seconds');
    if(step===96){
      assert.equal(runtime.sourceVoidFrame().elapsedSeconds,10);
      assert.equal(runtime.sourceEmergencyLightingFrame().active,true,'the emergency circuit misses its 10-second onset');
    }
  }
  assert.equal(completion.event,'source-approach-completed');
  assert.equal(runtime.state().sourceApproachComplete,true);
  assert.equal(runtime.state().checkpointId,'landing-approach');
  assert.deepEqual(current,runtime.checkpointPosition('landing-approach'),
    'the full-red topology handoff did not land at Source proper');

  const reloaded=createSourceSpaceRuntime({initialState:{...landscapeState(),sourceApproachDistance:95}});
  reloaded.setPlayerPosition(at);
  assert.equal(reloaded.sourceVoidFrame().distance,95,'reload discarded white-walk progress');
  const inside={x:origin.x+SOURCE_LANDING_PORTAL_LOCAL.x,y:origin.y+SOURCE_LANDING_PORTAL_LOCAL.y+3,facing:0};
  runtime.setPlayerPosition(inside);
  assert.equal(runtime.sourceEmergencyLightingFrame().active,false,
    'a completed save can paint the Scene Dock red after a warp/reload');
}

// ── 6. THE PHYSICAL RED SOURCES COVER THE APPROACH, NOT THE DOCK ───────────
//
// The concert hall washes because its emergency lamps are [1,0,0] at intensity
// 3.25-3.60 and radius 42-54. Source's own three ran 1.05-1.33 at 12-30 — about
// a third of the power and half the reach, which is the entire reason the field
// never read as red. The approach matches the hall.
{
  const span = sourceApproachSpan();
  const lamps = sourceApproachLights({ x: 0, y: 0 });
  assert.ok(lamps.length >= 5, 'the approach carries a run of lamps, not one');

  for (const lamp of lamps) {
    assert.deepEqual(lamp.color, [1, 0, 0], `${lamp.id} is not the emergency primary`);
    assert.equal(lamp.kind, 'emergency', `${lamp.id} is off the circuit`);
    assert.ok(lamp.intensity >= 3.2, `${lamp.id} is below hall strength: ${lamp.intensity}`);
    assert.ok(lamp.radius >= 42, `${lamp.id} does not reach like the hall: ${lamp.radius}`);

    const ly = lamp.z / CELL;
    assert.ok(ly <= span.from && ly >= span.to,
      `${lamp.id} at ${ly} escapes the approach (${span.from}..${span.to})`);
  }

  // Past the staircase the field is as dark as it ever was.
  const stair = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
  const beyond = sourceLandingLights({ x: 0, y: 0 }).filter((lamp) => lamp.z / CELL < stair.y);
  assert.equal(beyond.length, 0, 'a lamp is burning past the first staircase — the wash must end with the zone');
}

// ── 7. NO LIFTS SURVIVED THE RETUNE ────────────────────────────────────────
assert.equal(SOURCE_LIFTS.length, 0, 'the field is climbed, not ridden');

// ── 8. THE TORCH: X-RAY TO THE THRESHOLD, RED IN THE NOTHINGNESS ───────────
{
  const base = resolveTorchLook({ on: true, battery: 1 });
  assert.ok(base.power > 0 && base.color[1] > 0.8, 'the ordinary torch is warm and lit');

  const xray = applySourceEmergencyTorch(base, { xray: true });
  assert.equal(xray.sourceTorchMode, SOURCE_TORCH_MODE.XRAY,
    'the pre-threshold torch does not request Source x-ray inversion');
  assert.equal(xray.power, base.power, 'x-ray mode silently suppresses the carried torch');

  // Across the threshold it throws the circuit's colour immediately.
  const lit = applySourceEmergencyTorch(base, { active: true, cycle: 1 });
  assert.equal(lit.sourceTorchMode, SOURCE_TORCH_MODE.EMERGENCY);
  assert.ok(lit.power > 0, 'the torch works again past the approach');
  assert.ok(lit.color[0] > 0.9, 'the beam keeps its red primary');
  assert.ok(lit.color[1] < 0.35 && lit.color[2] < 0.35, 'the beam is red, not warm white');

  // And it pulses on the LAMPS' cycle, not a wobble of its own.
  const dim = applySourceEmergencyTorch(base, { active: true, cycle: 0.42 });
  assert.ok(dim.power < lit.power, 'the beam does not follow the circuit down');
  assert.ok(dim.power > 0, 'the circuit never takes the beam fully out');

  // Anywhere else it is untouched and does not ask for a Source compositor.
  assert.deepEqual(applySourceEmergencyTorch(base, {}).color, base.color,
    'the torch is only recoloured inside the emergency beat');
  assert.equal(applySourceEmergencyTorch(base, {}).sourceTorchMode, SOURCE_TORCH_MODE.NONE);
}

console.log('source approach specs passed');
