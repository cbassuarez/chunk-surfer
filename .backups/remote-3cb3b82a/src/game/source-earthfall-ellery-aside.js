import {sceneWalkSpeed} from './locomotion.js';
import {doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C,SOURCE_ELLERY_ASIDE_PANELS as PANELS,SOURCE_ELLERY_ASIDE_CHARGES as CHARGES,sourceElleryAsideCollapse,sourceElleryAsideDoorFraction,sourceElleryAsideDoorLight,sourceElleryAsidePhase} from '../data/source-earthfall-ellery-aside.js';
import {SOURCE_ELLERY_ASIDE_ASSET as ASSET} from '../data/generated/source-earthfall-ellery-aside.js';
import {sourceElleryAsideDust} from './source-earthfall-ellery-aside-dust.js';
import {freshEarthfallGag,normalizeEarthfallGag,advanceEarthfallGag,sourceEarthfallGagFrame,earthfallGagPenetration,earthfallGagSequenceTime} from '../data/source-earthfall-gag.js';
import {EARTHFALL_CHASE as CHASE,EARTHFALL_CHASE_FURNITURE,EARTHFALL_CHASE_OBSTACLES,earthfallChasePropPenetration,freshEarthfallChase,normalizeEarthfallChase,earthfallChaseActive,earthfallChaseFactors,earthfallChaseWorldMatrix,earthfallChaseWorldPoint,earthfallChaseLocalPoint,earthfallChaseRoomAt,earthfallChaseSupported,earthfallChasePath} from '../data/source-earthfall-chase.js';
import {EARTHFALL_GAG} from '../data/source-earthfall-gag.js';
import {THRESHOLD_GAG_SOLIDS} from '../data/threshold-gag.js';
import {freshHushDensityPose,normalizeHushDensityPose,stepHushDensityPose} from './hush-density-performance.js';
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d,clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const copy=v=>JSON.parse(JSON.stringify(v)),angle=v=>Math.atan2(Math.sin(finite(v)),Math.cos(finite(v)));
const ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0,y=0,z=0,sx=1,sy=sx,sz=sx)=>[sx,0,0,0,0,sy,0,0,0,0,sz,0,x,y,z,1];
export const multiplyAsideMatrix=(a,b)=>{const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
export const transformAsidePoint=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
const hash=id=>{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
const rotate=(pitch,roll,yaw)=>{const cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),cy=Math.cos(yaw),sy=Math.sin(yaw);return[cy*cr, sr,-sy*cr,0, -cy*sr*cp+sy*sp,cr*cp,sy*sr*cp+cy*sp,0,cy*sr*sp+sy*cp,-cr*sp,-sy*sr*sp+cy*cp,0,0,0,0,1];};
const G=9.8,centre=[C.center.x,0,C.center.z];
const fallDrop=(age,cap=40)=>age>0?Math.min(cap,.5*G*age*age):0;
const about=(hinge,rotation,drop=0)=>multiplyAsideMatrix(matrix(hinge[0],hinge[1]-drop,hinge[2]),multiplyAsideMatrix(rotation,matrix(-hinge[0],-hinge[1],-hinge[2])));
// A wall drawn in about its base: an inverted pendulum released from a small
// lean, θ = θ0·cosh(ωt) with ω = √(3g/2h) for a 5.5 m wall, so it hangs
// almost still for a beat and then goes. It sinks as its cut base crushes.
const WALL_OMEGA=Math.sqrt(3*G/(2*C.room.ceiling)),WALL_LEAN=.06,WALL_LIMIT=.85;
export function sourceElleryAsideWallLean(host,elapsed){
 const at=C.wallsAt[host];if(!(at>=0))return{angle:0,sink:0};
 const age=Math.max(0,finite(elapsed)-at),raw=WALL_LEAN*(Math.cosh(WALL_OMEGA*age)-1);
 // Eased to a limit, so a wall ends up over the room and never sweeps through
 // the eye: one dark pass across the dust would read as a flash.
 return{angle:WALL_LIMIT*(1-Math.exp(-raw/WALL_LIMIT)),sink:Math.min(.9,.3*age*age)};
}
const WALL_BASE={west:{axis:'z',sign:-1,at:[C.room.minX,0,C.center.z]},east:{axis:'z',sign:1,at:[C.room.maxX,0,C.center.z]},north:{axis:'x',sign:1,at:[C.center.x,0,C.room.minZ]},south:{axis:'x',sign:-1,at:[C.center.x,0,C.room.maxZ]}};
// Rigid pieces only: every matrix here is a rotation and a translation.
// Construction never scales.
export function sourceElleryAsidePieceState(id,elapsed=0){
 const host=PANELS.find(p=>p.id===id),piece=ASSET.panels.find(p=>p.id===id)||host&&{...host,host:id,row:0,column:0,radius:0}||{id,host:'floor-west',kind:'furnishing',pivot:[C.center.x,0,C.center.z],row:0,column:0,radius:0};
 const t=Math.max(0,finite(elapsed)),h=hash(id),kind=piece.kind,p=piece.pivot,b=piece.bounds||{min:p,max:p};
 const dx=p[0]-centre[0],dz=p[2]-centre[2],inner=Math.abs(dx)<4,central=inner&&Math.abs(dz)<2;
 let releaseAt=Infinity,m=ID;
 if(kind==='masonry'||kind==='portal'){
  // Courses stay bonded; the upper ones lean a little further, so the wall
  // reads as bending as it comes in, and their joints open.
  releaseAt=C.wallsAt[piece.host]??Infinity;
  const base=WALL_BASE[piece.host],{angle,sink}=sourceElleryAsideWallLean(piece.host,t),row=piece.row||0,lean=angle*(1+.1*row)*base.sign;
  m=about(base.at,base.axis==='z'?rotate(0,lean,0):rotate(lean,0,0),sink+.06*row*Math.sin(angle));
 }else if(kind==='timber'){
  // The core goes first: the roof's middle tips off its outer bearing and
  // drops; the outer bays follow as their walls start to move.
  releaseAt=C.coreAt+(inner?0:.5)+(central?0:.16)+h*.04;
  const age=t-releaseAt,side=Math.sign(dx)||1,hinge=[side<0?b.min[0]:b.max[0],b.max[1],p[2]];
  if(age>0)m=about(hinge,rotate(0,side*Math.min(1.25,2.2*age*age),0),fallDrop(age-.3));
 }else if(kind==='floor'){
  if(central){
   // The central bay drops out under the falling roof.
   releaseAt=C.floorCoreAt+h*.03;const age=t-releaseAt;
   if(age>0)m=about(p,rotate((h-.5)*.6*age,(hash(id+'r')-.5)*.6*age,0),fallDrop(age));
  }else{
   // The bays around it lose their inner support and sag toward the hole,
   // turning on their outer edge.
   releaseAt=C.floorCoreAt+.35+Math.hypot(dx,dz)*.03;const age=t-releaseAt;
   if(age>0){const sag=Math.min(.15,.12*age*age);
    m=Math.abs(dz)>Math.abs(dx)?about([p[0],0,dz>0?b.max[2]:b.min[2]],rotate(-Math.sign(dz)*sag,0,0)):about([dx>0?b.max[0]:b.min[0],0,p[2]],rotate(0,Math.sign(dx)*sag,0));}
  }
 }
 const center=transformAsidePoint(m,p),radius=piece.radius||0;
 return{id:piece.id,host:piece.host,kind,releaseAt,age:Math.max(0,t-releaseAt),matrix:m,center,radius,occluded:false,materialCategories:piece.materialCategories||[]};
}
export function sourceElleryAsidePanelMatrix(id,elapsed=0){return sourceElleryAsidePieceState(id,elapsed).matrix;}
export function sourceElleryAsideObjectMatrix(id,point,elapsed=0){
 // Everything rides what carries it: wall fittings their wall's bay, the
 // chandelier its roof bay, floor loads their actual floor bay. The clipboard
 // stays on the dispatch desk.
 if(id==='dock-work-order-clipboard'){id='dock-desk-1';point=[60,0,6];}
 if(id==='dock-chandelier-tag'){id='dock-chandelier-frame';point=[69,0,6.5];}
 const host=id==='dock-sign-studios-plant'?'south':id==='dock-crew-board'?'west':id==='dock-shutter-bar'?'east':null,kind=host?'masonry':id==='dock-chandelier-intact'?'timber':'floor';
 const candidates=ASSET.panels.filter(p=>p.kind===kind&&(!host||p.host===host)),nearest=candidates.sort((a,b)=>{const d=p=>Math.hypot(p.pivot[0]-point[0],host?p.pivot[1]-point[1]:0,p.pivot[2]-point[2]);return d(a)-d(b);})[0];
 return nearest?sourceElleryAsidePanelMatrix(nearest.id,elapsed):ID;
}
export function sourceElleryAsideFooting(x,z,elapsed=0,state=null){
 if(state?.chase&&!state.chase.legacy&&state.chase.phase!=='legacy')return chaseFooting(x,z,elapsed,state);
 const throat=throatSupport(x,z,elapsed);if(throat)return{...throat,id:'return:'+throat.door,local:null};
 let result=null;
 for(const piece of ASSET.panels.filter(p=>p.kind==='floor')){
  const m=sourceElleryAsidePanelMatrix(piece.id,elapsed),a=transformAsidePoint(m,[piece.pivot[0],0,piece.pivot[2]]),b=transformAsidePoint(m,[piece.pivot[0]+1,0,piece.pivot[2]]),c=transformAsidePoint(m,[piece.pivot[0],0,piece.pivot[2]+1]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(Math.abs(n[1])<1e-5)continue;
  const y=a[1]-(n[0]*(x-a[0])+n[2]*(z-a[2]))/n[1],local=inversePoint(m,[x,y,z]);if(!local)continue;
  const dx=Math.max(piece.bounds.min[0]-local[0],0,local[0]-piece.bounds.max[0]),dz=Math.max(piece.bounds.min[2]-local[2],0,local[2]-piece.bounds.max[2]);
  if(Math.hypot(dx,dz)<=C.bodyRadius&&(!result||y>result.y))result={id:piece.id,y,local};
 }
 return result;
}
export function sourceElleryAsideFloorAt(x,z,elapsed=0){return sourceElleryAsideFooting(x,z,elapsed)?.y??0;}
export function sourceElleryAsideWalkBounds(elapsed=0){
 // The lowest surviving masonry course is a physical perimeter. Its rigid
 // pieces move inward; the footprint is never scaled into a hidden prison.
 const byHost=host=>ASSET.panels.filter(p=>p.host===host&&p.kind==='masonry'&&p.row===0).map(p=>{const state=sourceElleryAsidePieceState(p.id,elapsed),domain=PANELS.find(d=>d.id===host),points=[];for(const u of[p.bounds.min[domain.axis],p.bounds.max[domain.axis]])points.push(transformAsidePoint(state.matrix,domain.axis===0?[u,.9,domain.pivot[2]]:[domain.pivot[0],.9,u]));return points;}).flat();
 const west=byHost('west'),east=byHost('east'),north=byHost('north'),south=byHost('south');
 const minX=Math.max(C.room.minX,...west.map(p=>p[0])),maxX=Math.min(C.room.maxX,...east.map(p=>p[0])),minZ=Math.max(C.room.minZ,...north.map(p=>p[2])),maxZ=Math.min(C.room.maxZ,...south.map(p=>p[2]));
 const halfX=Math.max(C.bodyRadius+.025,(maxX-minX)/2),halfZ=Math.max(C.bodyRadius+.025,(maxZ-minZ)/2),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
 return{minX:cx-halfX,maxX:cx+halfX,minZ:cz-halfZ,maxZ:cz+halfZ};
}
const circleRect=(x,z,b)=>Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ))<C.bodyRadius;
const propBox=p=>{const b=p.bounds;if(!b)return null;const scale=p.scale||1;return{minX:p.x+b.min[0]*scale,maxX:p.x+b.max[0]*scale,minZ:p.z+b.min[2]*scale,maxZ:p.z+b.max[2]*scale};};
export function freshSourceEarthfallElleryAside({runId=''}={}){return{version:C.version,id:C.id,runId:String(runId),status:'active',elapsed:0,clock:0,accumulator:0,...C.spawn,velocityY:0,receipts:[],consumed:false,exitKind:null,gag:freshEarthfallGag(),chase:freshEarthfallChase(),hushDensity:freshHushDensityPose(37)};}
export function normalizeSourceEarthfallElleryAside(value,options={}){
 const fresh=freshSourceEarthfallElleryAside({runId:options.runId??value?.runId}),legacy=[2,3].includes(value?.version)&&value.id===`source-earthfall:ellery-aside-v${value.version}`;if(!value||!legacy&&(value.version!==C.version||value.id!==C.id)||options.runId!=null&&String(options.runId)!==String(value.runId))return fresh;
 const result={...fresh,status:value.status==='completed'?'completed':'active',elapsed:clamp(value.elapsed,0,C.duration),accumulator:clamp(value.accumulator,0,C.fixedStep),x:finite(value.x,fresh.x),z:finite(value.z,fresh.z),feet:finite(value.feet),velocityY:finite(value.velocityY),yaw:angle(value.yaw),pitch:clamp(value.pitch??0,-1.3,1.3),consumed:!!value.consumed,receipts:Array.isArray(value.receipts)?value.receipts.slice(-96).filter(r=>r&&typeof r.id==='string').map(copy):[]};
 result.gag=legacy?freshEarthfallGag({legacy:true}):normalizeEarthfallGag(value.gag);
 result.clock=Math.max(finite(value.clock,earthfallGagSequenceTime(result)),result.elapsed);result.exitKind=value.exitKind==='quiet'?'quiet':value.exitKind==='collapse'?'collapse':null;
 result.hushDensity=normalizeHushDensityPose(value.hushDensity)||freshHushDensityPose(37);
 const damaged=(legacy||!value.chase)&&result.elapsed>1e-8;result.chase=normalizeEarthfallChase(value.chase,{legacy:damaged||!!result.gag.legacy});
 if(result.elapsed>1e-8&&['recognition','quiet'].includes(result.chase.phase))result.chase=freshEarthfallChase({legacy:true});
 // A recorded destruction pose must never wait inside already-broken floors
 // for an inserted prologue. Explicitly staged and damaged saves skip it too.
 if(result.elapsed>1e-8&&!result.gag.complete)result.gag=normalizeEarthfallGag({...result.gag,complete:true,emitted:31});
 if(result.elapsed>=C.duration){result.status='completed';result.consumed=true;}
 return result;
}
const doorMatrix=d=>{const c=Math.cos(d.yaw),s=Math.sin(d.yaw);return[c,0,-s,0,0,1,0,0,s,0,c,0,d.x,d.y,d.z,1];};
function inversePoint(m,p){
 const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]],q=p.map((v,i)=>v-m[12+i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],bc=cross(b,c),det=dot(a,bc);
 return Math.abs(det)<1e-10?null:[dot(q,bc)/det,dot(q,cross(c,a))/det,dot(q,cross(a,b))/det];
}
function throatSupport(x,z,elapsed){
 if(elapsed>=C.fadeEnd)return null;
 for(const d of ASSET.doors){
  const m=sourceElleryAsidePanelMatrix(d.panel,elapsed),n=d.outward||[0,0,1],u=[-n[2],0,n[0]],half=d.halfWidth||d.assembly.opening.width/2+.12;
  const point=(a,b)=>transformAsidePoint(m,[d.x+u[0]*a+n[0]*b,0,d.z+u[2]*a+n[2]*b]);
  const a=point(-half,d.blindStart||0),b=point(half,d.blindStart||0),c=point(half,d.blindDepth),e=b.map((v,i)=>v-a[i]),f=c.map((v,i)=>v-a[i]),normal=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]];
  if(Math.abs(normal[1])<1e-7)continue;const y=a[1]-(normal[0]*(x-a[0])+normal[2]*(z-a[2]))/normal[1],local=inversePoint(m,[x,y,z]);if(!local)continue;
  const dx=local[0]-d.x,dz=local[2]-d.z,across=dx*u[0]+dz*u[2],depth=dx*n[0]+dz*n[2],r=C.bodyRadius/Math.max(.035,sourceElleryAsideCollapse(elapsed).scale);
  if(Math.abs(across)<=half-r&&depth>=(d.blindStart||0)-.12&&depth<=d.blindDepth-r)return{y,door:d.id};
 }
 return null;
}
export function sourceElleryAsideCanStand(x,z,s){
 if(s.chase&&!s.chase.legacy&&s.chase.phase!=='legacy')return chaseCanStand(x,z,s);
 const b=sourceElleryAsideWalkBounds(s.elapsed),r=C.bodyRadius,inside=x>=b.minX+r&&x<=b.maxX-r&&z>=b.minZ+r&&z<=b.maxZ-r;
 if(!inside&&!throatSupport(x,z,s.elapsed))return false;
 if(s.gag&&earthfallGagPenetration(x,z,s)>earthfallGagPenetration(s.x??x,s.z??z,s)+1e-8)return false;
 if(s.elapsed<C.foldStart)for(const p of ASSET.props){if(!/chandelier-cage|dispatch|road-case|crate|reel/.test(p.id))continue;const box=propBox(p);if(box&&circleRect(x,z,box))return false;}
 const contact=sourceElleryAsideFooting(x,z,s.elapsed);if(!contact)return false;const feet=contact.y,margin=r;
 for(let i=0;i<ASSET.doors.length;i++){
  const d=ASSET.doors[i],root=multiplyAsideMatrix(sourceElleryAsidePanelMatrix(d.panel,s.elapsed),doorMatrix(d));
  for(let leaf=0;leaf<d.assembly.leafCount;leaf++){
   const m=multiplyAsideMatrix(root,doorLeafLocalMatrix(d.assembly,leaf,sourceElleryAsideDoorFraction(i,s.elapsed)));
   for(const y of[.2,.9,1.65]){const p=inversePoint(m,[x,feet+y,z]);if(p&&p[1]>-.1&&p[1]<d.assembly.leaf.height+.1&&p[0]>-margin&&p[0]<d.assembly.leaf.width+margin&&Math.abs(p[2])<d.assembly.leaf.depth/2+margin)return false;}
  }
 }
 return true;
}
const newLoop=s=>s.chase&&!s.chase.legacy&&s.chase.phase!=='legacy';
const loopSealed=s=>earthfallChaseActive(s.chase);
const loopWarp=s=>earthfallChaseWorldMatrix(s.chase);
export function sourceElleryAsideDoorFractionForState(index,s){
 return index===0&&newLoop(s)&&s.elapsed<C.chargeAt?s.chase.quietDoor:sourceElleryAsideDoorFraction(index,s.elapsed);
}
function carrierFor(id,s){
 if(id.startsWith('copy:')){const r=CHASE.rooms.find(r=>r.id===id.slice(5));return multiplyAsideMatrix(loopWarp(s),sourceElleryAsideObjectMatrix(id,[(r.minX+r.maxX)/2,0,(r.minZ+r.maxZ)/2],s.elapsed));}
 return multiplyAsideMatrix(loopWarp(s),sourceElleryAsidePanelMatrix(id.replace(/^chase:/,''),s.elapsed));
}
function planeContact(x,z,bounds,m,id){
 const a=transformAsidePoint(m,[bounds.min[0],0,bounds.min[2]]),b=transformAsidePoint(m,[bounds.max[0],0,bounds.min[2]]),c=transformAsidePoint(m,[bounds.min[0],0,bounds.max[2]]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 if(Math.abs(n[1])<1e-8)return null;const y=a[1]-(n[0]*(x-a[0])+n[2]*(z-a[2]))/n[1],local=inversePoint(m,[x,y,z]);
 // Native tiled floors retain a35mm construction joint at the room edge.
 // A shoe bridges that joint; a strict centre-point test stranded crossings.
 const joint=.04;if(!local||local[0]<bounds.min[0]-joint||local[0]>bounds.max[0]+joint||local[2]<bounds.min[2]-joint||local[2]>bounds.max[2]+joint)return null;return{id,y,local};
}
function chaseFooting(x,z,elapsed,s){
 let best=null;for(const p of ASSET.panels.filter(p=>p.kind==='floor')){const hit=planeContact(x,z,p.bounds,carrierFor('chase:'+p.id,{...s,elapsed}),'chase:'+p.id);if(hit&&(!best||hit.y>best.y))best=hit;}
 for(const r of CHASE.rooms.filter(r=>r.id!=='dock')){const id='copy:'+r.id,hit=planeContact(x,z,{min:[r.minX,0,r.minZ],max:[r.maxX,0,r.maxZ]},carrierFor(id,{...s,elapsed}),id);if(hit&&(!best||hit.y>best.y))best=hit;}return best;
}
function furnitureBlocked(x,z,r,p){
 if(!p.bounds)return false;const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),dx=x-p.x,dz=z-p.z,lx=c*dx-s*dz,lz=s*dx+c*dz,b=p.bounds;
 return Math.hypot(Math.max(b.min[0]-lx,0,lx-b.max[0]),Math.max(b.min[2]-lz,0,lz-b.max[2]))<r;
}
function canonicalCanStand(x,z,s,r=C.bodyRadius,allowEscape=false){
 const player=earthfallChaseLocalPoint(s,s.chase),returning=loopSealed(s)&&player.x<57.55&&player.z>8.75&&player.z<11.75;
 if(!earthfallChaseSupported(x,z,r,{sealed:loopSealed(s)&&!returning}))return false;
 if(s.elapsed<C.foldStart){
  for(const p of [...ASSET.props,...EARTHFALL_CHASE_FURNITURE])if(p.bounds&&!/clipboard|tag|sign|board|check-position/.test(p.id)&&p.bounds.min[1]<C.bodyHeight&&furnitureBlocked(x,z,r,p))return false;
  for(const p of EARTHFALL_CHASE_OBSTACLES){const depth=earthfallChasePropPenetration(x,z,r,p);if(depth>0&&!(allowEscape&&depth<earthfallChasePropPenetration(player.x,player.z,r,p)-1e-8))return false;}
  const m=EARTHFALL_GAG.mount,a=sourceEarthfallGagFrame(s).angle;
  for(const b of THRESHOLD_GAG_SOLIDS){if(b.min[1]+m.y>C.bodyHeight||b.max[1]+m.y<=0)continue;const theta=m.yaw+(b.moving?a:0),c=Math.cos(theta),sn=Math.sin(theta),dx=x-m.x,dz=z-m.z,lx=c*dx+sn*dz,lz=-sn*dx+c*dz;if(Math.hypot(Math.max(b.min[0]-lx,0,lx-b.max[0]),Math.max(b.min[2]-lz,0,lz-b.max[2]))<r)return false;}
  for(let i=0;i<ASSET.doors.length;i++){const d=ASSET.doors[i],root=doorMatrix(d);for(let leaf=0;leaf<d.assembly.leafCount;leaf++){const mat=multiplyAsideMatrix(root,doorLeafLocalMatrix(d.assembly,leaf,sourceElleryAsideDoorFractionForState(i,s))),p=inversePoint(mat,[x,1,z]);if(p&&p[0]>-r&&p[0]<d.assembly.leaf.width+r&&Math.abs(p[2])<d.assembly.leaf.depth/2+r)return false;}}
 }
 return true;
}
function chaseCanStand(x,z,s){const p=earthfallChaseLocalPoint({x,z,feet:s.feet},s.chase),old=earthfallChaseLocalPoint(s,s.chase),radius=C.bodyRadius/earthfallChaseFactors(s.chase).xz;
 if(loopSealed(s)&&old.x<57.55&&old.z>8.75&&old.z<11.75&&p.x<old.x-1e-8)return false;
 return canonicalCanStand(p.x,p.z,s,radius,true)&&!!chaseFooting(x,z,s.elapsed,s);
}
function nearestNav(s,p,r=.24){
 if(canonicalCanStand(p.x,p.z,s,r))return p;
 for(let ring=1;ring<20;ring++)for(let i=0;i<16;i++){const a=i/16*Math.PI*2,q={x:p.x+Math.cos(a)*ring*.25,z:p.z+Math.sin(a)*ring*.25};if(canonicalCanStand(q.x,q.z,s,r))return q;}return null;
}
function chaseEvent(s,events,type,extra={}){const e={id:`${C.id}:${s.runId}:${type}:${s.chase.catches}:${Math.round(s.clock*120)}`,type,at:s.elapsed,clock:s.clock,...extra};s.receipts.push(e);events.push({...e,age:0});return e;}
function startChase(s,events){
 const p=earthfallChaseLocalPoint(s,s.chase),nodes=CHASE.nodes.slice().sort((a,b)=>Math.hypot(b.x-p.x,b.z-p.z)-Math.hypot(a.x-p.x,a.z-p.z)),spawn=nodes.map(n=>nearestNav(s,n)).find(Boolean)||{x:78,z:16};
 Object.assign(s.chase,{phase:'chase',elapsed:0,hushX:spawn.x,hushZ:spawn.z,grace:CHASE.hushWarningSeconds,quietDoorTarget:0,noiseLatched:true});chaseEvent(s,events,'chase-start',{position:{x:spawn.x,y:0,z:spawn.z}});
 s.hushDensity=normalizeHushDensityPose({...freshHushDensityPose(37),event:'notice',listening:true});
}
function advanceChase(s,dt,input,events){
 const c=s.chase,raw=earthfallChaseLocalPoint(s,c),beforeCompression=c.compression,beforeHeading=c.heading;
 let acceptedMetres=0,attempting=false;
 const armed=s.gag.elapsed>=sourceEarthfallGagFrame(s).finishAt;
 // A real reaction during the spoken word is retained through its tail.
 // Recognition still finishes before pursuit begins; the authored boo itself
 // is rejected by the host's output mask, never treated as player sound.
 if(c.phase==='recognition'&&s.gag.elapsed>=EARTHFALL_GAG.releaseAt&&input.playerNoise)c.noiseLatched=true;
 if(c.phase==='recognition'&&armed)c.phase='quiet';
 if(c.phase==='quiet'&&(input.playerNoise||c.noiseLatched))startChase(s,events);
 if(loopSealed(s))c.quietDoorTarget=raw.x<57.55&&raw.z>8.75&&raw.z<11.75?1:0;
 c.quietDoor+=Math.sign(c.quietDoorTarget-c.quietDoor)*Math.min(Math.abs(c.quietDoorTarget-c.quietDoor),dt/.55);
 if(c.phase==='contact'){
  c.contactElapsed+=dt;const actor=earthfallChaseWorldPoint({x:c.hushX,z:c.hushZ},c),target=Math.atan2(actor.x-s.x,-(actor.z-s.z)),u=clamp(c.contactElapsed/CHASE.contactArrestSeconds,0,1);s.yaw=angle(s.yaw+angle(target-s.yaw)*Math.min(1,u*.5+.12));s.pitch+=(-.06-s.pitch)*Math.min(1,dt*14);
  if(input.contactPresented||c.presentedEventId===c.contactEventId){c.injuryApplied=true;c.presentedEventId='';c.catches++;c.phase='chase';c.grace=CHASE.catchGraceSeconds;c.contactElapsed=0;chaseEvent(s,events,'caught',{eventId:c.contactEventId,catches:c.catches});c.contactEventId='';}
 }
 if(c.phase==='chase'){
  c.elapsed+=dt;c.grace=Math.max(0,c.grace-dt);
  const radius=.20/earthfallChaseFactors(c).xz,can=(x,z)=>canonicalCanStand(x,z,s,radius),from=nearestNav(s,{x:c.hushX,z:c.hushZ},radius),to=earthfallChaseLocalPoint(s,c);
  if(from){c.hushX=from.x;c.hushZ=from.z;let path=Array.isArray(c.path)?c.path:[];c.pathClock=finite(c.pathClock)+dt;
   if(c.pathClock>.28||!path.length){path=earthfallChasePath(from,to,can);c.pathClock=0;}c.path=path;
   while(path.length&&Math.hypot(path[0].x-c.hushX,path[0].z-c.hushZ)<.13)path.shift();const target=path[0]||to,dx=target.x-c.hushX,dz=target.z-c.hushZ,d=Math.hypot(dx,dz),amount=c.grace?0:Math.min(d,CHASE.hushSpeed*dt/earthfallChaseFactors(c).xz);
   if(d>1e-5&&amount){attempting=true;const x=c.hushX+dx/d*amount,z=c.hushZ+dz/d*amount;if(can(x,z)){acceptedMetres=Math.hypot(x-c.hushX,z-c.hushZ)*earthfallChaseFactors(c).xz;c.hushX=x;c.hushZ=z;c.heading=Math.atan2(dx,-dz);}}
   const hp=earthfallChaseWorldPoint({x:c.hushX,z:c.hushZ},c);
   if(!c.grace&&Math.hypot(hp.x-s.x,hp.z-s.z)<CHASE.contactRadius){c.phase='contact';c.contactElapsed=0;c.contactEventId=`${C.id}:${s.runId}:contact:${c.catches+1}`;chaseEvent(s,events,'chase-contact',{eventId:c.contactEventId,position:{x:hp.x,y:0,z:hp.z}});}
  }
 }
 if(c.phase==='chase'||c.phase==='contact'){
  const target=Math.min(1,c.elapsed/CHASE.duration+c.catches*CHASE.catchLoad);c.compression=Math.min(target,c.compression+dt*CHASE.compressionRate);
  if(c.compression>=1-1e-7&&c.phase!=='contact'){c.phase='collapse';s.elapsed=0;chaseEvent(s,events,'collapse-start',{catches:c.catches});}
 }
 if(earthfallChaseActive(c))s.hushDensity=stepHushDensityPose(s.hushDensity,{dt,acceptedMetres,
  headingDelta:angle(c.heading-beforeHeading),listening:c.phase==='chase'&&c.grace>0,
  blocked:c.phase==='chase'&&attempting&&acceptedMetres<1e-8,
  loading:c.phase==='contact',loadProgress:Math.min(1,c.contactElapsed/CHASE.contactArrestSeconds),
  seed:37,reducedMotion:!!input.reducedMotion});
 if(c.compression!==beforeCompression){const carried=earthfallChaseWorldPoint(raw,c);s.x=carried.x;s.z=carried.z;}
}
export function stepSourceEarthfallElleryAside(value,input={}){
 const state=normalizeSourceEarthfallElleryAside(value),events=[];
 if(state.status!=='active'||input.paused||input.protected||input.hidden||input.suspended||input.focused===false||input.assetsReady===false||input.gagAudioReady===false)return{state,events,complete:state.status==='completed'};
 if(input.look){state.yaw=angle(input.look.yaw??state.yaw+finite(input.look.dx));state.pitch=clamp(input.look.pitch??state.pitch+finite(input.look.dy),-1.3,1.3);}
 if(newLoop(state)&&input.interact&&['recognition','quiet'].includes(state.chase.phase)){const p=earthfallChaseLocalPoint(state,state.chase);if(Math.hypot(p.x-57.25,p.z-10.25)<2.2){state.chase.quietDoorTarget=state.chase.quietDoorTarget?0:1;chaseEvent(state,events,'quiet-door',{open:!!state.chase.quietDoorTarget});}}
 state.accumulator+=clamp(input.dt??0,0,C.maxFrameDelta);
 while(state.accumulator+1e-10>=C.fixedStep&&state.status==='active'){
  const before=state.elapsed,standing=sourceElleryAsideFooting(state.x,state.z,before,state);state.accumulator=Math.max(0,state.accumulator-C.fixedStep);state.clock+=C.fixedStep;
  const gagActive=advanceEarthfallGag(state,C.fixedStep,events,input);if(newLoop(state))advanceChase(state,C.fixedStep,input,events);
  if(newLoop(state)?state.chase.phase==='collapse':!gagActive)state.elapsed=Math.min(C.duration,state.elapsed+C.fixedStep);
  if(newLoop(state)&&state.chase.phase==='collapse')state.chase.collapseElapsed=state.elapsed;
  if(standing?.local&&Math.abs(state.feet-standing.y)<.16){const carried=transformAsidePoint(newLoop(state)?carrierFor(standing.id,state):sourceElleryAsidePanelMatrix(standing.id,state.elapsed),standing.local);state.x=carried[0];state.z=carried[2];state.feet=carried[1];}
  const b=sourceElleryAsideWalkBounds(state.elapsed),r=C.bodyRadius;
  if(!newLoop(state)&&state.elapsed>=C.foldStart&&!sourceElleryAsideCanStand(state.x,state.z,state)){
    const target={x:clamp(state.x,b.minX+r,b.maxX-r),z:clamp(state.z,b.minZ+r,b.maxZ-r)},dx=target.x-state.x,dz=target.z-state.z,distance=Math.hypot(dx,dz),step=Math.min(1,C.fixedStep*5/Math.max(.001,distance));state.x+=dx*step;state.z+=dz*step;
   }
  if(state.elapsed<C.fadeEnd&&state.chase.phase!=='contact'){
   const forward=clamp(input.forward??0,-1,1),side=clamp(input.side??0,-1,1),n=Math.max(1,Math.hypot(forward,side)),amount=sceneWalkSpeed(C.place,input.run)*C.fixedStep/n;
   const x=state.x+(Math.sin(state.yaw)*forward+Math.cos(state.yaw)*side)*amount,z=state.z+(-Math.cos(state.yaw)*forward+Math.sin(state.yaw)*side)*amount;
   if(sourceElleryAsideCanStand(x,state.z,state))state.x=x;if(sourceElleryAsideCanStand(state.x,z,state))state.z=z;
  }
  const contact=sourceElleryAsideFooting(state.x,state.z,state.elapsed,state);if(contact){state.feet=contact.y;state.velocityY=0;}else{state.velocityY=Math.max(-8,state.velocityY-9.8*C.fixedStep);state.feet+=state.velocityY*C.fixedStep;}
  if(newLoop(state)&&!loopSealed(state)&&state.chase.quietDoor>.8){const p=earthfallChaseLocalPoint(state,state.chase),exit=CHASE.quietExit;if(p.x<=exit.x&&p.z>=exit.minZ&&p.z<=exit.maxZ){state.status='completed';state.consumed=true;state.exitKind='quiet';chaseEvent(state,events,'quiet-exit');events.push({id:`${C.id}:${state.runId}:consumed`,type:'aside-complete',at:state.elapsed,quiet:true});}}
  for(let i=0;i<ASSET.doors.length;i++){
   const a=sourceElleryAsideDoorFraction(i,before),b=sourceElleryAsideDoorFraction(i,state.elapsed),type=a<=.035&&b>.035?'opening-start':a>.035&&b<=.035?'closed':null;
   if(type&&state.elapsed<C.fadeStart){const event={id:`${C.id}:${state.runId}:${i}:${Math.round(state.elapsed/C.fixedStep)}:${type}`,type,doorIndex:i,doorId:ASSET.doors[i].id,at:state.elapsed};state.receipts.push(event);events.push({...event,age:0});}
  }
  if(state.elapsed>=C.duration){state.status='completed';state.consumed=true;state.exitKind='collapse';events.push({id:`${C.id}:${state.runId}:consumed`,type:'aside-complete',at:state.elapsed});}
 }
 if(state.receipts.length>96)state.receipts.splice(0,state.receipts.length-96);
 return{state,events,complete:state.status==='completed'};
}
export function sourceEarthfallElleryAsideFrame(value){
 const state=normalizeSourceEarthfallElleryAside(value),collapse=sourceElleryAsideCollapse(state.elapsed),loop=newLoop(state),world=loop?loopWarp(state):ID;
 const doors=ASSET.doors.map((d,i)=>{const m=multiplyAsideMatrix(world,sourceElleryAsidePanelMatrix(d.panel,state.elapsed)),p=transformAsidePoint(m,[d.x,d.y+1.3,d.z]),fraction=sourceElleryAsideDoorFractionForState(i,state);return{...d,index:i,fraction,light:i===0&&loop&&state.elapsed<C.chargeAt?fraction:sourceElleryAsideDoorLight(i,state.elapsed),anchor:{x:p[0],y:p[1],z:p[2]},panelMatrix:m};});
 // Sound sources, in the order the footage gives them: the charge ripple as
 // one cue carrying every report, the core's bearing, its floor, then the
 // first wall and the one behind the arrival. Each is anchored to the piece
 // that makes it, at its release.
 const first=(kind,host)=>ASSET.panels.filter(p=>p.kind===kind&&(!host||p.host===host)).map(p=>sourceElleryAsidePieceState(p.id,0)).sort((a,b)=>a.releaseAt-b.releaseAt)[0];
 const cues=[{type:'roof-bearing',piece:first('timber')},{type:'floor-bond',piece:first('floor')},{type:'masonry-bond',host:'north',piece:first('masonry','north')},{type:'masonry-bond',host:'south',piece:first('masonry','south')}];
 const materialEvents=[{type:'charges',id:`${C.id}:${state.runId}:charges`,at:C.chargeAt,age:state.elapsed-C.chargeAt,position:{...C.center,y:1.6},
  charges:CHARGES.map(c=>({id:c.id,offset:+(c.at-C.chargeAt).toFixed(4),position:{...c.position},core:c.core}))},
  ...cues.map(cue=>{const at=cue.piece.releaseAt,p=sourceElleryAsidePieceState(cue.piece.id,state.elapsed).center;
   return{type:cue.type,...(cue.host?{host:cue.host}:{}),id:`${C.id}:${state.runId}:${cue.type}${cue.host?':'+cue.host:''}`,at,age:state.elapsed-at,position:{x:p[0],y:p[1],z:p[2]},pieceId:cue.piece.id};}),
 ].filter(cue=>cue.age>=-1e-7);
 const gag=sourceEarthfallGagFrame(state),supportMatrix=multiplyAsideMatrix(world,sourceElleryAsideObjectMatrix('earthfall-gag',[gag.mount.x,0,gag.mount.z],state.elapsed)),carry=p=>{const q=transformAsidePoint(supportMatrix,[p.x,p.y,p.z]);return{x:q[0],y:q[1],z:q[2]};};
 const local=loop?earthfallChaseLocalPoint(state,state.chase):state,dust=sourceElleryAsideDust(state.elapsed,[local.x,local.feet+C.eyeHeight,local.z]);
 if(loop)dust.puffs=dust.puffs.map(p=>({...p,matrix:multiplyAsideMatrix(world,p.matrix),center:transformAsidePoint(world,p.center)}));
 const c=state.chase,hp=loop&&earthfallChaseActive(c)?earthfallChaseWorldPoint({x:c.hushX,z:c.hushZ},c):null,localHush=hp?{x:hp.x,z:hp.z,feet:sourceElleryAsideFooting(hp.x,hp.z,state.elapsed,state)?.y??0,yaw:c.heading,phase:c.phase==='contact'?'contact':'chase',elapsed:c.elapsed,contactElapsed:c.contactElapsed,eventId:c.contactEventId,strength:c.grace?.58:1,density:state.hushDensity}:null;
 const p=loop?earthfallChaseLocalPoint(state,c):null,focus=loop&&!loopSealed(state)&&Math.hypot(p.x-57.25,p.z-10.25)<2.2?{id:'quiet-exit',type:'door',title:c.quietDoorTarget?'CLOSE THE GREY DOOR':'OPEN THE GREY DOOR'}:null;
 return{...state,chaseEnabled:loop,chase:{...c,room:loop?earthfallChaseRoomAt(p.x,p.z)?.id:null},localHush,focus,worldMatrix:world,
  gag:{...gag,shadow:loop?null:gag.shadow,supportMatrix,soundPose:{mount:carry(gag.mount),speaker:carry(gag.speaker),contact:carry(gag.contact)}},sequenceElapsed:state.clock,active:state.status==='active',phase:loop&&c.phase!=='collapse'?c.phase:state.gag.complete?sourceElleryAsidePhase(state.elapsed):gag.phase,collapse,blackoutAlpha:state.exitKind==='quiet'&&state.status==='completed'?1:collapse.blackout,doors,materialEvents:materialEvents.map(e=>loop?{...e,position:(()=>{const p=transformAsidePoint(world,[e.position.x,e.position.y,e.position.z]);return{x:p[0],y:p[1],z:p[2]};})()}:e),dust,walkBounds:sourceElleryAsideWalkBounds(state.elapsed),eye:[state.x,state.feet+C.eyeHeight,state.z],events:state.receipts.map(e=>({...copy(e),age:Math.max(0,e.clock!=null?state.clock-e.clock:state.elapsed-e.at)}))};
}
