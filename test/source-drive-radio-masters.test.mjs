import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceDriveAcoustics} from '../src/game/source-drive/acoustics.js';
import {RADIO_CYCLE_SECONDS,RADIO_PROGRAMME_NAMES,RADIO_FINAL_MANIFEST,RADIO_FINAL_CACHE_BYTES,RADIO_FINAL_MASTER_BYTES,validateProgrammeManifest,validateProgrammeCues} from '../src/game/source-drive/radio-programmes.js';

const cue=(id,start=8,end=12)=>({id,start,end,speaker:'VOICE',text:'An ordinary connected sentence.',signalRole:'human'});
const manifest=()=>({schema:1,cycleSeconds:72,programmes:RADIO_PROGRAMME_NAMES.map(name=>({name,url:`/assets/source-drive/radio/${name}.wav`,loop:true,temporary:false,cues:[cue(name)]}))});
function fixture({delivery=null,missingHTML=false}={}){
 const starts=[],requests=[],decoded=[];
 const param=value=>({value,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const node=()=>({connections:[],connect(n){this.connections.push(n);return n;},disconnect(n){this.connections=n?this.connections.filter(q=>q!==n):[];},start(at,offset){starts.push({node:this,at,offset});},stop(){this.stopped=true;}});
 const context={currentTime:0,sampleRate:8000,state:'running',createGain:()=>Object.assign(node(),{gain:param(1)}),createBiquadFilter:()=>Object.assign(node(),{frequency:param(350),Q:param(.7)}),createStereoPanner:()=>Object.assign(node(),{pan:param(0)}),createDelay:()=>Object.assign(node(),{delayTime:param(0)}),createBufferSource:node,createOscillator:()=>Object.assign(node(),{frequency:param(440)}),createAnalyser:()=>Object.assign(node(),{getFloatTimeDomainData(a){a.fill(0);}}),
  createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:c=>data[c]};},
  async decodeAudioData(encoded){const id=new Uint8Array(encoded)[0];decoded.push(id);return id?context.createBuffer(1,72*8000,8000):voice;}};
 const voice=context.createBuffer(1,4000,8000);voice.getChannelData(0).fill(.1);
 const fetcher=async url=>{requests.push(url);if(url===RADIO_FINAL_MANIFEST){
  if(missingHTML)return{ok:true,status:200,headers:{get:()=> 'text/html'},json:async()=>{throw Error('The dev HTML shell is not JSON.');}};
  return delivery?{ok:true,status:200,json:async()=>delivery}:{ok:false,status:404};
 }
 const index=RADIO_PROGRAMME_NAMES.findIndex(name=>url.endsWith('/'+name+'.wav'));
 return{ok:true,status:200,arrayBuffer:async()=>Uint8Array.of(index+1).buffer};};
 const owner=new SourceDriveAcoustics({context,destination:context.createGain(),fetcher});
 return{owner,context,starts,requests,decoded,buffer:()=>context.createBuffer(1,72*8000,8000)};
}
const base={speed:0,engineLoad:0,throttle:0,gear:1,surface:'asphalt',longitudinalAcceleration:0,heaveVelocity:0,odometer:0,roadOffset:0,radioOn:true,volume:.65,station:'service',programTime:8,furthest:0,z:0,phase:0,cutEnabled:true,paused:false};
function sync(f,time,extra={}){f.context.currentTime=time;f.owner.sync({...base,programTime:time,...extra});return f.owner.programmeFrame();}
const finalOptions=cues=>({loop:true,temporary:false,cues});

test('the optional absent production manifest is quiet, including a dev-server HTML fallback',async()=>{
 for(const missingHTML of [false,true]){
  const f=fixture({missingHTML});await f.owner.initialize();
  assert.equal(f.owner.masterManifestStatus,'missing');assert.deepEqual(f.owner.assetErrors,[]);
  assert.equal(f.requests.filter(url=>url===RADIO_FINAL_MANIFEST).length,1);assert.equal(f.owner.voices.size,9);
  f.owner.setPaused(false);assert.equal(sync(f,3).caption.temporary,true);f.owner.dispose();
 }
});

test('a complete production manifest prepares only SERVICE ordinary under cover, using the existing context',async()=>{
 const f=fixture({delivery:manifest()});await f.owner.initialize();
 assert.equal(f.owner.masterRows.size,15);assert.equal(f.owner.masterManifestStatus,'ready');
 assert.equal(f.decoded.filter(id=>id>0).length,1);assert.deepEqual(f.requests.filter(url=>RADIO_PROGRAMME_NAMES.some(name=>url.endsWith('/'+name+'.wav'))),['/assets/source-drive/radio/service-ordinary.wav']);
 assert.equal(f.owner.programmeOptions.get('service-ordinary').temporary,false);assert.equal(f.owner.programmes.size,3);
 assert.equal(f.owner.openingReadiness({...base,programTime:8}).cue,'service-ordinary');f.owner.dispose();
});

test('manifest validation rejects missing/duplicate cells, invalid clocks, unowned signals and overlapping speech',()=>{
 assert.equal(validateProgrammeManifest(manifest()).programmes.length,15);
 const mutations=[m=>m.programmes.pop(),m=>m.programmes[1].name=m.programmes[0].name,m=>m.cycleSeconds=71,m=>m.programmes[0].loop=false,m=>m.programmes[0].temporary=true,m=>m.programmes[0].url='https://example.com/audio.wav',m=>m.programmes[0].cues[0].signalRole='hush',m=>delete m.programmes[0].cues[0].signalRole,m=>m.programmes[0].cues[0].end=73,m=>m.programmes[0].cues.push(cue('overlap',10,13))];
 for(const mutate of mutations){const m=manifest();mutate(m);assert.throws(()=>validateProgrammeManifest(m));}
 assert.throws(()=>validateProgrammeCues([cue('a'),cue('a',20,23)]),/unique/);
 assert.equal(validateProgrammeCues([{id:'a',start:5,durationSeconds:2,speaker:'HOST',text:'Words.',signalRole:'human'}],72,{requireSignalRole:true})[0].end,7);
});

test('invalid optional metadata falls back once without decoding any purported final master',async()=>{
 const m=manifest();m.programmes[0].cues[0].end=90;
 const f=fixture({delivery:m});await f.owner.initialize();await f.owner.initialize();
 assert.equal(f.owner.masterManifestStatus,'unavailable');assert.equal(f.owner.assetErrors.length,1);assert.equal(f.decoded.filter(id=>id>0).length,0);
 f.owner.setPaused(false);assert.equal(sync(f,3).caption.temporary,true);f.owner.dispose();
});

test('final decoded audio must be mono, exactly one 72s cycle and within its PCM budget',async()=>{
 const f=fixture();await f.owner.initialize();const good=f.buffer();
 f.owner.loadProgramme('service-ordinary',good,finalOptions([cue('actual')]));
 for(const bad of [{...good,duration:71},{...good,numberOfChannels:2},{...good,length:RADIO_FINAL_MASTER_BYTES/4+1}])assert.throws(()=>f.owner.loadProgramme('service-ordinary',bad,finalOptions([])),/72-second mono/);
 assert.throws(()=>f.owner.loadProgramme('not-a-station',good,finalOptions([])),/identity/);
 assert.throws(()=>f.owner.loadProgramme('service-ordinary',good,finalOptions([{...cue('unowned'),signalRole:'player'}])),/ownership/);
 assert.equal(f.owner.programmes.get('service-ordinary'),good,'failed replacement cannot overwrite the accepted buffer');f.owner.dispose();
});

test('the real old and incoming final cue spans protect phase edits, including times where scratch would be silent',async()=>{
 const f=fixture();await f.owner.initialize();
 f.owner.loadProgramme('service-ordinary',f.buffer(),finalOptions([cue('ordinary',8,12)]));
 f.owner.loadProgramme('service-discrepancy',f.buffer(),finalOptions([cue('next',13,16)]));
 f.owner.setPaused(false);assert.equal(sync(f,8).caption.cueId,'ordinary');
 assert.equal(sync(f,10,{phase:1}).phase,0,'do not sever the actual old sentence');
 const incomingBusy=sync(f,13.5,{phase:1});assert.equal(incomingBusy.phase,0);assert.equal(incomingBusy.caption,null,'do not join halfway through the incoming sentence');
 const gap=sync(f,16,{phase:1});assert.equal(gap.phase,1);assert.equal(gap.caption,null);
 assert.equal(f.owner.programme.buffer,f.owner.programmes.get('service-discrepancy'));f.owner.dispose();
});

test('an asynchronously supplied final master cannot replace scratch halfway through either version',async()=>{
 const f=fixture();await f.owner.initialize();f.owner.setPaused(false);
 const old=sync(f,3);assert.equal(old.caption.cueId,'service-water');const node=f.owner.programme;
 const master=f.buffer();f.owner.loadProgramme('service-ordinary',master,finalOptions([cue('new-words',3,9)]));
 assert.equal(f.owner.programme,node,'fetch completion itself cannot stop playback');
 assert.equal(sync(f,4).caption.temporary,true);assert.equal(f.owner.programme,node);
 assert.equal(sync(f,6).caption,null);assert.equal(f.owner.programme,node,'the new master is still speaking');
 sync(f,9);assert.equal(f.owner.programme.buffer,master);assert.equal(node.stopped,true);f.owner.dispose();
});

test('a master completing during pause cannot replace the held utterance on resume',async()=>{
 const f=fixture();await f.owner.initialize();f.owner.setPaused(false);sync(f,3);const held=f.owner.playingBuffer;
 f.owner.setPaused(true);f.owner.loadProgramme('service-ordinary',f.buffer(),finalOptions([cue('new-words',3,9)]));
 f.owner.setPaused(false);const resumed=sync(f,3);assert.equal(resumed.caption.temporary,true);assert.equal(f.owner.programme.buffer,held);assert.equal(f.starts.at(-1).offset,3);
 sync(f,6);assert.equal(f.owner.programme.buffer,held);sync(f,9);assert.notEqual(f.owner.programme.buffer,held);f.owner.dispose();
});

test('final captions use current absolute offsets and preserve generic labels and signal ownership',async()=>{
 const f=fixture();await f.owner.initialize();f.owner.loadProgramme('service-ordinary',f.buffer(),finalOptions([cue('memory',8,12)]));f.owner.setPaused(false);
 const frame=sync(f,80);assert.equal(frame.cycleSeconds,8);assert.deepEqual(frame.caption,{speaker:'VOICE',text:'An ordinary connected sentence.',cueId:'memory',temporary:false,signalRole:'human'});
 assert.equal(sync(f,84).caption,null);assert.equal(sync(f,80,{radioOn:false}).caption,null);assert.equal(sync(f,80,{volume:0}).caption,null);f.owner.dispose();
});

test('tuning may interrupt a final sentence; OFF, pause and resume retain the programme clock and existing cabin/REC bus',async()=>{
 const f=fixture();await f.owner.initialize();
 f.owner.loadProgramme('service-ordinary',f.buffer(),finalOptions([cue('service',8,15)]));
 f.owner.loadProgramme('company-ordinary',f.buffer(),finalOptions([cue('company',8,15)]));
 const bus=f.owner.recordingBus();f.owner.setPaused(false);sync(f,8);
 assert.equal(sync(f,9,{station:'company'}).caption.cueId,'company');assert.equal(f.owner.programme.buffer,f.owner.programmes.get('company-ordinary'));assert.equal(f.starts.at(-1).offset,9);
 assert.equal(sync(f,10,{station:'company',radioOn:false}).caption,null);assert.equal(f.owner.radio.gain.value,0);assert.equal(f.owner.programme,null);
 sync(f,11,{station:'company'});assert.equal(f.starts.at(-1).offset,11);
 f.owner.setPaused(true);assert.equal(f.owner.programmeFrame().caption,null);const count=f.starts.length;sync(f,11,{station:'company',paused:true});assert.equal(f.starts.length,count);
 f.owner.setPaused(false);sync(f,11,{station:'company'});assert.equal(f.starts.at(-1).offset,11);assert.equal(f.owner.recordingBus(),bus);assert.equal(f.context.state,'running');f.owner.dispose();
});

test('metadata registration is lazy and final cache remains bounded while preserving the playing master',async()=>{
 const f=fixture();await f.owner.initialize();const before=f.decoded.length;await f.owner.loadManifest(manifest());assert.equal(f.decoded.length,before);
 await f.owner.requestProgramme('service-ordinary');f.owner.setPaused(false);sync(f,8);const playing=f.owner.playingBuffer;
 for(const name of ['company-recognition','music-arrival','service-arrival'])await f.owner.requestProgramme(name);
 const finalBuffers=[...f.owner.programmes].filter(([name])=>f.owner.programmeOptions.get(name).temporary===false).map(([,buffer])=>buffer);
 assert.equal(finalBuffers.length,2);assert.ok(finalBuffers.includes(playing));assert.ok(finalBuffers.reduce((n,b)=>n+b.length*b.numberOfChannels*4,0)<=RADIO_FINAL_CACHE_BYTES);assert.ok(f.owner.scratchKeys.size<=4);f.owner.dispose();
});

test('replacing the playing master also counts its held old PCM against the two-master residency limit',async()=>{
 const f=fixture();await f.owner.initialize();f.owner.loadProgramme('service-ordinary',f.buffer(),finalOptions([cue('old',8,15)]));f.owner.setPaused(false);sync(f,8);
 f.owner.loadProgramme('company-ordinary',f.buffer(),finalOptions([]));
 f.owner.loadProgramme('service-ordinary',f.buffer(),finalOptions([cue('replacement',8,15)]));
 assert.equal(f.owner.programmes.has('company-ordinary'),false);
 const resident=new Set([...f.owner.programmes].filter(([name])=>!f.owner.programmeOptions.get(name).temporary).map(([,b])=>b));resident.add(f.owner.playingBuffer);assert.equal(resident.size,2);f.owner.dispose();
});

test('rapid tuning permits one in-flight final decode and only the newest queued station',async()=>{
 const f=fixture();await f.owner.initialize();let release,active=0,peak=0;const fetched=[];
 await f.owner.loadManifest(manifest(),{fetcher:async url=>{fetched.push(url);active++;peak=Math.max(peak,active);if(fetched.length===1)await new Promise(done=>{release=done;});active--;return{ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer};}});
 const first=f.owner.requestProgramme('service-ordinary'),abandoned=f.owner.requestProgramme('company-ordinary'),latest=f.owner.requestProgramme('music-ordinary');
 assert.equal(await abandoned,false);assert.equal(f.owner.masterQueue.size,1);release();assert.equal(await first,true);assert.equal(await latest,true);
 assert.equal(peak,1);assert.deepEqual(fetched,['/assets/source-drive/radio/service-ordinary.wav','/assets/source-drive/radio/music-ordinary.wav']);f.owner.dispose();
});

test('failed final media keeps working scratch and is not fetched or reported every frame',async()=>{
 const f=fixture();await f.owner.initialize();let attempts=0;await f.owner.loadManifest(manifest(),{fetcher:async()=>{attempts++;return{ok:false,status:404};}});
 assert.equal(await f.owner.requestProgramme('service-ordinary'),false);f.owner.setPaused(false);
 for(let i=0;i<25;i++)sync(f,3+i*.01);
 assert.equal(attempts,1);assert.equal(f.owner.assetErrors.length,1);assert.equal(f.owner.programmeFrame().caption.temporary,true);f.owner.dispose();
});

test('a disposed acoustic owner cannot install a late master or leave a queued promise hanging',async()=>{
 const f=fixture();await f.owner.initialize();let release;
 await f.owner.loadManifest(manifest(),{fetcher:async()=>{await new Promise(done=>{release=done;});return{ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer};}});
 const first=f.owner.requestProgramme('service-ordinary'),queued=f.owner.requestProgramme('company-ordinary');f.owner.dispose();assert.equal(await queued,false);release();assert.equal(await first,false);assert.equal(f.owner.programmes.size,0);assert.equal(f.owner.masterRows.size,0);
});

test('a deliberately finite direct master ends without a false transcript or restart',async()=>{
 const f=fixture();await f.owner.initialize();f.owner.loadProgramme('service-ordinary',f.buffer(),{loop:false,temporary:false,cues:[cue('end',68,71)]});f.owner.setPaused(false);
 assert.equal(sync(f,70).caption.cueId,'end');const starts=f.starts.length;f.owner.programme.onended();
 const frame=sync(f,RADIO_CYCLE_SECONDS+1);assert.equal(frame.audible,false);assert.equal(frame.caption,null);assert.equal(f.owner.programme,null);assert.equal(f.starts.length,starts);f.owner.dispose();
});
