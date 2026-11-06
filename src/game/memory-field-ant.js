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
/** Where the ant is `t` seconds after he first sees it. */
export function antPoseAt(ant,t){
  const{lengths,total,travelled}=table(ant),time=Math.max(0,Number(t)||0),index=Math.min(travelled.length-1,Math.floor(time/STEP));
  const d=travelled[index];let k=1;while(k<lengths.length-1&&lengths[k]<d)k++;
  const[a,b]=[ant.path[k-1],ant.path[k]],span=Math.max(1e-6,lengths[k]-lengths[k-1]),u=clamp01((d-lengths[k-1])/span);
  const x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u,yaw=Math.atan2(b[0]-a[0],-(b[1]-a[1])),moving=antMovingAt(time)&&d<total;
  const slab=onSlab(ant,x,z);
  return{x,z,y:slab?ant.slab.height:.004,yaw,moving,onSlab:slab,progress:total?d/total:1,gone:d>=total,
    // Two leg frames, changing as it steps; still when it stops to feel about.
    frame:moving?Math.floor(time*9)%2:0};
}
