import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  conservatory, ACADEMIC_ENTRY, ACADEMIC_BREACH, ACADEMIC_CLASSROOM_DOORS,
} from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { TARGETS } from '../src/data/conservatory-script.js';
import { F, MATERIAL, ZONE, ZONE_WORLD } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { buildMapModel, captureFloorplanMapSource } from '../src/game/map-model.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[],
});
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);
PROPS.propsInit(FP);

const academicDoors=FP.doorState().filter((door)=>door.id.startsWith('academic-'));
const classroomDoors=academicDoors.filter((door)=>door.id.startsWith('academic-classroom-'));
// SEVEN locked classrooms now. The north-east room became the lobby — one room
// given over to circulation so the core corridor is a circuit rather than a spine
// with a dead end at each end. Its two doors are the only unlocked openings up
// here, and neither of them opens a classroom.
assert.equal(classroomDoors.length,7);
assert.equal(ACADEMIC_CLASSROOM_DOORS.length,7);
assert.equal(academicDoors.length,11,'seven locked classrooms, two locked offices, and the lobby pair');
const lobbyDoors=academicDoors.filter((door)=>door.id==='academic-lobby-core'||door.id==='academic-gallery-lobby');
assert.equal(lobbyDoors.length,2,'the lobby has a way in and a way through');
assert.ok(lobbyDoors.every((door)=>!door.keyId),'and neither of them is locked');
assert.ok(academicDoors.filter((door)=>!lobbyDoors.includes(door))
  .every((door)=>door.keyId==='academic-core'),'everything else up here stays locked');
assert.ok(academicDoors.every((door)=>door.archetype===DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS));
assert.ok(CONSERVATORY_DOORS.filter((door)=>door.key==='academic-core').every((door)=>door.id.startsWith('academic-')));

const ordinaryKeys=new Set(['master','chapel']);
// The lobby pair is deliberately outside this rule: those two leaves are the way
// round the floor, so they answer to no key at all. Everything else up here holds
// against the standard and chapel rings.
const lockedAcademicDoors=academicDoors.filter((door)=>door.keyId==='academic-core');
assert.equal(lockedAcademicDoors.length,9);
for(const door of lockedAcademicDoors){
  FP.setDoorOpen(door.id,false);
  const from=door.widthAxis==='x'?{x:door.cx,y:door.cy-3}:{x:door.cx-3,y:door.cy};
  const facing=door.widthAxis==='x'?[0,1]:[1,0];
  const denied=FP.interactDoor(from.x,from.y,facing,ordinaryKeys);
  assert.equal(denied?.why,'locked',`${door.id} rejects the standard and chapel rings`);
  const artificial=FP.interactDoor(from.x,from.y,facing,new Set([...ordinaryKeys,'academic-core']));
  assert.equal(artificial?.ok,true,`${door.id} accepts the artificial core in isolation`);
  FP.setDoorOpen(door.id,false);
}
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.doesNotMatch(mainSource,/playerKeys\.add\(['"]academic-core['"]\)/);

for(const door of FP.doorState())if(!door.keyId||ordinaryKeys.has(door.keyId))FP.setDoorOpen(door.id,true);
const reachable=new Set(),queue=[FP.spawn()];reachable.add(`${queue[0].x},${queue[0].y}`);
for(let i=0;i<queue.length;i++){
  const here=queue[i];
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const result=FP.canStep(here.x,here.y,here.x+dx,here.y+dy,{keys:ordinaryKeys});
    if(!result.ok)continue;
    const next=result.redirect||{x:here.x+dx,y:here.y+dy},key=`${next.x},${next.y}`;
    if(reachable.has(key)||!PROPS.propCanOccupy(next.x,next.y))continue;
    reachable.add(key);queue.push(next);
  }
}
const runtime=(point)=>FP.toRuntimePoint(point);
for(const point of [ACADEMIC_ENTRY,ACADEMIC_BREACH,{x:17,y:265}]){
  const p=runtime(point);assert.ok(reachable.has(`${p.x},${p.y}`),`ordinary traversal reaches ${point.x},${point.y}`);
}

const academicCell=runtime({x:27,y:254});
assert.equal(FP.floorAt(academicCell.x,academicCell.y),10);
assert.equal(FP.zoneAt(academicCell.x,academicCell.y),ZONE.academic);
assert.equal(FP.materialAt(academicCell.x,academicCell.y),MATERIAL.academicPlaster);
assert.equal(ZONE_WORLD[ZONE.academic],'amplifications');
assert.equal(TARGETS.length,5);
assert.equal(BUILDING_MAP.targets.length,5);
assert.ok(!BUILDING_MAP.targets.some((target)=>target.logical.y>=240));

// The upper two half-coils remain service-concrete collision beneath the
// dedicated project-native hero construction.
const upperMainFlight=FP.floorplan().stairRuns.find((run)=>run.owner==='main-open-well'&&run.fromH===4.8);
assert.ok(upperMainFlight,'the 3F spiral flight is compiled');
assert.equal(FP.materialAt(upperMainFlight.logical0[0],upperMainFlight.logical0[1]),MATERIAL.serviceConcrete,
  'the 3F stair keeps the service-stair concrete treatment');
const stairClutterMeshes=new Set(['upper_stair_dressing','basement_stair_dressing','academic_stair_dressing','stair_smoke_door_open','stair_smoke_door_closed','stair_sconce_pair_opal','stair_bulkhead_pair','stair_pendant_opal','tower_stair_rail_low_up','tower_stair_rail_high_up','tower_stair_rail_high_down','tower_stair_rail_low_down']);
assert.equal(CONSERVATORY_PROPS.some((prop)=>prop.id!=='tower-light-ringing'&&stairClutterMeshes.has(prop.mesh)),false,
  'every ordinary stair stays free of rails, frames, and decorative fixtures');
assert.equal(CONSERVATORY_PROPS.find((prop)=>prop.id==='main-open-well-stair')?.mesh,'main_open_well_stair',
  'the main spiral alone uses its dedicated hero construction');
assert.equal(CONSERVATORY_PROPS.find((prop)=>prop.id==='tower-light-ringing')?.mesh,'stair_pendant_opal',
  'the ringing-room ceiling pendant is the sole deliberate exception');

const academicProps=CONSERVATORY_PROPS.filter((prop)=>prop.id.startsWith('academic-'));
assert.ok(academicProps.length>=100);
// The gallery is mute, with TWO sanctioned kinds of exception and no others.
//
//   1. the west garden planter, which holds a calibration pin (see PIN_HOSTS in
//      main.js). The pins used to lie loose on the floor of this zone at 2cm
//      elevation and were, in practice, unfindable — so one piece of the garden
//      became something you may put a hand in;
//   2. the four intact busts, which you may TALK to (see BUST_TALK). Every answer
//      is the recordist's own; addressing them grants nothing, takes nothing and
//      changes no state except which things he has said out loud.
//
// Both remain inert in every other way: no sample, no action, no provenance, no
// collectible anywhere on this floor.
const MUTE_EXCEPTIONS=new Set(['academic-garden-planter-west']);
const TALKABLE=new Set(academicProps.filter((prop)=>prop.talkable).map((prop)=>prop.id));
assert.deepEqual([...TALKABLE].sort(),
  ['academic-bust-1','academic-bust-2','academic-bust-4','academic-bust-5',
   'academic-bust-fragment-3','academic-bust-fragment-6'],
  'all six stations may be addressed — the two broken heads included, never the plinths');
// Six stations, six different things to find. They used to share one tree, so
// every head said the same words and the set read as one prop repeated.
const BUST_KINDS=mainSource.match(/const BUST_TREES\s*=\s*Object\.freeze\(\{[\s\S]*?\}\)/)?.[0]||'';
for(const id of TALKABLE) assert.ok(BUST_KINDS.includes(`'${id}'`),`${id} is assigned its own beat`);
assert.match(BUST_KINDS,/'fragment'/);
assert.match(BUST_KINDS,/'answer'/,'one of them answers back');
assert.match(BUST_KINDS,/'pin'/,'and one of them is holding a pin');
assert.match(mainSource,/BUST_THAT_TURNS\s*=\s*'academic-bust-2'/,'the scare is on an authored head, not whichever you touched twice');
assert.match(mainSource,/'academic-bust-5':\s*\{[\s\S]{0,120}pin\.gallery/,'the pin host is wired');
assert.ok(academicProps.every((prop)=>prop.interactive===false||MUTE_EXCEPTIONS.has(prop.id)||TALKABLE.has(prop.id)),
  'the gallery stays mute apart from the pin host and the four heads');
assert.equal(academicProps.filter((prop)=>prop.interactive!==false).length,MUTE_EXCEPTIONS.size+TALKABLE.size,
  'and gains no further interactive pieces by accident');
assert.ok(academicProps.every((prop)=>!prop.sampleFamily&&!prop.action&&!prop.provenance));
// A bust is a conversation and nothing else: no inspect text, no pin, no sample.
for(const id of TALKABLE){
  const prop=academicProps.find((entry)=>entry.id===id);
  assert.ok(!prop.inspect,`${id} is addressed, not inspected`);
  assert.ok(!prop.sampleFamily&&!prop.action,`${id} grants nothing`);
}
for(const id of MUTE_EXCEPTIONS){
  const prop=academicProps.find((entry)=>entry.id===id);
  assert.ok(prop?.inspect?.first,`${id} is inspectable, which is the whole point of the exception`);
}
for(const id of ['academic-atrium-structure','academic-skylight','academic-garden-basin','atrium-perimeter-relief']){
  const prop=CONSERVATORY_PROPS.find((entry)=>entry.id===id);
  assert.deepEqual(prop?.renderGroups,['ground','academic']);
}

const project=(point)=>{
  const p=FP.logicalToPhysical(...Object.values(runtime(point)));
  return{x:p.x,z:p.z,height:p.y,renderGroup:p.renderGroup};
};
const source=captureFloorplanMapSource({
  definition:BUILDING_MAP,physical:FP.physicalSpanData(),stairPortals:FP.floorplan().stairPortals,
  projectLogical:project,labelForRoom:(id)=>id,
});
const job={done:0,total:5,rooms:TARGETS.map((roomId)=>({roomId,label:roomId,notes:[],recorded:false}))};
const before=buildMapModel({source,job,player:{...project(conservatory.spawn),x:project(conservatory.spawn).x,y:project(conservatory.spawn).z}});
assert.equal(before.floors.find((floor)=>floor.id==='academic')?.discovered,false,'the issued plan shows 3F while retaining its unvisited status');
assert.equal(before.connectors.some((connector)=>connector.a.floorId==='academic'||connector.b.floorId==='academic'),true);
const atAcademic=project(ACADEMIC_ENTRY);
const after=buildMapModel({source,job,discoveredFloorIds:new Set(['academic']),player:{x:atAcademic.x,y:atAcademic.z,height:atAcademic.height,renderGroup:atAcademic.renderGroup}});
assert.equal(after.floors.find((floor)=>floor.id==='academic')?.shortLabel,'3F');
assert.equal(after.spaces.some((space)=>space.floorId==='academic'),true);
assert.ok(after.connectors.some((connector)=>connector.a.floorId==='academic'||connector.b.floorId==='academic'));

const physical=FP.physicalSpanData();
assert.equal(physical.overlaps.length,0);
const academicPortal=FP.floorplan().stairPortals.find((portal)=>portal.group1==='academic');
assert.ok(academicPortal&&academicPortal.rises>0&&academicPortal.riseHeight<=FP.STEP_UP);

console.log('academic gallery contracts passed');

// ── the third floor is a circuit, not eight dead ends ────────────────────────
// It used to be eight classrooms with ONE door each, all onto a single core
// corridor that itself dead-ended at the north wall. Now each bank is chained
// room-to-room and the north-east room is a lobby through to the gallery, so you
// can walk the floor without ever reversing:
//
//   gallery → lobby → core → south corridor → gallery
//
// The gallery is untouched; the only cut into it is one door in its outer west
// wall, five metres from the nearest plinth.
{
  const keys = new Set(['master', 'chapel']);
  for (const door of FP.doorState()) if (!door.keyId || keys.has(door.keyId)) FP.setDoorOpen(door.id, true);
  const at = (x, y) => FP.toRuntimePoint({ x, y: 240 + y });
  const rooms = { lobby: [14, 21, 1, 6] };
  for (const [name, [x0, x1, y0, y1]] of Object.entries(rooms)) {
    let exits = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const a = at(x, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) continue;
          if (FP.canStep(a.x, a.y, at(nx, ny).x, at(nx, ny).y, { keys }).ok) { exits += 1; break; }
        }
      }
    }
    assert.ok(exits >= 2, `${name} has more than one way out (${exits})`);
  }
  // And the circuit closes: you can get from the gallery back to the gallery the
  // long way round, through the lobby and the core, without retracing.
  const reach = (from, to) => {
    const start = at(...from); const goal = at(...to);
    const seen = new Set([`${start.x},${start.y}`]); const queue = [start];
    while (queue.length) {
      const cell = queue.pop();
      if (cell.x === goal.x && cell.y === goal.y) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        const key = `${next.x},${next.y}`;
        if (seen.has(key)) continue;
        if (!FP.canStep(cell.x, cell.y, next.x, next.y, { keys }).ok) continue;
        seen.add(key); queue.push(next);
      }
    }
    return false;
  };
  // The circuit: from the gallery, through the lobby, down the core, along the
  // south corridor and back into the gallery — without a key and without
  // reversing through a dead end.
  assert.ok(reach([25, 5], [18, 3]), 'the gallery reaches the lobby');
  assert.ok(reach([18, 3], [11, 14]), 'the lobby reaches the core');
  assert.ok(reach([11, 14], [12, 28]), 'the core reaches the south corridor');
  assert.ok(reach([12, 28], [40, 15]), 'and the south corridor comes back into the gallery');
  // The locked rooms stay locked: the point of this floor is intact.
  assert.ok(!reach([25, 5], [4, 10]), 'a classroom is still not somewhere you can walk into');
  // The busts' own aisles stay exactly as authored: no door, no threshold.
  for (const y of [10, 14, 18]) {
    const cell = at(27, y);
    assert.ok(!FP.hasFlag(cell.x, cell.y, F.DOOR), 'no door is cut beside a plinth');
  }
}
console.log('third floor circuit ok');
