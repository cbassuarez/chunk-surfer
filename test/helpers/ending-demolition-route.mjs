import assert from 'node:assert/strict';
import {SOURCE_EARTHFALL as C} from '../../src/data/source-earthfall.js';
import {freshEndingWrongDoorDemolition as fresh,stepEndingWrongDoorDemolition as step,endingWrongDoorDemolitionFocus as focus} from '../../src/game/ending-wrong-door.js';

// Follow the current physical route through ordinary inputs. Debris can move
// the landing footprint: a fixed-duration forward press is not navigation.
export function completedEndingDemolition({runId,returnPose}={}){
  let state=fresh({runId,returnPose});const events=[];
  const tick=input=>{const r=step(state,{dt:C.fixedStep,...input});state=r.state;events.push(...r.events);};
  for(let n=0;n<240&&!state.physical.committed;n++)tick({forward:1});
  assert.equal(state.physical.committed,true,'the ordinary entry crossing commits demolition');
  for(let n=0;n<30/C.fixedStep&&state.physical.phase!=='landed';n++)tick({});
  assert.equal(state.physical.phase,'landed','the actual material/contact descent reaches the lower path');
  const walk=(x,z)=>{
    for(let n=0;n<8000&&state.status==='active';n++){
      const p=state.physical,dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);if(d<.025)return;
      tick({look:{yaw:Math.atan2(dx,-dz)},forward:Math.min(1,d/(C.walkSpeed*C.fixedStep))});
    }
    if(state.status==='active')assert.fail('No ordinary route to lower door: '+JSON.stringify(state.physical));
  };
  walk(0,C.passage.exitZ+1.4);
  assert.equal(focus(state)?.kind,'exit','align with the real lower handle after the deflected landing');
  tick({interact:true});
  for(let n=0;n<Math.ceil(C.door.openSeconds/C.fixedStep)+1;n++)tick({});
  walk(0,C.passage.exitZ-.5);
  assert.equal(state.status,'ready-for-source-IV','the entire body must cross the opened physical leaf');
  assert.equal(events.filter(e=>e.type==='enter-source-IV').length,1);
  return state;
}
