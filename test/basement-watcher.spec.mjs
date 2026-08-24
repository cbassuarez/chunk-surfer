import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyBasementWatcherHuntResult,
  basementWatcherAcousticIsolationDb,
  BASEMENT_WATCHER_ROOM_IDS,
  BASEMENT_WATCHER_ROOMS,
  basementWatcherRoomContains,
  basementWatcherSignalContained,
  ensureBasementWatcherState,
  freshBasementWatcherState,
  markBasementWatcherSeen,
  normalizeBasementWatcherState,
  resolveBasementWatcherMovement,
  watcherChanceForPreset,
  watcherRollForRun,
  watcherRoomForRun,
} from '../src/game/basement-watcher.js';
import { createPresenceNavigation } from '../src/game/presence-navigation.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { freshSave } from '../src/game/save.js';

const runId='run_watcher_contract';
assert.deepEqual(freshSave().basementWatcher,freshBasementWatcherState(),
  'new saves reserve persisted watcher state before the run room is dealt');
const room=watcherRoomForRun(runId);
assert.ok(BASEMENT_WATCHER_ROOM_IDS.includes(room));
assert.equal(watcherRoomForRun(runId),room,'room selection is stable for the run');
assert.equal(new Set(Array.from({length:64},(_,index)=>watcherRoomForRun(`run_${index}`))).size,2,
  'both authored rooms are reachable across run seeds');
assert.notEqual(watcherRollForRun(runId),watcherRollForRun(`${runId}:room`),'hunt sampling is namespaced');

let state=ensureBasementWatcherState(freshBasementWatcherState(),runId);
assert.equal(state.roomId,room);
state=markBasementWatcherSeen(state);
assert.equal(state.armed,true);
const failed=resolveBasementWatcherMovement(state,{runId,currentPreset:'contract',roll:.35});
assert.equal(failed.rolled,true);assert.equal(failed.huntTriggered,false);assert.equal(failed.state.resolved,true);
assert.equal(resolveBasementWatcherMovement(failed.state,{runId,currentPreset:'contract',roll:0}).changed,false,
  'a resolved encounter cannot reroll');
assert.deepEqual(normalizeBasementWatcherState(JSON.parse(JSON.stringify(failed.state))),failed.state,
  'save and reload preserve the selected room and roll');

for(const [currentPreset,startedPreset,chance] of [
  ['story','story',.35],['contract','contract',.35],['night','night',.50],['dead-air','dead-air',.50],
  ['custom','night',.50],['custom','contract',.35],
]){
  assert.equal(watcherChanceForPreset(currentPreset,startedPreset),chance);
  const armed=markBasementWatcherSeen(ensureBasementWatcherState(null,`${currentPreset}:${startedPreset}`));
  assert.equal(resolveBasementWatcherMovement(armed,{currentPreset,startedPreset,roll:chance-.001}).huntTriggered,true);
  assert.equal(resolveBasementWatcherMovement(armed,{currentPreset,startedPreset,roll:chance}).huntTriggered,false);
}
assert.equal(resolveBasementWatcherMovement(ensureBasementWatcherState(null,'unseen'),{roll:0}).rolled,false,
  'movement before a confirmed look does nothing');

const mainSource=readFileSync('src/main.js','utf8');
const watcherTick=mainSource.slice(mainSource.indexOf('function tickBasementWatcher'),mainSource.indexOf('function basementWatcherSpawnCell'));
assert.match(watcherTick,/basementWatcherRenderInstance\(group\)/,
  'the watcher can arm only while its apparition is actually being presented');
assert.match(watcherTick,/pointInSight\(at\.x,at\.y\)/,
  'arming uses the shared focus, distance and unobstructed sight contract');
const successfulStep=mainSource.slice(mainSource.indexOf('px=nx; py=ny; stepCount++'),mainSource.indexOf('if(storyMode&&usingPlan()&&!usingSpecialSpace())onPlantHaulStep'));
assert.match(successfulStep,/noteBasementWatcherMovement\(\)/,
  'only a successful player-position update resolves the armed encounter');

let active=false,spawnCalls=0,confineCalls=0,retargetCalls=0;
const inactiveEffect=applyBasementWatcherHuntResult({huntTriggered:true},{
  isActive:()=>active,
  spawn:()=>{spawnCalls++;active=true;return true;},
  confine:()=>{confineCalls++;return true;},
  retarget:()=>{retargetCalls++;return true;},
});
assert.deepEqual(inactiveEffect,{spawned:true,confined:true,retargeted:true});
assert.equal(spawnCalls,1,'an inactive HUSH is spawned exactly once');
assert.equal(confineCalls,0,'a fresh spawn already starts inside its confinement');
assert.equal(retargetCalls,1,'the newly spawned HUSH is targeted at the player');

spawnCalls=0;confineCalls=0;retargetCalls=0;
const activeEffect=applyBasementWatcherHuntResult({huntTriggered:true},{
  isActive:()=>true,
  spawn:()=>{spawnCalls++;return true;},
  confine:()=>{confineCalls++;return true;},
  retarget:()=>{retargetCalls++;return true;},
});
assert.deepEqual(activeEffect,{spawned:false,confined:true,retargeted:true});
assert.equal(spawnCalls,0,'an active HUSH is not duplicated');
assert.equal(confineCalls,1,'the one active HUSH body is placed inside the watcher room');
assert.equal(retargetCalls,1,'the confined active HUSH is retargeted');

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,
});
PROPS.propsInit(FP,CONSERVATORY_PROPS);
for(const definition of Object.values(BASEMENT_WATCHER_ROOMS)){
  const stand=FP.toRuntimePoint(definition.stand);
  assert.equal(FP.logicalToPhysical(stand.x,stand.y).renderGroup,'basement',`${definition.label} is downstairs`);
  assert.equal(FP.isSolid(stand.x,stand.y),false,`${definition.label} watcher is not in masonry`);
  assert.equal(FP.zoneAt(stand.x,stand.y),ZONE.danceStudio,`${definition.label} watcher is inside a dance studio, not adjacent circulation`);
  assert.equal(PROPS.propCanOccupy(stand.x,stand.y),true,`${definition.label} watcher is clear of furniture`);
  assert.equal(basementWatcherRoomContains(definition.id,definition.stand),true,`${definition.label} stand belongs to its room`);
  assert.ok(definition.spawnCandidates.every((candidate)=>basementWatcherRoomContains(definition.id,candidate)),
    `${definition.label} spawn candidates all belong to its room`);
  assert.ok(definition.spawnCandidates.some((candidate)=>{
    const at=FP.toRuntimePoint(candidate);
    return !FP.isSolid(at.x,at.y)&&PROPS.propCanOccupy(at.x,at.y);
  }),`${definition.label} has a legal HUSH spawn cell`);

  const containsRuntime=(point)=>basementWatcherRoomContains(definition.id,{
    x:FP.toAuthoredCoord(point.x),y:FP.toAuthoredCoord(point.y),
  });
  const navigation=createPresenceNavigation({
    isSolid:(x,y)=>FP.isSolid(x,y)||!containsRuntime({x,y}),
    canStep:(ax,ay,bx,by)=>containsRuntime({x:ax,y:ay})&&containsRuntime({x:bx,y:by})
      ?FP.canStep(ax,ay,bx,by,{keys:new Set(['master'])})
      :{ok:false},
    canOccupy:(x,y)=>containsRuntime({x,y})&&PROPS.propCanOccupy(x,y),
    connectorDestination:FP.connectorDestination,
    planSize:FP.planSize,
    keys:new Set(['master']),
  });
  const corridor=FP.toRuntimePoint({x:definition.id==='b1'?44:15,y:23});
  const edgePath=navigation.findPath(stand,corridor);
  assert.equal(navigation.isWalkable(corridor),false,`${definition.label} corridor is not occupiable by its HUSH`);
  assert.ok(edgePath?.length&&edgePath.every(containsRuntime),`${definition.label} pathfinding can approach but never cross its studio threshold`);
  assert.notDeepEqual(edgePath.at(-1),corridor,`${definition.label} pathfinding does not resolve onto the corridor target`);
  assert.equal(basementWatcherSignalContained(definition.id,definition.stand,{x:FP.toAuthoredCoord(corridor.x),y:FP.toAuthoredCoord(corridor.y)}),false,
    `${definition.label} emits no signal into the corridor`);
  assert.equal(basementWatcherSignalContained(definition.id,definition.stand,definition.spawnCandidates.at(-1)),true,
    `${definition.label} signal remains live inside the room`);
  assert.equal(basementWatcherAcousticIsolationDb(definition.id,definition.stand,definition.spawnCandidates.at(-1)),0,
    `${definition.label} retains its sound inside the room`);
  assert.equal(basementWatcherAcousticIsolationDb(definition.id,definition.stand,{x:FP.toAuthoredCoord(corridor.x),y:FP.toAuthoredCoord(corridor.y)}),120,
    `${definition.label} applies a hard acoustic firewall at the threshold`);
}

assert.equal(basementWatcherRoomContains('b1',{x:44.5,y:10.5}),false,'the B1 lift pocket is not part of Studio B1 containment');

assert.match(mainSource,/roomLossDb:basementWatcherAcousticFirewallDb/,
  'the semantic HUSH audio runtime installs the hard room firewall');
assert.match(mainSource,/suppressContact:hushSensationMode===HUSH_SENSATION_MODE\.BRUSH\|\|!basementWatcherSignalAllowedAt\(\)/,
  'contact cannot cross the room threshold');
assert.match(mainSource,/currentMapContact\(source\)[\s\S]*?if\(!source\|\|!hushActiveForPlayer\(\)\)/,
  'map telemetry exposes no basement HUSH signal outside its room');
assert.match(mainSource,/function chooseHushReleaseTarget\(seed=1\)[\s\S]*?const confinement=basementWatcherConfinement\(\)[\s\S]*?contained:true/,
  'a brush release redirects within the selected studio instead of emitting a remote note');
assert.match(mainSource,/takenEligible:dialogueEligible&&!basementWatcherConfinement\(\)/,
  'the room-locked HUSH cannot take the player to another room');

console.log('basement watcher contracts passed');
