// The actual meadow meshes and sky, borrowed by a station occurrence. These
// transforms never alter immediate footing, the return plane or its van frame.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {createMemoryFieldRenderer,installMemoryMeshes} from './memory-field-renderer.js';
import {openingHorizonFrame} from './opening-omen.js';
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
export function stationFieldConstructionFrame(input,{state,look={}}){
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
 return{...input,props,station:{deformation:amount,warning,returnDoor:door}};
}
export function createStationFieldRenderer({renderer=R3,props=P3}={}){
 let horizon=null,last=null;
 const base=createMemoryFieldRenderer({renderer,props,transformFrame:(frame,context)=>{
  last=stationFieldConstructionFrame(frame,context);
  renderer.r3dSetStormFlash?.(0);
  const warning=clamp(context.state.deformation?.warning),progress=clamp(context.state.deformation?.progress);
  if(warning>0){
   const source=openingHorizonFrame({centre:[0,42,-175],radius:Math.max(.15,warning*(12+progress*8)),clock:context.state.elapsed,view:[0,42,-175],reducedMotion:!!context.look.reducedMotion});
   horizon={...source,light:warning*.35,capture:source.capture*warning,dragging:source.dragging*warning};
  }else horizon=null;
  renderer.r3dSetSourceRestHorizon?.(horizon);return last;
 }});
 return{...base,
  async initialize(visit){if(!await base.initialize(visit))return false;renderer.r3dSetStormFlash?.(0);props.installAuthoredPropMeshes?.(installMemoryMeshes(stationFieldEarthGeometry()));return true;},
  dispose(){renderer.r3dSetSourceRestHorizon?.(null);return base.dispose();},
  diagnostics:()=>({...base.diagnostics(),station:last?.station||null,horizon:!!horizon}),
 };
}
