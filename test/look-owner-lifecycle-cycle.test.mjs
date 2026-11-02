import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPointerModeController} from '../src/input/pointer-mode.js';
import {makeGetInDriveTeaserScene} from '../src/game/get-in-drive-teaser-scene.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function gameplayInputLifecycleActive('),end=main.indexOf('\n}\n',start);
assert.ok(start>=0&&end>start);
const actualLifecycle=main.slice(start,end+3);
function fixture(){
 const state={domFocused:true,paused:false,policyReads:0},documentRef={hidden:false,visibilityState:'visible',hasFocus:()=>state.domFocused,body:{classList:{toggle(){}}}};
 let scene=null;
 const context=vm.createContext({IS_TAURI:true,document:documentRef,pointerMode:null});
 const lifecycle=vm.runInContext(`(${actualLifecycle})`,context);
 const pointer=createPointerModeController({documentRef,getTargetElement:()=>null,allowSoftCaptureFallback:false,
  getState:()=>{state.policyReads++;return{renderer:'3d',storyMode:true,inRogue:true,paused:state.paused,blocksInput:true,blocksLook:!scene?.allowsLook};}});
 context.pointerMode=pointer;
 let time=0,held=true;
 const controller={start(){},setPaused(v){held=v;},update(dt){if(!held)time+=dt;},snapshot:()=>({look:{yaw:0,pitch:0}}),dispose(){},
  frame:()=>({phase:'approach',timeSec:time,controlsEnabled:true,coverAlpha:0,worldOwner:'drive',finished:false,renderFrame:{driveState:{},scene:{cut:{sources:[]},predicaments:{sources:[]}},weather:{},evolution:{}}})};
 scene=makeGetInDriveTeaserScene({isHeld:()=>state.paused||!lifecycle(),fetcher:async()=>({ok:true,json:async()=>({})}),
  createRenderer:()=>({initialize:async()=>true,setRecorderReadout(){},render:()=>true,dispose(){}}),
  createController:()=>controller,createAcoustics:()=>({setPaused(){},initialize:async()=>{},sync(){},dispose(){}}),
  createIntrusion:()=>({update(){},apply:frame=>frame,presented:()=>null,snapshot:()=>({triggered:false}),cancel(){}}),
  createIntrusionAudio:()=>({setPaused(){},dispose(){}})});
 return{state,documentRef,lifecycle,pointer,scene};
}
test('native focus can be read without evaluating scene or pointer capture policy',()=>{
 const h=fixture();assert.equal(h.pointer.nativeFocus(),null);assert.equal(h.state.policyReads,0);
 h.pointer.handleNativeFocusChange(false);const reads=h.state.policyReads;
 for(let i=0;i<20;i++)assert.equal(h.pointer.nativeFocus(),false);
 assert.equal(h.state.policyReads,reads,'the leaf lifecycle read must not call getState');h.scene.exit();h.pointer.dispose();
});
test('real teaser look ownership and the real main lifecycle predicate cannot recurse through pointer status',async()=>{
 const h=fixture();
 // Preparing the actual scene reaches its real isHeld callback. No WebGL,
 // audio device, native focus bypass or alternate scene getter is involved.
 for(let i=0;i<3;i++)h.scene.update(.1);await h.scene.pending();assert.equal(h.scene.allowsLook,true);
 for(let i=0;i<20;i++){assert.equal(h.pointer.status().policy.blocksLook,false);assert.equal(h.lifecycle(),true);}
 h.state.domFocused=false;assert.equal(h.lifecycle(),false,'unknown native focus falls back to WebKit');
 h.pointer.handleNativeFocusChange(true);h.scene.resume();assert.equal(h.lifecycle(),true);assert.equal(h.scene.allowsLook,true,'verified native focus wins over delayed DOM focus');
 h.state.paused=true;h.scene.render();assert.equal(h.scene.allowsLook,false);assert.equal(h.pointer.status().policy.blocksLook,true);
 h.state.paused=false;h.scene.resume();assert.equal(h.scene.allowsLook,true);
 h.documentRef.hidden=true;assert.equal(h.lifecycle(),false);h.scene.render();assert.equal(h.pointer.status().policy.blocksLook,true);
 h.documentRef.hidden=false;h.pointer.handleNativeFocusChange(false);assert.equal(h.lifecycle(),false);h.scene.render();assert.equal(h.scene.allowsLook,false);
 h.scene.exit();h.pointer.dispose();
});
