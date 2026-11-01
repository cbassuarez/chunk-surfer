// Bounded local navigation for a physical performer. Queries belong to the
// caller's copied floor, doors and measured body clearance; this module owns
// no geometry, relocation, threat, clock or consequence.
const valid=p=>p&&['x','z','feet'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const key=(x,z,feet)=>`${x}:${z}:${Math.round(feet*20)}`;
function heapPush(heap,node){
  heap.push(node);let i=heap.length-1;
  while(i>0){const p=(i-1)>>1;if(heap[p].score<=node.score)break;heap[i]=heap[p];i=p;}heap[i]=node;
}
function heapPop(heap){
  const first=heap[0],last=heap.pop();if(!heap.length)return first;
  let i=0;while(true){const left=i*2+1;if(left>=heap.length)break;const right=left+1,j=right<heap.length&&heap[right].score<heap[left].score?right:left;
    if(heap[j].score>=last.score)break;heap[i]=heap[j];i=j;}heap[i]=last;return first;
}

export function findFakeElleryPath({start,goal,canStand,canTraverse,canSeeGoal=()=>true,
  cellSize=.5,maxNodes=1400,margin=6,goalRadius=.65}={}){
  const step=cellSize===.25?.25:.5,limit=Math.max(16,Math.min(3000,Math.floor(maxNodes)||1400));
  const failure=(status,visited=0)=>({points:[],status,visited,cellSize:step});
  if(!valid(start)||!valid(goal)||typeof canStand!=='function'||typeof canTraverse!=='function')return failure('invalid');
  const floor=canStand(start.x,start.z,start.feet);if(!Number.isFinite(floor))return failure('blocked');
  const origin={...start,feet:floor},endFloor=canStand(goal.x,goal.z,goal.feet);
  if(Number.isFinite(endFloor)&&canTraverse(origin,{...goal,feet:endFloor}))return{points:[{...goal,feet:endFloor}],status:'found',visited:0,cellSize:step};
  const pad=Math.max(2,Math.min(12,margin)),bounds={minX:Math.min(start.x,goal.x)-pad,maxX:Math.max(start.x,goal.x)+pad,
    minZ:Math.min(start.z,goal.z)-pad,maxZ:Math.max(start.z,goal.z)+pad};
  const heuristic=p=>Math.max(0,distance(p,goal)-goalRadius)+Math.abs(p.feet-goal.feet)*2;
  const first={...origin,ix:0,iz:0,cost:0,score:heuristic(origin),parent:null},open=[],best=new Map(),closed=new Set();
  first.key=key(0,0,first.feet);best.set(first.key,first);heapPush(open,first);let visited=0,finish=null;
  const directions=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while(open.length&&visited<limit){
    const node=heapPop(open);if(closed.has(node.key)||best.get(node.key)!==node)continue;
    closed.add(node.key);visited++;
    if(distance(node,goal)<=goalRadius&&Math.abs(node.feet-goal.feet)<.25&&canSeeGoal(node,goal)){finish=node;break;}
    for(const[dx,dz]of directions){
      const ix=node.ix+dx,iz=node.iz+dz,x=origin.x+ix*step,z=origin.z+iz*step;
      if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)continue;
      const feet=canStand(x,z,node.feet);if(!Number.isFinite(feet))continue;
      const id=key(ix,iz,feet);if(closed.has(id))continue;
      const next={x,z,feet},cost=node.cost+step*Math.hypot(dx,dz)+Math.abs(feet-node.feet)*1.5;
      if(best.get(id)?.cost<=cost||!canTraverse(node,next))continue;
      const entry={...next,ix,iz,key:id,cost,score:cost+heuristic(next),parent:node};best.set(id,entry);heapPush(open,entry);
    }
  }
  if(!finish)return failure(open.length?'limited':'blocked',visited);
  const raw=[];for(let at=finish;at?.parent;at=at.parent)raw.push({x:at.x,z:at.z,feet:at.feet});raw.reverse();
  // String pulling removes a grid's sawtooth, only across the very same swept
  // body query. A long shortcut cannot cut a convex prop or a doorway corner.
  const points=[];let at=origin,index=0;
  while(index<raw.length&&points.length<160){
    let far=index;for(let i=index+1;i<Math.min(raw.length,index+9);i++)if(canTraverse(at,raw[i]))far=i;
    points.push(raw[far]);at=raw[far];index=far+1;
  }
  return{points,status:index<raw.length?'limited':'found',visited,cellSize:step};
}

export function normalizeFakeElleryNavigation(value){
  if(!value||!valid(value.goal)||!Array.isArray(value.points))return null;
  const clean=p=>Object.fromEntries(['x','z','feet'].map(k=>[k,Math.max(-10000,Math.min(10000,p[k]))]));
  return{age:Math.max(0,Math.min(.25,Number(value.age)||0)),goal:clean(value.goal),
    points:value.points.filter(valid).slice(0,160).map(clean),
    status:['found','blocked','limited'].includes(value.status)?value.status:'blocked',
    visited:Math.max(0,Math.min(3000,Math.floor(Number(value.visited)||0))),cellSize:value.cellSize===.25?.25:.5};
}
