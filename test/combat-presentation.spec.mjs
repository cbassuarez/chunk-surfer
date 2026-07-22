import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { combatBarCells, combatInjuryStage } from '../src/render/combat-view.js';
import { ORDINARY_TURN_SECONDS } from '../src/game/combat.js';

const combatViewSource = readFileSync(new URL('../src/render/combat-view.js', import.meta.url), 'utf8');
const combatSceneSource = readFileSync(new URL('../src/game/combat.js', import.meta.url), 'utf8');

test('ordinary combat actions resolve on the requested 1.2 second beat', () => {
  assert.equal(ORDINARY_TURN_SECONDS, 1.2);
});

test('health bars preserve exact ratios and embodied injury thresholds', () => {
  assert.equal(combatBarCells(3, 4, 20), 15);
  assert.equal(combatBarCells(-4, 4, 20), 0);
  assert.equal(combatBarCells(9, 4, 20), 20);
  assert.equal(combatInjuryStage({ composure: 8, maxComposure: 8 }), 'steady');
  assert.equal(combatInjuryStage({ composure: 4, maxComposure: 8 }), 'wounded');
  assert.equal(combatInjuryStage({ composure: 2, maxComposure: 8 }), 'critical');
  assert.equal(combatInjuryStage({ composure: 8, maxComposure: 8, injuries: 2 }), 'wounded');
});

test('first-person hands use stepped silhouettes and close over the held tool', () => {
  assert.doesNotMatch(combatViewSource, /ctx\.ellipse\(/);
  assert.match(combatViewSource, /drawOpenHand\(ctx/);
  assert.match(combatViewSource, /drawGripHandBack\(ctx/);
  assert.match(combatViewSource, /drawGripHandFront\(ctx/);

  const back = combatViewSource.lastIndexOf('drawGripHandBack(ctx');
  const tool = combatViewSource.lastIndexOf('drawBagIcon(icon');
  const front = combatViewSource.lastIndexOf('drawGripHandFront(ctx');
  assert.ok(back < tool && tool < front, 'tool should be layered inside the gripping hand');
});

test('battle art is a full field with a far-left opponent instead of an object card', () => {
  assert.doesNotMatch(combatViewSource, /drawStoryArtCard/);
  assert.doesNotMatch(combatSceneSource, /const artW/);
  assert.match(combatSceneSource, /return \{ id: 'surfer', mode: 'boss'/);
  assert.match(combatSceneSource, /x: panel\.x, y: stageY, w: panel\.w, h: stageH/);
});
