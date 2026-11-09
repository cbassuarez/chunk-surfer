import {SOURCE_CONTINUATION as C,continuationChartSurfaces,continuationSurfaceContains,continuationSectorSteps,continuationChartSolids,continuationChartDoors} from '../data/source-continuation.js';
import {continuationBodyAxis} from './source-continuation-portals.js';
import {normalizeContinuationVoidLoop,wrapContinuationVoid} from './source-continuation-void.js';
import {archipelagoExitReady} from './source-archipelago-progress.js';

const epsilon=1e-6;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function continuationLeafFraction(state,id) {
  if(id==='catch-final'&&!archipelagoExitReady(state))return 0;
  const m=state?.doorMotion?.[id];if(!m)return state?.doorOpen?.[id]?1:0;
  const t=m.duration>0?clamp((state.elapsed-m.startedAt)/m.duration,0,1):1;
  return m.from+(m.to-m.from)*t;
}
function angleOn(surface,x,z) {
  let a=Math.atan2(z-surface.center.z,x-surface.center.x);
  while(a<surface.startAngle)a+=Math.PI*2;while(a>surface.startAngle+Math.PI*2)a-=Math.PI*2;
  return a;
}
export function continuationClosestFloorPoint(surface,x,z) {
  if(surface.kind!=='sector')return {x:clamp(x,surface.minX+epsilon,surface.maxX-epsilon),z:clamp(z,surface.minZ+epsilon,surface.maxZ-epsilon)};
  if(continuationSurfaceContains(surface,x,z))return{x,z};
  const a=angleOn(surface,x,z),steps=continuationSectorSteps(surface),delta=(surface.endAngle-surface.startAngle)/steps,k=Math.floor((a-surface.startAngle)/delta),indices=a>surface.endAngle?[0,steps-1]:[k-1,k,k+1],points=[];
  const at=(radius,angle)=>({x:surface.center.x+Math.cos(angle)*radius,z:surface.center.z+Math.sin(angle)*radius});
  const segment=(p,q)=>{const dx=q.x-p.x,dz=q.z-p.z,t=clamp(((x-p.x)*dx+(z-p.z)*dz)/(dx*dx+dz*dz||1),0,1);points.push({x:p.x+dx*t,z:p.z+dz*t});};
  for(const i of indices)if(i>=0&&i<steps)for(const radius of[surface.innerRadius,surface.outerRadius])segment(at(radius,surface.startAngle+i*delta),at(radius,surface.startAngle+(i+1)*delta));
  for(const end of[surface.startAngle,surface.endAngle])segment(at(surface.innerRadius,end),at(surface.outerRadius,end));
  return points.sort((p,q)=>Math.hypot(p.x-x,p.z-z)-Math.hypot(q.x-x,q.z-z))[0];
}
function touchesFloor(surface,x,z,radius) {
  if(continuationSurfaceContains(surface,x,z))return true;
  const p=continuationClosestFloorPoint(surface,x,z);return Math.hypot(p.x-x,p.z-z)<radius-epsilon;
}
function circleBox(x,z,r,s) {const dx=Math.max(s.minX-x,0,x-s.maxX),dz=Math.max(s.minZ-z,0,z-s.maxZ);return dx*dx+dz*dz<(r-epsilon)**2;}
export function continuationSegmentBoxDistanceSquared(a,b,box) {
  const lo=[box.minX,box.minY,box.minZ],hi=[box.maxX,box.maxY,box.maxZ],d=b.map((v,k)=>v-a[k]),times=[0,1];
  for(let k=0;k<3;k++)if(Math.abs(d[k])>1e-12)for(const bound of[lo[k],hi[k]]){const t=(bound-a[k])/d[k];if(t>0&&t<1)times.push(t);}
  times.sort((x,y)=>x-y);let best=Infinity;
  const distance=t=>a.reduce((sum,v,k)=>{const p=v+d[k]*t,delta=p<lo[k]?p-lo[k]:p>hi[k]?p-hi[k]:0;return sum+delta*delta;},0);
  for(let j=1;j<times.length;j++){const left=times[j-1],right=times[j],mid=(left+right)/2;let aa=0,bb=0;for(let k=0;k<3;k++){const p=a[k]+d[k]*mid,bound=p<lo[k]?lo[k]:p>hi[k]?hi[k]:null;if(bound!==null){aa+=d[k]*d[k];bb+=d[k]*(a[k]-bound);}}best=Math.min(best,distance(left),distance(right),distance(aa?clamp(-bb/aa,left,right):mid));}
  return best;
}
function capsule(state,point,radius,height,axis){const c=[point.x,point.feet+height/2,point.z],half=height/2-radius;return{a:c.map((v,k)=>v-axis[k]*half),b:c.map((v,k)=>v+axis[k]*half),radius};}
function capsuleFloor(body,s) {
  if(s.kind!=='sector')return continuationSegmentBoxDistanceSquared(body.a,body.b,{...s,minY:s.y-s.thickness,maxY:s.y})<(body.radius-epsilon)**2;
  if(Math.max(body.a[0],body.b[0])+body.radius<s.minX||Math.min(body.a[0],body.b[0])-body.radius>s.maxX||Math.max(body.a[2],body.b[2])+body.radius<s.minZ||Math.min(body.a[2],body.b[2])-body.radius>s.maxZ)return false;
  const n=Math.max(1,Math.ceil(Math.hypot(...body.a.map((v,k)=>v-body.b[k]))/.025));
  for(let k=0;k<=n;k++){const t=k/n,p=body.a.map((v,j)=>v+(body.b[j]-v)*t),q=continuationClosestFloorPoint(s,p[0],p[2]),dy=p[1]-clamp(p[1],s.y-s.thickness,s.y);if((p[0]-q.x)**2+(p[2]-q.z)**2+dy*dy<(body.radius-epsilon)**2)return true;}
  return false;
}
export function continuationFreeBody(point,state={}, {radius=C.bodyRadius,height=C.bodyHeight,ignoreFloors=false,stepFloor=-Infinity,axis=continuationBodyAxis(state)}={}) {
  const feet=point.feet;
  const oriented=Math.abs(axis[1])<.999999,body=oriented?capsule(state,point,radius,height,axis):null;
  if(continuationChartSolids(state).some(s=>oriented?continuationSegmentBoxDistanceSquared(body.a,body.b,s)<(radius-epsilon)**2:feet+height>s.minY+epsilon&&feet<s.maxY-epsilon&&circleBox(point.x,point.z,radius,s)))return false;
  if(!ignoreFloors&&continuationChartSurfaces(state).some(s=>s.y>stepFloor&&(oriented?capsuleFloor(body,s):feet+height>s.y-s.thickness+epsilon&&feet<s.y-epsilon&&touchesFloor(s,point.x,point.z,radius))))return false;
  return !continuationChartDoors(state).some(d=>{
    const n=d.normal||(Math.abs(Math.sin(d.yaw))>.5?{x:1,z:0}:{x:0,z:1}),dx=point.x-d.x,dz=point.z-d.z;
    if(oriented){const extent=d.width/2,box={minX:d.x-(Math.abs(n.x)>.5?.16:extent+.16),maxX:d.x+(Math.abs(n.x)>.5?.16:extent+.16),minZ:d.z-(Math.abs(n.z)>.5?.16:extent+.16),maxZ:d.z+(Math.abs(n.z)>.5?.16:extent+.16),minY:d.y+d.height,maxY:d.y+d.height+.18};if(continuationSegmentBoxDistanceSquared(body.a,body.b,box)<(radius-epsilon)**2)return true;if(continuationLeafFraction(state,d.id)<C.doorPassFraction&&continuationSegmentBoxDistanceSquared(body.a,body.b,{...box,minY:d.y,maxY:d.y+d.height})<(radius-epsilon)**2)return true;return false;}
    if(feet+height>d.y+d.height+epsilon&&feet<d.y+d.height+.18-epsilon&&Math.abs(dx*n.x+dz*n.z)<.16+radius-epsilon&&Math.abs(-dx*n.z+dz*n.x)<d.width/2+.16+radius-epsilon)return true;
    if(continuationLeafFraction(state,d.id)>=C.doorPassFraction||feet+height<=d.y+epsilon||feet>=d.y+d.height-epsilon)return false;
    return Math.abs(dx*n.x+dz*n.z)<.12+radius-epsilon&&Math.abs(-dx*n.z+dz*n.x)<d.width/2+radius-epsilon;
  });
}
function clearFraction(from,to,state,shape) {
  let low=0,high=1;
  for(let n=0;n<13;n++){const t=(low+high)/2,p={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,feet:from.feet+(to.feet-from.feet)*t};if(continuationFreeBody(p,state,shape))low=t;else high=t;}
  return low;
}
// A fixed-tick cylinder sweep subdivides every axis to <=25mm. Descending top
// planes are also intersected explicitly; thin slabs cannot be skipped by dt.
export function continuationBallisticStep(fall,dt,state={},shape={}) {
  const radius=shape.radius??C.bodyRadius,height=shape.height??C.bodyHeight;
  const axis=shape.axis||continuationBodyAxis(state),extent=radius+(height/2-radius)*Math.abs(axis[1]),transit=state.bodyTransit&&state.bodyTransit.elapsed<state.bodyTransit.duration;
  const floors=continuationChartSurfaces(state);
  // Basis alignment moves the capsule's lowest point even with zero vertical
  // velocity. Sweep that changing extent before gravity so a growing body
  // cannot end up embedded just below an otherwise valid receiving slab.
  const previousExtent=Number.isFinite(fall.capsuleExtent)?fall.capsuleExtent:extent;
  if(extent>previousExtent+1e-9&&fall.vy<=0) {
    const oldBottom=fall.feet+height/2-previousExtent,newBottom=fall.feet+height/2-extent;
    const receiving=floors.filter(s=>s.y<=oldBottom+epsilon&&s.y>=newBottom-epsilon&&touchesFloor(s,fall.x,fall.z,radius)).sort((a,b)=>b.y-a.y);
    for(const s of receiving){const candidate={x:fall.x,z:fall.z,feet:s.y+extent-height/2};if(continuationFreeBody(candidate,state,{radius,height,axis})){fall.feet=candidate.feet;fall.vy=0;fall.portalSupport={id:s.id,y:s.y};break;}}
  }
  fall.capsuleExtent=extent;
  if(fall.portalSupport){const s=floors.find(s=>s.id===fall.portalSupport.id&&touchesFloor(s,fall.x,fall.z,radius));if(s&&fall.vy<=0)fall.feet=Math.max(fall.feet,s.y+extent-height/2);else fall.portalSupport=null;}
  const count=Math.max(1,Math.ceil(Math.max(Math.abs(fall.vx*dt),Math.abs(fall.vz*dt),Math.abs(fall.vy*dt)+C.gravity*dt*dt)/.025)),h=dt/count;
  let landed=null;const impacts=[],wraps=[];
  const trace=()=>{if(Array.isArray(fall.trace)){const last=fall.trace.at(-1);if(!last||Math.hypot(last.x-fall.x,last.z-fall.z,last.feet-fall.feet)>1e-7)fall.trace.push({x:fall.x,z:fall.z,feet:fall.feet,level:fall.level,phase:fall.fromPhase,chartId:state.chartId??0,up:[...axis]});}};
  for(let n=0;n<count;n++) {
    fall.elapsed+=h;
    const bodyShape={radius,height,axis,...(!transit&&fall.trigger==='jump'&&fall.vy>0&&fall.feet<(fall.lastSupport?.feet??fall.feet)+C.maximumStep?{stepFloor:(fall.lastSupport?.feet??fall.feet)+C.maximumStep}:{})};
    for(const axis of ['x','z']) {
      const velocity=axis==='x'?'vx':'vz',next={x:fall.x,z:fall.z,feet:fall.feet,[axis]:fall[axis]+fall[velocity]*h};
      if(continuationFreeBody(next,state,bodyShape)){fall[axis]=next[axis];}
      else {const t=clearFraction(fall,next,state,bodyShape);fall[axis]+=(next[axis]-fall[axis])*t;fall[velocity]=0;impacts.push(axis);}trace();
    }
    if(fall.groundedExit&&!fall.unsupported&&floors.some(s=>Math.abs(s.y-fall.feet)<.01&&touchesFloor(s,fall.x,fall.z,radius)))continue;
    fall.unsupported=true;
    const before=fall.feet,delta=fall.vy*h-C.gravity*h*h/2,nextFeet=before+delta;fall.vy-=C.gravity*h;
    if(delta<=0) {
      const receiving=floors.filter(s=>s.y<=before+height/2-extent+epsilon&&s.y>=nextFeet+height/2-extent-epsilon&&touchesFloor(s,fall.x,fall.z,radius)).sort((a,b)=>b.y-a.y);
      for(const surface of receiving) {
        const p=continuationClosestFloorPoint(surface,fall.x,fall.z),candidate={x:p.x,z:p.z,feet:surface.y+extent-height/2};
        if(!continuationFreeBody(candidate,state,{radius,height,axis}))continue;
        Object.assign(fall,candidate,{vy:0});
        if(transit)fall.portalSupport={id:surface.id,y:surface.y};else {landed={id:surface.id,y:surface.y,level:surface.level??0,surface};fall.portalSupport=null;}break;
      }
      if(landed){trace();break;}
    }
    const next={x:fall.x,z:fall.z,feet:nextFeet};
    if(continuationFreeBody(next,state,bodyShape))fall.feet=nextFeet;
    else {const t=clearFraction(fall,next,state,bodyShape);fall.feet+=(nextFeet-fall.feet)*t;fall.vy=0;impacts.push(delta>0?'ceiling':'floor-side');}
    const wrapped=wrapContinuationVoid(fall);if(wrapped)wraps.push(wrapped);
    trace();
  }
  if(!transit&&fall.portalSupport){const s=floors.find(s=>s.id===fall.portalSupport.id);if(s){fall.feet=s.y;landed={id:s.id,y:s.y,level:s.level??0,surface:s};fall.portalSupport=null;}}
  return {support:landed,impacts,wraps,void:!normalizeContinuationVoidLoop(fall.voidLoop)&&(fall.feet<C.bounds.minY-2||fall.elapsed>12)};
}
