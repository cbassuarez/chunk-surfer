import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS,sourceRestEyePosition} from '../src/game/source-rest-seat.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {sourceContinuationRenderFrame,sourceContinuationPresentation,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {sourceContinuationVoidViews,sourceContinuationVoidInstance} from '../src/render/source-continuation-void.js';
import {portalClipPlanes,portalMultiply,portalTransformPoint} from '../src/render/source-mesh-portals.js';

const fixture=(seat=SOURCE_REST_SEATS[0],degradation=0,{time=0,damage=false,mode='seated',look=seat.view}={})=>{
  const state={...freshSourceContinuation({runId:'freed-code-render-contract'}),...seat.approach,
    status:'active',phase:seat.phase,chartId:seat.chartId,level:seat.level,feet:seat.feet};
  state.hush.active=false;
  state.sourceRestView={seatId:seat.id,progress:1,look:{...look},mode,degradation,musicTime:time,audibleSeconds:time,
    ...(damage?{affliction:{...sourceRestAfflictionFrame({active:true,currentTime:time,playedSeconds:time,progress:degradation}),embodied:true,bodyProgress:1,canLeave:true}}:{})};
  return state;
};
const render=(state,options={})=>sourceContinuationRenderFrame(state,{reducedMotion:true,flashMode:'off',...options});
const canonical=frame=>frame.sourceCodeInstances.filter(p=>!p.portalDestination);
const close=(a,b,epsilon=3e-4)=>{
  assert.equal(a.length,b.length);
  a.forEach((value,k)=>assert.ok(Math.abs(value-b[k])<=epsilon,`${value} != ${b[k]} at ${k}`));
};
const samePlanes=(a,b)=>a?.length===b?.length&&a.every((plane,i)=>plane.every((v,k)=>Math.abs(v-b[i][k])<3e-4));

test('ordinary Source and live door motion create no freed code or synthetic clauses',()=>{
  const state={...freshSourceContinuation(),status:'active'};
  for(const current of [state,{...state,doorOpen:{'wrong-entry-return':true}}]){
    const frame=render(current);
    assert.deepEqual(frame.sourceCodeInstances,[]);
    assert.equal(frame.freedMemory.canonicalRetained,0);
    assert.ok(frame.props.every(p=>!p.sourceCodeOnly&&!p.sourceCodeDetached));
  }
});

test('both Sources retain exact original surface transforms while physical stock continues its recession',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const intact=render(fixture(seat)),lateState=fixture(seat,.82),copy=structuredClone(lateState),late=render(lateState),
      original=new Map(intact.canonicalProps.map(p=>[p.id,p])),live=new Map(late.canonicalProps.map(p=>[p.id,p]));
    const surfaces=canonical(late).filter(p=>p.physicalKind==='surface'&&original.has(p.sourceCodeMemory.ownerId));
    assert.ok(surfaces.length>=8,seat.id);
    for(const memory of surfaces){
      const owner=memory.sourceCodeMemory.ownerId,before=original.get(owner),after=live.get(owner);
      close(Array.from(memory.matrix),Array.from(before.matrix));
      close([memory.x,memory.y,memory.z],[memory.matrix[12],memory.matrix[13],memory.matrix[14]]);
      assert.ok(after.y<before.y-1,'actual stock must keep moving rather than being replaced by its memory');
      assert.equal(after.sourceCodeDetached,true,'the moving stock must not carry a second glyph copy');
      assert.equal(memory.mesh,before.mesh);
      assert.equal(memory.sourceCodeOnly,true);assert.equal(memory.structural,false);
      assert.equal(memory.noShadow,true);assert.equal(memory.noReflection,true);
      assert.equal(memory.horizonTide,undefined);
    }
    assert.deepEqual(late.geometry,intact.geometry,'the controller support, solids and doors are unchanged');
    assert.ok(late.props.every(p=>!p.sourceCodeOnly));assert.ok(late.canonicalProps.every(p=>!p.sourceCodeOnly));
    assert.equal(late.counts.props,late.props.length);
    assert.ok(late.counts.props<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances,'code has its own budget, never a physical aperture slot');
    assert.deepEqual(lateState,copy,'rendering must not mutate the checkpoint');
  }
});

test('a consumed printed carrier leaves its original code even when the physical owner is absent',()=>{
  const seat=SOURCE_REST_SEATS[0],before=render(fixture(seat)),late=render(fixture(seat,0,{time:467,damage:true})),
    originals=new Map(before.canonicalProps.map(p=>[p.id,p])),live=new Set(late.canonicalProps.map(p=>p.id));
  assert.ok(late.destruction.horizonConsumed>0);
  const removed=canonical(late).filter(p=>!live.has(p.sourceCodeMemory.ownerId)&&originals.has(p.sourceCodeMemory.ownerId));
  assert.ok(removed.length>0,'a vanished owner must not cull its code');
  for(const memory of removed){
    close(Array.from(memory.matrix),Array.from(originals.get(memory.sourceCodeMemory.ownerId).matrix));
    assert.equal(memory.horizonTide,undefined);assert.equal(memory.character,undefined);
  }
  const later=canonical(render(fixture(seat,0,{time:490,damage:true}))),byOwner=new Map(later.map(p=>[p.sourceCodeMemory.ownerId,p]));
  for(const memory of removed)close(Array.from(byOwner.get(memory.sourceCodeMemory.ownerId).matrix),Array.from(memory.matrix));
});

test('late seeking and a new scene do not reuse a previous visible pose or retain old code',()=>{
  const state=fixture(SOURCE_REST_SEATS[0],.82),cold=render(state);
  for(const progress of [.1,.43,.61,.78])render(fixture(SOURCE_REST_SEATS[0],progress));
  const warm=render(state);
  assert.deepEqual(warm.sourceCodeInstances,cold.sourceCodeInstances);
  assert.deepEqual(render({...freshSourceContinuation({runId:'independent-new-run'}),status:'active'}).sourceCodeInstances,[]);
  assert.deepEqual(render(state).sourceCodeInstances,cold.sourceCodeInstances);
});

test('the same anchor and rigid Catch study transform apply to physical stock and freed code once',()=>{
  const seat=SOURCE_REST_SEATS[1],state=fixture(seat,.82),base=render(state),anchor={x:23,y:11,z:-17},angle=.63,
    moved=render(state,{anchor,studyRotation:angle}),byId=new Map(moved.sourceCodeInstances.map(p=>[p.id,p]));
  const c=Math.cos(angle),s=Math.sin(angle),cx=C.catch.center.x+anchor.x,cz=C.catch.center.z+anchor.z,
    rigid=[c,0,s,0,0,1,0,0,-s,0,c,0,cx-c*cx+s*cz,0,cz-s*cx-c*cz,1],translation=[1,0,0,0,0,1,0,0,0,0,1,0,anchor.x,anchor.y,anchor.z,1];
  assert.ok(canonical(base).length>0);
  for(const memory of canonical(base)){
    const current=byId.get(memory.id),expected=portalMultiply(rigid,portalMultiply(translation,memory.matrix));
    assert.ok(current);close(Array.from(current.matrix),Array.from(expected));
    close([current.x,current.y,current.z],portalTransformPoint(rigid,[memory.x+anchor.x,memory.y+anchor.y,memory.z+anchor.z]));
  }
});

test('current void and Return apertures clip glyph-only images without consuming physical slots',()=>{
  const seat=SOURCE_REST_SEATS[0],state=fixture(seat,.82),frame=render(state),natives=new Map(canonical(frame).map(p=>[p.id,p])),
    presentation=sourceContinuationPresentation(state,{eye:sourceRestEyePosition(seat),yaw:seat.view.yaw,pitch:seat.view.pitch,restOverride:true}),
    views=sourceContinuationVoidViews(state,presentation),byView=new Map([...views.lower,...views.upper].map(v=>[v.id,v]));
  const images=frame.sourceCodeInstances.filter(p=>p.voidImage);assert.ok(images.length>0);
  for(const image of images){
    const view=byView.get(image.portalClipId),native=natives.get(image.id.split(':through:')[0]);
    assert.ok(view&&native,'each code image needs a current real aperture and canonical owner');
    const expected=sourceContinuationVoidInstance(native,view);
    close(Array.from(image.matrix),Array.from(expected.matrix));
    assert.ok(samePlanes(image.portalClipPlanes,expected.portalClipPlanes));
    assert.equal(image.horizonTide,undefined);
  }
  assert.equal(frame.restReturn.projected,true);
  const planes=portalClipPlanes(frame.restReturn.sourceAperture,frame.eye);
  assert.ok(canonical(frame).every(p=>p.portalExcludePlanes.some(group=>samePlanes(group,planes))),'the open Return removes foreground code from its exact aperture');
  const closed=render(fixture(seat,.82,{mode:'standing'}));
  assert.equal(closed.restReturn.active,false);
  assert.ok(closed.sourceCodeInstances.every(p=>!p.restReturnDestination));
  assert.ok(canonical(closed).every(p=>!p.portalExcludePlanes?.some(group=>samePlanes(group,planes))),'a closed Return cannot retain a stale code mask');
});
