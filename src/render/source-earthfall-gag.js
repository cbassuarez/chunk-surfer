// The second apparatus is the same constructed object, carried by the Scene
// Dock floor. Its detached pressure is the existing apparition shader variant.
import {ZONE} from '../data/floorplan/legend.js';
import {THRESHOLD_GAG_MESHES,THRESHOLD_GAG} from '../data/threshold-gag.js';
import {meshForApparitionPose} from '../game/emergency-light-runtime.js';
import {sourceElleryAsideObjectMatrix,multiplyAsideMatrix as multiply,transformAsidePoint} from '../game/source-earthfall-ellery-aside.js';

export const SOURCE_EARTHFALL_GAG_APPARITION_MESH=meshForApparitionPose('head_turn');
export const SOURCE_EARTHFALL_GAG_REQUIRED=Object.freeze([...THRESHOLD_GAG_MESHES,SOURCE_EARTHFALL_GAG_APPARITION_MESH]);
export const SOURCE_EARTHFALL_GAG_PACK='assets/ellery-threshold-gag.glb';
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
// The source hinge convention is deliberately opposite the room's native
// matrix helper: local -X must swing toward local -Z at +PI/2.
export function sourceEarthfallGagNativeMatrix({x=0,y=0,z=0,yaw=0,pitch=0,scale=1,scaleX=scale,scaleY=scale,scaleZ=scale}={}){
 const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),k=finite(scale,1),sx=finite(scaleX,k),sy=finite(scaleY,k),sz=finite(scaleZ,k);
 return[c*sx,0,s*sx,0,-s*sp*sy,cp*sy,c*sp*sy,0,-s*cp*sz,-sp*sz,c*cp*sz,0,x,y,z,1];
}
const position=(m,p)=>{const a=transformAsidePoint(m,p);return{x:a[0],y:a[1],z:a[2]};};
const instance=(id,mesh,matrix,extra={})=>({id:'earthfall-ellery:gag:'+id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],
 zone:ZONE.getIn,noReflection:true,structural:true,thresholdGag:true,asideRole:'gag',...extra});

export function sourceEarthfallGagRenderFrame(frame={}){
 const gag=frame.gag;
 if(!gag?.enabled||frame.blackoutAlpha>=1)return{props:[],supportMatrix:null,mount:null,speaker:null,contact:null,shadow:null};
 const mount=gag.mount,angle=finite(gag.angle,Math.PI/2),demolitionTime=finite(frame.elapsed);
 if(!mount||![mount.x,mount.y,mount.z,mount.yaw].every(Number.isFinite))return{props:[],supportMatrix:null,mount:null,speaker:null,contact:null,shadow:null};
 const supportMatrix=gag.supportMatrix||sourceElleryAsideObjectMatrix('earthfall-ellery-gag',[mount.x,0,mount.z],demolitionTime),
  fixed=multiply(supportMatrix,sourceEarthfallGagNativeMatrix(mount)),
  moving=multiply(supportMatrix,sourceEarthfallGagNativeMatrix({...mount,yaw:mount.yaw+angle})),props=[];
 THRESHOLD_GAG_MESHES.forEach((mesh,index)=>props.push(instance(index,mesh,index<2?fixed:moving,{gagPart:index<2?'fixed':'moving',gagPhase:gag.phase,hingeAngle:angle})));
 let shadow=null;
 if(gag.shadow&&finite(gag.shadow.charge)>0){
  const p=gag.shadow,feet=finite(p.feet),shadowSupport=sourceElleryAsideObjectMatrix('earthfall-ellery-gag-pressure',[p.x,feet,p.z],demolitionTime),
   matrix=multiply(shadowSupport,sourceEarthfallGagNativeMatrix({x:finite(p.x),y:feet,z:finite(p.z),yaw:finite(p.yaw),pitch:finite(p.pitch),scale:finite(p.scale,1),scaleX:p.scaleX,scaleY:p.scaleY,scaleZ:p.scaleZ}));
  shadow=instance('pressure',SOURCE_EARTHFALL_GAG_APPARITION_MESH,matrix,{gagPart:'pressure',structural:false,noShadow:true,
   apparitionVariant:15,emissive:[.65,.78,.82,Math.max(0,Math.min(1,finite(p.charge)))],cullRadius:2});
  props.push(shadow);
 }
 return{props,supportMatrix,mount:position(fixed,[0,0,0]),speaker:position(moving,THRESHOLD_GAG.speaker),contact:position(fixed,THRESHOLD_GAG.contact),shadow};
}
