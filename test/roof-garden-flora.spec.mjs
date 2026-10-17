import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildRoofGardenFlora,ROOF_GARDEN_FLORA_CONTRACT as contract,
  ROOF_GARDEN_FLORA_MATERIALS as palette,ROOF_GARDEN_FLORA_PLACEMENTS as placements,
} from '../tools/chunk_surfer/roof-garden-flora.mjs';

function capture(){
  const m={name:contract.owner},materials=[],shapes=[];
  const stats=buildRoofGardenFlora({m,materials,
    addQuad(owner,...args){assert.equal(owner,m);shapes.push({kind:'quad',args});},
    addBeam(owner,...args){assert.equal(owner,m);shapes.push({kind:'beam',args});},
    addCylinder(owner,...args){assert.equal(owner,m);shapes.push({kind:'cylinder',args});},
  });
  return{m,materials,shapes,stats};
}
const result=capture();
const pointsOf=shape=>{
  if(shape.kind==='quad')return shape.args.slice(0,4);
  if(shape.kind==='beam'){
    const[a,b,width]=shape.args,points=[];
    for(const p of[a,b])for(const dx of[-width/Math.SQRT2,width/Math.SQRT2])
      for(const dy of[-width/Math.SQRT2,width/Math.SQRT2])for(const dz of[-width/Math.SQRT2,width/Math.SQRT2])
        points.push([p[0]+dx,p[1]+dy,p[2]+dz]);
    return points;
  }
  const[c,r,h,,sides]=shape.args,points=[];
  for(const y of[-h/2,h/2])for(let i=0;i<sides;i++)
    points.push([c[0]+Math.cos(i/sides*Math.PI*2)*r,c[1]+y,c[2]+Math.sin(i/sides*Math.PI*2)*r]);
  return points;
};

test('the roof garden has four existing urn fills and sparse perimeter colonies',()=>{
  assert.deepEqual(placements.filter(p=>p.kind==='urn').map(p=>[p.x,p.y,p.z]),
    [[-11.5,1.28,12.95],[11.5,1.28,12.95],[-11.5,1.28,7.5],[11.5,1.28,7.5]]);
  assert.equal(placements.filter(p=>p.kind==='fern').length,10);
  assert.equal(placements.filter(p=>p.kind==='wallflower').length,9);
  assert.equal(placements.filter(p=>p.kind==='grass').length,13);
  assert.equal(placements.filter(p=>p.kind==='ivy').length,4);
  assert.equal(new Set(placements.map(p=>p.id)).size,40);
  assert.equal(result.stats.owner,'academic_roof_structure');
  assert.equal(contract.newMeshCount,0);
});

test('actual foliage geometry stays in the old boundary strips and roof envelope',()=>{
  let points=0;
  for(const shape of result.shapes)for(const[x,y,z]of pointsOf(shape)){
    points++;
    assert.ok([x,y,z].every(Number.isFinite));
    assert.ok(x>=contract.bounds.x0&&x<=contract.bounds.x1,`x=${x} remains on the roof`);
    assert.ok(z>=contract.bounds.z0&&z<=contract.bounds.z1,`z=${z} remains on the roof`);
    assert.ok(Math.abs(x)>=contract.standingSideMinAbsX||z>=contract.standingSouthMinZ||y>=contract.overheadMinY,
      `foliage ${x},${y},${z} cannot enter a walking route below headroom`);
    assert.ok(y>=.32,'plants root into coping and existing urns, never float below the roof');
  }
  assert.ok(points>5000,'test inspects actual vertices and beam envelopes, not only placement centres');
  for(const p of result.stats.placements.filter(p=>p.kind==='urn')){
    assert.ok(p.bounds.max[1]<=contract.maximumUrnCrownY,`${p.id} keeps its low planted crown`);
    assert.ok(p.bounds.max[1]>=contract.urnLipY+.60,'urns contain substantial living silhouettes');
  }
});

test('folded opaque leaves use the existing vegetation response and have a bounded polygon cost',()=>{
  assert.equal(result.materials.length,8);
  for(const material of result.materials){
    assert.equal(material.alphaMode,'OPAQUE');
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],1);
    assert.equal(material.pbrMetallicRoughness.metallicFactor,0);
    assert.equal(material.emissiveFactor,undefined);
    assert.equal(material.pbrMetallicRoughness.baseColorTexture,undefined);
    assert.ok(['leaf','stem','soil'].includes(material.extras.vegetationClass));
    assert.equal(material.extras.roofRole,undefined,'leaves do not inherit opaque roof-zinc ink');
  }
  const triangles=result.shapes.reduce((sum,s)=>sum+(s.kind==='quad'?2:s.kind==='beam'?12:s.args[4]*4),0);
  assert.equal(result.stats.triangles,triangles);
  assert.ok(triangles<=contract.maximumAddedTriangles,`flora costs ${triangles} triangles`);
  assert.equal(result.stats.cylinders,4,'only the four existing urns receive soil fills; no new pots or leaf balls');
  assert.equal(result.stats.beams,28,'woody ivy branches use geometry; soft stems use folded opaque ribbons');
  assert.equal(palette.cream.pbrMetallicRoughness.baseColorFactor[0],.58);
  assert.ok(palette.pink.pbrMetallicRoughness.baseColorFactor[0]>.35);
  assert.ok(palette.ochre.pbrMetallicRoughness.baseColorFactor[1]>.25);
  for(const{kind,args}of result.shapes.filter(s=>s.kind==='quad')){
    const[a,b,c]=args,ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert.ok(Math.hypot(...normal)>1e-10,'shaped leaves, petals and stems have valid real surface normals');
  }
});

test('the flora build is deterministic and returns per-colony bounds for the asset audit',()=>{
  const second=capture();
  assert.deepEqual(second,result);
  assert.equal(result.stats.placements.length,40);
  assert.ok(result.stats.placements.every(p=>p.triangles>0&&p.bounds.min.every(Number.isFinite)&&p.bounds.max.every(Number.isFinite)));
  assert.equal(result.stats.placements.reduce((sum,p)=>sum+p.triangles,0),result.stats.triangles);
});

test('only the four urns gain broad basal crowns and inward trails',()=>{
  assert.equal(result.stats.triangles,7844,'the focused urn revision adds896triangles to the prior6948');
  const urns=result.stats.placements.slice(0,4);
  assert.ok(urns.every(p=>p.kind==='urn'&&p.triangles===692));
  assert.ok(urns.every(p=>p.bounds.min[1]>.89&&p.bounds.min[1]<.91),
    'inward trailing leaves reach down the existing urn bodies');
  let triangles=0,index=0;
  const urnTriangles=urns.reduce((sum,p)=>sum+p.triangles,0);
  while(triangles<urnTriangles){
    const shape=result.shapes[index++];
    triangles+=shape.kind==='quad'?2:shape.kind==='beam'?12:shape.args[4]*4;
  }
  assert.equal(triangles,urnTriangles);
  const unchanged=createHash('sha256').update(JSON.stringify(result.shapes.slice(index))).digest('hex');
  assert.equal(unchanged,'7af0e60a054693c0714eae3e23914d37db0017e3fcc5859a846f4d5b0ba09c27',
    'all2398fern, wallflower, grass and pier-ivy primitives outside the urns stay byte-identical');
});
