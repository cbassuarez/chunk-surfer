import assert from 'node:assert/strict';
import { advanceStationWalk } from '../src/game/station-walk.js';

// All four door orientations: forward and backward are relative to the door,
// rather than a particular keyboard key or compass direction.
for (const forward of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
  const [x, y] = forward;
  assert.equal(advanceStationWalk(.5, x, y, forward, 100), .51);
  assert.equal(advanceStationWalk(.5, -x, -y, forward, 100), .49);
  assert.equal(advanceStationWalk(.5, -y, x, forward, 100), .5);
  assert.equal(advanceStationWalk(.5, 0, 0, forward, 100), .5);
  assert.equal(advanceStationWalk(0, -x, -y, forward, 100), 0);
  assert.equal(advanceStationWalk(1, x, y, forward, 100), 1);
}
const diagonal = advanceStationWalk(.5, 1, -1, [0, -1], 100);
assert.ok(diagonal > .5 && diagonal < .51, 'diagonal movement cannot accelerate the snow walk');
console.log('station walk direction verified');
