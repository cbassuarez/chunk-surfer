import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { freshPressureGait, stepPressureGait, rebasePressureHeading, pressureGaitVisibility, PRESSURE_GAIT } from '../src/game/pressure-gait.js';
import { createPressurePerformance } from '../src/game/pressure-performance.js';
import * as PRES from '../src/game/presence.js';
import { packShadowFrames, unpackShadowFrames, shadowFrameAt } from '../src/causal/tape.js';

const input = { dt: .01, x: 0, y: 0, targetX: 0, targetY: -100, speed: 100 };
function take(seed = 4417, proximity = 0, resolveMove = null) {
  let state = { x: 0, y: 0, gait: freshPressureGait({ seed }) };
  const frames = [];
  for (let tick = 0; tick < 1800; tick++) {
    const old = state;
    state = stepPressureGait(state.gait, { ...input, ...state, proximity, resolveMove });
    frames.push({ t: tick * .01, ...state, delta: Math.hypot(state.x - old.x, state.y - old.y) * CELL });
  }
  return frames;
}

test('arrested hunter really holds and loads, then makes one bounded step at a readable speed', () => {
  const frames = take(), loads = new Map(), cycles = new Map();
  for (const frame of frames) {
    assert.ok(frame.delta <= PRESSURE_GAIT.strideMetres / PRESSURE_GAIT.advanceMinSeconds * .01 + 1e-8,
      'an advance exceeded its physical speed budget');
    if (frame.gait.phase === 'load') {
      const load = loads.get(frame.gait.cycle) || [];
      load.push(frame); loads.set(frame.gait.cycle, load);
      assert.equal(frame.delta, 0, 'loading moved the collider');
    }
    const distance = cycles.get(frame.gait.cycle) || 0;
    cycles.set(frame.gait.cycle, distance + frame.delta);
    if (frame.gait.phase === 'arrest' && frame.gait.elapsed > .02) assert.equal(frame.delta, 0, 'held root continued homing');
  }
  assert.ok(loads.size >= 4, 'fixture did not reach repeated movement cycles');
  for (const load of [...loads.values()].slice(0, -1)) {
    assert.ok(load.length * .01 >= .38 && load.length * .01 <= .61, 'loading failed to provide a .4–.6s warning');
    assert.equal(new Set(load.map(v => `${v.x}/${v.y}`)).size, 1, 'load did not plant the collider');
  }
  for (const distance of [...cycles.values()].slice(1, -1)) {
    assert.ok(Math.abs(distance - PRESSURE_GAIT.strideMetres) < .014, 'cycle moved more than one short step');
  }
});

test('hold variations are deterministic, proximity lengthens holds without steering toward an observer', () => {
  const first = take(99), again = take(99), near = take(99, 1);
  assert.deepEqual(first, again, 'same simulation changed with wall clock/randomness');
  const farTravel = -first.at(-1).y, nearTravel = -near.at(-1).y;
  assert.ok(nearTravel < farTravel, 'proximity did not lengthen held intervals');
  assert.ok(near.every(v => v.x === 0 && Math.abs(v.gait.heading) < 1e-8), 'proximity steered a sound-only hunter');
  const durations = new Set(first.filter(v => v.gait.phase === 'arrest').map(v => v.gait.duration));
  assert.ok(durations.size >= 4, 'every held interval repeated the same metronome');
});

test('a navigation-blocked advance freezes the actual root and its distance-sampled feet', () => {
  const frames = take(77, 0, from => from);
  const blocked = frames.filter(v => v.gait.blocked);
  assert.ok(blocked.length > 100);
  assert.ok(blocked.every(v => v.x === 0 && v.y === 0 && v.gait.travelMetres === 0));
  const driver = createPressurePerformance();
  for (const frame of blocked.slice(0, 100)) driver.tick(.01, { primary: {
    id: 'wall', role: 'live-pressure', x: frame.x, y: frame.y, motion: 'hunt', gait: frame.gait,
  } });
  const pose = driver.snapshot().primary.performance;
  assert.equal(pose.clip, 'pressure_advance'); assert.equal(pose.time, 0); assert.equal(pose.loop, false);
});

test('a blocked old destination releases through a captured stationary recovery and replans to a new sound', () => {
  let state = { x: 0, y: -.3, gait: { ...freshPressureGait({ seed: 19 }), phase: 'advance',
    stepStartX: 0, stepStartY: 0, stepTargetX: 0, stepTargetY: -.84,
    stepSpeed: 1, travelMetres: .15, progress: .15 / .42 } };
  const driver = createPressurePerformance(), frames = [];
  const resolveMove = (from, target, budget) => {
    if (target.y < -.31) return from; // The old route is now closed.
    const d = Math.hypot(target.x - from.x, target.y - from.y), step = Math.min(d, budget);
    return { x: from.x + (target.x - from.x) / d * step, y: from.y + (target.y - from.y) / d * step };
  };
  let sawRecovery = false, resetVisibility = null, replanned = false;
  for (let i = 0; i < 1500; i++) {
    const before = state;
    state = stepPressureGait(state.gait, { ...state, dt: .02, targetX: 5, targetY: -.3, speed: 2, resolveMove });
    if (state.gait.phase === 'recover') {
      sawRecovery = true;
      assert.equal(state.x, 0); assert.equal(state.y, -.3, 'recovery teleported the collider');
      if (!state.gait.recoveryReset) {
        assert.equal(state.gait.progress, .15 / .42, 'withdrawal advanced a planted foot');
        assert.equal(state.gait.recoveryTime, .15 / .42 * .72);
      } else if (!before.gait.recoveryReset) resetVisibility = pressureGaitVisibility(state.gait);
    }
    const presentation = driver.tick(.02, { primary: { id: 'blocked-replan', role: 'live-pressure',
      x: state.x, y: state.y, motion: 'hunt', gait: state.gait } });
    frames.push({ t: i * 20, x: 0, y: 0, spaceId: 'conservatory', pressurePresentation: presentation });
    if (state.x > .1) { replanned = true; break; }
  }
  assert.ok(sawRecovery && replanned, 'old blocked target trapped the hunter');
  assert.ok(resetVisibility < 1e-10, 'stance reset was visible');
  const packed = JSON.parse(JSON.stringify(packShadowFrames(frames))), decoded = unpackShadowFrames(packed);
  const captured = decoded.filter(f => f.pressurePresentation.primary.performance.gait.phase === 'recover');
  assert.ok(captured.some(f => f.pressurePresentation.primary.performance.manifestation < .01));
  for (const frame of captured) {
    const expected = frames.find(f => f.t === frame.t).pressurePresentation;
    assert.deepEqual(frame.pressurePresentation, expected, 'capture changed the recovery pose or visibility');
    driver.applyFrame(frame.pressurePresentation);
    driver.tick(.2, { primary: { id: 'observer', role: 'live-pressure', x: 90, y: 90 }, suspended: true });
    assert.deepEqual(driver.snapshot(), expected, 'observer tick changed a recorded recovery');
  }
});

test('a nearby committed destination completes the full gesture without overshoot or a partial-pose reset', () => {
  for (const distance of [.015, .12, .419]) {
    let state = { x: 4, y: 6, gait: { ...freshPressureGait({ seed: 7 }), phase: 'load', elapsed: .5, duration: .5 } };
    const targetY = 6 - distance / CELL;
    let advanceTime = 0, lastProgress = 0;
    for (let i = 0; i < 100; i++) {
      const before = state;
      state = stepPressureGait(state.gait, { ...state, dt: .01, targetX: 4, targetY, speed: 100 });
      assert.ok(state.y >= targetY - 1e-9, 'short stride overshot its remembered destination');
      assert.notEqual(state.gait.phase, 'recover', 'a clear short goal unnecessarily demanifested');
      if (state.gait.phase === 'advance') {
        advanceTime += .01; lastProgress = state.gait.progress;
        assert.ok(Math.abs(state.gait.stepDistanceMetres - distance) < 1e-8);
      }
      if (before.gait.phase === 'advance' && state.gait.phase === 'arrest') break;
    }
    assert.equal(state.gait.phase, 'arrest');
    assert.ok(Math.abs(state.y - targetY) < 1e-8);
    assert.ok(advanceTime >= .62 && lastProgress > .97, 'short goal skipped the end of its foot gesture');
    assert.ok(Math.abs(state.gait.progress - 1) < 1e-8);
  }
});

test('a clue arriving at the loaded body finishes a stationary gesture without snapping or inventing a bearing', () => {
  let state = { x: 4, y: 6, gait: { ...freshPressureGait({ seed: 7, heading: .3 }), phase: 'load', elapsed: .2, duration: .5 } };
  const phases = ['load'];
  for (let i = 0; i < 100; i++) {
    state = stepPressureGait(state.gait, { ...state, dt: .02, targetX: 4, targetY: 6, speed: 0 });
    assert.equal(state.x, 4); assert.equal(state.y, 6);
    assert.ok(Math.abs(state.gait.heading - .3) < 1e-8);
    if (phases.at(-1) !== state.gait.phase) phases.push(state.gait.phase);
    if (state.gait.phase === 'arrest') break;
  }
  assert.deepEqual(phases, ['load', 'advance', 'arrest']);
});

test('turning begins during foot release, retains a planted root while loading, and is captured without camera authority', () => {
  let state = { x: 0, y: 0, gait: freshPressureGait({ seed: 97 }) };
  const advance = [];
  for (let i = 0; i < 700 && advance.length < 50; i++) {
    state = stepPressureGait(state.gait, { ...input, ...state, targetX: 100, targetY: 0 });
    if (state.gait.phase === 'load') {
      assert.equal(state.x, 0); assert.equal(state.gait.heading, 0);
      assert.ok(state.gait.listenTurn >= 0);
    }
    if (state.gait.phase === 'advance') advance.push(state);
  }
  assert.ok(advance[0].gait.heading > 0 && advance[0].gait.heading < .1, 'root snapped ninety degrees at advance entry');
  assert.ok(Math.abs(advance.at(-1).gait.heading - Math.PI / 4) < 1e-8, 'large turn skipped the bounded pivot');
  assert.ok(advance.every(v=>v.x===0&&v.y===0&&v.gait.travelMetres===0&&v.gait.pivot), 'pivot translated the collider');
  const released = advance.find(v => v.gait.progress > .4);
  assert.equal(released.gait.heading, advance.at(-1).gait.heading, 'body kept rotating after the leading foot planted');
});

test('a sound behind requires several loaded pivots, then forward steps; a refreshed sound cannot steer a committed foot', () => {
  let state={x:0,y:0,gait:freshPressureGait({seed:551})};
  const pivots=new Set();let translated=false;
  for(let i=0;i<2200;i++){
    const old=state;
    state=stepPressureGait(state.gait,{...input,...state,targetX:0,targetY:100});
    if(state.gait.pivot&&state.gait.phase==='advance'){
      pivots.add(state.gait.cycle);assert.equal(state.x,0);assert.equal(state.y,0);
      assert.ok(Math.abs(Math.atan2(Math.sin(state.gait.targetHeading-state.gait.startHeading),Math.cos(state.gait.targetHeading-state.gait.startHeading)))<=Math.PI/4+1e-8);
    }
    if(Math.hypot(state.x-old.x,state.y-old.y)>.00001){
      assert.ok(state.y>old.y,'backwards/skating step before the body faced its remembered sound');
      assert.ok(Math.abs(state.gait.heading)>Math.PI*.75-.01);
      translated=true;break;
    }
  }
  assert.ok(pivots.size>=3);assert.ok(translated);
  // A new belief is used at the next load. This one short step cannot bend
  // toward a per-frame transform while a foot is already supporting it.
  const before=state;
  state=stepPressureGait(state.gait,{...input,...state,targetX:-100,targetY:-100});
  assert.equal(state.gait.stepTargetX,before.gait.stepTargetX);
  assert.equal(state.gait.stepTargetY,before.gait.stepTargetY);
  assert.ok(state.y>before.y);
});

test('an authored atlas connector redirects exactly, never interpolates through the gap, and preserves physical bearing',()=>{
  const resolveMove=(from)=>from.x<50?{x:100,y:20,redirect:true}:from;
  const physicalAt=(x,y)=>x<50?{x,z:y}:{x:120-y,z:x-100};
  let state={x:0,y:0,gait:freshPressureGait({seed:31,heading:0})};
  for(let i=0;i<600&&state.x===0;i++){
    state=stepPressureGait(state.gait,{...input,...state,targetX:100,targetY:20,resolveMove,
      rebaseHeading:(yaw,from,to)=>rebasePressureHeading(physicalAt,yaw,from,to)});
    assert.ok(state.x===0||state.x===100,'invented an invalid intermediate atlas coordinate');
  }
  assert.equal(state.x,100);assert.equal(state.y,20);assert.equal(state.gait.phase,'arrest');
  assert.equal(state.gait.travelMetres,0,'counted the logical atlas gap as leg travel');
  const anchor=physicalAt(state.x,state.y),forward=physicalAt(state.x+Math.sin(state.gait.heading)*.1,state.y-Math.cos(state.gait.heading)*.1);
  assert.ok(Math.abs(forward.x-anchor.x)<1e-8&&forward.z<anchor.z,'connector rotated the physical actor');
});

test('saved captured phase, planted turn and real root replay without advancing or interpolating through a phase reset', () => {
  const source = take().filter((_, i) => i % 5 === 0), driver = createPressurePerformance();
  const frames = source.map((v, i) => ({ t: i * 50, x: 0, y: 3, spaceId: 'conservatory',
    pressurePresentation: driver.tick(.05, { primary: {
      id: 'capture', role: 'live-pressure', x: v.x, y: v.y, motion: 'hunt', gait: v.gait,
    } }) }));
  const packed = JSON.parse(JSON.stringify(packShadowFrames(frames))), decoded = unpackShadowFrames(packed);
  const loaded = decoded.find(v => v.pressurePresentation.primary.performance.clip === 'pressure_load');
  assert.ok(loaded); assert.ok(loaded.pressurePresentation.primary.performance.gait.duration >= .4);
  driver.applyFrame(loaded.pressurePresentation);
  driver.tick(.25, { primary: { id: 'live', role: 'live-pressure', x: 999, y: 999 }, suspended: true });
  assert.deepEqual(driver.snapshot(), loaded.pressurePresentation, 'observer tick altered a saved loaded pose');
  const advance = decoded.find(v => v.pressurePresentation.primary.performance.clip === 'pressure_advance');
  assert.ok(advance.pressurePresentation.primary.performance.gait.travelMetres > 0);
  const beyond = shadowFrameAt({ shadowFrames: packed }, 999999);
  assert.deepEqual(beyond.pressurePresentation, decoded.at(-1).pressurePresentation);
});

test('natural chase expiry mid-load finishes compression and one actual step before listening',()=>{
  PRES.loadPresenceState();PRES.spawnAtCell(0,0,{gaitSeed:4417});
  PRES.offerSoundTarget({position:{x:0,y:-100},level:1,confidence:1,priority:1,expiresAt:performance.now()+10000});
  const state=PRES.presenceState(),driver=createPressurePerformance(),clips=[];
  state.gait={...state.gait,phase:'load',elapsed:.2,duration:.5};state.chaseUntil=-1;
  const sample=()=>{
    const clip=driver.tick(.05,{primary:{id:'expired-load',role:'live-pressure',x:state.x,y:state.y,
      velocityX:state.velocityX,velocityY:state.velocityY,motion:state.behaviorMode==='chase'?'hunt':state.behaviorMode,gait:state.gait}}).primary.performance.clip;
    if(clips.at(-1)!==clip)clips.push(clip);
  };
  sample();
  for(let i=0;i<40&&['load','advance'].includes(state.gait.phase);i++){
    PRES.updatePresence(.05,100,100,null);sample();
    assert.equal(state.behaviorMode,'chase','chase expiry discarded the committed compression/step');
  }
  assert.equal(state.gait.phase,'arrest');
  assert.ok(Math.abs(Math.hypot(state.x,state.y)*CELL-.42)<1e-8,'committed step did not finish at the real collider root');
  assert.deepEqual(clips,['pressure_load','pressure_advance','pressure_arrest'],'loaded body popped to an unloaded hold');
  PRES.updatePresence(.01,100,100,null);
  assert.equal(state.behaviorMode,'listen');assert.equal(state.gait.phase,'listen');
  PRES.despawn();
});

test('sound-memory expiry mid-load finishes one telegraphed step, then releases the old clue',()=>{
  PRES.loadPresenceState();PRES.spawnAtCell(0,0,{gaitSeed:4417});
  PRES.offerSoundTarget({position:{x:0,y:-100},level:1,confidence:1,priority:1});
  const state=PRES.presenceState(),driver=createPressurePerformance(),clips=[];
  state.gait={...state.gait,phase:'load',elapsed:.2,duration:.5};
  state.targetSetAt=performance.now()-(PRES.PRESENCE.memorySec+.1)*1000;
  state.externalTargetUntil=-1;state.chaseUntil=performance.now()+10000;
  for(let i=0;i<40&&['load','advance'].includes(state.gait.phase);i++){
    PRES.updatePresence(.05,100,100,null);
    const clip=driver.tick(.05,{primary:{id:'expired-memory',role:'live-pressure',x:state.x,y:state.y,motion:'hunt',gait:state.gait}}).primary.performance.clip;
    if(clips.at(-1)!==clip)clips.push(clip);
    assert.equal(state.hasTarget,true,'memory expiry unloaded a committed gesture');
  }
  assert.deepEqual(clips,['pressure_load','pressure_advance','pressure_arrest']);
  assert.ok(Math.abs(Math.hypot(state.x,state.y)*CELL-.42)<1e-8);
  PRES.updatePresence(.01,100,100,null);
  assert.equal(state.hasTarget,false,'completed gesture retained an expired acoustic belief');
  assert.equal(state.behaviorMode,'stand');
  PRES.despawn();
});

test('borrowed tableaux restore a mid-step scheduler, while a normal save deliberately reloads with no hunter', () => {
  PRES.loadPresenceState(); PRES.spawnAtCell(4, 8, { gaitSeed: 731 });
  const state = PRES.presenceState();
  state.gait = { ...freshPressureGait({ seed: 731 }), phase: 'advance', travelMetres: .18,
    heading: .7, startHeading: .4, targetHeading: .7, stepStartX: 4, stepStartY: 8 };
  const captured = PRES.capturePresenceTableauState(), expected = structuredClone(captured.gait);
  PRES.beginPresenceTableau({ x: -5, y: 6 });
  assert.equal(PRES.presenceState().gait, null, 'tableau borrowed a sound-hunter movement phase');
  PRES.restorePresenceTableau(captured);
  assert.deepEqual(PRES.presenceState().gait, expected, 'borrow/restore reset a live step arbitrarily');
  const save = PRES.savePresenceState(); PRES.loadPresenceState(save);
  assert.equal(PRES.isActive(), false, 'reload resurrected an active mid-step enemy');
  PRES.spawnAtCell(4, 8, { gaitSeed: 731 });
  assert.deepEqual(PRES.presenceState().gait, freshPressureGait({ seed: 731 }));
  PRES.despawn();
});
