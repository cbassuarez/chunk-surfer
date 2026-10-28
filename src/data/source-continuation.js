import {SOURCE_EARTHFALL} from './source-earthfall.js';

// One persistent construction in local metres. Both Sources and their threshold
// exist together; phase names describe the journey, not which floor is drawn.
const freeze = Object.freeze;
const TAU = Math.PI * 2;
export const CONTINUATION_CATCH_STAGES = freeze([
  { level: 0, id: 'case-crescent', name: 'The open case', y: 8.4, innerRadius: 6.2, outerRadius: 13, startAngle: -1.35, endAngle: 1.35, material: 'case-lining', construction: 'case', refugeAngle: .92 },
  { level: 1, id: 'soundboard-fan', name: 'The soundboard', y: 2.4, innerRadius: 4.2, outerRadius: 12.5, startAngle: -Math.PI / 2, endAngle: Math.PI, material: 'piano-wood', construction: 'soundboard', refugeAngle: 2.35 },
  { level: 2, id: 'masonry-counterarc', name: 'The counterarc', y: -4.8, innerRadius: 2.6, outerRadius: 11.5, startAngle: Math.PI / 2, endAngle: Math.PI * 1.5, material: 'cold-stone', construction: 'masonry', refugeAngle: 4.13 },
  { level: 3, id: 'binding-dish', name: 'The binding', y: -12.6, innerRadius: 1.2, outerRadius: 9.8, startAngle: -Math.PI / 2, endAngle: Math.PI + .15, material: 'case-lining', construction: 'binding', refugeAngle: .9 },
]);
export const SOURCE_CONTINUATION = freeze({
  version: 1, layoutVersion: 2, encounterId: 'source-wrong-return-catch', walkSpeed: 3.2,
  eyeHeight: 1.62, bodyRadius: .22, bodyHeight: 1.9, maximumStep: .45, gravity: 9.8,
  fixedStep: 1 / 120, doorSwingSeconds: .65, doorPassFraction: .85, doorApproachDistance: 6.5,
  recoverySeconds: 1.6, recoveryMaximumSeconds: 12, recoverySpeed: 6, recoveryRise: 3,
  revealSeconds: 0, graceSeconds: 3, bounds: { minX: -56, maxX: 28, minZ: -38, maxZ: 8, minY: -23, maxY: 115 },
  spawn: freeze({ x: 0, z: 2, feet: 0, yaw: 0, pitch: 0 }),
  wrongReturn: freeze({ transferX: -18, warningSeconds: 6, closureSpeed: .62,
    pressureDelay: 12, closureStartX: 16.5, closureEndX: -15.5,
    refuge: { x: 0, z: -19, feet: 8.4 }, threshold: { x: -18, z: -12, y: 8.4, halfWidth: .9, normal: [-1, 0] } }),
  catch: freeze({ center: { x: -38, z: -12 }, top: 8.4, layerDrop: 6,
    levels: CONTINUATION_CATCH_STAGES.length, ringHalfExtent: 13,
    outer: { minX: -53, maxX: -23, minZ: -27, maxZ: 3 },
    centers: CONTINUATION_CATCH_STAGES.map(() => ({ x: -38, z: -12 })),
    finalApproach: { x: -30, z: -12, feet: -12.6, yaw: Math.PI / 2, pitch: 0 },
    finalDoor: { x: -28.7, z: -12, y: -12.6 },
    refuge: { x: -38 + Math.cos(.92) * 14.25, z: -12 + Math.sin(.92) * 14.25 }, counterweightRadius: .72,
    counterweightSpeed: 1.15, counterweightWarningSeconds: 6,
    hoist: { shaft: { x: -54, z: -12 }, start: { x: -30.29, z: -3.27 },
      travelY: 13.5, railY: 16.3, drumHeight: 1.451, drumRadius: .73, clearance: .2,
      returnSpeed: 2, upSpeed: 4.5, traverseSpeed: 4, downSpeed: 1.8,
      rewindSeconds: 1.8, loweringWarningSeconds: 4 },
  }),
});
const C = SOURCE_CONTINUATION;
export const continuationCatchFloor = level => CONTINUATION_CATCH_STAGES[Math.min(3, Math.max(0, Math.round(level)))]?.y ?? -12.6;
export const continuationStage = level => CONTINUATION_CATCH_STAGES[Math.min(3, Math.max(0, Math.round(Number(level) || 0)))];
export function continuationRadialPoint(radius, angle) { return { x: C.catch.center.x + Math.cos(angle) * radius, z: C.catch.center.z + Math.sin(angle) * radius }; }
const rect = (id, phase, minX, maxX, minZ, maxZ, y, extra = {}) => ({ id, phase, region: phase, kind: 'rect', minX, maxX, minZ, maxZ, y, thickness: .35, material: 'cold-stone', ...extra });
const ii = (id, bounds, y, extra = {}) => rect(id, 'wrong-return', ...bounds, y, extra);
const wrongSurfaces = [
  ii('wrong-entry', [-4, 4, -4, .5], 0, { role: 'entry', construction: 'entry-folio' }),
  ii('wrong-entry-throat', [-1.8, 1.8, .5, 5], 0, { role: 'transfer', construction: 'entry-folio' }),
  ii('wrong-ground-cross', [-12, 18, -5, -1], 0, { role: 'exploration', construction: 'case-spine' }),
  ii('wrong-ground-west', [-12, -8, -32, -3], 0, { role: 'exploration', construction: 'masonry' }),
  ii('wrong-ground-east', [14, 18, -32, -3], 0, { role: 'exploration', construction: 'soundboard' }),
  ii('wrong-ground-north', [-12, 18, -35, -29], 0, { role: 'exploration', construction: 'binding' }),
  ii('wrong-ground-branch', [-12, 18, -25, -19], 0, { role: 'branch', construction: 'masonry' }),
  ii('wrong-east-stair-foot', [14, 22, -9, -5], 0, { role: 'stair-foot' }),
  ii('wrong-mid-east-head', [13, 22, -33, -27], 4.2, { role: 'landing', material: 'piano-wood' }),
  ii('wrong-mid-north', [-10, 19, -33, -29], 4.2, { role: 'exploration', material: 'piano-wood' }),
  ii('wrong-mid-west', [-10, -6, -31, -7], 4.2, { role: 'exploration', material: 'case-lining' }),
  ii('wrong-mid-south', [-15, 26, -9, -5], 4.2, { role: 'return', material: 'case-lining' }),
  ii('wrong-mid-branch', [-6, 13, -22, -18], 4.2, { role: 'branch', material: 'piano-wood' }),
  ii('wrong-mid-east', [9, 13, -30, -7], 4.2, { role: 'exploration', material: 'piano-wood' }),
  ii('wrong-west-stair-foot', [-15, -6, -11, -5], 4.2, { role: 'stair-foot', material: 'case-lining' }),
  ii('wrong-upper-west-head', [-18, -6, -33, -27], 8.4, { role: 'landing' }),
  ii('wrong-upper-west', [-18, -15, -31, -10], 8.4, { role: 'exploration' }),
  ii('wrong-upper-cross', [-18, 18, -14, -10], 8.4, { role: 'return', material: 'case-lining' }),
  ii('wrong-upper-north', [-18, 26, -35, -31], 8.4, { role: 'exploration' }),
  ii('wrong-upper-east', [14, 18, -33, -14], 8.4, { role: 'exploration' }),
  ii('wrong-upper-east-head', [14, 26, -33, -27], 8.4, { role: 'landing' }),
  ii('wrong-upper-refuge', [-4, 4, -23, -13], 8.4, { role: 'refuge', material: 'piano-wood' }),
  ii('wrong-overlook-arm', [4, 8, -12, 5], 8.4, { role: 'false-return', material: 'case-lining' }),
  ii('wrong-false-porch', [3.5, 9, 1, 6], 8.4, { role: 'false-return', material: 'case-lining' }),
];
// Real treads, rather than ramps with a staircase painted on them. Three
// interlocked flights have separate supports and readable over/under joints.
function stairs(id, minX, maxX, lowY, highY, northHigh) {
  const minZ = -29, maxZ = -9, n = 14, run = (maxZ - minZ) / n;
  return Array.from({ length: n }, (_, k) => ii(`${id}-${k}`, [minX, maxX, minZ + k * run, minZ + (k + 1) * run], northHigh ? highY - (highY - lowY) * k / n : lowY + (highY - lowY) * (k + 1) / n,
    { role: 'stair', construction: 'interlocked-stair', stairId: id, step: k, thickness: .24, material: 'piano-wood' }));
}
wrongSurfaces.push(...stairs('wrong-east-stair', 18, 22, 0, 4.2, true), ...stairs('wrong-west-stair', -14, -10, 4.2, 8.4, true), ...stairs('wrong-return-stair', 22, 26, 4.2, 8.4, true));
const bridge = rect('catch-entry-bridge', 'catch', -25.2, -17.8, -13.1, -10.9, 8.4, { level: 0, role: 'transfer', material: 'case-lining', construction: 'hinge' });
const catchSurfaces = [bridge];
for (const stage of CONTINUATION_CATCH_STAGES) {
  const { x, z } = C.catch.center, r = stage.outerRadius;
  catchSurfaces.push({ id: `catch-${stage.level}-${stage.id}`, phase: 'catch', region: 'catch', kind: 'sector', center: { x, z }, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r,
    innerRadius: stage.innerRadius, outerRadius: r, startAngle: stage.startAngle, endAngle: stage.endAngle, y: stage.y, thickness: .48,
    level: stage.level, role: 'catch', material: stage.material, construction: stage.construction, angularSegments: 48 });
  const refuge = continuationRadialPoint(stage.outerRadius + 1.25, stage.refugeAngle);
  // The refuge is a visibly separate pocket on the outside of the machinery's
  // path. Its neck deliberately overlaps the radial slab, with no gap bridge.
  const neck = continuationRadialPoint(stage.outerRadius - .55, stage.refugeAngle);
  const radius = 1.45;
  catchSurfaces.push(rect(`catch-${stage.level}-return-pad`, 'catch', refuge.x - radius, refuge.x + radius, refuge.z - radius, refuge.z + radius, stage.y,
    { level: stage.level, role: 'refuge', material: 'case-lining', construction: 'case' }));
  catchSurfaces.push(rect(`catch-${stage.level}-return-arm`, 'catch', Math.min(neck.x, refuge.x) - .9, Math.max(neck.x, refuge.x) + .9, Math.min(neck.z, refuge.z) - .9, Math.max(neck.z, refuge.z) + .9, stage.y,
    { level: stage.level, role: 'return-arm', material: 'piano-wood', construction: 'binding' }));
}
catchSurfaces.push(rect('catch-final-balcony', 'catch', -33.5, -27, -13.2, -10.8, -12.6,
  { level: 3, role: 'final-balcony', material: 'piano-wood', construction: 'soundboard' }));
const wall = (id, minX, maxX, minZ, maxZ, minY, maxY, extra = {}) => ({ id, phase: 'wrong-return', region: 'wrong-return', minX, maxX, minZ, maxZ, minY, maxY, material: 'cold-wall', ...extra });
const walls = [
  wall('wrong-entry-back-west', -1.8, -1.58, 3.38, 3.62, 0, 3.3), wall('wrong-entry-back-east', 1.58, 1.8, 3.38, 3.62, 0, 3.3),
  wall('wrong-entry-return-jamb-west', -1.59, -1.5, 3.35, 3.65, 0, 3.3), wall('wrong-entry-return-jamb-east', 1.5, 1.59, 3.35, 3.65, 0, 3.3),
  ...[1, 1.4, 1.8, 2.2, 2.6, 2.9, 3.35, 3.75, 4.15, 4.55, 4.95, 5.35, 5.75, 6].map((z, i) => wall(`wrong-overlook-post-${i}`, 3.5, 3.56, z - .03, z + .03, 8.4, 9.15, { role: 'overlook-rail', material: 'worn-metal' })),
  wall('wrong-overlook-toprail-near', 3.5, 3.56, 1, 2.93, 9.1, 9.15, { role: 'overlook-rail', material: 'worn-metal' }),
  wall('wrong-overlook-toprail-far', 3.5, 3.56, 3.32, 6, 9.1, 9.15, { role: 'overlook-rail', material: 'worn-metal' }),
  wall('wrong-overlook-kickstrip', 3.5, 3.56, 1, 6, 8.4, 8.45, { role: 'overlook-rail', material: 'worn-metal' }),
  wall('wrong-onward-jamb-north', -18.15, -17.85, -13.18, -12.9, 8.4, 11.2), wall('wrong-onward-jamb-south', -18.15, -17.85, -11.1, -10.82, 8.4, 11.2),
  wall('source-spindle', -38.42, -37.58, -12.42, -11.58, -20, 18, { phase: 'catch', region: 'catch', role: 'spindle', material: 'dark-metal' }),
  ...[-3.02, 3.02].map((x, i) => wall(`ii-entry-arch-pier-${i}`, x - .25, x + .25, -4.36, -3.64, 0, 2.9, { role: 'arch-pier' })),
  ...[-25.02, -18.98].map((z, i) => wall(`ii-mid-arch-pier-${i}`, 9.64, 10.36, z - .25, z + .25, 4.2, 7.1, { role: 'arch-pier' })),
  ...[-3.02, 3.02].map((x, i) => wall(`ii-refuge-arch-pier-${i}`, x - .25, x + .25, -19.36, -18.64, 8.4, 11.3, { role: 'arch-pier' })),
];
const door = (id, phase, x, y, z, yaw, role, extra = {}) => ({ id, phase, region: phase, x, y, z, yaw, role, width: 1.8, height: 2.3, ...extra });
const doors = [
  door('wrong-entry-return', 'wrong-return', 0, 0, 3.5, 0, 'return', { width: 3, height: 3.05, normal: { x: 0, z: 1 } }),
  door('wrong-false-return', 'wrong-return', 6, 8.4, 3.5, 0, 'false-return'),
  door('wrong-onward', 'wrong-return', -18, 8.4, -12, -Math.PI / 2, 'onward', { threshold: true }),
  ...CONTINUATION_CATCH_STAGES.map(stage => {
    const at = continuationRadialPoint(stage.outerRadius + 1.25, stage.refugeAngle);
    const normal = { x: Math.cos(stage.refugeAngle), z: Math.sin(stage.refugeAngle) };
    return door(`catch-return-${stage.level}`, 'catch', at.x + normal.x * .9, stage.y, at.z + normal.z * .9, stage.refugeAngle - Math.PI / 2, 'return', { level: stage.level, normal });
  }),
  door('catch-final', 'catch', C.catch.finalDoor.x, C.catch.finalDoor.y, C.catch.finalDoor.z, Math.PI / 2, 'final', { level: 3 }),
];
// The route behind the shared door remains real after ownership changes.
// The return plane commits before the player reaches this former owner's
// territory; retaining it makes looking back accountable, not a new branch.
const entrance = doors.find(d => d.id === 'wrong-entry-return');
const inheritedOffset = { x: entrance.x, y: entrance.y - SOURCE_EARTHFALL.lowerFloor, z: entrance.z - SOURCE_EARTHFALL.passage.exitZ };
const throatEnd = wrongSurfaces.find(s => s.id === 'wrong-entry-throat').maxZ;
export const CONTINUATION_EARTHFALL_BACKSIDE = freeze([
  rect('inherited-earthfall-spine', 'wrong-return', inheritedOffset.x - SOURCE_EARTHFALL.passage.halfWidth, inheritedOffset.x + SOURCE_EARTHFALL.passage.halfWidth,
    throatEnd, SOURCE_EARTHFALL.catch.minZ + .5 + inheritedOffset.z, SOURCE_EARTHFALL.lowerFloor + inheritedOffset.y,
    { role: 'inherited-earthfall', construction: 'former-lower-path', thickness: .55, material: 'source' }),
  rect('inherited-earthfall-landing', 'wrong-return', SOURCE_EARTHFALL.catch.minX + inheritedOffset.x, SOURCE_EARTHFALL.catch.maxX + inheritedOffset.x,
    SOURCE_EARTHFALL.catch.minZ + inheritedOffset.z, SOURCE_EARTHFALL.catch.maxZ + inheritedOffset.z, SOURCE_EARTHFALL.lowerFloor + inheritedOffset.y,
    { role: 'inherited-earthfall', construction: 'former-landing-head', thickness: SOURCE_EARTHFALL.catch.thickness, material: 'earthfall-backing' }),
]);
const allSurfaces = freeze([...wrongSurfaces, ...catchSurfaces, ...CONTINUATION_EARTHFALL_BACKSIDE]);

const makeLip = (level, angle, suffix = '') => {
  const stage = continuationStage(level), at = continuationRadialPoint(stage.innerRadius + .26, angle);
  return { id: `catch-lip-${level}${suffix}`, level, ...at, dx: -Math.cos(angle), dz: -Math.sin(angle), approachAngle: angle };
};
export const CONTINUATION_DROP_LIPS = freeze([makeLip(0, 0), makeLip(1, Math.PI), makeLip(2, Math.PI / 2 + .15)]);
export const CONTINUATION_ALTERNATE_LIPS = freeze([makeLip(0, -.92, '-other'), makeLip(1, 2.1, '-other'), makeLip(2, 2.75, '-other')]);
const props = [
  { id: 'wrong-remembered-entry', phase: 'wrong-return', kind: 'seam', x: -.9, y: 1.1, z: 3.45, role: 'remembered-entry' },
  ...[...CONTINUATION_DROP_LIPS, ...CONTINUATION_ALTERNATE_LIPS].map(p => ({ ...p, phase: 'catch', kind: 'release-lip', y: continuationCatchFloor(p.level) + .025, role: 'drop' })),
];
// Model anatomy is assigned a support rather than scattered as scenery. These
// low, open native assemblies visibly carry selected exploration platforms;
// the dedicated architecture pack supplies curved sectors and their brackets.
export const CONTINUATION_ASSEMBLIES = freeze([
  { id: 'ii-open-case-ground', mesh: 'source_ii_case_floor', supportId: 'wrong-ground-cross', x: 3, y: -.2225 * 12, z: -3, yaw: 0, scaleX: 12, scaleY: 12, scaleZ: 12, orientation: 'upright', role: 'structural-case' },
  { id: 'ii-piano-mid', mesh: 'source_ii_piano_soundboard', supportId: 'wrong-mid-branch', x: 3, y: 4.2 - 1.1375 * 7, z: -20, yaw: Math.PI / 2, scaleX: 7, scaleY: 7, scaleZ: 7, orientation: 'upright', role: 'structural-soundboard' },
  { id: 'ii-tower-return', mesh: 'source_ii_tower_cap', supportId: 'wrong-upper-north', x: 3, y: 8.4 - 2.77 * 2, z: -33, yaw: 0, scaleX: 3.4, scaleY: 2, scaleZ: 1, orientation: 'upright', role: 'structural-frame' },
  { id: 'ii-ellery-bank', mesh: 'source_ii_ellery_bay', x: 31, y: -8, z: -46, yaw: 0, scaleX: 1, scaleY: 1, scaleZ: 1, orientation: 'upright', role: 'remembered-architecture' },
  { id: 'ii-ellery-overhead', mesh: 'source_ii_ellery_corner', x: 3, y: 12, z: -44.5, yaw: 0, roll: Math.PI / 2, scaleX: 1, scaleY: 1, scaleZ: 1, orientation: 'sideways', role: 'remembered-architecture' },
  { id: 'iii-chapel-inverted-bank', mesh: 'source_ii_chapel_buttress', x: -57, y: 3.5, z: -12, yaw: 0, roll: Math.PI, scaleX: 1, scaleY: 1, scaleZ: 1, orientation: 'inverted', role: 'remembered-architecture' },
  { id: 'ii-whole-piano-bank', mesh: 'grand_piano', x: 15, y: -1, z: -42, yaw: 0, scaleX: 8, scaleY: 8, scaleZ: 8, orientation: 'upright', role: 'model-bank' },
  { id: 'ii-whole-case-bank', mesh: 'open_instrument_case', x: -20, y: -5, z: -3, yaw: 0, roll: Math.PI / 2, scaleX: 8, scaleY: 8, scaleZ: 8, orientation: 'sideways', role: 'model-bank' },
]);
export const CONTINUATION_STRUCTURAL_LINKS = freeze([
  { id: 'ii-stair-east', kind: 'stair', x: 20, z: -19, minZ: -29, maxZ: -9, minX: 18, maxX: 22, y0: 0, y1: 4.2, steps: 14 },
  { id: 'ii-stair-west', kind: 'stair', x: -12, z: -19, minZ: -29, maxZ: -9, minX: -14, maxX: -10, y0: 4.2, y1: 8.4, steps: 14 },
  { id: 'ii-stair-return', kind: 'stair', x: 24, z: -19, minZ: -29, maxZ: -9, minX: 22, maxX: 26, y0: 4.2, y1: 8.4, steps: 14 },
]);
export const CONTINUATION_SIGHTLINES = freeze({
  upperReturn: { eye: { x: 3.85, y: 10.02, z: 3 }, target: { x: 0, y: 1.25, z: 3.5 }, feet: 8.4, purpose: 'The original entry is physically visible through the narrow open bar window at the west edge.' },
});
export const SOURCE_CONTINUATION_ROUTES = freeze({
  main: [[0, 2], [0, -3], [16, -3], [16, -7], [20, -7], [20, -30], [-8, -30], [-8, -7], [-12, -7], [-12, -30], [-16, -30], [-16.5, -12]],
  groundBranch: [[0, -3], [-10, -3], [-10, -22], [16, -22], [16, -7]],
  upperReturn: [[-16.5, -12], [6, -12], [6, 3], [3.85, 3], [6, 3], [6, -12], [0, -12], [0, -19], [0, -12], [-16.5, -12]],
  stairLoop: [[-16, -30], [-16, -33], [16, -33], [24, -33], [24, -7], [-8, -7]],
});
export function continuationSurfaceY(surface, x, z) {
  if (surface.kind !== 'ramp') return surface.y;
  const t = Math.max(0, Math.min(1, ((surface.axis === 'x' ? x : z) - (surface.axis === 'x' ? surface.minX : surface.minZ)) / ((surface.axis === 'x' ? surface.maxX : surface.maxZ) - (surface.axis === 'x' ? surface.minX : surface.minZ))));
  return surface.y0 + (surface.y1 - surface.y0) * t;
}
export function continuationSurfaceContains(surface, x, z, margin = 0) {
  if (surface.kind !== 'sector') return x >= surface.minX + margin && x <= surface.maxX - margin && z >= surface.minZ + margin && z <= surface.maxZ - margin;
  const dx = x - surface.center.x, dz = z - surface.center.z, r = Math.hypot(dx, dz), raw = Math.atan2(dz, dx), span = surface.endAngle - surface.startAngle;
  let a = raw; while (a < surface.startAngle) a += TAU; while (a > surface.startAngle + TAU) a -= TAU;
  const angularMargin = r > 0 ? Math.asin(Math.min(1, Math.max(0, margin) / r)) : 0;
  return r >= surface.innerRadius + margin - 1e-7 && r <= surface.outerRadius - margin + 1e-7 && a >= surface.startAngle + angularMargin - 1e-7 && a <= surface.startAngle + span - angularMargin + 1e-7;
}
// Always persistent: callers must not remove the place behind the player.
export const continuationSurfaces = () => allSurfaces;
export function continuationSolids(value = {}) {
  const result = [...walls];
  if (value.closure?.mode === 'closing') { const x = Number(value.closure.frontX) || 0; result.push(wall('wrong-closing-front', x - .16, x + .16, -14, -10, 8.4, 11.4, { role: 'closure', material: 'dark-metal' })); }
  return result;
}
export const continuationDoors = () => doors;
export const continuationProps = () => props;
export function continuationSupportAt(x, z, value = {}, options = {}) {
  const feet = Number.isFinite(options.feet) ? options.feet : Number.isFinite(value.feet) ? value.feet : 0;
  const maxY = options.maxY ?? feet + C.maximumStep, minY = options.minY ?? feet - C.maximumStep;
  return allSurfaces.filter(s => continuationSurfaceContains(s, x, z, options.margin ?? 0)).map(s => ({ id: s.id, y: continuationSurfaceY(s, x, z), level: s.level ?? 0, surface: s })).filter(s => s.y <= maxY + 1e-7 && s.y >= minY - 1e-7).sort((a, b) => b.y - a.y)[0] || null;
}
export const continuationDropLip = value => CONTINUATION_DROP_LIPS.find(p => p.level === value?.level) || null;
export const continuationDropLips = value => [...CONTINUATION_DROP_LIPS, ...CONTINUATION_ALTERNATE_LIPS].filter(p => p.level === value?.level);
export function continuationRefugeAt(value = {}) {
  if (value.phase !== 'catch') return { ...C.wrongReturn.refuge, level: 0 };
  const stage = continuationStage(value.level), at = continuationRadialPoint(stage.outerRadius + 1.25, stage.refugeAngle);
  return { ...at, feet: stage.y, level: stage.level };
}
export function continuationCatchObstacles() {
  return [...allSurfaces.map(s => ({ ...s, minY: s.y - s.thickness, maxY: s.y })), ...walls,
    ...doors.map(d => ({ id: d.id, kind: 'door', x: d.x, z: d.z, width: d.width, normal: d.normal || (Math.abs(Math.sin(d.yaw)) > .5 ? { x: 1, z: 0 } : { x: 0, z: 1 }), minY: d.y, maxY: d.y + d.height }))];
}
export function continuationBodyClearAt(point, { radius = .22, height = 1.9, margin = 0, obstacles = continuationCatchObstacles() } = {}) {
  const y = point.feet ?? point.y, r = radius + margin;
  return !obstacles.some(s => {
    if (y >= s.maxY - 1e-7 || y + height <= s.minY + 1e-7) return false;
    if (s.kind === 'sector') return continuationSurfaceContains(s, point.x, point.z, -r);
    if (s.kind === 'door') { const dx = point.x - s.x, dz = point.z - s.z; return Math.abs(dx * s.normal.x + dz * s.normal.z) < .14 + r && Math.abs(-dx * s.normal.z + dz * s.normal.x) < s.width / 2 + .08 + r; }
    const dx = Math.max(s.minX - point.x, 0, point.x - s.maxX), dz = Math.max(s.minZ - point.z, 0, point.z - s.maxZ);
    return dx * dx + dz * dz < r * r - 1e-9;
  });
}
