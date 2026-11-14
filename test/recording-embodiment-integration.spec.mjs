import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRecordingEmbodiment} from '../src/game/recording-embodiment.js';
import {recordingEmbodimentInstances,recordingEmbodimentCameraBasis,recordingEmbodimentViewPull,installRecordingEmbodimentMaterials} from '../src/render/recording-embodiment.js';
import {normalizeRecordingViewPull} from '../src/render/recording-view-pull.js';
import * as HUNTER from '../src/game/take-hunter.js';
import {cameraBasis} from '../src/render/camera-basis.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),render=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),
  propsSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
function body(source,name){
 const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name+' exists');
 const opening=source.indexOf('{',source.indexOf(')',start));let depth=0,end=-1;
 for(let at=opening;at<source.length;at++){if(source[at]==='{')depth++;if(source[at]==='}'&&--depth===0){end=at+1;break;}}
 assert.ok(end>start);return source.slice(start,end);
}
function fixture(){
 const calls=[],state={recording:true,progress:.90,spoiled:false,paused:false,focused:true,blocked:false,slating:false,stalled:false,assisted:false,light:false,tutorial:false,special:false,resident:false,takeId:'physical-take:1',roomId:'amplifications',inB3:false,scareFamily:'hands'},
  controller=createRecordingEmbodiment(),settings={flash:'full',shake:'full',reduceDread:false};
 let resolve,loads=0;
 const h={console,Promise,Math,storyMode:true,usingSpecialSpace:()=>state.special,HUNTER,takeHunter:HUNTER.freshTakeHunter(),
  REC:{recState:()=>({spoiled:state.spoiled}),isRecording:()=>state.recording,takeProgress:()=>state.progress,
    isSlating:()=>state.slating,isStalled:()=>state.stalled,isAssistPaused:()=>state.assisted,lightOn:()=>state.light,
    stopRecording:()=>{state.recording=false;calls.push(['transport-stop']);return{completed:false,spoiled:false,elapsed:21};},saveRecState:()=>({})},
  PB:{takeFor:()=>({id:state.takeId}),finishTapeTake:()=>calls.push(['tape-seal'])},
  recordingEmbodiment:controller,recordingEmbodimentReady:false,recordingEmbodimentLoading:null,
  prewarmRecordingEmbodimentMeshes:()=>{loads++;return new Promise(r=>{resolve=value=>{state.resident=value;r(value);};});},R3:{},P3:{installAuthoredPropMeshes:()=>state.resident?['installed']:false},installRecordingEmbodimentMaterials,
  takeRoom:'amplifications',currentWorld:()=> 'amplifications',getSave:()=>({settings}),TUT:{tutorialActive:()=>state.tutorial},
  recordingScareContext:()=>({roomId:state.roomId,inB3:state.inB3,scareFamily:state.scareFamily}),
  shakeMode:()=>settings.shake,paused:false,gameplayInputLifecycleActive:()=>state.focused,scenes:{blocksWorld:()=>state.blocked},
  cancelRecordingPressureAudio:()=>calls.push(['stop-pressure-audio']),recordingPressurePerformance:{reset:()=>calls.push(['reset-pressure'])},
  cancelControlScope:()=>{},liveRecordingPointerControls:new Map(),finishRecordingSlate:()=>{},LEVEL_CHECK_ROOM:'level-check',
  activeTakeOrdinal:1,recordingFalseHush:null,recordingHallucinationProbeUntil:0,recordingHallucinations:{clear:()=>{}},
  activeTakeContamination:null,activeTakeWitnessed:false,takePlace:null,instrArmedThisTake:false,metronomeRestartPending:null,
  clearInstrument:()=>{},CUES:{CUE:{recorder:'recorder'},playCue:()=>calls.push(['existing-stop-cue'])},
  flushMetronomeTakeEvents:()=>{},
  emitRecorderTransport:()=>{},STORY:{stopTapeHiss:()=>{}},updateAudio:()=>{},activeSourceReplayTake:null,
  emitProgress:()=>{},EVENT_TYPES:{TAKE_ABORTED:'TAKE_ABORTED'},saveCommit:()=>{},
  // The attempt goes on a cassette; the ledger is tested in cassette-ledger.spec.
  fileTakeAttempt:()=>{calls.push(['cassette']);return null;},
 };
 vm.createContext(h);vm.runInContext(body(main,'tickRecordingEmbodiment')+'\n'+body(main,'stopTake'),h);
 return{h,state,calls,settings,controller,loads:()=>loads,resolve:value=>resolve(value),tick:(dt=1/60)=>{h.paused=state.paused;h.tickRecordingEmbodiment(dt);},
  ready:async()=>{resolve(true);await h.recordingEmbodimentLoading;}};
}
test('actual main tick coalesces asynchronous readiness without spending unseen pressure, then admits current take only',async()=>{
 const f=fixture();f.tick();f.tick();assert.equal(f.loads(),1);assert.equal(f.controller.snapshot().active,false);
 await f.ready();f.tick();assert.equal(f.controller.snapshot().takeId,'physical-take:1');
 assert.equal(f.controller.snapshot().active,false,'late readiness begins the performed approach, never jumps to a seated contact');
 assert.ok(f.controller.snapshot().proximity<.03,'assets arriving late cannot jump straight to the eye');
 for(let n=0;n<8;n++)f.tick();assert.ok(f.controller.snapshot().active);
 assert.deepEqual(f.calls,[],'the embodiment hook cannot submit a cue or mutate the transport');
 f.state.takeId='physical-take:2';f.state.progress=0;f.tick();assert.equal(f.controller.snapshot().proximity,0);
});
test('actual main ordinary STOP preserves the active presentation for outward release and the recorder seals immediately',async()=>{
 const f=fixture();f.tick();await f.ready();for(let n=0;n<100;n++)f.tick();assert.ok(f.controller.snapshot().active);
 f.h.stopTake({silent:true});assert.equal(f.state.recording,false);assert.ok(f.calls.some(c=>c[0]==='tape-seal'));
 assert.ok(f.controller.snapshot().active,'stopTake must not reset before the post-STOP presentation tick');
 f.tick(.08);assert.equal(f.controller.snapshot().phase,'release');
 for(let n=0;n<6;n++)f.tick(.08);assert.equal(f.controller.snapshot().active,false);
});
test('actual main passes authoritative seized transport and rejected tries into the same grip without changing hunter state',async()=>{
 const f=fixture();f.tick();await f.ready();for(let n=0;n<100;n++)f.tick();
 f.h.takeHunter={...HUNTER.armTakeHunter(HUNTER.freshTakeHunter(),{roll:0}),cells:6,
  warningSeconds:HUNTER.TAKE_HUNTER.dragWarningSeconds,contactWindowElapsed:0};
 f.tick();assert.equal(f.controller.snapshot().transport.phase,'seized');
 const attempt=HUNTER.tryCancelTake(f.h.takeHunter);assert.equal(attempt.resisted,true);f.h.takeHunter=attempt.state;
 const authority=structuredClone(f.h.takeHunter);f.tick();const frame=f.controller.snapshot();
 assert.equal(frame.transport.tries,1);assert.equal(frame.phase,'braced');assert.equal(frame.release,0);
 assert.ok(frame.hands.every(hand=>hand.recoil===1));assert.deepEqual(f.h.takeHunter,authority);
 assert.deepEqual(f.calls,[],'the hook observes refusal without audio, noise, STOP or hunter mutation');
});
test('actual main gating holds pause, focus, scene ownership and assist pause without a catch-up or audio side effect',async()=>{
 const f=fixture();f.tick();await f.ready();for(let n=0;n<12;n++)f.tick();const before=f.controller.snapshot();
 for(const[flag,value]of[['paused',true],['focused',false],['blocked',true],['assisted',true],['stalled',true]]){
  const old=f.state[flag];f.state[flag]=value;f.tick(90);assert.deepEqual(f.controller.snapshot(),before,flag);f.state[flag]=old;
 }
 f.tick(90);assert.ok(f.controller.snapshot().proximity-before.proximity<=.12801);
 assert.deepEqual(f.calls,[]);
 f.settings.flash='off';f.state.paused=true;f.tick();assert.equal(f.controller.snapshot().active,false,'accessibility suppression wins even during pause');
});
test('actual readiness failure retries on a later tick, without an unhandled error or invented manifestation',async()=>{
 const f=fixture();f.tick();f.resolve(false);await f.h.recordingEmbodimentLoading;assert.equal(f.h.recordingEmbodimentReady,false);
 assert.equal(f.controller.snapshot().active,false);f.tick();assert.equal(f.loads(),2);
 await f.ready();for(let n=0;n<9;n++)f.tick();assert.ok(f.controller.snapshot().active);assert.deepEqual(f.calls,[]);
});
test('actual main detects lost prop residency, clears unsafe instances, then repairs before reapproaching',async()=>{
 const f=fixture();f.tick();await f.ready();for(let n=0;n<100;n++)f.tick();assert.ok(f.controller.snapshot().active);
 f.state.resident=false;f.tick();assert.equal(f.h.recordingEmbodimentReady,false);assert.equal(f.controller.snapshot().active,false);
 assert.equal(f.loads(),2);await f.ready();f.tick();assert.equal(f.controller.snapshot().active,false);assert.ok(f.controller.snapshot().proximity<.03);
});
test('actual main hook passes B3 and take-family exclusion through to the presentation without a release ghost',async()=>{
 for(const blocked of[{roomId:'main_b3'},{inB3:true},{scareFamily:'hallucinations'},{scareFamily:'none'}]){
  const f=fixture();f.tick();await f.ready();for(let n=0;n<100;n++)f.tick();assert.ok(f.controller.snapshot().active);
  Object.assign(f.state,blocked);f.tick();assert.equal(f.controller.snapshot().active,false);
  assert.equal(f.controller.snapshot().phase,'absent');assert.deepEqual(f.calls,[]);
 }
});
test('actual recorder loop keeps the presentation tick outside recording and performs the post-STOP release',async()=>{
 const f=fixture();f.tick();await f.ready();for(let n=0;n<100;n++)f.tick();f.h.stopTake({silent:true});
 const noops=['tickB3Speaker','maybeIndependentBattle','maybeBattle','tickNatatoriumDread','tickChapelRetakeHaunt','tickTakeHunter',
  'tickInstrument','tickPracticeMetronomes','tickPracticeStudent','tickStopListening','tickDreamFigure','tickRecordingSlate'];
 for(const name of noops)f.h[name]=()=>{};
 Object.assign(f.h,{holdB3RecordingForLifecycle:()=>false,chapelTapeRetakeRoom:()=>false,takeOrigin:null,recordableRoomAt:()=> 'main_b3',px:0,py:0,document:{hidden:false,hasFocus:()=>true}});
 f.h.REC.decayNoise=()=>{};f.h.REC.tickRecording=()=>null;
 vm.runInContext(body(main,'tickRecorder'),f.h);f.h.tickRecorder(.08);
 assert.equal(f.controller.snapshot().phase,'release');assert.equal(f.state.recording,false);
});

function renderFixture(){
 const calls=[],cameras=[],h={console,Math,Float32Array,Array,
  recordingEmbodimentInstances:(frame,view)=>{cameras.push(structuredClone(view));return recordingEmbodimentInstances(frame,view);},CELL:.5,
  recordingEmbodimentViewPull,normalizeRecordingViewPull,recordingViewPull:normalizeRecordingViewPull(null),
  camX:24.5,camY:-4.76,camZ:47.5,worldYaw:1.21,pitch:-.24,activeCameraTanHalfFov:.95,canvas:{width:1280,height:720},
  P3:{setDynamicPropInstances:instances=>calls.push(instances)},ordinaryDynamicProps:[],nightWarningProps:[],recordingFaceProps:[]};
 const start=render.indexOf('  const faceProps=recordingEmbodimentInstances('),end=render.indexOf('  // A flashlight snaps.',start);
 assert.ok(start>render.indexOf('camY = authoredCamera || snapCamera || driveFrameActive'));
 assert.ok(start>render.indexOf('pitch = authoredCamera ? authoredCamera.pitch'));
 vm.createContext(h);vm.runInContext(body(render,'submitWorldDynamicProps')+'\n'+
  'function drawFace(state){'+render.slice(start,end)+'}\n'+
  body(render,'r3dSetDynamicProps')+'\n'+body(render,'r3dSetNightWarningProps'),h);
 return{h,calls,cameras,block:render.slice(start,end)};
}
test('camera hook uses actual canvas dimensions with no invented sw/sh globals; the first native defect fails this fixture',()=>{
 const f=renderFixture(),frame={active:true,takeId:'no-viewport-global',presence:1,proximity:.8,grip:.7,pull:0};
 assert.equal(Object.hasOwn(f.h,'sw'),false);assert.equal(Object.hasOwn(f.h,'sh'),false);
 f.h.drawFace({recordingEmbodiment:frame});
 assert.equal(f.cameras.at(-1).width,1280);assert.equal(f.cameras.at(-1).height,720);
 f.h.canvas.width=960;f.h.canvas.height=600;f.h.drawFace({recordingEmbodiment:frame});
 assert.equal(f.cameras.at(-1).width,960);assert.equal(f.cameras.at(-1).height,600);
 // Replay the actual failed expression in this minimal scope: unlike the old
 // fixture, these tests may not invent a variable the production module lacks.
 const failed=f.block.replace('width:canvas.width,height:canvas.height','width:sw,height:sh');
 assert.notEqual(failed,f.block);vm.runInContext('function failedNativeHook(state){'+failed+'}',f.h);
 assert.throws(()=>f.h.failedNativeHook({recordingEmbodiment:frame}),/sw is not defined/);
});
test('actual r3d hook resolves current eased eye after lean/pitch/floor and composes independent world layers',()=>{
 const f=renderFixture(),d=createRecordingEmbodiment();let state;
 for(let n=0;n<100;n++)state=d.update(1/60,{recording:true,takeId:'take',takeProgress:.96});
 f.h.r3dSetDynamicProps([{id:'door'}]);f.h.r3dSetNightWarningProps([{id:'wet-joint'}]);
 f.h.drawFace({recordingEmbodiment:state});const first=f.calls.at(-1);
 const boundPull=f.h.recordingViewPull;assert.equal(boundPull.active,true);
 const expectedPull=normalizeRecordingViewPull(recordingEmbodimentViewPull(state,{eye:[f.h.camX*.5,f.h.camY*.5,f.h.camZ*.5],yaw:f.h.worldYaw,pitch:f.h.pitch,tanHalfFov:.95,width:1280,height:720}));
 assert.deepEqual(boundPull,expectedPull,'the peel uses the same actual eye and anatomical pad transform as its P3 hands');
 assert.equal(first.length,4);assert.equal(first[0].id,'door');assert.equal(first[1].id,'wet-joint');
 const before=Array.from(first[2].matrix);f.h.camX+=6;f.h.camY+=2;f.h.camZ-=4;f.h.worldYaw+=1.5;f.h.pitch=.63;
 f.h.drawFace({recordingEmbodiment:state});const second=f.calls.at(-1);
 assert.notDeepEqual(Array.from(second[2].matrix),before);
 const expected=recordingEmbodimentInstances(state,{eye:[f.h.camX*.5,f.h.camY*.5,f.h.camZ*.5],yaw:f.h.worldYaw,pitch:f.h.pitch,tanHalfFov:.95,width:1280,height:720});
 assert.deepEqual(Array.from(second[2].matrix),Array.from(expected[0].matrix));
 f.h.r3dSetDynamicProps([{id:'new-door'}]);assert.equal(f.calls.at(-1).length,4,'ordinary owner cannot erase the face or warning layer');
 f.h.drawFace({});assert.equal(f.calls.at(-1).length,2,'a different scene frame without embodiment removes both hands');
 assert.equal(f.h.recordingViewPull.active,false,'a different scene frame clears the pre-dither world pull too');
 assert.equal(f.calls.at(-1)[1].id,'wet-joint','scene cleanup does not erase independent warning props');
});
test('embodiment camera basis exactly matches the world renderer for arbitrary player yaw/pitch',()=>{
 for(const yaw of[-3.5,0,.7,12])for(const pitch of[-1.3,0,1.3]){
  const actual=recordingEmbodimentCameraBasis({eye:[2,3,4],yaw,pitch}),expected=cameraBasis(yaw,pitch);
  for(const axis of['right','up','forward'])assert.deepEqual(actual[axis],expected[axis]);
 }
});
test('actual main render-state expression removes embodied props for another world presentation or special space',()=>{
 const start=main.indexOf('    recordingEmbodiment:elleryCaughtOwner'),end=main.indexOf('// Render-only second manifestation',start);
 const expression=main.slice(start,end).split('recordingEmbodiment:')[1].trim().replace(/,$/,'');
 const h={worldView:null,storyMode:true,usingSpecialSpace:()=>false,recordingEmbodiment:{snapshot:()=>({active:true})},
   elleryCaughtOwner:null,caughtHandFrame:(held,frame)=>({held,frame})};
 assert.ok(start>0);vm.createContext(h);vm.runInContext('function selectEmbodiment(){return '+expression+';}',h);
 assert.equal(h.selectEmbodiment().active,true);h.worldView={suppressActors:false};assert.equal(h.selectEmbodiment(),null);
 h.worldView=null;h.usingSpecialSpace=()=>true;assert.equal(h.selectEmbodiment(),null);
 h.usingSpecialSpace=()=>false;h.storyMode=false;assert.equal(h.selectEmbodiment(),null);
 h.storyMode=true;h.elleryCaughtOwner={staging:{hands:'the staged hands'},scene:{frame:()=> 'impact'}};
 assert.equal(h.selectEmbodiment().held,'the staged hands');
 assert.equal(h.selectEmbodiment().frame,'impact');
});
test('actual P3 character snapshot resolves aliased hand identity and the retained brace morph without a pose fallback',()=>{
 const bytes=readFileSync(new URL('../public/assets/source-rest/seated-hands.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),
  catalog=new Map(asset.entries.map(entry=>[entry.name,{name:entry.name,characterAsset:asset,characterEntry:entry,primitives:entry.primitives,extras:entry.extras}])),
  names=installRecordingEmbodimentMaterials(null,{catalog}),d=createRecordingEmbodiment();let frame;
 for(let n=0;n<100;n++)frame=d.update(1/60,{recording:true,takeId:'actual-character',takeProgress:.96});
 const h={sampleCharacterPose,pack:{catalog},characterSnapshots:new WeakMap(),characterFramePoses:[],characterPoseErrors:new Set(),console};
 vm.createContext(h);vm.runInContext(body(propsSource,'characterSnapshot'),h);
 const instances=recordingEmbodimentInstances(frame,{eye:[0,1.62,0],yaw:0,pitch:0});
 for(let k=0;k<2;k++){
  const mesh=catalog.get(names[k]),snapshot=h.characterSnapshot(instances[k],mesh);
  assert.equal(snapshot.mesh,names[k]);assert.equal(mesh.characterEntry.name,asset.entries[k].name);
  assert.ok(Math.abs(snapshot.pose.morphs[0]-instances[k].character.morphs.brace)<1e-6);assert.equal(snapshot.pose.morphs[1],0);
  assert.ok(Array.from(snapshot.pose.bones).every(Number.isFinite));
 }
 assert.equal(h.characterPoseErrors.size,0);
});
