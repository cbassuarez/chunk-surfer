import { MATERIAL } from '../data/floorplan/legend.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const key = value => typeof value === 'string'
  ? value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[ _]+/g, '-') : '';
const materialNames = new Map(Object.entries(MATERIAL).map(([name, id]) => [id, key(name)]));
const materialName = value => finite(value) ? materialNames.get(value) || '' : key(value);
const physical = new Map([
  ['service-concrete', 'concrete'], ['concrete', 'concrete'], ['cold-stone', 'stone'],
  ['chapel-stone', 'stone'], ['stone', 'stone'], ['masonry', 'stone'], ['chalk', 'stone'],
  ['pool-tile', 'tile'], ['wet-tile', 'tile'], ['tile', 'tile'], ['ceramic', 'tile'],
  ['wood-velvet', 'wood'], ['piano-wood', 'wood'], ['wood', 'wood'], ['timber', 'wood'],
  ['soundboard', 'wood'], ['acoustic-foam', 'carpet'], ['practice-foam', 'carpet'],
  ['case-lining', 'carpet'], ['carpet', 'carpet'], ['textile', 'carpet'],
  ['metal-plant', 'metal'], ['door-glass-duct', 'metal'], ['metal', 'metal'],
  ['lift', 'metal'], ['deck', 'metal'], ['wet-tarmac', 'tarmac'], ['tarmac', 'tarmac'],
  ['wet-paving', 'paving'], ['paving', 'paving'], ['wet-setts', 'setts'], ['setts', 'setts'],
  ['wet-grass', 'grass'], ['grass', 'grass'], ['soil', 'earth'], ['earth', 'earth'],
  ['sand', 'earth'], ['bank', 'stone'], ['ledge', 'stone'], ['rock', 'stone'],
  ['source-page', 'paper'], ['paper', 'paper'], ['snow', 'snow'], ['whiteout', 'snow'],
  ['flood', 'water'], ['water', 'water'], ['ash', 'ash'], ['ash-room', 'ash'],
  ['body', 'body'], ['flesh', 'body'], ['tissue', 'body'], ['roof-glass', 'glass'],
  ['glass', 'glass'], ['source-void', 'void'], ['void', 'void'],
]);
const codeTones = new Map([['source-field', 'field'], ['source-path', 'path'], ['source-fault', 'fault']]);
const enabled = value => value === true || !!(value && typeof value === 'object' && value.active !== false);

/**
 * Resolve acoustic support, never collision or gameplay noise. Pass the support
 * underneath the accepted plant, not a camera ray. sourceVoid is deliberately
 * insufficient: Source uses it for streets, living tissue, shores and absence.
 * sourcePhase uses CHUNK_SURF_PHASE strings; sourceDomain/sourceBeat is a local
 * domain supplied by the caller (e.g. nothing/outskirts/horizon/white-walk).
 */
export function resolveFootContact(input = {}) {
  const support = input.surface && typeof input.surface === 'object' ? input.surface : {};
  const surfaceName = materialName(typeof input.surface === 'object' ? support.material ?? support.surface : input.surface);
  const mat = materialName(input.materialId ?? input.material ?? support.materialId);
  const sourceMat = materialName(input.sourceMaterial);
  const domain = key(input.sourceDomain || input.sourceBeat);
  const covering = key(input.covering ?? support.covering);
  const wetness = clamp(finite(input.wetness) ? input.wetness : finite(support.wetness) ? support.wetness
    : /^wet-/.test(surfaceName || mat) ? 1 : 0, 0, 1);
  let tone = codeTones.get(sourceMat) || codeTones.get(mat) || codeTones.get(surfaceName) || 'field';
  const result = (surface, profile = 'physical', extra = {}) => Object.freeze({
    surface, profile, tone, wetness, covering: covering || null,
    sourceDomain: domain || null, ...extra,
  });
  const covered = physical.get(covering);
  if (covered) return result(covered);

  // Scene owners and real support override broad visual Source materials.
  if (enabled(input.busBody) || ['bus-body', 'body-corridor'].includes(domain)) return result('body', 'physical', { wetness: Math.max(.8, wetness) });
  const station = typeof input.station === 'string' ? key(input.station) : enabled(input.station) ? key(input.station.stage || input.station.world) : '';
  if (['whiteout', 'snow', 'flood', 'water', 'ash', 'ash-room'].includes(station)) return result(physical.get(station), 'physical', { wetness: ['flood', 'water'].includes(station) ? 1 : wetness });
  if (station) return result(physical.get(surfaceName) || physical.get(mat) || 'wood');
  const shore = typeof input.shore === 'string' ? key(input.shore) : enabled(input.shore) ? key(input.shore.surface || 'void') : '';
  if (shore && shore !== 'void') return result(physical.get(shore) || physical.get(surfaceName) || 'stone');
  if (['outskirts', 'remembered-street', 'chapel-outskirts', 'bells', 'coast', 'coastal-memory', 'scene-dock'].includes(domain)
    || input.remembered || input.coast || input.sceneDock) {
    return result(physical.get(surfaceName) && surfaceName !== 'source-void' ? physical.get(surfaceName)
      : physical.get(mat) && mat !== 'source-void' ? physical.get(mat)
        : ['coast', 'coastal-memory'].includes(domain) || input.coast ? 'earth' : 'tarmac');
  }
  // Explicit construction surfaces (Source II, paper, ordinary supports) keep
  // their close contact. Only sourceVoid/none may defer to an authored domain.
  const explicit = physical.get(surfaceName);
  if (explicit && explicit !== 'void') return result(explicit);
  const material = physical.get(mat);
  if (material && material !== 'void') return result(material);
  if (input.sourcePhase === 'hall' || input.sourcePhase === 'haystack') return result('concrete');
  if (input.sourcePhase === 'chapel-outskirts' || input.sourcePhase === 'bells') return result('tarmac');
  const horizon = enabled(input.horizon) && (input.horizon === true || input.horizon.onTape === true);
  if (horizon || ['horizon', 'tape', 'tape-field'].includes(domain)) return result('void', 'erased');
  if (enabled(input.nothingness) || shore === 'void' || ['nothing', 'nothingness', 'white-walk', 'white-absence'].includes(domain)) return result('tile', 'glazed');
  if (enabled(input.sourceIV) || ['source-iv', 'source-iv-sheet'].includes(domain) || sourceMat === 'source') return result('tile', 'glazed');
  if (codeTones.has(sourceMat) || codeTones.has(mat) || codeTones.has(surfaceName)) return result('tile', 'compiled');
  return result(explicit || material || 'concrete');
}

// Walking-range anchors informed by the directly observed CADENCE-Adults
// speed/cadence table (2019, doi:10.1186/s12966-019-0769-6), biased toward its
// brisk end for audible grounding. Above walking speed this is an authored
// game curve, not an anatomical claim. Units are individual contacts, NOT
// left-to-left strides. The ladder (game/locomotion.js) lands on it at crawl
// ~1.3, walk 2.15, jog 2.85, run 3.3 and sprint 3.7 contacts a second; the
// knots above 6 m/s now serve only the authored Source walks.
export const FOOT_CONTACT_CADENCE = Object.freeze([
  [0, 0], [.2, .9], [.45, 1.25], [.9, 1.8], [1.35, 2.15], [1.8, 2.45],
  [2.1, 2.65], [3.2, 3.1], [5, 3.5], [8, 4.05], [11.1, 4.6], [16, 4.8],
].map(knot => Object.freeze(knot)));
function cadenceAt(speed) {
  for (let i = 1; i < FOOT_CONTACT_CADENCE.length; i++) {
    const [to, hz] = FOOT_CONTACT_CADENCE[i], [from, previous] = FOOT_CONTACT_CADENCE[i - 1];
    if (speed <= to) return previous + (hz - previous) * (speed - from) / (to - from);
  }
  return 4.8;
}

/** A presentation gait, in physical metres. It never alters movement speed. */
export function footContactGait(speed, { careful = false, injury = 0, footSide, weakFoot = 'left' } = {}) {
  const v = Math.max(0, finite(speed) ? speed : 0);
  const hurt = clamp(finite(injury) ? injury : injury ? 1 : 0, 0, 1);
  const frequency = v > 0 ? Math.min(careful ? 2.2 : 4.8, cadenceAt(v)
    * (careful ? .86 : 1) * (1 - .08 * hurt)) : 0;
  const sideKnown = footSide === 'left' || footSide === 'right';
  const dwell = sideKnown ? 1 + hurt * (footSide === weakFoot ? .12 : -.04) : 1;
  const interval = Math.max(1 / 4.8, dwell / frequency);
  const stride = v > 0 ? Math.max(.16, v * interval) : .16;
  return Object.freeze({ speed: v, interval, stride, contactsPerSecond: 1 / interval });
}

const position2 = value => value && finite(value.x) && finite(value.z) ? { x: value.x, z: value.z } : null;

/**
 * Feed accepted supported travel only; semantic/HUSH grid receipts stay with
 * their existing owner. update emits at most one plant, never a catch-up burst.
 * Stairs with authored tread contacts keep their separate clock externally.
 */
export function createFootContactClock({ maxFrameDelta = .25, maxSpeed = 24, minContactInterval = .14, minTravel = .000001,
  humanize = 1, seed = 42731 } = {}) {
  const maxDt = finite(maxFrameDelta) && maxFrameDelta > 0 ? maxFrameDelta : .25;
  const speedLimit = finite(maxSpeed) && maxSpeed > 0 ? maxSpeed : 24;
  const refractory = finite(minContactInterval) && minContactInterval > 0 ? minContactInterval : .14;
  const travelThreshold = finite(minTravel) && minTravel >= 0 ? minTravel : .000001;
  let scene, initialized = false, epoch = 0, id = 0, plantIndex = 0, now = 0;
  let lastAt = -Infinity, lastInterval = 0, previous = null, travel = 0, cycle = 0, moving = false, reason = 'new';
  let rng = (Number(seed) >>> 0) || 42731, drift = 0, sway = 0, timingIndex = -1, timingMode = '', timingFactor = 1;
  let resistance = 0, resistanceWait = 12, rephase = false;
  function signedRandom() {
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
    return (rng >>> 0) / 4294967296 * 2 - 1;
  }
  function timingFor(index, input) {
    const mode = ['locked', 'resistance'].includes(input.gaitTreatment) ? input.gaitTreatment : 'natural';
    if (index === timingIndex && mode === timingMode) return timingFactor;
    timingIndex = index; timingMode = mode;
    // Primary recordings contain small, serially related STRIDE fluctuations.
    // This is a bounded two-timescale approximation, not a reconstruction of
    // one participant, step asymmetry, or a physiological/fractal simulation.
    if (index % 2 === 0) {
      drift = .96 * drift + .006 * signedRandom();
      sway = .70 * sway + .015 * signedRandom();
    }
    const local = .0035 * signedRandom();
    const amount = clamp(finite(input.humanize) ? input.humanize : Number(humanize) || 0, 0, 2);
    const natural = clamp(drift + sway + local, -.045, .045) * amount;
    timingFactor = mode === 'locked' ? 1 : 1 + natural;
    // Review-only authored pressure: a foot is briefly resisted, then released
    // gradually. Recovery never repays the delay with shortened catch-up steps.
    if (mode === 'resistance') {
      if (--resistanceWait <= 0) {
        resistance = .18 + .04 * (signedRandom() + 1) / 2;
        resistanceWait = 15 + Math.floor((signedRandom() + 1) * 6);
      }
      timingFactor += resistance * clamp(finite(input.resistanceStrength) ? input.resistanceStrength : 1, 0, 1);
      resistance *= .60;
    } else resistance = 0;
    return timingFactor;
  }
  function clear(why, position = null) { travel = 0; cycle = 0; rephase = false; moving = false; previous = position; reason = why; }
  function reset(nextScene) {
    scene = nextScene; initialized = true; epoch++; plantIndex = 0; now = 0; lastAt = -Infinity; lastInterval = 0;
    clear('reset');
  }
  function update(input = {}) {
    const point = position2(input.position);
    if (!initialized) { scene = input.scene; initialized = true; }
    else if (input.scene !== undefined && input.scene !== scene) { reset(input.scene); clear('scene', point); return []; }
    const dt = input.dt;
    if (!finite(dt) || dt <= 0) { clear('invalid-delta', point); return []; }
    now += Math.min(dt, maxDt);
    if (input.paused || input.active === false || input.supported === false || input.accepted === false || input.teleported) {
      clear(input.teleported ? 'teleport' : input.paused ? 'paused' : input.supported === false ? 'unsupported' : 'inactive', point); return [];
    }
    if (dt > maxDt) { clear('hitch', point); return []; }
    const distance = finite(input.distance) ? input.distance
      : point && previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0;
    previous = point;
    if (distance < 0 || !finite(distance) || distance > speedLimit * dt + .05) { clear('teleport', point); return []; }
    if (distance <= travelThreshold) { clear('stopped', point); return []; }
    const speed = distance / dt;
    const base = footContactGait(speed, { ...input, footSide: plantIndex % 2 === 0 ? 'left' : 'right' });
    const factor = timingFor(plantIndex, input);
    const gait = { ...base, interval: base.interval * factor, stride: Math.max(.16, speed * base.interval * factor) };
    const starting = !moving;
    moving = true; travel += distance; cycle += distance / gait.stride; reason = 'travel';
    // A foreground stall is not an invitation to perform missed contacts.
    // Keep ordinary frame-sized fractional phase, but abandon late-frame debt.
    if (dt > .10) rephase = true;
    const elapsed = now - lastAt;
    const adjacentInterval = Math.min(lastInterval || gait.interval, gait.interval);
    const spacingFloor = Math.max(refractory, .86 * adjacentInterval - Math.min(dt, 1 / 12));
    const restartInterval = starting ? Math.max(spacingFloor, adjacentInterval) : spacingFloor;
    if (elapsed + 1e-9 < restartInterval) {
      if (cycle >= 1) { cycle = 1; rephase = true; }
      return [];
    }
    if (!starting && cycle + 1e-9 < 1) return [];
    const index = plantIndex++;
    const footSide = index % 2 === 0 ? 'left' : 'right';
    const event = Object.freeze({ id: ++id, epoch, scene, plantIndex: index, footSide, foot: footSide,
      phase: index % 2, at: now, speed, interval: gait.interval, baseInterval: base.interval,
      timingVariation: factor - 1, gaitTreatment: timingMode,
      latenessSeconds: starting || rephase ? 0 : clamp((cycle - 1) * gait.interval, 0, Math.min(dt, .10)),
      stride: gait.stride, distance: travel });
    // Retain the fractional cycle: discarding a frame's overrun at each plant
    // silently slows every gait, especially at low display frame rates. Fresh
    // starts still plant immediately, and no update can emit a catch-up burst.
    cycle = starting || rephase ? 0 : Math.max(0, cycle - 1);
    rephase = false;
    lastAt = now; lastInterval = gait.interval; travel = 0; reason = starting ? 'start-contact' : 'contact';
    return [event];
  }
  return Object.freeze({ update, reset, snapshot: () => Object.freeze({ scene, epoch, plantIndex, now, travel, cycle, moving, reason }) });
}
