import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { ARCHITECTURE_FITTING_MESHES, ARCHITECTURE_ROOM_SCHEDULE, ARCHITECTURE_HOST_RESERVATIONS, ARCHITECTURE_TRIM_CLEARANCES } from '../src/data/architecture-fittings.js';
import { BUILDING_AMENITY_PROPS } from '../src/data/building-amenities.js';
import { architectureFittingsPlan, architectureWallRuns, architectureReservedHostBoxes } from '../src/world/architecture-fittings.js';
import { buildArchitectureFittings } from '../tools/chunk_surfer/architecture-fittings-geometry.mjs';
import { buildBuildingAmenities } from '../tools/chunk_surfer/building-amenities-geometry.mjs';
import { propWallPose } from '../src/world/prop-wall-pose.js';
import { wallContactAt } from '../src/world/wall-contact.js';
import { CELL, F, ZONE } from '../src/data/floorplan/legend.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

function recordGeometry() {
  const meshes=new Map(),materials=[],api={materials,mesh(name){
    assert.ok(!meshes.has(name),`unique mesh ${name}`);
    const m={name,shapes:[]};meshes.set(name,m);return m;
  }};
  for(const kind of['Box','Beam','Cylinder','Ellipsoid'])api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
  buildArchitectureFittings(api);return {meshes,materials};
}
const geometry=recordGeometry();
function shapeBounds({kind,args:a}) {
  let points=[];
  if(kind==='Box') {
    const yaw=a[3]||0,pitch=a[4]||0;
    for(const x of[-a[1][0]/2,a[1][0]/2])for(const y of[-a[1][1]/2,a[1][1]/2])for(const z of[-a[1][2]/2,a[1][2]/2]) {
      const py=y*Math.cos(pitch)-z*Math.sin(pitch),pz=y*Math.sin(pitch)+z*Math.cos(pitch);
      points.push([a[0][0]+x*Math.cos(yaw)-pz*Math.sin(yaw),a[0][1]+py,a[0][2]+x*Math.sin(yaw)+pz*Math.cos(yaw)]);
    }
  } else if(kind==='Beam') {
    const v=a[1].map((q,i)=>q-a[0][i]),len=Math.hypot(...v)||1,u=v.map(q=>q/len),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    let s=cross(u,ref),sl=Math.hypot(...s);s=s.map(q=>q/sl);const t=cross(s,u);
    for(const p of[a[0],a[1]])for(const ds of[-1,1])for(const dt of[-1,1])points.push(p.map((q,i)=>q+s[i]*ds*a[2]/2+t[i]*dt*a[2]/2));
  } else {
    const extent=kind==='Cylinder'?[a[1],a[2]/2,a[1]]:a[1];
    for(const dx of[-1,1])for(const dy of[-1,1])for(const dz of[-1,1])points.push(a[0].map((q,i)=>q+extent[i]*[dx,dy,dz][i]));
  }
  return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};
}
function meshBounds(mesh) {
  const boxes=mesh.shapes.map(shapeBounds);
  return {min:[0,1,2].map(i=>Math.min(...boxes.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...boxes.map(b=>b.max[i])))};
}
const bounds=Object.fromEntries([...geometry.meshes].map(([name,m])=>[name,meshBounds(m)]));

test('the finite room schedule accounts for every map space, recording target and tower landmark',()=>{
  const actual=ARCHITECTURE_ROOM_SCHEDULE.map(s=>s.id).sort();
  const expected=[...BUILDING_MAP.spaces,...BUILDING_MAP.targets,...BUILDING_MAP.landmarks].map(s=>s.id).sort();
  assert.deepEqual(actual,expected);assert.equal(new Set(actual).size,actual.length);
  const byId=Object.fromEntries(ARCHITECTURE_ROOM_SCHEDULE.map(s=>[s.id,s]));
  assert.equal(byId['space:faculty-office-west'].status,'privileged-staff');
  assert.equal(byId['space:faculty-office-west'].finish,'public');
  assert.equal(byId['space:plant-room'].finish,'service');
  assert.equal(byId['target:the_tub'].heating,'air');
  assert.equal(byId['space:academic-roof'].treatment,'retain-specialist');
  assert.ok(ARCHITECTURE_ROOM_SCHEDULE.every(s=>s.power==='isolated'));
});

test('every registry member has real bounded geometry, shared materials and no invented emissive circuit',()=>{
  assert.deepEqual([...geometry.meshes.keys()].sort(),Object.keys(ARCHITECTURE_FITTING_MESHES).sort());
  assert.equal(geometry.materials.length,9,'material families are reused across all fittings');
  assert.ok(geometry.materials.every(m=>!m.emissiveFactor));
  const failures=[];
  for(const [name,spec] of Object.entries(ARCHITECTURE_FITTING_MESHES)) {
    const b=bounds[name];assert.ok(geometry.meshes.get(name).shapes.length>=2,name);
    if(b.max[0]-b.min[0]>spec.w+.001)failures.push(`${name} width ${b.max[0]-b.min[0]} > ${spec.w}`);
    if(b.max[1]-b.min[1]>spec.h+.001)failures.push(`${name} height ${b.max[1]-b.min[1]} > ${spec.h}`);
    if(b.max[2]-b.min[2]>spec.d+.001)failures.push(`${name} depth ${b.max[2]-b.min[2]} > ${spec.d}`);
    if(spec.mount==='wall') {
      assert.ok(b.min[2]>=-1e-8,`${name} back is on its host plane`);
      assert.ok(b.max[2]<=.18,`${name} is contained within the existing wall contact margin`);
    }
  }
  assert.deepEqual(failures,[],'geometry agrees with every advertised footprint and mounting budget');
});

test('the hardware carries readable construction rather than featureless box proxies',()=>{
  for(const kind of['public','staff','service']) {
    const socket=geometry.meshes.get(`arch_socket_${kind}`);
    assert.equal(socket.shapes.filter(s=>s.kind==='Box'&&s.args[2]===6&&s.args[1][0]<.02&&s.args[1][1]>.02).length,6,'six deep socket slots');
    const toggle=geometry.meshes.get(`arch_switch_${kind}`).shapes.find(s=>s.kind==='Box'&&s.args[4]===-.17);
    assert.ok(toggle,'the isolated toggle has a tilted three-dimensional lever');
  }
  assert.equal(geometry.meshes.get('arch_smoke_detector').shapes.filter(s=>s.kind==='Box'&&s.args[2]===6).length,12);
  for(const kind of['public','staff'])assert.equal(geometry.meshes.get(`arch_radiator_${kind}`).shapes.filter(s=>s.kind==='Ellipsoid').length,12,'twelve separated radiator flutes');
  assert.equal(geometry.meshes.get('arch_vent_grille').shapes.filter(s=>s.kind==='Box'&&s.args[4]===.28).length,7);
});

function grid({door=false,stairs=false,raised=false,aperture=false}={}) {
  const solid=(x,y)=>x<1||y<1||x>=31||y>=13;
  return {
    planSize:()=>({w:32,h:14}),isSolid:(x,y)=>solid(Math.floor(x),Math.floor(y)),
    floorAt:(x,y)=>raised&&y<3?.8:0,ceilAt:()=>3.6,zoneAt:()=>ZONE.practice,materialAt:()=>0,
    doorAt:(x,y)=>door&&Math.floor(x)===15&&Math.floor(y)===1?{id:'test-door'}:null,
    hasFlag:(x,y,f)=>stairs&&f===F.STAIR&&x>=20,
    isCollisionOnly:(x,y)=>aperture&&Math.floor(y)===1&&x>=11&&x<20,
    logicalToPhysical:(x,y)=>({x,z:y,y:0,renderGroup:'upper'}),
  };
}
const room=Object.freeze({id:'space:fixture',label:'Fixture room',logical:{x:7,y:3},group:'upper',finish:'staff',status:'working-staff',treatment:'room',heating:'radiator',doorIds:[]});

test('a controlled wall opening, stair and raised floor split hosts instead of drawing trim across them',()=>{
  const plain=architectureWallRuns(grid());assert.ok(plain.some(r=>r.axis==='x'&&r.from<15&&r.to>15));
  const opening=architectureWallRuns(grid({door:true}));
  assert.ok(opening.every(r=>!r.cells.some(c=>c.x===15&&c.y===1)),'no wall profile crosses the opening cell');
  const stairs=architectureWallRuns(grid({stairs:true}));assert.ok(stairs.every(r=>r.cells.every(c=>c.x<20)));
  const raised=architectureWallRuns(grid({raised:true}));
  assert.ok(raised.every(r=>r.cells.every(c=>Math.abs(c.floor-r.floor)<.001)),'profiles do not bridge floor changes');
  const report=architectureFittingsPlan(grid(),{schedule:[room],doors:[]});
  assert.deepEqual(report.statistics.unresolvedRooms,[]);
  assert.deepEqual(report,architectureFittingsPlan(grid(),{schedule:[room],doors:[]}),'selection and IDs are deterministic');
});

test('collision-only aperture cells cannot host trim, services or a room anchor',()=>{
  const fp=grid({aperture:true}),runs=architectureWallRuns(fp);
  assert.ok(runs.length>0);
  assert.ok(runs.every(run=>run.cells.every(c=>!fp.isCollisionOnly(c.x,c.y))),'window-like air intervals split ordinary trim runs');
  const report=architectureFittingsPlan(fp,{schedule:[{...room,logical:{x:7,y:.5}}],doors:[]});
  assert.deepEqual(report.statistics.unresolvedRooms,[]);
  const anchor=report.rooms[0].anchor;
  assert.ok(anchor.offsetM>0&&!fp.isCollisionOnly(anchor.x*2,anchor.y*2),'a marker inside an aperture moves to usable interior');
  for(const p of report.placements)assert.ok(!fp.isCollisionOnly(Math.round(p.x*2),Math.round(p.y*2)),`${p.id} remains outside the aperture`);
});

let production;
function building() {
  if(!production) {
    FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
      widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
      edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
    production=architectureFittingsPlan(FP);
  }
  return production;
}

test('production room fittings have open anchors, true wall contact and bounded projection while preserving stairs',()=>{
  const result=building();
  assert.ok(result.placements.length>700&&result.placements.length<1500,'bounded shared kit, not unbounded per-cell clutter');
  assert.equal(new Set(result.placements.map(p=>p.id)).size,result.placements.length);
  assert.deepEqual(result.statistics.unresolvedRooms,[],'every applicable room has the scheduled routine kit');
  for(const p of result.placements) {
    const x=Math.round(p.x*2),y=Math.round(p.y*2);
    assert.ok(!FP.isSolid(x,y),`${p.id} anchor is in open plan space`);
    assert.ok(!FP.isCollisionOnly(x,y),`${p.id} never uses a window opening or mesh-owned collision-only volume as its interior`);
    assert.equal(p.blocks,false);assert.equal(p.interactive,false);
    assert.ok(!FP.hasFlag(x,y,F.STAIR),`${p.id} does not occupy a stair or rake cell`);
    if(p.mount!=='wall')continue;
    assert.ok(FP.isSolid(x-p.mountNormal.nx,y-p.mountNormal.ny),`${p.id} has masonry behind it`);
    const contact=wallContactAt(FP,x+.5,y+.5,{prefer:p.mountNormal,searchCells:p.mountSearchCells});assert.ok(contact,p.id);
    const pose=propWallPose(p,bounds[p.mesh],contact);
    if(pose.x!==null)assert.ok(Math.abs(pose.x-contact.planeX)<1e-7,`${p.id} back touches the x wall`);
    if(pose.y!==null)assert.ok(Math.abs(pose.y-contact.planeY)<1e-7,`${p.id} back touches the y wall`);
    const h=bounds[p.mesh].max[1]+p.elevation;
    assert.ok(h<=FP.ceilAt(x,y)-FP.floorAt(x,y)+.011,`${p.id} fits below its actual ceiling`);
  }
  assert.ok(architectureWallRuns(FP).every(run=>run.cells.every(c=>!FP.isCollisionOnly(c.x,c.y))),
    'production window apertures cannot emit a dado/coving across their clear opening');
});

test('detectors touch their actual ceiling and thresholds preserve portal width and shallow step height',()=>{
  const {placements,rooms}=building();
  for(const p of placements.filter(p=>p.mount==='ceiling')) {
    const x=Math.round(p.x*2),y=Math.round(p.y*2);
    assert.ok(Math.abs(p.elevation+bounds[p.mesh].max[1]-(FP.ceilAt(x,y)-FP.floorAt(x,y)))<1e-6,p.id);
  }
  const doors=new Map(FP.doorState().map(d=>[d.id,d]));
  for(const p of placements.filter(p=>p.category==='threshold')) {
    const d=doors.get(p.doorId);assert.equal(p.scaleX,d.aperture.width);
    assert.ok(bounds[p.mesh].max[1]+p.elevation<.02,'a threshold does not introduce a collision step');
  }
  assert.ok(rooms.some(r=>r.anchor?.offsetM>0),'stale paper anchors are surfaced, not hidden');
  for(const r of rooms.filter(r=>r.treatment==='retain-specialist'||r.treatment==='aggregate'))assert.equal(r.placements.length,0,'specialist architecture is not duplicated');
});

test('new services retain the baths admission sequence and stay outside every nearby door swing envelope',()=>{
  const {placements}=building(),doors=FP.doorState();
  for(const p of placements) {
    const x=Math.round(p.x*2),y=Math.round(p.y*2);
    if(FP.zoneAt(x,y)===ZONE.natatorium)assert.ok(p.y>=32.4,'the existing admission sequence owns the dry lead-in');
    if(p.mount!=='wall'||p.category==='finish')continue;
    const floor=FP.floorAt(x,y),width=ARCHITECTURE_FITTING_MESHES[p.mesh].w;
    for(const door of doors)if(Math.abs(FP.floorAt(door.cx,door.cy)-floor)<.3)
      assert.ok(Math.hypot(x+.5-door.cx,y+.5-door.cy)*CELL>=(door.aperture.width/2+width/2+.65)-1e-7,
        `${p.id} clears ${door.id} and its complete swing envelope`);
  }
});

function resolvedFixtureBox(p) {
  const x=Math.round(p.x*2),y=Math.round(p.y*2),contact=wallContactAt(FP,x+.5,y+.5,{prefer:p.mountNormal,searchCells:p.mountSearchCells});
  assert.ok(contact,p.id);const pose=propWallPose(p,bounds[p.mesh],contact);
  const px=pose.x===null?p.x+(p.renderOffsetX||0):pose.x*CELL;
  const pz=pose.y===null?p.y+(p.renderOffsetZ||0):pose.y*CELL;
  const floor=FP.floorAt(x,y)+p.elevation,c=Math.cos(pose.yaw),s=Math.sin(pose.yaw),b=bounds[p.mesh],points=[];
  for(const lx of[b.min[0],b.max[0]])for(const ly of[b.min[1],b.max[1]])for(const lz of[b.min[2],b.max[2]])
    points.push([px+c*lx-s*lz,floor+ly,pz+s*lx+c*lz]);
  return {min:[0,1,2].map(axis=>Math.min(...points.map(v=>v[axis]))),max:[0,1,2].map(axis=>Math.max(...points.map(v=>v[axis])))};
}
const boxesOverlap=(a,b,pad=0)=>a.min.every((v,axis)=>v<b.max[axis]+pad)&&a.max.every((v,axis)=>v>b.min[axis]-pad);

test('explicit host reservations agree with the actual authored furniture and resolved mounting poses',()=>{
  building();PROPS.propsInit(FP);
  for(const host of ARCHITECTURE_HOST_RESERVATIONS){
    const actual=PROPS.propById(host.propId);assert.ok(actual,host.propId);assert.equal(actual.mesh,host.mesh);
    const position=[actual.rx*CELL+(actual.renderOffsetX||0),actual.floor+(actual.elevation||0),actual.ry*CELL+(actual.renderOffsetZ||0)];
    position.forEach((v,axis)=>assert.ok(Math.abs(v-host.position[axis])<1e-6,`${host.propId}: reservation follows actual resolved pose`));
    assert.ok(Math.abs((actual.yaw||0)-host.yaw)<1e-6,`${host.propId}: reservation follows actual yaw`);
    assert.deepEqual(host.bounds,PROP_BOUNDS[host.mesh],`${host.propId}: measured first-build fallback stays current`);
  }
});

test('the four proven furniture conflicts move to clear wall hosts without removing any room-kit member',()=>{
  const repaired=building(),unreserved=architectureFittingsPlan(FP,{hostReservations:[]});
  const hosts=new Map(architectureReservedHostBoxes().map(host=>[host.propId,host]));
  const cases=[
    ['architecture-space-studio-b2-switch','b2-piano'],
    ['architecture-space-faculty-office-east-switch','occupation-academic-post'],
    ['architecture-space-academic-reception-socket-a','amenity-staff-coat-lockers'],
    ['architecture-space-academic-reception-socket-b','amenity-staff-coat-lockers'],
    ['architecture-space-academic-reception-radiator','amenity-staff-coat-lockers'],
    ['architecture-space-stripped-office-socket-b','amenity-staff-service-connections'],
  ];
  for(const [id,hostId]of cases){
    const before=unreserved.placements.find(p=>p.id===id),after=repaired.placements.find(p=>p.id===id),host=hosts.get(hostId);
    assert.ok(before&&after,`${id}: fitting remains in its original room kit`);
    assert.ok(boxesOverlap(resolvedFixtureBox(before),host),`${id}: regression reconstructs the original host conflict`);
    assert.ok(!boxesOverlap(resolvedFixtureBox(after),host,host.clearance-.002),`${id}: real mounted geometry clears the existing host`);
  }
  assert.deepEqual(repaired.statistics.unresolvedRooms,[],'no reservation suppresses a required fitting');
  assert.deepEqual(repaired.placements.map(p=>p.id).sort(),unreserved.placements.map(p=>p.id).sort(),'all room-kit IDs survive the repair');
  for(const p of repaired.placements.filter(p=>p.mount==='wall'&&p.category!=='finish'))
    for(const host of hosts.values())if(host.group===p.renderGroups[0])
      assert.ok(!boxesOverlap(resolvedFixtureBox(p),host,host.clearance-.002),`${p.id} clears ${host.propId}`);
});

test('the fountain interrupts only its crossing chair rail while the upper profile and other wall hosts remain continuous',()=>{
  const repaired=building(),baseline=architectureFittingsPlan(FP,{trimClearances:[]});
  const cut=ARCHITECTURE_TRIM_CLEARANCES.find(c=>c.propId==='amenity-public-drinking-fountain');
  const fountain=BUILDING_AMENITY_PROPS.find(p=>p.id===cut.propId);
  let fountainGeometry;
  const api={materials:[],MAT:Object.fromEntries(['wood','black','poolBlue','ivory','paper','steel','agedWhite','cloth','navy'].map((name,i)=>[name,i])),
    mesh(name){const m={name,shapes:[]};if(name===fountain.mesh)fountainGeometry=m;return m;}};
  for(const kind of['Box','Beam','Cylinder','Ellipsoid','Quad'])api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
  buildBuildingAmenities(api);
  const back=fountainGeometry.shapes.find(s=>s.kind==='Box'&&s.args[1][0]===.56&&s.args[1][1]===.40&&s.args[1][2]===.025);
  assert.ok(back,'the regression uses the constructed fountain backsplash');
  const worldBox=(p,shape)=>{
    const b=shapeBounds(shape),scale=p.scale??1,c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0),points=[];
    for(const x0 of[b.min[0],b.max[0]])for(const y0 of[b.min[1],b.max[1]])for(const z0 of[b.min[2],b.max[2]]){
      const x=x0*scale*(p.scaleX??1),y=y0*scale*(p.scaleY??1),z=z0*scale*(p.scaleZ??1);
      points.push([p.x+c*x-s*z,p.y+y,p.z+s*x+c*z]);
    }
    return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};
  };
  const render=placements=>{
    PROPS.propsInit(FP,[...placements,fountain]);
    return new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
  };
  const before=render(baseline.placements),backsplash=worldBox(before.get(fountain.id),back);
  const prior=baseline.placements.filter(p=>p.mesh==='arch_dado_public'&&p.category==='finish'
    &&geometry.meshes.get(p.mesh).shapes.some(shape=>boxesOverlap(worldBox(before.get(p.id),shape),backsplash)));
  assert.equal(prior.length,1,'the native finding reconstructs one actual intersecting rail host');
  const old=prior[0],segments=repaired.placements.filter(p=>p.wallRun===old.wallRun&&p.category==='finish'&&p.mesh.startsWith('arch_dado_public'));
  assert.equal(segments.length,3,'only this host is split into two full sections and one local clearance');
  assert.equal(segments.filter(p=>p.mesh===cut.mesh).length,1);
  const after=render(repaired.placements);
  const shapes=segments.flatMap(p=>geometry.meshes.get(p.mesh).shapes.map(shape=>worldBox(after.get(p.id),shape)));
  for(const box of shapes)assert.ok(!boxesOverlap(box,backsplash),'no new profile crosses the actual backsplash volume');
  const centre=segments.find(p=>p.mesh===cut.mesh),pose=after.get(centre.id);
  const centreBox=worldBox(pose,geometry.meshes.get(centre.mesh).shapes[0]);
  assert.ok(Math.abs(centreBox.min[2]-cut.from)<1e-6&&Math.abs(centreBox.max[2]-cut.to)<1e-6);
  assert.ok(backsplash.min[2]-centreBox.min[2]>=.08-1e-6&&centreBox.max[2]-backsplash.max[2]>=.08-1e-6,'both rail ends clear the real fixture by80mm');
  const originalProfile=geometry.meshes.get(old.mesh).shapes.filter(shape=>shape.args[0][1]>2);
  for(const profile of originalProfile){
    const expected=worldBox(before.get(old.id),profile),intervals=shapes.filter(b=>Math.abs(b.min[1]-expected.min[1])<1e-6&&Math.abs(b.max[1]-expected.max[1])<1e-6)
      .map(b=>[b.min[2],b.max[2]]).sort((a,b)=>a[0]-b[0]);
    let end=expected.min[2];
    for(const [from,to]of intervals){assert.ok(from<=end+1e-6,'the higher picture rail has no internal break');end=Math.max(end,to);}
    assert.ok(Math.abs(end-expected.max[2])<1e-6,'the complete prior upper rail length survives');
  }
  const changed=new Set(segments.map(p=>p.id));
  assert.deepEqual(repaired.placements.filter(p=>!changed.has(p.id)),baseline.placements.filter(p=>p.id!==old.id),
    'no other host, coving or room fitting changes');
  PROPS.propsInit(FP);
});
