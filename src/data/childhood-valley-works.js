// The commons frontage is authored in the same local metres as the store.
// The last fall on this flat apron is built into the stonework itself.
const dressedStone = 71;
const rubble = 50;
const iron = 76;
const darkIron = 63;
const piece = (id, x0, x1, y0, y1, z0, z1, material, details = {}) =>
  Object.freeze({ id, x0, x1, y0, y1, z0, z1, material, blocking: false, ...details });

export const HOME_COMMONS_DRAINAGE = Object.freeze({
  pipeMouth: Object.freeze([-14.02, .16, 56.29]),
  channel: Object.freeze({ x: -14.02, halfWidth: .19, startZ: 56.29, endZ: 54.65,
    startInvert: .122, endInvert: .030, cheekHeight: .018 }),
  catchpit: Object.freeze({ x: -14.02, z: 54.48, inletZ: 54.65, grateY: .020 }),
});

const { channel, catchpit } = HOME_COMMONS_DRAINAGE;
const lowerTread = piece('common-stoop-lower-tread', -18.10, -16.0, .142, .20, 55.68, 56.82, dressedStone);
const upperTread = piece('common-stoop-upper-tread', -18.10, -16.0, .342, .40, 56.20, 56.82, dressedStone);
// The lower support covers the exposed tread. Leave .22m of overlap for
// the body radius inset on each neighbour, without stacking both centres.
const lowerSupport = Object.freeze({ ...lowerTread, z1: 56.64 });
export const HOME_COMMONS_STEP_SUPPORTS = Object.freeze([lowerSupport, upperTread]);

const stoop = [
  piece('common-stoop-lower-bedding', -18.075, -16.025, -.20, .145, 55.71, 56.82, rubble),
  piece('common-stoop-upper-bedding', -18.075, -16.025, .197, .344, 56.23, 56.82, rubble),
  lowerTread,
  upperTread,
];

const rill = [
  piece('common-roof-water-rill', channel.x - channel.halfWidth, channel.x + channel.halfWidth,
    -.035, channel.startInvert + channel.cheekHeight, channel.endZ, channel.startZ,
    dressedStone, { shape: 'rill' }),
  // The lower covered pit conceals the soak drain. There is a shallow dark
  // recess between the bars, with a bearing shelf for the removable grate.
  piece('common-catchpit-recess', -14.20, -13.84, -.026, .006, 54.32, 54.65, darkIron),
  piece('common-catchpit-west-jamb', -14.28, -14.20, -.033, .043, 54.26, 54.66, dressedStone),
  piece('common-catchpit-east-jamb', -13.84, -13.76, -.033, .043, 54.26, 54.66, dressedStone),
  piece('common-catchpit-front-sill', -14.22, -13.82, -.032, .037, 54.26, 54.33, dressedStone),
  piece('common-catchpit-grate-front', -14.20, -13.84, .008, catchpit.grateY, 54.331, 54.357, iron),
  piece('common-catchpit-grate-back', -14.20, -13.84, .008, catchpit.grateY, 54.626, 54.651, iron),
  ...[-14.171, -14.095, -14.019, -13.943, -13.867].map((x, index) =>
    piece(`common-catchpit-grate-bar-${index + 1}`, x - .013, x + .013, .009, catchpit.grateY,
      54.354, 54.632, iron)),
];

// The verge holds the edge of a cleared road. Long sets have real end joints
// and worn tops, with breaks for the store approach and the runoff inlet.
const curb = [
  [-21.55, -20.97, 54.33, .099], [-20.95, -20.36, 54.34, .085],
  [-20.34, -19.72, 54.36, .077], [-19.70, -19.16, 54.38, .070],
  [-13.69, -13.17, 54.39, .054], [-13.15, -12.61, 54.36, .043],
].map(([x0, x1, z, top], index) =>
  piece(`common-verge-stone-${index + 1}`, x0, x1, -.07, top, z, z + .22, dressedStone));

const pump = [
  piece('common-pump-base', -23.59, -23.08, .24, .43, 54.29, 54.80, rubble),
  piece('common-pump-base-flange', -23.51, -23.17, .428, .472, 54.367, 54.701, iron, { shape: 'round-y' }),
  piece('common-pump-barrel', -23.447, -23.233, .465, 1.544, 54.426, 54.640, iron,
    { shape: 'round-y', blocking: true }),
  piece('common-pump-spout-collar', -23.441, -23.239, 1.108, 1.307, 54.383, 54.495, iron, { shape: 'round-z' }),
  piece('common-pump-spout', -23.395, -23.285, 1.153, 1.263, 53.887, 54.415, iron, { shape: 'round-z' }),
  piece('common-pump-outlet', -23.398, -23.282, 1.094, 1.215, 53.883, 54.003, iron, { shape: 'round-y' }),
  piece('common-pump-outlet-recess', -23.381, -23.299, 1.091, 1.098, 53.901, 53.984, darkIron, { shape: 'round-y' }),
  piece('common-pump-head', -23.478, -23.202, 1.442, 1.605, 54.395, 54.671, iron, { shape: 'round-y' }),
  piece('common-pump-pivot', -23.516, -23.169, 1.529, 1.609, 54.494, 54.574, darkIron, { shape: 'round-x' }),
  piece('common-pump-handle-lever', -23.376, -23.306, 1.533, 1.604, 54.548, 54.960, iron, { shape: 'round-z' }),
  piece('common-pump-handle-grip', -23.426, -23.258, 1.516, 1.605, 54.882, 55.021, darkIron, { shape: 'round-z' }),
];

export const HOME_COMMONS_WORKS = Object.freeze([...stoop, ...rill, ...curb, ...pump]);
