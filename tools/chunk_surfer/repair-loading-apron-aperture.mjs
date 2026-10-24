// Bounded CPU rebuild of the two skins around the existing loading apron.
// Refuses a stale/unknown mesh and preserves unrelated geometry and media.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { ELLERY_MASSING } from '../../src/data/exterior-district.js';
import { BUILDING_WINDOW_HOST_ORIGINS, subtractBuildingWindowBoxes } from './building-window-geometry.mjs';
import { parseGlb, encodeGlb, meshFingerprint } from './rebuild-tree-crowns.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const align=n=>(n+3)&~3;
const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessorBytes(pack,id){
  const a=pack.json.accessors[id],v=pack.json.bufferViews[a.bufferView],width=dimensions[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType]*width,start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size;
  return Buffer.concat(Array.from({length:a.count},(_,i)=>pack.bin.subarray(start+i*stride,start+i*stride+size)));
}
function readFloat(pack,id){const b=accessorBytes(pack,id);return Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));}
function appender(input){
  const json=structuredClone(input.json),chunks=[Buffer.from(input.bin)];let length=input.bin.length;
  return {json,accessor(old,values,width,integer=false){
    const typed=integer?new Uint32Array(values):new Float32Array(values),bytes=Buffer.from(typed.buffer);
    if(old!==undefined&&accessorBytes(input,old).equals(bytes))return old;
    const offset=align(length);if(offset>length)chunks.push(Buffer.alloc(offset-length));chunks.push(bytes);length=offset+bytes.length;
    const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
    const a={bufferView:view,componentType:integer?5125:5126,count:values.length/width,type:width===1?'SCALAR':`VEC${width}`};
    if(width===3&&!integer){a.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}
    const id=json.accessors.length;json.accessors.push(a);return id;
  },finish(){json.buffers=[{byteLength:length}];return{json,bin:Buffer.concat(chunks)};}};
}
export function elevationRecipe(source,{legacy=false}={}){
  // Execute only the selected existing recipe and primitive definitions. No
  // global asset build, lettering rasterizer, source intake or file IO runs.
  const ranges=[['const MAT = {','\n};'],['function addBox(', '// A FLAT PLATE'],['function addCylinder(', 'function addCylinderX('],['function addBeam(', 'function addPlateBeamXY('],['function addWallArch(', 'function addSecondPerimeterWall('],['function addTriangle(', '// A closed loft:']];
  const fragments=ranges.map(([a,b])=>{const i=source.indexOf(a),j=source.indexOf(b,i+1);if(i<0||j<0)throw Error(`Selected recipe boundary changed: ${a}`);return source.slice(i,j)+(a==='const MAT = {'?'\n};':'');});
  const start=source.indexOf('{\n  // THE BUILDING, FROM THE YARD.'),end=source.indexOf('{\n  // THE ONE LIT WINDOW ON THE BUILDING.');
  if(start<0||end<start)throw Error('Selected elevation boundary changed');
  let block=source.slice(start,end);
  if(!block.includes('mouthA=-4.0,mouthB=5.0'))throw Error('Apron source opening is not the reviewed revision');
  if(legacy)block=block.replace('mouthA=-4.0,mouthB=5.0','mouthA=-4.0,mouthB=3.6');
  const context={ELLERY_MASSING,BUILDING_WINDOW_HOST_ORIGINS,subtractBuildingWindowBoxes,signAssemblies:{isCarrier:()=>false}};
  vm.runInNewContext(`const meshes=new Map();const mesh=name=>{const m={name,groups:new Map()};meshes.set(name,m);return m;};const group=(m,mat)=>{if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],indices:[],uvs:[]});return m.groups.get(mat);};${fragments.join('\n')}\n${block}\nresult=meshes.get('conservatory_west_elevation');`,context,{timeout:10000});
  return context.result;
}
function recipeMatches(pack,mesh,recipe){
  if(mesh.primitives.length!==recipe.groups.size)return false;
  return [...recipe.groups].every(([material,g])=>{const p=mesh.primitives.find(p=>p.material===material);if(!p)return false;
    return [['POSITION',g.positions],['NORMAL',g.normals],['TEXCOORD_0',g.uvs.length?g.uvs:new Array(g.positions.length/3*2).fill(0)],['indices',g.indices]].every(([key,values])=>accessorBytes(pack,key==='indices'?p.indices:p.attributes[key]).equals(Buffer.from((key==='indices'?new Uint32Array(values):new Float32Array(values)).buffer)));
  });
}
export function patchElevation(input,source){
  const current=input.json.meshes.find(m=>m.name==='conservatory_west_elevation'),next=elevationRecipe(source);
  if(recipeMatches(input,current,next))return input;
  if(!recipeMatches(input,current,elevationRecipe(source,{legacy:true})))throw Error('Current elevation differs from both exact reviewed recipes; refusing to replace it');
  const out=appender(input),mesh=out.json.meshes.find(m=>m.name===current.name);
  mesh.primitives=[...next.groups].map(([material,g])=>{const p=current.primitives.find(p=>p.material===material);return{...p,attributes:{...p.attributes,
    POSITION:out.accessor(p.attributes.POSITION,g.positions,3),NORMAL:out.accessor(p.attributes.NORMAL,g.normals,3),
    TEXCOORD_0:out.accessor(p.attributes.TEXCOORD_0,g.uvs.length?g.uvs:new Array(g.positions.length/3*2).fill(0),2)},indices:out.accessor(p.indices,g.indices,1,true)};});
  return out.finish();
}
const legacyFrontage=[['roughStone',-.24,-7.5,1,.04,.98],['roughStone',-.24,4,84.5,.04,.98],['brick',-.25,-4,1,.98,5.55],['brick',-.25,1,4,3.42,5.55],['weatheredRender',-.26,5,12,1.02,5.45],['weatheredRender',-.26,72,76,1.02,4.05],['brick',-.27,44.5,64.5,1.02,8.45]];
const quad=([role,x,z0,z1,y0,y1])=>[x,y0,z0,x,y0,z1,x,y1,z1,x,y1,z0];
export function patchOpeningFrontage(input,source){
  const block=source.slice(source.indexOf('    frontage = MeshBuilder('),source.indexOf('    obj, report = frontage.finish()'));
  const next=[...block.matchAll(/frontage\.wall_x\("([^"]+)",\s*([^\n)]+)\)/g)].map(m=>[m[1],...m[2].split(',').map(Number)]);
  if(next.length!==7||next.some(q=>q.slice(1).some(v=>!Number.isFinite(v))))throw Error('Unrecognized frontage recipes');
  const out=appender(input),mesh=out.json.meshes.find(m=>m.name==='opening_street_frontage');
  for(const p of mesh.primitives){
    const role=input.json.materials[p.material].extras.openingStreetRole,oldQuads=legacyFrontage.filter(q=>q[0]===role),newQuads=next.filter(q=>q[0]===role);
    const positions=readFloat(input,p.attributes.POSITION),expected=oldQuads.flatMap(quad),replacement=newQuads.flatMap(quad),asBytes=v=>Buffer.from(new Float32Array(v).buffer);
    if(asBytes(positions).equals(asBytes(replacement)))continue;
    if(!asBytes(positions).equals(asBytes(expected)))throw Error(`Unrecognized original ${role} receiver; refusing overwrite`);
    const uv=readFloat(input,p.attributes.TEXCOORD_0),tile=role==='roughStone'?2:role==='brick'?1:3.2;
    for(let i=0;i<positions.length/3;i++){uv[i*2]+=(replacement[i*3+2]-positions[i*3+2])/tile;uv[i*2+1]-=(replacement[i*3+1]-positions[i*3+1])/tile;}
    p.attributes.POSITION=out.accessor(p.attributes.POSITION,replacement,3);p.attributes.TEXCOORD_0=out.accessor(p.attributes.TEXCOORD_0,uv,2);
  }
  return out.finish();
}
function summary(pack,name){
  const m=pack.json.meshes.find(m=>m.name===name),points=m.primitives.flatMap(p=>readFloat(pack,p.attributes.POSITION));
  return {bounds:{min:[0,1,2].map(k=>Math.round(Math.min(...points.filter((_,i)=>i%3===k))*1000)/1000),max:[0,1,2].map(k=>Math.round(Math.max(...points.filter((_,i)=>i%3===k))*1000)/1000)},triangles:m.primitives.reduce((n,p)=>n+pack.json.accessors[p.indices].count/3,0),vertices:m.primitives.reduce((n,p)=>n+pack.json.accessors[p.attributes.POSITION].count,0)};
}
function preservation(before,after,name){
  const unchanged={};for(const m of before.json.meshes){if(m.name===name)continue;const hash=meshFingerprint(before,m);if(hash!==meshFingerprint(after,after.json.meshes.find(n=>n.name===m.name)))throw Error(`Unrelated mesh changed: ${m.name}`);unchanged[m.name]=hash;}
  for(const key of ['materials','nodes','textures','samplers','images'])if(JSON.stringify(before.json[key])!==JSON.stringify(after.json[key]))throw Error(`Unrelated ${key} changed`);
  const imageHashes=pack=>(pack.json.images||[]).map(image=>{const v=pack.json.bufferViews[image.bufferView];return sha(pack.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));});
  if(JSON.stringify(imageHashes(before))!==JSON.stringify(imageHashes(after)))throw Error('Embedded image changed');
  return{unrelatedMeshFingerprints:unchanged,materialsUnchanged:true,nodesUnchanged:true,texturesUnchanged:true,embeddedImageHashes:imageHashes(after)};
}
async function main(){
  const report={scope:'Outer apron only; two existing stair flights and canonical interior Get-In leaf unchanged',mouth:{worldZ:[3.5,12.5],head:5.5},packs:{}};
  for(const [base,name,builder,patch]of [['conservatory-props','conservatory_west_elevation','build-props.mjs',patchElevation],['opening-street','opening_street_frontage','build-opening-street.py',patchOpeningFrontage]]){
    const file=path.join(root,`public/assets/${base}.glb`),beforeBytes=fs.readFileSync(file),before=parseGlb(beforeBytes),creditsFile=file.replace('.glb','.credits.json'),statsFile=file.replace('.glb','.stats.json'),credits=JSON.parse(fs.readFileSync(creditsFile)),stats=JSON.parse(fs.readFileSync(statsFile));
    if(credits.pack.sha256!==sha(beforeBytes))throw Error(`${base} credits are stale; refusing overwrite`);
    const source=fs.readFileSync(path.join(root,'tools/chunk_surfer',builder),'utf8'),after=patch(before,source),bytes=encodeGlb(after.json,after.bin),next=summary(after,name),prior=summary(before,name),proof=preservation(before,after,name);
    report.packs[base]={beforeSha256:sha(beforeBytes),afterSha256:sha(bytes),beforeMeshFingerprint:meshFingerprint(before,before.json.meshes.find(m=>m.name===name)),afterMeshFingerprint:meshFingerprint(after,after.json.meshes.find(m=>m.name===name)),before:prior,after:next,source:builder,sourceSha256:sha(source),...proof};
    stats.bytes=bytes.length;if('sha256'in stats)stats.sha256=sha(bytes);stats.totalTriangles+=next.triangles-prior.triangles;
    if(Array.isArray(stats.meshes)){Object.assign(stats.meshes.find(m=>m.name===name),next);}else{Object.assign(stats.meshes[name],{triangles:next.triangles,vertices:next.vertices});stats.bounds[name]=next.bounds;}
    const revision={revision:1,repair:'tools/chunk_surfer/repair-loading-apron-aperture.mjs',mouth:report.mouth};stats.loadingApronAperture=revision;credits.loadingApronAperture=revision;Object.assign(credits.pack,{sha256:sha(bytes),bytes:bytes.length,triangles:stats.totalTriangles});
    if(credits.meshes){const entry=credits.meshes.find(m=>m.name===name);Object.assign(entry,{bounds:next.bounds,triangles:next.triangles});}
    if(base==='opening-street'){
      const area={};const s=source.slice(source.indexOf('    frontage = MeshBuilder('),source.indexOf('    obj, report = frontage.finish()'));
      for(const m of s.matchAll(/frontage\.wall_x\("([^"]+)",\s*([^\n)]+)\)/g)){const[x,z0,z1,y0,y1]=m[2].split(',').map(Number);area[m[1]]=(area[m[1]]||0)+(z1-z0)*(y1-y0);}stats.materialAreas[name]=area;
    }
    if(sha(fs.readFileSync(file))!==sha(beforeBytes))throw Error(`${base} changed while repairing; retry`);
    fs.writeFileSync(file,bytes);fs.writeFileSync(statsFile,JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(creditsFile,JSON.stringify(credits,null,2)+'\n');
    if(base==='opening-street'){const af=path.join(root,'artifacts/opening-street-assets.json'),a=JSON.parse(fs.readFileSync(af));a.build=stats;a.loadingApronAperture=revision;fs.writeFileSync(af,JSON.stringify(a,null,2)+'\n');}
    else{const gf=path.join(root,'src/data/generated/prop-geometry.js'),g=fs.readFileSync(gf,'utf8'),line=/^export const PROP_BOUNDS = Object\.freeze\(([^\n]+)\);$/m.exec(g);if(!line)throw Error('Prop bounds declaration changed');const bounds=JSON.parse(line[1]);bounds[name]=next.bounds;fs.writeFileSync(gf,g.replace(line[0],`export const PROP_BOUNDS = Object.freeze(${JSON.stringify(bounds)});`));}
  }
  const dir=path.join(root,'artifacts/exterior-access-repairs');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'loading-apron-asset-repair.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.packs).map(([k,v])=>[k,{before:v.beforeSha256,after:v.afterSha256,triangles:v.after.triangles,unrelatedMeshesPreserved:Object.keys(v.unrelatedMeshFingerprints).length}])),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
