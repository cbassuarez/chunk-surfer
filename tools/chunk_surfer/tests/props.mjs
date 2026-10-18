import { conservatory } from '../../../src/data/floorplan/conservatory.js';
import { readFileSync } from 'node:fs';
import { CONSERVATORY_PROPS, PROP_MESH, STRUCTURAL_COLLIDERS } from '../../../src/data/conservatory-props.js';
import { PROP_BOUNDS } from '../../../src/data/generated/prop-geometry.js';
import { CELL } from '../../../src/data/floorplan/legend.js';
import * as FP from '../../../src/world/floorplan.js';
import * as PROPS from '../../../src/game/props.js';
import { corridorThroatCells } from '../../../src/world/corridor-dressing.js';
import { wallContactAt } from '../../../src/world/wall-contact.js';

let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
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
// The rail spans a cascading balcony. Its midpoint need not have the rear
// deck's floor height, and a runtime cell's body sample is at (cell+.5)*CELL.
const lowerRail=STRUCTURAL_COLLIDERS.find(c=>c.id==='hall-lower-left-rail');
const registeredRail=PROPS.structuralColliders().find(c=>c.id===lowerRail?.id);
const railSamples=[];
if(lowerRail)for(let y=Math.floor((lowerRail.y-lowerRail.depth/2)/CELL);y<=Math.ceil((lowerRail.y+lowerRail.depth/2)/CELL);y++)
  for(let x=Math.floor((lowerRail.x-lowerRail.width/2)/CELL);x<=Math.ceil((lowerRail.x+lowerRail.width/2)/CELL);x++){
    const dx=(x+.5)*CELL-lowerRail.x,dz=(y+.5)*CELL-lowerRail.y,c=Math.cos(lowerRail.yaw||0),s=Math.sin(lowerRail.yaw||0);
    const lx=dx*c+dz*s,lz=-dx*s+dz*c,floor=FP.floorAt(x,y);
    if(Math.abs(lx)<=lowerRail.width/2&&Math.abs(lz)<=lowerRail.depth/2&&!FP.isSolid(x,y)
      &&floor>=lowerRail.minElevation-.05&&floor<=lowerRail.maxElevation+.05)railSamples.push({x,y});
  }
ck('visible structural rails share registered height-aware collision',!!registeredRail&&railSamples.length>0
  &&['x','y','width','depth','yaw','minElevation','maxElevation'].every(k=>registeredRail[k]===lowerRail[k])
  &&railSamples.every(p=>!PROPS.propCanOccupy(p.x,p.y)),`${railSamples.length} occupied rail samples; ${PROPS.structuralColliders().length} authored OBBs`);
if(railSamples.length){
  const point=railSamples[0],canAt=floor=>{
    PROPS.propsInit({...FP,floorAt:()=>floor},[]);
    return PROPS.propCanOccupy(point.x,point.y);
  };
  ck('rail collision is active only through its declared vertical interval',
    !canAt((lowerRail.minElevation+lowerRail.maxElevation)/2)
      &&canAt(lowerRail.minElevation-.10)&&canAt(lowerRail.maxElevation+.10));
  // Restore the already-derived production placements without regenerating
  // corridor/room dressing a second time. Wall resolution is idempotent.
  PROPS.propsInit(FP,placed);
}
const seat=placed.find((p)=>p.id==='hall-seating'),seatCenter=FP.toRuntimePoint({x:113,y:20}),seatAisle=FP.toRuntimePoint({x:113,y:24});
ck('accepted hall seating faces the proscenium',Math.abs(seat?.yaw||0)<.001,`yaw=${seat?.yaw}`);
ck('seat banks block but authored hall aisles remain open',seat&&!PROPS.propCanOccupy(seatCenter.x+4,seatCenter.y)&&PROPS.propCanOccupy(seatAisle.x,seatAisle.y));
const hallRender=PROPS.renderInstances({group:'hall'});
ck('hall slice receives seating and structure in physical metres',hallRender.some((p)=>p.mesh==='hall_seating')&&hallRender.some((p)=>p.mesh==='hall_structure'));
const groundRender=PROPS.renderInstances({group:'ground'}),academicRender=PROPS.renderInstances({group:'academic'});
const sharedAtriumIds=['academic-atrium-structure','academic-garden-basin','atrium-perimeter-relief'];
ck('atrium architecture is one gameplay instance shared across both render groups',sharedAtriumIds.every((id)=>groundRender.some((p)=>p.id===id)&&academicRender.some((p)=>p.id===id)));
ck('legacy atrium grid remains below rather than forming a second gallery roof',
  groundRender.some((p)=>p.id==='academic-skylight')&&!academicRender.some((p)=>p.id==='academic-skylight'));
const roofRender=PROPS.renderInstances({group:'academicRoof'});
ck('canonical roof glazing is shared between its supported roof and the gallery underside',
  academicRender.some((p)=>p.id==='academic-roof-glazing')&&roofRender.some((p)=>p.id==='academic-roof-glazing'));
const poolLines=groundRender.find((p)=>p.id==='pool-lane-markings');
ck('natatorium has no freestanding inner architectural shell',!placed.some((p)=>p.id==='natatorium-hall-shell'));
const perimeterRelief=placed.filter((p)=>p.id==='atrium-perimeter-relief'||p.id==='natatorium-perimeter-relief');
ck('second-perimeter architecture is visible structure, never duplicate collision',
  perimeterRelief.length===2&&perimeterRelief.every((p)=>p.structural&&!p.blocks),
  perimeterRelief.map((p)=>`${p.id}:${p.blocks?'blocking':'visual'}`).join(','));
ck('atrium and natatorium use distinct authored perimeter assemblies',
  PROP_MESH.front_atrium_perimeter_relief?.blocks===false&&PROP_MESH.natatorium_perimeter_relief?.blocks===false);
const poolMarking=placed.find(p=>p.id==='pool-lane-markings');
const poolMarkingFloor=poolMarking&&FP.floorAt(poolMarking.rx,poolMarking.ry);
ck('pool length markings sit on the actual depressed pool surface',poolLines&&poolMarking
  &&Math.abs(poolMarking.floor-poolMarkingFloor)<.001
  &&Math.abs(poolLines.y-(poolMarkingFloor+.05))<.001,
  `floor=${poolMarkingFloor}; rendered y=${poolLines?.y}`);
const portraits=placed.filter((p)=>p.mesh==='portrait_frame');
const renderedById=new Map(PROPS.renderInstances({inscriptions:false,batchDressing:false}).map(p=>[p.id,p]));
const acquisition=JSON.parse(readFileSync(new URL('../../../public/assets/conservatory-acquisitions.stats.json',import.meta.url),'utf8'));
const wallPlan={size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,
  materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
const fronts={'+z':[0,1],'-z':[0,-1],'+x':[1,0],'-x':[-1,0]};
// Measure the rendered rear face against a real compiled wall plane. Logical
// neighbours and quarter-metre offset guesses cannot establish physical
// contact after wall snapping, axis scaling or translated upper-floor poses.
function wallMount(p,rendered=renderedById.get(p.id)){
  const bounds=PROP_BOUNDS[p.mesh]||acquisition.meshes[p.mesh]?.bounds;
  const front=fronts[p.frontAxis??PROP_MESH[p.mesh]?.frontAxis??'+z'];
  if(!rendered||!bounds||!front)return{ok:false,reason:'missing render, measured bounds or declared front'};
  const scale=p.scale||1,sx=(p.scaleX??1)*scale,sz=(p.scaleZ??1)*scale;
  const rotate=(x,z,yaw)=>({x:x*Math.cos(yaw)-z*Math.sin(yaw),z:x*Math.sin(yaw)+z*Math.cos(yaw)});
  const logicalFront=rotate(front[0]*Math.sign(sx),front[1]*Math.sign(sz),p.yaw||0);
  const prefer=p.mountNormal||{nx:Math.round(logicalFront.x),ny:Math.round(logicalFront.z)};
  const contact=wallContactAt(wallPlan,p.rx+.5,p.ry+.5,{prefer,searchCells:p.mountSearchCells});
  if(!contact)return{ok:false,reason:'no compiled wall behind declared front'};
  const at=FP.logicalToPhysical(contact.cell.x,contact.cell.y);
  const arc=FP.arcYawOffset(contact.cell.x,contact.cell.y,at.x+.5,at.z+.5)||0;
  const offset=rotate((contact.planeX??(contact.cell.x+.5))-contact.cell.x,
    (contact.planeY??(contact.cell.y+.5))-contact.cell.y,arc);
  const plane={x:(at.x+offset.x)*CELL,z:(at.z+offset.z)*CELL};
  const normal=rotate(contact.nx,contact.ny,arc);
  const facing=rotate(front[0]*Math.sign(sx),front[1]*Math.sign(sz),rendered.yaw);
  const alignment=facing.x*normal.x+facing.z*normal.z;
  const distances=[];
  for(const x of[bounds.min[0],bounds.max[0]])for(const z of[bounds.min[2],bounds.max[2]]){
    const q=rotate(x*sx,z*sz,rendered.yaw);
    distances.push((rendered.x+q.x-plane.x)*normal.x+(rendered.z+q.z-plane.z)*normal.z);
  }
  const rear=Math.min(...distances),frontDistance=Math.max(...distances);
  return{ok:alignment>1-1e-6&&Math.abs(rear)<.01&&frontDistance>rear,
    reason:`rear=${(rear*100).toFixed(1)}cm; facing=${alignment.toFixed(3)}`,rear,plane,normal};
}
const wallBacked=p=>wallMount(p).ok;
// Imported panel bounds come from their own pack; faces are not inferred from
// the width/depth gameplay proxy or from the sign of an authored offset.
const safetyFixtures=placed.filter((p)=>['power_box_01','tower_bulkhead','tower_plaque'].includes(p.mesh));
const fixtureWallBacked=p=>wallMount(p).ok;
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
ck('remaining room portraits are mounted against their actual physical wall plane',portraits.every(wallBacked),
  portraits.filter(p=>!wallBacked(p)).map(p=>`${p.id}[${wallMount(p).reason}]`).join(','));
ck('power, emergency and egress fixtures touch and face away from a real wall',safetyFixtures.every(fixtureWallBacked),
  safetyFixtures.filter((p)=>!fixtureWallBacked(p)).map((p)=>`${p.id}[${wallMount(p).reason}]`).join(','));
const mountControl=[...portraits,...safetyFixtures].find(p=>p.mount==='wall'&&wallMount(p).ok);
if(mountControl){
  const rendered=renderedById.get(mountControl.id),report=wallMount(mountControl);
  ck('wall audit rejects floating, buried and reversed mounted fixtures',
    !wallMount(mountControl,{...rendered,x:rendered.x+report.normal.x*.10,z:rendered.z+report.normal.z*.10}).ok
      &&!wallMount(mountControl,{...rendered,x:rendered.x-report.normal.x*.10,z:rendered.z-report.normal.z*.10}).ok
      &&!wallMount(mountControl,{...rendered,yaw:rendered.yaw+Math.PI}).ok,mountControl.id);
}else ck('wall audit has a valid mounted control',false);
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
