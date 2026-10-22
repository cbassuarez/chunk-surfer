// One visible, finite perimeter. Every collider is derived from the exact mesh
// bounds and the same matrix submitted to P3; no steering or position clamp.
import {roadAt,worldAt,roadSurfaceAt} from './road.js';
import {driveBodyCorners,vehiclePoseIntersects} from './vehicle-contacts.js';
export const BOUNDARY_MESH_BOUNDS=Object.freeze({
 cut_guardrail:{min:[-.095,-.1,-1.54],max:[.1359,.95,1.54]},
 drive_retaining_wall:{min:[-.22,0,-.5],max:[.34,1.35,.5]},
});
export const FINITE_ROAD=Object.freeze({start:-32,end:1244,segmentLength:3,normalClearance:1.2641,bayClearance:.91});
const lerp=(a,b,t)=>a+(b-a)*t;
function styleAt(d,side){
 if(d>=145&&d<=465)return{mesh:'cut_guardrail',height:.86};
 if(side<0){if(d<160)return{mesh:'drive_retaining_wall',height:.72};if(d<420)return{mesh:'drive_retaining_wall',height:1.05};if(d>=816&&d<=906)return{mesh:'drive_retaining_wall',height:.55};if(d>=1080)return{mesh:'drive_retaining_wall',height:.65};}
 else{if(d<24||d>=1080)return{mesh:'drive_retaining_wall',height:.65};if(d>=668&&d<=942)return{mesh:'drive_retaining_wall',height:.42};}
 return{mesh:'cut_guardrail',height:1};
}
export function boundaryInnerLateral(d,side){const r=roadAt(d),width=side<0?r.leftWidth:r.rightWidth,clearance=side<0?lerp(r.treatment.boundaryClearance,FINITE_ROAD.bayClearance,r.pullIn):r.treatment.boundaryClearance;return side*(width+clearance);}
function pointAt(d,side,mesh){const b=BOUNDARY_MESH_BOUNDS[mesh],inner=boundaryInnerLateral(d,side);return worldAt(d,inner+side*b.max[0]);}
const transform=(m,v)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
function record(id,mesh,a,b,height,flip,range,group){
 const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,flat=Math.hypot(dx,dz),length=Math.hypot(flat,dy),heading=Math.atan2(dx,-dz),pitch=Math.atan2(dy,flat),c=Math.cos(heading),n=Math.sin(heading),cp=Math.cos(pitch),sp=Math.sin(pitch),f=flip?-1:1,bounds=BOUNDARY_MESH_BOUNDS[mesh],nominal=bounds.max[2]-bounds.min[2],sz=(length+.08)/nominal;
 const m=[c*f,0,n*f,0,-n*sp*height,cp*height,c*sp*height,0,-n*cp*sz*f,-sp*sz*f,c*cp*sz*f,0,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,1];
 const points=[];for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]])points.push(transform(m,[x,y,z]));
 const projected=points.map(p=>({x:(p[0]-m[12])*c+(p[2]-m[14])*n,z:-(p[0]-m[12])*n+(p[2]-m[14])*c})),minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minZ=Math.min(...projected.map(p=>p.z)),maxZ=Math.max(...projected.map(p=>p.z)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
 const collider={id,contactGroup:group,x:m[12]+c*cx-n*cz,z:m[14]+n*cx+c*cz,halfX:(maxX-minX)/2,halfZ:(maxZ-minZ)/2,yaw:heading};
 const matrix=[...m];matrix[12]+=32;matrix[14]+=32;
 return Object.freeze({id,mesh,start:range[0],end:range[1],kind:group,height:bounds.max[1]*height,matrix:Object.freeze(matrix),collider:Object.freeze(collider),localBounds:bounds});
}
const rows=[];
for(const side of[-1,1])for(let start=FINITE_ROAD.start;start<FINITE_ROAD.end;start+=FINITE_ROAD.segmentLength){const end=Math.min(FINITE_ROAD.end,start+FINITE_ROAD.segmentLength),d=(start+end)/2,q=styleAt(d,side);rows.push(record(`route-edge-${side<0?'left':'right'}-${start}`,q.mesh,pointAt(start,side,q.mesh),pointAt(end,side,q.mesh),q.height,side>0,[start,end],`route-edge-${side<0?'left':'right'}`));}
for(const[d,flip,name]of[[FINITE_ROAD.start,true,'departure-return'],[FINITE_ROAD.end,false,'service-court-return']]){
 const left=boundaryInnerLateral(d,-1)-.55,right=boundaryInnerLateral(d,1)+.55;
 rows.push(record(`route-end-${name}`,'drive_retaining_wall',worldAt(d,left),worldAt(d,right),.82,flip,[d-.4,d+.4],`route-end-${name}`));
}
export const ROUTE_BOUNDARIES=Object.freeze(rows);
export function roadBoundaryRecords(from=FINITE_ROAD.start,to=FINITE_ROAD.end){return ROUTE_BOUNDARIES.filter(p=>p.end>=from&&p.start<=to);}
export function roadBoundaryColliders(distance,reach=34){return roadBoundaryRecords(distance-reach,distance+reach).map(p=>p.collider);}
export function roadBoundaryInstances(distance,reach=245){return roadBoundaryRecords(distance-reach,distance+reach).map(p=>({id:p.id,mesh:p.mesh,matrix:p.matrix,x:p.matrix[12],y:p.matrix[13],z:p.matrix[14],structural:true,skyExposed:true,sourceStructure:'drive-boundary'}));}
// This answers containment only; callers own any explicit legacy-save recovery.
// Legal shoulders, the entire bay and arbitrary yaw remain valid if the actual
// body clears the visible perimeter. It is deliberately not a roadOffset clamp.
export function containsDrivePose(pose){
 if(!pose||![pose.x,pose.z,pose.heading].every(Number.isFinite))return false;
 for(const p of driveBodyCorners(pose)){const r=roadSurfaceAt(p.x,p.z);if(r.distance<FINITE_ROAD.start-.05||r.distance>FINITE_ROAD.end+.05||r.offset<boundaryInnerLateral(r.distance,-1)-.02||r.offset>boundaryInnerLateral(r.distance,1)+.02)return false;}
 const distance=roadSurfaceAt(pose.x,pose.z).distance;
 return!roadBoundaryColliders(distance,12).some(solid=>vehiclePoseIntersects(pose,solid));
}
