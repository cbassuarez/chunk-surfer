// The visible near ground is emitted from the same boxes that support and stop
// the player. Background terrain may be procedural; these metres are authored.
import { REALM_POCKETS, realmSupportHeight } from '../data/realm-pockets.js';
import { HOME_HOUSE } from '../data/childhood-house.js';

const number = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError('Realm geometry must use finite metres');
  return Number.isInteger(n) ? `${n}.0` : String(n);
};
const vector = (values) => `vec3(${values.map(number).join(',')})`;
export const REALM_MATERIAL = Object.freeze({ basalt: 10, stone: 11, sand: 12, snow: 13, glass: 14, metal: 15, plaster: 16 });
const materialCode = (box, variant) => REALM_MATERIAL[box.material]
  ?? (/house-wall/.test(box.id) ? 16 : /pole|lamp|pylon/.test(box.id) ? 15
    : variant === 5 ? 13 : variant === 3 ? 12 : variant === 4 ? 14 : variant === 0 ? 10 : 11);

export function realmPocketBoxes(variant) {
  const pocket = REALM_POCKETS[variant];
  if (!pocket) return [];
  return [...(pocket.supports || []), ...(pocket.solids || [])].map((box) => ({ ...box,
    center: [...box.center], half: [...box.half],
    materialCode: materialCode(box, variant),
  }));
}

export function realmCameraPosition(realm) {
  const pose = realm?.pose || {}, x = Number(pose.x) || 0, z = Number(pose.z) || 0;
  const pocket = REALM_POCKETS[realm?.variant];
  const support = (pocket?.supports || []).filter((box) => Math.abs(x - box.center[0]) <= box.half[0] + .001
    && Math.abs(z - box.center[2]) <= box.half[2] + .001);
  const floor = Number.isFinite(Number(pose.floorY)) ? Number(pose.floorY)
    : support.length ? Math.max(...support.map((box) => realmSupportHeight(box, x, z))) : 0;
  return [x, floor + (Number(realm?.eyeHeight) || 1.62), z];
}

export const HOME_WINDOW = Object.freeze({ ...REALM_POCKETS[5].home.window });

// A coherent home fills the screen, so its alpha can carry scene depth rather
// than transition opacity. The realm's +z / +x-right camera is mirrored into
// the acquisition pass's right-handed convention, in the same physical metres.
export function homeRealmAcquisition({ realm = null, variant = realm?.variant, reveal = 0 } = {}) {
  if (Number(variant) !== 5 || !realm?.home?.eligible || realm.stage !== 'inside'
    || !(reveal >= .999) || Number(realm.decoherence) > 0) return null;
  const [x, y, z] = realmCameraPosition(realm);
  return { cameraMetres: [-x, y, z], yaw: Math.PI + (Number(realm.pose?.yaw) || 0),
    pitch: Math.tan(Number(realm.pose?.pitch) || 0) };
}

export const REALM_POCKET_GLSL = `
float ewHomeSnowHeight(vec2 p){
  float height=0.0,strength;vec2 q;
${HOME_HOUSE.snowScours.map((scour) => `  q=(p-vec2(${number(scour.x)},${number(scour.z)}))/vec2(${number(scour.radiusX)},${number(scour.radiusZ)});
  strength=max(0.0,1.0-dot(q,q));height=min(height,-${number(scour.depth)}*strength*strength);`).join('\n')}
  return height;
}
float ewPocketMap(vec3 p,int v,out float material){
  float distanceM=1e5;material=10.0;float piece;
${REALM_POCKETS.map((pocket, variant) => `  ${variant ? 'else ' : ''}if(v==${variant}){
${realmPocketBoxes(variant).filter((box) => box.id !== 'closed-house-body').map((box) => {
  // Collision retains the closed wall; the renderer cuts its glazed aperture.
  const window = variant === 5 ? HOME_WINDOW : null;
  const overlapsWindow = window && Math.abs(box.center[2] - window.z) <= box.half[2] + .2
    && box.center[1] + box.half[1] > window.bottom && box.center[1] - box.half[1] < window.top
    && box.center[0] - box.half[0] < window.x + window.halfWidth && box.center[0] + box.half[0] > window.x - window.halfWidth;
  // The exterior model owns the whole closed house. Its interior floor replaces
  // snow visually, while the authored snow height owns both support and shading.
  const interiorFloor = variant === 5 && box.id === 'snow-route';
  const shape = box.renderShape === 'snowbank' ? (() => {
    const [x, y, z] = box.center, [hx, hy, hz] = box.half, radius = box.topRadius;
    // Round only the upper crest. Below it the rendered inner face keeps the
    // body's exact blocking bound; this never suggests an invisible ramp.
    return `{float crest=${number(y + hy)}+.07*sin(p.x*.43+p.z*.37+${number(box.crestPhase)})+.03*sin(p.z*.83-p.x*.31);
      float bottom=${number(y - hy)},cap=crest-${number(radius)};
      piece=min(ewBox(p-vec3(${number(x)},(bottom+cap)*.5,${number(z)}),vec3(${number(hx)},(cap-bottom)*.5,${number(hz)})),
        ewBox(p-vec3(${number(x)},cap,${number(z)}),vec3(${number(hx - radius)},0.0,${number(hz - radius)}))-${number(radius)})/1.1;}`;
  })() : `piece=ewBox(p-${vector(box.center)},${vector(box.half)});`;
  return `    ${shape}${overlapsWindow ? `piece=max(piece,-ewBox(p-vec3(${number(window.x)},${number((window.bottom + window.top) / 2)},${number(window.z)}),vec3(${number(window.halfWidth)},${number((window.top - window.bottom) / 2)},2.0)));` : ''}${box.heightfield === 'home-snow' ? 'piece=max(piece,(p.y-ewHomeSnowHeight(p.xz))/1.8);' : ''}${interiorFloor ? `piece=max(piece,-ewBox(p-vec3(${number((HOME_HOUSE.x0 + HOME_HOUSE.x1) / 2)},-1.7,${number((HOME_HOUSE.z0 + HOME_HOUSE.z1) / 2)}),vec3(${number((HOME_HOUSE.x1 - HOME_HOUSE.x0) / 2)},1.9,${number((HOME_HOUSE.z1 - HOME_HOUSE.z0) / 2)})));` : ''}
    if(piece<distanceM){distanceM=piece;material=${number(box.materialCode)};}`;
}).join('\n')}
  }`).join('\n')}
  return distanceM;
}
`;
