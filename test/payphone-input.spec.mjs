// Boundary behaviour of the physical rotary instrument. Numeric keys remain
// inactive: a digit is emitted only by the pointer that pulled the finger hole.
import assert from 'node:assert/strict';
import { makePayphoneScene } from '../src/game/payphone-scene.js';
import {
  dialGeometry, rotaryRestAngle, rotaryTravelAngle, ROTARY_SPACING,
} from '../src/render/payphone-view.js';
import { PAYPHONE_NUMBERS, payphoneIncoming, PAYPHONE_PASS } from '../src/game/payphone.js';

function rig(options = {}) {
  let time = 0;
  const log = [], events = [], capture = [];
  const target = {
    setPointerCapture: (id) => capture.push(['set', id]),
    releasePointerCapture: (id) => capture.push(['release', id]),
    hasPointerCapture: () => true,
  };
  const line = new Proxy({}, {
    get: (_, key) => key === 'exchange' ? (seconds) => seconds
      : key === 'ringSeconds' ? (rings) => rings * 3
        : (...args) => { log.push([key, ...args]); },
  });
  const scene = makePayphoneScene({
    line, clock: () => time, exchangeSeconds: () => 1,
    onCall: (outcome) => events.push(['call', outcome.id]),
    onClose: (detail) => events.push(['close', detail.hanging]),
    onLift: () => events.push(['lift']),
    onHook: () => events.push(['hook']),
    onInspect: (region) => events.push(['inspect', region]),
    onFeed: () => ({ ok: true, credit: 40, label: 'LIBRARY' }),
    ...options,
  });
  scene.enter();
  // uiDraw safely does nothing headlessly; render still installs real hit boxes.
  scene.render();
  const layout = scene.layout(), geometry = dialGeometry(layout);
  const step = (seconds = 2) => {
    for (let n = 0; n < Math.ceil(seconds * 20); n += 1) {
      time += .05;
      scene.update(.05);
    }
  };
  const until = (phase) => {
    for (let n = 0; n < 1800 && scene.view().phase !== phase; n += 1) step(.05);
    assert.equal(scene.view().phase, phase, `the line never reached ${phase}`);
  };
  const point = (angle) => ({
    cellX: (geometry.cx + Math.cos(angle) * geometry.hole) / geometry.cellW,
    cellY: (geometry.cy + Math.sin(angle) * geometry.hole) / geometry.cellH,
  });
  const pointer = (type, position, extra = {}) => {
    const originalEvent = { target, currentTarget: target, preventDefault() {} };
    const event = {
      type, pointerId: 11, pointerType: 'mouse', button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      ...position, originalEvent, ...extra,
    };
    scene.pointer(event);
  };
  const down = (digit = '9', extra = {}) => pointer('pointerdown', point(rotaryRestAngle(digit)), extra);
  const turn = (digit = '9', fraction = 1, extra = {}) => {
    const angle = rotaryRestAngle(digit), travel = rotaryTravelAngle(digit) * fraction;
    // Pointer samples remain below pi apart, as a real drag does.
    for (let n = 1; n <= 16; n += 1) pointer('pointermove', point(angle + travel * n / 16), extra);
  };
  const up = (digit = '9', fraction = 1, extra = {}) => pointer('pointerup', point(rotaryRestAngle(digit) + rotaryTravelAngle(digit) * fraction), extra);
  const hardware = (region, extra = {}) => {
    const box = layout[region];
    assert.ok(box, `the physical ${region} has no hit box`);
    pointer('pointerdown', { cellX: box.x + box.w / 2, cellY: box.y + box.h / 2 }, extra);
  };
  return { scene, log, events, capture, pointer, down, turn, up, hardware, point, step, until };
}

// A secondary mouse button cannot operate a hole or a piece of the set.
{
  const r = rig();
  r.down('9', { button: 2, buttons: 2 });
  r.turn(); r.up(); r.step();
  assert.equal(r.scene.view().digits, '');
  assert.equal(r.scene.view().dial.grabbed, null);
  r.hardware('instructions', { button: 2, buttons: 2 });
  r.hardware('cradle', { button: 2, buttons: 2 });
  assert.deepEqual(r.events, [['lift']], 'a secondary click operated the set');
}

// Only the grabbing pointer can turn or release the wheel. Capture keeps the
// governed return reliable when the finger leaves the canvas or browser edge.
{
  const r = rig();
  r.down();
  assert.equal(r.scene.view().dial.grabbed, '9');
  assert.ok(r.capture.some(([kind, id]) => kind === 'set' && id === 11), 'the drag did not capture its pointer');
  r.turn('9', 1, { pointerId: 22 });
  r.up('9', 1, { pointerId: 22 });
  assert.equal(r.scene.view().dial.grabbed, '9', 'another pointer released the wheel');
  assert.equal(r.scene.view().dial.rotation, 0, 'another pointer turned the wheel');
  r.down('3', { pointerId: 22 });
  assert.equal(r.scene.view().dial.grabbed, '9', 'another down replaced the owner');
  r.turn(); r.up();
  assert.equal(r.scene.view().digits, '', 'a digit arrived before the dial returned');
  r.step();
  assert.equal(r.scene.view().digits, '9');
  assert.ok(r.capture.some(([kind, id]) => kind === 'release' && id === 11), 'the owner retained capture after release');
  assert.deepEqual(r.log.filter(([kind]) => kind === 'pulses').map(([, count]) => count), [9]);
}

// Cancellation and focus loss release the spring silently: they must not make
// a dialled number merely because the player had reached the stop.
for (const cancellation of [{ type: 'pointercancel', pointerId: 11 }, { type: 'pointercancel' }]) {
  const r = rig();
  r.down(); r.turn();
  r.scene.pointer(cancellation);
  r.step();
  assert.equal(r.scene.view().digits, '', 'a cancelled drag dialled a number');
  assert.equal(r.scene.view().dial.grabbed, null);
  assert.equal(r.scene.view().dial.returning, false);
  assert.equal(r.scene.view().dial.rotation, 0);
  assert.equal(r.log.filter(([kind]) => kind === 'pulses').length, 0, 'a cancelled drag emitted exchange pulses');
  r.down('1'); r.turn('1'); r.up('1'); r.step();
  assert.equal(r.scene.view().digits, '1', 'cancel left the next drag stuck');
}

// An unrelated cancellation cannot cancel the finger that is still down.
{
  const r = rig();
  r.down(); r.turn();
  r.scene.pointer({ type: 'pointercancel', pointerId: 22 });
  assert.equal(r.scene.view().dial.grabbed, '9');
  r.up(); r.step();
  assert.equal(r.scene.view().digits, '9');
}

// Removing the scene while the finger is still down must hand pointer capture
// back. The world receives later events after Escape, not the vanished set.
for (const leave of [
  (scene) => scene.key({ key: 'Escape', preventDefault() {} }),
  (scene) => scene.exit(),
  (scene) => scene.hangUp(),
]) {
  const r = rig();
  r.down(); r.turn();
  leave(r.scene);
  assert.ok(r.capture.some(([kind, id]) => kind === 'release' && id === 11), 'leaving the drag retained pointer capture');
  assert.equal(r.log.filter(([kind]) => kind === 'pulses').length, 0, 'leaving the drag dialled a number');
  assert.equal(r.scene.view().dial.grabbed, null);
}

// Pointer UP remains physically honest: an intentional partial pull gives the
// smaller digit rather than rounding up or being treated like cancellation.
{
  const r = rig();
  r.down();
  const fraction = ROTARY_SPACING * 4.2 / rotaryTravelAngle('9');
  r.turn('9', fraction); r.up('9', fraction); r.step();
  assert.equal(r.scene.view().digits, '3');
  assert.deepEqual(r.log.filter(([kind]) => kind === 'pulses').map(([, count]) => count), [3]);
}

// Entering the booth is distinct from lifting the receiver. Reading the set
// must not start the dial-tone timeout or connect an incoming call.
{
  const r = rig({ startOnHook: true });
  assert.equal(r.scene.view().handset, 'hook');
  assert.equal(r.scene.view().phase, 'onhook');
  r.step(65);
  assert.equal(r.scene.view().phase, 'onhook', 'the idle howler sounded with the receiver on its hook');
  assert.equal(r.log.filter(([kind]) => kind === 'offHook' || kind === 'tone').length, 0);
  r.down(); r.turn(); r.up(); r.step();
  assert.equal(r.scene.view().digits, '', 'an on-hook set dialled');
  r.hardware('handset');
  assert.equal(r.scene.view().phase, 'dialtone');
  assert.equal(r.scene.view().handset, 'up');
  assert.deepEqual(r.events, [['lift']]);
  for (const key of ['0', '1', '9', 'Enter', 'Backspace']) r.scene.key({ key, preventDefault() {} });
  r.step();
  assert.equal(r.scene.view().digits, '', 'a numeric key bypassed the rotary dial');
  r.hardware('handset');
  assert.equal(r.scene.view().handset, 'hook');
  assert.equal(r.scene.view().phase, 'onhook');
  assert.ok(!r.events.some(([kind]) => kind === 'close'), 'replacing the receiver stepped out of the booth');
  r.scene.key({ key: 'Escape', preventDefault() {} });
  assert.deepEqual(r.events.at(-1), ['close', false]);
}
{
  const incoming = payphoneIncoming({ pass: PAYPHONE_PASS.loop });
  const r = rig({ startOnHook: true, incoming });
  assert.deepEqual(r.events, []);
  r.step(3);
  assert.deepEqual(r.events, [], 'incoming dialogue started before the receiver was lifted');
  r.hardware('handset');
  assert.equal(r.scene.view().phase, 'connected');
  assert.deepEqual(r.events, [['lift'], ['call', 'loop']]);
  r.hardware('handset');
  assert.equal(r.events.filter(([kind]) => kind === 'hook').length, 1);
  assert.equal(r.scene.view().phase, 'onhook');
  assert.ok(!r.events.some(([kind]) => kind === 'close'));
}

// The paid-call owner is notified on replacement, so main can stop consuming
// tape and terminate dialogue while the player stays inside the booth.
{
  const r = rig();
  r.scene.probeDial(PAYPHONE_NUMBERS.lyle.digits);
  r.until('pips');
  assert.equal(r.scene.view().phase, 'pips');
  assert.ok(r.scene.feed());
  assert.equal(r.scene.view().phase, 'connected');
  r.scene.pressHook();
  assert.equal(r.events.filter(([kind]) => kind === 'hook').length, 1);
  assert.ok(!r.events.some(([kind]) => kind === 'close'));
  assert.ok(r.log.some(([kind]) => kind === 'stop'), 'the hook must stop the far room, bleed and tape before restarting the line');
}

// A speaking call presenter leases only the receiver and hook. The rest of the
// instrument cannot leak pointer input through the modal conversation.
for (const region of ['handset', 'cradle']) {
  const incoming = payphoneIncoming({ pass: PAYPHONE_PASS.loop });
  const r = rig({ incoming });
  assert.equal(r.scene.view().phase, 'connected');
  assert.equal(r.scene.receiverPointer({ type: 'pointerdown', ...r.point(rotaryRestAngle('1')), button: 0 }), false);
  assert.equal(r.scene.view().dial.grabbed, null);
  const box = r.scene.layout()[region];
  // The handset overlaps the outer fork: use the hook's exposed inner end.
  const hitX = box.x + box.w * (region === 'cradle' ? .9 : .5);
  assert.equal(r.scene.receiverPointer({ type: 'pointerdown', cellX: hitX, cellY: box.y + box.h / 2, button: 0 }), true);
  assert.equal(r.events.filter(([kind]) => kind === 'hook').length, 1);
  assert.equal(r.scene.view().phase, region === 'handset' ? 'onhook' : 'dialtone');
}

// Keyboard focus reaches actual hardware and its printed clues without
// introducing a numeric dial shortcut or lifting the receiver just to read.
{
  const r = rig({ startOnHook: true });
  const key = (value, extra = {}) => r.scene.key({ key: value, preventDefault() {}, ...extra });
  const focus = (region) => {
    for (let n = 0; n < 10 && r.scene.view().focusRegion !== region; n += 1) key('Tab');
    assert.equal(r.scene.view().focusRegion, region, `keyboard cannot reach ${region}`);
  };
  focus('instructions');
  key('Enter');
  assert.deepEqual(r.events, [['inspect', 'instructions']]);
  assert.equal(r.scene.view().phase, 'onhook');
  focus('handset');
  key('Enter');
  assert.equal(r.scene.view().handset, 'up');
  key('Enter', { repeat: true });
  assert.equal(r.scene.view().handset, 'up', 'held activation repeatedly replaced the receiver');
  for (const digit of ['0', '1', '9']) key(digit);
  r.step();
  assert.equal(r.scene.view().digits, '');
  key(' ');
  assert.equal(r.scene.view().handset, 'hook');
  assert.ok(!r.events.some(([kind]) => kind === 'close'));
}

// Switching back to pointing drops keyboard ownership. A later Enter cannot
// activate a stale inspection or put down the handset the player just lifted.
for (const switchInput of [
  (r) => r.hardware('handset'),
  (r) => r.pointer('pointermove', r.point(rotaryRestAngle('1'))),
]) {
  const r = rig({ startOnHook: true });
  r.scene.key({ key: 'Tab', preventDefault() {} });
  assert.equal(r.scene.view().focusRegion, 'handset');
  switchInput(r);
  const before = r.scene.view().handset;
  const eventCount = r.events.length;
  r.scene.key({ key: 'Enter', preventDefault() {} });
  assert.equal(r.scene.view().handset, before, 'Enter activated a stale pointer-owned handset');
  assert.equal(r.events.length, eventCount, 'Enter activated stale keyboard focus');
}

console.log('payphone input boundaries: ok');
