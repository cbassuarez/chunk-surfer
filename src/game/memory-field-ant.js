// THE ANT'S WAY ACROSS THE SLAB. Pure, so its pace and its end can be tested.
// src/data/memory-field.js has the path, the pace and what he says about it.
//
// It stops, feels about, and goes on. The stop-start is fixed, not random, so the
// same ant crosses the same way every time the field comes back to it.
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const STEP=1/30,cache=new WeakMap();

// Moving about two thirds of the time, in uneven bursts.
export function antMovingAt(t){
  return Math.sin(t*1.9)+.55*Math.sin(t*4.7+1)+.3*Math.sin(t*.37+.4)>-.42;
}
function table(ant){
  if(cache.has(ant))return cache.get(ant);
  const lengths=[0];for(let k=1;k<ant.path.length;k++){const[a,b]=[ant.path[k-1],ant.path[k]];lengths.push(lengths[k-1]+Math.hypot(b[0]-a[0],b[1]-a[1]));}
  const total=lengths.at(-1),travelled=[0];let d=0,t=0;
  while(d<total&&t<ant.maxSeconds*2){t+=STEP;if(antMovingAt(t))d=Math.min(total,d+ant.speed*STEP);travelled.push(d);}
  const result={lengths,total,travelled,goneAt:d>=total?t:Infinity};cache.set(ant,result);return result;
}
/** Seconds until the ant has gone into the grass on the far side. */
export const antGoneAt=ant=>table(ant).goneAt;
export const antPathLength=ant=>table(ant).total;
function onSlab(ant,x,z){
  const s=ant.slab,c=Math.cos(s.yaw),n=Math.sin(s.yaw),dx=x-s.x,dz=z-s.z,u=dx*c-dz*n,v=dx*n+dz*c;
  return Math.abs(u)<=s.halfX&&Math.abs(v)<=s.halfZ;
}
function routePosition(ant,distance){
  const{lengths,total}=table(ant),d=Math.max(0,Math.min(total,distance));
  let k=1;while(k<lengths.length-1&&lengths[k]<d)k++;
  const[a,b]=[ant.path[k-1],ant.path[k]],span=Math.max(1e-6,lengths[k]-lengths[k-1]);
  const u=clamp01((d-lengths[k-1])/span);
  return {x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u,yaw:Math.atan2(b[0]-a[0],a[1]-b[1])};
}

// The render rig needs interpolation and stable footfall anchors in path
// metres. The encounter still reads the original discrete gameplay poses.
export function antRoutePosition(ant,distance){
  const point=routePosition(ant,distance),halfTurn=ant.length*.31;
  const before=routePosition(ant,distance-halfTurn),after=routePosition(ant,distance+halfTurn);
  if(Math.hypot(after.x-before.x,after.z-before.z)>1e-7)point.yaw=Math.atan2(after.x-before.x,before.z-after.z);
  return point;
}
export function antRouteAt(ant,t){
  const {travelled}=table(ant),sample=Math.max(0,Number(t)||0)/STEP;
  const index=Math.min(travelled.length-1,Math.floor(sample)),next=Math.min(travelled.length-1,index+1);
  const from=travelled[index],to=travelled[next],distance=from+(to-from)*clamp01(sample-index);
  let last=index;
  if(to===from)while(last>0&&travelled[last-1]===from)last--;
  return {distance,rest:to>from?0:Math.max(0,(sample-last)*STEP)};
}
/** Where the ant is `t` seconds after he first sees it. */
export function antPoseAt(ant,t){
  const{total,travelled}=table(ant),time=Math.max(0,Number(t)||0),index=Math.min(travelled.length-1,Math.floor(time/STEP));
  const d=travelled[index],{x,z,yaw}=routePosition(ant,d),moving=antMovingAt(time)&&d<total;
  const slab=onSlab(ant,x,z);
  return{x,z,y:slab?ant.slab.height:.004,yaw,moving,onSlab:slab,progress:total?d/total:1,gone:d>=total,
    // Two leg frames, changing as it steps; still when it stops to feel about.
    frame:moving?Math.floor(time*9)%2:0};
}
