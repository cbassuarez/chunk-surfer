import test from 'node:test';
import assert from 'node:assert/strict';
import { fearOverlayFrame } from '../src/game/fear-overlay.js';

test('fear overlay stays absent when no horror pressure is present', () => {
  assert.deepEqual(fearOverlayFrame({}, 0), {
    heartbeat:0,hiss:0,dread:0,pulse:0,edgeAlpha:0,staticAlpha:0,scanAlpha:0,
  });
});

test('fear overlay combines heartbeat, monitor hiss, and visual dread', () => {
  const frame=fearOverlayFrame({heartbeat:1,monitorHiss:0.5,visualDread:0.75},40);
  assert.ok(frame.pulse>0.9);
  assert.ok(frame.edgeAlpha>0.2);
  assert.equal(frame.staticAlpha,0.065);
  assert.ok(frame.scanAlpha>0.05);
});

test('fear overlay clamps invalid pressure values', () => {
  const frame=fearOverlayFrame({heartbeat:4,monitorHiss:-2,visualDread:Infinity},100);
  assert.equal(frame.heartbeat,1);
  assert.equal(frame.hiss,0);
  assert.equal(frame.dread,1);
});
