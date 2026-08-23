import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YARD_BENCH_ACTION,
  yardBenchSeatPose,
  yardBenchSitFrame,
  yardBenchStandFrame,
  yardBenchTracksMotion,
} from '../src/game/yard-bench-action.js';

test('bench pose and camera actions finish at their authored endpoints', () => {
  const seat=yardBenchSeatPose({rx:105,ry:410,interactionRx:107,interactionRy:410,seatYaw:1.7,seatPitch:-.05,seatEyeDrop:.72});
  const sat=yardBenchSitFrame({origin:{x:107,y:410,yaw:0,pitch:0},seat,elapsed:YARD_BENCH_ACTION.sitDuration});
  assert.equal(sat.done,true);
  assert.deepEqual({x:sat.x,y:sat.y,pitch:sat.pitch,floorOffset:sat.floorOffset},{x:105,y:410,pitch:-.05,floorOffset:-.72});

  const stood=yardBenchStandFrame({seat,look:{yaw:1.7,pitch:-.05},elapsed:YARD_BENCH_ACTION.standDuration});
  assert.equal(stood.done,true);
  assert.deepEqual({x:stood.x,y:stood.y,floorOffset:stood.floorOffset},{x:107,y:410,floorOffset:0});
});

test('only the stand transition preserves locomotion intent', () => {
  assert.equal(yardBenchTracksMotion('sitting'),false);
  assert.equal(yardBenchTracksMotion('seated'),false);
  assert.equal(yardBenchTracksMotion('standing'),true);
});
