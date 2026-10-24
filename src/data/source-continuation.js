// Task-local geometry. These exact surfaces are shared by rendering and support.
export const SOURCE_CONTINUATION = Object.freeze({
  version: 1, encounterId: 'source-wrong-return-catch', walkSpeed: 3.2,
  eyeHeight: 1.62, bodyRadius: .22, bodyHeight: 1.9, maximumStep: .45, gravity: 9.8,
  fixedStep: 1 / 120, doorSwingSeconds: .45, doorPassFraction: .85, recoverySeconds: 1.6, recoveryMaximumSeconds: 8, recoverySpeed: 5, recoveryRise: 1.3, revealSeconds: 1.2, graceSeconds: 3,
  spawn: Object.freeze({ x: 0, z: 2, feet: 0, yaw: 0, pitch: 0 }),
  wrongReturn: Object.freeze({ transferX: -13.2, warningSeconds: 3, closureSpeed: .65, refuge: { x: 0, z: -1, feet: 3 } }),
  catch: Object.freeze({
    center: { x: -23, z: 0 }, top: 3, layerDrop: 3.6, levels: 6, ringHalfExtent: 6.3,
    outer: { minX: -32, maxX: -14, minZ: -9, maxZ: 9 },
    centers: [{ x: -23, z: 0 }, { x: -25, z: 0 }, { x: -25, z: 2 }, { x: -23, z: 2 }, { x: -23, z: 0 }, { x: -25, z: 0 }],
    finalApproach: { x: -25.2, z: 0, feet: -15, yaw: Math.PI / 2, pitch: 0 },
    finalDoor: { x: -24, z: 0, y: -15 },
    refuge: { x: -30.5, z: 7.5 }, counterweightRadius: .72,
    counterweightSpeed: 1.2, counterweightWarningSeconds: 3,
    hoist: {
      shaft: { x: -23.01, z: 1.99 }, start: { x: -17.7, z: -4.5 },
      travelY: 5.8, railY: 8.4, drumHeight: 1.451, drumRadius: .73, clearance: .2,
      returnSpeed: 1.6, upSpeed: 3.6, traverseSpeed: 3.2, downSpeed: 1.6,
      rewindSeconds: 1.2, loweringWarningSeconds: 2.5,
    },
  }),
});

const rect = (id, phase, minX, maxX, minZ, maxZ, y, extra = {}) => ({ id, phase, kind: 'rect', minX, maxX, minZ, maxZ, y, thickness: .22, material: 'cold-stone', ...extra });
const floor = level => SOURCE_CONTINUATION.catch.top - level * SOURCE_CONTINUATION.catch.layerDrop;
export const continuationCatchFloor = floor;
export const CONTINUATION_DROP_LIPS = Object.freeze([
  { id: 'catch-lip-0', level: 0, x: -19.55, z: 0, dx: -1, dz: 0 },
  { id: 'catch-lip-1', level: 1, x: -25, z: -3.45, dx: 0, dz: 1 },
  { id: 'catch-lip-2', level: 2, x: -28.45, z: 2, dx: 1, dz: 0 },
  { id: 'catch-lip-3', level: 3, x: -23, z: 5.45, dx: 0, dz: -1 },
  { id: 'catch-lip-4', level: 4, x: -26.45, z: 0, dx: 1, dz: 0 },
]);
export const CONTINUATION_ALTERNATE_LIPS = Object.freeze([
  { id: 'catch-lip-0-other', level: 0, x: -23, z: -3.45, dx: 0, dz: 1 },
  { id: 'catch-lip-1-other', level: 1, x: -21.55, z: 0, dx: -1, dz: 0 },
  { id: 'catch-lip-2-other', level: 2, x: -25, z: 5.45, dx: 0, dz: -1 },
  { id: 'catch-lip-3-other', level: 3, x: -26.45, z: 2, dx: 1, dz: 0 },
  { id: 'catch-lip-4-other', level: 4, x: -19.55, z: 0, dx: -1, dz: 0 },
]);

const wrongSurfaces = [
  rect('wrong-entry', 'wrong-return', -9, 3, -4, 4, 0, { role: 'entry' }),
  rect('wrong-west-outbound', 'wrong-return', -9, -3, -20, -4, 0, { role: 'outbound' }),
  rect('wrong-far-room', 'wrong-return', -9, 9, -22, -16, 0, { role: 'turn' }),
  { ...rect('wrong-east-ramp', 'wrong-return', 3, 9, -16, -4, 0), kind: 'ramp', axis: 'z', y0: 0, y1: 3, role: 'ramp' },
  rect('wrong-upper-return', 'wrong-return', -3, 9, -4, 2, 3, { role: 'return', material: 'case-lining' }),
  rect('wrong-false-porch', 'wrong-return', 4.6, 7.4, 2, 3.8, 3, { role: 'false-return' }),
  rect('wrong-transfer-bridge', 'wrong-return', -14, -3, -2, 0, 3, { role: 'transfer' }),
];
const catchSurfaces = [];
for (let level = 0; level < SOURCE_CONTINUATION.catch.levels; level++) {
  const c = SOURCE_CONTINUATION.catch.centers[level], y = floor(level), h = SOURCE_CONTINUATION.catch.ringHalfExtent, extra = { level, role: 'catch', material: level % 2 ? 'piano-wood' : 'case-lining' };
  catchSurfaces.push(
    rect(`catch-${level}-west`, 'catch', c.x - h, c.x - 3, c.z - h, c.z + h, y, extra),
    rect(`catch-${level}-east`, 'catch', c.x + 3, c.x + h, c.z - h, c.z + h, y, extra),
    rect(`catch-${level}-north`, 'catch', c.x - 3, c.x + 3, c.z - h, c.z - 3, y, extra),
    rect(`catch-${level}-south`, 'catch', c.x - 3, c.x + 3, c.z + 3, c.z + h, y, extra),
    rect(`catch-${level}-return-arm`, 'catch', -31.5, c.x - 3, c.z + 3.5, c.z + 5, y, { ...extra, role: 'return-arm' }),
    rect(`catch-${level}-return-stem`, 'catch', -31.5, -29.5, c.z + 3.5, 8.9, y, { ...extra, role: 'return-arm' }),
    rect(`catch-${level}-return-pad`, 'catch', -31.5, -29.5, 6.5, 8.9, y, { ...extra, role: 'refuge' }),
  );
}
catchSurfaces.push(
  rect('catch-entry-bridge', 'catch', -20, -3, -2, 0, 3, { level: 0, role: 'transfer' }),
  rect('catch-final-balcony', 'catch', -28.5, -23.5, -1.1, 1.1, -15, { level: 5, role: 'final-balcony', material: 'piano-wood' }),
  rect('catch-recovery-floor', 'catch', -32, -14, -9, 9, floor(6), { level: 6, role: 'recovery', material: 'cold-stone' }),
);
// These small, visibly unsupported cloth catches make a missed footprint safe.
const recoveryPatches = [
  [-23.9, -22.1, -3, -1.2], [-23.8, -22, -.9, .9],
  [-25.9, -24.1, 3.2, 5], [-26, -24.2, 1.1, 2.9], [-21.8, -20, -.9, .9],
];
recoveryPatches.forEach((b, level) => catchSurfaces.push(rect(`catch-${level}-loose-lining`, 'catch', ...b, floor(level) - 1.4, { level, role: 'recovery-shelf', material: 'loose-lining' })));
const walls = [
  { id: 'wrong-west-wall', phase: 'wrong-return', minX: -9.3, maxX: -9, minZ: -22.3, maxZ: 4, minY: -.2, maxY: 3, material: 'cold-wall' },
  { id: 'wrong-far-wall', phase: 'wrong-return', minX: -9, maxX: 9.3, minZ: -22.3, maxZ: -22, minY: -.2, maxY: 3.2, material: 'cold-wall' },
  { id: 'wrong-east-wall', phase: 'wrong-return', minX: 9, maxX: 9.3, minZ: -22, maxZ: 3.8, minY: -.2, maxY: 6, material: 'cold-wall' },
  { id: 'wrong-case-footprint', phase: 'wrong-return', minX: -8.72, maxX: -7.28, minZ: -18.112, maxZ: -17.548, minY: 0, maxY: .286, material: 'case-lining', role: 'furniture' },
  { id: 'wrong-piano-footprint', phase: 'wrong-return', minX: -.648, maxX: .790, minZ: -21.740, maxZ: -19.661, minY: 0, maxY: .91, material: 'piano-wood', role: 'furniture' },
];
for (let level = 0; level <= 6; level++) {
  const y = floor(level), c = SOURCE_CONTINUATION.catch.centers[level], h = SOURCE_CONTINUATION.catch.ringHalfExtent;
  if (c) {
    const edge = { phase: 'catch', minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' };
    walls.push(
      { ...edge, id: `catch-${level}-west-rail-north`, minX: c.x - h - .2, maxX: c.x - h, minZ: c.z - h - .2, maxZ: c.z + 3.35 },
      { ...edge, id: `catch-${level}-west-rail-south`, minX: c.x - h - .2, maxX: c.x - h, minZ: c.z + 5.15, maxZ: c.z + h + .2 },
      { ...edge, id: `catch-${level}-north-rail`, minX: c.x - h, maxX: c.x + h, minZ: c.z - h - .2, maxZ: c.z - h },
      { ...edge, id: `catch-${level}-south-rail`, minX: Math.max(c.x - h, -29.35), maxX: c.x + h, minZ: c.z + h, maxZ: c.z + h + .2 },
      ...(level === 0 ? [
        { ...edge, id: 'catch-0-east-rail-north', minX: c.x + h, maxX: c.x + h + .2, minZ: c.z - h - .2, maxZ: -2.1 },
        { ...edge, id: 'catch-0-east-rail-south', minX: c.x + h, maxX: c.x + h + .2, minZ: .1, maxZ: c.z + h + .2 },
      ] : [{ ...edge, id: `catch-${level}-east-rail`, minX: c.x + h, maxX: c.x + h + .2, minZ: c.z - h - .2, maxZ: c.z + h + .2 }]),
    );
    continue;
  }
  walls.push(
    { id: `catch-${level}-west-rail`, phase: 'catch', minX: -32.2, maxX: -32, minZ: -9.2, maxZ: 9.2, minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' },
    ...((level === 0) ? [
      { id: 'catch-0-east-rail-north', phase: 'catch', minX: -14, maxX: -13.8, minZ: -9.2, maxZ: -2.1, minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' },
      { id: 'catch-0-east-rail-south', phase: 'catch', minX: -14, maxX: -13.8, minZ: .1, maxZ: 9.2, minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' },
    ] : [{ id: `catch-${level}-east-rail`, phase: 'catch', minX: -14, maxX: -13.8, minZ: -9.2, maxZ: 9.2, minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' }]),
    { id: `catch-${level}-north-rail`, phase: 'catch', minX: -32, maxX: -14, minZ: -9.2, maxZ: -9, minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' },
    { id: `catch-${level}-south-rail`, phase: 'catch', minX: -32, maxX: -14, minZ: 9, maxZ: 9.2, minY: y, maxY: y + 1.1, level, material: 'dark-metal', role: 'rail' },
  );
}
const door = (id, phase, x, y, z, yaw, role, extra = {}) => ({ id, phase, x, y, z, yaw, role, width: 1.8, height: 2.3, ...extra });
const doors = [
  door('wrong-entry-return', 'wrong-return', 0, 0, 3.5, Math.PI, 'return'),
  door('wrong-false-return', 'wrong-return', 6, 3, 2, 0, 'false-return'),
  door('wrong-onward', 'wrong-return', -3.1, 3, -1, -Math.PI / 2, 'onward'),
  ...Array.from({ length: 7 }, (_, level) => door(`catch-return-${level}`, 'catch', -30.5, floor(level), 8.4, 0, 'return', { level })),
  door('catch-final', 'catch', -24, -15, 0, Math.PI / 2, 'final', { level: 5 }),
];
const props = [
  { id: 'wrong-case-hinge', phase: 'wrong-return', kind: 'case-hinge', mesh: 'instrument_case', x: -8, y: 0, z: -17.8, yaw: 0, scaleX: 1.2, scaleY: .8, scaleZ: 1.2, role: 'landmark' },
  { id: 'wrong-piano', phase: 'wrong-return', kind: 'piano', mesh: 'grand_piano', x: 0, y: 0, z: -20.5, yaw: 0, scaleX: .8, scaleY: .8, scaleZ: .8, role: 'landmark' },
  { id: 'wrong-original-seam', phase: 'wrong-return', kind: 'seam', x: -.9, y: 1.1, z: 3.45, role: 'original-clue' },
  { id: 'wrong-return-seam', phase: 'wrong-return', kind: 'seam', x: -3.08, y: 4.1, z: -1.65, role: 'matching-clue' },
  ...[...CONTINUATION_DROP_LIPS, ...CONTINUATION_ALTERNATE_LIPS].map(p => ({ ...p, phase: 'catch', kind: 'release-lip', y: floor(p.level) + .025, role: 'drop' })),
];
export function continuationSurfaceY(surface, x, z) {
  if (surface.kind !== 'ramp') return surface.y;
  const t = Math.max(0, Math.min(1, (z - surface.minZ) / (surface.maxZ - surface.minZ)));
  return surface.y0 + (surface.y1 - surface.y0) * t;
}
const phaseOf = value => typeof value === 'string' ? value : value?.phase || 'wrong-return';
export function continuationSurfaces(value = {}) { return phaseOf(value) === 'catch' ? catchSurfaces : wrongSurfaces; }
export function continuationSolids(value = {}) {
  const phase = phaseOf(value), result = walls.filter(p => p.phase === phase);
  if (phase === 'wrong-return' && value.closure?.mode === 'closing') result.push({ id: 'wrong-closing-front', phase, minX: 1.3, maxX: 9, minY: 3, maxY: 6.2, minZ: value.closure.frontZ - .18, maxZ: value.closure.frontZ + .18, material: 'cold-wall', role: 'closure' });
  return result;
}
export function continuationDoors(value = {}) { return doors.filter(p => p.phase === phaseOf(value)); }
export function continuationProps(value = {}) { return props.filter(p => p.phase === phaseOf(value)); }
export function continuationSurfaceContains(surface, x, z, margin = 0) { return x >= surface.minX + margin && x <= surface.maxX - margin && z >= surface.minZ + margin && z <= surface.maxZ - margin; }
export function continuationSupportAt(x, z, value = {}, options = {}) {
  const feet = Number.isFinite(options.feet) ? options.feet : Number.isFinite(value.feet) ? value.feet : 0;
  const maxY = options.maxY ?? feet + SOURCE_CONTINUATION.maximumStep, minY = options.minY ?? feet - SOURCE_CONTINUATION.maximumStep;
  return continuationSurfaces(value).filter(s => continuationSurfaceContains(s, x, z)).map(s => ({ id: s.id, y: continuationSurfaceY(s, x, z), level: s.level ?? 0, surface: s })).filter(s => s.y <= maxY + 1e-7 && s.y >= minY - 1e-7).sort((a, b) => b.y - a.y)[0] || null;
}
export function continuationDropLip(value = {}) { return CONTINUATION_DROP_LIPS.find(p => p.level === value.level) || null; }
export function continuationDropLips(value = {}) { return [...CONTINUATION_DROP_LIPS, ...CONTINUATION_ALTERNATE_LIPS].filter(p => p.level === value.level); }
export function continuationRefugeAt(value = {}) { return value.phase === 'catch' ? { ...SOURCE_CONTINUATION.catch.refuge, feet: floor(value.level ?? 0), level: value.level ?? 0 } : { ...SOURCE_CONTINUATION.wrongReturn.refuge }; }

// Conservative configuration-space boxes for authored cable sweeps. Door
// apertures count as closed here, so recovery never needs a leaf to be open.
export function continuationCatchObstacles() {
  return [
    ...catchSurfaces.map(s => ({ id: s.id, minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, minY: s.y - s.thickness, maxY: s.y })),
    ...walls.filter(s => s.phase === 'catch'),
    ...doors.filter(d => d.phase === 'catch').map(d => Math.abs(Math.sin(d.yaw)) > .5
      ? { id: d.id, minX: d.x - .14, maxX: d.x + .14, minZ: d.z - d.width / 2 - .08, maxZ: d.z + d.width / 2 + .08, minY: d.y, maxY: d.y + d.height }
      : { id: d.id, minX: d.x - d.width / 2 - .08, maxX: d.x + d.width / 2 + .08, minZ: d.z - .14, maxZ: d.z + .14, minY: d.y, maxY: d.y + d.height }),
  ];
}
export function continuationBodyClearAt(point, { radius = .22, height = 1.9, margin = 0, obstacles = continuationCatchObstacles() } = {}) {
  const y = point.feet ?? point.y, r = radius + margin;
  return !obstacles.some(s => {
    if (y >= s.maxY - 1e-7 || y + height <= s.minY + 1e-7) return false;
    const dx = Math.max(s.minX - point.x, 0, point.x - s.maxX), dz = Math.max(s.minZ - point.z, 0, point.z - s.maxZ);
    return dx * dx + dz * dz < r * r - 1e-9;
  });
}
