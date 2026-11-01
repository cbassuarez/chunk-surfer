import test from 'node:test';
import assert from 'node:assert/strict';
import * as PB from '../src/game/playback.js';
import {SourceDriveRecording,clearSourceDriveAudio,readSourceDriveAudioEntry,sourceDriveBlobDigest} from '../src/audio/source-drive-recording.js';
import * as SAVE from '../src/game/save.js';
import {makeArchiveScene} from '../src/game/archive.js';

class Param {constructor(value=1){this.value=value;}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}}
class Node {constructor(){this.gain=new Param();this.playbackRate=new Param();this.frequency=new Param();this.Q=new Param();}connect(){return this;}disconnect(){}start(){}stop(){}}
const buffer=(duration=3)=>({length:duration*48000,sampleRate:48000,numberOfChannels:2,duration,getChannelData:()=>new Float32Array(duration*48000)});
class Context {constructor(){this.currentTime=0;this.state='running';this.sampleRate=48000;this.sources=[];}createGain(){return new Node();}createBufferSource(){const n=new Node();this.sources.push(n);return n;}createBiquadFilter(){return new Node();}createBuffer(c,n,r){return {duration:n/r,getChannelData:()=>new Float32Array(n)};}createMediaStreamDestination(){return Object.assign(new Node(),{stream:{}});}addEventListener(){}removeEventListener(){}}
function reset(){PB.setTransportGate();PB.stopPlayback();PB.loadTakes([]);const ctx=new Context();PB.playbackInit({ctx,bus:ctx.createGain(),loadContinuousMedia:null,onPlaybackError:null,chunkById:()=>null,chunkByKey:()=>null});return ctx;}
function fieldRef(){return {schema:1,kind:'continuous-cabin',key:'retained',runId:'old',takeId:'take:1',captureId:'capture',durable:true,sha256:'a'.repeat(64),durationSeconds:3,frames:144000,sampleRate:48000,channels:2};}

test('pending gates all new low-level transports while a previously admitted listening interval can roll and seal once',()=>{
  reset();PB.beginTake('admitted',{x:1,y:2});PB.setTransportGate(()=>false);
  PB.beginTake('late',{});assert.equal(PB.tapeTake('late'),null);
  const first=PB.startTapeTake('admitted');assert.ok(first);assert.equal(PB.startTapeTake('admitted'),first);
  PB.advanceTape('admitted',3);PB.finishTapeTake('admitted',{elapsed:3,tapeElapsed:3,completed:true});
  assert.equal(PB.hasOpenTake(),false);assert.equal(PB.serializeTakes().length,1);
  assert.equal(PB.beginContinuousFieldTake({runId:'r'}),null);assert.equal(PB.playTake('admitted',{atHead:true}),null);
  PB.setTransportGate();
});

test('Source cabin capture rechecks a pending deadline after async cue and never constructs a recorder or opens a tape',async()=>{
  const ctx=reset();let allowed=true,recorderCount=0,release;
  PB.setTransportGate(()=>allowed);
  const tape={...PB,prepareContinuousAppend:()=>new Promise(resolve=>{release=resolve;})};
  const recording=new SourceDriveRecording({context:ctx,cabinBus:ctx.createGain(),playbackDestination:ctx.createGain(),runId:'r',tape,
    MediaRecorder:class {constructor(){recorderCount++;}}});
  const pending=recording.record();while(!release)await Promise.resolve();allowed=false;release();
  await assert.rejects(pending,error=>error.code==='NIGHT_EXPIRED');assert.equal(recorderCount,0);assert.equal(PB.serializeTakes().length,0);
  assert.equal(recording.status().recording,false);PB.setTransportGate();
});

test('read-only archived playback uses retained media while the new tape/head/ledger and source row remain unchanged',async()=>{
  const ctx=reset();PB.beginTake('new-night',{});PB.startTapeTake('new-night');PB.finishTapeTake('new-night',{elapsed:5,tapeElapsed:5,completed:true});
  const ledger=JSON.stringify(PB.serializeTakes()),transport=PB.tapeTransport(),ref=fieldRef(),row={id:'old-take',roomId:'old-field',durationSeconds:3,continuous:ref,audible:[],status:'archived',sealed:true};
  const original=JSON.stringify(row);let guestEvents=0,reads=0;
  PB.playbackInit({loadContinuousMedia:async({media})=>{reads++;assert.equal(media.sha256,ref.sha256);return{buffer:buffer(),ref:media};},onGuest:()=>guestEvents++});
  PB.setTransportGate(()=>false);
  const play=PB.playArchivedTake(row);assert.ok(play);await play.readyPromise;assert.equal(PB.archivedPlaybackActive(),true);
  ctx.currentTime+=1;PB.tickPlayback();assert.deepEqual(PB.tapeTransport(),transport);
  ctx.currentTime+=4;assert.equal(PB.tickPlayback(),'ended');assert.equal(PB.archivedPlaybackActive(),false);
  assert.equal(JSON.stringify(PB.serializeTakes()),ledger);assert.equal(JSON.stringify(row),original);assert.equal(reads,1);assert.equal(guestEvents,0);
  PB.setTransportGate();
});

test('unavailable archive media produces no fallback source or fabricated audio',async()=>{
  const ctx=reset(),row={id:'old',roomId:'old-field',durationSeconds:3,continuous:fieldRef(),status:'archived'};
  PB.playbackInit({loadContinuousMedia:async()=>{throw Object.assign(new Error('Retained audio is missing.'),{code:'FIELD_MEDIA_MISSING'});}});
  const playing=PB.playArchivedTake(row);await playing.readyPromise;
  assert.equal(ctx.sources.length,0);assert.equal(PB.playbackError().code,'FIELD_MEDIA_MISSING');assert.equal(PB.isPlaying(),false);
});

test('VIEW RECORDINGS enters the selected failed run without autoplay and plays only after an explicit key',()=>{
  reset();const row={id:'old',roomId:'recorded-room',durationSeconds:3,audible:[],discrete:[],status:'accepted'};
  const summary={id:'return:old',endingId:'night-deadline',classification:'failed-night',recordings:{schema:1,tapes:[row],mediaRefs:[]}};
  const scene=makeArchiveScene({meta:{returns:{history:[summary.id],records:{[summary.id]:summary}}},summaryId:summary.id,recordings:true});
  assert.equal(PB.isPlaying(),false);const ledger=PB.serializeTakes();scene.key({key:'Enter'});assert.equal(PB.archivedPlaybackActive(),true);
  assert.deepEqual(PB.serializeTakes(),ledger);scene.key({key:'Escape'});assert.equal(PB.isPlaying(),false);
});

// The same cursor/delete interface used by IndexedDB, with durable byte rows.
// It exercises the real selective clear and New Game call, not a replacement
// retention algorithm. Missing/uncertain metadata must take the preserve path.
function memoryIDB(rows){
  let deletedDatabase=0;
  const db={close(){},transaction(){
    const tx={objectStore(){return {get(key){const req={};queueMicrotask(()=>{req.result=rows.get(key)||null;req.onsuccess?.();});return req;},openCursor(){
      const req={},keys=[...rows.keys()];let i=0;
      function next(){queueMicrotask(()=>{
        if(i>=keys.length){req.result=null;req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());return;}
        const key=keys[i++];req.result={key,delete(){rows.delete(key);},continue:next};req.onsuccess?.();
      });}
      next();return req;
    }};}};return tx;
  }};
  return {open(){const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req;},deleteDatabase(){deletedDatabase++;rows.clear();const req={};queueMicrotask(()=>req.onsuccess?.());return req;},get deletedDatabase(){return deletedDatabase;}};
}

test('New Game retains pinned exact audio bytes and checksums while pruning only unarchived field audio',async()=>{
  const prior=globalThis.indexedDB,blob=new Blob(['the actual retained take']),sha256=await sourceDriveBlobDigest(blob),ref={...fieldRef(),sha256};
  const rows=new Map([[ref.key,{ref,blob}],['not-filed',{ref:{key:'not-filed'},blob:new Blob(['other'])}]]),idb=memoryIDB(rows);
  globalThis.indexedDB=idb;
  try{
    SAVE.metaCommit({returns:{records:{failed:{classification:'failed-night',recordings:{schema:1,tapes:[{roomId:'field',continuous:ref}],mediaRefs:[ref]}}},history:['failed']}});
    SAVE.newGame({now:1000});
    for(let i=0;i<12;i++)await Promise.resolve();
    const retained=await readSourceDriveAudioEntry(ref.key);assert.ok(retained);assert.equal(await sourceDriveBlobDigest(retained.blob),sha256);
    assert.equal(rows.has('not-filed'),false);assert.equal(idb.deletedDatabase,0);assert.equal(SAVE.getSave().nightDeadline.legacy,false);
    assert.equal(await clearSourceDriveAudio({preserveKeys:null}),false);assert.equal(rows.has(ref.key),true);
  }finally{globalThis.indexedDB=prior;}
});
