// A cosmetic veneer clipped to the existing Source III support. It neither
// adds collision nor closes the case's genuinely missing crescent/inner floor.
import {SOURCE_CONTINUATION,continuationSurfaces,continuationSectorSteps} from '../data/source-continuation.js';
import {SOURCE_REST_SEATS} from '../game/source-rest-seat.js';

const seat=SOURCE_REST_SEATS.find(item=>item.phase==='catch'),center=SOURCE_CONTINUATION.catch.center;
const yaw=Math.atan2(center.x-seat.x,seat.z-center.z),c=Math.cos(yaw),s=Math.sin(yaw);
export const SOURCE_REST_HARPSICHORD_BOARD_FRAME=Object.freeze({
  origin:Object.freeze({x:seat.x,y:seat.feet,z:seat.z}),yaw,level:seat.level,
  right:Object.freeze([c,0,s]),up:Object.freeze([0,1,0]),back:Object.freeze([-s,0,c]),
});
// Wide near keyboard end, a straight spine and an asymmetrical bent cheek
// narrowing towards the far end. Clipping, rather than this ideal outline,
// determines where there is actually enough old floor to receive the veneer.
export const SOURCE_REST_HARPSICHORD_BOARD_OUTLINE=Object.freeze([
  [-2.8,1.35],[-2.8,-7.4],[-1.5,-7.4],[.4,-6.35],[2.25,-3.25],[2.95,-.7],[3,1.35],
].map(point=>Object.freeze(point)));
const bottom=.006,top=.020,edgeInset=.0005,epsilon=1e-10;
export function sourceRestHarpsichordBoardLocalToWorld({x=0,y=0,z=0}={}){
  return{x:seat.x+c*x-s*z,y:seat.feet+y,z:seat.z+s*x+c*z};
}
export function sourceRestHarpsichordBoardWorldToLocal({x=seat.x,y=seat.feet,z=seat.z}={}){
  const dx=x-seat.x,dz=z-seat.z;return{x:c*dx+s*dz,y:y-seat.feet,z:-s*dx+c*dz};
}
export function sourceRestHarpsichordBoardSupports(){
  return continuationSurfaces({chartId:seat.chartId}).filter(surface=>surface.phase==='catch'&&surface.level===seat.level
    &&Math.abs(surface.y-seat.feet)<1e-8&&['rect','sector'].includes(surface.kind));
}
const area=polygon=>polygon.reduce((sum,a,index)=>{const b=polygon[(index+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0)*.5;
const ccw=polygon=>area(polygon)<0?[...polygon].reverse():polygon;
const valid=polygon=>polygon.length>=3&&Math.abs(area(polygon))>1e-9;
function clean(polygon){
  const result=[];
  for(const p of polygon)if(!result.length||Math.hypot(p[0]-result.at(-1)[0],p[1]-result.at(-1)[1])>epsilon)result.push(p);
  if(result.length>1&&Math.hypot(result[0][0]-result.at(-1)[0],result[0][1]-result.at(-1)[1])<=epsilon)result.pop();
  return result;
}
function halfPlane(polygon,a,b,inside=true,inset=0){
  if(!polygon.length)return[];
  const dx=b[0]-a[0],dz=b[1]-a[1],sign=inside?1:-1,
    distance=p=>sign*(dx*(p[1]-a[1])-dz*(p[0]-a[0]))-inset*Math.hypot(dx,dz),result=[];
  let previous=polygon.at(-1),before=distance(previous);
  for(const current of polygon){
    const after=distance(current),was=before>=0,is=after>=0;
    if(was!==is){const t=before/(before-after);result.push([previous[0]+(current[0]-previous[0])*t,previous[1]+(current[1]-previous[1])*t]);}
    if(is)result.push(current);previous=current;before=after;
  }
  return clean(result);
}
function intersect(polygon,boundary,inset=0){
  let result=polygon;
  for(let k=0;k<boundary.length&&result.length;k++)result=halfPlane(result,boundary[k],boundary[(k+1)%boundary.length],true,inset);
  return result;
}
// Subtract a convex support already covered by an earlier panel. Each emitted
// fragment is convex and disjoint, so there is no coplanar overdraw where the
// old refuge pad, return arm and crescent overlap one another.
function subtract(polygon,boundary){
  if(!valid(intersect(polygon,boundary)))return[polygon];
  const result=[];let remaining=polygon;
  for(let k=0;k<boundary.length&&valid(remaining);k++){
    const a=boundary[k],b=boundary[(k+1)%boundary.length],outside=halfPlane(remaining,a,b,false);
    if(valid(outside))result.push(outside);remaining=halfPlane(remaining,a,b,true);
  }
  return result;
}
const local=point=>{const p=sourceRestHarpsichordBoardWorldToLocal({x:point[0],z:point[1]});return[p.x,p.z];};
function supportPolygons(surface){
  if(surface.kind==='rect')return[[[surface.minX,surface.minZ],[surface.maxX,surface.minZ],[surface.maxX,surface.maxZ],[surface.minX,surface.maxZ]].map(local)];
  // These are the actual inscribed straight-edged sector cells used by
  // continuationSurfaceContains, not a circle inferred from endpoint checks.
  const count=continuationSectorSteps(surface),delta=(surface.endAngle-surface.startAngle)/count,
    point=(radius,angle)=>[surface.center.x+Math.cos(angle)*radius,surface.center.z+Math.sin(angle)*radius];
  return Array.from({length:count},(_,k)=>{
    const a=surface.startAngle+delta*k,b=a+delta;
    return[point(surface.innerRadius,a),point(surface.outerRadius,a),point(surface.outerRadius,b),point(surface.innerRadius,b)].map(local);
  });
}
export function sourceRestHarpsichordBoardGeometry(){
  const p=[],i=[],sections=[],covered=[],outline=ccw(SOURCE_REST_HARPSICHORD_BOARD_OUTLINE);
  const supports=sourceRestHarpsichordBoardSupports().sort((a,b)=>(a.kind==='sector')-(b.kind==='sector'));
  for(const surface of supports)for(const raw of supportPolygons(surface)){
    const cell=ccw(raw),inset=intersect(cell,cell,edgeInset),clipped=intersect(inset,outline);
    if(!valid(clipped))continue;
    let pieces=[clipped];for(const previous of covered)pieces=pieces.flatMap(piece=>subtract(piece,previous));
    covered.push(inset);
    for(const polygon of pieces){
      if(!valid(polygon))continue;
      const offset=p.length/3,n=polygon.length,firstTriangle=i.length/3;
      for(const y of[bottom,top])for(const[x,z]of polygon)p.push(x,y,z);
      for(let k=1;k<n-1;k++)i.push(offset,offset+k,offset+k+1,offset+n,offset+n+k+1,offset+n+k);
      for(let k=0;k<n;k++){const a=offset+k,b=offset+(k+1)%n;i.push(a,b+n,b,a,a+n,b+n);}
      sections.push({supportId:surface.id,firstTriangle,triangleCount:i.length/3-firstTriangle,polygon:polygon.map(point=>[...point])});
    }
  }
  return{p,i,material:'piano-wood',base:[.61,.43,.25,1],roughness:.86,
    cosmeticOnly:true,structural:false,walkable:false,frame:SOURCE_REST_HARPSICHORD_BOARD_FRAME,
    outline:SOURCE_REST_HARPSICHORD_BOARD_OUTLINE,sections,supportIds:[...new Set(sections.map(section=>section.supportId))],
    layer:{bottom,top},rosette:'none: no false opening through the supported floor'};
}
