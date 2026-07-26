import assert from 'node:assert/strict';
import {
  allPowerCircuitsRestored,
  freshPowerState,
  livePowerCircuits,
  normalizePowerState,
  powerCircuitForPanel,
  togglePowerCircuit,
} from '../src/game/conservatory-power.js';

assert.deepEqual(normalizePowerState(null),freshPowerState());
assert.deepEqual([...livePowerCircuits({sp01:true})],['sp01'],'legacy development flags normalize');
assert.equal(powerCircuitForPanel('acq-services-panel-pool').id,'sp02');
let state=freshPowerState();
for(const circuit of['sp01','sp02','sp03']){
  const changed=togglePowerCircuit(state,circuit,{at:100});
  assert.equal(changed.changed,true);assert.equal(changed.live,true);state=changed.state;
}
assert.equal(allPowerCircuitsRestored(state),true);
const killed=togglePowerCircuit(state,'sp02',{at:200});
assert.equal(killed.live,false);
assert.deepEqual(killed.state.live.sort(),['sp01','sp03']);
assert.deepEqual(killed.state.everRestored.sort(),['sp01','sp02','sp03'],'history survives killing a circuit');
assert.equal(togglePowerCircuit(state,'bogus').changed,false);
console.log('conservatory power contracts passed');
