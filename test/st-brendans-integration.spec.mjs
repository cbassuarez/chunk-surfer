import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { ZONE } from '../src/data/floorplan/legend.js';
import { createTwoTierBellFrameLayout } from '../src/data/bell-tower-layout.js';
import { ELLERY_BELLS } from '../src/data/bell-tower.js';
import { CATHEDRAL_STAGING } from '../src/data/st-brendans.js';
import { stBrendansSoundFrame } from '../src/game/st-brendans-sound.js';
import { stBrendansTreatmentMesh } from '../src/data/st-brendans-treatment.js';
import { ST_BRENDANS_AUDIO_SOURCES } from '../src/data/st-brendans-audio.js';
import { CREDITS } from '../src/data/credits.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function functionSource(text,name){
  const match=text.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match,`${name} remains a real integration function`);return match[0];
}
function harness(){
  const layout=createTwoTierBellFrameLayout(ELLERY_BELLS,{centerX:16,centerZ:73});
  const calls=[],state={floor:10.2,group:'cathedral',zone:ZONE.church,damage:[],blocked:false,recording:false,focused:true};
  const context={storyMode:true,inRogue:true,usingPlan:()=>true,usingSpecialSpace:()=>false,
    sourceDriveSession:null,sourcePubScene:null,sourceContinuationScene:null,coastalMemoryScene:null,
    planName:'conservatory',px:38,py:145,CELL:.5,BODY_EYE_M:1.62,
    FP:{isLoaded:()=>true,zoneAt:()=>state.zone,physicalSpanData:()=>layout,
      logicalToPhysical:()=>({x:38,y:state.floor,z:145,renderGroup:state.group}),floorAt:()=>state.floor,
      logicalAtPhysical:(x,z)=>({x,y:z})},ZONE,CATHEDRAL_STAGING,
    brendanSoundPlan:null,brendanRingCache:null,brendanSoundOcclusionKey:'',brendanSoundOcclusion:new Map(),
    brendanAuthoredAt:()=>({level:state.floor>9?'belfry':state.floor>4?'loft':'ground'}),
    brendanFinale:()=>({cathedral:{damage:state.damage}}),brendanRing:()=>layout,
    brendanPhysical:(level,x,z)=>({x,z,y:level==='ground'?0:10.2}),brendanBelfryCenter:()=>({x:16,y:10.2,z:73}),
    R3:{r3dLookAngles:()=>({yaw:state.yaw||0})},escape:null,
    acousticSpatialAt:()=>({roomId:'st_brendans',floorId:'test-slab',position:{x:38,y:145}}),
    acousticOcclusionDb:()=>2.8,performance:{now:()=>1000},stBrendansSoundFrame,
    REC:{isRecording:()=>state.recording,isListening:()=>false},PB:{isPlaying:()=>false},paused:false,
    scenes:{blocksWorld:()=>state.blocked},finaleActive:false,activeBattleId:null,cathedralFinalCombatOpen:false,
    gameplayInputLifecycleActive:()=>state.focused,getSave:()=>({settings:{flash:'full'}}),SPEECH:{speaking:()=>false},
    actx:{tag:'context'},sfxGain:{tag:'world-sfx'},master:{tag:'master'},brendanBellAudio:null,brendanSoundFrame:{},
    ST_BRENDANS_AUDIO_DIR:'audio/st-brendans',assetUrl:x=>x,ELLERY_BELLS,ensureCtx:()=>{},
    createStBrendansAudio:options=>{calls.push({kind:'create',options});return{
      update:frame=>{calls.push({kind:'update',frame});return frame},
      strike:(record,bell,options)=>{calls.push({kind:'strike',record,bell,options});return true},
    }},
  };
  vm.createContext(context);
  for(const name of ['currentStBrendansSoundInput','tickStBrendansSound','brendanStrike'])vm.runInContext(functionSource(main,name),context);
  return{context,state,calls,layout};
}

test('actual main integration covers nave, triforium, turret and belfry, excluding other ground rooms',()=>{
  const {context:c,state:s}=harness();
  for(const [floor,group,expected]of [[0,'ground','nave'],[4.6,'cathedral','triforium'],[7.2,'cathedral','turret'],[10.2,'cathedral','belfry']]){
    s.floor=floor;s.group=group;const frame=c.currentStBrendansSoundInput();
    assert.equal(frame.active,true);assert.equal(frame.level,expected);assert.equal(frame.bells.length,8);
  }
  s.zone=ZONE.dock;assert.equal(c.currentStBrendansSoundInput().active,false);
  c.sourceDriveSession={};s.zone=ZONE.church;assert.equal(c.currentStBrendansSoundInput().active,false);
  c.sourceDriveSession=null;c.sourceContinuationScene={};assert.equal(c.currentStBrendansSoundInput().active,false);
  c.sourceContinuationScene=null;c.coastalMemoryScene={};assert.equal(c.currentStBrendansSoundInput().active,false);
});

test('sound remains at actual fixed pivots during a head turn and follows the physically fallen bell',()=>{
  const {context:c,state:s,layout}=harness();
  const before=c.currentStBrendansSoundInput();s.yaw=Math.PI;
  const after=c.currentStBrendansSoundInput();
  assert.deepEqual(before.bells.map(b=>b.pivot),after.bells.map(b=>b.pivot));
  assert.notEqual(before.listener.yaw,after.listener.yaw);
  s.damage=['bell-fallen'];const fallen=c.currentStBrendansSoundInput().bells.find(b=>b.id===8);
  assert.equal(fallen.pivot.x,CATHEDRAL_STAGING.fallenBell.x);
  assert.equal(fallen.pivot.z,CATHEDRAL_STAGING.fallenBell.y);assert.equal(fallen.pivot.y,.82);
  assert.equal(layout.find(b=>b.id===8).pivot.y,12.25,'shared bell frame layout is not mutated');
});

test('damage sounds originate at their actual screen, frame and ground impacts',()=>{
  const {context:c,layout}=harness();const f=c.currentStBrendansSoundInput();
  assert.equal(f.damageAnchors['pulpitum-split'].y,1.1);
  assert.equal(f.damageAnchors['pulpitum-split'].z,CATHEDRAL_STAGING.pulpitum.y);
  assert.equal(f.damageAnchors['lantern-out'].y,.25);
  assert.ok(f.damageAnchors['frame-shaken'].y>10);
  const bearing=layout.find(b=>b.id===6);
  assert.equal(f.anchors.frame.x,bearing.pivot.x);
  assert.equal(f.anchors.frame.y,bearing.pivot.y-.27);
  assert.equal(f.anchors.frame.z,bearing.pivot.z+.56*bearing.visualScale);
});

test('the real strike hook uses world SFX, allows battle cues, and forwards hard protections',()=>{
  const {context:c,state:s,calls}=harness();s.blocked=true;c.cathedralFinalCombatOpen=true;
  c.brendanStrike(5,.65);
  assert.equal(calls.find(x=>x.kind==='create').options.destination,c.sfxGain);
  const frame=calls.find(x=>x.kind==='update').frame;
  assert.equal(frame.muted,false);assert.equal(frame.ambientMuted,true);
  assert.equal(calls.find(x=>x.kind==='strike').options.gain,.65);
  s.recording=true;assert.equal(c.currentStBrendansSoundInput().muted,true);
  s.recording=false;s.focused=false;assert.equal(c.currentStBrendansSoundInput().muted,true);
});

test('real mesh resolver falls back transactionally and preserves chapel objects',()=>{
  const source=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const catalog=new Map([['pew',{}],['tower_bell_08',{}]]);
  const c={pack:{catalog},stBrendansTreatmentMesh,academicGalleryMesh:i=>i.mesh};
  vm.createContext(c);vm.runInContext(functionSource(source,'resolvedMeshName'),c);
  const pew={id:'brendan-pew-n-1',mesh:'pew'};
  assert.equal(c.resolvedMeshName(pew,[0,0,0]),'pew');
  catalog.set('brendan_pew',{});assert.equal(c.resolvedMeshName(pew,[0,0,0]),'brendan_pew');
  assert.equal(c.resolvedMeshName({id:'chapel-pew-1',mesh:'pew'},[0,0,0]),'pew');
  catalog.set('brendan_bell_08',{});
  assert.equal(c.resolvedMeshName({id:'brendan-fallen-bell',mesh:'tower_bell_08'},[0,0,0]),'brendan_bell_08');
  assert.equal(c.resolvedMeshName({id:'ending-peal-bell-8',mesh:'tower_bell_08'},[0,0,0]),'tower_bell_08');
  catalog.set('tower_wheel_03',{});catalog.set('brendan_wheel_03',{});
  assert.equal(c.resolvedMeshName({id:'brendan-lesson-wheel',mesh:'tower_wheel_03'},[0,0,0]),'brendan_wheel_03');
  assert.equal(c.resolvedMeshName({id:'chapel-wheel',mesh:'tower_wheel_03'},[0,0,0]),'tower_wheel_03');
});

test('every shipped material source retains author, source link, license and adaptation credit',()=>{
  const text=CREDITS.flatMap(c=>c.lines).join('\n');
  assert.equal(CREDITS[0].heading,'Chunk Surfer');
  for(const source of ST_BRENDANS_AUDIO_SOURCES){
    assert.ok(text.includes(source.author));assert.ok(text.includes(source.url));assert.ok(text.includes(source.licenceUrl));
  }
  assert.match(text,/Adapted: excerpts, levelling, spatial placement/);
});
