// A separate review-only canonical Transit. The legacy yard study is untouched.
import {Document,NodeIO} from '@gltf-transform/core';
import {copyToDocument,prune,unpartition,getBounds} from '@gltf-transform/functions';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openingVehicleInstances,OPENING_VEHICLE} from '../src/data/opening-vehicle.js';

const root=new URL('../',import.meta.url),out=new URL('../tools/app-icon/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const io=new NodeIO(),doc=new Document(),scene=doc.createScene('canonical-transit-icon-review');doc.getRoot().setDefaultScene(scene);
const poses=openingVehicleInstances({x:0,y:0,z:0,yaw:0,zone:'icon-review'},{doorOpen:0,drive:{wheelRotation:0,wheelAngle:0,wipers:false,elapsed:0}});
const sourcePath='public/assets/source-vehicle-interior.glb',sourceBytes=await readFile(new URL(sourcePath,root)),source=await io.readBinary(sourceBytes);
const names=['opening_drive_vehicle_body','opening_drive_cabin','opening_drive_cabin_door_r','opening_drive_tyre','opening_drive_wiper'];
const sourceNodes=names.map(name=>{const node=source.getRoot().listNodes().find(n=>n.getName()===name);if(!node)throw Error('Missing '+name);return node;});
const copies=copyToDocument(doc,source,sourceNodes),records=[];
function nodeHash(node){const hash=createHash('sha256');hash.update(node.getName());for(const p of node.getMesh().listPrimitives()){hash.update(p.getMaterial()?.getName()||'');for(const semantic of p.listSemantics().sort()){const a=p.getAttribute(semantic).getArray();hash.update(semantic);hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}const a=p.getIndices()?.getArray();if(a)hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}return hash.digest('hex');}
for(const original of sourceNodes){
  const copy=copies.get(original);if(nodeHash(copy)!==nodeHash(original))throw Error('Source arrays changed '+original.getName());
  records.push({source:sourcePath,sourceSha256:sha(sourceBytes),node:original.getName(),geometrySha256:nodeHash(original),instances:[]});
  const matching=poses.filter(p=>p.mesh===original.getName());
  if(!matching.length)throw Error('No canonical pose '+original.getName());
  for(const [i,pose]of matching.entries()){
    const name=pose.mesh==='opening_drive_tyre'
      ?`icon-wheel-${pose.z<0?'front':'rear'}-${pose.x<0?'left':'right'}`
      :pose.mesh==='opening_drive_wiper'?`icon-wiper-${i===0?'left':'right'}`:pose.mesh;
    const node=i===0?copy:doc.createNode(name).setMesh(copy.getMesh());node.setName(name).setMatrix(pose.matrix);
    if(pose.mesh==='opening_drive_tyre')node.setExtras({reviewOnly:true,axle:'X',canonicalMesh:pose.mesh});
    scene.addChild(node);records.at(-1).instances.push({node:name,runtimeId:pose.id,matrix:Array.from(pose.matrix)});
  }
}
// The original service paint is already fitted in body coordinates; no cab
// mount is applied to it and no tiny substitute lettering is invented.
const brandPath='public/assets/van-brand.glb',brandBytes=await readFile(new URL(brandPath,root)),brand=await io.readBinary(brandBytes);
const brandOriginal=brand.getRoot().listNodes().find(n=>n.getName()==='van_brand_drive');
if(!brandOriginal)throw Error('Missing canonical Transit service paint');
const brandNode=copyToDocument(doc,brand,[brandOriginal]).get(brandOriginal);scene.addChild(brandNode);
records.push({source:brandPath,sourceSha256:sha(brandBytes),node:'van_brand_drive',geometrySha256:nodeHash(brandOriginal),instances:[{node:'van_brand_drive',matrix:brandNode.getMatrix()}],optional:true});
await doc.transform(prune(),unpartition());
const bytes=await io.writeBinary(doc);await writeFile(new URL('transit.glb.tmp',out),bytes);await rename(new URL('transit.glb.tmp',out),new URL('transit.glb',out));
const reloaded=await io.readBinary(bytes);let uniqueTriangles=0,instancedTriangles=0;
const tris=mesh=>mesh.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0);
for(const mesh of reloaded.getRoot().listMeshes())uniqueTriangles+=tris(mesh);
for(const node of reloaded.getRoot().listNodes())if(node.getMesh())instancedTriangles+=tris(node.getMesh());
for(const source of [{path:sourcePath,hash:sha(sourceBytes)},{path:brandPath,hash:sha(brandBytes)}])if(sha(await readFile(new URL(source.path,root)))!==source.hash)throw Error('Shared source changed '+source.path);
const record={scope:'Isolated real opening/Source Ford Transit Mk3; canonical geometry/materials/textures preserved. No shared asset or legacy yard study changed.',
  vehicle:'Ford Transit Mk3 (VE6)100SWB panel van,2.0OHC petrol(UK1987)',output:'tools/app-icon/transit.glb',sha256:sha(bytes),bytes:bytes.length,
  up:'+Y',forward:'-Z',rear:'+Z',units:'metres',bounds:getBounds(reloaded.getRoot().listScenes()[0]),uniqueTriangles,instancedTriangles,
  canonicalAssembly:'src/data/opening-vehicle.js openingVehicleInstances({x:0,y:0,z:0,yaw:0},{doorOpen:0,drive:{wheelRotation:0,wheelAngle:0,wipers:false,elapsed:0}})',
  metrics:{cabinMount:OPENING_VEHICLE.cabinMount,bodyBox:OPENING_VEHICLE.bodyBox,wheels:OPENING_VEHICLE.wheels,driverDoorHingeCab:OPENING_VEHICLE.doorHinge},nodes:records,
  wheelNodes:reloaded.getRoot().listNodes().filter(n=>n.getName().startsWith('icon-wheel-')).map(n=>({node:n.getName(),pivot:n.getTranslation(),axle:'X',bounds:getBounds(n)})),
  details:['Driver door is the original detached mesh in its real closed cabin pose. Left cab door is part of the existing cabin mesh; rear leaves are closed surfaces/seams in the existing body.','Four instances share the existing proper tyre mesh, including original rims,hubs and five fixings. Rotate each icon-wheel node about localX.','Only static cabin geometry needed to close the exterior is included. Separate recorder,radio,steering wheel and all road/world clutter are omitted. The static cabin retains original hidden interior faces.','Original rear window panels and front/side opening/glazing treatment preserved; no new window material or redesigned body.','van_brand_drive is a separate optional node; it is already fitted to the real cargo flank in body coordinates.'],
  generatedBy:'scripts/prepare-van-icon-model.mjs; official @gltf-transform copyToDocument/prune/unpartition APIs; no GPU or shared pack rebuild.'};
await writeFile(new URL('transit-source.json',out),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({output:record.output,sha256:record.sha256,bytes:bytes.length,bounds:record.bounds,uniqueTriangles,instancedTriangles,nodes:reloaded.getRoot().listNodes().map(n=>n.getName())}));
