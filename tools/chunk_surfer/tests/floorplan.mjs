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

import { testbed } from '../../../public/labs/chunk-surfer/src/data/floorplan/testbed.js';
import { conservatory } from '../../../public/labs/chunk-surfer/src/data/floorplan/conservatory.js';
import { PAGES, ROOM_CELLS, PLANT_RIG_CELL } from '../../../public/labs/chunk-surfer/src/data/conservatory-script.js';
import * as FP from '../../../public/labs/chunk-surfer/src/world/floorplan.js';
import { F, ZONE, MATERIAL, PLAN_SCALE } from '../../../public/labs/chunk-surfer/src/data/floorplan/legend.js';

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
ck('studio B3 is low and dead (but not a cupboard)', b && Math.abs(b.ceil - 3.2) < 0.01 && b.zone === ZONE.studio);
ck('studio B3 has acoustic material', FP.materialAt(...Object.values(rc(5, 5))) === MATERIAL.acousticFoam);

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
ck('a bricked door refuses passage', !brick.ok && brick.why === 'bricked', JSON.stringify(brick));

const locked = FP.canStep(...Object.values(rc(11, 6)), ...Object.values(rc(12, 6)), { keys: new Set() });
ck('a locked door refuses you without the key', !locked.ok && locked.why === 'locked');
const unlocked = FP.canStep(...Object.values(rc(11, 6)), ...Object.values(rc(12, 6)), { keys: new Set(['master']) });
ck('and opens with it', unlocked.ok);

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
const cp = FP.compile(conservatory.levels, { width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,connectors:conservatory.connectors });
for (const d of conservatory.doors || []) FP.setDoorKey(d.x, d.y, d.key);
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);

const STANDARD_KEYS = new Set(['master']);
const KEYRING = new Set(['master','chapel']); // after the front-of-house key check
const PROBES = {
  studio:     [15, 12], plant:  [35, 10], lift:  [42, 9],
  dock:       [65, 9],  foyer:  [83, 10], hall:  [102, 15],
  natatorium: [85, 30], pool:   [85, 38],
  practice:   [65, 65], chapel: [90, 66],
};
const probePoint = (name) => rc(...PROBES[name]);
const spawn = FP.spawn();

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
ck('the concert hall door is still bricked up', !brickedHall.ok && brickedHall.why === 'bricked', JSON.stringify(brickedHall));
const lockedChapel = FP.canStep(...Object.values(rc(92, 57)), ...Object.values(rc(92, 58)), { keys: STANDARD_KEYS });
const openedChapel = FP.canStep(...Object.values(rc(92, 57)), ...Object.values(rc(92, 58)), { keys: KEYRING });
ck('the chapel is locked until C-17 is added to the ring', !lockedChapel.ok && lockedChapel.why === 'locked' && openedChapel.ok, JSON.stringify(lockedChapel));
const boxOfficeLocked=FP.canStep(...Object.values(rc(88,20)),...Object.values(rc(89,20)),{keys:new Set()});
const boxOfficeMaster=FP.canStep(...Object.values(rc(88,20)),...Object.values(rc(89,20)),{keys:STANDARD_KEYS});
ck('the box-office staff leaf answers only to the building master',!boxOfficeLocked.ok&&boxOfficeLocked.why==='locked'&&boxOfficeMaster.ok,JSON.stringify(boxOfficeLocked));

// Test the compiler contract globally, not a couple of hand-picked doors.
// Every generated portal volume needs at least 3 m in both axes: one axis is
// aperture width, the other is the clear throat through and beyond the wall.
const thresholdVolumes=cp.doorVolumes.map(v=>{let blocked=0;for(let yy=v.minY;yy<=v.maxY;yy++)for(let xx=v.minX;xx<=v.maxX;xx++)if(FP.isSolid(xx,yy))blocked++;return{...v,blocked};});
const shortThresholds=thresholdVolumes.filter(v=>v.maxX-v.minX+1<3*PLAN_SCALE||v.maxY-v.minY+1<3*PLAN_SCALE||v.blocked);
ck('every threshold in the building is one clear 3m by 3m portal volume',shortThresholds.length===0,JSON.stringify(shortThresholds));
let doorCells=0;for(let y=0;y<cp.h;y++)for(let x=0;x<cp.w;x++)if(FP.hasFlag(x,y,F.DOOR))doorCells++;
ck('threshold normalization cannot cascade through the building',doorCells<1000,`${doorCells} door-plane cells in ${thresholdVolumes.length} volumes`);
const chapelSeed=rc(92,58,{center:false}),chapelVolume=cp.doorVolumes.find(v=>chapelSeed.x+1>=v.minX&&chapelSeed.x+1<=v.maxX&&chapelSeed.y+1>=v.minY&&chapelSeed.y+1<=v.maxY&&v.mask!==F.BRICKED);
let chapelUnkeyed=[];
if(chapelVolume)for(let y=chapelVolume.minY;y<=chapelVolume.maxY;y++)for(let x=chapelVolume.minX;x<=chapelVolume.maxX;x++)if(FP.hasFlag(x,y,F.DOOR)&&!FP.hasFlag(x,y,F.BRICKED)&&FP.doorKeyAt(x,y)!=='chapel')chapelUnkeyed.push(`${x},${y}`);
ck('a widened keyed threshold is locked across its entire aperture',!!chapelVolume&&chapelUnkeyed.length===0,chapelUnkeyed.slice(0,8).join(' '));

const atriumView=FP.physicalRenderPlanFor(...Object.values(rc(83,10)));
const hallPhysical=FP.logicalToPhysical(...Object.values(rc(99,24)));
ck('the hall opening is visible from the atrium render slice',!atriumView.solid[Math.floor(hallPhysical.z)*atriumView.w+Math.floor(hallPhysical.x)]);
const hallView=FP.physicalRenderPlanFor(...Object.values(rc(102,15)));
const atriumPhysical=FP.logicalToPhysical(...Object.values(rc(96,24)));
ck('the atrium opening is visible from the hall render slice',!hallView.solid[Math.floor(atriumPhysical.z)*hallView.w+Math.floor(atriumPhysical.x)]);

const stairView=FP.physicalRenderPlanFor(...Object.values(rc(60,41)));
let hiddenStair=[];
for(let ay=41;ay<=52;ay++){
  const lp=rc(60,ay),pp=FP.logicalToPhysical(lp.x,lp.y),pi=Math.floor(pp.z)*stairView.w+Math.floor(pp.x);
  if(stairView.solid[pi])hiddenStair.push(ay);
}
ck('a stair renders as one continuous run with no transition slabs',hiddenStair.length===0,hiddenStair.join(','));
const upperLanding=FP.logicalToPhysical(...Object.values(rc(60,53))),upperLandingIndex=Math.floor(upperLanding.z)*stairView.w+Math.floor(upperLanding.x);
ck('the upper landing is already open from the foot of its stair',!stairView.solid[upperLandingIndex],`${upperLanding.x},${upperLanding.z}`);
const basementView=FP.physicalRenderPlanFor(...Object.values(rc(57,22))),basementLanding=FP.logicalToPhysical(...Object.values(rc(46,22))),basementLandingIndex=Math.floor(basementLanding.z)*basementView.w+Math.floor(basementLanding.x);
ck('the basement landing is already open from the foot of its stair',!basementView.solid[basementLandingIndex],`${basementLanding.x},${basementLanding.z}`);
const mainStairPortal=cp.stairPortals.find(p=>p.group0==='ground'&&p.group1==='upper'),basementStairPortal=cp.stairPortals.find(p=>p.group0==='ground'&&p.group1==='basement');
ck('stairs terminate on their physical destination floors',!!mainStairPortal&&!!basementStairPortal,JSON.stringify(cp.stairPortals.slice(0,3)));

const partyWalls=[59,66,73,80];
ck('practice rooms have continuous party walls',partyWalls.every((y)=>FP.isSolid(...Object.values(rc(60,y)))&&FP.isSolid(...Object.values(rc(72,y)))&&!FP.isSolid(...Object.values(rc(66,y)))));
ck('practice wing is a double-loaded corridor, not an open floor',
  [55,62,69,76].every((y)=>!FP.isSolid(...Object.values(rc(64,y)))&&!FP.isSolid(...Object.values(rc(68,y))))
  && [53,58,60,65,67,72,74,79].every((y)=>FP.isSolid(...Object.values(rc(64,y)))&&FP.isSolid(...Object.values(rc(68,y)))));

// The levels are really at their heights, not flattened onto base 0.
const lv = (n, pnt, want) => {
  const c = FP.cellAt(pnt.x, pnt.y);
  ck(`${n} floor is ${want}m`, c && Math.abs(c.floor - want) < 0.01, `floor=${c ? c.floor.toFixed(2) : 'SOLID'}`);
};
lv('the sub-basement', probePoint('studio'), -4.0);
lv('the ground', probePoint('foyer'), 0);
lv('the upper', probePoint('chapel'), 4.8);
lv('the drained pool', probePoint('pool'), -1.6);

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
  ['studio acoustic foam', probePoint('studio'), MATERIAL.acousticFoam],
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

// The recordist cannot jump and cannot fall. The pool steps are deliberate.
const overTheEdge = FP.canStep(...Object.values(rc(82, 34)), ...Object.values(rc(82, 35)), { keys: KEYRING });
ck('you cannot walk off the edge of the drained pool', !overTheEdge.ok && overTheEdge.why === 'too high', JSON.stringify(overTheEdge));
ck('the pool steps are the way down', FP.canStep(...Object.values(rc(84, 34)), ...Object.values(rc(84, 35)), { keys: KEYRING }).ok);
ck('...and the only way down', [80, 81, 82, 83, 87, 88, 89, 90]
  .every((x) => !FP.canStep(...Object.values(rc(x, 34)), ...Object.values(rc(x, 35)), { keys: KEYRING }).ok));

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
ck('the chapel is a long 13m pointed-vault volume',Math.abs(FP.ceilAt(...Object.values(rc(90,66)))-FP.floorAt(...Object.values(rc(90,66)))-13)<.01);

// `--map` prints what is reachable from the spawn.
//   node tools/chunk_surfer/tests/floorplan.mjs --map [--plan=testbed]
if (process.argv.includes('--map')) {
  const which = process.argv.includes('--plan=testbed') ? testbed : conservatory;
  const pp = FP.compile(which.levels, { width: which.width, height: which.height, widenCorridors: which.widenCorridors,connectors:which.connectors||[] });
  for (const d of which.doors || []) FP.setDoorKey(d.x, d.y, d.key);
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
