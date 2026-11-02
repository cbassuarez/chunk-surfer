import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {VIGIL,freshVigilState,normalizeVigilState,reduceVigil,vigilSeatCandidates} from '../src/game/yard-vigil.js';
import {normalizeCombatBuild} from '../src/game/combat-progression.js';
import {EVENT_TYPES} from '../src/progression/events.js';
import {NodeIO} from '@gltf-transform/core';
import {cameraBasis} from '../src/render/camera-basis.js';
import {ORDINARY_CAMERA_TAN_HALF_FOV} from '../src/render/cinematic-lens.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('function vigilRoofCell(x,y){');
const end=main.indexOf('// ── the whisper bed',start);
assert.ok(start>=0&&end>start);

function fixture({save={flags:{}},seatPoint={x:200,y:200}}={}){
  const flags={...(save.flags||{})},loose=new Map(),commits=[],events=[];
  let top=null,phase='seated',group='academicRoof',owner='academic_roof',floor=17,solid=false,tall=false,blocked=false;
  const angles={yaw:0,pitch:0};
  const seatScene={view:()=>({phase,seat:{...seatPoint}})};
  const context={VIGIL,freshVigilState,normalizeVigilState,reduceVigil,vigilSeatCandidates,
    yardVigil:freshVigilState(),roofCitySeatScene:seatScene,planName:'conservatory',storyMode:true,
    px:198,py:200,CELL:.5,ZONE:{academicRoof:12},
    usingSpecialSpace:()=>false,flagTest:id=>!!flags[id],flagSet:id=>{flags[id]=true;},
    getSave:()=>({...save,flags}),saveCommit:value=>commits.push(value),refreshWorldProps(){},
    EVENT_TYPES,emitProgress:(...args)=>events.push(args),
    scenes:{top:()=>top,blocksWorld:()=>blocked,blocksInput:()=>!!top},
    FP:{isSolid:()=>solid,zoneAt:()=>12,logicalToPhysical:(x,y)=>({x,z:y,y:floor,renderGroup:group,owner}),
      floorAt:()=>floor,ceilAt:()=>24},
    PROPS:{propCanOccupy:()=>true,tallBlockingPropAt:()=>tall,
      setLooseProp:(id,value)=>{if(value)loose.set(id,value);else loose.delete(id);}},
    R3:{r3dDelta:()=>[Math.sin(angles.yaw),-Math.cos(angles.yaw)],r3dLookAngles:()=>angles,
      r3dEyePoint:()=>({y:(17+1.62)/.5})},mapHeading:()=>angles.yaw,
  };
  const api=vm.runInNewContext(main.slice(start,end)+'\n({vigilEligible,vigilSight,tickYardVigil,restoreYardVigil,vigilChairSupported})',context);
  return{api,context,flags,loose,commits,events,angles,seatScene,
    seat(){top=seatScene;},stand(){top=null;},overlay(){top={id:'bag'};},
    phase:value=>{phase=value;},group:value=>{group=value;},owner:value=>{owner=value;},
    floor:value=>{floor=value;},solid:value=>{solid=value;},tall:value=>{tall=value;},blocked:value=>{blocked=value;},
  };
}

function place(f){
  f.seat();f.api.tickYardVigil(0);f.api.tickYardVigil(45);
  assert.equal(f.context.yardVigil.placed,true);
}
function faceChair(f,{seated=true}={}){
  const eye=seated?{x:200,y:200}:{x:f.context.px,y:f.context.py};
  const chair=f.context.yardVigil.at,dx=chair.x-eye.x,dy=chair.y-eye.y;
  f.angles.yaw=Math.atan2(dx,-dy);f.angles.pitch=Math.atan2(-.62,Math.hypot(dx,dy)*.5);
}

test('only the settled city seat counts, including its camera anchor rather than the saved approach',()=>{
  const f=fixture();
  f.api.tickYardVigil(0);f.api.tickYardVigil(90);
  assert.equal(f.context.yardVigil.held,0,'standing at the opening or roof is insufficient');
  f.seat();f.phase('lowering');f.api.tickYardVigil(45);
  assert.equal(f.context.yardVigil.held,0,'lowering is not seated time');
  f.phase('seated');f.api.tickYardVigil(44);
  assert.equal(f.context.yardVigil.placed,false);
  f.overlay();f.api.tickYardVigil(.1);
  assert.equal(f.context.yardVigil.held,0,'an overlay resets the uninterrupted hold');
  f.seat();f.api.tickYardVigil(45);
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.yardVigil.at)),{x:203,y:215,yaw:0},
    'placement is behind the borrowed seat eye, not the saved approach body');
  const submitted=f.loose.get(VIGIL.PROP_ID);
  assert.equal(submitted.floorOverride,17);assert.equal(submitted.renderGroups[0],'academicRoof');
  assert.equal(f.flags['pin.yard'],undefined,'waiting alone does not grant the lead');
});

test('the chair can be noticed after standing, once, through a clear same-roof collision ray',()=>{
  const f=fixture();place(f);
  assert.equal(f.api.vigilSight()?.cos<0,true,'the chair remains behind the city gaze');
  f.stand();faceChair(f,{seated:false});
  assert.ok(f.api.vigilSight()?.cos>.99);
  f.solid(true);assert.equal(f.api.vigilSight(),null,'a solid collision blocks noticing');f.solid(false);
  f.tall(true);assert.equal(f.api.vigilSight(),null,'a tall prop collision blocks noticing');f.tall(false);
  f.group('academic');assert.equal(f.api.vigilSight(),null,'gallery and roof cannot share noticing');f.group('academicRoof');
  f.floor(10);assert.equal(f.api.vigilSight(),null,'the lower facade stair is another floor');f.floor(17);
  f.owner('academic-roof-service');assert.equal(f.api.vigilSight(),null,'the bridge is not the roof promenade');f.owner('academic_roof');
  f.overlay();assert.equal(f.api.vigilSight(),null,'a covering menu is not observation');f.stand();
  f.angles.pitch=-1.4;f.api.tickYardVigil(.016);
  assert.equal(f.flags[VIGIL.FLAG],undefined,'looking straight down does not see a chair behind the reticle');
  faceChair(f,{seated:false});f.api.tickYardVigil(.016);
  assert.equal(f.flags[VIGIL.FLAG],true);
  const saves=f.commits.length;f.api.tickYardVigil(45);
  assert.equal(f.commits.length,saves,'repeat frames do not grant or announce the lead again');
  assert.deepEqual(JSON.parse(JSON.stringify(f.events)),[[EVENT_TYPES.ITEM_OBTAINED,{id:VIGIL.FLAG},'main.citySeatLead']],
    'the retained reward is emitted once, only after the actual collision-clear look');
});

test('legacy unearned placement resets while flags and folded earned builds survive migration',()=>{
  const old={held:44,placed:true,seen:false,at:{x:107,y:410,yaw:1}};
  const f=fixture({save:{flags:{},yardVigil:old}});
  f.loose.set(VIGIL.PROP_ID,{rx:107,ry:410});f.api.restoreYardVigil();
  assert.equal(f.context.yardVigil.schema,2);assert.equal(f.context.yardVigil.location,'roof-city-seat');
  assert.equal(f.context.yardVigil.held,0);assert.equal(f.context.yardVigil.at,null);
  assert.equal(f.loose.has(VIGIL.PROP_ID),false,'a previous runtime loose chair is removed');
  for(const save of[
    {flags:{'pin.yard':true},yardVigil:old},
    {flags:{},combatBuild:{rewardedFlags:['pin.yard']},yardVigil:old},
  ]){
    const paid=fixture({save});paid.api.restoreYardVigil();paid.seat();paid.api.tickYardVigil(0);paid.api.tickYardVigil(60);
    assert.equal(paid.context.yardVigil.seen,true);assert.equal(paid.context.yardVigil.placed,false);
    assert.equal(paid.loose.size,0,'a paid legacy run receives no second event');
    const build=normalizeCombatBuild(save.combatBuild,[],save.flags);
    assert.equal(build.rewardedFlags.filter(id=>id==='pin.yard').length,1);
    assert.equal(normalizeCombatBuild(build,[],{'pin.yard':true}).pinsEarned,build.pinsEarned);
  }
});

test('a versioned roof chair restores at the correct height; unsupported saves are discarded',()=>{
  const checkpoint={...freshVigilState(),held:45,placed:true,at:{x:203,y:215,yaw:0}};
  const f=fixture({save:{flags:{},yardVigil:checkpoint}});f.api.restoreYardVigil();
  assert.equal(f.loose.get(VIGIL.PROP_ID)?.floorOverride,17);
  assert.equal(f.context.yardVigil.placed,true);
  const bad=fixture({save:{flags:{},yardVigil:checkpoint}});bad.floor(10);bad.api.restoreYardVigil();
  assert.equal(bad.context.yardVigil.at,null);assert.equal(bad.loose.size,0);
  assert.doesNotMatch(main.slice(start,end),/fireCue\(/,'the quiet hold and reward have no event cue');
});

test('a clear chair centre cannot place a footprint across the low parapet strip',()=>{
  const f=fixture();
  const centre=value=>Math.abs(value-Math.round(value))<.01||Math.abs((value%1)-.5)<.01;
  f.context.FP.ceilAt=(x,y)=>centre(x)&&centre(y)?24:18.1;
  f.seat();assert.equal(f.api.vigilEligible(),true);
  f.api.tickYardVigil(0);f.api.tickYardVigil(45);
  assert.equal(f.context.yardVigil.placed,false);
  assert.equal(f.context.yardVigil.held,0);
  assert.equal(f.loose.size,0,'none of the candidates fits its whole footprint');
  assert.equal(f.flags[VIGIL.FLAG],undefined);
});

test('the actual compiled roof and authored bench support the default chair and its seated look-back ray',async t=>{
  const [FP,PROPS,{conservatory},{ROOF_CITY_SEAT},{ZONE,CELL}]=await Promise.all([
    import('../src/world/floorplan.js'),import('../src/game/props.js'),
    import('../src/data/floorplan/conservatory.js'),import('../src/data/academic-roof.js'),
    import('../src/data/floorplan/legend.js'),
  ]);
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
    widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
    edgePortals:conservatory.edgePortals,doors:conservatory.doors});
  PROPS.propsInit(FP);
  const bench=PROPS.propById(ROOF_CITY_SEAT.id);
  assert.ok(bench,'the authored city bench must exist in the real compiled prop set');
  const approach=FP.toRuntimePoint(ROOF_CITY_SEAT.approach,{center:false});
  const f=fixture({seatPoint:{x:bench.rx,y:bench.ry}});
  Object.assign(f.context,{FP,PROPS,ZONE,px:approach.x,py:approach.y});
  f.context.R3.r3dEyePoint=()=>({y:(17+1.62-ROOF_CITY_SEAT.eyeDrop)/.5});
  f.angles.yaw=ROOF_CITY_SEAT.yaw;f.angles.pitch=ROOF_CITY_SEAT.pitch;
  const candidates=vigilSeatCandidates({x:bench.rx,y:bench.ry,
    forwardX:Math.sin(ROOF_CITY_SEAT.yaw),forwardY:-Math.cos(ROOF_CITY_SEAT.yaw),cellsPerMetre:2})
    .map(at=>({x:Math.round(at.x),y:Math.round(at.y)}));
  const viable=candidates.filter(at=>f.api.vigilChairSupported(at));
  assert.ok(viable.length,'at least one full chair footprint must fit the actual roof');
  place(f);
  const at=f.context.yardVigil.at;
  assert.deepEqual({x:at.x,y:at.y},viable[0],'the runtime chooses the first genuinely supported candidate');
  const dx=at.x-bench.rx,dy=at.y-bench.ry;
  f.angles.yaw=Math.atan2(dx,-dy);
  f.angles.pitch=Math.atan2(1-(1.62-ROOF_CITY_SEAT.eyeDrop),Math.hypot(dx,dy)*.5);
  const sight=f.api.vigilSight();
  assert.ok(sight?.cos>.99,'the lowered real eye must clear the actual bench back and roof collisions');
  f.api.tickYardVigil(.016);
  assert.equal(f.flags[VIGIL.FLAG],true,'the actual supported and seen chair must grant the retained reward');
  const submitted=PROPS.renderInstances({group:'academicRoof'}).find(prop=>prop.id===VIGIL.PROP_ID);
  assert.equal(submitted?.y,17,'the live prop submission stays on the roof floor');
  // A point behind the eye can still let part of a tall prop pop into view.
  // Enclose the actual acquisition mesh, then prove one horizontal frustum
  // plane excludes the entire transformed box at the ordinary settled eye.
  const document=await new NodeIO().read(new URL('../public/assets/conservatory-acquisitions.glb',import.meta.url).pathname);
  const mesh=document.getRoot().listMeshes().find(mesh=>mesh.getName()===VIGIL.MESH);
  assert.ok(mesh,'the proof uses the actual submitted chair mesh');
  for(const node of mesh.listParents().filter(parent=>parent.propertyType==='Node')){
    assert.deepEqual(node.getWorldMatrix(),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
      'mesh-local bounds require the actual acquisition node to remain baked');
  }
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const primitive of mesh.listPrimitives()){
    const values=primitive.getAttribute('POSITION').getArray();
    for(let index=0;index<values.length;index+=3)for(let axis=0;axis<3;axis++){
      bounds.min[axis]=Math.min(bounds.min[axis],values[index+axis]);
      bounds.max[axis]=Math.max(bounds.max[axis],values[index+axis]);
    }
  }
  const seatPhysical=FP.logicalToPhysical(bench.rx,bench.ry);
  const eye=[(seatPhysical.x+.5)*CELL,17+1.62-ROOF_CITY_SEAT.eyeDrop,(seatPhysical.z+.5)*CELL];
  const basis=cameraBasis(ROOF_CITY_SEAT.yaw,ROOF_CITY_SEAT.pitch),c=Math.cos(submitted.yaw),s=Math.sin(submitted.yaw);
  const scale=submitted.scale||1,sx=(submitted.scaleX??1)*scale,sy=(submitted.scaleY??1)*scale,sz=(submitted.scaleZ??1)*scale;
  const corners=[];
  for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]]){
    const local=[submitted.x+c*x*sx-s*z*sz-eye[0],submitted.y+y*sy-eye[1],submitted.z+s*x*sx+c*z*sz-eye[2]];
    corners.push({depth:local.reduce((sum,value,i)=>sum+value*basis.forward[i],0),right:local.reduce((sum,value,i)=>sum+value*basis.right[i],0)});
  }
  for(const[width,height]of[[640,480],[828,518],[1440,900],[3440,1440],[5120,1080]]){
    const plane=ORDINARY_CAMERA_TAN_HALF_FOV*width/height;
    assert.ok(corners.every(p=>p.right>p.depth*plane)||corners.every(p=>p.right<-p.depth*plane),
      `the entire chair bounds must be outside the real camera frustum at ${width}×${height}`);
  }
  t.diagnostic(JSON.stringify({bench:{x:bench.rx,y:bench.ry},approach,
    interactionProxy:{x:bench.interactionRx,y:bench.interactionRy},
    chair:{x:at.x,y:at.y},authored:{x:FP.toAuthoredCoord(at.x),y:FP.toAuthoredCoord(at.y)},
    viableCandidates:viable.length,distance:sight.dist,collisionSight:sight.cos,submittedFloor:submitted.y}));
});
