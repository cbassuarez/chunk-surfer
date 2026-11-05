import {SOURCE_CONTINUATION as C,continuationFolds} from '../data/source-continuation.js';
import {captureContinuationVoidLoop} from './source-continuation-void.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,s)=>a.map(v=>v*s);
export const portalDot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const portalPoint=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
export const portalVector=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]);
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
function ordinary(yaw=0,pitch=0){const right=[Math.cos(yaw),0,Math.sin(yaw)],forward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];return{right,up:unit(cross(right,forward)),forward};}
function quaternion(b) {
  const m=[...b.right,...b.up,...scale(b.forward,-1)],tr=m[0]+m[4]+m[8];let q;
  if(tr>0){const s=Math.sqrt(tr+1)*2;q=[(m[5]-m[7])/s,(m[6]-m[2])/s,(m[1]-m[3])/s,s/4];}
  else if(m[0]>m[4]&&m[0]>m[8]){const s=Math.sqrt(1+m[0]-m[4]-m[8])*2;q=[s/4,(m[3]+m[1])/s,(m[6]+m[2])/s,(m[5]-m[7])/s];}
  else if(m[4]>m[8]){const s=Math.sqrt(1+m[4]-m[0]-m[8])*2;q=[(m[3]+m[1])/s,s/4,(m[7]+m[5])/s,(m[6]-m[2])/s];}
  else{const s=Math.sqrt(1+m[8]-m[0]-m[4])*2;q=[(m[6]+m[2])/s,(m[7]+m[5])/s,s/4,(m[1]-m[3])/s];}
  return unit(q);
}
function qmul(a,b){return[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function slerp(a,b,t){let dot=portalDot(a,b);if(dot<0){b=scale(b,-1);dot=-dot;}if(dot>.9995)return unit(a.map((v,k)=>v+(b[k]-v)*t));const theta=Math.acos(clamp(dot,-1,1)),s=Math.sin(theta);return a.map((v,k)=>(v*Math.sin((1-t)*theta)+b[k]*Math.sin(t*theta))/s);}
function basis(q){const[x,y,z,w]=q;return{right:[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)],up:[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)],forward:[-2*(x*z+y*w),-2*(y*z-x*w),-(1-2*(x*x+y*y))]};}
export function continuationCameraBasis(state){
  const target=ordinary(state.yaw||0,state.pitch||0),t=state.cameraTransit;if(!t||t.elapsed>=t.duration)return target;
  const initial=quaternion(t),base=quaternion(ordinary(t.baseYaw||0,t.basePitch||0)),current=quaternion(target),inverse=[-base[0],-base[1],-base[2],base[3]],agency=qmul(qmul(current,inverse),initial);
  return basis(slerp(agency,current,ease(t.elapsed/t.duration)));
}
export function continuationBodyBasis(state){
  if(state.recovery?.up){const up=unit(state.recovery.up);let forward=ordinary(state.heading||0).forward;if(Math.abs(portalDot(up,forward))>.99)forward=Math.abs(up[2])<.9?[0,0,-1]:[1,0,0];const right=unit(cross(forward,up));return{right,up,forward:unit(cross(up,right))};}
  const target=ordinary(state.heading??state.yaw??0),t=state.bodyTransit;if(!t||t.elapsed>=t.duration)return target;
  return basis(slerp(quaternion(t),quaternion(target),ease(t.elapsed/t.duration)));
}
export const continuationBodyAxis=state=>continuationBodyBasis(state).up;
export function continuationCameraEye(state){const t=state.cameraTransit,amount=t?1-ease(t.elapsed/t.duration):0,offset=t?.eyeOffset||[0,0,0];return[state.x+offset[0]*amount,state.feet+C.eyeHeight+offset[1]*amount,state.z+offset[2]*amount];}
export function advancePortalTransit(state,dt){for(const key of['cameraTransit','bodyTransit'])if(state[key]){state[key].elapsed=Math.min(state[key].duration,state[key].elapsed+dt);if(state[key].elapsed>=state[key].duration)state[key]=null;}}
export function portalEdge(portal,side='a') {return side==='a'?{portal,side,source:portal.a,destination:portal.b,matrix:portal.matrix,inverseMatrix:portal.inverseMatrix,fromChartId:portal.fromChart,toChartId:portal.toChart}:{portal,side,source:portal.b,destination:portal.a,matrix:portal.inverseMatrix,inverseMatrix:portal.matrix,fromChartId:portal.toChart,toChartId:portal.fromChart};}
export function continuationPortalCrossing(before,after,{onlyId=null,onlySide=null}={}) {
  if((before.chartId??0)!==(after.chartId??0))return null;
  const chartId=before.chartId??0,a=[before.x,before.feet+C.bodyHeight/2,before.z],b=[after.x,after.feet+C.bodyHeight/2,after.z],axis=continuationBodyAxis(before),segment=C.bodyHeight/2-C.bodyRadius;
  for(const portal of continuationFolds())for(const side of ['a','b']) {
    if(onlyId&&portal.id!==onlyId||onlySide&&side!==onlySide)continue;
    const edge=portalEdge(portal,side),f=edge.source;if(edge.fromChartId!==chartId)continue;
    const d0=portalDot(a.map((v,k)=>v-f.center[k]),f.normal),d1=portalDot(b.map((v,k)=>v-f.center[k]),f.normal);
    if(d0<0||d1>=0||d0-d1<1e-10)continue;
    const fraction=d0/(d0-d1),center=a.map((v,k)=>v+(b[k]-v)*fraction),relative=center.map((v,k)=>v-f.center[k]);
    const width=Math.abs(portalDot(relative,f.right))+segment*Math.abs(portalDot(axis,f.right))+C.bodyRadius;
    const height=Math.abs(portalDot(relative,f.up))+segment*Math.abs(portalDot(axis,f.up))+C.bodyRadius;
    if(width>f.halfWidth+1e-5||height>f.halfHeight+1e-5)continue;
    return {...edge,fraction,crossCenter:center};
  }
  return null;
}
function pose(s){return{x:s.x,z:s.z,feet:s.feet,chartId:s.chartId??0,phase:s.phase,level:s.level,yaw:s.yaw??0,pitch:s.pitch??0,heading:s.heading??0};}
export function transferContinuationPortal(state,edge,{velocity=null,eye=true,transportOnly=false}={}) {
  const from=pose(state),m=edge.matrix,center=portalPoint(m,[state.x,state.feet+C.bodyHeight/2,state.z]),beforeEye=continuationCameraEye(state),afterEye=portalPoint(m,beforeEye),view=continuationCameraBasis(state),body=continuationBodyBasis(state);
  const transformedView=Object.fromEntries(Object.entries(view).map(([k,v])=>[k,portalVector(m,v)])),transformedBody=Object.fromEntries(Object.entries(body).map(([k,v])=>[k,portalVector(m,v)]));
  const incoming=velocity||[state.fall?.vx??state.velocity?.x??0,state.fall?.vy??0,state.fall?.vz??state.velocity?.z??0],outgoing=portalVector(m,incoming),oldFall=state.fall;
  state.x=center[0];state.z=center[2];state.feet=center[1]-C.bodyHeight/2;state.chartId=edge.toChartId;
  state.yaw=angle(Math.atan2(transformedView.forward[0],-transformedView.forward[2]));state.pitch=clamp(Math.asin(clamp(transformedView.forward[1],-1,1)),-1.42,1.3);
  state.heading=angle(Math.atan2(transformedBody.forward[0],-transformedBody.forward[2]));state.velocity={x:outgoing[0],z:outgoing[2]};
  if(eye)state.cameraTransit={elapsed:0,duration:.55,eyeOffset:afterEye.map((v,k)=>v-[state.x,state.feet+C.eyeHeight,state.z][k]),...transformedView,roll:Math.atan2(transformedView.right[1],transformedView.up[1]),baseYaw:state.yaw,basePitch:state.pitch};
  state.bodyTransit={elapsed:0,duration:.55,...transformedBody,baseHeading:state.heading};
  if(!transportOnly){
    const {heading:ignored,...source}=from;state.fall={...(oldFall||{}),x:state.x,z:state.z,feet:state.feet,chartId:state.chartId,level:state.level,yaw:state.yaw,pitch:state.pitch,vx:outgoing[0],vy:outgoing[1],vz:outgoing[2],fromLevel:oldFall?.fromLevel??from.level,fromPhase:oldFall?.fromPhase??from.phase,fromChartId:oldFall?.fromChartId??from.chartId,trigger:oldFall?.trigger||'portal',lastSupport:oldFall?.lastSupport||source,elapsed:oldFall?.elapsed||0,unsupported:true,groundedExit:false};
    // A known atlas joint enters its destination's fixed floor sheet. The
    // Catch closure is the separate authored descent, never a Source-II loop.
    state.fall.voidLoop=captureContinuationVoidLoop({chartId:edge.toChartId,feet:edge.destination.feet,
      phase:edge.portal.id==='catch-closure'?'catch':'wrong-return'});
    if(oldFall?.trace){const destination={...pose(state),up:[...transformedBody.up]};state.fall.trace=[...oldFall.trace,{kind:'fold',...from,up:[...body.up],to:destination,foldId:edge.portal.id,foldSide:edge.side,fromChartId:from.chartId,toChartId:state.chartId,matrix:[...m],inverseMatrix:[...edge.inverseMatrix]},destination];}
  }
  state.foldSerial=(state.foldSerial||0)+1;
  const receipt={id:edge.portal.id,side:edge.side,serial:state.foldSerial,at:state.elapsed,from,to:pose(state),matrix:[...m],inverseMatrix:[...edge.inverseMatrix],fromChartId:from.chartId,toChartId:state.chartId,airborne:!!oldFall,velocityBefore:incoming,velocityAfter:outgoing,bodyCenterBefore:[from.x,from.feet+C.bodyHeight/2,from.z],bodyCenterAfter:center,eyeBefore:beforeEye,eyeAfter:afterEye};
  state.lastFold=receipt;return receipt;
}
