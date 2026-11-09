// The opening's ordinary road continues while a player listens or thinks.
// Retained opening bends join a quiet unbounded section, without a rebase,
// unseen cliff, copied door or new encounter.
import {openingRoadAt,OPENING_ROAD} from './opening-road.js';
import {ukRoadMarkingMeshAt} from '../../data/uk-road-markings.js';
import {m62Scene,m62DrystoneMesh,m62GritMesh} from './m62-scene.js';
export const PROLOGUE_ROAD=Object.freeze({spawn:OPENING_ROAD.spawn,join:OPENING_ROAD.join,halfWidth:3.25,shoulder:1.25,behind:42,ahead:172});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function prologueRoadAt(distance){
 const d=Number(distance)||0;
 if(d<PROLOGUE_ROAD.join){const r=openingRoadAt(d);return{...r,leftWidth:3.25,rightWidth:3.25,halfWidth:3.25};}
 const u=(d-PROLOGUE_ROAD.join)/280,s=Math.sin(u),c=Math.cos(u),x=10*s*s*s,dx=30*s*s*c/280,ddx=30*(2*s*c*c-s*s*s)/(280*280);
 return{distance:d,x,z:-d,height:0,heading:Math.atan(dx),derivativeX:dx,secondDerivativeX:ddx,curvature:ddx/(1+dx*dx)**1.5,grade:0,pitch:0,halfWidth:3.25,leftWidth:3.25,rightWidth:3.25,shoulderWidth:1.25,longitudinalScale:Math.hypot(1,dx)};
}
export function prologueWorldAt(distance,lateral=0,lift=0){const r=prologueRoadAt(distance),c=Math.cos(r.heading),s=Math.sin(r.heading);return{...r,x:r.x+c*lateral,z:r.z+s*lateral,y:r.height+lift};}
export function prologueRoadSurfaceAt(x,z){
 let d=-z;
 for(let i=0;i<4;i++){const r=prologueRoadAt(d),g=(r.x-x)*r.derivativeX+d+z,dg=1+r.derivativeX*r.derivativeX+(r.x-x)*r.secondDerivativeX;d-=clamp(g/Math.max(.2,dg),-12,12);}
 const r=prologueRoadAt(d),offset=(x-r.x)*Math.cos(r.heading)+(z+r.distance)*Math.sin(r.heading),shoulder=clamp((Math.abs(offset)-r.halfWidth)/.3),grass=clamp((Math.abs(offset)-r.halfWidth-r.shoulderWidth)/.25);
 return{...r,offset,height:-Math.min(Math.abs(offset),r.halfWidth)*.012,roughness:shoulder*.004*Math.sin(d*2.7),grip:.68*(1-shoulder)+.43*shoulder*(1-grass)+.3*grass,rolling:.014+shoulder*.035+grass*.04,kind:grass>.5?'verge':shoulder>.5?'shoulder':'asphalt',unsupported:false};
}
function placed(mesh,id,p,{sx=1,sy=1,sz=1,yaw=0}={}){const a=-p.heading+yaw,c=Math.cos(a),s=Math.sin(a),matrix=[c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,32+p.x,p.y||0,32+p.z,1];return{id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],structural:true,skyExposed:true,sourceStructure:'opening-continuous-road'};}
export function prologueRoadScene({distance,eye,time=0}){
 const props=[],start=Math.floor((distance-PROLOGUE_ROAD.behind)/2)*2,end=distance+PROLOGUE_ROAD.ahead;
 for(let d=start;d<end;d+=2){const r=prologueRoadAt(d),sz=2.08*r.longitudinalScale;
  props.push(placed('drive_plain_paving','prologue-asphalt-'+d,prologueWorldAt(d),{sz}),placed(ukRoadMarkingMeshAt(d),'prologue-marking-'+d,prologueWorldAt(d,0,.002),{sz}));
  for(const side of[-1,1])props.push(placed('drive_verge',`prologue-verge-${side}-${d}`,prologueWorldAt(d,side*3.875),{sx:1.25/1.6,sz:2.10*r.longitudinalScale}));
 }
 for(let d=Math.floor((distance-30)/3)*3;d<distance+140;d+=3)for(const side of[-1,1]){
  if(Math.sin(d/76+side)<-.48)continue;
  props.push(placed(m62DrystoneMesh(d,side),`prologue-wall-${side}-${d}`,prologueWorldAt(d,side*4.76),{sy:1.1,sz:3.16/3.08,yaw:side>0?Math.PI:0}));
 }
 for(let d=Math.floor((distance-40)/47)*47;d<distance+155;d+=47)for(const side of[-1,1])props.push(placed('drive_reflector',`prologue-reflector-${side}-${d}`,prologueWorldAt(d,side*4.5),{yaw:side<0?Math.PI:0}));
 for(let d=Math.floor((distance-35)/69)*69;d<distance+165;d+=69){const side=Math.sin(d*2.71)>0?1:-1;props.push(placed('drive_tree','prologue-tree-'+d,prologueWorldAt(d,side*11),{sx:1.05,sy:1.2,sz:1.1,yaw:d*.17}));if(side>0)props.push(placed(m62GritMesh(d),'prologue-rock-'+d,prologueWorldAt(d,7),{yaw:Math.PI}));}
 const land=m62Scene({distance,eye,time});props.push(...land.props);
 return{props,lamps:land.lamps,land:land.land};
}
