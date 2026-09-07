import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBagScene } from '../src/game/bag.js';
import { makeCombatScene } from '../src/game/combat.js';
import { trainingCombatBattle } from '../src/data/combat-definitions.js';
import { normalizeCombatBuild, PIN_SOURCES, TECHNIQUE_DEFS } from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';
import { sampleControl, controlMechanicsSnapshot, cancelControlScope } from '../src/game/control-mechanics.js';
import { skillCapPrintLayout } from '../src/render/bag-skills.js';

function clock(t) {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  return (value) => { now = value; };
}

function bagFixture() {
  return makeBagScene({
    getBuild: () => normalizeCombatBuild(null, PIN_SOURCES.encounters),
    hasRig: () => true,
    focus: { sectionId: 'skills', entryId: `skill:${TECHNIQUE.AFTERIMAGE}` },
  });
}

test('keyboard skill confirmation patches the existing progression without mechanical skill caps', () => {
  const bag = bagFixture();
  bag.enter();
  bag.key({ key: 'Enter', code: 'Enter' });
  assert.ok(bag.debugState().workingBuild.techniques.includes(TECHNIQUE.AFTERIMAGE),
    'the accessible patch verb still runs the same skill reducer');
  bag.key({ key: 'ArrowRight', code: 'ArrowRight' });
  bag.keyup({ key: 'Enter', code: 'Enter' });
  assert.ok(controlMechanicsSnapshot().ids.every((id) => !id.startsWith('bag:skill:')),
    'skill modules are sockets, not hidden animated buttons');
  bag.exit();
  assert.ok(controlMechanicsSnapshot().ids.every((value) => !value.startsWith('bag:')));
});

test('controller skill confirmation patches the same progression without a held module cap', () => {
  const bag = bagFixture();
  bag.enter();
  bag.key({ controllerAction: 'confirm', controller: true });
  assert.ok(bag.debugState().workingBuild.techniques.includes(TECHNIQUE.AFTERIMAGE));
  const first = bag.debugState().workingBuild;
  bag.key({ controllerAction: 'confirm', controller: true, repeat: true });
  assert.deepEqual(bag.debugState().workingBuild, first, 'holding confirm does not repeat the patch verb');
  bag.keyup({ controllerAction: 'confirm', controller: true });
  assert.ok(controlMechanicsSnapshot().ids.every((id) => !id.startsWith('bag:skill:')));
  bag.exit();
});

test('clicking a skill body selects its printed label but cannot spend a lead', () => {
  const bag = bagFixture();
  bag.enter();
  bag.render();
  const hit = bag.debugState().hitRegions.find((region) => region.id === `bag:skill:skill:${TECHNIQUE.PUNCH_IN}`);
  assert.ok(hit);
  const before = bag.debugState().workingBuild;
  bag.pointer({ type: 'pointerdown', pointerId: 7, cellX: hit.x + hit.w / 2, cellY: hit.y + hit.h * .2, button: 0 });
  assert.equal(bag.debugState().selected.techniqueId, TECHNIQUE.PUNCH_IN);
  assert.deepEqual(bag.debugState().workingBuild, before);
  assert.equal(bag.debugState().patchDrag, null);
  assert.ok(controlMechanicsSnapshot().ids.every((id) => !id.startsWith('bag:skill:')));
  bag.pointer({ type: 'pointerup', pointerId: 7, cellX: -100, cellY: -100 });
  bag.exit();
});

test('momentary navigation keys spring up while the selected screen stays selected', (t) => {
  const at = clock(t), bag = bagFixture();
  bag.enter();
  bag.key({ key: '4', code: 'Digit4' });
  at(100);
  assert.equal(sampleControl('bag:tab:skills', { lit: true, latched: false }).travel, 1);
  assert.equal(bag.debugState().nav.sectionId, 'skills');
  bag.keyup({ key: '4', code: 'Digit4' });
  at(250);
  assert.equal(sampleControl('bag:tab:skills', { lit: true, latched: false }).travel, 0);
  assert.equal(bag.debugState().nav.sectionId, 'skills', 'screen selection is electrical state, not a mechanical latch');
  bag.key({ controllerAction: 'tabNext', controller: true });
  at(350);
  assert.equal(bag.debugState().nav.sectionId, 'kit');
  assert.equal(sampleControl('bag:tab:kit', { latched: false }).travel, 1);
  bag.keyup({ controllerAction: 'tabNext', controller: true });
  at(500);
  assert.equal(sampleControl('bag:tab:kit', { latched: false }).travel, 0);
  bag.exit();
});

test('pointer release outside a navigation button and cancellation release its original cap', (t) => {
  const at = clock(t);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    at(0);
    const bag = bagFixture();
    bag.enter();
    bag.render();
    const hit = bag.debugState().hitRegions.find((region) => region.id === 'bag:tab:map');
    assert.ok(hit, 'the navigation button has its matching mechanical ID');
    bag.pointer({ type: 'pointerdown', pointerId: 7, cellX: hit.x + hit.w / 2, cellY: hit.y + hit.h / 2, button: 0 });
    assert.equal(bag.debugState().nav.sectionId, 'map');
    at(100);
    assert.equal(sampleControl(hit.id).travel, 1);
    bag.pointer({ type, pointerId: 7, cellX: -100, cellY: -100 });
    at(250);
    assert.equal(sampleControl(hit.id).travel, 0, `${type} releases without hit-testing the release location`);
    bag.exit();
  }
});

test('combat confirmation commits immediately and keyup releases during resolution', (t) => {
  const at = clock(t);
  const battle = makeCombatScene({ battle: trainingCombatBattle(), skipOpening: true, difficulty: {} });
  battle.enter();
  battle.key({ key: 'ArrowDown', code: 'ArrowDown' });
  const before = battle.battleView();
  const id = `combat:action:${before.moves[before.selectedMove].id}`;
  battle.key({ key: 'Enter', code: 'Enter' });
  assert.equal(battle.battleView().phase, 'resolve', 'motion is presentation, never an action gate');
  at(100);
  assert.equal(sampleControl(id).travel, 1);
  battle.keyup({ key: 'Enter', code: 'Enter' });
  at(250);
  assert.equal(sampleControl(id).travel, 0);
  battle.exit();
  assert.ok(controlMechanicsSnapshot().ids.every((value) => !value.startsWith('combat:')));
});

test('global cancellation clears local input ownership as well as shared animation state', (t) => {
  const at = clock(t), bag = bagFixture();
  bag.enter();
  const id = 'bag:tab:skills';
  const confirm = { key: '4', code: 'Digit4' };
  bag.key(confirm);
  at(100);
  assert.equal(sampleControl(id).travel, 1);
  bag.pointer({ type: 'pointercancel' });
  assert.equal(controlMechanicsSnapshot().ids.includes(id), false);
  bag.key(confirm);
  at(200);
  assert.equal(sampleControl(id).travel, 1,
    'returning from hidden/blur can press the same key without a missing-keyup latch');
  bag.exit();
});

test('pointer release and cancellation retain the original capture identity in both scenes', () => {
  for (const file of ['src/game/combat.js', 'src/game/bag.js']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /pointerId \?\? 'primary'/, `${file}: each pointer owns its press`);
    assert.match(source, /pointerup[\s\S]*pointercancel[\s\S]*lostpointercapture/, `${file}: every cancellation route is handled`);
    assert.match(source, /addEventListener\('blur', reset/, `${file}: focus loss cannot leave a held switch`);
    assert.match(source, /removeEventListener\('blur', reset/, `${file}: the listener does not outlive its scene`);
  }
});

test('combat legends follow their caps while skill labels remain fixed patch-rack printing', () => {
  const source = readFileSync('src/render/combat-view.js', 'utf8');
  const tool = source.slice(source.indexOf('export function drawCombatToolTile'), source.indexOf('const HAND_PALETTE'));
  assert.match(tool, /const face = cap\.content/);
  assert.match(tool, /drawPrintedText\(face\.x/);
  assert.match(tool, /ink: cap\.ink/);
  assert.match(tool, /selected: focused/);
  assert.match(tool, /const lit = enabled && \(counters \|\| executing\)/,
    'the action circuit does not follow menu navigation');
  assert.match(tool, /uiText\(x \+ \.55, y \+ h - \.92/,
    'dynamic state is drawn beneath the physical cap');
  const bag = readFileSync('src/render/bag-skills.js', 'utf8');
  const tile = bag.slice(bag.indexOf('function drawTile'), bag.indexOf('export function drawSkillsSection'));
  assert.match(tile, /drawPatchLabel\(/);
  assert.doesNotMatch(tile, /drawLampButton\(|sampleControl\(|cap\.content/,
    'a skill module is not a mechanical push button');
  assert.doesNotMatch(tile, /uiText\(/, 'permanent rack printing never silently falls back to phosphor glyphs');
  cancelControlScope('combat:');
  cancelControlScope('bag:');
});

test('rack print layout separates service codes and wraps long names at one readable line height', () => {
  const face = { x: 4, y: 6, w: 10, h: 1.6 };
  const long = skillCapPrintLayout('RUNAWAY FEEDBACK', face);
  assert.deepEqual(long.lines.map((line) => line.text), ['RUNAWAY', 'FEEDBACK']);
  assert.equal(long.compact, false);
  const lineHeight = long.lines[0].h;
  assert.ok(lineHeight * 20 * .91 >= 10, 'normal-size names retain at least ten logical pixels of nominal type');
  for (const technique of TECHNIQUE_DEFS) {
    const layout = skillCapPrintLayout(technique.label, face);
    assert.equal(layout.lines.map((line) => line.text).join(' '), technique.label,
      `${technique.label}: wrapping preserves every word`);
    assert.ok(layout.lines.length >= 1 && layout.lines.length <= 2);
    assert.equal(layout.lines[0].h, lineHeight, 'short and long names share the same print size');
    for (const line of layout.lines) {
      assert.ok(line.y >= layout.service.y + layout.service.h, 'the service code has a separate row');
      assert.ok(line.x >= face.x && line.x + line.w <= face.x + face.w);
      assert.ok(line.y + line.h <= face.y + face.h + 1e-9);
    }
  }
  const moved = skillCapPrintLayout('RUNAWAY FEEDBACK', { ...face, y: face.y + .18 });
  assert.ok(Math.abs(moved.lines[0].y - long.lines[0].y - .18) < 1e-9,
    'the complete stamp preserves its relative placement when the rack layout moves');
  assert.equal(skillCapPrintLayout('RUNAWAY FEEDBACK', { ...face, h: .7 }).compact, true,
    'tiny surfaces use a status index and detail readout instead of microscopic lettering');
  const source = readFileSync('src/render/bag-skills.js', 'utf8');
  const tile = source.slice(source.indexOf('function drawTile'), source.indexOf('export function drawSkillsSection'));
  assert.doesNotMatch(tile, /STATE_LABEL|PATCHED · NEW|NO REACH/,
    'electrical state never rewrites the permanent rack label');
});
