// Test planner only. Every accepted edge runs the production movement and
// continuous prop/facade collision checks; no connector is traversed by hand.
export const pubBodyWorld=(FP,p)=>{
  const q=FP.logicalToPhysical(p[0],p[1]);return{x:(q.x+.5)*.5,z:(q.z+.5)*.5};
};
export function courtyardWalk(FP,PROPS,start,goal){
  const key=p=>p.join(','),g=pubBodyWorld(FP,goal);
  const heuristic=p=>{const w=pubBodyWorld(FP,p);return 2*(Math.abs(w.x-g.x)+Math.abs(w.z-g.z));};
  const open=[start],prev=new Map([[key(start),null]]),cost=new Map([[key(start),0]]);
  for(let count=0;open.length&&count<40000;count++){
    open.sort((a,b)=>cost.get(key(b))+heuristic(b)-cost.get(key(a))-heuristic(a));
    const p=open.pop(),pk=key(p);
    if(pk===key(goal)){
      const path=[];for(let k=pk;k;k=prev.get(k))path.push(k.split(',').map(Number));
      return path.reverse();
    }
    for(const[dx,dy]of[[0,1],[1,0],[-1,0],[0,-1]]){
      const step=FP.canStep(p[0],p[1],p[0]+dx,p[1]+dy,{keys:new Set()});if(!step.ok)continue;
      const q=step.redirect?[step.redirect.x,step.redirect.y]:[p[0]+dx,p[1]+dy],world=pubBodyWorld(FP,q);
      // The proof must stay inside the original arrival courtyard. Crossing
      // any of the district carriageways cannot rescue the far-street bug.
      if(world.x<0||world.x>49||world.z<0||world.z>92)continue;
      const k=key(q),n=cost.get(pk)+1;if(cost.has(k)&&cost.get(k)<=n)continue;
      if(!PROPS.propCanOccupy(q[0],q[1],{from:{x:p[0],y:p[1]}}))continue;
      cost.set(k,n);prev.set(k,pk);open.push(q);
    }
  }
  return null;
}
