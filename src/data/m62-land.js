// THE LAND BEHIND THE ROAD. Seb, 2026-11-06: the drives had a road, a shoulder and
// the ground next to them, and nothing further off. Ellery's paper says Brighouse,
// so what lies beyond is the M62 where it climbs into the South Pennines: Millstone
// Grit, stepped hillsides, flat moor tops, reservoirs, and the motorway with a farm
// between its two carriageways. A composite, not a survey: nothing here is a real
// grid reference, and nothing is named on screen.
//
// Pure. Metres in the road's own frame (forward is -Z, right is +X); the renderer's
// world is this plus 32 on X and Z. The height field is the one place the land is
// decided: the sky pass draws it, and the far lights test against it.
export const M62_LAND = Object.freeze({
  radius: 16000, size: 512, maxHeight: 420,
  // Where the road's shelf ends and the ground is allowed to do anything.
  shelfMetres: 48, shelfY: -1.5,
  farm: Object.freeze({ x: -125, z: 150, y: -3 }),
  waterY: -60, basin: Object.freeze({ x: -170, z: -620, rx: 130, rz: 340 }),
  // The tall thing every West Yorkshire drive has somewhere on its skyline.
  tower: Object.freeze({ x: 4800, z: -3400, height: 330 }),
  // Off the moor's own edge, where the town is. The sky above it is lit by it.
  townBearing: Object.freeze({ x: .62, z: -.78 }),
  // The land gives way to the cliff's own memory past this much road.
  fromDistance: 120, toDistance: 172,
});
export const M62_TRAFFIC = Object.freeze({ each: 26, span: 9000, speedMin: 23, speedMax: 31, nearMetres: 420, laneOffset: 3.4 });

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const fract = v => v - Math.floor(v);
function lattice(ix, iz) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1);
  h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d); h = Math.imul(h ^ h >>> 12, 0x297a2d39);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(lattice(ix, iz), lattice(ix + 1, iz), u), mix(lattice(ix, iz + 1), lattice(ix + 1, iz + 1), u), v) * 2 - 1;
}
const fbm = (x, z) => noise(x, z) * .6 + noise(x * 2.1 + 7.3, z * 2.1 - 3.1) * .28 + noise(x * 4.3 - 2.2, z * 4.3 + 5.7) * .12;

// A curve of about 1500 m radius: it comes closest beside the farm and leaves on
// both sides, which is why you see it from the whole of the road.
export const m62CentreX = z => M62_LAND.farm.x - (z - M62_LAND.farm.z) ** 2 / 3000;
// The carriageways part around the farm and close up again within half a kilometre.
export const m62HalfGap = z => 11 + 31 * smooth(1 - Math.abs(z - M62_LAND.farm.z) / 460);
// It climbs both ways out of the valley, up onto the moor.
export const m62RoadY = z => Math.min(240, M62_LAND.farm.y + .000022 * (z - M62_LAND.farm.z) ** 2);

// Each hard bed of grit holds a shelf; the soft shale between them is the slope.
function strata(y) {
  const bed = 26, u = y / bed, base = Math.floor(u), f = u - base;
  return (base + smooth((f - .45) / .4)) * bed;
}

export function m62HeightAt(x, z) {
  const L = M62_LAND, west = Math.max(0, -x - L.shelfMetres), east = Math.max(0, x - L.shelfMetres);
  const off = Math.max(west, east), far = smooth((off - 120) / 900);
  let y = L.shelfY;
  // West: down off the shelf, across the valley, up the far side beyond the motorway.
  y -= 2.5 * smooth(west / 70);
  const centre = m62CentreX(z), beyond = Math.max(0, centre - x - 40);
  y += 210 * smooth(beyond / 1700) + 130 * smooth((beyond - 1400) / 2600);
  // East: the held flank, a slow climb, then the top.
  y += 12 * smooth(east / 120) + 44 * smooth((east - 150) / 700) + 95 * smooth((east - 700) / 1200) + 150 * smooth((east - 1800) / 2600);
  // The long view ahead and behind ends in more of the same, far off and hazed.
  y += 190 * smooth((-z - 3600) / 3400) + 165 * smooth((z - 3600) / 3200);
  // Cloughs and the slow unevenness of a moor, nothing near the road.
  y += far * (46 * fbm(x / 1700, z / 1700) + 11 * fbm(x / 430 + 9, z / 430 - 4));
  y -= far * 16 * Math.max(0, 1 - Math.abs(fbm(x / 520 - 31, z / 880 + 12)) * 6);
  // Beds show on the slopes; the tops are cut off flat.
  y = mix(y, strata(y), smooth((off - 260) / 500) * .85);
  if (y > 300) y = 300 + (y - 300) * .22;
  // The basin, and the water that fills it.
  const b = ((x - L.basin.x) / L.basin.rx) ** 2 + ((z - L.basin.z) / L.basin.rz) ** 2;
  y -= 62 * smooth(1 - b);
  // The motorway takes what it needs: a cutting through high ground, a bank over low.
  const c = Math.abs(x - centre), gap = m62HalfGap(z);
  y = mix(y, m62RoadY(z) - .4, 1 - smooth((c - gap - 16) / 80));
  return Math.max(y, -90);
}

// R height, G how much light the ground gives back, B water, A how walled it is.
export function m62GroundAt(x, z, y = m62HeightAt(x, z)) {
  const L = M62_LAND, b = ((x - L.basin.x) / L.basin.rx) ** 2 + ((z - L.basin.z) / L.basin.rz) ** 2;
  if (b < 1 && y <= L.waterY) return { height: L.waterY, ground: 0, water: 1, walls: 0 };
  const off = Math.max(Math.abs(x) - L.shelfMetres, 0), rough = fbm(x / 240 + 3, z / 240 - 9);
  // Improved pasture low down, rough grazing above it, cottongrass and black peat on top.
  const pasture = 1 - smooth((y - 34) / 70), moor = smooth((y - 96) / 80);
  let ground = mix(mix(.3, .62, pasture), .15, moor);
  if (moor > .4 && rough > .22) ground = .045;
  // Dark blocks of plantation on the lower flanks.
  if (y < 70 && off > 240 && fbm(x / 620 - 17, z / 620 + 28) > .34) ground = .025;
  // The raw edge the water leaves round a reservoir.
  if (b < 1.2 && y < L.waterY + 8) ground = .72;
  // The motorway's own cutting faces and its dark road.
  const c = Math.abs(x - m62CentreX(z)), gap = m62HalfGap(z);
  if (c < gap + 15 && Math.abs(c - gap) < 14) ground = .05;
  else if (c < gap + 40 && Math.abs(y - m62RoadY(z)) > 4) ground = Math.max(ground, .5);
  return { height: y, ground, water: 0, walls: pasture * (1 - moor) };
}

const uvOf = v => .5 + .5 * Math.sign(v) * Math.sqrt(Math.abs(v));
const inverseUv = u => { const q = u * 2 - 1; return Math.sign(q) * q * q; };

// Built a few rows at a time before a drive: the bake would otherwise cost a frame
// or two of the world it is preparing for. `pause` yields between batches.
let builtField = null, building = null;
export function m62LandField() { return builtField; }
export function buildM62LandField({ size = M62_LAND.size, pause = null } = {}) {
  if (builtField?.size === size) return Promise.resolve(builtField);
  if (building) return building;
  building = (async () => {
    const data = new Float32Array(size * size * 4);
    for (let row = 0; row < size; row++) {
      const z = inverseUv((row + .5) / size) * M62_LAND.radius;
      for (let col = 0; col < size; col++) {
        const x = inverseUv((col + .5) / size) * M62_LAND.radius, g = m62GroundAt(x, z), i = (row * size + col) * 4;
        data[i] = g.height; data[i + 1] = g.ground; data[i + 2] = g.water; data[i + 3] = g.walls;
      }
      if (pause && row % 24 === 23) await pause();
    }
    builtField = Object.freeze({ size, radius: M62_LAND.radius, data });
    building = null;
    return builtField;
  })();
  return building;
}
export function m62FieldHeight(field, x, z) {
  const fx = uvOf(clamp(x / field.radius, -1, 1)) * field.size - .5, fz = uvOf(clamp(z / field.radius, -1, 1)) * field.size - .5;
  const ix = clamp(Math.floor(fx), 0, field.size - 2), iz = clamp(Math.floor(fz), 0, field.size - 2), u = clamp(fx - ix), v = clamp(fz - iz), d = field.data, s = field.size;
  const at = (a, b) => d[(b * s + a) * 4];
  return mix(mix(at(ix, iz), at(ix + 1, iz), u), mix(at(ix, iz + 1), at(ix + 1, iz + 1), u), v);
}
// Whether the ground stands between the eye and something out there.
export function m62LineClear(height, eye, x, y, z, steps = 22) {
  for (let i = 1; i < steps; i++) {
    // Most of the samples go near the eye, where the ground is doing the blocking.
    const t = (i / steps) ** 1.6, px = eye[0] + (x - eye[0]) * t, pz = eye[2] + (z - eye[2]) * t, py = eye[1] + (y + 1.5 - eye[1]) * t;
    if (height(px, pz) > py) return false;
  }
  return true;
}

// Every vehicle on the motorway at this moment, on a loop far longer than the view.
// Traffic keeps left, so going -Z it runs on the -X side of the central reservation.
export function m62Vehicles(time = 0) {
  const T = M62_TRAFFIC, out = [];
  for (let i = 0; i < T.each * 2; i++) {
    const away = i % 2 === 0, seed = lattice(i + 11, 7), seed2 = lattice(i + 3, 29), lorry = seed2 < .36;
    const speed = lorry ? T.speedMin + seed * 2 : mix(T.speedMin + 2, T.speedMax, seed), sign = away ? -1 : 1;
    const z = (fract(seed2 * 37.13 + i * .137 + sign * speed * time / T.span) - .5) * T.span + M62_LAND.farm.z;
    const side = away ? -1 : 1, lane = (lorry ? .2 : -.6) * T.laneOffset, x = m62CentreX(z) + side * (m62HalfGap(z) + lane);
    out.push({ id: i, x, z, y: m62RoadY(z), lorry, away, heading: Math.atan2(2 * (z - M62_LAND.farm.z) / 3000 * sign, sign < 0 ? 1 : -1) });
  }
  return out;
}

const WHITE = [1, .95, .8], RED = [1, .16, .1], SODIUM = [1, .62, .26], WINDOW = [1, .78, .46], TOWER_RED = [1, .1, .07];
// Everything out there that doesn't move. Terraces hang along the contours of the
// valley in rows, which is what a mill town is at night from across the moor.
function townRows() {
  const rows = [];
  for (const [cx, cz, count] of [[2100, -5200, 9], [3500, -6900, 8], [-1300, -6100, 6], [800, -8600, 7]]) for (let r = 0; r < count; r++) {
    const run = 10 + Math.floor(lattice(r, cx) * 12), angle = (lattice(cx, r) - .5) * .7, sx = cx + (lattice(r + 5, cz) - .5) * 900, sz = cz + (r - count / 2) * 120;
    for (let i = 0; i < run; i++) rows.push({ x: sx + Math.cos(angle) * i * 26, z: sz + Math.sin(angle) * i * 26, lift: 4, color: lattice(i, r + cx) < .8 ? SODIUM : WINDOW, size: 1.5, gain: .55 + .4 * lattice(r, i) });
  }
  return rows;
}
const FARMS_OUT = [[-1450, 300], [-1900, -900], [-1250, 1500], [780, -300], [1250, 900], [1600, -1500], [-640, -1500], [-2500, 700]];
let staticLights = null;
function fixedLights(height) {
  if (staticLights) return staticLights;
  const list = townRows().map(l => ({ ...l, y: height(l.x, l.z) + l.lift }));
  for (const [x, z] of FARMS_OUT) list.push({ x, z, y: height(x, z) + 3, color: WINDOW, size: 1.6, gain: .75 });
  const t = M62_LAND.tower, base = height(t.x, t.z);
  for (const f of [.36, .68, 1]) list.push({ x: t.x, z: t.z, y: base + t.height * f, color: TOWER_RED, size: 2.1, gain: 1, always: true });
  for (let i = 0; i < 6; i++) { const z = -1400 + i * 620, x = m62CentreX(z) - 3100 - i * 70; list.push({ x, z, y: height(x, z) + 100, color: TOWER_RED, size: 1.8, gain: .95, blink: true, always: true }); }
  staticLights = list;
  return list;
}
export const M62_LIGHT_STRIDE = 8;
export const M62_MAX_LIGHTS = 320;
// Interleaved x, y, z, size, r, g, b, level in the renderer's world (+32). What the
// ground hides is left out here, so the point pass needs no land of its own.
export function m62FarLights({ eye, time = 0, fog = 0, rain = 0, height, farmMeshMetres = 400 } = {}) {
  if (!eye || !height) return { data: new Float32Array(0), count: 0, vehicles: 0 };
  const out = new Float32Array(M62_MAX_LIGHTS * M62_LIGHT_STRIDE), local = [eye[0] - 32, eye[1], eye[2] - 32];
  const thick = .00011 + clamp(fog) * .004 + clamp(rain) * .00018;
  let n = 0, vehicles = 0;
  const push = (x, y, z, size, c, gain) => {
    if (n >= M62_MAX_LIGHTS) return;
    const dist = Math.hypot(x - local[0], z - local[2]), level = gain * Math.exp(-dist * thick);
    if (level < .04) return;
    out.set([x + 32, y, z + 32, size, c[0], c[1], c[2], level], n * M62_LIGHT_STRIDE); n++;
  };
  for (const v of m62Vehicles(time)) {
    const dist = Math.hypot(v.x - local[0], v.z - local[2]);
    if (dist > 6000 || !m62LineClear(height, local, v.x, v.y + 1, v.z, 18)) continue;
    // Coming toward you it is headlamps; going away it is tail lights.
    const coming = (v.away ? -1 : 1) * (local[2] - v.z) > 0, c = coming ? WHITE : RED, h = v.lorry ? 2.1 : .8;
    if (dist < M62_TRAFFIC.nearMetres) for (const side of [-.9, .9]) push(v.x + side, v.y + h, v.z, coming ? 2.6 : 2, c, coming ? 1 : .8);
    else push(v.x, v.y + h, v.z, coming ? 2.1 : 1.7, c, coming ? .92 : .7);
    vehicles++;
  }
  const blink = fract(time / 3) < .36;
  for (const l of fixedLights(height)) {
    if (l.blink && !blink) continue;
    const cheap = Math.hypot(l.x - local[0], l.z - local[2]) > 2200 && l.always;
    if (!cheap && !m62LineClear(height, local, l.x, l.y, l.z, 14)) continue;
    push(l.x, l.y, l.z, l.size, l.color, l.gain);
  }
  // The farm's lit window, until it is close enough to be the farm's own mesh.
  const F = M62_LAND.farm, farmDist = Math.hypot(F.x - local[0], F.z - local[2]);
  if (farmDist > farmMeshMetres - 10 && m62LineClear(height, local, F.x, F.y + 3, F.z, 18)) push(F.x, F.y + 3, F.z, 2, WINDOW, 1);
  return { data: out.subarray(0, n * M62_LIGHT_STRIDE), count: n, vehicles };
}
