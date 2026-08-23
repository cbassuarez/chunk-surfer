import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyBasementWatcherHuntResult,
  BASEMENT_WATCHER_ROOM_IDS,
  BASEMENT_WATCHER_ROOMS,
  ensureBasementWatcherState,
  freshBasementWatcherState,
  markBasementWatcherSeen,
  normalizeBasementWatcherState,
  resolveBasementWatcherMovement,
  watcherChanceForPreset,
  watcherRollForRun,
  watcherRoomForRun,
} from '../src/game/basement-watcher.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
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

let active=false,spawnCalls=0,retargetCalls=0;
const inactiveEffect=applyBasementWatcherHuntResult({huntTriggered:true},{
  isActive:()=>active,
  spawn:()=>{spawnCalls++;active=true;return true;},
  retarget:()=>{retargetCalls++;return true;},
});
assert.deepEqual(inactiveEffect,{spawned:true,retargeted:true});
assert.equal(spawnCalls,1,'an inactive HUSH is spawned exactly once');
assert.equal(retargetCalls,1,'the newly spawned HUSH is targeted at the player');

spawnCalls=0;retargetCalls=0;
const activeEffect=applyBasementWatcherHuntResult({huntTriggered:true},{
  isActive:()=>true,
  spawn:()=>{spawnCalls++;return true;},
  retarget:()=>{retargetCalls++;return true;},
});
assert.deepEqual(activeEffect,{spawned:false,retargeted:true});
assert.equal(spawnCalls,0,'an active HUSH is not duplicated');
assert.equal(retargetCalls,1,'an active HUSH is retargeted');

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,
});
PROPS.propsInit(FP,CONSERVATORY_PROPS);
for(const definition of Object.values(BASEMENT_WATCHER_ROOMS)){
  const stand=FP.toRuntimePoint(definition.stand);
  assert.equal(FP.logicalToPhysical(stand.x,stand.y).renderGroup,'basement',`${definition.label} is downstairs`);
  assert.equal(FP.isSolid(stand.x,stand.y),false,`${definition.label} watcher is not in masonry`);
  assert.equal(PROPS.propCanOccupy(stand.x,stand.y),true,`${definition.label} watcher is clear of furniture`);
  assert.ok(definition.spawnCandidates.some((candidate)=>{
    const at=FP.toRuntimePoint(candidate);
    return !FP.isSolid(at.x,at.y)&&PROPS.propCanOccupy(at.x,at.y);
  }),`${definition.label} has a legal HUSH spawn cell`);
}

console.log('basement watcher contracts passed');
