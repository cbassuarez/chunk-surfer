export const glassCourtBody=(x,z)=>({x:Math.round((x-.25)*2),y:Math.round((z-.25)*2)});
const key=p=>`${p.x},${p.y}`;

// The bounded current atrium, both outdoor courts and the complete pool deck.
// Every graph edge is an ordinary accepted grid step, including actual props;
// no portal redirect, closed-door cut or diagonal masonry corner is bypassed.
export function glassCourtRoute(FP,PROPS,from,to,{cut=null,onVisit=null}={}){
  const queue=[from],seen=new Set([key(from)]),previous=new Map(),occupancy=new Map();
  const clear=p=>{const k=key(p);if(!occupancy.has(k))occupancy.set(k,!FP.isSolid(p.x,p.y)&&PROPS.propCanOccupy(p.x,p.y));return occupancy.get(k);};
  if(!clear(from))return null;
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    onVisit?.(p);
    if(p.x===to.x&&p.y===to.y){const out=[p];while(previous.has(key(out.at(-1))))out.push(previous.get(key(out.at(-1))));return out.reverse();}
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const q={x:p.x+dx,y:p.y+dy},k=key(q);
      if(q.x<140||q.x>=198||q.y<20||q.y>=104||seen.has(k))continue;
      if(cut&&(FP.doorAt(p.x,p.y)?.id===cut||FP.doorAt(q.x,q.y)?.id===cut))continue;
      if(dx&&dy&&(FP.isSolid(p.x+dx,p.y)||FP.isSolid(p.x,p.y+dy)))continue;
      if(!clear(q))continue;
      const move=FP.canStep(p.x,p.y,q.x,q.y,{keys:new Set()});
      if(!move.ok||move.redirect||!PROPS.propCanOccupy(q.x,q.y,{from:p}))continue;
      seen.add(k);previous.set(k,p);queue.push(q);
    }
  }
  return null;
}
