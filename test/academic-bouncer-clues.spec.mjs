import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {ACADEMIC_BOUNCER_CLUES as CLUES,ACADEMIC_BOUNCER_CLUE_PROPS as CLUE_PROPS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_BOUNCER_ENTRANCE} from '../src/game/academic-bouncer-access.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,
  connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
PROPS.propsInit(FP);

// The adapter uses these exact task-local changes. In particular, existing
// shifted wall fixtures need logical interaction anchors; their visual wall
// contact and geometry stay where the compiled building placed them.
function stageSources(){
  for(const placement of CLUE_PROPS)PROPS.setLooseProp(placement.id,placement);
  for(const clue of CLUES){
    const prop=PROPS.propById(clue.propId);
    assert.ok(prop,`${clue.id} names a real host or a staged board`);
    if(clue.enableInteraction)prop.interactive=true;
    if(clue.needsAuthoredInteraction){
      prop.interactionX=prop.x+(prop.renderOffsetX||0)+(prop.wallContact?.nx||0)*.12;
      prop.interactionY=prop.y+(prop.renderOffsetZ||0)+(prop.wallContact?.ny||0)*.12;
      prop.interactionRx=Math.round(prop.interactionX*2);
      prop.interactionRy=Math.round(prop.interactionY*2);
    }
  }
}
stageSources();

function eApproaches(prop){
  const approaches=[];
  for(let y=prop.ry-8;y<=prop.ry+8;y++)for(let x=prop.rx-8;x<=prop.rx+8;x++){
    if(FP.isSolid(x,y)||FP.cellAt(x,y)?.collisionOnly||!PROPS.propCanOccupy(x,y))continue;
    if(Math.abs(FP.floorAt(x,y)-prop.floor)>.1)continue;
    const dx=prop.interactionX-(x+.5)*.5,dz=prop.interactionY-(y+.5)*.5;
    const distance=Math.hypot(dx,dz);if(distance<.6||distance>3.2)continue;
    const yaw=Math.atan2(dx,-dz);
    const pitch=Math.atan2(prop.floor+(prop.elevation||0)+Math.max(.12,prop.h||.55)/2-(FP.floorAt(x,y)+1.58),distance);
    if(PROPS.pickProp(x,y,0,3.2,{yaw,pitch})?.id===prop.id)approaches.push({x,y,yaw,pitch,distance});
  }
  return approaches;
}

test('every full written route names an actual compiled floor and a legal exact E target after task staging',()=>{
  for(const clue of CLUES){
    const prop=PROPS.propById(clue.propId);
    assert.ok(Math.abs(prop.floor-clue.floor)<.01,`${clue.id}: expected ${clue.floor}, actual ${prop.floor}`);
    assert.ok(eApproaches(prop).length,`${clue.id} must be pickable without standing in a solid, exclusion or furniture`);
  }
});

test('the public third-floor instruction is obtainable on the stair side of the actual four-lane gate',()=>{
  const clue=CLUES.find(clue=>clue.id==='academicLanding'),prop=PROPS.propById(clue.propId);
  const approaches=eApproaches(prop),gate=FP.edgePortalState().find(portal=>portal.id===ACADEMIC_BOUNCER_ENTRANCE.portalId);
  assert.equal(prop.floor,10);assert.equal(gate.pairs.length,4);
  assert.ok(approaches.some(point=>point.x>=ACADEMIC_BOUNCER_ENTRANCE.stairX&&point.y>=gate.pairs[0].from.y-6&&point.y<=gate.pairs.at(-1).from.y+6),
    'the visitor can read it before earned admission rather than inside the loggia');
  assert.ok(approaches.every(point=>FP.logicalToPhysical(point.x,point.y).spaceId!=='academic'),
    'the top-landing source is attached to the public main-stair island');
});

test('the genuine occupied conservatory branches each have an independent full source',()=>{
  const expected=[['basementLanding',-4],['propStore',-4.35],['boxOfficeInstructions',0],['bathroom',0],
    ['poolSteps',-2],['hallStage',-2.16],['lowerCircle',4],['practice',4.8],['upperCircle',7.5],
    ['ringingBoard',8.6],['organExit',8.6],['academicLanding',10],['bellChamber',13.2],['roofBell',17]];
  for(const [id,floor] of expected){const clue=CLUES.find(clue=>clue.id===id);assert.ok(clue?.teachesPhrase);assert.equal(clue.floor,floor);}
  assert.deepEqual(CLUE_PROPS.map(prop=>prop.id),['academic-admission-lower-circle','academic-admission-upper-circle']);
  for(const placement of CLUE_PROPS){
    const prop=PROPS.propById(placement.id),physical=FP.logicalToPhysical(prop.rx,prop.ry);
    assert.equal(physical.spaceId,'hall');assert.equal(physical.renderGroup,'hall');
    assert.equal(prop.blocks,false);assert.ok(!FP.isSolid(prop.rx,prop.ry));
    assert.ok(physical.owner.includes('balcony'),'a real circle deck, not an exterior roofline or unrelated height');
  }
});
