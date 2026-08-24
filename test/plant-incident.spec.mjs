import test from 'node:test';
import assert from 'node:assert/strict';

import * as plant from '../src/game/plant-incident.js';

test('plant incident triggers once from a player spoil on take two or three only',()=>{
  assert.equal(plant.loadPlantIncident(null).phase,plant.PLANT_INCIDENT_PHASE.DORMANT,'old saves without plant state start dormant');
  plant.resetPlantIncident();
  assert.equal(plant.triggerPlantIncident({takeOrdinal:1,spoiled:true,playerGenerated:true}),false);
  assert.equal(plant.triggerPlantIncident({takeOrdinal:2,spoiled:true,playerGenerated:false}),false);
  assert.equal(plant.triggerPlantIncident({takeOrdinal:2,spoiled:true,playerGenerated:true}),true);
  assert.equal(plant.plantRecordingBlocked(),true);
  assert.equal(plant.triggerPlantIncident({takeOrdinal:3,spoiled:true,playerGenerated:true}),false);
  assert.equal(plant.plantIncidentState().triggerTakeOrdinal,2);
});

test('the baggable spanner bypasses hauling and can begin the physical isolation',()=>{
  plant.resetPlantIncident();plant.collectPlantSpanner();
  plant.triggerPlantIncident({takeOrdinal:3,spoiled:true,playerGenerated:true});
  assert.equal(plant.beginPlantIsolation(plant.PLANT_TOOL.SPANNER,100),true);
  assert.equal(plant.completePlantIsolation(),true);
  assert.equal(plant.plantIncidentState().phase,plant.PLANT_INCIDENT_PHASE.SEALED);
  assert.equal(plant.plantRecordingBlocked(),false);
});

test('the Stillson cannot enter the bag, scrapes every 1.5m, and preserves position',()=>{
  plant.resetPlantIncident();
  plant.triggerPlantIncident({takeOrdinal:2,spoiled:true,playerGenerated:true});
  assert.equal(plant.gripHeavyWrench({x:140,y:12}),true);
  assert.equal(plant.moveHeavyWrench({x:139,y:12},{distanceMetres:.5}).scrape,false);
  assert.equal(plant.moveHeavyWrench({x:138,y:12},{distanceMetres:1}).scrape,true);
  const saved=plant.savePlantIncident();
  plant.resetPlantIncident();plant.loadPlantIncident(saved);
  assert.equal(plant.heavyWrenchDragging(),true);
  assert.deepEqual(plant.plantIncidentState().heavyPosition,{x:138,y:12});
  assert.equal(plant.beginPlantIsolation(plant.PLANT_TOOL.STILLSON,500),true);
});

test('haul pose remains in the authored rear band and never jumps ahead',()=>{
  const trail=Array.from({length:31},(_,i)=>({x:i,y:0}));
  const pose=plant.haulHushPose({trail,player:{x:30,y:0},cellsPerMetre:2});
  assert.ok(pose.x<=14,'eight metres of trail remain behind the player');
  assert.ok(pose.distanceMetres>=8&&pose.distanceMetres<=14);
});
