import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { MATERIAL, PLAN_SCALE, ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { DOCK_ACOUSTIC_PROP_IDS, DOCK_HERO_PROP_IDS } from '../src/game/loading-dock.js';

const rt = (x, y) => FP.toRuntimePoint({ x, y });
const key = ({ x, y }) => `${x},${y}`;
const KEYRING = new Set(['master', 'chapel']);

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
});
for (const door of conservatory.doors || []) FP.setDoorKey(door.x, door.y, door.key, { open: true });
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);

PROPS.loadPropState({});
const placed = PROPS.propsInit(FP);
const byId = Object.fromEntries(placed.map((prop) => [prop.id, prop]));

assert.equal(byId['natatorium-vault'], undefined, 'the natatorium has no second shell inside its room volume');

function reachable(from, to, keys = KEYRING) {
  const seen = new Set([key(from)]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) return true;
    const portal = FP.connectorDestination(cur.x, cur.y);
    if (portal && !seen.has(key(portal)) && PROPS.propCanOccupy(portal.x, portal.y)) {
      seen.add(key(portal));
      q.push(portal);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = cur.x + dx;
      const ty = cur.y + dy;
      const step = FP.canStep(cur.x, cur.y, tx, ty, { keys });
      if (!step.ok) continue;
      const next = step.redirect || { x: tx, y: ty };
      const k = key(next);
      if (seen.has(k) || !PROPS.propCanOccupy(next.x, next.y)) continue;
      seen.add(k);
      q.push(next);
    }
  }
  return false;
}

for (const name of [
  'box_office_desk',
  'program_stack',
  'cash_terminal',
  'queue_stanchion',
  'plant_pipe_straight',
  'plant_pipe_bank',
  'plant_pipe_elbow',
  'plant_pipe_valve',
  'natatorium_roof_structure',
  'natatorium_cubicle_bank',
  'natatorium_end_window',
  'natatorium_clock',
  'changing_bench',
  'pool_lane_ropes',
  'pool_backstroke_flags',
  'pool_ladder',
  'pool_lifebuoy',
]) {
  assert.ok(PROP_MESH[name], `missing prop mesh contract for ${name}`);
}

assert.equal(placed.length, CONSERVATORY_PROPS.length, 'every dressed prop center remains in open floorplan space');

assert.equal(DOCK_HERO_PROP_IDS.length, 10, 'the dock has ten authored hero inspections');
for (const id of DOCK_HERO_PROP_IDS) {
  assert.ok(byId[id], `${id} is placed in the dock`);
  assert.ok(PROPS.pathToProp(FP.spawn().x, FP.spawn().y, id, KEYRING), `${id} remains reachable from the level-check box`);
}
for (const id of DOCK_ACOUSTIC_PROP_IDS) {
  assert.ok(byId[id]?.sampleFamily?.length, `${id} has a fixed acoustic family`);
}
for (let authoredY = 7; authoredY <= 14; authoredY += .5) {
  for (let authoredX = 64; authoredX <= 66.5; authoredX += .5) {
    const p = rt(authoredX, authoredY);
    assert.ok(PROPS.propCanOccupy(p.x, p.y), `three-metre freight spine stays clear at ${authoredX},${authoredY}`);
  }
}
assert.ok(reachable(FP.spawn(), rt(65, 15)), 'level-check box to south service leaf remains clear');
assert.ok(reachable(FP.spawn(), rt(73, 13)), 'level-check box to foyer service leaf remains clear');

for (const id of [
  'acq-services-panel-plant',
  'acq-services-panel-pool',
  'acq-services-panel-foh',
]) {
  assert.equal(byId[id]?.interaction, 'action', `${id} remains an explicit breaker interaction`);
  assert.ok(PROPS.pathToProp(FP.spawn().x, FP.spawn().y, id, KEYRING), `${id} remains reachable from the loading dock`);
}

PROPS.loadPropState({});
assert.match(PROPS.inspectProp('dock-road-case'), /recorder-shaped absence/);
PROPS.auditionProp('dock-road-case');
assert.match(PROPS.inspectProp('dock-road-case',{aftermath:true}), /came from across the room/);
assert.match(PROPS.inspectProp('dock-road-case',{aftermath:true}), /One sound\. Two places/);
PROPS.loadPropState({});
assert.match(PROPS.inspectProp('dock-road-case',{aftermath:true}), /never touched it/);

// Adjacent dock objects follow the continuous reticle yaw. The old distance-
// first cone selected the desk while the player was visibly aiming at its
// clipboard (and vice versa).
const dispatchAim = rt(60, 8);
const dispatchMx = (dispatchAim.x + .5) * .5;
const dispatchMz = (dispatchAim.y + .5) * .5;
const aimAt = (id) => {
  const prop = byId[id];
  return Math.atan2(prop.interactionX - dispatchMx, -(prop.interactionY - dispatchMz));
};
assert.equal(PROPS.pickProp(dispatchAim.x, dispatchAim.y, 0, 2, { yaw:aimAt('dock-work-order-clipboard'), pitch:-.3 })?.id,
  'dock-work-order-clipboard');
assert.equal(PROPS.pickProp(dispatchAim.x, dispatchAim.y, 0, 2.5, { yaw:aimAt('dock-desk-1'), pitch:-.3 })?.id,
  'dock-desk-1');

const boxOfficeProps = placed.filter((prop) => prop.id.startsWith('box-office-'));
assert.ok(boxOfficeProps.length >= 10, 'box office should read as a stocked ticket office');
assert.ok(byId['box-office-key-cabinet']?.action === 'chapel-key-cabinet', 'key cabinet interaction stays canonical');
assert.ok(byId['box-office-ledger']?.action === 'rekey-ledger', 'rekey ledger interaction stays canonical');
assert.ok(reachable(rt(88, 20), rt(94, 22)), 'box-office staff route stays walkable around counter and desk');
assert.ok(PROPS.pathToProp(rt(88, 20).x, rt(88, 20).y, 'box-office-key-cabinet', KEYRING), 'key cabinet remains reachable');

assert.ok(reachable(rt(97, 25), rt(117, 10)), 'hall door to stage route remains clear');
assert.ok(reachable(rt(97, 25), rt(100, 21)), 'hall door to lower galleria stair landing remains clear');
assert.ok(reachable(rt(102, 15), rt(1, 67)), 'orchestra to lower balcony route remains clear');
assert.ok(reachable(rt(1, 67), rt(28, 114)), 'lower balcony to upper balcony route remains clear');

const practiceEndIds = [
  'practice-corridor-large-portrait',
  'acq-practice-corridor-chair-west',
  'acq-practice-corridor-chair-east',
  'acq-practice-corridor-chandelier',
];
assert.ok(practiceEndIds.every((id) => !byId[id]), 'the practice stair corridor no longer terminates in a decorative ensemble');
assert.ok(reachable(rt(66, 55), rt(66, 79)), 'the bare practice corridor remains reachable from its stair landing');

const poolStarts=placed.filter((prop)=>prop.id.startsWith('pool-start-'));
assert.equal(poolStarts.length,5,'five starting blocks align to the five-lane pool');
assert.ok(poolStarts.every((prop)=>prop.y===32.4&&prop.yaw===Math.PI),'starting blocks face into the pool from the end of the lead deck');
const roof=byId['natatorium-roof-structure'];
assert.ok(roof?.structural&&!roof.blocks,'the civic roof is visible structure, never a second collision room');
assert.deepEqual({x:roof?.x,y:roof?.y},{x:83,y:38.5},'the roof springs from the one true natatorium envelope');
const cubicles=placed.filter((prop)=>prop.id.startsWith('natatorium-cubicles-'));
assert.equal(cubicles.length,2,'matching municipal changing-cubicle banks line both perimeter walls');
assert.ok(cubicles.every((prop)=>!prop.blocks&&prop.y===40.5),'cubicle banks stay shallow, wall-backed, and out of circulation');
assert.deepEqual(cubicles.map((prop)=>prop.yaw).sort((a,b)=>a-b),[-Math.PI/2,Math.PI/2],'both cubicle banks face inward');
assert.ok(byId['natatorium-end-window']?.structural&&!byId['natatorium-end-window']?.blocks,'the triple end window dresses the real far wall without becoming another wall');
assert.equal(placed.filter((prop)=>prop.mesh==='pool_backstroke_flags').length,2,'two transverse flag lines establish the pool safety datum');
assert.ok(byId['pool-lane-ropes']?.structural&&!byId['pool-lane-ropes']?.blocks,'lane ropes remain visual and never obstruct the walkable water');
assert.equal(placed.filter((prop)=>prop.mesh==='pool_ladder').length,2,'steel ladders explain entering and leaving the basin from either deck');
assert.equal(placed.filter((prop)=>prop.mesh==='changing_bench').length,2,'purpose-built slatted benches replace chapel furniture in the pool hall');
assert.ok(placed.filter((prop)=>prop.zone===ZONE.natatorium).every((prop)=>prop.id==='pool-lane-markings'||prop.y>=32.4),'the first five metres inside the pool door remain clear');
assert.ok(reachable(rt(84, 27), rt(84, 37)), 'natatorium lobby crosses the lead deck and enters the pool');
assert.ok(reachable(rt(84, 27), rt(75, 45)), 'natatorium west deck perimeter remains walkable');
assert.ok(reachable(rt(84, 27), rt(91, 34)), 'natatorium east deck and lane storage remain walkable');
assert.ok(reachable(rt(84, 27), rt(84, 47)), 'the entrance, full basin length, and far axial wall read as one traversable hall');
assert.equal(byId['natatorium-hall-shell'], undefined, 'the natatorium has no freestanding inner architectural shell');
assert.equal(byId['natatorium-vault'], undefined, 'the natatorium has no freestanding inner roof shell');
assert.equal(byId['pool-lane-markings']?.elevation, .05, 'longitudinal lane markings sit just above the basin floor');
assert.deepEqual({x:byId['pool-lane-markings']?.x,y:byId['pool-lane-markings']?.y},{x:84,y:40.5},'lane markings are centred in the shifted pool');
assert.equal(byId['pool-lifeguard-chair']?.yaw,-Math.PI/2,'lifeguard chair faces west across the pool');
assert.equal(byId['pool-lane-reel']?.yaw,0,'lane reel sits square to the starting end');

{
  const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
  const roofStart=builder.indexOf("mesh('natatorium_roof_structure')");
  const roofEnd=builder.indexOf("mesh('natatorium_cubicle_bank')",roofStart);
  const roofSource=builder.slice(roofStart,roofEnd);
  assert.ok(roofStart>=0&&roofEnd>roofStart,'the natatorium roof has a dedicated code-native mesh');
  assert.match(roofSource,/addRingBeam\([\s\S]*addRingBeam\(/,'roof ties use repeated large and small circular apertures');
  assert.doesNotMatch(roofSource,/addTriangle\(/,'roof structure does not fall back to triangular truss geometry');
}

// The inner W rectangle must never become a lower room. Every point in it is
// level with the surrounding deck, so there is no collision or render wall at
// any pool edge.
for(let y=33*PLAN_SCALE;y<49*PLAN_SCALE;y++)for(let x=78*PLAN_SCALE;x<90*PLAN_SCALE;x++){
  assert.equal(FP.floorAt(x,y),0,`pool surface remains flush at ${x/PLAN_SCALE},${y/PLAN_SCALE}`);
  assert.equal(FP.cellAt(x,y)?.flags&1,0,`pool surface is not a stair at ${x/PLAN_SCALE},${y/PLAN_SCALE}`);
}
for(const [deckX,deckY,poolX,poolY] of [
  [77,40,78,40],[90,40,89,40],[84,32,84,33],[84,49,84,48],
]){
  const a=rt(deckX,deckY),b=rt(poolX,poolY),step=FP.canStep(a.x,a.y,b.x,b.y,{keys:KEYRING});
  assert.equal(step.ok,true,`no inner pool wall between ${deckX},${deckY} and ${poolX},${poolY}`);
}

// Every cell inside the one exterior wall belongs to the replacement room.
// This catches the actual room-within-a-room failure: a surviving legacy owner,
// non-pool air strip, or stepped ceiling header anywhere inside the envelope.
{
  const plan=FP.floorplan(),owners=FP.ownershipData().owner;
  for(let y=28*PLAN_SCALE;y<50*PLAN_SCALE;y+=1){
    for(let x=71*PLAN_SCALE;x<96*PLAN_SCALE;x+=1){
      const authoredX=x/PLAN_SCALE,authoredY=y/PLAN_SCALE,i=y*plan.w+x;
      assert.equal(FP.isSolid(x,y),false,`natatorium air stays open at ${authoredX},${authoredY}`);
      assert.equal(FP.zoneAt(x,y),ZONE.natatorium,`natatorium owns the room at ${authoredX},${authoredY}`);
      assert.equal(owners[i],'natatorium',`no legacy inner shell survives at ${authoredX},${authoredY}`);
      assert.ok(Math.abs(FP.ceilAt(x,y)-9.5)<.001,`the open roof envelope stays below the academic slab at ${authoredX},${authoredY}`);
    }
  }
}

assert.equal(byId['hall-seating']?.yaw,0,'concert-hall stalls rise away from the stage instead of into the pit');
assert.equal(FP.materialAt(rt(113,23).x,rt(113,23).y),MATERIAL.woodVelvet,'concert-hall floor keeps its authored timber material contract');

const pipeProps = placed.filter((prop) => prop.id.startsWith('plant-pipe-'));
assert.ok(pipeProps.length >= 6, 'plant room receives a visible pipe system');
assert.ok(pipeProps.every((prop) => {
  const behindX = prop.rx - Math.round(Math.sin(prop.yaw || 0));
  const behindY = prop.ry - Math.round(Math.cos(prop.yaw || 0));
  return !prop.blocks && prop.mount === 'wall' && prop.zone === 8 && FP.isSolid(behindX, behindY);
}), 'plant pipes are nonblocking wall fixtures inside the plant zone');
assert.ok(reachable(rt(25, 12), rt(35, 10)), 'studio to plant-room service path remains clear');
assert.ok(reachable(rt(25, 12), rt(40, 14)), 'plant-room pipe dressing does not block circulation');

console.log('conservatory space layout tests ok');

// ── the main stair's shaft is as wide as the stair in it ─────────────────────
// `main-upper-stair` is a 3-metre flight with 3x3-metre landings. It used to run
// down a ONE-cell service spur (`#,#` at x60/61/62), so both landings straddled
// the two wall columns and the collision around them had nothing to agree with.
// Both floors now author the full three metres, walled either side.
{
  const cell = (x, y) => rt(x, y);
  for (const y of [35, 39, 43]) {           // the ground vestibule hall
    for (const x of [60, 61, 62]) {
      const p = cell(x, y);
      assert.ok(!FP.isSolid(p.x, p.y), `ground shaft is open at ${x},${y}`);
    }
  }
  // Walled either side, below the flare where the one-cell service spur widens
  // into the hall (the compiler's corridor widening opens x59-63 at the head).
  for (const y of [40, 41, 42, 43]) {
    for (const x of [59, 63]) {
      const p = cell(x, y);
      assert.ok(FP.isSolid(p.x, p.y), `and walled at ${x},${y}`);
    }
  }
  for (const y of [45, 47, 50]) {           // the upper floor's own well
    for (const x of [60, 61, 62]) {
      const p = cell(x, y);
      assert.ok(!FP.isSolid(p.x, p.y), `upper well is open at ${x},${y}`);
    }
  }
  // The landings sit wholly inside it, which is the point.
  for (const [lx, ly] of [[60, 38], [60, 52]]) {
    for (let ox = 0; ox < 3; ox += 1) {
      for (let oy = 0; oy < 3; oy += 1) {
        const p = cell(lx + ox, ly + oy);
        assert.ok(!FP.isSolid(p.x, p.y), `landing cell ${lx + ox},${ly + oy} is standable`);
      }
    }
  }
}
console.log('main stair shaft ok');

// ── the corridor is on the stair's axis ──────────────────────────────────────
// The practice wing moved five metres west (origin x51) so its spine sits at
// authored x60-62: the same shaft the main stair climbs. Coming up from the ground
// floor you now walk STRAIGHT off the landing and down the middle of the wing.
// It used to land at x60-62 with the corridor at x65-67, so arriving meant
// stepping out and turning left to find the building.
{
  const keys = new Set(['master', 'chapel']);
  for (const door of FP.doorState()) if (!door.keyId || keys.has(door.keyId)) FP.setDoorOpen(door.id, true);
  let y = 52; let steps = 0;
  while (y < 84) {
    const a = rt(61, y); const b = rt(61, y + 1);
    if (!FP.canStep(a.x, a.y, b.x, b.y, { keys }).ok) break;
    steps += 1; y += 1;
  }
  assert.equal(steps, 32, 'the whole wing is walkable due south from the stair landing');
  // The corridor is where the stair is, and the old corridor line is room floor.
  for (const cy of [58, 66, 74, 82]) {
    const spine = rt(61, cy);
    assert.ok(!FP.isSolid(spine.x, spine.y), `x61,${cy} is corridor`);
  }
  // Both stairs still share the north mouth: the academic flight's foot needs
  // x63-65 open at y52 or the third floor becomes unreachable.
  for (const mx of [60, 61, 62, 63, 64, 65]) {
    const mouth = rt(mx, 52);
    assert.ok(!FP.isSolid(mouth.x, mouth.y), `the mouth is open at x${mx}`);
  }
}
console.log('stair axis ok');
