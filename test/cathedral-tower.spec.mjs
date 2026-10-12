// ST BRENDAN'S TOWER: the chapel's eight bells in two tiers, the one way down,
// what the fight breaks, and what the belfry tells the crossing.
import assert from 'node:assert/strict';
import { ELLERY_BELLS } from '../src/data/bell-tower.js';
import { createTwoTierBellFrameLayout, TWO_TIER_PITCH } from '../src/data/bell-tower-layout.js';
import {
  CATHEDRAL_DESCENT_BLOCKERS, CATHEDRAL_DESCENT_ROUTE, CATHEDRAL_STAGING, CHURCH, CHURCH_BELFRY, CHURCH_HEIGHTS, CHURCH_LEVELS,
  churchCrossingAt, churchRoomAt,
} from '../src/data/st-brendans.js';
import {
  CATHEDRAL_ALARM_CEILING, CATHEDRAL_DAMAGE_MARKS, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE,
  normalizeChunkSurfState, reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { cathedralBellCombatBattle, cathedralBellCombatDefinition } from '../src/data/combat-definitions.js';
import { createCombatState } from '../src/game/combat-state.js';
import { HORIZON_EXIT } from '../src/game/chunk-surf-state.js';

// ── The ring fits the belfry ───────────────────────────────────────────────
{
  const { center, interior, lowerFloorY, upperPivotY } = CHURCH_BELFRY;
  const ring = createTwoTierBellFrameLayout(ELLERY_BELLS, { centerX: center.x, centerZ: center.y, lowerFloorY, upperPivotY });
  assert.equal(ring.length, 8, 'the belfry does not hang the full ring');
  assert.deepEqual(ring.filter((bell) => bell.tier === 'upper').map((bell) => bell.id), [1, 2, 3, 4], 'the light bells are not on the upper frame');
  assert.deepEqual(ring.filter((bell) => bell.tier === 'lower').map((bell) => bell.id), [5, 6, 7, 8]);
  const ceiling = CHURCH_LEVELS.belfry.ceil;
  for (const bell of ring) {
    const body = 0.8 * bell.visualScale; // the waist of the largest casting, tower_bell_08 bounds
    assert.ok(bell.pivot.x - bell.sweepRadius >= interior.x0 && bell.pivot.x + bell.sweepRadius <= interior.x1, `bell ${bell.id} swings into the tower wall`);
    assert.ok(bell.pivot.z - body >= interior.y0 && bell.pivot.z + body <= interior.y1, `bell ${bell.id} hangs in the tower wall`);
    assert.ok(bell.pivot.y + bell.sweepRadius <= ceiling - 0.15, `bell ${bell.id} swings through the ceiling`);
    assert.ok(bell.pivot.y - bell.sweepRadius >= lowerFloorY + 0.05, `bell ${bell.id} swings through the deck`);
  }
  for (let i = 0; i < ring.length; i += 1) for (let j = i + 1; j < ring.length; j += 1) {
    const a = ring[i], b = ring[j];
    if (a.tier !== b.tier) {
      // Stacked tiers never share air: the upper sweep clears the lower's.
      const [low, high] = a.tier === 'lower' ? [a, b] : [b, a];
      if (Math.abs(low.pivot.x - high.pivot.x) < 1e-9 && Math.abs(low.pivot.z - high.pivot.z) < 1e-9) {
        assert.ok(high.pivot.y - high.sweepRadius > low.pivot.y + low.sweepRadius, `bells ${low.id} and ${high.id} meet between tiers`);
      }
      continue;
    }
    if (Math.abs(a.pivot.z - b.pivot.z) < 1e-9) {
      assert.ok(Math.abs(a.pivot.x - b.pivot.x) > a.sweepRadius + b.sweepRadius, `bells ${a.id} and ${b.id} strike each other`);
    }
  }
  assert.ok(TWO_TIER_PITCH.x > 2 * Math.max(...ring.map((bell) => bell.sweepRadius)), 'the pitch lets a row collide');
  assert.ok(CHURCH_HEIGHTS.belfry >= ceiling && CHURCH_HEIGHTS.belfry < CHURCH_HEIGHTS.spire, 'the tower is not tall enough for its ring, or taller than its spire');
  const h = CHURCH_BELFRY.hatch;
  assert.ok(churchCrossingAt(Math.floor(h.x0), Math.floor(h.y0)) && churchCrossingAt(Math.floor(h.x1), Math.floor(h.y1)), 'the trap does not look down on the crossing');
}

// ── The way down is authored, and ends under the lantern ─────────────────
{
  assert.equal(CATHEDRAL_DESCENT_ROUTE.at(-1).id, 'crossing');
  assert.ok(churchCrossingAt(CATHEDRAL_DESCENT_ROUTE.at(-1).x, CATHEDRAL_DESCENT_ROUTE.at(-1).y));
  assert.deepEqual([...new Set(CATHEDRAL_DESCENT_ROUTE.map((point) => point.level))], ['belfry', 'loft', 'ground'], 'the route does not go down one level at a time');
  assert.ok(CATHEDRAL_DESCENT_BLOCKERS.some((blocker) => blocker.level === 'belfry' && blocker.x === 10), 'the short way down from the belfry is open');
  assert.ok(CATHEDRAL_DESCENT_BLOCKERS.some((blocker) => blocker.level === 'loft' && blocker.x === 22), 'the south-lower turret is open');
  assert.equal(churchRoomAt(CATHEDRAL_STAGING.fallenBell.x, CATHEDRAL_STAGING.fallenBell.y), 'crossing', 'the falling bell does not land in the crossing');
  for (const weight of CATHEDRAL_STAGING.weights) assert.equal(churchRoomAt(weight.x, weight.y), 'nave', 'a clock weight falls outside the nave');
  assert.ok(Math.abs(CHURCH.rooms.find((room) => room.id === 'crossing').x0 - 12) < 1e-9);
}

// ── What the church remembers ──────────────────────────────────────────────
const cathedralState = (stage) => {
  let state = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL, { seed: 4417, hasRig: true, marbleEyes: 'returned' }).state;
  for (const event of [
    { type: 'SOURCE_NORMAL_EXIT' }, { type: 'HORIZON_BUST_RECOGNIZED', eligible: true },
    { type: 'HORIZON_BUST_DECIDED', decision: 'accepted' }, { type: 'HORIZON_EXIT_CHOSEN', exit: HORIZON_EXIT.TOWER },
    { type: 'CATHEDRAL_ENTERED' },
  ]) state = reduceChunkSurf(state, event);
  if (stage === 'fight') state = reduceChunkSurf(state, { type: 'CATHEDRAL_FIGHT_STARTED' });
  return state;
};
{
  let state = cathedralState('belfry');
  assert.equal(state.finale.route, SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(state.finale.stage, SOURCE_FINALE_STAGE.CATHEDRAL);
  assert.deepEqual(state.finale.cathedral, { alarm: 0, damage: [], lessons: [], fight: null, extraction: null });
  state = reduceChunkSurf(state, { type: 'CATHEDRAL_BELL_RUNG' });
  state = reduceChunkSurf(state, { type: 'CATHEDRAL_BELL_RUNG' });
  assert.equal(state.finale.cathedral.alarm, 2);
  assert.deepEqual(reduceChunkSurf(state, { type: 'CATHEDRAL_STAGED', mark: 'bell-fallen' }).finale.cathedral.damage, [], 'the fight broke the church before it started');
  for (let i = 0; i < 20; i += 1) state = reduceChunkSurf(state, { type: 'CATHEDRAL_BELL_RUNG' });
  assert.equal(state.finale.cathedral.alarm, CATHEDRAL_ALARM_CEILING);

  let fight = reduceChunkSurf(state, { type: 'CATHEDRAL_FIGHT_STARTED' });
  assert.equal(reduceChunkSurf(fight, { type: 'CATHEDRAL_BELL_RUNG' }).finale.cathedral.alarm, CATHEDRAL_ALARM_CEILING, 'the belfry counts rings during the fight');
  for (const mark of ['lantern-out', 'bell-fallen', 'bell-fallen', 'nonsense']) fight = reduceChunkSurf(fight, { type: 'CATHEDRAL_STAGED', mark });
  assert.deepEqual(fight.finale.cathedral.damage, ['bell-fallen', 'lantern-out'], 'damage is not kept once, in the church\'s order');
  const lost = reduceChunkSurf(fight, { type: 'CATHEDRAL_FIGHT_LOST' });
  assert.equal(lost.finale.stage, SOURCE_FINALE_STAGE.CATHEDRAL);
  assert.deepEqual(lost.finale.cathedral.damage, ['bell-fallen', 'lantern-out'], 'a retry is fought in a mended church');
  const saved = normalizeChunkSurfState(JSON.parse(JSON.stringify(lost)));
  assert.deepEqual(saved.finale.cathedral, lost.finale.cathedral, 'the church forgets on reload');
  assert.deepEqual(normalizeChunkSurfState({ ...lost, finale: { ...lost.finale, cathedral: undefined } }).finale.cathedral, { alarm: 0, damage: [], lessons: [], fight: null, extraction: null }, 'old saves have no church memory');
  assert.deepEqual([...CATHEDRAL_DAMAGE_MARKS], ['bells-swinging', 'frame-shaken', 'bell-fallen', 'pulpitum-split', 'lantern-out']);
}

// ── What the belfry tells the crossing ────────────────────────────────────
{
  const quiet = cathedralBellCombatDefinition({ phase: 1, alarm: 0 });
  const loud = cathedralBellCombatDefinition({ phase: 1, alarm: 3 });
  const second = cathedralBellCombatDefinition({ phase: 2, alarm: 0 });
  assert.equal(quiet.openingCharge, 2, 'coming down unheard is worth nothing');
  assert.equal(loud.openingCharge, undefined);
  assert.equal(second.openingCharge, undefined, 'the tell carries into the second phase');
  assert.equal(createCombatState(quiet).charge, 2);
  assert.equal(createCombatState(loud).charge, 1);
  assert.deepEqual(quiet.movements.map((m) => m.coherence), loud.movements.map((m) => m.coherence), 'the tell changed the fight itself');
  const text = (alarm) => cathedralBellCombatBattle({ phase: 1, alarm }).intro.map((line) => line.text).join(' ');
  assert.match(text(3), /already swinging/);
  assert.match(text(0), /before anything in the tower knows/);
  assert.doesNotMatch(text(1), /six bells/i, 'the fight still counts six bells in an eight-bell tower');
}

console.log('cathedral tower specs passed');
