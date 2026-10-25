import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createPubRoomBed,pubRoomBedFrame,PUB_ROOM_FILES,PUB_ROOM_BED_ANCHORS} from '../src/audio/pub-room-bed.js';
import {createPubRoomAudio} from '../src/audio/pub-room.js';
import {EXTERIOR_PUB} from '../src/data/exterior-pub.js';
class Param{constructor(){this.value=0;}setTargetAtTime(v){this.value=v;}setValueAtTime(v){this.value=v;}cancelScheduledValues(){}}
class Context{
  constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.nodes=[];this.sources=[];this.destination=this.node('sfx');this.music=this.node('music');}
  node(kind){const n={kind,connections:[],gain:new Param(),frequency:new Param(),Q:new Param(),pan:new Param(),connect(other){this.connections.push(other);return other;},disconnect(){this.connections=[];}};this.nodes.push(n);return n;}
  createGain(){return this.node('gain');}createBiquadFilter(){return this.node('filter');}createStereoPanner(){return this.node('pan');}
  createBuffer(_,n,r){const a=new Float32Array(n);return{duration:n/r,getChannelData:()=>a};}
  createBufferSource(){const n=this.node('source');n.start=(at,offset)=>{n.started=true;n.offset=offset;};n.stop=()=>{n.stopped=true;};this.sources.push(n);return n;}
  decodeAudioData(){return Promise.resolve({duration:37});}
}
function fixture(options={}){let ctx=new Context();const getAudio=()=>({ctx,destination:ctx.destination,musicDestination:ctx.music});
  const audio=createPubRoomBed({getAudio,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)}),...options}),listener={x:EXTERIOR_PUB.bounds.x0+4,z:EXTERIOR_PUB.bounds.z0+2,yaw:0},input={listener,inPub:true};
  return{audio,getAudio,input,get ctx(){return ctx;},replace(){const previous=ctx;ctx=new Context();return previous;},async ready(){audio.update(input);await audio.whenReady();return audio.update(input);}};}
test('rain remains at real facade glass, brightens near an actually open door, and never doubles outdoor weather',()=>{
  const d=EXTERIOR_PUB.doors[0],listener={x:d.x,z:EXTERIOR_PUB.frontWorldZ+1,yaw:0};
  const closed=pubRoomBedFrame({listener,inPub:true,doorOpen:false}),open=pubRoomBedFrame({listener,inPub:true,openDoorIds:[d.id]});
  assert.ok(open.rain.gain>closed.rain.gain);assert.ok(open.rain.cutoff>closed.rain.cutoff);
  assert.equal(pubRoomBedFrame({listener,nearPub:true,doorOpen:true}).rain.gain,0);
  const recording=pubRoomBedFrame({listener,inPub:true,recording:true});
  assert.ok(recording.rain.gain>0&&recording.rain.gain<closed.rain.gain);
  assert.ok(recording.music.gain>0&&recording.music.gain<closed.music.gain);
  const far=pubRoomBedFrame({listener:{...listener,z:EXTERIOR_PUB.bounds.z1-1},inPub:true,openDoorIds:[d.id]});assert.ok(far.rain.gain<open.rain.gain);
});
test('music sits at backbar and company at snug; bearings turn and dialogue ducks without relocating them',()=>{
  const a=PUB_ROOM_BED_ANCHORS.music,listener={x:a.x-2,z:a.z,yaw:0};
  const one=pubRoomBedFrame({listener,inPub:true}),turned=pubRoomBedFrame({listener:{...listener,yaw:Math.PI},inPub:true}),talk=pubRoomBedFrame({listener,inPub:true,busy:true});
  assert.ok(one.music.pan>0&&turned.music.pan<0);assert.equal(one.music.distance,turned.music.distance);assert.equal(talk.music.gain,one.music.gain*.25);assert.equal(talk.company.gain,one.company.gain*.25);assert.equal(talk.rain.gain,one.rain.gain*.48);
  assert.ok(pubRoomBedFrame({listener,nearPub:true,doorOpen:false}).music.gain<pubRoomBedFrame({listener,nearPub:true,doorOpen:true}).music.gain);
});
test('three persistent layers stay bounded, music obeys its own bus, and pause/resume preserves offset',async()=>{
  const h=fixture();let snap=await h.ready();assert.equal(snap.voices,3);assert.equal(snap.nodes,12);
  const musicPan=h.ctx.nodes.find(n=>n.kind==='pan'&&n.connections.includes(h.ctx.music));assert.ok(musicPan);
  assert.equal(h.ctx.nodes.filter(n=>n.kind==='pan'&&n.connections.includes(h.ctx.destination)).length,2);
  for(let i=0;i<1000;i++){h.ctx.currentTime+=.1;snap=h.audio.update(h.input);}
  assert.equal(h.ctx.sources.length,3);h.audio.pause();assert.equal(h.audio.snapshot().voices,0);assert.ok(h.ctx.nodes.every(n=>n.connections.length===0));
  snap=h.audio.update(h.input);assert.equal(snap.voices,3);assert.ok(h.ctx.sources.slice(-3).every(n=>Math.abs(n.offset-26)<.000001));
});
test('Source, blur, exit, suspended context and disposal immediately revoke every file voice',async()=>{
  for(const extra of[{source:true},{blurred:true},{paused:true},{inPub:false,nearPub:false}]){
    const h=fixture();await h.ready();h.audio.update({...h.input,...extra});assert.equal(h.audio.snapshot().voices,0);assert.ok(h.ctx.nodes.every(n=>n.connections.length===0));
    h.audio.dispose();h.audio.update(h.input);assert.equal(h.audio.snapshot().voices,0);
  }
  const h=fixture();await h.ready();h.ctx.state='suspended';h.audio.update(h.input);assert.equal(h.audio.snapshot().voices,0);
});
test('a completed fetch has no authority to play after pause or Source entry',async()=>{
  let complete;const response=new Promise(r=>complete=r);const h=fixture({fetchImpl:()=>response});
  h.audio.update(h.input);h.audio.pause();complete({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});await h.audio.whenReady();assert.equal(h.ctx.sources.length,0);
  h.audio.update({...h.input,source:true});assert.equal(h.ctx.sources.length,0);h.audio.update(h.input);assert.equal(h.ctx.sources.length,3);
});
test('a replaced audio context never accepts the old pending decode',async()=>{
  let release;const gate=new Promise(r=>release=r);let count=0;const h=fixture({fetchImpl:async()=>{if(++count<=3)await gate;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};}});
  h.audio.update(h.input);await Promise.resolve();const old=h.replace();h.audio.update(h.input);release();await h.audio.whenReady();h.audio.update(h.input);
  assert.equal(old.sources.length,0);assert.equal(h.ctx.sources.length,3);
});
test('failed requests back off rather than issuing work every frame and recover by update only',async()=>{
  let calls=0;const h=fixture({fetchImpl:async()=>{calls++;throw Error('offline');}});await h.ready();assert.equal(calls,3);assert.equal(Object.keys(h.audio.snapshot().errors).length,3);
  for(let i=0;i<500;i++)h.audio.update(h.input);assert.equal(calls,3);h.ctx.currentTime=11;h.audio.update(h.input);await h.audio.whenReady();assert.equal(calls,6);
});
test('recording preserves and ducks continuous ambience while deferring furniture contacts',async()=>{
  const h=fixture();await h.ready();const before=h.audio.snapshot(),created=h.ctx.sources.length;
  h.ctx.currentTime=3;h.audio.update({...h.input,recording:true});const during=h.audio.snapshot();
  assert.equal(during.voices,3);assert.equal(h.ctx.sources.length,created,'recording does not restart the room performance');
  for(const kind of['music','company','rain']){assert.ok(during.layers[kind].gain>0&&during.layers[kind].gain<before.layers[kind].gain);assert.equal(during.layers[kind].offset,3);}
  const room=createPubRoomAudio({getAudio:h.getAudio,fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)})});
  room.update({...h.input,dt:.1});assert.equal(room.snapshot().voices,1);
  for(let i=0;i<80;i++)room.update({...h.input,recording:true,dt:.25});
  assert.equal(room.snapshot().createdContacts,0);assert.ok(room.snapshot().voices>=1,'the existing stove tone is retained');
});
test('shipping audio matches provenance, the complete user performance is retained, and no source is silently relicensed',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/audio/pub-room/provenance.json',import.meta.url)));
  assert.equal(manifest.sources[0].source,'/Users/seb/Downloads/29.wav');assert.match(manifest.sources[0].license,/User-owned/);assert.equal(manifest.sources.filter(x=>x.license==='CC0 1.0').length,2);
  for(const o of manifest.outputs){const bytes=fs.readFileSync(new URL('../public/audio/pub-room/'+o.file,import.meta.url));assert.equal(bytes.length,o.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256);assert.equal(o.channels,1);assert.equal(o.sampleRate,32000);}
  assert.ok(Math.abs(manifest.outputs[0].duration-manifest.sources[0].sourceDuration)<.1);assert.ok(manifest.decodedFloat32Bytes<60*1024*1024);assert.equal(Object.keys(PUB_ROOM_FILES).length,3);
});
