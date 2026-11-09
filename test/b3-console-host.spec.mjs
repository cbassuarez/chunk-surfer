import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {makeB3ConsoleScene} from '../src/game/b3-console-scene.js';
import {createB3SpeakerDisturbance} from '../src/game/b3-speaker-disturbance.js';
const source=fs.readFileSync(process.env.B3_MAIN_SOURCE||new URL('../src/main.js',import.meta.url),'utf8');
function extract(name,next){const a=source.indexOf(`function ${name}(`),b=source.indexOf(`\nfunction ${next}(`,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function host(){
 const log=[],speaker=createB3SpeakerDisturbance();let recording=false;
 const h={storyMode:true,usingSpecialSpace:()=>false,scenes,makeB3ConsoleScene,b3Speaker:speaker,b3ConsoleScene:null,
  REC:{isRecording:()=>recording,isSlating:()=>false,isStalled:()=>false},recordAction:()=>{log.push('stop');recording=false;},
  openB3ConsoleInvestigation:()=>log.push('investigate-return'),b3FadersDirty:false,b3ControlCueAt:0,performance:{now:()=>1000},CUES:{playCue(){},CUE:{keys:'keys'}},
  resetMotionInput:reason=>log.push('reset:'+reason),ensureInteractionFocus:()=>log.push('focus'),
  syncPointerMode:reason=>log.push('sync:'+reason),ensurePointerLock:reason=>{log.push('capture:'+reason);return Promise.resolve(true);}};
 vm.createContext(h);vm.runInContext(extract('openB3Console','openB3ConsoleInvestigation'),h);return{h,log,speaker,setRecording:v=>recording=v};
}
test('actual console host lends look on a fresh gesture and restores ordinary world ownership on leave',()=>{
 scenes.clear();const t=host();try{
  assert.equal(t.h.openB3Console(),true);const scene=scenes.top();assert.equal(scene.allowsLook,false);assert.equal(scenes.blocksWorld(),false);
  scene.key({key:'Tab',code:'Tab',isTrusted:true,preventDefault(){}});assert.equal(scenes.allowsLook(),true);assert.ok(t.log.includes('capture:b3-console-look'));
  const before=t.log.length;scene.key({key:'Tab',repeat:true});assert.equal(t.log.length,before,'repeat cannot swap camera ownership');
  scene.key({key:'Tab',isTrusted:true,preventDefault(){}});assert.equal(scenes.allowsLook(),false);
  scene.key({key:'e'});assert.equal(t.h.b3ConsoleScene,null);assert.equal(scenes.has('b3-console'),false);assert.ok(t.log.includes('sync:b3-console-close'));
 }finally{scenes.clear();}
});
test('actual host retains power paradox, reversible fader feedback and the sole recording STOP callback',()=>{
 scenes.clear();const t=host();try{
  t.speaker.step({enabled:true,recording:true,roomId:'main_b3',takeElapsed:41,minimumSeconds:45,dt:.1});
  t.h.openB3Console();const scene=scenes.top(),before=t.speaker.snapshot().intensity;
  scene.key({key:'p'});assert.equal(t.speaker.snapshot().powerOn,false);assert.equal(t.speaker.snapshot().intensity,before);
  scene.key({key:'ArrowDown'});assert.equal(t.speaker.snapshot().intensity,before,'empty channel does not disguise the real source');
  scene.key({key:'ArrowRight'});scene.key({key:'ArrowRight'});scene.key({key:'ArrowDown'});assert.ok(t.speaker.snapshot().intensity<before);
  scene.key({key:'ArrowUp'});assert.equal(t.speaker.snapshot().intensity,before);
  scene.key({key:'Tab',preventDefault(){}});scene.key({key:'r'});assert.equal(t.log.includes('stop'),false);
  t.setRecording(true);scene.key({key:'r'});assert.equal(t.log.filter(x=>x==='stop').length,1);assert.equal(scene.view().looking,true);
  scene.key({key:'e'});assert.equal(t.h.b3ConsoleScene,null);
 }finally{scenes.clear();}
});
test('actual TRACE handoff releases the desk before opening the monitor-return investigation',()=>{
 scenes.clear();const t=host();try{t.h.openB3Console();scenes.top().key({key:'i'});assert.equal(scenes.has('b3-console'),false);assert.equal(t.h.b3ConsoleScene,null);assert.equal(t.log.at(-1),'investigate-return');}finally{scenes.clear();}
});
test('the real recorder face is lifted clear of the hands-on desk and returns low during a glance',()=>{
 const calls=[],h={b3ConsoleScene:{view:()=>({looking:false,layout:{y:25}})},SPEECH:{speechPanelRows:()=>4},REC:{isSlating:()=>false,isStalled:()=>false},liveTakePanelRect:o=>{calls.push(o);return o;}};
 vm.createContext(h);vm.runInContext(extract('takePanelRect','liveRecordingControlHit'),h);
 assert.equal(h.takePanelRect({cols:120,rows:40}).clearBottom,15.6);
 h.b3ConsoleScene.view=()=>({looking:true,layout:{y:25}});assert.equal(h.takePanelRect({cols:120,rows:40}).clearBottom,4);
 h.b3ConsoleScene=null;assert.equal(h.takePanelRect({cols:120,rows:40}).clearBottom,4);
});
