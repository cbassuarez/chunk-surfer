import test from 'node:test';
import assert from 'node:assert/strict';
import { fearOverlayFrame } from '../src/game/fear-overlay.js';

test('fear overlay stays absent when no horror pressure is present', () => {
  assert.deepEqual(fearOverlayFrame({}, 0), {
    heartbeat:0,hiss:0,dread:0,pulse:0,edgeAlpha:0,staticAlpha:0,scanAlpha:0,
  });
});

test('fear overlay combines heartbeat, monitor hiss, and visual dread', () => {
  const frame=fearOverlayFrame({heartbeat:1,monitorHiss:0.5,visualDread:0.75,
    heartbeatClock:{available:true,active:true,pulse:.95}},40);
  assert.equal(frame.pulse,.95);
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

test('the visible pulse follows the actual audio envelope rather than render time', () => {
  const pressure={heartbeat:.6,monitorHiss:.2,visualDread:.4,
    heartbeatClock:{available:true,active:true,phase:.3,pulse:.8}};
  const early=fearOverlayFrame(pressure,40),late=fearOverlayFrame(pressure,999999);
  assert.equal(early.pulse,.48);
  assert.deepEqual(late,early,'a rendering delay must not advance or replay a beat');
  pressure.heartbeatClock.pulse=.25;
  assert.equal(fearOverlayFrame(pressure,40).pulse,.15,
    'a new sample envelope replaces the previous pulse at the same wall time');
});

test('missing, paused or unavailable audio cannot invent a heartbeat over static dread', () => {
  for(const heartbeatClock of [undefined,null,{},
    {available:false,active:true,pulse:1},
    {available:true,active:false,pulse:1},
    {available:true,active:true,paused:true,pulse:1}]){
    const frame=fearOverlayFrame({heartbeat:1,visualDread:.75,monitorHiss:.5,heartbeatClock},40);
    assert.equal(frame.pulse,0);
    assert.equal(frame.edgeAlpha,.75*.22);
    assert.equal(frame.staticAlpha,.5*.13);
    assert.equal(frame.scanAlpha,.5*.10);
  }
});

test('Source withdrawal overrides a stale audible frame without discarding other pressure', () => {
  const frame=fearOverlayFrame({heartbeat:0,visualDread:.3,monitorHiss:.2,
    heartbeatClock:{available:true,active:true,pulse:1,level:1}},40);
  assert.equal(frame.pulse,0);
  assert.equal(frame.edgeAlpha,.3*.22);
  assert.equal(frame.staticAlpha,.2*.13);
});

test('invalid audio envelopes fail quiet and finite envelopes are bounded', () => {
  for(const pulse of [undefined,NaN,Infinity,-Infinity,'1']){
    assert.equal(fearOverlayFrame({heartbeat:1,
      heartbeatClock:{available:true,active:true,pulse}},40).pulse,0);
  }
  assert.equal(fearOverlayFrame({heartbeat:1,
    heartbeatClock:{available:true,active:true,pulse:4}},40).pulse,1);
  assert.equal(fearOverlayFrame({heartbeat:1,
    heartbeatClock:{available:true,active:true,pulse:-2}},40).pulse,0);
});
