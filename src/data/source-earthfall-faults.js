import {
  SOURCE_EARTHFALL,
  SOURCE_EARTHFALL_CONSTRUCTION,
  SOURCE_EARTHFALL_STRATA,
  sourceEarthfallCellLayout,
} from './source-earthfall.js';

const freeze = Object.freeze;
const palette = freeze(['silver', 'black', 'magenta', 'cyan', 'violet', 'lime']);

// These are authored surfaces, without extrusion or collision authority. Their
// positions belong to the world, including after their original cap cell falls.
export const SOURCE_EARTHFALL_FAULTS = freeze({
  version: 1,
  capCount: 72,
  groundCount: 120,
  townCount: 480,
  skyCount: 640,
  walkCount: 1312,
  fallCount: 640,
  count: 1952,
  fallClearanceHalfWidth: 1.5,
  lowerY: SOURCE_EARTHFALL.lowerFloor,
  upperY: 230,
  townRadius: 110,
  failureOrigin: SOURCE_EARTHFALL_CONSTRUCTION.failureOrigin,
  palette,
});

const hash = (index, salt) => {
  let n = Math.imul(index + 137, 0x45d9f3b) ^ Math.imul(salt + 59, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// Every outline has a sharp unequal tip. Some have a torn concave shoulder;
// their explicit triangles keep that notch open instead of filling its bounds.
const outlines = [
  { points: [[-.61, -.09], [.48, -.32], [.29, .27]], indices: [0, 1, 2] },
  { points: [[-.59, -.07], [.34, -.39], [.53, .04], [-.21, .22]], indices: [0, 1, 2, 0, 2, 3] },
  { points: [[-.57, -.11], [.42, -.37], [.49, -.04], [.08, .045], [.31, .29], [-.3, .19]], indices: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5] },
  { points: [[-.58, -.025], [.46, -.14], [.29, .17], [-.13, .055]], indices: [0, 1, 3, 1, 2, 3] },
  { points: [[-.5, -.21], [.11, -.34], [.54, -.02], [.19, .12], [-.33, .39]], indices: [0, 1, 2, 0, 2, 3, 0, 3, 4] },
];

const origin = SOURCE_EARTHFALL_CONSTRUCTION.failureOrigin;
// Unequal spreading tears start at the actual failure and reach both flanks,
// the near edge, and the far forecourt. These are paths, not a second cell grid.
const branches = [
  [[origin.x, origin.z], [-6.4, -12], [-5.1, -22], [-8.2, -34], [-6.6, -46.7]],
  [[origin.x, origin.z], [2.4, -12.1], [6.9, -22.5], [3.3, -35.8], [7.6, -46.6]],
  [[origin.x, origin.z], [-7.2, -6.4], [-8, -.2], [-5.9, 3]],
  [[origin.x, origin.z], [3.2, -5.4], [7.5, -.4], [7.9, 3]],
  [[origin.x, origin.z], [-.8, -16.8], [-3.6, -28], [1.6, -40], [-1.7, -47]],
  [[origin.x, origin.z], [6.8, -16.5], [8.2, -30], [5, -40.3]],
];

function branchPoint(branch, t) {
  const lengths = branch.slice(1).map((point, i) => Math.hypot(point[0] - branch[i][0], point[1] - branch[i][1]));
  let distance = Math.max(0, Math.min(1, t)) * lengths.reduce((sum, length) => sum + length, 0);
  let segment = 0;
  while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++];
  const a = branch[segment], b = branch[segment + 1], u = distance / lengths[segment];
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u,
    yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

function localPolygon(index, length, width, yaw, pitch, roll) {
  const outline = outlines[Math.floor(hash(index, 13) * outlines.length)];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const u = [cy * cp, sp, sy * cp];
  const v = [-sy * cr + sp * cy * sr, -cp * sr, cy * cr + sp * sy * sr];
  return { indices: outline.indices, vertices: outline.points.map(([a, b]) => u.map((n, k) => n * a * length + v[k] * b * width)) };
}

const limits = vertices => ({
  min: [0, 1, 2].map(axis => Math.min(...vertices.map(point => point[axis]))),
  max: [0, 1, 2].map(axis => Math.max(...vertices.map(point => point[axis]))),
});
const translate = (vertices, offset) => vertices.map(point => point.map((n, axis) => n + offset[axis]));
const cellAt = (x, z) => sourceEarthfallCellLayout().find(cell => {
  let sign = 0;
  return cell.points.every((a, i) => {
    const b = cell.points[(i + 1) % cell.points.length];
    const side = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
    if (Math.abs(side) < 1e-8) return true;
    if (sign && Math.sign(side) !== sign) return false;
    sign = Math.sign(side);
    return true;
  });
});

function descriptor(index, stage, polygon, vertices, extra = {}) {
  const slot = index % 10;
  const paletteIndex = slot < 2 ? 0 : slot === 2 ? 1 : 2 + Math.floor(hash(index, 91) * 4);
  const bounds = limits(vertices);
  return freeze({
    id: `earthfall-fault-${stage}-${index}`,
    stage,
    vertices: freeze(vertices.map(point => freeze(point))),
    indices: freeze([...polygon.indices]),
    palette: palette[paletteIndex],
    paletteIndex,
    bounds: freeze({ min: freeze(bounds.min), max: freeze(bounds.max) }),
    ...extra,
  });
}

function walkFault(index) {
  const perBranch = SOURCE_EARTHFALL_FAULTS.capCount / branches.length;
  const branch = branches[Math.floor(index / perBranch)], along = index % perBranch;
  const at = branchPoint(branch, along === 0 ? 0 : (along - .18 + hash(index, 1) * .32) / (perBranch - 1));
  const family = index % 9, ground = family === 0, tall = [2, 5, 8].includes(family), razor = [1, 4, 7].includes(family);
  const length = tall ? 19 + hash(index, 2) * 15 : razor ? 2.4 + hash(index, 2) * 18 : 5 + hash(index, 2) * 12;
  const width = razor ? .12 + hash(index, 3) * 1.1
    : tall ? (family === 8 ? 2.2 + hash(index, 3) * 4.8 : .7 + hash(index, 3) * 2.8)
    : 1.4 + hash(index, 3) * 6;
  let polygon = localPolygon(index, length, width, at.yaw + (hash(index, 4) - .5) * 1.05,
    ground ? 0 : tall ? .85 + hash(index, 5) * .55 : .08 + hash(index, 5) * .55,
    ground ? 0 : .45 + hash(index, 6) * 1.25);
  let bounds = limits(polygon.vertices);
  const earth = SOURCE_EARTHFALL.earth;
  const fit = Math.min(1, (earth.maxX - earth.minX - .12) / (bounds.max[0] - bounds.min[0]),
    (earth.maxZ - earth.minZ - .12) / (bounds.max[2] - bounds.min[2]));
  if (fit < 1) polygon = { ...polygon, vertices: polygon.vertices.map(point => point.map(n => n * fit)) };
  bounds = limits(polygon.vertices);
  const x = Math.max(earth.minX + .035 - bounds.min[0], Math.min(earth.maxX - .035 - bounds.max[0], at.x));
  let z = Math.max(earth.minZ + .035 - bounds.min[2], Math.min(earth.maxZ - .035 - bounds.max[2], at.z));
  // Leave the actual doorway approach visible. Large tears begin beyond it,
  // rather than putting the entering eye inside a full-screen colored sheet.
  // This is one fixed authored clearance, never a camera-dependent retreat.
  if(x + bounds.min[0] < 1.2 && x + bounds.max[0] > -1.2 && z + bounds.max[2] > -5)
    z = Math.max(earth.minZ + .035 - bounds.min[2], -5 - bounds.max[2]);
  const cell = cellAt(x, z);
  const vertices = translate(polygon.vertices, [x, SOURCE_EARTHFALL.upperFloor + .024 - bounds.min[1], z]);
  // originCellId records where the wound began, never a moving parent. The
  // fixed anchor and vertices remain behind when that floor fragment departs.
  return descriptor(index, 'walk', polygon, vertices, {
    scope: 'cap',
    originCellId: cell.id,
    anchor: freeze([x, SOURCE_EARTHFALL.upperFloor, z]),
  });
}

function fallFault(index) {
  const key = index + SOURCE_EARTHFALL_FAULTS.capCount;
  const horizon = index % 16 === 0, family = index % 10, broad = family < 7;
  const length = horizon ? 18 + hash(index, 21) * 16
    : broad ? 10 + hash(index, 21) * 20 : 2.2 + hash(index, 21) * 24;
  const width = horizon ? 8 + hash(index, 22) * 10
    : broad ? 4 + hash(index, 22) * 10 : .12 + hash(index, 22) * 1.5;
  const yaw = horizon ? Math.PI / 2 + (hash(index, 23) - .5) * .55 : hash(index, 23) * Math.PI * 2;
  const polygon = localPolygon(key, length, width, yaw,
    family < 4 ? (hash(index, 24) - .5) * .6 : (hash(index, 24) - .5) * 2.5,
    family < 4 ? (hash(index, 25) - .5) * .7 : hash(index, 25) * Math.PI * 2);
  const bounds = limits(polygon.vertices), side = index % 2 ? 1 : -1;
  const reach = index % 8;
  const gap = reach < 4 ? .12 + hash(index, 26) * 3.6 : reach < 7 ? 3.6 + hash(index, 26) * 10 : 13 + hash(index, 26) * 16;
  // A polygon lies wholly on one side of this world-space corridor, so all
  // of its actual triangles clear it too; no bounds-only collision is added.
  const x = side < 0 ? -SOURCE_EARTHFALL_FAULTS.fallClearanceHalfWidth - gap - bounds.max[0]
    : SOURCE_EARTHFALL_FAULTS.fallClearanceHalfWidth + gap - bounds.min[0];
  const layer = horizon ? SOURCE_EARTHFALL_STRATA[(index / 16) % SOURCE_EARTHFALL_STRATA.length] : null;
  const desiredY = layer ? layer.y + (hash(index, 27) - .5) * 3
    : SOURCE_EARTHFALL.upperFloor - (index + .25 + hash(index, 27) * .5) / SOURCE_EARTHFALL_FAULTS.fallCount * 100;
  const y = Math.max(.12 - bounds.min[1], Math.min(99.88 - bounds.max[1], desiredY));
  const z = -14 + (hash(index, 28) - .5) * (reach < 4 ? 44 : reach < 7 ? 88 : 128);
  const vertices = translate(polygon.vertices, [x, y, z]);
  const nearestLayer = layer || SOURCE_EARTHFALL_STRATA.find(stratum => Math.abs(stratum.y - y) < 5);
  return descriptor(key, 'fall', polygon, vertices, {scope:'descent',...(nearestLayer ? { stratumId: nearestLayer.id } : {})});
}

function groundFault(index){
  const cell=sourceEarthfallCellLayout()[index],key=SOURCE_EARTHFALL_FAULTS.capCount+index;
  // An opaque flat cut covers the original upper finish. The physical cap
  // still owns footing and its collapse; this fixed address remains behind.
  const polygon={indices:[0,1,2,0,2,3]},vertices=cell.points.map(([x,,z])=>[x,SOURCE_EARTHFALL.upperFloor+.042,z]);
  return descriptor(key,'walk',polygon,vertices,{scope:'ground',originCellId:cell.id,
    anchor:freeze([cell.center.x,SOURCE_EARTHFALL.upperFloor,cell.center.z])});
}

function townFault(index,sky=false){
  const key=SOURCE_EARTHFALL_FAULTS.capCount+SOURCE_EARTHFALL_FAULTS.groundCount
    +(sky?SOURCE_EARTHFALL_FAULTS.townCount:0)+index,
    angle=hash(key,41)*Math.PI*2,razor=index%6===0,
    length=(sky?34:22)+hash(key,42)*(sky?62:48),
    width=razor?.18+hash(key,43)*1.8:(sky?8:4)+hash(key,43)*(sky?22:16),
    polygon=localPolygon(key,length,width,angle+(hash(key,44)-.5)*1.5,
      (hash(key,45)-.5)*2.7,hash(key,46)*Math.PI*2),bounds=limits(polygon.vertices),
    radius=sky?5+hash(key,47)*105:10+hash(key,47)*82,
    x=-12+Math.cos(angle)*radius,z=-24+Math.sin(angle)*radius,
    desiredY=sky?129+hash(key,48)*80:102+hash(key,48)*58,
    y=Math.max((sky?116:93)-bounds.min[1],Math.min(SOURCE_EARTHFALL_FAULTS.upperY-bounds.max[1],desiredY));
  // These are world positions over and around the complete town, including
  // behind the entry and above its roofs. No centre follows a moving viewer.
  return descriptor(key,'walk',polygon,translate(polygon.vertices,[x,y,z]),{scope:sky?'sky':'town'});
}

const layout = freeze([
  ...Array.from({ length: SOURCE_EARTHFALL_FAULTS.capCount }, (_, index) => walkFault(index)),
  ...Array.from({ length: SOURCE_EARTHFALL_FAULTS.groundCount }, (_, index) => groundFault(index)),
  ...Array.from({ length: SOURCE_EARTHFALL_FAULTS.townCount }, (_, index) => townFault(index)),
  ...Array.from({ length: SOURCE_EARTHFALL_FAULTS.skyCount }, (_, index) => townFault(index,true)),
  ...Array.from({ length: SOURCE_EARTHFALL_FAULTS.fallCount }, (_, index) => fallFault(index)),
]);

export const sourceEarthfallFaultLayout = () => layout;
