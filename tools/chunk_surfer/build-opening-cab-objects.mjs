// Dedicated cab-only promotion. Never rebuilds/rewrites the shared prop pack,
// Source cabin or original item models. Source transforms and packing sockets
// are evaluated before a bounded ordinary-world reduction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {BoxGeometry,CylinderGeometry,Matrix4,Vector3,Matrix3} from 'three';
import {importPropMesh} from './lib/glb-import.mjs';
import {OPENING_CAB_PLACEMENT as C,OPENING_CAB_PAPERS} from '../../src/data/opening-cab-objects.js';
import {FLASHLIGHT_HOUSING_COLORS} from '../../src/game/field-kit.js';
import {buildIntactMusicBoxGroups} from './source-drive-study/build-coastal-memory.mjs';

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

 // The paper is already a real world sheet. Add only its thin, supported
 // clipboard and spring clip; job acceptance stays with the existing guard.
 const coalesce=groups=>{const merged=new Map();for(const group of groups){const key=JSON.stringify(group.material);let out=merged.get(key);if(!out){out={positions:[],normals:[],indices:[],material:group.material};merged.set(key,out);}const offset=out.positions.length/3;out.positions.push(...group.positions);out.normals.push(...group.normals);out.indices.push(...group.indices.map(index=>index+offset));}return[...merged.values()];};
 const clip=[],cp=C.clipboard.point,[cw,ch,cd]=C.clipboard.size;
 clip.push(shape(new BoxGeometry(cw,ch,cd),cp,material('clipboard / rubbed fibreboard','#776952')));
 clip.push(shape(new BoxGeometry(.090,.004,.033),[cp[0],cp[1]+ch/2+.002,cp[2]-cd/2+.022],steel));
 clip.push(shape(new BoxGeometry(.070,.004,.010),[cp[0],cp[1]+ch/2+.006,cp[2]-cd/2+.037],frame));
 if(C.clipboard.yaw){const m=new Matrix4().makeTranslation(...cp).multiply(new Matrix4().makeRotationY(-C.clipboard.yaw)).multiply(new Matrix4().makeTranslation(...cp.map(v=>-v))),n=new Matrix3().getNormalMatrix(m);for(const g of clip){for(let i=0;i<g.positions.length;i+=3)g.positions.splice(i,3,...new Vector3().fromArray(g.positions,i).applyMatrix4(m).toArray());for(let i=0;i<g.normals.length;i+=3)g.normals.splice(i,3,...new Vector3().fromArray(g.normals,i).applyMatrix3(n).toArray());}}
 add('opening_cab_clipboard','job-papers',coalesce(clip));

 // Continuous pen strokes, not a luminous display or unlabelled filler marks.
 const strokes={
  A:['0,1 .5,0 1,1','.22,.57 .78,.57'],B:['0,1 0,0 .65,0 1,.22 .65,.48 0,.48','.65,.48 1,.72 .7,1 0,1'],C:['1,.12 .72,0 .2,0 0,.25 0,.8 .22,1 .8,1 1,.88'],
  D:['0,1 0,0 .55,0 1,.28 1,.72 .55,1 0,1'],E:['1,0 0,0 0,1 1,1','0,.48 .78,.48'],F:['1,0 0,0 0,1','0,.48 .8,.48'],G:['1,.16 .75,0 .22,0 0,.25 0,.8 .22,1 1,1 1,.55 .55,.55'],
  H:['0,0 0,1','1,0 1,1','0,.5 1,.5'],I:['.15,0 .85,0','.5,0 .5,1','.15,1 .85,1'],J:['.12,0 1,0','1,0 1,.8 .8,1 .2,1 0,.8'],K:['0,0 0,1','1,0 0,.58 1,1'],L:['0,0 0,1 1,1'],
  M:['0,1 0,0 .5,.57 1,0 1,1'],N:['0,1 0,0 1,1 1,0'],O:['.2,0 .8,0 1,.25 1,.8 .8,1 .2,1 0,.75 0,.22 .2,0'],P:['0,1 0,0 .75,0 1,.22 .75,.5 0,.5'],
  Q:['.2,0 .8,0 1,.25 1,.8 .8,1 .2,1 0,.75 0,.22 .2,0','.6,.7 1.1,1.1'],R:['0,1 0,0 .75,0 1,.22 .75,.5 0,.5','.55,.5 1,1'],S:['1,.12 .75,0 .22,0 0,.24 .2,.47 .78,.55 1,.78 .78,1 .2,1 0,.88'],
  T:['0,0 1,0','.5,0 .5,1'],U:['0,0 0,.78 .22,1 .78,1 1,.78 1,0'],V:['0,0 .5,1 1,0'],W:['0,0 .22,1 .5,.48 .78,1 1,0'],X:['0,0 1,1','1,0 0,1'],Y:['0,0 .5,.5 1,0','.5,.5 .5,1'],Z:['0,0 1,0 0,1 1,1'],"'":['.5,0 .35,.25'],'.':['.45,.94 .55,1']};
 const pen=material('cab paper / old blue biro','#263d4a',.96),print=material('recital programme / faded ink','#3b3831',.96);
 function lettering(lines,at,{vertical=false,width=.075,height=.0068,ink=pen}={}){
  const groups=[],longest=Math.max(...lines.map(line=>line.length)),advance=Math.min(height*.78,width/Math.max(1,longest)),top=-height*lines.length*.9;
  const project=(u,v)=>vertical?[at[0]+u,at[1]-v,at[2]+.0008]:[at[0]+u,at[1]+.0008,at[2]+v];
  for(const[lineIndex,line]of lines.entries())for(const[index,char]of [...line].entries()){
   const x=-line.length*advance/2+index*advance,y=top+lineIndex*height*1.8+(index%3-1)*height*.035;
   for(const path of strokes[char]||[]){const points=path.split(' ').map(p=>p.split(',').map(Number));for(let i=1;i<points.length;i++){
    const a=[x+points[i-1][0]*advance*.72,y+points[i-1][1]*height],b=[x+points[i][0]*advance*.72,y+points[i][1]*height],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;
    const ox=-dy/length*.00032,oy=dx/length*.00032,positions=[project(a[0]+ox,a[1]+oy),project(a[0]-ox,a[1]-oy),project(b[0]-ox,b[1]-oy),project(b[0]+ox,b[1]+oy)];
    groups.push({positions:positions.flat(),normals:Array.from({length:4},()=>vertical?[0,0,1]:[0,1,0]).flat(),indices:[0,2,1,0,3,2],material:ink});
   }}
  }return groups;
 }
 function sticky(name,id,definition,placement,vertical=false){
  const p=placement.point,[w,h,d]=placement.size,groups=[shape(new BoxGeometry(w,h,d),p,material(name+' / worn adhesive paper',definition.stock))];
  groups.push(...lettering(definition.worldLines,vertical?[p[0],p[1],p[2]+d/2]:[p[0],p[1]+h/2,p[2]],{vertical,width:w*.86}));
  if(!vertical){const m=new Matrix4().makeTranslation(...p).multiply(new Matrix4().makeRotationY(-placement.yaw)).multiply(new Matrix4().makeTranslation(...p.map(v=>-v))),n=new Matrix3().getNormalMatrix(m);for(const g of groups){for(let i=0;i<g.positions.length;i+=3)g.positions.splice(i,3,...new Vector3().fromArray(g.positions,i).applyMatrix4(m).toArray());for(let i=0;i<g.normals.length;i+=3)g.normals.splice(i,3,...new Vector3().fromArray(g.normals,i).applyMatrix3(n).toArray());}}
  add(name,id,coalesce(groups));
 }
 sticky('opening_cab_practice_note','practice-note',OPENING_CAB_PAPERS[0],C.practiceNote);
 sticky('opening_cab_first_take_note','first-take-note',OPENING_CAB_PAPERS[1],C.firstTakeNote,true);

 // The programme lies on the original passenger cushion. Sample the actual
 // exported seat, then give the paper a shallow retained centre crease.
 const cabinDoc=await io.read(path.join(root,'public/assets/source-vehicle-interior.glb')),seatTriangles=[];
 for(const primitive of cabinDoc.getRoot().listMeshes().find(mesh=>mesh.getName()==='opening_drive_cabin').listPrimitives()){
  const p=primitive.getAttribute('POSITION'),ids=primitive.getIndices().getArray();for(let i=0;i<ids.length;i+=3)seatTriangles.push([0,1,2].map(k=>p.getElement(ids[i+k],[])));
 }
 function seatHeight(x,z){let result=-Infinity;for(const[a,b,c]of seatTriangles){const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v,y=u*a[1]+v*b[1]+w*c[1];if(Math.min(u,v,w)>=-1e-6&&y>.88&&y<1.1)result=Math.max(result,y);}if(!Number.isFinite(result))throw Error('Programme has no real passenger-seat support');return result;}
 const pp=C.programme.point,[pw,,pd]=C.programme.size,programme=[],paperMat=material('recital programme / creased warm stock',OPENING_CAB_PAPERS[2].stock),prx=Math.cos(C.programme.yaw),prz=Math.sin(C.programme.yaw);
 const programmePoint=(u,v)=>{const x=pp[0]+prx*u-prz*v,z=pp[2]+prz*u+prx*v;return[x,seatHeight(x,z)+.0022+.0035*(1-Math.min(1,Math.abs(u)/(pw*.5))),z];};
 for(let j=0;j<8;j++)for(let i=0;i<6;i++){const left=-pw/2+i*pw/6,right=left+pw/6,front=-pd/2+j*pd/8,back=front+pd/8,points=[programmePoint(left,front),programmePoint(left,back),programmePoint(right,back),programmePoint(right,front)];programme.push({positions:points.flat(),normals:Array.from({length:4},()=>[0,1,0]).flat(),indices:[0,1,2,0,2,3],material:paperMat});}
 const writing=lettering(OPENING_CAB_PAPERS[2].worldLines,[0,0,0],{width:pw*.85,height:.009,ink:print});
 for(const g of writing)for(let i=0;i<g.positions.length;i+=3){const u=g.positions[i],v=g.positions[i+2],p=programmePoint(u,v);g.positions.splice(i,3,p[0],p[1]+.0009,p[2]);}
 programme.push(...writing);add('opening_cab_recital_programme','recital-programme',coalesce(programme));

 // Lyle's music box, whole and shut, from the coast pack's own construction.
 // It settles into the cushion: base at the mean height under its four feet.
 const mb=C.musicBox,turn=new Matrix4().makeRotationY(mb.turn),feet=[[-.14,-.11],[-.14,.11],[.14,-.11],[.14,.11]].map(([x,z])=>new Vector3(x,0,z).applyMatrix4(turn)),
   base=feet.reduce((sum,f)=>sum+seatHeight(mb.point[0]+f.x,mb.point[2]+f.z),0)/feet.length+.006,
   boxMatrix=new Matrix4().makeTranslation(mb.point[0],base,mb.point[2]).multiply(turn),boxNormals=new Matrix3().getNormalMatrix(boxMatrix),
   boxMaterial={wood:material('music box / dark polished wood','#4f3a26',.64),brass:material('music box / worn brass','#9c8248',.36,.84),steel:material('music box / blued steel key','#5f6b67',.43,.85)};
 const musicBox=buildIntactMusicBoxGroups().map(g=>({material:boxMaterial[g.material],indices:g.indices,
   positions:Array.from({length:g.positions.length/3},(_,i)=>new Vector3().fromArray(g.positions,i*3).applyMatrix4(boxMatrix).toArray()).flat(),
   normals:Array.from({length:g.normals.length/3},(_,i)=>new Vector3().fromArray(g.normals,i*3).applyMatrix3(boxNormals).normalize().toArray()).flat()}));
 add('opening_cab_music_box','music-box',coalesce(musicBox));
 registration.musicBox={point:[mb.point[0],base,mb.point[2]],turn:mb.turn,source:'tools/chunk_surfer/source-drive-study/build-coastal-memory.mjs buildIntactMusicBoxGroups',method:'Same box as the coast, before the crash: lid shut, every part whole. Settled on the sampled passenger cushion.'};

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
  limits:{maxBytes:4000000,maxStoredTriangles:42000,maxDisplayedTriangles:16000},provenance:'Existing project-authored equipment retained for compatibility; cab-only notebook, mirror, supported job clipboard, two written reminders and a seat-conforming recital programme. Equipment is rendered at the rear workbench, not duplicated in the cab.',limitations:['Mirror silver is static, not a rendered face/reflection.','World paper uses physical pen strokes; close readings use dedicated baked paper assets.','Witness Edition geometry is not newly granted during the prologue.']};
 if(bytes.length>stats.limits.maxBytes||totalTriangles>stats.limits.maxStoredTriangles)throw Error('Cab-only pack exceeded bounded resource budget '+JSON.stringify({bytes:bytes.length,totalTriangles}));
 if(write){
  const folder=path.join(root,'public/assets/opening-cab');fs.mkdirSync(folder,{recursive:true});
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),papers=[];
  for(const paper of OPENING_CAB_PAPERS){
   const recital=paper.id.endsWith('programme'),body=paper.body.filter(Boolean),size=8.1,leading=17;
   const handwritten=(lines,top,height=13)=>lines.map((line,row)=>[...line].flatMap((char,index)=>{
    const advance=Math.min(height*.75,170/line.length),left=105-line.length*advance/2+index*advance,
      base=top+row*height*2.1+(index%3-1)*height*.025;
    return(strokes[char.toUpperCase()]||[]).flatMap(path=>{const points=path.split(' ').map(point=>point.split(',').map(Number));return points.slice(1).map((b,k)=>{
      const a=points[k],at=p=>[left+(p[0]+p[1]*.06)*advance*.74,base+p[1]*height];const[x1,y1]=at(a),[x2,y2]=at(b);
      return`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#283b43" stroke-width=".48"/>`;
    });});
   }).join('')).join('');
   const printed=recital?`<g data-process="offset-1c">${body.slice(0,-1).map((line,i)=>`<text x="105" y="${66+i*leading}" text-anchor="middle" font-family="Nimbus Roman" font-size="${size}" fill="#3b3831">${escape(line)}</text>`).join('')}</g>`:'',
     writing=`<g data-process="biro">${handwritten(recital?[body.at(-1)]:paper.worldLines,recital?192:82,recital?7.2:13)}</g>`,
     handling=recital?'<line x1="104" y1="10" x2="106" y2="286" stroke="#61584a" stroke-opacity=".18" stroke-width=".35"/><line x1="106" y1="10" x2="108" y2="286" stroke="#eee6cd" stroke-opacity=".35" stroke-width=".35"/>':'<line x1="8" y1="16" x2="203" y2="17" stroke="#61584a" stroke-opacity=".12" stroke-width="2"/><line x1="188" y1="281" x2="203" y2="273" stroke="#61584a" stroke-opacity=".12" stroke-width=".6"/>';
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297"><rect id="paper-stock" width="210" height="297" fill="${paper.stock}"/>${printed}${writing}<g data-process="handling">${handling}</g></svg>`;
   const input=path.join(folder,paper.id+'.svg'),output=path.join(folder,paper.id+'.webp'),materialOutput=path.join(folder,paper.id+'-material.webp');fs.writeFileSync(input,svg);
   const python=process.env.PAPER_PYTHON||(fs.existsSync(path.join(root,'.paper-venv/bin/python'))?path.join(root,'.paper-venv/bin/python'):'python3'),
     raster=spawnSync(python,[path.join(root,'scripts/paper/rasterize_svg.py'),input,output,'1050','1485',materialOutput],{encoding:'utf8'});
   if(raster.status!==0)throw Error('Cab paper raster failed: '+(raster.stderr||raster.stdout));
   papers.push({id:paper.id,path:path.relative(path.join(root,'public'),output),materialPath:path.relative(path.join(root,'public'),materialOutput),sha256:sha(fs.readFileSync(output)),semanticSha256:sha(JSON.stringify(paper.body)),width:1050,height:1485});
  }
  fs.writeFileSync(path.join(folder,'papers.json'),JSON.stringify({scope:'Dedicated cab papers; existing external-baked-paper reader; no shared atlas or catalogue rewrite',papers},null,2)+'\n');
  fs.mkdirSync(path.join(root,'public/assets'),{recursive:true});fs.writeFileSync(path.join(root,'public',stats.asset),bytes);fs.writeFileSync(path.join(root,'public/assets/opening-cab-objects.stats.json'),JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(path.join(root,'public/assets/opening-cab-objects.credits.json'),JSON.stringify({provenance:stats.provenance,sources:stats.sources,registration:stats.registration,limitations:stats.limitations,sha256:stats.sha256},null,2)+'\n');fs.writeFileSync(path.join(root,'src/data/opening-cab-object-geometry.js'),'// Generated by build-opening-cab-objects.mjs; final exported geometry bounds.\nexport const OPENING_CAB_GEOMETRY='+JSON.stringify({sha256:stats.sha256,meshes:records,targets},null,2)+';\n');
 }
 return{bytes,stats};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const{stats}=await buildOpeningCabObjects();console.log(JSON.stringify({sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles,meshes:stats.meshes.length,targets:stats.targets},null,2));}
