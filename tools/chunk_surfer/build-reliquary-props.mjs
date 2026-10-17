// Update only the four eye/gallery meshes in the current prop pack. Existing
// dirty work on every other prop is retained and checked by geometry digest.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { createReliquaryPropGeometry, RELIQUARY_PROP_MATERIALS, RELIQUARY_PROP_NAMES } from './reliquary-prop-geometry.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
if(process.argv.includes('--help')) {
  console.log('node tools/chunk_surfer/build-reliquary-props.mjs\nUpdates the eye/gallery meshes only; preserves every unrelated mesh and its geometry.');
  process.exit(0);
}
const packPath=path.join(ROOT,'public/assets/conservatory-props.glb');
const statsPath=path.join(ROOT,'public/assets/conservatory-props.stats.json');
const creditsPath=path.join(ROOT,'public/assets/conservatory-props.credits.json');
const io=new NodeIO(), document=await io.read(packPath), root=document.getRoot();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function digest(mesh) {
  const h=crypto.createHash('sha256');
  for(const p of mesh.listPrimitives()) {
    h.update(p.getMaterial()?.getName()||'');
    for(const s of p.listSemantics().sort())h.update(s).update(Buffer.from(p.getAttribute(s).getArray().buffer));
    h.update(Buffer.from(p.getIndices().getArray().buffer));
  }
  return h.digest('hex');
}
const before=new Map(root.listMeshes().filter(m=>!RELIQUARY_PROP_NAMES.includes(m.getName())).map(m=>[m.getName(),digest(m)]));
const buffer=root.listBuffers()[0]||document.createBuffer(), scene=root.getDefaultScene()||root.listScenes()[0];
const materialMap=new Map();
for(const [key,m] of Object.entries(RELIQUARY_PROP_MATERIALS))materialMap.set(key,
  document.createMaterial(`reliquary ${key}`).setBaseColorFactor(m.color).setMetallicFactor(m.metallic).setRoughnessFactor(m.roughness));
const geometry=createReliquaryPropGeometry(), bounds={}, newStats={};
for(const [name,parts] of geometry) {
  const mesh=root.listMeshes().find(m=>m.getName()===name)||document.createMesh(name);
  for(const p of mesh.listPrimitives()){mesh.removePrimitive(p);p.dispose();}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0,vertices=0;
  for(const [key,g] of parts) {
    if(!g.indices.length)continue;
    for(let i=0;i<g.positions.length;i++) {min[i%3]=Math.min(min[i%3],g.positions[i]);max[i%3]=Math.max(max[i%3],g.positions[i]);}
    const attr=(type,array)=>document.createAccessor().setBuffer(buffer).setType(type).setArray(array);
    mesh.addPrimitive(document.createPrimitive().setAttribute('POSITION',attr('VEC3',Float32Array.from(g.positions)))
      .setAttribute('NORMAL',attr('VEC3',Float32Array.from(g.normals)))
      .setIndices(attr('SCALAR',Uint32Array.from(g.indices))).setMaterial(materialMap.get(key)));
    triangles+=g.indices.length/3;vertices+=g.positions.length/3;
  }
  mesh.setExtras({eyeContinuity:1,source:'tools/chunk_surfer/reliquary-prop-geometry.mjs',
    ...(name.includes('eyes')||name.includes('returned')?{canonicalEyes:['L','R']}:{}),
    ...(name.startsWith('academic')?{physicalSockets:true}:{}),
    ...(name==='park_marble_eyes'?{containsCoins:false}:{})});
  if(!root.listNodes().some(n=>n.getMesh()===mesh))scene.addChild(document.createNode(name).setMesh(mesh));
  bounds[name]={min:min.map(v=>+v.toFixed(3)),max:max.map(v=>+v.toFixed(3))};
  newStats[name]={triangles,vertices};
}
await document.transform(prune({keepAttributes:true}));
for(const mesh of root.listMeshes())if(before.has(mesh.getName())&&digest(mesh)!==before.get(mesh.getName()))throw Error(`Unrelated prop changed: ${mesh.getName()}`);
await io.write(packPath,document);
const bytes=fs.readFileSync(packPath),stats=JSON.parse(fs.readFileSync(statsPath,'utf8'));
stats.generatedAt=new Date().toISOString();stats.bytes=bytes.length;stats.meshes={...stats.meshes,...newStats};stats.bounds={...stats.bounds,...bounds};
stats.totalTriangles=Object.values(stats.meshes).reduce((n,m)=>n+m.triangles,0);
fs.writeFileSync(statsPath,JSON.stringify(stats,null,2)+'\n');
const credits=JSON.parse(fs.readFileSync(creditsPath,'utf8'));
credits.pack.sha256=hash(bytes);credits.pack.bytes=bytes.length;credits.pack.triangles=stats.totalTriangles;
credits.meshes=credits.meshes.filter(m=>!RELIQUARY_PROP_NAMES.includes(m.name));
for(const name of RELIQUARY_PROP_NAMES)credits.meshes.push({name,bounds:bounds[name],triangles:newStats[name].triangles,
  provenance:{source:name.startsWith('academic')?'https://polyhaven.com/a/marble_bust_01':'tools/chunk_surfer/reliquary-prop-geometry.mjs',
    origin:name.startsWith('academic')?'Socketed CC0 Poly Haven marble portrait with project-authored bronze repair':'Project-authored canonical mineral eyes and separate bronze coins',
    license:name.startsWith('academic')?'CC0-1.0 portrait; project source additions':'project source'}});
fs.writeFileSync(creditsPath,JSON.stringify(credits,null,2)+'\n');
const generatedPath=path.join(ROOT,'src/data/generated/prop-geometry.js');let generated=fs.readFileSync(generatedPath,'utf8');
for(const [name,updates] of [['PROP_BOUNDS',bounds],['MESH_TOP',Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,v.max[1]]))]]) {
  const re=new RegExp(`export const ${name} = Object\\.freeze\\(([^\\n]*)\\);`),match=generated.match(re);
  if(!match)throw Error(`Missing generated ${name}`);
  generated=generated.replace(re,`export const ${name} = Object.freeze(${JSON.stringify({...JSON.parse(match[1]),...updates})});`);
}
fs.writeFileSync(generatedPath,generated);
const artifact=path.join(ROOT,'artifacts/bust-reliquary-production');fs.mkdirSync(artifact,{recursive:true});
fs.writeFileSync(path.join(artifact,'eye-prop-preservation.json'),JSON.stringify({generator:'build-reliquary-props.mjs',
  unchangedMeshes:before.size,updatedMeshes:RELIQUARY_PROP_NAMES,sha256:hash(bytes),bounds,newStats},null,2)+'\n');
console.log(`Updated ${RELIQUARY_PROP_NAMES.length} eye/gallery meshes; preserved ${before.size} unrelated meshes.`);
