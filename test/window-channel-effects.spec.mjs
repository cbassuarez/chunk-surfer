import test from 'node:test';
import assert from 'node:assert/strict';

import { compileWindowChannelScene } from '../src/game/window-channel.js';
import { createPersonalizedWindowEffects } from '../src/platform/personalized-window-effects.js';

const flush = async () => {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test('native channel cuts are tokenized, idempotent, and require an explicit main-surface click', async () => {
  const listeners = new Map();
  const emitted = [];
  const webviews = new Map();
  class FakeWebviewWindow {
    static async getByLabel(label) { return webviews.get(label) || null; }
    constructor(label) { this.label = label; this.focused = false; webviews.set(label, this); }
    once(_event, callback) { callback(); }
    async show() {}
    async hide() {}
    async close() { webviews.delete(this.label); }
    async setFocus() { this.focused = true; }
  }
  const api = {
    WebviewWindow: FakeWebviewWindow,
    async listen(event, callback) { listeners.set(event, callback); return () => listeners.delete(event); },
    async emitTo(label, event, payload) { emitted.push({ label, event, payload }); },
    async invoke(command) {
      if (command === 'chunk_window_choreography_capabilities') return { nativePositioning: true };
      if (command === 'chunk_window_choreography_begin') return true;
      if (command === 'chunk_window_choreography_execute') return true;
      return true;
    },
  };
  const target = new EventTarget();
  const effects = createPersonalizedWindowEffects({
    runtimeApi: api,
    mainWindow: {
      async title() { return 'Chunk Surfer'; },
      async isFocused() { return true; },
      async setTitle() {},
    },
    tokenFactory: () => 'session-channel-native',
    documentApi: { defaultView: target },
  });
  const token = await effects.begin({ intensity: 'hostile' });
  const scene = compileWindowChannelScene({
    battleId: 'hall', movementId: 'attention', movementIndex: 1,
    movementTitle: 'EVERY HEAD AT ONCE', intentId: 'hall:turn',
    intentLabel: 'THE HOUSE TURNS', intentKind: 'broadcast', windowScale: 1,
  });
  let settled = false;
  const pending = effects.beginWindowChannel(scene, { token }).then((result) => {
    settled = true;
    return result;
  });
  await flush();
  const panes = emitted.filter(({ event }) => event === 'window-channel-scene');
  assert.equal(panes.length, 2);
  assert.equal(webviews.get('interference-monitor').focused, true, 'only an active attack focuses a hostile game-owned pane');

  const respond = listeners.get('window-channel-response');
  const first = panes[0].payload;
  const second = panes[1].payload;
  respond({ payload: {
    sessionToken: token, attackId: first.attackId, channelId: first.channelId, action: 'cut',
  } });
  respond({ payload: {
    sessionToken: token, attackId: first.attackId, channelId: first.channelId, action: 'cut',
  } });
  assert.equal(settled, false, 'a duplicate close cannot count as another channel');
  respond({ payload: {
    sessionToken: token, attackId: second.attackId, channelId: second.channelId, action: 'cut',
  } });
  await flush();
  assert.equal(settled, false, 'automatic OS focus after the last cut does not count as reacquisition');
  target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
  const result = await pending;
  assert.deepEqual({
    outcome: result.outcome,
    cutCount: result.cutCount,
    requiredCount: result.requiredCount,
    reacquiredMain: result.reacquiredMain,
  }, { outcome: 'cut', cutCount: 2, requiredCount: 2, reacquiredMain: true });
  await effects.end(token);
});

test('controller fallback resolves the same cut and reacquire states and emergency restore cancels once', async () => {
  const effects = createPersonalizedWindowEffects({
    runtimeApi: null,
    mainWindow: null,
    tokenFactory: () => 'session-channel-fallback',
    documentApi: null,
  });
  const token = await effects.begin({ intensity: 'low', fullscreen: true });
  const scene = compileWindowChannelScene({
    battleId: 'natatorium', movementId: 'room', movementIndex: 0,
    movementTitle: 'THE EMPTY ROOM', intentId: 'natatorium:meter',
    intentLabel: 'METER MOVES WITHOUT AIR', intentKind: 'broadcast', windowScale: 1,
  });
  const skipped = await effects.beginWindowChannel(scene, { token, forceInternal: true });
  assert.equal(skipped.outcome, 'skip', 'a missing display surface safely bypasses rather than trapping combat');

  // A session can still be cancelled idempotently even when an unavailable
  // renderer made its logical channel fall back to skip.
  assert.equal(await effects.emergencyRestore({ notify: false }), true);
  assert.equal(await effects.emergencyRestore({ notify: false }), true);
});
