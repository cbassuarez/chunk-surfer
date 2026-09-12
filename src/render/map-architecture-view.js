// Architectural cutaway from captured physical cells. No authored replacement
// floor plans, room rectangles, pathfinding, inventory writes, or hidden actors.
import {uiDraw,uiCellMetrics} from './ui.js';
import {createMapAxonometricProjection,mapArchitecturalHeight,mapPolygonBounds} from '../game/map-axonometric.js';
import {headingVector} from '../game/map-projection.js';
import {drawElectronicText,measureElectronicText} from './electronic-text.js';

const geometryCache=new WeakMap();
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rectCorners=s=>[{x:s.x,y:s.y},{x:s.x+s.w,y:s.y},{x:s.x+s.w,y:s.y+s.h},{x:s.x,y:s.y+s.h}];
const inside=(p,r,pad=0)=>p.x>=r.x+pad&&p.y>=r.y+pad&&p.x<=r.x+r.w-pad&&p.y<=r.y+r.h-pad;
const positioned=value=>Number.isFinite(value?.position?.x)&&Number.isFinite(value?.position?.y);
const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,w:Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),h:Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y)};};
function cachedGeometry(architecture,projection){
 const key=JSON.stringify([projection.visibleFloorIds,projection.rotation,projection.zoom,projection.separation,projection.viewport,projection.cellAspect,projection.point({x:0,y:0})]);
 let cache=geometryCache.get(architecture);if(!cache){cache=new Map();geometryCache.set(architecture,cache);}if(cache.has(key))return cache.get(key);
 const levels=projection.levels.map(level=>{
  const height=finite(level.height),floorId=level.floorId;
  const project=(p,h=height)=>projection.point({...p,height:h,floorId});
  const surfaces=(level.surfaces||[]).filter(s=>s.w>0&&s.h>0).map(s=>({...s,polygon:rectCorners(s).map(p=>project(p,finite(s.height,height)))}));
  const boundaries=(level.boundaries||[]).map(edge=>{
   const base=finite(edge.height,height),cut=Math.min(1.1,Math.max(0,finite(edge.wallHeight,1.1))),a={x:edge.x0,y:edge.y0},b={x:edge.x1,y:edge.y1};
   // The shallow lower return is a cutaway drafting convention, not a claim
   // that the captured building has a measured 240 mm structural slab.
   return{edge,slab:[project(a,base-.24),project(b,base-.24),project(b,base),project(a,base)],
    wall:[project(a,base),project(b,base),project(b,base+cut),project(a,base+cut)],top:[project(a,base+cut),project(b,base+cut)],depth:projection.raw({...a,height:base}).y};
  }).sort((a,b)=>a.depth-b.depth);
  return{level,surfaces,boundaries,height,floorId};
 }).sort((a,b)=>a.height+projection.floorOffset(a.floorId)-b.height-projection.floorOffset(b.floorId));
 const result={levels};while(cache.size>=3)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
}
function labelFor(space){return space.unknown?'???':String(space.shortLabel||space.label||'').toUpperCase();}

export function drawArchitecturalMap({model,nav={},viewport,now=0}={}){
 const metrics=uiCellMetrics(),aspect=metrics.cellW/metrics.cellH,architecture=model?.architecture;
 if(!viewport)return{hits:[],projectedPoints:{},projection:null,floors:[],geometryAvailable:false};
 const policy=model?.policy||{},waypoint=policy.showWaypoint!==false&&positioned(model?.waypoint)?model.waypoint:null;
 const anchors=(model?.spaces||[]).filter(s=>s.selectable!==false&&s.position).map(s=>({...s.position,height:mapArchitecturalHeight(architecture,s),floorId:s.floorId}));
 if(model?.player?.resolved&&model.player.position&&policy.showExactPlayer!==false)anchors.push({...model.player.position,height:mapArchitecturalHeight(architecture,model.player),floorId:model.player.floorId});
 if(waypoint)anchors.push({...waypoint.position,height:mapArchitecturalHeight(architecture,waypoint),floorId:waypoint.floorId});
 const projection=createMapAxonometricProjection({architecture,nav,viewport,cellAspect:aspect,floors:model?.floors,anchors,activeFloorId:nav.floorId||model?.player?.floorId});
 const routePoints=model?.route?.points||[];
 const result={hits:[],projectedPoints:{},projection,floors:projection.visibleFloorIds,geometryAvailable:!!architecture?.levels?.length,
  routeElevationResolved:routePoints.length>1&&routePoints.every(point=>Number.isFinite(point.height))};
 if(policy.showMap===false)return result;
 const topology=policy.showMapTopology!==false,active=projection.activeFloorId;
 const selectedId=nav.selectedByFloor?.[active],spaces=(model?.spaces||[]).filter(s=>s.floorId===active&&s.position);
 const spaceById=new Map((model?.spaces||[]).flatMap(s=>[[s.id,s],...(s.roomId?[[s.roomId,s]]:[])]));
 const pointFor=anchor=>projection.point({...anchor.position,height:mapArchitecturalHeight(architecture,anchor),floorId:anchor.floorId});
 // A prop/door/story target is not necessarily one of the selectable rooms.
 // Deduplicate only an identical marked anchor, never a different point that
 // merely shares a room name (including deliberately corrupted guidance).
 const waypointSpace=waypoint?spaces.find(space=>space.floorId===waypoint.floorId&&
  (space.id===waypoint.spaceId||(waypoint.kind==='room'&&waypoint.roomId&&space.roomId===waypoint.roomId))&&
  Math.hypot(space.position.x-waypoint.position.x,space.position.y-waypoint.position.y)<1e-6&&
  Math.abs(mapArchitecturalHeight(architecture,space)-mapArchitecturalHeight(architecture,waypoint))<1e-6):null;
 if(waypoint&&projection.visibleFloorIds.includes(waypoint.floorId)){
  const raw=pointFor(waypoint),point={x:clamp(raw.x,viewport.x+.75,viewport.x+viewport.w-.75),y:clamp(raw.y,viewport.y+.5,viewport.y+viewport.h-.5)};
  result.waypoint={point,rawPoint:raw,floorId:waypoint.floorId,offPage:!inside(raw,viewport,.75),spaceId:waypointSpace?.id||null};
 }
 const geometry=architecture?cachedGeometry(architecture,projection):{levels:[]},areas=new Map();
 if(topology)for(const level of geometry.levels)if(level.floorId===active&&!level.level.exterior)for(const surface of level.surfaces){
  // Only the capture's unambiguous connected-component attribution grants an
  // area hit. A broad ownership span is not itself a named room boundary.
  const space=spaceById.get(surface.mapSpaceId);if(!space||space.floorId!==active||space.selectable===false)continue;
  if(!areas.has(space.id))areas.set(space.id,[]);areas.get(space.id).push(surface.polygon);
 }
 for(const space of spaces){
  if(space.selectable===false)continue;
  const p=pointFor(space);result.projectedPoints[space.id]=p;
  const polygons=areas.get(space.id),region=polygons?intersect(mapPolygonBounds(polygons.flat()),viewport):intersect({x:p.x-1.2,y:p.y-.65,w:2.4,h:1.3},viewport);
  if(region.w>0&&region.h>0&&(polygons||inside(p,viewport)))result.hits.push({id:`bag:space:${space.id}`,kind:'map-space',action:'select-space',payload:{spaceId:space.id},...region,
   ...(polygons?{polygons}:{}),point:p,enabled:true});
 }
 uiDraw(({ctx,dpr,cellW,cellH})=>{
  const px=p=>({x:p.x*cellW*dpr,y:p.y*cellH*dpr});
  function path(points,close=true){ctx.beginPath();points.forEach((p,i)=>{const q=px(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});if(close)ctx.closePath();}
  function polygon(points,fill,stroke=null,width=.65,alpha=1){if(!points.length)return;ctx.save();ctx.globalAlpha*=alpha;path(points);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width*dpr;ctx.stroke();}ctx.restore();}
  function line(points,color,width=.8,alpha=1,dash=[]){if(points.length<2)return;ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=width*dpr;ctx.setLineDash(dash.map(n=>n*dpr));path(points,false);ctx.stroke();ctx.restore();}
  function text(value,p,color='#b9c5b4',size=11,alpha=1,align='left'){
   const q=px(p);ctx.save();ctx.globalAlpha*=alpha;
   drawElectronicText(ctx,String(value),q.x,q.y,{fontSize:size*dpr,color,mode:'lcd',align,baseline:'middle',alpha:1,dpr});ctx.restore();
  }
  function circle(p,r,color,fill=null,alpha=1){const q=px(p);ctx.save();ctx.globalAlpha*=alpha;ctx.beginPath();ctx.arc(q.x,q.y,r*dpr,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=dpr;ctx.stroke();ctx.restore();}
  function diamond(p,r,color,fill=null,alpha=1){polygon([{x:p.x,y:p.y-r/cellH},{x:p.x+r/cellW,y:p.y},{x:p.x,y:p.y+r/cellH},{x:p.x-r/cellW,y:p.y}],fill,color,.9,alpha);}
  ctx.save();try{
   ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.beginPath();ctx.rect(viewport.x*cellW*dpr,viewport.y*cellH*dpr,viewport.w*cellW*dpr,viewport.h*cellH*dpr);ctx.clip();
   // Quiet registration field, in instrument coordinates—not an invented plan.
   const gridStep=32*dpr;ctx.save();ctx.strokeStyle='#a6bba60c';ctx.lineWidth=.5*dpr;ctx.beginPath();
   for(let x=viewport.x*cellW*dpr+12*dpr;x<(viewport.x+viewport.w)*cellW*dpr;x+=gridStep){ctx.moveTo(x,viewport.y*cellH*dpr);ctx.lineTo(x,(viewport.y+viewport.h)*cellH*dpr);}
   for(let y=viewport.y*cellH*dpr+12*dpr;y<(viewport.y+viewport.h)*cellH*dpr;y+=gridStep){ctx.moveTo(viewport.x*cellW*dpr,y);ctx.lineTo((viewport.x+viewport.w)*cellW*dpr,y);}ctx.stroke();ctx.restore();
   if(topology)for(const layer of geometry.levels){
    // Outdoor pavement is not another building slab. Keep it in the canonical
    // capture for navigation, but do not blanket the instrument with city road.
    if(layer.level.exterior)continue;
    const current=layer.floorId===active,alpha=current?1:.40;
    for(const edge of layer.boundaries)polygon(edge.slab,current?'#27392c':'#26372b','#6d8369',.45,alpha*.82);
    // Merged occupied-cell surfaces fill without rectangle outlines, so room
    // silhouettes and openings come exclusively from the true boundary data.
    for(const s of layer.surfaces)polygon(s.polygon,current?'#273c2d':'#25382c',null,0,alpha*.74);
    for(const edge of layer.boundaries){polygon(edge.wall,current?'#3c5040':'#304237','#809078',.45,alpha*.74);line(edge.top,current?'#cbd2b6':'#8a9c81',current?1.05:.6,alpha);}
   }
   if(topology)for(const stair of architecture?.stairs||[]){
    const points=stair.points||[];if(points.length<2)continue;
    const floorA=stair.fromFloorId||stair.floorId||projection.levels.find(l=>Math.abs(l.height-finite(stair.fromHeight))<.1)?.floorId;
    const floorB=stair.toFloorId||projection.levels.find(l=>Math.abs(l.height-finite(stair.toHeight))<.1)?.floorId||floorA;
    if(!projection.visibleFloorIds.includes(floorA)&&!projection.visibleFloorIds.includes(floorB))continue;
    const projected=points.map((p,i)=>{const t=i/Math.max(1,points.length-1);return projection.point({...p,height:finite(p.height,finite(stair.fromHeight)+(finite(stair.toHeight)-finite(stair.fromHeight))*t)+projection.floorOffset(floorB)*t+projection.floorOffset(floorA)*(1-t),floorId:null});});
    line(projected,'#b1bca0',.9,floorA===active||floorB===active?.65:.22);
    // Unknown-width legacy connectors remain honest centrelines.
    for(let i=0;Number.isFinite(stair.width)&&stair.width>0&&i<points.length-1;i++){
     const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,width=stair.width*.5;
     const t=i/Math.max(1,points.length-1),height=finite(a.height,finite(stair.fromHeight))+projection.floorOffset(floorB)*t+projection.floorOffset(floorA)*(1-t);
     line([projection.point({x:a.x-dy/len*width,y:a.y+dx/len*width,height}),projection.point({x:a.x+dy/len*width,y:a.y-dx/len*width,height})],'#adbc9f',.6,.42);
    }
   }
   if(topology)for(const [id,polygons]of areas){const space=spaceById.get(id),target=policy.showWaypoint!==false&&(space?.waypoint||waypointSpace?.id===id);if(id===selectedId||target)for(const shape of polygons)polygon(shape,target?'#d2b36c':'#a4bc93',id===selectedId?'#e0cd91':null,.9,.12);}
   const occupiedLabels=[];
   // The stack gets one readable group label per issued floor. In floor view,
   // additional genuine elevations may be annotated if there is clear space.
   if(topology&&architecture){
    const groups=new Map();
    for(const layer of geometry.levels)if(!layer.level.exterior&&!layer.level.stair){
     const key=`${layer.floorId}:${layer.height}`,area=layer.surfaces.reduce((sum,s)=>sum+s.w*s.h,0),prior=groups.get(key);
     if(!prior)groups.set(key,{floorId:layer.floorId,height:layer.height,area,points:layer.surfaces.flatMap(s=>s.polygon)});
     else{prior.area+=area;prior.points.push(...layer.surfaces.flatMap(s=>s.polygon));}
    }
    const floorOrder=[...projection.visibleFloorIds].sort((a,b)=>(a===active?-1:0)-(b===active?-1:0));
    for(const floorId of floorOrder){
     const own=[...groups.values()].filter(g=>g.floorId===floorId).sort((a,b)=>b.area-a.area),major=own[0];if(!major)continue;
     const floor=model.floors?.find(f=>f.id===floorId),visible=projection.viewMode==='stack'?[major]:own.filter(g=>g===major||(g.area>=major.area*.12&&g.area>=10));
     for(const group of visible){
      const value=String(floor?.shortLabel||floor?.label||floorId).toUpperCase()+(visible.length>1?` ${group.height.toFixed(1)}m`:'');
      const width=measureElectronicText(value,{fontSize:11*dpr})/(cellW*dpr);
      const bound=mapPolygonBounds(group.points),anchor=group.points.reduce((right,p)=>p.x>right.x?p:right,group.points[0]);if(!anchor)continue;
      const p={x:clamp(bound.x+bound.w+.9,viewport.x+1,viewport.x+viewport.w-width-.65),y:clamp(anchor.y,viewport.y+1,viewport.y+viewport.h-1.6)},rowH=16/cellH;
      let placed=false;
      for(const shift of[0,-1,1,-2,2]){
       const y=p.y+shift*rowH;if(y<viewport.y+.7||y>viewport.y+viewport.h-1.5)continue;
       if(occupiedLabels.some(r=>p.x<r.x+r.w+.6&&p.x+width+.6>r.x&&Math.abs(y-r.y)<rowH))continue;
       p.y=y;placed=true;break;
      }
      if(!placed)continue;
      occupiedLabels.push({...p,w:width});
      line([anchor,{x:p.x-.45,y:p.y},{x:p.x-.25,y:p.y}],'#879a80',.6,.65);
      text(value,p,floorId===active?'#e1d7b3':'#93a58c',11,floorId===active?1:.65);
     }
    }
   }
   if(policy.showRoute&&model.player?.floorId===active){
    // A 2D route is not permission to invent its elevation. In particular,
    // one floor bucket can hold several real Tower/U1 heights. Only adjacent
    // endpoints with explicit height data authorize a drawn 3D segment.
    for(let i=1;i<routePoints.length;i++){
     const a=routePoints[i-1],b=routePoints[i];if(!Number.isFinite(a.height)||!Number.isFinite(b.height))continue;
     line([a,b].map(p=>projection.point({...p,floorId:active})),model.route.status==='ok'?'#afcda1':'#cba47b',1.2,.82,[4,3]);
    }
   }
   const target=result.waypoint;
   if(target&&(!waypointSpace||target.offPage)){
    const p=target.point,color='#dfbd73';diamond(p,5,color,color);
    if(target.offPage){
     const dx=target.rawPoint.x-p.x,dy=target.rawPoint.y-p.y,len=Math.hypot(dx*cellW,dy*cellH)||1;
     line([p,{x:p.x+dx/len*9,y:p.y+dy/len*9}],color,1);
    }
    if(policy.showRoom!==false){
     const floor=model.floors?.find(f=>f.id===target.floorId),suffix=target.floorId===active?'':` · ${floor?.shortLabel||floor?.label||target.floorId}`;
     let value=(target.offPage?'OFF VIEW · ':'')+String(waypoint.label||'TARGET').toUpperCase()+suffix;
     const maxWidth=viewport.w*.65*cellW*dpr;
     while(value.length>3&&measureElectronicText(value,{fontSize:12*dpr})>maxWidth)value=value.slice(0,-2)+'…';
     const width=measureElectronicText(value,{fontSize:12*dpr})/(cellW*dpr);
     const label={x:clamp(p.x+.9,viewport.x+.35,viewport.x+viewport.w-width-.35),y:clamp(p.y-.65,viewport.y+.45,viewport.y+viewport.h-.5)};
     occupiedLabels.push({...label,w:width});text(value,label,color,12);
    }
   }
   const orderedSpaces=[...spaces].sort((a,b)=>(a.id===selectedId?-8:a.waypoint?-4:a.current?-2:0)-(b.id===selectedId?-8:b.waypoint?-4:b.current?-2:0));
   for(const space of orderedSpaces){
    const p=result.projectedPoints[space.id]||pointFor(space);if(!inside(p,viewport,.3))continue;
    const selected=space.id===selectedId,marked=policy.showWaypoint!==false&&(space.waypoint||space.id===waypointSpace?.id),current=space.current,recorded=space.objective?.recorded;
    const color=marked?'#dfbd73':selected?'#e1d2a1':current?'#b9e3bc':recorded?'#91b993':'#a0b497';
    diamond(p,selected?5.5:marked?5:3.8,color,marked?color:selected?'#17291d':null,selected||marked||current?1:.70);
    if(recorded){const q=px(p);ctx.save();ctx.fillStyle=color;ctx.fillRect(q.x-1.2*dpr,q.y-1.2*dpr,2.4*dpr,2.4*dpr);ctx.restore();}
    if(policy.showRoom!==false&&(selected||marked||current||space.unknown||policy.showAllTargetLabels||space.objective)){
     let value=space.unknown?'???':selected?String(space.label||labelFor(space)):labelFor(space);const size=selected?12:11;
     const maxWidth=Math.min(viewport.w*.46,27)*cellW*dpr;
     while(value.length>3&&measureElectronicText(value,{fontSize:size*dpr})>maxWidth)value=value.slice(0,-2)+'…';
     const width=measureElectronicText(value,{fontSize:size*dpr})/(cellW*dpr);
     const lp={x:clamp(p.x+.9,viewport.x+.2,Math.max(viewport.x+.2,viewport.x+viewport.w-width-.3)),y:clamp(p.y-.42,viewport.y+.35,viewport.y+viewport.h-.4)},rowH=(size+4)/cellH;
     for(let tries=0;tries<5&&occupiedLabels.some(r=>lp.x<r.x+r.w&&lp.x+width>r.x&&Math.abs(lp.y-r.y)<rowH);tries++)lp.y+=rowH;
     if(lp.y<viewport.y+viewport.h-.3){occupiedLabels.push({...lp,w:width});text(value,lp,color,size,selected||marked?1:.80);}
    }
   }
   if(model?.player?.resolved&&model.player.floorId===active&&model.player.position&&policy.showExactPlayer!==false){
    const raw=pointFor(model.player),p={x:clamp(raw.x,viewport.x+.6,viewport.x+viewport.w-.6),y:clamp(raw.y,viewport.y+.4,viewport.y+viewport.h-.4)},heading=finite(model.player.heading);
    const offPage=Math.abs(p.x-raw.x)>1e-6||Math.abs(p.y-raw.y)>1e-6;result.player={point:p,rawPoint:raw,offPage};
    if(offPage){
     // This is an edge bearing, not a relocated exact-position body marker.
     const dx=raw.x-p.x,dy=raw.y-p.y,len=Math.hypot(dx*cellW,dy*cellH)||1;
     circle(p,4,'#b9d6b9');line([p,{x:p.x+dx/len*10,y:p.y+dy/len*10}],'#b9d6b9',1);
     const value='YOU · OFF PLAN',width=measureElectronicText(value,{fontSize:11*dpr})/(cellW*dpr);
     text(value,{x:clamp(p.x+.9,viewport.x+.35,viewport.x+viewport.w-width-.35),y:clamp(p.y-.65,viewport.y+.5,viewport.y+viewport.h-.5)},'#b9d6b9',11);
    }else{
     const vector=projection.vector(headingVector(heading)),len=Math.hypot(vector.x*cellW,vector.y*cellH)||1;
     const tip={x:p.x+vector.x/len*9,y:p.y+vector.y/len*9},left={x:p.x-vector.y*cellH/cellW/len*4,y:p.y+vector.x*cellW/cellH/len*4},right={x:p.x+vector.y*cellH/cellW/len*4,y:p.y-vector.x*cellW/cellH/len*4};
     polygon([tip,left,right],'#c7eccb','#ecf4d8',.65);circle(p,7,'#8fc29a',null,.55);
    }
   }
   if(topology)for(const door of model?.doors||[])if(door.floorId===active&&door.position){
    const p=pointFor(door);if(!inside(p,viewport))continue;const locked=['locked','sealed','blocked'].includes(door.state);
    if(locked){line([{x:p.x-.30,y:p.y-.15},{x:p.x+.30,y:p.y+.15}],'#d2ad7b',.9);line([{x:p.x-.30,y:p.y+.15},{x:p.x+.30,y:p.y-.15}],'#d2ad7b',.9);}
   }
   for(const equipment of model?.equipmentMarkers||[])if(equipment.floorId===active&&equipment.position){const p=pointFor(equipment);if(inside(p,viewport))circle(p,3,'#b5c8bd','#263c30');}
   // Never substitute acoustic point telemetry for direct physical visibility.
   const hush=model?.hush;
   if(hush?.active&&hush.visible===true&&hush.floorId===active&&hush.position){const p=pointFor(hush);if(inside(p,viewport)){circle(p,4,'#d6b8a2');line([{x:p.x-.45,y:p.y},{x:p.x+.45,y:p.y}],'#d6b8a2',1);}}
   const contact=(model?.contacts||[]).filter(c=>c?.state!=='none'&&c?.observation?.floorId===active).sort((a,b)=>finite(b.observation.observedAt)-finite(a.observation.observedAt))[0];
   if(contact?.observation?.region?.length){
    const observation=contact.observation,height=mapArchitecturalHeight(architecture,{position:observation.region[0],floorId:active,height:observation.height});
    const points=observation.region.map(p=>projection.point({...p,height,floorId:active}));
    // Region-level sensing remains imprecise. An old observation never
    // becomes an exact hidden-body dot, even if it also contains a position.
    const age=Math.max(0,finite(now)*1000-finite(observation.observedAt));
    line([...points,points[0]],'#bba994',.75,clamp(1-age/12000,.15,.45),[2,4]);
   }
   // Fixed reference axes rotate with the real plan. The measured bar is
   // derived from metres-per-projection-unit, never decorative ruler ticks.
   const axisLabelHalf=measureElectronicText('N',{fontSize:11*dpr})/(2*dpr);
   const axisOrigin={x:viewport.x+(22+axisLabelHalf)/cellW,y:viewport.y+1.7},north=projection.vector({x:0,y:-1}),east=projection.vector({x:1,y:0});
   for(const [name,v]of[['N',north],['E',east]]){
    const len=Math.hypot(v.x*cellW,v.y*cellH)||1,end={x:axisOrigin.x+v.x/len*18,y:axisOrigin.y+v.y/len*18};
    line([axisOrigin,end],name==='N'?'#d0d6b9':'#7f947e',1,.85);text(name,{x:end.x,y:end.y-.5},name==='N'?'#d0d6b9':'#7f947e',11,.9,'center');
   }
   if(topology&&architecture&&projection.scale>0){
    const pxPerMetre=projection.scale*cellW,choices=[.1,.2,.5,1,2,5,10,20,50,100],metres=choices.filter(m=>m*pxPerMetre<=80).at(-1)||.1;
    const start={x:viewport.x+1.2,y:viewport.y+viewport.h-.72},end={x:start.x+metres*projection.scale,y:start.y};
    if(end.x<viewport.x+viewport.w-1){line([start,end],'#aaba9c',1,.8);for(const p of[start,end])line([{x:p.x,y:p.y-.16},{x:p.x,y:p.y+.16}],'#aaba9c',.8,.8);text(`${metres} m`,{x:end.x+.6,y:end.y},'#aaba9c',11,.8);}
   }
   if(topology&&!architecture?.levels?.length)text('ARCHITECTURE UNAVAILABLE',{x:viewport.x+viewport.w/2,y:viewport.y+viewport.h/2},'#819381',11,.8,'center');
  }finally{ctx.restore();}
 });
 return result;
}
