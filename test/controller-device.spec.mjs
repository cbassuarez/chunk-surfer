import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceLayoutFor, deviceLayoutName, resetDeviceLayoutCacheForTest } from '../src/game/controller-device.js';
import { GAMECONTROLLER_DB } from '../src/data/gamecontrollerdb.js';

test('the vendored database covers the major families by vendor/product', () => {
  assert.ok(Object.keys(GAMECONTROLLER_DB).length > 2000, 'the maintained database is vendored whole');
  // Sony DualShock 4 (054c:09cc), an 8BitDo pad (c82d), a Nintendo Switch
  // Pro (057e:2009), and an Xbox pad (045e:028e) all appear by USB GUID.
  const guids = Object.keys(GAMECONTROLLER_DB);
  assert.ok(guids.includes('030000004c050000cc09000000000000'), 'DualShock 4');
  assert.ok(guids.includes('030000005e0400008e02000000000000'), 'Xbox One pad');
  assert.ok(guids.includes('030000007e0500000920000000000000'), 'Switch Pro');
});

test('a pad id resolves to its physical layout through the database', () => {
  resetDeviceLayoutCacheForTest();
  const layout = deviceLayoutFor('Wireless Controller (Vendor: 054c Product: 09cc)');
  assert.ok(layout, 'DualShock 4 resolves');
  assert.equal(layout.name, 'PS4 Controller');
  // The database's own row for this pad: a:b1,b:b2,x:b0,y:b3 — the physical
  // indices as SDL sees them, which is exactly what a wrapper driver hides.
  assert.equal(layout.buttons.get(1), 'south');
  assert.equal(layout.buttons.get(2), 'east');
  assert.equal(layout.buttons.get(0), 'west');
  assert.equal(layout.buttons.get(3), 'north');
  assert.equal(layout.axes.get(0), 'leftx');
  assert.equal(layout.axes.get(5), 'righty');
  assert.equal(layout.triggerAxes.get('leftTrigger'), 3);
});

test('a swapped-layout pad resolves to its real buttons, not the standard guess', () => {
  resetDeviceLayoutCacheForTest();
  // The 3 In 1 Conversion Box entry: a:b2,b:b1 — physical 2 is SOUTH.
  const layout = deviceLayoutFor('Vendor: 0f30 Product: 010a');
  assert.ok(layout);
  assert.equal(layout.buttons.get(2), 'south');
  assert.equal(layout.buttons.get(1), 'east');
});

test('an unknown pad falls back to the standard mapping', () => {
  resetDeviceLayoutCacheForTest();
  assert.equal(deviceLayoutFor('Vendor: dead Product: beef'), null);
  assert.equal(deviceLayoutFor(''), null);
  assert.equal(deviceLayoutName('Vendor: dead Product: beef'), null);
});
