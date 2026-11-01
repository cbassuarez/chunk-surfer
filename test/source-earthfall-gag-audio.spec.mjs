import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceEarthfallAudio} from '../src/audio/source-earthfall.js';
import {THRESHOLD_GAG_AUDIO as T} from '../src/audio/threshold-gag.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as ASIDE,SOURCE_ELLERY_ASIDE_CHARGES as CHARGES} from '../src/data/source-earthfall-ellery-aside.js';
import {freshSourceEarthfallElleryAside,stepSourceEarthfallElleryAside,sourceEarthfallElleryAsideFrame} from '../src/game/source-earthfall-ellery-aside.js';
import {EARTHFALL_GAG} from '../src/data/source-earthfall-gag.js';

function fixture({gate=null,fail=false,noAudio=false}={}){
 const sources=[],nodes=[],fetches=[],doors=[],seconds=[.205,.245,.185,.9204166667],files=Object.values(T.clips);
 const parameter=()=>({value:0,calls:[],setValueAtTime(v,...args){assert.ok(Number.isFinite(v),'Web Audio automation must receive a finite value');this.value=v;this.calls.push(['set',v,...args]);},linearRampToValueAtTime(v,...args){assert.ok(Number.isFinite(v),'Web Audio automation must receive a finite value');this.value=v;this.calls.push(['ramp',v,...args]);},setTargetAtTime(v,...args){assert.ok(Number.isFinite(v),'Web Audio automation must receive a finite value');this.value=v;this.calls.push(['target',v,...args]);},cancelScheduledValues(){}});
 const node=(kind,extra={})=>{const n={kind,...extra,connections:[],connect(to){this.connections.push(to);return to;},disconnect(){this.connections=[];this.disconnected=true;}};nodes.push(n);return n;};
 const ctx={state:'running',currentTime:0,sampleRate:8000,
  createBufferSource(){const s=node('source',{playbackRate:parameter(),starts:[],stops:[],start(...a){this.starts.push(a);},stop(...a){this.stops.push(a);}});sources.push(s);return s;},
  createGain:()=>node('gain',{gain:parameter()}),createBiquadFilter:()=>node('filter',{frequency:parameter(),Q:parameter()}),
  createPanner:()=>node('hrtf',{positionX:parameter(),positionY:parameter(),positionZ:parameter()}),createStereoPanner:()=>node('pan',{pan:parameter()}),
  createBuffer(channels,length,rate){return{duration:length/rate,numberOfChannels:channels,getChannelData:()=>new Float32Array(length)};},
  async decodeAudioData(b){return{duration:b.byteLength>=8?new DataView(b).getFloat64(0,true):seconds[new Uint8Array(b)[0]],numberOfChannels:1};}};
 const destination=node('provided-sfx');ctx.destination=node('hardware');let pair=noAudio?null:{ctx,destination};
 const material=JSON.parse(readFileSync('public/audio/source-demolition/manifest.json'));
 const runtime=createSourceEarthfallAudio({getAudio:()=>pair,urlFor:f=>'/material/'+f,
  fetcher:async url=>{if(url.endsWith('manifest.json'))return{ok:true,json:async()=>material};const clip=material.clips.find(c=>url.endsWith(c.file)),b=new ArrayBuffer(clip.bytes);new DataView(b).setFloat64(0,clip.duration,true);return{ok:true,arrayBuffer:async()=>b};},
  gagUrlFor:f=>'/gag/'+f,gagFetcher:async url=>{fetches.push(url);if(gate)await gate;if(fail)return{ok:false,status:404};const i=files.findIndex(f=>url.endsWith(f));assert.ok(i>=0);return{ok:true,arrayBuffer:async()=>new Uint8Array([i]).buffer};},
  createAsideDoorAudio:()=>({update(){},event(e,p){doors.push({e,p});},whenReady:async()=>true,pause(){},dispose(){},snapshot:()=>({doorFixture:true})})});
 return{runtime,ctx,sources,nodes,fetches,doors,destination,setAudio:p=>{pair=p;}};
}
const pose=(elapsed=0,extra={})=>({active:true,runId:'earthfall-gag-test',elapsed:0,blackoutAlpha:0,eye:[65.15,1.62,11.65],yaw:-.75,pitch:0,doors:[],materialEvents:[],
 gag:{enabled:true,elapsed,phase:elapsed<6?'rest':elapsed<7.59?'running':'spent',mount:{x:63,y:1.15,z:8.8},speaker:{x:62.8,y:.965,z:8.6},contact:{x:62.9,y:1.15,z:8.9}},...extra});
const cue=(kind,at)=>({id:'same-apparatus-id',type:'threshold-gag-'+kind,at,chartId:0,position:kind==='boo'||kind==='speaker-click'?pose().gag.speaker:kind==='release'?pose().gag.mount:pose().gag.contact});
async function prepared(f=fixture()){assert.equal(await f.runtime.prepareAside(),true);f.runtime.updateAside(pose());return f;}

test('the aside waits for all four unchanged human/mechanical clips without playing or touching hardware output',async()=>{
 let release;const f=fixture({gate:new Promise(r=>release=r)});let settled=false;const pending=f.runtime.prepareAside().then(v=>{settled=true;return v;});await Promise.resolve();await Promise.resolve();
 assert.equal(settled,false);assert.equal(f.runtime.asideGagReady(),false);assert.equal(f.sources.length,0);release();assert.equal(await pending,true);assert.equal(f.runtime.asideGagReady(),true);assert.equal(f.fetches.length,4);
 assert.ok(f.fetches.some(u=>u.endsWith('boo.wav?v=human-short-heavy-room-4')));assert.equal(await f.runtime.prepareAside(),true);assert.equal(f.fetches.length,4);assert.equal(f.sources.length,0);
 const missing=fixture({noAudio:true});assert.equal(await missing.runtime.prepareAside(),false);assert.equal(missing.runtime.asideGagReady(),false);
 const failed=fixture({fail:true});assert.equal(await failed.runtime.prepareAside(),false);assert.match(failed.runtime.asideSnapshot().gag.error,/unavailable/);
 f.runtime.destroy();missing.runtime.destroy();failed.runtime.destroy();
});

test('all five event kinds sharing one apparatus id play once at exact edges, through the same HRTF speaker/gain',async()=>{
 const f=await prepared();const edges=[['release',6],['stop',6.19],['rattle',6.41],['speaker-click',6.5],['boo',6.6]];
 for(const[kind,at]of edges){f.ctx.currentTime=at;f.runtime.updateAside(pose(at),{events:[cue(kind,at)]});}
 let g=f.runtime.asideSnapshot().gag;assert.equal(g.played,5);assert.equal(g.skipped,0);assert.deepEqual(g.receipts.map(e=>e.reason),Array(5).fill('played'));assert.equal(f.doors.length,0,'gag ids never enter the door dispatcher');
 f.runtime.updateAside(pose(6.6),{events:edges.map(([k,t])=>cue(k,t))});assert.equal(f.runtime.asideSnapshot().gag.played,5);
 const word=g.history.find(e=>e.type==='played'&&e.kind==='boo');assert.deepEqual(word.position,pose().gag.speaker);assert.equal(word.duration,.9204166667);assert.equal(word.start,6.6);
 assert.ok(g.layers.every(v=>v.hrtf));assert.ok(f.sources.every(s=>s.playbackRate.value===1&&!s.loop&&s.starts.length===1));assert.ok(f.nodes.every(n=>!n.connections.includes(f.ctx.destination)));assert.ok(f.nodes.some(n=>n.connections.includes(f.destination)));
 const moved=pose(6.65);moved.gag.speaker={x:66,y:1.3,z:10};moved.yaw+=Math.PI;f.runtime.updateAside(moved);g=f.runtime.asideSnapshot().gag;assert.deepEqual(g.layers.find(v=>v.kind==='boo').position,moved.gag.speaker);assert.equal(g.played,5);
 moved.gag.soundPose={mount:moved.gag.mount,contact:moved.gag.contact,speaker:{x:67,y:.6,z:11}};f.runtime.updateAside(moved);assert.deepEqual(f.runtime.asideSnapshot().gag.layers.find(v=>v.kind==='boo').position,moved.gag.soundPose.speaker,'the carried speaker wins over the authored uncarried mount');f.runtime.destroy();
});

test('pause, recording/listening/playback protection, hidden/focus and suspended context clear voices and consume missed edges',async()=>{
 for(const options of[{protected:true},{suspended:true},{hidden:true},{focused:false},{contextSuspended:true}]){
  const f=await prepared();f.runtime.updateAside(pose(6),{events:[cue('release',6)]});assert.equal(f.runtime.asideSnapshot().gag.voices,1);
  if(options.contextSuspended)f.ctx.state='suspended';f.runtime.updateAside(pose(6.6),{...options,events:[cue('boo',6.6)]});assert.equal(f.runtime.asideSnapshot().gag.voices,0);
  f.ctx.state='running';f.runtime.updateAside(pose(6.6),{events:[cue('boo',6.6)]});assert.equal(f.runtime.asideSnapshot().gag.played,1,'a missed spoken edge cannot catch up');f.runtime.destroy();
 }
});

test('stale and first-observed restored edges are receipts, never a reload or delayed backlog',async()=>{
 const late=await prepared();late.runtime.updateAside(pose(7.1),{events:[cue('boo',6.6)]});assert.equal(late.runtime.asideSnapshot().gag.played,0);assert.equal(late.runtime.asideSnapshot().gag.receipts[0].reason,'stale-no-backlog');late.runtime.updateAside(pose(7.2),{events:[cue('boo',7.2)]});assert.equal(late.runtime.asideSnapshot().gag.played,0);late.runtime.destroy();
 const saved=fixture();await saved.runtime.prepareAside();saved.runtime.updateAside(pose(6.6),{events:[cue('boo',6.6)]});assert.equal(saved.runtime.asideSnapshot().gag.played,0);assert.equal(saved.runtime.asideSnapshot().gag.receipts[0].reason,'restored-baseline');saved.runtime.destroy();
});

test('a reused paused owner prepares again and keeps once-only receipts until the actual run changes',async()=>{
 const f=await prepared();f.runtime.updateAside(pose(6),{events:[cue('release',6)]});f.runtime.stopAside();assert.equal(f.runtime.asideSnapshot().gag.voices,0);assert.equal(await f.runtime.prepareAside(),true);assert.equal(f.fetches.length,4);
 f.runtime.updateAside(pose(6.6),{events:[cue('release',6),cue('boo',6.6)]});assert.equal(f.runtime.asideSnapshot().gag.played,2);
 f.runtime.updateAside(pose(0,{runId:'new-run'}));f.runtime.updateAside(pose(6,{runId:'new-run'}),{events:[cue('release',6)]});assert.equal(f.runtime.asideSnapshot().gag.played,3);f.runtime.destroy();assert.equal(f.runtime.asideSnapshot().gag.disposed,true);
});

test('the gag clock cannot start charges or roar early; unchanged demolition-relative timing remains authoritative',async()=>{
 const f=await prepared();await f.runtime.ready();f.runtime.updateAside(pose(6.6),{events:[cue('boo',6.6)]});const before=f.sources.length;assert.equal(before,1);assert.equal(f.runtime.snapshot().aside.materialHistory.length,0);assert.equal(f.runtime.snapshot().rumble.playing,false);
 const charges={id:'earthfall-charge-onset',type:'charges',at:ASIDE.chargeAt,age:0,position:ASIDE.center,charges:CHARGES.map(c=>({...c,offset:c.at-ASIDE.chargeAt}))};
 f.runtime.updateAside(pose(12,{elapsed:ASIDE.chargeAt,materialEvents:[charges]}));assert.equal(f.sources.length,before+CHARGES.length);assert.equal(f.runtime.snapshot().aside.materialHistory[0].reason,'played');assert.equal(ASIDE.chargeAt,2);assert.equal(ASIDE.wallsAt.north,3.35);
 f.runtime.updateAside(pose(12,{elapsed:ASIDE.chargeAt,materialEvents:[charges]}));assert.equal(f.sources.length,before+CHARGES.length,'the charge ripple does not repeat');f.runtime.destroy();
});

test('all four chase restraint attacks reach real material playback with finite positive gain exactly once',async()=>{
 const f=await prepared();assert.equal(await f.runtime.ready(),true);
 const gains=[];
 for(const [i,compression] of [.01,.26,.51,.76].entries()){
  f.ctx.currentTime=i*1.5;
  const before=f.nodes.length;
  const frame=pose(8,{chase:{phase:'chase',compression}});
  assert.doesNotThrow(()=>f.runtime.updateAside(frame));
  const level=f.nodes.slice(before).find(n=>n.kind==='gain'&&n.gain.calls.some(c=>c[0]==='ramp'));
  assert.ok(level,'the retained material recording has an actual scheduled gain envelope');
  const peak=Math.max(...level.gain.calls.map(c=>c[1]));
  assert.ok(Number.isFinite(peak)&&peak>0);gains.push(peak);
  f.runtime.updateAside(frame);
 }
 assert.equal(f.sources.length,4,'each compression threshold earns one source, with no repeat on the same frame');
 assert.ok(gains.every((gain,i)=>!i||gain>gains[i-1]));
 assert.ok(f.sources.every(s=>s.starts.length===1&&s.starts[0].every(Number.isFinite)&&s.playbackRate.value===1));
 const history=f.runtime.snapshot().aside.materialHistory;
 assert.equal(history.length,4);assert.ok(history.every(e=>e.type==='chase-restraint'&&e.reason==='played'));
 assert.equal(new Set(history.map(e=>e.id)).size,4);assert.equal(new Set(history.map(e=>`${e.position.x},${e.position.z}`)).size,4,'failures remain anchored at four distinct room piers');
 f.runtime.destroy();
});

test('real aside controller edges earn the same mechanical timings before the unchanged demolition clock begins',async()=>{
 const f=await prepared();let state=freshSourceEarthfallElleryAside({runId:'actual-aside-gag'});const events=[];f.runtime.updateAside(sourceEarthfallElleryAsideFrame(state));
 for(let i=0;i<Math.ceil(EARTHFALL_GAG.completeAt*120)+2&&!state.gag.complete;i++){
  const result=stepSourceEarthfallElleryAside(state,{dt:1/120,gagAudioReady:true,assetsReady:true});state=result.state;events.push(...result.events);f.ctx.currentTime+=1/120;
  const frame=sourceEarthfallElleryAsideFrame(state);f.runtime.updateAside(frame,{events:result.events});assert.equal(state.elapsed,0,'recognition never advances charge/wall time');
 }
 assert.equal(state.gag.complete,true);const cueEvents=events.filter(e=>e.type.startsWith('threshold-gag-'));
 assert.deepEqual(cueEvents.map(e=>e.type),['threshold-gag-release','threshold-gag-stop','threshold-gag-rattle','threshold-gag-speaker-click','threshold-gag-boo']);
 for(const[e,offset]of cueEvents.map((e,i)=>[e,[0,.19,.41,.5,.6][i]]))assert.ok(Math.abs(e.at-EARTHFALL_GAG.releaseAt-offset)<1e-8);
 assert.equal(f.runtime.asideSnapshot().gag.played,5);assert.equal(f.runtime.asideSnapshot().gag.skipped,0);assert.equal(f.runtime.snapshot().aside.materialHistory.length,0);f.runtime.destroy();
});
