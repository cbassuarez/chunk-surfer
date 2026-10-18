// Fittings follow compiled wall faces. Paper-map anchors choose a room; they
// never supply a substitute wall or a guessed mounting depth.
import { CELL, F, PLAN_SCALE, ZONE, isOutdoorZone } from '../data/floorplan/legend.js';
import { ARCHITECTURE_ROOM_SCHEDULE, ARCHITECTURE_FITTING_MESHES, ARCHITECTURE_HOST_RESERVATIONS, ARCHITECTURE_TRIM_CLEARANCES } from '../data/architecture-fittings.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { wallRuns, yawFromNormal } from './wall-contact.js';

const GROUPS=new Set(['basement','ground','upper','academic','hall']);
const metres=c=>c/PLAN_SCALE;
const physical=(fp,x,y)=>fp.logicalToPhysical?.(x,y)||{x,z:y,y:fp.floorAt(x,y),renderGroup:'ground'};

function ceiling(fp,x,y) {
  return typeof fp.ceilAt==='function'?fp.ceilAt(x,y):fp.floorAt(x,y)+3.5;
}
function flags(fp,x,y,f) { return !!fp.hasFlag?.(x,y,f); }

// A riser is a wall for skirting, but it is not a full-height host for a socket,
// radiator or cornice. Neither a stair, an arc nor a rearranging corridor is a
// host for this fixed kit.
function supportsFittings(fp,c) {
  if(!GROUPS.has(c.renderGroup)||c.arcId||isOutdoorZone(c.zone))return false;
  if(fp.isCollisionOnly?.(c.x,c.y))return false;
  if(c.zone===ZONE.natatorium&&metres(c.y)<32.4)return false; // existing admission sequence owns the dry lead-in
  if(!fp.isSolid(c.x-c.nx,c.y-c.ny))return false;
  if(flags(fp,c.x,c.y,F.STAIR)||flags(fp,c.x,c.y,F.MUTABLE))return false;
  if(ceiling(fp,c.x,c.y)-c.floor<2.1)return false;
  const p=physical(fp,c.x,c.y),q=physical(fp,c.x+c.nx,c.y+c.ny);
  // World wall-contact offsets assume a translation. Discontinuous mappings
  // and rotated analytic stairs already own separate architectural assemblies.
  return Math.abs(q.x-p.x-c.nx)<1e-5&&Math.abs(q.z-p.z-c.ny)<1e-5;
}

export function architectureWallRuns(fp) {
  const out=[];
  for(const run of wallRuns(fp)) {
    let cells=[];
    const flush=()=>{
      if(cells.length>=3)out.push({...run,cells:[...cells],from:run.axis==='x'?cells[0].x:cells[0].y,
        to:(run.axis==='x'?cells.at(-1).x:cells.at(-1).y)+1,
        ceiling:ceiling(fp,cells[0].x,cells[0].y)});
      cells=[];
    };
    for(const c of run.cells) {
      if(!supportsFittings(fp,c)){flush();continue;}
      const p=physical(fp,c.x,c.y),last=cells.at(-1),lp=last?physical(fp,last.x,last.y):null;
      if(last&&(Math.abs(ceiling(fp,c.x,c.y)-ceiling(fp,last.x,last.y))>.01
        ||Math.abs((run.axis==='x'?p.x-lp.x:p.z-lp.z)-1)>1e-5
        ||Math.abs(run.axis==='x'?p.z-lp.z:p.x-lp.x)>1e-5))flush();
      cells.push(c);
    }
    flush();
  }
  return out.sort((a,b)=>a.renderGroup.localeCompare(b.renderGroup)||a.floor-b.floor
    ||a.along-b.along||a.from-b.from||a.nx-b.nx||a.ny-b.ny);
}

function openAnchor(fp,room) {
  const seed=room.fittingsAnchor||room.logical;
  const x=Math.round(seed.x*PLAN_SCALE),y=Math.round(seed.y*PLAN_SCALE);
  let best=null,bestD=Infinity;
  // A shifted map marker is reported, including its measured relocation. Never
  // move a room marker across the building simply to manufacture coverage.
  for(let dy=-12;dy<=12;dy++)for(let dx=-12;dx<=12;dx++) {
    const d=dx*dx+dy*dy;if(d>=bestD||d>144)continue;
    const cx=x+dx,cy=y+dy;
    if(fp.isSolid(cx,cy)||fp.isCollisionOnly?.(cx,cy)||fp.doorAt?.(cx,cy)||flags(fp,cx,cy,F.STAIR)||flags(fp,cx,cy,F.SKY))continue;
    const at=physical(fp,cx,cy);
    if(at.renderGroup!==room.group||isOutdoorZone(fp.zoneAt(cx,cy)))continue;
    best={x:cx,y:cy,floor:fp.floorAt(cx,cy),zone:fp.zoneAt(cx,cy),offsetM:Math.sqrt(d)*CELL};bestD=d;
  }
  return best;
}

function lineInRoom(fp,anchor,c) {
  const d=Math.hypot(c.x-anchor.x,c.y-anchor.y),n=Math.ceil(d*2);
  const rakedHall=anchor.zone===ZONE.hall;
  for(let i=0;i<=n;i++) {
    const t=n?i/n:0,x=Math.floor(anchor.x+.5+(c.x-anchor.x)*t),y=Math.floor(anchor.y+.5+(c.y-anchor.y)*t);
    if(fp.isSolid(x,y)||fp.isCollisionOnly?.(x,y)||fp.doorAt?.(x,y)||!rakedHall&&flags(fp,x,y,F.STAIR))return false;
    if((!rakedHall&&Math.abs(fp.floorAt(x,y)-anchor.floor)>.07)||fp.zoneAt(x,y)!==anchor.zone)return false;
  }
  return true;
}

function defaultFinish(run) {
  if([ZONE.foyer,ZONE.hall,ZONE.natatorium,ZONE.chapel,ZONE.chapelOuter].includes(run.zone))return 'public';
  if([ZONE.plant,ZONE.getIn,ZONE.store].includes(run.zone)||run.renderGroup==='basement'&&run.zone===ZONE.none)return 'service';
  return 'staff';
}

function mounted(id,mesh,c,{along=null,elevation=0,scaleX=1,...extra}={}) {
  const axis=c.nx?'y':'x',position=along??(axis==='x'?c.x+.5:c.y+.5);
  // resolveContacts only changes the normal-axis render offset. The half-cell
  // tangential offset puts the fixture in the centre of its actual wall face.
  return {id,mesh,x:metres(c.x),y:metres(c.y),yaw:yawFromNormal(c.nx,c.ny),scale:1,
    scaleX,elevation,renderOffsetX:axis==='x'?(position-c.x)*CELL:0,
    renderOffsetZ:axis==='y'?(position-c.y)*CELL:0,
    mount:'wall',mountNormal:{nx:c.nx,ny:c.ny},mountSearchCells:0,frontAxis:'+z',
    renderGroups:[c.renderGroup],interactive:false,structural:true,blocks:false,
    architectureFitting:true,...extra};
}

export function architectureReservedHostBoxes(reservations=ARCHITECTURE_HOST_RESERVATIONS,bounds=PROP_BOUNDS) {
  return reservations.map(host=>{
    const box=bounds[host.mesh]||host.bounds,c=Math.cos(host.yaw||0),s=Math.sin(host.yaw||0),points=[];
    for(const x of[box.min[0],box.max[0]])for(const y of[box.min[1],box.max[1]])for(const z of[box.min[2],box.max[2]])
      points.push([host.position[0]+c*x-s*z,host.position[1]+y,host.position[2]+s*x+c*z]);
    return {...host,min:[0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]))),
      max:[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis])))};
  });
}

function fixtureClearsHosts(run,c,spec,elevation,hosts) {
  const width=spec.w,depth=spec.d,bottom=run.floor+elevation;
  // Kit geometry has its back at localZ=0. Resolve the exact same masonry
  // plane as wallContactAt, then reserve its whole advertised projection.
  const x=(c.x+(c.nx<0?1:c.nx===0?.5:0))*CELL;
  const z=(c.y+(c.ny<0?1:c.ny===0?.5:0))*CELL;
  const min=c.nx?[Math.min(x,x+c.nx*depth),bottom,z-width/2]
    :[x-width/2,bottom,Math.min(z,z+c.ny*depth)];
  const max=c.nx?[Math.max(x,x+c.nx*depth),bottom+spec.h,z+width/2]
    :[x+width/2,bottom+spec.h,Math.max(z,z+c.ny*depth)];
  return !hosts.some(host=>host.group===run.renderGroup
    &&min.every((value,axis)=>value<host.max[axis]+host.clearance)
    &&max.every((value,axis)=>value>host.min[axis]-host.clearance));
}

export function architectureFittingsPlan(fp,{doors=fp.doorState?.()||[],schedule=ARCHITECTURE_ROOM_SCHEDULE,
  hostReservations=ARCHITECTURE_HOST_RESERVATIONS,hostBounds=PROP_BOUNDS,trimClearances=ARCHITECTURE_TRIM_CLEARANCES}={}) {
  const runs=architectureWallRuns(fp),placements=[],rooms=[];
  const reservedHosts=architectureReservedHostBoxes(hostReservations,hostBounds);
  const contexts=schedule.map(room=>({room,anchor:room.treatment==='retain-specialist'||room.treatment==='aggregate'?null:openAnchor(fp,room)}));
  const occupied=[];
  const samePlane=(a,b)=>a.renderGroup===b.renderGroup&&a.nx===b.nx&&a.ny===b.ny&&a.along===b.along&&Math.abs(a.floor-b.floor)<.05;
  const reserve=(run,centre,width,bottom,height)=>occupied.push({run,centre,width,bottom,height});
  const available=(run,centre,width,bottom,height)=>!occupied.some(o=>samePlane(o.run,run)
    &&Math.abs(o.centre-centre)*CELL<(o.width+width)/2+.13
    &&bottom<o.bottom+o.height+.07&&bottom+height>o.bottom-.07);
  const canFit=(run,centre,width)=>centre*CELL-width/2>=run.from*CELL+.14
    &&centre*CELL+width/2<=run.to*CELL-.14;

  // Horizontal profiles are shared meshes. Scaling changes only their length;
  // their moulding section, projection and contact depth remain unchanged.
  for(const [i,run] of runs.entries()) {
    const centre=(run.from+run.to)/2,c=run.cells[Math.floor((run.cells.length-1)/2)];
    const nearby=contexts.filter(v=>v.anchor&&v.room.group===run.renderGroup
      &&Math.abs(v.anchor.floor-run.floor)<.07&&v.anchor.zone===run.zone
      &&lineInRoom(fp,v.anchor,c)).sort((a,b)=>Math.hypot(a.anchor.x-c.x,a.anchor.y-c.y)-Math.hypot(b.anchor.x-c.x,b.anchor.y-c.y));
    const finish=nearby[0]?.room.finish||defaultFinish(run),length=(run.to-run.from)*CELL-.04;
    const base=`architecture-trim-${run.renderGroup}-${i}`;
    const trimMesh=finish==='service'?'arch_rubbing_strip_service':`arch_dado_${finish}`;
    const plane=(run.axis==='x'?c.y+(c.ny<0?1:0):c.x+(c.nx<0?1:0))*CELL;
    const from=run.from*CELL+.02,to=run.to*CELL-.02;
    const cuts=trimClearances.filter(cut=>cut.group===run.renderGroup&&cut.axis===run.axis
      &&cut.nx===run.nx&&cut.ny===run.ny&&cut.finish===finish&&Math.abs(cut.floor-run.floor)<.01
      &&Math.abs(cut.plane-plane)<1e-6&&cut.from<to&&cut.to>from).sort((a,b)=>a.from-b.from);
    let cursor=from,segment=0;
    const emit=(a,b,mesh,suffix)=>{
      if(b-a<1e-6)return;
      const id=segment++===0?`${base}-dado`:`${base}-dado-${suffix}`;
      placements.push(mounted(id,mesh,c,{along:(a+b)/(2*CELL),scaleX:b-a,
        elevation:finish==='service'?.82:0,category:'finish',finish,wallRun:i}));
    };
    if(!cuts.length)placements.push(mounted(`${base}-dado`,trimMesh,c,
      {along:centre,scaleX:length,elevation:finish==='service'?.82:0,category:'finish',finish,wallRun:i}));
    else {
      for(const cut of cuts){
        const a=Math.max(cursor,cut.from),b=Math.min(to,cut.to);
        if(b<=a)continue;
        emit(cursor,a,trimMesh,`section-${segment}`);
        emit(a,b,cut.mesh,`clearance-${cut.id}`);cursor=b;
      }
      emit(cursor,to,trimMesh,`section-${segment}`);
    }
    if(finish!=='service') {
      const h=finish==='public'?.18:.09;
      placements.push(mounted(`${base}-coving`,`arch_coving_${finish}`,c,
        {along:centre,scaleX:length,elevation:run.ceiling-run.floor-h,category:'finish',finish,wallRun:i}));
    }
  }

  for(const {room,anchor} of contexts) {
    const entry={id:room.id,label:room.label,status:room.status,treatment:room.treatment,finish:room.finish,
      anchor:anchor?{x:metres(anchor.x),y:metres(anchor.y),offsetM:anchor.offsetM}:null,placements:[],unplaced:[]};
    rooms.push(entry);
    if(room.treatment==='retain-specialist'||room.treatment==='aggregate')continue;
    if(!anchor){entry.unplaced.push('paper anchor has no compatible open cell within six metres');continue;}
    const roomRuns=runs.filter(run=>run.renderGroup===room.group&&run.zone===anchor.zone
      &&(anchor.zone===ZONE.hall||Math.abs(run.floor-anchor.floor)<.07));
    const roomDoors=doors.filter(d=>room.doorIds.includes(d.id));
    const place=(suffix,mesh,elevation,{nearDoor=false,category='services',height=null}={})=>{
      const spec=ARCHITECTURE_FITTING_MESHES[mesh],width=spec.w,h=height??spec.h;
      let best=null,cost=Infinity;
      for(const run of roomRuns)for(const c of run.cells) {
        const centre=(run.axis==='x'?c.x:c.y)+.5;
        if(!canFit(run,centre,width)||elevation+h>run.ceiling-run.floor-.08)continue;
        if(!available(run,centre,width,elevation,h)||!lineInRoom(fp,anchor,c))continue;
        if(!fixtureClearsHosts(run,c,{...spec,h},elevation,reservedHosts))continue;
        const d=Math.hypot(c.x-anchor.x,c.y-anchor.y);
        const doorD=roomDoors.length?Math.min(...roomDoors.map(door=>Math.hypot(c.x-door.cx,c.y-door.cy))):d;
        // Avoid the aperture and complete moving-leaf sweep, not only its cell.
        if(doors.some(door=>Math.abs((door.floor??fp.floorAt(door.cx,door.cy))-run.floor)<.3
          &&Math.hypot(c.x+.5-door.cx,c.y+.5-door.cy)*CELL<(door.aperture?.width||1.1)/2+width/2+.65))continue;
        const score=nearDoor?doorD+d*.20:d;
        if(score<cost){best={run,c,centre};cost=score;}
      }
      if(!best){entry.unplaced.push(suffix);return null;}
      const id=`architecture-${room.id.replace(':','-')}-${suffix}`;
      const p=mounted(id,mesh,best.c,{elevation,roomId:room.id,category,finish:room.finish,power:'isolated'});
      placements.push(p);entry.placements.push(id);reserve(best.run,best.centre,width,elevation,h);return p;
    };
    const electrical=room.electrical||(room.finish==='service'?'service':room.finish);
    place('switch',`arch_switch_${electrical}`,1.22,{nearDoor:true,category:'electrical'});
    place('socket-a',`arch_socket_${electrical}`,room.socketHeight??.30,{category:'electrical'});
    if(room.treatment!=='circulation')place('socket-b',`arch_socket_${electrical}`,room.socketHeight??.30,{category:'electrical'});
    const headroom=ceiling(fp,anchor.x,anchor.y)-anchor.floor;
    if(room.treatment!=='circulation') {
      // The detector is actually on the room's ceiling, including very tall
      // spaces. Nothing is lowered to eye level merely to improve the count.
      const id=`architecture-${room.id.replace(':','-')}-detector`;
      placements.push({id,mesh:'arch_smoke_detector',x:metres(anchor.x),y:metres(anchor.y),yaw:0,scale:1,
        elevation:headroom-.0835,renderOffsetX:CELL/2,renderOffsetZ:CELL/2,
        renderGroups:[room.group],mount:'ceiling',interactive:false,blocks:false,structural:true,
        architectureFitting:true,roomId:room.id,category:'fire',power:'isolated'});
      entry.placements.push(id);
    }
    if(room.treatment==='circulation'||room.status==='public') {
      place('callpoint','arch_fire_callpoint',1.28,{nearDoor:true,category:'fire'});
      place('sounder','arch_alarm_sounder',Math.min(2.25,headroom-.4),{nearDoor:true,category:'fire'});
    }
    if(room.treatment!=='circulation'&&room.heating==='radiator')
      place('radiator',`arch_radiator_${room.finish==='public'?'public':'staff'}`,.04,{category:'hvac'});
    place('grille','arch_vent_grille',Math.min(2.28,headroom-.48),{category:'hvac'});
    if(room.finish==='service')place('access','arch_access_hatch',.94,{category:'maintenance'});
    place('use-wear',room.finish==='service'?'arch_wall_repair_service':`arch_wall_wear_${room.finish}`,.20,{category:'wear'});
  }

  for(const door of doors) {
    const at=physical(fp,door.cx,door.cy);
    if(!GROUPS.has(at.renderGroup)||fp.isSolid(door.cx,door.cy)||flags(fp,door.cx,door.cy,F.STAIR))continue;
    const c={x:Math.round(door.cx),y:Math.round(door.cy)},origin=physical(fp,c.x,c.y);
    const finish=/hall|chapel|public|pool/.test(`${door.archetype} ${door.construction}`)?'public'
      :/service|steel|goods/.test(`${door.archetype} ${door.construction}`)?'service':'staff';
    placements.push({id:`architecture-threshold-${door.id}`,mesh:`arch_threshold_${finish}`,
      x:metres(c.x),y:metres(c.y),yaw:door.widthAxis==='x'?0:Math.PI/2,scale:1,scaleX:door.aperture?.width||1.1,
      floorOverride:at.y??fp.floorAt(door.cx,door.cy),elevation:.001,
      renderOffsetX:(at.x-origin.x)*CELL,renderOffsetZ:(at.z-origin.z)*CELL,
      renderGroups:[at.renderGroup],interactive:false,blocks:false,structural:true,
      architectureFitting:true,category:'threshold',finish,doorId:door.id});
  }
  return {placements,rooms,statistics:{wallRuns:runs.length,placements:placements.length,
    rooms:rooms.length,relocatedAnchors:rooms.filter(r=>r.anchor?.offsetM>0).length,
    unresolvedRooms:rooms.filter(r=>r.unplaced.length).map(r=>({id:r.id,unplaced:r.unplaced})),
    categories:placements.reduce((out,p)=>(out[p.category]=(out[p.category]||0)+1,out),{})}};
}

export function architectureFittings(fp,options) {return architectureFittingsPlan(fp,options).placements;}
