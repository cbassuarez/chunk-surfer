import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWER_PERSONAL_STAGE_IDS, towerPersonalWorld, towerPersonalSupportAt } from '../src/data/tower-personal-journey.js';
import { towerPersonalGeometry } from '../src/render/tower-personal-meshes.js';
import { towerPersonalWorldPieces, towerPersonalWorldLights, towerPersonalPerformance,
  towerPersonalHandoverPieces, towerPersonalBoundarySegments } from '../src/render/tower-personal-worlds.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

function blocks(piece,x,z,radius=.24){
  if(!piece.solid)return false;
  const b=piece.bounds,c=Math.cos(piece.yaw),s=Math.sin(piece.yaw),dx=x-piece.localX,dz=z-piece.localZ;
  const lx=dx*c-dz*s,lz=dx*s+dz*c;
  return lx>=b.min[0]*piece.scaleX-radius&&lx<=b.max[0]*piece.scaleX+radius
    &&lz>=b.min[2]*piece.scaleZ-radius&&lz<=b.max[2]*piece.scaleZ+radius;
}

test('every circuit layout has finite metre-space pieces, grounded solids and corresponding practical lights',()=>{
  const meshes=new Set(towerPersonalGeometry().map(piece=>piece.name));
  for(const stage of TOWER_PERSONAL_STAGE_IDS){
    const pieces=towerPersonalWorldPieces(stage),ids=new Set();
    assert.ok(Object.isFrozen(pieces));
    for(const piece of pieces){
      assert.equal(ids.has(piece.id),false,`${stage}: duplicate ${piece.id}`);ids.add(piece.id);
      assert.ok(meshes.has(piece.mesh)||PROP_BOUNDS[piece.mesh]||piece.mesh==='radio_carrier_led'||['recordist_boy','recordist_contractor'].includes(piece.mesh),piece.mesh);
      for(const key of['localX','localZ','height','yaw','pitch','scaleX','scaleY','scaleZ'])assert.ok(Number.isFinite(piece[key]),`${piece.id}/${key}`);
      if(piece.solid){assert.ok(piece.bounds);assert.ok(piece.bounds.min.every(Number.isFinite));assert.ok(piece.bounds.max.every(Number.isFinite));}
    }
    for(const light of towerPersonalWorldLights(stage)){
      assert.ok([light.x,light.z,light.height,light.intensity,light.radius].every(Number.isFinite));
      if(!light.permanent)assert.ok(ids.has(light.id),`${stage}: practical ${light.id} has no physical fitting`);
    }
  }
});

test('the return reuses the exact hall, chair banks, roof breaks, lamps and loose lead',()=>{
  const ordinary=towerPersonalWorldPieces('school-hall').filter(piece=>!piece.permanent&&piece.id!=='land-boy');
  const returned=towerPersonalWorldPieces('return-hall').filter(piece=>!piece.permanent);
  assert.deepEqual(returned,ordinary);
  assert.equal(towerPersonalWorldPieces('return-hall').some(piece=>piece.figure),false,'static returning actors duplicate the handover');
});

test('all primary and rejoining routes remain supported and clear of physical dressing',()=>{
  for(const stage of TOWER_PERSONAL_STAGE_IDS){
    const world=towerPersonalWorld(stage),pieces=towerPersonalWorldPieces(stage);
    for(const route of[world.route,...(world.loops||[])])for(let i=1;i<route.length;i++){
      const[a,b]=[route[i-1],route[i]],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.2);
      for(let k=0;k<=count;k++){
        const x=a[0]+(b[0]-a[0])*k/count,z=a[1]+(b[1]-a[1])*k/count;
        assert.ok(towerPersonalSupportAt(x,z,.24,stage),`${stage}: unsupported route ${x},${z}`);
        for(const piece of pieces)assert.equal(blocks(piece,x,z),false,`${stage}: ${piece.id} blocks ${x},${z}`);
      }
    }
  }
});

test('ordinary portal frames and opened leaves leave the same physical aperture clear from either side',()=>{
  for(const stage of TOWER_PERSONAL_STAGE_IDS)for(const door of towerPersonalWorld(stage).doors){
    const pieces=towerPersonalWorldPieces(stage);
    for(const lateral of[-1,0,1])for(let step=-1.5;step<=1.5;step+=.1){
      const x=door.center.x+lateral,z=door.center.z+step;
      for(const piece of pieces)assert.equal(blocks(piece,x,z),false,`${stage}/${door.id}: ${piece.id} blocks its aperture`);
    }
  }
});

test('low accumulated-ground banks occur only on exterior support boundaries and leave route joins open',()=>{
  for(const stage of['tape-field','dead-broadcast']){
    const segments=towerPersonalBoundarySegments(stage),pieces=towerPersonalWorldPieces(stage);
    assert.ok(segments.length>0);
    for(const segment of segments)for(const t of[.25,.5,.75]){
      const along=segment.start+(segment.end-segment.start)*t;
      const point=(offset)=>[segment.axis==='x'?segment.coordinate+offset:along,
        segment.axis==='z'?segment.coordinate+offset:along];
      const inside=point(-segment.normal*.01),outside=point(segment.normal*.01);
      assert.ok(towerPersonalSupportAt(...inside,0,stage),'a bank faces away from supported ground');
      assert.equal(towerPersonalSupportAt(...outside,0,stage),null,'bank seals an internal connection');
    }
    for(const piece of pieces.filter(piece=>piece.boundary)){
      assert.ok(piece.bounds.max[1]*piece.scaleY<1.1,'a boundary blocks the landscape vista');
      const s=piece.boundary,along=(s.start+s.end)/2;
      const x=s.axis==='x'?s.coordinate-s.normal*.10:along,z=s.axis==='z'?s.coordinate-s.normal*.10:along;
      assert.equal(blocks(piece,x,z),true,'the visible steep bank does not explain the body boundary');
    }
  }
});

test('the handover has one machine, four articulated hands and a coherent collapse group throughout',()=>{
  for(let i=0;i<=40;i++){
    const progress=i/40,pose=towerPersonalPerformance(progress),pieces=towerPersonalHandoverPieces(progress);
    assert.equal(pieces.filter(piece=>piece.mesh==='tower_personal_recorder').length,1);
    assert.equal(pieces.filter(piece=>piece.character).length,2);
    assert.equal(pose.arms.length,4);
    assert.ok(pieces.filter(piece=>piece.character).every(piece=>piece.character.time===progress*4));
    assert.ok(pieces.every(piece=>piece.collapseGroup==='land-handover'));
    for(const arm of pose.arms){
      assert.ok(arm.reachError<1e-8&&arm.legError<1e-8);
      assert.ok(Math.abs(Math.hypot(...arm.elbow.map((v,j)=>v-arm.shoulder[j]))-arm.upperLength)<1e-8);
      assert.ok(Math.abs(Math.hypot(...arm.wrist.map((v,j)=>v-arm.elbow[j]))-arm.foreLength)<1e-8,'arm stretches rather than bending');
    }
  }
  const held=towerPersonalPerformance(.5);
  for(const arm of held.arms){
    assert.equal(arm.grip,true);
    assert.ok(Math.abs(arm.wrist[1]-(held.machine[1]-.008))<1e-9,'hands float above the machine weight');
  }
  const settled=towerPersonalPerformance(1);
  assert.ok(settled.arms.filter(arm=>arm.actor==='contractor').every(arm=>!arm.grip));
  assert.ok(settled.arms.filter(arm=>arm.actor==='boy').every(arm=>arm.grip));
});

test('reduced motion retains the same readable transfer without an extra machine rock',()=>{
  const p=.8,normal=towerPersonalHandoverPieces(p),reduced=towerPersonalHandoverPieces(p,{reducedMotion:true});
  for(let i=0;i<normal.length;i++){
    assert.equal(normal[i].id,reduced[i].id);
    assert.equal(normal[i].localX,reduced[i].localX);assert.equal(normal[i].localZ,reduced[i].localZ);assert.equal(normal[i].height,reduced[i].height);
  }
  assert.equal(reduced.find(piece=>piece.mesh==='tower_personal_recorder').pitch,0);
});
