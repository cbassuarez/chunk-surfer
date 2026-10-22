import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const begin=main.indexOf("const LAST_LIGHT_AUDIO='audio/outskirts/last-light.mp3';");
const end=main.indexOf('\nfunction enterHorizon(',begin);
assert.ok(begin>0&&end>begin,'test executes the actual last-light lifecycle functions');
const lines=JSON.parse(readFileSync(new URL('../content/narrative/source-space.last-light.story.json',import.meta.url),'utf8')).nodes.recording.lines;
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function harness({elapsed=0,started=false,heard=false,playbackDone=false,buffer={duration:90},fetcher=null}={}){
  const sources=[],nodes=[],captions=[],saved=[],positions=[],flags=new Set(heard?['outskirts.lastLight.heard']:[]),timers=new Map();
  let playback={started,elapsed,done:playbackDone},fetches=0;
  const node=()=>{const n={disconnected:false,connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
  const ctx={currentTime:2,decodeAudioData:async()=>buffer,createBufferSource(){const s=node();s.starts=[];s.stops=0;s.start=(...args)=>s.starts.push(args);s.stop=()=>s.stops++;sources.push(s);return s;},
    createBiquadFilter(){return {...node(),frequency:{value:0},Q:{value:0}};},createGain(){return {...node(),gain:{value:0}};}};
  const runtime={out:false,hold:false,reached:false,inView:true,outskirtsLastLight(){return this.inView?{reached:this.reached,out:this.out,playback}:null;},setLastLightPlayback(value){playback={...value};},setLastLightOut(value){this.out=value;},setLastLightHold(value){this.hold=value;},state(){return {playback:{...playback}};},outskirtsTapeHead(){return {x:3,y:4};},setPlayerPosition(value){positions.push(value);}};
  const sandbox={actx:ctx,sfxGain:{},master:{},paused:false,chunkSurfRuntime:runtime,performance:{now:()=>ctx.currentTime*1000},ensureCtx(){},
    runtimeTree:()=>({recording:{lines}}),assetUrl:path=>path,
    fetch:async(...args)=>{fetches++;return fetcher?fetcher(...args):{ok:!!buffer,arrayBuffer:async()=>new ArrayBuffer(1)};},
    CUES:{CUE:{door:'door',light:'light'},playCue(){}},STORY:{startTapeHiss(){},stopTapeHiss(){}},
    SPEECH:{say(line,options){const caption={line,options,cancelled:false,cancel(){this.cancelled=true;}};captions.push(caption);return caption;}},
    flagTest:key=>flags.has(key),flagApply:keys=>keys.forEach(key=>flags.add(key)),getSave:()=>({flags:Object.fromEntries([...flags].map(key=>[key,true]))}),saveCommit:value=>saved.push(value),
    setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    R3:{r3dFacing:()=>0},px:87,py:-2049,trail:[{x:87,y:-2048}],renderMove:{fromY:-2048},motionRig:{phase:.6},syncSourceRender(){}};
  vm.createContext(sandbox);vm.runInContext(main.slice(begin,end)+'\nglobalThis.api={syncLastLight,pauseOutskirtsLastLight,resetOutskirtsLastLight,lastLight};',sandbox);
  return {sandbox,api:sandbox.api,ctx,runtime,sources,nodes,captions,saved,positions,flags,timers,get playback(){return playback;},get fetches(){return fetches;}};
}

test('a restored recording resumes at its saved offset and gameplay pause cannot consume the remaining memory',async()=>{
  const h=harness({started:true,elapsed:20});
  h.api.syncLastLight();await flush();
  assert.deepEqual(h.sources[0].starts[0],[0,20]);assert.equal(h.runtime.hold,true);
  h.ctx.currentTime=5.5;h.api.syncLastLight();assert.equal(h.playback.elapsed,23.5);
  h.ctx.currentTime=5.75;h.sandbox.paused=true;h.api.pauseOutskirtsLastLight();
  assert.equal(h.playback.elapsed,23.75);assert.equal(h.sources[0].stops,1);
  h.ctx.currentTime=200;h.api.syncLastLight();assert.equal(h.sources.length,1);
  h.sandbox.paused=false;h.api.syncLastLight();await flush();
  assert.deepEqual(h.sources[1].starts[0],[0,23.75]);
  assert.equal(h.playback.done,false);assert.ok(h.saved.length>=2);
});

test('missing authored voices show only the remaining unchanged script, with no synthetic voice or skipped ending',async()=>{
  const h=harness({started:true,elapsed:60,buffer:null});
  const {trail,renderMove,motionRig}=h.sandbox;
  h.api.syncLastLight();await flush();h.ctx.currentTime=4.5;h.api.syncLastLight();
  assert.equal(h.sources.length,0);
  assert.equal(h.captions.length,lines.filter(line=>line.at>=60&&line.at<=62.5).length);
  assert.equal(h.captions.at(-1).line.text,'Her: '+lines.find(line=>line.at===62.5).text);
  assert.ok(h.captions.every(caption=>caption.line.voice===false&&caption.options.interrupt===true));
  assert.equal(h.flags.has('outskirts.lastLight.heard'),false);
  h.ctx.currentTime=34;h.api.syncLastLight();
  assert.equal(h.flags.has('outskirts.lastLight.heard'),true);assert.equal(h.playback.done,true);assert.equal(h.runtime.out,true);
  assert.equal(h.timers.size,0,'the recording ends in place without scheduling a delayed threshold handoff');
  assert.equal(h.runtime.hold,false);assert.equal(h.sandbox.px,87);assert.equal(h.sandbox.py,-2049);
  assert.equal(h.sandbox.trail,trail);assert.equal(h.sandbox.renderMove,renderMove);assert.equal(h.sandbox.motionRig,motionRig);
  assert.deepEqual(h.positions,[],'completion never rewrites the runtime body position');
});

test('a completed memory cannot replay after reload and an abandoned pending decode cannot revive after a warp',async()=>{
  const done=harness({heard:true});done.runtime.reached=true;done.api.syncLastLight();
  assert.equal(done.fetches,0);assert.equal(done.runtime.out,true);assert.equal(done.sources.length,0);
  let resolve;
  const pending=harness({fetcher:()=>new Promise(next=>{resolve=next;})});
  pending.runtime.reached=true;pending.api.syncLastLight();pending.api.resetOutskirtsLastLight();
  resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await flush();
  assert.equal(pending.sources.length,0);assert.equal(pending.runtime.hold,false);assert.equal(pending.api.lastLight.started,false);
});

test('an active memory keeps its clock and finishes after the player leaves the trigger area',async()=>{
  const h=harness({started:true,elapsed:60,buffer:null});
  h.api.syncLastLight();await flush();
  h.runtime.inView=false;h.ctx.currentTime=4.5;h.api.syncLastLight();
  assert.equal(h.captions.at(-1).line.text,'Her: '+lines.find(line=>line.at===62.5).text);
  assert.equal(h.playback.done,false);
  h.ctx.currentTime=34;h.api.syncLastLight();
  assert.equal(h.flags.has('outskirts.lastLight.heard'),true);
  assert.equal(h.playback.done,true);assert.equal(h.runtime.out,true);
});

test('the playback clock releases the body even when the browser omits the audio ended event',async()=>{
  const h=harness({started:true,elapsed:88});
  h.api.syncLastLight();await flush();
  assert.equal(h.runtime.hold,true);
  h.ctx.currentTime=4.1;h.api.syncLastLight();
  assert.equal(h.playback.done,true);assert.equal(h.runtime.hold,false);
  assert.equal(h.sources[0].stops,1);assert.equal(h.api.lastLight.source,null);
});

for(const completed of [{heard:true},{playbackDone:true}])test(`a restored completion releases an existing recording hold (${Object.keys(completed)[0]})`,()=>{
  const h=harness(completed);h.runtime.hold=true;
  h.api.syncLastLight();
  assert.equal(h.runtime.hold,false);assert.equal(h.runtime.out,true);
});

test('completion clears the final caption and reset always releases the body',async()=>{
  const h=harness({started:true,elapsed:88,buffer:null});
  h.api.syncLastLight();await flush();h.ctx.currentTime=3.1;h.api.syncLastLight();
  assert.ok(h.captions.length>0);
  h.ctx.currentTime=6;h.api.syncLastLight();
  assert.equal(h.captions.at(-1).cancelled,true);
  h.runtime.hold=true;h.api.resetOutskirtsLastLight();
  assert.equal(h.runtime.hold,false);
});
