// The approved wheel skin, repurposed as one real hand on the bus release bar.
// World metres and a retained attempt clock enter here; no controller, DOM,
// independent time, camera overlay or generated finger axes live in this module.
import {WHEEL_HAND_GEOMETRY} from '../game/source-drive/geometry/wheel-hands-pose.js';

export const BUS_DOOR_ATTEMPT_HANDS=Object.freeze({
 asset:WHEEL_HAND_GEOMETRY.url,meshes:Object.freeze(['drive_right_hand','drive_right_forearm','drive_right_sleeve','drive_right_upper_sleeve']),
 reachSeconds:.34,holdUntil:1.25,seconds:1.85,upperArmM:.34,forearmM:.32,barHalfWidthM:.020,barProfile:'square',
 // Independently sampled from all1360 shipped right-hand skin vertices. The
 // smallest signed skin-to-40mm-square-bar distance is +.000200m.
 gripOpen:.40,gripReference:Object.freeze([WHEEL_HAND_GEOMETRY.majorRadius,0,0]),
});
const REST=Object.freeze({p:Object.freeze([.2234624283108983,-.073,.09392720839674808]),q:Object.freeze([-.4331624236712903,-.6851104059975737,.3129748307990521,.4950159609494874])});
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1)),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>add(a,mul(sub(b,a),t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);},pulse=(t,a,b,c)=>smooth((t-a)/(b-a))*(1-smooth((t-b)/(c-b)));
const qrot=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
function align(v,a,b){const d=clamp(dot(a,b),-1,1);if(d>.999999)return v;if(d<-.999999){const ax=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return sub(mul(ax,2*dot(ax,v)),v);}const q=[...cross(a,b),1+d],n=length(q);return qrot(v,q.map(x=>x/n));}
const vector=(m,v)=>[0,1,2].map(k=>m[k]*v[0]+m[4+k]*v[1]+m[8+k]*v[2]);
const point=(m,p)=>add(vector(m,p),m.slice(12,15));
function basis(yaw,side,roll=0){
 // Rear(+X wall): nativeX -> bus−Y, nativeY -> bus+Z,
 // nativeZ(driver/forearmward) -> bus−X. Front uses a proper180° rotation,
 // never a negative-scale mirror, so palm and normal winding stay anatomical.
 const c=Math.cos(yaw),s=Math.sin(yaw),x=[0,-side,0],y=[s,0,c],z=[-side*c,0,side*s];
 const co=Math.cos(roll),si=Math.sin(roll),xx=add(mul(x,co),mul(z,-si)),zz=add(mul(x,si),mul(z,co));
 return[...xx,0,...y,0,...zz,0,0,0,0,1];
}
function atWrist(rotation,wrist){const m=[...rotation],offset=sub(wrist,vector(rotation,REST.p));m[12]=offset[0];m[13]=offset[1];m[14]=offset[2];return m;}
function armMap(start,end,rotation,restLength){
 const restBasis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>qrot(v,REST.q));
 const current=restBasis.map(v=>vector(rotation,v)),from=mul(current[1],-1),to=unit(sub(end,start));
 const target=current.map(v=>align(v,from,to)),scale=length(sub(end,start))/restLength,m=Array(16).fill(0);
 for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]=target[0][r]*restBasis[0][c]+target[1][r]*restBasis[1][c]*scale+target[2][r]*restBasis[2][c];
 const offset=sub(start,vector(m,REST.p));m[12]=offset[0];m[13]=offset[1];m[14]=offset[2];m[15]=1;return m;
}
function solve(shoulder,wrist,rotation){
 const delta=sub(wrist,shoulder),d=length(delta),a=BUS_DOOR_ATTEMPT_HANDS.upperArmM,b=BUS_DOOR_ATTEMPT_HANDS.forearmM;
 if(d>=a+b-.0001||d<=Math.abs(a-b)+.0001)return{rejected:true,reason:'The actual release-bar grip is outside the anchored arm range.',reachM:d};
 const axis=unit(delta),along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
 // Pick the elbow on the legal two-link circle which best continues the
 // skin's real wrist axis. This avoids a mathematically reachable back-bend.
 const native=unit(vector(rotation,qrot([0,-1,0],REST.q))),project=sub(native,mul(axis,dot(native,axis)));
 const radial=length(project)>1e-6?unit(project):unit(cross(axis,Math.abs(axis[0])<.8?[1,0,0]:[0,1,0]));
 const elbow=add(add(shoulder,mul(axis,along)),mul(radial,height));
 return{shoulder,wrist,elbow,reachM:d,upperLengthM:length(sub(elbow,shoulder)),forearmLengthM:length(sub(wrist,elbow)),wristBendDegrees:Math.acos(clamp(dot(native,unit(sub(elbow,wrist))),-1,1))*180/Math.PI};
}
function fingers(open){const joints={};for(const f of['index','middle','ring','pinky'])for(const[i,part]of['proximal','intermediate','distal'].entries()){const a=[.38,.68,.40][i]*open;joints[`drive_right_${f}-finger-phalanx-${part}`]={rotation:[Math.sin(a/2),0,0,Math.cos(a/2)]};}for(const[i,part]of['proximal','distal'].entries()){const a=[.28,.20][i]*open;joints[`drive_right_thumb-phalanx-${part}`]={rotation:[Math.sin(a/2),0,0,Math.cos(a/2)]};}return joints;}
function fail(reason,extra={}){return{props:[],diagnostics:{active:false,rejected:true,reason,...extra}};}

/**
 * attempt: {kind:'exit'|'entry'|'rear-door'|'front-door',elapsed,handle:[x,y,z],angle?}
 * player: {eye:[x,y,z],yaw}; x/y/z may be supplied instead, with y=eye height.
 * busYaw is the physical sourceMatrix heading (derive from busMatrix if absent).
 * The handle must already include the door's actual rattling leaf transform.
 */
export function busDoorAttemptHands({attempt,player=attempt?.playerPose,busYaw,busMatrix}={}){
 if(!attempt)return{props:[],diagnostics:{active:false,rejected:false,phase:'idle'}};
 const elapsed=attempt.elapsed,eye=player?.eye||[player?.x,player?.y,player?.z],yaw=player?.yaw;
 const heading=Number.isFinite(busYaw)?busYaw:Array.isArray(busMatrix)&&busMatrix.length===16?Math.atan2(busMatrix[8],busMatrix[0]):NaN;
 const handle=attempt.handle,angle=attempt.angle??0;
 if(!Number.isFinite(elapsed)||elapsed<0||!Array.isArray(eye)||eye.length!==3||!eye.every(Number.isFinite)||!Number.isFinite(yaw)||!Number.isFinite(heading)||!Number.isFinite(angle)||!Array.isArray(handle)||handle.length!==3||!handle.every(Number.isFinite))return fail('Finite retained time, actual handle and player eye/heading are required.');
 if(!['exit','entry','rear-door','front-door'].includes(attempt.kind))return fail('Unknown bus-door attempt kind.');
 if(elapsed>=BUS_DOOR_ATTEMPT_HANDS.seconds)return{props:[],diagnostics:{active:false,rejected:false,complete:true,elapsed,phase:'complete'}};
 const side=['entry','front-door'].includes(attempt.kind)?-1:1,forward=[Math.sin(yaw),0,-Math.cos(yaw)],right=[Math.cos(yaw),0,Math.sin(yaw)];
 const pull=pulse(elapsed,.39,.48,.60)+.92*pulse(elapsed,.69,.78,.90)+1.08*pulse(elapsed,.99,1.08,1.22);
 const shoulder=add(add(eye,mul(right,.18)),add([0,-.22+.004*pull,0],mul(forward,-.025*pull)));
 const rotation=basis(heading+angle,side,0),gripWrist=add(handle,vector(rotation,sub(REST.p,BUS_DOOR_ATTEMPT_HANDS.gripReference)));
 const full=solve(shoulder,gripWrist,rotation);if(full.rejected)return fail(full.reason,{elapsed,handle:[...handle],shoulder,...full});
 const reach=BUS_DOOR_ATTEMPT_HANDS.reachSeconds,hold=BUS_DOOR_ATTEMPT_HANDS.holdUntil,total=BUS_DOOR_ATTEMPT_HANDS.seconds;
 const phase=elapsed<reach?'reach':elapsed<=hold?'grip':'withdraw',progress=phase==='reach'?elapsed/reach:phase==='withdraw'?(elapsed-hold)/(total-hold):1;
 const weight=phase==='reach'?smooth(progress):phase==='withdraw'?1-smooth(progress):1;
 const resting=add(add(shoulder,mul(forward,.08)),add(mul(right,.04),[0,-.23,0]));
 const arc=phase==='grip'?0:Math.sin(Math.PI*clamp(progress))*.035;
 const wrist=add(mix(resting,gripWrist,weight),[0,arc,0]),ik=solve(shoulder,wrist,rotation);
 if(ik.rejected)return fail(ik.reason,{elapsed,handle:[...handle],shoulder,...ik});
 const open=BUS_DOOR_ATTEMPT_HANDS.gripOpen+.67*(1-weight),matrix=atWrist(rotation,wrist);
 const props=[{id:'bus-door-attempt:right-hand',mesh:'drive_right_hand',matrix,character:{joints:fingers(open)}}];
 const forearm=armMap(wrist,ik.elbow,rotation,.621);for(const part of['forearm','sleeve'])props.push({id:`bus-door-attempt:right-${part}`,mesh:`drive_right_${part}`,matrix:[...forearm],character:{}});
 props.push({id:'bus-door-attempt:right-upper-sleeve',mesh:'drive_right_upper_sleeve',matrix:armMap(ik.elbow,shoulder,rotation,.34),character:{}});
 const contact=point(matrix,BUS_DOOR_ATTEMPT_HANDS.gripReference),barAxis=unit(vector(rotation,[0,1,0]));
 return{props,diagnostics:{active:true,rejected:false,elapsed,phase,atContact:phase==='grip',complete:false,pull,open,side,handle:[...handle],contactPoint:contact,barAxis,contactErrorM:phase==='grip'?length(sub(contact,handle)):null,
  ...ik,rotation,wristInsideSign:side,maximumReachM:BUS_DOOR_ATTEMPT_HANDS.upperArmM+BUS_DOOR_ATTEMPT_HANDS.forearmM,asset:BUS_DOOR_ATTEMPT_HANDS.asset}};
}
