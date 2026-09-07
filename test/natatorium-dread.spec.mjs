import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NATATORIUM_DREAD, basinCentrality, centralityAllowsTake, centralityPlace,
  dreadRate, freshNatatoriumDread, stepNatatoriumDread, natatoriumDreadCharacter,
} from '../src/game/natatorium-dread.js';

// ── THE PLACE IS DANGEROUS, NOT THE VERB ─────────────────────────────────────
//
// The natatorium fight was a RECORDING battle: `maybeBattle` fired it only when
// the tub happened to be your SECOND take, on the `recording-2` occasion, past
// 18% of the minute. Record the rooms in any other order and the fight did not
// exist — which is what "it never fires" meant. And when it did fire, it fired
// because you had pressed a key.
//
// Now the take needs you out in the middle of the basin, and the middle of the
// basin is what comes for you. One number does both.

// Centrality: 0 at the rim, 1 at the middle, on both axes equally.
{
  assert.equal(basinCentrality({ u: .5, v: .5 }), 1, 'the middle is the middle');
  assert.equal(basinCentrality({ u: 0, v: .5 }), 0, 'the long side is the rim');
  assert.equal(basinCentrality({ u: .5, v: 0 }), 0, 'and so is the short side');
  assert.equal(basinCentrality({ u: 0, v: 0 }), 0, 'and the corner is not central');
  assert.equal(basinCentrality(null), 0, 'no reading is not a central reading');
  // Chebyshev, not Euclidean: the basin is 12x16m, and a circular measure would
  // call the north edge central while still refusing the west one.
  assert.equal(basinCentrality({ u: .25, v: .5 }), basinCentrality({ u: .5, v: .25 }),
    'the same distance from either edge reads the same');
}

// ── THE EDGE HAS NO TAKE ─────────────────────────────────────────────────────
{
  assert.equal(centralityAllowsTake(0), false, 'not from the coping');
  assert.equal(centralityAllowsTake(NATATORIUM_DREAD.takeCentrality - .01), false);
  assert.equal(centralityAllowsTake(NATATORIUM_DREAD.takeCentrality), true);
  assert.equal(centralityAllowsTake(1), true);

  // Where it was rolled, recorded on the tape the way the hall records a deck.
  assert.equal(centralityPlace(0), null, 'a refused position has no place');
  assert.equal(centralityPlace(.4), 'shallow');
  assert.equal(centralityPlace(1), 'centre');
  assert.ok(NATATORIUM_DREAD.centreCentrality > NATATORIUM_DREAD.takeCentrality,
    'there is room between "allowed" and "the one you came for"');
}

// ── IT COMES FOR THE POSITION ────────────────────────────────────────────────
const runUntilFires = (input, limitSeconds = 400) => {
  let state = freshNatatoriumDread();
  for (let t = 0; t < limitSeconds; t += 0.1) {
    const result = stepNatatoriumDread(state, 0.1, { ...input, armed: true });
    state = result.state;
    if (result.fires) return +(t + 0.1).toFixed(1);
  }
  return null;
};

{
  const middle = runUntilFires({ centrality: 1, inBasin: true });
  const rim = runUntilFires({ centrality: NATATORIUM_DREAD.takeCentrality, inBasin: true });
  assert.ok(middle && middle < 12, `the middle is quick (${middle}s)`);
  assert.ok(rim && rim > middle, `the rim is slow, not safe (${rim}s vs ${middle}s)`);

  // THE DECK CAN NEVER FINISH IT. A player who stands on the coping and looks at
  // the water is never ambushed for it, however long they stand there.
  assert.equal(runUntilFires({ inBasin: false, approachCells: 0.5 }), null,
    'the coping never completes it');
  assert.equal(runUntilFires({ inBasin: false, approachCells: 9 }), null,
    'and across the room nothing accumulates at all');
  assert.equal(dreadRate({ inBasin: false, approachCells: 99 }), 0);
  assert.ok(dreadRate({ inBasin: false, approachCells: 1 }) > 0,
    'but the room does notice you at the rim');

  // Once. The module latches, and the encounter ledger is the other half.
  let state = freshNatatoriumDread();
  let fires = 0;
  for (let t = 0; t < 120; t += 0.1) {
    const result = stepNatatoriumDread(state, 0.1, { centrality: 1, inBasin: true, armed: true });
    state = result.state;
    if (result.fires) fires += 1;
  }
  assert.equal(fires, 1, 'it comes once, not every frame after');

  // Getting out cools it, but not instantly — stepping in and out must not be a
  // way to farm a clean approach.
  let warm = freshNatatoriumDread();
  for (let t = 0; t < 5; t += 0.1) warm = stepNatatoriumDread(warm, 0.1, { centrality: 1, inBasin: true }).state;
  const hot = warm.pressure;
  assert.ok(hot > 0, 'five seconds in the middle is not nothing');
  const cooled = stepNatatoriumDread(warm, 1, { inBasin: false, approachCells: 99 }).state;
  assert.ok(cooled.pressure > 0 && cooled.pressure < hot, 'it cools, and it takes a moment');
}

// ── IT KNOWS NOTHING ABOUT RECORDING ─────────────────────────────────────────
//
// This is the whole correction. The old trigger asked `REC.isRecording()`; a
// take may be running or not and it changes nothing here, because the take
// needs you exactly where the danger is.
{
  // Comments stripped: the header explains what was undone and names the old
  // trigger, which is prose about the bug rather than a call to it.
  const source = readFileSync('src/game/natatorium-dread.js', 'utf8')
    .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
  assert.doesNotMatch(source, /isRecording|takeProgress|REC\./,
    'the model never consults the recorder');

  const main = readFileSync('src/main.js', 'utf8');
  const map = main.slice(main.indexOf('const RECORDING_BATTLES='),
    main.indexOf('function battleForRoom'));
  assert.doesNotMatch(map, /the_tub/,
    'and the tub is out of RECORDING_BATTLES, so the verb cannot summon it');
  assert.match(map, /amplifications/, 'while the hall and the practice room keep theirs');
  assert.match(map, /soundnoisemusic/);

  // Its own ledger slot. Sharing `recording-2` is what made the old fight
  // unreachable, so inheriting that cleared state would be the same bug again.
  assert.match(main, /NATATORIUM_APPROACH_ENCOUNTER='natatorium-approach'/);
  // ...but the authored DIALOGUE stays on one of the two occasions the battle
  // document actually has threads for — test/battle-narrative.spec.mjs pins that
  // only `recording-2` and `pre-recording-4` are reachable.
  assert.match(main, /natatoriumBattle\(null,'pre-recording-4'\)/);
}

// The refusal is a two-function contract: the panel read and the rung that acts
// must carry the SAME predicate or they disagree about what a press does.
{
  const main = readFileSync('src/main.js', 'utf8');
  const refusal = main.slice(main.indexOf('function recorderRefusal()'),
    main.indexOf('function recordAction('));
  const action = main.slice(main.indexOf('function recordAction('),
    main.indexOf('function openListen('));
  for (const [name, body] of [['recorderRefusal', refusal], ['recordAction', action]]) {
    assert.match(body, /room==='the_tub'&&!DREAD\.centralityAllowsTake/,
      `${name} refuses a take from the edge of the pool`);
  }
}

// Two states, two fears — and the drained one is the one a first run meets,
// because the pool only fills once the player has seen an ending.
{
  assert.equal(natatoriumDreadCharacter('drained').staging, 'stair',
    'an empty basin puts it between you and the only way out');
  assert.equal(natatoriumDreadCharacter('murky').staging, 'surface',
    'a full one puts it between you and the surface');
  assert.notEqual(natatoriumDreadCharacter('drained').line, natatoriumDreadCharacter('murky').line);
  assert.equal(natatoriumDreadCharacter(null).id, 'drained', 'and drained is the default');
}

console.log('natatorium dread contracts passed');
