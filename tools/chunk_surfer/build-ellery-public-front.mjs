// Extract and repair only the existing scenic hero elevation, then append the
// actual atrium face, shallow public forecourt and high D0 fanlight. Never
// writes the shared prop pack or any room/door/save data.
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{fileURLToPath}from'node:url';
import{NodeIO}from'@gltf-transform/core';import{prune}from'@gltf-transform/functions';
import{ELLERY_PUBLIC_FRONT as C,ELLERY_PUBLIC_FRONT_REVISION as REV,ELLERY_PUBLIC_FRONT_LETTERING as PRINT,ELLERY_PUBLIC_FRONT_HERO_CLIPS as HERO_CLIPS}from'../../src/data/ellery-public-front.js';
import{elleryPublicFrontGeometry,ELLERY_PUBLIC_MATERIALS,heroFingerprint}from'./ellery-public-front-geometry.mjs';
import{subtractTriangleBox}from'./exterior-stationers-geometry.mjs';
import{bakeLetteringAtlases,printedSurfaceMetadata}from'./lettering/physical-lettering.mjs';
import{printedFaceGeometry}from'./lettering/face-geometry.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),sourcePath=process.env.ELLERY_PUBLIC_SOURCE_PACK||path.join(root,'public/assets/conservatory-props.glb');
const out=path.join(root,'public/assets/ellery-public-front.glb'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceBytes=fs.readFileSync(sourcePath),io=new NodeIO(),doc=await io.readBinary(sourceBytes),dr=doc.getRoot();
const hero=dr.listMeshes().find(m=>m.getName()===C.hero.mesh);if(!hero)throw Error('Actual scenic hero mesh is missing');
const sourceFingerprint=heroFingerprint(hero),sourceTriangles=hero.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),originalNames=dr.listMeshes().map(m=>m.getName());
for(const n of dr.listNodes())if(n.getMesh()!==hero)n.dispose();
for(const m of dr.listMeshes())if(m!==hero)m.dispose();
await doc.transform(prune({keepAttributes:true,keepExtras:true,keepSolidTextures:true}));
const baselineBytes=(await io.writeBinary(doc)).length,buffer=dr.listBuffers()[0]||doc.createBuffer(),clip=[];
const add=(name,array,type,integer=false)=>doc.createAccessor(name).setType(type).setArray(integer?new Uint32Array(array):new Float32Array(array)).setBuffer(buffer);
for(const p of hero.listPrimitives()){
 const position=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0'),index=p.getIndices().getArray();
 const positions=Array.from(position.getArray()),normals=Array.from(normal.getArray()),uvs=Array.from(uv.getArray()),kept=[];
 const receipt={material:p.getMaterial().getName(),inputTriangles:index.length/3,unchangedTriangles:0,changedTriangles:0,removedTriangles:0,clippedTriangles:0};
 for(let i=0;i<index.length;i+=3){
  const ids=[index[i],index[i+1],index[i+2]],triangle=ids.map(k=>({position:position.getElement(k,[]),normal:normal.getElement(k,[]),uv:uv.getElement(k,[])}));
  let pieces=[triangle],changed=false;
  for(const box of HERO_CLIPS){const next=[];for(const part of pieces){const sub=subtractTriangleBox(part,box);changed ||= sub.changed;next.push(...sub.triangles);}pieces=next;}
  if(!changed){kept.push(...ids);receipt.unchangedTriangles++;continue;}
  receipt.changedTriangles++;if(!pieces.length)receipt.removedTriangles++;
  for(const t of pieces){const start=positions.length/3;for(const v of t){positions.push(...v.position);const length=Math.hypot(...v.normal)||1;normals.push(...v.normal.map(n=>n/length));uvs.push(...v.uv);}kept.push(start,start+1,start+2);receipt.clippedTriangles++;}
 }
 if(!kept.length){hero.removePrimitive(p);p.dispose();}else if(receipt.changedTriangles){p.setAttribute('POSITION',add('trimmed-hero-position',positions,'VEC3')).setAttribute('NORMAL',add('trimmed-hero-normal',normals,'VEC3')).setAttribute('TEXCOORD_0',add('trimmed-hero-uv',uvs,'VEC2')).setIndices(add('trimmed-hero-index',kept,'SCALAR',true));}
 clip.push(receipt);
}
hero.setExtras({...hero.getExtras(),publicFrontRevision:REV,actualAtriumClip:C.hero.clip,actualOccupiedAirClips:HERO_CLIPS,sourceHeroFingerprint:sourceFingerprint});
const material=ELLERY_PUBLIC_MATERIALS.map(m=>dr.listMaterials().find(p=>p.getName()===m.name)||doc.createMaterial(m.name).setBaseColorFactor([...m.rgb,1]).setRoughnessFactor(m.roughness).setMetallicFactor(m.metallic).setEmissiveFactor(m.emissive||[0,0,0]));
const models=elleryPublicFrontGeometry(),scene=dr.listScenes()[0]||doc.createScene('Ellery public face');
const built=new Map();
for(const m of models){const mesh=doc.createMesh(m.name).setExtras({revision:REV,anchor:m.anchor,parts:m.parts,apertures:m.apertures});built.set(m.name,mesh);for(const p of m.primitives)mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',add(m.name+'-position',p.positions,'VEC3')).setAttribute('NORMAL',add(m.name+'-normal',p.normals,'VEC3')).setAttribute('TEXCOORD_0',add(m.name+'-uv',p.uvs,'VEC2')).setIndices(add(m.name+'-indices',p.indices,'SCALAR',true)).setMaterial(material[p.material]));scene.addChild(doc.createNode(m.name).setMesh(mesh));}
const jobs=PRINT.map(p=>({...p,category:p.id.endsWith('closure')?'record':'institution',rasterWidthPx:p.widthM>3?960:384,rasterHeightPx:Math.max(48,Math.round((p.widthM>3?960:384)*p.heightM/p.widthM)),polarity:p.id.endsWith('closure')?'dark-on-light':'dark-on-light',finishSupport:{kind:'carrier',edgeWear:true,contact:'none',exposure:'sheltered'}}));
const bake=await bakeLetteringAtlases(jobs,{outputDir:path.join(root,'public/assets/ellery-public-front-lettering'),pageSize:1024}),textures=new Map();
const tex=(page,role)=>{const key=`${page}:${role}`;if(!textures.has(key))textures.set(key,doc.createTexture(key).setImage(bake.pages[page][role]).setMimeType('image/png'));return textures.get(key);};
for(const p of PRINT){const entry=bake.entries.get(p.id),f=printedFaceGeometry({...p,center:[p.center[0]-C.anchor.x,p.center[1],p.center[2]-C.anchor.z],uvRect:entry.uvRect});
 const m=doc.createMaterial('physical print: '+p.process).setBaseColorFactor([1,1,1,1]).setMetallicFactor(1).setRoughnessFactor(1).setBaseColorTexture(tex(entry.page,'albedo')).setNormalTexture(tex(entry.page,'normal')).setMetallicRoughnessTexture(tex(entry.page,'orm')).setExtras({printedSurface:printedSurfaceMetadata(entry),materialFactors:'gltf',letteringFinish:{version:1,profile:entry.finish.profile,localSpecular:true}});
 built.get(C.facade.mesh).addPrimitive(doc.createPrimitive().setAttribute('POSITION',add(p.id+'-position',f.positions,'VEC3')).setAttribute('NORMAL',add(p.id+'-normal',f.normals,'VEC3')).setAttribute('TEXCOORD_0',add(p.id+'-uv',f.uvs,'VEC2')).setIndices(add(p.id+'-indices',f.indices,'SCALAR',true)).setMaterial(m));
}
await doc.transform(prune({keepAttributes:true,keepExtras:true,keepSolidTextures:true}));
const output=Buffer.from(await io.writeBinary(doc)),measure=m=>m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),addedTriangles=models.reduce((n,m)=>n+measure(built.get(m.name)),0),addedBytes=output.length-baselineBytes;
if(addedTriangles>C.maximumAddedTriangles||addedBytes>C.maximumAddedBytes)throw Error(`Public front exceeded its bounded addition: ${addedTriangles}tri,${addedBytes}B`);
if(sha(fs.readFileSync(sourcePath))!==sha(sourceBytes))throw Error('Shared source pack changed during extraction; rerun against the new source');
const inputs=['src/data/ellery-public-front.js','src/data/glass-court-sightlines.js','tools/chunk_surfer/ellery-public-front-geometry.mjs','tools/chunk_surfer/build-ellery-public-front.mjs'];
const stats={revision:REV,sha256:sha(output),bytes:output.length,baselineHeroBytes:baselineBytes,addedBytes,addedTriangles,totalTriangles:dr.listMeshes().reduce((n,m)=>n+measure(m),0),sourcePack:{file:'public/assets/conservatory-props.glb',sha256:sha(sourceBytes),unchangedDuringBuild:true,meshCount:originalNames.length},sourceHero:{name:C.hero.mesh,fingerprint:sourceFingerprint,triangles:sourceTriangles,retainedTriangles:measure(hero),occupiedAirClips:HERO_CLIPS,clip},protectedMeshes:{notExported:originalNames.filter(n=>n!==C.hero.mesh),allUnmodifiedInSourcePack:true},meshes:Object.fromEntries(dr.listMeshes().map(m=>[m.getName(),{triangles:measure(m),primitives:m.listPrimitives().length}])),sourceHashes:Object.fromEntries(inputs.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))])),pending:['root floorplan/prop/pack integration','native matched eye-level inspection','ordinary public-forecourt approach and unchanged service arrival','unbriefed wayfinding and atmosphere validation']};
fs.writeFileSync(out,output);fs.writeFileSync(out.replace('.glb','.stats.json'),JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(out.replace('.glb','.credits.json'),JSON.stringify({pack:'ellery-public-front.glb',author:'Chunk Surfer project',license:'Project-native geometry; copied hero/material image rights unchanged',sourceHero:stats.sourceHero,sourcePack:stats.sourcePack,geometry:inputs,lettering:{fonts:[...new Set(PRINT.map(p=>p.font))],manifest:'assets/fonts/manifest.json',pipelineManifest:'ellery-public-front-lettering/atlas-manifest.json',license:'Existing URW Base35 font terms retained'},basis:'Authored1888civic school hierarchy applied only to the existing front atrium; no claim of a surveyed real building.'},null,2)+'\n');
console.log(JSON.stringify({bytes:stats.bytes,addedBytes,addedTriangles,totalTriangles:stats.totalTriangles,sourceHero:stats.sourceHero,meshes:stats.meshes},null,2));
