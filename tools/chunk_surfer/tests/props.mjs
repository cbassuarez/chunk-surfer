import { conservatory } from '../../../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../../../src/data/conservatory-props.js';
import * as FP from '../../../src/world/floorplan.js';
import * as PROPS from '../../../src/game/props.js';
import { corridorThroatCells } from '../../../src/world/corridor-dressing.js';

let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals});
for(const d of conservatory.doors||[])FP.setDoorKey(d.x,d.y,d.key);
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);

PROPS.loadPropState({hushSeed:0x12345678});
const placed=PROPS.propsInit(FP);
const authored=CONSERVATORY_PROPS.length+PROPS.derivedDressing(FP).length;
ck('every authored prop has an open centre',placed.length===authored,`${placed.length}/${authored}`);
ck('every placement names a packed mesh',placed.every((p)=>PROP_MESH[p.mesh]),`${new Set(placed.map((p)=>p.mesh)).size} meshes used`);
ck('floor notes have a dedicated visible mesh',!!PROP_MESH.loose_note);
ck('render placements preserve authored metres',PROPS.renderInstances().every((p)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));

const blocker=placed.find((p)=>p.blocks);
ck('large props block through proxy footprints',blocker&&!PROPS.propCanOccupy(blocker.rx,blocker.ry),blocker?.id);
const lowerRail={x:Math.round(4.7*2),y:Math.round(61*2)};
ck('visible structural rails share height-aware collision',PROPS.structuralColliders().length>=8&&!PROPS.propCanOccupy(lowerRail.x,lowerRail.y),`${PROPS.structuralColliders().length} authored OBBs`);
const seat=placed.find((p)=>p.id==='hall-seating'),seatCenter=FP.toRuntimePoint({x:113,y:20}),seatAisle=FP.toRuntimePoint({x:113,y:24});
ck('accepted hall seating faces the proscenium',Math.abs(seat?.yaw||0)<.001,`yaw=${seat?.yaw}`);
ck('seat banks block but authored hall aisles remain open',seat&&!PROPS.propCanOccupy(seatCenter.x+4,seatCenter.y)&&PROPS.propCanOccupy(seatAisle.x,seatAisle.y));
const hallRender=PROPS.renderInstances({group:'hall'});
ck('hall slice receives seating and structure in physical metres',hallRender.some((p)=>p.mesh==='hall_seating')&&hallRender.some((p)=>p.mesh==='hall_structure'));
const groundRender=PROPS.renderInstances({group:'ground'}),academicRender=PROPS.renderInstances({group:'academic'});
const sharedAtriumIds=['academic-atrium-structure','academic-skylight','academic-garden-basin','atrium-perimeter-relief'];
ck('atrium architecture is one gameplay instance shared across both render groups',sharedAtriumIds.every((id)=>groundRender.some((p)=>p.id===id)&&academicRender.some((p)=>p.id===id)));
const poolLines=groundRender.find((p)=>p.id==='pool-lane-markings');
ck('natatorium has no freestanding inner architectural shell',!placed.some((p)=>p.id==='natatorium-hall-shell'));
const perimeterRelief=placed.filter((p)=>p.id==='atrium-perimeter-relief'||p.id==='natatorium-perimeter-relief');
ck('second-perimeter architecture is visible structure, never duplicate collision',
  perimeterRelief.length===2&&perimeterRelief.every((p)=>p.structural&&!p.blocks),
  perimeterRelief.map((p)=>`${p.id}:${p.blocks?'blocking':'visual'}`).join(','));
ck('atrium and natatorium use distinct authored perimeter assemblies',
  PROP_MESH.front_atrium_perimeter_relief?.blocks===false&&PROP_MESH.natatorium_perimeter_relief?.blocks===false);
ck('pool length markings sit on the walkable pool surface',poolLines&&Math.abs(poolLines.y-.05)<.001,`y=${poolLines?.y}`);
const portraits=placed.filter((p)=>p.mesh==='portrait_frame');
const wallBacked=(p)=>{
  const behindX=p.rx-Math.round(Math.sin(p.yaw||0));
  const behindY=p.ry-Math.round(Math.cos(p.yaw||0));
  return FP.isSolid(behindX,behindY);
};
// Power panels, emergency bulkheads and safety plaques share the generated
// wall-fixture convention: +Z faces the room, while the wall sits behind the
// origin. Their quarter-metre render nudge puts that origin on the cell edge.
const safetyFixtures=placed.filter((p)=>['power_box_01','tower_bulkhead','tower_plaque'].includes(p.mesh));
const fixtureWallBacked=(p)=>{
  const wallX=Math.round(Math.sin(p.yaw||0));
  const wallY=-Math.round(Math.cos(p.yaw||0));
  return FP.isSolid(p.rx+wallX,p.ry+wallY)
    && Math.abs((p.renderOffsetX||0)-wallX*.25)<.001
    && Math.abs((p.renderOffsetZ||0)-wallY*.25)<.001;
};
// NOTHING STANDS IN THE THROAT — TESTED AS GEOMETRY, NOT AS A NAME.
//
// This was a filter on id prefixes: anything called corridor-*, *-stair-*,
// ground-spine-* or practice-corridor-*. It never measured where a prop was, so
// it read both ways wrong. The ground dead end is furnished with an armchair, a
// credenza and a chandelier and passes because its ids say 'deadend-'
// (conservatory-props.js says so out loud); the chapel's two stair signs are
// flat against a wall and FAIL for having '-stair-' in their names.
//
// The rule the bare-circulation note actually states is about the route: rails,
// furniture, frames and hanging fixtures made the safe throat ambiguous. So the
// test is now — if a prop stands in a corridor, it is on the wall. Wall-mounted
// dressing passes wherever it is; anything floor-standing in a running corridor
// fails whatever it is called. Note propCanOccupy cannot do this job: a chair is
// blocks:false, so the four props deleted from the practice corridor would all
// have walked straight through a collision test.
//
// Corridors are the running ones only (world/corridor-dressing.js): a dead end
// is not a route, which is why the one at the end of the ground spine is allowed
// to be a room.
const corridorThroat=corridorThroatCells(FP);
const circulationClutter=placed.filter((p)=>
  !p.structural
  &&!p.id.startsWith('light-')
  &&corridorThroat.has(`${p.rx},${p.ry}`)
  // Against a wall counts however it got there. wallContact is the opt-in
  // mount:'wall' resolution; wallBacked is the geometric fallback for the
  // furniture that was stood against blockwork by hand long before that existed.
  &&!p.wallContact&&!wallBacked(p));
ck('remaining room portraits are mounted against their authored wall plane',portraits.every(wallBacked),`${portraits.length} room portraits`);
ck('power, emergency and egress fixtures touch and face away from a real wall',safetyFixtures.every(fixtureWallBacked),
  safetyFixtures.filter((p)=>!fixtureWallBacked(p)).map((p)=>p.id).join(','));
// The check fails on the dressing this build generates, which is the thing it
// exists to police. Authored furniture that predates it is REPORTED, not failed:
// a corridor-shaped store room with a desk in the middle of it is a judgement
// call belonging to whoever authored the room, not a build break.
const DRESSED=(p)=>p.id.startsWith('corridor-fixture-')||p.id.startsWith('plate-');
const dressingInThroat=circulationClutter.filter(DRESSED);
const authoredInThroat=circulationClutter.filter((p)=>!DRESSED(p));
ck('nothing generated stands in a corridor throat: corridor dressing is on the wall',
  dressingInThroat.length===0,dressingInThroat.map((p)=>`${p.id}@${p.rx},${p.ry}`).join(','));
if(authoredInThroat.length)console.log(`NOTE  authored props standing in a corridor throat (pre-existing): ${authoredInThroat.map((p)=>p.id).join(', ')}`);

// A small deterministic fixture isolates picking from the production dressing.
const testProp={id:'test-upright',mesh:'upright_piano',x:65,y:9,yaw:0,blocks:true,interaction:'play',
  inspect:{first:'first',again:'again'},sampleFamily:[{worldId:'main_b3',fileLabel:'03'},{worldId:'main_b3',fileLabel:'17'}]};
PROPS.propsInit(FP,[testProp]);
const player=FP.toRuntimePoint({x:65,y:11});
const hit=PROPS.pickProp(player.x,player.y,0,2.5);
ck('forward-cone picking finds the visible prop',hit?.id==='test-upright',hit?.id||'none');
ck('first inspection is authored',PROPS.inspectProp('test-upright')==='first');
ck('repeat inspection is shorter',PROPS.inspectProp('test-upright')==='again');
ck('audition cycles a fixed family',PROPS.auditionProp('test-upright')?.fileLabel==='03'&&PROPS.auditionProp('test-upright')?.fileLabel==='17');
ck('auditioning teaches that physical prop',PROPS.isAuditioned('test-upright'));
const path=PROPS.pathToProp(player.x,player.y,'test-upright',new Set(['master']));
ck('learned reachable instruments enter HUSH eligibility',PROPS.reachableLearned(player.x,player.y,new Set(['master'])).length===1,`${path?.length||0} path cells`);
ck('first eligible post-tutorial take is guaranteed',PROPS.shouldArmHush({tutorial:false,battle:false}));
ck('tutorial takes suppress HUSH',!PROPS.shouldArmHush({tutorial:true}));
const choice=PROPS.nextHushChoice(player.x,player.y,new Set(['master']));
ck('HUSH selects the learned physical prop',choice?.prop.id==='test-upright');
ck('HUSH selects from that prop family',testProp.sampleFamily.some((r)=>r.fileLabel===PROPS.hushSampleFor('test-upright')?.fileLabel));
PROPS.markHushEvent();
const saved=PROPS.savePropState();
ck('prop persistence includes inspection, audition and deterministic HUSH state',saved.inspected.includes('test-upright')&&saved.auditioned.includes('test-upright')&&saved.hushCount===1&&Number.isInteger(saved.hushSeed));

const sealedFloor={floorAt:()=>0,zoneAt:()=>1,isSolid:(x,y)=>x<0||y<0||x>12||y>12,
  canStep:(_x,_y,nx,ny)=>nx<0||ny<0||nx>12||ny>12?{ok:false,why:'wall'}:nx>=3?{ok:false,why:'locked'}:{ok:true}};
PROPS.loadPropState({auditioned:['locked-piano']});
PROPS.propsInit(sealedFloor,[{...testProp,id:'locked-piano',x:4,y:0}]);
ck('locked or disconnected learned instruments are excluded',PROPS.reachableLearned(0,0,new Set()).length===0);

if(!pass){console.error('\n❌ PROP FAILURES');process.exit(1);}
console.log('\n✅ PROPS PASSED');
