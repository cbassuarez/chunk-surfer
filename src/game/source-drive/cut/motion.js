// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// The Cut: a constrained living surface, never a whole cliff moved as one prop.
// This descriptor uses the real four morphs exported by cut-living.glb. Each
// morph is zero at the bolt/rock contact boundary; no root transform is driven.
// All time comes from the paused simulation programme clock. Maximum forward
// distance is already latched by drive-state; neither looking nor waiting
// advances the encounter's revealed degree.
export const CUT_MOTION_VERSION = 1;
export const CUT_LIVING_MESHES = Object.freeze(['cut_fascia', 'cut_membrane', 'cut_tethers']);
export const CUT_MORPH_NAMES = Object.freeze(['tension', 'shear', 'breath', 'recoil']);
export const CUT_MOTION_LIMITS = Object.freeze({
  range: Object.freeze([0, 1]),
  minimumActivationDistance: 580,
  fullActivationDistance: 885,
  // Authored geometric displacements belong to the asset, not arbitrary
  // world-space noise. These weights never exceed its authored endpoints.
  rootTranslation: Object.freeze([0, 0, 0]),
  clock: 'programTime: simulation seconds; paused clock freezes every channel',
  progression: 'furthest: maximum forward metres, never raw current position',
});

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { const t = clamp(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a + (b - a) * t;
// Integer hash is stable across sessions and JS engines. No random state or
// wall clock is involved in checkpoint restoration.
function hashInt(value) {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function stringSeed(value) {
  const text = String(value); let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}
function noise(t, seed) {
  const cell = Math.floor(t), a = hashInt(seed + Math.imul(cell, 7919)), b = hashInt(seed + Math.imul(cell + 1, 7919));
  return mix(a, b, smooth(t - cell));
}

// A single effort does not resemble breathing. It loads slowly, holds under
// tension, gives partway, catches, and finally lets go. The next event has a
// different wait/load/hold/release duration. Continuous derivatives at each
// boundary avoid a mesh pop masquerading as a frightening movement.
export function cutEffort(timeSec, seed = 1, period = 41) {
  if (!Number.isFinite(timeSec) || !Number.isFinite(seed) || !Number.isFinite(period) || period < 32) throw Error('Cut effort requires finite simulation time/seed and a period >= 32 seconds.');
  const event = Math.floor(timeSec / period), eventSeed = (seed | 0) + Math.imul(event, 104729);
  const r = n => hashInt(eventSeed + Math.imul(n, 15485863));
  const wait = 1.8 + r(1) * 4.8, load = 4.6 + r(2) * 3.8, hold = 2.4 + r(3) * 4.8;
  const give = .72 + r(4) * .8, catchSeconds = .45 + r(5) * .9, releaseSeconds = 1.0 + r(6) * 1.5;
  const q = timeSec - event * period - wait, held = .36 + r(7) * .15;
  let value = 0, phase = 'rest', fraction = 0, release = 0;
  if (q >= 0 && q < load) { phase = 'load'; fraction = q / load; value = smooth(fraction); }
  else if (q >= load && q < load + hold) {
    phase = 'hold'; fraction = (q - load) / hold;
    // A very small nonperiodic settling inside the held maximum. Its endpoints
    // remain exactly one, so event and release boundaries stay continuous.
    value = 1 - .026 * 16 * fraction * fraction * (1 - fraction) * (1 - fraction) * r(8);
  } else if (q >= load + hold && q < load + hold + give) {
    phase = 'give'; fraction = (q - load - hold) / give; value = mix(1, held, smooth(fraction)); release = smooth(fraction);
  } else if (q >= load + hold + give && q < load + hold + give + catchSeconds) {
    phase = 'catch'; fraction = (q - load - hold - give) / catchSeconds; value = held; release = 1;
  } else if (q >= load + hold + give + catchSeconds && q < load + hold + give + catchSeconds + releaseSeconds) {
    phase = 'release'; fraction = (q - load - hold - give - catchSeconds) / releaseSeconds; value = held * (1 - smooth(fraction)); release = 1 - smooth(fraction);
  }
  return {value: clamp(value), release: clamp(release), phase, fraction: clamp(fraction), event,
    durations: {wait, load, hold, give, catch: catchSeconds, release: releaseSeconds}};
}

export function cutReveal(furthest) {
  if (!Number.isFinite(furthest)) throw Error('Cut reveal needs finite maximum forward distance.');
  return {
    first: smooth((furthest - 580) / 115),
    exposed: smooth((furthest - 665) / 150),
    near: smooth((furthest - 755) / 130),
  };
}

function poseChannels(timeSec, furthest, distance, id) {
  const seed = stringSeed(id), reveal = cutReveal(furthest);
  // A shared load travels through successive wall modules. Independent inner
  // drag is delayed again and can continue after the fascia has caught. The
  // fixed geometry masks supply the variation within each 24 m module.
  const travellingTime = timeSec - (distance - 830) * .085 + 12.7;
  const load = cutEffort(travellingTime, 235711, 41);
  const drag = cutEffort(travellingTime - 4.8 + hashInt(seed + 41) * 5.2, seed ^ 982451653, 37);
  const pressure = cutEffort(timeSec - (distance - 830) * .052 + 8.1, 32452843, 53);
  const micro = noise(timeSec * .087 + hashInt(seed) * 20, seed ^ 67867967);
  const tension = reveal.first * (.075 + .78 * load.value + .10 * micro);
  const shear = reveal.exposed * (.035 + .69 * drag.value + .10 * noise(timeSec * .119 + 9, seed + 17));
  // Broad pressure is sparse and spatial, deliberately not a repeating breath
  // tied to the player or engine. Its authored shape opens the cavity lip.
  const breath = reveal.near * (.035 + .78 * pressure.value);
  // Recoil folds appear after the strained sheet gives; suppress them while
  // maximum tension is being held to respect the asset's combined shape limit.
  const recoil = reveal.exposed * (.055 + .62 * Math.max(load.release * (1 - .7 * load.value), drag.release * .58)) * (1 - .7 * tension);
  return {morphs: {tension: clamp(tension), shear: clamp(shear), breath: clamp(breath), recoil: clamp(recoil)},
    reveal, load, drag, pressure};
}

// Pass the returned object directly as an instance's `character` descriptor.
// `motion` is inspectable telemetry only; P3 reads joints/morphs. Using identical
// options for a physical module gives the composite motion/foley state; submit
// cutLayerPose below for the individual layered meshes. Use a stable module ID.
export function cutPose({timeSec = 0, furthest = 0, distance = 850, id = 'cut-hero'} = {}) {
  if (![timeSec, furthest, distance].every(Number.isFinite) || timeSec < 0) throw Error('Cut pose requires finite nonnegative simulation time, maximum forward distance and placement distance.');
  const result = poseChannels(timeSec, furthest, distance, id), epsilon = .05;
  const before = poseChannels(Math.max(0, timeSec - epsilon), furthest, distance, id).morphs;
  const after = poseChannels(timeSec + epsilon, furthest, distance, id).morphs;
  const dt = timeSec < epsilon ? timeSec + epsilon : 2 * epsilon;
  const velocity = Object.fromEntries(CUT_MORPH_NAMES.map(name => [name, (after[name] - before[name]) / dt]));
  return {joints: {}, morphs: result.morphs, motion: {
    version: CUT_MOTION_VERSION, timeSec, furthest, distance, id,
    reveal: result.reveal, phases: {fascia: result.load.phase, innerDrag: result.drag.phase, cavity: result.pressure.phase},
    velocity, rootTranslation: [0, 0, 0],
    // Physical foley control hints: these are movement-derived levels, not a
    // synthetic voice or replacement for the user's finished recordings.
    foley: {adhesiveDrag: clamp(Math.abs(velocity.shear) * 2.6 + Math.abs(velocity.tension) * .6),
      settling: clamp(Math.max(0, -velocity.tension) * 2),
      cavityPressure: result.reveal.near * result.pressure.value,
      // The broad cavity may briefly match an idle harmonic. This rare held
      // interval is a material response; it never changes the van engine.
      harmonicCoupling: result.pressure.phase === 'hold' ? result.reveal.near * .12 : 0},
  }};
}

// Layers share fixed anchors, but the hidden sheet should not move in lockstep
// with its outer fascia. The outer sheet loads and catches; the inner membrane
// continues the delayed sidewards shear and cavity opening beneath it. Tethers
// follow the fascia, where their distal fans are attached in the authored kit.
// No layer gets a world transform or an extra clock. The asset's four corner
// envelopes and zero-delta roots remain authoritative for every response.
export function cutLayerPose(mesh, options = {}) {
  if (!CUT_LIVING_MESHES.includes(mesh)) throw Error(`Unknown living Cut layer: ${mesh}`);
  const pose = cutPose(options), weights = mesh === 'cut_membrane'
    ? {tension: .34, shear: 1, breath: 1, recoil: 1}
    : {tension: 1, shear: .26, breath: .36, recoil: .72};
  pose.morphs = Object.fromEntries(CUT_MORPH_NAMES.map(name => [name, pose.morphs[name] * weights[name]]));
  pose.motion = {...pose.motion, layer: mesh, velocity: Object.fromEntries(CUT_MORPH_NAMES.map(name => [name, pose.motion.velocity[name] * weights[name]]))};
  return pose;
}
