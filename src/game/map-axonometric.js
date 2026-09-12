// One projection for architectural ink, room selection, pan, and keyboard
// navigation. Coordinates are canonical map XY + real elevation in metres;
// the extra floor separation is presentation only and is never written back.
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function mapQuarterRotation(value=0){return((Math.round(finite(value))%4)+4)%4;}
export function pointInMapPolygon(point,polygon){
 if(!point||!Array.isArray(polygon)||polygon.length<3)return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i],cross=(point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x);
  if(Math.abs(cross)<1e-8&&point.x>=Math.min(a.x,b.x)-1e-8&&point.x<=Math.max(a.x,b.x)+1e-8&&point.y>=Math.min(a.y,b.y)-1e-8&&point.y<=Math.max(a.y,b.y)+1e-8)return true;
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
export function mapPolygonBounds(points=[]){
 if(!points.length)return{x:0,y:0,w:0,h:0};
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
 return{x:minX,y:minY,w:maxX-minX,h:maxY-minY};
}
const corners=b=>[{x:b.minX,y:b.minY},{x:b.maxX,y:b.minY},{x:b.maxX,y:b.maxY},{x:b.minX,y:b.maxY}];
function levelBounds(level){
 if(level.bounds&&['minX','minY','maxX','maxY'].every(k=>Number.isFinite(level.bounds[k])))return level.bounds;
 const p=(level.surfaces||[]).flatMap(s=>[{x:s.x,y:s.y},{x:s.x+s.w,y:s.y+s.h}]),b=mapPolygonBounds(p);
 return{minX:b.x,minY:b.y,maxX:b.x+b.w,maxY:b.y+b.h};
}
export function createMapAxonometricProjection({architecture,nav={},viewport={x:0,y:0,w:1,h:1},cellAspect=.5,activeFloorId=nav.floorId,floors=null,anchors=[]}={}){
 const catalog=(floors||architecture?.floors||[]).slice().sort((a,b)=>finite(a.order)-finite(b.order));
 // model.floors is the information authority: issued structural floors remain
 // visible even before entry. Discovery is a room-status annotation, not a
 // second presentation permission gate.
 const allLevels=architecture?.levels||catalog.filter(f=>f.bounds).map(f=>({id:f.id,floorId:f.id,height:finite(f.height),bounds:f.bounds,surfaces:[]}));
 const permitted=catalog.filter(f=>f.hidden!==true).map(f=>f.id);
 const available=catalog.length?permitted:[...new Set([...allLevels.map(l=>l.floorId),...anchors.map(a=>a.floorId)].filter(Boolean))];
 const active=available.includes(activeFloorId)?activeFloorId:available[0]||null;
 const mode=nav.viewMode==='floor'||nav.viewMode==='focus'?'floor':'stack';
 const visibleFloorIds=mode==='floor'?[active].filter(Boolean):available;
 const levels=allLevels.filter(l=>visibleFloorIds.includes(l.floorId)&&l.hidden!==true),horizontal=finite(architecture?.units?.horizontalMetresPerUnit,1)||1;
 const worldBounds=architecture?.buildingBounds||architecture?.bounds||(()=>{
  const p=[...allLevels.flatMap(l=>corners(levelBounds(l))),...anchors],b=mapPolygonBounds(p);return{minX:b.x,minY:b.y,maxX:b.x+b.w,maxY:b.y+b.h};
 })();
 const origin={x:(finite(worldBounds.minX)+finite(worldBounds.maxX))/2,y:(finite(worldBounds.minY)+finite(worldBounds.maxY))/2};
 const rotation=mapQuarterRotation(nav.rotation),angle=-Math.PI/4+rotation*Math.PI/2,cos=Math.cos(angle),sin=Math.sin(angle);
 const aspect=clamp(finite(cellAspect,.5),.1,4),zoom=clamp(finite(nav.zoom,1),.35,4),panX=finite(nav.panX),panY=finite(nav.panY);
 const span=Math.max(finite(worldBounds.maxX)-finite(worldBounds.minX),finite(worldBounds.maxY)-finite(worldBounds.minY))*horizontal;
 const separation=mode==='stack'?clamp(finite(nav.separation,clamp(span*.09,6,14)),0,32):0;
 const floorOffsets=Object.fromEntries(available.map((id,index)=>[id,index*separation]));
 const floorOffset=floorId=>floorOffsets[floorId]||0;
 function raw(point={}){
  const x=(finite(point.x)-origin.x)*horizontal,y=(finite(point.y)-origin.y)*horizontal;
  return{x:x*cos-y*sin,y:(x*sin+y*cos)*.48-finite(point.height)-floorOffset(point.floorId)};
 }
 const buildingLevels=levels.filter(level=>!level.exterior),fitLevels=buildingLevels.length?buildingLevels:levels;
 const extents=fitLevels.flatMap(level=>corners(levelBounds(level)).flatMap(p=>[
  raw({...p,height:finite(level.height)-.24,floorId:level.floorId}),raw({...p,height:finite(level.height)+1.2,floorId:level.floorId}),
 ]));
 // Without a physical capture, fit only the issued bounds and permitted
 // anchors. This is a transform, not substitute room or floor geometry.
 if(!architecture?.levels?.length)for(const anchor of anchors)if(visibleFloorIds.includes(anchor.floorId))extents.push(raw(anchor));
 const fitted=mapPolygonBounds(extents),paddingX=Math.min(3,Math.max(.5,viewport.w*.045)),paddingY=Math.min(1.5,Math.max(.3,viewport.h*.045));
 const scale=Math.max(.00001,Math.min(Math.max(.01,viewport.w-paddingX*2)/Math.max(1,fitted.w),Math.max(.01,viewport.h-paddingY*2)/(Math.max(1,fitted.h)*aspect)))*zoom;
 const center={x:viewport.x+viewport.w/2+panX,y:viewport.y+viewport.h/2+panY},rawCenter={x:fitted.x+fitted.w/2,y:fitted.y+fitted.h/2};
 const point=p=>{const r=raw(p);return{x:center.x+(r.x-rawCenter.x)*scale,y:center.y+(r.y-rawCenter.y)*scale*aspect};};
 const inverse=(p,{height=0,floorId=active}={})=>{
  const xx=(p.x-center.x)/scale+rawCenter.x,yy=((p.y-center.y)/(scale*aspect)+rawCenter.y+finite(height)+floorOffset(floorId))/.48;
  return{x:(xx*cos+yy*sin)/horizontal+origin.x,y:(-xx*sin+yy*cos)/horizontal+origin.y,height,floorId};
 };
 const vector=({x=0,y=0,height=0}={})=>({x:(x*cos-y*sin)*horizontal*scale,y:((x*sin+y*cos)*horizontal*.48-height)*scale*aspect});
 return{point,inverse,vector,raw,floorOffset,visibleFloorIds,levels,activeFloorId:active,viewMode:mode,rotation,separation,zoom,scale,cellAspect:aspect,viewport:{...viewport},worldBounds,projectedBounds:fitted,origin};
}

/** Preserve authored heights whenever supplied; otherwise resolve an anchor
 * against its actual occupied surface rather than flattening a tower bucket.
 */
export function mapArchitecturalHeight(architecture,anchor={},floorId=anchor.floorId){
 if(Number.isFinite(anchor.height))return anchor.height;
 const p=anchor.position||anchor,levels=(architecture?.levels||[]).filter(level=>level.floorId===floorId);
 const owned=levels.filter(level=>(anchor.id&&level.spaceId===anchor.id)||(anchor.roomId&&level.spaceId===anchor.roomId));
 const contains=levels.filter(level=>(level.surfaces||[]).some(s=>p.x>=s.x&&p.x<=s.x+s.w&&p.y>=s.y&&p.y<=s.y+s.h));
 return finite((owned[0]||contains[0]||levels[0])?.height);
}
