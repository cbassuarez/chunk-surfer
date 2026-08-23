import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import {
  PARRY_BUFFER_SECONDS,
  PARRY_CONTACT_GRACE_SECONDS,
  PARRY_CONTACT_HOLD_SECONDS,
  PARRY_IMPACT_SECONDS,
  PARRY_REACTION_SECONDS,
  PARRY_STANDARD_WINDOW_SECONDS,
  isParryableEnemyAction,
  parryInputDecision,
  parryOpportunitySnapshot,
} from '../src/game/combat-parry.js';
import { combatHudLayout } from '../src/render/combat-hud-layout.js';
import {
  combatGaugeGeometry,
  combatGaugeSegments,
  combatGaugeState,
} from '../src/render/combat-view.js';

const close = (actual, expected, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is within ${epsilon} of ${expected}`);

const inside = (outer, inner) => {
  assert.ok(inner.x >= outer.x - 1e-9);
  assert.ok(inner.y >= outer.y - 1e-9);
  assert.ok(inner.x + inner.w <= outer.x + outer.w + 1e-9);
  assert.ok(inner.y + inner.h <= outer.y + outer.h + 1e-9);
};

const separate = (a, b) => {
  const overlap = a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(overlap, false, `${JSON.stringify(a)} does not overlap ${JSON.stringify(b)}`);
};

test('the calibrated health display never grows beyond sixteen physical segments', () => {
  assert.equal(combatGaugeSegments(0, 40), 0);
  assert.equal(combatGaugeSegments(1, 40), 1);
  assert.equal(combatGaugeSegments(20, 40), 8);
  assert.equal(combatGaugeSegments(40, 40), 16);
  assert.equal(combatGaugeSegments(75, 75), 16);
  assert.equal(combatGaugeSegments(150, 75), 16);

  for (const width of [18, 32, 38, 49, 80]) {
    const geometry = combatGaugeGeometry({ x: 11, w: width });
    assert.equal(geometry.cells.length, 16);
    close(geometry.end, 11 + width);
    assert.ok(geometry.cells.every((cell) => cell.x >= 11 && cell.x + cell.w <= 11 + width + 1e-9));
  }
});

test('gauge feedback distinguishes bucket crossings from exact-value changes', () => {
  const crossing = combatGaugeState({ value: 35, max: 40, ghostFrom: 40 });
  assert.ok(crossing.lost > 0);
  assert.equal(crossing.sameBucketChange, false);

  const sameBucketDamage = combatGaugeState({ value: 39, max: 40, ghostFrom: 40 });
  assert.equal(sameBucketDamage.lost, 0);
  assert.equal(sameBucketDamage.sameBucketChange, true);
  assert.ok(sameBucketDamage.delta < 0);

  const sameBucketHeal = combatGaugeState({ value: 40, max: 75, ghostFrom: 39 });
  assert.equal(sameBucketHeal.sameBucketChange, true);
  assert.ok(sameBucketHeal.delta > 0);
});

test('standard and compact battle regions stay inside the faceplate without collisions', () => {
  const cases = [
    { panel: { x: 10, y: 3, w: 118, h: 42 }, compact: false },
    { panel: { x: 4, y: 2, w: 76, h: 24 }, compact: true },
  ];
  for (const sample of cases) {
    for (const mode of ['command', 'dialogue', 'reaction']) {
      const layout = combatHudLayout({ panel: sample.panel, mode, sourceActive: true });
      assert.equal(layout.compact, sample.compact);
      for (const region of [layout.header, layout.stage, layout.deck, layout.enemyGauge, layout.playerGauge, layout.resources]) {
        inside(sample.panel, region);
      }
      separate(layout.enemyGauge, layout.returnMonitor);
      if (layout.turn.w) {
        separate(layout.enemyGauge, layout.turn);
        separate(layout.returnMonitor, layout.turn);
      }
      separate(layout.playerGauge, layout.resources);
      const cells = Object.values(layout.resourceCells);
      cells.forEach((cell) => inside(layout.resources, cell));
      for (let index = 0; index < cells.length; index += 1) {
        for (let other = index + 1; other < cells.length; other += 1) separate(cells[index], cells[other]);
      }
      if (mode === 'command') {
        inside(sample.panel, layout.channels);
        inside(sample.panel, layout.detail);
        if (layout.compact) {
          inside(sample.panel, layout.carousel);
          separate(layout.carousel, layout.detail);
        } else {
          inside(sample.panel, layout.tools);
          inside(sample.panel, layout.actions);
          separate(layout.channels, layout.tools);
          separate(layout.tools, layout.actions);
          separate(layout.actions, layout.detail);
        }
      } else {
        inside(sample.panel, mode === 'reaction' ? layout.reaction : layout.dialogue);
      }
    }
  }
});

test('parry opportunities exist only for struck blows', () => {
  for (const kind of ['broadcast', 'overload', 'loop']) assert.equal(isParryableEnemyAction(kind), true);
  for (const kind of ['conceal', 'silence', null]) assert.equal(isParryableEnemyAction(kind), false);
  assert.equal(parryOpportunitySnapshot({ side: 'player', actionKind: 'broadcast' }), null);
  assert.equal(parryOpportunitySnapshot({ side: 'enemy', actionKind: 'silence' }), null);
});

test('the reaction phrase and difficulty windows stay locked to the 168 BPM grid', () => {
  close(PARRY_REACTION_SECONDS, 4 * 60 / 168);
  close(PARRY_IMPACT_SECONDS, 2.5 * 60 / 168);
  close(PARRY_STANDARD_WINDOW_SECONDS, 2 * 60 / 168);
  close(PARRY_BUFFER_SECONDS, .25 * 60 / 168);
  close(PARRY_CONTACT_HOLD_SECONDS, .25 * 60 / 168);
  close(PARRY_CONTACT_GRACE_SECONDS, .125 * 60 / 168);

  const windowFor = (id) => parryOpportunitySnapshot({
    actionKind: 'broadcast',
    elapsed: 0,
    windowScale: COMBAT_RULES[id].parryWindowScale,
  }).widthSeconds;
  close(windowFor('guided'), PARRY_IMPACT_SECONDS);
  close(windowFor('standard'), 2 * 60 / 168);
  close(windowFor('severe'), 2 * 60 / 168 * .85);
  close(windowFor('dead-air'), 2 * 60 / 168 * .7);
});

test('parry snapshot covers early buffer, grading, contact grace, and resolved state', () => {
  const base = { actionKind: 'overload', windowScale: 1 };
  const start = parryOpportunitySnapshot({ ...base, elapsed: 0 });
  assert.equal(start.phase, 'approach');
  assert.equal(start.armed, false);
  assert.equal(start.bufferable, false);

  const buffer = parryOpportunitySnapshot({ ...base, elapsed: start.openSeconds - PARRY_BUFFER_SECONDS / 2 });
  assert.equal(buffer.bufferable, true);
  const armedBuffer = parryOpportunitySnapshot({ ...base, elapsed: buffer.atSeconds, buffered: true });
  assert.equal(armedBuffer.phase, 'buffered');

  const late = parryOpportunitySnapshot({ ...base, elapsed: start.openSeconds + .01 });
  assert.equal(late.armed, true);
  assert.equal(late.tier, 'late');
  const good = parryOpportunitySnapshot({ ...base, elapsed: start.openSeconds + start.widthSeconds * .55 });
  assert.equal(good.tier, 'good');
  const perfect = parryOpportunitySnapshot({ ...base, elapsed: start.openSeconds + start.widthSeconds * .85 });
  assert.equal(perfect.tier, 'perfect');

  const grace = parryOpportunitySnapshot({ ...base, elapsed: PARRY_IMPACT_SECONDS + PARRY_CONTACT_GRACE_SECONDS * .5 });
  assert.equal(grace.contact, true);
  assert.equal(grace.armed, true);
  assert.equal(grace.tier, 'perfect');
  const lateContact = parryOpportunitySnapshot({ ...base, elapsed: PARRY_IMPACT_SECONDS + PARRY_CONTACT_GRACE_SECONDS * 1.5 });
  assert.equal(lateContact.contact, true);
  assert.equal(lateContact.armed, false);

  const resolved = parryOpportunitySnapshot({ ...base, elapsed: PARRY_IMPACT_SECONDS + PARRY_CONTACT_HOLD_SECONDS, impactFired: true });
  assert.equal(resolved.phase, 'resolved');
  assert.equal(resolved.armed, false);
});

test('parry input decisions buffer forgiving presses and reject held duplicates', () => {
  const start = parryOpportunitySnapshot({ actionKind: 'loop', windowScale: 1, elapsed: 0 });
  const wait = parryOpportunitySnapshot({ actionKind: 'loop', windowScale: 1, elapsed: .01 });
  const buffer = parryOpportunitySnapshot({ actionKind: 'loop', windowScale: 1, elapsed: start.openSeconds - PARRY_BUFFER_SECONDS / 2 });
  const open = parryOpportunitySnapshot({ actionKind: 'loop', windowScale: 1, elapsed: start.openSeconds + .02 });
  const contactMiss = parryOpportunitySnapshot({ actionKind: 'loop', windowScale: 1, elapsed: PARRY_IMPACT_SECONDS + PARRY_CONTACT_GRACE_SECONDS * 1.5 });
  assert.equal(parryInputDecision(wait), 'wait');
  assert.equal(parryInputDecision(buffer), 'buffer');
  assert.equal(parryInputDecision(open), 'parry');
  assert.equal(parryInputDecision(contactMiss), 'miss');
  assert.equal(parryInputDecision(open, { repeat: true }), 'ignore');
  assert.equal(parryInputDecision(open, { held: true }), 'ignore');
  assert.equal(parryInputDecision({ ...open, spent: true }), 'ignore');
  assert.equal(parryInputDecision({ ...buffer, buffered: true }), 'ignore');
});
