import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceContinuationAudio, sourceContinuationPlacement, SOURCE_CONTINUATION_AUDIO as C } from '../src/audio/source-continuation.js';
import { SOURCE_CONTINUATION as LAYOUT } from '../src/data/source-continuation.js';

function graph({ panner = true } = {}) {
  const nodes = [], sources = [], buffers = [];
  const param = () => ({ value: 0, history: [], setValueAtTime(v, at) { this.value = v; this.history.push(['set', v, at]); },
    exponentialRampToValueAtTime(v, at) { this.value = v; this.history.push(['ramp', v, at]); },
    setTargetAtTime(v, at, seconds) { this.value = v; this.history.push(['target', v, at, seconds]); } });
  const node = (kind, extra = {}) => { const n = { kind, ...extra, connections: [], connect(to) { this.connections.push(to); return to; },
    disconnect() { this.connections = []; this.disconnected = true; } }; nodes.push(n); return n; };
  const source = kind => { const n = node(kind, { frequency: param(), starts: [], stops: [], start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } }); sources.push(n); return n; };
  const ctx = { state: 'running', currentTime: 10, sampleRate: 8000, createOscillator: () => source('tone'), createBufferSource: () => source('noise'),
    createGain: () => node('gain', { gain: param() }), createBiquadFilter: () => node('filter', { frequency: param(), Q: param() }),
    createBuffer(channels, length, rate) { const data = new Float32Array(length), b = { getChannelData: () => data, length, rate }; buffers.push(b); return b; } };
  if (panner) ctx.createStereoPanner = () => node('pan', { pan: param() });
  return { ctx, destination: node('destination'), nodes, sources, buffers };
}
const state = (extra = {}) => ({ phase: 'catch', x: -23, z: 0, feet: 3, yaw: 0, elapsed: 0,
  counterweight: { active: true, mode: 'walking', x: -18, z: -3, y: 3 }, ...extra });
const layer = (sound, kind) => sound.snapshot().layers.filter(v => v.kind === kind);
function frame(sound, s, dt = .1, focus = null) { return sound.update({ state: s, dt, focus, ready: true }); }
const hush = (extra = {}) => ({ id: 'source-continuation-hush', active: true, x: -20, z: -5, feet: 3, heading: 0, mode: 'follow', armed: true, fall: null, ...extra });

test('the continuation host forwards rest score ducking even across an audio pause',()=>{
  const sound=createSourceContinuationAudio();
  sound.setRestMusicActive(true);assert.equal(sound.snapshot().surroundings.restMusicActive,true);
  sound.pause();assert.equal(sound.snapshot().surroundings.restMusicActive,true);
  sound.setRestMusicActive(false);assert.equal(sound.snapshot().surroundings.restMusicActive,false);
  sound.dispose();
});

test('an attached seat stream ducks the score only after confirmed playback and releases it on pause or detach',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g});frame(sound,state());
  let playing=false;const calls=[],owner={update:value=>calls.push(value),snapshot:()=>({playing})};
  const detach=sound.attachRestMusic(owner);frame(sound,state());
  assert.equal(sound.snapshot().surroundings.restMusicActive,false,'buffering leaves the original music available');
  playing=true;frame(sound,state());assert.equal(sound.snapshot().surroundings.restMusicActive,true);
  sound.pause();sound.pause();assert.equal(sound.snapshot().surroundings.restMusicActive,false);
  assert.equal(calls.filter(c=>c.paused).length,1,'repeated lifecycle holds do not repeatedly pause the stream');
  playing=false;frame(sound,state());assert.equal(sound.snapshot().surroundings.restMusicActive,false);
  playing=true;frame(sound,state());assert.equal(sound.snapshot().surroundings.restMusicActive,true);
  assert.equal(sound.detachRestMusic({}),false);assert.equal(detach(),true);assert.equal(detach(),false);
  assert.equal(sound.snapshot().surroundings.restMusicActive,false);const count=calls.length;
  frame(sound,state());sound.dispose();assert.equal(calls.length,count,'the detached owner remains the caller’s responsibility');
});

test('a failing attached seat owner releases the original score instead of making silence',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g});frame(sound,state());
  let throws=false;const owner={update(){if(throws)throw Error('media failure');},snapshot:()=>({playing:true})};
  sound.attachRestMusic(owner);frame(sound,state());assert.equal(sound.snapshot().surroundings.restMusicActive,true);
  throws=true;frame(sound,state());assert.equal(sound.snapshot().surroundings.restMusicActive,false);sound.dispose();
});

test('the active Source II performance suppresses world sounds without restarting it, then restores Source III',()=>{
  const g=graph(),contacts=[],clears=[],calls=[];
  const sound=createSourceContinuationAudio({getAudio:()=>g,onFootContact:e=>contacts.push(e),clearFootContacts:owner=>clears.push(owner)});
  const catchState=state(),wrong=state({phase:'wrong-return',x:0,z:-3,feet:0,closure:{mode:'closing',frontZ:0},hush:hush()});
  frame(sound,catchState);sound.event({type:'drop'},catchState);
  const oldSources=g.sources.slice();assert.ok(oldSources.length);
  let active=true,playing=true,failed=null;
  const owner={update(value){calls.push({...value});if(value.active===false){active=false;playing=false;}},
    snapshot:()=>({active,playing,failed})};
  sound.attachRestMusic(owner);frame(sound,wrong);
  assert.equal(sound.snapshot().restMusicIsolated,true);
  assert.equal(sound.snapshot().mode,'rest-recording-only');
  assert.equal(sound.snapshot().sources,0,'existing mechanisms and effects are retired');
  assert.ok(oldSources.every(source=>source.stops.length),'already sounding world effects are stopped');
  assert.equal(sound.snapshot().surroundings.voices,0,'old score and bell tails are silent');
  assert.equal(sound.snapshot().materials.voices,0);
  assert.equal(sound.event({type:'closure-warning'},wrong),false);
  assert.equal(sound.event({type:'hush-warning'},wrong),false);
  assert.equal(sound.event({type:'door'},wrong),false);
  for(let i=0;i<25;i++)frame(sound,{...wrong,x:i*.1,elapsed:i*.1});
  assert.equal(sound.snapshot().sources,0);assert.equal(contacts.length,0,'walking cannot leak contact sounds');
  assert.ok(clears.length);assert.equal(active,true);assert.ok(!calls.some(call=>call.active===false));
  sound.event({type:'phase'},catchState);
  assert.equal(active,false,'crossing to Source III retires the test performance');
  frame(sound,catchState);assert.equal(sound.snapshot().restMusicIsolated,false);
  assert.equal(sound.snapshot().surroundings.restMusicActive,false);
  assert.ok(sound.snapshot().sources>0,'ordinary Source III machinery can sound again');sound.dispose();
});

test('a failed Source II performance restores ordinary sound, without trapping the scene in silence',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g});let failed=null;
  const owner={update(){},snapshot:()=>({active:true,playing:!failed,failed})};
  sound.attachRestMusic(owner);const wrong=state({phase:'wrong-return',closure:{mode:'closing',frontZ:0}});
  frame(sound,wrong);assert.equal(sound.snapshot().restMusicIsolated,true);assert.equal(sound.snapshot().sources,0);
  failed='recording unavailable';frame(sound,wrong);
  assert.equal(sound.snapshot().restMusicIsolated,false);assert.ok(sound.snapshot().sources>0);
  assert.equal(sound.event({type:'closure-warning'},wrong),true);sound.dispose();
});

test('phase-aware Source III keeps score continuous while walking but preserves HUSH and mechanism sounds until seated',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g}),calls=[];
  let restActive=false,finishAtEnd=true,endingCommitted=false,playing=true,ended=false,phase='catch';
  const owner={supportsPhase:p=>p==='wrong-return'||p==='catch',update:v=>calls.push(v),
    snapshot:()=>({phase,active:true,playing,ended,restActive,finishAtEnd,endingCommitted})};
  sound.attachRestMusic(owner);const s=state({hush:hush()});frame(sound,s);
  assert.equal(calls.at(-1).spatialState,s,'walking position reaches the score before the bench conversation');
  assert.equal(sound.snapshot().restMusicIsolated,false);assert.ok(sound.snapshot().sources>0);
  assert.equal(sound.snapshot().surroundings.restMusicActive,true,'only the old score is ducked');
  assert.equal(sound.event({type:'hush-warning'},s),true);assert.equal(sound.event({type:'counterweight-warning'},s),true);
  restActive=true;frame(sound,s);assert.equal(sound.snapshot().restMusicIsolated,true);assert.equal(sound.snapshot().sources,0);
  assert.equal(sound.event({type:'hush-warning'},s),false);
  restActive=false;frame(sound,s);assert.equal(sound.snapshot().restMusicIsolated,false);assert.ok(sound.snapshot().sources>0);
  frame(sound,s);assert.equal(sound.snapshot().restMusicIsolated,false,'single-pass transport policy is not consent to isolate the world');
  playing=false;ended=true;frame(sound,s);assert.equal(sound.snapshot().restMusicIsolated,false);assert.equal(sound.snapshot().surroundings.restMusicActive,false,'natural completion while walking is not an ending');
  endingCommitted=true;frame(sound,s);assert.equal(sound.snapshot().restMusicIsolated,true);assert.equal(sound.snapshot().surroundings.restMusicActive,true,'only a committed ending retains the ended score isolation');
  assert.ok(!calls.some(c=>c.active===false),'supported III never retires its own performance');sound.dispose();
});

test('a detached phase-aware ending owner remains playing and no longer receives world lifecycle holds',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g}),calls=[];
  const owner={supportsPhase:()=>true,update:v=>calls.push(v),snapshot:()=>({phase:'catch',active:true,playing:true,restActive:true,finishAtEnd:true})};
  const detach=sound.attachRestMusic(owner);frame(sound,state());assert.equal(sound.snapshot().restMusicIsolated,true);
  assert.equal(detach(),true);const count=calls.length;sound.pause();sound.dispose();
  assert.equal(calls.length,count);assert.equal(owner.snapshot().playing,true);assert.equal(owner.snapshot().phase,'catch');
});

test('unavailable and suspended contexts never queue cues to replay at readiness', () => {
  let pair = null; const sound = createSourceContinuationAudio({ getAudio: () => pair });
  sound.event({ type: 'drop' }, state()); assert.equal(sound.snapshot().voices, 0);
  const g = graph(); pair = g; frame(sound, state());
  assert.equal(g.sources.length, 2, 'only the physical mechanism starts'); assert.equal(sound.snapshot().events, 0);
  g.ctx.state = 'suspended'; sound.event({ type: 'land' }, state()); assert.equal(sound.snapshot().voices, 0);
  assert.ok(g.sources.every(n => n.stops.length));
  g.ctx.state = 'running'; frame(sound, state());
  assert.equal(g.sources.length, 4, 'the old landing is absent'); assert.equal(g.buffers.length, 1, 'one noise allocation per context'); sound.dispose();
});

test('event storms before and after readiness preserve source budgets and hard pause releases every graph', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  for (let i = 0; i < 100; i++) sound.event({ type: 'closure-warning' }, state({ phase: 'wrong-return' }));
  frame(sound, state());
  assert.ok(sound.snapshot().voices <= C.maxVoices); assert.ok(sound.snapshot().sources <= C.maxSources);
  assert.ok(sound.snapshot().skipped > 0); assert.equal(layer(sound, 'mechanism').length, 1);
  sound.pause(); assert.equal(sound.snapshot().sources, 0);
  assert.ok(g.sources.every(n => n.stops.length && n.disconnected));
  assert.ok(g.nodes.filter(n => n !== g.destination).every(n => n.disconnected));
  frame(sound, state()); assert.equal(sound.snapshot().sources, 2); sound.update({ state: state(), ready: false });
  assert.equal(sound.snapshot().sources, 0); sound.dispose();
});

test('a new shared bus cuts old voices and context changes rebuild only the bounded noise buffer', () => {
  const first = graph(), second = graph(); let pair = first;
  const sound = createSourceContinuationAudio({ getAudio: () => pair });
  frame(sound, state()); sound.event({ type: 'drop' }, state()); pair = second; frame(sound, state());
  assert.ok(first.sources.every(n => n.stops.length && n.disconnected));
  assert.equal(second.sources.length, 2); assert.equal(second.buffers.length, 1);
  sound.stop(); sound.stop(); assert.equal(sound.snapshot().voices, 0); sound.dispose();
});

test('stereo follows the actual first-person yaw in both Source sections, with vertical attenuation', () => {
  const at = { x: 5, y: .95, z: 0 }, listener = { x: 0, feet: 0, z: 0, yaw: 0, phase: 'wrong-return' };
  assert.ok(sourceContinuationPlacement(at, listener).pan > .8);
  assert.ok(sourceContinuationPlacement(at, { ...listener, yaw: Math.PI }).pan < -.8);
  assert.ok(sourceContinuationPlacement(at, { ...listener, phase: 'catch' }).pan>.8);
  assert.ok(sourceContinuationPlacement(at, { ...listener, phase: 'catch', yaw: Math.PI }).pan<-.8);
  const near = sourceContinuationPlacement(at, listener), below = sourceContinuationPlacement({ ...at, y: -18 }, listener);
  assert.ok(below.distance > near.distance); assert.ok(below.gain < near.gain); assert.ok(below.cutoff < near.cutoff);
  assert.ok(sourceContinuationPlacement({ x: NaN, y: Infinity }, {}).gain > 0, 'malformed optional positions stay finite');
});

test('there is no ambient score: the silent dormant front becomes an actual spatial mechanical source', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  const s = state({ phase: 'wrong-return', x: 5, z: 1, feet: 3, closure: { mode: 'dormant', frontZ: -4.5 } });
  frame(sound, s); assert.equal(sound.snapshot().mechanicalGain, 0);
  frame(sound, { ...s, closure: { mode: 'closing', frontZ: 0 } });
  const snap = sound.snapshot(); assert.ok(snap.mechanicalGain > .01); assert.deepEqual(snap.source, { x: 6, y: 3.65, z: 0 });
  assert.ok(snap.mix.pan > 0); assert.equal(layer(sound, 'mechanism').length, 1); sound.dispose();
});

test('ratchets require real machinery travel, and paused relocation cannot create a catch-up burst', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  let s = state(); frame(sound, s);
  for (let i = 0; i < 30; i++) { g.ctx.currentTime += .1; frame(sound, { ...s, elapsed: i * .1 }); }
  assert.equal(layer(sound, 'ratchet').length, 0, 'waiting at an unmoving mechanism has no invented footsteps');
  s = { ...s, counterweight: { ...s.counterweight, x: -18.8 } }; frame(sound, s);
  assert.equal(layer(sound, 'ratchet').length, 1);
  sound.pause(); s = { ...s, counterweight: { ...s.counterweight, x: -28, y: -15 } }; frame(sound, s);
  assert.equal(layer(sound, 'ratchet').length, 0); assert.equal(sound.snapshot().sources, 2);
  sound.dispose();
});

test('vertical cable return remains audible at its actual moving height instead of restarting a score', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  const s = state({ counterweight: { active: true, mode: 'hoisting', x: -28, z: -3, y: -15 } });
  frame(sound, s); const first = sound.snapshot();
  frame(sound, { ...s, counterweight: { ...s.counterweight, y: -14.2 } });
  const second = sound.snapshot(); assert.equal(second.mode, 'hoisting');
  assert.ok(second.mechanicalGain > .01); assert.ok(second.mix.distance < first.mix.distance);
  assert.equal(layer(sound, 'ratchet').length, 1); assert.equal(g.sources.filter(n => n.loop).length, 1);
  sound.dispose();
});

test('the complete repeated cable circuit has audible physical phases and an announced lowering release', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  let s = state(); frame(sound, s);
  const modes = ['returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering'];
  const events = ['counterweight-return', 'counterweight-rewind', 'counterweight-hoist', 'counterweight-traverse', 'counterweight-lowering-warning', 'counterweight-lower'];
  for (let i = 0; i < modes.length; i++) {
    g.ctx.currentTime += 2;
    s = { ...s, elapsed: s.elapsed + 2, counterweight: { ...s.counterweight, mode: modes[i], y: 3 - i * .7 } };
    frame(sound, s); assert.equal(sound.event({ type: events[i] }, s), true, events[i]);
    const snap = sound.snapshot(); assert.equal(snap.mode, modes[i]); assert.ok(snap.mechanicalGain >= .007);
    assert.deepEqual(layer(sound, events[i])[0].source, { x: -18, y: 3 - i * .7, z: -3 });
    assert.ok(snap.sources <= C.maxSources); assert.equal(layer(sound, 'mechanism').length, 1);
  }
  g.ctx.currentTime += 2; frame(sound, s); assert.equal(sound.event({ type: 'counterweight-cycle' }, s), true);
  assert.equal(g.sources.filter(n => n.loop).length, 1, 'the circuit does not restart its continuous mechanism'); sound.dispose();
});

test('the first overhead warning sounds at the retained physical counterweight before the circuit moves', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  const s = state({ counterweight: { active: true, mode: 'warning', x: -17.7, z: -4.5, y: 3 } });
  frame(sound, s);
  assert.equal(sound.event({ type: 'counterweight-warning', position: { x: -17.7, y: 3, z: -4.5 } }, s), true);
  const cue = layer(sound, 'counterweight-warning')[0];
  assert.deepEqual(cue.source, { x: -17.7, y: 3, z: -4.5 });
  assert.ok(cue.gain > .04); assert.ok(cue.mix.pan > 0);
  assert.equal(layer(sound, 'mechanism').length, 1); assert.ok(sound.snapshot().mechanicalGain >= .007);
  assert.equal(layer(sound, 'ratchet').length, 0, 'warning cannot invent movement before the mechanism travels');
  sound.dispose();
});

test('a missing Catch mechanism pose falls back to the authored hoist location',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g});frame(sound,state({counterweight:null}));
  assert.deepEqual(sound.snapshot().source,{x:LAYOUT.catch.hoist.start.x,y:LAYOUT.catch.top,z:LAYOUT.catch.hoist.start.z});
  assert.ok(Object.values(sound.snapshot().mix).every(Number.isFinite));sound.dispose();
});

test('body footsteps come from supported body travel and cannot play during a drop or recovery', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }); let s = state();
  frame(sound, s); s = { ...s, x: s.x + 1 }; frame(sound, s);
  assert.equal(layer(sound, 'footstep').length, 1);
  g.ctx.currentTime += 1; s = { ...s, x: s.x + 1, fall: { vy: -4 } }; frame(sound, s);
  assert.equal(layer(sound, 'footstep').length, 0);
  s = { ...s, x: s.x + 1, fall: null, recovery: { elapsed: .1 } }; frame(sound, s);
  assert.equal(layer(sound, 'footstep').length, 0); sound.dispose();
});

test('shared player contacts replace the II thud without replacing Hush or machinery and clear at lifecycle seams',()=>{
  const contacts=[],cleared=[],g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g,onFootContact:e=>contacts.push(e),clearFootContacts:owner=>cleared.push(owner)});
  let s=state({phase:'wrong-return',x:0,z:-3,feet:0,hush:hush()});frame(sound,s);
  s={...s,x:s.x+1,hush:{...s.hush,x:s.hush.x+1.2}};frame(sound,s);
  assert.equal(contacts.length,1);assert.equal(contacts[0].owner,'source-continuation');assert.equal(contacts[0].profile,'physical');
  assert.ok(contacts[0].strideM>0&&contacts[0].interval>0&&contacts[0].distanceM>0);assert.equal(contacts[0].surface,'cold-stone');assert.equal(layer(sound,'footstep').length,0);assert.equal(layer(sound,'hush-footstep').length,1);
  assert.ok(layer(sound,'mechanism').length>0,'existing machinery remains owned by this soundscape');
  s={...s,x:s.x+1,fall:{vy:-3}};frame(sound,s);assert.equal(contacts.length,1);
  sound.event({type:'portal'},s);assert.equal(cleared.at(-1),'source-continuation');
  sound.pause();sound.dispose();assert.equal(cleared.at(-1),'source-continuation');
});

test('handle and lip approach are one physical contact, never a repeated beacon or resume notification', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }), s = state();
  const handle = { id: 'catch-return-0', type: 'return', position: { x: -30.5, y: 4.1, z: 8.4 } };
  frame(sound, s, .1, handle); assert.equal(layer(sound, 'handle-contact').length, 0, 'entry at a handle does not replay contact');
  frame(sound, s); frame(sound, s, .1, handle); assert.equal(layer(sound, 'handle-contact').length, 1);
  for (let i = 0; i < 50; i++) { g.ctx.currentTime += .1; frame(sound, s, .1, handle); }
  assert.equal(layer(sound, 'handle-contact').length, 0, 'no repeating cue while holding position');
  frame(sound, s); frame(sound, s, .1, { id: 'catch-lip-0', type: 'drop', x: -19.55, y: 3, z: 0 });
  assert.equal(layer(sound, 'edge-contact').length, 1);
  sound.pause(); frame(sound, s, .1, handle); assert.equal(layer(sound, 'handle-contact').length, 0); sound.dispose();
});

test('the authored phase transition preserves continuous source ownership and carries a finite material creak', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  frame(sound, state({ phase: 'wrong-return', closure: { mode: 'closing', frontZ: 0 } }));
  const continuous = g.sources.slice(); sound.event({ type: 'phase', phase: 'catch' }, state()); frame(sound, state());
  assert.ok(continuous.every(n => !n.stops.length)); assert.equal(layer(sound, 'mechanism').length, 1);
  assert.equal(layer(sound, 'phase').length, 1); assert.equal(layer(sound, 'footstep').length, 0);
  g.ctx.currentTime += 2; frame(sound, state()); assert.equal(sound.snapshot().sources, 2); sound.dispose();
});

test('warning, drop, body landing, machine landing and recovery keep distinct material envelopes', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }); frame(sound, state());
  const expected = ['closure-warning', 'drop', 'land', 'counterweight-lands', 'capture', 'recovered', 'door'];
  const voices = [];
  for (const type of expected) {
    g.ctx.currentTime += 2; frame(sound, state()); assert.equal(sound.event({ type, open: true }, state()), true);
    const v = layer(sound, type)[0]; assert.ok(v, type); voices.push(v);
    assert.ok(Object.values(v.mix).every(Number.isFinite));
  }
  assert.deepEqual(voices.find(v => v.kind === 'counterweight-lands').source, { x: -18, y: 3, z: -3 });
  assert.notEqual(voices.find(v => v.kind === 'capture').gain, voices.find(v => v.kind === 'recovered').gain);
  assert.ok(g.sources.filter(n => n.kind === 'noise').length > g.sources.filter(n => n.kind === 'tone').length / 2);
  sound.dispose();
});

test('mono fallback, unavailable suppliers and disposal remain silent-safe', () => {
  const g = graph({ panner: false }), sound = createSourceContinuationAudio({ getAudio: () => g });
  assert.equal(frame(sound, state()), true); assert.equal(sound.event({ type: 'drop' }, state()), true);
  assert.equal(g.nodes.some(n => n.kind === 'pan'), false); sound.dispose();
  assert.equal(frame(sound, state()), false); assert.equal(sound.event({ type: 'land' }, state()), false);
  const absent = createSourceContinuationAudio({ getAudio() { throw Error('missing bus'); } });
  assert.doesNotThrow(() => absent.event({ type: 'land' }, state())); assert.equal(absent.snapshot().sources, 0);
});

test('Hush footfalls follow actual supported distance at its feet, with no stationary danger loop', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }); let s = state({ hush: hush() });
  frame(sound, s);
  for (let i = 0; i < 30; i++) { g.ctx.currentTime += .1; frame(sound, { ...s, elapsed: i * .1, hush: { ...s.hush, animationClock: i } }); }
  assert.equal(sound.snapshot().hush.footsteps, 0, 'animation time and presence alone cannot invent footfalls');
  s = { ...s, hush: { ...s.hush, x: s.hush.x + .62 } }; frame(sound, s);
  assert.equal(sound.snapshot().hush.footsteps, 0);
  s = { ...s, hush: { ...s.hush, x: s.hush.x + .62 } }; frame(sound, s);
  const step = layer(sound, 'hush-footstep')[0];
  assert.equal(sound.snapshot().hush.footsteps, 1);assert.ok(step);
  assert.equal(step.source.y, s.hush.feet + .03);assert.equal(step.source.z, s.hush.z);
  assert.ok(Math.abs(step.source.x - s.hush.x) <= .151);assert.ok(step.mix.pan > 0);
  assert.ok(step.gain > .019, 'the physical pursuer has a distinct heavier contact than the operator');
  assert.equal(g.sources.filter(n => n.loop).length, 1, 'only the existing mechanism owns a loop');
  g.ctx.currentTime += 1;frame(sound, s);assert.equal(layer(sound, 'hush-footstep').length, 0);
  assert.equal(sound.snapshot().hush.footsteps, 1);sound.dispose();
});

test('Hush air travel, recovery, relocation and phase boundaries discard stride debt', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  let s = state({ hush: hush() });frame(sound, s);
  const move = (amount, extra = {}, actor = {}) => { s = { ...s, ...extra, hush: { ...s.hush, x: s.hush.x + amount, ...actor } };g.ctx.currentTime += .1;frame(sound, s); };
  move(.7);move(.7, {}, { mode: 'falling', fall: { vy: -8 }, feet: 1 });
  move(.6, {}, { mode: 'follow', fall: null, feet: 3 });move(.6);
  assert.equal(sound.snapshot().hush.footsteps, 0, 'first supported frame starts a new stride');
  move(.6);assert.equal(sound.snapshot().hush.footsteps, 1);
  move(.7, { recovery: { elapsed: .1 } });move(.7, { recovery: null });move(.6);
  assert.equal(sound.snapshot().hush.footsteps, 1, 'recovery cannot bank a stride');
  move(20);move(.6);assert.equal(sound.snapshot().hush.footsteps, 1, 'relocation cannot create a catch-up burst');
  move(.7, {}, { mode: 'recovering', recovery: { elapsed: .1 } });move(.7, {}, { mode: 'follow', recovery: null });move(.6);
  assert.equal(sound.snapshot().hush.footsteps, 1, 'the Hush own recovery cannot make airborne steps or bank a stride');
  move(.7, { phase: 'wrong-return', closure: { mode: 'dormant' } });move(.6);
  assert.equal(sound.snapshot().hush.footsteps, 1, 'a new world samples a new actor origin');
  sound.pause();move(.7);move(.6);assert.equal(sound.snapshot().hush.footsteps, 1, 'pause discards the incomplete stride');
  move(.6);assert.equal(sound.snapshot().hush.footsteps, 2);sound.dispose();
});

test('contact grace does not silence the Hush actual supported departure steps',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g});let s=state({grace:3,hush:hush()});frame(sound,s);
  for(let n=0;n<2;n++){g.ctx.currentTime+=.1;s={...s,grace:s.grace-.1,hush:{...s.hush,x:s.hush.x+.62}};frame(sound,s);}
  assert.ok(s.grace>0);assert.equal(sound.snapshot().hush.supported,true);assert.equal(sound.snapshot().hush.footsteps,1);
  assert.equal(layer(sound,'hush-footstep').length,1,'contact immunity is not an audio or pursuit freeze');
  sound.dispose();
});

test('Hush warning, notice, drop, landing and capture are finite spatial cues at the transformed live actor', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g });
  const s = state({ hush: hush({ x: -17, z: -2, feet: -5 }) });frame(sound, s);
  for (const type of ['hush-warning', 'hush-armed', 'hush-notice', 'hush-drop', 'hush-land', 'hush-recovery', 'hush-recovered', 'capture']) {
    g.ctx.currentTime += 2;frame(sound, s);
    assert.equal(sound.event({ type, reason: 'hush-pressure', position: { x: 999, y: 999, z: 999 } }, s), true);
    const voice = layer(sound, type)[0];assert.ok(voice);
    assert.equal(voice.source.x, s.hush.x);assert.equal(voice.source.z, s.hush.z);
    assert.equal(voice.source.y, s.hush.feet + (['hush-warning', 'hush-armed', 'hush-land', 'hush-recovered'].includes(type) ? .03 : .95));
    assert.ok(Object.values(voice.mix).every(Number.isFinite));assert.ok(voice.mix.gain < .8, 'the actor below is actually attenuated');
    assert.ok(sound.snapshot().sources <= C.maxSources);assert.ok(sound.snapshot().voices <= C.maxVoices);
  }
  assert.ok(g.sources.filter(n => !n.loop && n.kind === 'noise').every(n => n.stops.length), 'every actor sound has an authored end');
  assert.equal(g.sources.filter(n => n.loop).length, 1);
  g.ctx.currentTime += 2;frame(sound, s);assert.equal(sound.snapshot().sources, 2);
  assert.equal(sound.event({ type: 'hush-land' }, { ...s, hush: { ...s.hush, active: false } }), false);
  assert.equal(sound.event({ type: 'hush-notice' }, { ...s, phase: 'ellery' }), false);
  assert.equal(sound.event({ type: 'hush-warning' }, { ...s, status: 'completed' }), false);sound.dispose();
});

test('REC protection, lost readiness and context replacement release Hush contacts without replay', () => {
  const first = graph(), second = graph();let pair = first, protectedValue = false;
  const sound = createSourceContinuationAudio({ getAudio: () => pair, protectedAudio: () => protectedValue });
  let s = state({ hush: hush() });frame(sound, s);sound.event({ type: 'hush-land' }, s);
  protectedValue = true;assert.equal(sound.event({ type: 'hush-notice' }, s), false);assert.equal(sound.snapshot().voices, 0);
  assert.ok(first.sources.every(n => n.stops.length));
  protectedValue = false;s = { ...s, hush: { ...s.hush, x: s.hush.x + 8 } };frame(sound, s);
  assert.equal(layer(sound, 'hush-land').length, 0);assert.equal(sound.snapshot().hush.footsteps, 0);
  sound.update({ state: s, ready: false });assert.equal(sound.snapshot().voices, 0);
  pair = second;frame(sound, s);assert.equal(sound.snapshot().sources, 2);
  assert.equal(sound.snapshot().hush.footsteps, 0);
  second.ctx.state = 'suspended';assert.equal(sound.event({ type: 'hush-armed' }, s), false);
  second.ctx.state = 'running';frame(sound, s);assert.equal(sound.snapshot().sources, 2);
  sound.dispose();assert.ok(second.sources.every(n => n.stops.length && n.disconnected));
});

test('Hush event storms retain the mechanism reservation and the existing graph bounds', () => {
  const g = graph(), sound = createSourceContinuationAudio({ getAudio: () => g }), s = state({ hush: hush() });
  for (let i = 0; i < 100; i++) sound.event({ type: ['hush-notice', 'hush-land', 'hush-armed'][i % 3] }, s);
  frame(sound, s);assert.equal(layer(sound, 'mechanism').length, 1);
  assert.ok(sound.snapshot().voices <= C.maxVoices);assert.ok(sound.snapshot().sources <= C.maxSources);
  assert.ok(sound.snapshot().skipped > 0);sound.pause();assert.equal(sound.snapshot().sources, 0);
  assert.ok(g.nodes.filter(n => n !== g.destination).every(n => n.disconnected));sound.dispose();
});

test('chart crossings reset only the crossing actor stride and keep transient emission points in their original chart',()=>{
  const g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g});
  const acoustic=s=>({listener:{eye:[s.x,s.feet+.95,s.z],right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},projectPoint:(chart,p)=>chart===s.chartId?{...p}:chart===0?{x:-p.y,y:p.x,z:p.z}:null});
  let s=state({phase:'wrong-return',chartId:0,x:0,z:0,feet:0,closure:{mode:'dormant'},hush:hush({chartId:0,x:5,z:-2,feet:0})});
  sound.update({state:s,ready:true,dt:.05,acousticFrame:acoustic(s)});
  s={...s,x:.7,hush:{...s.hush,x:5.7}};g.ctx.currentTime+=.05;sound.update({state:s,ready:true,dt:.05,acousticFrame:acoustic(s)});
  sound.event({type:'hush-land'},s,acoustic(s));const emitted=layer(sound,'hush-land')[0];assert.equal(emitted.chartId,0);assert.ok(emitted.mix.pan>0);
  s={...s,chartId:1,portalSerial:1,x:.8,hush:{...s.hush,x:6.3}};g.ctx.currentTime+=.05;
  sound.event({type:'portal'},s,acoustic(s));sound.update({state:s,ready:true,dt:.05,acousticFrame:acoustic(s)});
  assert.equal(layer(sound,'footstep').length,0);assert.equal(sound.snapshot().hush.footsteps,1,'the old-chart Hush still completes its real stride');
  s={...s,hush:{...s.hush,chartId:1,portalSerial:1,x:6.35}};g.ctx.currentTime+=.05;
  sound.event({type:'hush-portal'},s,acoustic(s));sound.update({state:s,ready:true,dt:.05,acousticFrame:acoustic(s)});
  assert.equal(sound.snapshot().hush.footsteps,1,'the Hush crossing is not walked floor distance');
  const tail=layer(sound,'hush-land')[0];assert.deepEqual(tail.source,emitted.source);assert.equal(tail.chartId,0);assert.ok(tail.mix.pan<0,'the old source is heard at its newly presented wall position');
  assert.ok(sound.snapshot().voices<=C.maxVoices);assert.ok(sound.snapshot().sources<=C.maxSources);sound.dispose();
});

test('physical presented listener axes override raw yaw for chart-local contacts',()=>{
  const frame={listener:{eye:[0,0,0],right:[0,1,0],up:[-1,0,0],forward:[0,0,-1]},projectPoint:(_chart,p)=>({...p})};
  const mix=sourceContinuationPlacement({x:0,y:10,z:0},state({yaw:Math.PI}),frame,0);
  assert.ok(mix.pan>.8);assert.equal(mix.distance,10);assert.ok(Object.values(mix).every(Number.isFinite));
});

test('shared II gait follows supported metre speed and refuses unsupported, relocated or portal travel',()=>{
  const contacts=[],g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g,onFootContact:e=>contacts.push(e)});
  let s=state({phase:'wrong-return',x:-6,z:-3,feet:0});frame(sound,s,1/60);
  for(let i=0;i<300;i++){
    s={...s,x:s.x+3.2/60,elapsed:(i+1)/60};g.ctx.currentTime+=1/60;frame(sound,s,1/60);
    if(i===0)assert.equal(contacts.length,1,'first continuous supported body travel plants immediately');
  }
  assert.ok(contacts.length>=15&&contacts.length<=17,`3.2m/s yielded ${contacts.length} contacts in 5 seconds`);
  assert.ok(contacts.every(e=>e.surface==='cold-stone'&&Math.abs(e.speed-3.2)<.001&&e.strideM>1&&e.strideM<1.1));
  assert.ok(contacts.every((e,i)=>i===0||e.footSide!==contacts[i-1].footSide));
  const count=contacts.length;for(let i=0;i<60;i++)frame(sound,s,1/60);assert.equal(contacts.length,count);
  s={...s,x:100,z:100};frame(sound,s,1/60);s={...s,x:100.05};frame(sound,s,1/60);
  assert.equal(contacts.length,count,'unsupported movement never becomes a shoe plant');
  sound.event({type:'portal'},s);s={...s,x:0,z:-3};frame(sound,s,1/60);
  assert.equal(contacts.length,count,'portal placement establishes a new origin without walking it');
  s={...s,x:.05};frame(sound,s,1/60);assert.equal(contacts.length,count+1,'fresh supported movement resumes immediately');
  sound.dispose();
});

test('fast Source feet remain actual supported contacts through low frame rates and stop in the air',()=>{
 for(const fps of [4,15,30,60]){
  const contacts=[],g=graph(),sound=createSourceContinuationAudio({getAudio:()=>g,onFootContact:e=>contacts.push(e)});
  let s=state({phase:'wrong-return',x:16,z:-8,feet:0,breath:{sprinting:true}});frame(sound,s,1/fps);
  for(let i=1;i<=2*fps;i++){s={...s,z:-8-i*8.25/fps,elapsed:i/fps};g.ctx.currentTime+=1/fps;frame(sound,s,1/fps);}
  assert.ok(contacts.length>=6&&contacts.length<=11,`${fps}FPS: ${contacts.length} physical contacts`);
  assert.ok(contacts.every(e=>Math.abs(e.speed-8.25)<1e-6&&e.condition==='sprint'));
  const count=contacts.length;s={...s,fall:{elapsed:0}};
  for(let i=0;i<fps;i++){s={...s,z:s.z-.05};g.ctx.currentTime+=1/fps;frame(sound,s,1/fps);}
  assert.equal(contacts.length,count,'no airborne stride after an arbitrary jump');sound.dispose();
 }
});

test('three corridor contacts survive score isolation, retain spatial tails and never reopen generic effects',()=>{
  const g=graph(),calls=[];let protection=false;
  const sound=createSourceContinuationAudio({getAudio:()=>g,protectedAudio:()=>protection});
  const s=state({phase:'wrong-return',chartId:4,x:-146,z:-72,feet:8.4,yaw:0,elapsed:30});
  sound.attachRestMusic({update:v=>calls.push(v),snapshot:()=>({active:true,playing:true,phase:'wrong-return'})});
  frame(sound,s);assert.equal(sound.snapshot().restMusicIsolated,true);calls.length=0;
  for(const type of ['corridor-strain','corridor-warning','corridor-settled'])assert.equal(sound.event({type,chartId:4,position:{x:-143,y:10.4,z:-77}},s),true);
  const before=sound.snapshot();assert.equal(before.voices,3);assert.equal(before.restMusicIsolated,true);
  assert.ok(before.layers.every(v=>v.chartId===4&&v.kind.startsWith('corridor-')&&v.mix.pan>0));
  const starts=g.sources.map(v=>v.starts.length);g.ctx.currentTime+=.1;frame(sound,{...s,yaw:Math.PI,elapsed:90});
  assert.equal(sound.snapshot().voices,3,'isolated update does not silence the admitted cues');
  assert.ok(sound.snapshot().layers.every(v=>v.mix.pan<0));assert.deepEqual(g.sources.map(v=>v.starts.length),starts);
  for(const type of ['door','hush-warning','closure-warning','land','threshold-gag-start'])assert.equal(sound.event({type},s),false);
  assert.equal(sound.snapshot().voices,3);assert.equal(sound.snapshot().surroundings.voices,0);assert.equal(sound.snapshot().materials.voices,0);
  assert.ok(!calls.some(v=>v.active===false||v.paused),'contacts never pause or retire the score');
  g.ctx.currentTime+=2;frame(sound,s);assert.equal(sound.snapshot().voices,0,'isolated tails expire without a generic mechanism update');
  sound.event({type:'corridor-warning',chartId:4},s);protection=true;frame(sound,s);assert.equal(sound.snapshot().voices,0);
  protection=false;frame(sound,s);assert.equal(sound.snapshot().voices,0,'protection queues no delayed replay');
  sound.event({type:'corridor-settled',chartId:4},s);sound.pause();assert.equal(sound.snapshot().voices,0);sound.dispose();
});

test('a fault that opens sounds the practice wing\'s two As, only near it, and lets them go',() => {
  const { ctx, sources, destination } = graph(), sound = createSourceContinuationAudio({ getAudio: () => ({ ctx, destination }) });
  const fault = { x: -16.5, z: -23.6, feet: 8.4 }, at = (dz) => ({ phase: 'wrong-return', status: 'active', chartId: 0, x: fault.x, z: fault.z - dz, feet: fault.feet, yaw: 0, pitch: 0, elapsed: 1, closure: { mode: 'dormant' } });
  frame(sound, at(40));
  assert.ok(!sound.snapshot().layers.some(layer => layer.kind === 'rift-beat'), 'silent from across the construction');
  frame(sound, at(3));
  const near = sound.snapshot().layers.find(layer => layer.kind === 'rift-beat');
  assert.ok(near && near.gain > 0, 'audible beside it');
  const hz = sources.filter(source => source.frequency?.value >= 440 && source.frequency?.value <= 444 && !source.stopped).map(source => source.frequency.value).sort();
  assert.deepEqual(hz.slice(0, 2), [440, 444]);
  frame(sound, at(10));
  assert.ok(sound.snapshot().layers.find(layer => layer.kind === 'rift-beat').gain < near.gain, 'it thins as you walk away');
  frame(sound, at(40));
  assert.ok(!sound.snapshot().layers.some(layer => layer.kind === 'rift-beat'), 'and is released');
});
