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

test('the fight is an abstract void: centred opponent, procedural fallback, no object card', () => {
  assert.doesNotMatch(combatViewSource, /drawStoryArtCard/);
  assert.doesNotMatch(combatSceneSource, /const artW/);
  // Unknown art refs become the procedural signal-being, never a borrowed portrait.
  assert.match(combatSceneSource, /procedural: true/);
  assert.match(combatSceneSource, /drawSignalBeing\(/);
  // The void stage spans the panel; the opponent stands right-of-centre in an
  // oblique fight stance rather than flat like a dialogue portrait.
  assert.match(combatSceneSource, /drawEnemyVoidStage\(battle\.combat\.id/);
  assert.match(combatSceneSource, /Math\.floor\(panel\.w \* \.56 - ew \/ 2\)/);
  assert.match(combatSceneSource, /oblique: -\.05/);
});

test('hits carry weight: hit-stop, ghost pips, damage popups, entry wipe, impact audio', () => {
  assert.match(combatSceneSource, /hitstop = Math\.min/);
  assert.match(combatSceneSource, /drawCombatPips\(/);
  assert.match(combatSceneSource, /barGhost\.coherence = \{ from: before\.movementCoherence/);
  assert.match(combatSceneSource, /drawVfdCounter\(/);
  assert.match(combatSceneSource, /drawBattleWipe\(/);
  assert.match(combatSceneSource, /playImpact\?\.\(/);
  assert.match(combatViewSource, /export function drawCombatPips/);
  assert.match(combatViewSource, /export function drawBattleWipe/);
});

test('Tab steps back inside the fight; Escape stays reserved for run-level pause', () => {
  assert.match(combatSceneSource, /e\.key === 'Tab'/);
  assert.doesNotMatch(combatSceneSource, /back = e\.key === 'Escape'/);
  assert.match(combatSceneSource, /\[TAB\] TOOLS/);
});

test('hands render in two near-square boxes clipped to the stage, not one full-width band', () => {
  assert.match(combatSceneSource, /drawFirstPersonHands\(selectedToolId, \{\s*stage: \{ x: panel\.x, y: stageY, w: panel\.w, h: stageH \}/);
  assert.match(combatSceneSource, /left: \{/);
  assert.match(combatSceneSource, /right: \{/);
  assert.doesNotMatch(combatSceneSource, /drawFirstPersonCombatant/);
  // The silhouettes rescale their authored spans into their own boxes.
  assert.match(combatViewSource, /value \/ \.53/);
  assert.match(combatViewSource, /\(value - \.5\) \/ \.5/);
});

test('the legibility layer is wired: stance triangle, counter hints, derived subtext', () => {
  assert.match(combatSceneSource, /drawStanceTriangle\(/);
  assert.match(combatSceneSource, /counterMovesForIntent\(/);
  assert.match(combatSceneSource, /combatMoveSubtext\(/);
  // The old hand-written hint table is gone; hints derive from the rules tables.
  assert.doesNotMatch(combatSceneSource, /idealResponse/);
});
