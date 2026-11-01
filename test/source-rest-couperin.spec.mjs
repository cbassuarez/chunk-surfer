import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSourceRestCouperin,sourceRestCouperinMix,SOURCE_REST_COUPERIN_URL,SOURCE_REST_COUPERIN_DURATION} from '../src/audio/source-rest-couperin.js';

class Param{
  constructor(value=1){this.value=value;this.events=[];}
  cancelAndHoldAtTime(at){this.events.push(['hold',at]);}
  setValueAtTime(value,at){this.value=value;this.events.push(['set',value,at]);}
  linearRampToValueAtTime(value,at){this.value=value;this.events.push(['ramp',value,at]);}
}
class Node{
  constructor(kind){this.kind=kind;this.gain=new Param();this.connections=[];}
  connect(node,...ports){this.connections.push({node,ports});return node;}
  disconnect(){this.connections=[];this.disconnected=true;}
}
class Media{
  constructor(){this.currentTime=0;this.duration=843.15712;this.paused=true;this.ended=false;this.seeking=false;this.events=new Map();this.playCount=0;}
  addEventListener(name,fn){this.events.set(name,fn);}
  removeEventListener(name){this.events.delete(name);}
  emit(name){this.events.get(name)?.();}
  play(){this.playCount++;this.paused=false;this.emit('playing');return Promise.resolve();}
  pause(){this.paused=true;}
  removeAttribute(){}load(){}
}
function fixture(){
  const nodes=[],media=new Media();let protect=false;
  const node=kind=>{const n=new Node(kind);nodes.push(n);return n;};
  const ctx={currentTime:0,state:'running',sampleRate:44100,
    createMediaElementSource(value){assert.equal(value,media);return node('source');},
    createChannelSplitter(count){assert.equal(count,2);return node('splitter');},createGain:()=>node('gain'),
    createConvolver:()=>node('convolver'),
    createBuffer(channels,length,sampleRate){return{numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,data:Array.from({length:channels},()=>new Float32Array(length)),getChannelData(i){return this.data[i];}};},
  };
  const out=node('out');const errors=[];
  const owner=createSourceRestCouperin({getAudio:()=>({ctx,destination:out}),protectedAudio:()=>protect,
    createElement:()=>media,urlFor:path=>'/'+path,onError:error=>errors.push(error.message)});
  return{owner,ctx,nodes,media,out,errors,setProtected:value=>protect=value};
}
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));

test('director conserves equal-power energy and gives distinct acoustic returns through decline',()=>{
  for(let p=0;p<=1;p+=.001){const m=sourceRestCouperinMix({progress:p,currentTime:321.2});
    assert.ok(Math.abs(m.acousticGain**2+m.electronicGain**2-1)<1e-12);
    assert.ok(m.electronic>=0&&m.electronic<=1);
  }
  assert.equal(sourceRestCouperinMix({progress:0}).electronic,0);
  assert.ok(sourceRestCouperinMix({progress:.54}).electronic>sourceRestCouperinMix({progress:.38}).electronic+.4);
  assert.ok(sourceRestCouperinMix({progress:.80}).electronic>sourceRestCouperinMix({progress:.67}).electronic+.4);
});

test('one decoder splits two stems into one shared room, never an unattenuated bypass',async()=>{
  const f=fixture();f.owner.start();await flush();
  assert.equal(f.nodes.filter(n=>n.kind==='source').length,1);
  const source=f.nodes.find(n=>n.kind==='source'),split=f.nodes.find(n=>n.kind==='splitter');
  assert.deepEqual(source.connections.map(c=>c.node.kind),['splitter']);
  assert.deepEqual(split.connections.map(c=>c.ports),[[0],[1]]);
  assert.equal(f.nodes.filter(n=>n.kind==='convolver').length,1);
  assert.equal(f.media.src,'/'+SOURCE_REST_COUPERIN_URL);assert.equal(f.owner.snapshot().playing,true);
  assert.equal(f.owner.snapshot().revoicing.sampleLocked,true);
  assert.equal(f.owner.snapshot().reverbSeconds,6.8);assert.equal(f.errors.length,0);
});

test('pause freezes audible position/progress and retires wet tails; resume does not seek or catch up',async()=>{
  const f=fixture();f.owner.start();await flush();f.owner.update();
  f.ctx.currentTime=7;f.media.currentTime=7;f.owner.update({progress:.54});
  const before=f.owner.snapshot();assert.equal(before.playedSeconds,7);
  f.owner.update({paused:true});assert.equal(f.owner.snapshot().playing,false);
  assert.equal(f.nodes.find(n=>n.kind==='convolver').buffer,null);
  f.ctx.currentTime=87;f.owner.update({paused:true});assert.equal(f.media.currentTime,7);assert.equal(f.owner.snapshot().playedSeconds,before.playedSeconds);
  f.owner.update({paused:false});await flush();f.owner.update();
  assert.equal(f.media.currentTime,7);assert.ok(f.nodes.find(n=>n.kind==='convolver').buffer);
  f.ctx.currentTime=88;f.media.currentTime=8;f.owner.update();assert.equal(f.owner.snapshot().playedSeconds,8);
  assert.equal(f.nodes.filter(n=>n.kind==='source').length,1);
});

test('protected audio and buffering mute both stems together, then recover the original phase',async()=>{
  const f=fixture();f.owner.start();await flush();f.owner.update();
  f.setProtected(true);f.owner.update();assert.equal(f.media.paused,true);assert.equal(f.owner.snapshot().protected,true);
  f.setProtected(false);f.owner.update();await flush();assert.equal(f.owner.snapshot().playing,true);
  f.media.emit('waiting');assert.equal(f.owner.snapshot().playing,false);assert.equal(f.owner.snapshot().buffering,true);
  f.media.emit('playing');assert.equal(f.owner.snapshot().playing,true);
  assert.equal(f.media.currentTime,0);
});

test('a seek is not counted as listening; terminal ownership stops at this actual cycle',async()=>{
  const f=fixture();f.owner.start();await flush();f.owner.update();f.ctx.currentTime=1;f.media.currentTime=1;f.owner.update();
  f.media.seeking=true;f.media.emit('seeking');f.media.currentTime=750;f.media.seeking=false;f.media.emit('seeked');f.owner.update();
  assert.equal(f.owner.snapshot().playedSeconds,1);
  assert.equal(f.owner.finishAfterCycle(),true);assert.equal(f.media.loop,false);
  f.media.currentTime=f.media.duration;f.media.ended=true;f.media.paused=true;f.media.emit('ended');
  const calls=f.media.playCount;f.owner.update();assert.equal(f.media.playCount,calls);
  assert.equal(f.owner.snapshot().ended,true);assert.equal(f.owner.snapshot().completedFirstCycle,true);
});

test('codec failure is surfaced and dispose disconnects every owned node',async()=>{
  const f=fixture();f.owner.start();await flush();f.media.error={message:'decode failed'};f.media.emit('error');
  assert.equal(f.owner.snapshot().failed,'decode failed');assert.equal(f.owner.snapshot().playing,false);assert.deepEqual(f.errors,['decode failed']);
  f.owner.dispose();assert.ok(f.nodes.filter(n=>n!==f.out).every(n=>n.disconnected));
  assert.equal(f.owner.snapshot().disposed,true);assert.equal(f.owner.start(),false);
});

test('full composition duration and unusual values remain bounded, without voice/error effects',()=>{
  assert.ok(SOURCE_REST_COUPERIN_DURATION>840&&SOURCE_REST_COUPERIN_DURATION<850);
  for(const input of [{progress:NaN},{progress:-2},{progress:9},{faculty:NaN},{currentTime:Infinity}]){
    const m=sourceRestCouperinMix(input);assert.ok(Object.values(m).every(Number.isFinite));
  }
});

test('shipped stereo carrier matches measured full-performance provenance and retains two independent channels',()=>{
  const folder=new URL('../public/audio/source-rest/couperin/',import.meta.url);
  const report=JSON.parse(readFileSync(new URL('couperin-revoicing.json',folder),'utf8'));
  const bytes=readFileSync(new URL('couperin-revoiced-pair.mp3',folder));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),report.pairSha256);
  assert.equal(report.sourceSha256,'f9a9f0cefd38a4b7742f25e7636f88830b8a8ceed41167da7193426d0f80ae3a');
  assert.ok(Math.abs(report.duration-SOURCE_REST_COUPERIN_DURATION)<.001);
  assert.equal(report.measurements.clippedSamples,0);assert.equal(report.measurements.nonfiniteSamples,0);
  assert.ok(report.measurements.dryDecodedWorstEqualPowerPeak<.34);
  assert.ok(report.notes.length>1000);assert.equal(report.notes.length,report.noteCount);
  assert.equal(report.licence,'CC0 1.0');assert.equal(report.channels['1'],'new note synthesis');
  let at=bytes.toString('ascii',0,3)==='ID3'?10+((bytes[6]&127)<<21)+((bytes[7]&127)<<14)+((bytes[8]&127)<<7)+(bytes[9]&127):0;
  while(at<bytes.length-4&&!(bytes[at]===255&&(bytes[at+1]&224)===224))at++;
  assert.ok(at<bytes.length-4);assert.equal(bytes[at+3]>>6,0,'independent stereo, not mono or mid/side');
  assert.equal((bytes[at+2]>>2)&3,2,'MPEG1 sample-rate index2 is32kHz');
});
