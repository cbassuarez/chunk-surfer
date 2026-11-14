// Stock is drawn under the ink. A crease changes the paper and leaves the
// letters intact, including the line added on the return version of the notice.
const papers = {
  'winter-departures': {
    seed: 23, tint: [-6, -3, 1], fiber: .8, edge: 7,
    // Sheltered copier sheet. The grey feed bands sit in its margins.
    feed: [[.023, .013, 13], [.975, .020, 9]],
    washes: [[.92, .89, .26, .18, 13]],
  },
  'visitor-route-slip': {
    seed: 36, tint: [-11, -10, -5], fiber: 1.25, edge: 14,
    folds: [[.05, .635, .93, .62, 15, .011], [.77, .47, .74, 1, 13, .012]],
    washes: [[1.0, .95, .30, .29, 35], [0, .73, .14, .29, 16]],
    pins: [[.05, .04, 12], [.95, .04, 11], [.08, .96, 14]],
  },
  'works-notice': {
    seed: 55, tint: [1, 3, 6], fiber: .75, edge: 8,
    washes: [[1.02, .95, .43, .27, 31], [.95, .78, .17, .35, 12]],
    folds: [[.70, .91, .99, .72, 10, .012]],
    pins: [[.09, .04, 13], [.91, .05, 9]],
  },
  'wood-note': {
    seed: 74, tint: [0, -1, -2], fiber: 2.3, edge: 18,
    folds: [[-.02, .565, 1.03, .518, 17, .018], [.51, .06, .58, .98, 7, .009]],
    washes: [[0, .43, .28, .23, 12], [.76, 1.02, .34, .17, 18]],
    pins: [[.49, .067, 14], [.93, .937, 11]],
  },
  'bakery-hours': {
    seed: 98, tint: [1, 2, 5], fiber: 1.05, edge: 9,
    folds: [[.0, .82, .28, 1.02, 8, .014]],
    washes: [[-.03, .82, .25, .26, 24], [.11, 1.0, .23, .19, 13]],
  },
};

function smooth(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function hash(x, y, seed) {
  let n = Math.imul(x + seed, 0x165667b1) ^ Math.imul(y - seed, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const tx = smooth(0, 1, x - ix), ty = smooth(0, 1, y - iy);
  const a = hash(ix, iy, seed) * (1 - tx) + hash(ix + 1, iy, seed) * tx;
  const b = hash(ix, iy + 1, seed) * (1 - tx) + hash(ix + 1, iy + 1, seed) * tx;
  return a * (1 - ty) + b * ty;
}

function foldLight(x, y, [ax, ay, bx, by, amount, width], rough) {
  const dx = bx - ax, dy = by - ay;
  const length = Math.hypot(dx, dy);
  const along = ((x - ax) * dx + (y - ay) * dy) / (length * length);
  const across = ((y - ay) * dx - (x - ax) * dy) / length + (rough - .5) * .012;
  const ridge = Math.exp(-(((across + width * .66) / width) ** 2));
  const lee = Math.exp(-(((across - width * .72) / (width * 1.45)) ** 2));
  return (ridge * .81 - lee) * amount * smooth(-.05, .10, along) * (1 - smooth(.82, 1.05, along));
}

export function valleyPaperStock({ id, width, height, base }) {
  const paper = papers[id === 'works-notice-return' ? 'works-notice' : id];
  if (!paper) return null;
  const { seed, tint, fiber, edge, folds = [], washes = [], pins = [], feed = [] } = paper;
  const colour = [1, 3, 5].map(start => Number.parseInt(base.slice(start, start + 2), 16));
  const pixels = Buffer.alloc(width * height * 3);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = (col + .5) / width, y = (row + .5) / height;
      const clouds = noise(x * 11, y * 10, seed);
      const speck = hash(col, row, seed + 9);
      const pulp = noise(col * .18, row * .65, seed + 7);
      const margin = Math.min(x, 1 - x, y, 1 - y);
      const sizing = edge * (1 - smooth(.001, .057, margin)) * (.23 + .77 * clouds);
      let light = (clouds - .5) * 7 + ((pulp - .5) * 4 + (speck - .5) * 1.8) * fiber - sizing;
      let damp = 0;

      for (const [cx, cy, rx, ry, amount] of washes) {
        // Moisture follows the exposed edge. Uneven drying leaves a narrow
        // capillary line and a broad weak stain inside it.
        const distance = Math.hypot((x - cx) / rx, (y - cy) / ry) + (clouds - .5) * .32;
        const inside = 1 - smooth(.24, .96, distance);
        const tide = smooth(.70, .83, distance) * (1 - smooth(.84, 1.03, distance));
        damp += (inside * .61 + tide * .38) * amount;
      }
      for (const crease of folds) light += foldLight(x, y, crease, clouds);
      for (const [cx, cy, amount] of pins) {
        const distance = Math.hypot((x - cx) * 1.07, (y - cy) * 1.46);
        light -= (1 - smooth(.004, .035, distance)) * amount * (.61 + clouds * .39);
      }
      for (const [centre, width, amount] of feed) {
        light -= amount * (1 - smooth(0, width, Math.abs(x - centre))) * (.59 + .41 * clouds);
      }
      const offset = (row * width + col) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const value = colour[channel] + tint[channel] + light - damp * (channel === 2 ? 1.5 : channel === 1 ? 1.07 : .74);
        pixels[offset + channel] = Math.round(Math.max(0, Math.min(255, value)));
      }
    }
  }
  return pixels;
}
