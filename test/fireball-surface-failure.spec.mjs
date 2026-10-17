import assert from 'node:assert/strict';
import { createPersonalizedWindowEffects, FIREBALL_SURFACE_LABELS } from '../src/platform/personalized-window-effects.js';
import { createFireballExchange,FIREBALL_OUTSIDE_SECONDS,FIREBALL_OFFERS,FIREBALL_REBOUND_SECONDS } from '../src/game/fireball-exchange.js';
import { compileFireballCastPlan } from '../src/game/window-channel.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const STAGE = Object.freeze({ x: .06, y: .34, w: .88, h: .3 });

function harness({ failing = [], reject = true, listen = false, step = async(payload)=>payload.casts.length } = {}) {
  const surfaces = new Map();
  const calls = [];
  const dispatched = [];
  const stepPayloads = [], emitted = [];
  const createdOptions = new Map();
  let constructed = 0;
  let onHit = null;
  let onMiss = null;
  let onAcquire = null;
  class Surface {
    static async getByLabel(label) {
      if (failing.includes(label)) {
        if (reject) throw new Error(`${label} denied`);
        return null;
      }
      return surfaces.get(label) || null;
    }
    constructor(label,options) {
      constructed += 1;
      createdOptions.set(label,options);
      if (surfaces.has(label)) throw new Error(`a window with label ${label} already exists`);
      this.label = label;
      if (!failing.includes(label)) surfaces.set(label, this);
    }
    once(_event, cb) { cb(); }
    async hide() { calls.push(['hide', this.label]); }
    async close() { surfaces.delete(this.label); }
  }
  const failures = [];
  const effects = createPersonalizedWindowEffects({
    runtimeApi: {
      WebviewWindow: Surface,
      invoke: async (command, payload) => {
        calls.push([command, command === 'chunk_fireball_cast_step'
          ? payload.casts.map((cast) => `${cast.index}@${cast.progress.toFixed(2)}`).join(',')
          : payload?.label]);
        if(command === 'chunk_fireball_cast_step'){
          stepPayloads.push(structuredClone(payload));
          return step(payload);
        }
        return true;
      },
      emitTo: async (label, event, payload) => {
        calls.push(['emitTo', `${label}:${payload.state}`]);
        emitted.push({label,event,payload:structuredClone(payload)});
        return true;
      },
      listen: async (name, cb) => { if (listen && name === 'fireball-cast-hit') onHit = cb;if(listen&&name==='fireball-cast-miss')onMiss=cb;if(listen&&name==='fireball-cast-acquire')onAcquire=cb;return () => {}; },
    },
    onSurfaceReport: (report) => { if (report.state !== 'ready') failures.push(report); },
    documentApi: listen ? { defaultView: { CustomEvent, dispatchEvent: (event) => dispatched.push(event) } } : null,
  });
  return { effects, surfaces, calls, failures, dispatched, stepPayloads, emitted, createdOptions, hit: () => onHit, miss:()=>onMiss, acquire:()=>onAcquire, constructed: () => constructed };
}

const plan = (rayCount, extra = {}) => ({
  schema: 2, kind: 'fireball-cast', castId: 'fireball:hall:seated:0:abcdef', battleId: 'hall',
  state: 'outbound', rayCount, reducedMotion: false, travelSeconds: 2.2, damage: null, stage: STAGE,
  rays: Array.from({ length: rayCount }, (_, index) => ({
    id: `ray-${index + 1}`, surfaceIndex: index, directionSign: 1,
    origin: { x: .5, y: .28 }, direction: { x: 1, y: 0 }, exit: { x: 1, y: .5 }, beyond: { x: 1.42, y: .5 },
  })),
  ...extra,
});
const outside = (rayCount, progress = 0, state = 'outbound') => Array.from({ length: rayCount }, (_, index) => ({
  index, rayId: `ray-${index + 1}`, state, progress, damage: null,
}));

{
  const {effects,acquire,calls,dispatched,emitted}=harness({listen:true});
  const token=effects.begin();await effects.prepareFireballs();const active=plan(2);
  effects.beginFireballCast(active,{token});effects.syncFireballCast(active,outside(2,.2),{token});await settle();
  const castId=emitted[0].payload.castId;dispatched.length=0;calls.length=0;
  acquire()({payload:{castId,surfaceIndex:1,offer:1}});
  assert.deepEqual(dispatched.map(event=>({type:event.type,detail:event.detail})),[
    {type:'chunk-surfer:fireball-acquire',detail:{castId:active.castId,rayId:'ray-2',offer:1}},
  ],'hover earns its exact ray opportunity without dispatching a catch');
  assert.equal(calls.length,0,'hover never activates or steals native focus');
  for(const payload of [{castId:'old',surfaceIndex:1,offer:1},{castId,surfaceIndex:1.5,offer:1},{castId,surfaceIndex:99,offer:1},{castId,surfaceIndex:1,offer:0},{castId,surfaceIndex:1,offer:3},{castId,surfaceIndex:1,offer:'1'}]){
    dispatched.length=0;acquire()({payload});assert.equal(dispatched.length,0,'stale or malformed acquisition cannot select a ray');
  }
  await effects.emergencyRestore({notify:false});
}

{
  const {effects,createdOptions}=harness();
  effects.begin();await effects.prepareFireballs();
  assert.equal(createdOptions.size,4);
  for(const options of createdOptions.values()){
    assert.equal(options.acceptFirstMouse,true,'macOS delivers the first actual pointer click without a focus-only strike');
    assert.equal(options.focus,false,'creating a target does not request keyboard focus');
    assert.equal(options.focusable,true);
    assert.equal(options.transparent,true,'near-miss padding remains game-owned without covering the desktop');
    assert.equal(options.width,240);
  }
  await effects.emergencyRestore({notify:false});
}

{
  const {effects,miss,calls,dispatched,emitted,stepPayloads}=harness({listen:true});
  const token=effects.begin();await effects.prepareFireballs();
  const active=plan(2);effects.beginFireballCast(active,{token});
  effects.syncFireballCast(active,outside(2,.72),{token,choreography:{pressure:.4,gesture:'seat-align',reach:.6,dodge:0,formationProgress:1}});
  await settle();
  const drawn=emitted.find(entry=>entry.label===FIREBALL_SURFACE_LABELS[0]);
  assert.ok(drawn);
  assert.equal(drawn.payload.motion.seed,stepPayloads[0].casts[0].seed,'carrier and visible tile share the cast seed');
  dispatched.length=0;
  miss()({payload:{castId:drawn.payload.castId,surfaceIndex:0}});await settle();
  assert.equal(calls.filter(([name])=>name==='chunk_fireball_cast_focus_main').length,1,'a padding miss returns keyboard focus');
  assert.deepEqual(dispatched.map(event=>event.type),['chunk-surfer:fireball-miss'],'padding never dispatches a catch');
  assert.equal(dispatched[0].detail.rayId,'ray-1');
  for(const surfaceIndex of [1.5,null,undefined,'1','unknown',NaN,99]){
    dispatched.length=0;calls.length=0;
    miss()({payload:{castId:drawn.payload.castId,surfaceIndex}});await settle();
    assert.equal(dispatched.length,0,`malformed or unknown miss index ${String(surfaceIndex)} cannot select a ray`);
    assert.equal(calls.filter(([name])=>name==='chunk_fireball_cast_focus_main').length,1,
      'invalid padding identity still returns the keyboard');
  }
  await effects.emergencyRestore({notify:false});
}

// ── A SURFACE THAT CANNOT BE BUILT MUST NOT TAKE THE WHOLE FEATURE WITH IT ──
//
// Every step of the native prewarm can reject on a desktop build: a denied ACL
// call, a page the bundle does not contain, a create that never answers. All of
// them were unguarded inside a Promise.all whose rejection was swallowed at the
// only call site, so one failure left the session at prewarmState:'pending' for
// the rest of the battle. Nothing external appeared again, the in-canvas comets
// carried on unchanged, and nothing anywhere said why.
{
  const { effects, failures } = harness({ failing: ['fireball-cast-3'] });
  effects.begin({ intensity: 'hostile' });
  const resolved = await effects.prepareFireballs().catch((error) => `REJECTED:${error.message}`);
  assert.equal(resolved, true, 'prewarm must never reject');
  assert.equal(effects.debug().prewarmState, 'partial');
  assert.equal(effects.debug().readySurfaces, 3);
  assert.equal(failures.length, 1, 'the failure is reported exactly once');
  assert.match(failures[0].reasons.join(' '), /fireball-cast-3/, 'and it names the surface that failed');
  await effects.emergencyRestore({ notify: false });
}

{
  // Every surface failing is still a settled, described outcome, and combat is
  // never blocked by it.
  const { effects, failures } = harness({ failing: [...FIREBALL_SURFACE_LABELS] });
  const token = effects.begin({ intensity: 'hostile' });
  assert.equal(await effects.prepareFireballs(), false);
  assert.equal(effects.debug().prewarmState, 'unavailable');
  assert.equal(failures.at(-1).ready, 0);
  assert.equal(effects.beginFireballCast(plan(1), { token }), true);
  await effects.emergencyRestore({ notify: false });
}

// ── THE RAY IS MEASURED IN THE STAGE BAND, NOT THE WINDOW ──────────────────
//
// The native side read it as a fraction of the whole window, so every rightward
// cast aimed far off the side of the screen and clamped flat against the
// monitor edge — the same wrong place every time.
{
  const { effects, calls } = harness();
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  calls.length = 0;

  effects.beginFireballCast(plan(1),{token});
  effects.syncFireballCast(plan(1), outside(1, .5), { token });
  await settle();
  const step = calls.find(([command]) => command === 'chunk_fireball_cast_step');
  assert.ok(step, 'a comet outside the frame is placed');
  assert.equal(effects.ownsPointerTransfer(),true,'a visible game-owned target owns the transient focus handoff');
  effects.suspendSurfaces();
  assert.equal(effects.ownsPointerTransfer(),false,'pause hiding the targets ends that focus handoff');
  await effects.emergencyRestore({ notify: false });
}

{
  const rays = [];
  const surfaces = new Map();
  class Surface {
    static async getByLabel(label) { return surfaces.get(label) || null; }
    constructor(label) { this.label = label; surfaces.set(label, this); }
    once(_event, cb) { cb(); }
    async hide() {}
    async close() { surfaces.delete(this.label); }
  }
  const effects = createPersonalizedWindowEffects({
    runtimeApi: {
      WebviewWindow: Surface,
      invoke: async (command, payload) => { if (command === 'chunk_fireball_cast_step') rays.push(...payload.casts.map((cast) => cast.ray)); return 1; },
      emitTo: async () => true, listen: async () => () => {},
    },
    documentApi: null,
  });
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  effects.syncFireballCast(plan(1), outside(1, 0), { token });
  await settle();

  assert.equal(rays.length, 1);
  assert.ok(Math.abs(rays[0].exit.x - (STAGE.x + STAGE.w)) < 1e-9,
    'the exit is remapped into window space, not passed through raw');
  assert.ok(Math.abs(rays[0].exit.y - (STAGE.y + .5 * STAGE.h)) < 1e-9);
  assert.ok(Math.abs(rays[0].direction.x - STAGE.w) < 1e-9,
    'and so is the direction — an angle belongs to the rectangle it was measured in');
  assert.equal(rays[0].beyond, undefined, 'the fixed overshoot is no longer what places the surface');
  await effects.emergencyRestore({ notify: false });
}

// ── A STRUCK SURFACE IS A STRUCK FIREBALL, AND THE KEYBOARD GOES HOME ──────
//
// The surfaces were click-through, so the one thing a fireball exists for —
// clicking it — stopped working the moment it left the frame, and the click
// fell through to whatever was behind the window. Usually the desktop.
{
  const { effects, dispatched, calls, hit } = harness({ listen: true });
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  const onHit = hit();
  assert.ok(onHit, 'the main window listens for a struck surface');

  const live = plan(2);
  effects.beginFireballCast(live, { token });
  const opaque = (value) => {
    let hash = 0x811c9dc5;
    for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return `cast-${hash.toString(16).padStart(8, '0')}`;
  };

  onHit({ payload: { castId: opaque(live.castId), surfaceIndex: 1 } });
  await settle();
  const hits = dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.castId, live.castId, 'the real cast id never leaves this module');
  assert.equal(hits[0].detail.rayId, 'ray-2', 'and the surface that was clicked names its own ray');
  assert.ok(calls.some(([command]) => command === 'chunk_fireball_cast_focus_main'));

  for(const surfaceIndex of [1.5,null,undefined,'1','unknown',NaN,99]){
    dispatched.length=0;calls.length=0;
    onHit({payload:{castId:opaque(live.castId),surfaceIndex}});
    await settle();
    assert.equal(dispatched.filter(event=>event.type==='chunk-surfer:fireball-hit').length,0,
      `malformed or unknown hit index ${String(surfaceIndex)} cannot select a ray`);
    assert.equal(calls.filter(([command])=>command==='chunk_fireball_cast_focus_main').length,1,
      'invalid hit identity still returns the keyboard');
  }

  dispatched.length = 0;
  onHit({ payload: { castId: opaque(live.castId), surfaceIndex: 2 } });
  await settle();
  assert.equal(dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit').length, 0,
    'a fixed surface outside this cast cannot alias the last live ray');

  // A click that caught nothing still hands the keyboard back.
  dispatched.length = 0; calls.length = 0;
  onHit({ payload: { castId: '', surfaceIndex: -1 } });
  await settle();
  assert.equal(dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit').length, 0);
  assert.ok(calls.some(([command]) => command === 'chunk_fireball_cast_focus_main'),
    'a missed click is exactly when the player next reaches for a key');

  // And a cast id that is not the live one reaches nothing.
  dispatched.length = 0;
  onHit({ payload: { castId: 'cast-deadbeef', surfaceIndex: 0 } });
  await settle();
  assert.equal(dispatched.filter((event) => event.type === 'chunk-surfer:fireball-hit').length, 0);
  await effects.emergencyRestore({ notify: false });
}

// ── ONE FLIGHT, IN TWO LEGS, ONE COMET AT A TIME ───────────────────────────
//
// It leaves the Surfer's hand, crosses the stage, crosses the bezel, comes back
// at the player, and lands. A surface exists only for the second half of that.
// Comets leave a beat apart and resolve one at a time, so "the cast's state" is
// not a thing any surface can be drawn from.
{
  const { effects, calls } = harness();
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();
  calls.length = 0;

  const live = compileFireballCastPlan({ battleId: 'hall', movementId: 'attention', movementIndex: 1, castSequence: 0, stage: STAGE });
  let landed = 0;
  const exchange = createFireballExchange({
    battleId: 'hall',
    beginCast: () => { effects.beginFireballCast(live, { token }); return live; },
    onSync: (frame) => effects.syncFireballCast(live, frame.rays, { token }),
    onImpact: ({ damage }) => { landed += damage; },
  });
  exchange.setMovement({ id: 'attention', index: 1 });

  let sawStage = false;
  const lifetime=2.2+FIREBALL_OUTSIDE_SECONDS*FIREBALL_OFFERS+FIREBALL_REBOUND_SECONDS+2;
  for (let tick = 0; tick < Math.ceil(lifetime/.05); tick += 1) {
    const frame = exchange.update(0.05, { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 1));
    const flying = frame.active?.rays.filter((ray) => ray.state === 'inflight') || [];
    if (flying.length && !frame.active.rays.some((ray) => ray.state !== 'waiting' && ray.state !== 'inflight')) {
      sawStage = true;
      assert.equal(calls.filter(([command]) => command === 'chunk_fireball_cast_step').length, 0,
        'nothing opens while every comet is still on the stage');
    }
  }
  assert.ok(sawStage, 'the stage crossing happened');
  const steps = calls.filter(([command]) => command === 'chunk_fireball_cast_step').map(([, at]) => at);
  assert.ok(steps.length >= 2, `the surface is stepped into its authored catch mark (${steps.length})`);
  assert.ok(new Set(steps.flatMap((step)=>String(step).split(',')).map((entry)=>entry.split('@')[1])).size>=2,
    'the approach moves before it commits');
  assert.ok(landed > 0, 'a comet nobody touched lands on the player');
  assert.ok(calls.some(([command]) => command === 'hide'), 'and then it is gone');
  await effects.emergencyRestore({ notify: false });
}

// ── A FIGHT KEEPS ITS SURFACES ─────────────────────────────────────────────
//
// Ending a battle closed all four windows and the next battle's prewarm rebuilt
// them under the same four labels — a race Tauri loses in both directions, so
// the pool came back broken and nothing reached a surface again for the rest of
// the process. From a chair that is "it stops working after the menu".
{
  const { effects, surfaces, constructed } = harness();
  for (let fight = 1; fight <= 3; fight += 1) {
    const token = effects.begin({ intensity: 'hostile' });
    await effects.prepareFireballs();
    assert.equal(effects.debug().prewarmState, 'ready', `fight ${fight} has its surfaces`);
    await effects.end(token);
    assert.equal(surfaces.size, 4, 'ending a fight puts them away rather than destroying them');
  }
  assert.equal(constructed(), 4, 'four windows, built once, for the life of the app');
  await effects.emergencyRestore({ notify: false });
  assert.equal(surfaces.size, 0, 'only turning the module off destroys them');
}

console.log('fireball surface tests passed');

// ── THE SHOAL ─────────────────────────────────────────────────────────────
//
// The native side is handed authored movement only: how hard to break, how far,
// and how tightly to hold formation. It never receives or samples the pointer.
{
  const { effects, calls } = harness();
  const token = effects.begin({ intensity: 'hostile' });
  await effects.prepareFireballs();

  const dance = { dodge: .8, reach: .9, cohesion: .9, settled: false, settleLeftMs: 0, pressure: .93 };
  calls.length = 0;
  effects.syncFireballCast(plan(2), outside(2, .4), { token, choreography: dance });
  await settle();
  const stepped = calls.find(([command]) => command === 'chunk_fireball_cast_step');
  assert.ok(stepped, 'a breaking shoal is stepped');

  // A settle still sends the authored formation at zero dodge. Otherwise the
  // panes snap back to their unformed positions on the first catch frame.
  const held = [];
  const spy = createPersonalizedWindowEffects({
    runtimeApi: {
      WebviewWindow: class {
        static async getByLabel(label) { return spySurfaces.get(label) || null; }
        constructor(label) { this.label = label; spySurfaces.set(label, this); }
        once(_event, cb) { cb(); }
        async hide() {}
        async close() { spySurfaces.delete(this.label); }
      },
      invoke: async (command, payload) => { if (command === 'chunk_fireball_cast_step') held.push(payload.choreography); return 1; },
      emitTo: async () => true, listen: async () => () => {},
    },
    documentApi: null,
  });
  const spySurfaces = new Map();
  const spyToken = spy.begin({ intensity: 'hostile' });
  await spy.prepareFireballs();

  spy.syncFireballCast(plan(2), outside(2, .4), { token: spyToken, choreography: { ...dance, dodge: 0, settled: true } });
  await settle();
  assert.equal(held.at(-1).dodge,0,'a settled shoal explicitly holds zero movement');

  spy.syncFireballCast(plan(2), outside(2, .5), { token: spyToken, choreography: dance });
  await settle();
  const sent = held.at(-1);
  assert.deepEqual(Object.keys(sent).sort(), ['cohesion', 'dodge', 'formationProgress', 'gesture', 'reach'],
    'and a breaking one sends only bounded geometry plus its authored formation');
  assert.ok(sent.dodge > 0 && sent.dodge <= 1);
  await spy.emergencyRestore({ notify: false });
  await effects.emergencyRestore({ notify: false });
}

console.log('fireball shoal tests passed');

function deferred(){
  let resolve;
  const promise=new Promise((done)=>{resolve=done;});
  return {promise,resolve};
}

const committed=(count=1)=>outside(count,.72).map((ray)=>({
  ...ray,catchReady:true,offer:1,dodge:0,formationProgress:1,
}));

// A commitment cue describes an acknowledged native pose, not merely a request.
{
  const placed=deferred();
  const {effects,emitted,stepPayloads}=harness({step:()=>placed.promise});
  const token=effects.begin();await effects.prepareFireballs();
  const live=plan(2);effects.beginFireballCast(live,{token});
  const rays=committed(2);
  rays[1]={...rays[1],progress:.18,catchReady:false,dodge:.31,formationProgress:.25};
  assert.equal(effects.syncFireballCast(live,rays,{token,choreography:{dodge:.9,formationProgress:1}}),false);
  await settle();
  assert.deepEqual(stepPayloads[0].casts.map(({dodge,formationProgress})=>({dodge,formationProgress})),[
    {dodge:0,formationProgress:1},{dodge:.31,formationProgress:.25},
  ],'each native target receives its own phase rather than the shared inspector phase');
  assert.equal(emitted.length,0,'drawing cues cannot precede placement acknowledgment');
  assert.equal(effects.ownsPointerTransfer(),false);
  placed.resolve(2);await settle();
  assert.equal(emitted.length,2);
  assert.equal(emitted[0].payload.catchReady,true);
  assert.equal(effects.syncFireballCast(live,rays,{token}),true,'successful placement is remembered');
  await effects.emergencyRestore({notify:false});
}

// Slow native work gets at most the current request and the newest waiting pose.
{
  const pending=[];
  const {effects,emitted,stepPayloads}=harness({step:()=>{const job=deferred();pending.push(job);return job.promise;}});
  const token=effects.begin();await effects.prepareFireballs();
  const live=plan(1);effects.beginFireballCast(live,{token});
  effects.syncFireballCast(live,outside(1,.1),{token});await settle();
  for(let index=0;index<100;index+=1){
    effects.syncFireballCast(live,[{...outside(1,.2+index*.001)[0],dodge:.2,formationProgress:.3}],{token});
  }
  effects.syncFireballCast(live,committed(),{token});await settle();
  assert.equal(stepPayloads.length,1,'later frames cannot create concurrent native steps');
  pending[0].resolve(1);await settle();
  assert.equal(emitted.length,0,'an obsolete arrival cannot overwrite the waiting commitment cue');
  assert.equal(stepPayloads.length,2,'one latest pose replaces all intermediate queued poses');
  assert.equal(stepPayloads[1].casts[0].progress,.72);
  assert.equal(stepPayloads[1].casts[0].formationProgress,1);
  pending[1].resolve(1);await settle();
  assert.equal(emitted.length,1);
  assert.equal(emitted[0].payload.catchReady,true);
  await effects.emergencyRestore({notify:false});
}

// Any partial placement preserves a whole-cast canvas fallback and no catch cue.
{
  const pending=[];
  const {effects,emitted,calls}=harness({step:()=>{const job=deferred();pending.push(job);return job.promise;}});
  const token=effects.begin();await effects.prepareFireballs();
  const live=plan(2);effects.beginFireballCast(live,{token});
  assert.equal(effects.syncFireballCast(live,committed(2),{token}),false);
  await settle();pending[0].resolve(1);await settle();
  assert.equal(emitted.length,0);
  assert.equal(effects.debug().placementFailures,1,'a nonzero partial result is still a failed volley');
  assert.equal(effects.ownsPointerTransfer(),false);
  assert.ok(calls.some(([command,label])=>command==='hide'&&label==='fireball-cast-1'));
  assert.ok(calls.some(([command,label])=>command==='hide'&&label==='fireball-cast-2'));
  assert.equal(effects.syncFireballCast(live,committed(2),{token}),false);
  await settle();pending[1].resolve(2);await settle();
  assert.equal(emitted.length,2,'a successful retry may finally publish the commitment');
  await effects.emergencyRestore({notify:false});
}

{
  const {effects,stepPayloads,emitted}=harness({failing:['fireball-cast-3']});
  const token=effects.begin();await effects.prepareFireballs();
  const live=plan(4);effects.beginFireballCast(live,{token});
  assert.equal(effects.syncFireballCast(live,committed(4),{token}),false);
  await settle();assert.equal(stepPayloads.length,0);assert.equal(emitted.length,0);
  await effects.emergencyRestore({notify:false});
}

// Replies from old sessions, old casts, and paused geometry cannot revive cues.
for(const boundary of ['session','cast','pause']){
  const pending=[];
  const {effects,emitted,stepPayloads}=harness({step:()=>{const job=deferred();pending.push(job);return job.promise;}});
  let token=effects.begin();await effects.prepareFireballs();
  const oldPlan=plan(1);effects.beginFireballCast(oldPlan,{token});
  effects.syncFireballCast(oldPlan,committed(),{token});await settle();
  let newPlan=oldPlan;
  if(boundary==='session'){
    await effects.end(token);token=effects.begin();await effects.prepareFireballs();
    newPlan=plan(1,{castId:'fireball:hall:seated:1:new-session'});
    effects.beginFireballCast(newPlan,{token});
  }else if(boundary==='cast'){
    newPlan=plan(1,{castId:'fireball:hall:seated:1:new-cast'});
    effects.beginFireballCast(newPlan,{token});
    assert.equal(effects.syncFireballCast(oldPlan,committed(),{token}),false,'old cast sync cannot replace the current cast');
  }else effects.suspendSurfaces();
  if(boundary!=='pause'){
    assert.equal(effects.syncFireballCast(newPlan,committed(),{token}),false);
    await settle();assert.equal(stepPayloads.length,1,'new sessions and casts also wait for the one native flight');
  }
  pending[0].resolve(1);await settle();
  assert.equal(emitted.length,0,`${boundary}: delayed placement cannot publish the retired cue`);
  assert.equal(effects.ownsPointerTransfer(),false);
  if(boundary==='pause')assert.equal(effects.syncFireballCast(newPlan,committed(),{token}),false);
  await settle();assert.equal(stepPayloads.length,2);
  pending[1].resolve(1);await settle();assert.equal(emitted.length,1);
  await effects.emergencyRestore({notify:false});
}

// A ray removed while the batch is pending must stay removed after the reply.
{
  const pending=[];
  const {effects,emitted,calls}=harness({step:()=>{const job=deferred();pending.push(job);return job.promise;}});
  const token=effects.begin();await effects.prepareFireballs();
  const live=plan(2);effects.beginFireballCast(live,{token});
  effects.syncFireballCast(live,committed(2),{token});await settle();
  effects.syncFireballCast(live,committed(2).slice(1),{token});
  pending[0].resolve(2);await settle();
  assert.ok(emitted.every(({label})=>label==='fireball-cast-2'));
  assert.ok(calls.some(([command,label])=>command==='hide'&&label==='fireball-cast-1'));
  pending[1].resolve(1);await settle();
  await effects.emergencyRestore({notify:false});
}

// Semantic transitions force placement even at an unchanged, recently held pose.
{
  const {effects,stepPayloads,emitted}=harness();
  const token=effects.begin();await effects.prepareFireballs();
  const live=plan(1);effects.beginFireballCast(live,{token});
  effects.syncFireballCast(live,committed(),{token});await settle();
  effects.syncFireballCast(live,[{...committed()[0],catchReady:false,offer:2}],{token});await settle();
  effects.syncFireballCast(live,[{...committed()[0],state:'deflected'}],{token});await settle();
  assert.equal(stepPayloads.length,3);
  assert.deepEqual(emitted.map(({payload})=>[payload.state,payload.catchReady,payload.offer]),[
    ['outbound',true,1],['outbound',false,2],['deflected',true,1],
  ]);
  await effects.emergencyRestore({notify:false});
}

console.log('fireball placement acknowledgment tests passed');
