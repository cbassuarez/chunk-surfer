import {SOURCE_CONTINUATION as C,SOURCE_CONTINUATION_ROUTES, continuationSupportAt, continuationSurfaceContains, continuationChartSurfaces, continuationChartSolids,continuationChartDoors,continuationFolds} from '../data/source-continuation.js';
import {JOURNEY_ROUTES} from '../data/source-continuation-journey.js';
import {continuationBallisticStep,continuationFreeBody} from './source-continuation-physics.js';
import {advancePortalTransit,continuationPortalCrossing,transferContinuationPortal,portalEdge,continuationBodyAxis} from './source-continuation-portals.js';
import {freshHushDensityPose,normalizeHushDensityPose,stepHushDensityPose} from './hush-density-performance.js';
import {continuationVoidLoopForFall,normalizeContinuationSpaceWrap} from './source-continuation-void.js';
import {corridorNavigationKey} from '../data/source-connector-corridor.js';
import {continuationPursuitOrigin,freshContinuationArrival,normalizeContinuationArrival,normalizeContinuationArrivalReceipts,normalizeContinuationGateLead,continuationHushGateWaiting,advanceContinuationArrival,continuationHushThresholdArrival} from './source-continuation-arrival.js';

const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=value=>({x:finite(value?.x),z:finite(value?.z),feet:finite(value?.feet),chartId:Math.max(0,Math.round(finite(value?.chartId))),level:Math.max(0,Math.min(C.catch.levels-1,Math.round(finite(value?.level)))),...(value?.phase?{phase:value.phase==='catch'?'catch':'wrong-return'}:{}),...(value?.up?{up:[...value.up]}:{})});
const position=actor=>({x:actor.x,y:actor.feet,z:actor.z});

// Geometry owned by the continuation, also used by its ground recovery. A
// straight shortcut must carry the whole body over actual supported steps.
function rawSupport(x,z,feet,chartId=0,world=null) {
  const geometry={feet,chartId,...(chartId===4&&world?.corridor?{corridor:world.corridor}:{})};
  const at=continuationSupportAt(x,z,geometry);
  if(!at)return null;
  const radius=chartId===4&&world?.corridor?C.hush.radius:C.bodyRadius;
  if(continuationChartSolids(geometry).some(s=>at.y+C.bodyHeight>s.minY+.04&&at.y<s.maxY-.04&&x+radius>s.minX&&x-radius<s.maxX&&z+radius>s.minZ&&z-radius<s.maxZ))return null;
  if(continuationChartSurfaces({chartId}).some(s=>s.y>at.y+.04&&s.y-s.thickness<at.y+C.bodyHeight-.03&&continuationSurfaceContains(s,x,z)))return null;
  return at;
}
function support(x,z,feet,cache=null,chartId=0,world=null) {
  if(!cache)return rawSupport(x,z,feet,chartId,world);
  const key=`${chartId},${x.toFixed(4)},${z.toFixed(4)},${feet.toFixed(4)},${chartId===4?corridorNavigationKey(world):''}`;
  if(!cache.has(key))cache.set(key,rawSupport(x,z,feet,chartId,world));
  return cache.get(key);
}
export function continuationWalkSegment(from,to,cache=null,world=null) {
  const chartId=from.chartId??0;if(chartId!==(to.chartId??0))return false;
  let feet=from.feet;
  const count=Math.max(1,Math.ceil(distance(from,to)/.1));
  for(let k=1;k<=count;k++) {
    const t=k/count,at=support(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t,feet,cache,chartId,world);
    if(!at)return false;
    feet=at.y;
  }
  return Math.abs(feet-to.feet)<.46;
}

let wrongReturnGraph=null,wrongReturnGraphKey=null;
function wrongReturnPath(from,to,cache,world=null) {
  if((from.chartId??0)!==(to.chartId??0)||from.feet<-.1||to.feet<-.1)return null;
  const graphKey=corridorNavigationKey(world);
  if(!wrongReturnGraph||wrongReturnGraphKey!==graphKey) {
    const nodes=[],edges=[],ids=new Map(),id=p=>{const k=`${p.chartId||0},${p.x},${p.z},${p.feet}`;if(!ids.has(k)){ids.set(k,nodes.length);nodes.push(p);edges.push([]);}return ids.get(k);};
    const route=(rows,height)=>{
      const points=rows.map((row,k)=>Array.isArray(row)?{x:row[0],z:row[1],feet:typeof height==='function'?height(k):height,chartId:0,level:0}:point(row));
      for(let k=1;k<points.length;k++) {
        const a=id(points[k-1]),b=id(points[k]);
        if(continuationWalkSegment(nodes[a],nodes[b],cache,world)){edges[a].push(b);edges[b].push(a);}
      }
    };
    route(SOURCE_CONTINUATION_ROUTES.main,k=>k<5?0:k<9?4.2:8.4);
    route(SOURCE_CONTINUATION_ROUTES.groundBranch,0);
    route(SOURCE_CONTINUATION_ROUTES.stairLoop,k=>k<4?8.4:4.2);
    route([[-10,-3],[-10,-22],[-10,-32],[16,-32],[16,-22],[16,-7]],0);
    route([[-8,-30],[11,-30],[11,-20],[11,-7],[-8,-7]],4.2);
    route([[-8,-20],[11,-20]],4.2);
    route(JOURNEY_ROUTES.main,0);
    wrongReturnGraph={nodes,edges};wrongReturnGraphKey=graphKey;
  }
  const nodes=[...wrongReturnGraph.nodes,point(from),point(to)],edges=wrongReturnGraph.edges.map(row=>[...row]);edges.push([],[]);
  const start=nodes.length-2,end=nodes.length-1;
  for(const endpoint of [start,end])for(let k=0;k<start;k++)if(continuationWalkSegment(nodes[endpoint],nodes[k],cache,world)){edges[endpoint].push(k);edges[k].push(endpoint);}
  const costs=new Map([[start,0]]),parents=new Map(),open=[start];
  while(open.length) {
    let best=0;for(let k=1;k<open.length;k++)if(costs.get(open[k])<costs.get(open[best]))best=k;
    const current=open.splice(best,1)[0];if(current===end){const path=[];for(let k=end;k!=null;k=parents.get(k))path.push(nodes[k]);return path.reverse();}
    for(const next of edges[current]) {
      const cost=costs.get(current)+Math.hypot(nodes[next].x-nodes[current].x,nodes[next].z-nodes[current].z,nodes[next].feet-nodes[current].feet);
      if(cost>=(costs.get(next)??Infinity))continue;
      costs.set(next,cost);parents.set(next,current);if(!open.includes(next))open.push(next);
    }
  }
  return null;
}

// Bounded grid search follows real floors and .3m stair treads. It never draws
// a recovery line through an atrium or interpolates between storeys.
export function continuationSupportedPath(from,to,world=null) {
  if((from.chartId??0)!==(to.chartId??0))return null;
  const cache=new Map();
  if(continuationWalkSegment(from,to,cache,world))return [point(from),point(to)];
  const authored=wrongReturnPath(from,to,cache,world);if(authored)return authored;
  const step=.5,key=p=>`${Math.round(p.x/step)},${Math.round(p.z/step)},${Math.round(p.feet*100)}`;
  const start={...point(from),cost:0,rank:distance(from,to),parent:null},open=[start],best=new Map([[key(start),0]]);
  let found=null,visited=0;
  while(open.length&&visited++<18000) {
    let index=0;for(let k=1;k<open.length;k++)if(open[k].rank<open[index].rank)index=k;
    const current=open.splice(index,1)[0];
    if(distance(current,to)<.8&&continuationWalkSegment(current,to,cache,world)){found={...point(to),parent:current};break;}
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const x=Math.round(current.x/step)*step+dx*step,z=Math.round(current.z/step)*step+dz*step;
      if(x<C.bounds.minX||x>C.bounds.maxX||z<C.bounds.minZ||z>C.bounds.maxZ)continue;
      const at=support(x,z,current.feet,cache,from.chartId??0,world);if(!at)continue;
      const next={x,z,feet:at.y,chartId:from.chartId??0,level:at.level},cost=current.cost+Math.hypot(x-current.x,z-current.z)+Math.abs(at.y-current.feet);
      if(cost>=(best.get(key(next))??Infinity)-1e-8||!continuationWalkSegment(current,next,cache,world))continue;
      best.set(key(next),cost);open.push({...next,cost,rank:cost+distance(next,to)+Math.abs(next.feet-to.feet),parent:current});
    }
  }
  if(!found)return null;
  const reverse=[];for(let p=found;p;p=p.parent)reverse.push(point(p));
  const raw=reverse.reverse(),path=[raw[0]];
  for(let i=0;i<raw.length-1;) {let j=raw.length-1;while(j>i+1&&!continuationWalkSegment(raw[i],raw[j],cache,world))j--;path.push(raw[j]);i=j;}
  return path;
}

export function freshContinuationHush(at={x:0,z:3,feet:0,level:0,phase:'wrong-return'}) {
  return {id:'source-continuation-hush',active:true,...point(at),heading:0,mode:'warning',elapsed:0,animationClock:0,armed:false,foldSerial:0,lastFold:null,bodyTransit:null,knownPortals:[],
    density:freshHushDensityPose(0x48555348),lastSpaceWrap:null,
    notice:0,warningAnnounced:false,sheltered:false,velocity:{x:0,z:0},reconnectTarget:null,trail:[{kind:'walk',...point(C.spawn)}],lastRecorded:point(C.spawn),fall:null,recovery:null,arrival:null,arrivals:[],catchEntry:null};
}
export function freshContinuationDoorHush(){
  const origin=continuationPursuitOrigin();
  return{...freshContinuationHush(origin),heading:origin.heading,active:false,arrival:freshContinuationArrival()};
}
export function normalizeContinuationHush(value) {
  const base=freshContinuationHush();
  if(!value||!['x','z','feet'].every(k=>Number.isFinite(value[k])))return base;
  const motion=p=>({vx:finite(p.vx),vz:finite(p.vz),vy:finite(p.vy),fromPhase:p.fromPhase||p.phase||'catch',fromChartId:p.fromChartId??p.chartId??0,trigger:p.trigger||'release',groundedExit:p.groundedExit!==false&&p.trigger!=='jump'&&p.trigger!=='portal',lastSupport:{...point(p.lastSupport||p),...(Number.isFinite(p.lastSupport?.yaw)?{yaw:p.lastSupport.yaw,pitch:p.lastSupport.pitch||0}:{})},voidLoop:continuationVoidLoopForFall(p,{chartId:p.chartId??value.chartId??0}),...(Number.isFinite(p.capsuleExtent)?{capsuleExtent:p.capsuleExtent}:{}),...(p.portalSupport?{portalSupport:{...p.portalSupport}}:{})});
  const typed=p=>({...point(p),kind:p.kind==='fold'?'fold':p.kind==='drop'?'drop':'walk',...(p.kind==='drop'?motion(p):{}),...(p.kind==='fold'?{foldId:p.foldId,foldSide:p.foldSide,...(Number.isFinite(p.serial)?{serial:p.serial}:{}),fromChartId:p.fromChartId??p.chartId??0,toChartId:p.toChartId??p.to?.chartId??0,matrix:[...p.matrix],inverseMatrix:[...p.inverseMatrix],...(p.to?{to:point(p.to)}:{})}:{})});
  const trail=Array.isArray(value.trail)?value.trail.filter(p=>p&&['x','z','feet'].every(k=>Number.isFinite(p[k]))).map(typed):[];
  const fall=value.fall&&['x','z','feet','vx','vz','vy'].every(k=>Number.isFinite(value.fall[k]))?{...point(value.fall),...motion(value.fall),fromLevel:Math.round(finite(value.fall.fromLevel)),elapsed:Math.max(0,finite(value.fall.elapsed)),unsupported:!!value.fall.unsupported,trace:(value.fall.trace||[]).map(p=>p.kind==='fold'?typed(p):point(p))}:null;
  const recovery=value.recovery&&Array.isArray(value.recovery.path)&&value.recovery.path.length>1?{...value.recovery,path:value.recovery.path.map(typed),index:Math.max(0,Math.floor(finite(value.recovery.index))),elapsed:Math.max(0,finite(value.recovery.elapsed)),duration:Math.max(1.6,finite(value.recovery.duration,1.6))}:null;
  const actor={...base,...point(value),active:value.active!==false,heading:finite(value.heading),mode:['warning','follow','falling','yield','notice','recovering'].includes(value.mode)?value.mode:'warning',
    elapsed:Math.max(0,finite(value.elapsed)),animationClock:Math.max(0,finite(value.animationClock)),armed:!!value.armed,notice:Math.max(0,finite(value.notice)),warningAnnounced:!!value.warningAnnounced,sheltered:!!value.sheltered,trail,lastRecorded:point(value.lastRecorded||value),fall,recovery,velocity:{x:finite(value.velocity?.x),z:finite(value.velocity?.z)},reconnectTarget:value.reconnectTarget?point(value.reconnectTarget):null,foldSerial:Math.max(0,Math.round(finite(value.foldSerial))),lastFold:value.lastFold?JSON.parse(JSON.stringify(value.lastFold)):null,bodyTransit:value.bodyTransit?JSON.parse(JSON.stringify(value.bodyTransit)):null,knownPortals:Array.isArray(value.knownPortals)?[...new Set(value.knownPortals.filter(id=>typeof id==='string'))]:[]};
  actor.density=normalizeHushDensityPose(value.density)||base.density;
  actor.arrival=normalizeContinuationArrival(value.arrival,{active:actor.active});
  actor.arrivals=normalizeContinuationArrivalReceipts(value.arrivals);
  actor.catchEntry=normalizeContinuationGateLead(value.catchEntry);
  actor.lastSpaceWrap=normalizeContinuationSpaceWrap(value.lastSpaceWrap);
  compactTrail(actor);return actor;
}
function compactTrail(actor,world=null) {
  if(actor.trail.length<=512||actor.fall)return;
  // Rebuild long walk portions through actual floors, retaining every queued
  // gravity release and its observed receiving footprint. Never truncate a
  // prefix while pretending that its lost destination was recorded.
  const result=[];let from=point(actor),cursor=0;
  while(cursor<actor.trail.length) {
    let edge=cursor;while(edge<actor.trail.length&&actor.trail[edge].kind==='walk')edge++;
    const target=edge<actor.trail.length?actor.trail[edge]:actor.trail.at(-1),path=continuationSupportedPath(from,target,world);
    if(!path)return;
    result.push(...path.slice(1).map(p=>({kind:'walk',...p})));
    if(edge===actor.trail.length)break;
    const landing=actor.trail[edge+1];if(!landing||landing.kind!=='walk')return;
    result.push({...actor.trail[edge]},{...landing});from=point(landing);cursor=edge+2;
  }
  actor.trail=result;
}
export function recordContinuationHushWalk(actor,player,{force=false,protectedRefuge=false}={}) {
  if(!actor.active&&actor.arrival?.stage!=='waiting')return;
  if(actor.reconnectTarget){actor.reconnectTarget=point(player);actor.lastRecorded=point(player);return;}
  if(protectedRefuge){actor.sheltered=true;return;}
  if(actor.sheltered){reconnectContinuationHush(actor,player);actor.sheltered=false;return;}
  if(!force&&distance(actor.lastRecorded,player)<.3&&Math.abs(actor.lastRecorded.feet-player.feet)<.2)return;
  const p={kind:'walk',...point(player)},last=actor.trail.at(-1),previous=actor.trail.at(-2);
  const ax=last?.x-previous?.x,az=last?.z-previous?.z,bx=p.x-(last?.x??p.x),bz=p.z-(last?.z??p.z);
  const straight=Number.isFinite(ax)&&Math.abs(ax*bz-az*bx)<1e-5&&ax*bx+az*bz>=0;
  if(last?.kind==='walk'&&previous?.kind==='walk'&&straight&&Math.abs(previous.feet-p.feet)<.01&&continuationWalkSegment(previous,p,null,player))actor.trail[actor.trail.length-1]=p;
  else actor.trail.push(p);
  actor.lastRecorded=point(player);compactTrail(actor,player);
}
export function recordContinuationHushDrop(actor,fall) {
  recordContinuationHushWalk(actor,{...fall,level:fall.fromLevel},{force:true});
  actor.trail.push({kind:'drop',...point({...fall,level:fall.fromLevel,phase:fall.fromPhase}),vx:fall.vx,vz:fall.vz,vy:fall.vy,fromPhase:fall.fromPhase,trigger:fall.trigger,lastSupport:point(fall.lastSupport||fall),groundedExit:fall.groundedExit,voidLoop:continuationVoidLoopForFall(fall)});
}
export function recordContinuationHushFold(actor,receipt,source) {
  if(!actor.active&&actor.arrival?.stage!=='waiting')return;
  actor.trail.push({kind:'fold',...point(receipt.from),foldId:receipt.id,foldSide:receipt.side,serial:receipt.serial,fromChartId:receipt.fromChartId,toChartId:receipt.toChartId,matrix:[...receipt.matrix],inverseMatrix:[...receipt.inverseMatrix]});
  actor.lastRecorded=point(receipt.to);actor.sheltered=false;if(!actor.knownPortals.includes(receipt.id))actor.knownPortals.push(receipt.id);
}
export function reconnectContinuationHush(actor,player) {
  if((actor.chartId??0)!==(player.chartId??0)) {
    if(actor.fall||actor.recovery){actor.reconnectTarget=point(player);return true;}
    const queue=[{chart:actor.chartId,edges:[]}],seen=new Set([actor.chartId]);let route=null;
    while(queue.length){const current=queue.shift();if(current.chart===player.chartId){route=current.edges;break;}for(const portal of continuationFolds().filter(p=>actor.knownPortals.includes(p.id)))for(const side of['a','b']){const edge=portalEdge(portal,side);if(edge.fromChartId!==current.chart||seen.has(edge.toChartId))continue;seen.add(edge.toChartId);queue.push({chart:edge.toChartId,edges:[...current.edges,edge]});}}
    if(!route){actor.reconnectTarget=point(player);return false;}
    const trail=[];let from=point(actor);
    for(const edge of route){const source=edge.source,approach=point(source.approach),path=continuationSupportedPath(from,approach,player);if(!path){actor.reconnectTarget=point(player);return false;}trail.push(...path.slice(1).map(p=>({kind:'walk',...p})));const crossing={x:source.center[0]-source.normal[0]*.04,z:source.center[2]-source.normal[2]*.04,feet:source.feet,chartId:edge.fromChartId,phase:'wrong-return',level:0};trail.push({kind:'fold',...crossing,foldId:edge.portal.id,foldSide:edge.side,fromChartId:edge.fromChartId,toChartId:edge.toChartId,matrix:[...edge.matrix],inverseMatrix:[...edge.inverseMatrix]});from=point(edge.destination.approach);trail.push({kind:'walk',...from});}
    const final=continuationSupportedPath(from,player,player);if(!final){actor.reconnectTarget=point(player);return false;}trail.push(...final.slice(1).map(p=>({kind:'walk',...p})));actor.trail=trail;actor.lastRecorded=point(player);actor.reconnectTarget=null;actor.sheltered=false;return true;
  }
  const pending=!!actor.reconnectTarget,from=pending?point(actor):actor.lastRecorded;
  const path=continuationSupportedPath(from,player,player);
  if(!path)return false;
  if(pending)actor.trail=[];
  for(const p of path.slice(1))actor.trail.push({kind:'walk',...p});
  actor.lastRecorded=point(player);actor.sheltered=false;actor.reconnectTarget=null;compactTrail(actor,player);return true;
}
function actorPortal(actor,before,world,events,velocity=null) {
  const queued=actor.trail[0];if(queued?.kind!=='fold')return false;
  const edge=continuationPortalCrossing(before,actor,{onlyId:queued.foldId,onlySide:queued.foldSide});if(!edge)return false;
  const wasFalling=!!actor.fall,receipt=transferContinuationPortal(actor,edge,{eye:false,velocity});actor.trail.shift();actor.mode='falling';
  settleSupportedPortal(actor,world,wasFalling);
  if(!actor.knownPortals.includes(receipt.id))actor.knownPortals.push(receipt.id);
  if(actor.chartId!==0)actor.phase='wrong-return';events.push({type:'hush-fold',...receipt});continuationHushThresholdArrival(actor,receipt,world,events);return true;
}
function settleSupportedPortal(actor,world,wasFalling){
  if(wasFalling||Math.abs(continuationBodyAxis(actor)[1]-1)>1e-6)return;
  const at=continuationSupportAt(actor.x,actor.z,actor,{minY:actor.feet-.02,maxY:actor.feet+.02});
  if(!at||!continuationFreeBody(actor,{...world,chartId:actor.chartId}))return;
  actor.fall=null;actor.feet=at.y;actor.phase=at.surface.region;actor.bodyTransit=null;
}
function gravityStep(actor,dt,events,world) {
  const before={...actor},f=actor.fall,result=continuationBallisticStep(f,dt,{...world,chartId:actor.chartId,heading:actor.heading,bodyTransit:actor.bodyTransit,recovery:actor.recovery},{axis:continuationBodyAxis(actor)}),landed=result.support;
  Object.assign(actor,point(f));
  for(const receipt of result.wraps){actor.lastSpaceWrap=receipt;events.push({type:'hush-space-wrap',...receipt});}
  if(!result.wraps.length&&actorPortal(actor,before,world,events))return;
  if(landed){actor.feet=landed.y;actor.level=landed.level;actor.phase=landed.surface.region;actor.fall=null;actor.mode='follow';events.push({type:'hush-land',level:actor.level,trigger:f.trigger,position:position(actor)});if(actor.reconnectTarget)reconnectContinuationHush(actor,{...world,...actor.reconnectTarget});}
  else if(result.void){const backwards=(f.trace||[]).slice().reverse().map(p=>p.kind==='fold'?{kind:'fold',...point(p.to),to:point(p),foldId:p.foldId,foldSide:p.foldSide==='a'?'b':'a',fromChartId:p.toChartId??p.to.chartId,toChartId:p.fromChartId??p.chartId,matrix:[...p.inverseMatrix],inverseMatrix:[...p.matrix]}:{kind:'walk',...point(p)}),path=[{kind:'walk',...point(actor)},...backwards,{kind:'walk',...point(f.lastSupport)}];let total=0,from=point(actor);for(const p of path){if(from.chartId===p.chartId)total+=Math.hypot(p.x-from.x,p.z-from.z,p.feet-from.feet);from=p.kind==='fold'?p.to:p;}actor.recovery={path,index:0,elapsed:0,duration:Math.min(C.recoveryMaximumSeconds,Math.max(1.6,total/C.recoverySpeed)),total,up:continuationBodyAxis(actor)};actor.fall=null;actor.mode='recovering';events.push({type:'hush-recovery',reason:'void-fall',position:position(actor)});}
}
function recoverActor(actor,dt,world,events) {
  const r=actor.recovery;let budget=(r.total||C.recoverySpeed*r.duration)/r.duration*dt;
  while(r.index<r.path.length) {
    const target=r.path[r.index];if(target.chartId!==actor.chartId)return;
    const d=Math.hypot(target.x-actor.x,target.z-actor.z,target.feet-actor.feet);
    if(d<1e-6){
      if(target.kind==='fold'){const portal=continuationFolds().find(p=>p.id===target.foldId);if(!portal)return;const receipt=transferContinuationPortal(actor,portalEdge(portal,target.foldSide),{eye:false,transportOnly:true,velocity:[0,0,0]});r.up=target.to?.up||continuationBodyAxis(actor);events.push({type:'hush-fold',...receipt,recovery:true});}
      r.index++;continue;
    }
    if(budget<=0)break;
    const amount=Math.min(d,budget),t=amount/d,up=target.up||r.up||[0,1,0],next={x:actor.x+(target.x-actor.x)*t,z:actor.z+(target.z-actor.z)*t,feet:actor.feet+(target.feet-actor.feet)*t,chartId:actor.chartId,level:actor.level};
    if(!continuationFreeBody(next,{...world,chartId:actor.chartId,bodyTransit:actor.bodyTransit},{axis:up})){blockedLeaf(actor,next,world,events);return;}
    Object.assign(actor,point(next));r.up=[...up];budget-=amount;
  }
  r.elapsed=Math.min(r.duration,r.elapsed+dt);
  if(r.index>=r.path.length){Object.assign(actor,point(r.path.at(-1)));actor.recovery=null;actor.mode='notice';actor.notice=C.hush.noticeSeconds;events.push({type:'hush-recovered',position:position(actor)});if(actor.reconnectTarget)reconnectContinuationHush(actor,{...world,...actor.reconnectTarget});}
}
function blockedLeaf(actor,next,player,events) {
  for(const door of continuationChartDoors(actor)) {
    if(door.role==='false-return'||Math.abs(actor.feet-door.y)>.6)continue;
    const motion=player.doorMotion[door.id],progress=motion?Math.min(1,Math.max(0,(player.elapsed-motion.startedAt)/(motion.duration||1))):1;
    const fraction=motion?motion.from+(motion.to-motion.from)*progress:player.doorOpen[door.id]?1:0;
    if(fraction>=C.doorPassFraction)continue;
    const n=door.normal||(Math.abs(Math.sin(door.yaw))>.5?{x:1,z:0}:{x:0,z:1}),dx=next.x-door.x,dz=next.z-door.z;
    if(Math.abs(dx*n.x+dz*n.z)>=.12+C.hush.radius||Math.abs(-dx*n.z+dz*n.x)>=door.width/2+C.hush.radius)continue;
    // He reaches the same leaf rather than walking through a door the player
    // closed behind him. Opening spends the ordinary saved hinge motion.
    if(!player.doorOpen[door.id]) {
      player.doorOpen[door.id]=true;player.doorMotion[door.id]={from:fraction,to:1,startedAt:player.elapsed,duration:C.doorSwingSeconds*(1-fraction)};
      events.push({type:'door',id:door.id,open:true,actor:actor.id});
    }
    return true;
  }
  return false;
}
function advanceContinuationHushBody(actor,{dt,player,protectedRefuge=false,refuge=null,frozen=false,events=[]}={}) {
  if(advanceContinuationArrival(actor,{dt,player,frozen,events}))return false;
  if(!actor.active)return false;
  if(actor.catchEntry&&!frozen)actor.catchEntry.elapsed=Math.min(C.hush.thresholdArrivalDelaySeconds,actor.catchEntry.elapsed+dt);
  actor.elapsed+=dt;
  advancePortalTransit(actor,dt);
  if(!actor.warningAnnounced){actor.warningAnnounced=true;events.push({type:'hush-warning',position:position(actor)});}
  if(!actor.armed&&(player.phase==='catch'||player.feet>=4)){actor.armed=true;events.push({type:'hush-armed',position:position(actor)});}
  if(actor.fall){gravityStep(actor,dt,events,player);return false;}
  if(actor.recovery){recoverActor(actor,dt,player,events);return false;}
  if(actor.reconnectTarget)reconnectContinuationHush(actor,{...player,...actor.reconnectTarget});
  if(frozen){actor.mode='yield';actor.notice=C.hush.noticeSeconds;return false;}
  if(actor.mode==='warning') {if(actor.elapsed<C.hush.warningSeconds)return false;actor.mode='follow';}
  protectedRefuge=protectedRefuge&&actor.chartId===player.chartId;
  const standOff=Math.max(C.hush.refugeStandOff,Number(refuge?.standOff)||0);
  if(protectedRefuge&&refuge&&Math.abs(actor.feet-refuge.feet)<.5&&distance(actor,refuge)<standOff+.2){actor.mode='yield';actor.notice=C.hush.noticeSeconds;return false;}
  if(actor.mode==='yield'||actor.mode==='notice') {if(actor.mode==='yield')events.push({type:'hush-notice',position:position(actor)});actor.notice=Math.max(0,actor.notice-dt);actor.mode='notice';if(actor.notice>0)return false;actor.mode='follow';}
  if(!actor.armed&&actor.chartId===player.chartId&&distance(actor,player)<3.5&&Math.abs(actor.feet-player.feet)<.5)return false;
  const pace=actor.armed?C.hush.speed:C.hush.teachingSpeed;let remaining=pace*dt,repairs=0;
  while(remaining>1e-8&&actor.trail.length) {
    const target=actor.trail[0],d=distance(actor,target);
    if((target.chartId??0)!==actor.chartId)break;
    if(d<1e-7&&Math.abs(actor.feet-target.feet)<.46) {
      actor.trail.shift();
      if(target.kind==='fold'){const portal=continuationFolds().find(p=>p.id===target.foldId);if(portal){const edge=portalEdge(portal,target.foldSide),receipt=transferContinuationPortal(actor,edge,{eye:false,velocity:[actor.velocity?.x||0,0,actor.velocity?.z||0]});actor.mode='falling';settleSupportedPortal(actor,player,false);events.push({type:'hush-fold',...receipt});continuationHushThresholdArrival(actor,receipt,player,events);}break;}
      if(target.kind==='drop') {actor.fall={x:actor.x,z:actor.z,feet:actor.feet,chartId:actor.chartId,level:actor.level,phase:actor.phase,vx:target.vx,vz:target.vz,vy:target.vy||0,fromLevel:actor.level,fromPhase:target.fromPhase,fromChartId:target.fromChartId??actor.chartId,trigger:target.trigger,lastSupport:target.lastSupport||point(actor),groundedExit:target.groundedExit,elapsed:0,unsupported:target.trigger==='jump',trace:[point(actor)],voidLoop:continuationVoidLoopForFall(target,{chartId:actor.chartId})};actor.mode='falling';events.push({type:'hush-drop',level:actor.level,trigger:target.trigger,position:position(actor)});break;}
      continue;
    }
    const amount=Math.min(d,remaining),next={x:actor.x+(target.x-actor.x)*amount/d,z:actor.z+(target.z-actor.z)*amount/d,feet:target.feet,chartId:actor.chartId};
    if(continuationHushGateWaiting(actor,next))break;
    if(blockedLeaf(actor,next,player,events))break;
    if(!continuationWalkSegment(actor,next,null,player)){
      // A saved straight trail can become obstructed by the same descending
      // cabinet the player met. Keep the destination/fold/drop receipt, and
      // repair only the supported walk prefix around its current real box.
      if(actor.chartId!==4||repairs++>0)break;
      const path=continuationSupportedPath(actor,target,player);
      if(!path||path.length<3)break;
      actor.trail.splice(0,1,...path.slice(1,-1).map(p=>({kind:'walk',...p})),target);
      events.push({type:'hush-route-repair',reason:'corridor-cabinet',chartId:actor.chartId,position:position(actor)});
      continue;
    }
    const at=support(next.x,next.z,actor.feet,null,actor.chartId,player);if(!at)break;
    if(protectedRefuge&&refuge&&Math.abs(at.y-refuge.feet)<.5&&distance(next,refuge)<standOff){actor.mode='yield';actor.notice=C.hush.noticeSeconds;break;}
    const before={...actor},velocity=[(target.x-actor.x)/d*pace,0,(target.z-actor.z)/d*pace];actor.heading=Math.atan2(next.x-actor.x,-(next.z-actor.z));Object.assign(actor,{x:next.x,z:next.z,feet:at.y,level:at.level,velocity:{x:velocity[0],z:velocity[2]}});actor.animationClock+=amount;remaining-=amount;
    if(actorPortal(actor,before,player,events,velocity))break;
  }
  return actor.armed&&actor.chartId===player.chartId&&!protectedRefuge&&Math.abs(actor.feet-player.feet)<.8&&distance(actor,player)<C.hush.contactDistance;
}

export function advanceContinuationHush(actor,options={}) {
  const {dt=0,player,frozen=false,protectedRefuge=false,events=[]}=options;
  const active=actor.active,beforeClock=actor.animationClock,beforeHeading=actor.heading,beforeChart=actor.chartId;
  const eventStart=events.length,hadRoute=actor.trail.length>0;
  const result=advanceContinuationHushBody(actor,{...options,events});
  if(!active||!actor.active||frozen||!(dt>0))return result;
  // animationClock already accumulates accepted supported metres. Coordinates
  // can jump between portal charts; that atlas distance is never locomotion.
  const acceptedMetres=Math.max(0,finite(actor.animationClock)-finite(beforeClock));
  const folded=beforeChart!==actor.chartId||events.slice(eventStart).some(e=>e.type==='hush-fold');
  const teachingHold=!actor.armed&&actor.chartId===player.chartId&&distance(actor,player)<3.5&&Math.abs(actor.feet-player.feet)<.5;
  const blocked=actor.mode==='follow'&&hadRoute&&!acceptedMetres&&!actor.fall&&!actor.recovery&&!protectedRefuge&&!teachingHold&&!folded;
  actor.density=stepHushDensityPose(actor.density,{
    dt,acceptedMetres,headingDelta:folded?0:actor.heading-beforeHeading,
    listening:actor.mode==='notice',blocked,seed:0x48555348,
  });
  return result;
}
