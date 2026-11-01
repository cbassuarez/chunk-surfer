// Reconcile optional replacements with the same open court as the base pack.
// The gallery's source asset remains editable; its build calls this final cut.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {clipCourtyardGlb} from './courtyard-architecture-geometry.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export async function repairCourtyardGallery(file=path.join(root,'public/assets/academic-gallery.glb')){
  const statsFile=file.replace('.glb','.stats.json'),stats=JSON.parse(await fs.readFile(statsFile,'utf8'));
  const oldCount=stats.catalogueTriangles,oldAdded=stats.addedCatalogueTriangles;
  const receipt=await clipCourtyardGlb(file),bytes=await fs.readFile(file),doc=await new NodeIO().readBinary(bytes);
  const counts=new Map(doc.getRoot().listMeshes().map(mesh=>[mesh.getName(),mesh.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0)]));
  const count=[...counts.values()].reduce((a,b)=>a+b,0);
  stats.catalogueTriangles=count;
  if(Number.isFinite(oldAdded))stats.addedCatalogueTriangles=oldAdded+count-oldCount;
  stats.export={...stats.export,bytes:bytes.length,sha256:sha(bytes)};
  for(const m of stats.export.meshes||[])if(counts.has(m.name))m.triangles=counts.get(m.name);
  stats.courtyardRepair={revision:1,receipt,source:'tools/chunk_surfer/repair-courtyard-packs.mjs',guards:'glass_court_upper_guards in glass-court.glb'};
  await fs.writeFile(statsFile,JSON.stringify(stats,null,2)+'\n');
  return{bytes:bytes.length,sha256:sha(bytes),triangles:count,receipt};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await repairCourtyardGallery(),null,2));
