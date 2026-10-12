import { CELL, EYE } from '../data/floorplan/legend.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { SOURCE_BELLS, SOURCE_BELL_PASSAGE, bellSwingAt } from '../data/source-level.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y)
  ? { x: value.x, y: value.y } : null;
const BODY_RADIUS = 0.24 / CELL;
const CONTACT_RELEASE = 1.28;
const CONTACT_COOLDOWN = 2.4;
const RECOIL_DRAG = 8;

export const SOURCE_BELL_FIELD_RULES = Object.freeze({
  story: Object.freeze({ noiseLimit: 4, checkpoints: Object.freeze([0, 1, 2]) }),
  contract: Object.freeze({ noiseLimit: 3, checkpoints: Object.freeze([0, 1, 2]) }),
  night: Object.freeze({ noiseLimit: 3, checkpoints: Object.freeze([0, 1, 2]) }),
  'dead-air': Object.freeze({ noiseLimit: 2, checkpoints: Object.freeze([0, 1, 2]) }),
});

export function sourceBellFieldRules(difficulty = 'contract') {
  return SOURCE_BELL_FIELD_RULES[typeof difficulty === 'string' ? difficulty : difficulty?.id]
    || SOURCE_BELL_FIELD_RULES.contract;
}

// The imported GLB bounds are metres; Source positions are half-metre cells.
// Project the actual articulated bounds through the same RY * RX * RZ order as
// sourceMatrix. Clip at body height before projecting: an overhead bell cannot
// hit the player merely because its footprint passes over them.
export function sourceBellContactShape(entry, time = 0) {
  if (!entry?.contact) return null;
  const bounds = PROP_BOUNDS[entry.mesh];
  if (!bounds) return null;
  const scale = Math.max(0.01, finite(entry.scale, 1));
  const roll = finite(entry.roll) + bellSwingAt(entry, time);
  const pitch = finite(entry.pitch), yaw = finite(entry.yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const elevation = finite(entry.elevation) - finite(entry.sink);
  // A bell is round. Rotating the corners of its AABB makes its apparent
  // footprint grow by sqrt(2) at 45 degrees and creates invisible impacts.
  // The shorter radial bound excludes the headstock's projecting gudgeons.
  const radius = Math.min((bounds.max[0] - bounds.min[0]) / 2, (bounds.max[2] - bounds.min[2]) / 2) * scale;
  const sides = 32;
  const vertices = Array.from({ length: sides * 2 }, (_, index) => {
    const angle = index % sides * Math.PI * 2 / sides;
    const x = Math.cos(angle) * radius;
    const y = bounds[index >= sides ? 'max' : 'min'][1] * scale;
    const z = Math.sin(angle) * radius;
    const rx = x * cr - y * sr, ry = x * sr + y * cr;
    const py = ry * cp - z * sp, pz = ry * sp + z * cp;
    return { x: rx * cy + pz * sy, y: py + elevation, z: -rx * sy + pz * cy };
  });
  const low = 0.08, high = EYE + 0.12;
  const clipped = vertices.filter((v) => v.y >= low && v.y <= high);
  for (let index = 0; index < sides * 2; index += 1) {
    const adjacent = [Math.floor(index / sides) * sides + (index + 1) % sides];
    if (index < sides) adjacent.push(index + sides);
    for (const next of adjacent) {
      const a = vertices[index], b = vertices[next];
      for (const height of [low, high]) {
        if ((a.y - height) * (b.y - height) >= 0) continue;
        const t = (height - a.y) / (b.y - a.y);
        clipped.push({ x: a.x + (b.x - a.x) * t, y: height, z: a.z + (b.z - a.z) * t });
      }
    }
  }
  if (!clipped.length) return null;
  const minX = Math.min(...clipped.map((v) => v.x)), maxX = Math.max(...clipped.map((v) => v.x));
  const minZ = Math.min(...clipped.map((v) => v.z)), maxZ = Math.max(...clipped.map((v) => v.z));
  return {
    id: entry.id, bell: Number(entry.mesh.match(/tower_bell_(\d+)/)?.[1]) || 1,
    x: finite(entry.x) + (minX + maxX) / (2 * CELL),
    y: finite(entry.y) + (minZ + maxZ) / (2 * CELL),
    rx: Math.max(0.1, (maxX - minX) / (2 * CELL)) + BODY_RADIUS,
    ry: Math.max(0.1, (maxZ - minZ) / (2 * CELL)) + BODY_RADIUS,
    sounds: entry.sounds === true,
  };
}

const ellipseDistance = (p, shape) => Math.hypot((p.x - shape.x) / shape.rx, (p.y - shape.y) / shape.ry);

function sweptContact(from, to, shape) {
  const ox = (from.x - shape.x) / shape.rx, oy = (from.y - shape.y) / shape.ry;
  const dx = (to.x - from.x) / shape.rx, dy = (to.y - from.y) / shape.ry;
  const a = dx * dx + dy * dy, b = 2 * (ox * dx + oy * dy), c = ox * ox + oy * oy - 1;
  if (c <= 0) return ellipseDistance(to, shape) < 1 ? { ...to } : null;
  const disc = b * b - 4 * a * c;
  if (a < 1e-12 || disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t } : null;
}

export function createSourceBellField({ initialState = null, difficulty = 'contract', placements = SOURCE_BELL_PASSAGE } = {}) {
  const entries = placements.filter((entry) => entry.contact && PROP_BOUNDS[entry.mesh]);
  const fixedShapes = new Map(entries.filter((entry) => !entry.swing).map((entry) => [entry.id, sourceBellContactShape(entry)]));
  const ids = new Set(entries.map((entry) => entry.id));
  let rules = sourceBellFieldRules(difficulty);
  let elapsed = clamp(initialState?.elapsed, 0, 1e8);
  let noise = clamp(initialState?.noise, 0, rules.noiseLimit - 1);
  let hits = Math.floor(clamp(initialState?.hits, 0, 1e7));
  let rings = Math.floor(clamp(initialState?.rings, 0, 1e7));
  let resets = Math.floor(clamp(initialState?.resets, 0, 1e7));
  let checkpointDepth = clamp(initialState?.checkpointDepth, 0, SOURCE_BELLS.length);
  let previous = point(initialState?.previous);
  let velocity = { x: clamp(finite(initialState?.velocity?.x, 0), -10, 10), y: clamp(finite(initialState?.velocity?.y, 0), -10, 10) };
  let grace = clamp(initialState?.grace, 0, 3);
  const touching = new Set((Array.isArray(initialState?.touching) ? initialState.touching : []).filter((id) => ids.has(id)));
  const cooldowns = new Map((Array.isArray(initialState?.cooldowns) ? initialState.cooldowns : [])
    .filter((pair) => Array.isArray(pair) && ids.has(pair[0])).map(([id, seconds]) => [id, clamp(seconds, 0, CONTACT_COOLDOWN)]));

  // Difficulty changes the warning budget, never the ground already earned.
  // These quiet clearings divide the trial into four short walks on every mode.
  const allowedCheckpoints = () => rules.checkpoints.map((index) => SOURCE_BELLS.checkpoints[index]).filter(Boolean);
  const sanitizeCheckpoint = () => {
    checkpointDepth = Math.max(0, ...allowedCheckpoints().filter((entry) => entry.depth <= checkpointDepth).map((entry) => entry.depth));
  };
  sanitizeCheckpoint();

  function frame() {
    return { time: elapsed, noise, noiseLimit: rules.noiseLimit, hits, rings, resets, checkpointDepth,
      completedClusters: allowedCheckpoints().filter((entry) => entry.depth <= checkpointDepth).length,
      recoiling: Math.hypot(velocity.x, velocity.y) > 0.05 };
  }

  function snapshot() {
    return { version: 2, elapsed, ...frame(), previous: previous && { ...previous }, velocity: { ...velocity },
      grace, touching: [...touching], cooldowns: [...cooldowns].map(([id, seconds]) => [id, seconds]) };
  }

  function step({ x, y, dt = 0, active = true, difficulty: nextDifficulty, reducedMotion = false } = {}) {
    const requested = { x: finite(x), y: finite(y, SOURCE_BELLS.from - SOURCE_BELLS.entryStandoff) };
    if (nextDifficulty != null) { rules = sourceBellFieldRules(nextDifficulty); sanitizeCheckpoint(); }
    const result = { position: { ...requested }, moved: false, contacts: [], strikes: [], reset: null, checkpoint: null, ...frame() };
    if (!active) { previous = null; velocity = { x: 0, y: 0 }; return { ...result, ...frame() }; }
    const seconds = clamp(dt, 0, 0.1);
    elapsed += seconds;
    grace = Math.max(0, grace - seconds);
    for (const [id, value] of cooldowns) {
      const remaining = Math.max(0, value - seconds);
      if (remaining) cooldowns.set(id, remaining); else cooldowns.delete(id);
    }
    const decay = Math.exp(-RECOIL_DRAG * seconds);
    const recoilTravel = (1 - decay) / RECOIL_DRAG;
    const destination = { x: requested.x + velocity.x * recoilTravel, y: requested.y + velocity.y * recoilTravel };
    velocity = { x: velocity.x * decay, y: velocity.y * decay };
    const shapes = entries.map((entry) => fixedShapes.has(entry.id) ? fixedShapes.get(entry.id) : sourceBellContactShape(entry, elapsed)).filter(Boolean);
    const from = previous && Math.hypot(previous.x - requested.x, previous.y - requested.y) <= 32 ? previous : requested;
    for (const shape of shapes) {
      if (ellipseDistance(destination, shape) > CONTACT_RELEASE) touching.delete(shape.id);
      const hit = sweptContact(from, destination, shape);
      if (!hit) continue;
      let ux = (hit.x - shape.x) / shape.rx, uy = (hit.y - shape.y) / shape.ry;
      const length = Math.hypot(ux, uy);
      if (length > 1e-6) { ux /= length; uy /= length; } else { ux = 0; uy = 1; }
      // Resolve immediately to the visible body's outside, then add a brief
      // horizontal shove. No camera rotation, damage, fall state or input lock.
      destination.x = shape.x + ux * (shape.rx + 0.035);
      destination.y = shape.y + uy * (shape.ry + 0.035);
      if (!touching.has(shape.id) && !cooldowns.has(shape.id) && grace <= 0) {
        hits += 1;
        const sounded = shape.sounds && result.strikes.length === 0;
        result.contacts.push({ id: shape.id, bell: shape.bell, sounded });
        const nx = ux / shape.rx, ny = uy / shape.ry, normalLength = Math.hypot(nx, ny) || 1;
        const impulse = reducedMotion ? 2.4 : 7.2;
        velocity = { x: nx / normalLength * impulse, y: ny / normalLength * impulse };
        cooldowns.set(shape.id, CONTACT_COOLDOWN);
        if (sounded) {
          noise += 1; rings += 1;
          result.strikes.push({ bell: shape.bell, stroke: 'hand', rowIndex: rings - 1, place: 1, id: shape.id,
            x: shape.x, y: shape.y, gain: 0.72, acousticProfile: 'source_residue' });
        }
      }
      touching.add(shape.id);
    }
    if (noise >= rules.noiseLimit) {
      const checkpoint = allowedCheckpoints().find((entry) => entry.depth === checkpointDepth);
      const reset = { x: checkpoint?.x || 0, y: SOURCE_BELLS.from - (checkpointDepth || SOURCE_BELLS.entryStandoff), reason: 'noise' };
      result.reset = reset;
      destination.x = reset.x; destination.y = reset.y;
      resets += 1; noise = 0; velocity = { x: 0, y: 0 }; grace = 2;
      touching.clear(); cooldowns.clear();
    } else {
      // Reaching a clearing by walking completes the preceding cluster. A bell's
      // recoil cannot earn progress, and looking back never takes progress away.
      const depth = SOURCE_BELLS.from - Math.max(destination.y, requested.y);
      for (const checkpoint of allowedCheckpoints()) {
        if (depth >= checkpoint.depth && checkpoint.depth > checkpointDepth) {
          checkpointDepth = checkpoint.depth;
          noise = 0;
          result.checkpoint = { x: checkpoint.x, y: SOURCE_BELLS.from - checkpoint.depth, depth: checkpoint.depth };
        }
      }
    }
    // Shoves cannot throw the player off the authored field or past the room
    // threshold. Only voluntary walking can complete the tower arrival.
    destination.x = clamp(destination.x, -SOURCE_BELLS.halfWidth + 1, SOURCE_BELLS.halfWidth - 1);
    destination.y = clamp(destination.y, Math.min(requested.y, SOURCE_BELLS.room.threshold + 0.8), SOURCE_BELLS.from - 0.2);
    previous = { ...destination };
    result.position = destination;
    result.moved = Math.hypot(destination.x - requested.x, destination.y - requested.y) > 1e-7;
    return { ...result, ...frame() };
  }

  return { step, snapshot, frame };
}
