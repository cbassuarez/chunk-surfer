import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {F,ZONE,ZONE_WORLD,MATERIAL,isOutdoorZone} from '../src/data/floorplan/legend.js';
import {DISTRICT_STREETS,DISTRICT_COURTS,districtLogicalAt} from '../src/data/exterior-district.js';
import * as PROPS from '../src/game/props.js';
import {shouldHideCrossEnvelopeProp} from '../src/game/prop-visibility.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {addBourgeoisPubFrontage} from '../tools/chunk_surfer/exterior-frontage-geometry.mjs';
import {EXTERIOR_PUB as PUB,PUB_LEVELS,PUB_DOORS,PUB_PHYSICAL_COLLIDERS,PUB_COLLIDERS,
  pubWorldFromLocal,pubLocalFromWorld,isPubMeshEnvelopeZone} from '../src/data/exterior-pub.js';
FP.compile(conservatory.levels,conservatory);
const at=(x,z)=>{
  const p=districtLogicalAt(x,z);return{x:p.x*2,y:p.y*2};
};
const physical=p=>{const q=FP.logicalToPhysical(p.x,p.y);return{x:q.x*.5,z:q.z*.5};};
const blocks=(x,z,height=PUB.floor)=>PUB_PHYSICAL_COLLIDERS.some(c=>height>=c.minElevation-.05&&height<=c.maxElevation+.05
  &&Math.abs(x-c.x)<=c.width/2+PUB.collisionBodyMargin&&Math.abs(z-c.z)<=c.depth/2+PUB.collisionBodyMargin);
const canOccupy=p=>{
  if(FP.isSolid(p.x,p.y))return false;const q=physical(p);return !blocks(q.x,q.z,FP.floorAt(p.x,p.y));
};
const key=p=>`${p.x},${p.y}`;
function flood(start,occupancy=canOccupy){
  const seen=new Set([key(start)]),queue=[start];
  while(queue.length){
    const p=queue.pop();
    for(const[dx,dy]of[[0,1],[1,0],[-1,0],[0,-1]]){
      const move=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set()});if(!move.ok)continue;
      const q=move.redirect||{x:p.x+dx,y:p.y+dy},world=physical(q);
      if(world.x< -15||world.x>3||world.z<105.5||world.z>113||seen.has(key(q))||!occupancy(q))continue;
      seen.add(key(q));queue.push(q);
    }
  }
  return seen;
}
const setPublic=open=>PUB.doors.forEach(d=>FP.setDoorOpen(d.id,open));

test('pub doors compile at the exact shell planes with ordinary unkeyed schedules',()=>{
  const state=FP.doorState();
  for(const spec of[...PUB.doors,PUB.wc.door]){
    const door=state.find(d=>d.id===spec.id);assert.ok(door,spec.id);
    const p=physical({x:door.cx,y:door.cy});
    assert.ok(Math.abs(p.x-spec.x)<1e-9&&Math.abs(p.z-spec.z)<1e-9,`${spec.id} portal and shell share one exact plane`);
    assert.equal(door.keyId,null);assert.equal(door.access,'both');assert.equal(door.closer,'none');assert.equal(door.widthAxis,'x');
    if(spec.id==='pub-wc'){
      assert.equal(door.archetype,'practice-acoustic-single');assert.equal(door.open,true);assert.equal(door.hinge,'right');assert.equal(door.leaf.height,2.15);
    }else{
      assert.equal(door.archetype,'public-glazed-pair');assert.equal(door.open,false);assert.deepEqual(door.activeLeaves,[0,1]);assert.equal(door.aperture.width,1.95);
    }
  }
  assert.deepEqual(pubWorldFromLocal({x:-.2,z:-30.75}),{x:-12.75,z:107.25});
  assert.deepEqual(pubWorldFromLocal({x:-.2,z:-22.75}),{x:-4.75,z:107.25});
  const world=pubWorldFromLocal(PUB.interiorOriginLocal);
  assert.ok(Math.abs(world.x-PUB.interiorAnchor.x)<1e-9&&Math.abs(world.z-PUB.interiorAnchor.z)<1e-9);
  const local=pubLocalFromWorld(world);assert.ok(Math.abs(local.x+2.7)<1e-9&&Math.abs(local.z+24)<1e-9);
});

test('pub air has its own indoor floor and ceiling without acquiring outdoor weather flags',()=>{
  assert.equal(ZONE.pub,22);assert.equal(ZONE_WORLD[ZONE.pub],'main_b3');assert.equal(isOutdoorZone(ZONE.pub),false);
  assert.equal(isPubMeshEnvelopeZone(ZONE.pub),true);assert.equal(isPubMeshEnvelopeZone(ZONE.dock),false);
  for(const[x,z]of[[-12,109],[-7,109],[-2,108.5],[-7,112],[.75,111.5]]){
    const p=at(x,z);assert.equal(FP.isSolid(p.x,p.y),false);assert.equal(FP.zoneAt(p.x,p.y),ZONE.pub);
    assert.equal(FP.materialAt(p.x,p.y),MATERIAL.woodVelvet);assert.ok(Math.abs(FP.floorAt(p.x,p.y)-.12)<1e-6);assert.ok(Math.abs(FP.ceilAt(p.x,p.y)-3.52)<1e-6);
    assert.equal(FP.flagsAt(p.x,p.y)&(F.SKY|F.WALLED),0,'indoor air has neither sky nor outdoor wall-envelope flags');
  }
});

test('both closed public doors block street entry, and ordinary interaction opens each pair',()=>{
  setPublic(false);
  const start=at(-12.75,106.75),closed=flood(start);
  assert.equal(closed.has(key(at(-8.75,109.25))),false,'window sills/piers and both closed leaves prevent entry');
  for(const spec of PUB.doors){
    const outside=at(spec.x,106.75),plane=at(spec.x,107.25);
    assert.equal(FP.canStep(outside.x,outside.y,plane.x,plane.y).ok,false,`${spec.id} blocks its real throat while closed`);
    const action=FP.interactDoor(outside.x,outside.y,2,new Set());assert.equal(action.ok,true);assert.equal(action.id,spec.id);
    FP.tickDoors(1.1);
    assert.equal(FP.canStep(outside.x,outside.y,plane.x,plane.y).ok,true,`${spec.id} admits an ordinary forward step after opening`);
  }
  const open=flood(start);
  for(const[x,z]of[[-12.75,108.25],[-4.75,108.25],[-8.75,109.25],[.75,111.25]])assert.ok(open.has(key(at(x,z))),`street reaches ${x},${z}`);
  for(const spec of PUB.doors)assert.ok(open.has(key(at(spec.x,106.75))),`${spec.id} permits ordinary return to the street`);
  FP.tickDoors(120);assert.ok(PUB.doors.every(d=>FP.doorState().find(p=>p.id===d.id).open),'no hidden closer shuts either pair');
});

test('WC oak leaf closes for privacy and reopens from either side without a key',()=>{
  const door=PUB.wc.door,outside=at(door.x,109.25),plane=at(door.x,109.75),inside=at(door.x,110.25);
  FP.setDoorOpen(door.id,false);assert.equal(FP.canStep(outside.x,outside.y,plane.x,plane.y).ok,false);
  assert.equal(FP.interactDoor(outside.x,outside.y,2,new Set()).ok,true);FP.tickDoors(1);
  assert.ok(FP.canStep(outside.x,outside.y,plane.x,plane.y).ok);assert.ok(FP.canStep(plane.x,plane.y,inside.x,inside.y).ok);
  FP.setDoorOpen(door.id,false);assert.equal(FP.interactDoor(inside.x,inside.y,0,new Set()).ok,true);FP.tickDoors(1);
  assert.ok(FP.canStep(inside.x,inside.y,plane.x,plane.y).ok,'the same leaf opens from inside');
});

test('thin shell collision leaves glazing transparent and makes the rear half-grid excess inaccessible',()=>{
  assert.equal(PUB_PHYSICAL_COLLIDERS.length,23);assert.equal(PUB_COLLIDERS.length,23);
  for(let i=0;i<PUB_COLLIDERS.length;i++){
    const a=PUB_PHYSICAL_COLLIDERS[i],b=PUB_COLLIDERS[i],p=districtLogicalAt(a.x,a.z);
    assert.deepEqual([b.x,b.y],[p.x,p.y]);assert.ok(Math.abs(b.width-a.width-2*PUB.collisionBodyMargin)<1e-9&&Math.abs(b.depth-a.depth-2*PUB.collisionBodyMargin)<1e-9);
    assert.equal(b.bodyMargin,PUB.collisionBodyMargin);
  }
  for(const window of PUB.windows){
    assert.equal(blocks(window.x,PUB.frontWorldZ,PUB.floor),true,'a standing body cannot walk through a sill');
    assert.equal(blocks(window.x,PUB.frontWorldZ,PUB.floor+1.62),false,'the head-height glass opening has no opaque full-height collider');
  }
  setPublic(true);const reachable=flood(at(-12.75,106.75));
  for(const k of reachable){const q=physical(Object.fromEntries(['x','y'].map((a,i)=>[a,Number(k.split(',')[i])])));
    assert.ok(q.z<112.45,'raster floor beyond the true back wall is inaccessible');
  }
  assert.equal(canOccupy(at(-6,112.25)),false,'padded back wall stops the body before the raster edge');
});

test('pub raster adds no claims over the existing streets or secondary courts',()=>{
  const intersects=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.z0<b.z1&&a.z1>b.z0;
  for(const level of PUB_LEVELS){
    const r={x0:level.physicalOrigin.x,x1:level.physicalOrigin.x+level.rows[0].length,z0:level.physicalOrigin.y,z1:level.physicalOrigin.y+level.rows.length};
    for(const prior of[...DISTRICT_STREETS,...DISTRICT_COURTS]){
      const extent={x0:prior.x0,x1:prior.x1+1,z0:prior.y0,z1:prior.y1+1};
      assert.equal(intersects(r,extent),false,`${level.id} preserves ${prior.id}`);
    }
  }
  assert.equal(FP.physicalSpanData().overlaps.length,0,'all air/door overrides have explicit physical ownership');
  assert.deepEqual(conservatory.spawn,{x:57,y:207});
  for(const court of DISTRICT_COURTS){const p=at((court.x0+court.x1)/2,(court.y0+court.y1)/2);assert.equal(FP.isSolid(p.x,p.y),false);assert.notEqual(FP.zoneAt(p.x,p.y),ZONE.pub);}
});


test('actual pub shell surfaces and apertures meet the runtime floor, doors and thin-wall contract',()=>{
  const source=CONSERVATORY_PROPS.find(p=>p.id==='district-south-row-a');
  assert.ok(source);PROPS.propsInit(FP,[source]);
  const owner=PROPS.renderInstances({inscriptions:false})[0];
  assert.ok(Math.abs(owner.x-PUB.rowAnchor.x)<1e-9&&Math.abs(owner.z-PUB.rowAnchor.z)<1e-9);
  assert.ok(Math.abs(owner.y-PUB.floor)<1e-6);assert.equal(owner.yaw,-Math.PI/2);
  const materials=[],api={materials,addBox(){},addBeam(){},addCylinder(){},addQuad(){}},m={name:source.mesh};
  const contains=(part,p)=>part.kind==='box'&&p.every((v,i)=>Math.abs(v-part.center[i])<part.size[i]/2-1e-8);
  for(const [deed,z]of[-28,-20].entries()){
    const shell=addBourgeoisPubFrontage(api,m,{z,h:12.8,unitW:8,depth:5.4});
    const rear=shell.parts.find(p=>p.id==='pub-real-rear-wall'),ceiling=shell.parts.find(p=>p.id==='pub-ground-ceiling');
    assert.ok(Math.abs(pubWorldFromLocal({x:rear.center[0]-rear.size[0]/2,z}).z-PUB.bounds.z1)<1e-9);
    assert.ok(Math.abs(pubWorldFromLocal({x:rear.center[0]+rear.size[0]/2,z}).z-112.25)<1e-9);
    assert.ok(Math.abs(owner.y+ceiling.center[1]-ceiling.size[1]/2-PUB.ceiling)<1e-6);
    const walls=shell.parts.filter(p=>p.id.startsWith('pub-ground-split-shell'));
    assert.ok(walls.length>0);
    for(const wall of walls)assert.ok(Math.abs(pubWorldFromLocal({x:wall.center[0]+wall.size[0]/2,z}).z-PUB.frontWorldZ)<1e-9);
    for(const aperture of shell.groundApertures){
      const world=pubWorldFromLocal({x:aperture.x,z:aperture.z});
      const spec=(aperture.kind==='entry'?PUB.doors:PUB.windows).find(p=>Math.abs(p.x-world.x)<1e-8);
      assert.ok(spec,`${aperture.kind} has a matching authored runtime opening`);
      assert.ok(Math.abs(world.z-PUB.frontWorldZ)<1e-9);
      assert.ok(aperture.width>=spec.width-1e-9,'static shell admits the full runtime aperture');
      if(aperture.kind==='window'){
        assert.equal(aperture.y0,PUB.windowOpening.bottom);assert.equal(aperture.y1,PUB.windowOpening.top);
        for(const x of[-.48,-.3,-.205])for(const y of[1.35,1.85,2.25])
          assert.equal(walls.some(p=>contains(p,[x,y,aperture.z])),false,'split masonry leaves a real view through each window');
      }
    }
    const entrance=shell.groundApertures.find(p=>p.kind==='entry');
    for(let x=-.65;x<=.5;x+=.1)for(const y of[.3,.75,1.62,2.0])for(const dz of[-.975,-.75,-.5,0,.5,.75,.975])
      assert.equal(shell.parts.some(p=>contains(p,[x,y,entrance.z+dz])),false,'projecting joinery preserves the full1.95m approach');
    assert.equal(shell.staticDoorLeaves,0,`deed${deed} leaves opening and collision to the ordinary dynamic pair`);
  }
});


test('integrated prop collision prevents closed-door bypasses and permits public, staff and WC use',()=>{
  PROPS.propsInit(FP,[]);
  // propCanOccupy samples the body at logical+.5 runtime cell. Account for
  // that .25m centre explicitly rather than confusing it with the camera.
  const bodyAt=(x,z)=>at(x-.25,z-.25);
  const runtimeOccupancy=p=>PROPS.propCanOccupy(p.x,p.y);
  for(const phase of[0,.25]){
    setPublic(false);
    const start=bodyAt(-12.75+phase,106.75+phase),closed=flood(start,runtimeOccupancy);
    assert.equal(closed.has(key(bodyAt(-8.75+phase,108.75+phase))),false,'thin west pier cannot be skirted outside the closed door raster');
    setPublic(true);
    const open=flood(start,runtimeOccupancy);
    for(const[x,z]of[[-12.75,108.25],[-4.75,108.25],[-8.75,108.75]])
      assert.ok(open.has(key(bodyAt(x+phase,z+phase))),`public route reaches ${x+phase},${z+phase}`);
  }
  const walk=points=>{
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1);let prev=bodyAt(...a);
      assert.ok(runtimeOccupancy(prev),`standing start ${a}`);
      for(let n=1;n<=steps;n++){
        const body=[a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps],q=bodyAt(...body);
        assert.ok(FP.canStep(prev.x,prev.y,q.x,q.y,{keys:new Set()}).ok,`ordinary floor step ${body}`);
        assert.ok(runtimeOccupancy(q),`actual furniture/wall clearance ${body}`);prev=q;
      }
    }
  };
  walk([[-12.75,108.25],[-7.4,108.25],[-7.4,111.55],[-1.0,111.55]]);
  FP.setDoorOpen(PUB.wc.door.id,true);
  walk([[-4.75,108.25],[.75,108.25],[.75,110.25],[1.05,110.25],[1.05,110.8]]);
  const outside=bodyAt(.75,109.25),inside=bodyAt(.75,110.25);
  FP.setDoorOpen(PUB.wc.door.id,false);
  assert.equal(FP.interactDoor(inside.x,inside.y,0,new Set()).id,PUB.wc.door.id,'privacy leaf can be reopened from the usable WC standing area');
  FP.tickDoors(1);FP.setDoorOpen(PUB.wc.door.id,false);
  assert.equal(FP.interactDoor(outside.x,outside.y,2,new Set()).id,PUB.wc.door.id,'the same privacy leaf can be reopened from the public aisle');
  FP.tickDoors(1);
});


test('street and pub render slices retain mesh-owned ground without ray walls or parquet occlusion',()=>{
  const index=(slice,x,z)=>(Math.floor(z*2)-slice.originY)*slice.w+Math.floor(x*2)-slice.originX;
  const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} != ${b}`);
  for(const observer of[at(-12.75,106.25),at(-8.75,108.75)]){
    const slice=FP.physicalRenderPlanFor(observer.x,observer.y);
    for(let x=-13.5;x<=1.5;x+=.5)for(let z=107.5;z<=112;z+=.5){
      const i=index(slice,x,z),p=at(x,z);
      assert.equal(slice.solid[i],0,'no invented ray wall inside the authored pub shell');
      assert.equal(slice.zone[i],ZONE.pub,'pub support spans survive filtering from both sides of the front');
      close(slice.floor[i],PUB.floor-PUB.renderUnderlayDrop,'quantization-safe support underlay');
      assert.ok(FP.decodeH(slice.rgba[i*4])<PUB.floor+.012,'the encoded support floor stays below the actual parquet');
      close(slice.ceil[i],24,'the visible mesh owns ceiling and walls');
      assert.ok(slice.flags[i]&F.SKY,'the visual envelope has no opaque ray-marched ceiling step');
      close(FP.floorAt(p.x,p.y),PUB.floor,'navigation support remains true');
      close(FP.ceilAt(p.x,p.y),PUB.ceiling,'navigation headroom remains true');
      assert.equal(FP.flagsAt(p.x,p.y)&F.SKY,0,'logical weather flags remain indoors');
      assert.equal(isOutdoorZone(FP.zoneAt(p.x,p.y)),false);
    }
    for(const[x,z]of[[-12,105],[0,105],[20,105]]){
      const i=index(slice,x,z),p=at(x,z);assert.equal(slice.solid[i],0,'the street remains visible through the real front openings');
      close(slice.floor[i],FP.floorAt(p.x,p.y),'street support stays at its authored grade');
    }
    assert.equal(slice.solid[index(slice,5,110)],0,'neighboring mesh-owned building volume does not become generic rock');
  }
  const observer={observerZone:ZONE.pub};
  assert.equal(shouldHideCrossEnvelopeProp({id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5},observer),false,'pub windows retain the real conservatoire facade');
  assert.equal(shouldHideCrossEnvelopeProp({id:'district-south-row-a',mesh:'district_civic_frontage',x:18,z:107.05},observer),false);
  assert.equal(shouldHideCrossEnvelopeProp({id:'pub-complete-interior',mesh:'exterior_pub_interior',x:-6,z:109.75},observer),false);
  assert.equal(shouldHideCrossEnvelopeProp({id:'main-open-well-stair',mesh:'main_open_well_stair',x:63,z:37},observer),true,'other buildings retain their opaque envelope');
});
