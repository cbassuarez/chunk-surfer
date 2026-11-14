import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTask } from 'node:timers/promises';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { makeCombatScene } from '../src/game/combat.js';
import { COMBAT_ACTION, PARRY_TIER } from '../src/game/combat-state.js';
import { createChapelDesktopPresentation } from '../src/platform/chapel-desktop-presentation.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';

const ATTACK = 'chapel:walls';
const noop = () => {};

function chapelFixture({ enabled = true, canPaint = true } = {}) {
  const battle = attachCombatDefinition({ id: 'chapel', enemy: 'CHAPEL', rounds: [] });
  // Keep the real movement, damage and ringing rider. Pin the attack first so
  // each run reaches the same decision without advancing unrelated turns.
  const first = battle.combat.movements[0];
  first.intents = [first.intents.find(intent => intent.id === ATTACK), ...first.intents.filter(intent => intent.id !== ATTACK)];
  battle.combat.pinnedCycle = true;
  const listeners = new Map();
  const commands = [];
  const casts = [];
  const impacts = [];
  let optedIn = enabled;
  const api = {
    async listen(type, receive) {
      listeners.set(type, receive);
      return () => listeners.delete(type);
    },
    async invoke(command, args) {
      commands.push({ command, args });
      return command !== 'chunk_chapel_desktop_begin' || canPaint;
    },
  };
  const chapelDesktop = createChapelDesktopPresentation({ getEnabled: () => optedIn, api });
  const scene = makeCombatScene({
    battle, chapelDesktop, skipOpening: true, difficulty: COMBAT_RULES.standard,
    loadout: { tools: { torch: true, recorder: true }, composure: 40 },
    getAudio: () => null,
    fx: { stopCues: noop, flash: noop, cue: noop, glitch: noop, shake: noop },
    audio: { stopTyping: noop, menuMove: noop, menuConfirm: noop },
    resources: { playImpact: event => impacts.push(event) },
    interference: { beginFireballCast: event => { casts.push(event); return null; } },
  });
  scene.enter();
  return {
    scene, commands, casts, impacts,
    enable() {
      optedIn = true;
      scene.focus();
    },
    async openAttack() {
      await nextTask();
      assert.equal(scene.battleView().intent.id, ATTACK);
      chooseWait(scene);
      advanceUntil(scene, view => view.resolution?.side === 'enemy');
      await nextTask();
      return scene.battleView();
    },
    hit() {
      const request = commands.find(call => call.command === 'chunk_chapel_desktop_begin')?.args?.request;
      assert.ok(request, 'the real bridge must present an attack before a native hit can be sent');
      const { token, attackId } = request;
      listeners.get('chapel-desktop:hit')?.({ payload: { token, attackId } });
    },
    outcome() {
      return commands.filter(call => call.command === 'chunk_chapel_desktop_end').map(call => call.args.outcome);
    },
  };
}

function press(scene, key) {
  scene.key({ key });
  scene.keyup({ key });
}

function chooseWait(scene) {
  const view = scene.battleView();
  assert.equal(view.phase, 'tool');
  const tool = view.tools.findIndex(entry => entry.moves.includes(COMBAT_ACTION.WAIT));
  assert.ok(tool >= 0);
  for (let index = 0; scene.battleView().selectedTool !== tool && index < 12; index += 1) press(scene, 'ArrowRight');
  press(scene, 'ArrowDown');
  const move = scene.battleView().moves.findIndex(entry => entry.id === COMBAT_ACTION.WAIT);
  assert.ok(move >= 0);
  for (let index = 0; scene.battleView().selectedMove !== move && index < 16; index += 1) press(scene, 'ArrowRight');
  press(scene, 'Enter');
  assert.equal(scene.battleView().resolution?.action, COMBAT_ACTION.WAIT);
}

function advanceUntil(scene, predicate) {
  for (let index = 0; index < 140; index += 1) {
    const view = scene.battleView();
    if (predicate(view)) return view;
    scene.update(.04);
  }
  assert.fail(`expected combat state was unreachable from ${scene.battleView().phase}`);
}

test('Chapel opt-out leaves the original timed guard and ordinary external fireballs available', async () => {
  const fixture = chapelFixture({ enabled: false });
  const { scene } = fixture;
  try {
    const strike = await fixture.openAttack();
    assert.equal(strike.chapelDesktop.shown, false);
    assert.equal(strike.state.ringing, true);
    assert.equal(fixture.commands.length, 0);
    assert.ok(fixture.casts.length > 0, 'opting out must not disable ordinary fireballs');
    const onBeat = advanceUntil(scene, view => view.resolution?.parry?.tier === PARRY_TIER.GOOD);
    assert.equal(onBeat.resolution.parry.armed, true);
    press(scene, ' ');
    const turned = scene.battleView().state;
    assert.equal(turned.last.parryTier, PARRY_TIER.GOOD);
    assert.equal(turned.last.received, 0);
    assert.equal(turned.ringing, false);
  } finally { scene.exit(); }
});

test('a desktop click and the timed in-game guard resolve the same authored blow through combat', async () => {
  const desktop = chapelFixture();
  const game = chapelFixture();
  try {
    for (const fixture of [desktop, game]) {
      const view = await fixture.openAttack();
      assert.equal(view.chapelDesktop.phase, 'live');
      assert.equal(view.resolution.intentId, ATTACK);
      assert.equal(view.state.ringing, true);
      assert.equal(fixture.casts.length, 0, 'the Chapel receiver must not overlap a fireball');
    }
    desktop.hit();
    const resolved = desktop.scene.battleView().state;
    desktop.hit();
    assert.deepEqual(desktop.scene.battleView().state, resolved, 'a duplicate click cannot spend the parry twice');
    const onBeat = advanceUntil(game.scene, view => view.resolution?.parry?.tier === PARRY_TIER.GOOD);
    assert.equal(onBeat.chapelDesktop.phase, 'live');
    press(game.scene, ' ');
    assert.deepEqual(game.scene.battleView().state, resolved);
    assert.equal(resolved.last.parryTier, PARRY_TIER.GOOD);
    assert.equal(resolved.last.received, 0);
    assert.equal(resolved.ringing, false);
    assert.equal(desktop.scene.battleView().chapelDesktop.last.surface, 'desktop');
    assert.equal(game.scene.battleView().chapelDesktop.last.surface, 'game');
    await nextTask();
    assert.deepEqual(desktop.outcome(), ['hit']);
    assert.deepEqual(game.outcome(), ['hit']);
  } finally { desktop.scene.exit(); game.scene.exit(); }
});

test('ignoring the desktop target leaves one ordinary Chapel hit and releases the fireball channel', async () => {
  const fixture = chapelFixture();
  const { scene } = fixture;
  try {
    const live = await fixture.openAttack();
    assert.equal(live.chapelDesktop.phase, 'live');
    const stillLive = advanceUntil(scene, view => view.chapelDesktop.remaining < 1);
    assert.equal(stillLive.chapelDesktop.phase, 'live');
    assert.equal(fixture.casts.length, 0, 'an extended response must not start another external challenge');
    const missed = advanceUntil(scene, view => view.chapelDesktop.last?.outcome === 'miss');
    assert.equal(missed.state.composure, live.state.composure);
    assert.equal(missed.state.ringing, true);
    fixture.hit();
    await nextTask();
    assert.deepEqual(fixture.outcome(), ['miss']);
    const settled = advanceUntil(scene, view => view.phase === 'tool');
    assert.equal(settled.state.composure, live.state.composure);
    assert.equal(settled.state.actionLog.filter(event => event.action === 'enemy' && event.intent === ATTACK).length, 1);
    assert.equal(settled.state.last.parried, undefined);
    assert.deepEqual(fixture.impacts.filter(event => event.received > 0).map(event => event.received), [live.state.last.received]);
    advanceUntil(scene, view => !!view.fireball.active);
    assert.ok(fixture.casts.length > 0, 'ordinary fireballs resume after the target closes');
  } finally { scene.exit(); }
});

test('failed desktop paint falls back to the same in-game guard', async () => {
  const fixture = chapelFixture({ canPaint: false });
  const { scene } = fixture;
  try {
    const view = await fixture.openAttack();
    assert.equal(view.chapelDesktop.shown, false);
    assert.equal(view.chapelDesktop.phase, 'idle');
    assert.deepEqual(fixture.outcome(), ['cancel']);
    advanceUntil(scene, next => next.resolution?.parry?.tier === PARRY_TIER.GOOD);
    press(scene, ' ');
    assert.equal(scene.battleView().state.last.parryTier, PARRY_TIER.GOOD);
  } finally { scene.exit(); }
});

test('a previously launched fireball keeps its own parry when the Chapel desktop layer becomes available', async () => {
  const fixture = chapelFixture({ enabled: false });
  const { scene } = fixture;
  try {
    const launch = advanceUntil(scene, view => !!view.fireball.active);
    const plan = launch.fireball.active.plan;
    fixture.enable();
    const strike = await fixture.openAttack();
    assert.equal(strike.chapelDesktop.prepared, true);
    assert.equal(strike.chapelDesktop.phase, 'idle');
    assert.equal(fixture.commands.some(call => call.command === 'chunk_chapel_desktop_begin'), false);
    assert.deepEqual(strike.fireball.active.plan, plan);
    advanceUntil(scene, view => view.resolution?.parry?.tier === PARRY_TIER.GOOD);
    press(scene, ' ');
    assert.equal(scene.battleView().state.last.parryTier, PARRY_TIER.GOOD);
  } finally { scene.exit(); }
});
