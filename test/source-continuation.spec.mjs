import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_CONTINUATION as C, CONTINUATION_CATCH_STAGES as STAGES, CONTINUATION_DROP_LIPS, CONTINUATION_ALTERNATE_LIPS, continuationCatchFloor, continuationSurfaces, continuationSolids, continuationSupportAt, continuationDropLips, continuationBodyClearAt, continuationRefugeAt, continuationRadialPoint } from '../src/data/source-continuation.js';
import { freshSourceContinuation, normalizeSourceContinuation, resumeSourceContinuation, stepSourceContinuation, continuationFocus, sourceContinuationFrame, sourceContinuationCanOccupy, sourceContinuationRecoveryPlan, sourceContinuationThreatTelemetry, sourceContinuationDoorFraction } from '../src/game/source-continuation.js';

const returnPose = { x: 6.125, y: -305.75, yaw: -.8, pitch: .12, floorH: 15.2, preserved: { source: true } };
const fresh = () => resumeSourceContinuation(freshSourceContinuation({ runId: 'test-run', returnPose }));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const step = (s, input = {}) => stepSourceContinuation(s, input).state;
const catchAt = (level, p = null) => ({ ...fresh(), phase: 'catch', level, ...(p || CONTINUATION_DROP_LIPS[level] || C.catch.finalApproach), feet: continuationCatchFloor(level), grace: 0 });
const wait = (s, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds - 1e-8; t += dt) s = step(s, { dt: Math.min(dt, seconds - t) }); return s; };
function finishFall(state) {
  const events = [];
  for (let i = 0; i < 900 && state.fall; i++) { const r = stepSourceContinuation(state, { dt: 1 / 60 }); state = r.state; events.push(...r.events); assert.ok([state.x, state.z, state.feet].every(Number.isFinite)); }
  assert.equal(state.fall, null); return { state, events };
}
function crossFinal(state) {
  let result = stepSourceContinuation(state, { interact: true }); state = result.state;
  assert.equal(result.event.type, 'door'); assert.equal(state.status, 'active');
  for (let i = 0; i < 160 && state.status === 'active'; i++) { result = stepSourceContinuation(state, { dt: 1 / 60, forward: 1 }); state = result.state; }
  return { state, event: result.event };
}

test('local state clones return pose, keeps run authority and adds no Contact/inventory/injury state', () => {
  const s = fresh(); assert.deepEqual(s.returnPose, returnPose); s.returnPose.preserved.source = false; assert.equal(returnPose.preserved.source, true);
  assert.equal(s.layoutVersion, 2); assert.equal(normalizeSourceContinuation(s, { runId: 'other' }).status, 'not-started');
  for (const field of ['contact', 'finale', 'inventory', 'injuries', 'takes']) assert.equal(field in s, false);
});

test('paused or unready simulations freeze movement, look, interaction, falls, leaf and threat clocks', () => {
  for (const seed of [fresh(), step(catchAt(0), { interact: true })]) for (const input of [{ paused: true }, { renderReady: false }]) {
    assert.deepEqual(step(seed, { ...input, dt: .25, forward: 1, side: 1, interact: true, look: { yaw: 2 } }), normalizeSourceContinuation(seed));
  }
});

test('both Sources remain one physical construction while the journey phase changes', () => {
  assert.equal(continuationSurfaces('catch'), continuationSurfaces('wrong-return'));
  const a = sourceContinuationFrame(fresh()), b = sourceContinuationFrame(catchAt(2));
  assert.deepEqual(a.geometry.surfaces, b.geometry.surfaces); assert.equal(a.cutaway, null); assert.equal(b.cutaway, null);
  assert.equal(a.camera.mode, 'first-person'); assert.equal(b.camera.mode, 'first-person');
  assert.equal(a.player.visible, false); assert.equal(b.player.visible, false);
});

test('three flights use42 real300mm treads with separate supports and no camera climb', () => {
  const steps = continuationSurfaces().filter(s => s.role === 'stair'); assert.equal(steps.length, 42);
  for (const id of new Set(steps.map(s => s.stairId))) { const rows = steps.filter(s => s.stairId === id); assert.equal(rows.length, 14); for (let k = 1; k < rows.length; k++) near(Math.abs(rows[k].y - rows[k - 1].y), .3); }
  for (const s of [fresh(), catchAt(1)]) { const f = sourceContinuationFrame(s); near(f.camera.eye[1] - f.player.y, C.eyeHeight); near(f.camera.yaw, s.yaw); }
});

test('the three descent decisions use different real partial sectors instead of interchangeable square rings', () => {
  const sectors = continuationSurfaces().filter(s => s.kind === 'sector'); assert.equal(sectors.length, 4);
  assert.equal(new Set(sectors.map(s => `${s.innerRadius}/${s.outerRadius}/${s.startAngle}/${s.endAngle}`)).size, 4);
  assert.deepEqual(sectors.map(s => s.y), [8.4, 2.4, -4.8, -12.6]);
  for (let level = 0; level < 4; level++) { assert.equal(continuationDropLips({ level }).length, level < 3 ? 2 : 0); assert.equal(continuationSupportAt(C.catch.center.x, C.catch.center.z, { feet: continuationCatchFloor(level) }), null); }
});

test('II to III needs a fully opened leaf, right height, aperture and complete body crossing', () => {
  const seed = { ...fresh(), x: -17.5, z: -12, feet: 8.4, yaw: -Math.PI / 2 };
  let s = wait({ ...seed,yaw:Math.PI/2 }, 1); for (let i = 0; i < 40; i++) s = step(s, { dt: .1, forward: -1 });
  assert.ok(s.x > -18); assert.equal(s.phase, 'wrong-return');
  s = step(seed, { interact: true }); s = step(s, { dt: .25, forward: 1 }); assert.equal(s.phase, 'wrong-return'); assert.ok(s.x >= -17.67);
  s = wait(s, .5); const events = []; for (let i = 0; i < 80 && s.phase === 'wrong-return'; i++) { const r = stepSourceContinuation(s, { dt: 1 / 60, forward: 1 }); s = r.state; events.push(...r.events); }
  assert.equal(s.phase, 'catch'); assert.ok(s.x < -18 - C.bodyRadius); assert.equal(s.reveal, null);
  assert.equal(events.filter(e => e.type === 'phase').length, 1); assert.equal(events.find(e => e.type === 'phase').doorId, 'wrong-onward');
  const low = step({ ...seed, feet: 0, x: -10 }, { dt: .25, forward: 1 }); assert.equal(low.phase, 'wrong-return');
});

test('each of six distinct release choices reaches actual next supporting geometry without air steering or teleportation', () => {
  for (let level = 0; level < 3; level++) for (const lip of continuationDropLips({ level })) {
    const seed = catchAt(level, lip), begin = stepSourceContinuation(seed, { interact: true }); assert.equal(begin.event.type, 'drop');
    const { state, events } = finishFall(begin.state); assert.equal(state.level, level + 1); near(state.feet, continuationCatchFloor(level + 1));
    assert.equal(state.recovery, null); assert.ok(events.some(e => e.type === 'land')); assert.ok(!events.some(e => e.repaired));
    assert.ok(continuationSupportAt(state.x, state.z, state)); assert.ok(Math.hypot(state.x - seed.x, state.z - seed.z) < 2);
  }
});

test('initial exploration and waiting do not awaken a machine before the first chosen descent', () => {
  const refuge = continuationRefugeAt({ phase: 'catch', level: 0 }); let s = catchAt(0, refuge); s = wait(s, 60, .1);
  assert.equal(s.counterweight.active, false); assert.equal(s.recovery, null);
  const r = stepSourceContinuation(catchAt(0), { interact: true }); const warning = r.events.find(e => e.type === 'counterweight-warning');
  assert.equal(warning.reason, 'first-voluntary-descent'); assert.equal(r.state.counterweight.mode, 'warning'); assert.equal(r.state.counterweight.elapsed, 0);
  const partial = wait(r.state, C.catch.counterweightWarningSeconds - .1, .1); assert.equal(partial.counterweight.mode, 'warning');
  assert.equal(wait(partial, .2).counterweight.mode, 'walking');
});

test('carried first-person look remains responsive during a physical fall and never steers its body', () => {
  let a = step(catchAt(0), { interact: true }), b = structuredClone(a);
  for (let i = 0; i < 180 && a.fall; i++) { a = step(a, { dt: 1 / 60, side: 1, forward: 1, look: { yaw: .5, pitch: -.7 } }); b = step(b, { dt: 1 / 60 }); near(a.x, b.x); near(a.z, b.z); near(a.feet, b.feet); const f = sourceContinuationFrame(a); near(f.camera.pitch, -.7); near(f.camera.yaw, .5); }
  assert.equal(a.fall, null); assert.equal(a.accumulator, 0);
});

test('save/reload midfall and time partition preserve trajectory, knowledge and announced machine state', () => {
  let state = step(catchAt(0), { interact: true }); state = wait(state, .45, .05);
  const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(state)), { runId: 'test-run' }); assert.deepEqual(reload, state);
  let a = state, b = reload; for (let i = 0; i < 12; i++) a = step(a, { dt: .1 }); for (let i = 0; i < 24; i++) b = step(b, { dt: .05 });
  near(a.x, b.x); near(a.z, b.z); near(a.feet, b.feet); near(a.elapsed, b.elapsed); assert.deepEqual(a.counterweight, b.counterweight);
});

test('physical sling sweeps around the real spindle and over closed return frames from40 representative poses', () => {
  for (const stage of STAGES) for (const q of [.15, .35, .55, .75, .9]) for (const r of [stage.innerRadius + 1, stage.outerRadius - 1]) {
    const theta = stage.startAngle + (stage.endAngle - stage.startAngle) * q, original = catchAt(stage.level, continuationRadialPoint(r, theta)), plan = sourceContinuationRecoveryPlan(original);
    assert.equal(plan.repaired, false, `normal capture on${stage.id} needs no safe-position warp`); assert.ok(plan.duration <= C.recoveryMaximumSeconds);
    for (let i = 1; i < plan.path.length; i++) { const a = plan.path[i - 1], b = plan.path[i], count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z, a.feet - b.feet) / .07));
      for (let j = 0; j <= count; j++) { const t = j / count; assert.ok(continuationBodyClearAt({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t }, { height: C.bodyHeight }), 'entire body, not merely its eye, clears the world'); }
    }
  }
});

test('a real drum contact carries once, continues the mechanism and returns ordinary control to a safe refuge', () => {
  let state = catchAt(0); state.knowledge = ['remembered-door']; Object.assign(state.counterweight, { active: true, mode: 'warning', x: state.x + .95, z: state.z, y: state.feet });
  let result = stepSourceContinuation(state, { dt: C.fixedStep }); state = result.state; assert.equal(result.events.filter(e => e.type === 'capture').length, 1);
  assert.ok(state.recovery); assert.equal(state.recovery.repaired, false); const target = state.recovery.target, before = { ...state.counterweight }; let captures = 1, machineTravel = 0;
  for (let i = 0; i < 400; i++) { result = stepSourceContinuation(state, { dt: .05, ...(state.recovery ? { forward: 1, interact: true } : {}) }); const oldWeight = state.counterweight; state = result.state; machineTravel += Math.hypot(state.counterweight.x - oldWeight.x, state.counterweight.z - oldWeight.z, state.counterweight.y - oldWeight.y); captures += result.events.filter(e => e.type === 'capture').length; }
  assert.equal(captures, 1); assert.equal(state.recovery, null); assert.ok(state.knowledge.includes('remembered-door')); near(state.x, target.x); near(state.z, target.z);
  assert.ok(machineTravel > 1, 'the machine continues along its physical path during recovery');
  assert.ok(continuationSupportAt(target.x, target.z, { feet: target.feet }));
});

test('a saved physical recovery preserves timing and pause freezes it without accepting queued walk intent', () => {
  const original = catchAt(1, continuationRadialPoint(8, .8)), plan = sourceContinuationRecoveryPlan(original); let s = step({ ...original, recovery: plan }, { dt: .05, side: 1 });
  const reload = normalizeSourceContinuation(JSON.parse(JSON.stringify(s))); assert.deepEqual(reload, s);
  for (const gate of [{ paused: true }, { renderReady: false }]) assert.deepEqual(step(s, { ...gate, dt: .25, interact: true, side: 1 }), s);
  for (let i = 0; i < 300 && s.recovery; i++) s = step(s, { dt: .05, side: 1, interact: true });
  assert.equal(s.recovery, null); near(s.x, plan.target.x); near(s.z, plan.target.z); assert.equal(s.grace, C.graceSeconds); assert.equal(s.accumulator, 0);
});

test('waiting in the refuge observes continuous machinery through every stage and at least two physical return cycles', () => {
  let state = catchAt(0, continuationRefugeAt({ phase: 'catch', level: 0 })); state.counterweight.active = true;
  const modes = new Set(), levels = new Set();
  for (let i = 0; i < 300 * 30; i++) { const old = { ...state.counterweight }; state = step(state, { dt: 1 / 30 }); const w = state.counterweight; modes.add(w.mode); levels.add(w.level);
    assert.ok(Math.hypot(w.x - old.x, w.y - old.y, w.z - old.z) < .41, 'no machine reposition or rubber band'); assert.equal(state.recovery, null);
    if (['warning', 'walking'].includes(w.mode)) assert.ok(continuationSupportAt(w.x, w.z, { feet: w.y }));
  }
  assert.ok(state.counterweight.cycle >= 2); assert.equal(levels.size, 4);
  for (const mode of ['warning', 'walking', 'falling', 'returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering']) assert.ok(modes.has(mode), mode);
  for (let level = 0; level < 4; level++) { const at = { ...state, level, ...continuationRefugeAt({ phase: 'catch', level }) }; assert.equal(sourceContinuationThreatTelemetry(at).refuge, true); assert.equal(sourceContinuationThreatTelemetry(at).timeToContact, null); }
});

test('initial II time alone never starts pressure; the understood upper return primes an announced local change', () => {
  const idle = wait(fresh(), 120, .1); assert.equal(idle.closure.mode, 'dormant');
  let state = { ...fresh(), x: 6, z: 3, feet: 8.4, yaw: 0 }; state = wait(state, 20, .1); assert.equal(state.closure.mode, 'dormant', 'looking away cannot witness the altered return');
  state = {...state,yaw:Math.PI};let r,recognized=[];for(let i=0;i<8;i++){r=stepSourceContinuation(state,{dt:.1});state=r.state;recognized.push(...r.events);}
  assert.equal(state.doorOpen['wrong-false-return'],true);
  assert.equal(state.closure.mode, 'primed'); assert.equal(recognized.filter(e => e.type === 'return-recognized').length,1);
  state = wait(state, 30, .1); assert.equal(state.closure.mode, 'primed', 'the safe first observation may linger');
  state = wait({ ...state, x: 6, z: -12 }, 11.9, .1); assert.equal(state.closure.mode, 'primed');
  state = wait(state, .2); assert.equal(state.closure.mode, 'warning');
  state = wait(state, C.wrongReturn.warningSeconds - .2, .1); assert.equal(state.closure.mode, 'warning');
  state = wait(state, .3); assert.equal(state.closure.mode, 'closing');
  const refuge = { ...state, ...C.wrongReturn.refuge }; assert.equal(wait(refuge, 60, .1).recovery, null);
  const low = { ...state, x: state.closure.frontX, z: -12, feet: 0 }; assert.equal(step(low, { dt: .25 }).recovery, null, 'the high front cannot touch the floor beneath it');
});

test('leaf motion uses saved simulation time and reverses continuously before the threshold becomes passable', () => {
  let s = { ...fresh(), x: -16.5, z: -12, feet: 8.4, yaw: -Math.PI / 2 }; assert.equal(continuationFocus(s)?.id, 'wrong-onward'); s = step(s, { interact: true });
  assert.equal(sourceContinuationDoorFraction(s, 'wrong-onward'), 0); s = step(s, { dt: .15 }); const part = sourceContinuationDoorFraction(s, 'wrong-onward'); near(part, .15 / C.doorSwingSeconds);
  assert.equal(sourceContinuationCanOccupy(-18, -12, s), false); assert.deepEqual(normalizeSourceContinuation(JSON.parse(JSON.stringify(s))), s);
  s = step(s, { interact: true }); near(sourceContinuationDoorFraction(s, 'wrong-onward'), part); near(s.doorMotion['wrong-onward'].duration, C.doorSwingSeconds * part);
  s = step(s, { dt: .05 }); near(sourceContinuationDoorFraction(s, 'wrong-onward'), part - .05 / C.doorSwingSeconds);
});

test('final opening alone cannot finish; actual body clearance produces one preserved exit receipt', () => {
  const result = crossFinal(catchAt(3, C.catch.finalApproach)); assert.equal(result.event.type, 'complete'); assert.equal(result.state.completed, true); assert.equal(result.state.status, 'completed');
  assert.ok(result.state.x > C.catch.finalDoor.x + C.bodyRadius); assert.equal(stepSourceContinuation(result.state, { dt: .2, interact: true }).event, null);
  const reverse = resumeSourceContinuation({ ...result.state, handoff: true, exitReceipt: { ...result.state.exitReceipt, delivered: true } }, { reverse: true });
  assert.equal(reverse.level, 3); near(reverse.feet, -12.6); assert.equal(reverse.exitReceipt.delivered, true); assert.equal(reverse.completed, true);
  let again = { state: reverse }; for (let i = 0; i < 100 && again.state.status === 'active'; i++) again = stepSourceContinuation(again.state, { dt: 1 / 60, forward: 1 });
  assert.equal(again.event.firstCompletion, false); assert.equal(again.event.receipt, result.event.receipt);
});

test('legacy v1 saves preserve earned phase, monotonic descent, return pose and completed transaction receipts', () => {
  const levels = []; for (let level = 0; level <= 5; level++) { const old = { ...fresh(), layoutVersion: undefined, phase: 'catch', level, x: -23, z: 0, feet: 3 - level * 3.6, knowledge: ['kept-take'], completed: false }, s = normalizeSourceContinuation(old); levels.push(s.level); assert.ok(continuationSupportAt(s.x, s.z, s)); assert.equal(s.phase, 'catch'); assert.deepEqual(s.returnPose, returnPose); assert.ok(s.knowledge.includes('kept-take')); assert.equal(s.reveal, null); }
  assert.deepEqual(levels, [0, 1, 1, 2, 2, 3]);
  const done = normalizeSourceContinuation({ ...fresh(), layoutVersion: undefined, phase: 'catch', level: 5, completed: true, status: 'completed', exitReceipt: { id: 'old', delivered: false } });
  assert.equal(done.level, 3); near(done.feet, -12.6); assert.equal(done.exitReceipt.id, 'test-run:source-continuation-exit'); assert.equal(done.exitReceipt.delivered, false);
});

test('malformed saves return to real safe support and cannot invent a finite world pose or exit', () => {
  const s = normalizeSourceContinuation({ ...fresh(), x: NaN, z: 200, feet: Infinity }); assert.ok(continuationSupportAt(s.x, s.z, s));
  const bad = normalizeSourceContinuation({ ...catchAt(2), x: -38, z: -12, lastSafe: { ...continuationRefugeAt({ phase: 'catch', level: 2 }) } }); assert.ok(sourceContinuationCanOccupy(bad.x, bad.z, bad));
  assert.equal(normalizeSourceContinuation({ ...fresh(), exitPose: { x: 1, y: Infinity } }).exitPose, null);
  const fall = step(catchAt(0), { interact: true }); assert.deepEqual(normalizeSourceContinuation(fall).fall, fall.fall);
});

test('stationary threat telemetry expires grace without steering or changing the live mechanism', () => {
  const s = catchAt(0); s.grace = .2; Object.assign(s.counterweight, { active: true, mode: 'warning', x: s.x + .95, z: s.z, y: s.feet });
  const before = JSON.stringify(s); assert.equal(sourceContinuationThreatTelemetry(s, { horizonSeconds: 0 }).timeToContact, null);
  const reach = sourceContinuationThreatTelemetry(s, { horizonSeconds: 1 }); assert.equal(reach.counterfactual, true); assert.match(reach.assumption, /remains.*grace/); assert.ok(reach.timeToContact >= .19 && reach.timeToContact < .25); assert.equal(JSON.stringify(s), before);
});

test('the shared entry leaves retain their actual physical transforms across Earthfall at every opening fraction', async () => {
  const {sourceEarthfallRenderFrame} = await import('../src/render/source-earthfall-renderer.js');
  const {sourceContinuationRenderFrame} = await import('../src/render/source-continuation-renderer.js');
  const {freshSourceEarthfall} = await import('../src/game/source-earthfall.js');
  const {sourceContinuationEntranceOffset} = await import('../src/game/source-continuation-entry.js');
  const offset = sourceContinuationEntranceOffset(), points = [[.2,.2,0],[.75,1,.035],[1.2,2.5,-.035]];
  const transform = (m,p) => [0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
  for (const fraction of [0,.25,.6,1]) {
    const fall = {...freshSourceEarthfall(),committed:true,phase:'landed',feet:0,elapsed:15,clock:15,exitDoor:{open:true,progress:fraction}};
    const earth = sourceEarthfallRenderFrame(fall).props.filter(p=>p.id.includes('door-exit-leaf'));
    const world = sourceContinuationRenderFrame({...fresh(),elapsed:fraction*C.doorSwingSeconds,doorOpen:{'wrong-entry-return':true},doorMotion:{'wrong-entry-return':{from:0,to:1,startedAt:0,duration:C.doorSwingSeconds}}}).props.filter(p=>p.id.includes('door-wrong-entry-return-leaf'));
    assert.equal(earth.length,2);assert.equal(world.length,2);
    for (const leaf of world) assert.ok(earth.some(candidate=>points.every(point=>transform(leaf.matrix,point).every((v,k)=>Math.abs(v-[offset.x,offset.y,offset.z][k]-transform(candidate.matrix,point)[k])<2e-5))),`shared leaf basis changed at fraction${fraction}`);
  }
});

test('the physically shared entry uses an explicit return normal after keeping the same hinge basis',()=>{
  let s={...fresh(),x:0,z:3,feet:0,yaw:Math.PI};const opened=stepSourceContinuation(s,{interact:true});assert.equal(opened.event.type,'door');assert.equal(opened.state.status,'active');s=opened.state;
  for(let i=0;i<120&&s.status==='active';i++)s=step(s,{dt:1/60,forward:1});assert.equal(s.status,'returned');assert.ok(s.z>3.5+C.bodyRadius);assert.deepEqual(s.returnPose,returnPose);
});

test('looking back retains the exact finite former lower spine and landing while the existing door remains the journey boundary',async()=>{
  const {SOURCE_EARTHFALL:E}=await import('../src/data/source-earthfall.js');
  const {CONTINUATION_EARTHFALL_BACKSIDE:backside,continuationDoors}=await import('../src/data/source-continuation.js');
  const {sourceContinuationRenderFrame,sourceContinuationGeometry,sourceContinuationMeshPayload}=await import('../src/render/source-continuation-renderer.js');
  const door=continuationDoors().find(d=>d.id==='wrong-entry-return'),offset=door.z-E.passage.exitZ;
  const [spine,head]=backside;
  assert.deepEqual([spine.minX,spine.maxX,spine.minZ,spine.maxZ,spine.y,spine.thickness],[-E.passage.halfWidth,E.passage.halfWidth,5,E.catch.minZ+.5+offset,0,.55]);
  assert.deepEqual([head.minX,head.maxX,head.minZ,head.maxZ,head.y,head.thickness],[E.catch.minX,E.catch.maxX,E.catch.minZ+offset,E.catch.maxZ+offset,0,E.catch.thickness]);
  assert.equal(head.material,'earthfall-backing');assert.equal(spine.role,'inherited-earthfall');assert.equal(head.role,'inherited-earthfall');
  const frame=sourceContinuationRenderFrame(fresh()),pieces=new Map(sourceContinuationGeometry(fresh()).map(p=>[p.name,p]));
  for(const floor of backside){const prop=frame.props.find(p=>p.descriptorId===floor.id);assert.ok(prop,'former route is actually submitted');const payload=sourceContinuationMeshPayload(pieces.get(prop.mesh));let top=-Infinity;for(let i=0;i<payload.positions.length;i+=3){const p=payload.positions,m=prop.matrix;top=Math.max(top,m[1]*p[i]+m[5]*p[i+1]+m[9]*p[i+2]+m[13]);}near(top,0);}
  assert.ok(continuationSupportAt(0,20,{feet:0}));assert.ok(continuationSupportAt(5,(head.minZ+head.maxZ)/2,{feet:0}));assert.equal(continuationSupportAt(0,head.maxZ+.01,{feet:0}),null,'the old landing remains finite');
  let s={...fresh(),x:0,z:3,feet:0,yaw:Math.PI,doorOpen:{'wrong-entry-return':true}};const events=[];
  for(let i=0;i<100&&s.status==='active';i++){const result=stepSourceContinuation(s,{dt:1/60,forward:1});s=result.state;events.push(...result.events);}
  assert.equal(s.status,'returned');assert.equal(events.filter(e=>e.type==='return').length,1);assert.ok(s.z<spine.minZ,'physical return crosses before the player can explore the former owner');
  assert.deepEqual(step(s,{dt:.25,forward:1}),s,'the retained lookback floor creates no second local progression route');
});
