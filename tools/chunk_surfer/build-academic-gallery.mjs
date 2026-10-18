// Isolated editable Blender authoring; never rebuilds a shared asset pack.
import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../..');
const dir=path.join(root,'artifacts/academic-gallery-realignment');
const output=path.join(root,'public/assets/academic-gallery.glb');
const blend=path.join(dir,'academic-gallery.blend');
const reportFile=path.join(dir,'academic-gallery-build.json');
const source=path.join(import.meta.dirname,'build-academic-gallery.py');
const normalizeOnly=process.argv.includes('--normalize-only');
// Keep the last accepted production asset intact until all new bytes validate.
const buildOutput=normalizeOnly?output:output.replace('.glb','.working.glb');
const buildBlend=normalizeOnly?blend:blend.replace('.blend','.working.blend');
const buildReport=normalizeOnly?reportFile:reportFile.replace('.json','.working.json');
if(!normalizeOnly){
 const blender=process.env.BLENDER_BIN||(process.platform==='darwin'?'/Applications/Blender.app/Contents/MacOS/Blender':'blender');
 const r=cp.spawnSync(blender,['--background','--factory-startup','--python',source,'--','--output',buildOutput,'--blend',buildBlend,'--report',buildReport],{stdio:'inherit'});
 if(r.error)throw r.error;
 if(r.status!==0)throw new Error(`Gallery Blender exited ${r.status}`);
}
const bytes=fs.readFileSync(buildOutput);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB2');
let at=12,json,bin;
while(at<bytes.length){const n=bytes.readUInt32LE(at),kind=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+n);if(kind===0x4e4f534a)json=JSON.parse(chunk.toString().trim());if(kind===0x004e4942)bin=Buffer.from(chunk);at+=n+8;}
const strip=v=>{if(!v||typeof v!=='object')return;delete v.extensions;for(const c of Object.values(v))strip(c);};
delete json.extensionsUsed;delete json.extensionsRequired;strip(json);
if(json.animations||json.skins||json.accessors.some(a=>a.sparse))throw new Error('Unsupported dynamic GLB');
if(json.nodes.some(n=>n.matrix||n.translation||n.rotation||n.scale||n.children?.length))throw new Error('Identity flat roots required');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const textures=[],remap=[],keys=new Map();
for(const t of json.textures||[]){const k=JSON.stringify(canonical(t));if(!keys.has(k)){keys.set(k,textures.length);textures.push(t);}remap.push(keys.get(k));}
const remapTextures=v=>{if(!v||typeof v!=='object')return;for(const[k,c]of Object.entries(v)){if(/Texture$/.test(k)&&Number.isInteger(c?.index))c.index=remap[c.index];else remapTextures(c);}};
for(const m of json.materials){remapTextures(m);const p=m.pbrMetallicRoughness;if(!p.baseColorTexture||!p.metallicRoughnessTexture||!m.normalTexture)throw new Error('Three shared authored maps required');p.metallicFactor=1;p.roughnessFactor=1;}
json.textures=textures;
function accessor(index){
 const a=json.accessors[index],view=json.bufferViews[a.bufferView],count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],stride=view.byteStride||size*count,start=(view.byteOffset||0)+(a.byteOffset||0);if(!count||!size)throw new Error('Unsupported accessor');
 const read=(p)=>a.componentType===5126?bin.readFloatLE(p):a.componentType===5125?bin.readUInt32LE(p):a.componentType===5123?bin.readUInt16LE(p):bin[p];
 return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,k)=>read(start+i*stride+k*size)));
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
function closedWinding(triangles){
 const points=new Map(),owners=new Map(),parents=triangles.map((_,i)=>i),faces=[];
 const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
 for(let f=0;f<triangles.length;f++){
  const ids=triangles[f].map(p=>{const k=p.map(v=>v.toFixed(6)).join(',');if(!points.has(k))points.set(k,points.size);return points.get(k);});faces.push(ids);
  for(const v of ids){if(owners.has(v)){const a=find(f),b=find(owners.get(v));if(a!==b)parents[a]=b;}else owners.set(v,f);}
 }
 const groups=new Map();
 for(let i=0;i<triangles.length;i++){const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
 return[...groups.values()].map(group=>{
  let volume=0;const edges=new Map(),low=[Infinity,Infinity,Infinity],high=low.map(v=>-v);
  for(const i of group){const t=triangles[i],c=cross(t[1],t[2]);volume+=t[0].reduce((s,v,k)=>s+v*c[k],0)/6;
   for(const p of t)for(let k=0;k<3;k++){low[k]=Math.min(low[k],p[k]);high[k]=Math.max(high[k],p[k]);}
   const ids=faces[i];for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);}
  }
  return{triangles:group.length,closed:[...edges.values()].every(n=>n===2),signedVolumeM3:volume,bounds:{min:low,max:high}};
 });
}
const meshes=json.meshes.map(mesh=>{
 let triangles=0,vertices=0,nonfinite=0,badNormal=0,opposedNormal=0,degenerate=0,voidTopOverlap=0;const triangleData=[],low=[Infinity,Infinity,Infinity],high=low.map(n=>-n);
 for(const p of mesh.primitives){
  if((p.mode??4)!==4||!Number.isInteger(p.indices))throw new Error('Indexed triangles required');
  for(const k of['POSITION','NORMAL','TEXCOORD_0'])if(!Number.isInteger(p.attributes[k]))throw new Error(`${mesh.name}: missing ${k}`);
  const pos=accessor(p.attributes.POSITION),norm=accessor(p.attributes.NORMAL),uv=accessor(p.attributes.TEXCOORD_0),idx=accessor(p.indices).flat();triangles+=idx.length/3;vertices+=pos.length;
  for(const v of pos)for(let k=0;k<3;k++){low[k]=Math.min(low[k],v[k]);high[k]=Math.max(high[k],v[k]);}
  nonfinite+=[...pos,...norm,...uv].filter(v=>v.some(n=>!Number.isFinite(n))).length;
  badNormal+=norm.filter(n=>Math.abs(Math.hypot(...n)-1)>.02).length;
  for(let i=0;i<idx.length;i+=3){const[a,b,c]=idx.slice(i,i+3).map(k=>pos[k]),n=cross(sub(b,a),sub(c,a));triangleData.push([a,b,c]);if(Math.hypot(...n)<1e-11)degenerate++;
   const avg=[0,1,2].map(k=>norm[idx[i]][k]+norm[idx[i+1]][k]+norm[idx[i+2]][k]);if(n.reduce((s,v,k)=>s+v*avg[k],0)<-1e-9)opposedNormal++;
   // All horizontal walking faces must remain outside the actual nav void.
   const center=[0,1,2].map(k=>(a[k]+b[k]+c[k])/3);
   if(['gallery_floor','gallery_atrium_structure'].includes(mesh.name)&&Math.abs(n[1])>.99*Math.hypot(...n)&&center[1]>-.05&&center[1]<.03&&center[0]>-6+1e-6&&center[0]<4-1e-6&&center[2]>-7+1e-6&&center[2]<6-1e-6)voidTopOverlap++;
  }
 }
 const components=closedWinding(triangleData),inwardClosedComponents=components.filter(c=>c.closed&&c.signedVolumeM3<-1e-9).length;
 if(nonfinite||badNormal||opposedNormal||degenerate||voidTopOverlap||inwardClosedComponents)throw new Error(`${mesh.name}: invalid geometry ${JSON.stringify({nonfinite,badNormal,opposedNormal,degenerate,voidTopOverlap,inwardClosedComponents})}`);
 mesh.extras={...(mesh.extras||{}),bounds:{min:low,max:high}};
 return{name:mesh.name,triangles,vertices,primitives:mesh.primitives.length,bounds:{min:low,max:high},validation:{nonfinite,badNormal,opposedNormal,degenerate,voidTopOverlap,inwardClosedComponents},components};
});
const sizes=json.images.map(im=>{if(im.mimeType!=='image/png')throw new Error('Authored PNG required');const v=json.bufferViews[im.bufferView],p=v.byteOffset||0;return{width:bin.readUInt32BE(p+16),height:bin.readUInt32BE(p+20)};});
const allocations=json.textures.map((t,index)=>{const size=sizes[t.source];let w=size.width,h=size.height,n=0;while(true){n+=w*h;if(w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}return{index,image:t.source,sampler:t.sampler??null,...size,rgbaMipBytes:n*4};});
const mipBytes=allocations.reduce((s,a)=>s+a.rgbaMipBytes,0);
const raw=Buffer.from(JSON.stringify(json)),jl=Math.ceil(raw.length/4)*4,bl=Math.ceil(bin.length/4)*4,final=Buffer.alloc(28+jl+bl);
final.write('glTF');final.writeUInt32LE(2,4);final.writeUInt32LE(final.length,8);final.writeUInt32LE(jl,12);final.writeUInt32LE(0x4e4f534a,16);final.fill(32,20,20+jl);raw.copy(final,20);final.writeUInt32LE(bl,20+jl);final.writeUInt32LE(0x004e4942,24+jl);bin.copy(final,28+jl);
if(final.length>6*1024*1024||mipBytes>8*1024*1024)throw new Error('Gallery asset allocation exceeds budget');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report=JSON.parse(fs.readFileSync(buildReport));report.export={bytes:final.length,sha256:sha(final),meshes,materialCount:json.materials.length,rootNodes:json.nodes.length,imageCount:json.images.length,textureDescriptorCount:json.textures.length,gpuTextureAllocations:allocations,estimatedMipmappedTextureBytes:mipBytes,allNodeTransformsIdentity:true,coreGltfOnly:true,blendSha256:sha(fs.readFileSync(buildBlend)),sourceSha256:sha(fs.readFileSync(source)),wrapperSha256:sha(fs.readFileSync(import.meta.filename))};
fs.writeFileSync(buildOutput,final);
if(!normalizeOnly){fs.renameSync(buildBlend,blend);fs.renameSync(buildOutput,output);fs.unlinkSync(buildReport);}
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(output.replace('.glb','.stats.json'),JSON.stringify(report,null,2)+'\n');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'tools/chunk_surfer/acquisition-sources.json')));
const scan=provenance.sources?.find(s=>s.mesh==='marble_bust_01')||provenance.assets?.find(s=>s.id==='marble_bust_01');
fs.writeFileSync(output.replace('.glb','.credits.json'),JSON.stringify({version:1,asset:'academic-gallery.glb',source:'tools/chunk_surfer/build-academic-gallery.py',editableBlend:'artifacts/academic-gallery-realignment/academic-gallery.blend',authorship:'Project-authored geometry and atlases; scan-derived anonymous broken bust noted separately.',sources:[{id:'marble_bust_01',url:'https://polyhaven.com/a/marble_bust_01',license:'CC0-1.0',use:'Existing acquired scan physically clipped/capped/decimated for gallery_fragment only; intact and canonical socketed/returned busts remain untouched.',localSource:'public/assets/conservatory-acquisitions.glb',acquisitionRecord:scan||'tools/chunk_surfer/acquisition-sources.json'},{id:'existing-atrium',license:'Project source',use:'Existing academic plaster slab/support geometry retained outside compiled void; bronze rails replaced.',localSource:'public/assets/conservatory-props.glb'}],historicalReferences:'artifacts/academic-gallery-realignment/research.md; reference-only, no reference image embedded.'},null,2)+'\n');
console.log(`Academic gallery: ${final.length} bytes, ${report.catalogueTriangles} catalogue triangles, ${report.addedCatalogueTriangles} added, ${mipBytes} mip bytes, ${meshes.length} identity root meshes.`);
