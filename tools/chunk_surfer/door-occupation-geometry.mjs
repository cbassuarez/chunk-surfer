// Finishing for the existing hinge-local leaves in scripts/build-door-pack.mjs.
// This accepts that builder's raw primitive parts, before mesh() serialises them.
// The core, front handles/plates, frames and door-state definitions stay owned
// by the original builder. No detached world-space hardware follows the door.

const PROFILES = Object.freeze({
  door_leaf_service: Object.freeze({ finish: 'iron', reverseKick: true, smokeSeal: true, key: true }),
  door_leaf_practice: Object.freeze({ finish: 'brass', reverseKick: true, acoustic: true, existingHingeSeal: true, key: true }),
  door_leaf_staff: Object.freeze({ finish: 'brass', finger: true, key: true }),
  door_leaf_pool: Object.freeze({ finish: 'iron', reverseKick: true, smokeSeal: true, frontPullMissing: true }),
  door_leaf_pool_pair: Object.freeze({ finish: 'iron', reverseKick: true, smokeSeal: true, existingHingeSeal: true }),
  door_leaf_public: Object.freeze({ finish: 'brass', reverseKick: true, public: true }),
  door_leaf_hall: Object.freeze({ finish: 'brass', reverseKick: true, acoustic: true, existingHingeSeal: true, key: true }),
  door_leaf_chapel: Object.freeze({ finish: 'iron', key: true, heritage: true }),
  door_leaf_tower: Object.freeze({ finish: 'iron', key: true, heritage: true }),
  door_leaf_bay_goods: Object.freeze({ finish: 'iron', goods: true }),
});

export const DOOR_OCCUPATION_PROFILES = PROFILES;

function cylinderY(center, radius, height, mat, sides = 6) {
  const p = [], n = [], uv = [], idx = [];
  const [cx, cy, cz] = center;
  for (let i = 0; i <= sides; i += 1) {
    const a = i / sides * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    p.push(cx + x * radius, cy - height / 2, cz + z * radius,
      cx + x * radius, cy + height / 2, cz + z * radius);
    n.push(x, 0, z, x, 0, z); uv.push(i / sides, 0, i / sides, 1);
    if (i < sides) { const b = i * 2; idx.push(b, b + 3, b + 2, b, b + 1, b + 3); }
  }
  for (const top of [-1, 1]) {
    const b = p.length / 3; p.push(cx, cy + top * height / 2, cz); n.push(0, top, 0); uv.push(.5, .5);
    for (let i = 0; i <= sides; i += 1) {
      const a = i / sides * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      p.push(cx + x * radius, cy + top * height / 2, cz + z * radius); n.push(0, top, 0); uv.push(.5 + x / 2, .5 + z / 2);
      if (i < sides) top > 0 ? idx.push(b, b + i + 2, b + i + 1) : idx.push(b, b + i + 1, b + i + 2);
    }
  }
  return { mat, p, n, uv, idx };
}

function faceMark(x, y, z, width, height, mat, side) {
  const p = [x - width / 2, y - height / 2, z, x + width / 2, y - height / 2, z,
    x + width / 2, y + height / 2, z, x - width / 2, y + height / 2, z];
  return { mat, p, n: [0, 0, side, 0, 0, side, 0, 0, side, 0, 0, side],
    uv: [0, 0, 1, 0, 1, 1, 0, 1], idx: side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2] };
}

/**
 * Use inside the existing leaf() factory:
 *   mesh(name, [core, ...enhanceDoorOccupation({name,width:w,height:h,depth:d,parts,MAT,box})]);
 * Returns a new parts array. Unknown meshes pass through unchanged.
 */
export function enhanceDoorOccupation({ name, width, height, depth, parts = [], MAT, box }) {
  const profile = PROFILES[name];
  if (!profile) return [...parts];
  if (![width, height, depth].every((v) => Number.isFinite(v) && v > 0) || typeof box !== 'function') {
    throw new TypeError(`Door occupation requires positive leaf dimensions and box(): ${name}`);
  }
  const out = [...parts], finish = MAT[profile.finish], tag = (part, feature) => {
    part.occupationFeature = feature; out.push(part);
  };
  const face = depth / 2, handleX = width - (profile.goods ? .14 : .11);
  const gripY = profile.goods ? 1.44 : name === 'door_leaf_tower' ? .96 : name === 'door_leaf_chapel' ? 1.12 : 1.08;
  const hingeYs = profile.goods ? [.30, 1.1, 2.0, height - .27] : [.25, height / 2, height - .25];
  // The barrel axis is the existing runtime pivot x=z=0. Each hinge has three
  // alternating knuckles, with real 1.5 mm seams rather than a square strip.
  for (const y of hingeYs) {
    for (let segment = -1; segment <= 1; segment += 1) {
      tag(cylinderY([0, y + segment * .029, 0], .0115, .0275,
        segment === 0 ? MAT.kick : finish), 'hinge-knuckle');
    }
    for (const side of [-1, 1]) {
      tag(box(.032, y, side * (face + .001), .062, .088, .002, finish), 'hinge-leaf');
      tag(faceMark(.046, y + .022, side * (face + .0022), .008, .002, MAT.iron, side), 'hinge-screw');
      tag(faceMark(.046, y - .022, side * (face + .0022), .008, .002, MAT.iron, side), 'hinge-screw');
    }
  }
  // All original front kickplates stay. Add the corresponding rear protection
  // to working doors, without putting modern plates over the chapel/tower.
  if (profile.reverseKick) tag(box(width / 2, .20, face + .0035,
    width - .08, profile.public ? .27 : .26, .007, profile.public ? MAT.brass : MAT.kick), 'reverse-kickplate');
  if (profile.finger) for (const side of [-1, 1]) {
    tag(box(handleX, gripY + .035, side * (face + .003), .075, .34, .006, finish), 'fingerplate');
  }
  // The back face previously had no grip at all. Keep goods-door front handle
  // and shot bolt as authored; the reverse receives a utilitarian pull only.
  tag(box(handleX - .045, gripY, face + .025, .13, .035, .045, finish), 'reverse-grip');
  if (profile.frontPullMissing) {
    tag(box(handleX - .045, gripY, -face - .025, .13, .035, .045, finish), 'front-grip');
  }
  if (profile.key) for (const side of [-1, 1]) {
    const z = side * (face + .004), keyY = gripY - .145;
    tag(box(handleX, keyY, z, .046, .077, .007, finish), 'escutcheon');
    // A stepped dark opening cut visually into the escutcheon, never a second
    // live lock or a symbol implying a new gameplay state.
    tag(faceMark(handleX, keyY + .010, side * (face + .0076), .012, .012, MAT.rubber, side), 'keyhole');
    tag(faceMark(handleX, keyY - .005, side * (face + .0076), .005, .023, MAT.rubber, side), 'keyhole');
  }
  if (profile.acoustic || profile.smokeSeal) {
    // Practice, hall and paired-pool already have a hinge-edge seal. Complete
    // only what is absent; all strips lie within the existing slab dimensions.
    if (!profile.existingHingeSeal) tag(box(.012, height / 2, 0, .012, height - .04, depth + .006, MAT.rubber), 'hinge-seal');
    tag(box(width - .012, height / 2, 0, .012, height - .04, depth + .006, MAT.rubber), 'latch-seal');
    tag(box(width / 2, height - .012, 0, width - .025, .012, depth + .006, MAT.rubber), 'head-seal');
    if (profile.acoustic) tag(box(width / 2, .013, 0, width - .025, .018, depth + .006, MAT.rubber), 'acoustic-sweep');
  }
  // Sparse, local use marks: thin metal scuffs on protection plates and an
  // older filled screw-hole repair below the grip. No full-door grime overlay.
  for (const side of [-1, 1]) {
    const scuffY = profile.reverseKick || profile.goods ? .15 : .39;
    const scuffZ = side > 0 ? face + (profile.reverseKick ? .0072 : .0008) : -Math.max(face + .0008, profile.reverseKick || profile.goods ? .072 : face + .0008);
    tag(faceMark(width * .37, scuffY, scuffZ, width * .17, .0025, MAT.iron, side), 'local-scuff');
    tag(faceMark(handleX + .012, gripY - .27, side * (face + .0008), .009, .014,
      profile.heritage ? MAT.iron : MAT.kick, side), 'filled-fixing-repair');
  }
  return out;
}
