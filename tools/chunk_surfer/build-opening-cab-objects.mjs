// Dedicated cab-only promotion. Never rebuilds/rewrites the shared prop pack,
// Source cabin or original item models. Source transforms and packing sockets
// are evaluated before a bounded ordinary-world reduction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {BoxGeometry,CylinderGeometry,Matrix4,Vector3,Matrix3} from 'three';
import {importPropMesh} from './lib/glb-import.mjs';
import {OPENING_CAB_PLACEMENT as C} from '../../src/data/opening-cab-objects.js';
import {FLASHLIGHT_HOUSING_COLORS} from '../../src/game/field-kit.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);
const minmax=positions=>{const min=[Infinity,Infinity,Infinity],max=min.map(()=>-Infinity);for(let i=0;i<positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i+k]);max[k]=Math.max(max[k],positions[i+k]);}return{min,max};};
const mergeBounds=rows=>minmax(rows.flatMap(row=>row.groups.flatMap(g=>Array.from(g.positions))));
const centre=b=>b.min.map((n,k)=>(n+b.max[k])/2);
const plastics={classic:['#bc6b57','#bcbda9','#c9a151'],signal:['#bc6b57','#729aa9','#d0bc64'],'sea-glass':['#d09179','#a7bda0','#bcbda9']};

export async function buildOpeningCabObjects({root=ROOT,write=true}={}){
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),rows=[],sources=[],targets={},registration={};
 const add=(name,objectId,groups,source=null,selection=null)=>{const row={name,objectId,groups,source,selection};rows.push(row);return row;};
 const recordSource=(file,cooked)=>{const row={file:path.relative(root,file),sha256:sha(fs.readFileSync(file)),sourceTriangles:cooked.sourceTriangles,triangles:cooked.triangles};sources.push(row);return row;};
 const caseFile=path.join(root,'public/assets/items/field-case.glb'),original=await io.read(caseFile),casePoints=[];
 for(const n of original.getRoot().listNodes())for(const p of n.getMesh()?.listPrimitives()||[]){const a=p.getAttribute('POSITION'),m=new Matrix4().fromArray(n.getWorldMatrix());for(let i=0;i<a.getCount();i++)casePoints.push(...new Vector3().fromArray(a.getElement(i,[])).applyMatrix4(m).toArray());}
 const sourceBounds=minmax(casePoints),caseScale=C.fieldCase.width/(sourceBounds.max[0]-sourceBounds.min[0]),sourceCenter=centre(sourceBounds),casePoint=C.fieldCase.point;
 const caseYaw=C.fieldCase.yaw||0,cc=Math.cos(caseYaw),cs=Math.sin(caseYaw);
 const fromCase=p=>{const q=p.map((v,k)=>(v-(k===1?sourceBounds.min[1]:sourceCenter[k]))*caseScale);return[casePoint[0]+cc*q[0]-cs*q[2],casePoint[1]+q[1],casePoint[2]+cs*q[0]+cc*q[2]];};
 const turnCaseNormal=n=>[cc*n[0]-cs*n[2],n[1],cs*n[0]+cc*n[2]];
 const fieldCase=await importPropMesh(caseFile,{targetH:100,maxW:C.fieldCase.width,maxD:100,triBudget:4500}),caseSource=recordSource(caseFile,fieldCase);
 for(const g of fieldCase.groups)for(let i=0;i<g.positions.length;i+=3){const x=g.positions[i],z=g.positions[i+2];g.positions[i]=casePoint[0]+cc*x-cs*z;g.positions[i+1]+=casePoint[1];g.positions[i+2]=casePoint[2]+cs*x+cc*z;g.normals.set(turnCaseNormal(Array.from(g.normals.slice(i,i+3))),i);}
 add('opening_cab_field_case','case',fieldCase.groups,caseSource);
 registration.case={sourceBounds,scale:caseScale,point:casePoint,yaw:caseYaw,sourceFloorOrigin:[sourceCenter[0],sourceBounds.min[1],sourceCenter[2]],method:'Original open FC–7 hierarchy; actual packing-bay transforms; Y up; housing width .624m; open face toward the driver'};

 function socket(id){const n=original.getRoot().listNodes().find(n=>n.getName()==='packing-bay:'+id)||original.getRoot().listNodes().find(n=>n.getName()==='foam-cut-edge:'+id);if(!n)throw Error('Missing physical FC–7 bay '+id);const matrix=new Matrix4().fromArray(n.getWorldMatrix());if(n.getName().startsWith('foam-cut-edge:'))matrix.multiply(new Matrix4().makeRotationX(Math.PI));const extras=n.getExtras(),a=n.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION');let b=a?minmax(Array.from(a.getArray())):null;return{node:n.getName(),matrix,maxWidth:extras.maxWidth||(b.max[0]-b.min[0]),maxHeight:extras.maxHeight||(b.max[1]-b.min[1])};}
 async function item(id,objectId,bay,{turn=0,budget=1800,parts=false}={}){
  const file=path.join(root,'public/assets/items',id+'.glb'),cooked=await importPropMesh(file,{targetH:1,maxW:1,maxD:1,triBudget:budget}),source=recordSource(file,cooked),seat=socket(bay),rotation=new Matrix4().makeRotationZ(turn);
  for(const g of cooked.groups)for(let i=0;i<g.positions.length;i+=3){const p=new Vector3().fromArray(g.positions,i).applyMatrix4(rotation);g.positions.set(p.toArray(),i);}
  const bounds=minmax(cooked.groups.flatMap(g=>Array.from(g.positions))),center=centre(bounds),scale=Math.min(seat.maxWidth*.87/(bounds.max[0]-bounds.min[0]),seat.maxHeight*.87/(bounds.max[1]-bounds.min[1]));
  const m=seat.matrix.clone().multiply(new Matrix4().makeTranslation(-center[0]*scale,-center[1]*scale,-bounds.min[2]*scale+.018)).multiply(new Matrix4().makeScale(scale,scale,scale)),nm=new Matrix3().getNormalMatrix(m.clone().multiply(rotation));
  for(const g of cooked.groups){for(let i=0;i<g.positions.length;i+=3)g.positions.set(fromCase(new Vector3().fromArray(g.positions,i).applyMatrix4(m).toArray()),i);for(let i=0;i<g.normals.length;i+=3)g.normals.set(turnCaseNormal(new Vector3().fromArray(g.normals,i).applyMatrix3(nm).normalize().toArray()),i);}
  registration[id]={bay:seat.node,source:source.file,caseScale,itemScale:scale,rotationZ:turn,socketMatrix:seat.matrix.toArray(),sourceBounds:bounds,clearance:'Original packing socket plus .018 authored-unit stand-off; no automatic item acquisition'};
  const name='opening_cab_'+id.replaceAll('-','_');
  if(parts==='recorder'){
   const selected=new Map([['body',[]],['faceplate',[]],['buttons',[]],['display',[]]]);
   for(const g of cooked.groups){const n=g.material.name,k=/recorder-button-(rec|stop|takes)$/.test(n)?'buttons':/recorder-(faceplate|ink)$/.test(n)?'faceplate':/recorder-(phosphor|display|electrode)/.test(n)?'display':'body';selected.get(k).push(g);}
   add(name+'_body',objectId,selected.get('body'),source,{part:'body'});
   for(const option of['aluminum','black','olive'])add(name+'_faceplate_'+option,objectId,selected.get('faceplate').map(g=>({...g,material:{...g.material,baseColorFactor:[...hex(g.material.name==='recorder-faceplate'?{aluminum:'#bfc2b5',black:'#242b2d',olive:'#61694b'}[option]:option==='aluminum'?'#28312b':'#d7d9bd'),1]}})),source,{part:'faceplate',option});
   for(const[option,colors]of Object.entries(plastics))add(name+'_buttons_'+option.replaceAll('-','_'),objectId,selected.get('buttons').map(g=>({...g,material:{...g.material,baseColorFactor:[...hex(colors[['rec','stop','takes'].indexOf(g.material.name.slice('recorder-button-'.length))]),1]}})),source,{part:'buttons',option});
   add(name+'_display',objectId,selected.get('display'),source,{part:'display'});
  }else if(parts==='flashlight'){
   const housing=cooked.groups.filter(g=>g.material.name==='flashlight-housing'),body=cooked.groups.filter(g=>g.material.name!=='flashlight-housing');
   add(name+'_body',objectId,body,source,{option:id.slice('flashlight-'.length),part:'body'});
   for(const[option,color]of Object.entries(FLASHLIGHT_HOUSING_COLORS))add(name+'_housing_'+option,objectId,housing.map(g=>({...g,material:{...g.material,baseColorFactor:[...hex(color),1]}})),source,{option:id.slice('flashlight-'.length),part:'housing',housing:option});
  }else add(name,objectId,cooked.groups,source,{option:id.slice(id.indexOf('-')+1)});
 }
 await item('field-recorder','recorder','recorder',{budget:3000,parts:'recorder'});
 for(const option of['reference','closed','open'])await item('headphones-'+option,'headphones','headphones',{budget:1500});
 for(const option of['reference','directional','wide'])await item('microphone-'+option,'microphone','microphone',{turn:Math.PI/2,budget:1200});
 for(const option of['reference','low-draw','headroom'])await item('amp-'+option,'amp','amp',{budget:1000});
 for(const option of['reference','throw','flood'])await item('flashlight-'+option,'flashlight','flashlight',{budget:1200,parts:'flashlight'});

 const material=(name,color,roughness=.9,metallic=0)=>({name,baseColorFactor:[...hex(color),1],roughnessFactor:roughness,metallicFactor:metallic});
 function shape(geometry,at,mat,rotation=[0,0,0]){const m=new Matrix4().makeRotationFromEuler({isEuler:true,_x:rotation[0],_y:rotation[1],_z:rotation[2],_order:'XYZ'}).setPosition(...at);geometry.applyMatrix4(m);const g={positions:Array.from(geometry.getAttribute('position').array),normals:Array.from(geometry.getAttribute('normal').array),indices:geometry.index?Array.from(geometry.index.array):Array.from({length:geometry.getAttribute('position').count},(_,i)=>i),material:mat};geometry.dispose();return g;}
 const notebook=[],np=C.notebook.point,[nw,nh,nd]=C.notebook.size,cover=material('notebook / navy woven cloth','#233d43'),pages=material('notebook / used paper edges','#b8ad8c'),strap=material('notebook / worn elastic','#2d2920');
 notebook.push(shape(new BoxGeometry(nw,nh,nd),[np[0],np[1]+nh/2,np[2]],cover));
 notebook.push(shape(new BoxGeometry(nw-.009,nh*.53,nd-.009),[np[0]+.003,np[1]+nh*.46,np[2]+.001],pages));
 for(const y of[.002,nh-.002])notebook.push(shape(new BoxGeometry(nw,.003,nd),[np[0],np[1]+y,np[2]],cover));
 notebook.push(shape(new BoxGeometry(.008,nh+.001,nd+.001),[np[0]-nw*.5+.004,np[1]+nh/2,np[2]],cover));
 notebook.push(shape(new BoxGeometry(.006,.0018,nd+.001),[np[0]+nw*.32,np[1]+nh+.001,np[2]],strap));
 for(let i=0;i<5;i++)notebook.push(shape(new BoxGeometry(nw-.014,.0004,.001),[np[0]+.004,np[1]+.004+i*.0016,np[2]+nd/2-.002],material('notebook / page seams','#8e846b')));
 if(C.notebook.yaw){const c=Math.cos(C.notebook.yaw),s=Math.sin(C.notebook.yaw);for(const g of notebook)for(let i=0;i<g.positions.length;i+=3){const x=g.positions[i]-np[0],z=g.positions[i+2]-np[2],nx=g.normals[i],nz=g.normals[i+2];g.positions[i]=np[0]+c*x-s*z;g.positions[i+2]=np[2]+s*x+c*z;g.normals[i]=c*nx-s*nz;g.normals[i+2]=s*nx+c*nz;}}
 add('opening_cab_notebook','notebook',notebook,null);
 const mirror=[],mp=C.mirror.point,[mw,mh,md]=C.mirror.size,frame=material('mirror / black moulded frame','#252a27',.66,.12),glass=material('mirror / dark aged silver, static no live reflection','#7d8b83',.26,.72),steel=material('mirror / adjustable metal stem','#646d65',.45,.65);
 mirror.push(shape(new BoxGeometry(mw,mh,md),mp,frame));mirror.push(shape(new BoxGeometry(mw-.014,mh-.014,.0015),[mp[0],mp[1],mp[2]+md/2+.001],glass));
 const stemStart=[mp[0],mp[1]+.042,mp[2]-.005],stemEnd=[...C.mirror.mount];stemEnd[1]-=.005;
 const stemLength=Math.hypot(...stemEnd.map((n,k)=>n-stemStart[k])),stemAt=stemStart.map((n,k)=>(n+stemEnd[k])/2),stemAngle=Math.atan2(stemEnd[2]-stemStart[2],stemEnd[1]-stemStart[1]);
 mirror.push(shape(new CylinderGeometry(.007,.009,stemLength,8),stemAt,steel,[stemAngle,0,0]));
 mirror.push(shape(new BoxGeometry(.046,.014,.044),C.mirror.mount,frame));
 add('opening_cab_mirror','self-check',mirror,null);

 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Separate opening cab belongings'),palette=new Map(),records=[];
 const accessor=(name,data,type)=>doc.createAccessor(name).setType(type).setArray(type==='SCALAR'?new Uint32Array(data):new Float32Array(data)).setBuffer(buffer);
 for(const row of rows){if(!row.groups.length)continue;const mesh=doc.createMesh(row.name);let triangles=0;
  for(const g of row.groups){if(!g.indices.length)continue;const definition=g.material,key=JSON.stringify(definition);let mat=palette.get(key);if(!mat){mat=doc.createMaterial(definition.name).setBaseColorFactor(definition.baseColorFactor).setRoughnessFactor(definition.roughnessFactor).setMetallicFactor(definition.metallicFactor).setExtras({materialFactors:'gltf',source:'Chunk Surfer original item model or task-authored cab dressing'});palette.set(key,mat);}mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor(row.name+' position',g.positions,'VEC3')).setAttribute('NORMAL',accessor(row.name+' normal',g.normals,'VEC3')).setIndices(accessor(row.name+' indices',g.indices,'SCALAR')).setMaterial(mat));triangles+=g.indices.length/3;}
  scene.addChild(doc.createNode(row.name).setMesh(mesh));const bounds=mergeBounds([row]),center=centre(bounds);let focusPoint=center,best=Infinity;
  // A headphone's bounding-box centre is empty air. Keep a real surface
  // centroid as its authoring/review aim, without adding an invisible object.
  for(const g of row.groups)for(let i=0;i<g.indices.length;i+=3){const point=[0,1,2].map(k=>(g.positions[g.indices[i]*3+k]+g.positions[g.indices[i+1]*3+k]+g.positions[g.indices[i+2]*3+k])/3),score=point.reduce((sum,v,k)=>sum+(v-center[k])**2,0);if(score<best){best=score;focusPoint=point;}}
  records.push({mesh:row.name,objectId:row.objectId,selection:row.selection,bounds,focusPoint,triangles,primitives:mesh.listPrimitives().length});
 }
 for(const id of new Set(records.map(r=>r.objectId))){const candidates=rows.filter(r=>r.objectId===id),bounds=mergeBounds(candidates);targets[id]={bounds,point:centre(bounds)};}
 // Pick the actual exposed silver face rather than the stem's broad box.
 targets['self-check']={bounds:{min:[mp[0]-mw/2,mp[1]-mh/2,mp[2]+md/2],max:[mp[0]+mw/2,mp[1]+mh/2,mp[2]+md/2+.004]},point:[mp[0],mp[1],mp[2]+md/2+.002]};
 const bytes=Buffer.from(await io.writeBinary(doc)),totalTriangles=records.reduce((n,r)=>n+r.triangles,0),stats={schema:1,asset:'assets/opening-cab-objects.glb',sha256:sha(bytes),bytes:bytes.length,totalTriangles,materials:palette.size,meshes:records,targets,sources,registration,
  limits:{maxBytes:4000000,maxStoredTriangles:42000,maxDisplayedTriangles:16000},provenance:'Existing project-authored FC–7 and canonical instrument meshes with original physical packing sockets; new original cloth notebook and fixed interior mirror; no external downloads, textures or new narrative',limitations:['Mirror silver is static, not a rendered face/reflection.','World recorder phosphor is the original idle geometry; live readings appear in its direct inspection.','Witness Edition geometry is not newly granted during the prologue.']};
 if(bytes.length>stats.limits.maxBytes||totalTriangles>stats.limits.maxStoredTriangles)throw Error('Cab-only pack exceeded bounded resource budget '+JSON.stringify({bytes:bytes.length,totalTriangles}));
 if(write){fs.mkdirSync(path.join(root,'public/assets'),{recursive:true});fs.writeFileSync(path.join(root,'public',stats.asset),bytes);fs.writeFileSync(path.join(root,'public/assets/opening-cab-objects.stats.json'),JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(path.join(root,'public/assets/opening-cab-objects.credits.json'),JSON.stringify({provenance:stats.provenance,sources:stats.sources,registration:stats.registration,limitations:stats.limitations,sha256:stats.sha256},null,2)+'\n');fs.writeFileSync(path.join(root,'src/data/opening-cab-object-geometry.js'),'// Generated by build-opening-cab-objects.mjs; final exported geometry bounds.\nexport const OPENING_CAB_GEOMETRY='+JSON.stringify({sha256:stats.sha256,meshes:records,targets},null,2)+';\n');}
 return{bytes,stats};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const{stats}=await buildOpeningCabObjects();console.log(JSON.stringify({sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles,meshes:stats.meshes.length,targets:stats.targets},null,2));}
