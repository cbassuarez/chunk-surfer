import assert from 'node:assert/strict';

import * as OBJ from '../src/game/objectives.js';
import { CHAPEL_TOWER_PHASE, freshChapelTowerState } from '../src/game/chapel-tower-state.js';
import { STORY_TARGET, resolveStoryGuidanceTarget, storyTargetSharesRenderSpace } from '../src/game/story-guidance.js';

const phase=(value,patch={})=>({...freshChapelTowerState(),phase:value,...patch});
const target=(patch={})=>resolveStoryGuidanceTarget({
  prologueDone:true,
  getInEntered:true,
  tower:phase(CHAPEL_TOWER_PHASE.FORESHADOW),
  ...patch,
});

assert.equal(resolveStoryGuidanceTarget().id,'story:yard-van');
assert.equal(resolveStoryGuidanceTarget({bagTaken:true}).id,'story:lodge','the optional shelter never replaces the check-in route');
assert.equal(resolveStoryGuidanceTarget({prologueDone:true}).id,'story:get-in','the handoff routes all the way to the arrival threshold');
assert.equal(STORY_TARGET.lookBench.required,false,'the shelter remains optional atmosphere');
assert.equal(target({selectedWaypoint:{x:10,y:12,roomId:'main_b3'},selectedLabel:'Studio B3'}).id,'room:main_b3');

const sourceReady=phase(CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(target({tower:sourceReady}).id,'story:page-6');
assert.equal(target({tower:sourceReady,readPageIds:['page-6']}).id,'story:read-page-6');
assert.equal(target({tower:sourceReady,readPageIds:['page-6'],chapelClueLog:true}).id,'story:rekey-ledger');
assert.equal(target({tower:sourceReady,chapelClueLog:true,chapelClueLedger:true}).id,'story:key-cabinet');
assert.equal(target({tower:sourceReady,chapelClueLog:true,chapelClueLedger:true}).label,'SELECT THE CHAPEL KEY');
assert.equal(target({tower:sourceReady,chapelClueLog:true,chapelClueLedger:true,hasChapelKey:true}).id,'story:chapel-c17');
assert.equal(target({tower:{...sourceReady,corridorDiscovered:true},chapelClueLog:true,chapelClueLedger:true,hasChapelKey:true}).id,'story:chapel-screen');
assert.equal(target({tower:{...sourceReady,corridorDiscovered:true}}).id,'story:chapel-screen','early corridor discovery never routes back to Page 6');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.TRANSITION_READY)}).id,'story:follow-signal');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.TOWER_ACTIVE)}).id,'story:tenor-rope');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.TOWER_ACTIVE,{tenorRopeTaken:true})}).id,'story:ring-tenor');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.TOWER_ACTIVE,{tenorRopeTaken:true,pealCompleted:true})}),null);
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.TOWER_CLEARED)}).id,'story:descend-nave');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.TOWER_CLEARED,{chapelReached:true})}).id,'story:fifth-take');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.CHAPEL_FINAL)}).id,'story:fifth-take');
const marked={x:20,y:30,roomId:'main_b3'};
assert.equal(target({tower:sourceReady,selectedWaypoint:marked,selectedLabel:'Studio B3'}).id,'story:page-6');
assert.equal(target({tower:phase(CHAPEL_TOWER_PHASE.FORESHADOW),selectedWaypoint:marked,selectedLabel:'Studio B3'}).id,'room:main_b3','the player mark returns when mandatory guidance no longer overrides it');

assert.equal(target({escape:{kind:'surfaced',exitCell:{x:1,y:2}}}).id,'story:ending-surfaced');
assert.equal(target({escape:{kind:'stay',screenCell:{x:3,y:4}}}).id,'story:ending-stay');
assert.deepEqual(target({escape:{kind:'inversion',stage:'door',doorCell:{x:5,y:6},guidanceDoorCell:{x:7,y:6}}}).point,{x:7,y:6});
assert.equal(target({escape:{kind:'inversion',stage:'rescue',rescueCell:{x:9,y:10}}}).id,'story:ending-rescue');

assert.equal(storyTargetSharesRenderSpace(STORY_TARGET.van,{
  targetRenderGroup:'ground',observerRenderGroup:'ground',targetFloorId:'yard',observerFloorId:'street',
}),true,'object illumination remains continuous across overlapping exterior floor labels');
assert.equal(storyTargetSharesRenderSpace(STORY_TARGET.van,{
  targetRenderGroup:'ground',observerRenderGroup:'upper',targetFloorId:'yard',observerFloorId:'upper',
}),false,'object illumination never crosses render groups');
assert.equal(storyTargetSharesRenderSpace({kind:'position'}, {
  targetRenderGroup:'ground',observerRenderGroup:'ground',targetFloorId:'ground',observerFloorId:'upper',
}),false,'position guidance retains floor isolation');
assert.equal(storyTargetSharesRenderSpace({kind:'position'}, {
  targetRenderGroup:'ground',observerRenderGroup:'ground',targetFloorId:'ground',observerFloorId:'ground',
}),true);

const mandatoryProps=new Set([
  'yard-van','yard-booth','loose-page:page-6','box-office-ledger','box-office-key-cabinet','chapel-inner-screen','tower-rope-8',
]);
for(const optional of ['yard-van-bag','story-bent-rig','dock-power-panel','calibration-pin-1'])assert.equal(mandatoryProps.has(optional),false);

OBJ.loadObjState({read:['page-6'],target:'story:ring-tenor',waypoint:{x:1,y:2,roomId:'story:ring-tenor'}},{validTargets:['main_b3','lux_nova']});
assert.equal(OBJ.targetRoom(),null);
assert.equal(OBJ.waypoint(),null);
assert.deepEqual(OBJ.objState().read,['page-6']);
OBJ.loadObjState({read:['page-6'],target:'main_b3',waypoint:{x:20,y:30,roomId:'main_b3'}},{validTargets:['main_b3','lux_nova']});
assert.equal(OBJ.targetRoom(),'main_b3');
assert.deepEqual(OBJ.waypoint(),{x:20,y:30,roomId:'main_b3'});

console.log('story guidance tests ok');
