// The fold over the existing fence wire is the garment origin.
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const surface = () => ({ p: [], i: [] });

function triangle(surface, a, b, c) {
  const index = surface.p.length / 3;
  surface.p.push(...a, ...b, ...c);
  surface.i.push(index, index + 1, index + 2);
}

function join(surface, a, b, reverse = false) {
  for (let i = 0; i < a.length; i++) {
    const next = (i + 1) % a.length;
    if (reverse) {
      triangle(surface, a[i], b[next], b[i]);
      triangle(surface, a[i], a[next], b[next]);
    } else {
      triangle(surface, a[i], b[i], b[next]);
      triangle(surface, a[i], b[next], a[next]);
    }
  }
}

function mixPoint(a, b, t) {
  return a.map((component, axis) => mix(component, b[axis], t));
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map(component => component / length);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function torso(wool, ribs, inside) {
  const count = 64;
  function shape(t, side) {
    return Array.from({ length: count }, (_, i) => {
      // Superellipse with an asymmetrical shoulder and a hem that hangs
      // about two centimetres lower at the long sleeve.
      const a = i / count * TAU;
      const dx = Math.cos(a), dy = Math.sin(a);
      const zEdge = .257 * Math.sign(dx) * Math.abs(dx) ** .37;
      const yEdge = -.154 + .157 * Math.max(0, dy) ** .46
        - .424 * Math.max(0, -dy) ** .39 + zEdge * .038;
      const zNeck = .101 * dx - .012;
      const yNeck = -.071 + (dy < 0 ? .069 : .032) * dy;
      const y = mix(yNeck, yEdge, t) - .012 * Math.cos(a * 3.8) * t ** 1.9;
      const z = mix(zNeck, zEdge, t);
      const overRail = Math.exp(-((y + .010) ** 2) / .0019);
      const hang = Math.min(1, Math.max(0, -y / .56));
      const fold = (.011 * Math.sin(z * 33 + 1.7 * y) + .006 * Math.sin(z * 71 - y * 6))
        * (.25 + .75 * Math.sin(Math.PI * hang * .71));
      const long = side > 0 ? .018 * hang ** 1.8 : -.032 * hang ** 1.8;
      const pull = (1 - overRail) * (long + side * (.057 + .022 * hang) + fold);
      const neckRib = side * .0036 * Math.cos(a * 35) * Math.max(0, 1 - t / .18);
      const hemRib = side * .0028 * Math.cos(z * 191) * Math.max(0, 2 - y / -.30)
        * Math.max(0, (t - .849) / .151) * Math.max(0, Math.min(1, -y * 2.8));
      return [pull + neckRib + hemRib, y + (side < 0 ? .053 * hang * hang : 0), z];
    });
  }
  const cuts = [0, .045, .11, .17, .26, .37, .49, .64, .78, .878, .934, .976, 1];
  const rings = [-1, 1].map(side => cuts.map(t => shape(t, side)));
  rings.forEach((side, index) => {
    for (let i = 1; i < side.length; i++) {
      join(i <= 3 || i >= 10 ? ribs : wool, side[i - 1], side[i], index === 1);
    }
  });
  // The neck really is open, with a turned inner collar, and the folded
  // sides meet around the hem. A pipe of wire sits under the upper fold.
  const [back, front] = rings;
  join(inside, front[0], back[0]);
  join(ribs, back.at(-1), front.at(-1));
}

function sleeve(wool, ribs, inside, side) {
  const left = side < 0;
  const profiles = left
    ? [[.027, -.104, -.216, .108], [.070, -.185, -.287, .097], [.090, -.295, -.336, .078],
      [.112, -.435, -.367, .070], [.145, -.568, -.396, .052], [.138, -.612, -.414, .044]]
    : [[.012, -.108, .223, .106], [0, -.164, .287, .098], [-.036, -.254, .337, .084],
      [-.059, -.346, .367, .071], [-.077, -.461, .351, .054], [-.086, -.509, .343, .046]];
  const rows = [];
  for (let k = 0; k < profiles.length - 1; k++) {
    const a = profiles[k], b = profiles[k + 1], count = k === profiles.length - 2 ? 5 : 4;
    const axis = normalize(b.slice(0, 3).map((component, i) => component - a[i]));
    const depth = normalize(cross([0, 0, 1], axis));
    const width = cross(axis, depth);
    for (let j = k === 0 ? 0 : 1; j <= count; j++) {
      const t = j / count, [x, y, z, r] = mixPoint(a, b, t);
      const cuff = k === profiles.length - 2;
      const ring = Array.from({ length: 24 }, (_, i) => {
        const angle = i / 24 * TAU;
        const fold = 1 + (.13 - .035 * t) * Math.cos(angle * 5 + 2 * t + k * .8);
        const rib = cuff ? .0027 * Math.cos(angle * 12) * (Math.sin(Math.PI * t) * .33 + .67) : 0;
        const u = Math.cos(angle) * (r * (.54 + .03 * k) * fold + rib);
        const v = Math.sin(angle) * (r * fold + rib);
        return [x + depth[0] * u + width[0] * v,
          y + depth[1] * u + width[1] * v, z + depth[2] * u + width[2] * v];
      });
      const previous = rows.at(-1);
      if (previous) join(cuff ? ribs : wool, previous, ring, true);
      rows.push(ring);
    }
  }
  const edge = rows.at(-1), [x, y, z] = profiles.at(-1);
  const turned = edge.map(([u, v, w]) => [x + (u - x) * .81, y + (v - y) * .81 + .010, z + (w - z) * .81]);
  const hollow = turned.map(([a, b, c]) => [x + (a - x) * .72, b + .032, z + (c - z) * .72]);
  join(ribs, edge, turned, true);
  join(inside, turned, hollow, true);
  for (let i = 0; i < hollow.length; i++) {
    triangle(inside, hollow[(i + 1) % hollow.length], hollow[i], [x, y + .042, z]);
  }
}

const yarn = (name, geometry, color, glow) =>
  Object.freeze({ name, ...geometry, base: [...color, 1], emissive: glow, roughness: .99, metallic: 0 });
let garment;

export const MEMORY_FIELD_JUMPER_MESHES = Object.freeze(['mf_jumper', 'mf_jumper_rib', 'mf_jumper_lining']);

export function memoryFieldJumperGeometry() {
  if (garment) return garment;
  const wool = surface(), ribs = surface(), inside = surface();
  torso(wool, ribs, inside);
  for (const side of [-1, 1]) sleeve(wool, ribs, inside, side);
  garment = Object.freeze([
    yarn(MEMORY_FIELD_JUMPER_MESHES[0], wool, [.241, .421, .266], [.049, .091, .048]),
    yarn(MEMORY_FIELD_JUMPER_MESHES[1], ribs, [.172, .334, .208], [.031, .060, .032]),
    yarn(MEMORY_FIELD_JUMPER_MESHES[2], inside, [.092, .155, .088], [.014, .027, .015]),
  ]);
  return garment;
}
