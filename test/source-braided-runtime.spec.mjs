import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceSpaceRuntime, sourceMatrix } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { SOURCE_BRAIDED_REVIEW_WALK, sourceDividePropPlacements, sourceDivideGeometry } from '../src/data/source-braided-divide.js';
import { dividePieceBounds, divideMeshName } from '../src/render/source-divide-meshes.js';
import { propInstanceVisible } from '../src/render/props3d.js';

function field() {
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417,injuries:0,hasRig:false});
  const runtime=createSourceSpaceRuntime({initialState:built.state});
  const o=built.state.landscapeOrigin;
  let position={x:o.x+8,y:o.y-798,facing:0};
  runtime.setPlayerPosition(position);
  const walk=(x,z)=>{
    const target={x:o.x+x/.5,y:o.y+z/.5,facing:0};
    const distance=Math.hypot(target.x-position.x,target.y-position.y),steps=Math.max(1,Math.ceil(distance/.2));
    const start={...position};
    for(let n=1;n<=steps;n++){
      const next={x:start.x+(target.x-start.x)*n/steps,y:start.y+(target.y-start.y)*n/steps,facing:0};
      const step=runtime.geometry.canStep(position.x,position.y,next.x,next.y);
      assert.ok(step.ok,JSON.stringify({from:position,next,step,divide:runtime.probe().divide}));
      runtime.onStep(position,next);position=next;runtime.tick(1/48,{px:next.x,py:next.y,facing:0});
    }
    return runtime.geometry.renderedFloorAt();
  };
  return {runtime,o,walk,position:()=>position};
}

test('production geometry walks the selected braid above and below the same native model',()=>{
  const {runtime,walk}=field();
  assert.equal(runtime.sourceVoidFrame().windowIntrusionReady,false,'warning panes cannot mask the arrival reveal');
  const heights=new Map();
  for(const point of SOURCE_BRAIDED_REVIEW_WALK){
    const floor=walk(point.x,point.z);heights.set(point.id,floor);
    assert.ok(Math.abs(floor-point.floor)<.12,`${point.id}: ${floor} vs ${point.floor}`);
  }
  assert.ok(heights.get('case-over')-heights.get('case-under')>4.5);
  assert.equal(runtime.state().sourceContacts.talks,0,'exploration does not force dialogue');
});

test('disk intrusion belongs to the listening court and the arrival remains clear',()=>{
  const {runtime,o}=field();
  assert.equal(runtime.sourceVoidFrame().windowIntrusionReady,false);
  runtime.setPlayerPosition({x:o.x-24,y:o.y-922,facing:0});
  assert.equal(runtime.sourceVoidFrame().windowIntrusionReady,true);
  runtime.setPlayerPosition({x:o.x,y:o.y-800,facing:0});
  assert.equal(runtime.sourceVoidFrame().windowIntrusionReady,false);
});

test('native model transforms include every authored axis and Source masonry retains finite bounds',()=>{
  const {runtime,o}=field();
  const props=runtime.propInstances(o.x,o.y-930);
  for(const placement of sourceDividePropPlacements()){
    const instance=props.find(p=>p.sourceStructure===placement.id);
    assert.ok(instance,placement.id);
    const expected=sourceMatrix({x:placement.x+o.x*.5,y:placement.y,z:placement.z+o.y*.5,
      scaleX:placement.scaleX??placement.scale,scaleY:placement.scaleY??placement.scale,scaleZ:placement.scaleZ??placement.scale,
      yaw:placement.yaw,pitch:placement.pitch,roll:placement.roll});
    for(let i=0;i<16;i++)assert.ok(Math.abs(instance.matrix[i]-expected[i])<.0001,`${placement.id} matrix[${i}]`);
  }
  for(const piece of sourceDivideGeometry()){
    const {center,radius}=dividePieceBounds(piece);
    assert.ok(center.every(Number.isFinite)&&radius>0,piece.id);
    assert.ok(propInstanceVisible({mesh:divideMeshName(piece.id),matrix:sourceMatrix({x:center[0],y:center[1],z:center[2]}),cullRadius:radius},[piece.p[0],0,piece.p[2]],1),piece.id);
  }
});

test('dropping from a crossing costs elevation and retains that body height through reload',()=>{
  const {runtime,walk,position}=field();
  for(const point of SOURCE_BRAIDED_REVIEW_WALK){walk(point.x,point.z);if(point.id==='case-over')break;}
  walk(0,-445);
  const p=position();
  assert.ok(runtime.state().sourceDivide.falling);
  const saved=runtime.state(),feet=saved.sourceDivide.feet;
  assert.ok(feet>4.2&&feet<9);
  const restored=createSourceSpaceRuntime({initialState:saved});restored.setPlayerPosition(p);
  assert.equal(restored.geometry.renderedFloorAt(),feet);
  for(let n=0;n<100;n++)restored.tick(.02,{px:p.x,py:p.y,facing:0});
  assert.equal(restored.geometry.renderedFloorAt(),4.2);
  assert.equal(restored.state().sourceDivide.falling,false);
});
