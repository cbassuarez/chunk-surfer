import {CELL} from '../data/floorplan/legend.js';
import {EXTERIOR_MAP_DEFINITION,EXTERIOR_MAP_FLOOR,EXTERIOR_MAP_ZONES,EXTERIOR_MAP_STREETS,EXTERIOR_MAP_STREET_LABELS,exteriorMapFootprints,exteriorMapTargets,exteriorInstitutionCells} from '../data/exterior-map.js';
import {buildMapModel} from './map-model.js';
import {EXTERIOR_COLLISION_GEOMETRY} from '../data/generated/exterior-collision.js';
const zones=new Set(EXTERIOR_MAP_ZONES);
export function usesExteriorMap({zone,height=0}={}){return zones.has(Number(zone))&&height<3.25;}
// Conservative broadphase only. The actual prop movement predicate still
// decides every candidate; empty road/yard need not rebuild its facade catalog
// tens of thousands of times when a survey is first opened.
export function exteriorMapOccupancyFilter({props=[],colliders=[],renderedInstances=[],canOccupy=()=>true}={}){
  const logical=new Map(),physical=new Set(),bucket=4;
  const index=(catalog,b)=>{for(let x=Math.floor(b.x0/bucket);x<=Math.floor(b.x1/bucket);x++)for(let y=Math.floor(b.y0/bucket);y<=Math.floor(b.y1/bucket);y++){const k=`${x},${y}`;if(!catalog.has(k))catalog.set(k,[]);catalog.get(k).push(b);}};
  const box=(x,y,w,d,yaw=0,pad=.3)=>{const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),hx=(w*c+d*s)/2+pad,hy=(w*s+d*c)/2+pad;return{x0:x-hx,x1:x+hx,y0:y-hy,y1:y+hy};};
  for(const p of props.filter(p=>p.blocks))index(logical,box(p.x,p.y,p.w*(p.scale||1),p.d*(p.scale||1),p.yaw));
  for(const p of colliders)index(logical,box(p.x,p.y,p.width,p.depth,p.yaw));
  for(const p of renderedInstances){
    const geometry=EXTERIOR_COLLISION_GEOMETRY[p.mesh];if(!geometry)continue;
    const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),sx=(p.scale||1)*(p.scaleX||1),sz=(p.scale||1)*(p.scaleZ||1);
    const stamp=points=>{
      const world=points.map(([x,z])=>({x:p.x+x*sx*c-z*sz*s,y:p.z+x*sx*s+z*sz*c}));
      const b={x0:Math.min(...world.map(q=>q.x))-.3,x1:Math.max(...world.map(q=>q.x))+.3,y0:Math.min(...world.map(q=>q.y))-.3,y1:Math.max(...world.map(q=>q.y))+.3};
      for(let x=Math.floor(b.x0/CELL-.5);x<=Math.ceil(b.x1/CELL-.5);x++)for(let y=Math.floor(b.y0/CELL-.5);y<=Math.ceil(b.y1/CELL-.5);y++)physical.add(`${x},${y}`);
    };
    const sy=(p.scale||1)*(p.scaleY||1),base=p.y||0,nearHeight=(lo,hi)=>base+hi*sy>=-2.75&&base+lo*sy<=5;
    for(const w of geometry.walls)if(nearHeight(w[4],w[5]))stamp([[w[0],w[1]],[w[2],w[3]]]);
    for(const t of geometry.triangles)if(nearHeight(Math.min(t[1],t[4],t[7]),Math.max(t[1],t[4],t[7])))stamp([[t[0],t[2]],[t[3],t[5]],[t[6],t[8]]]);
  }
  const near=(catalog,x,y)=>(catalog.get(`${Math.floor(x/bucket)},${Math.floor(y/bucket)}`)||[]).some(b=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1);
  return(span,at)=>near(logical,(span.logicalX+.5)*CELL,(span.logicalY+.5)*CELL)||physical.has(`${at.x},${at.y}`)?canOccupy(span,at):true;
}
function runs(open){
  const rows=new Map();for(const key of open){const[x,y]=key.split(',').map(Number);if(!rows.has(y))rows.set(y,[]);rows.get(y).push(x);}
  return [...rows].sort((a,b)=>a[0]-b[0]).flatMap(([y,xs])=>{xs.sort((a,b)=>a-b);const result=[];let x0=xs[0],x1=x0;for(const x of xs.slice(1)){if(x===x1+1)x1=x;else{result.push({y,x0,x1});x0=x1=x;}}result.push({y,x0,x1});return result;});
}
// A half-metre body/collision capture remains the authority. Four clear cells
// are needed to mark a metre square open: thin walls cannot vanish in a union.
export function captureExteriorMapSource({physical,projectLogical,canOccupy=()=>true,renderedInstances=[]}={}){
  if(!(physical?.cells instanceof Map)||typeof projectLogical!=='function')throw new Error('exterior map requires compiled physical cells and projectLogical');
  const visibilityOpen=new Set(),counts=new Map(),heights=new Map(),stride=EXTERIOR_MAP_DEFINITION.topologyStride,institution=exteriorInstitutionCells({renderedInstances});
  for(const[key,spans]of physical.cells){
    const[x,y]=key.split(',').map(Number);
    const span=spans.find(s=>zones.has(s.zone)&&s.floor>=-2.75&&s.floor<3.25&&s.ceil-s.floor>=1.8&&canOccupy(s,{x,y}));
    if(!span)continue;visibilityOpen.add(key);const k=`${Math.floor(x/stride)},${Math.floor(y/stride)}`;
    counts.set(k,(counts.get(k)||0)+1);heights.set(k,span.floor);
  }
  const open=new Set([...counts].filter(([,count])=>count===stride*stride).map(([key])=>key));
  const rawTargets=exteriorMapTargets(),spaces=rawTargets.map(target=>{
    const p=projectLogical(target.logical),position=target.physical||{x:p.x/stride,y:p.z/stride};
    return {...target,position,height:p.height??0};
  });
  const points=[...open].map(k=>k.split(',').map(Number));
  const bounds={minX:Math.min(...points.map(p=>p[0]))-4,minY:Math.min(...points.map(p=>p[1]))-4,maxX:Math.max(...points.map(p=>p[0]))+5,maxY:Math.max(...points.map(p=>p[1]))+5};
  const floor={...EXTERIOR_MAP_DEFINITION.floors[0],bounds,open,runs:runs(open),visibilityOpen,visibilityScale:stride,heights};
  // Roofed exterior shell union is independent of clear walking ground. A
  // public court can be clear while a roof/canopy projects above its edge.
  const edgesFor=cells=>{const edges=[];for(const key of cells){const[x,y]=key.split(',').map(Number);
    for(const[dx,dy,a,b]of [[-1,0,{x,y},{x,y:y+1}],[1,0,{x:x+1,y},{x:x+1,y:y+1}],[0,-1,{x,y},{x:x+1,y}],[0,1,{x,y:y+1},{x:x+1,y:y+1}]])if(!cells.has(`${x+dx},${y+dy}`))edges.push([a,b]);}return edges;};
  const institutionEdges=edgesFor(institution);
  const institutionalRuns=runs(institution),footprints=[...institutionalRuns.map((run,index)=>({id:`ellery:${index}`,role:'institution',points:[{x:run.x0,y:run.y},{x:run.x1+1,y:run.y},{x:run.x1+1,y:run.y+1},{x:run.x0,y:run.y+1}]})),...exteriorMapFootprints()];
  const churchCells=new Set();for(const shape of footprints.filter(p=>p.role==='church')){
    const xs=shape.points.map(p=>p.x),ys=shape.points.map(p=>p.y);
    for(let x=Math.min(...xs);x<Math.max(...xs);x++)for(let y=Math.min(...ys);y<Math.max(...ys);y++)churchCells.add(`${x},${y}`);
  }
  institutionEdges.push(...edgesFor(churchCells));
  return{version:1,definition:EXTERIOR_MAP_DEFINITION,topologyStride:stride,context:'exterior',floors:[floor],targets:[],spaces,landmarks:[],connectors:[],
    // Geometry availability is truthful even though the street drawing uses a
    // survey plan instead of exploding the conservatoire's interior floors.
    architecture:{version:1,available:true,bounds,buildingBounds:bounds,units:{horizontalMetresPerUnit:CELL*stride},floors:[{id:EXTERIOR_MAP_FLOOR,bounds}],levels:[{id:'district-ground',floorId:EXTERIOR_MAP_FLOOR,height:0,exterior:true,bounds,surfaces:[],boundaries:[]}],stairs:[]},
    district:{footprints,institutionEdges,streets:EXTERIOR_MAP_STREETS,streetLabels:EXTERIOR_MAP_STREET_LABELS},
  };
}
function remapWaypoint(source,waypoint,{proxyIndoor=false}={}){
  if(!waypoint?.position)return null;
  const canonical=source.spaces.find(s=>s.id===waypoint.spaceId);
  if(canonical)return{...waypoint,floorId:EXTERIOR_MAP_FLOOR,position:canonical.position,height:canonical.height,label:waypoint.label||canonical.label};
  const floor=source.floors[0],p=waypoint.position;
  // A known outdoor point keeps its actual coordinate. A take upstairs is
  // reached through Ellery's real entrance; the street map never reveals its
  // internal rooms or claims that a line can be walked through a facade.
  const streetHeight=!Number.isFinite(waypoint.height)||(waypoint.height>=-2.75&&waypoint.height<3.25);
  const streetFloor=waypoint.floorId===EXTERIOR_MAP_FLOOR||waypoint.floorId==='g'||!waypoint.floorId;
  if(streetHeight&&streetFloor&&floor.open.has(`${Math.floor(p.x)},${Math.floor(p.y)}`))return{...waypoint,floorId:EXTERIOR_MAP_FLOOR};
  if(!proxyIndoor)return null;
  const entry=source.spaces.find(s=>s.id==='outside:loading-bay');
  return entry?{...waypoint,spaceId:null,floorId:EXTERIOR_MAP_FLOOR,position:entry.position,height:entry.height,label:`${waypoint.label||'ELLERY'} · VIA LOADING BAY`,viaEntrance:entry.id}:null;
}
export function buildExteriorMapModel({source,player,activeWaypoint=null,playerWaypoint=null,doors=[],equipmentMarkers=[],...rest}={}){
  if(!source)return buildMapModel({source:null,player,...rest});
  const externalDoors=doors.filter(d=>source.spaces.some(s=>s.doorIds?.includes(d.id))||source.floors[0].open.has(`${Math.floor(d.position?.x)},${Math.floor(d.position?.y)}`)).map(d=>({...d,floorId:EXTERIOR_MAP_FLOOR}));
  const selected=remapWaypoint(source,playerWaypoint,{proxyIndoor:true}),guidance=remapWaypoint(source,activeWaypoint,{proxyIndoor:true});
  const model=buildMapModel({source,player,activeWaypoint:guidance,playerWaypoint:selected,doors:externalDoors,
    equipmentMarkers:equipmentMarkers.map(m=>({...m,floorId:EXTERIOR_MAP_FLOOR})),...rest});
  // resolveMapRoute's points are XY grid nodes; attach measured ground heights
  // for the architectural map contract, never an inferred upper-storey level.
  if(model.route?.points)model.route={...model.route,points:model.route.points.map(p=>({...p,height:source.floors[0].heights.get(`${p.x},${p.y}`)??0}))};
  return{...model,context:'exterior',title:'ELLERY / STREET SURVEY',subtitle:'DISTRICT / GROUND',district:source.district};
}
