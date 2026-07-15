import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioContextRecovery } from '../src/audio/context-recovery.js';

function fakeContext({ resumeFailures = 0 } = {}) {
  const listeners = new Set();
  let failures = resumeFailures;
  return {
    state: 'suspended',
    addEventListener(type, handler) { if (type === 'statechange') listeners.add(handler); },
    removeEventListener(type, handler) { if (type === 'statechange') listeners.delete(handler); },
    async resume() {
      if (failures-- > 0) throw new Error('resume blocked');
      this.state = 'running';
      for (const handler of listeners) handler();
    },
    suspend() {
      this.state = 'suspended';
      for (const handler of listeners) handler();
    },
  };
}

test('audio recovery retries a transient resume failure', async () => {
  const context = fakeContext({ resumeFailures: 1 });
  const timers = [];
  const errors = [];
  const running = [];
  const recovery = createAudioContextRecovery({
    getContext: () => context,
    delays: [0, 1],
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
    onRunning: (_ctx, reason) => running.push(reason),
    onError: (error) => errors.push(error.message),
  });

  assert.equal(await recovery.recover('window-focus'), false);
  assert.deepEqual(errors, ['resume blocked']);
  assert.equal(timers.length, 1);

  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.state, 'running');
  assert.ok(running.some((reason) => reason.includes('window-focus')));
  assert.equal(recovery.snapshot().retryPending, false);
});

test('state changes trigger recovery without another focus event', async () => {
  const context = fakeContext();
  context.state = 'running';
  const timers = [];
  const recovery = createAudioContextRecovery({
    getContext: () => context,
    delays: [0],
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  recovery.bind(context);
  context.suspend();
  assert.equal(timers.length, 1);
  timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.state, 'running');
});

test('closed contexts are not placed in an endless retry loop', async () => {
  const context = fakeContext();
  context.state = 'closed';
  const timers = [];
  const recovery = createAudioContextRecovery({
    getContext: () => context,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  assert.equal(await recovery.recover('pageshow'), false);
  assert.deepEqual(timers, []);
});

test('intentional background suspension does not fight the player setting', async () => {
  const context = fakeContext();
  context.state = 'running';
  const timers = [];
  let allowed = false;
  const recovery = createAudioContextRecovery({
    getContext: () => context,
    shouldRecover: () => allowed,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  });

  recovery.bind(context);
  context.suspend();
  assert.deepEqual(timers, []);
  assert.equal(await recovery.recover('window-focus'), false);
  assert.equal(context.state, 'suspended');

  allowed = true;
  assert.equal(await recovery.recover('window-focus'), true);
  assert.equal(context.state, 'running');
});
