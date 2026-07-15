import assert from 'node:assert/strict';
import { advanceSourceTowerProgress, SOURCE_TOWER_CROSSING_SECONDS } from '../src/game/source-tower-transition-scene.js';

let progress=0;
progress=advanceSourceTowerProgress(progress,1,SOURCE_TOWER_CROSSING_SECONDS);assert.equal(progress,1);
progress=advanceSourceTowerProgress(.5,0,4);assert.equal(progress,.5);
progress=advanceSourceTowerProgress(.5,-1,SOURCE_TOWER_CROSSING_SECONDS/4);assert.equal(progress,.25);
assert.equal(advanceSourceTowerProgress(.1,-1,99),0);
console.log('source to tower transition tests ok');
