// Standing water, wherever it stands.
//
// There used to be exactly one body of water in this game and the code said so
// everywhere: a single `uWaterBounds` uniform, bounds found by scanning the plan
// for one hard-coded zone-and-material pair, and an activation rule that asked
// which endings you had seen. That was honest while the natatorium was the only
// wet room in the building. It stopped being honest the moment a fountain went
// into the park.
//
// So water is a list now. Each body declares where to find itself in the plan,
// how deep it stands, how far you can see into it, and what decides whether it
// is there at all — because those answers are genuinely different for a drained
// swimming bath and for a municipal basin with a night's rain in it. The
// natatorium is the first entry rather than the only one, and nothing about how
// it looks or when it drains has changed.
//
// Pure: it reads a compiled plan and a run record and returns data.

import { MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { NATATORIUM_WATER_STATES } from './natatorium-water.js';

// A body is found by scanning for its zone-and-material pair, which is why the
// fountain basin glyph is authored `wetTile` in `dock` — the pair is the
// address. Two bodies may share a material as long as their zones differ.
export const WATER_BODIES = Object.freeze([
  Object.freeze({
    id: 'natatorium',
    zone: ZONE.natatorium,
    material: MATERIAL.wetTile,
    // Twelve centimetres below the coping. The two-metre basin is full enough
    // to take the player's eye below the surface at the bottom without putting
    // a sheet of water across the surrounding deck.
    levelM: -0.12,
    murk: 0.86,
    // Gated on the night's history, not on where you are standing. See
    // decideNatatoriumWaterEnvironment.
    active: (run) => run?.environment?.natatoriumWater === NATATORIUM_WATER_STATES.MURKY,
    blocks: false,
    ripples: true,
  }),
  // WHAT IS LEFT IN A DRAINED BATH.
  //
  // The deep end falls to the main drain (NATATORIUM_SUMP in conservatory.js)
  // and the ceiling over it has come down, so the bath is never quite empty:
  // rainwater from the open courts above stands over the sump. Found as the
  // basin cells whose floor lies below this level, so it is exactly the water
  // the floor would keep. Clear: you see the tiles and what fell in.
  Object.freeze({
    id: 'natatorium-rainwater',
    zone: ZONE.natatorium,
    material: MATERIAL.wetTile,
    levelM: -2.12,
    belowLevel: true,
    murk: 0.22,
    active: (run) => run?.environment?.natatoriumWater !== NATATORIUM_WATER_STATES.MURKY,
    // Drips from the broken ceiling (NATATORIUM_CEILING_BREAK), which hangs
    // over the north edge of this water. Basin-normalised points, each with its
    // own period so the surface never settles into one rhythm.
    drips: Object.freeze([
      Object.freeze({ u: 0.30, v: 0.14, periodMs: 2300, phaseMs: 0 }),
      Object.freeze({ u: 0.55, v: 0.20, periodMs: 3700, phaseMs: 900 }),
      Object.freeze({ u: 0.70, v: 0.12, periodMs: 1700, phaseMs: 400 }),
      Object.freeze({ u: 0.42, v: 0.24, periodMs: 5300, phaseMs: 2100 }),
    ]),
    blocks: false,
    ripples: true,
  }),
  Object.freeze({
    id: 'park-fountain',
    zone: ZONE.dock,
    material: MATERIAL.wetTile,
    // Ankle deep, and standing because the fountain is STILL RUNNING. The
    // corporation that put it up paid for a supply that was never on the
    // building's meter, so cutting Ellery's power did not cut this.
    levelM: 0.055,
    // Clear, but not as clear as still water: the whole point of this one is
    // that there is something in it, and the whole point of the tier above is
    // that the surface is moving. Held low deliberately — Part of what the eyes
    // in here are FOR is that you can see them.
    murk: 0.30,
    // Always. Nobody has drained a municipal fountain since the building closed.
    active: () => true,
    // Out in the weather: the rain dimples it.
    outdoor: true,
    // WHERE THE WATER LANDS.
    //
    // Four falls off the lower bowl's mask spouts, on the cardinals, at a radius
    // matching LOW_R in the mesh (build-props.mjs, park_fountain). These are
    // permanent ripple sources: unlike the bath's, they do not depend on the
    // player being near or on the run's history, because a working fountain
    // disturbs its own surface whether or not anybody is watching it.
    //
    // Radius is in basin-normalised UV, like every other ripple source.
    flow: Object.freeze({
      falls: 4,
      // Where the sheets actually land, over the basin half-width (3.5m): the
      // mask spouts throw clear of the lip, so the impact ring sits at
      // LOW_R + 0.12 = 1.70m rather than under the bowl.
      radius: 0.49,
      // Heavier than it was. The falls are real sheets now (build-props.mjs,
      // park_fountain) and a surface that barely moves under them reads as a
      // photograph of a fountain — this is the only water in the game that is
      // being fed rather than left.
      strength: 0.052,
      // The jet is off-centre from any one fall, so the middle never settles.
      centreStrength: 0.030,
    }),
    // You step down into it — 0.30m against canStep's 0.45m limit — because the
    // thing in the water has to be reachable without inventing a way to lean.
    blocks: false,
    ripples: true,
  }),
]);

// Scan the compiled plan once for a body's extent. This is the old
// computeNatatoriumBasinBounds with its two constants lifted into arguments.
// THE SOURCES A BODY MAKES ON ITS OWN.
//
// Everything in makeNatatoriumRippleSources is conditional — on the run, on the
// player's distance, on the audio. That is right for a drained bath, which is
// only ever disturbed by something happening to it. It is wrong for a fountain,
// which is disturbed by itself. These sources exist whenever the body does.
// A drip is an impulse, not a pressure: it is a source only for the frame or
// two after it lands, then the simulation carries the ring outward.
const DRIP_PULSE_MS = 70;
export function waterDripSources(body, { now = 0, reduceMotion = false } = {}) {
  if (!Array.isArray(body?.drips)) return [];
  const scale = reduceMotion ? 0.22 : 1;
  const t = Number(now) || 0;
  return body.drips.flatMap((drip) => {
    const since = (t + drip.phaseMs) % drip.periodMs;
    return since < DRIP_PULSE_MS
      ? [{ kind: 'drip', u: drip.u, v: drip.v, strength: -0.09 * scale, radius: 0.035 }]
      : [];
  });
}

// Wading. A body you are standing in is disturbed where you move through it,
// in proportion to how far you moved since the last frame.
export function waterWakeSource(body, player, previous, { reduceMotion = false } = {}) {
  const b = body?.bounds;
  if (!b || !player || !previous || !pointInBounds(player.x, player.y, b)) return null;
  const moved = Math.hypot(player.x - previous.x, player.y - previous.y);
  if (!(moved > 0.002)) return null;
  return {
    kind: 'wake',
    u: (player.x - b.minX) / Math.max(1e-3, b.maxX - b.minX),
    v: (player.y - b.minY) / Math.max(1e-3, b.maxY - b.minY),
    strength: Math.min(0.06, moved * 0.25) * (reduceMotion ? 0.22 : 1),
    radius: 0.06,
  };
}

export function waterFlowSources(body, { reduceMotion = false, now = 0 } = {}) {
  const drips = waterDripSources(body, { now, reduceMotion });
  const flow = body?.flow;
  if (!flow) return drips;
  const scale = reduceMotion ? 0.22 : 1;
  const sources = [{
    kind: 'swell',
    u: 0.5, v: 0.5,
    strength: flow.centreStrength * scale,
    radius: 0.26,
  }];
  for (let i = 0; i < flow.falls; i += 1) {
    const a = (i / flow.falls) * Math.PI * 2;
    sources.push({
      kind: 'fall',
      u: 0.5 + Math.cos(a) * flow.radius * 0.5,
      v: 0.5 + Math.sin(a) * flow.radius * 0.5,
      strength: flow.strength * scale,
      radius: 0.20,
    });
  }
  return [...sources, ...drips];
}

export function computeWaterBounds(fp, { zone, material, levelM = 0, belowLevel = false }) {
  const plan = fp?.floorplan?.() || fp;
  if (!plan?.w || !plan?.h || !plan.material || !plan.zone || !plan.solid) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (let y = 0; y < plan.h; y += 1) {
    for (let x = 0; x < plan.w; x += 1) {
      const i = y * plan.w + x;
      if (plan.solid[i]) continue;
      if (plan.zone[i] !== zone || plan.material[i] !== material) continue;
      if (belowLevel && !(plan.floor?.[i] < levelM)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
      count += 1;
    }
  }
  return count > 0 ? { minX, minY, maxX, maxY, count } : null;
}

// Every body that actually exists in this plan, with its bounds resolved. A
// declared body that finds no cells simply is not here — the fountain does not
// exist in the source space, and the bath does not exist on the street.
export function computeWaterBodies(fp) {
  return WATER_BODIES
    .map((body) => ({ ...body, bounds: computeWaterBounds(fp, body) }))
    .filter((body) => !!body.bounds);
}

export function pointInBounds(x, y, bounds) {
  if (!bounds) return false;
  return x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY;
}

// The body a point is standing in, if any.
export function waterBodyAt(bodies, x, y, run = null) {
  if (!Array.isArray(bodies)) return null;
  return bodies.find((body) => body.active(run) && pointInBounds(x, y, body.bounds)) || null;
}

// The body the renderer should upload this frame.
//
// There is one `uWaterBounds` and there will go on being one: two bodies are
// never in shot together — the bath is four floors and a locked door away from
// the park — so resolving the nearest is exact rather than approximate, and it
// costs nothing. If that ever stops being true this is the function to widen.
export function nearestWaterBody(bodies, x, y, run = null) {
  if (!Array.isArray(bodies) || !bodies.length) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const body of bodies) {
    if (!body.active(run)) continue;
    const { minX, minY, maxX, maxY } = body.bounds;
    // Squared distance from the point to the body's rectangle; zero inside it.
    const dx = Math.max(minX - x, 0, x - maxX);
    const dy = Math.max(minY - y, 0, y - maxY);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; best = body; }
  }
  return best;
}

// Whether a body refuses to be walked into. Both current bodies are traversable,
// but keeping the rule per body avoids coupling future water to that choice.
export function waterBlocksAt(bodies, x, y, run = null) {
  const body = waterBodyAt(bodies, x, y, run);
  return !!body && body.blocks;
}
