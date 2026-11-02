import test from 'node:test';
import assert from 'node:assert/strict';
import {createRelativeLookPulse} from '../src/dev/completion-input-relay.js';
test('relative look relay provides bounded real-time axes, never a pose or gameplay mutation',()=>{
  let time=10;const relay=createRelativeLookPulse({now:()=>time});
  assert.deepEqual(relay.axes(),{turnX:0,lookY:0});
  relay.pulse({turnX:-1,durationMs:100});
  time=109;assert.deepEqual(relay.axes(),{turnX:-1,lookY:0});
  time=110;assert.deepEqual(relay.axes(),{turnX:0,lookY:0});
  relay.pulse({lookY:9,durationMs:9000});time=1109;
  assert.deepEqual(relay.axes(),{turnX:0,lookY:1});
  time=1110;assert.deepEqual(relay.axes(),{turnX:0,lookY:0});
  relay.pulse({turnX:1});relay.clear();assert.deepEqual(relay.axes(),{turnX:0,lookY:0});
  assert.deepEqual(Object.keys(relay).sort(),['axes','clear','pulse']);
});
