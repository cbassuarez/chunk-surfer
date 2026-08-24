import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { OPENING_STREET_PROPS } from '../src/data/opening-street.js';
import { VEGETATION_FALLBACKS, VEGETATION_MESHES } from '../src/data/vegetation.js';
import { YARD_PARK_PROPS } from '../src/data/yard-park.js';

const bytes=fs.readFileSync(new URL('../public/assets/vegetation.glb',import.meta.url));
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/vegetation.stats.json',import.meta.url),'utf8'));
const credits=JSON.parse(fs.readFileSync(new URL('../public/assets/vegetation.credits.json',import.meta.url),'utf8'));
const manifest=JSON.parse(fs.readFileSync(new URL('../tools/chunk_surfer/vegetation-sources.json',import.meta.url),'utf8'));

assert.equal(bytes.toString('ascii',0,4),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const jsonLength=bytes.readUInt32LE(12);
const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8').trim());
assert.ok(!json.animations&&!json.skins&&!json.extensionsUsed&&!json.extensionsRequired);
assert.ok(json.meshes.every((mesh)=>mesh.primitives.every((primitive)=>Number.isInteger(primitive.indices)
  &&Number.isInteger(primitive.attributes.POSITION)&&Number.isInteger(primitive.attributes.NORMAL)
  &&Number.isInteger(primitive.attributes.TEXCOORD_0))));

const baseMeshes=[
  'yard_hedge_run','yard_hedge_dense','yard_hedge_corner','opening_park_laurel',
  'opening_street_tree_small','opening_street_tree_small_b','opening_street_tree_small_c',
  'vegetation_nettle_cluster','vegetation_weed_cluster','vegetation_grass_edge','vegetation_leaf_scatter',
  'academic_dead_tree','academic_dead_tree_b','academic_leaf_litter',
];
const byName=new Map(json.meshes.map((mesh)=>[mesh.name,mesh]));
for(const name of baseMeshes){
  const mesh=byName.get(name),lod=mesh?.extras?.vegetationLods;
  assert.ok(mesh,`${name} is packed`);
  assert.deepEqual({medium:lod.mediumDistanceM,far:lod.farDistanceM,hysteresis:lod.hysteresisM},{medium:28,far:55,hysteresis:3});
  assert.ok(byName.has(lod.medium)&&byName.has(lod.far),`${name} names real LOD tiers`);
  assert.ok(stats.meshes[name].triangles>=stats.meshes[lod.medium].triangles,`${name} medium tier reduces geometry`);
  assert.ok(stats.meshes[lod.medium].triangles>=stats.meshes[lod.far].triangles,`${name} far tier reduces geometry`);
}
assert.ok(byName.has('academic_planter'),'the textured planter overrides the procedural fallback');

const materialClasses=new Set(json.materials.map((material)=>material.extras?.vegetationClass).filter(Boolean));
assert.deepEqual([...materialClasses].sort(),['dead-leaf','leaf','soil','stem','stone']);
for(const material of json.materials.filter((entry)=>['leaf','dead-leaf'].includes(entry.extras?.vegetationClass))){
  if(material.name==='vegetation.blade')continue;
  assert.equal(material.alphaMode,'MASK',`${material.name} is alpha masked`);
  assert.equal(material.doubleSided,true,`${material.name} is two sided`);
}
assert.ok(json.images.every((image)=>Number.isInteger(image.bufferView)&&/^image\/(png|jpeg)$/.test(image.mimeType)));
assert.equal(stats.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
assert.equal(credits.pack.sha256,stats.sha256);
assert.equal(credits.sources.length,4);
assert.ok(credits.sources.every((source)=>source.license==='CC0-1.0'&&source.sourceUrl.startsWith('https://polyhaven.com/a/')));
assert.ok(manifest.sources.every((source)=>source.sha256||source.files.every((file)=>/^[a-f0-9]{64}$/.test(file.sha256))));
assert.ok(stats.bytes<=manifest.limits.bytes);
assert.ok(stats.totalTriangles<=manifest.limits.triangles);
assert.ok(stats.estimatedMipmappedTextureBytes<=manifest.limits.estimatedMipmappedTextureBytes);
assert.ok(stats.additionalMainPassDrawCalls<=manifest.limits.additionalMainPassDrawCalls);
assert.ok(stats.images.every((image)=>Math.max(image.width,image.height)<=manifest.limits.textureDimension));

for(const [name,contract] of Object.entries(VEGETATION_MESHES))assert.deepEqual(PROP_MESH[name],contract);
for(const name of ['yard_hedge_run','yard_hedge_dense','yard_hedge_corner']){
  const contract=PROP_MESH[name],bounds=stats.meshes[name].bounds;
  const visualWidth=bounds.max[0]-bounds.min[0],visualDepth=bounds.max[2]-bounds.min[2];
  assert.ok(visualWidth<=contract.w,`${name} crown stays inside its collision width`);
  assert.ok(visualDepth<=contract.d,`${name} crown stays inside its collision depth`);
}
const authored=[...OPENING_STREET_PROPS,...YARD_PARK_PROPS,...CONSERVATORY_PROPS.filter((prop)=>prop.id.startsWith('yard-hedge-')||prop.id.startsWith('academic-garden-'))];
for(const prop of authored.filter((entry)=>VEGETATION_FALLBACKS[entry.mesh]))assert.equal(prop.fallbackMesh,VEGETATION_FALLBACKS[prop.mesh],`${prop.id} retains a procedural fallback`);
for(const prop of authored.filter((entry)=>entry.mesh.startsWith('vegetation_')))assert.equal(prop.blocks,false,`${prop.id} groundcover never changes navigation`);
assert.equal(CONSERVATORY_PROPS.find((prop)=>prop.id==='academic-garden-tree-east').mesh,'academic_dead_tree_b');
assert.equal(CONSERVATORY_PROPS.find((prop)=>prop.id==='academic-garden-planter-west').mesh,'academic_planter');

console.log('vegetation asset and placement contracts passed');
