// The selected Bronze Reliquary: retained CC0 scan, actual carved sockets,
// capped rigid articulation, concealed bearing, reachable concave seal.
// build-portrait.py records the once-authored Boolean derivation; this builder
// deterministically packages that retained geometry and all production clips.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {Document,NodeIO} from '@gltf-transform/core';
import {ShapeUtils,Vector2} from 'three';
import {BUST_RELIQUARY_RIG as RIG} from '../../src/data/bust-reliquary-rig.js';
import {reliquaryGeometry,reliquaryFrontDepth,handBezelOutline,createCanonicalEyeGeometry,createHandBezelGeometry,RELIQUARY_MATERIALS} from './reliquary-geometry.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const sourcePath=path.join(ROOT,'public/assets/conservatory-acquisitions.glb');
const retainedPath=path.join(ROOT,'artifacts/bust-reliquary-production/portrait.json');
if(process.argv.includes('--rebuild-portrait')){
 // Optional authored Boolean-source repair. Normal builds need only the retained
 // closed geometry; this path derives it again from the checked-in CC0 source.
 const acquired=await new NodeIO().readBinary(fs.readFileSync(sourcePath));
 const primitive=acquired.getRoot().listMeshes().find(m=>m.getName()==='marble_bust_01')?.listPrimitives()[0];
 if(!primitive)throw Error('Missing CC0 marble_bust_01 acquisition');
 const p=primitive.getAttribute('POSITION').getArray(),positions=[];
 for(let i=0;i<p.length;i+=3)positions.push(p[i]*11.2*.75*13/12.068,(p[i+1]*11.2+6.3)*.5*13/12.068,p[i+2]*11.2*.5*13/12.068);
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'bust-reliquary-bind-'));
 try{const input=path.join(temporary,'source-bind.json'),derived=path.join(temporary,'portrait.json');fs.writeFileSync(input,JSON.stringify({positions,indices:Array.from(primitive.getIndices().getArray())}));
  execFileSync(process.env.BUST_BLENDER||'/Applications/Blender.app/Contents/MacOS/Blender',['--background','--factory-startup','--python',path.join(ROOT,'artifacts/bust-reliquary-production/build-portrait.py'),'--',input,derived],{stdio:'inherit'});
  // Blender can return success after a Python traceback. Never silently pack
  // yesterday's retained sculpture when today's derivation did not finish.
  if(!fs.existsSync(derived))throw Error('Blender did not export the revised portrait');
  const candidate=JSON.parse(fs.readFileSync(derived,'utf8'));
  for(const part of ['head','torso'])if(candidate[part]?.nonManifoldEdges!==0||candidate[part]?.positions?.length<1000)throw Error(`Invalid rebuilt ${part} portrait`);
  fs.copyFileSync(derived,retainedPath);
 }finally{fs.rmSync(temporary,{recursive:true,force:true})}
}
const portrait=JSON.parse(fs.readFileSync(retainedPath,'utf8'));
for(const name of ['head','torso'])if(portrait[name].nonManifoldEdges!==0)throw Error(`Reliquary ${name} must be closed`);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const eyeJoint=side=>RIG.jointIndex[`eye_${side}`];
const qi=(axis,a)=>axis==='x'?[Math.sin(a/2),0,0,Math.cos(a/2)]:axis==='y'?[0,Math.sin(a/2),0,Math.cos(a/2)]:[0,0,Math.sin(a/2),Math.cos(a/2)];
const smooth=(a,b,t)=>{const u=Math.max(0,Math.min(1,(t-a)/(b-a)));return u*u*(3-2*u)};
const SHUTTER_TRAVEL=.18;
function frames(mode,t){
 const out=Object.fromEntries(RIG.joints.map(j=>[j.name,{translation:[0,0,0],rotation:[0,0,0,1]}]));
 const rot=(j,axis,angle)=>out[j].rotation=qi(axis,angle);
 const shift=(j,p)=>out[j].translation=p;
 // Narrow bronze shutters lift behind the preserved carved lids and fold into
 // protected internal pockets. Stone stays rigid; no external goggle frame.
 let open=0;
 if(mode==='recognition-returned'){
  const l=smooth(.65,1.6,t),r=smooth(1.15,2.25,t);shift('shutter_L',[0,SHUTTER_TRAVEL*l,-.08*l]);shift('shutter_R',[0,SHUTTER_TRAVEL*r,-.08*r]);rot('shutter_L','x',Math.PI/2*l);rot('shutter_R','x',Math.PI/2*r);
  const seatL=(1-smooth(1.1,2.6,t))*.045,seatR=(1-smooth(1.8,3.1,t))*.045;shift('eye_L',[0,0,-seatL]);shift('eye_R',[0,0,-seatR]);
  rot('eye_L_yaw','y',-.10*(1-smooth(2.3,4.8,t)));rot('eye_R_yaw','y',.085*(1-smooth(2.9,5.4,t)));
  rot('neck_pitch','x',.035*smooth(3.8,5.4,t)*(1-smooth(7.5,9.2,t)));rot('neck_yaw','y',.025*smooth(4.7,6,t)*(1-smooth(7.3,9.5,t)));
  // One measured, asynchronous proof that these are shutters rather than skin.
  const blink=smooth(7.4,7.64,t)*(1-smooth(7.9,8.3,t));shift('shutter_L',[0,SHUTTER_TRAVEL*l*(1-blink),-.08*l*(1-blink)]);shift('shutter_R',[0,SHUTTER_TRAVEL*r*(1-blink*.92),-.08*r*(1-blink*.92)]);rot('shutter_L','x',Math.PI/2*l*(1-blink));rot('shutter_R','x',Math.PI/2*r*(1-blink*.92));
  shift('neck_latch',[0,0,.055*smooth(3.4,4.1,t)*(1-smooth(8.6,9.5,t))]);
 }else if(mode==='recognition-carried'){
  shift('shutter_L',[0,SHUTTER_TRAVEL*smooth(.7,1.6,t),-.08*smooth(.7,1.6,t)]);shift('shutter_R',[0,SHUTTER_TRAVEL*smooth(1.4,2.3,t),-.08*smooth(1.4,2.3,t)]);rot('shutter_L','x',Math.PI/2*smooth(.7,1.6,t));rot('shutter_R','x',Math.PI/2*smooth(1.4,2.3,t));
  rot('neck_yaw','y',.025*smooth(2,4,t)*(1-smooth(8,10,t)));rot('neck_pitch','x',.035*smooth(1.8,4.7,t)*(1-smooth(8,10,t)));
  shift('neck_latch',[0,0,.055*smooth(2.4,3.3,t)*(1-smooth(8.6,9.5,t))]);
 }else if(mode==='ritual'){
  open=1;const press=smooth(0,.5,t)*(1-smooth(3.8,4.7,t));shift('seal_plunger',[0,0,-RIG.sealTravel*press]);
  const load=smooth(.38,1.15,t)*(1-smooth(3.6,4.8,t));rot('linkage_L','z',-.105*load);rot('linkage_R','z',.105*load);shift('seal_latch',[0,.055*load,0]);
  shift('neck_latch',[0,0,.075*smooth(.7,1.3,t)*(1-smooth(3.7,4.45,t))]);
  rot('neck_pitch','x',.11*smooth(.8,1.8,t)-.055*smooth(2,4.4,t));rot('neck_yaw','y',.32*smooth(1.75,3.85,t));
  rot('eye_L_yaw','y',.13*smooth(1.15,1.8,t)-.13*smooth(2.6,3.85,t));rot('eye_R_yaw','y',.13*smooth(1.25,1.9,t)-.13*smooth(2.6,3.85,t));
 }else if(mode==='settled'){open=1;rot('neck_yaw','y',.32);rot('neck_pitch','x',.055)}
 else if(mode==='blind'){open=0}
 if(open){shift('shutter_L',[0,SHUTTER_TRAVEL,-.08]);shift('shutter_R',[0,SHUTTER_TRAVEL,-.08]);rot('shutter_L','x',Math.PI/2);rot('shutter_R','x',Math.PI/2)}
 return out;
}
function buildGeometry(detail){
 const mesh=[];
 const add=(name,g,material,joint='root',role=material,extra={})=>{if(g.indices.length)mesh.push({name,g,material,joint:RIG.jointIndex[joint],role,extra})};
 add('horizon_bust_portrait',portrait.head,'marble','neck_pitch','marble',{sourceMesh:'marble_bust_01',actualSockets:true,rigidStone:true});
 add('horizon_bust_shoulders',portrait.torso,'marble','root','marble',{sourceMesh:'marble_bust_01',rigidStone:true});
 const stone=reliquaryGeometry(),s=detail;
 const frustum=(y0,y1,bx,bz,tx,tz,handOpening=false)=>{
  const ring=(y,x,z)=>[[-x/2,y,-z/2],[x/2,y,-z/2],[x/2,y,z/2],[-x/2,y,z/2]],a=ring(y0,bx,bz),b=ring(y1,tx,tz);
  stone.quad(a[0],a[1],a[2],a[3]);stone.quad(b[3],b[2],b[1],b[0]);
  for(let i=0;i<4;i++)if(!(handOpening&&i===2))stone.quad(a[(i+1)%4],a[i],b[i],b[(i+1)%4]);
  if(handOpening){
   const contour=[new Vector2(-bx/2,y0),new Vector2(-tx/2,y1),new Vector2(tx/2,y1),new Vector2(bx/2,y0)];
   const hole=handBezelOutline(detail===32?4:detail===20?3:2).map(p=>new Vector2(RIG.sealCenter[0]+p[0]*1.16,RIG.sealCenter[1]+p[1]*1.16));
   const vertices=[...contour,...hole];
   for(const [i,j,k] of ShapeUtils.triangulateShape(contour,[hole])){
    const p=[vertices[i],vertices[j],vertices[k]].map(v=>[v.x,v.y,reliquaryFrontDepth(v.y)]);
    const nz=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
    if(nz>0)stone.triangle(...p);else stone.triangle(p[0],p[2],p[1]);
   }
  }
 };
 // The conservatoire uses ordinary stone plinths. Keep this one monumental
 // in scale but built from a foot, one unadorned shaft and a shallow cap.
 // Its original collision footprint and bust seat are unchanged.
 frustum(0,.18,4.2,2.22,4.2,2.22);
 frustum(.18,.30,3.44,1.98,3.44,1.98);
 frustum(.30,3.11,3.02,1.70,3.02,1.70,true);
 frustum(3.11,3.23,3.18,1.84,3.18,1.84);
 frustum(3.23,3.39327145,2.60,1.54,2.60,1.54);
 add('horizon_bust_pedestal',stone,'stone','root','stone',{collisionEnvelope:RIG.collisionEnvelope,palmHeight:1.25});
 // The reachable seal is an actual cast hand impression: four rounded fingers,
 // a side thumb, a wrist and a shallow palm hollow, all with real geometry.
 const {housing,seal,wear}=createHandBezelGeometry(RIG.sealCenter,detail===32?4:detail===20?3:2);
 add('horizon_bust_seal_housing',housing,'bronzeDark','root','bronze');
 add('horizon_bust_seal',seal,'inlay','seal_plunger','seal',{handShaped:true,palmInset:true,concavity:.069,travel:RIG.sealTravel});
 add('horizon_bust_seal_wear',wear,'inlay','seal_plunger','bronze');
 // A marble throat continuation fills the 6 cm articulation gap just behind
 // the cut surfaces. It reads as part of the portrait, with no external race,
 // coloured band, choker or hardware.
 const core=reliquaryGeometry();core.ellipsoid([-.24,4.94,-.09],[.52,.075,.43],s,12);
 add('horizon_bust_neck_core',core,'marble','neck_yaw','marble');
 // The original eyelids remain the visible contour. Small bronze races live
 // inside the carved slit, with independent yaw/pitch pivots beneath the stone.
 for(const side of ['L','R']){
  const c=RIG.eyeCenters[side],front=c[2]+.095,socket=reliquaryGeometry(),yaw=reliquaryGeometry(),pitch=reliquaryGeometry(),shutter=reliquaryGeometry();
  socket.torus([c[0],c[1],front-.012],.112,.006,'z',s,6,[1.05,.59,1]);socket.torus([c[0],c[1],c[2]-.10],.11,.011,'z',s,6,[1.03,.70,1]);
  yaw.torus(c,.108,.007,'y',s/2,6,[1,1,.9],Math.PI,Math.PI*2);pitch.torus(c,.105,.007,'x',s/2,6,[1,1,1],Math.PI,Math.PI*2);
  // A fitted curved plate closes only the narrow bore and folds back into the
  // cut pocket. It is visible as an old repair, never a frame around the face.
  shutter.lathe([[0,-.008],[.108,-.008],[.119,.004],[.119,.015],[.11,.020],[0,.026]],[c[0],c[1],front+.018],s,'z');
  for(let i=0;i<shutter.positions.length;i+=3)shutter.positions[i+1]=c[1]+(shutter.positions[i+1]-c[1])*.56;
  add(`horizon_bust_socket_${side}`,socket,'bronze','neck_pitch','bronze',{physicalSocket:true});add(`horizon_bust_gimbal_yaw_${side}`,yaw,'bronzeDark',`eye_${side}_yaw`,'bronze');add(`horizon_bust_gimbal_pitch_${side}`,pitch,'bronze',`eye_${side}_pitch`,'bronze');add(`horizon_bust_shutter_${side}`,shutter,'shutter',`shutter_${side}`,'shutter');
  const eyes=createCanonicalEyeGeometry({center:c,radius:RIG.eyeRadius,side,detail:s});for(const [part,g]of Object.entries(eyes))add(`horizon_bust_eye_${side}_${part}`,g,part==='stone'?'eye':part,`eye_${side}`,'eye',{canonicalEye:side,eyePart:part});
 }
 return mesh;
}
async function packageLOD(lod,detail){
 const document=new Document(),buffer=document.createBuffer('reliquary-buffer'),scene=document.createScene('HORIZON / THE BRONZE RELIQUARY'),materials={};
 for(const [name,m]of Object.entries(RELIQUARY_MATERIALS)){
  const material=document.createMaterial(name).setBaseColorFactor(m.color).setRoughnessFactor(m.roughness).setMetallicFactor(m.metallic).setExtras({reliquaryMaterial:name});
  materials[name]=material;
 }
 const joints=RIG.joints.map(j=>document.createNode(j.name));
 RIG.joints.forEach((j,i)=>{const parent=j.parent?RIG.joints.find(p=>p.name===j.parent):null;joints[i].setTranslation(j.pivot.map((x,k)=>x-(parent?.pivot[k]||0)));if(parent)joints[parent.index].addChild(joints[i]);else scene.addChild(joints[i])});
 const ib=RIG.joints.flatMap(j=>[1,0,0,0,0,1,0,0,0,0,1,0,-j.pivot[0],-j.pivot[1],-j.pivot[2],1]);
 const skin=document.createSkin('bronze-reliquary-rigid-skin').setSkeleton(joints[0]).setInverseBindMatrices(document.createAccessor('inverse-bind',buffer).setType('MAT4').setArray(Float32Array.from(ib)));joints.forEach(j=>skin.addJoint(j));
 const meshStats={};let totalTriangles=0,totalVertices=0;const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(const {name,g,material,joint,role,extra}of buildGeometry(detail)){
  const count=g.positions.length/3,js=new Uint8Array(count*4),ws=new Float32Array(count*4);for(let i=0;i<count;i++){js[i*4]=joint;ws[i*4]=1;for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],g.positions[i*3+k]);bounds.max[k]=Math.max(bounds.max[k],g.positions[i*3+k]);}}
  const attr=(suffix,type,values)=>document.createAccessor(`${name}:${suffix}`,buffer).setType(type).setArray(values);
  const primitive=document.createPrimitive().setAttribute('POSITION',attr('position','VEC3',Float32Array.from(g.positions))).setAttribute('NORMAL',attr('normal','VEC3',Float32Array.from(g.normals))).setAttribute('JOINTS_0',attr('joint','VEC4',js)).setAttribute('WEIGHTS_0',attr('weight','VEC4',ws)).setIndices(attr('index','SCALAR',Uint32Array.from(g.indices))).setMaterial(materials[material]);
  const mesh=document.createMesh(name).addPrimitive(primitive).setExtras({horizonRole:role==='seal'?'seal':role==='stone'?'pedestal':'portrait',reliquaryRole:role,rigidJoint:RIG.joints[joint].name,lod,...extra});scene.addChild(document.createNode(name).setMesh(mesh).setSkin(skin));
  meshStats[name]={triangles:g.indices.length/3,vertices:count,role,joint:RIG.joints[joint].name};totalTriangles+=g.indices.length/3;totalVertices+=count;
 }
 for(const [mode,duration]of Object.entries(RIG.clips)){
  const count=Math.round(duration*24)+1,times=Array.from({length:count},(_,i)=>i*duration/(count-1)),poses=times.map(t=>frames(mode,t)),animation=document.createAnimation(mode),input=document.createAccessor(`${mode}:time`,buffer).setType('SCALAR').setArray(Float32Array.from(times));
  RIG.joints.forEach((j,index)=>{for(const targetPath of ['translation','rotation']){
   const values=poses.flatMap(p=>targetPath==='translation'?p[j.name].translation.map((v,k)=>v+joints[index].getTranslation()[k]):p[j.name].rotation);
   const output=document.createAccessor(`${mode}:${j.name}:${targetPath}`,buffer).setType(targetPath==='rotation'?'VEC4':'VEC3').setArray(Float32Array.from(values));const sampler=document.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(joints[index]).setTargetPath(targetPath).setSampler(sampler));
  }});
 }
 document.getRoot().setExtras({design:RIG.design,bindSpace:'world metres, Y up, +Z forward',assetWorldHeight:6.5,worldToTapeScale:RIG.worldToTapeScale,sealHeight:1.25,physicalSocketBoolean:true,rigidStone:true,lod});
 const bytes=await new NodeIO().writeBinary(document);const file=lod===0?'horizon-bust.glb':`horizon-bust-lod${lod}.glb`;fs.writeFileSync(path.join(ROOT,'public/assets',file),bytes);
 return {file,bytes:bytes.length,sha256:sha(bytes),totalTriangles,totalVertices,bounds,meshes:meshStats,lod};
}
const lods=[];for(const [lod,detail]of [[0,32],[1,20],[2,12]])lods.push(await packageLOD(lod,detail));
const stats={...lods[0],generator:'tools/chunk_surfer/build-horizon-bust.mjs',design:RIG.design,version:2,coordinateSystem:'world metres; Y up; forward +Z',assetWorldHeight:6.5,jointCount:RIG.joints.length,rigidWeights:true,socketBoolean:true,closedPortrait:{head:portrait.head.nonManifoldEdges,torso:portrait.torso.nonManifoldEdges},seal:{center:RIG.sealCenter,height:1.25,shape:'cast open hand',concavity:.069,travel:RIG.sealTravel},clips:RIG.clips,lods:lods.map(({meshes,...rest})=>rest),retainedPortraitSha256:sha(fs.readFileSync(retainedPath))};
fs.writeFileSync(path.join(ROOT,'public/assets/horizon-bust.stats.json'),JSON.stringify(stats,null,2)+'\n');
const sourceCredits=JSON.parse(fs.readFileSync(path.join(ROOT,'public/assets/conservatory-acquisitions.credits.json'),'utf8')).sources.find(s=>s.mesh==='marble_bust_01');
const credits={file:stats.file,pack:{sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles},source:{mesh:'marble_bust_01',...sourceCredits,acquisitionPack:path.basename(sourcePath),acquisitionPackSha256:sha(fs.readFileSync(sourcePath))},derivation:{builder:stats.generator,retainedBooleanSource:'artifacts/bust-reliquary-production/portrait.json',retainedBooleanScript:'artifacts/bust-reliquary-production/build-portrait.py',deterministic:true,externalDownloadsRequired:false,operations:['old anisotropic tape transform baked into world bind shape','closed eyelid-preserving physical ocular bores','closed rigid neck cut','16 joint rigid skin','concealed neck pivot and fitted folding shutters','recessed differentiated mineral eyes','concave reachable cast-hand seal','unadorned conservatoire stone plinth','five baked performance clips','three mechanical detail LODs']}};
fs.writeFileSync(path.join(ROOT,'public/assets/horizon-bust.credits.json'),JSON.stringify(credits,null,2)+'\n');
console.log(JSON.stringify({design:stats.design,joints:stats.jointCount,triangles:stats.totalTriangles,bytes:stats.bytes,lods:stats.lods.map(l=>({lod:l.lod,triangles:l.totalTriangles})),clips:stats.clips},null,2));
