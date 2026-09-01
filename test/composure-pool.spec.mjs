import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as REC from '../src/game/recordist.js';
import { createCombatState } from '../src/game/combat-state.js';
import { deathFrameState, DEATH_BEATS } from '../src/game/death-scene.js';
import { SHEET_MUSIC, noteHz, sheetMotifHz, sheetMusicById } from '../src/data/sheet-music.js';
import { createSheetVoice, SHEET_AUDIO_BASE, SHEET_CUTOFF_HZ } from '../src/audio/sheet-voice.js';
import { existsSync } from 'node:fs';
import { resolveBagItemAction, resolveBagOwnership } from '../src/game/bag-items.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
import { GRID } from '../src/game/combat-damage.js';

// The same fixture combat-state.spec.mjs fights against, so the pool is tested
// on a real authored definition rather than a hand-built one.
const definition = (id = 'natatorium') => ({
  id, enemy: id.toUpperCase(), baseComposure: 8 * GRID, ...authoredCombatProfile(id),
});

// The recordist module is a singleton, so every test starts from a known body.
const fresh = (saved = {}) => REC.loadRecState({ tapes: [], ...saved });

test('composure is a pool the night draws down, not a per-fight allowance', () => {
  fresh();
  assert.equal(REC.composure(), REC.COMPOSURE_BASE, 'an unmarked recordist opens at the base');
  assert.equal(REC.composureCeiling(), REC.COMPOSURE_BASE);

  // A fight ends at 24 of 40. That is what the next one opens at.
  REC.setComposure(24);
  assert.equal(REC.composure(), 24);
  const saved = REC.saveRecState([]);
  assert.equal(saved.composure, 24, 'the pool is written to the save');

  fresh(saved);
  assert.equal(REC.composure(), 24, 'and read back on load');
});

test('a save written before composure carried opens at its ceiling, not at zero', () => {
  fresh({ injuries: 2 });
  assert.equal(REC.composure(), REC.composureCeiling());
  assert.equal(REC.composureCeiling(), REC.COMPOSURE_BASE - 2 * REC.COMPOSURE_GRID);
});

test('injuries lower the ceiling and drag a full recordist down with it', () => {
  fresh();
  assert.equal(REC.composure(), 40);
  REC.injure();
  assert.equal(REC.composureCeiling(), 35);
  assert.equal(REC.composure(), 35, 'sitting at the old ceiling must not survive the mark');
});

test('the floor holds: four injuries is half, and no further', () => {
  fresh();
  for (let i = 0; i < 8; i += 1) REC.injure();
  assert.equal(REC.composureCeiling(), REC.COMPOSURE_FLOOR, 'the ceiling bottoms out at half');
  // Defeat drops him to the floor. It can never drop him below it, because the
  // next fight has to be enterable — "never stranded" is the standing rule.
  REC.setComposure(0);
  assert.equal(REC.composure(), REC.COMPOSURE_FLOOR);
});

test('a fight opens at what the night has left, clamped into the ceiling', () => {
  // Null is the pre-pool behaviour and is what the bench drill still passes.
  const full = createCombatState(definition(), { composure: null });
  assert.equal(full.composure, full.maxComposure);

  const carried = createCombatState(definition(), { composure: 17 });
  assert.equal(carried.composure, 17);
  assert.equal(carried.maxComposure, full.maxComposure, 'the ceiling is injuries only, never the carried value');

  // A pool above a lowered ceiling cannot smuggle health past an injury.
  const marked = createCombatState(definition(), { composure: 999, injuries: 3 });
  assert.equal(marked.maxComposure, full.maxComposure - 3 * GRID);
  assert.equal(marked.composure, marked.maxComposure);
});

test('a clean take is worth one grid square and a sheet is worth three', () => {
  fresh();
  REC.setComposure(REC.COMPOSURE_FLOOR);
  const start = REC.composure();
  REC.restoreComposure(REC.COMPOSURE_GRID);
  assert.equal(REC.composure(), start + 5, 'the take is nominal');

  REC.addSheet('sheet-goldberg-aria');
  const beforeSheet = REC.composure();
  const read = REC.readSheet();
  assert.equal(read.spent, true);
  assert.equal(read.composure - beforeSheet, 15, 'a sheet is five clean takes');
  assert.equal(REC.sheetsCarried(), 0, 'and it is gone');
});

test('a sheet cannot be spent when there is none, or when there is nothing to gain', () => {
  fresh();
  assert.deepEqual(REC.readSheet(), { spent: false, id: null, composure: 40, sheets: 0, reason: 'NO SHEET' });
  REC.addSheet('sheet-vexations'); REC.addSheet('sheet-tombeau');
  // Full. Burning one here would be pure waste, so the transaction refuses.
  const refused = REC.readSheet();
  assert.equal(refused.spent, false);
  assert.equal(refused.reason, 'ALREADY COMPOSED');
  assert.equal(REC.sheetsCarried(), 2, 'a refused read costs nothing');
});

test('recovery never overshoots the ceiling', () => {
  fresh({ injuries: 3 });
  REC.setComposure(REC.COMPOSURE_FLOOR);
  REC.restoreComposure(999);
  assert.equal(REC.composure(), REC.composureCeiling());
  assert.equal(REC.composure(), 25);
});

test('a sheet is lifted once and the pickup survives a reload', () => {
  fresh();
  assert.equal(REC.sheetTaken('sheet-two-hands'), false);
  assert.equal(REC.takeSheet('sheet-two-hands'), true);
  assert.equal(REC.takeSheet('sheet-two-hands'), false, 'a resynced prop cannot be taken twice');
  assert.equal(REC.sheetsCarried(), 1);

  fresh(REC.saveRecState([]));
  assert.equal(REC.sheetTaken('sheet-two-hands'), true);
  assert.equal(REC.sheetsCarried(), 1);
});

test('the five sheets are distinct, authored, and spread across the target rooms', () => {
  assert.equal(SHEET_MUSIC.length, 5, 'few, and far between');
  const ids = SHEET_MUSIC.map((sheet) => sheet.id);
  assert.equal(new Set(ids).size, 5);
  for (const sheet of SHEET_MUSIC) {
    assert.equal(sheetMusicById(sheet.id), sheet);
    assert.ok(Number.isFinite(sheet.at?.x) && Number.isFinite(sheet.at?.y), `${sheet.id} has a cell`);
    assert.ok(sheet.line?.length, `${sheet.id} has something he thinks about it`);
    // Real pieces by real people, and the licence is recorded on the object
    // rather than in a comment somewhere.
    assert.ok(sheet.composer?.length && sheet.title?.length, `${sheet.id} names its composer and piece`);
    assert.ok(sheet.licence?.length, `${sheet.id} records its licence`);
    assert.ok(sheet.detail?.length, `${sheet.id} has a page description`);
  }
  assert.equal(new Set(SHEET_MUSIC.map((sheet) => sheet.room)).size, 5, 'one per room, never two in a room');
  assert.equal(new Set(SHEET_MUSIC.map((sheet) => sheet.composer)).size, 5, 'five composers, not one man five times');
});

test('every sheet has a real recording on disk, and every CC-BY one carries its credit', () => {
  for (const sheet of SHEET_MUSIC) {
    assert.ok(sheet.audio?.length, `${sheet.id} names an audio excerpt`);
    const file = new URL(`../public/${SHEET_AUDIO_BASE}/${sheet.audio}.mp3`, import.meta.url);
    assert.ok(existsSync(file), `${sheet.id} excerpt is on disk at ${SHEET_AUDIO_BASE}/${sheet.audio}.mp3`);

    // THE CREDIT CANNOT BE DROPPED BY ADDING A SHEET.
    //
    // Two of the five are CC BY and legally require attribution. Carrying the
    // credit line on the entry — and failing here when a CC-BY piece has none
    // — is what stops a sixth sheet quietly shipping an uncredited recording.
    // The licence table is third_party/licenses/SHEET-MUSIC-AUDIO.md.
    if (/CC BY(?!-SA)/.test(sheet.licence)) {
      assert.ok(sheet.attribution?.length, `${sheet.id} is CC BY and must carry an attribution line`);
    }
    // Share-alike was deliberately rejected for every piece; if one appears,
    // somebody has added an asset without reading why.
    assert.ok(!/-SA/.test(sheet.licence), `${sheet.id} must not be share-alike`);
  }
  const credited = SHEET_MUSIC.filter((sheet) => sheet.attribution).length;
  assert.equal(credited, 2, 'two of the five require a credit');
});

test('every sheet carries a playable figure, and four of the five fall', () => {
  assert.equal(noteHz('A4'), 440);
  assert.ok(Math.abs(noteHz('A3') - 220) < 1e-9, 'an octave down is half');
  assert.equal(noteHz('nonsense'), 0);

  let falling = 0;
  for (const sheet of SHEET_MUSIC) {
    const { hz } = sheetMotifHz(sheet);
    assert.ok(hz.length >= 4 && hz.length <= 8, `${sheet.id} is a figure, not a recital`);
    assert.ok(hz.every((note) => note.hz > 20 && note.hz < 4000), `${sheet.id} stays in the audible middle`);
    // Held at the funereal tempo, a figure runs a few seconds. Long enough to
    // be a phrase, short enough that he is still holding up a page.
    const seconds = hz.reduce((total, note) => total + note.beats, 0) * .30;
    assert.ok(seconds > 2 && seconds < 9, `${sheet.id} runs ${seconds}s`);
    // The lament tetrachord: the line ends below where it started. This is the
    // actual musicological through-line of the set, not a curation flourish.
    if (hz[hz.length - 1].hz < hz[0].hz) falling += 1;
  }
  assert.equal(falling, 4, 'four descend; the Bach comes back to where it started');
  const bach = sheetMotifHz(sheetMusicById('sheet-goldberg-aria')).hz;
  assert.equal(bach[0].hz, bach[bach.length - 1].hz, 'the ground bass returns to its own first note');
});

test('the sheet voice is a distant one, and survives having no audio context', () => {
  // Far things have no top. If this ever opens up, the sheets stop sounding
  // like they are in another room and start sounding like a synth in this one.
  assert.ok(SHEET_CUTOFF_HZ <= 1000, 'the top stays off it');
  const silent = createSheetVoice({ getAudio: () => null });
  assert.equal(silent.play(sheetMotifHz(SHEET_MUSIC[0])), 0, 'no context is silence, not a crash');
  // A page must never be mute. With no context and no decoded buffer it still
  // takes the synth path rather than throwing.
  assert.equal(silent.playSheet({ ...SHEET_MUSIC[0], ...sheetMotifHz(SHEET_MUSIC[0]) }), 0);
  assert.equal(silent.prepare('sheet-goldberg-aria'), false);
  assert.equal(silent.stop(), false);
});

test('the case shows sheets only while carried, and refuses to open them in a fight', () => {
  const owned = { bagTaken: true, sheetsCarried: 2 };
  assert.ok(resolveBagOwnership(owned).kit.includes('sheet-music'));
  assert.ok(!resolveBagOwnership({ bagTaken: true, sheetsCarried: 0 }).kit.includes('sheet-music'));

  const idle = resolveBagItemAction('sheet-music', {});
  assert.equal(idle.enabled, true);
  assert.equal(idle.mode, 'consume');
  assert.ok(idle.confirm, 'spending a scarce thing asks first');

  const fighting = resolveBagItemAction('sheet-music', { inCombat: true });
  assert.equal(fighting.enabled, false, 'the pool is what the fight is fought with');
  assert.equal(fighting.reason, 'NOT WHILE IT IS LOOKING AT YOU');
});

test('the death screen runs the desktop composition beats and then hands off', () => {
  // These are lifted from deathCompositionPlan; if the desktop score moves, the
  // canvas has to move with it or the two halves are different edits.
  assert.equal(DEATH_BEATS.autopsy, 2.5);
  assert.equal(DEATH_BEATS.restore, 4);
  assert.equal(DEATH_BEATS.loop, 5.2);

  assert.equal(deathFrameState(0).complete, false);
  assert.equal(deathFrameState(0).autopsy, false);
  assert.equal(deathFrameState(2.6).autopsy, true, 'the autopsy swap is live between 2.5s and 4s');
  assert.equal(deathFrameState(4.1).autopsy, false);
  assert.equal(deathFrameState(5.2).complete, true, 'one loop, then it hands off');

  // The quarters come apart and are pulled back most of the way, never all of
  // it. The frame does not go back together.
  const open = deathFrameState(2.0).spread[0];
  const settled = deathFrameState(5.19).spread[0];
  assert.ok(open > settled, 'the restore closes the gaps');
  assert.ok(settled > 0, 'but never fully');
});

test('the canvas half is not gated on the desktop half', () => {
  // Window choreography is opt-out and can revoke itself, so most of the
  // reasons a player never sees the desktop panes are invisible to them. The
  // scene must not read the effects pool at all.
  const source = readFileSync(new URL('../src/game/death-scene.js', import.meta.url), 'utf8');
  assert.ok(!/windowChoreography|personalWindowEffects|invoke\(/.test(source),
    'death-scene.js must stand alone');
});

test('the night is survivable on one pool, and the sheets are what make it so', () => {
  // Measured with `npm run tune:combat` (see its THE NIGHT table). This is the
  // budget the whole feature stands on: five fights drawing down one pool, with
  // a clean take between each and the five sheets in the building.
  //
  // What it pins is the RATIO, not the outcome of any one fight — the sheets
  // must be worth at least one whole fight across a night, or they are set
  // dressing and the pool is just a difficulty increase.
  const damage = { natatorium: 17, hall: 22, practice: 14, chapel: 30, 'source-final': 24 };
  const runNight = (sheetsAvailable) => {
    let pool = REC.COMPOSURE_BASE;
    let injuries = 0;
    let lost = 0;
    let sheets = sheetsAvailable;
    const ceiling = () => Math.max(REC.COMPOSURE_FLOOR, REC.COMPOSURE_BASE - injuries * REC.COMPOSURE_GRID);
    for (const cost of Object.values(damage)) {
      while (sheets > 0 && pool < ceiling() * .6) {
        sheets -= 1;
        pool = Math.min(ceiling(), pool + 3 * REC.COMPOSURE_GRID);
      }
      if (pool <= cost) { lost += 1; injuries += 1; pool = Math.min(ceiling(), REC.COMPOSURE_FLOOR); }
      else pool = Math.min(ceiling(), pool - cost + REC.COMPOSURE_GRID);
    }
    return lost;
  };
  const bare = runNight(0);
  const armed = runNight(5);
  assert.ok(armed < bare, 'the sheets are load-bearing, not decoration');
  assert.ok(armed <= 1, 'a competent night costs at most one fight');
  // And they cannot trivialise it either: five sheets is 75 points against a
  // night that costs well over a hundred.
  assert.ok(5 * 3 * REC.COMPOSURE_GRID < Object.values(damage).reduce((a, b) => a + b, 0),
    'the whole stack is worth less than the night costs');
});

test('a defeat drops him to the floor, marks him once, and moves him', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /REC\.setComposure\(REC\.COMPOSURE_FLOOR\)/, 'defeat lands him on the floor');
  assert.match(main, /wakeAfterDefeat\(defeatRoom\)/, 'and somewhere else in the building');
  // The line naming where he was is what stops the new room reading as a bug.
  assert.match(main, /Wasn't I in \$\{label\}\?/);
  // The bench drill and the god menu must never write to the pool.
  assert.match(main, /if\(!metrics\|\|bench\|\|godBattleOpen\)return false;/);
});
