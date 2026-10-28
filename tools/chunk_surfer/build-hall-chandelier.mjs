// Build only the paired hall installation. Never rewrites the shared packs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'public/assets/conservatory-acquisitions.glb');
const output=path.join(root,'public/assets/hall-chandelier-proof.glb');
const blend=path.join(root,'artifacts/chandelier-treatment/hall-chandelier-proof.blend');
const generated=path.join(root,'src/data/generated/hall-chandelier-geometry.js');
const blender=process.env.BLENDER_BIN||'/Applications/Blender.app/Contents/MacOS/Blender';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceSHA256=sha(fs.readFileSync(source));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'hall-chandelier-'));
fs.mkdirSync(path.dirname(blend),{recursive:true});
const reportFile=path.join(work,'report.json');
try{
  const result=spawnSync(blender,['--background','--factory-startup','--python',
    fileURLToPath(new URL('./build-hall-chandelier.py',import.meta.url)),'--',
    '--source',source,'--output',output,'--blend',blend,'--report',reportFile],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`Hall chandelier Blender stage failed (${result.status})`);
  const bytes=fs.readFileSync(output),length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length));
  const bin=bytes.subarray(28+length);
  const strip=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(strip);return;}delete value.extensions;for(const item of Object.values(value))strip(item);};
  strip(json);delete json.extensionsUsed;delete json.extensionsRequired;delete json.animations;delete json.skins;
  // The supported glass remains opaque coverage; this does not add blending.
  for(const material of json.materials||[]){
    if(material.alphaMode==='BLEND'){material.alphaMode='MASK';material.alphaCutoff=.45;}
    if(material.extras?.chandelierRole!=='lamp')material.emissiveFactor=[0,0,0];
  }
  const raw=Buffer.from(JSON.stringify(json)),jl=Math.ceil(raw.length/4)*4,bl=Math.ceil(bin.length/4)*4;
  const final=Buffer.alloc(28+jl+bl);final.write('glTF');final.writeUInt32LE(2,4);final.writeUInt32LE(final.length,8);
  final.writeUInt32LE(jl,12);final.writeUInt32LE(0x4e4f534a,16);final.fill(32,20,20+jl);raw.copy(final,20);
  final.writeUInt32LE(bl,20+jl);final.writeUInt32LE(0x004e4942,24+jl);bin.copy(final,28+jl);
  fs.writeFileSync(output,final);
  const report=JSON.parse(fs.readFileSync(reportFile));
  const meshes=Object.fromEntries(json.meshes.map(mesh=>{
    const accessors=mesh.primitives.map(p=>json.accessors[p.attributes.POSITION]);
    return[mesh.name,{name:mesh.name,triangles:mesh.primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0),
      primitives:mesh.primitives.length,bounds:{min:[0,1,2].map(k=>Math.min(...accessors.map(a=>a.min[k]))),max:[0,1,2].map(k=>Math.max(...accessors.map(a=>a.max[k])))},
      materials:mesh.primitives.map(p=>({name:json.materials[p.material].name,role:json.materials[p.material].extras?.chandelierRole||'retained-source',triangles:json.accessors[p.indices].count/3}))}];
  }));
  const names=['hall_chandelier_body','hall_chandelier_support_west','hall_chandelier_support_east'];
  if(names.some(name=>!meshes[name])||Object.keys(meshes).length!==3)throw Error('Hall chandelier mesh contract failed');
  const totalTriangles=Object.values(meshes).reduce((n,m)=>n+m.triangles,0);
  if(totalTriangles>18000||final.length>3000000)throw Error(`Hall proof resource budget exceeded (${totalTriangles} tris, ${final.length} bytes)`);
  for(const key of ['west','east'])if(Math.abs(meshes[`hall_chandelier_support_${key}`].bounds.max[1]-2.8)>.00001)throw Error('Ceiling contact failed');
  const lamps=report.lamps.map(({index,center,emitterCenter,ring,emitterBounds,emitterTriangles})=>({index,center,emitterCenter,ring,emitterBounds,emitterTriangles}));
  const sectors=[0,1,2].map(index=>{
    const selected=lamps.filter(lamp=>{
      const a=Math.atan2(lamp.emitterCenter[2],lamp.emitterCenter[0]);
      // Sector boundaries pass between both rings, never through an inner lamp.
      return((Math.floor((a+Math.PI/6)/(2*Math.PI/3))%3)+3)%3===index;
    });
    if(selected.length!==6)throw Error(`Sector ${index} has ${selected.length} lamps, expected six`);
    return{id:`hall-chandelier-sector-${index}`,index,center:[0,1,2].map(k=>selected.reduce((n,lamp)=>n+lamp.emitterCenter[k],0)/selected.length),
      count:selected.length,weight:selected.length/lamps.length,bulbIndices:selected.map(lamp=>lamp.index)};
  });
  const placement={scale:3,originWorldY:7.1,ceilingWorldY:15.5,ceilingLocalY:2.8};
  const geometry={revision:report.revision,meshNames:{body:names[0],westSupport:names[1],eastSupport:names[2]},placement,
    lamps,sectors,bounds:Object.fromEntries(Object.entries(meshes).map(([name,m])=>[name,m.bounds]))};
  fs.writeFileSync(generated,'// Generated by tools/chunk_surfer/build-hall-chandelier.mjs. Local metres; existing instance scale 3.\n'
    +'export const HALL_CHANDELIER_GEOMETRY = Object.freeze('+JSON.stringify(geometry)+');\n');
  const stats={...report,source:'public/assets/conservatory-acquisitions.glb',sourceSHA256,bytes:final.length,sha256:sha(final),
    totalTriangles,meshes,lamps,sectors,
    budgets:{storedTriangles:18000,bytes:3000000,pairedTriangles:28000,pairedPrimitiveDraws:8},
    baseline:{pairedTriangles:19600,pairedPrimitiveDraws:2,explanation:'Two original identical mesh instances share two primitive draws.'},
    pairedTriangles:meshes[names[0]].triangles*2+meshes[names[1]].triangles+meshes[names[2]].triangles,
    pairedPrimitiveDraws:meshes[names[0]].primitives+meshes[names[1]].primitives+meshes[names[2]].primitives,
    textureBytes:(json.images||[]).reduce((n,i)=>n+json.bufferViews[i.bufferView].byteLength,0),
    textureCount:json.images?.length||0,
    validationPending:['Final dither walking and stationary acceptance','Uninstrumented GPU/frame timing','Independent reference and unfamiliar-player review']};
  if(stats.pairedTriangles>stats.budgets.pairedTriangles||stats.pairedPrimitiveDraws>stats.budgets.pairedPrimitiveDraws)
    throw Error(`Hall proof paired renderer budget exceeded (${stats.pairedTriangles} tris, ${stats.pairedPrimitiveDraws} primitive draws)`);
  const credits={revision:report.revision,source:'https://polyhaven.com/a/Chandelier_03',license:'CC0-1.0',
    originalArchive:'Chandelier_03_4k.blend.zip',originalArchiveSHA256:'455651002ca626d14825a1391b1c65bb6cd7023b893e4f71ce5158628df8389f',
    derivedFrom:stats.source,derivedFromSHA256:sourceSHA256,
    retained:'Original shipped body positions, UVs, broad material maps and silhouette. Existing upper bulb triangles separated for emission; no duplicate bulbs.',
    authored:'Relocated original ceiling canopy and upper shackle, with complete alternating-link suspension and six heavier replacement lower links on west fitting.',
    materialApproximation:'Opaque glass coverage. No transmission, refraction or caustic claim.',sha256:stats.sha256};
  fs.writeFileSync(output.replace('.glb','.stats.json'),JSON.stringify(stats,null,2)+'\n');
  fs.writeFileSync(output.replace('.glb','.credits.json'),JSON.stringify(credits,null,2)+'\n');
  if(sha(fs.readFileSync(source))!==sourceSHA256)throw Error('Shared acquisition pack changed during proof build');
  console.log(JSON.stringify({bytes:stats.bytes,totalTriangles,pairedTriangles:stats.pairedTriangles,pairedPrimitiveDraws:stats.pairedPrimitiveDraws,lamps:lamps.length,sectors:sectors.length},null,2));
}finally{fs.rmSync(work,{recursive:true,force:true});}
