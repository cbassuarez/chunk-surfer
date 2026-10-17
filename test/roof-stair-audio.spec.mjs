import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF } from '../src/data/academic-roof.js';
import { F } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import { createRoofStairSounds, roofStairAcousticFrame, roofStairCueStep } from '../src/audio/roof-stair-sounds.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
const frameAt=point=>{
  const p=FP.toRuntimePoint(point),at=FP.logicalToPhysical(p.x,p.y);
  return roofStairAcousticFrame({owner:at.owner,flags:FP.flagsAt(p.x,p.y),
    height:at.y,stairFlag:F.STAIR});
};
const gallery=frameAt(ACADEMIC_ROOF.gateInspect);
const foot=frameAt(ACADEMIC_ROOF.stairFoot);
const lower=frameAt({x:169,y:283});
const turn=frameAt(ACADEMIC_ROOF.stairTurn);
const upper=frameAt({x:184,y:281});
const bridge=frameAt(ACADEMIC_ROOF.northBridge);
const roof=frameAt(ACADEMIC_ROOF.entry);
assert.equal(gallery,null,'the enclosed north gallery keeps its interior weather mix');
assert.equal(roof,null,'the roof keeps its ordinary F.SKY weather mix');
assert.equal(foot.outdoor,true,'the first step outside is exposed even without F.SKY');
assert.ok(foot.windPresence>=.7,'open air begins at the threshold');
assert.ok(lower.windPresence>foot.windPresence&&lower.practicePresence>.22,
  'lower flight hears dominant wind and a small classroom-window fragment');
assert.equal(turn.windPresence,1);
assert.equal(turn.practicePresence,0,'practice has faded before the exposed switchback');
assert.equal(upper.windPresence,1);
assert.equal(upper.practicePresence,0,'upper flight is open air without the classroom phrase');
assert.equal(bridge.windPresence,1);
assert.equal(bridge.practicePresence,0,'roof bridge carries only outdoor weather');
assert.equal(roofStairAcousticFrame({owner:'academic-roof-service',flags:0,height:11,stairFlag:F.STAIR}),null,
  'the owner alone cannot make an interior or non-stair cell outdoors');

let state={playedThisVisit:false,lastAt:-Infinity};
for(const [frame,time,expected] of [[foot,0,false],[lower,1,true],[lower,1.02,false],
  [turn,4,false],[upper,7,false],[null,10,false],[lower,20,false],
  [null,24,false],[lower,47,true]]){
  const step=roofStairCueStep(state,frame,time);
  assert.equal(step.play,expected,`practice one-shot decision at ${time}s`);
  state=step.next;
}

// The WebAudio seam schedules exactly one short phrase on entering the lower
// windows, not one per render frame or one on every half-metre tread.
let starts=0;
const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),Q:param(),start(){starts++;},stop(){}});
const context={currentTime:100,createBiquadFilter:node,createGain:node,createOscillator:node};
const sounds=createRoofStairSounds({context,destination:node()});
sounds.update(lower);assert.equal(starts,6,'only six ordinary practice notes are heard');
sounds.update(lower);sounds.update(upper);assert.equal(starts,6,'frames and further climbing do not retrigger');
sounds.update(null);context.currentTime=120;sounds.update(lower);
assert.equal(starts,6,'an immediate return does not replay the same phrase');
sounds.update(null);context.currentTime=147;sounds.update(lower);
assert.equal(starts,12,'a later separate visit may hear the classroom again');
sounds.stop();context.currentTime=200;sounds.update(lower);
assert.equal(starts,12,'stopped audio schedules no more notes');
console.log('roof stair audio: exact outdoor owner, wind/practice progression and sparse WebAudio cue pass');
