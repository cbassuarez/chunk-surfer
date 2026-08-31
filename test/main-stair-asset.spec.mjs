import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';

const assetUrl=new URL('../public/assets/conservatory-main-stair.glb',import.meta.url);
const stats=JSON.parse(readFileSync(new URL('../public/assets/conservatory-main-stair.stats.json',import.meta.url),'utf8'));
const credits=JSON.parse(readFileSync(new URL('../public/assets/conservatory-main-stair.credits.json',import.meta.url),'utf8'));
const bytes=readFileSync(assetUrl);

assert.equal(bytes.readUInt32LE(0),0x46546c67,'hero stair is a binary glTF');
assert.equal(bytes.readUInt32LE(4),2,'hero stair uses glTF 2');
assert.equal(bytes.readUInt32LE(8),bytes.length,'declared GLB length matches the file');
assert.equal(stats.bytes,bytes.length,'asset stats describe the checked-in GLB');
assert.equal(credits.pack.sha256,crypto.createHash('sha256').update(bytes).digest('hex'),'credits hash pins the generated asset');

assert.deepEqual({
  revision:stats.design.geometryRevision,
  curvilinear:stats.design.curvilinear,
  navigation:stats.design.navigationMode,
  flights:stats.design.halfTurnFlights,
  width:stats.design.flightWidthM,
  well:stats.design.openWellWidthM,
  lower:stats.design.lowerRisers,
  upper:stats.design.upperRisers,
  going:stats.design.goingM,
},{revision:3,curvilinear:true,navigation:'analytic-helix',flights:4,width:2,well:1.3,lower:28,upper:30,going:.28});
assert.equal(stats.design.coplanarFinishPrisms,0,'finish is a surface, not an overlapping solid on every tread');
assert.equal(stats.design.doubleSidedOpaqueMaterials,0,'opaque stair construction is back-face culled');
assert.deepEqual(stats.design.floor1Aim,[61.5,31.5],'the Floor 1 apron aims at the immutable hall centre');
assert.ok(stats.totalTriangles>28000,'rails, continuous soffits, nosings, and treads are construction rather than a block proxy');

const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8').trim());
assert.ok(gltf.materials.filter((material)=>material.name!=='opal glass').every((material)=>!material.doubleSided),
  'only translucent opal glass may render double-sided');
const binOffset=20+jsonLength+8;
let degenerate=0,inverted=0;
for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
  const pa=gltf.accessors[primitive.attributes.POSITION],pv=gltf.bufferViews[pa.bufferView];
  const na=gltf.accessors[primitive.attributes.NORMAL],nv=gltf.bufferViews[na.bufferView];
  const ia=gltf.accessors[primitive.indices],iv=gltf.bufferViews[ia.bufferView];
  const positions=new Float32Array(bytes.buffer,bytes.byteOffset+binOffset+(pv.byteOffset||0)+(pa.byteOffset||0),pa.count*3);
  const normals=new Float32Array(bytes.buffer,bytes.byteOffset+binOffset+(nv.byteOffset||0)+(na.byteOffset||0),na.count*3);
  const indices=new Uint32Array(bytes.buffer,bytes.byteOffset+binOffset+(iv.byteOffset||0)+(ia.byteOffset||0),ia.count);
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
    const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
    const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
    if(cx*cx+cy*cy+cz*cz<1e-14)degenerate++;
    const nx=normals[a]+normals[b]+normals[c],ny=normals[a+1]+normals[b+1]+normals[c+1],nz=normals[a+2]+normals[b+2]+normals[c+2];
    if(cx*nx+cy*ny+cz*nz<0)inverted++;
  }
}
assert.equal(degenerate,0,'the rebuilt stair contains no zero-area triangles');
assert.equal(inverted,0,'every triangle winding agrees with its outward normal');

const prop=CONSERVATORY_PROPS.find((entry)=>entry.id==='main-open-well-stair');
assert.equal(prop?.mesh,'main_open_well_stair');
assert.equal(PROP_MESH.main_open_well_stair.blocks,false,'authored floorplan collision—not the display mesh—owns walking');
assert.ok(PROP_MESH.main_open_well_stair.w>=6.4&&PROP_MESH.main_open_well_stair.d>=6.1&&PROP_MESH.main_open_well_stair.h>=14.6,
  'visibility bounds tightly contain the helix, Floor 1 apron, fittings, and upper rails');

const rendererSource=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
assert.match(rendererSource,/conservatory-main-stair\.glb/,'the renderer loads the dedicated hero pack');

console.log('main stair asset contracts passed');
