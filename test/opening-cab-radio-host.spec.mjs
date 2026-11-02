import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {makeOpeningVehicleScene} from '../src/game/opening-vehicle-scene.js';
import {makeOpeningCabInspectionScene,openingCabTargets,OPENING_CAB_ASSET,OPENING_CAB_REQUIRED_MESHES} from '../src/game/opening-cab-inspection.js';
import {openingVehiclePending} from '../src/data/opening-vehicle.js';
import {aimOpeningCabDoor} from './helpers/opening-cab-aim.mjs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const noop=()=>{};
function section(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,start);return main.slice(a,b);}
const stations=[{id:'a',label:'DUET I',programme:'First cleared duet'},
  {id:'b',label:'DUET II',programme:'Second cleared duet'},
  {id:'spoken',label:'ARCHIVE',programme:'Cleared speech'}];
function fixture(){
  scenes.clear();let focused=true,ready=true,options=null,owner=null;
  const events=[],log=[],save={flags:{'opening.vehicle.pending':true},fieldKit:{},journal:[]};
  const context={scenes,RENDERER:'3d',planName:'conservatory',CELL:.5,paused:false,actx:{state:'running'},musicGain:{id:'music'},sfxGain:{id:'sfx'},
    px:5,py:6,stepCount:0,OPENING_CAB_ASSET,OPENING_CAB_REQUIRED_MESHES,OPENING_CAB_RADIO_STATIONS:stations,
    getSave:()=>save,saveCommit:patch=>Object.assign(save,patch),params:()=>new URLSearchParams(),flagTest:id=>save.flags[id]===true,
    openingVehiclePending,gameplayInputLifecycleActive:()=>focused,ensureCtx:noop,resetMotionInput:noop,shakeMode:()=> 'full',
    STORY:{},assetUrl:path=>path,console:{warn:noop},
    FP:{isLoaded:()=>true,logicalToPhysical:()=>({x:32,y:0,z:16,renderGroup:'ground'}),zoneAt:()=>1},
    OPENING_AUTHORED_PROPS:[{id:'yard-van',x:16,y:8,yaw:Math.PI/2}],
    P3:{propMeshCatalog:()=>[...OPENING_CAB_REQUIRED_MESHES]},
    R3:{r3dVehicleInteriorStatus:()=>({loaded:ready}),r3dOpeningOvertureStatus:()=>({ready:true}),
      r3dOpeningStreetReady:()=>true,r3dElleryPublicFrontReady:()=>true,r3dSetLookAngles:noop,r3dLookAngles:()=>({yaw:Math.PI/2})},
    openingArrivalWorldView:frame=>frame,refreshWorldProps:noop,
    createOpeningArrivalAudio:()=>({prepare:()=>Promise.resolve(),update:noop,event:noop,dispose:()=>log.push('arrival-dispose'),stop:noop}),
    createOpeningCabRadio(value){
      options=value;let selected='a',on=true,volume=.4,playing=false,disposed=false,clock=0,playable=true;
      owner={starts:0,updates:0,pauses:0,disposals:0,
        prepare(){log.push('prepare');return Promise.resolve(true);},
        start(){this.starts++;log.push('start:'+scenes.top()?.id);return true;},
        update(){this.updates++;const s=options.getState();playing=!disposed&&playable&&s.active&&s.ready&&!s.paused&&s.focused&&!s.protected&&on&&volume>0;if(playing)clock++;},
        pause(){this.pauses++;playing=false;},dispose(){if(disposed)return;disposed=true;this.disposals++;playing=false;},
        action(action){
          if(action.type==='power')on=typeof action.value==='boolean'?action.value:!on;
          if(action.type==='volume')volume=Math.max(0,Math.min(1,Number.isFinite(action.value)?action.value:volume+action.delta));
          if(action.type==='station')selected=action.id||stations[(stations.findIndex(s=>s.id===selected)+action.delta+stations.length)%stations.length].id;
          this.update();return this.snapshot();
        },
        snapshot(){return{stationId:selected,station:stations.find(s=>s.id===selected).label,programme:stations.find(s=>s.id===selected).programme,
          on,volume,playing,clock,availableStations:stations.map(s=>({...s,selected:s.id===selected}))};},
        playable(value){playable=value;playing=false;},
      };return owner;
    },
    makeOpeningVehicleScene:value=>makeOpeningVehicleScene({...value,driveEnabled:false}),
    makeOpeningCabInspectionScene,combatBuild:()=>({}),bagJob:()=>({}),bagJournal:()=>[],WORK_ORDER:{},currentStoryGuidanceTarget:()=>null,
    REC:{recState:()=>({}),composure:()=>10,composureCeiling:()=>10},emitProgress:(...args)=>events.push(args),EVENT_TYPES:{RADIO_USED:'radio-used'},
  };
  vm.createContext(context);vm.runInContext(section('let openingVehicleScene=','// The first interaction in the game'),context);
  return{context,log,events,save,get owner(){return owner;},get options(){return options;},
    begin(){return context.beginOpeningVehicleArrival();},tick(){scenes.update(.1);context.tickOpeningCabRadio();},
    frame(){return vm.runInContext('openingVehicleScene?.view()||null',context);},
    state(){return context.openingCabRadioState();},focus(value){focused=value;},ready(value){ready=value;},
    dispose(){scenes.clear();},action(action){return context.actOnOpeningCabRadio(action);}};
}

test('the production cab starts one receiver on the music bus during arrival and keeps it alive under the real frozen inspector',()=>{
  const h=fixture();assert.equal(h.begin(),true);const vehicle=scenes.top();
  assert.equal(h.owner.starts,1);assert.deepEqual(h.log,['prepare','start:opening-vehicle']);
  assert.equal(h.options.getAudio().destination,h.context.musicGain);assert.notEqual(h.options.getAudio().destination,h.context.sfxGain);
  assert.deepEqual(h.options.stations,stations);assert.equal(h.state().ready,false);
  h.tick();assert.equal(h.frame().canExit,true);assert.equal(h.owner.snapshot().playing,true);assert.equal(h.events.length,0,'passive arrival music grants no listening receipt');
  const frame=h.frame(),target=openingCabTargets(frame.anchor).find(t=>t.id==='radio'),dx=target.position.x-frame.eye.x,dz=target.position.z-frame.eye.z,
    yaw=Math.atan2(dx,-dz),pitch=Math.atan2(target.position.y-frame.eye.y,Math.hypot(dx,dz));
  vehicle.lookBy(yaw-frame.yaw,pitch-frame.pitch);vehicle.key({code:'KeyE'});
  const inspector=scenes.top();assert.equal(inspector.id,'opening-cab-inspection');assert.equal(inspector.view().objectId,'radio');assert.equal(scenes.isFrozen(vehicle),true);
  assert.equal(h.state().protected,false);const before=h.owner.snapshot().clock;h.tick();assert.equal(h.owner.snapshot().clock,before+1);
  assert.equal(inspector.view().model.radio.selectedStation,'a');assert.deepEqual(inspector.view().model.radio.stations.map(s=>s.id),stations.map(s=>s.id));
  inspector.key({code:'Digit2'});assert.equal(h.owner.snapshot().stationId,'b');assert.equal(inspector.view().model.radio.selectedStation,'b');
  assert.equal(h.events.length,1);assert.equal(h.events[0][0],'radio-used');assert.equal(h.events[0][1].kind,'listening');
  inspector.key({code:'KeyE'});assert.equal(scenes.top(),vehicle);assert.equal(h.state().protected,false);assert.equal(h.owner.disposals,0);
  const loop=section('    scenes.update(sourceContinuationScene?.id=', '    tickStillnessDread(');
  assert.match(loop,/scenes\.update\([\s\S]*?\);\s*tickOpeningCabRadio\(\);/,'the independent owner advances even when the stack freezes vehicle updates');
  h.dispose();assert.equal(h.owner.disposals,1);assert.equal(h.action({type:'power'}),false);
});

test('actual cab-state gates loading, unrelated modal owners, pause and focus independently of the receiver knob',()=>{
  const h=fixture();h.ready(false);h.begin();h.tick();assert.equal(h.state().ready,false);assert.equal(h.owner.snapshot().playing,false);
  h.ready(true);h.tick();const initial=h.owner.snapshot();assert.equal(initial.playing,true);
  scenes.push({id:'pause',blocksInput:true,freezesBelow:true});h.context.tickOpeningCabRadio();assert.equal(h.state().protected,true);assert.equal(h.owner.snapshot().playing,false);
  scenes.pop();h.context.paused=true;h.context.tickOpeningCabRadio();assert.equal(h.owner.snapshot().playing,false);
  h.context.paused=false;h.focus(false);h.context.tickOpeningCabRadio();assert.equal(h.state().focused,false);assert.equal(h.owner.snapshot().playing,false);
  h.focus(true);h.context.tickOpeningCabRadio();assert.equal(h.owner.snapshot().playing,true);
  assert.equal(h.owner.snapshot().volume,initial.volume);assert.equal(h.owner.snapshot().on,true);assert.equal(h.events.length,0);h.dispose();
});

test('the physical exit lowers only cab projection, and cancellation retires the receiver without rewriting its knob',()=>{
  const h=fixture();h.begin();h.tick();const vehicle=scenes.top(),volume=h.owner.snapshot().volume;
  aimOpeningCabDoor(vehicle);vehicle.key({code:'KeyE'});assert.equal(h.frame().phase,'exiting');assert.equal(h.state().projectionGain,1);
  for(let i=0;i<78;i++)vehicle.update(1/60);
  assert.ok(h.state().projectionGain>.49&&h.state().projectionGain<.51);assert.equal(h.owner.snapshot().volume,volume);
  for(let i=0;i<48;i++)vehicle.update(1/60);
  assert.equal(h.state().projectionGain,0);assert.equal(h.owner.snapshot().volume,volume);assert.equal(h.owner.snapshot().on,true);
  scenes.remove(vehicle);assert.equal(h.owner.disposals,1);assert.equal(h.state().active,false);h.context.tickOpeningCabRadio();assert.equal(h.owner.disposals,1);
});

test('only deliberate audible tuning, power-on or raised volume earns the production listening receipt, including delayed decode',()=>{
  const h=fixture();h.begin();h.tick();h.action({type:'station',id:'a'});h.action({type:'volume',delta:-.1});h.action({type:'power'});
  assert.equal(h.events.length,0);h.action({type:'power'});assert.equal(h.events.length,1);
  h.owner.playable(false);h.action({type:'station',id:'b'});assert.equal(h.events.length,1);
  for(let i=0;i<4;i++)h.context.tickOpeningCabRadio();assert.equal(h.events.length,1);
  h.owner.playable(true);h.context.tickOpeningCabRadio();assert.equal(h.events.length,2);h.context.tickOpeningCabRadio();assert.equal(h.events.length,2);
  h.owner.playable(false);h.action({type:'station',id:'a'});h.action({type:'power'});h.owner.playable(true);h.context.tickOpeningCabRadio();assert.equal(h.events.length,2,'powering off cancels an unheard pending intent');
  h.action({type:'power'});assert.equal(h.events.length,3);h.action({type:'volume',delta:.1});assert.equal(h.events.length,4);
  h.dispose();h.context.tickOpeningCabRadio();assert.equal(h.events.length,4);
});

test('real native lifecycle callbacks hold the receiver immediately before the next scene or audio tick',()=>{
  const h=fixture();h.begin();h.tick();const c=h.context;
  for(const name of['firstStrikeScene','firstStrikeAudio','studentStrikeScene','studentStrikeAudio','sourceRestBreath','sourceRestWeather','architectureDoorAudio','towerWarningAudio','pubRoomAudio',
    'pubPressureAudio','sourcePubAudio','sourceContinuationAudio','academicGhostDispatch','sourceShoreAudio','activeRecordingSlate','bellPealPerformance',
    'getInDriveTeaserScene','sourceReturnFlashbackScene','sourceDriveSession','sourcePubScene','sourceContinuationScene','standingTearScene','coastalMemoryScene','sourceRecordingInspectionScene',
    'outskirtsStreetAudio','towerBellDirector','towerPersonalHud','dialogGain','bodyGain','sfxDirectGain','whisperBed'])c[name]=null;
  for(const name of['holdSourceRestEndingMusic','cancelLastExposure','cancelRecordingPressureAudio','cancelOutskirtDoorAnswer','cancelApparitionApplause',
    'setUiCueFocused','cancelControlScope','syncChapelTapeDemandTimelineHold','pauseTowerEndingRecording','saveSourceView','pauseOutskirtsLastLight',
    'lowerTowerPersonalRecorder','stopTowerPersonalWorldSignal','syncPointerMode','stopAllVoices','stopWorldLayerVoice','silenceAmbientDrone',
    'setGainNode','pushEvent','applyAudioSettings','startAmbientDroneAt','currentAmbientTarget','updateAudio','resumeGameplayInput'])c[name]=noop;
  Object.assign(c,{runPlayDurationClock:{suspend:noop},architectureDoorEvents:{hold:noop},liveRecordingPointerControls:new Set(),pointerMode:{release:noop},
    recoverInteractionAudio:()=>Promise.resolve(),FEAR:{setHeartbeatPaused:noop},b3SpeakerAudio:{pause:noop},b3Speaker:{flush:noop},
    personalWindowEffects:{},windowChoreography:{},storyMode:false,inRogue:false,
    document:{hidden:false,hasFocus:()=>true,addEventListener(name,fn){if(name==='visibilitychange')c.visibilityChange=fn;}}});
  vm.runInContext(section('function onBlur(){','// Focus, capture and a level head')+
    section('function setGameplayPaused(next,','function togglePause(){')+
    section("  document.addEventListener('visibilitychange', ()=>{","  window.addEventListener('pageshow'"),c);
  c.onBlur();assert.equal(h.owner.pauses,1);assert.equal(h.owner.snapshot().playing,false);
  h.tick();assert.equal(h.owner.snapshot().playing,true);c.setGameplayPaused(true,{announce:false});assert.equal(h.owner.pauses,2);assert.equal(h.owner.snapshot().playing,false);
  c.setGameplayPaused(false,{announce:false});h.tick();assert.equal(h.owner.snapshot().playing,true);
  c.document.hidden=true;c.visibilityChange();assert.equal(h.owner.pauses,3);assert.equal(h.owner.snapshot().playing,false);h.dispose();
});
