const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
// Use the copied building's real wall/headroom queries for visibility.
export function thresholdGagClearSight(eye,target,s,layout){
  if(typeof layout?.supportAt!=='function')return false;
  const length=Math.hypot(target.x-eye.x,target.z-eye.z),steps=Math.max(1,Math.ceil(length/.08));
  for(let i=1;i<steps;i++){
    const u=i/steps,x=eye.x+(target.x-eye.x)*u,z=eye.z+(target.z-eye.z)*u,y=eye.y+(target.y-eye.y)*u,support=layout.supportAt(x,z,s);
    if(!support||y<support.floor+.02||Number.isFinite(support.ceil)&&y>support.ceil-.02)return false;
  }
  for(const d of layout.doors||[]){
    if(Math.abs((d.feet??d.y??0)-s.feet)>.4)continue;
    const motion=s.doorMotion?.[d.id],fraction=motion?motion.from+((motion.to?1:0)-motion.from)*clamp((s.elapsed-motion.startedAt)/(motion.duration||.001),0,1):s.doorOpen?.[d.id]==null?Number(!!d.openInitial):Number(!!s.doorOpen[d.id]);
    if(fraction>=.85)continue;
    const n=d.normal||{x:Math.sin(d.yaw||0),z:-Math.cos(d.yaw||0)},a=(eye.x-d.x)*n.x+(eye.z-d.z)*n.z,b=(target.x-d.x)*n.x+(target.z-d.z)*n.z;
    if(a*b>=0)continue;const u=a/(a-b),x=eye.x+(target.x-eye.x)*u-d.x,z=eye.z+(target.z-eye.z)*u-d.z;
    if(Math.abs(-x*n.z+z*n.x)<(d.halfWidth??d.width/2)+.02)return false;
  }
  return true;
}
