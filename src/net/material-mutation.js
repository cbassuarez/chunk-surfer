import { MATERIAL } from '../data/floorplan/legend.js';

export const MUTATION_INTERVAL_MIN_MS = 2_800;
export const MUTATION_INTERVAL_MAX_MS = 8_500;
export const MUTATION_CROSSFADE_MIN_MS = 1_600;
export const MUTATION_CROSSFADE_MAX_MS = 3_600;
export const MUTATION_MIN_FPS = 48;
export const MUTATION_MIN_SAMPLES = 30;
export const MUTATION_FEEDBACK = 0.42;

const MUTATION_PROMPT = 'creeping pareidolic structure, recursive material echoes, stains almost resolving into anatomy then slipping back into surface grain, unstable detail that visibly changes between samples';

// Mirrors surfaceSlot() in render/r3d.js. Floors come first because they occupy
// most of the image immediately around the player; walls follow for the room's
// material identity. Source-space materials deliberately have no conventional
// PBR slot and therefore never enter the mutation queue.
const MATERIAL_SLOTS = Object.freeze({
  [MATERIAL.serviceConcrete]: Object.freeze([2, 0]),
  [MATERIAL.acousticFoam]: Object.freeze([6, 9]),
  [MATERIAL.poolTile]: Object.freeze([5]),
  [MATERIAL.wetTile]: Object.freeze([4, 5]),
  [MATERIAL.woodVelvet]: Object.freeze([3, 7]),
  [MATERIAL.practiceFoam]: Object.freeze([6, 8]),
  [MATERIAL.chapelStone]: Object.freeze([3, 1]),
  [MATERIAL.metalPlant]: Object.freeze([2, 9]),
  [MATERIAL.doorGlassDuct]: Object.freeze([0, 2]),
});

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

export function surfaceSlotsForMaterial(material) {
  return MATERIAL_SLOTS[material] || Object.freeze([]);
}

export function visibleSurfaceSlots(materials = []) {
  const slots = [];
  const seen = new Set();
  for (const material of materials) {
    for (const slot of surfaceSlotsForMaterial(material)) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      slots.push(slot);
    }
  }
  return slots;
}

export function mutationCanStart({
  allowed = false,
  resident = false,
  activeBank = null,
  activeWork = false,
  transitioning = false,
  fps = null,
  samples = 0,
  visibleSlots = [],
} = {}) {
  return !!allowed
    && !!resident
    && !!activeBank
    && !activeWork
    && !transitioning
    && Number(samples) >= MUTATION_MIN_SAMPLES
    && Number(fps) >= MUTATION_MIN_FPS
    && Array.isArray(visibleSlots)
    && visibleSlots.length > 0;
}

export function mutationTiming({ fps = 60, lastRttMs = 0, random = Math.random } = {}) {
  const framePressure = clamp((54 - Number(fps)) / 6, 0, 1);
  const inferencePressure = clamp((Number(lastRttMs) - 350) / 2_000, 0, 1);
  const pressure = Math.max(framePressure, inferencePressure);
  const jitter = clamp(random(), 0, 1);
  const interval = MUTATION_INTERVAL_MIN_MS + 3_200 * pressure + 2_400 * jitter;
  const crossfade = MUTATION_CROSSFADE_MIN_MS + 1_200 * pressure + 800 * jitter;
  return {
    intervalMs: Math.round(clamp(interval, MUTATION_INTERVAL_MIN_MS, MUTATION_INTERVAL_MAX_MS)),
    transitionMs: Math.round(clamp(crossfade, MUTATION_CROSSFADE_MIN_MS, MUTATION_CROSSFADE_MAX_MS)),
  };
}

export function mutationGeneration(profile, slot, serial) {
  const generation = profile?.generation || {};
  const safeSlot = Math.max(0, Math.floor(Number(slot) || 0));
  const safeSerial = Math.max(1, Math.floor(Number(serial) || 1));
  return {
    prompt: `${generation.prompt || ''}, ${MUTATION_PROMPT}`,
    negative: generation.negative || '',
    strength: clamp(Number(generation.strength) * 0.72 + 0.36, 0.48, 0.78),
    guidance: clamp(Math.max(1.6, Number(generation.guidance) || 0), 0, 4.2),
    passes: 3,
    mix: clamp(Number(generation.mix) * 1.08, 0.55, 0.96),
    seed: ((Number(generation.seedBase) || 0) + safeSlot * 977 + safeSerial * 7_919) % 2_000_000_000,
    feedback: MUTATION_FEEDBACK,
    mutationSchema: 1,
  };
}

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function edgeMismatch(data, width, height) {
  let delta = 0;
  let samples = 0;
  const compare = (a, b) => {
    delta += (Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2])) / (255 * 3);
    samples += 1;
  };
  for (let y = 0; y < height; y += 1) compare((y * width) * 4, (y * width + width - 1) * 4);
  for (let x = 0; x < width; x += 1) compare(x * 4, ((height - 1) * width + x) * 4);
  return samples ? delta / samples : 1;
}

export function mutationCandidateMetrics(previous, candidate, width, height) {
  const count = Math.max(0, Math.floor(Number(width) || 0) * Math.floor(Number(height) || 0));
  if (!previous || !candidate || count === 0 || previous.length < count * 4 || candidate.length < count * 4) return null;
  let previousLuma = 0;
  let candidateLuma = 0;
  let rgbDelta = 0;
  for (let i = 0; i < count * 4; i += 4) {
    previousLuma += luma(previous[i], previous[i + 1], previous[i + 2]);
    candidateLuma += luma(candidate[i], candidate[i + 1], candidate[i + 2]);
    rgbDelta += (Math.abs(previous[i] - candidate[i]) + Math.abs(previous[i + 1] - candidate[i + 1]) + Math.abs(previous[i + 2] - candidate[i + 2])) / (255 * 3);
  }
  return {
    previousLuma: previousLuma / count,
    candidateLuma: candidateLuma / count,
    lumaDelta: Math.abs(previousLuma - candidateLuma) / count,
    rgbDelta: rgbDelta / count,
    previousSeam: edgeMismatch(previous, width, height),
    candidateSeam: edgeMismatch(candidate, width, height),
  };
}

export function mutationCandidateIsSafe(metrics) {
  if (!metrics) return false;
  return metrics.candidateLuma >= 0.025
    && metrics.candidateLuma <= 0.94
    && metrics.lumaDelta <= 0.28
    && metrics.rgbDelta <= 0.46
    && metrics.candidateSeam <= Math.max(0.34, metrics.previousSeam * 1.6 + 0.06);
}
