// Prune historical geometry to exact controls; no duplicate imported hosts.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';import {prune} from '@gltf-transform/functions';
const source='artifacts/lettering-production/baseline/public/assets/conservatory-props.glb',out='public/assets/lettering/previous.glb';
const sourceBytes=fs.readFileSync(source),productionBytes=fs.readFileSync('public/assets/conservatory-props.glb'),production=JSON.parse(fs.readFileSync('public/assets/conservatory-props.lettering.json'));
const parse=b=>{const n=b.readUInt32LE(12);return{json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)}};
const before=parse(sourceBytes),afterProduction=parse(productionBytes),selected=new Set([...production.entries.map(e=>e.mesh),...(production.runtimePaperUvs||[]).map(e=>e.mesh),...(production.carrierProxyChanges||[])]);
const changedCarriers=new Set(production.carrierProxyChanges||[]),hash=b=>createHash('sha256').update(b).digest('hex');
function values(asset,i){const a=asset.json.accessors[i],v=asset.json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],stride=v.byteStride||size*width,d=new DataView(asset.bin.buffer,asset.bin.byteOffset,asset.bin.byteLength),get={5121:'getUint8',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType];return Array.from({length:a.count*width},(_,i)=>d[get]((v.byteOffset||0)+(a.byteOffset||0)+Math.floor(i/width)*stride+(i%width)*size,true));}
function equalGeometry(aAsset,a,bAsset,b){assert.equal(a.primitives.length,b.primitives.length);for(let i=0;i<a.primitives.length;i++){const x=a.primitives[i],y=b.primitives[i];for(const key of Object.keys(x.attributes))assert.deepEqual(values(aAsset,x.attributes[key]),values(bAsset,y.attributes[key]),a.name+' '+key);assert.deepEqual(values(aAsset,x.indices),values(bAsset,y.indices),a.name+' indices');assert.deepEqual(aAsset.json.materials[x.material],bAsset.json.materials[y.material],a.name+' material');}}
const io=new NodeIO(),doc=await io.readBinary(sourceBytes),root=doc.getRoot(),originalNodes=root.listNodes().slice(),originalMeshes=root.listMeshes().slice(),byName=new Map(originalMeshes.map(m=>[m.getName(),m]));
const scene=root.listScenes()[0],mapped=[],newOnly=[];
for(const name of selected){
 const sourceName=/^door_stencil_b[1235]$/.test(name)?'door_stencil':name,old=byName.get(sourceName);
 if(!old){
  const attachment=(production.worldInscriptionAttachments||[]).find(s=>s.mesh===name);
  if(attachment){
   const oldHost=before.json.meshes.find(m=>m.name===attachment.hostMesh),newHost=afterProduction.json.meshes.find(m=>m.name===attachment.hostMesh);
   if(changedCarriers.has(attachment.hostMesh))newOnly.push({production:name,hostMesh:attachment.hostMesh,archivedHost:true,comparison:'Hide the new overlay and substitute the archived carrier including its original proxy inscription bars.'});
   else if(oldHost&&newHost){equalGeometry(before,oldHost,afterProduction,newHost);newOnly.push({production:name,hostMesh:attachment.hostMesh,hostUnchangedFromArchive:true,comparison:'Hide the new overlay on the byte-equivalent existing host; do not show an empty void.'});}
   else {
    const asset=attachment.substrate?.asset||'conservatory-acquisitions.glb',assetPath='public/assets/'+asset,assetBytes=fs.readFileSync(assetPath),hostAsset=parse(assetBytes);
    assert.ok(hostAsset.json.meshes.some(mesh=>mesh.name===attachment.hostMesh),'Missing separate host '+attachment.hostMesh);
    newOnly.push({production:name,hostMesh:attachment.hostMesh,separateUnchangedHostAsset:assetPath,hostAssetSha256:hash(assetBytes),comparison:'Hide the new overlay on its original separately loaded acquisition host. The rollout does not rebuild that source pack.'});
   }
  }
  else newOnly.push({production:name,baselineUnavailable:true,comparison:'No one-to-one archived mesh. Source 17 previously used runtime set_beam strokes. Use a labelled acquisition-only control.'});
  continue;
 }
 const review=name.startsWith('loose_note')?name+'__lettering_before':'lettering_before_'+name;
 const clone=old.clone().setName(review);scene.addChild(doc.createNode(review).setMesh(clone));mapped.push({production:name,source:sourceName,review});
}
for(const node of originalNodes)node.dispose();for(const mesh of originalMeshes)mesh.dispose();
await doc.transform(prune({keepAttributes:true,keepExtras:true,keepSolidTextures:true}));
const bytes=Buffer.from(await io.writeBinary(doc));const after=parse(bytes);
for(const item of mapped){const a=before.json.meshes.find(m=>m.name===item.source),b=after.json.meshes.find(m=>m.name===item.review);assert.ok(a&&b);equalGeometry(before,a,after,b);item.geometryAndMaterialsExact=true;}
const manifest={version:3,source,sourcePackSha256:hash(sourceBytes),productionPackSha256:production.packSha256,packSha256:hash(bytes),bytes:bytes.length,meshes:mapped,newOnly,prune:{keepAttributes:true,keepExtras:true,keepSolidTextures:true},note:'Every retained primitive numeric attribute, index and full material definition was independently compared to the archived source. B-code variants compare to their original blank shared stencil. Runtime-paper control names preserve the paper semantic prefix. Overlay controls retain their actual host, with archived proxy-bearing carriers substituted where altered. Separate imported hosts retain their original pack SHA; no duplicate imported geometry is loaded.'};
fs.writeFileSync(out,bytes);fs.writeFileSync('public/assets/lettering/previous-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({bytes:bytes.length,exactControlMeshes:mapped.length,newOnly:newOnly.length,sha:manifest.packSha256}));
