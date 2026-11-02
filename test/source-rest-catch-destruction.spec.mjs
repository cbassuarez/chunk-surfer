import test from 'node:test';
import assert from 'node:assert/strict';
import {applySourceRestDestruction} from '../src/render/source-rest-destruction.js';
import {sourceRestDestructionGeometryLibrary} from '../src/render/source-rest-destruction-models.js';
import {sourceRestCouperinAffliction} from '../src/game/source-rest-couperin-affliction.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {sourceRestReturnRoom} from '../src/render/source-rest-return.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS,sourceRestEyeHeight} from '../src/game/source-rest-seat.js';
import {continuationSupportAt} from '../src/data/source-continuation.js';
import {sourceRestReturnConfig} from '../src/render/source-rest-return.js';

const seat=SOURCE_REST_SEATS[1];
const state={...freshSourceContinuation(),...seat.approach,status:'active',phase:seat.phase,chartId:seat.chartId,level:seat.level,feet:seat.feet};
state.hush.active=false;
// The real seated submission keeps the actual authored matrices, native mesh
// names, material identity, wear flags and each lid's meaningful local centre.
// Do not reconstruct batched curved geometry as old unit boxes with sx/sy/sz.
const presented={...state,sourceRestView:{seatId:seat.id,mode:'seated',progress:1,degradation:.3,
  look:{...seat.view},musicTime:400,audibleSeconds:400,musicSignal:0}};
const canonical=sourceContinuationRenderFrame(presented,{reducedMotion:true,flashMode:'off'}).canonicalProps;
const supportId=continuationSupportAt(seat.x,seat.z,state).id,doorId=sourceRestReturnConfig(seat).doorId;
const physical=canonical.filter(p=>p.descriptorId===supportId||p.id==='source-continuation-prop-source-rest-iii'||p.doorId===doorId);
const physicalIds=new Set(physical.map(p=>p.id));
const dressing=canonical.filter(p=>p.restPlace&&p.region==='catch'&&!p.portalDestination&&!p.restReturnMouth&&!physicalIds.has(p.id));
const input=[...physical,...dressing];
const cue=(progress,more={})=>({...sourceRestCouperinAffliction({active:true,progress,currentTime:400,playedSeconds:400}),embodied:true,bodyProgress:1,...more});
const apply=(progress,options={})=>applySourceRestDestruction(input,{cue:cue(progress),time:400,seat,canLeave:false,...options});

test('the real Couperin cue gives the selected Catch seat connected clothing and anatomical hands without invented mistakes',()=>{
  const r=apply(.3),models=sourceRestDestructionGeometryLibrary();
  assert.equal(r.body.length,12);assert.equal(r.diagnostics.source,'couperin');assert.equal(r.diagnostics.pain,0);
  assert.equal(r.diagnostics.mistakeCount,0);assert.equal(r.diagnostics.syntheticMistakeAudio,false);
  for(const p of r.body){
    assert.equal(p.region,'catch');assert.equal(p.chartId,seat.chartId);assert.equal(p.restAfflictionSource,'couperin');
    assert.ok(models[p.mesh.replace('source-continuation-','')]||['rest_hand_left','rest_hand_right'].includes(p.mesh));assert.ok(Array.from(p.matrix).every(Number.isFinite));
    assert.ok(Math.hypot(p.x-seat.x,p.z-seat.z)<1,'body must be at the actual selected seat');
    assert.ok(p.y>=seat.feet-.02&&p.y<seat.feet+sourceRestEyeHeight(seat));assert.equal(p.structural,false);
  }
});

test('late bodily weakness loosens the grip while keeping the hand supported, with no wrong-note recoil',()=>{
  const before=apply(.3),later=apply(.84),hand=r=>r.body.find(p=>p.id.endsWith('hand-left'));
  assert.ok(hand(later).character.morphs.slack>hand(before).character.morphs.slack+.3,'the fingers release rather than the wrist sinking through the thigh');
  assert.ok(Math.abs(hand(later).y-hand(before).y)<.016,'the thigh continues carrying the hand');
  assert.equal(later.diagnostics.pain,0);assert.equal(later.debris.length,0);
  const available=apply(.84,{canLeave:true});
  assert.ok(Math.abs(hand(available).y-hand(before).y)<.003,'ordinary departure keeps the body usable before commitment');
  const lowering=apply(.3,{cue:cue(.3,{bodyProgress:.4})});assert.ok(hand(lowering).y>hand(before).y);
  const standing=apply(.9,{cue:cue(.9,{embodied:false,bodyProgress:0})});assert.equal(standing.body.length,0);
});

test('usable shelter is exactly preserved whenever the actual authored exit remains available',()=>{
  for(const progress of[.3,.7,.94]){
    const r=apply(progress,{canLeave:true});
    assert.equal(r.props.length,input.length);assert.equal(r.debris.length,0);assert.equal(r.diagnostics.detachedStructures,0);
    input.forEach((p,k)=>assert.equal(r.props[k],p));
    assert.equal(r.diagnostics.physicalCollisionChanged,false);
  }
});

test('late commitment releases only three actual timber lid members and preserves case, manuals, bench, door and support',()=>{
  const before=structuredClone(input),early=apply(.6),late=apply(.94),byId=new Map(late.props.map(p=>[p.id,p]));
  assert.equal(new Set(input.map(p=>p.id)).size,input.length,'one coherent canonical frame never mixes a seat with its separately clipped copy');
  assert.ok(input.every(p=>p.matrix?.length===16&&Array.from(p.matrix).every(Number.isFinite)));
  assert.equal(input.filter(p=>p.restHarpsichordWear).length,3);
  assert.equal(early.diagnostics.detachedStructures,0);assert.equal(late.diagnostics.detachedStructures,3);
  assert.equal(late.props.length,input.length);assert.equal(late.debris.length,0);assert.equal(late.body.length,12);
  assert.ok(physical.some(p=>p.physicalKind==='surface'),'test includes the actual physical crescent');
  assert.ok(physical.some(p=>p.role==='rest-seat'));assert.ok(physical.some(p=>p.doorId===doorId));
  assert.ok(input.some(p=>p.restHarpsichordPart==='case'));assert.ok(input.some(p=>p.restHarpsichordPart==='manual-bed'));
  for(const p of input){
    const q=byId.get(p.id);
    if(q.restDetached){
      assert.equal(p.restHarpsichordWear,true);assert.equal(p.restHarpsichordPart,'lid');
      assert.ok(p.restHarpsichordCenter?.every(Number.isFinite),'rotation has the real panel centre');
      assert.equal(q.mesh,p.mesh);assert.equal(q.region,'catch');assert.ok(q.releaseProgress>=.70&&q.releaseProgress<.76);
      assert.notDeepEqual(q.matrix,p.matrix);assert.equal(q.restAfflictionSource,'couperin');
    }else assert.equal(q,p);
  }
  assert.equal(late.diagnostics.physicalCollisionChanged,false);assert.deepEqual(input,before);
  assert.equal(sourceRestReturnRoom(late.props,seat).filter(p=>p.restDetached).length,3,'returned case shares the same missing timber lid');
});

test('media holds are deterministic and a held narrative cannot accumulate an independent collapse clock',()=>{
  assert.deepEqual(apply(.81),apply(.81));
  const a=apply(.81,{cue:cue(.81,{time:400,unwrappedTime:400})}),b=apply(.81,{cue:cue(.81,{time:480,unwrappedTime:480})});
  assert.deepEqual(a.props,b.props,'no hidden wall-clock or synthetic note-event advances structural wear');
});

test('reduced motion keeps the same visibly missing members without animated flight or body oscillation',()=>{
  const a=apply(.94,{reducedMotion:true}),b=apply(.94,{reducedMotion:true,cue:cue(.94,{time:480,unwrappedTime:480})});
  assert.equal(a.diagnostics.detachedStructures,3);assert.ok(a.props.filter(p=>p.restDetached).every(p=>p.fractureState==='detached'));
  assert.deepEqual(a.props,b.props);assert.deepEqual(a.body,b.body);
});

test('inactive ownership is a no-op and the Chaconne annotation report cannot be acquired by the Catch',()=>{
  const off=apply(.9,{cue:sourceRestCouperinAffliction({active:false,progress:.9})});
  assert.equal(off.props,input);assert.equal(off.body.length,0);assert.equal(off.diagnostics.active,false);
  const wrong=apply(.9,{cue:sourceRestAfflictionFrame({active:true,currentTime:468,playedSeconds:468,progress:.9})});
  assert.equal(wrong.props,input);assert.equal(wrong.body.length,0);assert.equal(wrong.debris.length,0);
});
