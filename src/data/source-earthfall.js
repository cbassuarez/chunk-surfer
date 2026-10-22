// The one physical threshold before Source II. All coordinates are local metres.
// These bounds describe visible earth and a real folio catch, not camera motion.
const freeze = Object.freeze;
export const SOURCE_EARTHFALL = freeze({
  version: 1,
  sequenceId: 'source-earthfall:source-II-v1',
  fixedStep: 1 / 120,
  maxFrameDelta: .25,
  walkSpeed: 3.2,
  airSpeed: 2,
  bodyRadius: .22,
  eyeHeight: 1.62,
  upperFloor: 100,
  lowerFloor: 0,
  earth: freeze({ minX: -80, maxX: 80, minZ: -100, maxZ: 30 }),
  // The broad catch covers the entire walkable upper sheet. It stays below the
  // body until actual contact; it is never an invisible positional clamp.
  catch: freeze({ minX: -80, maxX: 80, minZ: -100, maxZ: 30, interceptY: 12, settleSeconds: 1.2, thickness: .28 }),
  passage: freeze({ halfWidth: 7, entryZ: 0, exitZ: -42 }),
  spawn: freeze({ x: 0, z: -1.7, feet: 100, yaw: 0, pitch: 0 }),
  commitmentZ: -2.4,
  fractureAt: .6,
  footingLossAt: 3,
  gravity: 9.8,
  terminalSpeed: 26,
  door: freeze({ width: 3, height: 3.05, openSeconds: .8, focusDistance: 2.2 }),
});

export const SOURCE_EARTHFALL_CUES = freeze([
  freeze({ type: 'strain', at: 0, gain: .52 }),
  freeze({ type: 'fracture', at: SOURCE_EARTHFALL.fractureAt, gain: .7 }),
  freeze({ type: 'footing-loss', at: SOURCE_EARTHFALL.footingLossAt, gain: .64 }),
]);

export const earthfallContains = (bounds, x, z, margin = 0) => Number.isFinite(x) && Number.isFinite(z)
  && x >= bounds.minX + margin && x <= bounds.maxX - margin
  && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;

export function earthfallCatchHeight(elapsed, startVelocity = -SOURCE_EARTHFALL.terminalSpeed) {
  const p = Math.max(0, Math.min(1, Number(elapsed) / SOURCE_EARTHFALL.catch.settleSeconds || 0));
  const height = SOURCE_EARTHFALL.catch.interceptY;
  const v = Math.max(-SOURCE_EARTHFALL.terminalSpeed, Math.min(0, Number(startVelocity) || 0));
  return height * (2 * p ** 3 - 3 * p ** 2 + 1)
    + v * SOURCE_EARTHFALL.catch.settleSeconds * (p ** 3 - 2 * p ** 2 + p);
}

export function earthfallCatchVelocity(elapsed, startVelocity = -SOURCE_EARTHFALL.terminalSpeed) {
  const p = Math.max(0, Math.min(1, Number(elapsed) / SOURCE_EARTHFALL.catch.settleSeconds || 0));
  const height = SOURCE_EARTHFALL.catch.interceptY;
  const v = Math.max(-SOURCE_EARTHFALL.terminalSpeed, Math.min(0, Number(startVelocity) || 0));
  return height / SOURCE_EARTHFALL.catch.settleSeconds * (6 * p ** 2 - 6 * p)
    + v * (3 * p ** 2 - 4 * p + 1);
}

// One deterministic fracture field lets the renderer show the exact sheet whose
// support disappears. Chunk indices, not live random calls, determine the pose.
// The caller supplies its actual chunk centre/bounds; this owns no asset mesh.
export function sourceEarthfallFracturePose(index, elapsed, center = { x: 0, y: 100, z: -14 }) {
  const hash = salt => { const n = Math.sin((Number(index) + 1) * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
  const delay = .2 + hash(1) * 1.7;
  const age = Math.max(0, (Number(elapsed) || 0) - delay);
  const lost = Math.max(0, (Number(elapsed) || 0) - SOURCE_EARTHFALL.footingLossAt);
  const collapse = Math.min(1, age / Math.max(.1, SOURCE_EARTHFALL.footingLossAt - delay));
  return {
    x: Number(center.x) + (hash(2) - .5) * collapse * 1.3,
    y: Number(center.y) - collapse ** 2 * .65 - Math.min(180, 4.9 * lost ** 2),
    z: Number(center.z) + (hash(3) - .5) * collapse * 1.3,
    pitch: (hash(4) - .5) * collapse * .24 + (hash(5) - .5) * lost * .3,
    roll: (hash(6) - .5) * collapse * .24 + (hash(7) - .5) * lost * .3,
    yaw: (hash(8) - .5) * lost * .18,
    loss: collapse,
    support: elapsed < SOURCE_EARTHFALL.footingLossAt,
  };
}
