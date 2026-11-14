// Everyday work around the valley's existing places. Coordinates are metres
// from the grey door. The compact groups keep the walk and its sightlines open.
const stone = 50, board = 51, ice = 55, wornPaint = 56, snow = 57;
const linen = 61, cutTimber = 62, wornIron = 63;

function piece(id, x0, x1, y0, y1, z0, z1, material, details = {}) {
  return Object.freeze({ id, x0, x1, y0, y1, z0, z1, material, ...details });
}

function trim(id, x0, x1, y0, y1, z0, z1, material, shape) {
  return piece(id, x0, x1, y0, y1, z0, z1, material,
    shape ? { blocking: false, shape } : { blocking: false });
}

const site = (id, pieces) => Object.freeze({ id, pieces: Object.freeze(pieces) });

// Park the hand-sled nose out in the gap between the steps and roof-water
// rill. Its pull rope lies flat at the edge of the road.
const sled = site('commons-wood-sled', [
  trim('commons-sled-near-runner', -15.85, -13.50, .01, .12, 54.99, 55.10, board),
  trim('commons-sled-far-runner', -15.85, -13.50, .01, .12, 55.69, 55.80, board),
  trim('commons-sled-near-shoe', -15.88, -13.47, .005, .037, 54.98, 55.11, wornIron),
  trim('commons-sled-far-shoe', -15.88, -13.47, .005, .037, 55.68, 55.81, wornIron),
  trim('commons-sled-left-bearer', -15.56, -15.40, .09, .28, 54.97, 55.81, wornPaint),
  trim('commons-sled-right-bearer', -13.84, -13.68, .09, .28, 54.97, 55.81, wornPaint),
  piece('commons-sled-deck', -15.72, -13.56, .24, .37, 54.91, 55.87, board),
  piece('commons-sled-side-left', -15.60, -15.49, .33, .84, 54.91, 55.87, wornPaint),
  trim('commons-sled-side-right', -13.80, -13.69, .33, .71, 54.91, 55.87, wornPaint),
  trim('commons-sled-round-a', -15.47, -13.83, .36, .62, 55.00, 55.26, cutTimber, 'round-x'),
  trim('commons-sled-round-b', -15.36, -13.81, .36, .64, 55.26, 55.54, cutTimber, 'round-x'),
  trim('commons-sled-round-c', -15.46, -13.77, .36, .62, 55.54, 55.80, cutTimber, 'round-x'),
  trim('commons-sled-round-d', -15.22, -13.94, .57, .84, 55.14, 55.41, cutTimber, 'round-x'),
  trim('commons-sled-round-e', -15.45, -14.15, .60, .84, 55.40, 55.64, cutTimber, 'round-x'),
  trim('commons-sled-rope-out', -13.61, -12.92, .015, .039, 55.37, 55.405, board),
  trim('commons-sled-rope-return', -13.42, -12.92, .010, .037, 55.42, 55.455, board),
  trim('commons-sled-rope-bight', -12.95, -12.915, .014, .035, 55.39, 55.45, board),
].map(({x0,x1,z0,z1,shape,...fabric})=>Object.freeze({
  ...fabric,
  x0: -15.02 + (z0 - 55.39), x1: -15.02 + (z1 - 55.39),
  z0: 55.44 - (x1 + 14.675), z1: 55.44 - (x0 + 14.675),
  ...(shape === 'round-x' ? { shape: 'round-z' } : {}),
})));

// The stack has rough bark, offset end grain and a shallow snow cap. It backs
// onto the unlit store and leaves the door and the short foot track clear.
const stack = site('commons-stacked-wood', [
  trim('commons-stack-outer-bearer', -21.71, -21.55, .16, .40, 57.59, 59.37, board),
  trim('commons-stack-inner-bearer', -20.70, -20.55, .13, .40, 57.59, 59.37, board),
  ...[
    [57.65, .37, .30, -21.66], [57.95, .37, .30, -21.84],
    [58.25, .37, .32, -21.78], [58.57, .37, .30, -21.88],
    [58.87, .37, .33, -21.74], [59.20, .37, .29, -21.80],
    [57.81, .62, .31, -21.83], [58.12, .64, .30, -21.69],
    [58.42, .64, .31, -21.86], [58.73, .63, .29, -21.78],
    [59.02, .64, .29, -21.83],
    [57.98, .91, .29, -21.63], [58.27, .91, .31, -21.70],
    [58.58, .92, .28, -21.81], [58.86, .89, .28, -21.63],
  ].map(([z, y, size, x], index) =>
    piece(`commons-stack-round-${index + 1}`, x, -20.33, y, y + size, z, z + size,
      cutTimber, { shape: 'round-x' })),
  trim('commons-stack-cap-a', -21.65, -20.34, 1.16, 1.235, 58.01, 58.57, snow),
  trim('commons-stack-cap-b', -21.61, -20.36, 1.15, 1.216, 58.57, 59.02, snow),
]);

// A short wash line stands just beyond the working side of the pump. Uneven
// hems and separate articles keep the colour block readable as drying cloth.
const washing = site('workyard-washing', [
  piece('workyard-line-west', 17.38, 17.51, -.89, 1.37, 49.96, 50.08, board),
  piece('workyard-line-east', 20.66, 20.79, -.91, 1.31, 49.96, 50.08, board),
  trim('workyard-line', 17.46, 20.71, 1.276, 1.299, 50.004, 50.034, wornIron),
  piece('workyard-sheet', 17.65, 18.82, .31, 1.301, 49.986, 50.052, linen,
    { shape: 'cloth' }),
  piece('workyard-tea-towel', 19.01, 19.47, .76, 1.299, 49.984, 50.051, linen,
    { shape: 'cloth' }),
  piece('workyard-apron', 19.67, 20.40, .52, 1.295, 49.982, 50.052, linen,
    { shape: 'cloth' }),
  ...[17.73, 18.70, 19.07, 19.40, 19.76, 20.31].map((x, index) =>
    trim(`workyard-line-peg-${index + 1}`, x, x + .036, 1.265, 1.36, 49.984, 50.053, wornPaint)),
]);

// Kitchen plot on the far side of the rear drift. A barrel, two beds and
// retained plant supports suggest the household's ordinary outdoor routine.
// They stay well left of the route looking back at the house.
const plot = site('home-kitchen-plot', [
  ...[[-6.25, -4.89], [-4.38, -3.02]].flatMap(([x0, x1], index) => [
    trim(`plot-bed-${index + 1}-west`, x0, x0 + .10, -.018, .14, 85.24, 89.28, board),
    trim(`plot-bed-${index + 1}-east`, x1 - .10, x1, -.018, .14, 85.24, 89.28, board),
    trim(`plot-bed-${index + 1}-south`, x0 + .10, x1 - .10, -.018, .14, 85.24, 85.35, board),
    trim(`plot-bed-${index + 1}-north`, x0 + .10, x1 - .10, -.018, .14, 89.17, 89.28, board),
    trim(`plot-bed-${index + 1}-soil`, x0 + .10, x1 - .10, -.026, .048, 85.35, 89.17, stone),
    trim(`plot-bed-${index + 1}-drift`, x0 + .10, x1 - .10, .015, .065, 87.84, 89.17, snow),
  ]),
  ...[-6.15, -5.0].map((x, index) =>
    piece(`plot-trellis-post-${index + 1}`, x, x + .09, -.10, 1.08, 87.68, 87.77, board)),
  trim('plot-trellis-top', -6.15, -4.91, .98, 1.063, 87.69, 87.76, board),
  trim('plot-trellis-middle', -6.14, -4.94, .49, .521, 87.70, 87.74, cutTimber),
  ...[-5.90, -5.57, -5.22].map((x, index) =>
    trim(`plot-trellis-cane-${index + 1}`, x, x + .032, .10, .99, 87.694, 87.736, cutTimber)),
  piece('plot-barrel-staves', -2.68, -1.84, -.055, .87, 84.82, 85.66, board,
    { shape: 'round-y' }),
  trim('plot-barrel-bottom-hoop', -2.70, -1.82, .14, .205, 84.80, 85.68, wornIron, 'round-y'),
  trim('plot-barrel-top-hoop', -2.70, -1.82, .67, .735, 84.80, 85.68, wornIron, 'round-y'),
  trim('plot-barrel-dark-lid', -2.64, -1.88, .84, .884, 84.86, 85.62, board, 'round-y'),
  trim('plot-barrel-frozen-crease', -2.54, -1.94, .881, .90, 84.91, 85.54, ice),
]);

export const HOME_VALLEY_LIFE_SITES = Object.freeze([sled, stack, washing, plot]);
