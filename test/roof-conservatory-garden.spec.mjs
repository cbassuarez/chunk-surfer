import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoofGardenFlora} from '../tools/chunk_surfer/roof-garden-flora.mjs';
import {buildRoofConservatoryGarden,ROOF_CONSERVATORY_GARDEN_CONTRACT as contract,
  ROOF_CONSERVATORY_GARDEN_PLACEMENTS as placements,
} from '../tools/chunk_surfer/roof-conservatory-garden.mjs';

function capture({withExistingGarden=false}={}){
  const m={name:contract.owner},materials=[],shapes=[];
  if(withExistingGarden){
    const original=buildRoofGardenFlora({m,materials,addQuad(){},addBeam(){},addCylinder(){}});
    assert.equal(original.triangles,7844,'the earlier garden layer is unchanged');
  }
  const stats=buildRoofConservatoryGarden({m,materials,
    addQuad(owner,...args){assert.equal(owner,m);shapes.push({kind:'quad',args});},
    addBeam(owner,...args){assert.equal(owner,m);shapes.push({kind:'beam',args});},
  });
  return{m,materials,shapes,stats};
}
const result=capture();
const shapePoints=shape=>{
  if(shape.kind==='quad')return shape.args.slice(0,4);
  const[a,b,width]=shape.args,points=[];
  for(const p of[a,b])for(const dx of[-width/Math.SQRT2,width/Math.SQRT2])
    for(const dy of[-width/Math.SQRT2,width/Math.SQRT2])for(const dz of[-width/Math.SQRT2,width/Math.SQRT2])
      points.push([p[0]+dx,p[1]+dy,p[2]+dz]);
  return points;
};

test('cultivated growth follows three unequal existing arch shoulders and the four old urns',()=>{
  const arches=placements.filter(p=>p.kind==='arch');
  assert.equal(arches.length,3);
  assert.deepEqual(arches.map(p=>[p.x,p.fromZ,p.toZ]),[[-11.5,-9,-3],[11.5,-3,3],[-11.5,3,9]]);
  assert.equal(new Set(arches.map(p=>p.interval.join(','))).size,3,'the two sides do not receive identical plant curtains');
  assert.ok(arches.every(p=>p.interval[1]-p.interval[0]<.80),'no bay is covered end to end');
  assert.deepEqual(placements.filter(p=>p.kind==='urn').map(p=>[p.x,p.z]),
    [[-11.5,12.95],[11.5,12.95],[-11.5,7.5],[11.5,7.5]]);
  assert.equal(placements.filter(p=>p.kind==='colony').length,2,'lower growth is composed into two anchors, not scattered across the promenade');
  assert.equal(new Set(placements.map(p=>p.id)).size,9);
});

test('actual surfaces preserve the original envelope and all eye-level route openings',()=>{
  let overhead=0,minimumOverhead=Infinity;
  for(const shape of result.shapes)for(const[x,y,z]of shapePoints(shape)){
    assert.ok([x,y,z].every(Number.isFinite));
    assert.ok(x>=contract.bounds.x0&&x<=contract.bounds.x1,`x=${x} remains on the roof`);
    assert.ok(z>=contract.bounds.z0&&z<=contract.bounds.z1,`z=${z} remains on the roof`);
    if(Math.abs(x)<contract.sideBoundaryMinAbsX&&z<contract.southBoundaryMinZ){
      overhead++;minimumOverhead=Math.min(minimumOverhead,y);
      assert.ok(y>=contract.overheadMinimumY,`growth ${x},${y},${z} cannot screen a walking route or seated view`);
    }
    assert.ok(z>-10,'the north bridge and open skyline threshold remain clear');
    assert.ok(y>=.27&&y<4.34,'rooted lower leaves and growth below the old cornice avoid new skyline height');
  }
  assert.ok(overhead>4000,'test exercises actual hanging flower surfaces outside the collision strips');
  assert.ok(minimumOverhead>2.88,'the lowest overhanging flower keeps a clear headroom margin');
});

test('the new layer reuses the existing opaque vegetation palette without a shader or mesh owner',()=>{
  const integrated=capture({withExistingGarden:true});
  assert.equal(integrated.materials.length,8);
  assert.equal(integrated.stats.newMaterials,0);
  assert.equal(integrated.stats.newMeshes,0);
  assert.equal(integrated.stats.owner,'academic_roof_structure');
  for(const material of integrated.materials){
    assert.equal(material.alphaMode,'OPAQUE');
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],1);
    assert.equal(material.pbrMetallicRoughness.baseColorTexture,undefined);
    assert.equal(material.emissiveFactor,undefined);
    assert.ok(['leaf','stem','soil'].includes(material.extras.vegetationClass));
  }
});

test('broad silhouettes and three-dimensional flower cups stay below the added geometry budget',()=>{
  assert.equal(result.stats.triangles,8420);
  assert.equal(result.stats.quads,3760);
  assert.equal(result.stats.beams,75);
  assert.equal(result.stats.leaves,277);
  assert.equal(result.stats.racemes,27);
  assert.equal(result.stats.flowerBells,552);
  assert.ok(result.stats.triangles<=contract.maximumAddedTriangles);
  assert.equal(result.shapes.reduce((sum,s)=>sum+(s.kind==='quad'?2:12),0),result.stats.triangles);
  for(const p of result.stats.placements.filter(p=>p.kind==='urn')){
    assert.ok(p.bounds.max[2]-p.bounds.min[2]>.75,'settled foliage fills a broad crown at ordinary walking distance');
    assert.ok(p.bounds.max[1]-p.bounds.min[1]>.54,'the crown has vertical volume rather than an edge-on ring');
    assert.ok(p.bounds.max[1]<2.12,'existing flowers can remain visible above the new settled foliage');
  }
  for(const{kind,args}of result.shapes.filter(s=>s.kind==='quad')){
    const[a,b,c]=args,ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert.ok(Math.hypot(...normal)>1e-11,'flower cup panels and folded leaves have real nondegenerate surfaces');
  }
});

test('authored form, placements and returned per-colony audit are deterministic',()=>{
  assert.deepEqual(capture(),result);
  assert.equal(result.stats.placements.length,placements.length);
  assert.equal(result.stats.placements.reduce((sum,p)=>sum+p.triangles,0),result.stats.triangles);
  assert.ok(result.stats.placements.every(p=>p.triangles>0&&p.bounds.min.every(Number.isFinite)&&p.bounds.max.every(Number.isFinite)));
});
