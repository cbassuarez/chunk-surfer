// THE DREAM HAS HIS TORCH IN IT.
//
// The level check ends with him asleep on his feet, and the joke he made to pass
// the six seconds comes for him. It used to arrive as a cut straight into the
// drill. Now it arrives as one figure at the far end of his beam, walking up it.
//
// The light decides, and nothing else does. If his torch is on when it reaches
// him, it has him, and the drill opens with it as the opponent. If he has put
// the light out, it walks into him and out the back of him and keeps going.
// Nothing is said about which is right. The fight is the lesson for a player
// who left the light on, and the dark is the secret for one who already knew.
//
// It always arrives. It speeds up as it comes and there is a time limit, so
// walking away from it only changes the angle it comes in at: a dream does not
// let you outrun it, and the beat cannot strand the opening.
//
// This module is the walk and the decision, in logical cells and milliseconds,
// with the world passed in as predicates. main.js owns the torch, the render
// instance and what each outcome opens.

import { CELL } from '../data/floorplan/legend.js';

export const DREAM_FIGURE = Object.freeze({
  // Where it can start, nearest-to-the-beam first. Metres along the look and
  // radians off it.
  spawnDistancesM: Object.freeze([7, 6, 8, 5, 9, 4.5]),
  spawnBearings: Object.freeze([0, .2, -.2, .4, -.4, .6, -.6]),
  // When nothing in front of him is open floor, it comes out of the wall this
  // far ahead instead.
  throughWallM: 6,
  startSpeedMps: .6,
  accelMps2: .2,
  maxSpeedMps: 2.6,
  // The arm comes up for the last of the walk.
  reachM: 2.4,
  touchM: .45,
  // How far it carries on behind him when it finds him dark.
  passM: 2.2,
  passSpeedMps: 1.6,
  limitMs: 14000,
});

export const DREAM_FIGURE_PHASE = Object.freeze({
  WALKING: 'walking',
  TOUCHED: 'touched',   // light on at the touch: the fight
  PASSING: 'passing',   // light off at the touch: through him and away
  SPARED: 'spared',
});

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// Logical cells: x east, y south, and a look yaw whose forward is
// (sin yaw, -cos yaw), the same convention the recording hallucinations use.
export function forwardFromYaw(yaw) {
  return { x: Math.sin(yaw), y: -Math.cos(yaw) };
}

// The render yaw that faces a body along `heading`.
export function yawFromHeading(heading) {
  return Math.atan2(finite(heading?.x), -finite(heading?.y, -1));
}

// `open(x,y)` — a body could stand on that cell. `sight(x,y)` — the player can
// see it from where he is. `floor(x,y)` — the cell is on his floor at all.
export function pickDreamFigureSpawn({ origin, yaw = 0, open = () => true, sight = () => true, floor = () => true } = {}) {
  if (!origin) return null;
  const ox = finite(origin.x), oy = finite(origin.y);
  for (const distance of DREAM_FIGURE.spawnDistancesM) {
    for (const bearing of DREAM_FIGURE.spawnBearings) {
      const ahead = forwardFromYaw(yaw + bearing);
      const x = ox + ahead.x * distance / CELL, y = oy + ahead.y * distance / CELL;
      if (open(x, y) && sight(x, y) && floor(x, y)) return { x, y, throughWall: false };
    }
  }
  const ahead = forwardFromYaw(yaw);
  const x = ox + ahead.x * DREAM_FIGURE.throughWallM / CELL, y = oy + ahead.y * DREAM_FIGURE.throughWallM / CELL;
  return floor(x, y) ? { x, y, throughWall: true } : null;
}

export function freshDreamFigure({ at, player } = {}) {
  const x = finite(at?.x), y = finite(at?.y);
  const dx = finite(player?.x, x) - x, dy = finite(player?.y, y + 1) - y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    phase: DREAM_FIGURE_PHASE.WALKING,
    x, y,
    heading: { x: dx / length, y: dy / length },
    speedMps: DREAM_FIGURE.startSpeedMps,
    elapsedMs: 0,
    reaching: false,
    lightAtTouch: null,
    passedM: 0,
  };
}

export function dreamFigureDone(state) {
  return state?.phase === DREAM_FIGURE_PHASE.TOUCHED || state?.phase === DREAM_FIGURE_PHASE.SPARED;
}

// One step. Paused (a menu, the pause screen) means nothing moves and nothing is
// decided; the light is read only at the moment of contact.
export function advanceDreamFigure(state, { player, lightOn = false, dtMs = 0, paused = false } = {}) {
  if (!state || paused || dreamFigureDone(state)) return state;
  const stepMs = clamp(finite(dtMs), 0, 100), dt = stepMs / 1000;
  if (state.phase === DREAM_FIGURE_PHASE.PASSING) {
    const moveM = DREAM_FIGURE.passSpeedMps * dt;
    const passedM = state.passedM + moveM;
    return {
      ...state,
      x: state.x + state.heading.x * moveM / CELL,
      y: state.y + state.heading.y * moveM / CELL,
      passedM,
      phase: passedM >= DREAM_FIGURE.passM ? DREAM_FIGURE_PHASE.SPARED : DREAM_FIGURE_PHASE.PASSING,
    };
  }
  const elapsedMs = state.elapsedMs + stepMs;
  const speedMps = Math.min(DREAM_FIGURE.maxSpeedMps, state.speedMps + DREAM_FIGURE.accelMps2 * dt);
  const px = finite(player?.x, state.x), py = finite(player?.y, state.y);
  const dx = px - state.x, dy = py - state.y;
  const cells = Math.hypot(dx, dy), distanceM = cells * CELL;
  const heading = cells > 1e-6 ? { x: dx / cells, y: dy / cells } : state.heading;
  const moveM = speedMps * dt;
  if (distanceM - moveM <= DREAM_FIGURE.touchM || elapsedMs >= DREAM_FIGURE.limitMs) {
    const lit = !!lightOn;
    return {
      ...state,
      x: px, y: py, heading, speedMps, elapsedMs,
      reaching: true,
      lightAtTouch: lit,
      phase: lit ? DREAM_FIGURE_PHASE.TOUCHED : DREAM_FIGURE_PHASE.PASSING,
    };
  }
  return {
    ...state,
    x: state.x + heading.x * moveM / CELL,
    y: state.y + heading.y * moveM / CELL,
    heading, speedMps, elapsedMs,
    reaching: distanceM - moveM <= DREAM_FIGURE.reachM,
  };
}

// What the renderer draws. A plain prop body, never an apparition state, so
// the ordinary prop lighting decides what is seen: his torch picks it out, and
// with the torch off it is as dark as anything else in the get-in.
export function dreamFigurePose(state) {
  const visible = state?.phase === DREAM_FIGURE_PHASE.WALKING || state?.phase === DREAM_FIGURE_PHASE.PASSING;
  if (!visible) return { visible: false };
  return {
    visible: true,
    x: state.x,
    y: state.y,
    yaw: yawFromHeading(state.heading),
    poseId: state.reaching && state.phase === DREAM_FIGURE_PHASE.WALKING ? 'arm_out' : 'neutral',
  };
}
