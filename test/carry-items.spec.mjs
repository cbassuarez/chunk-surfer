import test from 'node:test';
import assert from 'node:assert/strict';
import {BATTLE_GEAR as carryBattleGear,carryItemDefinition,isCarryItem,recordingCassetteId,parseRecordingCassetteId} from '../src/game/carry-items.js';
import {BATTLE_GEAR,isBattleGear,normalizeCombatLoadout,assignCombatGearSlot,moveCombatGear,availableBattleTools} from '../src/game/combat-loadout.js';

test('readiness accepts approved held belongings without creating a combat move',()=>{
  assert.equal(BATTLE_GEAR,carryBattleGear,'the legacy public export retains the same definitions');
  for(const id of ['ren-home-cassette','marble-eyes','recording-cassette:1','b3-session-card','vale-guarantor-slip','lyle-music-box']){
    assert.equal(isCarryItem(id),true,id);
    assert.equal(isBattleGear(id),false,id);
    assert.equal(carryItemDefinition(id).battleToolId,null);
    assert.ok(carryItemDefinition(id).heldModelId);
  }
  for(const id of ['map','keyring','ren-service-key','headphones','microphone','amp','plant-stillson','lyle-jumper','station-relics','pub-service-tray','constructor','__proto__']){
    assert.equal(isCarryItem(id),false,id);
  }
  assert.equal(isBattleGear('badge'),true,'legacy inert badge assignments remain compatible');
});

test('numbered cassette IDs are canonical, finite and collision free',()=>{
  for(const number of [1,2,14,Number.MAX_SAFE_INTEGER]){
    const id=recordingCassetteId(number);assert.equal(parseRecordingCassetteId(id),number);assert.equal(isCarryItem(id),true);
  }
  for(const number of [0,-1,1.5,NaN,Infinity,'1',Number.MAX_SAFE_INTEGER+1])assert.equal(recordingCassetteId(number),null);
  for(const id of ['recording-cassette:0','recording-cassette:01','recording-cassette:-1','recording-cassette:1.0','recording-cassette:9007199254740992','recording-cassette:1x','recording-cassette:constructor']){
    assert.equal(parseRecordingCassetteId(id),null);assert.equal(isCarryItem(id),false);
  }
});

test('keepsakes preserve four numbered positions and held preference across storage, swaps and reload',()=>{
  const source={schema:2,top:['light',null,'ren-home-cassette','recording-cassette:2'],heldSlot:2};
  const original=structuredClone(source);
  const swapped=assignCombatGearSlot(source,'ren-home-cassette',1).loadout;
  assert.deepEqual(swapped.top,['light','ren-home-cassette',null,'recording-cassette:2']);
  assert.equal(swapped.heldSlot,2,'the preference addresses a bay, not a follower item');
  const packed=assignCombatGearSlot(swapped,'marble-eyes',2).loadout;
  const stored=moveCombatGear(packed,'ren-home-cassette','storage').loadout;
  assert.deepEqual(stored.top,['light',null,'marble-eyes','recording-cassette:2']);
  assert.deepEqual(normalizeCombatLoadout(JSON.parse(JSON.stringify(stored))),stored);
  assert.deepEqual(availableBattleTools(stored,['light','marble-eyes','recording-cassette:2']),['torch']);
  assert.deepEqual(availableBattleTools(stored,[{id:'light',present:false},'marble-eyes','recording-cassette:2']),[]);
  assert.deepEqual(source,original);
});

test('a kept box far from its old resting place needs monitored melodic samples and never earns progress from custody alone',async()=>{
  const {createCoastalMemoryScene}=await import('../src/game/coastal-memory-scene.js');
  const {beginCoastalMemory}=await import('../src/game/coastal-memory.js');
  const layout={spawn:{x:0,z:30,feet:5,yaw:0,pitch:0},musicBox:{x:0,y:5.6,z:0,interactionRadius:1.45},
    pierReturnPlane:{point:{x:0,z:-3},normal:{x:0,z:-1},halfWidth:1.5},
    supportAt:()=>({height:5,walkable:true}),canOccupy:()=>true};
  const options={layout,runId:'carried-box-contract',entryDoorId:'invitation',returnPose:{x:1,y:2,yaw:.2,pitch:-.1}};
  const checkpoint=beginCoastalMemory(null,options);let kept=true,pickups=0,receipts=0;
  const scene=createCoastalMemoryScene({...options,checkpoint,isBoxTaken:()=>kept,onPickUp:()=>pickups++,onRecording:()=>{receipts++;return true;},
    renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}},
    audio:{load:async()=>true,update(){},setPaused(){},dispose(){},sample:()=>({audibleSeconds:0,sourceReady:true,audioRunning:false})}});
  await scene.initialize();for(let i=0;i<4;i++)scene.update(.25);
  assert.equal(scene.view().sourceDistance>20,true);assert.equal(scene.view().canListen,false);
  scene.key({key:'f'});assert.equal(pickups,1,'a carried object remained tied to the old plinth');
  assert.equal(scene.serialize().listenedSeconds,0);assert.equal(receipts,0);
  const melody={audibleSeconds:.25,recordingOffset:1,sourceReady:true,audioRunning:true,recorderHeld:true};
  assert.equal(scene.hearHandledBox(melody),false,'the ordinary world owner is not the physical handling scene');
  scene.pause();kept=false;assert.equal(scene.hearHandledBox(melody),false,'an unowned box cannot be heard in distant hands');kept=true;
  for(const bad of [{recorderHeld:false},{audioRunning:false},{sourceReady:false},{audibleSeconds:0}]){
    for(let i=0;i<40;i++)scene.hearHandledBox({...melody,...bad});
    assert.equal(scene.serialize().listenedSeconds,0);
  }
  for(let i=0;i<36;i++)assert.equal(scene.hearHandledBox({...melody,recordingOffset:(i+1)*.25}),true);
  assert.equal(scene.serialize().listenedSeconds,9);assert.equal(scene.serialize().recordingHeard,true);assert.equal(receipts,1);
  assert.deepEqual(scene.serialize().returnPose,checkpoint.returnPose);assert.equal(layout.musicBox.z,0,'the old source was moved instead of carrying the object');
  scene.resume();scene.exit();
});
