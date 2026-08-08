// Floorplan compiler + collision. Pure Node, no browser, no dev server.
//
//   node tools/chunk_surfer/tests/floorplan.mjs
//
// This asserts the things that are expensive to get wrong:
//   · authored one-metre glyphs compile to a half-metre runtime grid
//   · heights survive the round trip into the texture the shader samples
//   · rooms are never mutable (the building's organs do not move)
//   · a stair's risers are climbable by a body, not just by a camera
//   · a bricked door refuses you, and a locked one refuses you differently
//   · the building is actually connected, walking, from spawn to the chapel
//   · every major room/corridor class emits a non-default material id

import { testbed } from '../../../src/data/floorplan/testbed.js';
import { conservatory } from '../../../src/data/floorplan/conservatory.js';
import { PAGES, ROOM_CELLS, PLANT_RIG_CELL } from '../../../src/data/conservatory-script.js';
import * as FP from '../../../src/world/floorplan.js';
import { F, ZONE, MATERIAL, PLAN_SCALE, HEADROOM } from '../../../src/data/floorplan/legend.js';

let pass = true;
const ck = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!ok) pass = false; };
const rc = (x, y, opts) => FP.toRuntimePoint({ x, y }, opts);
const key = (p) => `${p.x},${p.y}`;

const p = FP.compile(testbed.levels, { width: testbed.width, height: testbed.height });
for (const d of testbed.doors || []) FP.setDoorKey(d.x, d.y, d.key);
ck('compiles at 2x runtime scale',
   p.loaded && p.scale === PLAN_SCALE && p.w === 112 && p.h === 60 && FP.toRuntimeDistance(1) === 2,
   `${p.w}x${p.h} scale=${p.scale}`);
ck('material plane matches the runtime grid', p.material.length === p.w * p.h, `${p.material.length} materials`);

const b = FP.cellAt(...Object.values(rc(5, 5)));
ck('studio B3 is low (but not a cupboard)', b && Math.abs(b.ceil - 3.2) < 0.01 && b.zone === ZONE.studio);
// B3 is one of the dance studios — the one with a take on it — so it carries the
// wing's sprung maple rather than a treatment nothing else in the building has.
ck('studio B3 has the dance wing\'s maple', FP.materialAt(...Object.values(rc(5, 5))) === MATERIAL.woodVelvet);

const c = FP.cellAt(...Object.values(rc(48, 5)));
ck('chapel floor is four metres up', c && Math.abs(c.floor - 4.0) < 0.01, `floor=${c && c.floor}`);
ck('chapel nave is thirteen metres tall', c && Math.abs(c.ceil - 17.0) < 0.01, `ceil=${c && c.ceil}`);
ck('chapel has stone/glass material', FP.materialAt(...Object.values(rc(48, 5))) === MATERIAL.chapelStone);

// Every riser on the stair must be one a person takes without thinking.
let worst = 0, prev = null;
const stairA = rc(30, 4, { center: false });
const stairB = rc(40, 4, { center: false });
const stairEndX = stairB.x + PLAN_SCALE - 1;
for (let x = stairA.x; x <= stairEndX; x++) {
  const s = FP.cellAt(x, stairA.y);
  if (!s) { ck('stair is continuous', false, `gap at ${x}`); break; }
  if (prev !== null) worst = Math.max(worst, Math.abs(s.floor - prev));
  prev = s.floor;
}
ck('every riser is climbable', worst <= FP.STEP_UP + 1e-6, `worst riser = ${worst.toFixed(3)}m (max ${FP.STEP_UP})`);
ck('the stair arrives at the landing height', Math.abs(prev - 4.0) < 0.01, `top=${prev}`);

ck('wall is solid', FP.isSolid(0, 0));
ck('outside the map is solid', FP.isSolid(-1, 5) && FP.isSolid(999, 999));
ck('corridor is open', !FP.isSolid(...Object.values(rc(20, 6))));

const brick = FP.canStep(...Object.values(rc(26, 10)), ...Object.values(rc(26, 11)));
ck('a sealed doorway is permanent masonry', !brick.ok && brick.why === 'wall', JSON.stringify(brick));

const testDoor=FP.doorState()[0],testCell=testDoor.cells[0];
const locked = FP.canStep(testCell.x-1,testCell.y,testCell.x,testCell.y,{ keys: new Set() });
ck('a locked door refuses you without the key', !locked.ok && locked.why === 'locked');
FP.setDoorOpen(testDoor.id,true);
const unlocked = FP.canStep(testCell.x-1,testCell.y,testCell.x,testCell.y,{ keys: new Set(['master']) });
ck('and is traversable after its keyed leaf opens', unlocked.ok);

let roomMutable = 0;
for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
  const cc = FP.cellAt(x, y);
  if (cc && (cc.zone === ZONE.studio || cc.zone === ZONE.chapel) && (cc.flags & F.MUTABLE)) roomMutable++;
}
ck('no room cell is mutable — rooms never move', roomMutable === 0, `${roomMutable} violations`);

let drift = 0;
for (let i = 0; i < p.w * p.h; i++) {
  if (p.solid[i]) continue;
  if (Math.abs(FP.decodeH(p.rgba[i * 4]) - p.floor[i]) > 0.07) drift++;
  if (Math.abs(FP.decodeH(p.rgba[i * 4 + 1]) - p.ceil[i]) > 0.07) drift++;
}
ck('the texture the shader samples round-trips the heights', drift === 0, `${drift} cells drifted`);

// Walk it. A body, not a camera: canStep at every move, keys in hand.
function reachable(from, to, keys = new Set(['master'])) {
  const seen = new Set([key(from)]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) return true;
    const portal=FP.connectorDestination(cur.x,cur.y);if(portal&&!seen.has(key(portal))){seen.add(key(portal));q.push(portal);}
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      const move=FP.canStep(cur.x,cur.y,nx,ny,{keys});if(!move.ok)continue;const p=move.redirect||{x:nx,y:ny},pk=key(p);if(seen.has(pk))continue;
      seen.add(pk); q.push(p);
    }
  }
  return false;
}
ck('you can walk from the studio to the chapel', reachable(rc(testbed.spawn.x, testbed.spawn.y), rc(48, 5)));
ck('...and back', reachable(rc(48, 5), rc(testbed.spawn.x, testbed.spawn.y)));
ck('the bricked door seals the south branch', !reachable(rc(26, 10), rc(26, 12)));

// ── THE REAL BUILDING ───────────────────────────────────────────────────────
console.log('\n── the conservatory ──');
const cp = FP.compile(conservatory.levels, { width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors });
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);

const STANDARD_KEYS = new Set(['master']);
const KEYRING = new Set(['master','chapel']); // after the front-of-house key check
const PROBES = {
  studio:     [15, 12], plant:  [35, 30], lift:  [43, 9],
  dock:       [65, 9],  foyer:  [83, 10], hall:  [102, 15],
  natatorium: [75, 30], pool:   [85, 38],
  practice:   [65, 65], chapel: [90, 66],
};
const probePoint = (name) => rc(...PROBES[name]);
const spawn = FP.spawn();
for(const door of FP.doorState())if(!door.keyId||KEYRING.has(door.keyId))FP.setDoorOpen(door.id,true);

const walked = new Set([key(spawn)]);
{
  const q = [spawn];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      const move=FP.canStep(cur.x,cur.y,nx,ny,{keys:KEYRING});if(!move.ok)continue;const p=move.redirect||{x:nx,y:ny},pk=key(p);if(walked.has(pk))continue;
      walked.add(pk);q.push(p);
    }
  }
}

ck('the spawn is not inside rock', !!FP.cellAt(spawn.x, spawn.y));
const stranded = Object.entries(PROBES).filter(([n]) => !walked.has(key(probePoint(n)))).map(([n]) => n);
ck('every room is reachable from the dock after acquiring C-17',
   stranded.length === 0, stranded.length ? `stranded: ${stranded.join(', ')}` : `${walked.size} cells`);

// The two deliberate refusals. Each must still refuse, and the room behind it
// must still be reachable another way — proved by the walk above.
const brickedHall = FP.canStep(...Object.values(rc(96, 13)), ...Object.values(rc(97, 13)), { keys: KEYRING });
ck('the concert hall doorway is still sealed in masonry', !brickedHall.ok && brickedHall.why === 'wall', JSON.stringify(brickedHall));
const doorStep=(id)=>{const door=FP.doorState().find((entry)=>entry.id===id),to=door.cells[0],dirs=door.widthAxis==='x'?[[0,-1],[0,1]]:[[-1,0],[1,0]];let from=null;for(const[dx,dy]of dirs)for(let d=1;d<=4;d++){const p={x:to.x+dx*d,y:to.y+dy*d};if(FP.cellAt(p.x,p.y)&&!FP.hasFlag(p.x,p.y,F.DOOR)){from=p;break;}if(from)break;}return{door,from:from||{x:to.x,y:to.y},to};};
const chapelStep=doorStep('chapel-c17');FP.setDoorOpen('chapel-c17',false);
const lockedChapel = FP.canStep(chapelStep.from.x,chapelStep.from.y,chapelStep.to.x,chapelStep.to.y,{ keys: STANDARD_KEYS });
FP.setDoorOpen('chapel-c17',true);const openedChapel = FP.canStep(chapelStep.from.x,chapelStep.from.y,chapelStep.to.x,chapelStep.to.y,{ keys: KEYRING });
ck('the chapel is locked until C-17 is added to the keyring', !lockedChapel.ok && lockedChapel.why === 'locked' && openedChapel.ok, JSON.stringify(lockedChapel));
const officeStep=doorStep('foh-office');FP.setDoorOpen('foh-office',false);
const boxOfficeLocked=FP.canStep(officeStep.from.x,officeStep.from.y,officeStep.to.x,officeStep.to.y,{keys:new Set()});
FP.setDoorOpen('foh-office',true);const boxOfficeMaster=FP.canStep(officeStep.from.x,officeStep.from.y,officeStep.to.x,officeStep.to.y,{keys:STANDARD_KEYS});
ck('the box-office staff leaf answers only to the building master',!boxOfficeLocked.ok&&boxOfficeLocked.why==='locked'&&boxOfficeMaster.ok,JSON.stringify(boxOfficeLocked));

// One glyph is one metre; only the explicitly scheduled public pairs have two leaves.
const thresholdVolumes=cp.doorVolumes.map(v=>{let blocked=0;for(let yy=v.minY;yy<=v.maxY;yy++)for(let xx=v.minX;xx<=v.maxX;xx++)if(FP.isSolid(xx,yy))blocked++;return{...v,blocked};});
const scheduled=FP.doorState();
ck('all current portals have explicit stable definitions',scheduled.length===conservatory.doors.length&&scheduled.every((door)=>door.archetype!=='legacy'));
ck('only the four scheduled openings contain paired leaves',
  JSON.stringify(scheduled.filter((door)=>door.leafCount===2).map((door)=>door.id).sort())
  ===JSON.stringify(['bay-goods-pair','chapel-c17','front-main','hall-vestibule']));
ck('single glyphs remain one-metre apertures',scheduled.filter((door)=>door.leafCount===1).every((door)=>door.aperture.width<=1.05));
const offCenter=scheduled.filter((door)=>{
  const xs=door.cells.map((cell)=>cell.x),ys=door.cells.map((cell)=>cell.y);
  return door.cx!==(Math.min(...xs)+Math.max(...xs))/2||door.cy!==(Math.min(...ys)+Math.max(...ys))/2;
});
ck('every visible frame is centred on its complete authored threshold',offCenter.length===0,offCenter.map((door)=>door.id).join(','));
const obstructedThroats=scheduled.filter((door)=>door.cells.some(({x,y})=>FP.isSolid(x,y)||(FP.flagsAt(x,y)&F.BRICKED)));
ck('every live door owns a completely clear masonry-free throat',obstructedThroats.length===0,obstructedThroats.map((door)=>door.id).join(','));
let doorCells=0;for(let y=0;y<cp.h;y++)for(let x=0;x<cp.w;x++)if(FP.hasFlag(x,y,F.DOOR))doorCells++;
ck('door authoring cannot cascade through the building',doorCells<240,`${doorCells} door cells in ${thresholdVolumes.length} volumes`);
const chapelSeed=rc(92,58,{center:false}),chapelVolume=cp.doorVolumes.find(v=>chapelSeed.x+1>=v.minX&&chapelSeed.x+1<=v.maxX&&chapelSeed.y+1>=v.minY&&chapelSeed.y+1<=v.maxY&&v.mask!==F.BRICKED);
const chapelDoor=FP.doorState().find((door)=>door.id==='chapel-c17');
const chapelUnkeyed=(chapelDoor?.cells||[]).filter(({x,y})=>FP.doorKeyAt(x,y)!=='chapel').map(({x,y})=>`${x},${y}`);
ck('the keyed chapel pair is locked across its active aperture',!!chapelVolume&&chapelUnkeyed.length===0,chapelUnkeyed.slice(0,8).join(' '));

const atriumView=FP.physicalRenderPlanFor(...Object.values(rc(83,10)));
const hallPhysical=FP.logicalToPhysical(...Object.values(rc(99,24)));
const viewIndex=(view,point)=>(Math.floor(point.z)-view.originY)*view.w+(Math.floor(point.x)-view.originX);
ck('the hall opening is visible from the atrium render slice',!atriumView.solid[viewIndex(atriumView,hallPhysical)]);
const hallView=FP.physicalRenderPlanFor(...Object.values(rc(102,15)));
const atriumPhysical=FP.logicalToPhysical(...Object.values(rc(96,24)));
ck('the atrium opening is visible from the hall render slice',!hallView.solid[viewIndex(hallView,atriumPhysical)]);

// Four curving half-coils make two complete revolutions. The navigation raster
// uses macro winders, while construction and fractional camera height retain
// all 58 physical risers.
const mainRuns=cp.stairRuns.filter((run)=>run.owner==='main-open-well');
ck('the main stair is four curving half-coils',
  mainRuns.length===4&&mainRuns.every((run)=>run.arcId>0)
  &&mainRuns.every((run)=>Math.abs(cp.arcs[run.arcId-1].sweep-Math.PI)<1e-9));
ck('the physical construction keeps 28 and 30 risers at 280mm going',
  JSON.stringify(mainRuns.map((run)=>run.rises))===JSON.stringify([14,14,15,15])
  &&mainRuns.every((run)=>Math.abs(run.going-.28)<1e-9));
ck('all main flights use the dedicated two-metre-wide hero mesh',
  mainRuns.every((run)=>run.renderMode==='hero-mesh'&&run.width===4));

const landingContract=(at,size,height)=>{
  const p=FP.toRuntimePoint(at,{center:false}),miss=[];
  for(let y=0;y<size.y*PLAN_SCALE;y++)for(let x=0;x<size.x*PLAN_SCALE;x++){
    const c=FP.cellAt(p.x+x,p.y+y),physical=FP.logicalToPhysical(p.x+x,p.y+y);
    if(c?.zone!==ZONE.stair||Math.abs(c.floor-height)>.001||physical.spaceId!=='main_stair')miss.push(`${p.x+x},${p.y+y}`);
  }
  return miss;
};
const upperFloorLanding=landingContract({x:150,y:50},{x:6,y:4},4.8);
const academicFloorLanding=landingContract({x:150,y:64},{x:6,y:4},10);
ck('both six-by-four-metre floor landings are fully standable',
  !upperFloorLanding.length&&!academicFloorLanding.length,
  [...upperFloorLanding,...academicFloorLanding].join(' '));

const basementView=FP.physicalRenderPlanFor(...Object.values(rc(57,22))),basementLanding=FP.logicalToPhysical(...Object.values(rc(46,22))),basementLandingIndex=Math.floor(basementLanding.z)*basementView.w+Math.floor(basementLanding.x);
ck('the basement landing is already open from the foot of its stair',!basementView.solid[basementLandingIndex],`${basementLanding.x},${basementLanding.z}`);
const ownedLanding=(spaceId,x0,y0)=>{
  const misses=[];
  for(let y=y0;y<y0+3;y++)for(let x=x0;x<x0+3;x++){
    const logical=rc(x,y),cell=FP.cellAt(logical.x,logical.y),physical=FP.logicalToPhysical(logical.x,logical.y);
    if(cell?.zone!==ZONE.stair||physical.spaceId!==spaceId)misses.push(`${x},${y}`);
  }
  return misses;
};
const basementGroundLanding=ownedLanding('basement_stair',57,22),basementB3Landing=ownedLanding('basement_stair',45,22);
ck('the basement stair owns explicit 3x3-metre landings at both ends',basementGroundLanding.length===0&&basementB3Landing.length===0,[...basementGroundLanding,...basementB3Landing].join(' '));
ck('both main stair systems retain the service-concrete material',
  FP.materialAt(mainRuns[0].logical0[0],mainRuns[0].logical0[1])===MATERIAL.serviceConcrete
  &&FP.materialAt(...Object.values(rc(52,22)))===MATERIAL.serviceConcrete);

const edgePortals=FP.edgePortalState();
ck('all ten open landing seams retain every authored lane',
  JSON.stringify(edgePortals.map((portal)=>portal.lanes))===JSON.stringify([8,4,4,4,8,4,12,4,4,4]));
let edgeFailures=[];
const edgeBearing=(v)=>Math.atan2(v.x,-v.y);
const normalizeAngle=(value)=>{while(value>Math.PI)value-=Math.PI*2;while(value<=-Math.PI)value+=Math.PI*2;return value;};
for(const portal of edgePortals){
  const forwardTurn=normalizeAngle(edgeBearing({x:-portal.to.exit.x,y:-portal.to.exit.y})-edgeBearing(portal.from.exit));
  const reverseTurn=normalizeAngle(edgeBearing({x:-portal.from.exit.x,y:-portal.from.exit.y})-edgeBearing(portal.to.exit));
  for(const pair of portal.pairs){
    const forward=FP.canStep(pair.from.x,pair.from.y,pair.from.x+portal.from.exit.x,pair.from.y+portal.from.exit.y,{keys:KEYRING});
    const reverse=FP.canStep(pair.to.x,pair.to.y,pair.to.x+portal.to.exit.x,pair.to.y+portal.to.exit.y,{keys:KEYRING});
    if(!forward.ok||forward.redirect?.x!==pair.to.x||forward.redirect?.y!==pair.to.y)edgeFailures.push(`${portal.id}:forward`);
    if(!reverse.ok||reverse.redirect?.x!==pair.from.x||reverse.redirect?.y!==pair.from.y)edgeFailures.push(`${portal.id}:reverse`);
    if(Math.abs((forward.edgeTurn||0)-forwardTurn)>1e-9)edgeFailures.push(`${portal.id}:forward-heading`);
    if(Math.abs((reverse.edgeTurn||0)-reverseTurn)>1e-9)edgeFailures.push(`${portal.id}:reverse-heading`);
  }
  for(let lane=0;lane<portal.pairs.length-1;lane++){
    const a=portal.pairs[lane].from,b=portal.pairs[lane+1].from,lateral=FP.canStep(a.x,a.y,b.x,b.y,{keys:KEYRING});
    if(!lateral.ok||lateral.edgePortal)edgeFailures.push(`${portal.id}:lateral-${lane}`);
  }
}
ck('every seam reverses immediately and lateral landing travel never redirects',!edgeFailures.length,edgeFailures.slice(0,8).join(' '));

const diagonalEdgeFailures=[];
for(const portal of edgePortals){
  for(const pair of portal.pairs){
    const forward=FP.canStep(pair.from.x,pair.from.y,
      pair.from.x+portal.from.exit.x+portal.from.along.x,
      pair.from.y+portal.from.exit.y+portal.from.along.y,{keys:KEYRING});
    const reverse=FP.canStep(pair.to.x,pair.to.y,
      pair.to.x+portal.to.exit.x+portal.to.along.x,
      pair.to.y+portal.to.exit.y+portal.to.along.y,{keys:KEYRING});
    if(!forward.ok||forward.edgePortal!==portal.id)diagonalEdgeFailures.push(`${portal.id}:forward`);
    if(!reverse.ok||reverse.edgePortal!==portal.id)diagonalEdgeFailures.push(`${portal.id}:reverse`);
  }
}
ck('diagonal first-person strides cross every stair threshold in both directions',
  !diagonalEdgeFailures.length,diagonalEdgeFailures.slice(0,8).join(' '));

const climbFailures=[];
for(const run of mainRuns){
  const [x0,y0]=run.logical0,[x1,y1]=run.logical1,dx=Math.sign(x1-x0),dy=Math.sign(y1-y0),steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));
  for(let s=0;s<steps;s++){
    const a=[x0+dx*s,y0+dy*s],b=[a[0]+dx,a[1]+dy];
    if(!FP.canStep(...a,...b,{keys:KEYRING}).ok||!FP.canStep(...b,...a,{keys:KEYRING}).ok)climbFailures.push(`${run.flight}:${s}`);
  }
}
ck('all four coils have continuous bidirectional climbable macro-risers',!climbFailures.length,climbFailures.join(' '));
const profileFailures=[];
for(const run of mainRuns)for(let riser=0;riser<=run.rises;riser++){
  const t=riser/run.rises,lx=run.logical0[0]+(run.logical1[0]-run.logical0[0])*t,ly=run.logical0[1]+(run.logical1[1]-run.logical0[1])*t,p=FP.logicalToPhysical(lx,ly);
  const got=FP.renderedFloorAt(lx,ly,p.x,p.z),want=run.fromH+(run.toH-run.fromH)*t;
  if(Math.abs(got-want)>.001)profileFailures.push(`${run.flight}:${riser}`);
}
ck('fractional camera height follows every one of the 58 physical risers',!profileFailures.length,profileFailures.slice(0,8).join(' '));

const embeddedWithoutDrift=(points)=>points.every(([x,y])=>{
  const p=FP.logicalToPhysical(x+.25,y+.25);
  return Math.abs(p.x-(x+.25))<1e-6&&Math.abs(p.z-(y+.25))<1e-6;
});
ck('the basement stair collision and rendering share one physical footprint',
  embeddedWithoutDrift(Array.from({length:21},(_,i)=>[114-i,47])));
const compactHallCells=[];for(let y=0;y<cp.h;y++)for(let x=0;x<cp.w;x++){
  const physical=FP.logicalToPhysical(x,y),cell=FP.cellAt(x,y);
  if(physical.owner==='grand_ground_stair_hall'&&cell&&cell.ceil-cell.floor>=HEADROOM)compactHallCells.push([x,y]);
}
ck('the ground approach is a compact 56m² gallery and landing, not a massive empty hall',compactHallCells.length===56*4,`${compactHallCells.length/4} m²`);
const mainStairPortals=cp.stairPortals.filter((portal)=>portal.id?.startsWith('main-open-well:')),basementStairPortal=cp.stairPortals.find(p=>p.group0==='ground'&&p.group1==='basement');
ck('stairs terminate on their physical destination floors',mainStairPortals.length===4&&!!basementStairPortal,JSON.stringify(cp.stairPortals.slice(0,5)));

const upperArrival=rc(66,55),restoredArrival=rc(154,74);
ck('the restored landing remains open to the existing practice corridor',FP.zoneAt(upperArrival.x,upperArrival.y)===ZONE.practice&&!FP.isSolid(upperArrival.x,upperArrival.y)&&reachable(restoredArrival,upperArrival,KEYRING));

// The wing now sits on the main stair's axis: corridor at authored x60-62, west
// rooms x52-58, east rooms x64-75. Coming up the stair you face straight down it.
const partyWalls=[56,63,70,77,84];
ck('practice rooms have continuous party walls',partyWalls.every((y)=>FP.isSolid(...Object.values(rc(55,y)))&&FP.isSolid(...Object.values(rc(70,y)))&&!FP.isSolid(...Object.values(rc(61,y)))));
ck('practice wing is a double-loaded corridor, not an open floor',
  [59,66,73,80].every((y)=>!FP.isSolid(...Object.values(rc(59,y)))&&!FP.isSolid(...Object.values(rc(63,y))))
  && [57,61,64,68,71,75,78,82].every((y)=>FP.isSolid(...Object.values(rc(59,y)))&&FP.isSolid(...Object.values(rc(63,y)))));
ck('the corridor is on the stair axis, so the arrival looks straight down it',
  [56,60,70,80].every((y)=>[60,61,62].every((x)=>!FP.isSolid(...Object.values(rc(x,y))))));
ck('the upper stair opens into the shared practice-floor arrival hall',
  [53,54,55].every((y)=>[56,61,64,67,72].every((x)=>!FP.isSolid(...Object.values(rc(x,y))))));
const practiceRoomCell=(x,y)=>{
  const ax=FP.toAuthoredCoord(x),ay=FP.toAuthoredCoord(y);
  return ay>=56&&ay<=84&&((ax>=52&&ax<59)||(ax>=64&&ax<76));
};
const reachesBridgeWithoutClassroom=(()=>{
  const from=restoredArrival,to=rc(78,55),seen=new Set([key(from)]),q=[from];
  while(q.length){const cur=q.shift();if(cur.x===to.x&&cur.y===to.y)return true;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=cur.x+dx,ny=cur.y+dy,k=key({x:nx,y:ny});if(seen.has(k)||practiceRoomCell(nx,ny))continue;
      const move=FP.canStep(cur.x,cur.y,nx,ny,{keys:KEYRING});if(!move.ok)continue;const next=move.redirect||{x:nx,y:ny};seen.add(key(next));q.push(next);
    }
  }return false;
})();
ck('the chapel bridge is reachable without crossing a practice room',reachesBridgeWithoutClassroom);

// The levels are really at their heights, not flattened onto base 0.
const lv = (n, pnt, want) => {
  const c = FP.cellAt(pnt.x, pnt.y);
  ck(`${n} floor is ${want}m`, c && Math.abs(c.floor - want) < 0.01, `floor=${c ? c.floor.toFixed(2) : 'SOLID'}`);
};
lv('the sub-basement', probePoint('studio'), -4.0);
lv('the ground', probePoint('foyer'), 0);
lv('the upper', probePoint('chapel'), 4.8);
lv('the walkable pool surface', probePoint('pool'), 0);

let tallAtrium=0;const heights=new Set();
for(let y=0;y<cp.h;y++)for(let x=0;x<cp.w;x++){
  const c=FP.cellAt(x,y);if(!c)continue;const clear=Math.round((c.ceil-c.floor)*10)/10;heights.add(clear);
  if(c.zone===ZONE.foyer&&clear>=10)tallAtrium++;
}
ck('front circulation is a real open atrium, not another corridor',tallAtrium>=600,`${(tallAtrium/4).toFixed(0)} m² tall foyer`);
ck('the building uses a legible hierarchy of ceiling heights',heights.size>=8,`${heights.size} distinct clearances`);

// Materials are a second map, not flag bits. The big zones need distinct
// signatures or the renderer cannot make the building legible.
const materialChecks = [
  ['studio B3 sprung maple', probePoint('studio'), MATERIAL.woodVelvet],
  ['pool tile', probePoint('natatorium'), MATERIAL.poolTile],
  ['wet drained pool tile', probePoint('pool'), MATERIAL.wetTile],
  ['concert hall wood/velvet', probePoint('hall'), MATERIAL.woodVelvet],
  ['practice drywall/foam', probePoint('practice'), MATERIAL.practiceFoam],
  ['chapel stone/glass', probePoint('chapel'), MATERIAL.chapelStone],
  ['plant metal', probePoint('plant'), MATERIAL.metalPlant],
];
for (const [name, pnt, want] of materialChecks) {
  ck(`material: ${name}`, FP.materialAt(pnt.x, pnt.y) === want, `got=${FP.materialAt(pnt.x, pnt.y)} want=${want}`);
}
ck('corridor material inherits a non-default nearby identity',
   FP.materialAt(...Object.values(rc(61, 22))) !== MATERIAL.none,
   `mat=${FP.materialAt(...Object.values(rc(61, 22)))}`);

// Every step a body may actually take is one a body takes without thinking.
let worstRiser = 0, worstPair = '';
for (const k of walked) {
  const [x, y] = k.split(',').map(Number);
  const here = FP.cellAt(x, y); if (!here) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = FP.cellAt(x + dx, y + dy);
    if (!n || !FP.canStep(x, y, x + dx, y + dy, { keys: KEYRING }).ok) continue;
    const d = Math.abs(n.floor - here.floor);
    if (d > worstRiser) { worstRiser = d; worstPair = `${x},${y} -> ${x + dx},${y + dy}`; }
  }
}
ck('no riser anywhere in the building is a ladder', worstRiser <= FP.STEP_UP + 1e-6,
   `worst = ${worstRiser.toFixed(3)}m (max ${FP.STEP_UP})  at ${worstPair}`);

// The pool is a visual/material plane in the room, never a recessed inner
// collision room. All four sides are ordinary walkable transitions.
ck('you can walk into the pool from the west deck',FP.canStep(...Object.values(rc(77,40)),...Object.values(rc(78,40)),{keys:KEYRING}).ok);
ck('you can walk into the pool from the east deck',FP.canStep(...Object.values(rc(90,40)),...Object.values(rc(89,40)),{keys:KEYRING}).ok);
ck('you can walk into the pool from the lead deck',FP.canStep(...Object.values(rc(84,32)),...Object.values(rc(84,33)),{keys:KEYRING}).ok);
ck('you can walk out at the far end',FP.canStep(...Object.values(rc(84,48)),...Object.values(rc(84,49)),{keys:KEYRING}).ok);

let lowRoom = 0;
for (const k of walked) {
  const [x, y] = k.split(',').map(Number);
  const c = FP.cellAt(x, y);
  if (c && c.ceil - c.floor < FP.HEADROOM - 1e-6) lowRoom++;
}
ck('you can stand up everywhere you can walk', lowRoom === 0, `${lowRoom} cells below ${FP.HEADROOM}m`);

const strandedPages = PAGES.filter((pg) => !walked.has(key(rc(pg.at.x, pg.at.y))))
  .map((pg) => `${pg.id}@${pg.at.x},${pg.at.y}`);
ck('every page lies somewhere you can walk', strandedPages.length === 0, strandedPages.join(' '));

const strandedRooms = Object.entries(ROOM_CELLS).filter(([, c]) => !walked.has(key(rc(c.x, c.y))))
  .map(([n]) => n);
ck('every take can be made where the waypoint points', strandedRooms.length === 0, strandedRooms.join(' '));

const wrongZone = Object.entries(ROOM_CELLS).filter(([id, c]) => {
  const pnt = rc(c.x, c.y);
  return FP.worldAt(pnt.x, pnt.y) !== id;
}).map(([id, c]) => {
  const pnt = rc(c.x, c.y);
  return `${id} is actually ${FP.worldAt(pnt.x, pnt.y)}`;
});
ck('...and the waypoint points at the room it names', wrongZone.length === 0, wrongZone.join('; '));

const rig = rc(PLANT_RIG_CELL.x, PLANT_RIG_CELL.y);
ck('the bent rig lies somewhere you can walk',
   walked.has(key(rig)), `${rig.x},${rig.y}`);
ck('...in the plant room, which has no objective on it',
   FP.zoneAt(rig.x, rig.y) === ZONE.plant
   && !Object.values(ROOM_CELLS).some((c) => key(rc(c.x, c.y)) === key(rig)),
   `zone=${FP.zoneAt(rig.x, rig.y)}`);

let croomMutable = 0;
for (let i = 0; i < cp.w * cp.h; i++) {
  if (cp.solid[i]) continue;
  const z = cp.zone[i];
  if (z !== ZONE.none && z !== ZONE.stair && (cp.flags[i] & F.MUTABLE)) croomMutable++;
}
ck('no room in the conservatory is mutable', croomMutable === 0, `${croomMutable} violations`);
const ownership=FP.ownershipData();
ck('replacement public rooms own their final cells',
  cp.owner[rc(102,15).y*cp.w+rc(102,15).x]==='hall_orchestra'
  && cp.owner[rc(85,30).y*cp.w+rc(85,30).x]==='natatorium'
  && cp.owner[rc(90,66).y*cp.w+rc(90,66).x]==='chapel_nave',
  `${ownership.conflicts.length} explicit replacement writes`);

const volume=FP.physicalSpanData();
ck('the physical compiler supports the three hall air spans',volume.maxSpans>=3,`max spans=${volume.maxSpans}`);
ck('physical spans do not intersect, including galleria stair flights',volume.overlaps.length===0,`${volume.overlaps.length} overlaps`);
let badSeams=[];
for(let y=0;y<cp.h;y++)for(let x=0;x<cp.w;x++){
  const to=FP.connectorDestination(x,y);if(!to)continue;
  const a=FP.logicalToPhysical(x,y),b=FP.logicalToPhysical(to.x,to.y);
  const planar=Math.hypot(a.x-b.x,a.z-b.z),vertical=Math.abs(a.y-b.y);
  if(planar>1.01||vertical>FP.STEP_UP+1e-6)badSeams.push(`${x},${y}->${to.x},${to.y} (${planar.toFixed(2)}c/${vertical.toFixed(2)}m)`);
}
ck('level seams preserve physical position and walking height',badSeams.length===0,badSeams.join(' '));
const orchestra=FP.logicalToPhysical(...Object.values(rc(102,15))),lower=FP.logicalToPhysical(...Object.values(rc(1,67))),upper=FP.logicalToPhysical(...Object.values(rc(28,114)));
ck('orchestra and both balconies occupy one Euclidean hall footprint',orchestra.renderGroup==='hall'&&lower.renderGroup==='hall'&&upper.renderGroup==='hall'&&lower.y===4&&upper.y===7.5,`floors ${orchestra.y}/${lower.y}/${upper.y}`);
ck('orchestra, lower balcony and upper balcony are mutually reachable',reachable(rc(102,15),rc(1,67),KEYRING)&&reachable(rc(1,67),rc(28,114),KEYRING)&&reachable(rc(28,114),rc(102,15),KEYRING));
ck('the chapel opens into a long 13m pointed-vault volume',Math.abs(FP.ceilAt(...Object.values(rc(90,82)))-FP.floorAt(...Object.values(rc(90,82)))-13)<.01);

// `--map` prints what is reachable from the spawn.
//   node tools/chunk_surfer/tests/floorplan.mjs --map [--plan=testbed]
if (process.argv.includes('--map')) {
  const which = process.argv.includes('--plan=testbed') ? testbed : conservatory;
  const pp = FP.compile(which.levels, { width: which.width, height: which.height, widenCorridors: which.widenCorridors,connectors:which.connectors||[],edgePortals:which.edgePortals||[],doors:which===conservatory?which.doors:[] });
  if(which===testbed)for (const d of which.doors || []) FP.setDoorKey(d.x, d.y, d.key,{open:true});
  else for(const door of FP.doorState())if(!door.keyId||KEYRING.has(door.keyId))FP.setDoorOpen(door.id,true);
  FP.setSpawn(which.spawn.x, which.spawn.y);
  const home = FP.spawn();
  const seen = new Set([key(home)]);
  const q = [home];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, k = `${nx},${ny}`;
      const move=FP.canStep(cur.x,cur.y,nx,ny,{keys:KEYRING});if(!move.ok)continue;const p=move.redirect||{x:nx,y:ny},pk=key(p);if(seen.has(pk))continue;
      seen.add(pk);q.push(p);
    }
  }
  console.log(`\nreachable: ${seen.size} cells   (o = reachable, . = open but stranded, # = rock)\n`);
  for (let y = 0; y < pp.h; y++) {
    let row = '';
    for (let x = 0; x < pp.w; x++) row += seen.has(`${x},${y}`) ? 'o' : (FP.isSolid(x, y) ? '#' : '.');
    if (row.replace(/#/g, '').length) console.log(row);
  }
}

console.log(pass ? '\n✅ FLOORPLAN PASSED' : '\n❌ FAILURES');
process.exit(pass ? 0 : 1);
