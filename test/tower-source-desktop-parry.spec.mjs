import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTask } from 'node:timers/promises';
import { cathedralBellCombatBattle, sourceCombatBattle } from '../src/data/combat-definitions.js';
import { COMBAT_ACTION, PARRY_TIER } from '../src/game/combat-state.js';
import { makeCombatScene } from '../src/game/combat.js';
import { desktopParryCueFor, SOURCE_FINAL_DESKTOP_PARRY_CUE } from '../src/game/desktop-parry-cues.js';
import { createChapelDesktopPresentation } from '../src/platform/chapel-desktop-presentation.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';

const towerFirst = { phase: 1, attackId: 'cathedral:clapper' };
const towerSecond = { phase: 2, attackId: 'cathedral:full-peal' };
const sourceII = { chapter: 'II', attackId: 'source:stack', theme: 'source-ii' };
const sourceIII = { chapter: 'III', attackId: 'source:wear', theme: 'source-iii' };
const sourceFinal = { chapter: 'I', final: true, attackId: 'source:final-loop', theme: 'source-final' };
const noop = () => {};
const isEnemy = view => view.resolution?.side === 'enemy';

function press(scene, key) {
  scene.key({ key });
  scene.keyup({ key });
}

function reach(scene, predicate) {
  for (let index = 0; index < 180; index += 1) {
    const view = scene.battleView();
    if (predicate(view)) return view;
    scene.update(.04);
  }
  assert.fail(`expected combat state unreachable from ${scene.battleView().phase}`);
}

function waitOnEnemy(scene) {
  const view = scene.battleView();
  assert.equal(view.phase, 'tool');
  const tool = view.tools.findIndex(row => row.moves.includes(COMBAT_ACTION.WAIT));
  assert.notEqual(tool, -1);
  for (let step = 0; step < view.tools.length && scene.battleView().selectedTool !== tool; step += 1) {
    press(scene, 'ArrowRight');
  }
  press(scene, 'ArrowDown');
  const moves = scene.battleView().moves;
  const move = moves.findIndex(row => row.id === COMBAT_ACTION.WAIT);
  assert.notEqual(move, -1);
  for (let step = 0; step < moves.length && scene.battleView().selectedMove !== move; step += 1) {
    press(scene, 'ArrowRight');
  }
  press(scene, 'Enter');
  assert.equal(scene.battleView().resolution?.action, COMBAT_ACTION.WAIT);
  return reach(scene, isEnemy);
}

async function fixture(spec, { enabled = true, paint = true, composure = 40 } = {}) {
  const battle = spec.phase ? cathedralBellCombatBattle({ phase: spec.phase }) : sourceCombatBattle();
  const primaryCue = desktopParryCueFor(battle.id, spec.chapter);
  const cue = spec.final ? SOURCE_FINAL_DESKTOP_PARRY_CUE : primaryCue;
  const startingMovementIndex = battle.combat.movements.findIndex(row => row.intents.some(intent => intent.id === spec.attackId));
  assert.ok(startingMovementIndex >= 0, `found authored ${spec.attackId} in ${battle.id}`);
  // Isolate the authored attack from its opponents' seed-based intent cycle.
  // Its damage, riders, followups, route and movement belong to the real fight.
  const movement = battle.combat.movements[startingMovementIndex];
  const attack = movement.intents.find(intent => intent.id === spec.attackId);
  movement.intents = [attack, ...movement.intents.filter(intent => intent !== attack)];
  battle.combat.pinnedCycle = true;
  const calls = [];
  const listeners = new Map();
  const impacts = [];
  const desktopCues = [];
  const casts = [];
  const breaches = [];
  let optedIn = enabled;
  let sourceFocused = true;
  const api = {
    async listen(type, receive) {
      listeners.set(type, receive);
      return () => listeners.delete(type);
    },
    async invoke(command, args) {
      calls.push({ command, args });
      return command === 'chunk_chapel_desktop_begin' ? paint : true;
    },
  };
  const chapelDesktop = createChapelDesktopPresentation({ api, getEnabled: () => optedIn });
  const existingBreach = spec.phase ? null : {
    async begin(frame) { breaches.push(frame); return { mode: 'native' }; },
    mode: () => 'native', frame: noop, debug: () => ({}), hasFocus: () => sourceFocused,
    async completeBreach() { return true; }, end: noop,
  };
  const scene = makeCombatScene({
    battle, chapelDesktop, desktopParryCues: (spec.final ? [primaryCue, cue] : [cue]).filter(Boolean), sourceDesktop: existingBreach,
    startingMovementIndex, skipOpening: true, difficulty: COMBAT_RULES.standard,
    loadout: { tools: { torch: true, recorder: true }, composure }, getAudio: () => null,
    fx: { stopCues: noop, flash: noop, cue: noop, glitch: noop, shake: noop },
    audio: { stopTyping: noop, menuMove: noop, menuConfirm: noop },
    resources: {
      playImpact: impact => impacts.push(impact),
      playDesktopParry: cue => desktopCues.push(cue),
    },
    interference: { beginFireballCast: cast => { casts.push(cast); return null; } },
  });
  scene.enter();
  await nextTask();
  if (existingBreach && scene.battleView().phase === 'desktop-breach') {
    // The handoff must happen before the attack can use the separate target.
    assert.equal(calls.some(row => row.command === 'chunk_chapel_desktop_begin'), false);
    for (let index = 0; index < 70; index += 1) scene.update(.04);
    await nextTask();
    scene.update(.01);
    assert.equal(scene.battleView().phase, 'tool');
  }
  return {
    scene, impacts, casts, calls, breaches, cue, desktopCues,
    request: () => calls.find(row => row.command === 'chunk_chapel_desktop_begin')?.args?.request,
    outcomes: () => calls.filter(row => row.command === 'chunk_chapel_desktop_end').map(row => row.args.outcome),
    emit(type, payload) { listeners.get(`chapel-desktop:${type}`)?.({ payload }); },
    setEnabled(value) { optedIn = value; if (value) scene.focus(); },
    setSourceFocus(value) { sourceFocused = value; },
  };
}

for (const spec of [towerFirst, towerSecond, sourceII, sourceIII, sourceFinal]) {
  test(`${spec.attackId} uses its authored desktop target and the ordinary combat parry`, async () => {
    const run = await fixture(spec);
    const { scene } = run;
    try {
      const committed = waitOnEnemy(scene);
      const resolvedImpact = committed.state.last.received;
      assert.ok(resolvedImpact > 0);
      assert.equal(committed.resolution.intentId, spec.attackId);
      await nextTask();
      const request = run.request();
      assert.ok(request, `${spec.attackId} should have a desktop offer`);
      assert.ok(request.token);
      assert.equal(request.attackId, spec.attackId);
      assert.equal(request.theme, run.cue.theme);
      assert.equal(request.responseSeconds, run.cue.responseSeconds);
      if (spec.theme) assert.equal(request.theme, spec.theme);
      assert.equal(run.casts.length, 0, 'another cast must not open while the desktop target owns the response');
      assert.deepEqual(run.desktopCues, [{ theme: request.theme, attackId: request.attackId, stage: 'open' }]);

      run.emit('hit', { ...request, attackId: 'stale-blow' });
      run.emit('hit', { ...request, token: 'stale-window' });
      assert.equal(scene.battleView().state.last.parried, undefined);
      run.emit('hit', request);
      const parried = scene.battleView();
      assert.equal(parried.state.last.parryTier, PARRY_TIER.GOOD);
      assert.equal(parried.state.last.received, 0);
      assert.equal(parried.state.composure, 40);
      assert.equal(parried.state.ringing, false);
      run.emit('hit', request);
      assert.deepEqual(scene.battleView().state, parried.state);
      await nextTask();
      assert.deepEqual(run.outcomes(), ['hit']);
      assert.deepEqual(run.desktopCues.map(cue => cue.stage), ['open', 'hit']);
      assert.equal(run.breaches.length, spec.phase ? 0 : 1);
      assert.equal(parried.state.actionLog.filter(row => row.action === 'enemy' && row.intent === spec.attackId).length, 1);
    } finally { scene.exit(); }
  });
}

test('letting the Tower clapper or Source seam go delivers its own strike once', async () => {
  for (const spec of [towerFirst, sourceII]) {
    const run = await fixture(spec);
    const { scene } = run;
    try {
      const committed = waitOnEnemy(scene);
      await nextTask();
      const request = run.request();
      assert.ok(request);
      reach(scene, view => view.resolution?.parry?.phase === 'resolved');
      await nextTask();
      assert.deepEqual(run.outcomes(), ['miss']);
      assert.deepEqual(run.desktopCues.map(cue => cue.stage), ['open', 'miss']);
      run.emit('hit', request);
      assert.equal(scene.battleView().state.last.parried, undefined);
      assert.equal(scene.battleView().state.ringing, true);
      assert.equal(scene.battleView().state.actionLog.filter(row => row.action === 'enemy' && row.intent === spec.attackId).length, 1);
      assert.equal(run.impacts.filter(row => row.received > 0).reduce((total, row) => total + row.received, 0), committed.state.last.received);
    } finally { scene.exit(); }
  }
});

test('disabled Tower, rejected Source paint and wrong Source chapter retain the in-game guard', async () => {
  for (const [spec, options] of [
    [towerSecond, { enabled: false }], [sourceIII, { paint: false }], [{ ...sourceII, chapter: 'I' }, {}],
  ]) {
    const run = await fixture(spec, options);
    const { scene } = run;
    try {
      waitOnEnemy(scene);
      await nextTask();
      if (options.paint === false) assert.deepEqual(run.outcomes(), ['cancel']);
      else assert.equal(run.request(), undefined);
      assert.deepEqual(run.desktopCues, [], 'the escape fallback cannot play an off-window cue');
      const guard = reach(scene, view => view.resolution?.parry?.tier === PARRY_TIER.GOOD);
      assert.equal(guard.resolution.parry.armed, true);
      press(scene, ' ');
      assert.equal(scene.battleView().state.last.parryTier, PARRY_TIER.GOOD);
      assert.equal(scene.battleView().state.last.received, 0);
    } finally { scene.exit(); }
  }
});

test('turning the layer on cannot steal a fireball that already left the Source deck', async () => {
  const run = await fixture(sourceII, { enabled: false });
  const { scene } = run;
  try {
    const fireball = reach(scene, view => !!view.fireball.active).fireball.active.plan;
    run.setEnabled(true);
    await nextTask();
    const strike = waitOnEnemy(scene);
    await nextTask();
    assert.equal(run.request(), undefined);
    assert.deepEqual(strike.fireball.active.plan, fireball);
    reach(scene, view => view.resolution?.parry?.tier === PARRY_TIER.GOOD);
    press(scene, ' ');
    assert.equal(scene.battleView().state.last.parried, true);
  } finally { scene.exit(); }
});

test('a lethal Source strike can be redirected without spending the scene’s existing recovery', async () => {
  const run = await fixture(sourceII, { composure: 1 });
  const { scene } = run;
  try {
    const committed = waitOnEnemy(scene);
    assert.equal(committed.state.last.sourceEnemyReaction.breached, true);
    assert.deepEqual(committed.state.sentBack, ['call-site']);
    await nextTask();
    assert.ok(run.request());
    run.emit('hit', run.request());
    const turned = scene.battleView();
    assert.equal(turned.state.last.parryTier, PARRY_TIER.GOOD);
    assert.equal(turned.state.composure, 1);
    assert.equal(turned.state.last.desktopBreach, null);
    assert.equal(turned.state.result, null);
    assert.deepEqual(turned.state.sentBack, []);
    await nextTask();
    assert.deepEqual(run.outcomes(), ['hit']);
    assert.equal(run.breaches.length, 1);
  } finally { scene.exit(); }
});

test('the actionable Source target can borrow focus from the passive shell to complete one parry', async () => {
  const run = await fixture(sourceIII);
  const { scene } = run;
  try {
    waitOnEnemy(scene);
    await nextTask();
    const live = scene.battleView();
    assert.equal(live.chapelDesktop.phase, 'live');
    run.setSourceFocus(false);
    scene.update(.2);
    assert.ok(scene.battleView().chapelDesktop.remaining < live.chapelDesktop.remaining);
    run.emit('hit', run.request());
    assert.equal(scene.battleView().state.last.received, 0);
    const elapsed = scene.battleView().resolution.elapsed;
    scene.update(.2);
    assert.equal(scene.battleView().resolution.elapsed, elapsed, 'the passive shell can hold the battle until main regains focus');
    run.setSourceFocus(true);
    scene.update(.2);
    assert.ok(scene.battleView().resolution.elapsed > elapsed);
  } finally { scene.exit(); }
});
