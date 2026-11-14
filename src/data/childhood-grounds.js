// The old lane and the lower service verge share the winter ground. All
// dimensions are local metres from the grey door, with +z toward the house.
const freeze = (rows) => Object.freeze(rows.map(row => Object.freeze(row)));

// Positive shoulders collect drifting snow. The lee cut stays outside the
// level lane and terminates before the house's separate foundation scours.
export const HOME_APPROACH_DRIFTS = freeze([
  { x: -5.6, z: 10, rx: 2.6, rz: 13, rise: .79 },
  { x: 5.4, z: 13, rx: 2.9, rz: 13, rise: .97 },
  { x: -5.5, z: 32, rx: 3.0, rz: 15, rise: 1.12 },
  { x: 6.8, z: 34, rx: 2.3, rz: 13, rise: .61 },
  { x: 5.0, z: 38, rx: 2.6, rz: 18, rise: -.83 },
  { x: -5.8, z: 53, rx: 3.0, rz: 11, rise: .88 },
  { x: 7.9, z: 57, rx: 2.7, rz: 10, rise: .84 },
  // The yard has accumulated against the house. Leave the uphill pane's
  // approach level and the two side scours open below it.
  { x: -2.55, z: 68.5, rx: 1.70, rz: 2.68, rise: .66 },
  { x: 3.10, z: 69.9, rx: 3.00, rz: 3.00, rise: .91 },
]);

export const HOME_APPROACH_WALLS = freeze([
  // This wall separates the lane from the lower way. The ends and the field
  // opening are where a person can change sides, with no gate to operate.
  { id: 'lane-wall-near', x0: 2.48, x1: 3.04, z0: 22.5, z1: 32.6, base: -.63, top: 1.08, material: 'yard-stone' },
  { id: 'lane-wall-far', x0: 2.48, x1: 3.04, z0: 35.1, z1: 48.7, base: -.70, top: 1.16, material: 'yard-stone' },
  { id: 'field-post-near', x0: 2.37, x1: 3.15, z0: 32.18, z1: 32.86, base: -.70, top: 1.37, material: 'yard-stone' },
  { id: 'field-post-far', x0: 2.37, x1: 3.15, z0: 34.86, z1: 35.56, base: -.72, top: 1.31, material: 'yard-stone' },
  // The lower branch has a closed field edge and a clear end. The low
  // return of the wall frames the uphill rejoin from the opposite side.
  { id: 'verge-retaining-wall', x0: 7.16, x1: 7.79, z0: 38, z1: 47.1, base: -.84, top: .72, material: 'yard-stone' },
  { id: 'verge-return', x0: 6.32, x1: 7.79, z0: 46.58, z1: 47.14, base: -.68, top: .71, material: 'yard-stone' },
  { id: 'house-boundary-left', x0: -7.95, x1: -2.25, z0: 56.18, z1: 56.80, base: -.18, top: .88, material: 'yard-stone' },
  { id: 'house-boundary-right', x0: 2.10, x1: 8.95, z0: 56.18, z1: 56.80, base: -.21, top: .94, material: 'yard-stone' },
  { id: 'house-post-left', x0: -2.62, x1: -2.02, z0: 56.05, z1: 56.89, base: -.20, top: 1.38, material: 'yard-stone' },
  { id: 'house-post-right', x0: 1.89, x1: 2.52, z0: 56.05, z1: 56.89, base: -.22, top: 1.46, material: 'yard-stone' },
]);

// Tops line up with the utility run and step down to a wall fixing at the
// house. Poles, hardware and sag remain rooted when the player turns back.
export const HOME_APPROACH_POLES = freeze([
  { id: 'lane-pole', x: -3.67, z: 10.1, base: -.12, top: 6.43, radius: .115 },
  { id: 'field-pole', x: -3.80, z: 33.1, base: -.12, top: 6.19, radius: .128 },
  { id: 'service-pole', x: -3.23, z: 57.6, base: -.12, top: 5.82, radius: .112 },
]);
export const HOME_SERVICE_FIXING = Object.freeze({ x: -.67, y: 2.64, z: 69.86 });

// The side wall's outlet leads into the lower snow cut. Its aperture fits
// neither a player nor another route and never implies an enterable tunnel.
export const HOME_DRAIN = Object.freeze({ x: 7.15, y: .25, z: 42.1, radius: .28, width: .27 });

// The taller tree marks the turn into the property. The broken lower tree
// beside the exposed lane survives as the same landmark seen on return.
export const HOME_APPROACH_TREES = freeze([
  { id: 'lane-tree', x: -6.4, z: 18.3, base: .08, height: 3.18, radius: .20, side: -1 },
  { id: 'yard-tree', x: -4.97, z: 60.2, base: .12, height: 5.20, radius: .24, side: 1 },
]);

export const HOME_LANE = Object.freeze({ wave: .62, rate: .105, track: .67, shoulder: 1.72,
  leeX: 5.05, leeStart: 16, leeEnd: 55, leeWidth: 1.23 });

// A plough pushes the heavier windrow toward the wall. The separate runs
// leave the field opening clear and die away before the crossroad.
export const HOME_LANE_SNOWBANKS = freeze([
  { start: 20, end: 32.6, leftRise: .25, rightRise: .37 },
  { start: 35.3, end: 47.8, leftRise: .31, rightRise: .44 },
]);
export const HOME_LANE_BANK_SECTION = Object.freeze({ crest: 2.04, cut: .43, apron: .98 });

// The low, wide toe of each drift is part of the same ground the feet stand
// on. The commons banks leave the pump approach, steps and runoff inlet open.
export const HOME_PILED_SNOW = freeze([
  { x: 3.64, z: 27.45, rx: 1.28, rz: 4.95, rise: .48 },
  { x: 3.79, z: 42.05, rx: 1.40, rz: 6.16, rise: .61 },
  { x: 8.05, z: 43.9, rx: 1.06, rz: 3.05, rise: .43 },
  { x: -5.4, z: 57.02, rx: 2.40, rz: 1.02, rise: .38 },
  { x: 5.46, z: 57.12, rx: 2.66, rz: 1.09, rise: .50 },
  { x: -27.12, z: 24.91, rx: 1.63, rz: .78, rise: .28 },
  { x: -21.34, z: 54.67, rx: .81, rz: .42, rise: .24 },
  { x: -12.92, z: 54.83, rx: .92, rz: .53, rise: .34 },
  { x: -13.52, z: 60.70, rx: 1.46, rz: 1.50, rise: .55 },
  { x: -6.32, z: 60.14, rx: 1.27, rz: 1.26, rise: .46 },
  { x: -1.51, z: 78.02, rx: 1.41, rz: 1.19, rise: .53 },
  { x: 4.61, z: 77.88, rx: 2.08, rz: 1.79, rise: .72 },
  { x: 16.90, z: 47.20, rx: 1.12, rz: 2.50, rise: .35 },
  { x: 29.26, z: 56.87, rx: 2.19, rz: 1.62, rise: .49 },
]);
const approachGrades = [...HOME_APPROACH_DRIFTS, ...HOME_PILED_SNOW];

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function homeLaneBankRise(x, z) {
  if (Math.abs(x) > 3.65) return 0;
  const run = HOME_LANE_SNOWBANKS.find(({ start, end }) => z > start && z < end);
  if (!run) return 0;
  const { crest, cut, apron } = HOME_LANE_BANK_SECTION;
  const across = x - HOME_LANE.wave * Math.sin(z * HOME_LANE.rate);
  const edge = Math.abs(across) - crest;
  const width = edge < 0 ? cut : apron;
  const length = (z - run.start) / (run.end - run.start);
  const section = Math.max(0, 1 - (edge / width) ** 2);
  const ends = Math.max(0, 4 * length * (1 - length));
  return section ** 2 * ends ** 2 * (across < 0 ? run.leftRise : run.rightRise);
}

export function homeApproachRise(x, z) {
  return approachGrades.reduce((height, { x: cx, z: cz, rx, rz, rise }) => {
    if (Math.abs(x - cx) >= rx || Math.abs(z - cz) >= rz) return height;
    const strength = Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2);
    return height + rise * strength ** 2;
  }, homeLaneBankRise(x, z));
}

export function homeGroundProfile(x, z) {
  const { wave, rate, shoulder, leeX, leeStart, leeEnd, leeWidth } = HOME_LANE;
  const laneX = wave * Math.sin(z * rate);
  const lane = (1 - smooth(shoulder * .65, shoulder, Math.abs(x - laneX)))
    * (1 - smooth(58, 65, z));
  const lee = smooth(leeStart, leeStart + 10, z) * (1 - smooth(leeEnd - 9, leeEnd, z));
  const shelter = lee * (1 - smooth(leeWidth, leeWidth + 1.15, Math.abs(x - leeX)));
  return { lane, shelter };
}
