// A restored exterior body can overlap stock added since the save was made.
// Recover by walking toward its nearest face, never through its centre. This
// is not a depenetration teleport and never makes a new entry legal.
const EPS=1e-7;
const MAX_GRID_STEP=Math.SQRT1_2;
export function leavesPropOverlap(from,to,box,pad=.20){
  const w=Number(box?.w)*(Number(box?.scale)||1),d=Number(box?.d)*(Number(box?.scale)||1);
  if(!from||!to||![from.x,from.z,to.x,to.z,box?.x,box?.y,w,d,pad].every(Number.isFinite)||w<=0||d<=0)return false;
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  if(length<=EPS||length>MAX_GRID_STEP+EPS)return false;
  const c=Math.cos(box.yaw||0),s=Math.sin(box.yaw||0);
  const local=p=>{const x=p.x-box.x,z=p.z-box.y;return[x*c+z*s,-x*s+z*c];};
  const a=local(from),b=local(to),half=[w/2+pad,d/2+pad];
  const penetration=half.map((h,i)=>h-Math.abs(a[i]));
  if(penetration.some(p=>p<-EPS))return false;
  const nearest=Math.min(...penetration);
  return penetration.some((p,i)=>{
    if(p>nearest+EPS)return false;
    // On a centre plane either outward face is valid. Otherwise the original
    // side owns the exit; even a tiny starting overlap cannot cross a fence.
    const sign=Math.abs(a[i])>EPS?Math.sign(a[i]):Math.sign(b[i]);
    return sign!==0&&b[i]*sign>a[i]*sign+EPS;
  });
}

// Floorplan wall sliding already exists in main.step. A solid prop or placed
// facade must offer the same ordinary shoulder slide, checked through both
// collision owners and preserving any real cardinal seam redirect.
export function slideBlockedPropStep({from,dx,dy,canStep,canOccupy}){
  if(!from||!Number.isFinite(from.x)||!Number.isFinite(from.y)||!dx||!dy
    ||Math.abs(dx)!==1||Math.abs(dy)!==1||typeof canStep!=='function'||typeof canOccupy!=='function')return null;
  for(const [x,y] of [[dx,0],[0,dy]]){
    const move=canStep(from.x,from.y,from.x+x,from.y+y);
    if(!move?.ok)continue;
    const to=move.redirect||{x:from.x+x,y:from.y+y};
    if(canOccupy(to.x,to.y,{from}))return{dx:x,dy:y,move};
  }
  return null;
}
