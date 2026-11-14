// Independent ordinary-body route solver. Unlike a symbol flood, every edge
// asks production movement, follows its real redirect and checks actual props.
import {CELL} from '../../src/data/floorplan/legend.js';
const key=p=>`${p.x},${p.y}`;
export function bodyAtWorld(FP,x,z){const p=FP.logicalAtPhysical(x/CELL-.5,z/CELL-.5,{floor:0});return p?{x:p.x,y:p.y}:null;}
export function worldBody(FP,p){const q=FP.logicalToPhysical(p.x,p.y);return{x:(q.x+.5)*CELL,z:(q.z+.5)*CELL,feet:FP.floorAt(p.x,p.y)};}
export function actualBodyRoute(FP,P,from,to,{keys=new Set(),bounds={x0:70,x1:102,z0:-1,z1:49},accept=()=>true,maxNodes=14000}={}){
 if(!from||!to)return{path:null,reason:'missing endpoint',from,to};
 const occupancy=new Map(),inBounds=p=>{const q=worldBody(FP,p);return q.x>=bounds.x0&&q.x<=bounds.x1&&q.z>=bounds.z0&&q.z<=bounds.z1;};
 const clear=p=>{const k=key(p);if(!occupancy.has(k))occupancy.set(k,!FP.isSolid(p.x,p.y)&&!FP.isCollisionOnly(p.x,p.y)&&P.propCanOccupy(p.x,p.y));return occupancy.get(k);};
 if(!clear(from)||!clear(to))return{path:null,reason:'blocked endpoint',from:worldBody(FP,from),to:worldBody(FP,to)};
 const queue=[from],seen=new Set([key(from)]),previous=new Map(),rejected={};let nearest={p:from,distance:Infinity};
 const target=worldBody(FP,to);
 for(let i=0;i<queue.length&&i<maxNodes;i++){
  const p=queue[i],w=worldBody(FP,p),distance=Math.hypot(w.x-target.x,w.z-target.z);if(distance<nearest.distance)nearest={p,distance};
  if(key(p)===key(to)){const path=[];let at=p;while(previous.has(key(at))){const edge=previous.get(key(at));path.push(edge);at=edge.from;}return{path:path.reverse(),visited:queue.length,nearest:worldBody(FP,p)};}
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
   const requested={x:p.x+dx,y:p.y+dy},move=FP.canStep(p.x,p.y,requested.x,requested.y,{keys});
   if(!move.ok){rejected[move.why]=(rejected[move.why]||0)+1;continue;}
   const q=move.redirect?{x:move.redirect.x,y:move.redirect.y}:requested,k=key(q);
   if(seen.has(k)||!inBounds(q)||!accept(q)||!clear(q)||!P.propCanOccupy(q.x,q.y,{from:p}))continue;
   const world=worldBody(FP,q),travel=Math.hypot(world.x-w.x,world.z-w.z);
   if(travel>CELL+1e-4){rejected['nonadjacent-physical-redirect']=(rejected['nonadjacent-physical-redirect']||0)+1;continue;}
   seen.add(k);previous.set(k,{from:p,to:q,requested,portal:move.edgePortal||null});queue.push(q);
  }
 }
 return{path:null,reason:'no ordinary body route',visited:queue.length,nearest:worldBody(FP,nearest.p),distance:nearest.distance,rejected,from:worldBody(FP,from),to:target};
}
