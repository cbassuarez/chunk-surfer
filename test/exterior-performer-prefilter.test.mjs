import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {isExteriorPerformerInput,isLiveExteriorPerformer} from '../src/render/exterior-performer-visibility.js';
import {exteriorVigilInstances} from '../src/render/exterior-vigil-instances.js';
import {streetCrowdInstances} from '../src/render/street-crowd-performance.js';

FP.compile(conservatory.levels,conservatory);
PROPS.propsInit(FP);

function compare(crowdReady){
  const all=PROPS.renderInstances({group:'ground'});
  const selected=PROPS.renderSelectedHosts({group:'ground',select:p=>isExteriorPerformerInput(p,{crowdReady})});
  // The previous complete render is the oracle, including its generated
  // inscriptions and services, so any new performer among them is detected.
  assert.deepEqual(selected,all.filter(p=>isExteriorPerformerInput(p,{crowdReady})));
  // Animation caches can introduce roundoff at machine precision on repeated
  // evaluations. Compare the complete output with sub-pixel numeric tolerance.
  const stable=value=>JSON.stringify(value,(_key,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v);
  assert.equal(stable(exteriorVigilInstances(selected,{timeSec:2})),stable(exteriorVigilInstances(all,{timeSec:2})));
  if(crowdReady)assert.equal(stable(streetCrowdInstances(selected,{timeSec:2})),stable(streetCrowdInstances(all,{timeSec:2})));
  assert.deepEqual(selected.filter(p=>isLiveExteriorPerformer(p,{crowdReady})),all.filter(p=>isLiveExteriorPerformer(p,{crowdReady})));
  return selected;
}

test('selected authored performers preserve live outputs with and without crowd assets',()=>{
  assert.ok(compare(false).length>0);
  assert.ok(compare(true).length>=compare(false).length);
});

test('selection reflects current drift and collision-group enablement',()=>{
  const performer=compare(true)[0];
  PROPS.setPropDrift(performer.id,{dx:.3,dz:-.2,dyaw:.4});
  const shifted=compare(true).find(p=>p.id===performer.id);
  assert.notEqual(shifted.x,performer.x);
  PROPS.setPropDrift(performer.id);
  PROPS.setColliderGroupEnabled('opening-street',true);
  try{compare(true);compare(false);}finally{PROPS.setColliderGroupEnabled('opening-street',false);}
});
