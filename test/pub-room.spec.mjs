import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPubRoomAudio,PUB_ROOM_SOUND_ANCHORS,pubRoomSpatial} from '../src/audio/pub-room.js';
import {EXTERIOR_PUB,pubPhysicalAt,pubPhysicalFromLocal,pubPhysicalYaw,pubWorldFromLocal} from '../src/data/exterior-pub.js';
import {PUB_INTERIOR_LAYOUT} from '../src/data/exterior-pub-furnishings.js';
class Param{constructor(){this.value=0;}setTargetAtTime(v){this.value=v;}}
class Context{
  constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.nodes=[];this.sources=[];this.destination=this.node('destination');}
  node(kind){const node={kind,connected:false,connections:[],gain:new Param(),frequency:new Param(),pan:new Param(),connect(other){this.connected=true;this.connections.push(other);},disconnect(){this.connected=false;this.connections=[];}};if(kind==='gain')node.gain.value=1;this.nodes.push(node);return node;}
  createGain(){return this.node('gain');}createBiquadFilter(){return this.node('filter');}createStereoPanner(){return this.node('panner');}
  createBuffer(_channels,length,rate){const values=new Float32Array(length);return{duration:length/rate,getChannelData:()=>values};}
  createBufferSource(){const node=this.node('source');node.start=()=>{node.startGain=node.connections[0]?.connections[0]?.gain?.value;node.started=true;node.end=this.currentTime+node.buffer.duration;};node.stop=()=>{if(node.stopped)return;node.stopped=true;node.onended?.();};this.sources.push(node);return node;}
  advance(dt){this.currentTime+=dt;for(const node of this.sources)if(node.started&&!node.stopped&&!node.loop&&node.end<=this.currentTime)node.stop();}
}
function fixture(){let ctx=new Context(),destination=ctx.destination;const audio=createPubRoomAudio({getAudio:()=>({ctx,destination})}),listener={...pubPhysicalAt(EXTERIOR_PUB.interiorAnchor),yaw:pubPhysicalYaw(0)};
  const tick=(n,options={})=>{for(let i=0;i<n;i++){ctx.advance(.1);audio.update({dt:.1,listener,inPub:true,...options});}};
  return{audio,tick,ctx:()=>ctx,replace:()=>{ctx=new Context();destination=ctx.destination;},listener};}
test('pub sounds use real furniture positions and turn with the listener',()=>{
  assert.deepEqual(PUB_ROOM_SOUND_ANCHORS.stove,pubPhysicalFromLocal(PUB_INTERIOR_LAYOUT.furniture.find(f=>f.kind==='stove')));
  const anchor=PUB_ROOM_SOUND_ANCHORS.glass,a=pubRoomSpatial({x:anchor.x-3,z:anchor.z,yaw:0},anchor),b=pubRoomSpatial({x:anchor.x-3,z:anchor.z,yaw:Math.PI},anchor);
  assert.ok(a.pan>0&&b.pan<0);assert.equal(a.distance,3);
  const shut=pubRoomSpatial({},anchor,{inPub:false}),open=pubRoomSpatial({},anchor,{inPub:false,doorOpen:true});assert.ok(shut.gain<open.gain&&shut.cutoff<open.cutoff);
});
test('the quarter-turned room preserves measured contact distance, stereo bearing and attenuation',()=>{
  const local=PUB_INTERIOR_LAYOUT.furniture.find(f=>f.kind==='stove'),authoredAnchor=pubWorldFromLocal(local);
  const authoredListener={x:authoredAnchor.x+1.3,z:authoredAnchor.z+2.1,yaw:.47};
  const physicalListener={...pubPhysicalAt(authoredListener),yaw:pubPhysicalYaw(authoredListener.yaw)};
  const before=pubRoomSpatial(authoredListener,authoredAnchor),after=pubRoomSpatial(physicalListener,PUB_ROOM_SOUND_ANCHORS.stove);
  for(const key of['distance','pan','gain','cutoff'])assert.ok(Math.abs(before[key]-after[key])<1e-12,key);
  assert.notDeepEqual(PUB_ROOM_SOUND_ANCHORS.stove,authoredAnchor,'the sound actually moved with its furniture');
});
test('the ordinary bed and sparse contacts stay bounded over a long visit',()=>{
  const h=fixture();h.tick(3000);const snapshot=h.audio.snapshot();assert.ok(snapshot.createdContacts>=12);assert.ok(snapshot.voices<=3);assert.ok(snapshot.nodes<=12);assert.ok(snapshot.cachedBuffers<=4);
  assert.ok(h.ctx().nodes.filter(n=>n.connected).length<=12,'ended contacts disconnect rather than accumulating live graph nodes');
  assert.ok(h.ctx().sources.every(n=>n.buffer&&[...n.buffer.getChannelData(0)].every(Number.isFinite)));
  h.audio.stop();assert.equal(h.ctx().nodes.some(n=>n.connected),false);assert.equal(h.audio.snapshot().voices,0);
});
test('dialogue ducks the room and defers contacts without building a backlog',()=>{
  const h=fixture();h.tick(1);const bedGain=h.ctx().nodes.find(n=>n.kind==='gain'),full=bedGain.gain.value;h.tick(1,{busy:true});assert.ok(Math.abs(bedGain.gain.value/full-.28)<1e-8);
  h.tick(1000,{busy:true});assert.equal(h.audio.snapshot().createdContacts,0);h.tick(35);assert.equal(h.audio.snapshot().createdContacts,0);h.tick(15);assert.equal(h.audio.snapshot().createdContacts,1);
});
test('pause, blur, exit and Source clear every voice immediately and resume without catch-up',()=>{
  for(const context of[{paused:true},{blurred:true},{inPub:false,nearPub:false},{source:true,inPub:true}]){
    const h=fixture();h.tick(60);h.tick(1,context);assert.equal(h.audio.snapshot().active,false);assert.equal(h.audio.snapshot().contacts,0);assert.equal(h.ctx().nodes.some(n=>n.connected),false);
    const count=h.audio.snapshot().createdContacts;h.tick(1);assert.equal(h.audio.snapshot().createdContacts,count);assert.ok(h.audio.snapshot().elapsed<.2);
    h.audio.pause();assert.equal(h.audio.snapshot().voices,0);h.audio.stop();
  }
});
test('a nearby doorway leaks a muffled bed but never schedules table contacts',()=>{
  const h=fixture();h.tick(500,{inPub:false,nearPub:true,doorOpen:false});assert.equal(h.audio.snapshot().active,true);assert.equal(h.audio.snapshot().createdContacts,0);assert.equal(h.audio.snapshot().voices,1);
  assert.ok(h.ctx().nodes.find(n=>n.kind==='filter').frequency.value<=180);h.audio.stop();
});
test('context or destination replacement revokes the old graph and resets scheduling',()=>{
  const h=fixture();h.tick(55);const old=h.ctx();h.replace();h.tick(1);assert.equal(old.nodes.some(n=>n.connected),false);assert.equal(h.audio.snapshot().contacts,0);assert.ok(h.audio.snapshot().elapsed<.2);
  h.ctx().state='suspended';h.tick(1);assert.equal(h.audio.snapshot().active,false);h.ctx().state='running';h.tick(1);assert.equal(h.audio.snapshot().voices,1);
  h.audio.dispose();h.tick(100);assert.equal(h.audio.snapshot().voices,0);
});
test('the module has no gameplay, speech, lighting or external scheduler authority',()=>{
  const source=readFileSync(new URL('../src/audio/pub-room.js',import.meta.url),'utf8');assert.doesNotMatch(source,/REC\.|PRES\.|emissive|setInterval\(|setTimeout\(|requestAnimationFrame|SpeechSynthesis|SPEECH\./);
});

test('performed service contacts follow their real table, stay bounded and cannot queue through pause or Source',()=>{
  const h=fixture(),at={x:h.listener.x+Math.cos(h.listener.yaw),z:h.listener.z+Math.sin(h.listener.yaw)};
  assert.equal(h.audio.contact(at),false);h.tick(1);
  assert.equal(h.audio.contact(at),true);
  assert.ok(h.ctx().nodes.filter(n=>n.kind==='panner').at(-1).pan.value>0);
  for(let i=0;i<20;i++)assert.equal(h.audio.contact(at),true);
  assert.ok(h.audio.snapshot().contacts<=2);assert.ok(h.ctx().nodes.filter(n=>n.connected).length<=12);
  h.tick(1,{recording:true});assert.equal(h.audio.contact(at),false,'service cannot make unscheduled noise on a live tape');
  for(const mode of[{paused:true},{source:true},{inPub:false,nearPub:true}]){
    h.tick(1,mode);assert.equal(h.audio.contact(at),false);h.tick(1);
  }
  assert.equal(h.audio.contact({x:NaN,z:0}),false);h.audio.dispose();assert.equal(h.audio.contact(at),false);
});

test('real default unity gains are silenced before any source starts',()=>{
  const h=fixture();h.tick(1,{busy:true});
  assert.equal(h.audio.contact({x:h.listener.x,z:h.listener.z}),true);
  assert.ok(h.ctx().sources.length>=2);
  assert.ok(h.ctx().sources.every(source=>source.startGain===0),'spatial targets cannot hide a full-volume start transient');
  h.audio.stop();
});
