// Conservatory props: placement, interaction state, collision and graph-aware
// reachability. Rendering lives in render/props3d.js; this module stays pure JS
// so the browser suites can prove gameplay without WebGL.

import { CELL, F, PLAN_SCALE } from '../data/floorplan/legend.js';
import { CONSERVATORY_PROPS, PROP_MESH, STRUCTURAL_COLLIDERS } from '../data/conservatory-props.js';
import { MESH_SURFACE, PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { WALL_CONTACT, snapToWall, wallContactAt } from '../world/wall-contact.js';

let floorplan=null;
let instances=[];
let colliders=[];
const state={ inspected:new Set(), auditioned:new Set(), cycles:{}, hushSeed:0x43535552, hushCount:0 };

const rt=(m)=>Math.round(m*PLAN_SCALE);
const meters=(cell)=>cell*CELL;
const wrapAngle=(a)=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};

export function propsInit(fp, placements=CONSERVATORY_PROPS){
  floorplan=fp;
  instances=placements.map((p)=>{
    const mesh=PROP_MESH[p.mesh]||{};
    const rx=rt(p.x),ry=rt(p.y);
    const interactionX=Number.isFinite(p.inspectAt?.x)?p.inspectAt.x:p.x;
    const interactionY=Number.isFinite(p.inspectAt?.y)?p.inspectAt.y:p.y;
    const physical=fp.logicalToPhysical?.(rx,ry);
    const renderGroup=physical?.renderGroup||'';
    const renderGroups=Array.isArray(p.renderGroups)&&p.renderGroups.length?[...new Set(p.renderGroups.map(String))]:[renderGroup];
    return {...mesh,...p,rx,ry,interactionX,interactionY,interactionRx:rt(interactionX),interactionRy:rt(interactionY),floor:fp.floorAt(rx,ry),zone:fp.zoneAt(rx,ry),renderGroup,renderGroups,blocks:p.blocks??mesh.blocks??false};
  }).filter((p)=>!fp.isSolid(p.rx,p.ry));
  colliders=STRUCTURAL_COLLIDERS.map(c=>({...c,rx:rt(c.x),ry:rt(c.y)}));
  resolveContacts(fp);
  return instances;
}

// THE HALF-DEPTH OF A PROP, from the geometry rather than from a typed number.
// Meshes are floor-centred, so the back is whichever of min/max z is furthest
// from the origin.
// HOW FAR THE PROP REACHES BEHIND ITS OWN ORIGIN — which is the only thing the
// wall needs to know. This used to return the greater of |min z| and |max z|,
// i.e. the half-depth of a CENTRE-origin mesh. Two conventions live in this
// pack: centre-origin furniture, and wall assets authored with "the origin is
// the back plane and +Z is the visible front" (see the note beside
// tower_bulkhead in build-props.mjs). For the second kind min z is 0, so the old
// rule backed the prop off by its full depth and stood it proud of the wall.
//
// Reaching backwards by nothing means the back plane IS the wall, which is
// exactly right for a wall asset and still correct for a centred one.
function halfDepthOf(p){
  const b=PROP_BOUNDS[p.mesh];
  if(!b)return 0;
  return Math.max(0,-b.min[2])*(p.scale||1);
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
function resolveContacts(fp){
  const plan={
    size:fp.planSize,isSolid:fp.isSolid,floorAt:fp.floorAt,zoneAt:fp.zoneAt,
    materialAt:fp.materialAt,doorAt:fp.doorAt,logicalToPhysical:fp.logicalToPhysical,
  };
  if(typeof plan.size!=='function')return;
  for(const p of instances){
    if(p.mount==='wall'){
      const contact=wallContactAt(plan,p.rx+.5,p.ry+.5);
      // No wall within reach means the authoring is wrong about something. Leave
      // it exactly where it was rather than dragging it across the room; the
      // contact report lists it.
      if(contact){
        const snapped=snapToWall(contact,{halfDepth:halfDepthOf(p)});
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
      const top=MESH_SURFACE[host.mesh];
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
  const prop={...mesh,...placement,id,rx,ry,x,y,interactionX,interactionY,interactionRx:rt(interactionX),interactionRy:rt(interactionY),floor:floorplan.floorAt(rx,ry),zone:floorplan.zoneAt(rx,ry),renderGroup,renderGroups,blocks:false};
  instances.push(prop);return prop;
}
export function renderInstances({group=null}={}){return instances.filter((p)=>!group||(p.renderGroups||[p.renderGroup]).includes(group)).map((p)=>{const at=floorplan.logicalToPhysical?.(p.rx,p.ry);return{id:p.id,mesh:p.mesh,x:(at?at.x*CELL:p.x)+(p.renderOffsetX||0),y:(p.floor||0)+(p.elevation||0)+(p.renderOffsetY||0),z:(at?at.z*CELL:p.y)+(p.renderOffsetZ||0),yaw:(p.yaw||0)+(at?floorplan.arcYawOffset?.(p.rx,p.ry,at.x+.5,at.z+.5)||0:0),scale:p.scale||1,scaleX:p.scaleX,scaleY:p.scaleY,scaleZ:p.scaleZ,zone:p.zone||0,portraitIndex:p.portraitIndex||0,structural:!!p.structural};});}

function pointInProp(mx,mz,p,pad=.20){
  const dx=mx-p.x,dz=mz-p.y,c=Math.cos(-(p.yaw||0)),s=Math.sin(-(p.yaw||0));
  const lx=dx*c-dz*s,lz=dx*s+dz*c;
  return Math.abs(lx)<=(p.w*(p.scale||1))/2+pad && Math.abs(lz)<=(p.d*(p.scale||1))/2+pad;
}
export function propCanOccupy(toX,toY,{ignoreId=null}={}){
  const mx=meters(toX+.5),mz=meters(toY+.5);
  const floor=floorplan?.floorAt?.(toX,toY)??0;
  if(colliders.some((c)=>floor>=c.minElevation-.05&&floor<=c.maxElevation+.05&&pointInProp(mx,mz,{...c,w:c.width,d:c.depth},0)))return false;
  return !instances.some((p)=>{
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
    return p.blocks&&pointInProp(mx,mz,p);
  });
}
export function structuralColliders(){return colliders.map(c=>({...c}));}

function clearLine(ax,ay,bx,by){
  const d=Math.hypot(bx-ax,by-ay),steps=Math.max(1,Math.ceil(d*4));
  for(let i=1;i<steps;i++){const t=i/steps;if(floorplan.isSolid(rt(ax+(bx-ax)*t),rt(ay+(by-ay)*t)))return false;}
  return true;
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
    const interactionX=p.interactionX??p.x,interactionY=p.interactionY??p.y;
    const dx=interactionX-mx,dz=interactionY-mz,d=Math.hypot(dx,dz);if(d>maxMeters+(Math.max(p.w,p.d)||0)/2)continue;
    const dot=(dx*f[0]+dz*f[1])/Math.max(.001,d);if(dot<.72)continue;
    if(!clearLine(mx,mz,interactionX,interactionY))continue;
    const ang=Math.abs(wrapAngle(Math.atan2(dx,-dz)-heading));
    // Rank by reticle alignment before proximity. The angular footprint keeps
    // a broad road case forgiving while preventing its edge from stealing a
    // clipboard, latch, or reel handle the player is actually aiming at.
    const radius=Math.max(.12,Math.min(.7,((Math.max(p.w,p.d)||.32)*(p.scale||1))/2+.12));
    const halfAngle=Math.max(.08,Math.min(.58,Math.atan2(radius,Math.max(.05,d))));
    if(ang>halfAngle*1.2)continue;
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
      const tx=x+dx,ty=y+dy;const step=floorplan.canStep(x,y,tx,ty,{keys});if(!step.ok)continue;const nx=step.redirect?.x??tx,ny=step.redirect?.y??ty,k=key(nx,ny);if(prev.has(k)||!propCanOccupy(nx,ny,{ignoreId:p.id}))continue;
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
