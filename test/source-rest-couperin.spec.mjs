import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSourceRestCouperin,sourceRestCouperinMix,sourceRestCouperinSpace,advanceSourceRestCouperinBlend,SOURCE_REST_COUPERIN_BLEND,SOURCE_REST_COUPERIN_URL,SOURCE_REST_COUPERIN_DURATION} from '../src/audio/source-rest-couperin.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {SOURCE_CONTINUATION} from '../src/data/source-continuation.js';

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
    createStereoPanner(){const n=node('panner');n.pan=new Param(0);return n;},
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

test('the Catch gives both aligned versions moving spatial presence before sitting',async()=>{
  const seat=SOURCE_REST_SEATS.find(s=>s.phase==='catch'),destination=SOURCE_CONTINUATION.catch.finalDoor,bench={phase:'catch',x:seat.x,z:seat.z,feet:seat.feet,yaw:0},door={phase:'catch',x:destination.x,z:destination.z,feet:destination.y,yaw:0};
  const nearBench=sourceRestCouperinSpace(bench,null,10),nearDoor=sourceRestCouperinSpace(door,null,10);
  assert.ok(nearDoor.electronic>nearBench.electronic+.15);
  assert.ok(Math.abs(nearBench.acousticPan-nearBench.electronicPan)>.1);
  assert.equal(sourceRestCouperinSpace({phase:'wrong-return'},null,0),null);
  const f=fixture();f.owner.start();await flush();
  for(let n=1;n<=600;n++){f.ctx.currentTime=n/60;f.media.currentTime=n/60;f.owner.update({spatialState:door,progress:0});}
  const state=f.owner.snapshot().revoicing;
  assert.ok(state.electronic>.15,'the electronic version is audible without narrative progress');
  assert.ok(state.targetElectronic>.2);assert.equal(f.nodes.filter(n=>n.kind==='panner').length,2);
  assert.ok(f.nodes.filter(n=>n.kind==='panner').every(n=>n.pan.events.length>1));
  assert.equal(f.nodes.filter(n=>n.kind==='source').length,1);
  f.ctx.currentTime+=1/60;f.media.currentTime+=1/60;f.owner.update({spatialState:bench,progress:.54});
  assert.ok(f.owner.snapshot().revoicing.targetElectronic>.6,'the seated narrative can still reach its authored electronic peak');
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
test('a narrative jump becomes a slow audio-clock transition while the original human and room remain present',async()=>{
  const f=fixture();f.owner.start();await flush();const convolver=f.nodes.find(n=>n.kind==='convolver'),room=convolver.buffer,count=f.nodes.length;
  f.ctx.currentTime=1/60;f.media.currentTime=1/60;f.owner.update({progress:.54});const first=f.owner.snapshot().revoicing;
  assert.ok(first.electronic<=SOURCE_REST_COUPERIN_BLEND.maximumAmountPerSecond/60+1e-9);assert.ok(first.targetElectronic>.6);assert.ok(first.acousticGain>.99);
  for(let n=2;n<=60*60;n++){f.ctx.currentTime=n/60;f.media.currentTime=n/60;f.owner.update({progress:.54});}
  const audible=f.owner.snapshot().revoicing;assert.ok(audible.electronic>.5&&audible.electronic<.72);assert.ok(audible.acousticGain>.42);assert.ok(Math.abs(audible.acousticGain**2+audible.electronicGain**2-1)<1e-12);
  assert.equal(convolver.buffer,room,'ordinary mix changes retain the same room tail');assert.equal(f.nodes.length,count);assert.equal(f.media.playCount,1);
});
test('gain automation does not restart at game frame rate or repeatedly reopen an already open output gate',async()=>{
  const f=fixture();f.owner.start();await flush();const gains=f.nodes.filter(n=>n.kind==='gain'),acoustic=gains[0],electronic=gains[1],gate=gains[4];
  const unchanged=acoustic.gain.events.length+electronic.gain.events.length,open=gate.gain.events.length;
  for(let n=1;n<=120;n++){f.ctx.currentTime=n/60;f.media.currentTime=n/60;f.owner.update({progress:0});}
  assert.equal(acoustic.gain.events.length+electronic.gain.events.length,unchanged);assert.equal(gate.gain.events.length,open);
  const before=electronic.gain.events.filter(e=>e[0]==='ramp').length;
  for(let n=121;n<=180;n++){f.ctx.currentTime=n/60;f.media.currentTime=n/60;f.owner.update({progress:.54});}
  const ramps=electronic.gain.events.filter(e=>e[0]==='ramp').length-before;assert.ok(ramps>0&&ramps<=11,'one smooth control transition per tenth-second, rather than 60 cancelled ramps');
});
test('a long pause cannot spend the missing time moving to a different blend on resume',async()=>{
  const f=fixture();f.owner.start();await flush();for(let n=1;n<=300;n++){f.ctx.currentTime=n/60;f.media.currentTime=n/60;f.owner.update({progress:.54});}
  const before=f.owner.snapshot().revoicing.electronic;f.owner.update({paused:true});f.ctx.currentTime+=100;f.owner.update({paused:false,progress:.8});await flush();
  assert.equal(f.owner.snapshot().revoicing.electronic,before);f.ctx.currentTime+=1/60;f.owner.update({progress:.8});assert.ok(f.owner.snapshot().revoicing.electronic-before<=SOURCE_REST_COUPERIN_BLEND.maximumAmountPerSecond/60+1e-9);
});
test('the blend director is stable across update rates and bounds both progress jumps and stalled updates',()=>{
  const run=rate=>{let x=0;for(let n=0;n<rate*20;n++)x=advanceSourceRestCouperinBlend(x,.72,1/rate);return x;};
  assert.ok(Math.abs(run(60)-run(15))<.001);assert.equal(advanceSourceRestCouperinBlend(.3,.72,0),.3);assert.equal(advanceSourceRestCouperinBlend(.3,.72,NaN),.3);
  assert.ok(advanceSourceRestCouperinBlend(0,.72,100)<=.25*SOURCE_REST_COUPERIN_BLEND.maximumAmountPerSecond+1e-9);
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

test('between the bench and the door both versions loosen into a crossing carousel, then settle',async()=>{
  const {SOURCE_REST_COUPERIN_SPACE:S}=await import('../src/audio/source-rest-couperin.js');
  const seat=SOURCE_REST_SEATS.find(s=>s.phase==='catch'),door=SOURCE_CONTINUATION.catch.finalDoor;
  const middle={phase:'catch',x:-166,z:-92,feet:-12.6,yaw:Math.PI/2,pitch:0};
  const angle=s=>Math.acos(s.voices.acoustic.direction.reduce((sum,v,k)=>sum+v*s.voices.electronic.direction[k],0));
  const pans=[];
  for(let t=0;t<=S.carouselSeconds;t+=S.carouselSeconds/8){
    const s=sourceRestCouperinSpace(middle,null,t);
    assert.ok(s.between>.8&&s.carousel>.6,`loose at the crossing (${s.between}, ${s.carousel})`);
    assert.ok(angle(s)>2,'the two versions stand on opposite sides of the listener');
    pans.push(s.voices.acoustic.pan);
  }
  assert.ok(Math.min(...pans)<-.5&&Math.max(...pans)>.5,'the carousel carries each version across both ears');
  const atDoor=sourceRestCouperinSpace({phase:'catch',x:door.x-2,z:door.z,feet:door.y,yaw:Math.PI/2,pitch:0},null,4),{acoustic:a,electronic:e}=atDoor.voices;
  assert.ok(atDoor.carousel<.05&&atDoor.electronic>.75,'the door island belongs to the revoicing');
  assert.ok(e.direction[2]<0&&e.presence>a.presence*1.6,'facing the door, the revoicing is ahead and present');
  assert.ok(a.cutoff<e.cutoff/3&&a.send>e.send,'the far acoustic version is darker and stands in more air');
  const seated=sourceRestCouperinSpace({phase:'catch',x:seat.x,z:seat.z,feet:seat.feet,yaw:Math.PI/2,pitch:0},null,30,{gather:1});
  assert.equal(seated.electronic,0);
  for(const p of Object.values(seated.positions))assert.ok(Math.abs(Math.hypot(p.x-seat.x,p.z-seat.z)-S.benchRadius)<1e-9,'both versions circle the bench');
});

test('each stem is shaded, darkened and placed through its own HRTF panner and air send',async()=>{
  const f=fixture();
  f.ctx.createPanner=()=>{const n=new Node('hrtf');for(const k of['positionX','positionY','positionZ'])n[k]=new Param(0);f.nodes.push(n);return n;};
  f.ctx.createBiquadFilter=()=>{const n=new Node('filter');n.frequency=new Param(350);n.Q=new Param(1);f.nodes.push(n);return n;};
  const door=SOURCE_CONTINUATION.catch.finalDoor,seat=SOURCE_REST_SEATS.find(s=>s.phase==='catch');
  f.owner.start();await flush();
  const panners=f.nodes.filter(n=>n.kind==='hrtf'),filters=f.nodes.filter(n=>n.kind==='filter'),convolver=f.nodes.find(n=>n.kind==='convolver');
  assert.equal(panners.length,2);assert.equal(f.nodes.filter(n=>n.kind==='panner').length,0);
  assert.ok(panners.every(p=>p.panningModel==='HRTF'&&p.rolloffFactor===0),'distance is authored, not doubled by the panner');
  assert.equal(f.nodes.filter(n=>n.connections.some(c=>c.node===convolver)).length,3,'one shared room plus one air send per stem');
  let clock=0;const step=(state,extra={})=>{clock+=1/60;f.ctx.currentTime=clock;f.media.currentTime=clock;f.owner.update({spatialState:state,progress:0,...extra});};
  const atDoor={phase:'catch',x:door.x-2,z:door.z,feet:door.y,yaw:Math.PI/2,pitch:0};
  for(let n=0;n<600;n++)step(atDoor);
  const mix=f.owner.snapshot().revoicing;
  assert.ok(mix.electronicGain>mix.acousticGain*2,'at the door the revoicing leads');
  assert.ok(filters[0].frequency.value<filters[1].frequency.value/3,'the acoustic stem is darkened by distance');
  assert.ok(panners[1].positionZ.value<0,'the revoicing is placed ahead');
  const atSeat={phase:'catch',x:seat.x,z:seat.z,feet:seat.feet,yaw:Math.PI/2,pitch:0};
  for(let n=0;n<60*30;n++)step(atSeat,{seated:true});
  const rest=f.owner.snapshot().revoicing;
  assert.ok(rest.space.gather>.95&&rest.spaceElectronic<.05,'seated, the island field yields to the authored arc');
  assert.equal(f.nodes.filter(n=>n.kind==='source').length,1,'one decoder throughout');
});
