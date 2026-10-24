// The same authored case used at the preparation station, reduced for the
// ordinary world prop pass. Its own mesh lets the packed kit actually leave.
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {importPropMesh} from './lib/glb-import.mjs';
import {VAN_REAR_STRUCTURE as V,VAN_REAR_CASE,VAN_REAR_STAGE,vanRearStageToWorld,vanRearStockMeshName} from '../../src/data/van-rear-design.js';
import {workbenchCatalog,WORKBENCH_VARIANTS} from '../../src/data/workbench-catalog.js';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// Change only the authored case hierarchy. Its original vertex buffers and
// materials remain byte-for-byte intact until the ordinary prop importer runs.
// The original file is never overwritten or fitted back into the item pack.
export function poseClosedVanFieldCase(source){
 if(!Buffer.isBuffer(source)||source.length<20||source.toString('ascii',0,4)!=='glTF'
   ||source.readUInt32LE(4)!==2||source.readUInt32LE(8)!==source.length)throw Error('The van case must be a complete GLB 2 source.');
 const chunks=[];let offset=12,json=null;
 while(offset<source.length){
  if(offset+8>source.length)throw Error('Truncated van case chunk header.');
  const length=source.readUInt32LE(offset),type=source.readUInt32LE(offset+4),end=offset+8+length;
  if(length%4||end>source.length)throw Error('Truncated or unaligned van case chunk.');
  const data=source.subarray(offset+8,end);
  if(type===0x4e4f534a){if(json)throw Error('The van case contains multiple JSON chunks.');json=JSON.parse(data.toString('utf8'));}
  chunks.push({type,data,original:source.subarray(offset,end)});offset=end;
 }
 if(!json||!chunks.some(chunk=>chunk.type===0x004e4942))throw Error('The van case needs its original JSON and binary chunks.');
 const hinges=json.nodes?.map((node,index)=>({node,index})).filter(({node})=>node.name==='open-lid-hinge')||[];
 if(hinges.length!==1||hinges[0].node.matrix)throw Error('The van case needs its single authored TRS lid hinge.');
 const angle=Math.PI/2,hinge=hinges[0];
 hinge.node.rotation=[Math.sin(angle/2),0,0,Math.cos(angle/2)];
 const hiddenNodes=[];
 const omitMeshes=index=>{
  const node=json.nodes[index];
  if(node.mesh!=null){hiddenNodes.push({index,name:node.name||'',mesh:node.mesh});delete node.mesh;}
  for(const child of node.children||[])omitMeshes(child);
 };
 for(const[index,node]of json.nodes.entries())if(node.name?.includes('lid-retaining-strap'))omitMeshes(index);
 if(hiddenNodes.length<2)throw Error('The van case needs its two authored lid retaining straps.');
 const encoded=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(encoded.length/4)*4,0x20);encoded.copy(padded);
 const jsonChunk=Buffer.alloc(8);jsonChunk.writeUInt32LE(padded.length,0);jsonChunk.writeUInt32LE(0x4e4f534a,4);
 const payload=chunks.map(chunk=>chunk.type===0x4e4f534a?Buffer.concat([jsonChunk,padded]):chunk.original);
 const header=Buffer.alloc(12);header.write('glTF',0,'ascii');header.writeUInt32LE(2,4);header.writeUInt32LE(12+payload.reduce((n,chunk)=>n+chunk.length,0),8);
 const bytes=Buffer.concat([header,...payload]);
 return{bytes,receipt:{state:'closed',hingeNode:hinge.index,angleX:angle,hiddenNodes,
  originalSha256:sha256(source),posedSha256:sha256(bytes),
  binarySha256:sha256(Buffer.concat(chunks.filter(chunk=>chunk.type===0x004e4942).map(chunk=>chunk.data)))}};
}

async function sourceCaseBounds(bytes){
 const document=await new NodeIO().readBinary(bytes),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const node of document.getRoot().listNodes()){
  const matrix=node.getWorldMatrix();
  for(const primitive of node.getMesh()?.listPrimitives()||[]){
   const positions=primitive.getAttribute('POSITION')?.getArray();if(!positions)continue;
   for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    const point=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
    for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],point[k]);hi[k]=Math.max(hi[k],point[k]);}
   }
  }
 }
 if(!lo.every(Number.isFinite)||!hi.every(Number.isFinite))throw Error('The original case has no finite visible housing geometry.');
 return{lo,hi,size:hi.map((n,i)=>n-lo[i]),center:hi.map((n,i)=>(n+lo[i])/2)};
}

export async function buildVanRearKitGeometry({mesh,group,materials,root,importMesh=importPropMesh}){
 const sources=[],palette=new Map(),file=join(root,'public/assets/items/field-case.glb');
 const original=readFileSync(file),posed=poseClosedVanFieldCase(original);
 const closedBounds=await sourceCaseBounds(posed.bytes),openBounds=await sourceCaseBounds(original);
 const scale=VAN_REAR_CASE.width/closedBounds.size[0],at=[0,VAN_REAR_CASE.seatTopY,VAN_REAR_CASE.centerZ];
 const temporary=mkdtempSync(join(tmpdir(),'chunk-surfer-closed-van-case-'));
 try{
  for(const state of ['closed','open']){
   const target=mesh(state==='closed'?'yard_van_field_case':'yard_van_field_case_open');
   const bounds=state==='closed'?closedBounds:openBounds,bytes=state==='closed'?posed.bytes:original;
   const posedFile=join(temporary,`field-case-${state}.glb`);writeFileSync(posedFile,bytes);
   // Import in original authored units, then register BOTH poses against the
   // same closed housing. Fitting each overall envelope would shrink the body
   // when the angled open lid extends beyond it.
   const cooked=await importMesh(posedFile,{up:'y',targetH:bounds.size[1],maxW:bounds.size[0],maxD:bounds.size[2],triBudget:5000});
   for(const source of cooked.groups){
    const definition=source.material;
    const factors={baseColorFactor:definition.baseColorFactor,metallicFactor:definition.metallicFactor,roughnessFactor:definition.roughnessFactor};
    const key=JSON.stringify(factors);let material=palette.get(key);
    if(material===undefined){
     material=materials.push({name:`van kit / field-case / ${definition.name}`,pbrMetallicRoughness:factors,
      extras:{materialFactors:'gltf',vanRearRole:'detachable-field-kit'}})-1;palette.set(key,material);
    }
    const g=group(target,material),base=g.positions.length/3;
    for(let i=0;i<source.positions.length;i+=3)g.positions.push(
     (source.positions[i]+bounds.center[0]-closedBounds.center[0])*scale+at[0],
     (source.positions[i+1]+bounds.lo[1]-closedBounds.lo[1])*scale+at[1],
     (source.positions[i+2]+bounds.center[2]-closedBounds.center[2])*scale+at[2]);
    g.normals.push(...source.normals);g.indices.push(...Array.from(source.indices,index=>index+base));
   }
   const receipt=state==='closed'?posed.receipt:{state:'open',angleX:-.31,hiddenNodes:[],originalSha256:sha256(original),posedSha256:sha256(original),binarySha256:posed.receipt.binarySha256};
   sources.push({id:'field-case',mesh:target.name,file:'public/assets/items/field-case.glb',sha256:sha256(original),triangles:cooked.triangles,
    pose:receipt,registration:{origin:'closed housing floor-centre',housingWidth:VAN_REAR_CASE.width,scale,closedBounds,sourcePoseBounds:bounds}});
   target.extras={vanRear:{version:3,role:'detachable-field-kit',state,worktopTop:V.worktopY+.04,caseBaseY:at[1],caseCenterZ:at[2],
    contentsMirroredFromPreparation:false,sources:[sources.at(-1)]}};
  }
  return sources;
 }finally{
  rmSync(temporary,{recursive:true,force:true});
 }
}

// Every ordinary fitting choice is the same original GLB used by the close
// preparation view. Separate meshes allow the runtime to remove only the item
// actually packed and restore it when the player chooses a different fitting.
export async function buildVanRearStockGeometry({mesh,group,materials,root,importMesh=importPropMesh}){
 const catalogue=workbenchCatalog({bagTaken:false,packedGroups:[],fieldKit:{},witness:{visible:false,owned:false}});
 const objects=catalogue.filter(object=>object.kind==='variant'
  &&WORKBENCH_VARIANTS[object.group]?.includes(object.optionId));
 const parts=[],palette=new Map();let triangles=0;
 for(const object of objects){
  const name=vanRearStockMeshName(object.group,object.optionId),target=mesh(name);
  const file=join(root,'public/assets/items',object.modelId+'.glb');
  const width=object.width*VAN_REAR_STAGE.metresPerUnit;
  const supportY=object.upright?VAN_REAR_STAGE.rackSeatY:VAN_REAR_STAGE.trayTopY;
  const stagePosition=[object.position[0],supportY,object.position[2]],position=vanRearStageToWorld(stagePosition);
  const options={up:object.upright?'y':'z',targetH:100,maxW:width,maxD:width,triBudget:object.group==='faceplate'?250:400};
  const cooked=await importMesh(file,options);
  // Simplification can retire the source's lowest contact vertices. Seat the
  // final exported mesh, rather than leaving that decimation gap under it.
  let cookedFloor=Infinity;
  for(const source of cooked.groups)for(let i=1;i<source.positions.length;i+=3)cookedFloor=Math.min(cookedFloor,source.positions[i]);
  if(!Number.isFinite(cookedFloor))throw Error(`No finite stock contact plane for ${object.modelId}.`);
  for(const source of cooked.groups){
   const definition=source.material;
   const factors={baseColorFactor:definition.baseColorFactor,metallicFactor:definition.metallicFactor,roughnessFactor:definition.roughnessFactor};
   const key=JSON.stringify(factors);let material=palette.get(key);
   if(material===undefined){
    material=materials.push({name:`van stock / ${definition.name}`,pbrMetallicRoughness:factors,
     extras:{materialFactors:'gltf',vanRearRole:'ordinary-fitting-stock'}})-1;
    palette.set(key,material);
   }
   const g=group(target,material),base=g.positions.length/3;
   for(let i=0;i<source.positions.length;i+=3)g.positions.push(source.positions[i]+position[0],source.positions[i+1]+position[1]-cookedFloor,source.positions[i+2]+position[2]);
   g.normals.push(...source.normals);g.indices.push(...Array.from(source.indices,index=>index+base));
  }
  const part={group:object.group,optionId:object.optionId,modelId:object.modelId,mesh:name,
   propId:`yard-van-stock-${object.group}-${object.optionId}`,source:`public/assets/items/${object.modelId}.glb`,
   sha256:sha256(readFileSync(file)),triangles:cooked.triangles,stagePosition,position,
   up:options.up,widthLimit:width,bounds:cooked.bounds||null,postSimplifyFloorOffset:cookedFloor};
  target.extras={vanRearStock:{version:1,...part,placementSpace:'van-local-metres',
   visibility:'same workbenchCatalog option destination is bench; removed when van closes',witness:false}};
  parts.push(part);triangles+=cooked.triangles;
 }
 return{parts,triangles,meshCount:parts.length,maximumTriangles:6000,placementSpace:'van-local-metres',witnessIncluded:false};
}
