import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/game/combat.js', 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

// THE TURN HAS A CLOCK.
//
// Five to eight seconds to read the intent and answer it. Long enough to think,
// short enough that you have to think on your feet, and varied per turn so the
// length cannot be learned as a count. Letting it run out is not a penalty
// applied to the player — it is the fight carrying on without their answer,
// which is what forfeiting a turn is.
test('the clock is five to eight seconds and cycles rather than repeating', () => {
  const limits = source.match(/const TURN_LIMIT_SECONDS = Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(limits, 'the limits are one named table');
  const seconds = limits[1].split(',').map((value) => Number(value.trim()));
  assert.ok(seconds.length >= 4, 'more than a couple, so the rhythm is not two-beat');
  for (const value of seconds) {
    assert.ok(value >= 5 && value <= 8, `${value}s is inside the authored five-to-eight`);
  }
  assert.ok(new Set(seconds).size > 1, 'and it actually varies');
});

test('it is armed for the decision and disarmed by the answer', () => {
  const begin = slice('function beginToolSelection()', 'nextBark();');
  assert.match(begin, /armTurnClock\(\)/, 'every player beat starts its own clock');

  const execute = slice('function execute(actionId)', 'repairSelection();');
  assert.match(execute, /disarmTurnClock\(\)/, 'answering stops it');
  assert.ok(
    execute.indexOf('disarmTurnClock()') < execute.indexOf('turnStart = before'),
    'and stops it before the turn is handed on, so no tick can land after the commit',
  );
});

test('running out gives the beat to the opponent rather than punishing the player', () => {
  const forfeit = slice('function forfeitTurn()', 'function beginToolSelection');
  assert.match(forfeit, /disarmTurnClock\(\)/);
  assert.match(forfeit, /beginEnemyBeat\(\)/,
    'the opponent simply acts; nothing is deducted for having said nothing');
  assert.match(forfeit, /turnStart = state/,
    'and the settle still has a baseline to measure the turn against');
  assert.doesNotMatch(forfeit, /reduceCombat|applyDamage/,
    'a forfeit is not a move and not a hit');
});

test('the clock only runs while the deck is actually his', () => {
  const tick = slice("if(turnClock&&!state.result", 'const fireball');
  assert.match(tick, /\['tool','move'\]\.includes\(phase\)/,
    'not during resolution, arrival, submersion or a result');
  assert.match(tick, /!bark&&!cur/,
    'and not while a bark or an authored line owns the screen — that is not time he was given');
});

test('the remaining time is on screen where his hands are', () => {
  const readout = slice("if(turnClock&&['tool','move'].includes(phase)){", 'const selectedToolId');
  assert.match(readout, /panel\.x/, 'in the command band, not a corner');
  assert.match(readout, /ui-danger/, 'and it says so when it is nearly gone');
});
