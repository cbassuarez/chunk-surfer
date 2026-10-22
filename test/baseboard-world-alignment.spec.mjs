import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,MATERIAL} from '../src/data/floorplan/legend.js';
import {BASEBOARDS} from '../src/data/generated/prop-geometry.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {wallRuns,wallRunsDigest} from '../src/world/wall-contact.js';
import {baseboardWallRuns,baseboardWallRunsDigest,baseboardPhysicalNormal} from '../src/world/baseboard-hosting.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);

// Read the real packed strips, rather than a registry bounding box that cannot
// expose a whole floor of skirting rotating around its stair-cell anchor.
const bytes=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength));
const binaryAt=28+jsonLength;
function packedPositions(name){
  const mesh=gltf.meshes.find(mesh=>mesh.name===name);
  assert.ok(mesh,`${name}: actual packed geometry must exist`);
  return mesh.primitives.flatMap(primitive=>{
    const accessor=gltf.accessors[primitive.attributes.POSITION],view=gltf.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC3');
    const at=binaryAt+(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||12;
    return Array.from({length:accessor.count},(_,index)=>[0,1,2].map(axis=>bytes.readFloatLE(at+index*stride+axis*4)));
  });
}
const renderer=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const matrixSource=renderer.slice(renderer.indexOf('function identity(){'),renderer.indexOf('function perspective(aspect)'));
assert.ok(matrixSource.includes('function modelMatrix('));
const modelMatrix=new Function(`${matrixSource};return modelMatrix;`)();
const matrixPoint=(p,m)=>[0,1,2].map(axis=>m[axis]*p[0]+m[4+axis]*p[1]+m[8+axis]*p[2]+m[12+axis]);
const close=(a,b,why)=>assert.ok(Math.abs(a-b)<.00002,`${why}: ${a} != ${b}`);

test('actual baked baseboard groups retain world orientation even when hosted on curved stair cells',()=>{
  const instances=PROPS.renderInstances({inscriptions:false});
  for(const [group,baked]of Object.entries(BASEBOARDS)){
    const at=FP.logicalToPhysical(baked.anchor.x,baked.anchor.y);
    const tangent=FP.arcYawOffset(baked.anchor.x,baked.anchor.y,at.x+.5,at.z+.5)||0;
    const draw=instances.find(p=>p.id===`baseboard-${group}`);
    assert.ok(draw,`${group}: actual runtime instance must exist`);
    const matrix=modelMatrix(draw);
    for(const vertex of packedPositions(baked.mesh)){
      const rendered=matrixPoint(vertex,matrix);
      const expected=[vertex[0]+at.x*CELL,vertex[1]+FP.floorAt(baked.anchor.x,baked.anchor.y),vertex[2]+at.z*CELL];
      for(let axis=0;axis<3;axis++)close(rendered[axis],expected[axis],`${group}: packed skirting must not inherit its anchor's tangent yaw`);
    }
  }
});

test('packed academic and upper strip endpoints meet the compiled host wall geometry through the real runtime matrix',()=>{
  // Execute only the production baseboard factory with shape collectors. This
  // independently resolves its current wall faces and emits the exact physical
  // box endpoints; it does not build or write an asset pack.
  const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
  const start=builder.indexOf('const BASEBOARD ='),end=builder.indexOf('// Canonical mineral eyes',start);
  assert.ok(start>=0&&end>start,'production baseboard factory must remain measurable');
  const shapes=new Map();
  new Function('FP','conservatory','wallRuns','wallRunsDigest','baseboardWallRuns','baseboardWallRunsDigest','baseboardPhysicalNormal','crypto','MATERIAL','MAT','CELL','mesh','addBox','console',builder.slice(start,end))(
    {...FP,compile(){}},conservatory,wallRuns,wallRunsDigest,baseboardWallRuns,baseboardWallRunsDigest,baseboardPhysicalNormal,crypto,MATERIAL,
    new Proxy({},{get:(_,key)=>key}),CELL,
    name=>{const m={name};shapes.set(name,[]);return m;},
    (m,center,size)=>shapes.get(m.name).push({center,size}),{log(){}},
  );
  for(const group of ['academic','upper']){
    const baked=BASEBOARDS[group],draw=PROPS.renderInstances({inscriptions:false}).find(p=>p.id===`baseboard-${group}`);
    const matrix=modelMatrix(draw),points=packedPositions(baked.mesh).map(p=>matrixPoint(p,matrix));
    const at=FP.logicalToPhysical(baked.anchor.x,baked.anchor.y),translation=[at.x*CELL,FP.floorAt(baked.anchor.x,baked.anchor.y),at.z*CELL];
    const key=p=>p.map(v=>v.toFixed(3)).join(',');
    const rendered=new Set(points.map(key));
    // Every real factory box corner must be a rendered packed endpoint on that
    // same compiled face, within the pack's millimetre precision.
    for(const {center,size}of shapes.get(baked.mesh))for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
      const expected=center.map((v,axis)=>v+size[axis]*[x,y,z][axis]/2+translation[axis]);
      assert.ok(rendered.has(key(expected)),`${group}: a packed strip endpoint left its compiled host wall at ${key(expected)}`);
    }
  }
});

test('ordinary props on an arc retain their authored yaw plus the local stair tangent',()=>{
  const anchor={x:268,y:116},at=FP.logicalToPhysical(anchor.x,anchor.y),id='baseboard-alignment-regression-chair';
  const authoredYaw=.3,tangent=FP.arcYawOffset(anchor.x,anchor.y,at.x+.5,at.z+.5);
  assert.ok(Math.abs(tangent)>.01);
  PROPS.setLooseProp(id,{mesh:'chair',rx:anchor.x,ry:anchor.y,yaw:authoredYaw});
  try{const draw=PROPS.renderInstances({inscriptions:false}).find(p=>p.id===id);assert.ok(draw);close(draw.yaw,authoredYaw+tangent,'ordinary chair still follows the stair');}
  finally{PROPS.setLooseProp(id,null);}
});

test('a world-aligned baked prop on the original curved anchor never receives tangent yaw',()=>{
  const anchor={x:268,y:116},at=FP.logicalToPhysical(anchor.x,anchor.y),id='baseboard-alignment-regression-baked';
  assert.ok(Math.abs(FP.arcYawOffset(anchor.x,anchor.y,at.x+.5,at.z+.5))>.01);
  PROPS.setLooseProp(id,{mesh:BASEBOARDS.academic.mesh,rx:anchor.x,ry:anchor.y,yaw:0,worldAligned:true});
  try{const draw=PROPS.renderInstances({inscriptions:false}).find(p=>p.id===id);assert.ok(draw);close(draw.yaw,0,'baked world axes remain fixed');}
  finally{PROPS.setLooseProp(id,null);}
});
