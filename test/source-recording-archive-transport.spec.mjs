import test from 'node:test';
import assert from 'node:assert/strict';
import * as PB from '../src/game/playback.js';
import { makeTapeDamage,tapeDamageGainAt,tapeDamageEnvelope } from '../src/game/tape-damage.js';

class Param{constructor(value=0){this.value=value;this.events=[];}setValueAtTime(value,when){this.value=value;this.events.push(['set',value,when]);}
 linearRampToValueAtTime(value,when){this.value=value;this.events.push(['linear',value,when]);}exponentialRampToValueAtTime(value,when){this.value=value;this.events.push(['exponential',value,when]);}cancelScheduledValues(){}}
class Node{constructor(type){this.type=type;this.gain=new Param(1);this.pan=new Param();this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param(1);this.starts=[];this.stops=[];this.connections=[];}
 connect(destination){this.connections.push(destination);return destination;}disconnect(){this.disconnected=true;}start(...args){this.starts.push(args);}stop(...args){this.stops.push(args);}}
class Context{constructor(){this.sampleRate=8000;this.currentTime=10;this.sources=[];this.gains=[];}
 createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,sampleRate:rate,length,numberOfChannels:channels,getChannelData:channel=>data[channel]};}
 createBufferSource(){const node=new Node('source');this.sources.push(node);return node;}createGain(){const node=new Node('gain');this.gains.push(node);return node;}
 createBiquadFilter(){return new Node('filter');}createStereoPanner(){return new Node('pan');}createOscillator(){return new Node('oscillator');}}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ~= ${b}`);
const row=()=>({id:'held-original',ordinal:3,roomId:'main_b3',startSeconds:12,endSeconds:72,durationSeconds:60,status:'accepted',counted:true,
 audible:[['room',.4]],guest:{key:'guest'},presence:{peak:0,atSec:0},slate:{atSeconds:1,audioKey:'original-slate'},
 discrete:[{cueId:'earlier',atSec:2,gain:.3},{cueId:'at-offset',atSec:10,gain:.5},{cueId:'later',atSec:14,gain:.7}]});
const ref=()=>({schema:1,kind:'continuous-cabin',key:'exact-local-media',runId:'old-night',takeId:'old-take',captureId:'original-capture',
 durable:true,durationSeconds:60,frames:2880000,sampleRate:48000,channels:2,sha256:'a'.repeat(64)});
function reset(){
 PB.stopPlayback();PB.setTransportGate(null);PB.setTakeAccessGate(null);
 PB.loadTakes([{roomId:'new-night',durationSeconds:17.23,status:'accepted',counted:true,audible:[],discrete:[]}]);
 const ctx=new Context(),bus=ctx.createGain(),room=ctx.createBuffer(1,40000,8000),guest=ctx.createBuffer(1,32000,8000),events=[],slates=[],guests=[];
 PB.playbackInit({ctx,bus,chunkById:()=>null,chunkByKey:key=>key==='room'?{buffer:room}:key==='guest'?{buffer:guest}:null,
  pickGuest:()=>{throw Error('readonly preview must not create a guest');},scheduleDiscrete:(id,when,options)=>events.push({id,when,options}),
  playSlate:(slate,options)=>slates.push({slate,options}),onGuest:id=>guests.push(id),loadContinuousMedia:null,onPlaybackError:()=>{}});
 return{ctx,bus,room,guest,events,slates,guests};
}
test.afterEach(()=>{PB.stopPlayback();PB.setTransportGate(null);PB.setTakeAccessGate(null);PB.loadTakes([]);});

test('archived offset uses the original timeline, skips earlier slate/cues and keeps the active tape/head/row unchanged',()=>{
 const h=reset(),original=row(),before=JSON.stringify(original),tape=PB.serializeTakes(),head=PB.tapeTransport(),start=h.ctx.currentTime+.05;
 const play=PB.playArchivedTake(original,{offsetSeconds:10});
 assert.equal(PB.isArchivedPlaybackOwner(play),true);near(PB.archivedPlaybackPosition().positionSeconds,10);
 near(play.startedAt,start-10);near(play.endsAt,start+50);
 assert.deepEqual(h.events.map(e=>e.id),['at-offset','later']);near(h.events[0].when,start);near(h.events[1].when,start+4);
 h.ctx.currentTime+=1;PB.tickPlayback();assert.deepEqual(h.slates,[]);assert.deepEqual(h.guests,[]);
 assert.deepEqual(PB.tapeTransport(),head);assert.deepEqual(PB.serializeTakes(),tape);assert.equal(JSON.stringify(original),before);
 assert.ok(h.ctx.sources.every(source=>source.stops[0][0]===start+50));
});

test('rewinding and reel advance preserve archival loop phase and original guest gain instead of re-rolling a recording',()=>{
 const h=reset(),play=PB.playArchivedTake(row(),{offsetSeconds:10}),bed=play.nodes.find(n=>n.buffer&&n.buffer!==h.room&&n.buffer!==h.guest),room=h.ctx.sources.find(n=>n.buffer===h.room);
 const originalPhase=room.starts[0][1],bedBuffer=bed.buffer;
 const next=PB.seekArchivedPlayback(12);assert.equal(PB.isArchivedPlaybackOwner(play),false);assert.equal(PB.isArchivedPlaybackOwner(next),true);
 const laterRoom=h.ctx.sources.filter(n=>n.buffer===h.room).at(-1),laterBed=next.nodes.find(n=>n.buffer===bedBuffer);
 near(laterRoom.starts[0][1],(originalPhase+2)%h.room.duration);assert.ok(laterBed);
 const peak=PB.seekArchivedPlayback(28),guestSource=h.ctx.sources.filter(n=>n.buffer===h.guest).at(-1);
 near(guestSource.starts[0][1],(28*PB.PLAYBACK.guestRate)%h.guest.duration);
 const guestGain=peak.nodes.at(-1);near(guestGain.gain.events[0][1],PB.PLAYBACK.guestPeak);
 assert.deepEqual(h.guests,[],'readonly guest audio never emits the world event');
});

test('a future original slate still plays once, while advancing beyond it cannot replay the old spoken slate',()=>{
 const h=reset(),original=row();original.slate.atSeconds=12;
 const play=PB.playArchivedTake(original,{offsetSeconds:10});
 h.ctx.currentTime+=1;PB.tickPlayback();assert.equal(h.slates.length,0);
 h.ctx.currentTime+=1.2;PB.tickPlayback();assert.equal(h.slates.length,1);near(h.slates[0].options.when,play.startedAt);
 const moved=PB.seekArchivedPlayback(20);assert.ok(moved);h.ctx.currentTime+=1;PB.tickPlayback();assert.equal(h.slates.length,1);
});

test('paused reel changes are silent, resume uses the same selected position, and end-of-tape creates no fallback source',()=>{
 const h=reset(),head=PB.tapeTransport(),play=PB.playArchivedTake(row(),{offsetSeconds:7});
 h.ctx.currentTime+=2;PB.tickPlayback();const position=PB.archivedPlaybackPosition().positionSeconds;
 assert.equal(PB.pauseArchivedPlayback(true),play);const count=h.ctx.sources.length;
 h.ctx.currentTime+=100;assert.equal(PB.tickPlayback(),'paused');near(PB.archivedPlaybackPosition().positionSeconds,position);
 const moved=PB.seekArchivedPlayback(23);assert.equal(PB.isArchivedPlaybackOwner(moved),true);assert.equal(PB.archivedPlaybackPosition().paused,true);assert.equal(h.ctx.sources.length,count);
 const resumed=PB.pauseArchivedPlayback(false);assert.equal(PB.isArchivedPlaybackOwner(resumed),true);near(PB.archivedPlaybackPosition().positionSeconds,23);
 assert.ok(h.ctx.sources.length>count);const beforeEnd=h.ctx.sources.length;
 const ended=PB.seekArchivedPlayback(999);near(PB.archivedPlaybackPosition().positionSeconds,60);assert.equal(h.ctx.sources.length,beforeEnd);
 h.ctx.currentTime+=1;assert.equal(PB.tickPlayback(),'ended');assert.equal(PB.isArchivedPlaybackOwner(ended),false);assert.deepEqual(PB.tapeTransport(),head);
});

test('damage ramps stay anchored to the original damaged interval after seeking',()=>{
 const h=reset(),original=row();original.damage=makeTapeDamage(original,{damageId:'actual-spill'});
 const at=9.23,start=h.ctx.currentTime+.05;PB.playArchivedTake(original,{offsetSeconds:at});
 const damaged=h.ctx.gains[2];near(damaged.gain.events[0][1],tapeDamageGainAt(original,at));near(damaged.gain.events[0][2],start);
 const future=tapeDamageEnvelope(original).filter(point=>point.at>at);
 assert.equal(damaged.gain.events.length,future.length+1);
 future.forEach((point,index)=>{near(damaged.gain.events[index+1][1],point.gain);near(damaged.gain.events[index+1][2],start+point.at-at);});
});

test('continuous archive seeks and pauses use the retained buffer and latest requested offset, including while decoding',async()=>{
 const h=reset(),exact=h.ctx.createBuffer(2,480000,8000),head=PB.tapeTransport();let release;
 PB.playbackInit({loadContinuousMedia:()=>new Promise(resolve=>{release=resolve;})});
 const original={...row(),audible:[],guest:null,slate:null,discrete:[],continuous:ref(),status:'archived',counted:false};
 const play=PB.playArchivedTake(original,{offsetSeconds:2});assert.equal(PB.isArchivedPlaybackOwner(play),true);
 assert.equal(PB.seekArchivedPlayback(18),play);assert.equal(PB.pauseArchivedPlayback(true),play);assert.equal(PB.archivedPlaybackPosition().paused,true);
 release({buffer:exact});await play.readyPromise;assert.equal(h.ctx.sources.length,0);near(PB.archivedPlaybackPosition().positionSeconds,18);
 assert.equal(PB.pauseArchivedPlayback(false),play);assert.equal(h.ctx.sources[0].buffer,exact);near(h.ctx.sources[0].starts[0][1],18);near(h.ctx.sources[0].starts[0][2],42);
 h.ctx.currentTime+=2;PB.tickPlayback();const paused=PB.pauseArchivedPlayback(true),at=PB.archivedPlaybackPosition().positionSeconds;
 h.ctx.currentTime+=30;near(PB.archivedPlaybackPosition().positionSeconds,at);assert.equal(PB.pauseArchivedPlayback(false),paused);
 assert.equal(h.ctx.sources.at(-1).buffer,exact);near(h.ctx.sources.at(-1).starts[0][1],at);
 assert.deepEqual(PB.tapeTransport(),head);assert.equal(h.ctx.sources.at(-1).loop,false);assert.equal(h.ctx.sources.at(-1).playbackRate.value,1);
});

test('late decode completion or failure after STOP cannot replace another preview or emit fallback audio',async()=>{
 const h=reset(),exact=h.ctx.createBuffer(2,480000,8000);let resolve;
 PB.playbackInit({loadContinuousMedia:()=>new Promise(ok=>{resolve=ok;})});
 const field={...row(),audible:[],guest:null,slate:null,discrete:[],continuous:ref(),status:'archived'};
 const old=PB.playArchivedTake(field,{offsetSeconds:12});PB.stopPlayback();const next=PB.playArchivedTake(row(),{offsetSeconds:3}),count=h.ctx.sources.length;
 resolve({buffer:exact});await old.readyPromise;assert.equal(h.ctx.sources.length,count);assert.equal(PB.isArchivedPlaybackOwner(next),true);assert.equal(PB.isArchivedPlaybackOwner(old),false);
 PB.stopPlayback();PB.playbackInit({loadContinuousMedia:async()=>{throw Object.assign(new Error('Original audio is absent.'),{code:'FIELD_MEDIA_MISSING'});}});
 const missing=PB.playArchivedTake(field,{offsetSeconds:12});await missing.readyPromise;assert.equal(h.ctx.sources.length,count);assert.equal(PB.playbackError().code,'FIELD_MEDIA_MISSING');assert.equal(PB.isPlaying(),false);
});

test('a malformed continuous archive interval is rejected before duration/seek math or any media request',()=>{
 const h=reset();let requests=0;PB.playbackInit({loadContinuousMedia:async()=>{requests++;throw Error('must not request mismatched media');}});
 for(const durationSeconds of[undefined,NaN,Infinity,0,41]){
  const original={...row(),audible:[],guest:null,slate:null,discrete:[],continuous:ref(),status:'archived',durationSeconds};
  assert.equal(PB.playArchivedTake(original,{offsetSeconds:12}),null);assert.equal(PB.playbackError().code,'FIELD_MEDIA_DURATION');
 }
 assert.equal(requests,0);assert.equal(h.ctx.sources.length,0);assert.equal(PB.isPlaying(),false);
});

test('a rejected obsolete media read cannot stop or report an error against the next cassette preview',async()=>{
 const h=reset();let reject;
 PB.playbackInit({loadContinuousMedia:()=>new Promise((_resolve,no)=>{reject=no;})});
 const field={...row(),audible:[],guest:null,slate:null,discrete:[],continuous:ref(),status:'archived'};
 const stale=PB.playArchivedTake(field,{offsetSeconds:9});PB.stopPlayback();const current=PB.playArchivedTake(row(),{offsetSeconds:17}),count=h.ctx.sources.length;
 reject(Object.assign(new Error('old cassette no longer present'),{code:'FIELD_MEDIA_MISSING'}));await stale.readyPromise;
 assert.equal(PB.isArchivedPlaybackOwner(current),true);assert.equal(PB.playbackError(),null);assert.equal(h.ctx.sources.length,count);
});

test('ordinary playback still uses its normal start, events, slate and active tape head; archive methods cannot seize it',()=>{
 const h=reset();PB.loadTakes([row()]);const old=Math.random;Math.random=()=>.25;
 let play;try{play=PB.playTake('take:1',{atHead:true});}finally{Math.random=old;}
 const room=h.ctx.sources.find(n=>n.buffer===h.room);near(room.starts[0][1],.25*(h.room.duration-.1));
 assert.deepEqual(h.events.map(e=>e.id),['earlier','at-offset','later']);
 assert.equal(PB.isArchivedPlaybackOwner(play),false);assert.equal(PB.seekArchivedPlayback(10),false);assert.equal(PB.pauseArchivedPlayback(true),false);
 h.ctx.currentTime+=2;PB.tickPlayback();assert.equal(h.slates.length,1);assert.ok(PB.tapeTransport().headSeconds>0);
});
