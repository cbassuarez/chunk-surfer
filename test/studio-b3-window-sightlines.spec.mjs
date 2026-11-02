import test from 'node:test';
import assert from 'node:assert/strict';
import {B3_WINDOW,b3WindowCrossing,b3WindowLevel} from '../src/data/studio-b3-window.js';

test('the console operator can see the actual B3 entrance through the south observation pane',()=>{
  const operator=[21.6,-2.38,10.5],mouth=[15.5,-2.38,19];
  const crossing=b3WindowCrossing(operator,mouth);
  assert.equal(crossing?.paneId,'b3-control-south-window');
  assert.ok(crossing.point[2]>14&&crossing.point[2]<17);
  assert.ok(crossing.point[2]>13,'the former single pane did not cover this sightline');
});

test('the original observation pane, pier and body barrier retain their distinct jobs',()=>{
  const main=b3WindowCrossing([21.6,-2.38,10.5],[15,-2.38,10.5]);
  assert.equal(main?.paneId,'b3-control-window');
  assert.equal(b3WindowCrossing([21,-2.38,13.5],[16,-2.38,13.5]),null,'solid pier remains');
  assert.equal(b3WindowCrossing([21,-3.5,15.5],[16,-3.5,15.5]),null,'sill hides the floor');
  assert.equal(b3WindowCrossing([21,-.5,15.5],[16,-.5,15.5]),null,'head hides the ceiling');
  for(const pane of B3_WINDOW.panes){
    const level=b3WindowLevel(pane);
    assert.equal(level.collisionOnly,true);
    assert.equal(level.rows.length,pane.z1-pane.z0);
    assert.equal(level.origin.x,18);
  }
});
