// The actual meadow meshes and sky, borrowed by a station occurrence. These
// transforms never alter immediate footing, the return plane or its van frame.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {createMemoryFieldRenderer,installMemoryMeshes} from './memory-field-renderer.js';
import {openingHorizonFrame} from './opening-omen.js';
import {assetUrl} from '../platform/paths.js';
import {VAN_BRAND_PACK,VAN_BRAND_FITS} from '../data/van-brand.js';
import {VAN_WRECK,VAN_WRECK_ASSET,vanWreckFoldMatrix,vanWreckHingedMatrix} from '../data/van-wreck.js';
import {crashMultiply,stationFieldFallingBody,stationFieldWreckBody} from '../data/station-field-crash.js';
import {vanBrandInstances} from './van-brand.js';
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,v)=>{const q=clamp((v-a)/(b-a));return q*q*(3-2*q);};
const matrix=(x,y,z,yaw=0,sx=1,sy=1,sz=1)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);};
const part=(mesh,id,m,radius=3)=>({id:`station-field:${id}`,mesh,matrix:m,x:m[12],y:m[13],z:m[14],cullRadius:radius,structural:false,decorative:true,noShadow:true,noReflection:true});
let earth=null;
export function stationFieldEarthGeometry(){
 if(earth)return earth;
 const rim=[[-.55,-1],[-.04,-.87],[.74,-1],[1,-.41],[.76,.08],[.91,.38],[.39,.77],[-.08,1],[-.54,.68],[-.93,.73],[-.75,.08],[-1,-.41]];
 const build=(name,base,top)=>({name,p:[],i:[],base:[...base,1],emissive:top?[.017,.024,.008]:[.018,.013,.010],roughness:1});
 const sod=build('station_field_earth',[.145,.226,.064],true),roots=build('station_field_earth_root',[.13,.087,.051],false);
 const triangle=(row,a,b,c)=>{const k=row.p.length/3;row.p.push(...a,...b,...c);row.i.push(k,k+1,k+2);};
 const edge=rim.map(([x,z],k)=>[x,.023+.021*Math.sin(k*3.8),z]);
 const shoulder=rim.map(([x,z],k)=>[x*.88,-.11-.10*(.5+.5*Math.sin(k*5.1)),z*.86]);
 const torn=rim.map(([x,z],k)=>[x*(.68+.15*Math.sin(k*2.6)),-.26-.20*(.5+.5*Math.sin(k*4.5)),z*.67]);
 for(let k=0;k<rim.length;k++){
  const j=(k+1)%rim.length;
  triangle(sod,[.08,.075,-.02],edge[j],edge[k]);
  triangle(sod,edge[k],edge[j],shoulder[j]);triangle(sod,edge[k],shoulder[j],shoulder[k]);
  triangle(roots,shoulder[k],shoulder[j],torn[j]);triangle(roots,shoulder[k],torn[j],torn[k]);
  triangle(roots,[.07,-.38,.06],torn[k],torn[j]);
 }
 return earth=Object.freeze([sod,roots]);
}
export function stationFieldConstructionFrame(input,{state,look={},visit=null}){
 if(visit?.door&&!look.memoryDoor)look={...look,memoryDoor:visit.door};
 const strength={first:.35,second:.55,third:.8,fourth:1}[state.fieldId]??1;
 const amount=clamp(state.deformation?.progress)*strength*(look.reducedDread?.35:1)*(look.reducedMotion?.25:1),warning=clamp(state.deformation?.warning),props=[];
 for(const original of input.props){
  // Foreground retains its canonical support and all recognizable landmarks.
  const p={...original},m=original.matrix;
  if(amount>0&&m&&!/:ground(?:-turf-|$)|:ant(?:-|$)|:door-|:bag$|:jumper(?:-|$)|:wheel$|:hubcap$/.test(p.id)){
   const distance=Math.hypot(m[12]-state.x,m[14]-state.z),outer=smooth(22,68,distance),north=smooth(-10,-180,m[14]);
   const bend=amount*outer*(.25+.75*north);
   if(bend>0){p.matrix=new Float32Array(m);p.matrix[5]*=1+bend*3.4;p.matrix[9]-=bend*.55;
    p.matrix[12]-=m[12]*bend*.18;p.matrix[13]+=bend*Math.max(0,-m[14])*.12;p.matrix[14]-=bend*12;
    p.y=p.matrix[13];p.z=p.matrix[14];p.cullRadius=(p.cullRadius||10)*(1+bend*3.4);}
  }
  props.push(p);
 }
 const door=state.returnDoor;
 if(door){
  for(const mesh of['post','sill','hole'])props.push(part(`mf_door_${mesh}`,`return-${mesh}`,matrix(door.x,0,door.z)));
  // Same actual van door construction, fully open, with bodily clearance.
  for(const mesh of['leaf','glass','trim','metal'])props.push(part(`mf_door_${mesh}`,`return-${mesh}`,matrix(door.x-.62,0,door.z,-1.82)));
 }
 // The far sod opens along two oblique tears, exposing their root beds. The
 // inhabited centre stays whole as the folds turn toward the Ophanim.
 if(amount>0)for(let k=0;k<16;k++){
  const side=k%2?-1:1,row=Math.floor(k/2),wave=1.5*Math.sin(k*2.7),origin=side*(20+row*3.8+wave),z=-32-row*13;
  const phase=smooth(row*.055+(side<0?.04:0),.83+row*.025,amount*1.65);
  if(phase<=0)continue;
  const lift=phase*phase*(12+row*7),width=4.6+row*.61+wave*.33,length=7.3+wave*.73;
  const m=matrix(origin*(1-.48*phase),lift,z-phase*(11+row*1.6),side*(.09+phase*.32),width,1+phase*3,length*(1-.39*phase));
  m[1]=side*phase*width*.87;m[9]=-phase*length*(1.0+.12*Math.cos(k*3));
  for(const mesh of stationFieldEarthGeometry())props.push(part(mesh.name,`earth-strip-${k}-${mesh.name}`,m,18+lift));
 }
 const crash=state.crash||null;
 if(crash){
  const door=look.memoryDoor||null,doorProps=door?props.filter(p=>/^memory-field:door-/.test(p.id)).map(p=>({...p,door})):[];
  const added=stationFieldCrashProps(crash,{metrics:look.vanMetrics,doorProps});
  for(let k=0;k<props.length;k++)if(added.replace.has(props[k].id))props[k]=added.replace.get(props[k].id);
  props.push(...added.props);
 }
 return{...input,props,station:{deformation:amount,warning,returnDoor:door,crash}};
}
// ── THE CRASH FIELD'S VAN ──────────────────────────────────────────────────
// The same van as the drive and the coast: whole on the way down, the bent
// wreck once it is in the ground.
export const STATION_FIELD_VAN_PACKS=Object.freeze([
 Object.freeze({path:'assets/source-drive/drive.glb',meshes:Object.freeze(['drive_vehicle_body','drive_cabin','drive_tyre'])}),
 Object.freeze({path:VAN_BRAND_PACK,meshes:Object.freeze([VAN_BRAND_FITS.drive.mesh])}),
 Object.freeze({path:VAN_WRECK_ASSET,meshes:Object.freeze(Object.values(VAN_WRECK.meshes))}),
]);
export const STATION_FIELD_VAN_METRICS='assets/source-drive/geometry/metrics.json';
const F32=m=>new Float32Array(m);
const T=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const RY=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
const RX=a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];};
const RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
const S=(x,y=x,z=x)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
const M=(...m)=>m.reduce((a,b)=>crashMultiply(a,b));
// Its shadow, only once it is near enough to throw one he could see: a dark
// patch on the grass under it, growing as it comes.
export function stationFieldVanShadowGeometry(){
 const p=[0,0,0],i=[],n=28;
 for(let k=0;k<n;k++){const a=k/n*Math.PI*2;p.push(Math.cos(a),0,Math.sin(a)*1.9);i.push(0,1+k,1+(k+1)%n);}
 return Object.freeze([{name:'station_field_van_shadow',p,i,base:[.012,.014,.012,1],emissive:[0,0,0],roughness:1}]);
}
const SHADOW_FROM=160;
export function stationFieldCrashProps(crash,{metrics=null,doorProps=[]}={}){
 if(!crash)return{props:[],replace:new Map()};
 const out=[],replace=new Map(),body=metrics?.body,mount=metrics?.cabinBodyMount||[0,0,-.45];
 const add=(mesh,id,m,radius=6)=>out.push(part(mesh,`crash-${id}`,F32(m),radius));
 if(!crash.landed){
  const van=stationFieldFallingBody(crash);
  add('drive_vehicle_body','body',van,7);add('drive_cabin','cabin',M(van,T(...mount)),5);
  if(body)for(const axle of[body.frontAxleZ,body.rearAxleZ])for(const side of[-1,1])add('drive_tyre',`tyre-${axle}-${side}`,M(van,T(side*body.track/2,body.wheelRadius,axle)),2);
  if(crash.height<SHADOW_FROM){
   const near=1-crash.height/SHADOW_FROM,r=.5+1.6*near*near;
   add('station_field_van_shadow','shadow',M(T(crash.target.x,.025,crash.target.z),RY(crash.yaw),S(r)),4);
  }
 }else{
  const wreck=stationFieldWreckBody(crash);
  add(VAN_WRECK.meshes.hull,'hull',wreck,8);
  // The doors that stayed on hang open on their hinges; the near cab door is the way back.
  for(const key of Object.keys(VAN_WRECK.hinges))add(VAN_WRECK.meshes[key],key,M(wreck,vanWreckHingedMatrix(key)),4);
  if(body){
   const rear=M(wreck,vanWreckFoldMatrix());
   for(const side of[-1,1])add('drive_tyre',`rear-tyre-${side}`,M(rear,T(side*body.track/2,body.wheelRadius,body.rearAxleZ)),2);
  }
  // What came off it lies round the hole: the far cab door, a rear door, a front wheel.
  const ground=(dx,dz,yaw,lift,turn,pivot=[0,0,0])=>M(T(crash.target.x+dx,lift,crash.target.z+dz),RY(crash.yaw+yaw),turn,T(...pivot.map(v=>-v)));
  add(VAN_WRECK.meshes.cabDoor,'cab-door',ground(-.6,-2.9,.5,.16,RZ(Math.PI/2),VAN_WRECK.pieces.cabDoor.pivot),3);
  add(VAN_WRECK.meshes.rearDoor,'rear-door',ground(3.6,-1.1,-.35,.11,M(RZ(-.33),RX(-Math.PI/2)),VAN_WRECK.pieces.rearDoor.pivot),3);
  add('drive_tyre','front-tyre',M(T(crash.target.x-2.4,.11,crash.target.z+2.7),RY(.6),RZ(Math.PI/2)),2);
  // The field it went into: sod thrown up and out round the nose.
  for(let k=0;k<9;k++){
   const a=k*2.399+.4,r=1.1+(k%4)*.55,sc=.32+(k%3)*.17;
   const m=M(T(crash.target.x+Math.cos(a)*r,.02,crash.target.z+Math.sin(a)*r),RY(a*1.7),RX(.25*Math.sin(k*1.3)),S(sc,sc*.9,sc));
   for(const mesh of stationFieldEarthGeometry())add(mesh.name,`sod-${k}-${mesh.name}`,m,2);
  }
  // The door he pressed, if it was close, is flat on its back in the grass.
  if(crash.flattened)for(const p of doorProps){
   const door=p.door,m=M(T(door.x,.06,door.z),RX(-Math.PI/2),T(-door.x,0,-door.z),Array.from(p.matrix));
   replace.set(p.id,{...p,matrix:F32(m),x:m[12],y:m[13],z:m[14]});
  }
 }
 out.push(...vanBrandInstances(out));
 return{props:out,replace};
}
// AHEAD OF TIME (game/source-preload.js): the field, its earth, and the
// crash field's van, installed without taking the camera or the plan. Each
// visit's initialize() finds them resident and only acquires the screen.
export async function prewarmStationFieldAssets({renderer=R3,props=P3,resolveAsset=assetUrl}={}){
 if(!await createMemoryFieldRenderer({renderer,props,resolveAsset}).prepare())return false;
 props.installAuthoredPropMeshes?.(installMemoryMeshes(stationFieldEarthGeometry()));
 props.installAuthoredPropMeshes?.(installMemoryMeshes(stationFieldVanShadowGeometry()));
 for(const pack of STATION_FIELD_VAN_PACKS){const catalog=new Set(props.propMeshCatalog?.()||[]);if(pack.meshes.some(m=>!catalog.has(m)))await props.addPropPack(resolveAsset(pack.path));}
 const catalog=new Set(props.propMeshCatalog?.()||[]);return STATION_FIELD_VAN_PACKS.every(pack=>pack.meshes.every(m=>catalog.has(m)));
}
export function createStationFieldRenderer({renderer=R3,props=P3,resolveAsset=assetUrl,fetcher=globalThis.fetch}={}){
 let horizon=null,last=null,vanMetrics=null;
 const base=createMemoryFieldRenderer({renderer,props,transformFrame:(frame,context)=>{
  last=stationFieldConstructionFrame(frame,{...context,look:{...context.look,vanMetrics}});
  renderer.r3dSetStormFlash?.(0);
  const warning=clamp(context.state.deformation?.warning),progress=clamp(context.state.deformation?.progress);
  if(warning>0){
   const source=openingHorizonFrame({centre:[0,42,-175],radius:Math.max(.15,warning*(12+progress*8)),clock:context.state.elapsed,view:[0,42,-175],reducedMotion:!!context.look.reducedMotion});
   horizon={...source,light:warning*.35,capture:source.capture*warning,dragging:source.dragging*warning};
  }else horizon=null;
  renderer.r3dSetSourceRestHorizon?.(horizon);return last;
 }});
 return{...base,
  async initialize(visit){
   if(!await base.initialize(visit))return false;renderer.r3dSetStormFlash?.(0);props.installAuthoredPropMeshes?.(installMemoryMeshes(stationFieldEarthGeometry()));
   // Only the crash field carries the van. Without it the field cannot do
   // what its door does, so a missing pack is a failure, not a quiet field.
   if(visit?.crash){
    props.installAuthoredPropMeshes?.(installMemoryMeshes(stationFieldVanShadowGeometry()));
    for(const pack of STATION_FIELD_VAN_PACKS){const catalog=new Set(props.propMeshCatalog?.()||[]);if(pack.meshes.some(m=>!catalog.has(m)))await props.addPropPack(resolveAsset(pack.path));}
    const missing=STATION_FIELD_VAN_PACKS.flatMap(pack=>pack.meshes).filter(m=>!new Set(props.propMeshCatalog?.()||[]).has(m));
    if(missing.length)throw Error('The van is missing: '+missing.join(', '));
    const response=await fetcher(resolveAsset(STATION_FIELD_VAN_METRICS));if(!response?.ok)throw Error('The van metrics are unavailable.');vanMetrics=await response.json();
   }
   return true;
  },
  dispose(){renderer.r3dSetSourceRestHorizon?.(null);return base.dispose();},
  diagnostics:()=>({...base.diagnostics(),station:last?.station||null,horizon:!!horizon}),
 };
}
