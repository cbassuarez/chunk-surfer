import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createB3SpeakerDisturbance} from '../src/game/b3-speaker-disturbance.js';
const source=fs.readFileSync(process.env.B3_MAIN_SOURCE||new URL('../src/main.js',import.meta.url),'utf8');
function extract(name,nextName){const start=source.indexOf(`function ${name}(`),end=source.indexOf(`\nfunction ${nextName}(`,start);assert.ok(start>=0&&end>start);return source.slice(start,end);}
function host(){
 let nativeFocused=true,paused=false,clock=9;
 const calls={audio:[],visit:[]},speaker=createB3SpeakerDisturbance();
 const h={storyMode:true,usingPlan:()=>true,usingSpecialSpace:()=>false,px:42,py:21,CELL:.5,performance:{now:()=>10000},
  document:{hidden:false,hasFocus:()=>false},gameplayInputLifecycleActive:()=>nativeFocused,
  FP:{logicalToPhysical:()=>({x:42,z:21,y:-4,renderGroup:'basement'}),toRuntimePoint:()=>({x:40,y:14})},
  b3Speaker:speaker,b3SpeakerAudio:{pause(){},state:()=>({ready:true}),update:o=>{calls.audio.push(o);return{active:false};}},
  actx:{state:'running'},sfxGain:{},REC:{hasTake:()=>false,recState:()=>({takeElapsed:clock}),isRecording:()=>true,isSlating:()=>false,minimumTakeDuration:()=>10},
  takeRoom:'main_b3',recordableRoomAt:()=> 'main_b3',b3ConsoleScene:null,
  B3_SPEAKER_SOURCE:{x:20,z:7},acousticSpatialAt:(x,y)=>({x,y}),acousticOcclusionDb:()=>0,R3:{r3dWorldYaw:()=>0},mapHeading:()=>0,
  b3TapeCueAt:-1,b3FadersDirty:false,b3FaderRefreshAt:0,
  tickB3HushVisit:(...args)=>calls.visit.push(args)};
 Object.defineProperty(h,'paused',{get:()=>paused});vm.createContext(h);vm.runInContext(extract('tickB3Speaker','tickRecorder'),h);
 return{h,calls,speaker,setFocus:v=>nativeFocused=v,setPaused:v=>paused=v,setElapsed:v=>clock=v};
}
test('actual B3 audio owner advances under verified native focus even while WebKit focus is delayed',()=>{
 const t=host();t.h.tickB3Speaker(.1);
 assert.equal(t.speaker.snapshot().active,true,'actual disturbance wakes near usable minimum');
 assert.equal(t.calls.audio.at(-1).focused,true);
 const age=t.speaker.snapshot().age;t.setFocus(false);t.h.tickB3Speaker(.5);
 assert.equal(t.speaker.snapshot().age,age,'real native blur holds the encounter');
 assert.equal(t.calls.audio.at(-1).focused,false);
 t.setFocus(true);t.h.tickB3Speaker(.1);assert.ok(t.speaker.snapshot().age>age);
 t.setPaused(true);const held=t.speaker.snapshot().age;t.h.tickB3Speaker(.4);assert.equal(t.speaker.snapshot().age,held);
});
test('actual B3 visit owner uses the same native lifecycle as its audible source',()=>{
 let nativeFocused=true;const seen=[];
 const visit={snapshot:()=>({phase:'inside'}),step:s=>{seen.push(s);return{phase:'inside'};}};
 const h={storyMode:true,usingSpecialSpace:()=>false,usingPlan:()=>true,ensureB3HushVisit:()=>visit,
  REC:{recState:()=>({}),isRecording:()=>false,minimumTakeDuration:()=>10,isSlating:()=>false},
  performance:{now:()=>1000},b3VisitRetryAt:0,CELL:.5,paused:false,gameplayInputLifecycleActive:()=>nativeFocused,
  document:{hasFocus:()=>false},actx:{state:'running'},PRES:{presenceTableauActive:()=>false},activeBattleId:null,
  flagTest:()=>false,px:42,py:21};vm.createContext(h);vm.runInContext(extract('tickB3HushVisit','tickB3Speaker'),h);
 const physical={x:42,z:21,y:-4,renderGroup:'basement'};
 h.tickB3HushVisit(.1,{active:true,intensity:1},{active:true},physical);assert.equal(seen.at(-1).suspended,false);
 nativeFocused=false;h.tickB3HushVisit(.1,{active:true,intensity:1},{active:true},physical);assert.equal(seen.at(-1).suspended,true);
});

test('moving physical B3 caps refreshes their props without reuploading the floorplan',()=>{
 const t=host(),poses=[{id:'b3-console-fader-03',x:20.8,y:-3.082,z:11.24}];
 t.h.b3FadersDirty=true;t.h.PROPS={};t.h.syncB3FaderProps=()=>16;
 let sent=null;t.h.worldRenderInstances=group=>{assert.equal(group,'basement');return poses;};
 t.h.R3.r3dSetProps=value=>{sent=value;};
 t.h.syncBuildingRender=()=>{throw Error('A fader must not reupload the complete physical floorplan');};
 t.h.tickB3Speaker(.1);assert.equal(sent,poses);assert.equal(t.h.b3FadersDirty,false);
});
