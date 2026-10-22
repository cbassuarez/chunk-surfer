import test from 'node:test';
import assert from 'node:assert/strict';
import * as PB from '../src/game/playback.js';
import {SourceDriveRecording,normalizeSourceDriveMedia,sourceDriveBlobDigest,decodeSourceDriveMedia} from '../src/audio/source-drive-recording.js';

class Param{constructor(value=0){this.value=value;}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}}
class Node{constructor(){this.gain=new Param(1);this.playbackRate=new Param(1);this.connections=[];this.stops=0;this.starts=[];}connect(node){this.connections.push(node);return node;}disconnect(){}start(...args){this.starts.push(args);}stop(){this.stops++;}}
const buffer=(seconds=3.25,rate=48000)=>({length:Math.round(seconds*rate),sampleRate:rate,numberOfChannels:2,duration:seconds,getChannelData:()=>new Float32Array(Math.round(seconds*rate)).fill(.1)});
class Context{constructor(){this.currentTime=0;this.state='running';this.sources=[];this.gains=[];this.sampleRate=48000;}createGain(){const n=new Node();this.gains.push(n);return n;}createBufferSource(){const n=new Node();this.sources.push(n);return n;}createMediaStreamDestination(){const n=new Node();n.stream={active:true};return n;}addEventListener(){}removeEventListener(){}async decodeAudioData(bytes){const v=new DataView(bytes);if(bytes.byteLength>=44&&v.getUint32(0,false)===0x52494646)return buffer((bytes.byteLength-44)/(v.getUint16(22,true)*4*v.getUint32(24,true)),v.getUint32(24,true));return buffer();}}
class Recorder{static isTypeSupported(t){return t.includes('webm');}constructor(stream,{mimeType}){this.stream=stream;this.mimeType=mimeType;this.state='inactive';}start(){this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['captured exact bytes'],{type:this.mimeType})});this.onstop?.();});}}
function store(){const rows=new Map();return{rows,async put(ref,blob){rows.set(ref.key,{ref:structuredClone(ref),blob});return ref.key;},async get(key){return rows.get(key)||null;}};}
function reset(){PB.stopPlayback();PB.loadTakes([]);const context=new Context(),cabin=context.createGain(),headphones=context.createGain(),storage=store();PB.playbackInit({ctx:context,bus:headphones,loadContinuousMedia:null,onPlaybackError:null});return{context,cabin,headphones,storage};}
function recorder(host,extra={}){return new SourceDriveRecording({context:host.context,cabinBus:host.cabin,playbackDestination:host.headphones,runId:'run-A',tape:PB,storage:host.storage,MediaRecorder:Recorder,...extra});}
async function sealed(host){const r=recorder(host);await r.record({route:'cut'});host.context.currentTime=4;r.tick();const media=await r.seal();return{r,media};}

test('field capture appends the existing physical tape without counting a room or granting work',async()=>{
 const h=reset();PB.beginTake('real-room',{});PB.startTapeTake('real-room');PB.finishTapeTake('real-room',{elapsed:45,tapeElapsed:46,completed:true});
 const r=recorder(h);await r.record({route:'cut',distance:850});h.context.currentTime=2;r.tick();assert.equal(PB.tapeTransport().headSeconds,48);assert.deepEqual(PB.takeRoomIds(),['real-room']);
 const pending=r.checkpoint();assert.equal(pending.pending.durable,false);assert.deepEqual(pending.takeRefs,[]);assert.equal(JSON.stringify(pending).includes('captured exact bytes'),false);
 const ref=await r.seal();assert.equal(ref.durationSeconds,3.25);assert.equal(PB.tapeTransport().endSeconds,49.25);assert.equal(PB.tapeTakes().length,2);assert.equal(PB.tapeTakes()[1].counted,false);assert.equal(PB.tapeTakes()[1].guest,null);assert.deepEqual(PB.takeRoomIds(),['real-room']);assert.equal(r.status().headSeconds,49.25);assert.equal(r.status().tapeEndSeconds,49.25);
});

test('pause excludes elapsed context time without suspending the shared host context',async()=>{
 const h=reset(),r=recorder(h);await r.record();h.context.currentTime=1;r.tick();r.setPaused(true);assert.equal(r.active.recorder.state,'paused');h.context.currentTime=11;r.tick();assert.equal(r.status().elapsedSeconds,1);assert.equal(PB.tapeTransport().endSeconds,1);assert.equal(h.context.state,'running');r.setPaused(false);h.context.currentTime=12;r.tick();assert.equal(r.status().elapsedSeconds,2);await r.seal();
});

test('quota failure retains captured bytes and an honest pending checkpoint, and is retryable',async()=>{
 const h=reset(),r=recorder(h);await r.record();h.context.currentTime=2;const put=h.storage.put;h.storage.put=async()=>{throw Error('quota');};await assert.rejects(r.seal(),/quota/);const key=r.active.key,blob=r.active.blob;h.context.currentTime=100;assert.equal(r.status().elapsedSeconds,3.25);assert.equal(r.checkpoint().pending.state,'pending-storage');assert.deepEqual(r.checkpoint().takeRefs,[]);assert.equal(PB.hasOpenTake(),true);h.storage.put=put;const media=await r.seal();assert.equal(media.key,key);assert.equal(h.storage.rows.get(key).blob,blob);assert.equal(PB.hasOpenTake(),false);assert.equal(r.checkpoint().pending,null);
});

test('late seal or advance cannot mutate a reused take ID after a new run/reset',async()=>{
 const h=reset(),r=recorder(h);await r.record();h.context.currentTime=3;r.tick();let release;const original=h.storage.put;h.storage.put=async(ref,blob)=>{await new Promise(ok=>{release=ok;});return original(ref,blob);};const closing=r.seal();while(!release)await new Promise(ok=>setTimeout(ok,0));PB.loadTakes([]);const fresh=PB.beginContinuousFieldTake({runId:'run-B'});assert.equal(fresh.id,'take:1');assert.equal(PB.advanceContinuousFieldTake('take:1',99,{runId:'run-A',captureId:r.active.captureId}),false);release();await assert.rejects(closing,/could not be sealed/);assert.equal(PB.tapeTransport().endSeconds,0);assert.equal(PB.tapeTakes()[0].continuous.runId,'run-B');assert.equal(PB.tapeTakes()[0].sealed,false);
});

test('stored media and unique identity survive PB serialization/load without changing room credit',async()=>{
 const h=reset(),{media}=await sealed(h),rows=PB.serializeTakes(),transport=PB.tapeTransport();PB.loadTakes(JSON.parse(JSON.stringify(rows)));PB.loadTapeTransport(transport);assert.deepEqual(PB.tapeTakes()[0].continuous,media);assert.deepEqual(PB.takeRoomIds(),[]);assert.equal(PB.tapeTakes()[0].cell,null);assert.equal(PB.hasTake('take:1'),true);
});

test('continuous playback uses only the exact stored buffer, unpitched, unlooped, with real transport pause',async()=>{
 const h=reset(),{media}=await sealed(h),exact=buffer();let guestPicks=0;PB.playbackInit({pickGuest:()=>{guestPicks++;throw Error('no guest');},loadContinuousMedia:async()=>({buffer:exact,ref:media})});
 const oldRandom=Math.random;Math.random=()=>{throw Error('randomized field playback');};let p;try{p=PB.playTake('take:1',{atHead:true});await p.readyPromise;}finally{Math.random=oldRandom;}
 assert.equal(h.context.sources.length,1);assert.equal(h.context.sources[0].buffer,exact);assert.equal(h.context.sources[0].loop,false);assert.equal(h.context.sources[0].playbackRate.value,1);assert.equal(guestPicks,0);
 h.context.currentTime+=1;PB.tickPlayback();const at=PB.tapeTransport().headSeconds;PB.setContinuousPlaybackPaused(true);h.context.currentTime+=100;assert.equal(PB.tickPlayback(),'paused');assert.equal(PB.tapeTransport().headSeconds,at);PB.setContinuousPlaybackPaused(false);assert.equal(h.context.sources.length,2);assert.equal(h.context.sources[1].buffer,exact);assert.ok(Math.abs(h.context.sources[1].starts[0][1]-at)<1e-8);PB.stopPlayback();assert.equal(PB.isPlaying(),false);
});

test('STOP cancels a pending media read; missing media visibly fails without any fallback source',async()=>{
 const h=reset();await sealed(h);let resolve;PB.playbackInit({loadContinuousMedia:()=>new Promise(ok=>{resolve=ok;})});const pending=PB.playTake('take:1',{atHead:true});PB.stopPlayback();resolve({buffer:buffer()});await pending.readyPromise;assert.equal(h.context.sources.length,0);
 let failure;PB.playbackInit({loadContinuousMedia:async()=>{throw Object.assign(new Error('audio missing'),{code:'FIELD_MEDIA_MISSING'});},onPlaybackError:value=>{failure=value;}});const missing=PB.playTake('take:1',{atHead:true});await missing.readyPromise;assert.equal(PB.isPlaying(),false);assert.equal(h.context.sources.length,0);assert.equal(failure.code,'FIELD_MEDIA_MISSING');assert.equal(PB.playbackError().message,'audio missing');
});

test('interrupted rolling checkpoint retains consumed tape but never invents captured audio',async()=>{
 const h=reset(),r=recorder(h);await r.record();h.context.currentTime=2;r.tick();const checkpoint=r.checkpoint(),rows=PB.serializeTakes();PB.loadTakes(rows);const restored=recorder(h);const result=await restored.hydrate(checkpoint);assert.equal(result.interrupted.audioAvailable,false);assert.equal(PB.tapeTakes()[0].mediaUnavailable,true);assert.equal(PB.tapeTransport().endSeconds,2);let failure;PB.playbackInit({onPlaybackError:error=>failure=error,loadContinuousMedia:()=>{throw Error('must not load invented media');}});assert.equal(PB.playTake('take:1',{atHead:true}),null);assert.equal(failure.code,'FIELD_MEDIA_UNAVAILABLE');assert.equal(restored.checkpoint().takeRefs.length,0);
});

test('finite capacity is honored only when supplied by the host; ordinary PB remains unbounded',async()=>{
 const h=reset(),tape={...PB,tapeTransport:()=>({...PB.tapeTransport(),capacitySeconds:2})},r=recorder(h,{tape});await r.record();h.context.currentTime=4;r.tick();await r.queue;assert.equal(PB.tapeTransport().endSeconds,2);assert.equal(r.checkpoint().takeRefs[0].durationSeconds,2);assert.equal('capacitySeconds'in PB.tapeTransport(),false);
});

test('stored-media validation rejects missing bytes, checksum changes and timing substitutions',async()=>{
 const blob=new Blob(['exact']),sha256=await sourceDriveBlobDigest(blob),ref={schema:1,kind:'continuous-cabin',key:'k',runId:'r',takeId:'take:1',captureId:'capture',durable:true,mime:'audio/webm',bytes:blob.size,durationSeconds:3.25,frames:156000,sampleRate:48000,channels:2,sha256};assert.ok(normalizeSourceDriveMedia(ref));assert.equal(normalizeSourceDriveMedia({...ref,sha256:'no'}),null);await assert.rejects(decodeSourceDriveMedia(new Context(),ref,{read:async()=>null}),error=>error.code==='FIELD_MEDIA_MISSING');await assert.rejects(decodeSourceDriveMedia(new Context(),ref,{read:async()=>new Blob(['different'])}),error=>error.code==='FIELD_MEDIA_CORRUPT');assert.equal((await decodeSourceDriveMedia(new Context(),ref,{read:async()=>blob})).buffer.duration,3.25);
});

test('STOP cancels a pending REC cue; cue completion remains observable if the host tick consumed it first',async()=>{
 const h=reset(),{r}=await sealed(h);PB.advanceHeadTo(0);const waiting=r.record();while(!r.status().cuing)await new Promise(ok=>setTimeout(ok,0));r.stopPlayback();await assert.rejects(waiting,error=>error.code==='FIELD_CUE_CANCELLED');assert.equal(PB.tapeTakes().length,1);
 const recording=r.record();while(!r.status().cuing)await new Promise(ok=>setTimeout(ok,0));h.context.currentTime+=4;assert.equal(PB.tickPlayback(),'cued');r.tick();await recording;assert.equal(r.status().recording,true);assert.equal(PB.tapeTakes().length,2);await r.seal();
});

test('fatal capture decode marks an unavailable attempt and cannot trap the player in an unsealable transport',async()=>{
 const h=reset(),r=recorder(h);await r.record();h.context.currentTime=2;r.tick();h.context.decodeAudioData=async()=>{throw Error('codec failed');};await assert.rejects(r.seal(),error=>error.code==='FIELD_CAPTURE_DECODE_FAILED');assert.equal(r.checkpoint().pending,null);assert.equal(PB.tapeTakes()[0].mediaUnavailable,true);assert.equal(PB.tapeTakes()[0].durationSeconds,2);assert.equal(PB.takeRoomIds().length,0);assert.equal(await r.seal(),null);
});

test('synchronous disposal prevents a queued old-run REC from opening the reset physical tape',async()=>{
 const h=reset(),r=recorder(h),oldRecord=r.record(),closing=r.dispose();PB.loadTakes([]);await assert.rejects(oldRecord,error=>error.code==='FIELD_DISPOSED');await closing;assert.equal(PB.tapeTakes().length,0);assert.equal(PB.tapeTransport().endSeconds,0);assert.equal(r.disposed,true);assert.equal(h.context.state,'running');
});
