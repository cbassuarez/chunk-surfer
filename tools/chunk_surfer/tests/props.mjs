import { conservatory } from '../../../public/labs/chunk-surfer/src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../../../public/labs/chunk-surfer/src/data/conservatory-props.js';
import * as FP from '../../../public/labs/chunk-surfer/src/world/floorplan.js';
import * as PROPS from '../../../public/labs/chunk-surfer/src/game/props.js';

let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors});
for(const d of conservatory.doors||[])FP.setDoorKey(d.x,d.y,d.key);
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);

PROPS.loadPropState({hushSeed:0x12345678});
const placed=PROPS.propsInit(FP);
ck('every authored prop has an open centre',placed.length===CONSERVATORY_PROPS.length,`${placed.length}/${CONSERVATORY_PROPS.length}`);
ck('every placement names a packed mesh',placed.every((p)=>PROP_MESH[p.mesh]),`${new Set(placed.map((p)=>p.mesh)).size} meshes used`);
ck('render placements preserve authored metres',PROPS.renderInstances().every((p)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));

const blocker=placed.find((p)=>p.blocks);
ck('large props block through proxy footprints',blocker&&!PROPS.propCanOccupy(blocker.rx,blocker.ry),blocker?.id);
const seat=placed.find((p)=>p.id==='hall-seating'),seatCenter=FP.toRuntimePoint({x:113,y:20}),seatAisle=FP.toRuntimePoint({x:113,y:24});
ck('seat banks block but authored hall aisles remain open',seat&&!PROPS.propCanOccupy(seatCenter.x+4,seatCenter.y)&&PROPS.propCanOccupy(seatAisle.x,seatAisle.y));
const hallRender=PROPS.renderInstances({group:'hall'});
ck('hall slice receives seating and structure in physical metres',hallRender.some((p)=>p.mesh==='hall_seating')&&hallRender.some((p)=>p.mesh==='hall_structure'));

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
