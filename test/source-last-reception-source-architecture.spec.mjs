// The Source treatment is actual thickness, apertures and reused GLB geometry.
// Verify the submitted model vertices and production transforms, not a label.
import assert from 'node:assert/strict';
import test from 'node:test';
import {NodeIO} from '@gltf-transform/core';
import {SOURCE_LAST_RECEPTION as S,sourceReceptionGeometry,sourceReceptionSolids,sourceReceptionPropPlacements} from '../src/data/source-last-reception.js';
import {createSourceSpaceRuntime,sourceMatrix} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';

const io=new NodeIO();
const [acquisitions,procedural]=await Promise.all([
  io.read(new URL('../public/assets/conservatory-acquisitions.glb',import.meta.url).pathname),
  io.read(new URL('../public/assets/conservatory-props.glb',import.meta.url).pathname),
]);
const placements=sourceReceptionPropPlacements(),solids=sourceReceptionSolids(),geometry=sourceReceptionGeometry();
const point=(m,p)=>[0,1,2].map(axis=>m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);
const matrixFor=(p,origin={x:0,y:0})=>sourceMatrix({x:p.x+origin.x*CELL,y:p.y,z:p.z+origin.y*CELL,
  yaw:p.yaw||0,pitch:p.pitch||0,roll:p.roll||0,
  scaleX:p.scaleX??p.scale??1,scaleY:p.scaleY??p.scale??1,scaleZ:p.scaleZ??p.scale??1});
const overlaps=(a,b)=>a.max[0]>b.minX&&a.min[0]<b.maxX&&a.max[1]>b.minY&&a.min[1]<b.maxY&&a.max[2]>b.minZ&&a.min[2]<b.maxZ;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);

function modelGeometry(meshName,matrix){
  const document=[acquisitions,procedural].find(doc=>doc.getRoot().listMeshes().some(mesh=>mesh.getName()===meshName));
  assert.ok(document,`${meshName} must be an existing shipped overworld GLB`);
  const nodes=document.getRoot().listNodes().filter(node=>node.getMesh()?.getName()===meshName);
  assert.equal(nodes.length,1);
  const triangles=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const primitive of nodes[0].getMesh().listPrimitives()){
    const position=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray();
    const vertices=Array.from({length:position.getCount()},(_,index)=>{
      const local=[];position.getElement(index,local);
      const world=point(matrix,point(nodes[0].getWorldMatrix(),local));
      assert.ok(world.every(Number.isFinite));
      for(let axis=0;axis<3;axis++){
        bounds.min[axis]=Math.min(bounds.min[axis],world[axis]);
        bounds.max[axis]=Math.max(bounds.max[axis],world[axis]);
      }
      return world;
    });
    for(let index=0;index<indices.length;index+=3)triangles.push([vertices[indices[index]],vertices[indices[index+1]],vertices[indices[index+2]]]);
  }
  return{bounds,triangles};
}
const giantModels=placements.filter(p=>p.sourceArchitecture).map(placement=>({placement,...modelGeometry(placement.mesh,matrixFor(placement))}));

test('physical source courses and code strokes enter the same finite architecture used for collision',()=>{
  const courses=solids.filter(s=>s.material==='source'&&/head.*source|incision-course|abutment|grille-source-root/.test(s.id));
  assert.ok(courses.length>150,'source must form substantial wall/roof thickness');
  assert.ok(new Set(courses.map(s=>(s.maxZ-s.minZ).toFixed(3))).size>5,'cut courses have unequal physical depth');
  assert.ok(courses.some(s=>s.maxY>S.ceiling+2),'the incision and bindings continue through the remembered ceiling');
  const strokes=solids.filter(s=>s.id.startsWith('source-stroke-'));
  assert.ok(strokes.length>100,'the code and braces must have physical strokes');
  for(const solid of [...courses,...strokes]){
    assert.equal(solid.collision,true);
    for(const axis of ['X','Y','Z'])assert.ok(solid['max'+axis]-solid['min'+axis]>.01,`${solid.id} has no physical thickness`);
    const batch=geometry.find(group=>group.pieces.includes(solid.id));
    assert.ok(batch,`${solid.id} missing from rendered geometry`);
    assert.equal(batch.material,solid.material);
    const offset=batch.pieces.indexOf(solid.id)*8*3;
    const vertices=batch.p.slice(offset,offset+24);
    assert.equal(vertices.length,24);
    close(Math.min(...vertices.filter((_,i)=>i%3===0)),solid.minX);
    close(Math.max(...vertices.filter((_,i)=>i%3===1)),solid.maxY);
    close(Math.max(...vertices.filter((_,i)=>i%3===2)),solid.maxZ);
  }
});

test('both opened ceilings are genuine empty volumes below the giant furnishing',()=>{
  const apertures=[
    {name:'lounge',xs:[-72,-68,-64,-60],zs:[-453,-451,-448.5]},
    {name:'return',xs:[-69.8,-64.7,-59.6],zs:[-465.3,-462,-458]},
  ];
  for(const aperture of apertures)for(const x of aperture.xs)for(const z of aperture.zs){
    const column={min:[x-.01,S.ceiling+.02,z-.01],max:[x+.01,16.5,z+.01]};
    assert.ok(!solids.some(solid=>overlaps(column,solid)),`${aperture.name} aperture at ${x},${z} has a concealed roof`);
    for(const group of geometry)for(let offset=0;offset<group.p.length;offset+=24){
      const p=group.p.slice(offset,offset+24),solid={
        minX:Math.min(...p.filter((_,i)=>i%3===0)),maxX:Math.max(...p.filter((_,i)=>i%3===0)),
        minY:Math.min(...p.filter((_,i)=>i%3===1)),maxY:Math.max(...p.filter((_,i)=>i%3===1)),
        minZ:Math.min(...p.filter((_,i)=>i%3===2)),maxZ:Math.max(...p.filter((_,i)=>i%3===2)),
      };
      assert.equal(overlaps(column,solid),false,`${aperture.name} aperture remains filled in the rendered batch`);
    }
  }
});

test('the real inverted sofa supplies an architectural roof above both ceiling openings',()=>{
  const sofa=giantModels.find(model=>model.placement.mesh==='sofa_01');
  assert.ok(sofa);assert.ok(sofa.placement.roll>3);
  assert.ok(sofa.bounds.min[1]>S.ceiling+.28,'the complete submitted model must clear the original roof');
  assert.ok(sofa.bounds.max[0]-sofa.bounds.min[0]>30,'the familiar sofa must read as architecture at scale');
  assert.ok(sofa.bounds.max[1]-sofa.bounds.min[1]>12);
  // A vertical ray must meet actual upholstery triangles, rather than merely
  // finding an enormous bounding box above the room.
  const hitAt=(x,z)=>sofa.triangles.some(([a,b,c])=>{
    const denominator=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(denominator)<1e-8)return false;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/denominator;
    const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/denominator,w=1-u-v;
    return u>=0&&v>=0&&w>=0&&u*a[1]+v*b[1]+w*c[1]>S.ceiling+.28;
  });
  assert.equal(hitAt(-64,-451),true,'lounge opening sees the real inverted furnishing');
  assert.equal(hitAt(-64,-460),true,'return opening sees the same continuous model');
  const grille=giantModels.find(model=>model.placement.mesh==='ticket_counter');
  assert.ok(grille.bounds.max[1]>28,'the familiar box-office grille becomes a tall external organ');
  assert.ok(grille.bounds.min[0]<S.bounds.maxX&&grille.bounds.max[0]>S.bounds.maxX+5,'the model actually passes through the east wall');
});

test('actual giant GLB bounds preserve walking headroom and both complete exit apertures',()=>{
  assert.equal(giantModels.length,2);
  for(const {placement,bounds}of giantModels){
    for(const node of S.navNodes){
      const body={minX:node.x-.27,maxX:node.x+.27,minY:node.y,maxY:node.y+1.8,minZ:node.z-.27,maxZ:node.z+.27};
      assert.equal(overlaps(bounds,body),false,`${placement.id} obstructs ${node.id}`);
    }
    for(const entrance of S.entrances){
      const opening={minX:entrance.x-2,maxX:entrance.x+2,minY:entrance.floor,maxY:entrance.floor+entrance.height,
        minZ:entrance.z-entrance.width/2,maxZ:entrance.z+entrance.width/2};
      assert.equal(overlaps(bounds,opening),false,`${placement.id} obstructs ${entrance.id} aperture`);
    }
  }
});

test('production furniture culling coordinates and transformed geometry share the shifted world origin',()=>{
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LAST_RECEPTION,{seed:4417,injuries:0,hasRig:false});
  const origin={x:361,y:-729};
  const runtime=createSourceSpaceRuntime({initialState:{...built.state,landscapeOrigin:origin}});
  const player={x:origin.x+S.anchors.mainOutside.x/CELL,y:origin.y+S.anchors.mainOutside.z/CELL,facing:3};
  runtime.setPlayerPosition(player);
  const instances=runtime.propInstances(player.x,player.y,{all:true,reducedMotion:true});
  for(const placement of placements){
    const instance=instances.find(part=>part.id===`source-reception:${placement.id}`);
    assert.ok(instance,placement.id);assert.equal(instance.mesh,placement.mesh);
    assert.equal(instance.zone,ZONE.sourceSpace);assert.equal(instance.structural,true);
    const expected=matrixFor(placement,origin);
    for(let axis=0;axis<16;axis++)close(instance.matrix[axis],expected[axis]);
    close(instance.x,instance.matrix[12]);close(instance.y,instance.matrix[13]);close(instance.z,instance.matrix[14]);
    assert.notEqual(instance.x,placement.x,'culling must not use Source-local x after origin translation');
    assert.notEqual(instance.z,placement.z,'culling must not use Source-local z after origin translation');
    if(placement.sourceArchitecture){
      assert.equal(instance.sourceArchitecture,true);
      const actual=modelGeometry(instance.mesh,instance.matrix),local=giantModels.find(model=>model.placement.id===placement.id);
      for(const edge of ['min','max']){
        close(actual.bounds[edge][0],local.bounds[edge][0]+origin.x*CELL);
        close(actual.bounds[edge][1],local.bounds[edge][1]);
        close(actual.bounds[edge][2],local.bounds[edge][2]+origin.y*CELL);
      }
    }
  }
});
