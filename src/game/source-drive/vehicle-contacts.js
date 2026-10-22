// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// Visible-landmark contacts for the isolated study. Coordinates are local world
// metres (the renderer's +32 translation is not part of this contract).
import {applyRoadImpulse} from './vehicle-dynamics.js';
// Exact outer visible van bounds from drive.glb: bumper/body corners count.
export const DRIVE_BODY_FOOTPRINT=Object.freeze({halfWidth:1.04,front:3.255,rear:2.57});
const {halfWidth:HW,front:FRONT,rear:REAR}=DRIVE_BODY_FOOTPRINT;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dot=(a,b)=>a.x*b.x+a.z*b.z;
export function driveBodyCorners(p){const c=Math.cos(p.heading||0),n=Math.sin(p.heading||0);return[[-HW,-FRONT],[HW,-FRONT],[HW,REAR],[-HW,REAR]].map(([x,z])=>({x:p.x+c*x-n*z,z:p.z+n*x+c*z}));}
function contact(p,solid){
 if(solid.solid===false)return null;
 const c=Math.cos(p.heading||0),n=Math.sin(p.heading||0),body=driveBodyCorners(p);
 if(solid.kind==='circle'||solid.type==='circle'||Number.isFinite(solid.radius)){
  const dx=solid.x-p.x,dz=solid.z-p.z,x=dx*c+dz*n,z=-dx*n+dz*c,r=solid.radius??.15;
  const qx=clamp(x,-HW,HW),qz=clamp(z,-FRONT,REAR),vx=qx-x,vz=qz-z,d=Math.hypot(vx,vz);
  if(d>=r)return null;let nx,nz,depth;
  if(d>1e-9){nx=vx/d;nz=vz/d;depth=r-d;}
  else{const faces=[{gap:x+HW,x:1,z:0},{gap:HW-x,x:-1,z:0},{gap:z+FRONT,x:0,z:1},{gap:REAR-z,x:0,z:-1}].sort((a,b)=>a.gap-b.gap),f=faces[0];nx=f.x;nz=f.z;depth=r+f.gap;}
  return{id:solid.id??'visible-solid',normal:{x:nx*c-nz*n,z:nx*n+nz*c},depth};
 }
 const minX=solid.minX??solid.x-(solid.halfX??solid.halfWidth??.2),maxX=solid.maxX??solid.x+(solid.halfX??solid.halfWidth??.2),minZ=solid.minZ??solid.z-(solid.halfZ??solid.halfLength??.2),maxZ=solid.maxZ??solid.z+(solid.halfZ??solid.halfLength??.2);
 const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,hx=(maxX-minX)/2,hz=(maxZ-minZ)/2,cs=Math.cos(solid.yaw||0),sn=Math.sin(solid.yaw||0),corners=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([x,z])=>({x:cx+x*cs-z*sn,z:cz+x*sn+z*cs}));
 let depth=Infinity,normal=null;
 for(const axis of[{x:c,z:n},{x:-n,z:c},{x:cs,z:sn},{x:-sn,z:cs}]){
  const a=body.map(v=>dot(v,axis)),b=corners.map(v=>dot(v,axis)),amin=Math.min(...a),amax=Math.max(...a),bmin=Math.min(...b),bmax=Math.max(...b);
  if(amax<=bmin+1e-8||bmax<=amin+1e-8)return null;
  const positive=bmax-amin,negative=amax-bmin,d=Math.min(positive,negative);if(d<depth){depth=d;const sign=positive<negative?1:-1;normal={x:axis.x*sign,z:axis.z*sign};}
 }
 return{id:solid.id??'visible-solid',normal,depth};
}
export function vehiclePoseIntersects(pose,solid){return!!contact(pose,solid);}
export function resolveVehicleContacts(s,colliders=[]){
 const end={x:s.x,z:s.z,heading:s.heading},start={x:Number.isFinite(s.contactStartX)?s.contactStartX:s.x,z:Number.isFinite(s.contactStartZ)?s.contactStartZ:s.z,heading:Number.isFinite(s.contactStartHeading)?s.contactStartHeading:s.heading};
 const d=Math.hypot(end.x-start.x,end.z-start.z),angle=end.heading-start.heading;
 const count=Math.max(1,Math.ceil(Math.max(d/.2,Math.abs(angle)/.05))),at=t=>({x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t,heading:start.heading+angle*t});
 const firstContact=pose=>{for(const solid of colliders){const hit=contact(pose,solid);if(hit)return{...hit,solid};}return null;};
 let collision=null,time=1;
 for(let i=0;i<=count&&!collision;i++){const p=at(i/count);for(const solid of colliders){const q=contact(p,solid);if(q){collision={...q,solid};time=i/count;break;}}}
 if(!collision){s.contactStartX=s.x;s.contactStartZ=s.z;s.contactStartHeading=s.heading;return{collided:false,contacts:[]};}
 let lo=Math.max(0,time-1/count),hi=time;
 // A curved perimeter is a sequence of overlapping physical rail pieces.
 // Bisect against the whole set: another piece may be reached earlier within
 // the same .2m coarse sweep interval than the first piece in catalog order.
 if(time>0){for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(firstContact(at(mid)))hi=mid;else lo=mid;}collision=firstContact(at(hi))||collision;}
 const safe=at(lo),n=collision.normal;
 if(time===0){for(let i=0;i<12;i++){const q=firstContact(safe);if(!q)break;safe.x+=q.normal.x*(q.depth+.002);safe.z+=q.normal.z*(q.depth+.002);}}
 else{const inset={...safe,x:safe.x+n.x*.001,z:safe.z+n.z*.001};if(!firstContact(inset)){safe.x=inset.x;safe.z=inset.z;}}
 const oldDirection=Math.sign(s.speed),oldN=Math.sin(s.heading),oldC=Math.cos(s.heading);let vx=oldN*s.speed+oldC*s.lateralSpeed,vz=-oldC*s.speed+oldN*s.lateralSpeed;
 const inward=vx*n.x+vz*n.z,impact=Math.max(0,-inward);
 if(inward<0){vx-=1.035*inward*n.x;vz-=1.035*inward*n.z;}
 // Retain the tangential remainder only when it is clear of every supplied solid.
 const rx=end.x-safe.x,rz=end.z-safe.z,normalRemainder=Math.min(0,rx*n.x+rz*n.z),slide={x:safe.x+(rx-normalRemainder*n.x)*.85,z:safe.z+(rz-normalRemainder*n.z)*.85,heading:safe.heading};
 const position=colliders.some(c=>contact(slide,c))?safe:slide;
 const untravelled=Math.max(0,d-Math.hypot(position.x-start.x,position.z-start.z));
 s.odometer=Math.max(0,s.odometer-untravelled);s.wheelRotation-=oldDirection*untravelled/.34;
 s.x=position.x;s.z=position.z;s.heading=position.heading;
 const sn=Math.sin(s.heading),cs=Math.cos(s.heading);s.speed=vx*sn-vz*cs;s.lateralSpeed=(vx*cs+vz*sn)*.9;s.yawRate*=.35;
 applyRoadImpulse(s,Math.min(.12,impact*.012));const prior=s.lastContact,group=collision.solid.contactGroup||collision.id;
 s.lastContact={id:collision.id,group,impactSpeed:impact,normal:n,t:s.programTime};
 // Log a contact episode, not every physics tick spent leaning on one edge.
 if(!prior||prior.group!==group||s.programTime-prior.t>.5)s.events?.push({t:s.programTime,distance:s.furthest,type:'vehicle-contact',id:collision.id,impactSpeed:impact});
 s.contactStartX=s.x;s.contactStartZ=s.z;s.contactStartHeading=s.heading;
 return{collided:true,contacts:[s.lastContact]};
}
