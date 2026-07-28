import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { combatActionReadout, combatBarCells, combatInjuryStage } from '../src/render/combat-view.js';
import * as combatView from '../src/render/combat-view.js';
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

test('fight voids retain low-alpha room memory without new combat semantics', () => {
  assert.match(combatViewSource, /export function drawVoidRoomMemory/);
  for (const profile of ['natatorium', 'hall', 'practice', 'chapel', 'source-final', 'training']) {
    assert.match(combatViewSource, new RegExp(`key === '${profile}'`));
  }
  assert.match(combatViewSource, /drawVoidRoomMemory\(ctx, profileKey/);
  assert.doesNotMatch(combatViewSource, /roomMemory.*attack|roomMemory.*damage/i);
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

test('the enemy takes its own beat: player and enemy resolutions are sequenced', () => {
  // The player action resolves, then a distinct enemy beat runs when the turn
  // was deferred to the enemy phase — not folded into one atomic flash.
  assert.match(combatSceneSource, /function beginEnemyBeat\(\)/);
  assert.match(combatSceneSource, /advanceEnemy\(state\)/);
  assert.match(combatSceneSource, /side: 'enemy'/);
  assert.match(combatSceneSource, /side: 'player'/);
  // The player beat hands off to the enemy beat only when a turn is pending.
  assert.match(combatSceneSource, /resolution\.side === 'player' && state\.phase === 'enemy'/);
  // The enemy turn is visibly announced.
  assert.match(combatSceneSource, /ENEMY TURN/);
  // The turn is read as one span for the director/music, from the commit point.
  assert.match(combatSceneSource, /director\?\.advance\?\.\(turnStart/);
});

test('Tab steps back inside the fight; Escape stays reserved for run-level pause', () => {
  assert.match(combatSceneSource, /e\.key === 'Tab'/);
  assert.doesNotMatch(combatSceneSource, /back = e\.key === 'Escape'/);
  assert.match(combatSceneSource, /\[TAB\] KIT/);
});

test('the command surface is an icon deck, not a text-list browser', () => {
  assert.equal(combatActionReadout({ enabled: true, damage: 3, prevents: 2 }), 'DMG 3 · GUARD 2');
  assert.equal(combatActionReadout({ enabled: false, reason: 'NO TAKE' }), 'UNAVAILABLE');
  assert.equal(combatActionReadout({ enabled: true, captures: true }), 'CAPTURE');
  assert.match(combatViewSource, /export function drawCombatActionIcon/);
  assert.match(combatViewSource, /export function drawCombatToolTile/);
  assert.match(combatViewSource, /export function drawCombatActionTile/);
  assert.match(combatSceneSource, /drawCombatToolTile\(tool/);
  assert.match(combatSceneSource, /drawCombatActionTile\(move/);
  assert.doesNotMatch(combatSceneSource, /uiText\(toolX, listY, 'TOOL'/);
  assert.doesNotMatch(combatSceneSource, /`MOVES \/ \$\{activeTool\(\)\.label\}`/);
  assert.doesNotMatch(combatSceneSource, /move\.label\.padEnd\(13\)/);
});

test('the horizontal command deck supports keys and full-card pointer targets', () => {
  assert.match(combatSceneSource, /e\.key === 'ArrowLeft'/);
  assert.match(combatSceneSource, /e\.key === 'ArrowRight'/);
  assert.match(combatSceneSource, /y >= row\.y && y < row\.y \+ \(row\.h \|\| 1\)/);
  assert.match(combatSceneSource, /\[←→\] CHOOSE ACTION/);
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

test('the opponent throws note sprites while its attack plays', () => {
  // Sprites, not '♪': the atlas renders glyphs through a monospace stack with no
  // dependable music note in it — the same trap that made the minimap's mischief
  // ring draw nothing at all — so these are stepped blocks like everything else
  // in the void.
  const { NOTE_SPRITES } = combatView;
  assert.ok(Object.keys(NOTE_SPRITES).length >= 3, 'more than one kind of note');
  for (const [kind, rows] of Object.entries(NOTE_SPRITES)) {
    assert.ok(rows.length >= 5, `${kind} is a pixel pattern with real height`);
    assert.ok(rows.every((row) => /^[.#]+$/.test(row)), `${kind} is drawn from blocks, not a glyph`);
    assert.equal(new Set(rows.map((row) => row.length)).size, 1, `${kind} is rectangular`);
    assert.ok(rows.some((row) => row.includes('#')), `${kind} has ink in it`);
  }
  assert.match(combatSceneSource, /drawAttackNotes\(/);
  // Only on the enemy beat, and inside the guard that proves there IS an enemy
  // beat — reading resolution.after with no resolution throws, and an exception
  // in this render path blanks the whole stage instead of erroring loudly.
  const guard = combatSceneSource.indexOf("resolution?.side === 'enemy'");
  const call = combatSceneSource.indexOf('drawAttackNotes(');
  assert.ok(guard >= 0 && call > guard, 'notes are drawn inside the enemy-beat guard');

  const { attackNoteLayout } = combatView;
  // Deterministic: the same turn renders the same swarm every frame of it.
  const a = attackNoteLayout({ count: 6, now: 3.25, seed: 42 });
  const b = attackNoteLayout({ count: 6, now: 3.25, seed: 42 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, attackNoteLayout({ count: 6, now: 3.25, seed: 43 }));
  assert.equal(a.length, 6);
  // Every note stays on the figure and climbs it.
  for (const note of a) {
    assert.ok(note.u >= 0 && note.u <= 1, 'across the figure');
    assert.ok(note.v >= 0 && note.v <= 1, 'and inside its height');
    assert.ok(note.alpha >= 0 && note.alpha <= 1);
    assert.ok(note.scale > 0);
    assert.ok(NOTE_SPRITES[note.kind], `${note.kind} is a sprite this file can draw`);
  }
  // They dance out of step with each other rather than rising as a rank.
  const later = attackNoteLayout({ count: 6, now: 3.55, seed: 42 });
  assert.ok(later.some((note, index) => note.v !== a[index].v), 'and they move');
  assert.ok(new Set(a.map((note) => note.v.toFixed(3))).size > 1, 'never in one line');
  // A chain throws more of them than a single hit.
  assert.ok(attackNoteLayout({ count: 9, now: 1, seed: 1 }).length
    > attackNoteLayout({ count: 5, now: 1, seed: 1 }).length);
  // Reduced motion holds them still instead of animating.
  const still = attackNoteLayout({ count: 4, now: 9.1, seed: 7, reducedMotion: true });
  assert.ok(still.every((note) => note.sway === 0));
  assert.deepEqual(still, attackNoteLayout({ count: 4, now: 21.7, seed: 7, reducedMotion: true }));
});
