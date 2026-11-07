// Run with: node --experimental-vm-modules --test test/driving-cabin-look.test.mjs
// Real scene owners, driving physics, controller normalization, pointer capture,
// InputManager and main's dispatch are exercised together. Only presentation
// geometry, GPU/audio services and the browser environment are test doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {aimOpeningCabDoor} from './helpers/opening-cab-aim.mjs';
import {createStudentStrikeInputGate} from '../src/game/student-strike-host.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const main=await readFile(path.join(root,'src/main.js'),'utf8');
const geometry=await readFile(path.join(root,'src/game/source-drive/scene.js'),'utf8');
const section=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,`Production section is missing: ${start}`);
  return source.slice(a,b);
};
const nearly=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message||`${a} differs from ${b}`);
const noop=()=>{};
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const metrics={wheel:{},recorder:{},eye:[0,1.6,0],cabinBodyMount:[0,0,0]};
const key=(value,extra={})=>({key:value,code:value===' '?'Space':value.length===1?`Key${value.toUpperCase()}`:value,
  repeat:false,preventDefault(){this.defaultPrevented=true;},...extra});
const pointer=(type,extra={})=>({type,button:0,pointerId:1,pointerType:'mouse',x:30,y:40,clientX:30,clientY:40,width:800,height:600,...extra});
const audio=()=>({initialize:async()=>true,setPaused:noop,sync:noop,dispose:noop,click:noop,joint:noop});
const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,setRecorderReadout:noop,
  project:()=>({visible:true,x:.5,y:.5}),dispose:noop});

async function environment(){
  let focused=true,clock=1000,hand=null,freeLookCalls=0,pauses=0,resets=0;
  const document={baseURI:'http://localhost/',hidden:false,visibilityState:'visible',pointerLockElement:null,hasFocus:()=>focused,
    body:{classList:{toggle:noop}},exitPointerLock(){this.pointerLockElement=null;}};
  const element={id:'map',getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
    requestPointerLock(){document.pointerLockElement=this;}};
  const context=vm.createContext({console,structuredClone,URL,URLSearchParams,document,
    performance:{now:()=>clock},setTimeout:()=>0,clearTimeout:noop,
    __geometryScene(s,_metrics,options){
      hand=options.handControl;
      return{body:identity(),eye:[0,1.6,0],roadPitch:0,vehicleHeading:s.heading,props:[],lamps:[],mirrors:[],colliders:[],
        targets:[{id:'power',point:[0,0,0]}],cut:{props:[],lights:[],sources:[]},predicaments:{props:[],lights:[],sources:[]},
        evolution:{},look:{yaw:s.heading,pitch:0}};
    },
    __handDiagnostics:()=>hand?{reach:{kind:hand.kind,atContact:hand.elapsed>=.28,complete:hand.elapsed>=.72}}:null,
  });
  const stubSources=new Map([
    ['src/render/ui.js','export const uiFill=()=>{},uiText=()=>{},uiInk=()=>{},uiScrim=()=>{},uiDraw=()=>{},uiDrawHardware=()=>{},uiWithClip=()=>{},uiWithHardwareLayer=()=>{},uiCellMetrics=()=>({}),uiWrap=()=>[],uiSize=()=>({cols:100,rows:40});'],
    ['src/game/source-drive-renderer.js','export const createSourceDriveRenderer=()=>{throw Error("Inject a GPU sink");};'],
    ['src/game/source-drive/acoustics.js','export class SourceDriveAcoustics {}'],
    ['src/audio/drive-bumper-intrusion.js','export const createDriveBumperIntrusionAudio=()=>({setPaused(){},dispose(){},play(){}});'],
    ['src/game/coastal-memory/scene.js','export const makeCoastalMemoryScene=()=>({props:[],lamps:[]});'],
    ['src/game/source-drive/geometry/wheel-hands-pose.js','export const resetWheelHands=()=>{},wheelHandDiagnostics=()=>globalThis.__handDiagnostics();'],
    ['src/game/source-drive/scene.js',section(geometry,'export const rotation=', 'const transform=')+
      'export const driveColliders=()=>[];export const makeDriveScene=(...args)=>globalThis.__geometryScene(...args);'],
  ]);
  const modules=new Map();
  async function getModule(filename){
    if(!modules.has(filename))modules.set(filename,(async()=>{
      const relative=path.relative(root,filename),source=stubSources.get(relative)??await readFile(filename,'utf8');
      return new vm.SourceTextModule(source,{context,identifier:filename,initializeImportMeta(meta){meta.env={};}});
    })());
    return modules.get(filename);
  }
  async function load(relative){
    const module=await getModule(path.join(root,relative));
    if(module.status==='unlinked')await module.link((specifier,from)=>getModule(path.resolve(path.dirname(from.identifier),specifier)));
    if(module.status==='linked')await module.evaluate();
    return module.namespace;
  }
  const scenes=await load('src/game/scenes.js');
  const {InputManager,movementCodeForEvent}=await load('src/input/input-manager.js');
  const controller=await load('src/game/controller.js');
  const bindings=await load('src/game/bindings.js');
  const input=new InputManager({documentRef:document});
  Object.assign(context,{scenes,motionInput:input,RENDERER:'3d',storyMode:true,inRogue:true,hushRunActive:false,paused:false,
    costumeInspectionScene:null,studentStrikeScene:null,studentStrikeInputGate:createStudentStrikeInputGate(),IS_TAURI:false,KEY_DEBUG:false,SUPPRESS_BROWSER_CHROME:false,
    holdUnavailableGameplayInput:()=>!focused||document.hidden,gameplayInputLifecycleActive:()=>focused&&!document.hidden,
    controllerGameplayAxes:()=>controller.controllerMotionAxes(),mouseLookSensitivity:()=>1,mouseInvertY:()=>false,
    shakeMode:()=> 'reduced',clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),noteExteriorArrivalControl:noop,
    R3:{r3dCancelMouseLookGlide:noop,r3dLookAngles:()=>({yaw:99,pitch:99}),r3dLook:()=>{freeLookCalls++;}},
    BINDINGS:bindings,hardwarePromptIds:()=>[],pressPromptControl:noop,releasePromptControl:noop,recoverInteractionAudio:noop,
    shouldOpenPauseForEvent:({key})=>key==='Escape',openPauseMenu:()=>{pauses++;context.paused=true;},
    SPEECH:{hasEscapableSpeech:()=>false},movementKey:movementCodeForEvent,movementRole:()=> 'move',isOnboardingActive:()=>false,
    clearMotionClock:noop,resetMotionInput:reason=>{resets++;input.reset(reason);},
    arrowDelta:()=>[0,0],turnHeldDir:()=>0,heldPropPlay:false,MAP_EL:element,
    uiPointFromClient:(x,y)=>({cellX:x/8,cellY:y/12}),personalWindowEffects:{ownsPointerTransfer:()=>false},
  });
  vm.runInContext(section(main,'function tickIndependentLook(', '\nfunction mouseLookSensitivity'),context);
  vm.runInContext(section(main,'function gameplayWantsPointerCapture(', '\nfunction syncPointerMode'),context);
  vm.runInContext(section(main,'function onKey(e)', '\nfunction onKeyUp'),context);
  vm.runInContext(section(main,'function onKeyUp(e)', '\nfunction onBlur'),context);
  const unlock=section(main,'  onUnexpectedUnlock:()=>{','\n});').replace('  onUnexpectedUnlock:','').replace(/,\s*$/,'');
  const onUnexpectedUnlock=vm.runInContext(`(${unlock})`,context);
  const {createPointerModeController}=await load('src/input/pointer-mode.js');
  const mode=createPointerModeController({documentRef:document,getTargetElement:()=>element,input,
    getState:()=>({renderer:'3d',storyMode:true,inRogue:true,paused:context.paused,
      blocksLook:scenes.blocksInput()&&!scenes.allowsLook()}),
    nowFn:()=>clock,setTimeoutFn:()=>0,clearTimeoutFn:noop,onUnexpectedUnlock});
  context.pointerMode=mode;
  context.resumeGameplayInput=()=>mode.requestCaptureFromGesture('keydown');
  vm.runInContext(section(main,'function scenePointerPayload(', '\nfunction onMapWheel'),context);
  async function capture(){await mode.requestCaptureFromGesture('test-gesture');mode.handlePointerLockChange();return mode.isTrueLocked();}
  async function source({entry='review',start=true}={}){
    const {createSourceDriveSession}=await load('src/game/source-drive-session.js');
    const owner=createSourceDriveSession({entry,metrics,returnPose:{x:10,y:20,yaw:.3,pitch:0},
      renderer:renderer(),acoustics:audio()});
    context.owner=owner;
    // Evaluate the actual installed wrapper, including its look forwarding.
    vm.runInContext(section(main,"  const scene={id:'source-drive'",'  sourceDriveScene=scene;')
      .replace('  const scene=','globalThis.driveScene='),context);
    const scene=context.driveScene;
    scenes.push(scene);
    await owner.initialize();
    if(start){owner.render();await owner.start();}
    return{owner,scene};
  }
  async function getIn({live=true,initialDrive=null}={}){
    const {makeGetInDriveTeaserScene}=await load('src/game/get-in-drive-teaser-scene.js');
    const {createDoorDriveTeaser}=await load('src/game/source-drive/door-teaser.js');
    const driver=createDoorDriveTeaser({initialDrive});
    const scene=makeGetInDriveTeaserScene({createRenderer:renderer,createAcoustics:audio,
      createController:()=>driver,createIntrusion:()=>({update:noop,apply:x=>x,snapshot:()=>({triggered:false}),cancel:noop,presented:()=>false}),
      fetcher:async()=>({ok:true,json:async()=>metrics}),getViewport:element.getBoundingClientRect,
      isHeld:()=>context.paused||!focused||document.hidden,presentationNow:()=>clock});
    scenes.push(scene);
    for(let i=0;i<3;i++)scene.update(.1);
    await scene.pending();
    assert.equal(scene.view().error,null,'The presentation fixture must prepare successfully');
    if(live)for(let i=0;i<9;i++)scene.update(.1);
    return{scene,driver};
  }
  async function opening({parked=false,driveEnabled=true,automaticParking=false}={}){
    const {makeOpeningVehicleScene}=await load('src/game/opening-vehicle-scene.js');
    const anchor={x:20,y:0,z:30,yaw:.4};
    const checkpoint=parked?{schema:1,reveal:1,drive:{schema:1,x:20,z:30,heading:.4,parked:true,brakeHold:true}}:null;
    // These shared driving-input cases intentionally exercise the retained
    // manual route; the auto-park suite separately proves production arrival.
    const scene=makeOpeningVehicleScene({getAnchor:()=>anchor,getAssetStatus:()=>({loaded:true}),driveEnabled,automaticParking,checkpoint});
    context.scene=scene;
    const host=section(main,'function beginOpeningVehicleArrival(', '// The first interaction in the game');
    vm.runInContext(section(host,'  const update=scene.update;', '  openingVehicleScene=scene;'),context);
    context.openingVehicleScene=scene;
    scenes.push(scene);scene.update(0);scene.update(.9);
    return{scene};
  }
  function installHostLifecycle(){
    Object.assign(context,{runPlayDurationClock:{suspend:noop},b3SpeakerAudio:{pause:noop},b3Speaker:{flush:noop},
      FEAR:{setHeartbeatPaused:noop},sourceRestBreath:null,sourceRestWeather:null,pubPressureAudio:null,firstStrikeScene:null,firstStrikeAudio:null,studentStrikeScene:null,studentStrikeAudio:null,sourceRecordingInspectionScene:null,bodyGain:null,
      syncChapelTapeDemandTimelineHold:noop,getInDriveTeaserScene:null,openingArrivalAudio:null,openingCabRadio:null,openingOvertureScene:null,
      STORY:{pauseOpeningOvertureScore:noop,resumeOpeningOvertureScore:noop},sourceReturnFlashbackScene:null,
      architectureDoorAudio:null,architectureDoorEvents:{hold:noop},cancelLastExposure:noop,cancelRecordingPressureAudio:noop,
      pubRoomAudio:null,sourcePubAudio:null,sourceContinuationAudio:null,towerWarningAudio:null,sourceDriveSession:null,
      sourcePubScene:null,sourceContinuationScene:null,standingTearScene:null,coastalMemoryScene:null,
      academicGhostDispatch:null,saveAcademicGhostClub:noop,cancelApparitionApplause:noop,pauseTowerEndingRecording:noop,
      saveSourceView:noop,outskirtsStreetAudio:null,pauseOutskirtsLastLight:noop,lowerTowerPersonalRecorder:noop,
      stopTowerPersonalWorldSignal:noop,bellPealPerformance:null,towerBellDirector:null,windowChoreography:{},
      syncPointerMode:reason=>mode.sync(reason),stopAllVoices:noop,stopWorldLayerVoice:noop,silenceAmbientDrone:noop,
      setGainNode:noop,dialogGain:null,sfxGain:null,sfxDirectGain:null,musicGain:null,whisperBed:null,hushStepBus:null,pushEvent:noop,
      applyAudioSettings:noop,startAmbientDroneAt:noop,currentAmbientTarget:()=>null,updateAudio:noop,
      setUiCueFocused:noop,recoverMotionFocus:()=>input.reset('focus-return'),refreshStageLayoutSoon:noop,ensureInteractionFocus:noop,
    });
    vm.runInContext(section(main,'function setGameplayPaused(', '\nfunction togglePause'),context);
    vm.runInContext(section(main,'function handleNativeGameplayFocus(', '\nfunction resumeGameplayInput'),context);
  }
  return{context,load,scenes,input,mode,document,element,controller,capture,source,getIn,opening,installHostLifecycle,
    tick:dt=>context.tickIndependentLook(dt),key:e=>context.onKey(e),keyup:e=>context.onKeyUp(e),
    mouse:(dx,dy)=>mode.handleMouseMove({movementX:dx,movementY:dy}),
    setFocus(value){focused=value;},advance(ms){clock+=ms;},
    get freeLookCalls(){return freeLookCalls;},get pauses(){return pauses;},get resets(){return resets;}};
}

for(const kind of ['source','getIn','opening']){
  test(`${kind}: captured mouse reaches the local camera once and keeps steering independent`,async()=>{
    const f=await environment(),{scene,owner,driver}=await f[kind]();
    const before=scene.lookAngles();
    const body=()=>owner?.status().state||driver?.snapshot().driveState||scene.view().drive;
    const heading=body().heading;
    assert.equal(f.scenes.blocksInput(),true);
    assert.equal(f.scenes.lookOwner(),scene);
    assert.equal(f.context.gameplayWantsPointerCapture(),true);
    assert.equal(await f.capture(),true);
    f.mouse(18,-12);
    // DOM PointerEvents also reach the scene. They must not apply the same
    // displacement a second time, or replace normal Look with drag controls.
    f.scenes.pointer(pointer('pointermove',{pointerCaptured:true,movementX:18,movementY:-12}));
    f.key(key('w'));f.key(key('a'));
    assert.equal(f.resets,0,'A modal cabin key must not erase queued Look');
    assert.equal(f.input.pointerDx,18);
    f.tick(1/60);
    nearly(scene.lookAngles().yaw,before.yaw+18*.0085);
    nearly(scene.lookAngles().pitch,before.pitch+12*.0068);
    nearly(body().heading,heading,'Looking must not steer the vehicle');
    assert.equal(f.freeLookCalls,0,'The parked exterior camera must not receive cabin Look');
    f.tick(1/60);
    nearly(scene.lookAngles().yaw,before.yaw+18*.0085,'Consumed motion must not replay');
    scene.update(.1);
    assert(body().throttle>0,'The forward pedal still works while looking');
    assert(Math.abs(body().wheelAngle)>0,'Steering still works while looking');
    f.keyup(key('w',{defaultPrevented:true}));f.keyup(key('a',{defaultPrevented:true}));
    for(let i=0;i<12;i++)scene.update(.1);
    nearly(body().throttle,0,'Release is honored even if another handler prevented default');
    assert(Math.abs(body().wheelAngle)<.02,'Released steering recentres');
    f.mode.dispose();
  });

  test(`${kind}: right stick uses the shared Look settings while left stick remains driving`,async()=>{
    const f=await environment(),{scene,owner,driver}=await f[kind]();
    const before=scene.lookAngles(),buttons=Array.from({length:17},()=>({pressed:false,value:0}));
    const pad={connected:true,id:'Xbox Standard Gamepad',index:0,mapping:'standard',axes:[-.9,-.9,.65,-.5],buttons};
    f.controller.setControllerNavigatorForTest({getGamepads:()=>[pad]});
    const mapped={move_up:'ArrowUp',move_down:'ArrowDown',move_left:'ArrowLeft',move_right:'ArrowRight'};
    const poll=()=>f.controller.gamepadTick({menuContext:f.scenes.blocksInput(),independentMotion:true,
      onPress:(action,repeat)=>{if(mapped[action])f.key(key(mapped[action],{controller:true,controllerAction:action,repeat}));},
      onRelease:action=>{if(mapped[action])f.keyup(key(mapped[action],{controller:true,controllerAction:action}));}});
    poll();
    const axes=f.controller.controllerMotionAxes();
    assert(axes.turnX>0&&axes.lookY>0&&axes.moveX<0&&axes.moveY>0);
    f.tick(.1);
    nearly(scene.lookAngles().yaw,before.yaw+axes.turnX*.1*2.2);
    nearly(scene.lookAngles().pitch,before.pitch+axes.lookY*.1*1.55);
    scene.update(.1);
    const body=()=>owner?.status().state||driver?.snapshot().driveState||scene.view().drive;
    assert(body().throttle>0&&Math.abs(body().wheelAngle)>0);
    const after=scene.lookAngles();
    pad.axes=[-.9,-.9,0,0];poll();f.tick(.1);
    nearly(scene.lookAngles().yaw,after.yaw,'Left stick may steer but must not rotate the head');
    pad.axes=[0,0,0,0];poll();
    for(let i=0;i<12;i++)scene.update(.1);
    nearly(body().throttle,0);
    f.mode.dispose();
  });
}

test('Source pause keeps the capture gesture available through asynchronous picture resume',async()=>{
  const f=await environment(),{owner,scene}=await f.source();
  await f.capture();f.mouse(20,4);f.key(key('w'));await owner.pause();
  f.context.paused=true;
  f.scenes.push({id:'pause',blocksInput:true,allowsLook:false,freezesBelow:true});
  f.mode.sync('pause');f.mode.handlePointerLockChange();f.tick(.1);
  assert.equal(f.mode.isTrueLocked(),false);assert.equal(f.input.pointerDx,0);
  const before=scene.lookAngles(),time=owner.status().state.programTime;
  assert.equal(scene.lookBy(.2,.1),false);
  f.scenes.pop();f.context.paused=false;
  assert.equal(await f.capture(),true,'The closing gesture must acquire capture before async resume');
  assert.equal(await owner.resumeWhenPresented(0),false,'A new picture is still required');
  owner.render();await owner.resumeWhenPresented(0);
  f.tick(.1);nearly(scene.lookAngles().yaw,before.yaw);
  scene.update(.1);assert(owner.status().state.programTime>time);
  nearly(owner.status().state.throttle,0,'Pause must discard the previous held pedal');
  f.mouse(5,0);f.tick(.1);nearly(scene.lookAngles().yaw,before.yaw+5*.0085);
  f.mode.dispose();
});

for(const kind of ['getIn','opening']){
  test(`${kind}: focus and pause revoke Look, release pedals, and resume without stale motion`,async()=>{
    const f=await environment(),{scene,driver}=await f[kind]();
    await f.capture();f.key(key('w'));scene.update(.1);f.mouse(50,10);
    f.setFocus(false);scene.blur();f.input.reset('window-blur');f.mode.sync('blur');f.mode.handlePointerLockChange();
    const before=scene.lookAngles();
    assert.equal(scene.lookBy(.5,.2),false);assert.equal(f.mode.isTrueLocked(),false);
    f.tick(.1);nearly(scene.lookAngles().yaw,before.yaw);
    f.setFocus(true);scene.focus?.();if(!scene.focus)scene.resume();
    await f.capture();f.tick(.1);nearly(scene.lookAngles().yaw,before.yaw);
    for(let i=0;i<12;i++)scene.update(.1);
    nearly((driver?.snapshot().driveState||scene.view().drive).throttle,0);
    scene.suspend?.();scene.setPaused?.(true);f.context.paused=true;
    f.scenes.push({id:'pause',blocksInput:true,allowsLook:false,freezesBelow:true});
    f.mode.sync('pause');assert.equal(f.scenes.lookOwner(),null);assert.equal(scene.lookBy(.5,0),false);
    f.scenes.pop();f.context.paused=false;scene.resume();
    assert.equal(f.scenes.lookOwner(),scene);await f.capture();f.mouse(5,0);f.tick(.1);
    nearly(scene.lookAngles().yaw,before.yaw+5*.0085);f.mode.dispose();
  });
}

test('browser Escape from captured driving opens the run-level pause',async()=>{
  const f=await environment();await f.source();await f.capture();
  f.document.pointerLockElement=null;f.mode.handlePointerLockChange();
  assert.equal(f.pauses,1);assert.equal(f.context.paused,true);assert.equal(f.input.pointerLocked,false);
  f.mode.dispose();
});

test('opening host focus return and direct pause resume release the hold without a scene-stack pop',async()=>{
  const f=await environment(),{scene}=await f.opening();f.installHostLifecycle();
  await f.capture();f.key(key('w'));scene.update(.1);f.mouse(30,0);
  f.setFocus(false);scene.blur();f.input.reset('window-blur');f.mode.release('window-blur');
  assert.equal(scene.allowsLook,false);
  f.setFocus(true);f.context.handleNativeGameplayFocus(true);
  assert.equal(scene.allowsLook,true,'The actual host focus adapter must resume the opening scene');
  const before=scene.lookAngles();await f.capture();f.tick(.1);nearly(scene.lookAngles().yaw,before.yaw);
  const depth=f.scenes.depth();f.context.setGameplayPaused(true,{announce:false});
  assert.equal(scene.allowsLook,false);f.context.handleNativeGameplayFocus(true);
  assert.equal(scene.allowsLook,false,'Regaining focus while paused must keep the hold');
  f.context.setGameplayPaused(false,{announce:false});
  assert.equal(f.scenes.depth(),depth,'No scene pop may be needed to release a direct pause');
  assert.equal(scene.allowsLook,true);await f.capture();f.mouse(5,0);f.tick(.1);
  nearly(scene.lookAngles().yaw,before.yaw+5*.0085);
  for(let i=0;i<12;i++)scene.update(.1);nearly(scene.view().drive.throttle,0);
  f.mode.dispose();
});

test('covered Source entry and get-in handover do not borrow Look before the live camera',async()=>{
  const f=await environment(),{owner,scene}=await f.source({entry:'moving',start:false});
  assert.equal(f.scenes.lookOwner(),null);assert.equal(await f.capture(),false);
  owner.render();await owner.start();
  for(let i=0;i<6;i++)owner.update(.1);
  assert.equal(scene.allowsLook,false);assert.equal(scene.lookBy(.2,0),false);
  owner.update(.1);assert.equal(scene.allowsLook,true);
  f.mode.dispose();
  const g=await environment(),{scene:teaser}=await g.getIn({live:false});
  assert.equal(teaser.allowsLook,false);assert.equal(await g.capture(),false);
  for(let i=0;i<9;i++)teaser.update(.1);
  assert.equal(teaser.allowsLook,true);assert.equal(await g.capture(),true);
  g.mode.dispose();
});

test('get-in committed cinematic owns its camera after live driving ends',async()=>{
  const f=await environment(),road=await f.load('src/game/source-drive/opening-road.js');
  const at=road.openingRoadAt(292.5);
  const {scene}=await f.getIn({initialDrive:{x:at.x,z:at.z,heading:at.heading,speed:13}});
  assert.equal(scene.view().controlsEnabled,false);
  assert(scene.view().commitment,'The actual drive physics must have crossed the commitment boundary');
  assert.equal(scene.lookBy(.2,.1),false);assert.equal(await f.capture(),false);
  f.mode.dispose();
});

test('parked opening and seated fallback retain bounded Look through the physical exit, then release the cabin owner',async()=>{
  for(const options of [{parked:true},{driveEnabled:false}]){
    const f=await environment(),{scene}=await f.opening(options);
    assert.equal(scene.allowsLook,true);assert.equal(await f.capture(),true);
    const before=scene.worldView();f.mouse(8,-4);f.tick(.1);
    nearly(scene.worldView().yaw,before.yaw+8*.0085);
    aimOpeningCabDoor(scene);f.key(key('e'));assert.equal(scene.view().phase,'exiting');
    assert.equal(scene.allowsLook,true);assert.equal(scene.lookBy(.2,.1),true);
    scene.update(4);assert.equal(scene.allowsLook,false);assert.equal(scene.lookBy(.2,.1),false);
    f.mode.sync('exit');assert.equal(f.mode.isTrueLocked(),false);f.mode.dispose();
  }
});

for(const kind of ['source','getIn']){
  test(`${kind}: captured cabin buttons use the view centre and cancel motion or non-primary presses`,async()=>{
    const f=await environment(),{scene,owner,driver}=await f[kind]();
    const radio=()=>owner?.status().state.radioOn??driver.snapshot().driveState.radioOn;
    const advance=async()=>{for(let i=0;i<9;i++)scene.update(.1);await Promise.resolve();};
    const deliver=(type,extra={})=>{
      const event=pointer(type,extra),payload=f.context.scenePointerPayload(event);
      f.scenes.pointer(payload);
    };
    const initial=radio();
    // Capturing is a gesture of its own, not a press on an old cursor target.
    const firstDown=f.context.scenePointerPayload(pointer('pointerdown'));
    await f.capture();f.scenes.pointer(firstDown);deliver('pointerup');await advance();assert.equal(radio(),initial);
    deliver('pointerdown',{button:2});deliver('pointerup',{button:2});await advance();assert.equal(radio(),initial);
    deliver('pointerup');await advance();assert.equal(radio(),initial);
    deliver('pointerdown');deliver('pointercancel');deliver('pointerup');await advance();assert.equal(radio(),initial);
    deliver('pointerdown');f.mouse(8,0);f.tick(.1);deliver('pointerup');await advance();assert.equal(radio(),initial);
    const before=scene.lookAngles();
    deliver('pointerdown');deliver('pointermove',{movementX:8});deliver('pointerup');await advance();
    assert.equal(radio(),initial);nearly(scene.lookAngles().yaw,before.yaw,'PointerEvent dispatch must not duplicate shared Look');
    // clientX/Y remain at the stale capture position (30,40), while the test
    // projects the real cabin target to the centre. Only centre picking works.
    deliver('pointerdown');deliver('pointerup');await advance();assert.equal(radio(),!initial);
    f.mode.dispose();
  });
}
