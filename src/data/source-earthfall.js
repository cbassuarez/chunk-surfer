// The one physical threshold before Source II. All coordinates are local metres.
// These bounds describe visible earth and a real folio catch, not camera motion.
const freeze = Object.freeze;
export const SOURCE_EARTHFALL = freeze({
  version: 1,
  sequenceId: 'source-earthfall:source-II-v1',
  fixedStep: 1 / 120,
  maxFrameDelta: .25,
  walkSpeed: 3.2,
  airSpeed: .4,
  bodyRadius: .22,
  eyeHeight: 1.62,
  upperFloor: 100,
  lowerFloor: 0,
  earth: freeze({ minX: -9, maxX: 9, minZ: -48, maxZ: 4 }),
  // A finite visible landing head receives the reachable fall footprint.
  // Beyond it only a3.6m spine crosses the void; no broad hidden catch exists.
  catch: freeze({ minX: -14, maxX: 14, minZ: -55, maxZ: 10, interceptY: 0, settleSeconds: .48, thickness: .55 }),
  passage: freeze({ halfWidth: 1.8, entryZ: 0, upperExitZ: -42, exitZ: -66, priorExitZ: -42 }),
  lowering: freeze({ startAt: 1.8, drop: .10 }),
  spawn: freeze({ x: 0, z: -1.7, feet: 100, yaw: 0, pitch: 0 }),
  commitmentZ: -2.4,
  // The ground fails in the earthquake, not on a trigger: the tear opens with
  // the S waves of the record (source-earthfall-quake.js) and the footing goes
  // in its strong motion. Stepping out still commits; retreat stays possible
  // until the footing goes.
  fractureAt: 1.8,
  footingLossAt: 6,
  gravity: 9.8,
  terminalSpeed: 26,
  door: freeze({ width: 3, height: 3.05, openSeconds: .8, focusDistance: 2.2, approachDistance: 6.5 }),
});

export const SOURCE_EARTHFALL_CUES = freeze([
  freeze({ type: 'strain', at: 0, gain: .52 }),
  freeze({ type: 'fracture', at: SOURCE_EARTHFALL.fractureAt, gain: .7 }),
  freeze({ type: 'load-transfer', at: 4.2, gain: .5 }),
  freeze({ type: 'footing-loss', at: SOURCE_EARTHFALL.footingLossAt, gain: .64 }),
]);

const cellHash = (index, salt = 0) => {
  let n = Math.imul(index + 71, 0x45d9f3b) ^ Math.imul(salt + 13, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const earthfallCells = (() => {
  const columns = 12, rows = 10, earth = SOURCE_EARTHFALL.earth;
  const dx = (earth.maxX - earth.minX) / columns, dz = (earth.maxZ - earth.minZ) / rows, grid = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const index = row * (columns + 1) + column;
    grid.push(freeze([
      earth.minX + column * dx + (column && column < columns ? (cellHash(index, 1) - .5) * dx * .38 : 0),
      SOURCE_EARTHFALL.upperFloor,
      earth.minZ + row * dz + (row && row < rows ? (cellHash(index, 2) - .5) * dz * .38 : 0),
    ]));
  }
  const cells = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = row * columns + column, k = row * (columns + 1) + column;
    const points = freeze([grid[k], grid[k + 1], grid[k + columns + 2], grid[k + columns + 1]]);
    cells.push(freeze({ id: `earth-${index}`, index, points,
      center: freeze({ x: points.reduce((n, p) => n + p[0], 0) / 4, y: SOURCE_EARTHFALL.upperFloor, z: points.reduce((n, p) => n + p[2], 0) / 4 }),
      depth: .3,
    }));
  }
  return freeze(cells);
})();

// Rendering, fracture motion and sound share these exact cells. No second
// lattice or guessed listener-relative material source is authored elsewhere.
export const sourceEarthfallCellLayout = () => earthfallCells;
export const SOURCE_EARTHFALL_MATERIAL_CELL = earthfallCells.reduce((nearest, cell) =>
  Math.hypot(cell.center.x - 2, cell.center.z + 14) < Math.hypot(nearest.center.x - 2, nearest.center.z + 14) ? cell : nearest);

export const earthfallContains = (bounds, x, z, margin = 0) => Number.isFinite(x) && Number.isFinite(z)
  && x >= bounds.minX + margin && x <= bounds.maxX - margin
  && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;

export const earthfallCatchHeight = () => SOURCE_EARTHFALL.lowerFloor;
export const earthfallCatchVelocity = () => 0;
const ease = value => {const t=Math.max(0,Math.min(1,Number(value)||0));return t*t*(3-2*t);};
export const sourceEarthfallLoweringOffset = elapsed => SOURCE_EARTHFALL.lowering.drop
  * ease(((Number(elapsed)||0)-SOURCE_EARTHFALL.lowering.startAt)/(SOURCE_EARTHFALL.footingLossAt-SOURCE_EARTHFALL.lowering.startAt));
export const sourceEarthfallUpperHeight = elapsed => SOURCE_EARTHFALL.upperFloor-sourceEarthfallLoweringOffset(elapsed);
const fallTime = distance => {
  const c=SOURCE_EARTHFALL,t=c.terminalSpeed/c.gravity,d=c.gravity*t*t/2;
  return distance<=d?Math.sqrt(Math.max(0,distance)*2/c.gravity):t+(distance-d)/c.terminalSpeed;
};
export const SOURCE_EARTHFALL_STRATA = freeze([74,49,25].map((y,index)=>freeze({
  id:`stratum-${index}`,index,y,releaseAt:SOURCE_EARTHFALL.footingLossAt
    +fallTime(SOURCE_EARTHFALL.upperFloor-SOURCE_EARTHFALL.lowering.drop-y)-.72,
  minX:-15,maxX:15,minZ:-22,maxZ:12,thickness:[1.6,.55,.28][index],construction:['coffer','soundboard','binding'][index],
})));
// These deeper printed sections belong to Source's impossible depth, not
// geological strata. Their broken inner edges already exist before the fall.
// They do not open a camera-sized aperture when the player approaches.
export function sourceEarthfallStratumPose(layer,piece,elapsed){
 const west=piece%2===0,age=Math.max(0,(Number(elapsed)||0)-layer.releaseAt);
 const settlement=.12*ease(age/.8);
 return{x:(west?-1:1)*10.2,y:layer.y-settlement,z:piece<2?-13.5:3.5,
   roll:(west?-.025:.018)*ease(age/.9),pitch:(piece<2?-.012:.008)*ease(age/.9)};
}
export const sourceEarthfallLowerContains = (x,z,margin=0) => earthfallContains(SOURCE_EARTHFALL.catch,x,z,margin)
  || earthfallContains({minX:-SOURCE_EARTHFALL.passage.halfWidth,maxX:SOURCE_EARTHFALL.passage.halfWidth,minZ:SOURCE_EARTHFALL.passage.exitZ-3,maxZ:SOURCE_EARTHFALL.catch.minZ+.5},x,z,margin);

// Production assumption, made explicit: a thin hard aggregate/printed cap
// rests on transverse ribs and perimeter bearings above an undermined bay.
// No site geology or hidden reinforcement is established by the story sources.
// Gravity explains only these first eight metres; the100m printed depth is an
// authored Source violation, not an earthquake fault opening.
export const SOURCE_EARTHFALL_CONSTRUCTION=freeze({
 mechanism:'undermined-ribbed-cap',assumed:true,cap:'bonded hard aggregate',
 shallowVoidDepth:8,impossibleBelowY:92,settlementY:92.65,
 failureOrigin:freeze({x:-2.8,z:-7.5}),
});
const ribLayout=freeze(Array.from({length:11},(_,index)=>{
 const z=SOURCE_EARTHFALL.earth.minZ+index*5.2;
 const distance=Math.hypot(-2.8,z+7.5),failureAt=SOURCE_EARTHFALL.footingLossAt+distance*.012;
 return[-1,0,1].map(section=>freeze({id:`rib-${index}-${section}`,type:'rib',center:freeze({x:section*6,y:99.375,z}),
  size:freeze({x:6,y:.65,z:.3}),x0:section*6-3,x1:section*6+3,z,y:99.375,
  bearings:freeze(section?[freeze({x:section*9,y:99.375,z})]:[]),
  failureAt:failureAt+(section+1)*.035,retainedSide:section===0?null:section>0?'east':'west'}));
}).flat());
const bearingLayout=freeze([-1,1].flatMap(side=>Array.from({length:11},(_,index)=>{
 const z=SOURCE_EARTHFALL.earth.minZ+index*5.2;
 return freeze({id:`bearing-${side}-${index}`,type:'bearing',center:freeze({x:side*9.18,y:96,z}),size:freeze({x:.8,y:8,z:1.1}),retained:true});
})));
const cavityLedges=freeze(Array.from({length:11},(_,index)=>freeze({
 id:`cavity-ledge-${index}`,type:'ledge',center:freeze({x:0,y:92.15,z:SOURCE_EARTHFALL.earth.minZ+index*5.2}),
 size:freeze({x:18.8,y:1,z:1.4}),retained:true,
})));
const structuralLayout=freeze([...ribLayout,...bearingLayout,...cavityLedges]);
export const sourceEarthfallStructuralLayout=()=>structuralLayout;
export function sourceEarthfallStructuralPose(member,elapsed){
 const c=member.center;
 if(member.retained)return{x:c.x,y:c.y,z:c.z,pitch:0,roll:0,yaw:0,support:true};
 const age=Math.max(0,(Number(elapsed)||0)-member.failureAt),load=ease(((Number(elapsed)||0)-.6)/Math.max(.2,member.failureAt-.6));
 const bedSettlement=sourceEarthfallLoweringOffset(elapsed);
 if(member.retainedSide){
  // A finite broken outer rib remains on its actual perimeter bearing. Its
  // free end sags; the supported end remains at the bearing, with no floating
  // rigid18m beam translating away from its supports.
  const side=member.retainedSide==='east'?1:-1,roll=side*.16*ease(age);
  const pivot=side*9,dx=c.x-pivot;
  return{x:pivot+dx*Math.cos(roll),y:c.y-bedSettlement+dx*Math.sin(roll),z:c.z,pitch:0,roll,yaw:0,support:true};
 }
 // Both finite middle-span bonds break. Resolve the actual rotated box
 // against the stationary ledge; an unrotated half-depth embeds its low
 // corner by138mm once the small residual pitch/roll develops.
 const pitch=.025*ease(age),roll=.045*ease(age),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
 let lowest=0;
 for(const x of[-member.size.x/2,member.size.x/2])for(const y of[-member.size.y/2,member.size.y/2])for(const z of[-member.size.z/2,member.size.z/2])lowest=Math.min(lowest,sr*x+cr*(cp*y-sp*z));
 const availableDrop=Math.max(0,c.y-bedSettlement+lowest-SOURCE_EARTHFALL_CONSTRUCTION.settlementY);
 return{x:c.x,y:c.y-bedSettlement-Math.min(availableDrop,4.9*age*age),z:c.z,pitch,roll,yaw:0,support:age===0};

}

export function sourceEarthfallReleasePlan(index,center=earthfallCells[index]?.center||{x:0,y:100,z:-21}){
 const x=Number(center.x)||0,z=Number(center.z)||0;
 const origin=SOURCE_EARTHFALL_CONSTRUCTION.failureOrigin,distance=Math.hypot(x-origin.x,(z-origin.z)*.65);
 const row=Math.max(0,Math.min(9,Math.floor((z-SOURCE_EARTHFALL.earth.minZ)/5.2)));
 const initiationAt=SOURCE_EARTHFALL.fractureAt+Math.min(1.3,distance*.035);
 const section=Math.max(-1,Math.min(1,Math.floor((x+9)/6)-1));
 const hostSupports=[`rib-${row}-${section}`,`rib-${row+1}-${section}`];
 const hosts=hostSupports.map(id=>ribLayout.find(member=>member.id===id));
 const bondFailureAt=Math.max(...hosts.map(member=>member.failureAt))+.045+cellHash(index,11)*.065;
 const releaseAt=bondFailureAt;
 const retained=row<5&&(index%7===1||index%11===0);
 return{band:Math.min(5,Math.floor(distance/4)),initiationAt,releaseAt,bondFailureAt,hostSupports,departureSpeed:0,
  seamX:origin.x,seamZ:origin.z,retained,
  // Unequal restraint gives each finite fragment angular motion. All nearby
  // pieces have a common load direction, not mirrored west/east bank hinges.
  roll:(retained?.08:.75+cellHash(index,7)*.38)*(x-origin.x)/Math.max(1,Math.hypot(x-origin.x,z-origin.z)),
  pitch:(retained?.08:.75+cellHash(index,7)*.38)*(origin.z-z)/Math.max(1,Math.hypot(x-origin.x,z-origin.z)),
  yaw:(cellHash(index,10)-.5)*.12,
  driftX:(cellHash(index,12)-.5)*.24,driftZ:(cellHash(index,13)-.5)*.16,
  settleY:SOURCE_EARTHFALL_CONSTRUCTION.settlementY+.18*cellHash(index,14)};
}
export const sourceEarthfallReleaseAt=(index,center)=>sourceEarthfallReleasePlan(index,center).releaseAt;
export function sourceEarthfallControlledDrop(elapsed,releaseAt=SOURCE_EARTHFALL.footingLossAt,maxDrop=180,departureSpeed=0){
 const age=Math.max(0,(Number(elapsed)||0)-releaseAt);
 return Math.min(maxDrop,Math.max(0,departureSpeed)*age+SOURCE_EARTHFALL.gravity*.5*age*age);
}
export const earthfallReleaseDistance=elapsed=>sourceEarthfallControlledDrop(elapsed,SOURCE_EARTHFALL.footingLossAt,Infinity,0);
export const earthfallExitDoorHeight=()=>SOURCE_EARTHFALL.lowerFloor;
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
function uncachedSourceEarthfallFracturePose(index,elapsed,center){
 const time=Number(elapsed)||0,plan=sourceEarthfallReleasePlan(index,center),cell=earthfallCells[index];
 const load=smooth((time-plan.initiationAt)/Math.max(.2,plan.releaseAt-plan.initiationAt));
 const rotation=smooth((time-(plan.releaseAt-.08))/.88),age=Math.max(0,time-plan.releaseAt);
 const roll=plan.roll*rotation,pitch=plan.pitch*rotation,yaw=plan.yaw*rotation;
 const cp=Math.cos(pitch),sp=Math.sin(pitch),sr=Math.sin(roll),cr=Math.cos(roll);
 // The lowest real corner meets a finite debris ledge. Keep the volume and
 // mass here instead of deleting it or accelerating it down an empty shaft.
 let minCorner=0;
 if(cell)for(const point of cell.points)for(const dy of[0,-cell.depth]){
  const x=point[0]-center.x,z=point[2]-center.z;
  minCorner=Math.min(minCorner,sr*x+cr*(cp*dy-sp*z));
 }
 const settlement=sourceEarthfallLoweringOffset(time);
 const direction=[-plan.roll,plan.pitch];
 let bearing=cell?.points[0]||[Number(center.x),Number(center.y),Number(center.z)];
 if(cell)for(const point of cell.points)if((point[0]-center.x)*direction[0]+(point[2]-center.z)*direction[1]<(bearing[0]-center.x)*direction[0]+(bearing[2]-center.z)*direction[1])bearing=point;
 const rotated=sourceEarthfallPoint({x:0,y:0,z:0,pitch,roll,yaw},bearing,center);
 const baseY=Number(center.y)-settlement-rotated[1];
 const untranslatedPose={x:bearing[0]-rotated[0]+plan.driftX*smooth(age/.9),y:baseY,z:bearing[2]-rotated[2]+plan.driftZ*smooth(age/.9),pitch,roll,yaw};
 let maxDrop=Infinity;
 if(cell){
  const vertices=[...cell.points,...cell.points.map(p=>[p[0],p[1]-cell.depth,p[2]])].map(p=>sourceEarthfallPoint(untranslatedPose,p,center));
  for(const ledge of cavityLedges){
   const minZ=ledge.center.z-ledge.size.z/2,maxZ=ledge.center.z+ledge.size.z/2,minX=-ledge.size.x/2,maxX=ledge.size.x/2;
   const candidates=vertices.filter(p=>p[0]>=minX&&p[0]<=maxX&&p[2]>=minZ&&p[2]<=maxZ);
   for(const [a,b]of[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){
    const p=vertices[a],q=vertices[b];
    for(const z of[minZ,maxZ]){
     const u=(z-p[2])/(q[2]-p[2]);if(u<0||u>1||!Number.isFinite(u))continue;
     const point=p.map((v,k)=>v+(q[k]-v)*u);if(point[0]>=minX&&point[0]<=maxX)candidates.push(point);
    }
   }
   if(candidates.length)maxDrop=Math.min(maxDrop,Math.min(...candidates.map(p=>p[1]))-(ledge.center.y+ledge.size.y/2));
  }
 }
 maxDrop=Math.max(0,maxDrop);
 const drop=sourceEarthfallControlledDrop(time,plan.releaseAt,maxDrop,0);
 const settled=drop>=maxDrop-1e-9&&age>0;
 return{...untranslatedPose,y:baseY-drop,
  pitch,roll,yaw,loss:load,support:time<plan.releaseAt,settled,releaseAt:plan.releaseAt,retained:plan.retained};
}

// A fixed tick queries a fragment repeatedly for footing, capsule contacts,
// render and audio. Retain three exact pose keys per fragment; no integration
// state or random history is cached, so reload and arbitrary-time studies agree.
const fracturePoseCache=new Map();
export function sourceEarthfallFracturePose(index,elapsed,center={x:0,y:100,z:-14}){
 const key=`${Number(elapsed)||0}:${center.x}:${center.y}:${center.z}`;
 const recent=fracturePoseCache.get(index)||[],hit=recent.find(entry=>entry.key===key);
 if(hit)return hit.pose;
 const pose=uncachedSourceEarthfallFracturePose(index,elapsed,center);
 recent.unshift({key,pose});recent.length=Math.min(3,recent.length);fracturePoseCache.set(index,recent);
 return pose;
}

// These are the same Y*Z*X rigid transforms uploaded by the renderer, evaluated
// in double precision for footing and fracture-edge attachment.
export function sourceEarthfallPoint(pose,point,center){
  const x=point[0]-center.x,y=point[1]-center.y,z=point[2]-center.z;
  const cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch),cr=Math.cos(pose.roll),sr=Math.sin(pose.roll),cy=Math.cos(pose.yaw),sy=Math.sin(pose.yaw);
  const a=x,b=cp*y-sp*z,c=sp*y+cp*z,d=cr*a-sr*b,e=sr*a+cr*b;
  return[pose.x+cy*d+sy*c,pose.y+e,pose.z-sy*d+cy*c];
}
const cellContains=(cell,x,z)=>{
  let sign=0;
  for(let i=0;i<cell.points.length;i++){
    const a=cell.points[i],b=cell.points[(i+1)%cell.points.length],cross=(b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);
    if(Math.abs(cross)<1e-8)continue;
    if(sign&&Math.sign(cross)!==sign)return false;sign=Math.sign(cross);
  }
  return true;
};
export function sourceEarthfallFooting(x,z,elapsed=0,{maxY=Infinity,includeDetached=false}={}){
 let best=null;
 for(const cell of earthfallCells){
  const pose=sourceEarthfallFracturePose(cell.index,elapsed,cell.center);
  if(!includeDetached&&!pose.support)continue;
  const polygon=cell.points.map(point=>sourceEarthfallPoint(pose,point,cell.center));
  const a=polygon[0],b=polygon[1],c=polygon[2],u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
  let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...normal);normal=normal.map(n=>n/length);if(normal[1]<0)normal=normal.map(n=>-n);
  if(normal[1]<.15)continue;
  let inside=true,sign=0;
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);
   if(Math.abs(cross)<1e-8)continue;if(sign&&Math.sign(cross)!==sign)inside=false;sign=Math.sign(cross);
  }
  if(!inside)continue;
  const y=a[1]-(normal[0]*(x-a[0])+normal[2]*(z-a[2]))/normal[1];
  if(y>maxY+.001||best&&best.y>=y)continue;
  best={id:cell.id,cell:cell.index,y,normal,contact:{x,z},pose,releaseAt:pose.releaseAt};
 }
 return best;
}

// A vertical capsule against each actual convex cap prism. Distances use the
// same transformed top/bottom vertices as rendering, never guessed AABBs. The
// caller may use the minimum translation to resolve shallow contacts at120Hz.
const structuralCollisionSolids=structuralLayout.map(member=>{
 const c=member.center,s=member.size;
 const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[c.x+x*s.x/2,c.y+s.y/2,c.z+z*s.z/2]);
 return{member,center:c,points,depth:s.y};
});
export function sourceEarthfallBodyContacts(body,elapsed,{radius=SOURCE_EARTHFALL.bodyRadius,height=1.8,includeStructure=true}={}){
 const centre=[body.x,body.feet+height/2,body.z],segment=height/2-radius,contacts=[];
 const solids=includeStructure?[...earthfallCells,...structuralCollisionSolids]:earthfallCells;
 for(const cell of solids){
  const pose=cell.member?sourceEarthfallStructuralPose(cell.member,elapsed):sourceEarthfallFracturePose(cell.index,elapsed,cell.center);
  const spanX=cell.member?cell.member.size.x/2+radius+1:3,spanZ=cell.member?cell.member.size.z/2+radius+1:5;
  if(Math.abs(centre[0]-pose.x)>spanX||Math.abs(centre[2]-pose.z)>spanZ||Math.abs(centre[1]-pose.y)>(cell.member?cell.member.size.y/2+height:5))continue;
  const vertices=[...cell.points,...cell.points.map(p=>[p[0],p[1]-cell.depth,p[2]])].map(p=>sourceEarthfallPoint(pose,p,cell.center));
  const middle=vertices.reduce((a,p)=>a.map((v,k)=>v+p[k]/8),[0,0,0]);
  const faces=[[0,1,2],[4,6,5],[0,4,5],[1,5,6],[2,6,7],[3,7,4]];
  let best=null,inside=true;
  for(const ids of faces){
   const [a,b,c]=ids.map(i=>vertices[i]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
   let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
   n=n.map(v=>v/length);if(n.reduce((s,v,k)=>s+v*(middle[k]-a[k]),0)>0)n=n.map(v=>-v);
   const distance=n.reduce((s,v,k)=>s+v*(centre[k]-a[k]),0),penetration=radius+segment*Math.abs(n[1])-distance;
   if(penetration<=1e-7){inside=false;break;}
   if(!best||penetration<best.penetration)best={cell:cell.index??null,solidId:cell.member?.id??cell.id,kind:cell.member?.type??'cap',normal:n,penetration,pose};
  }
  if(inside&&best){
   const before=cell.member?sourceEarthfallStructuralPose(cell.member,Math.max(0,elapsed-SOURCE_EARTHFALL.fixedStep)):sourceEarthfallFracturePose(cell.index,Math.max(0,elapsed-SOURCE_EARTHFALL.fixedStep),cell.center);
   best.velocity=[(pose.x-before.x)/SOURCE_EARTHFALL.fixedStep,(pose.y-before.y)/SOURCE_EARTHFALL.fixedStep,(pose.z-before.z)/SOURCE_EARTHFALL.fixedStep];
   contacts.push(best);
  }
 }
 return contacts.sort((a,b)=>a.penetration-b.penetration);
}
