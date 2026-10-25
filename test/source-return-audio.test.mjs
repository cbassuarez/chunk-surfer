import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SourceDriveAcoustics,driveOpeningAcousticFrame} from '../src/game/source-drive/acoustics.js';
import {doorDriveCinematicFrame} from '../src/game/source-drive/door-teaser.js';
import {sampleSourceReturnFlashback} from '../src/game/source-return-flashback.js';
import {sourceReturnRenderFrame} from '../src/render/source-return-flashback-renderer.js';
import {makeSourceReturnFlashbackScene} from '../src/game/source-return-flashback-scene.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const sample=t=>sampleSourceReturnFlashback(t,{destination:'tower',metrics});
const render=t=>sourceReturnRenderFrame(sample(t),metrics);
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
const param=value=>({value,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
function context(){
 const node=()=>({connections:[],connect(n){this.connections.push(n);return n;},disconnect(n){this.connections=n?this.connections.filter(q=>q!==n):[];},start(){},stop(){}});
 return{currentTime:0,sampleRate:8000,state:'running',
  createGain:()=>Object.assign(node(),{gain:param(1)}),createBiquadFilter:()=>Object.assign(node(),{frequency:param(350),Q:param(.7)}),
  createStereoPanner:()=>Object.assign(node(),{pan:param(0)}),createDelay:()=>Object.assign(node(),{delayTime:param(0)}),createBufferSource:node,
  createOscillator:()=>Object.assign(node(),{frequency:param(440)}),createAnalyser:()=>Object.assign(node(),{getFloatTimeDomainData(a){a.fill(0);}}),
  createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:c=>data[c]};},
 };
}
const noMedia=async()=>({ok:false,status:404});
async function audioFixture(){const c=context(),audio=await new SourceDriveAcoustics({context:c,destination:c.createGain(),fetcher:noMedia}).initialize();return{c,audio};}
function sync(audio,out){audio.sync(out.driveState,[],out.weather,out.evolution,[]);}

test('real return frames satisfy the existing acoustic contract across sea, reversed fall, hydroplane, forward road and dolly',()=>{
 for(const[t,phase,contact]of[[4,'seabed',0],[15,'reverse-bluffs',0],[20,'reverse-bluffs',1],[26,'hydroplane',1],[35,'forward-bluffs',1],[49,'camera-release',0]]){
  const sampled=sample(t),out=render(t),frame=driveOpeningAcousticFrame(out.driveState);
  assert.equal(out.driveState.paused,false,'presentation holds belong to the scene, not a permanently paused synthetic drive state');
  assert.equal(out.driveState.gear,sampled.vehicle.gear);assert.equal(out.driveState.openingCinematic.schema,1);
  assert.ok(frame,'the actual existing acoustic classifier must accept '+phase);assert.equal(frame.phase,phase);assert.equal(frame.timeSec,t);assert.equal(frame.roadContact,contact);
  assert.equal(frame.submerged,sampled.underwater);
 }
 const fading=driveOpeningAcousticFrame(render(40).driveState);assert.ok(fading.roadContact>0&&fading.roadContact<1);
 assert.equal(fading.roadContact,1-sample(40).sourceBlack,'rolling contact vanishes with the actual road, before the third-person black shot');
});

test('explicit contact accepts only finite0–1 values while original opening phase defaults remain unchanged',()=>{
 for(const[phase,expected]of[['free-drive',1],['sound-lead',1],['departure',1],['fall',0],['submerge',0]]){
  const opening={...doorDriveCinematicFrame(10),phase},state={openingCinematic:opening};
  assert.equal(driveOpeningAcousticFrame(state).roadContact,expected);
  for(const invalid of[NaN,Infinity,-.1,1.1,'1',null,undefined])assert.equal(driveOpeningAcousticFrame({openingCinematic:{...opening,audio:{...opening.audio,roadContact:invalid}}}).roadContact,expected);
  for(const valid of[0,.25,1])assert.equal(driveOpeningAcousticFrame({openingCinematic:{...opening,audio:{...opening.audio,roadContact:valid}}}).roadContact,valid);
 }
 assert.equal(driveOpeningAcousticFrame({}),null,'ordinary Source driving cannot acquire a cinematic override');
});

test('real SourceDriveAcoustics.sync applies submerged pressure/filtering and changes actual engine and road parameters through the return',async()=>{
 const{audio}=await audioFixture();try{
  audio.setPaused(false);sync(audio,render(4));
  assert.equal(audio.diagnostics().opening.phase,'seabed');assert.equal(audio.openingFilter.frequency.value,430);
  assert.equal(audio.roadGain.gain.value,0);assert.ok(audio.loadedWater.gain.gain.value>=.065);assert.ok(audio.loadedPressure.gain.gain.value>.02);assert.ok(audio.engineGain.gain.value>0);
  sync(audio,render(15));assert.equal(audio.roadGain.gain.value,0,'the reverse fall is not a rolling surface');
  const reverse=render(20);sync(audio,reverse);const reverseHz=audio.diagnostics().engine.hz;
  assert.equal(audio.openingFilter.frequency.value,18000);assert.ok(audio.roadGain.gain.value>0,'actual road reattachment restores rolling sound');
  sync(audio,{...reverse,driveState:{...reverse.driveState,gear:1}});assert.ok(reverseHz>audio.diagnostics().engine.hz,'the sampled reverse gear reaches the real engine calculation');
  sync(audio,render(26));assert.equal(audio.diagnostics().opening.phase,'hydroplane');assert.equal(audio.diagnostics().opening.roadContact,1);assert.equal(audio.diagnostics().opening.submerged,0);
  sync(audio,render(35));assert.equal(audio.diagnostics().opening.phase,'forward-bluffs');assert.ok(audio.roadGain.gain.value>0);
  const fading=render(40);sync(audio,fading);const fadedRoad=audio.roadGain.gain.value;
  sync(audio,{...fading,driveState:{...fading.driveState,openingCinematic:{...fading.driveState.openingCinematic,audio:{...fading.driveState.openingCinematic.audio,roadContact:1}}}});
  assert.ok(fadedRoad<audio.roadGain.gain.value,'Source black fades the actual road gain instead of changing only telemetry');
  sync(audio,render(49));assert.equal(audio.roadGain.gain.value,0);assert.equal(audio.loadedWater.gain.gain.value,0);assert.ok(audio.diagnostics().engine.hz>0,'the actual van engine survives its black exterior');
 }finally{audio.dispose();}
});

test('the real scene mutes the real acoustic owner under explicit pause and host holds, then resumes the saved clock',async()=>{
 const c=context();let held=false,audio,last=null;
 const scene=makeSourceReturnFlashbackScene({destination:'chapel',context:c,destinationAudio:c.createGain(),returnPose:{x:2,y:3,yaw:.2,pitch:0,facing:0},
  isHeld:()=>held,fetcher:async()=>({ok:true,json:async()=>metrics}),
  createRenderer:()=>({initialize:async()=>true,render:(frame,m)=>{last=sourceReturnRenderFrame(frame,m);return true;},last:()=>last,dispose(){}}),
  createAudio:options=>audio=new SourceDriveAcoustics({...options,fetcher:noMedia}),
 });
 async function advance(seconds){for(let left=seconds;left>1e-8;left-=.05){scene.update(Math.min(.05,left));scene.render();await flush();}}
 try{
  await scene.initialize();await advance(3.5);await flush();await advance(.5);
  assert.ok(scene.serialize().elapsed>0);assert.equal(audio.diagnostics().paused,false);assert.equal(audio.diagnostics().opening.phase,'seabed');
  assert.equal(scene.diagnostics().audioDiagnostics.opening.filterHz,430,'the native diagnostic tap is the actual owner, separate from serialization');
  assert.equal(Object.hasOwn(scene.serialize(),'audioDiagnostics'),false);
  for(const kind of['pause','host']){
   if(kind==='pause')scene.pause();else held=true;
   const time=scene.serialize().elapsed,openingTime=audio.diagnostics().opening.timeSec;await advance(.5);
   assert.equal(scene.serialize().elapsed,time);assert.equal(audio.cabin.gain.value,0);assert.equal(audio.diagnostics().opening.timeSec,openingTime);
   if(kind==='pause')scene.resume();else held=false;
   await advance(.2);assert.ok(scene.serialize().elapsed>time);assert.equal(audio.cabin.gain.value,1);
  }
 }finally{scene.exit();}
});
