// Conservatory props: placement, interaction state, collision and graph-aware
// reachability. Rendering lives in render/props3d.js; this module stays pure JS
// so the browser suites can prove gameplay without WebGL.

import { CELL, F, PLAN_SCALE, ZONE, isOutdoorZone } from '../data/floorplan/legend.js';
import { CONSERVATORY_PROPS, PROP_MESH, STRUCTURAL_COLLIDERS } from '../data/conservatory-props.js';
import { MESH_SURFACE, PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { WALL_CONTACT, wallContactAt, yawFromNormal } from '../world/wall-contact.js';
import { propWallPose } from '../world/prop-wall-pose.js';
import { propInscriptionAttachments } from '../world/prop-inscriptions.js';
import { WORLD_INSCRIPTIONS, corridorInscriptionsForHosts } from '../data/world-inscriptions.js';
import { CONSERVATORY_FLIGHTS, CONSERVATORY_LANDINGS } from '../data/floorplan/conservatory.js';
import { corridorDressing } from '../world/corridor-dressing.js';
import { architectureFittings } from '../world/architecture-fittings.js';
import * as PROP_GEOMETRY from '../data/generated/prop-geometry.js';
import { batchBuildingDressingInstances } from '../world/building-dressing-batches.js';
import { isExteriorObserver } from './prop-visibility.js';
import {exteriorStreetWallServiceInstances} from '../data/exterior-street-fabric.js';
import { EXTERIOR_FACADE_MESHES, exteriorFacadeCanOccupy, exteriorFacadeCanStep } from '../world/exterior-facade-collision.js';
import { leavesPropOverlap } from '../world/prop-body-contact.js';

let floorplan=null;
let instances=[];
let colliders=[];
// Optional render packs activate their physical fittings only after loading.
// This avoids invisible poles when the isolated street proof is unavailable.
const disabledColliderGroups=new Set(['street-pilot','opening-street','glass-court']);
export function setColliderGroupEnabled(group,enabled){
  if(enabled)disabledColliderGroups.delete(group);else disabledColliderGroups.add(group);
}
const colliderActive=c=>!c.colliderGroup||!disabledColliderGroups.has(c.colliderGroup);
let contactBounds=PROP_BOUNDS,contactSurfaces=MESH_SURFACE;
const state={ inspected:new Set(), auditioned:new Set(), cycles:{}, hushSeed:0x43535552, hushCount:0 };

const rt=(m)=>Math.round(m*PLAN_SCALE);
const meters=(cell)=>cell*CELL;
const wrapAngle=(a)=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};

// The dressing propsInit will add, for anything that needs to agree with it.
//
// Exported because it was being reconstructed by hand in two test files and a
// lint, and every one of them drifted the moment the argument list grew: adding
// landings broke all three counts at once. One call, one answer.
export function derivedDressing(fp){
  return [...corridorDressing(fp,{doors:fp.doorState?.()||[],landings:CONSERVATORY_LANDINGS,flights:CONSERVATORY_FLIGHTS}),...architectureFittings(fp)];
}

// THE CORRIDORS ARE DRESSED FROM THE PLAN, NOT FROM THE ARRAY.
//
// CONSERVATORY_PROPS is typed coordinates; the circulation dressing is a
// function of the compiled floorplan, the way the skirting is (see
// world/corridor-dressing.js for why, and for why nothing it places can stand in
// the route). It is added here rather than in the data module because that is
// where the plan exists — a data file is evaluated long before compile() runs.
//
// Only the real building gets it. A caller that hands in its own placements
// wants exactly those and nothing else: every test harness in the suite relies
// on that to isolate one prop from the production dressing.
export function propsInit(fp, placements=CONSERVATORY_PROPS, {bounds=PROP_BOUNDS,surfaces=MESH_SURFACE}={}){
  floorplan=fp;
  contactBounds=bounds;contactSurfaces=surfaces;
  if(placements===CONSERVATORY_PROPS){
    placements=[...placements,...derivedDressing(fp)];
  }
  instances=placements.map(p=>instantiateProp(fp,p)).filter((p)=>!fp.isSolid(p.rx,p.ry));
  colliders=STRUCTURAL_COLLIDERS.map(c=>({...c,rx:rt(c.x),ry:rt(c.y)}));
  resolveContacts(fp);
  return instances;
}

function instantiateProp(fp,p){
  const mesh=PROP_MESH[p.mesh]||{};
  const rx=rt(p.x),ry=rt(p.y);
  const interactionX=Number.isFinite(p.inspectAt?.x)?p.inspectAt.x:p.x;
  const interactionY=Number.isFinite(p.inspectAt?.y)?p.inspectAt.y:p.y;
  const physical=fp.logicalToPhysical?.(rx,ry);
  const renderGroup=physical?.renderGroup||'';
  const renderGroups=Array.isArray(p.renderGroups)&&p.renderGroups.length?[...new Set(p.renderGroups.map(String))]:[renderGroup];
  const floor=Number.isFinite(p.floorOverride)?Number(p.floorOverride):fp.floorAt(rx,ry);
  return {...mesh,...p,rx,ry,interactionX,interactionY,interactionRx:rt(interactionX),interactionRy:rt(interactionY),floor,zone:fp.zoneAt(rx,ry),renderGroup,renderGroups,blocks:p.blocks??mesh.blocks??false};
}

// Restore just one authored pickup. Do not reinitialize the whole building or
// turn its metre anchor into a loose prop's half-cell-centred approximation.
export function restoreAuthoredProp(id){
  const existing=propById(id);if(existing)return existing;
  const authored=CONSERVATORY_PROPS.find(p=>p.id===id);
  if(!floorplan||!authored)return null;
  const restored=instantiateProp(floorplan,authored);
  if(floorplan.isSolid(restored.rx,restored.ry))return null;
  instances.push(restored);resolveContacts(floorplan,[restored]);return restored;
}

// WHAT WAS BEING DONE BY TYPING COORDINATES.
//
// Two placements in this building were hand-solved against geometry nobody can
// see from the source: standing a thing flat against a wall, and standing a
// thing on a table. Measured before this existed: of 82 wall-mounted props only
// 27 were within 10cm of any wall — the chapel hymn board was 1.6m off — and
// things were being placed on box-office furniture at elevation 1.05 when the
// desk tops out at 0.53.
//
// Both are opt-in. `mount:'wall'` was already authored sixteen times and
// consumed NOWHERE, so wiring it makes the existing intent true rather than
// inventing a synonym. `on:'host-id'` takes its height from the host's real
// mesh. Nothing moves that has not asked to.
//
// Visual contact resolution never moves collision. An implicit interaction
// anchor, however, belongs to the rendered object and follows the snap. An
// explicit inspectAt remains an authored override and is left untouched.
function resolveContacts(fp,selected=instances){
  const plan={
    size:fp.planSize,isSolid:fp.isSolid,floorAt:fp.floorAt,zoneAt:fp.zoneAt,
    materialAt:fp.materialAt,doorAt:fp.doorAt,logicalToPhysical:fp.logicalToPhysical,
  };
  if(typeof plan.size!=='function')return;
  for(const p of selected){
    if(p.mount==='wall'){
      if(p.physicalWall||p.stairLandingWall){
        // A measured stair-storey wall is already in the render frame. Never
        // resnap it to the nearest edge of the logical landing island.
        const wall=p.physicalWall||p.stairLandingWall,nx=wall.normal.x,ny=wall.normal.z;
        const contact={planeX:wall.x/CELL,planeY:wall.z/CELL,nx,ny,yaw:yawFromNormal(nx,ny)};
        const snapped=propWallPose(p,contactBounds[p.mesh],contact),at=fp.logicalToPhysical(p.rx,p.ry);
        p.renderOffsetX=(snapped.x-at.x)*CELL;
        p.renderOffsetZ=(snapped.y-at.z)*CELL;
        p.yaw=snapped.yaw;
        p.wallContact={nx,ny,gap:0,physical:true,planeX:wall.x,planeZ:wall.z};
        if(!Number.isFinite(p.inspectAt?.x)&&!Number.isFinite(p.inspectAt?.y)){
          // Picking and its sight ray use logical metres. Project the visual
          // delta back into this flat landing's own island, rather than making
          // an upper-floor sign answer to coordinates on the ground floor.
          p.interactionX=p.rx*CELL+p.renderOffsetX;
          p.interactionY=p.ry*CELL+p.renderOffsetZ;
          p.interactionRx=rt(p.interactionX);
          p.interactionRy=rt(p.interactionY);
        }
        continue;
      }
      // A PROP MAY NAME THE WALL IT BELONGS TO.
      //
      // wallContactAt otherwise takes the nearest face, and in a three-metre
      // corridor the nearest face to a cell centre can be the wall OPPOSITE the
      // one a fixture was derived from — which snapped generated dressing to the
      // far side, facing backwards. Anything computed from the plan knows its own
      // normal, so it says so and the search is filtered to that face. Authored
      // props pass nothing and keep the nearest-wall behaviour they have always had.
      const contact=wallContactAt(plan,p.rx+.5,p.ry+.5,{prefer:p.mountNormal||null,searchCells:p.mountSearchCells});
      // No wall within reach means the authoring is wrong about something. Leave
      // it exactly where it was rather than dragging it across the room; the
      // contact report lists it.
      if(contact){
        const snapped=propWallPose(p,contactBounds[p.mesh],contact);
        // MEASURE FROM WHERE THE RENDERER STARTS. renderInstances places a prop
        // at `at.x*CELL` — the cell's own coordinate, which for an authored metre
        // round-trips back to that metre. Measuring the offset from `p.rx+.5`
        // instead put every wall-mounted prop HALF A RUNTIME CELL — 0.25m — short
        // of the wall it had just been snapped to. Measured on all three service
        // panels: snapToWall targeted the wall face at 97.00m and they rendered
        // at 96.75m, floating a quarter metre off the blockwork.
        //
        // The delta is frame-independent: logical and physical differ only by a
        // translation at the same scale, so a difference of cells converts to
        // metres identically in either.
        if(snapped.x!==null)p.renderOffsetX=(snapped.x-p.rx)*CELL;
        if(snapped.y!==null)p.renderOffsetZ=(snapped.y-p.ry)*CELL;
        p.yaw=snapped.yaw;
        p.wallContact={nx:contact.nx,ny:contact.ny,gap:contact.gap};
        if(!Number.isFinite(p.inspectAt?.x)&&!Number.isFinite(p.inspectAt?.y)){
          const at=fp.logicalToPhysical?.(p.rx,p.ry);
          p.interactionX=(at?at.x*CELL:p.x)+(p.renderOffsetX||0);
          p.interactionY=(at?at.z*CELL:p.y)+(p.renderOffsetZ||0);
          p.interactionRx=rt(p.interactionX);
          p.interactionRy=rt(p.interactionY);
        }
      }
    }
    if(p.on){
      const host=instances.find((h)=>h.id===p.on);
      // Loudly, not silently: a missing host used to mean elevation 0, which
      // drops the object through the table it was meant to be standing on.
      if(!host)throw new Error(`prop ${p.id}: on:'${p.on}' names no such prop`);
      if(host===p)throw new Error(`prop ${p.id}: on:'${p.on}' refers to itself`);
      // The measured WORK SURFACE, not the bounding box: a ticket counter's box
      // tops out at its grille and a school desk's at its back, and standing a
      // clipboard on either is worse than the typed number it replaces.
      const top=contactSurfaces[host.mesh];
      if(!Number.isFinite(top))throw new Error(`prop ${p.id}: host ${host.id} (${host.mesh}) has no measured work surface — it may have no flat face big enough to stand anything on`);
      p.elevation=top*(host.scale||1)+(host.elevation||0);
      p.restsOn=host.id;
    }
  }
}
export function allProps(){return instances;}
export function propById(id){return instances.find((p)=>p.id===id)||null;}
// A purely VISUAL nudge. It writes renderOffset/yaw only, never rx/ry, so the
// collider and the interaction point stay exactly where they were authored: a
// thing can look like it moved without becoming a thing you can walk through or
// have to re-aim at. Offsets are absolute, measured from the authored pose, so
// applying a drift twice does not compound it.
export function setPropDrift(id, drift = null){
  const p = propById(id);
  if(!p) return null;
  if(p.driftBase === undefined) p.driftBase = { x:p.renderOffsetX||0, z:p.renderOffsetZ||0, yaw:p.yaw||0, y:p.renderOffsetY||0 };
  const base = p.driftBase;
  p.renderOffsetX = base.x + (Number(drift?.dx) || 0);
  p.renderOffsetZ = base.z + (Number(drift?.dz) || 0);
  p.renderOffsetY = base.y + (Number(drift?.dy) || 0);
  p.yaw = base.yaw + (Number(drift?.dyaw) || 0);
  return { id, dx:Number(drift?.dx)||0, dz:Number(drift?.dz)||0, dy:Number(drift?.dy)||0, dyaw:Number(drift?.dyaw)||0 };
}
export function setLooseProp(id, placement=null){
  instances=instances.filter((p)=>p.id!==id);
  if(!placement||!floorplan)return null;
  const mesh=PROP_MESH[placement.mesh]||{};
  const rx=Math.round(placement.rx),ry=Math.round(placement.ry),physical=floorplan.logicalToPhysical?.(rx,ry);
  if(floorplan.isSolid(rx,ry))return null;
  const x=meters(rx+.5),y=meters(ry+.5),interactionX=Number.isFinite(placement.inspectAt?.x)?placement.inspectAt.x:x,interactionY=Number.isFinite(placement.inspectAt?.y)?placement.inspectAt.y:y;
  const renderGroup=physical?.renderGroup||'',renderGroups=Array.isArray(placement.renderGroups)&&placement.renderGroups.length?[...new Set(placement.renderGroups.map(String))]:[renderGroup];
  const floor=Number.isFinite(placement.floorOverride)?Number(placement.floorOverride):floorplan.floorAt(rx,ry);
  const prop={...mesh,...placement,id,rx,ry,x,y,interactionX,interactionY,interactionRx:rt(interactionX),interactionRy:rt(interactionY),floor,zone:floorplan.zoneAt(rx,ry),renderGroup,renderGroups,blocks:false};
  instances.push(prop);return prop;
}
// Fixed runtime furniture uses the same authored metre anchor and collision
// contract as initial placements. Loose pickups deliberately stay nonblocking.
export function setPlacedProp(id,placement=null){
  instances=instances.filter(p=>p.id!==id);
  if(!placement||!floorplan)return null;
  const prop=instantiateProp(floorplan,{...placement,id});
  if(floorplan.isSolid(prop.rx,prop.ry))return null;
  instances.push(prop);return prop;
}
export function attachInscriptions(finalHosts){return propInscriptionAttachments(finalHosts,[...WORLD_INSCRIPTIONS,...corridorInscriptionsForHosts(finalHosts)]);}
// Both drawing and facade collision consume this pose, including authored
// offsets and stretched court walls. The collision must not guess at a second
// placement from the logical footprint.
function renderInstance(p){
    const at=floorplan.logicalToPhysical?.(p.rx,p.ry),waterlineOffset=(p.elevation||0)+(p.renderOffsetY||0);
    return{id:p.id,mesh:p.mesh,fallbackMesh:p.fallbackMesh||null,
      x:(at?at.x*CELL:p.x)+(p.renderOffsetX||0),y:(p.floor??0)+waterlineOffset,
      z:(at?at.z*CELL:p.y)+(p.renderOffsetZ||0),
      yaw:(p.yaw||0)+(!p.worldAligned&&at?floorplan.arcYawOffset?.(p.rx,p.ry,at.x+.5,at.z+.5)||0:0),
      scale:p.scale||1,scaleX:p.scaleX,scaleY:p.scaleY,scaleZ:p.scaleZ,zone:p.zone||0,
      portraitIndex:p.portraitIndex||0,structural:!!p.structural,
      waterlineBody:p.waterlineBody||null,waterlineOffset};
}
export function renderInstances({group=null,inscriptions=true,batchDressing=false}={}){
  const hosts=instances.filter((p)=>!p.interactionProxy&&colliderActive(p)&&(!group||(p.renderGroups||[p.renderGroup]).includes(group))).map(renderInstance);
  const rendered=batchDressing&&group?batchBuildingDressingInstances(hosts,group,PROP_GEOMETRY.DRESSING_BATCHES):hosts;
  const streetServices=exteriorStreetWallServiceInstances(rendered);
  const complete=streetServices.length?[...rendered,...streetServices]:rendered;
  return inscriptions?attachInscriptions(complete):complete;
}

function pointInProp(mx,mz,p,pad=.20){
  const dx=mx-p.x,dz=mz-p.y,c=Math.cos(-(p.yaw||0)),s=Math.sin(-(p.yaw||0));
  const lx=dx*c-dz*s,lz=dx*s+dz*c;
  return Math.abs(lx)<=(p.w*(p.scale||1))/2+pad && Math.abs(lz)<=(p.d*(p.scale||1))/2+pad;
}
export function propCanOccupy(toX,toY,{ignoreId=null,from=null}={}){
  const mx=meters(toX+.5),mz=meters(toY+.5);
  const floor=floorplan?.floorAt?.(toX,toY)??0;
  // Old pool saves can predate these partitions or the planted bed. Permit
  // only an outward step from an overlap, using the existing same-side test.
  const overlapRecoveryZone=zone=>isOutdoorZone(zone)||zone===ZONE.glasshouse||zone===ZONE.poolChanging;
  const recover=from&&overlapRecoveryZone(floorplan?.zoneAt?.(from.x,from.y))&&overlapRecoveryZone(floorplan?.zoneAt?.(toX,toY));
  const outward=(p,pad)=>recover&&leavesPropOverlap(
    {x:meters(from.x+.5),z:meters(from.y+.5)},{x:mx,z:mz},p,pad);
  const blocked=(p,pad)=>{
    if(recover&&pointInProp(meters(from.x+.5),meters(from.y+.5),p,pad))return !outward(p,pad);
    return pointInProp(mx,mz,p,pad);
  };
  if(colliders.some((c)=>{
    if(!colliderActive(c)||floor<c.minElevation-.05||floor>c.maxElevation+.05)return false;
    const box={...c,w:c.width,d:c.depth};
    return blocked(box,0);
  }))return false;
  if(instances.some((p)=>{
    if(p.id===ignoreId)return false;
    if(p.collisionMask==='hall-seating'){
      const inside=Math.abs(mx-p.x)<=12.75&&Math.abs(mz-p.y)<=9.25;if(!inside)return false;
      // THE AISLES ARE THE FLOORPLAN'S, NOT THIS FUNCTION'S.
      //
      // They used to be a second analytic guess authored here in metres, and the
      // two never agreed: hallGroundProfile flags a four-metre centre aisle and
      // this opened 1.7m of it, so the rake advertised a way through the stalls
      // that the collision refused. Deriving it means a re-raked bowl moves its
      // own gangways and nothing here has to be re-typed.
      if(floorplan?.hasFlag?.(toX,toY,F.STAIR))return false;
      // TWO GANGWAYS THE RAKE CANNOT EXPRESS, both authored here on purpose.
      //
      // hallGroundProfile's aisle test is a function of x alone, so it can flag
      // the three longitudinal gangways and nothing else. The transverse ones run
      // the other way and have to live here until the profile can say so:
      //   · the cross-over halfway back, which is how you get from the centre
      //     aisle to either side without walking the whole bowl; and
      //   · the flat strip in front of the first row, between rake and stage.
      // Deleting the first of these silently strands the west chandelier's
      // inspection proxy, which is how it was noticed.
      if(Math.abs(mz-(p.y+1))<.85)return false;
      return !(mz<p.y-7.7);
    }
    return p.blocks&&blocked(p,.20);
  }))return false;
  const outside=(x,y)=>isExteriorObserver({zone:floorplan?.zoneAt?.(x,y)});
  if(!outside(toX,toY)&&!(from&&outside(from.x,from.y)))return true;
  const body=(x,y)=>{
    const at=floorplan.logicalToPhysical(x,y);
    // r3dFrame adds half a runtime cell AFTER the physical mapping. Use the
    // same body centre; the authored prop anchor itself has no such offset.
    return{x:(at.x+.5)*CELL,z:(at.z+.5)*CELL,feet:floorplan.floorAt(x,y)};
  };
  const facadeInstances=instances.filter(p=>p.id!==ignoreId&&EXTERIOR_FACADE_MESHES.includes(p.mesh)
    &&(!p.mesh.startsWith('opening_street_')||!disabledColliderGroups.has('opening-street'))).map(renderInstance);
  const to=body(toX,toY);
  return (from
    ?exteriorFacadeCanStep({from:body(from.x,from.y),to},facadeInstances)
    :exteriorFacadeCanOccupy(to,facadeInstances)).ok;
}
// IS THERE SOMETHING HERE TALL ENOUGH TO GET BEHIND?
//
// Cover asks the plan for walls, and the plan does not know about furniture. A
// flight case is as good a thing to be behind as a wall is, and a bench is not:
// the height test is the whole distinction, so it is a parameter rather than a
// constant in here (game/cover.js owns the number).
//
// Footprint rather than rx/ry, because a long prop covers cells its authored
// origin is not in — the same reason propCanOccupy tests the rect.
export function tallBlockingPropAt(cx,cy,minHeight=0.95){
  const mx=meters(cx+.5),mz=meters(cy+.5);
  const floor=floorplan?.floorAt?.(cx,cy)??0;
  if(colliders.some((c)=>colliderActive(c)&&floor>=c.minElevation-.05&&floor<=c.maxElevation+.05
      &&(Number.isFinite(c.coverHeight)?c.coverHeight:c.maxElevation-floor)>=minHeight
      &&pointInProp(mx,mz,{...c,w:c.width,d:c.depth},0)))return true;
  return instances.some((p)=>{
    if(!p.blocks)return false;
    if(((p.h||0)*(p.scale||1)+(p.elevation||0))<minHeight)return false;
    return pointInProp(mx,mz,p,0);
  });
}

// IS THE FLOOR HERE SOFT, AND HOW SOFT?
//
// Sibling of tallBlockingPropAt, and footprint-based for the same reason it is:
// a runner is seven metres of prop authored at one cell, and the six cells it
// also covers are exactly the ones a player walks. Testing rx/ry would make a
// stair runner soft on one tread.
//
// Returns 0 where there is nothing soft, so callers can multiply without
// branching. Props opt in with a `softFloor` number, because a drugget nailed
// over boards and a deep wool rug are not the same underfoot.
export function softFloorPropAt(cx,cy){
  const mx=meters(cx+.5),mz=meters(cy+.5);
  let softest=0;
  for(const p of instances){
    const soft=Number(p.softFloor)||0;
    if(soft<=0)continue;
    if(!pointInProp(mx,mz,p,0))continue;
    if(soft>softest)softest=soft;
  }
  return softest;
}

export function structuralColliders(){return colliders.map(c=>({...c}));}

function clearLine(ax,ay,bx,by,floor){
  // The greenhouse's fixed glazing has no opaque grid wall. It reveals the
  // pool, but a hand still cannot inspect its fixtures through the partition.
  // Use the real unpadded faces, rather than treating body clearance as glass.
  for(const c of colliders){
    if(c.colliderGroup!=='glass-court'||!colliderActive(c)||floor<c.minElevation-.05||floor>c.maxElevation+.05)continue;
    const cs=Math.cos(-(c.yaw||0)),sn=Math.sin(-(c.yaw||0));
    const local=(x,y)=>[(x-c.x)*cs-(y-c.y)*sn,(x-c.x)*sn+(y-c.y)*cs];
    const a=local(ax,ay),b=local(bx,by),margin=Number(c.bodyMargin)||0;
    const half=[c.width/2-margin,c.depth/2-margin];let lo=0,hi=1;
    for(let axis=0;axis<2;axis++){
      const delta=b[axis]-a[axis];
      if(Math.abs(delta)<1e-9){if(Math.abs(a[axis])>half[axis]){lo=2;break;}continue;}
      const t0=(-half[axis]-a[axis])/delta,t1=(half[axis]-a[axis])/delta;
      lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
    }
    if(lo<=hi&&hi>1e-5&&lo<1-1e-5)return false;
  }
  const d=Math.hypot(bx-ax,by-ay),steps=Math.max(1,Math.ceil(d*4));
  for(let i=1;i<steps;i++){
    const t=i/steps,x=rt(ax+(bx-ax)*t),y=rt(ay+(by-ay)*t);
    // A glazed leaf can reveal the room while its logical CLOSED throat still
    // refuses a hand. Door cells stay air so the mesh supplies their shape;
    // isSolid alone therefore permits picking through every closed door.
    if(floorplan.isSolid(x,y)||floorplan.isCollisionOnly?.(x,y)||floorplan.hasFlag?.(x,y,F.CLOSED))return false;
  }
  return true;
}
// A look ray can pass through a rendered floor, especially where two logical
// levels share a physical footprint. Interaction cannot: a prop on the level
// below must not take the reticle from a person standing on the roof. Allow a
// couple of metres for stair treads and landings, and let a deliberately
// reachable cross-level fixture opt into a larger span when authored.
const DEFAULT_INTERACTION_FLOOR_REACH=2.6;
export function propWithinVerticalReach(px,py,p){
  if(!p)return false;
  const playerFloor=floorplan?.floorAt?.(px,py);
  if(!Number.isFinite(playerFloor)||!Number.isFinite(p.floor))return true;
  const reach=Number.isFinite(p.interactionFloorReach)
    ?Math.max(0,p.interactionFloorReach):DEFAULT_INTERACTION_FLOOR_REACH;
  return Math.abs(playerFloor-p.floor)<=reach;
}
export function pickProp(px,py,facing,maxMeters=2,{yaw=null,pitch=null,eyeHeight=1.58}={}){
  const mx=meters(px+.5),mz=meters(py+.5);
  // `facing` is deliberately still accepted for the deterministic suites and
  // the 2D fallback. In first person the caller supplies the continuous look
  // yaw: using the old quarter-turn body direction made the interaction cone
  // cover several neighboring props even when the reticle was plainly on one.
  const heading=Number.isFinite(yaw)?yaw:Number(facing||0)*Math.PI/2;
  const f=[Math.sin(heading),-Math.cos(heading)];
  const eyeY=(floorplan?.floorAt?.(px,py)||0)+(Number(eyeHeight)||1.58);
  let best=null,bestScore=Infinity;
  for(const p of instances){
    if(p.interactive===false)continue;
    if(!propWithinVerticalReach(px,py,p))continue;
    const interactionX=p.interactionX??p.x,interactionY=p.interactionY??p.y;
    const dx=interactionX-mx,dz=interactionY-mz,d=Math.hypot(dx,dz);if(d>maxMeters+(Math.max(p.w,p.d)||0)/2)continue;
    const dot=(dx*f[0]+dz*f[1])/Math.max(.001,d);if(dot<.72)continue;
    if(!clearLine(mx,mz,interactionX,interactionY,floorplan?.floorAt?.(px,py)||0))continue;
    const ang=Math.abs(wrapAngle(Math.atan2(dx,-dz)-heading));
    // Rank by reticle alignment before proximity. The angular footprint keeps
    // a broad road case forgiving while preventing its edge from stealing a
    // clipboard, latch, or reel handle the player is actually aiming at.
    const radius=Math.max(.20,Math.min(.78,((Math.max(p.w,p.d)||.32)*(p.scale||1))/2+.16));
    const halfAngle=Math.max(.12,Math.min(.62,Math.atan2(radius,Math.max(.05,d))));
    if(ang>halfAngle*1.4)continue;
    let verticalPenalty=0;
    if(Number.isFinite(pitch)){
      const h=Math.max(.12,(p.h||.55)*(p.scale||1));
      const targetY=(p.floor||0)+(p.elevation||0)+h*.5;
      const targetPitch=Math.atan2(targetY-eyeY,Math.max(.05,d));
      verticalPenalty=Math.abs(targetPitch-pitch)/Math.max(.12,Math.atan2(h*.5+.08,Math.max(.05,d)))*.24;
    }
    const aimScore=ang/halfAngle+verticalPenalty+d*.025-(Number(p.interactionPriority)||0)*.08;
    if(aimScore<bestScore){bestScore=aimScore;best={...p,distance:d,aimAngle:ang,aimScore};}
  }
  return best;
}

export function inspectProp(id,{aftermath=false}={}){
  const p=propById(id);if(!p)return null;
  const aftermathCopy=aftermath&&p.aftermathInspect
    ? (p.aftermathInspect.heard||p.aftermathInspect.unheard
      ? (state.auditioned.has(id)?p.aftermathInspect.heard:p.aftermathInspect.unheard)
      : p.aftermathInspect)
    : null;
  const copy=aftermathCopy||p.inspect;
  // The aftermath is a second authored inspection pass. A prop seen before the
  // rupture must still get its first post-event line once.
  const stateId=aftermathCopy?`${id}@aftermath`:id;
  const seen=state.inspected.has(stateId);state.inspected.add(stateId);
  return seen?(copy?.again||copy?.first):(copy?.first||'Nothing useful.');
}
export function auditionProp(id){
  const p=propById(id);if(!p?.sampleFamily?.length)return null;
  state.auditioned.add(id);const i=state.cycles[id]||0;state.cycles[id]=(i+1)%p.sampleFamily.length;
  return p.sampleFamily[i%p.sampleFamily.length];
}
export function learnedPlayable(){return instances.filter((p)=>p.sampleFamily?.length&&state.auditioned.has(p.id));}
export function isAuditioned(id){return state.auditioned.has(id);}

const key=(x,y)=>`${x},${y}`;
function interactionGoals(p){
  const out=[];const reach=Math.max(2,Math.ceil(2/CELL));
  for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){
    const x=(p.interactionRx??p.rx)+dx,y=(p.interactionRy??p.ry)+dy;if(Math.hypot(dx,dy)>reach||floorplan.isSolid(x,y)||!propCanOccupy(x,y,{ignoreId:p.id}))continue;out.push(key(x,y));
  }
  return new Set(out);
}
export function pathToProp(px,py,propId,keys){
  const p=propById(propId);if(!p||!floorplan)return null;
  const goals=interactionGoals(p),start=[Math.round(px),Math.round(py)],startKey=key(...start);
  if(goals.has(startKey))return [start];
  const q=[start],prev=new Map([[startKey,null]]);let found=null;
  for(let qi=0;qi<q.length&&!found;qi++){
    const [x,y]=q[qi];
    const portal=floorplan.connectorDestination?.(x,y);if(portal){const pk=key(portal.x,portal.y);if(!prev.has(pk)){prev.set(pk,key(x,y));q.push([portal.x,portal.y]);if(goals.has(pk)){found=pk;break;}}}
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const tx=x+dx,ty=y+dy;const step=floorplan.canStep(x,y,tx,ty,{keys});if(!step.ok)continue;const nx=step.redirect?.x??tx,ny=step.redirect?.y??ty,k=key(nx,ny);if(prev.has(k)||!propCanOccupy(nx,ny,{ignoreId:p.id,from:{x,y}}))continue;
      prev.set(k,key(x,y));q.push([nx,ny]);if(goals.has(k)){found=k;break;}
    }
  }
  if(!found)return null;const path=[];for(let k=found;k;){const [x,y]=k.split(',').map(Number);path.push([x,y]);k=prev.get(k);}path.reverse();return path;
}
export function reachableLearned(px,py,keys){return learnedPlayable().map((p)=>({prop:p,path:pathToProp(px,py,p.id,keys)})).filter((x)=>x.path);}

export function nextHushChoice(px,py,keys){
  const eligible=reachableLearned(px,py,keys);if(!eligible.length)return null;
  // xorshift32: deterministic across reloads and independent of Math.random.
  let x=state.hushSeed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;state.hushSeed=x>>>0;
  return eligible[state.hushSeed%eligible.length];
}
export function shouldArmHush({tutorial=false,battle=false}={}){
  if(tutorial||battle||!learnedPlayable().length)return false;
  // The first eligible take demonstrates the rule. Every later take uses the
  // saved deterministic stream, never Math.random, so reloads cannot reroll it.
  if(state.hushCount===0)return true;
  let x=state.hushSeed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;state.hushSeed=x>>>0;
  return (state.hushSeed%100)<35;
}
export function hushSampleFor(id){
  const p=propById(id);if(!p?.sampleFamily?.length)return null;
  return p.sampleFamily[state.hushSeed%p.sampleFamily.length];
}
export function markHushEvent(){state.hushCount++;}
export function pathBearing(path,facing){
  if(!path||path.length<2)return{pan:0,distance:0,next:null};const [x0,y0]=path[0],[x1,y1]=path[1],a=floorplan?.logicalToPhysical?.(x0,y0)||{x:x0,z:y0},b=floorplan?.logicalToPhysical?.(x1,y1)||{x:x1,z:y1},dx=b.x-a.x,dy=b.z-a.z;
  const right=[[1,0],[0,1],[-1,0],[0,-1]][((facing%4)+4)%4];
  return{pan:Math.max(-1,Math.min(1,dx*right[0]+dy*right[1])),distance:(path.length-1)*CELL,next:{x:x1,y:y1}};
}
export function atRecorder(origin,px,py,maxCells=2){return !!origin&&Math.hypot(origin.x-px,origin.y-py)<=maxCells;}

export function loadPropState(saved={}){state.inspected=new Set(saved.inspected||[]);state.auditioned=new Set(saved.auditioned||[]);state.cycles={...(saved.cycles||{})};state.hushSeed=(saved.hushSeed>>>0)||0x43535552;state.hushCount=Math.max(0,Number(saved.hushCount)||0);}
export function savePropState(){return{inspected:[...state.inspected],auditioned:[...state.auditioned],cycles:{...state.cycles},hushSeed:state.hushSeed>>>0,hushCount:state.hushCount};}
export function propState(){return state;}
