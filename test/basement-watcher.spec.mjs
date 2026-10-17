import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyBasementWatcherHuntResult,
  basementWatcherAcousticIsolationDb,
  basementWatcherClampToRoom,
  BASEMENT_WATCHER_RELEASE,
  BASEMENT_WATCHER_ROOM_IDS,
  BASEMENT_WATCHER_DEAL_ROOMS,
  BASEMENT_WATCHER_ROOMS,
  basementWatcherRoomContains,
  basementWatcherSignalContained,
  ensureBasementWatcherState,
  freshBasementWatcherRelease,
  freshBasementWatcherState,
  markBasementWatcherSeen,
  normalizeBasementWatcherState,
  resolveBasementWatcherMovement,
  stepBasementWatcherRelease,
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
assert.equal(new Set(Array.from({length:64},(_,index)=>watcherRoomForRun(`run_${index}`))).size,BASEMENT_WATCHER_DEAL_ROOMS.length,
  'every fresh watcher room is reachable across run seeds');
assert.deepEqual([...BASEMENT_WATCHER_ROOM_IDS].sort(),['b1','b5','lift','store'],
  'legacy saves may still hold the store assignment');
assert.deepEqual([...BASEMENT_WATCHER_DEAL_ROOMS].sort(),['b1','b5','lift'],
  'fresh watcher assignments leave the prop store to the Costume Exchange');
assert.notEqual(watcherRollForRun(runId),watcherRollForRun(`${runId}:room`),'hunt sampling is namespaced');

let state=ensureBasementWatcherState(freshBasementWatcherState(),runId);
assert.equal(state.roomId,room);
state=markBasementWatcherSeen(state);
assert.equal(state.armed,true);
const failed=resolveBasementWatcherMovement(state,{runId,currentPreset:'contract',roll:.30});
assert.equal(failed.rolled,true);assert.equal(failed.huntTriggered,false);assert.equal(failed.state.resolved,true);
assert.equal(resolveBasementWatcherMovement(failed.state,{runId,currentPreset:'contract',roll:0}).changed,false,
  'a resolved encounter cannot reroll');
assert.deepEqual(normalizeBasementWatcherState(JSON.parse(JSON.stringify(failed.state))),failed.state,
  'save and reload preserve the selected room and roll');

for(const [currentPreset,startedPreset,chance] of [
  ['story','story',.30],['contract','contract',.30],['night','night',.45],['dead-air','dead-air',.45],
  ['custom','night',.45],['custom','contract',.30],
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

let active=false,spawnCalls=0,retargetCalls=0,alertCalls=0;
const inactiveEffect=applyBasementWatcherHuntResult({huntTriggered:true},{
  isActive:()=>active,
  spawn:()=>{spawnCalls++;active=true;return true;},
  retarget:()=>{retargetCalls++;return true;},
  alert:()=>{alertCalls++;return true;},
});
assert.deepEqual(inactiveEffect,{spawned:true,confined:true,retargeted:true,alerted:false});
assert.equal(spawnCalls,1,'an inactive HUSH is spawned exactly once');
assert.equal(retargetCalls,1,'the newly spawned HUSH is targeted at the player');
assert.equal(alertCalls,0,'a body it spawned itself needs no second-hand news');

spawnCalls=0;retargetCalls=0;alertCalls=0;
const activeEffect=applyBasementWatcherHuntResult({huntTriggered:true},{
  isActive:()=>true,
  spawn:()=>{spawnCalls++;return true;},
  retarget:()=>{retargetCalls++;return true;},
  alert:()=>{alertCalls++;return true;},
});
assert.deepEqual(activeEffect,{spawned:false,confined:false,retargeted:false,alerted:true});
assert.equal(spawnCalls,0,'an active HUSH is not duplicated');
assert.equal(retargetCalls,0,'a HUSH already hunting elsewhere is not moved or pointed at the player');
assert.equal(alertCalls,1,'it only hears that something moved in the watcher room');

// LETTING IT GO. The borrowed body is released once the player has been out of
// the room long enough for it to reach the doorway, or shortly after it has
// touched him. A scene on screen stops both clocks.
let release=freshBasementWatcherRelease(3);
for(let t=0;t<BASEMENT_WATCHER_RELEASE.outsideSec-.5;t+=.5){
  const step=stepBasementWatcherRelease(release,{dt:.5,playerInside:false,contacts:3});
  assert.equal(step.done,false,'not released before the doorway beat has had time to play');
  release=step.release;
}
assert.equal(stepBasementWatcherRelease(release,{dt:.5,playerInside:true,contacts:3}).release.outsideSec,0,
  'stepping back into the room restarts the clock');
const left=stepBasementWatcherRelease(release,{dt:.6,playerInside:false,contacts:3});
assert.equal(left.done,true);assert.equal(left.reason,'left');
assert.equal(stepBasementWatcherRelease(release,{dt:10,playerInside:false,contacts:3,busy:true}).done,false,
  'a scene on screen does not count as time away');
let touched=freshBasementWatcherRelease(0);
touched=stepBasementWatcherRelease(touched,{dt:1,playerInside:true,contacts:1}).release;
const afterContact=stepBasementWatcherRelease(touched,{dt:BASEMENT_WATCHER_RELEASE.afterContactSec,playerInside:true,contacts:1});
assert.equal(afterContact.done,true);assert.equal(afterContact.reason,'contact');
assert.deepEqual(basementWatcherClampToRoom('b1',{x:44,y:24}),{x:44,y:20.5},
  'a hunt started from the corridor comes to the doorway and no further');

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,
});
PROPS.propsInit(FP,CONSERVATORY_PROPS);
// Where each station is, and a point just outside it (the corridor for the
// rooms off it, B1 for the pit behind its hatch).
const STATION_CHECKS={
  b1:{zone:ZONE.danceStudio,outside:{x:44,y:23}},
  b5:{zone:ZONE.danceStudio,outside:{x:15,y:23}},
  store:{zone:ZONE.store,outside:{x:2,y:23}},
  lift:{zone:ZONE.none,outside:{x:43.5,y:13}},
};
for(const definition of Object.values(BASEMENT_WATCHER_ROOMS)){
  const check=STATION_CHECKS[definition.id];
  assert.ok(check,`${definition.label} has a station check`);
  const stand=FP.toRuntimePoint(definition.stand);
  assert.equal(FP.logicalToPhysical(stand.x,stand.y).renderGroup,'basement',`${definition.label} is downstairs`);
  assert.equal(FP.isSolid(stand.x,stand.y),false,`${definition.label} watcher is not in masonry`);
  assert.equal(FP.zoneAt(stand.x,stand.y),check.zone,`${definition.label} watcher stands in the room it is named for`);
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
  const corridor=FP.toRuntimePoint(check.outside);
  const edgePath=navigation.findPath(stand,corridor);
  assert.equal(navigation.isWalkable(corridor),false,`${definition.label} corridor is not occupiable by its HUSH`);
  // A shut door (the store, the hatch) means there is no route out at all; an
  // open one means a route that stops at the doorway. Either way it stays in.
  assert.ok(!edgePath||edgePath.every(containsRuntime),`${definition.label} pathfinding never crosses its doorway`);
  if(edgePath)assert.notDeepEqual(edgePath.at(-1),corridor,`${definition.label} pathfinding does not resolve onto the corridor target`);
  const doorway=FP.toRuntimePoint(basementWatcherClampToRoom(definition.id,check.outside));
  const approach=navigation.findPath(stand,doorway);
  assert.ok(approach?.length&&approach.every(containsRuntime),`${definition.label} can come as far as its own doorway`);
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
assert.match(mainSource,/currentMapContact\(source\)[\s\S]*?if\(!source\|\|!hush\)\{[\s\S]*?HUSH_MAP_TELEMETRY\.clear\(\)/,
  'map telemetry is cleared whenever the player has no physically sensed HUSH');
assert.match(mainSource,/function currentMapHushMarker\(\)[\s\S]*?hushPhysicallySensed\([\s\S]*?if\(!sensed\)return null/,
  'simulation presence alone cannot expose the basement HUSH on the map');
assert.match(mainSource,/function chooseHushReleaseTarget\(seed=1\)[\s\S]*?const confinement=basementWatcherConfinement\(\)[\s\S]*?contained:true/,
  'a brush release redirects within the selected studio instead of emitting a remote note');
assert.match(mainSource,/takenEligible:dialogueEligible&&!basementWatcherConfinement\(\)/,
  'the room-locked HUSH cannot take the player to another room');

console.log('basement watcher contracts passed');
