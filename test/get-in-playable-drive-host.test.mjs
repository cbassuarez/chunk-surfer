import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGetInDriveTeaserScene} from '../src/game/get-in-drive-teaser-scene.js';
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('playable opening routes actual inputs and tape at hand contact, then seals before returning ownership',async()=>{
 const calls=[],pendingControls=[],filtered={id:'heard-underwater-bus'},context={},destination={};let t=0,held=false,paused=true,recording=false,sealed=false,releaseSeal;
 const sealGate=new Promise(resolve=>{releaseSeal=resolve;});
 const controller={start(){},setPaused(p){paused=p;},update(dt){if(!paused)t+=dt;},input:(action,down)=>calls.push(['input',action,down]),operate(kind,callback){pendingControls.push({kind,callback});return true;},setRecordingView:v=>calls.push(['recording-view',v]),frame:()=>({timeSec:t,controlsEnabled:t>=.8&&t<2,phase:t>=3?'return':'free-drive',worldOwner:t>=3?'return':'drive',coverAlpha:t>=3&&t<4?1:0,finished:t>=4,renderFrame:t>=3?null:{driveState:{},scene:{cut:{sources:[]},predicaments:{sources:[]}}}}),dispose(){}};
 const audio={cabin:{id:'dry'},initialize:async()=>{},ensureOpeningBus:()=>calls.push(['opening-bus']),recordingBus:()=>filtered,setPaused:p=>calls.push(['audio-pause',p]),sync(){},level:()=>.2,dispose:()=>calls.push(['audio-dispose'])};
 const tape={tick(){},status:()=>({recording,headSeconds:12}),setPaused:p=>calls.push(['tape-pause',p]),record:async()=>{recording=true;calls.push(['record']);},stopPlayback:async()=>{},seal:async()=>{calls.push(['seal']);await sealGate;sealed=true;recording=false;},dispose:async()=>{calls.push(['tape-dispose']);}};
 const scene=makeGetInDriveTeaserScene({context,destination,isHeld:()=>held,fetcher:async()=>({ok:true,json:async()=>({})}),createController:()=>controller,
  createRenderer:()=>({initialize:async options=>{assert.equal(options.coastalMemory,true);return true;},setRecorderReadout(){},render:()=>true,dispose:()=>calls.push(['renderer-dispose'])}),
  createAcoustics:()=>audio,createRecording:async options=>{assert.equal(options.context,context);assert.equal(options.cabinBus,filtered);calls.push(['create-tape']);return tape;},
  onRestore:()=>calls.push(['restore']),onTapeChanged:()=>calls.push(['tape-committed']),onDone:()=>{assert.ok(sealed);calls.push(['done']);}});
 scene.update(.1);scene.update(.1);scene.update(.1);await scene.pending();for(let i=0;i<10;i++)scene.update(.1);
 assert.ok(calls.findIndex(c=>c[0]==='opening-bus')<calls.findIndex(c=>c[0]==='create-tape'));
 scene.key({key:'w'});assert.deepEqual(calls.find(c=>c[0]==='input'),['input','forward',true]);
 held=true;scene.setPaused(true);held=false;scene.setPaused(false);const count=calls.filter(c=>c[0]==='input'&&c[2]).length;
 scene.key({key:'w',repeat:true});assert.equal(calls.filter(c=>c[0]==='input'&&c[2]).length,count,'held keyboard repeat cannot propel after pause');
 scene.key({key:'r'});assert.equal(pendingControls[0].kind,'record');assert.ok(!recording);pendingControls.shift().callback();await flush();assert.ok(recording,'real tape starts at the measured hand contact');scene.update(.1);
 assert.equal(calls.filter(c=>c[0]==='recording-view').at(-1)[1].mode,'record');
 for(let i=0;i<45;i++)scene.update(.1);await flush();assert.ok(calls.some(c=>c[0]==='restore'));assert.ok(!calls.some(c=>c[0]==='done'),'physical media transaction holds final completion');
 releaseSeal();await flush();assert.ok(calls.findIndex(c=>c[0]==='tape-committed')<calls.findIndex(c=>c[0]==='done'));scene.exit();await flush();assert.equal(calls.filter(c=>c[0]==='audio-dispose').length,1);
});
