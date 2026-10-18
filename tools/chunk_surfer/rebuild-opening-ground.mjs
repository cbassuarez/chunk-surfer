// Bounded repair of opening_street_ground only. Appending the small receiver
// leaves every other primitive, embedded image, material and node untouched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGlb,encodeGlb,meshFingerprint} from './rebuild-tree-crowns.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const BASELINE='64639979fe4c7d3b13295714d299d851f36294f4e02098030fcb3801deef0641';
const align=n=>(n+3)&~3;
// Coordinates local to the unchanged physical anchor (8,7.5).
export const OPENING_GROUND_PANELS=Object.freeze([
  {role:'asphalt',x:0,z:2,w:44,d:11,y:.035,tile:3},
  {role:'asphalt',x:11,z:-6,w:2,d:3,y:.045,tile:3},
  {role:'cobbles',x:22,z:13.5,w:4,d:9,y:.045,tile:2.4},
  {role:'grass',x:7,z:-6,w:6,d:3,y:.04,tile:2},
  {role:'grass',x:15,z:-6,w:6,d:3,y:.04,tile:2},
  {role:'grass',x:23.9,z:8.25,w:1.2,d:2.2,y:.04,tile:2},
  {role:'grass',x:24,z:19.25,w:1,d:2,y:.04,tile:2},
].map(Object.freeze));
export function patchOpeningGround(input){
  const json=structuredClone(input.json),mesh=json.meshes.find(m=>m.name==='opening_street_ground');
  if(!mesh)throw Error('Opening ground mesh absent');
  if(mesh.extras?.openingGroundRevision===1)return{json,bin:Buffer.from(input.bin)};
  const chunks=[Buffer.from(input.bin)];let length=input.bin.length;
  const accessor=(values,width,integer=false)=>{
    const bytes=Buffer.from((integer?new Uint16Array(values):new Float32Array(values)).buffer),offset=align(length);if(offset>length)chunks.push(Buffer.alloc(offset-length));chunks.push(bytes);length=offset+bytes.length;
    const bufferView=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
    const a={bufferView,componentType:integer?5123:5126,count:values.length/width,type:width===1?'SCALAR':`VEC${width}`};
    if(width===3&&!integer){a.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}
    json.accessors.push(a);return json.accessors.length-1;
  };
  mesh.primitives=['asphalt','cobbles','grass'].map(role=>{
    const positions=[],normals=[],uvs=[],indices=[];
    for(const p of OPENING_GROUND_PANELS.filter(p=>p.role===role)){
      const x0=p.x-p.w/2,x1=p.x+p.w/2,z0=p.z-p.d/2,z1=p.z+p.d/2,start=positions.length/3;
      for(const v of[[x0,p.y,z0],[x0,p.y,z1],[x1,p.y,z1],[x1,p.y,z0]]){positions.push(...v);normals.push(0,1,0);uvs.push(v[0]/p.tile,v[2]/p.tile);}
      indices.push(start,start+1,start+2,start,start+2,start+3);
    }
    const material=json.materials.findIndex(m=>m.extras?.openingStreetRole===role);if(material<0)throw Error(`Missing ${role} material`);
    return{attributes:{POSITION:accessor(positions,3),NORMAL:accessor(normals,3),TEXCOORD_0:accessor(uvs,2)},indices:accessor(indices,1,true),material};
  });
  mesh.extras={...mesh.extras,openingGroundRevision:1,arrivalLawnsPhysical:[{x0:12,x1:18,z0:0,z1:3},{x0:20,x1:26,z0:0,z1:3}],arrivalPathPhysical:{x0:18,x1:20,z0:0,z1:3}};
  json.buffers=[{byteLength:length}];return{json,bin:Buffer.concat(chunks)};
}
async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),file=path.join(root,'public/assets/opening-street.glb'),before=fs.readFileSync(file),statsFile=file.replace('.glb','.stats.json'),stats=JSON.parse(fs.readFileSync(statsFile,'utf8')),original=parseGlb(before);
  if(sha(before)!==stats.sha256)throw Error('Opening pack changed without matching metadata; refusing overwrite');
  if(sha(before)!==BASELINE&&!original.json.meshes.find(m=>m.name==='opening_street_ground')?.extras?.openingGroundRevision)throw Error('Unexpected opening input revision; inspect before rebuilding');
  const result=patchOpeningGround(original),bytes=encodeGlb(result.json,result.bin),unchanged={};
  for(const mesh of original.json.meshes.filter(m=>m.name!=='opening_street_ground')){
    const beforeHash=meshFingerprint(original,mesh),afterHash=meshFingerprint(result,result.json.meshes.find(m=>m.name===mesh.name));if(beforeHash!==afterHash)throw Error(`Unexpected edit to ${mesh.name}`);unchanged[mesh.name]=beforeHash;
  }
  const imageHashes=p=>p.json.images.map(i=>{const v=p.json.bufferViews[i.bufferView];return sha(p.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));});
  if(JSON.stringify(imageHashes(original))!==JSON.stringify(imageHashes(result))||JSON.stringify(original.json.materials)!==JSON.stringify(result.json.materials)||JSON.stringify(original.json.nodes)!==JSON.stringify(result.json.nodes))throw Error('Opening assets other than ground changed');
  stats.bytes=bytes.length;stats.sha256=sha(bytes);const mesh=result.json.meshes.find(m=>m.name==='opening_street_ground'),ground=stats.meshes.find(m=>m.name===mesh.name),low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];ground.triangles=0;ground.vertices=0;
  for(const p of mesh.primitives){const a=result.json.accessors[p.attributes.POSITION];ground.vertices+=a.count;ground.triangles+=result.json.accessors[p.indices].count/3;for(let k=0;k<3;k++){low[k]=Math.min(low[k],a.min[k]);high[k]=Math.max(high[k],a.max[k]);}}
  ground.bounds={min:low,max:high};stats.totalTriangles=stats.meshes.reduce((s,m)=>s+m.triangles,0);stats.materialAreas.opening_street_ground=Object.fromEntries(['asphalt','cobbles','grass'].map(role=>[role,OPENING_GROUND_PANELS.filter(p=>p.role===role).reduce((s,p)=>s+p.w*p.d,0)]));
  stats.groundReceiver={revision:1,generator:'tools/chunk_surfer/rebuild-opening-ground.mjs',originalInputSha256:BASELINE,unchangedMeshes:unchanged,embeddedImageHashes:imageHashes(result),materialsUnchanged:true,nodesUnchanged:true};
  const creditsFile=file.replace('.glb','.credits.json'),credits=JSON.parse(fs.readFileSync(creditsFile,'utf8'));credits.pack={sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles};credits.groundReceiver={revision:1,generator:stats.groundReceiver.generator};
  fs.writeFileSync(file,bytes);fs.writeFileSync(statsFile,JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(creditsFile,JSON.stringify(credits,null,2)+'\n');
  const artifactFile=path.join(root,'artifacts/opening-street-assets.json'),artifact=JSON.parse(fs.readFileSync(artifactFile,'utf8'));artifact.build={...artifact.build,...stats};fs.writeFileSync(artifactFile,JSON.stringify(artifact,null,2)+'\n');
  console.log(JSON.stringify({sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles,groundBounds:ground.bounds,materialAreas:stats.materialAreas.opening_street_ground,otherMeshesPreserved:Object.keys(unchanged),imagesPreserved:result.json.images.length},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
