import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {InputManager,movementCodeForEvent} from '../src/input/input-manager.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
  const start=main.indexOf(`function ${name}(`);assert.ok(start>=0,`production ${name} exists`);
  const end=main.indexOf('\n}',start);assert.ok(end>start,`production ${name} has a complete body`);
  return main.slice(start,end+2);
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function body(){
  const pose={yaw:1,pitch:.2},applied=[];
  const owner={id:'borrowed-source',blocksInput:true,allowsLook:true,
    lookAngles:()=>({...pose}),lookBy(yaw,pitch){applied.push({yaw,pitch});pose.yaw+=yaw;pose.pitch+=pitch;}};
  return{owner,pose,applied};
}
function inputHost(){
  scenes.clear();
  const focus={native:true,dom:false},axes={turnX:0,lookY:0},motionInput=new InputManager();
  const world={yaw:.7,pitch:-.1},calls={worldLooks:[],worldReads:0,receipts:[],resets:[]};
  const h={scenes,motionInput,keysDown:motionInput.held,IS_TAURI:true,paused:false,RENDERER:'3d',costumeInspectionScene:null,
    nextMoveAtMs:0,nextTurnAtMs:0,renderMove:null,towerWarningAudio:null,
    document:{hidden:false,visibilityState:'visible',hasFocus:()=>focus.dom},pointerMode:{status:()=>({nativeBackend:{focused:focus.native}})},
    controllerGameplayAxes:()=>axes,clamp:(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),getSave:()=>({settings:{mouseSensitivity:2,mouseInvertY:false}}),
    R3:{r3dLookAngles(){calls.worldReads++;return{...world};},r3dLook(yaw,pitch){calls.worldLooks.push({yaw,pitch});world.yaw+=yaw;world.pitch+=pitch;}},
    noteExteriorArrivalControl:value=>calls.receipts.push(value),
    resetMotionInput(reason){calls.resets.push(reason);motionInput.reset(reason);h.nextMoveAtMs=0;h.nextTurnAtMs=0;h.renderMove=null;},
  };
  vm.createContext(h);
  for(const name of ['gameplayInputLifecycleActive','holdUnavailableGameplayInput','mouseLookSensitivity','mouseInvertY','tickIndependentLook'])vm.runInContext(production(name),h);
  return{h,focus,axes,calls,world,close:()=>scenes.clear()};
}

test('the real scene stack keeps a borrowed look owner through passive notices and look-permitting speech',t=>{
  scenes.clear();t.after(()=>scenes.clear());const b=body();scenes.push(b.owner);
  assert.equal(scenes.lookOwner(),b.owner);assert.equal(scenes.allowsLook(),true);
  scenes.push({id:'notice',overlay:true});assert.equal(scenes.lookOwner(),b.owner);
  scenes.push({id:'speech',blocksInput:true,allowsLook:true});assert.equal(scenes.lookOwner(),b.owner);assert.equal(scenes.allowsLook(),true);
  scenes.push({id:'pause',blocksInput:true,allowsLook:false});assert.equal(scenes.lookOwner(),null);assert.equal(scenes.allowsLook(),false);
  scenes.pop();assert.equal(scenes.lookOwner(),b.owner);
  scenes.push({id:'menu',blocksInput:true});assert.equal(scenes.lookOwner(),null);
  scenes.push({id:'harmless-look-overlay',overlay:true,allowsLook:true});assert.equal(scenes.lookOwner(),null,'an overlay cannot lend the body through a modal menu');
  scenes.clear();assert.equal(scenes.lookOwner(),null);
});

test('actual mouse and controller look deltas target the borrowed camera rather than the parked world camera',t=>{
  const x=inputHost();t.after(x.close);const b=body();scenes.push(b.owner);scenes.push({id:'speech',blocksInput:true,allowsLook:true});
  x.axes.turnX=.5;x.axes.lookY=.25;x.h.motionInput.pointerDx=8;x.h.motionInput.pointerDy=-3;
  x.h.tickIndependentLook(.1);
  assert.equal(b.applied.length,2);near(b.pose.yaw,1+.5*.1*2.2+8*2*.0048);near(b.pose.pitch,.2+.25*.1*1.55+3*2*.0048);
  assert.equal(x.calls.worldLooks.length,0);assert.equal(x.calls.worldReads,0,'reading the parked camera would make local receipt deltas wrong');
  assert.equal(x.h.motionInput.pointerDx,0);assert.equal(x.h.motionInput.pointerDy,0);
  assert.equal(x.calls.receipts.length,1);near(x.calls.receipts[0].yawDelta,b.pose.yaw-1);near(x.calls.receipts[0].pitchDelta,b.pose.pitch-.2);
});

test('ordinary world look still uses the renderer when there is no borrowed owner',t=>{
  const x=inputHost();t.after(x.close);scenes.push({id:'notice',overlay:true});
  x.h.motionInput.pointerDx=5;x.h.motionInput.pointerDy=2;x.h.tickIndependentLook(.01);
  assert.equal(scenes.lookOwner(),null);assert.equal(x.calls.worldLooks.length,1);
  near(x.world.yaw,.7+5*2*.0048);near(x.world.pitch,-.1-2*2*.0048);assert.equal(x.calls.receipts.length,1);
});

test('pause, hidden views and confirmed native focus loss discard pointer displacement instead of replaying it',t=>{
  const x=inputHost();t.after(x.close);const b=body();scenes.push(b.owner);
  for(const mode of ['pause','hidden','native-blur']){
    x.h.paused=mode==='pause';x.h.document.hidden=mode==='hidden';x.focus.native=mode!=='native-blur';x.focus.dom=true;
    x.h.motionInput.pointerDx=11;x.h.motionInput.pointerDy=-7;
    x.h.tickIndependentLook(.1);
    assert.equal(b.applied.length,0,mode+' must not move the camera');
    assert.equal(x.h.motionInput.pointerDx,0,mode+' must discard horizontal displacement');
    assert.equal(x.h.motionInput.pointerDy,0,mode+' must discard vertical displacement');
    x.h.paused=false;x.h.document.hidden=false;x.focus.native=true;x.h.tickIndependentLook(.1);
    assert.equal(b.applied.length,0,mode+' must not replay the old displacement on return');
  }
  assert.equal(x.calls.worldLooks.length,0);assert.equal(x.calls.receipts.length,0);
});

test('actual consumed-key dispatch preserves the borrowed body frame clock and pending mouse during held W repeats',async t=>{
  const x=inputHost();t.after(x.close);const h=x.h;
  const scene=createSourceContinuationScene({checkpoint:freshSourceContinuation({runId:'held-modal-input'}),
    renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}}});
  scenes.push(scene);assert.equal(await scene.initialize(),true);assert.equal(scenes.lookOwner(),scene);
  // Exercise the real onKey consumed-scene branch, excluding unrelated title,
  // browser-shortcut and hardware-prompt handlers. Its reset and timing helpers
  // are also the actual production functions rather than simulated counters.
  const consumedStart=main.indexOf('  const wasBlockingScene = scenes.blocksInput();',main.indexOf('function onKey('));
  const consumedEnd=main.indexOf('\n  if(!inRogue)',consumedStart);
  assert.ok(consumedStart>=0&&consumedEnd>consumedStart);
  h.movementCodeForEvent=movementCodeForEvent;h.lastLoopMs=1000;h.motionResetReason='';h.REC={setSlow(){}};h.snapMotionRig=()=>{};
  vm.runInContext(production('resetMotionInput')+'\n'+production('clearMotionClock')+'\n'+production('movementKey'),h);
  vm.runInContext('function consumedKey(e){const moveKey=movementKey(e);\n'+main.slice(consumedStart,consumedEnd)+'\n}',h);
  let prevented=0;const key=repeat=>({key:'w',code:'KeyW',repeat,preventDefault(){prevented++;}});
  h.motionInput.setPointerLocked(true);h.motionInput.addPointerDelta(23,-9);
  const before=scene.serialize();h.consumedKey(key(false));
  for(let i=0;i<4;i++)h.consumedKey(key(true));
  assert.equal(prevented,5);assert.equal(h.lastLoopMs,1000,'repeat must not force the loop onto its startup16ms fallback');
  assert.equal(h.motionInput.pointerDx,23);assert.equal(h.motionInput.pointerDy,-9,'the same frame still owns mouse displacement');
  const clockStart=main.indexOf('    const rawGapMs=lastLoopMs ? nowLoopMs-lastLoopMs : 16;');
  const clockEnd=main.indexOf('\n',main.indexOf('lastLoopMs=nowLoopMs;',clockStart));
  assert.ok(clockStart>=0&&clockEnd>clockStart);
  vm.runInContext('function heldFrame(nowLoopMs){\n'+main.slice(clockStart,clockEnd)+'\ntickIndependentLook(dt);return dt;}',h);
  const dt=h.heldFrame(1050);assert.equal(dt,.05);scene.update(dt);
  assert.ok(scene.serialize().z<before.z,'the held body advances with its actual frame duration');
  near(scene.lookAngles().yaw,before.yaw+23*2*.0048);near(scene.lookAngles().pitch,before.pitch+9*2*.0048);
  assert.equal(h.motionInput.pointerDx,0);assert.equal(h.motionInput.pointerDy,0);assert.equal(x.calls.worldLooks.length,0);
  scenes.push({id:'pause',blocksInput:true,allowsLook:false,key:()=>true});
  h.motionInput.addPointerDelta(19,4);h.consumedKey(key(true));
  assert.equal(h.lastLoopMs,0,'ordinary modal input still clears the world frame clock');
  assert.equal(h.motionResetReason,'scene-consumed');assert.equal(h.motionInput.pointerDx,0);assert.equal(h.motionInput.pointerDy,0);
});

test('native focus replaces stale DOM focus, while hidden and unknown native states retain their real holds',()=>{
  const x=inputHost();try{
    x.focus.native=true;x.focus.dom=false;assert.equal(x.h.gameplayInputLifecycleActive(),true);
    x.focus.native=false;x.focus.dom=true;assert.equal(x.h.gameplayInputLifecycleActive(),false);
    x.focus.native=true;x.h.document.hidden=true;assert.equal(x.h.gameplayInputLifecycleActive(),false);
    x.h.document.hidden=false;x.h.document.visibilityState='hidden';assert.equal(x.h.gameplayInputLifecycleActive(),false);
    x.h.document.visibilityState='visible';x.focus.native=null;x.focus.dom=false;assert.equal(x.h.gameplayInputLifecycleActive(),false);
    x.focus.dom=true;assert.equal(x.h.gameplayInputLifecycleActive(),true);
    x.h.IS_TAURI=false;x.focus.dom=false;x.focus.native=true;assert.equal(x.h.gameplayInputLifecycleActive(),false,'browser play still uses actual DOM focus');
  }finally{x.close();}
});

for(const name of ['beginCoastalMemoryJourney','beginSourceFalseReturn','beginSourceEarthfall','beginSourceContinuation','beginSourcePubJourney']){
  test(`${name} actual update wrapper accepts confirmed native focus without a second DOM-focus veto`,()=>{
    const source=production(name),wrappers=source.match(/scene\.update=dt=>\{[^\n]*\};/g)||[];
    assert.equal(wrappers.length,1,'one production update wrapper is exercised');
    const focus={native:true,dom:false},updates=[];
    const h={IS_TAURI:true,paused:false,document:{hidden:false,visibilityState:'visible',hasFocus:()=>focus.dom},
      pointerMode:{status:()=>({nativeBackend:{focused:focus.native}})},scene:{update:dt=>updates.push(dt)}};
    vm.createContext(h);vm.runInContext(production('gameplayInputLifecycleActive'),h);
    vm.runInContext('const update=scene.update;\n'+wrappers[0],h);
    h.scene.update(.1);assert.deepEqual(updates,[.1],'native-focused body must advance even while WebKit reports stale DOM focus');
    focus.native=false;focus.dom=true;h.scene.update(.2);assert.deepEqual(updates,[.1]);
    focus.native=true;h.document.hidden=true;h.scene.update(.3);assert.deepEqual(updates,[.1]);
    h.document.hidden=false;h.paused=true;h.scene.update(.4);assert.deepEqual(updates,[.1]);
    h.paused=false;focus.native=null;focus.dom=true;h.scene.update(.5);assert.deepEqual(updates,[.1,.5]);
    focus.dom=false;h.scene.update(.6);assert.deepEqual(updates,[.1,.5]);
    if(name==='beginCoastalMemoryJourney'){
      const held=source.match(/isHeld:\(\)=>[^\n]+/);assert.ok(held,'coastal audio/body hold uses the same lifecycle truth');
      vm.runInContext('var coastalHeld='+held[0].replace(/^isHeld:/,'').replace(/,$/,'')+';',h);
      focus.native=true;focus.dom=false;assert.equal(h.coastalHeld(),false);h.document.hidden=true;assert.equal(h.coastalHeld(),true);
    }
  });
}
