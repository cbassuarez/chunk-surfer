import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createConservatoryAdversaryAudio} from '../src/audio/conservatory-adversary-audio.js';

function param(){return{value:0,events:[],setValueAtTime(value,at){this.events.push({kind:'set',value,at});},
  exponentialRampToValueAtTime(value,at){this.events.push({kind:'exponential',value,at});},
  linearRampToValueAtTime(value,at){this.events.push({kind:'linear',value,at});}};}
function harness(){
  const nodes=[],timers=[],destination={id:'separate-world-sfx'},ctx={currentTime:42,sampleRate:1000};
  function node(kind){const n={kind,connections:[],disconnections:0,starts:[],stops:[],
    connect(target){this.connections.push(target);},disconnect(){this.disconnections++;},
    start(at){this.starts.push(at);},stop(at){this.stops.push(at);},gain:param(),frequency:param(),Q:param(),pan:param()};nodes.push(n);return n;}
  Object.assign(ctx,{createGain:()=>node('gain'),createStereoPanner:()=>node('pan'),
    createOscillator:()=>node('oscillator'),createBiquadFilter:()=>node('filter'),
    createBufferSource:()=>node('noise'),createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)})});
  const audio=createConservatoryAdversaryAudio({getAudio:()=>({ctx,destination})});
  const play=(kind,options)=>{const original=setTimeout;globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms});return 0;};
    try{return audio.play({kind,at:{x:2,y:1}},options);}finally{globalThis.setTimeout=original;}};
  return{audio,play,nodes,timers,ctx,destination,sources:()=>nodes.filter(n=>['oscillator','noise'].includes(n.kind)),
    notes:()=>nodes.filter(n=>n.kind==='oscillator').map(n=>({frequency:n.frequency.events[0]?.value,at:n.starts[0],type:n.type}))};
}

test('warning delivers three separated A-G-F preparations within the full3.2second window',()=>{
  const h=harness();assert.equal(h.play('held-warning'),true);
  assert.deepEqual(h.notes().map(n=>n.frequency),[880,783.991,698.456]);
  assert.deepEqual(h.notes().map(n=>n.at-h.ctx.currentTime),[0,1,2]);
  assert.ok(h.notes().every(n=>n.type==='triangle'));
  assert.ok(h.sources().every(n=>n.stops[0]<=h.ctx.currentTime+3.2));
  assert.equal(h.timers[0].ms,3700);
});
test('the committed sweep answers with E and finishes within .8seconds',()=>{
  const h=harness();h.play('held-strike');assert.equal(h.notes()[0].frequency,659.255);
  assert.equal(h.notes()[0].at,h.ctx.currentTime);assert.ok(h.sources().every(n=>n.stops[0]<=h.ctx.currentTime+.8));
  assert.equal(h.timers[0].ms,1300);
});
test('release breaks the held pitch into a short contact and real silence; clean and impact stay bounded',()=>{
  for(const[kind,duration]of[['held-release',.45],['held-clean',.25],['held-impact',.65],['held-reveal',1.1]]){
    const h=harness();assert.equal(h.play(kind),true);assert.ok(h.sources().length>0);
    assert.ok(h.sources().every(n=>n.stops[0]<=h.ctx.currentTime+duration),kind+' cannot spill into the next authored phase');
    assert.equal(h.timers[0].ms,(duration+.5)*1000);
  }
  const h=harness();h.play('held-release');assert.ok(h.sources().every(n=>n.stops[0]<h.ctx.currentTime+.2));
});
test('phase cancellation stops future warning notes immediately and dispose is idempotent',()=>{
  const h=harness();h.play('held-warning');const sources=h.sources();assert.ok(sources.some(n=>n.starts[0]>h.ctx.currentTime));
  h.audio.dispose();for(const n of sources){assert.equal(n.stops.at(-1),undefined);assert.equal(n.disconnections,0);}
  const stops=sources.map(n=>n.stops.length);h.audio.dispose();assert.deepEqual(sources.map(n=>n.stops.length),stops);
  for(const timer of h.timers)assert.doesNotThrow(timer.fn);
});
test('a separate prototype instance never disposes an existing Costume sound owner',()=>{
  const existing=harness(),prototype=harness();existing.play('pin-snap');prototype.play('held-warning');prototype.audio.dispose();
  assert.ok(existing.sources().every(n=>n.stops.length===1&&Number.isFinite(n.stops[0])));
  assert.ok(prototype.sources().every(n=>n.stops.at(-1)===undefined));
});
test('held cues retain spatial world-SFX panning and closed-door attenuation',()=>{
  const open=harness(),closed=harness();open.play('held-warning',{listener:{x:0,y:0,yaw:0}});
  closed.play('held-warning',{listener:{x:0,y:0,yaw:0},occluded:true});
  const bus=h=>h.nodes.find(n=>n.kind==='gain'),pan=open.nodes.find(n=>n.kind==='pan');
  assert.ok(pan.pan.value>0);assert.ok(Math.abs(bus(closed).gain.value/bus(open).gain.value-.34)<1e-12);
  assert.ok(closed.nodes.filter(n=>n.kind==='filter').every(n=>n.frequency.value<=680));
  assert.equal(pan.connections[0],open.destination);
});
test('existing lure, held-note and Costume pin-snap contracts remain available',()=>{
  const lure=harness();assert.equal(lure.play('lure-studio'),true);
  assert.deepEqual(lure.notes().filter(n=>n.type==='triangle').map(n=>n.frequency),[880,783.991,698.456,659.255]);
  const held=harness();held.play('held-note');assert.equal(held.notes()[0].frequency,659.255);assert.equal(held.timers[0].ms,4100);
  const costume=harness();costume.play('pin-snap');assert.deepEqual(costume.notes().map(n=>n.frequency),[1420,79]);
});
test('missing audio and unknown event produce no scheduled world sound',()=>{
  const none=createConservatoryAdversaryAudio({getAudio:()=>null});assert.equal(none.play({kind:'held-warning',at:{x:0,y:0}}),false);
  const h=harness();assert.equal(h.play('unowned-event'),false);assert.equal(h.sources().length,0);assert.equal(h.timers.length,0);
});

const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const start=r3d.indexOf('export function r3dHeldNoteStatus(){'),end=r3d.indexOf('\n}',start);
assert.ok(start>=0&&end>start,'the production held readiness export exists');
const statusCode=r3d.slice(start,end+2).replace('export ','');
function productionStatus(meshes,error=null){const c={P3:{characterStats:()=>({meshes})},heldNoteAssetError:error};
  vm.createContext(c);return vm.runInContext(statusCode+';r3dHeldNoteStatus()',c);}
test('the actual readiness export requires all three real HeldNote meshes, regardless of other loaded packs',()=>{
  const required=['held_note_body','held_note_faces','held_note_anatomy'];
  for(const missing of required)assert.equal(productionStatus(required.filter(m=>m!==missing).concat('costume_exchange_body')).ready,false);
  assert.equal(productionStatus([]).ready,false);assert.equal(productionStatus(required).ready,true);
  assert.equal(productionStatus(required,'decode failed').error,'decode failed');
});
test('the existing single HeldNote load reports current failure while ignoring an obsolete load failure',async()=>{
  const at=r3d.indexOf('const heldLoadGeneration=++heldNoteLoadGeneration;'),until=r3d.indexOf('\n      //',at);
  assert.ok(at>=0&&until>at);const snippet=r3d.slice(at,until),loads=[];
  const c={heldNoteAssetError:'old',heldNoteLoadGeneration:0,assetUrl:p=>'/'+p,
    console:{warn(){}},P3:{addCharacterPack:url=>new Promise((resolve,reject)=>loads.push({url,resolve,reject}))}};
  vm.createContext(c);vm.runInContext('(()=>{'+snippet+'})()',c);assert.equal(c.heldNoteAssetError,null);
  vm.runInContext('(()=>{'+snippet+'})()',c);assert.equal(loads.length,2);assert.equal(loads[1].url,'/assets/held-note.glb');
  loads[0].reject(new Error('obsolete failure'));await Promise.resolve();await Promise.resolve();assert.equal(c.heldNoteAssetError,null);
  loads[1].reject(new Error('current decode failure'));await Promise.resolve();await Promise.resolve();assert.equal(c.heldNoteAssetError,'current decode failure');
  assert.equal(r3d.split("P3.addCharacterPack(assetUrl('assets/held-note.glb'))").length-1,1,'no duplicate asset load chain was introduced');
});
