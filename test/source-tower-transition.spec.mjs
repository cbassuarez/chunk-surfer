import assert from 'node:assert/strict';
import { advanceSourceTowerProgress, createSourceTowerTransitionScene, sourceTowerRevealFrame, SOURCE_TOWER_CROSSING_SECONDS } from '../src/game/source-tower-transition-scene.js';

let progress=0;
progress=advanceSourceTowerProgress(progress,1,SOURCE_TOWER_CROSSING_SECONDS);assert.equal(progress,1);
progress=advanceSourceTowerProgress(.5,0,4);assert.equal(progress,.5);
progress=advanceSourceTowerProgress(.5,-1,SOURCE_TOWER_CROSSING_SECONDS/4);assert.equal(progress,.25);
assert.equal(advanceSourceTowerProgress(.1,-1,99),0);
assert.equal(sourceTowerRevealFrame(.35).audioRestore,0,'the bell transport remains residual through the first 35 percent');
assert.equal(sourceTowerRevealFrame(1).audioRestore,1);
assert.equal(sourceTowerRevealFrame(.69,{reducedMotion:true}).progress,.625,'reduced motion uses held stepped compositions');
let startedAt=-1,renderedAt=-1;
const restored=createSourceTowerTransitionScene({
  initialProgress:.6,motionInput:{snapshot:()=>({moveY:0})},
  renderer:{r3dBeginDatamosh(){},r3dSetDatamoshProgress(value){renderedAt=value;}},
  audio:{start(value){startedAt=value;}},
});
restored.enter();assert.equal(restored.progress(),.6);assert.equal(startedAt,.6);assert.equal(renderedAt,.6);
console.log('source to tower transition tests ok');
