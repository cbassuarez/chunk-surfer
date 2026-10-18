import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExteriorForeground,EXTERIOR_FOREGROUND_CONTRACT as contract,
  EXTERIOR_FOREGROUND_OWNER_ORIGINS as origins,EXTERIOR_GARDEN_BEDS as beds,
} from '../tools/chunk_surfer/exterior-foreground-geometry.mjs';
import {YARD_PARK_PROPS} from '../src/data/yard-park.js';
import {EXTERIOR_FOREGROUND} from '../src/data/exterior-foreground.js';

function capture(materials=[]){
  const shapes=[],owners=[];
  const stats=buildExteriorForeground({materials,mesh(name){const m={name};owners.push(m);return m;},
    addBox(owner,...args){shapes.push({kind:'box',owner:owner.name,args});},
    addBeam(owner,...args){shapes.push({kind:'beam',owner:owner.name,args});},
    addCylinder(owner,...args){shapes.push({kind:'cylinder',owner:owner.name,args});},
    addQuad(owner,...args){shapes.push({kind:'quad',owner:owner.name,args});},
  });
  return{materials,owners,shapes,stats};
}
function localPoints(shape){
  const {args,kind}=shape;
  if(kind==='quad')return args.slice(0,4);
  if(kind==='box'){
    const[c,s]=args,points=[];
    for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])points.push([c[0]+x*s[0]/2,c[1]+y*s[1]/2,c[2]+z*s[2]/2]);
    return points;
  }
  if(kind==='beam'){
    const[a,b,w]=args,points=[];
    for(const p of[a,b])for(const x of[-w/Math.SQRT2,w/Math.SQRT2])
      for(const y of[-w/Math.SQRT2,w/Math.SQRT2])for(const z of[-w/Math.SQRT2,w/Math.SQRT2])points.push([p[0]+x,p[1]+y,p[2]+z]);
    return points;
  }
  const[c,r,h,,sides]=args,points=[];
  for(let i=0;i<sides;i++)for(const y of[-h/2,h/2])points.push([c[0]+Math.cos(i/sides*Math.PI*2)*r,c[1]+y,c[2]+Math.sin(i/sides*Math.PI*2)*r]);
  return points;
}
const worldPoints=shape=>localPoints(shape).map(([x,y,z])=>[x+origins[shape.owner].x,y,z+origins[shape.owner].z]);
const footprint=points=>({x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),z0:Math.min(...points.map(p=>p[2])),z1:Math.max(...points.map(p=>p[2]))});
const intersects=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.z0<b.z1&&a.z1>b.z0;
const within=(p,b)=>p[0]>=b.x0-1e-8&&p[0]<=b.x1+1e-8&&p[2]>=b.z0-1e-8&&p[2]<=b.z1+1e-8;
const result=capture();

test('actual built foreground preserves the shared fountain apron, three-metre spines and arrival path',()=>{
  let vertices=0;
  for(const shape of result.shapes){
    const points=worldPoints(shape),box=footprint(points),arrival=shape.owner==='exterior_arrival_planting';
    assert.ok(points.every(p=>p.every(Number.isFinite)));
    assert.ok(points.every(p=>within(p,arrival?contract.arrivalBounds:contract.gardenBounds)),shape.owner);
    if(!arrival){
      for(const clear of[contract.clearApron,contract.northSouthPath,contract.eastWestPath])
        assert.equal(intersects(box,clear),false,`${shape.owner} cannot occupy an apron/path even between vertices`);
      const closestX=Math.max(box.x0,Math.min(contract.fountain.x,box.x1));
      const closestZ=Math.max(box.z0,Math.min(contract.fountain.z,box.z1));
      assert.ok(Math.hypot(closestX-contract.fountain.x,closestZ-contract.fountain.z)>contract.fountain.radius,
        'added geometry cannot cover fountain water, coping, coins or approach');
    }else{
      assert.equal(intersects(box,EXTERIOR_FOREGROUND.arrival.path),false,'no planting across the real two-metre arrival path');
      assert.ok(EXTERIOR_FOREGROUND.arrival.lawns.some(lawn=>points.every(p=>within(p,lawn))));
      assert.ok(box.z1<1.4,'arrival planting stays against north edge, leaving the rest of its three-metre strip open');
      assert.ok(points.every(p=>p[1]<=contract.maximumArrivalHeight));
    }
    vertices+=points.length;
  }
  assert.ok(vertices>5000,'checks real folded leaves, boxes and beam envelopes');
  assert.deepEqual(contract.clearApron,EXTERIOR_FOREGROUND.garden.apron);
  assert.deepEqual(contract.northSouthPath,EXTERIOR_FOREGROUND.garden.paths.spine);
  assert.deepEqual(contract.eastWestPath,EXTERIOR_FOREGROUND.garden.paths.cross);
});

test('cultivated quarters preserve actual existing tree anchors and the original bench/lamp approaches',()=>{
  const treeAnchors=YARD_PARK_PROPS.filter(p=>p.id.startsWith('yard-park-tree-')).map(p=>({x:p.x-50,z:p.y-200}));
  assert.deepEqual(contract.treeAnchors,treeAnchors,'tree preservation uses the live authored placements');
  for(const shape of result.shapes.filter(s=>s.owner==='exterior_garden_planting')){
    const points=worldPoints(shape),bounds=footprint(points);
    assert.ok(beds.some(b=>points.every(p=>within(p,b))),'entire plant is contained within one bed');
    for(const tree of treeAnchors){
      const x=Math.max(bounds.x0,Math.min(tree.x,bounds.x1)),z=Math.max(bounds.z0,Math.min(tree.z,bounds.z1));
      assert.ok(Math.hypot(x-tree.x,z-tree.z)>=contract.trunkClearance,'no broad crown clips an existing trunk');
    }
    assert.ok(points.every(p=>p[1]>=0&&p[1]<=contract.maximumPlantHeight));
  }
  for(const prop of YARD_PARK_PROPS.filter(p=>/yard-park-(bench|lamp)/.test(p.id))){
    const centre=[prop.x-50,0,prop.y-200];
    assert.ok(!result.shapes.some(s=>intersects(footprint(worldPoints(s)),{x0:centre[0]-.7,x1:centre[0]+.7,z0:centre[2]-.7,z1:centre[2]+.7})),
      `${prop.id} retains its existing foreground clearance`);
  }
  assert.equal(result.stats.newTrees,0);
});

test('material reuse, real sections and ordinary opaque leaves keep the pass bounded',()=>{
  const again=capture(structuredClone(result.materials));
  assert.equal(again.stats.newMaterials,0,'existing roof and flora palette is reused verbatim');
  assert.ok(result.materials.length<=contract.maximumFallbackMaterials);
  for(const material of result.materials){
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],1);
    assert.equal(material.emissiveFactor,undefined);
    assert.equal(material.pbrMetallicRoughness.baseColorTexture,undefined);
    assert.notEqual(material.alphaMode,'BLEND');
  }
  for(const shape of result.shapes.filter(s=>s.kind==='quad')){
    const[a,b,c]=shape.args,ab=b.map((n,i)=>n-a[i]),ac=c.map((n,i)=>n-a[i]);
    assert.ok(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])>1e-10);
  }
  const hardscape=result.shapes.filter(s=>s.owner==='exterior_garden_hardscape');
  const coping=hardscape.filter(s=>s.kind==='quad');
  assert.ok(coping.length>=24*4,'each bed has a continuous swept six-face coping profile');
  for(const shape of coping){
    const points=worldPoints(shape),box=footprint(points);
    assert.ok(Math.min(box.x1-box.x0,box.z1-box.z0)<=.130001,'stone faces remain a narrow rim, never a broad paving overlay');
    if(points.every(p=>Math.abs(p[1]-.079)<1e-9)){
      const[a,b,c]=points,ab=b.map((n,i)=>n-a[i]),ac=c.map((n,i)=>n-a[i]);
      assert.ok(ab[2]*ac[0]-ab[0]*ac[2]>0,'upper coping faces point up');
    }
  }
  assert.ok(hardscape.every(s=>worldPoints(s).every(p=>p[1]<=contract.maximumHardscapeHeight)));
  const triangles=result.shapes.reduce((sum,s)=>sum+(s.kind==='quad'?2:s.kind==='cylinder'?s.args[4]*4:12),0);
  assert.equal(result.stats.triangles,triangles);
  assert.ok(triangles<=contract.maximumTriangles);
});

test('owner-local geometry and per-bed audits remain deterministic and correctly centered',()=>{
  assert.deepEqual(capture(),result);
  assert.deepEqual(result.owners.map(o=>o.name),Object.keys(origins));
  assert.equal(result.stats.placements.reduce((sum,p)=>sum+p.triangles,0),result.stats.triangles);
  assert.equal(Object.values(result.stats.owners).reduce((sum,p)=>sum+p.triangles,0),result.stats.triangles);
  for(const[name,audit]of Object.entries(result.stats.owners)){
    const points=result.shapes.filter(s=>s.owner===name).flatMap(localPoints);
    for(let axis=0;axis<3;axis++){
      assert.ok(Math.abs(audit.bounds.min[axis]-Math.min(...points.map(p=>p[axis])))<1e-10);
      assert.ok(Math.abs(audit.bounds.max[axis]-Math.max(...points.map(p=>p[axis])))<1e-10);
    }
  }
  assert.ok(new Set(result.stats.placements.filter(p=>p.kind==='garden-bed').map(p=>p.triangles)).size>1,
    'quarters have deliberately unequal planting mass');
});


test('botanical drifts combine overlapping low ivy, broad middle leaves and divided high fern crowns',()=>{
  const forms=result.stats.botanicalForms;
  assert.ok(forms.ivyMat>=80,'low shoots join the former isolated clumps into a substantial ground layer');
  assert.ok(forms.leafCushion>=16,'a broad middle layer interrupts the low leaf carpet');
  assert.ok(forms.fernCrown>=8&&forms.fernCrown<forms.leafCushion,'divided fern crowns remain a selective high layer');
  for(const bed of result.stats.placements.filter(p=>p.kind==='garden-bed')){
    assert.ok(bed.forms.ivyMat>0&&bed.forms.leafCushion>0&&bed.forms.fernCrown>0,`${bed.id} has all three botanical layers`);
  }
  const foliage=result.shapes.filter(s=>s.kind==='quad'&&s.owner==='exterior_garden_planting').map(s=>worldPoints(s));
  const levels=foliage.map(ps=>Math.max(...ps.map(p=>p[1])));
  assert.ok(levels.filter(y=>y<.18).length>levels.filter(y=>y>.48).length,'the low connected layer dominates the planted mass');
  assert.ok(levels.some(y=>y>.60)&&levels.some(y=>y>.28&&y<.45),'the actual folded leaf geometry has distinct middle and high silhouettes');
  const pinnae=foliage.filter(ps=>{
    const b=footprint(ps);return Math.max(b.x1-b.x0,b.z1-b.z0)<.20&&Math.max(...ps.map(p=>p[1]))>.25;
  });
  assert.ok(pinnae.length>80,'high crowns contain small divided leaflets rather than enlarged radial cabbage leaves');
});
