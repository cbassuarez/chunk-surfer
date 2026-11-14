// Millimetre-scale wood ant, facing -Z. Each shell and each limb segment
// is a rigid mesh, so the joints can be posed without swelling or stretching
// the body. Workers of Formica rufa have a single upright petiolar scale.
// Anatomy: doi.org/10.1093/isd/ixac002. Footfall reference: doi.org/10.1098/rsos.192068.
import { antPathLength, antPoseAt, antRouteAt, antRoutePosition } from '../game/memory-field-ant.js';

const TAU = Math.PI * 2;
const UP = [0, 1, 0];
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const cross = ([x, y, z], [a, b, c]) => [y * c - z * b, z * a - x * c, x * b - y * a];
const dot = ([x, y, z], [a, b, c]) => x * a + y * b + z * c;
const unit = v => { const length = Math.hypot(...v) || 1; return v.map(n => n / length); };
const add = (a, b) => a.map((n, i) => n + b[i]);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const scale = (v, n) => v.map(p => p * n);
const blend = (a, b, t) => a.map((n, i) => lerp(n, b[i], t));

function shell(name, sections, base, roughness, sides = 12) {
  const p = [], i = [], rings = [];
  for (const [z, y, width, height] of sections) {
    if (width <= 0 || height <= 0) {
      rings.push([p.length / 3]);
      p.push(0, y, z);
      continue;
    }
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const angle = TAU * k / sides;
      ring.push(p.length / 3);
      p.push(Math.cos(angle) * width, y + Math.sin(angle) * height, z);
    }
    rings.push(ring);
  }
  for (let row = 0; row + 1 < rings.length; row++) {
    const a = rings[row], b = rings[row + 1];
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      if (a.length === 1) i.push(a[0], b[next], b[k]);
      else if (b.length === 1) i.push(a[k], a[next], b[0]);
      else i.push(a[k], a[next], b[k], a[next], b[next], b[k]);
    }
  }
  return Object.freeze({ name, p, i, base: [...base, 1],
    emissive: base.map(value => value * .047), roughness, metallic: 0 });
}

const red = [.145, .050, .031], shin = [.085, .035, .022], joint = [.126, .069, .040];
const dark = [.054, .033, .027], head = [.101, .046, .030], eye = [.023, .016, .014];
const tapered = (radius, tip) => [[-.025,0,0,0],[.035,0,radius*.77,radius*.77],
  [.22,0,radius,radius],[.60,0,radius*.76,radius*.76],[.95,0,tip,tip],[1.022,0,0,0]];
const meshes = Object.freeze([
  shell('mf_ant_0', [[.075,.018,0,0],[.12,.027,.102,.083],[.24,.029,.186,.145],
    [.37,.006,.204,.154],[.49,-.023,.155,.117],[.56,-.041,.074,.067],[.594,-.045,0,0]], dark, .43, 16),
  shell('mf_ant_thorax', [[-.31,-.007,0,0],[-.255,.025,.103,.111],[-.168,.031,.123,.122],
    [-.089,.015,.107,.105],[-.031,-.013,.088,.081],[.038,-.001,.097,.090],
    [.101,-.014,.071,.071],[.146,-.012,0,0]], red, .52),
  shell('mf_ant_waist', [[.032,-.018,0,0],[.049,-.016,.050,.038],[.09,.008,.047,.074],
    [.125,-.012,.042,.058],[.16,-.018,.045,.034],[.199,-.020,0,0]], red, .58, 10),
  shell('mf_ant_head', [[-.462,-.031,0,0],[-.425,-.016,.123,.095],[-.373,.015,.152,.123],
    [-.302,.024,.143,.116],[-.25,.012,.109,.084],[-.199,-.003,.053,.046],[-.179,-.008,0,0]], head, .51),
  shell('mf_ant_eye', [[-.069,0,0,0],[-.046,0,.018,.030],[0,0,.023,.043],
    [.045,0,.017,.031],[.068,0,0,0]], eye, .32, 10),
  shell('mf_ant_femur', tapered(.034,.016), red, .53, 7),
  shell('mf_ant_tibia', tapered(.021,.011), shin, .58, 7),
  shell('mf_ant_tarsus', tapered(.014,.008), joint, .60, 6),
  shell('mf_ant_scape', tapered(.018,.011), red, .52, 6),
  shell('mf_ant_flagellum', tapered(.013,.006), joint, .57, 6),
  shell('mf_ant_mandible', tapered(.028,.008), head, .49, 7),
]);

export const memoryFieldAntGeometry = () => meshes;

function matrix(position, forward, up, size) {
  const right = unit(cross(up, forward));
  const vertical = cross(forward, right);
  return new Float32Array([...scale(right, size), 0, ...scale(vertical, size), 0,
    ...scale(forward, size), 0, ...position, 1]);
}

function link(a, b, size) {
  const shaft = sub(b, a), direction = unit(shaft);
  const up = Math.abs(direction[1]) > .92 ? [1, 0, 0] : UP;
  const right = unit(cross(up, direction)), vertical = cross(direction, right);
  return new Float32Array([...scale(right, size), 0, ...scale(vertical, size), 0,
    ...shaft, 0, ...a, 1]);
}

function plantedTarget(ant, distance, s, x, z, groundHeight) {
  const route = antRoutePosition(ant, distance);
  const cosine = Math.cos(route.yaw), sine = Math.sin(route.yaw);
  const at = (side, along) => {
    const xi = route.x + (cosine * side - sine * along) * s;
    const zi = route.z + (sine * side + cosine * along) * s;
    return [xi, groundHeight(xi, zi) + s * .006, zi];
  };
  const ideal = at(x, z), ground = groundHeight(route.x, route.z);
  if (Math.abs(ideal[1] - ground) < s * .28) return ideal;
  // At a crack the next footfall favours the lip with support. These
  // candidate anchors are a deterministic function of the stride boundary.
  let best = ideal, score = Math.abs(ideal[1] - ground) * 1.45;
  for (const [side, along] of [[.87, .10], [.87, -.10], [.66, 0], [1.12, .10], [1.12, -.10], [.75, .24], [.75, -.24]]) {
    const point = at(x * side, z + along);
    const penalty = Math.abs(point[1] - ground) * 1.45 + Math.hypot(point[0] - ideal[0], point[2] - ideal[2]);
    if (penalty >= score) continue;
    best = point;
    score = penalty;
  }
  return best;
}

function findKnee(hip, ankle, side, upper, lower) {
  const axis = sub(ankle, hip), bearing = unit(axis);
  const reach = Math.max(upper - lower + .00001, Math.min(upper + lower - .00001, Math.hypot(...axis)));
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const pole = unit(add(scale(UP, .79), scale(side, .62)));
  const outward = unit(sub(pole, scale(bearing, dot(pole, bearing))));
  return add(hip, add(scale(bearing, along), scale(outward, height)));
}

function reachableToe(hip, toe, reach, groundHeight) {
  const delta = sub(toe, hip), length = Math.hypot(...delta);
  if (length <= reach) return toe;
  // If the sole can no longer find a lip in reach, tuck it onto the
  // climb instead of stretching a tibia to the bottom of the groove.
  const close = add(hip, scale(delta, reach / length));
  close[1] = Math.max(close[1], groundHeight(close[0], close[2]));
  return close;
}

const LEGS = [
  { hip: -.225, reach: .48, foot: -.39, upper: .27, lower: .33 },
  { hip: -.112, reach: .58, foot: -.022, upper: .34, lower: .36 },
  { hip: .010, reach: .49, foot: .39, upper: .35, lower: .38 },
];

export function memoryFieldAntRig(ant, time, { reducedMotion = false, groundHeight } = {}) {
  const route = antRouteAt(ant, time), distance = route.distance, length = ant.length;
  if (distance >= antPathLength(ant)) return [];
  const support = groundHeight || (() => antPoseAt(ant, time).y);
  const root = antRoutePosition(ant, distance);
  const rear = antRoutePosition(ant, distance - length * .35);
  const front = antRoutePosition(ant, distance + length * .38);
  const rearY = support(rear.x, rear.z), frontY = support(front.x, front.z);
  const localY = support(root.x, root.z);
  const grade = Math.atan2(frontY - rearY, length * .73);
  const forward = [Math.sin(root.yaw), 0, -Math.cos(root.yaw)], right = [Math.cos(root.yaw), 0, Math.sin(root.yaw)];
  const stride = length * .63;
  const cycle = distance / stride, activity = reducedMotion ? 0 : 1 - ease(route.rest / .16);
  const headAngle = reducedMotion ? 0 : lerp(Math.sin(time * 3.1) * .19, Math.sin(time * 5.6) * .05, activity);
  const bodyPitch = grade + Math.sin(cycle * TAU * 2) * .025 * activity;
  const backwards = add(scale(forward, -Math.cos(bodyPitch)), scale(UP, -Math.sin(bodyPitch)));
  const up = cross(backwards, right);
  // The body rides over the highest nearby stone in the footprint. Each
  // tarsus samples its own contact, so legs can bridge a narrow recess.
  const bearingY = Math.max(localY, (frontY + rearY) * .5);
  const bob = Math.sin(cycle * TAU * 2) * .012 * activity;
  const centre = [root.x, bearingY + length * (.253 + bob), root.z];
  const transform = (x, y, z) => add(centre, add(scale(right, x * length),
    add(scale(up, y * length), scale(backwards, z * length))));
  const pieces = [];
  const put = (mesh, id, m) => pieces.push({ mesh: 'mf_ant_' + mesh, id: 'ant-' + id, matrix: m });
  pieces.push({ mesh: 'mf_ant_0', id: 'ant', matrix: matrix(transform(0, -.012, 0), backwards, up, length) });
  put('waist', 'petiole', matrix(centre, backwards, up, length));
  put('thorax', 'thorax', matrix(centre, backwards, up, length));
  const headAxis = unit(add(backwards, scale(right, headAngle)));
  const headOrigin = transform(.10 * headAngle, 0, 0);
  put('head', 'head', matrix(headOrigin, headAxis, up, length));

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'l' : 'r';
    const probe = reducedMotion ? 0 : Math.sin(time * (2.9 + side * .27) + side * .8);
    const twitch = reducedMotion ? 0 : Math.sin(time * 6.1 + side * 1.7) * .035;
    const eyeCentre = transform(side * .139 + headAngle * .35, .078, -.351);
    put('eye', `eye-${suffix}`, matrix(eyeCentre, headAxis, up, length));
    const veryFront = transform(side * .086 + headAngle * .42, -.042, -.424);
    const mandible = transform(side * (.030 + .008 * probe) + headAngle * .47, -.052, -.499);
    put('mandible', `jaw-${suffix}`, link(veryFront, mandible, length));

    const socket = transform(side * .069 + headAngle * .40, .046, -.403);
    const elbow = transform(side * (.195 + probe * .033) + headAngle * .46, .113 + probe * .030, -.548);
    const tip = transform(side * (.219 + probe * .082 + twitch) + headAngle * .60,
      .035 + probe * (.030 + .033 * (1 - activity)), -.748 - probe * .028);
    put('scape', `antenna-inner-${suffix}`, link(socket, elbow, length));
    put('flagellum', `antenna-outer-${suffix}`, link(elbow, tip, length));

    LEGS.forEach(({ hip: hipZ, reach: reachX, foot: footZ, upper, lower }, leg) => {
      const phase = (leg + (side > 0 ? 1 : 0)) % 2 * .5;
      const gait = cycle + phase;
      const tick = Math.floor(gait), position = gait - tick;
      const plant = (tick - phase + .28) * stride;
      const toe = reducedMotion
        ? plantedTarget(ant, distance, length, side * reachX, footZ, support)
        : plantedTarget(ant, plant, length, side * reachX, footZ, support);
      if (!reducedMotion && position > .58) {
        const next = plantedTarget(ant, plant + stride, length, side * reachX, footZ, support);
        const swing = (position - .58) / .42;
        const foot = blend(toe, next, ease(swing));
        toe[0] = foot[0];
        toe[2] = foot[2];
        toe[1] = Math.max(support(toe[0], toe[2]), foot[1])
          + length * (.004 + Math.sin(swing * Math.PI) * .153 * activity);
      }
      const hip = transform(side * (.080 + (leg === 1 ? .012 : 0)), -.064, hipZ);
      const contact = reachableToe(hip, toe, (upper + lower) * length, support);
      const ankle = blend(contact, hip, .077);
      ankle[1] += length * .026;
      const knee = findKnee(hip, ankle, scale(right, side), upper * length, lower * length);
      put('femur', `leg-${leg}-${suffix}-upper`, link(hip, knee, length));
      put('tibia', `leg-${leg}-${suffix}-lower`, link(knee, ankle, length));
      put('tarsus', `leg-${leg}-${suffix}-foot`, link(ankle, contact, length));
    });
  }
  return pieces;
}
