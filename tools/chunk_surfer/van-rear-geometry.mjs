// A fitted working load bay, authored inside the existing parked-van shell.
// The field case is a separate saved-state object supplied by the runtime.
import { VAN_REAR_PALETTE, VAN_REAR_STRUCTURE, VAN_REAR_CASE, VAN_REAR_STAGE,
  vanRearCaseStops, vanRearStageToWorld } from '../../src/data/van-rear-design.js';
import { WORKBENCH_TRAYS } from '../../src/data/workbench-catalog.js';

const linearHex = hex => [1, 3, 5].map(offset => {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});
const FINISH = {
  enamel: [VAN_REAR_PALETTE.enamel, .22, .74],
  raised: [VAN_REAR_PALETTE.enamelLight, .18, .66],
  shadow: [VAN_REAR_PALETTE.enamelShadow, .16, .81],
  plywood: [VAN_REAR_PALETTE.plywood, 0, .88],
  edge: [VAN_REAR_PALETTE.plywoodEdge, 0, .92],
  rubber: [VAN_REAR_PALETTE.rubber, 0, .98],
  steel: [VAN_REAR_PALETTE.steel, .72, .56],
  zinc: [VAN_REAR_PALETTE.zinc, .72, .42],
};

function builder(api, target) {
  const { materials, MAT, addBox, addBeam, addCylinder, addCylinderX, addQuad } = api;
  if (!target || !Array.isArray(materials) || !MAT ||
      [addBox, addBeam, addCylinder, addCylinderX, addQuad].some(value => typeof value !== 'function')) {
    throw new TypeError('The van rear needs its existing mesh and opaque primitive builder API.');
  }
  const ids = {}, initial = materials.length;
  for (const [key, [hex, metallicFactor, roughnessFactor]] of Object.entries(FINISH)) {
    const name = `van rear / ${key}`;
    let index = materials.findIndex(material => material.name === name);
    if (index < 0) {
      index = materials.length;
      materials.push({ name, pbrMetallicRoughness: {
        baseColorFactor: [...linearHex(hex), 1], metallicFactor, roughnessFactor,
      }, extras: { materialFactors: 'gltf', vanRearRole: key } });
    }
    ids[key] = index;
  }
  ids.red = MAT.safetyRed;
  ids.ivory = MAT.ivory;
  const stats = { owner: target.name, triangles: 0, parts: [], newMaterials: materials.length - initial };
  const box = (id, center, size, finish) => {
    addBox(target, center, size, ids[finish]); stats.triangles += 12;
    stats.parts.push({ id, kind: 'box', center, size, finish });
  };
  const beam = (id, a, b, width, finish) => {
    addBeam(target, a, b, width, ids[finish]); stats.triangles += 12;
    stats.parts.push({ id, kind: 'beam', a, b, width, finish });
  };
  const cylinder = (id, center, radius, height, finish, sides = 10, axis = 'y') => {
    (axis === 'x' ? addCylinderX : addCylinder)(target, center, radius, height, ids[finish], sides);
    stats.triangles += sides * 4;
    stats.parts.push({ id, kind: 'cylinder', center, radius, height, axis, finish });
  };
  const face = (id, points, finish) => {
    addQuad(target, ...points, ids[finish]); stats.triangles += 2;
    stats.parts.push({ id, kind: 'quad', points, finish });
  };
  // An actual hollow annulus with inner wall and two edges. Flanges remain
  // open between their rim, spokes and axle instead of becoming solid discs.
  const ring = (id, center, outer, inner, depth, finish, axis = 'x', sides = 16) => {
    const point = (angle, radius, offset) => axis === 'x'
      ? [center[0] + offset, center[1] + Math.cos(angle) * radius, center[2] + Math.sin(angle) * radius]
      : [center[0] + Math.cos(angle) * radius, center[1] + offset, center[2] + Math.sin(angle) * radius];
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2;
      const o0 = point(a, outer, -depth / 2), o1 = point(b, outer, -depth / 2);
      const o2 = point(b, outer, depth / 2), o3 = point(a, outer, depth / 2);
      const i0 = point(a, inner, -depth / 2), i1 = point(b, inner, -depth / 2);
      const i2 = point(b, inner, depth / 2), i3 = point(a, inner, depth / 2);
      for (const points of [[o0, o1, o2, o3], [i3, i2, i1, i0], [o3, o2, i2, i3], [i0, i1, o1, o0]]) {
        addQuad(target, ...(axis === 'y' ? [...points].reverse() : points), ids[finish]); stats.triangles += 2;
      }
    }
    stats.parts.push({ id, kind: 'ring', center, outer, inner, depth, axis, finish });
  };
  return { stats, box, beam, cylinder, face, ring };
}

export function buildVanRearGeometry(api) {
  const { stats, box, beam, cylinder, ring } = builder(api, api.target);
  const C = VAN_REAR_STRUCTURE, floor = C.floorY + .05;
  // The long ribs guide the eye into the load space. They are broad pressed
  // channels, not hundreds of texture scratches under a low-resolution pass.
  box('cargo-rubber-floor', [0, floor + .009, .15], [1.83, .018, 4.36], 'rubber');
  for (let i = -3; i <= 3; i++) box(`floor-pressed-rib-${i}`, [i * .24, floor + .024, .15], [.075, .014, 4.31], 'shadow');

  for (const side of [-1, 1]) {
    for (const [i, z] of [-1.49, -.39, .71, 1.81].entries()) {
      box(`plywood-lining-${side}-${i}`, [side * .938, 1.25, z], [.024, 1.10, 1.065], 'plywood');
    }
    for (const [i, z] of [-1.99, -.94, .16, 1.26, 2.33].entries()) {
      box(`pressed-side-rib-${side}-${i}`, [side * .909, 1.57, z], [.047, 1.72, .066], 'raised');
    }
    box(`side-lining-cap-${side}`, [side * .921, 1.81, .17], [.042, .045, 4.43], 'steel');
    box(`side-kick-rail-${side}`, [side * .909, .74, .17], [.045, .12, 4.43], 'steel');
  }
  box('interior-bulkhead', [0, 1.58, -2.025], [1.84, 1.70, .028], 'enamel');
  box('bulkhead-plywood-lower', [0, 1.25, -1.998], [1.73, 1.06, .022], 'plywood');
  for (const x of [-.63, 0, .63]) box(`bulkhead-pressed-rib-${x}`, [x, 1.61, -1.97], [.045, 1.58, .036], 'raised');
  for (const [i, z] of [-1.46, .18, 1.82].entries()) {
    const bow = [[-.908, 2.17, z], [-.755, 2.405, z], [0, 2.457, z], [.755, 2.405, z], [.908, 2.17, z]];
    for (let j = 1; j < bow.length; j++) beam(`roof-bow-${i}-${j}`, bow[j - 1], bow[j], .046, 'raised');
  }
  // One protected supply route, following the upper corner and returning to
  // the dome fitting's existing local anchor; no loose wire across the case.
  const conduit = [[-.79, 2.34, -1.98], [-.79, 2.34, 2.0], [-.46, 2.34, 2.0], [-.10, 2.34, 2.0]];
  for (let i = 1; i < conduit.length; i++) beam(`protected-lamp-conduit-${i}`, conduit[i - 1], conduit[i], .022, 'rubber');
  for (const z of [-1.71, -.92, -.13]) box(`conduit-clip-${z}`, [-.79, 2.34, z], [.054, .032, .025], 'zinc');

  // Same worktop and case datum as the close fitting view. The centre remains
  // completely free for the separately loaded, stateful field case.
  const front = C.worktopCenterZ + C.worktopDepth / 2;
  const surface = C.worktopY + C.worktopAssemblyDepth / 2, frameHeight = C.worktopAssemblyDepth - C.worktopSkinThickness;
  const frameY = surface - C.worktopSkinThickness - frameHeight / 2;
  box('fitted-worktop', [0, surface - C.worktopSkinThickness / 2, C.worktopCenterZ],
    [C.worktopWidth, C.worktopSkinThickness, C.worktopDepth], 'plywood');
  for (const x of [-.82, 0, .82]) box(`worktop-subframe-longitudinal-${x}`, [x, frameY, C.worktopCenterZ], [.035, frameHeight, C.worktopDepth - .08], 'steel');
  for (const end of [-1, 1]) box(`worktop-subframe-crossrail-${end}`, [0, frameY, C.worktopCenterZ + end * (C.worktopDepth / 2 - .04)], [1.675, frameHeight, .035], 'steel');
  box('front-laminated-edge', [0, C.worktopY, front + .003], [C.worktopWidth, .076, .018], 'edge');
  for (const y of [C.worktopY - .021, C.worktopY + .021]) box(`edge-ply-layer-${y}`, [0, y, front + .013], [C.worktopWidth - .03, .006, .006], 'plywood');
  box('case-rubber-seat', [0, VAN_REAR_CASE.seatTopY - VAN_REAR_CASE.seatThickness / 2, VAN_REAR_CASE.centerZ],
    [VAN_REAR_CASE.seatWidth, VAN_REAR_CASE.seatThickness, VAN_REAR_CASE.seatDepth], 'rubber');
  for (const stop of vanRearCaseStops()) box(stop.id, stop.center, stop.size, 'raised');
  for (const x of [-.835, .815]) box(`worktop-side-support-${x}`, [x, .851, C.worktopCenterZ], [.045, .338, 1.065], 'steel');
  box('worktop-back-bearer', [0, .9875, C.worktopCenterZ - .51], [1.68, .065, .05], 'steel');
  for (const side of [-1, 1]) {
    box(`shelf-body-angle-seat-${side}`, [side * .906, 1.014, 1.26], [.118, .012, .12], 'steel');
    box(`shelf-body-angle-wall-${side}`, [side * .932, .995, 1.26], [.014, .15, .12], 'steel');
    for (const y of [.95, 1.045]) cylinder(`shelf-body-angle-fixing-${side}-${y}`, [side * .918, y, 1.26], .012, .018, 'zinc', 10, 'x');
  }
  // The close preparation view crops to this actual worktop conversion. Its
  // upstand and end guards are furniture, not a relocated vehicle bulkhead.
  const unit = VAN_REAR_STAGE.metresPerUnit;
  const stageBox = (id, center, size, finish) => box(id, vanRearStageToWorld(center), size.map(n => n * unit), finish);
  stageBox('service-upstand', [0, 1.53, -5.91], [18, 3.50, .22], 'shadow');
  for (const x of [-6.75, -2.25, 2.25, 6.75]) {
    stageBox(`service-upstand-panel-${x}`, [x, 1.43, -5.77], [4.20, 3.10, .12], 'enamel');
    stageBox(`service-upstand-stile-${x}`, [x - 2.18, 1.43, -5.66], [.15, 3.28, .22], 'raised');
  }
  stageBox('service-upstand-cap', [0, 3.28, -5.76], [18.2, .15, .28], 'raised');
  for (const side of [-1, 1]) {
    stageBox(`worktop-end-guard-${side}`, [side * 9.13, .59, -.02], [.18, 2.05, 12.05], 'enamel');
    stageBox(`worktop-end-guard-seal-${side}`, [side * 9.17, 1.67, -.02], [.20, .12, 12.12], 'rubber');
    for (const z of [-4.8, -1.6, 1.6, 4.8]) stageBox(`worktop-end-guard-stile-${side}-${z}`, [side * 8.98, .58, z], [.27, 1.90, .15], 'raised');
  }
  const labelFaces = [];
  for (const tray of WORKBENCH_TRAYS) {
    if (tray.vertical) {
      stageBox('faceplate-rack-seat', [tray.x, VAN_REAR_STAGE.rackSeatY - .033, tray.z], [tray.w, .065, .32], 'steel');
      stageBox('faceplate-rack-retaining-lip', [tray.x, VAN_REAR_STAGE.rackSeatY - .01, tray.z + .18], [tray.w, .16, .04], 'enamel');
      const center = vanRearStageToWorld([tray.x, .61, tray.z + .19]);
      box('faceplate-service-label-carrier', center, [(tray.w - .12) * unit, .24 * unit, .001], 'ivory');
      labelFaces.push({ id: 'van-rack-faceplates', copy: tray.label, center: [center[0], center[1], center[2] + .0006],
        widthM: (tray.w - .12) * unit, heightM: .24 * unit, readerRight: [1, 0, 0], up: [0, 1, 0] });
      continue;
    }
    stageBox(`stock-tray-${tray.group}`, [tray.x, -.028, tray.z], [tray.w, .05, tray.d], 'shadow');
    for (const side of [-1, 1]) stageBox(`stock-tray-rim-${tray.group}-${side}`, [tray.x + side * tray.w / 2, .007, tray.z], [.035, .05, tray.d], 'steel');
    const center = vanRearStageToWorld([tray.x, .018, tray.z + tray.d / 2 - .17]);
    box(`stock-label-carrier-${tray.group}`, center, [(tray.w - .12) * unit, .001, .24 * unit], 'ivory');
    labelFaces.push({ id: `van-stock-${tray.group}`, copy: tray.label, center: [center[0], center[1] + .0006, center[2]],
      widthM: (tray.w - .12) * unit, heightM: .24 * unit, readerRight: [1, 0, 0], up: [0, 0, -1] });
  }
  // The left pedestal has genuine separate drawer fronts and a shadow gap.
  // The right stays an open service bay with a removable cable reel.
  for (const x of [-.81, -.22]) box(`drawer-carcase-side-${x}`, [x, .851, C.worktopCenterZ], [.025, .338, 1.035], 'plywood');
  box('drawer-carcase-base', [-.515, .702, C.worktopCenterZ], [.59, .03, 1.035], 'plywood');
  box('drawer-dark-front-recess', [-.515, .85, front - .041], [.57, .326, .023], 'rubber');
  for (const [i, y] of [.77, .936].entries()) {
    box(`drawer-front-${i}`, [-.515, y, front - .019], [.565, .14, .026], 'enamel');
    box(`drawer-label-holder-${i}`, [-.515, y + .033, front - .002], [.135, .026, .010], 'zinc');
    beam(`drawer-pull-${i}`, [-.61, y - .021, front + .019], [-.42, y - .021, front + .019], .014, 'zinc');
    for (const x of [-.61, -.42]) beam(`drawer-pull-return-${i}-${x}`, [x, y - .021, front + .019], [x, y - .021, front - .002], .012, 'steel');
  }

  const reel = [.38, .845, 1.285];
  for (const x of [.217, .543]) {
    ring(`reel-open-flange-${x}`, [x, reel[1], reel[2]], .154, .129, .022, 'raised');
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      beam(`reel-spoke-${x}-${i}`, [x, reel[1] + Math.cos(a) * .036, reel[2] + Math.sin(a) * .036],
        [x, reel[1] + Math.cos(a) * .137, reel[2] + Math.sin(a) * .137], .017, 'raised');
    }
  }
  cylinder('reel-cable-core', reel, .119, .29, 'rubber', 16, 'x');
  for (let i = 0; i < 6; i++) ring(`reel-cable-winding-${i}`, [.25 + i * .052, reel[1], reel[2]], .132, .118, .039, 'rubber', 'x', 14);
  cylinder('reel-axle', reel, .030, .392, 'zinc', 10, 'x');
  for (const x of [.21, .55]) {
    beam(`reel-stand-front-${x}`, [x, .705, 1.07], [x, .845, 1.285], .021, 'steel');
    beam(`reel-stand-back-${x}`, [x, .845, 1.285], [x, .705, 1.49], .021, 'steel');
    box(`reel-stand-foot-${x}`, [x, .70, 1.28], [.05, .022, .46], 'steel');
  }
  beam('reel-crank', [.588, .845, 1.285], [.588, .925, 1.285], .014, 'zinc');
  cylinder('reel-crank-grip', [.615, .925, 1.285], .021, .062, 'rubber', 10, 'x');
  const lead = [[.45, .74, 1.40], [.59, .705, 1.55], [.69, .705, 1.70], [.72, .705, 1.82]];
  for (let i = 1; i < lead.length; i++) beam(`reel-lead-${i}`, lead[i - 1], lead[i], .014, 'rubber');
  box('reel-lead-plug', [.72, .706, 1.835], [.045, .032, .064], 'rubber');

  for (const side of [-1, 1]) for (const z of [-.54, 2.08]) {
    box(`tie-down-plate-${side}-${z}`, [side * .78, .697, z], [.105, .012, .087], 'steel');
    ring(`tie-down-ring-${side}-${z}`, [side * .78, .707, z], .033, .022, .010, 'zinc', 'y', 12);
  }
  // The weather seal stays behind the moving leaves. No solid panel seals
  // the open aperture, and the step never reaches beyond the old rear bound.
  for (const side of [-1, 1]) box(`rear-aperture-seal-${side}`, [side * .893, 1.57, 2.423], [.026, 1.75, .030], 'rubber');
  box('rear-header-seal', [0, 2.433, 2.423], [1.81, .026, .030], 'rubber');
  box('weathersealed-threshold', [0, .704, 2.425], [1.82, .068, .126], 'zinc');
  box('threshold-rubber-insert', [0, .743, 2.425], [1.65, .010, .070], 'rubber');
  box('rear-loading-step', [0, .558, 2.515], [1.68, .098, .165], 'steel');
  for (const z of [2.46, 2.51, 2.56]) box(`rear-step-grip-${z}`, [0, .611, z], [1.55, .009, .015], 'rubber');
  return { ...stats, worktopTopY: C.worktopY + .04, caseSeatTopY: C.worktopY + .049,
    caseSeat: { x: 0, z: VAN_REAR_CASE.centerZ, width: VAN_REAR_CASE.seatWidth, depth: VAN_REAR_CASE.seatDepth }, labelFaces,
    maximumTriangles: 4200, worldUnits: 'metres', statefulCaseIncluded: false };
}

export function addVanRearDoorDetails(api, door, { side, outer } = {}) {
  if (!['l', 'r'].includes(side) || ![-1, 1].includes(outer)) throw new TypeError('The existing left/right door and outer-face sign are required.');
  const { stats, box, beam, cylinder, face } = builder(api, door);
  for (const sign of [-1, 1]) {
    for (const [i, y, h] of [[0, 1.30, .72], [1, .52, .59]]) {
      box(`door-${side}-pressed-panel-${sign}-${i}`, [.45, y, sign * .0415], [.71, h, .004], sign === outer ? 'enamel' : 'shadow');
      for (const x of [.078, .822]) box(`door-${side}-panel-rim-${sign}-${i}-${x}`, [x, y, sign * .047], [.022, h + .034, .014], 'raised');
      for (const edge of [-1, 1]) box(`door-${side}-panel-rim-${sign}-${i}-${edge}-horizontal`, [.45, y + edge * (h / 2 + .008), sign * .047], [.75, .022, .014], 'raised');
    }
    for (const x of [.028, .874]) box(`door-${side}-perimeter-seal-${sign}-${x}`, [x, .93, sign * .044], [.020, 1.82, .012], 'rubber');
    for (const y of [.022, 1.838]) box(`door-${side}-perimeter-seal-${sign}-${y}`, [.45, y, sign * .044], [.865, .020, .012], 'rubber');
  }
  for (const [i, y] of [.22, .94, 1.64].entries()) {
    cylinder(`door-${side}-hinge-barrel-${i}`, [.023, y, outer * .069], .017, .14, 'zinc', 10);
    box(`door-${side}-hinge-strap-${i}`, [.083, y, outer * .055], [.119, .074, .019], 'zinc');
  }
  cylinder(`door-${side}-locking-rod`, [.782, .924, outer * .074], .010, 1.52, 'zinc', 10);
  for (const y of [.20, .72, 1.26, 1.65]) box(`door-${side}-rod-guide-${y}`, [.782, y, outer * .067], [.046, .033, .033], 'steel');
  // Small diagonally striped carriers belong to a working van. The previous
  // full-height vertical bars overwhelmed both the opening and the hardware.
  box(`door-${side}-reflector-carrier`, [.45, .565, outer * .058], [.70, .21, .012], 'ivory');
  for (let i = 0; i < 3; i++) {
    const x = .13 + i * .225, lean = side === 'l' ? .115 : -.115;
    const start = lean > 0 ? x : x + .115;
    let points = [[start, .471, outer * .065], [start + .095, .471, outer * .065],
      [start + .095 + lean, .659, outer * .065], [start + lean, .659, outer * .065]];
    if (outer < 0) points = points.reverse();
    face(`door-${side}-diagonal-reflector-${i}`, points, 'red');
  }
  const inner = -outer;
  box(`door-${side}-inside-pocket-front`, [.43, .42, inner * .137], [.51, .20, .018], 'enamel');
  box(`door-${side}-inside-pocket-base`, [.43, .32, inner * .093], [.51, .020, .106], 'steel');
  for (const x of [.175, .685]) box(`door-${side}-inside-pocket-return-${x}`, [x, .42, inner * .093], [.018, .20, .106], 'steel');
  beam(`door-${side}-inside-pocket-lip`, [.175, .524, inner * .147], [.685, .524, inner * .147], .014, 'zinc');
  return { ...stats, side, outer, maximumTriangles: 700, hingeLocal: true, staticLeafIncluded: false };
}
