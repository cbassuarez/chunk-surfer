import {SOURCE_CONTINUATION as C,continuationSurfaces,continuationSolids} from '../data/source-continuation.js';
import {SOURCE_TIDES} from '../game/source-continuation-tides.js';
import {SOURCE_BLACK_SUN} from './source-continuation-black-sun.js';

// The spindle is one island of many. Beyond the reachable archipelago a
// fixed, seeded universe of unreachable islands fills the void above and
// below, in two shells swaying slowly against each other about the spindle. Every
// reachable island hangs on its own stepped root, so none reads as a tile.
// Nothing here is a support: the reachable floors stay in the data module.
export const SOURCE_ISLANDS=Object.freeze({
  seed:1597,count:120,inner:62,outer:285,above:125,below:215,clearance:18,
  // Seen from the stack, the door island and the sky above it stay open
  // void, so its gateposts and rising thread have no rival.
  doorLane:Object.freeze({halfAngle:.3,floor:-.3}),
  // Bounded sways, never a full turn: no island ever drifts into the lane.
  shells:Object.freeze([Object.freeze({id:'near',to:150,sway:.14,swaySeconds:260}),Object.freeze({id:'far',to:Infinity,sway:-.1,swaySeconds:410})]),
  links:22,linkReach:62,linkRise:9,
});
const GROUP_MATERIAL=Object.freeze({stone:'cold-stone',wood:'piano-wood',lining:'case-lining',metal:'worn-metal'});
const REACHABLE=Object.freeze(['island','seat-island','door-island']);
const centre=C.catch.center,door=C.catch.finalDoor,sun=SOURCE_TIDES.wells.catch,
  // The black sun's corona and the moon's stream keep a clear sky round them.
  sunClear=SOURCE_BLACK_SUN.radius*SOURCE_BLACK_SUN.streamerReach[1]+10;
const faces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
function corners(target,points){
  const o=target.p.length/3;
  for(const q of points)target.p.push(...q);
  for(const[a,b,c,d]of faces)target.i.push(o+a,o+c,o+b,o+a,o+d,o+c);
}
// A box about (x,y,z), turned by yaw about its own vertical axis.
function block(target,x,y,z,hx,hy,hz,yaw=0){
  const c=Math.cos(yaw),s=Math.sin(yaw),at=(lx,ly,lz)=>[x+lx*c-lz*s,y+ly,z+lx*s+lz*c];
  corners(target,[at(-hx,-hy,-hz),at(hx,-hy,-hz),at(hx,-hy,hz),at(-hx,-hy,hz),at(-hx,hy,-hz),at(hx,hy,-hz),at(hx,hy,hz),at(-hx,hy,hz)]);
}
function random(seed){
  let a=seed>>>0;
  return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
// A stepped root under a slab top: wide terraces narrowing to a spike.
function root(groups,x,top,z,hx,hz,yaw,depth,tiers,spike=.45){
  let y=top;
  for(let k=0;k<tiers;k++){
    const f=1-(k+1)/(tiers+1.15),h=depth*(1-spike)/tiers;
    block(groups.stone,x,y-h/2,z,hx*f,h/2,hz*f,yaw+k*.13);y-=h;
  }
  const w=Math.min(hx,hz)*.16;
  block(groups.stone,x,y-depth*spike/2,z,w,depth*spike/2,w,yaw+.4);
}
const groupsOf=()=>Object.fromEntries(Object.keys(GROUP_MATERIAL).map(k=>[k,{p:[],i:[]}]));

// The reachable islands, with the one ahead of the door marked by depth
// as much as by its gateposts: its root is the longest under the stack.
function reachableRoots(){
  const groups=groupsOf();
  for(const s of continuationSurfaces({phase:'catch'}).filter(s=>s.region==='catch'&&s.kind==='rect'&&REACHABLE.includes(s.role)&&!s.archipelago)){
    const hx=(s.maxX-s.minX)/2,hz=(s.maxZ-s.minZ)/2,x=(s.minX+s.maxX)/2,z=(s.minZ+s.maxZ)/2,size=Math.max(hx,hz);
    const depth=Math.max(7,s.role==='door-island'?size*3.4:s.role==='seat-island'?size*2.6:size*1.6);
    root(groups,x,s.y-(s.thickness??.35),z,hx,hz,0,depth,s.role==='island'?3:4);
  }
  return groups;
}

// Built construction the universe must never enter: every other floor and
// wall on this chart, and the whole reachable archipelago with its air.
function forbidden(){
  const rows=[...continuationSurfaces({chartId:0}).map(s=>({minX:s.minX,maxX:s.maxX,minZ:s.minZ,maxZ:s.maxZ,minY:s.y-(s.thickness??.35),maxY:s.y})),
    ...continuationSolids({chartId:0}).map(s=>({minX:s.minX,maxX:s.maxX,minZ:s.minZ,maxZ:s.maxZ,minY:s.minY,maxY:s.maxY}))];
  return rows.map(r=>({minX:r.minX-SOURCE_ISLANDS.clearance,maxX:r.maxX+SOURCE_ISLANDS.clearance,minY:r.minY-SOURCE_ISLANDS.clearance,maxY:r.maxY+SOURCE_ISLANDS.clearance,
    minZ:r.minZ-SOURCE_ISLANDS.clearance,maxZ:r.maxZ+SOURCE_ISLANDS.clearance}));
}
const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY&&a.minZ<b.maxZ&&a.maxZ>b.minZ;

function scatter(){
  const S=SOURCE_ISLANDS,rand=random(S.seed),blocked=forbidden(),islands=[];
  const doorYaw=Math.atan2(door.z-centre.z,door.x-centre.x),from=[centre.x,-12.6+1.62,centre.z];
  for(let attempt=0;attempt<S.count*40&&islands.length<S.count;attempt++){
    // Area-weighted radius; elevation skewed below, where the void is deeper.
    const r=Math.sqrt(S.inner**2+rand()*(S.outer**2-S.inner**2)),a=rand()*Math.PI*2,y=-S.below+rand()**.85*(S.above+S.below);
    const x=centre.x+Math.cos(a)*r,z=centre.z+Math.sin(a)*r,size=3+rand()**2.2*(14+r*.06),depth=size*(1.1+rand()*1.6),top=size*(.3+rand()*.9);
    const bounds={minX:x-size*1.4,maxX:x+size*1.4,minY:y-depth,maxY:y+top,minZ:z-size*1.4,maxZ:z+size*1.4};
    if(blocked.some(b=>overlaps(b,bounds)))continue;
    if(islands.some(o=>Math.hypot(o.x-x,o.y-y,o.z-z)<(o.size+size)*1.6))continue;
    if(Math.hypot(x-sun.x,y-sun.y,z-sun.z)<sunClear+size*1.4+depth)continue;
    // Nor does any island stand between the stack and the sun.
    const toSun=[sun.x-from[0],sun.y-from[1],sun.z-from[2]],toIsle=[x-from[0],y-from[1],z-from[2]],sunDistance=Math.hypot(...toSun),
      cos=(toSun[0]*toIsle[0]+toSun[1]*toIsle[1]+toSun[2]*toIsle[2])/(sunDistance*Math.hypot(...toIsle));
    if(cos>Math.cos(Math.asin(Math.min(1,sunClear/sunDistance))+Math.atan2(size*1.4,Math.hypot(...toIsle))+Math.max(...S.shells.map(s=>Math.abs(s.sway)))))continue;
    const lane=Math.abs(Math.atan2(Math.sin(Math.atan2(z-from[2],x-from[0])-doorYaw),Math.cos(Math.atan2(z-from[2],x-from[0])-doorYaw)));
    if(lane<S.doorLane.halfAngle+Math.max(...S.shells.map(s=>Math.abs(s.sway)))&&Math.atan2(y-from[1],Math.hypot(x-from[0],z-from[2]))>S.doorLane.floor)continue;
    islands.push({id:islands.length,x,y,z,r,size,depth,yaw:rand()*Math.PI,kind:rand(),detail:rand(),shell:S.shells.findIndex(s=>r<s.to)});
  }
  return islands;
}
function dress(groups,isle,rand){
  const {x,y,z,size,yaw,depth}=isle,hx=size*(.55+rand()*.45),hz=size*(.55+rand()*.45),t=.35+size*.05;
  block(groups.stone,x,y-t/2,z,hx,t/2,hz,yaw);
  // A second offset slab breaks the rectangle into a coastline.
  if(rand()<.65){const ox=(rand()-.5)*hx,oz=(rand()-.5)*hz,s=.45+rand()*.4;block(groups.stone,x+ox,y-t*.9,z+oz,hx*s,t/2,hz*s,yaw+.5+rand());}
  root(groups,x,y-t,z,hx,hz,yaw,depth,2+Math.floor(rand()*4),.3+rand()*.35);
  const k=isle.kind,on=(f)=>({px:x+(rand()-.5)*hx*f,pz:z+(rand()-.5)*hz*f});
  if(k<.13){
    // A distant spindle: someone else's stack of shelves.
    const h=size*(1.4+rand());block(groups.metal,x,y+h/2,z,size*.035+.12,h/2,size*.035+.12);
    for(let n=0;n<3;n++){const ry=y+h*(.25+n*.25),rr=size*(.75-n*.16);block(groups.lining,x,ry,z,rr,.18+size*.012,rr*.42,yaw+n*1.1);}
  }else if(k<.42){
    for(let n=0,m=2+Math.floor(rand()*3);n<m;n++){const {px,pz}=on(1.4),h=size*(.25+rand()*.6);block(groups.stone,px,y+h/2,pz,.25+size*.03,h/2,.25+size*.03,yaw);}
  }else if(k<.55){
    const h=size*(.45+rand()*.35),w=hx*.6,c=Math.cos(yaw),s=Math.sin(yaw);
    for(const side of[-1,1])block(groups.stone,x+c*w*side,y+h/2,z+s*w*side,.3+size*.03,h/2,.3+size*.03,yaw);
    block(groups.wood,x,y+h+.2,z,w+.5,.2+size*.01,.35+size*.02,yaw);
  }else if(k<.73){
    for(let n=1;n<=2;n++)block(groups.stone,x,y+t*n,z,hx*(1-n*.3),t/2,hz*(1-n*.3),yaw+n*.2);
  }
  if(isle.detail<.18){const {px,pz}=on(1.2);block(groups.wood,px,y+.5,pz,size*.12,.5,size*.06,yaw+1.2);}
}
function link(groups,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),yaw=Math.atan2(dz,dx),
    mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},c=Math.cos(yaw),s=Math.sin(yaw);
  // A tilted run is drawn as short level treads stepping between heights.
  const treads=Math.max(1,Math.ceil(Math.abs(b.y-a.y)/.8));
  for(let n=0;n<treads;n++){
    const u=(n+.5)/treads-.5,len=length/treads;
    block(groups.wood,mid.x+c*u*length,a.y+(b.y-a.y)*(n+.5)/treads-.14,mid.z+s*u*length,len/2+.05,.14,.55,0);
  }
}
let built=null;
function universe(){
  if(built)return built;
  const S=SOURCE_ISLANDS,islands=scatter(),rand=random(S.seed^0x9e3779b9),shells=S.shells.map(()=>groupsOf());
  for(const isle of islands)dress(shells[isle.shell],isle,rand);
  // Some distant islands are joined, so the universe reads as travelled.
  let links=0;
  for(const a of islands)for(const b of islands){
    if(links>=S.links||b.id<=a.id||a.shell!==b.shell)continue;
    const d=Math.hypot(a.x-b.x,a.z-b.z);
    if(d<S.linkReach&&Math.abs(a.y-b.y)<S.linkRise&&rand()<.55){link(shells[a.shell],a,b);links++;}
  }
  // Each shell is authored about the spindle axis, so it can turn in place.
  for(const groups of shells)for(const g of Object.values(groups))for(let i=0;i<g.p.length;i+=3){g.p[i]-=centre.x;g.p[i+2]-=centre.z;}
  built={islands,shells,links,roots:reachableRoots()};
  return built;
}
const meshName=(shell,group)=>`catch-universe-${shell}-${group}`;
export function sourceContinuationIslandGeometryLibrary(){
  const {shells,roots}=universe(),library={};
  SOURCE_ISLANDS.shells.forEach((shell,index)=>{for(const [group,g] of Object.entries(shells[index]))if(g.i.length)library[meshName(shell.id,group)]={p:[...g.p],i:[...g.i],material:GROUP_MATERIAL[group]};});
  for(const [group,g] of Object.entries(roots))if(g.i.length)library['catch-island-roots-'+group]={p:[...g.p],i:[...g.i],material:GROUP_MATERIAL[group]};
  return library;
}
export function sourceContinuationIslandDiagnostics(){
  const {islands,links}=universe();
  return{islands:islands.length,links,shells:SOURCE_ISLANDS.shells.map((s,i)=>islands.filter(o=>o.shell===i).length),
    nearest:Math.min(...islands.map(o=>o.r)),farthest:Math.max(...islands.map(o=>o.r)),
    above:islands.filter(o=>o.y>C.catch.top).length,below:islands.filter(o=>o.y<-12.6).length};
}
export function sourceContinuationIslandPlacements(){return universe().islands.map(({id,x,y,z,size,depth,shell})=>({id,x,y,z,size,depth,shell}));}
// Props for one frame. Only the Catch sees this universe: Source II keeps
// its own western view unchanged.
export function sourceContinuationIslandProps(state,{origin={x:0,y:0,z:0},time=0,reducedMotion=false}={}){
  if(state?.phase!=='catch')return[];
  const {shells,roots}=universe(),o=[Number(origin.x)||0,Number(origin.y)||0,Number(origin.z)||0],props=[],t=Number(time)||0;
  const base={chartId:0,region:'catch',structural:false,decorative:true,catchUniverse:true,noShadow:true,noReflection:true};
  SOURCE_ISLANDS.shells.forEach((shell,index)=>{
    const angle=reducedMotion?0:shell.sway*Math.sin(t*Math.PI*2/shell.swaySeconds),c=Math.cos(angle),s=Math.sin(angle);
    const matrix=new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,o[0]+centre.x,o[1],o[2]+centre.z,1]);
    for(const [group,g] of Object.entries(shells[index]))if(g.i.length)
      props.push({...base,id:`source-continuation-catch-universe-${shell.id}-${group}`,mesh:'source-continuation-'+meshName(shell.id,group),matrix,
        x:o[0]+centre.x,y:o[1],z:o[2]+centre.z,universeShell:shell.id,cullRadius:Number.isFinite(shell.to)?shell.to+40:SOURCE_ISLANDS.outer+60});
  });
  for(const [group,g] of Object.entries(roots))if(g.i.length)
    props.push({...base,id:'source-continuation-catch-island-roots-'+group,mesh:'source-continuation-catch-island-roots-'+group,
      matrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,o[0],o[1],o[2],1]),x:o[0]+centre.x,y:o[1]-20,z:o[2]+centre.z,islandRoots:true,cullRadius:80});
  return props;
}
