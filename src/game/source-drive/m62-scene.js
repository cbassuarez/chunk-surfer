// What of the M62 is near enough to be solid, placed for the road's current spot.
// The far land itself is drawn in the sky pass from the height field; this only
// adds the farm, the carriageways beside it and the traffic on them.
import { M62_LAND, M62_TRAFFIC, m62CentreX, m62HalfGap, m62RoadY, m62Vehicles } from '../../data/m62-land.js';

// Past this the prop pass can't draw them: the far lights take over (prop-range.js).
export const M62_SCENE = Object.freeze({ meshMetres: 415, carriageStep: 40, carriageReach: 480, lampIntensity: 42, lampRadius: 34 });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };

// Full for the whole of the opening road, gone before the cliff's own memory starts.
export function m62LandStrength(distance = 0) {
  return 1 - smooth((distance - M62_LAND.fromDistance) / (M62_LAND.toDistance - M62_LAND.fromDistance));
}
function placed(mesh, id, x, y, z, angle = 0, extra = {}) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { id, mesh, matrix: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 32 + x, y, 32 + z, 1], x: 32 + x, y, z: 32 + z, structural: true, skyExposed: true, sourceStructure: 'm62-land', ...extra };
}
export function m62Scene({ distance = 0, eye = [32, 2, 32], time = 0 } = {}) {
  const strength = m62LandStrength(distance), lx = eye[0] - 32, lz = eye[2] - 32, F = M62_LAND.farm, S = M62_SCENE;
  const land = strength > 0 ? { strength, eye: [lx, eye[1], lz], time } : null, props = [], lamps = [];
  if (!land) return { props, lamps, land };
  const near = (x, z, reach) => Math.hypot(x - lx, z - lz) < reach;
  if (near(F.x, F.z, S.meshMetres + 45)) {
    props.push(placed('m62_farm', 'm62-farm', F.x, F.y, F.z), placed('m62_farm_window', 'm62-farm-window', F.x, F.y, F.z), placed('m62_sheep', 'm62-sheep', F.x, F.y, F.z));
    // One yard lamp, the only light between two carriageways. It comes up with
    // distance, so the farm arrives in the dark rather than appearing.
    const fade = 1 - smooth((Math.hypot(F.x - lx, F.z - lz) - 240) / 170);
    lamps.push({ id: 'm62-farm-yard', x: 32 + F.x + 9, y: F.y + 5.4, z: 32 + F.z - 3, color: [1, .64, .3], intensity: S.lampIntensity * (.25 + .75 * fade), radius: S.lampRadius, penetration: 1 });
  }
  for (const side of [-1, 1]) for (let z = F.z - S.carriageReach; z <= F.z + S.carriageReach; z += S.carriageStep) {
    const x = m62CentreX(z) + side * m62HalfGap(z);
    if (!near(x, z, S.meshMetres + 30)) continue;
    const ahead = m62CentreX(z + 1) + side * m62HalfGap(z + 1), angle = Math.atan2(ahead - x, 1) + (side < 0 ? Math.PI : 0);
    props.push(placed('m62_carriageway', `m62-carriage-${side}-${z}`, x, m62RoadY(z), z, angle));
  }
  for (const v of m62Vehicles(time)) if (v.lorry && near(v.x, v.z, S.meshMetres)) {
    const tangent = Math.atan2(m62CentreX(v.z + 1) - m62CentreX(v.z), 1);
    props.push(placed('m62_lorry', `m62-lorry-${v.id}`, v.x, v.y, v.z, tangent + (v.away ? Math.PI : 0)));
  }
  return { props, lamps, land };
}
// The small road's walls and the rock it was cut through.
export const M62_ROAD_ROCK = Object.freeze([Object.freeze([-585, -470]), Object.freeze([-350, -290]), Object.freeze([-130, -60])]);
export const m62DrystoneMesh = (d, side) => `m62_drystone_${(Math.imul(Math.floor(d / 3) * 2 + (side > 0 ? 1 : 0), 2654435761) >>> 16) % 3}`;
export const m62GritMesh = d => `m62_grit_face_${Math.abs(Math.floor(d / 6)) % 2}`;
