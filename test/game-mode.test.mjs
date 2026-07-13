import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGameModeDom, nextGameModeState } from '../src/platform/game-mode.js';

test('game mode toggles on and preserves previous window state', () => {
  const next = nextGameModeState({ enabled: false }, {
    previousWindowPreset: '1440x900',
    now: 100,
  });
  assert.equal(next.enabled, true);
  assert.equal(next.previousWindowPreset, '1440x900');
  assert.equal(next.enteredAt, 100);
});

test('game mode toggles off without losing previous window state', () => {
  const next = nextGameModeState({
    enabled: true,
    previousWindowPreset: '1440x900',
  }, { enabled: false });
  assert.equal(next.enabled, false);
  assert.equal(next.previousWindowPreset, '1440x900');
  assert.equal(next.enteredAt, null);
});

test('game mode DOM helper toggles body classes', () => {
  const classes = new Set();
  const doc = {
    body: {
      classList: {
        toggle(name, on) {
          if (on) classes.add(name);
          else classes.delete(name);
        },
      },
    },
  };
  applyGameModeDom(true, doc);
  assert.equal(classes.has('desktop-game-mode'), true);
  assert.equal(classes.has('desktop-cursor-idle'), false);
  applyGameModeDom(false, doc);
  assert.equal(classes.has('desktop-game-mode'), false);
});
