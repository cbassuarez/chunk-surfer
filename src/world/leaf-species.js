// WHAT A LEAF LOOKS LIKE, AUTHORED ONCE.
//
// Leaves show up on three renderers that share nothing else — the boot credits'
// 2D canvas, the raymarched yard, and Source's flat field. If each one invents
// its own colour and shape they stop being the same leaves and start being
// three unrelated effects that happen to be leaf-coloured.
//
// So the species live here, as data, and each renderer draws them in whatever
// way it can. What must agree between them is the PALETTE and the SILHOUETTE
// SET, because those are what the eye uses to say "same night".
//
// A PALETTE, NOT A HUE JITTER. Randomising a hue around brown gives you sixty
// slightly different browns, which the eye reads as noise on one object rather
// than as a mix of leaves. Five authored colours read as five kinds of tree.
//
// AND A CURL, which is the detail that actually does the work. A flat leaf is a
// coin: it turns, and its silhouette narrows linearly and symmetrically, which
// nothing organic does. Give it a curl and the turn goes lopsided — wide, then
// suddenly a hook, then a line — and it stops being a disc immediately.

const freeze = (value) => Object.freeze(value);

export const LEAF_COLOURS = freeze([
  freeze({ id: 'ochre', fill: '#D8B87C', vein: '#6E5322' }),   // dry, the common one
  freeze({ id: 'rust', fill: '#C08A4A', vein: '#5E3A18' }),    // turned early
  freeze({ id: 'bleached', fill: '#A8A98A', vein: '#5C5F45' }), // a season on the ground
  freeze({ id: 'wet', fill: '#8A6A3E', vein: '#3A2A14' }),     // soaked, darkest
  freeze({ id: 'pale', fill: '#E6D3A8', vein: '#7A6636' }),    // sun-bleached, brightest
]);

// Four silhouettes. `lobes` is what the 2D renderer builds its path from and
// what the mesh builder cuts; `slim` is the height-to-width ratio; `flutter`
// scales how violently the shape tumbles, because a curled leaf catches the air
// differently from a flat blade.
export const LEAF_SHAPES = freeze([
  freeze({ id: 'blade', lobes: 1, slim: 0.34, flutter: 1.0, curl: 0.15, weight: 4 }),
  freeze({ id: 'lobed', lobes: 3, slim: 0.62, flutter: 0.85, curl: 0.22, weight: 3 }),
  freeze({ id: 'curled', lobes: 1, slim: 0.46, flutter: 1.45, curl: 0.85, weight: 2 }),
  freeze({ id: 'skeleton', lobes: 3, slim: 0.58, flutter: 1.2, curl: 0.40, weight: 1 }),
]);

const SHAPE_TOTAL = LEAF_SHAPES.reduce((sum, shape) => sum + shape.weight, 0);

export function leafColour(unit = 0) {
  const index = Math.min(LEAF_COLOURS.length - 1, Math.floor(Math.max(0, unit) * LEAF_COLOURS.length));
  return LEAF_COLOURS[index];
}

// Weighted, so plain blades are common and skeletons are the one you notice.
export function leafShape(unit = 0) {
  let ticket = Math.max(0, Math.min(0.9999, unit)) * SHAPE_TOTAL;
  for (const shape of LEAF_SHAPES) {
    ticket -= shape.weight;
    if (ticket < 0) return shape;
  }
  return LEAF_SHAPES[0];
}

// The outline of one leaf in unit space (-0.5..0.5 on the long axis), as points
// a 2D path or a mesh strip can both consume. Built rather than authored so the
// curl can bend it: a curled leaf's two edges are not mirror images, and that
// asymmetry is the whole reason it does not read as a disc.
export function leafOutline(shape, { steps = 14 } = {}) {
  const points = [];
  const lobes = Math.max(1, shape.lobes);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;                      // 0 stalk, 1 tip
    const along = t - 0.5;
    // A leaf is widest a third of the way from the stalk, not at the middle.
    const taper = Math.sin(Math.pow(t, 0.72) * Math.PI);
    // Lobes cut back toward the midrib; one lobe leaves a plain blade.
    const cut = lobes > 1 ? 1 - Math.abs(Math.sin(t * Math.PI * lobes)) * 0.42 : 1;
    const half = taper * cut * shape.slim * 0.5;
    // The curl lifts one edge and drops the other, so the two sides of the
    // outline stop mirroring each other.
    const bend = Math.sin(t * Math.PI) * shape.curl * 0.18;
    points.push({ along, upper: half + bend, lower: -half + bend * 0.35 });
  }
  return points;
}
