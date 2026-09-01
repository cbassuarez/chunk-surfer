import { CELL, EYE, F, MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { MOVE_MS } from '../config.js';
import { encodeH } from '../world/floorplan.js';
import {
  STAIR_ANOMALY_STAGE,
  STAIR_ANOMALY_STATUS,
  STAIR_ANOMALY_VARIANT,
  normalizeStairAnomalyEnvironment,
  normalizeStairAnomalyLedger,
  reduceStairAnomaly,
} from './stair-anomaly.js';

export const STAIR_ANOMALY_ENTRY = Object.freeze({ x: 0, y: 0, facing: 0 });
export const STAIR_ANOMALY_MODULE_CELLS = 100;
// One continuous, impossible flight at the ORDINARY walk cadence — you travel
// exactly as you do on a real stair, with no throttle — and no modules, no
// landings, no loop.
//
// HOW LONG IS LONG ENOUGH. This was 640 treads — 29 seconds of unbroken
// climbing, which is past the point where the stair stops making an argument
// and starts merely continuing. The effect is "this flight is longer than the
// building": it lands the moment the player passes the rise a real
// floor-to-floor stair would have taken, and everything after that is the same
// sentence said again.
//
// 400 treads is 18 seconds and still nearly thirty times a real fourteen-rise
// flight, which leaves each of the four beats about four and a half seconds —
// enough to read one and notice the next.
export const STAIR_ANOMALY_TOTAL_CELLS = 400;
// Per-tread time, used only to reason about pacing in tests; the live climb
// uses the normal movement clock, so the stair feels no different to walk than
// any other.
//
// DERIVED, NOT COPIED. This was the literal 90, described as "matching the
// ordinary move interval (config MOVE_MS)" — but MOVE_MS is `ms(90)`, and `ms`
// scales by 1/CELL_SCALE, so the real interval is 45. Every duration reasoned
// from this constant was therefore exactly double the truth, which is how a
// 29-second stair came to be discussed as a minute long.
export const STAIR_ANOMALY_STEP_INTERVAL_MS = MOVE_MS;

const PLAN_SIZE = 192;
const PLAN_SNAP = 16;
// encodeH stores the ordinary 32m height band in one byte. Snap the moving
// origin to that same quantum so a shared tread receives the identical decoded
// world height before and after a texture-window rebase.
const HEIGHT_ENCODING_STEP = 32 / 255;
// Steady tread rise per cell — a real stair's pitch, kept continuous over the
// whole flight, so the staircase just climbs, and climbs, without ever resetting
// to a landing. Over 320 treads that is ~70m of rise: texture bytes use a local
// height origin and the renderer restores that origin as a world-space offset,
// keeping the climb continuous without overflowing the ordinary height encoding.
const RISE_PER_CELL = 4.8 / 22;
const WIDTH_MIN = -3;
const WIDTH_MAX = 2;
// Atmosphere/checkpoint thresholds only — the FLOOR is one continuous ramp; these
// just pace the light stages and the resume checkpoints across the long climb.
const STAGE_DEPTHS = [0, 100, 200, 300, 400];

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

function stageForDepth(depth) {
  if (depth >= STAGE_DEPTHS[4]) return STAIR_ANOMALY_STAGE.COMPLETE;
  if (depth >= STAGE_DEPTHS[3]) return STAIR_ANOMALY_STAGE.RESOLUTION;
  if (depth >= STAGE_DEPTHS[2]) return STAIR_ANOMALY_STAGE.SHADOW;
  if (depth >= STAGE_DEPTHS[1]) return STAIR_ANOMALY_STAGE.REPETITION;
  return STAIR_ANOMALY_STAGE.COMMITMENT;
}

export function stairAnomalyFloorAt(y, environment) {
  const selected = normalizeStairAnomalyEnvironment(environment);
  const depth = clamp(-y, 0, STAIR_ANOMALY_TOTAL_CELLS);
  // One continuous, monotonic rise for the entire flight — no module reset, no
  // landing. The stair simply keeps climbing, impossibly far.
  const elevation = depth * RISE_PER_CELL;
  return selected.visualSlope === 'down' ? -elevation : elevation;
}

export function createStairAnomalyRuntime({
  environment,
  initialLedger,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  onState = () => {},
  onStage = () => {},
  onComplete = () => {},
} = {}) {
  const selected = normalizeStairAnomalyEnvironment(environment);
  // Plan bytes still need a local height origin to stay inside the ordinary
  // [-8, 24]m encoding range. renderPlanFor exposes that origin separately as
  // `heightOffset`; the renderer adds it back after decoding. The moving texture
  // window may therefore rebase its bytes without moving a single visible tread,
  // light, prop, or camera centimetre in world space.
  let ledger = normalizeStairAnomalyLedger(initialLedger, { missing: 'armed' });
  if (ledger.status === STAIR_ANOMALY_STATUS.ARMED) ledger = reduceStairAnomaly(ledger, { type: 'ENTER' });
  else if (ledger.status === STAIR_ANOMALY_STATUS.ACTIVE) ledger = reduceStairAnomaly(ledger, { type: 'RESUME' });
  let player = checkpointPosition();
  let furthestDepth = Math.max(player.y * -1, ledger.progress * STAIR_ANOMALY_TOTAL_CELLS);
  let completionSent = false;
  let planCache = null;
  let previousLightStage = ledger.stage;
  let lightStageStartedAt = now();

  function setLedger(next, options = {}) {
    const normalized = normalizeStairAnomalyLedger(next, { missing: 'armed' });
    if (normalized.stage !== ledger.stage) {
      previousLightStage = ledger.stage;
      lightStageStartedAt = now();
    }
    ledger = normalized;
    onState(ledger, options);
    return ledger;
  }

  function checkpointPosition() {
    const checkpoint = clamp(ledger.checkpoint, 0, 3);
    return { x: 0, y: -STAGE_DEPTHS[checkpoint], facing: 0 };
  }

  function cellAt(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y), depth = -cy;
    if (cx < WIDTH_MIN || cx > WIDTH_MAX || cy > 3 || depth > STAIR_ANOMALY_TOTAL_CELLS + 4) return null;
    const floor = stairAnomalyFloorAt(cy, selected);
    return {
      floor,
      ceil: floor + 3.4,
      flags: F.STAIR,
      zone: ZONE.stair,
      // The pocket repeats the real stair's masonry shell. Decorative oak,
      // wool, brass, and iron stay on prop meshes instead of tinting the
      // walls and exposed tread geometry.
      material: MATERIAL.serviceConcrete,
    };
  }

  const geometry = {
    id: 'stair-anomaly',
    cellAt,
    isSolid: (x, y) => !cellAt(x, y),
    canStep(fromX, fromY, toX, toY) {
      const target = cellAt(toX, toY);
      if (!target) return { ok: false, why: 'wall' };
      const toDepth = -toY;
      // You travel exactly as you do on any real stair — no throttle, no paced
      // one-tread-at-a-time cadence. It just happens to never end.
      // The only way is up. Behind you is a wall, not a wrap — it is one
      // continuous flight, so you never re-tread the same steps or loop back.
      const rearDepth = STAGE_DEPTHS[Math.min(4, ledger.checkpoint)];
      if (toDepth < rearDepth) return { ok: false, why: 'no-return' };
      return { ok: true, floor: target.floor };
    },
    floorAt: (x, y) => cellAt(x, y)?.floor ?? stairAnomalyFloorAt(y, selected),
    ceilAt: (x, y) => cellAt(x, y)?.ceil ?? stairAnomalyFloorAt(y, selected) + 3.4,
    // Follow the same physical interpolation path as authored stairs. Collision
    // remains tread-stepped; eye height follows the continuous pitch between
    // those treads instead of advancing on the logical cell clock.
    renderedFloorAt: (_x, _y, _physicalX, physicalZ) => stairAnomalyFloorAt(physicalZ, selected),
    zoneAt: () => ZONE.stair,
    materialAt: () => MATERIAL.serviceConcrete,
    worldAt: () => 'main_b3',
    // Always the west stair now; the spiral cannot carry this. See
    // decideStairAnomalyEnvironment.
    areaLabelAt: () => 'the west stair',
    logicalToPhysical: (x, y) => ({ x, z: y, y: stairAnomalyFloorAt(y, selected), layer: 'stair-anomaly', spaceId: 'stair-anomaly', renderGroup: 'stair-anomaly' }),
    renderPlanFor(x, y) {
      const originX = Math.floor((x - PLAN_SIZE / 2) / PLAN_SNAP) * PLAN_SNAP;
      const originY = Math.floor((y - PLAN_SIZE / 2) / PLAN_SNAP) * PLAN_SNAP;
      const key = `${selected.stairId}:${selected.visualSlope}:${originX}:${originY}`;
      if (planCache?.key === key) return planCache;
      const rgba = new Uint8Array(PLAN_SIZE * PLAN_SIZE * 4);
      const material = new Uint8Array(PLAN_SIZE * PLAN_SIZE);
      // Encode heights relative to this window's centre so the impossibly tall
      // rise never runs past the ordinary [-8, 24]m encoding — the camera is
      // shifted by the same reference, so it is an invisible translation.
      const rawRef = stairAnomalyFloorAt(originY + PLAN_SIZE / 2, selected);
      const ref = Math.round(rawRef / HEIGHT_ENCODING_STEP) * HEIGHT_ENCODING_STEP;
      for (let py = 0; py < PLAN_SIZE; py += 1) for (let px = 0; px < PLAN_SIZE; px += 1) {
        const cell = cellAt(originX + px + 0.5, originY + py + 0.5), index = py * PLAN_SIZE + px;
        if (!cell) { rgba[index * 4 + 2] = F.SOLID; continue; }
        rgba[index * 4] = encodeH(cell.floor - ref);
        rgba[index * 4 + 1] = encodeH(cell.ceil - ref);
        rgba[index * 4 + 2] = cell.flags;
        rgba[index * 4 + 3] = cell.zone;
        material[index] = cell.material;
      }
      planCache = { rgba, material, w: PLAN_SIZE, h: PLAN_SIZE, originX, originY, heightOffset: ref, group: 'stair-anomaly', key };
      return planCache;
    },
  };

  function setPlayerPosition(next) {
    player = { x: Number(next?.x) || 0, y: Number(next?.y) || 0, facing: Number(next?.facing) || 0 };
  }

  function onStep(_from, to) {
    setPlayerPosition(to);
    const depth = clamp(-player.y, 0, STAIR_ANOMALY_TOTAL_CELLS);
    furthestDepth = Math.max(furthestDepth, depth);
    const nextStage = stageForDepth(furthestDepth);
    if (nextStage === STAIR_ANOMALY_STAGE.COMPLETE) {
      if (!completionSent) {
        completionSent = true;
        setLedger(reduceStairAnomaly(ledger, { type: 'COMPLETE' }), { immediate: true });
        onComplete({ environment: selected, ledger });
      }
      return;
    }
    const stageChanged = nextStage > ledger.stage;
    setLedger(reduceStairAnomaly(ledger, {
      type: 'ADVANCE',
      progress: furthestDepth / STAIR_ANOMALY_TOTAL_CELLS,
      stage: nextStage,
      checkpoint: stageChanged,
    }), { immediate: stageChanged });
    if (stageChanged) onStage({ stage: nextStage, environment: selected, player: { ...player } });
  }

  function propInstances({ reducedDread = false } = {}) {
    const out = [];
    // The impossible stair repeats the same deliberately bare circulation
    // language as the real flights. Its practical-light rig remains invisible
    // geometry; decorative rails, doors, pendants, and fixtures would create
    // false collision cues in a space where the traversal itself is uncanny.
    if (!reducedDread && ledger.stage === STAIR_ANOMALY_STAGE.SHADOW) {
      const depth = clamp(-player.y + 14, STAGE_DEPTHS[2], STAIR_ANOMALY_TOTAL_CELLS - 4);
      out.push({
        id: 'stair-anomaly-shadow-only', mesh: 'stair_shadow_figure', x: 0,
        y: stairAnomalyFloorAt(-depth, selected), z: -depth * CELL,
        yaw: Math.PI, structural: true, shadowOnly: true, zone: ZONE.stair,
      });
    }
    return out;
  }

  function lightRig(time = 0, { reducedFlash = false } = {}) {
    const playerDepth = clamp(-player.y, 0, STAIR_ANOMALY_TOTAL_CELLS);
    const candidates = [];
    const intensityAt = (depth, stage) => {
      const behind = depth < playerDepth - 5;
      let intensity = stage === 0 ? (depth < 28 ? 1 : 0) : 1;
      if (stage >= 2 && behind) intensity = selected.variant === STAIR_ANOMALY_VARIANT.SURFACE ? .42 : .04;
      if (selected.variant === STAIR_ANOMALY_VARIANT.UNCERTAIN && ((depth / 10 + selected.seed) & 1)) intensity *= .48 + Math.sin(time * 1.7 + depth) * .12;
      return Math.max(0, intensity);
    };
    const fade = clamp(((Number(time) || 0) * 1000 - lightStageStartedAt) / 650, 0, 1);
    for (let depth = 6; depth < STAIR_ANOMALY_TOTAL_CELLS; depth += 10) {
      const distance = Math.abs(depth - playerDepth);
      if (distance > 42) continue;
      let intensity = intensityAt(depth, ledger.stage);
      if (reducedFlash) {
        const target = Math.max(.18, intensity * .78);
        intensity = previousLightStage === ledger.stage ? target : Math.max(.18, intensityAt(depth, previousLightStage) + (target - intensityAt(depth, previousLightStage)) * fade);
      }
      const cold = selected.variant === STAIR_ANOMALY_VARIANT.UNCERTAIN && ((depth / 10) & 1);
      candidates.push({
        id: `stair-practical-${depth}`, x: ((Math.floor(depth / 10) & 1) ? -1.18 : 1.18), y: stairAnomalyFloorAt(-depth, selected) + 2.22, z: -depth * CELL,
        color: cold ? [.58, .70, 1] : [1, .68, .38], intensity: Math.max(0, intensity), radius: 6.4,
        distance,
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const lights = candidates.slice(0, 8).map(({ distance: _distance, ...light }) => light);
    if (ledger.stage === STAIR_ANOMALY_STAGE.SHADOW && lights.length) {
      lights[Math.min(2, lights.length - 1)] = { ...lights[Math.min(2, lights.length - 1)], castsShadow: true, shadowYaw: 0 };
    }
    return lights;
  }

  return {
    environment: selected,
    geometry,
    state: () => ({ ...ledger }),
    checkpointPosition,
    setPlayerPosition,
    onStep,
    propInstances,
    lightRig,
    player: () => ({ ...player }),
  };
}
