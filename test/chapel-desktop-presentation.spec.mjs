import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTask, setTimeout as wait } from 'node:timers/promises';
import { createChapelDesktopPresentation } from '../src/platform/chapel-desktop-presentation.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const listeners = new Map();
  const calls = [];
  const opening = deferred();
  const paint = deferred();
  const api = {
    async listen(type, receive) {
      listeners.set(type, receive);
      return () => listeners.delete(type);
    },
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === 'chunk_chapel_desktop_begin') {
        opening.resolve(args.request);
        return paint.promise;
      }
      return true;
    },
  };
  const presentation = createChapelDesktopPresentation({ getEnabled: () => true, api, ...options });
  const emit = (type, payload) => listeners.get(`chapel-desktop:${type}`)?.({ payload });
  return { presentation, opening: opening.promise, paint, calls, listeners, emit };
}

test('the Chapel desktop remains unused when off or when the combat owner is absent', async () => {
  for (const options of [{ getEnabled: () => false }, { isActive: () => false }]) {
    const { presentation, calls, listeners } = fixture(options);
    assert.equal(presentation.isAvailable(), false);
    assert.equal(await presentation.prepare(), false);
    assert.equal(await presentation.begin({ attackId: 'walls-1' }), false);
    assert.deepEqual(calls, []);
    assert.equal(listeners.size, 0);
  }
  const browser = createChapelDesktopPresentation({ getEnabled: () => true });
  assert.equal(browser.isAvailable(), false);
  assert.equal(await browser.begin({ attackId: 'walls-1' }), false);
});

test('hidden preparation and visible paint are separate; the first matching hit is delivered after paint', async () => {
  const { presentation, opening, paint, calls, emit, listeners } = fixture();
  const delivered = [];
  assert.equal(presentation.isAvailable(), true);
  assert.equal(await presentation.prepare(), true);
  assert.deepEqual(calls, [{ command: 'chunk_chapel_desktop_prepare', args: undefined }]);
  const begun = presentation.begin({
    attackId: 'walls-1', onHit: click => delivered.push(click), reducedMotion: true, reduceFlash: true,
  });
  const lease = await opening;
  assert.equal(lease.attackId, 'walls-1');
  assert.equal(lease.reducedMotion, true);
  assert.equal(lease.reduceFlash, true);
  assert.equal(await presentation.begin({ attackId: 'walls-2' }), false);
  emit('hit', { ...lease, token: 'stale' });
  emit('hit', { ...lease, attackId: 'old-attack' });
  emit('hit', lease);
  emit('hit', lease);
  assert.deepEqual(delivered, []);
  paint.resolve(true);
  assert.equal(await begun, true);
  assert.deepEqual(delivered, []);
  await wait(0);
  emit('hit', lease);
  assert.deepEqual(delivered, [{ attackId: 'walls-1' }]);
  assert.equal(await presentation.end('hit'), true);
  assert.deepEqual(calls.at(-1), {
    command: 'chunk_chapel_desktop_end', args: { token: lease.token, outcome: 'hit' },
  });
  await presentation.dispose();
  assert.equal(listeners.size, 0);
});

test('a miss ends the lease before native cleanup and never calls the hit or cancel callbacks', async () => {
  const { presentation, opening, paint, calls, emit } = fixture();
  const delivered = [];
  const begun = presentation.begin({
    attackId: 'walls-3', onHit: () => delivered.push('hit'), onCancel: () => delivered.push('cancelled'),
  });
  const lease = await opening;
  paint.resolve(true);
  assert.equal(await begun, true);
  const ended = presentation.end('miss');
  emit('hit', lease);
  emit('cancelled', lease);
  assert.equal(await ended, true);
  assert.deepEqual(delivered, []);
  assert.deepEqual(calls.at(-1), {
    command: 'chunk_chapel_desktop_end', args: { token: lease.token, outcome: 'miss' },
  });
});

test('losing focus retires a pending lease and a late paint cannot restore it', async () => {
  const { presentation, opening, paint, calls, emit } = fixture();
  const delivered = [];
  const begun = presentation.begin({
    attackId: 'walls-4', onHit: () => delivered.push('hit'), onCancel: cancel => delivered.push(cancel),
  });
  const lease = await opening;
  emit('cancelled', { ...lease, token: 'stale' });
  assert.deepEqual(delivered, []);
  emit('cancelled', lease);
  emit('cancelled', lease);
  assert.equal(await begun, false);
  paint.resolve(true);
  await nextTask();
  emit('hit', lease);
  assert.deepEqual(delivered, [{ attackId: 'walls-4' }]);
  assert.equal(calls.filter(call => call.command === 'chunk_chapel_desktop_end').length, 2);
  assert.deepEqual(calls.at(-1).args, { token: lease.token, outcome: 'cancel' });
});

test('revoking consent rejects a native click even after the target was painted', async () => {
  let enabled = true;
  const { presentation, opening, paint, calls, emit } = fixture({ getEnabled: () => enabled });
  const delivered = [];
  const begun = presentation.begin({
    attackId: 'walls-5', onHit: () => delivered.push('hit'), onCancel: () => delivered.push('cancelled'),
  });
  const lease = await opening;
  paint.resolve(true);
  assert.equal(await begun, true);
  enabled = false;
  emit('hit', lease);
  await nextTask();
  assert.deepEqual(delivered, ['cancelled']);
  assert.deepEqual(calls.at(-1).args, { token: lease.token, outcome: 'cancel' });
});

test('a stalled or unavailable layer resolves as an in-game fallback', async () => {
  const { presentation, opening, calls } = fixture({ openTimeoutMs: 10 });
  const begun = presentation.begin({ attackId: 'walls-6' });
  const lease = await opening;
  assert.equal(await begun, false);
  await nextTask();
  assert.deepEqual(calls.at(-1).args, { token: lease.token, outcome: 'cancel' });

  const unavailable = fixture();
  const unavailableBegin = unavailable.presentation.begin({ attackId: 'walls-7' });
  await unavailable.opening;
  unavailable.paint.resolve(false);
  assert.equal(await unavailableBegin, false);
});

test('a partial listener failure rolls back and allows a later preparation', async () => {
  const listeners = new Set();
  let fail = true;
  const api = {
    async listen(type) {
      if (fail && type === 'chapel-desktop:cancelled') throw new Error('listener unavailable');
      listeners.add(type);
      return () => listeners.delete(type);
    },
    async invoke() { return true; },
  };
  const presentation = createChapelDesktopPresentation({ getEnabled: () => true, api });
  assert.equal(await presentation.prepare(), false);
  assert.equal(listeners.size, 0);
  fail = false;
  assert.equal(await presentation.prepare(), true);
  assert.equal(listeners.size, 2);
  await presentation.dispose();
  assert.equal(listeners.size, 0);
});
