// The visible near ground is emitted from the same boxes that support and stop
// the player. Background terrain may be procedural; these metres are authored.
import { REALM_POCKETS, realmSupportHeight } from '../data/realm-pockets.js';
import { HOME_HOUSE } from '../data/childhood-house.js';
import { HOME_APPROACH_DRIFTS, HOME_DRAIN, HOME_LANE, HOME_LANE_BANK_SECTION,
  HOME_LANE_SNOWBANKS, HOME_PILED_SNOW } from '../data/childhood-grounds.js';
import { HOME_VALLEY_GRADES } from '../data/childhood-valley.js';
import { HOME_MOUNTAIN_GRADES } from '../data/childhood-valley-trail.js';

const number = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError('Realm geometry must use finite metres');
  return Number.isInteger(n) ? `${n}.0` : String(n);
};
const vector = (values) => `vec3(${values.map(number).join(',')})`;
export const REALM_MATERIAL = Object.freeze({ basalt: 10, stone: 11, sand: 12, snow: 13, glass: 14, metal: 15,
  plaster: 16, 'yard-stone': 17, 'yard-wood': 18 });
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
const homeGrades = [...HOME_APPROACH_DRIFTS, ...HOME_VALLEY_GRADES];
const mountainRight = Math.max(...HOME_MOUNTAIN_GRADES.map(({x,rx})=>x+rx));
const mountainNear = Math.min(...HOME_MOUNTAIN_GRADES.map(({z,rz})=>z-rz));
const riseTerms = (grades) => grades.map(({x,z,rx,rz,rise}) => `
  q=(p-vec2(${number(x)},${number(z)}))/vec2(${number(rx)},${number(rz)});
  strength=max(0.0,1.0-dot(q,q));approach+=${number(rise)}*strength*strength;`).join('\n');
const { wave, rate } = HOME_LANE;
const { crest, cut, apron } = HOME_LANE_BANK_SECTION;
const pileTerms = HOME_PILED_SNOW.map(({x,z,rx,rz,rise}) => `
  delta=p-vec2(${number(x)},${number(z)});
  if(all(lessThan(abs(delta),vec2(${number(rx)},${number(rz)})))){
    vec2 q=delta/vec2(${number(rx)},${number(rz)});
    float k=max(0.0,1.0-dot(q,q));
    height+=${number(rise)}*k*k;
    grade+=${number(-4*rise)}*k*q/vec2(${number(rx)},${number(rz)});
  }`).join('\n');

// A coherent home fills the screen, so its alpha can carry scene depth rather
// than transition opacity. The realm's +z / +x-right camera is mirrored into
// the acquisition pass's right-handed convention, in the same physical metres.
export function homeRealmAcquisition({ realm = null, variant = realm?.variant, reveal = 0 } = {}) {
  if (Number(variant) !== 5 || !realm?.home?.eligible || realm.stage !== 'inside'
    || !(reveal >= .999) || Number(realm.decoherence) > 0) return null;
  const [x, y, z] = realmCameraPosition(realm);
  return { cameraMetres: [-x, y, z], yaw: Math.PI + (Number(realm.pose?.yaw) || 0),
    pitch: Number(realm.pose?.pitch) || 0 };
}

export const REALM_POCKET_GLSL = `
float ewHomePloughBank(vec2 p,out vec2 grade){
  grade=vec2(0.0);
  if(abs(p.x)>3.65||p.y<${number(HOME_LANE_SNOWBANKS[0].start)}||p.y>${number(HOME_LANE_SNOWBANKS.at(-1).end)})return 0.0;
  float along,runLength,leftRise,rightRise;
${HOME_LANE_SNOWBANKS.map(({start,end,leftRise,rightRise},i)=>`  ${i?'else ':''}if(p.y>${number(start)}&&p.y<${number(end)}){
    runLength=${number(end-start)};along=(p.y-${number(start)})/runLength;
    leftRise=${number(leftRise)};rightRise=${number(rightRise)};
  }`).join('\n')}
  else return 0.0;
  float across=p.x-${number(wave)}*sin(p.y*${number(rate)});
  float edge=abs(across)-${number(crest)};
  float width=edge<0.0?${number(cut)}:${number(apron)};
  float section=max(0.0,1.0-edge*edge/(width*width));
  float ends=max(0.0,4.0*along*(1.0-along));
  float rise=across<0.0?leftRise:rightRise;
  float crossGrade=-4.0*rise*section*edge*ends*ends*sign(across)/(width*width);
  grade=vec2(crossGrade,8.0*rise*section*section*ends*(1.0-2.0*along)/runLength
    -crossGrade*${number(wave*rate)}*cos(p.y*${number(rate)}));
  return rise*section*section*ends*ends;
}
float ewHomePiledSnow(vec2 p,out vec2 grade){
  float height=0.0;grade=vec2(0.0);vec2 delta;
${pileTerms}
  return height;
}
float ewHomeSnowHeight(vec2 p){
  float height=0.0,approach=0.0,strength;vec2 q;
${riseTerms(homeGrades)}
  if(p.x<${number(mountainRight)}&&p.y>${number(mountainNear)}){${riseTerms(HOME_MOUNTAIN_GRADES)}}
${HOME_HOUSE.snowScours.map((scour) => `  q=(p-vec2(${number(scour.x)},${number(scour.z)}))/vec2(${number(scour.radiusX)},${number(scour.radiusZ)});
  strength=max(0.0,1.0-dot(q,q));height=min(height,-${number(scour.depth)}*strength*strength);`).join('\n')}
  vec2 unused;
  return approach+height+ewHomePloughBank(p,unused)+ewHomePiledSnow(p,unused);
}
vec3 ewHomeSnowNormal(vec2 p){
  vec2 grade=vec2(0.0),hollowGrade=vec2(0.0),q;
  float depth=0.0,k,below;
${[...homeGrades,...HOME_MOUNTAIN_GRADES].map(({x,z,rx,rz,rise})=>`  q=(p-vec2(${number(x)},${number(z)}))/vec2(${number(rx)},${number(rz)});
  k=max(0.0,1.0-dot(q,q));grade+=${number(-4*rise)}*k*q/vec2(${number(rx)},${number(rz)});`).join('\n')}
${HOME_HOUSE.snowScours.map(({x,z,radiusX,radiusZ,depth})=>`  q=(p-vec2(${number(x)},${number(z)}))/vec2(${number(radiusX)},${number(radiusZ)});
  k=max(0.0,1.0-dot(q,q));below=-${number(depth)}*k*k;
  if(below<depth){depth=below;hollowGrade=${number(4*depth)}*k*q/vec2(${number(radiusX)},${number(radiusZ)});}`).join('\n')}
  vec2 bankGrade,pileGrade;
  ewHomePloughBank(p,bankGrade);
  ewHomePiledSnow(p,pileGrade);
  grade+=hollowGrade+bankGrade+pileGrade;
  return normalize(vec3(-grade.x,1.0,-grade.y));
}
bool ewHomeSmoothSnow(vec3 p){
  // Exclude the cutouts and walls, which share the snow tag but are not the
  // terrain. Either overlapping rectangle can supply the actual surface.
  if(p.x>-11.0&&p.x<12.0&&p.z>67.7&&p.z<84.0)return false;
  if(abs(p.y-ewHomeSnowHeight(p.xz))>.09)return false;
  return ${REALM_POCKETS[5].supports.filter(s=>s.heightfield==='home-snow').map(({center:[x,y,z],half:[rx,ry,rz]})=>`
    all(lessThan(abs(p.xz-vec2(${number(x)},${number(z)})),vec2(${number(rx-.36)},${number(rz-.36)})))`).join('||')};
}
float ewPocketMap(vec3 p,int v,out float material){
  float distanceM=1e5;material=10.0;float piece;
  float homeHeight=v==5?ewHomeSnowHeight(p.xz):0.0;
${REALM_POCKETS.map((pocket, variant) => `  ${variant ? 'else ' : ''}if(v==${variant}){
${realmPocketBoxes(variant).filter((box) => box.id !== 'closed-house-body' && !box.collisionOnly).map((box) => {
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
  const drain = box.id === 'verge-retaining-wall' ? (() => {
    const { x,y,z,radius,width } = HOME_DRAIN;
    return `vec3 outlet=p-${vector([x,y,z])};
    float pipe=max(length(outlet.yz)-${number(radius)},abs(outlet.x)-${number(width)});
    piece=max(piece,-pipe);`;
  })() : '';
  return `    ${shape}${drain}${overlapsWindow ? `piece=max(piece,-ewBox(p-vec3(${number(window.x)},${number((window.bottom + window.top) / 2)},${number(window.z)}),vec3(${number(window.halfWidth)},${number((window.top - window.bottom) / 2)},2.0)));` : ''}${box.heightfield === 'home-snow' ? 'piece=max(piece,(p.y-homeHeight)/1.8);' : ''}${interiorFloor ? `piece=max(piece,-ewBox(p-vec3(${number((HOME_HOUSE.x0 + HOME_HOUSE.x1) / 2)},-1.7,${number((HOME_HOUSE.z0 + HOME_HOUSE.z1) / 2)}),vec3(${number((HOME_HOUSE.x1 - HOME_HOUSE.x0) / 2)},1.9,${number((HOME_HOUSE.z1 - HOME_HOUSE.z0) / 2)})));` : ''}
    if(piece<distanceM){distanceM=piece;material=${number(box.materialCode)};}`;
}).join('\n')}
  }`).join('\n')}
  return distanceM;
}
`;
