import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { MATERIAL, PLAN_SCALE, ZONE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { DOCK_ACOUSTIC_PROP_IDS, DOCK_HERO_PROP_IDS, DOCK_PORTAL, dockHauntingStaging } from '../src/game/get-in.js';

const rt = (x, y) => FP.toRuntimePoint({ x, y });
const key = ({ x, y }) => `${x},${y}`;
const KEYRING = new Set(['master', 'chapel']);

FP.compile(conservatory.levels, {
  width: conservatory.width,
  height: conservatory.height,
  widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors || [],
  edgePortals: conservatory.edgePortals || [],
  doors: conservatory.doors || [],
});
for(const door of FP.doorState())FP.setDoorOpen(door.id,true);
FP.setSpawn(conservatory.spawn.x, conservatory.spawn.y);
// Spawn is out on the loading bay now. Everything below is about the get-in, so
// it measures from the get-in side of the grey door — where he stands once he is
// in, and where the level check happens.
const inside = FP.toRuntimePoint(conservatory.greyDoorApproach);

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
  'piano_bench',
  'open_score',
  'loose_pages',
  'metronome',
  'wastebasket',
  'soft_bag',
  'draped_coat',
  'mallet_pair',
  'cable_coil',
  'open_instrument_case',
  'atrium_entry_closure',
  'atrium_formal_banner',
  'atrium_suspended_lantern',
  'atrium_waiting_rug',
  'plant_calorifier','plant_pump_skid','plant_mcc_bank','plant_idf_frame',
  'plant_header_manifold','plant_overhead_header','plant_grated_steps','plant_steam',
  'plant_gauge_needle_0','plant_gauge_needle_1','plant_gauge_needle_2',
  'adjustable_spanner','stillson_wrench','walkie_radio','radio_carrier_led',
  'chapel_key_ring_ch04','chapel_key_ring_c17','chapel_key_ring_fohm',
]) {
  assert.ok(PROP_MESH[name], `missing prop mesh contract for ${name}`);
}

assert.equal(placed.length, CONSERVATORY_PROPS.length, 'every dressed prop center remains in open floorplan space');

assert.equal(DOCK_HERO_PROP_IDS.length, 10, 'the get-in has ten authored hero inspections');
for (const id of DOCK_HERO_PROP_IDS) {
  assert.ok(byId[id], `${id} is placed in the get-in`);
  assert.ok(PROPS.pathToProp(inside.x, inside.y, id, KEYRING), `${id} remains reachable from the level-check box`);
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
assert.ok(reachable(inside, rt(65, 15)), 'level-check box to south service leaf remains clear');
assert.ok(reachable(inside, rt(73, 13)), 'level-check box to foyer service leaf remains clear');
for(const entryPortal of Object.values(DOCK_PORTAL)){
  const contact=FP.toRuntimePoint(dockHauntingStaging({entryPortal}),{center:false});
  assert.ok(PROPS.propCanOccupy(contact.x,contact.y),`${entryPortal} tableau contact point is not inside a blocking prop`);
  assert.ok(reachable(inside,contact),`${entryPortal} tableau body can be physically reached and touched`);
}

for (const id of [
  'acq-services-panel-plant',
  'acq-services-panel-pool',
  'acq-services-panel-foh',
]) {
  assert.equal(byId[id]?.interaction, 'action', `${id} remains an explicit breaker interaction`);
  assert.ok(PROPS.pathToProp(inside.x, inside.y, id, KEYRING), `${id} remains reachable from the get-in`);
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
assert.equal(byId['box-office-key-cabinet']?.interactive,false,'key cabinet shell cannot steal focus');
const cabinetRings=['box-office-key-ring-ch04','box-office-key-ring-c17','box-office-key-ring-fohm'].map((id)=>byId[id]);
assert.deepEqual(cabinetRings.map((prop)=>prop?.keyTag),['CH-04','C-17','FOH-M'],'three separate ring props own the authored tags');
assert.ok(cabinetRings.every((prop)=>prop?.action==='chapel-key-ring'),'every ring uses literal in-world selection');
assert.ok(byId['box-office-ledger']?.action === 'rekey-ledger', 'rekey ledger interaction stays canonical');
assert.ok(reachable(rt(90, 14), rt(94, 11.5)), 'entrance-side box-office staff route stays walkable around counter and desk');
assert.ok(PROPS.pathToProp(rt(90, 14).x, rt(90, 14).y, 'box-office-key-cabinet', KEYRING), 'key cabinet remains reachable');
for(const prop of cabinetRings)assert.ok(PROPS.pathToProp(rt(90,14).x,rt(90,14).y,prop.id,KEYRING),`${prop.keyTag} remains reachable`);

// One ordinary standing position can address all three rings. Horizontal aim
// separates the columns; pitch separates the two rings on the left column.
const cabinetApproach=rt(94.8,9.45);
const cabinetMx=(cabinetApproach.x+.5)*.5,cabinetMz=(cabinetApproach.y+.5)*.5;
for(const prop of cabinetRings){
  const dx=prop.interactionX-cabinetMx,dz=prop.interactionY-cabinetMz,d=Math.hypot(dx,dz);
  const yaw=Math.atan2(dx,-dz);
  const pitch=Math.atan2((prop.elevation+(prop.h||.28)*.5)-1.58,d);
  assert.equal(PROPS.pickProp(cabinetApproach.x,cabinetApproach.y,0,2.8,{yaw,pitch})?.id,prop.id,`${prop.keyTag} owns its reticle pitch and position`);
}

// The visible public floor is one circulation field. These points trace both
// sides of the garden, the cleared former box-office choke point and the hall
// approach; a decorative prop may occupy its visible footprint, but it may not
// create an invisible no-space cell in the advertised promenade.
const atriumPublicStart=rt(80,5);
for(const [x,y] of [[77,7],[77,15],[78,23],[90,14],[94,18],[96,22],[90,6]]){
  const point=rt(x,y);
  assert.ok(PROPS.propCanOccupy(point.x,point.y),`atrium circulation point ${x},${y} is visibly open and occupiable`);
  assert.ok(reachable(atriumPublicStart,point),`atrium circulation point ${x},${y} remains connected to the public entrance`);
}
assert.ok(byId['atrium-public-fittings']&&!byId['atrium-public-fittings'].blocks,'wall fittings fill the atrium without claiming garden or circulation cells');
assert.ok(!placed.some((prop)=>prop.id.startsWith('atrium-public-')&&prop.blocks&&prop.x>=79&&prop.x<=88&&prop.y>=8&&prop.y<=20),'new public furniture stays out of the ruined garden');
const civicRuinIds=[
  'atrium-entry-closure','atrium-banner-west','atrium-banner-east',
  'atrium-lantern-north','atrium-lantern-south','atrium-waiting-rug',
];
assert.ok(civicRuinIds.every((id)=>byId[id]),'the civic-ruin pass has all six large visual anchors');
for(const id of civicRuinIds){
  assert.equal(byId[id].blocks,false,`${id} never changes the public circulation graph`);
  assert.equal(byId[id].interactive,false,`${id} is architecture rather than another inspection target`);
  assert.equal(byId[id].structural,true,`${id} participates in the structural prop pass`);
}
assert.equal(placed.filter((prop)=>prop.mesh==='atrium_formal_banner').length,2,'paired formal banners occupy both long walls');
assert.equal(placed.filter((prop)=>prop.mesh==='atrium_suspended_lantern').length,2,'two long-drop lanterns occupy the garden void');
assert.equal(placed.filter((prop)=>prop.mesh==='tower_plaque'&&prop.x>=74&&prop.x<=98&&prop.y>=3&&prop.y<=27).length,0,
  'tower route plaques never appear anywhere in the front atrium');
const frontMain=FP.doorState().find((door)=>door.id==='front-main');
assert.ok(frontMain&&Math.abs(byId['atrium-entry-closure'].rx-frontMain.cx)<=1&&Math.abs(byId['atrium-entry-closure'].ry-frontMain.cy)<=1,
  'the closure assembly is centred on the complete public threshold');

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

const practiceRoomProps = placed.filter((prop) =>
  prop.id.startsWith('practice-') || prop.id.startsWith('acq-practice-chair-'));
const practiceStart = rt(61, 54);
assert.equal(placed.filter((prop) => prop.id.startsWith('practice-piano-')).length, 7,
  'seven teaching rooms contain one wall-backed upright each');
assert.deepEqual(new Set(placed.filter((prop)=>prop.id.startsWith('practice-piano-')).map((prop)=>prop.roomHistory)),new Set([
  'exam-preparation','cello-lesson','piano-maintenance','coat-and-bag-drop',
  'chamber-spillover','copied-parts','hurried-departure',
]),'the seven teaching rooms retain seven distinct authored histories');
const practiceDoors=FP.doorState().filter((door)=>/^practice-(west|east)-[1-4]$/.test(door.id));
assert.equal(practiceDoors.length,8,'all eight room thresholds are authored doors');
assert.ok(practiceDoors.every((door)=>door.open&&door.wedge),'all eight practice-room doors remain visibly wedged open');
const clutterMeshes=new Set(['piano_bench','open_score','loose_pages','metronome','wastebasket','soft_bag','draped_coat','mallet_pair','cable_coil','open_instrument_case']);
const practiceClutter=practiceRoomProps.filter((prop)=>clutterMeshes.has(prop.mesh));
assert.ok(practiceClutter.length>=20,'the full lived-in prop kit materially dresses the suite');
assert.ok(practiceClutter.every((prop)=>prop.interactive===false&&!prop.blocks),'small clutter is non-blocking and non-interactive');
for(const id of ['practice-ensemble-marimba','practice-ensemble-cello','practice-ensemble-violin','practice-ensemble-mallets','practice-case-1']){
  assert.ok(byId[id],`${id} is present in the interrupted ensemble rehearsal`);
}
for(const [from,to] of [
  [rt(64,80),rt(68,78.2)],
  [rt(68,78.2),rt(74.5,79.8)],
  [rt(74.5,79.8),rt(73.8,82.5)],
  [rt(73.8,82.5),rt(68,82.5)],
  [rt(68,82.5),rt(64,80)],
])assert.ok(reachable(from,to),'the ensemble room preserves its entrance-to-instrument walking loop');
for (const prop of practiceRoomProps.filter((entry) => entry.interactive !== false)) {
  assert.ok(PROPS.pathToProp(practiceStart.x, practiceStart.y, prop.id, KEYRING),
    `${prop.id} remains inspectable from the practice stair landing`);
}
for (const prop of practiceRoomProps.filter((entry) => !entry.structural)) {
  const halfW = (prop.w * (prop.scale || 1)) * .46;
  const halfD = (prop.d * (prop.scale || 1)) * .46;
  const c = Math.cos(prop.yaw || 0);
  const s = Math.sin(prop.yaw || 0);
  for (const [lx, lz] of [[0, 0], [-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]]) {
    const x = prop.x + lx * c - lz * s;
    const y = prop.y + lx * s + lz * c;
    assert.equal(FP.isSolid(rt(x, y).x, rt(x, y).y), false,
      `${prop.id} footprint stays out of the practice partitions at ${x.toFixed(2)},${y.toFixed(2)}`);
  }
}
for (let authoredY = 57; authoredY <= 83; authoredY += .5) {
  for (let authoredX = 60; authoredX <= 62; authoredX += .5) {
    const p = rt(authoredX, authoredY);
    assert.ok(PROPS.propCanOccupy(p.x, p.y),
      `practice central spine stays clear at ${authoredX},${authoredY}`);
  }
}
for (const doorY of [59, 66, 73, 80]) {
  for (const doorX of [58.5, 59.5, 62.5, 63.5]) {
    const p = rt(doorX, doorY);
    assert.ok(PROPS.propCanOccupy(p.x, p.y),
      `practice room door landing stays clear at ${doorX},${doorY}`);
  }
}

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
assert.ok(byId['natatorium-entrance-fixtures']?.structural&&!byId['natatorium-entrance-fixtures']?.blocks,'the baths admission sequence is dressing, never a second lobby shell');
for(const id of['pool-entry-rules','pool-entry-first-aid'])assert.ok(byId[id]?.inspect,`${id} gives the entrance an occupied institutional threshold`);
assert.equal(placed.filter((prop)=>prop.mesh==='pool_backstroke_flags').length,2,'two transverse flag lines establish the pool safety datum');
assert.ok(byId['pool-lane-ropes']?.structural&&!byId['pool-lane-ropes']?.blocks,'lane ropes remain visual and never obstruct the walkable water');
assert.equal(placed.filter((prop)=>prop.mesh==='pool_ladder').length,2,'steel ladders explain entering and leaving the basin from either deck');
assert.equal(placed.filter((prop)=>prop.mesh==='changing_bench').length,2,'purpose-built slatted benches replace chapel furniture in the pool hall');
const entranceDressing=new Set(['natatorium-entrance-fixtures','pool-entry-rules','pool-entry-first-aid','natatorium-light-emergency-entry']);
assert.ok(placed.filter((prop)=>prop.zone===ZONE.natatorium&&!entranceDressing.has(prop.id)).every((prop)=>prop.id==='pool-lane-markings'||prop.y>=32.4),'only wall-backed admission dressing occupies the dry lead-in');
assert.ok(reachable(rt(84, 27), rt(84, 37)), 'natatorium lobby crosses the lead deck and enters the pool');
assert.ok(reachable(rt(84, 27), rt(75, 45)), 'natatorium west deck perimeter remains walkable');
assert.ok(reachable(rt(84, 27), rt(91, 34)), 'natatorium east deck and lane storage remain walkable');
assert.ok(reachable(rt(84, 27), rt(84, 47)), 'the entrance, full basin length, and far axial wall read as one traversable hall');
assert.equal(byId['natatorium-hall-shell'], undefined, 'the natatorium has no freestanding inner architectural shell');
assert.equal(byId['natatorium-vault'], undefined, 'the natatorium has no freestanding inner roof shell');
assert.equal(byId['natatorium-sign-exit'], undefined, 'the natatorium threshold has no tower plaque intersecting its door leaf');
assert.equal(byId['pool-lane-markings']?.elevation, .05, 'longitudinal lane markings sit just above the basin floor');
assert.deepEqual({x:byId['pool-lane-markings']?.x,y:byId['pool-lane-markings']?.y},{x:84,y:40.5},'lane markings are centred in the shifted pool');
assert.equal(byId['pool-lifeguard-chair']?.yaw,-Math.PI/2,'lifeguard chair faces west across the pool');
assert.equal(byId['pool-lane-reel']?.yaw,0,'lane reel sits square to the starting end');

const hallPortal=byId['hall-entrance-portal'];
assert.ok(hallPortal?.structural&&!hallPortal.blocks,'the concert-hall portal is architectural dressing, never a second collision throat');
assert.deepEqual(hallPortal?.renderGroups,['ground','hall'],'the concert-hall entrance exists from the atrium and hall sides');
for(const id of['hall-entrance-sign','hall-entrance-program-north'])assert.ok(byId[id]?.inspect,`${id} makes the destination legible before the leaf interaction range`);
assert.equal(byId['atrium-sign-main-exit']?.mesh,'public_exit_sign','the atrium closure sign no longer reuses a tower route plaque');

{
  const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
  const bathsStart=builder.indexOf("mesh('natatorium_perimeter_relief')");
  const bathsEnd=builder.indexOf("mesh('natatorium_entrance_fixtures')",bathsStart);
  const atriumStart=builder.indexOf("mesh('front_atrium_perimeter_relief')");
  const atriumEnd=builder.indexOf("mesh('academic_skylight')",atriumStart);
  const bathsRelief=builder.slice(bathsStart,bathsEnd);
  const atriumRelief=builder.slice(atriumStart,atriumEnd);
  assert.ok(bathsStart>=0&&bathsEnd>bathsStart,'the natatorium keeps its dedicated perimeter finish');
  assert.doesNotMatch(bathsRelief,/lowerCourses:false/,'the natatorium retains its tiled dado and lower baths relief');
  assert.equal((atriumRelief.match(/addUpperCivicRelief\(m,/g)||[]).length,4,'each atrium wall uses the upper-only civic order');
  assert.doesNotMatch(atriumRelief,/addSecondPerimeterWall\(m,/,'no baths-style perimeter kit can reintroduce atrium wainscoting');
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
  const behindX = prop.rx - (prop.wallContact?.nx || 0);
  const behindY = prop.ry - (prop.wallContact?.ny || 0);
  return !prop.blocks && prop.mount === 'wall' && prop.zone === 8
    && !!prop.wallContact && FP.isSolid(behindX, behindY);
}), 'plant pipes are nonblocking wall fixtures inside the plant zone');
assert.ok(reachable(rt(25, 12), rt(35, 10)), 'studio to plant-room service path remains clear');
assert.ok(reachable(rt(25, 12), rt(40, 14)), 'plant-room pipe dressing does not block circulation');
for(const id of['plant-calorifier-north','plant-calorifier-south','plant-pump-north','plant-pump-south','plant-mcc-east','plant-idf-west','plant-overhead-header','plant-annex-steps','plant-heating-header']){
  assert.ok(byId[id],`${id} is visibly authored in plant`);
}
for(const prop of placed.filter((entry)=>entry.id==='plant-rack-1'||entry.id.startsWith('plant-pipe-')||[
  'plant-calorifier-north','plant-calorifier-south','plant-pump-north','plant-pump-south',
  'plant-mcc-east','plant-idf-west','plant-overhead-header','plant-annex-steps',
].includes(entry.id))){
  assert.equal(prop.interactive,false,`${prop.id} is structural plant dressing, not another inspection target`);
}
assert.ok(reachable(rt(29.5,30.5),rt(38,32)),'plant spur still reaches the bent-rig cell');
assert.ok(reachable(rt(29.5,30.5),rt(37.5,30)),'plant spur still reaches S/P-01');
assert.ok(reachable(rt(29.5,30.5),rt(33,37.45)),'wide annex opening reaches the heating header');
assert.ok(reachable(rt(70.5,6.25),rt(33,37.45)),'the oversized Stillson has a valid doorway route from the Get-In rack to the manifold');

console.log('conservatory space layout tests ok');

// ── the main stair's open well and continuous tread ring ───────────────
// Navigation follows a four-cell logical ribbon, while rendering occupies the
// full annulus. Validate the physical construction here: every tread cell is
// backed by the stair and the centre remains one uninterrupted air shaft rather
// than reverting to either hall rock or the old solid square newel.
{
  const spans = FP.physicalSpanData();
  const arcs = FP.floorplan().arcs.filter((arc) => arc.id.startsWith('main-open-well:'));
  assert.equal(arcs.length, 4, 'the main stair has four curving half-coils');
  const [well] = arcs;
  assert.ok(arcs.every((arc) => arc.cx === well.cx && arc.cz === well.cz
    && arc.ri === well.ri && arc.ro === well.ro), 'all four coils share one open well');

  const at = (x, z) => (spans.cells.get(`${x},${z}`) || [])
    .filter((span) => span.owner === 'main-open-well');
  let openWellCells = 0;
  let treadCells = 0;
  for (let z = Math.floor(well.cz - well.ro); z <= Math.ceil(well.cz + well.ro); z += 1) {
    for (let x = Math.floor(well.cx - well.ro); x <= Math.ceil(well.cx + well.ro); x += 1) {
      const radius = Math.hypot(x + 0.5 - well.cx, z + 0.5 - well.cz);
      if (radius < well.ri) {
        openWellCells += 1;
        assert.ok(at(x, z).some((span) => span.floor <= -4 && span.ceil >= 14),
          `the open well remains visible through every floor at ${x},${z}`);
      } else if (radius <= well.ro) {
        treadCells += 1;
        assert.ok(at(x, z).length > 0, `the tread ring has no physical hole at ${x},${z}`);
      }
    }
  }
  assert.equal(openWellCells, 4, 'the 1.3m open well occupies its complete raster footprint');
  assert.equal(treadCells, 108, 'the six-metre-diameter tread ring occupies its complete footprint');
}
console.log('main stair open well ok');

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

// ── the sub-basement dance wing ──────────────────────────────────────────────
//
// Four studios and a store that used to contain nothing at all. The census is
// here because an unplaced prop is SILENT: propsInit filters out anything whose
// centre lands in rock, so a mis-authored room is not an error, it is an empty
// room that looks deliberate.
{
  const wing = placed.filter((prop) => /^(b1|b2|b3|b5|store)-/.test(prop.id));
  for (const [room, pattern] of [
    ['B1', /^b1-/], ['B2', /^b2-/], ['B3', /^b3-/], ['B5', /^b5-/], ['the prop store', /^store-/],
  ]) {
    assert.ok(wing.some((prop) => pattern.test(prop.id)), `${room} is furnished`);
  }
  // There is no B4 — the plant room is standing in it.
  assert.equal(placed.filter((prop) => /^b4-/.test(prop.id)).length, 0, 'there is no studio B4');

  // Props resolve against the compiled wall contact, which accounts for mesh
  // orientation as well as the runtime-grid conversion. Every barre and mirror
  // must retain masonry immediately behind that resolved mounting face. Door
  // stencils are mounted to their leaves and therefore deliberately face air.
  const wallMounted = wing.filter((prop) => PROP_MESH[prop.mesh]?.mount === 'wall'
    && prop.mesh !== 'door_stencil');
  assert.ok(wallMounted.length >= 12, `the wing hangs real wall furniture (${wallMounted.length})`);
  for (const prop of wallMounted) {
    const bx = prop.rx - (prop.wallContact?.nx || 0);
    const by = prop.ry - (prop.wallContact?.ny || 0);
    assert.ok(prop.wallContact, `${prop.id} resolves an explicit mounting face`);
    assert.equal(FP.isSolid(bx, by), true, `${prop.id} hangs on masonry rather than on air`);
  }

  // B3 is one of these rooms, so it carries the wing's surface and its furniture
  // rather than a treatment nothing else in the building has.
  const b3 = rt(15, 12);
  assert.equal(FP.materialAt(b3.x, b3.y), MATERIAL.woodVelvet, 'B3 is sprung maple like the rest of the wing');
  assert.equal(FP.zoneAt(b3.x, b3.y), ZONE.studio, 'and still the only one of them with a take on it');
  assert.ok(byId['b3-barre-east'] && byId['b3-mirror-north-a'], 'B3 keeps a barre and a mirror');
}
console.log('dance wing furnishing ok');
