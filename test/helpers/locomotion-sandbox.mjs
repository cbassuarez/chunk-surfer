// Loads main.js's locomotion block (place → gait → metres per second → cell
// interval) into a vm context with neutral stubs. Specs override only the
// world facts they are about: which frames are live, the run key, a factor.
import fs from 'node:fs';
import vm from 'node:vm';
import { CELL } from '../../src/data/floorplan/legend.js';
import { MOVE_MS, WORLD_BOUNDARY_FRICTION, VOID_TRUDGE } from '../../src/config.js';
import { CHUNK_SURF_PHASE } from '../../src/game/chunk-surf-state.js';
import * as LOCO from '../../src/game/locomotion.js';

export const mainSource = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');

export function section(start, end, source = mainSource) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`main.js section ${start} … ${end} not found`);
  return source.slice(from, to);
}

export const LOCOMOTION_BLOCK_START = '// ── Locomotion ──';
export const LOCOMOTION_BLOCK_END = '\nfunction currentTurnIntervalMs(';

export function locomotionSandbox(overrides = {}, { extra = '' } = {}) {
  let run = false;
  const context = {
    CELL, MOVE_MS, WORLD_BOUNDARY_FRICTION, VOID_TRUDGE, CHUNK_SURF_PHASE, ...LOCO,
    createExertionBreath: () => ({ update() {}, snapshot: () => ({}) }),
    actx: null, sfxGain: null, performance: { now: () => 1000 }, Math, Number, String, Object, Array,
    motionInput: { isHeld: code => run && (code === 'ShiftLeft' || code === 'ShiftRight') },
    PRES: { publicSnapshot: () => ({ active: false }) }, D: n => n * 2, px: 10, py: 10,
    storyMode: true, openingVehicleScene: null, openingOvertureScene: null, isIntroActive: () => false,
    doorRevealCutscene: false, depth: 0, horrorPhase: 'off', HORROR_SEQUENCE: { DOOR_SWARM: 'statue_corridor' }, sw2: { active: false },
    usingSourceSpace: () => false, usingStairAnomaly: () => false, usingSpecialSpace: () => false, usingPlan: () => true,
    chunkSurfRuntime: {}, shakeMode: () => 'full', escape: null,
    natatoriumPlayerInWater: () => false, brendanLevelAt: () => null,
    FP: { zoneAt: () => 1 }, isOutdoorZone: () => false,
    outskirtsStepIndex: 0, outskirtsLosing: () => 0, PLANT: { heavyWrenchDragging: () => false },
    worldBoundaryFriction: 0, dockHauntingFrame: null, dockHauntingMoveScale: p => 1 + 3 * p * p,
    curPlayerCtx: null, voidFatigue: 0,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), SCALED_MOVE_MIN: n => Math.max(1, Math.round(n / 2)),
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(section(LOCOMOTION_BLOCK_START, LOCOMOTION_BLOCK_END) + extra
    + '\nglobalThis.interval=currentMoveIntervalMs;globalThis.locomotion=currentLocomotion;', context);
  context.setRun = value => { run = !!value; };
  return context;
}
