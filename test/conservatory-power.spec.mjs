import assert from 'node:assert/strict';
import {
  POWER_CIRCUIT_IDS,
  POWER_STATE_SCHEMA,
  allPowerCircuitsRestored,
  freshPowerState,
  livePowerCircuits,
  normalizePowerState,
  powerCircuitForPanel,
  setPowerCircuit,
  togglePowerCircuit,
} from '../src/game/conservatory-power.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';

assert.deepEqual(normalizePowerState(null),freshPowerState());
assert.deepEqual([...livePowerCircuits({sp01:true})],['sp01'],'legacy development flags normalize');
assert.equal(powerCircuitForPanel('acq-services-panel-pool').id,'sp02');
assert.equal(powerCircuitForPanel('acq-services-panel-practice').id,'sp04');
assert.equal(powerCircuitForPanel('acq-services-panel-academic').id,'sp05');
const migrated=normalizePowerState({schema:1,live:['sp03'],everRestored:['sp03'],lastChanged:{circuit:'sp03',live:true,at:7}});
assert.equal(migrated.schema,POWER_STATE_SCHEMA);
assert.deepEqual(migrated.live.sort(),['sp03','sp04','sp05']);
assert.deepEqual(migrated.everRestored.sort(),['sp03','sp04','sp05']);
let state=freshPowerState();
for(const circuit of POWER_CIRCUIT_IDS){
  const changed=togglePowerCircuit(state,circuit,{at:100});
  assert.equal(changed.changed,true);assert.equal(changed.live,true);state=changed.state;
}
assert.equal(allPowerCircuitsRestored(state),true);
const killed=togglePowerCircuit(state,'sp02',{at:200});
assert.equal(killed.live,false);
assert.deepEqual(killed.state.live.sort(),['sp01','sp03','sp04','sp05']);
assert.deepEqual(killed.state.everRestored.sort(),[...POWER_CIRCUIT_IDS].sort(),'history survives killing a circuit');
assert.equal(togglePowerCircuit(state,'bogus').changed,false);
assert.equal(setPowerCircuit(state,'sp01',true).changed,false,'desired-state writes never toggle a live circuit off');
assert.equal(setPowerCircuit(state,'sp01',false).state.live.includes('sp01'),false,'ending blackouts set an explicit destination');
assert.equal(setPowerCircuit(state,'bogus',true).changed,false,'desired-state writes validate against the canonical list');

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors,
});
for(const [id,group] of [
  ['acq-services-panel-practice','upper'],
  ['acq-services-panel-academic','academic'],
]){
  const prop=CONSERVATORY_PROPS.find((entry)=>entry.id===id);
  assert.ok(prop,`${id} is authored`);
  const rx=Math.round(prop.x*2),ry=Math.round(prop.y*2);
  assert.equal(FP.isSolid(rx,ry),false,`${id} is not dropped into masonry`);
  assert.equal(FP.logicalToPhysical(rx,ry).renderGroup,group,`${id} belongs to ${group}`);
  assert.equal(FP.isSolid(Math.round(prop.inspectAt.x*2),Math.round(prop.inspectAt.y*2)),false,`${id} has a reachable interaction mark`);
  assert.equal(prop.action,`power-panel-${powerCircuitForPanel(id).id}`);
}
console.log('conservatory power contracts passed');
