import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCOUNTER_PHASE, ENCOUNTER_TIMING, makeEncounterStartScene } from '../src/game/encounter-start.js';

function harness(options={}) {
  let confirmed=0;const calls=[];
  const scene=makeEncounterStartScene({onConfirm:()=>confirmed++,fx:{hold:()=>calls.push('hold'),shake:()=>calls.push('shake')},audio:{menuConfirm:()=>calls.push('impact')},...options});
  scene.enter();
  return {scene,calls,get confirmed(){return confirmed;},settle(){for(let i=0;i<180;i++)scene.update(1/60);}};
}
test('the automatic splash hands off once, in hold → impact → versus order',()=>{
  const h=harness(),seen=[h.scene.view().phase];
  for(let i=0;i<180;i++){h.scene.update(1/60);const p=h.scene.view().phase;if(p!==seen.at(-1))seen.push(p);}
  assert.deepEqual(seen,Object.values(ENCOUNTER_PHASE));assert.equal(h.confirmed,1);
  h.scene.key({key:'Enter'});h.settle();assert.equal(h.confirmed,1);
});
test('held input cannot skip the reveal or confirm preparation through it',()=>{
  const h=harness();for(let i=0;i<20;i++){h.scene.key({key:'Enter',repeat:true});h.scene.pointer({type:'pointerdown'});}
  assert.equal(h.scene.view().phase,'hold');assert.equal(h.confirmed,0);
  assert.equal(h.scene.key({key:'Escape'}),false,'pause keeps its global input');
});
test('an aborted splash never opens a stale fight',()=>{
  const h=harness();h.scene.exit();h.settle();assert.equal(h.confirmed,0);
});
test('effects have no ownership of the transition clock and enter is idempotent',()=>{
  const h=harness();h.scene.enter();h.settle();assert.equal(h.calls.filter(v=>v==='hold').length,1);assert.equal(h.calls.filter(v=>v==='impact').length,1);
  const silent=harness({fx:{},audio:{}});silent.settle();assert.equal(silent.confirmed,1);
});
test('a stalled frame cannot consume the whole splash; total authored time stays brief',()=>{
  const h=harness();h.scene.update(300);assert.equal(h.scene.view().phase,'hold');
  const duration=Object.values(ENCOUNTER_TIMING).reduce((a,b)=>a+b,0);assert.ok(duration>1&&duration<2);
});
