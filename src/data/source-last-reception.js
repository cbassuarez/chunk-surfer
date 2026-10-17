// The Last Reception is an optional, human-sized piece of the overworld held
// on the west bank. Metres are Source-local; render and movement both consume
// the solids below. No door, conversation or encounter phase changes this plan.
const freeze = Object.freeze;
const anchor = (x, z, y = 9) => freeze({ x, y, z, floor: y });
const anchors = freeze({
  mainOutside: anchor(-44.5, -450), mainDoor: anchor(-47, -450), mainInside: anchor(-50, -450),
  lounge: anchor(-63, -450), suite: anchor(-68, -450), window: anchor(-79, -450),
  suiteNorth: anchor(-68.5, -445.2), windowNorth: anchor(-79, -445.2),
  returnDoor: anchor(-67, -454), returnRoom: anchor(-64, -458),
  capture: anchor(-64, -460), release: anchor(-60, -460),
  serviceLink: anchor(-57, -458), serviceRoom: anchor(-52, -458),
  serviceDoor: anchor(-47, -462), serviceOutside: anchor(-44.5, -462),
  westLink: anchor(-73, -460), westLoop: anchor(-79, -460),
  stairToe: anchor(-75.5, -445.5), stairFoot: anchor(-75.5, -445.8),
  galleryTop: anchor(-75.5, -454.2, 11.8), gallery: anchor(-80, -457, 11.8),
});
const navNodes = Object.entries(anchors).filter(([id]) => id !== 'capture').map(([id, point]) => freeze({ id, ...point }));
const navEdges = [
  ['mainOutside', 'mainDoor'], ['mainDoor', 'mainInside'], ['mainInside', 'lounge'],
  ['lounge', 'suite'], ['suite', 'suiteNorth'], ['suiteNorth', 'windowNorth'], ['windowNorth', 'window'], ['lounge', 'returnDoor'],
  ['returnDoor', 'returnRoom'], ['returnRoom', 'release'], ['release', 'serviceLink'],
  ['serviceLink', 'serviceRoom'], ['serviceRoom', 'serviceDoor'], ['serviceDoor', 'serviceOutside'],
  ['returnRoom', 'westLink'], ['westLink', 'westLoop'], ['westLoop', 'window'],
  ['windowNorth', 'stairToe'], ['stairToe', 'stairFoot'], ['stairFoot', 'galleryTop'], ['galleryTop', 'gallery'],
].map(freeze);

export const SOURCE_LAST_RECEPTION = freeze({
  version: 1, id: 'last-reception', name: 'The Last Reception', floor: 9,
  ceiling: 15.25, galleryFloor: 11.8,
  bounds: freeze({ minX: -83, maxX: -47, minZ: -466, maxZ: -444 }),
  anchors, navNodes: freeze(navNodes), navEdges: freeze(navEdges),
  entrances: freeze([
    freeze({ id: 'main', x: -47, z: -450, floor: 9, width: 3.2, height: 3.2, normal: freeze([1, 0]) }),
    freeze({ id: 'service', x: -47, z: -462, floor: 9, width: 2.8, height: 2.8, normal: freeze([1, 0]) }),
  ]),
  lighting: freeze([
    freeze({ id: 'reception-lounge-lamp', x: -64, y: 13.85, z: -450, color: freeze([.73, .65, .48]), intensity: 3.2, radius: 17 }),
    freeze({ id: 'reception-return-lamp', x: -64, y: 12.15, z: -459, color: freeze([.64, .68, .58]), intensity: 2.2, radius: 12 }),
    freeze({ id: 'reception-service-lamp', x: -51.8, y: 11.5, z: -461.4, color: freeze([.57, .66, .59]), intensity: 1.5, radius: 9 }),
  ]),
});
const S = SOURCE_LAST_RECEPTION;
export const SOURCE_RECEPTION_LIGHTS = S.lighting;
const EPS = 1e-6;
const colors = freeze({
  plaster: [.57, .59, .53], dado: [.25, .31, .27], wood: [.25, .20, .15],
  trim: [.63, .64, .55], source: [.63, .67, .59], dark: [.18, .21, .18], metal: [.22, .25, .23],
});
const solids = [];
function box(id, minX, maxX, minY, maxY, minZ, maxZ, material = 'plaster', extra = {}) {
  const result = freeze({ id, minX, maxX, minY, maxY, minZ, maxZ, material,
    color: colors[material] || colors.plaster, support: false, collision: true, ...extra });
  solids.push(result); return result;
}
const F = S.floor, H = S.ceiling;

// Source is the wall's thickness. These are separate closed courses with
// uneven cut ends and tiny real gaps; the plaster stops at their torn edge.
function sourceHead(id, minX, maxX, minY, maxY, minZ, maxZ, {axis='z',incision=false}={}) {
  const count=Math.ceil((maxY-minY)/.16),step=(maxY-minY)/count;
  for(let row=0;row<count;row++) {
    const y=minY+row*step,depth=.12+(row%5)*.075,shift=(row%3-1)*.065;
    const a=axis==='z'?minX-.08-(row%4)*.045:minX-depth;
    const b=axis==='z'?maxX+.06+(row%3)*.055:maxX+depth*.7;
    const c=axis==='z'?minZ-depth:minZ-.08-(row%4)*.045;
    const d=axis==='z'?maxZ+depth*.7:maxZ+.06+(row%3)*.055;
    const spans=incision&&y<14.45&&y+step>12.35?[[a,Math.min(b,-65.3)],[Math.max(a,-61.1),b]]:[[a,b]];
    for(let side=0;side<spans.length;side++)if(spans[side][1]>spans[side][0])
      box(`${id}-source-${row}-${side}`,spans[side][0]+shift,spans[side][1]+shift,y,y+step-.018,c,d,'source');
  }
}

// Floor and ceiling are real finite slabs. Skylight openings keep the enormous
// model field present above the room without an invisible roof over an aperture.
box('floor-lounge', -83, -47, F - .12, F, -454, -444, 'wood', { support: true });
box('floor-rear', -83, -47, F - .12, F, -466, -454, 'wood', { support: true });
box('roof-front', -83.35, -46.65, H, H + .28, -448, -443.65, 'dark');
// The return room opens upward into the same inverted furnishing as the lounge.
// Its missing ceiling is a real aperture, not a black panel or a sky texture.
box('roof-rear-west', -83.35, -70.2, H, H + .28, -466.35, -454, 'dark');
box('roof-rear-east', -59.2, -46.65, H, H + .28, -466.35, -454, 'dark');
box('roof-rear-front', -70.2, -59.2, H, H + .28, -457.5, -454, 'dark');
box('roof-west', -83.35, -72.5, H, H + .28, -454, -448, 'dark');
box('roof-east', -59.5, -46.65, H, H + .28, -454, -448, 'dark');
box('roof-skylight-mullion', -66.1, -65.9, H, H + .3, -454, -448, 'trim');

// Window openings are assembled from finite sill, head and jamb pieces. There
// is no invisible full-height collision plane across their visible apertures.
function windowWallX(id, x, fromZ, toZ, windows) {
  let cursor = fromZ;
  for (let i = 0; i < windows.length; i++) {
    const [lo, hi] = windows[i];
    if (lo > cursor) box(`${id}-pier-${i}`, x - .2, x + .2, F, H, cursor, lo);
    box(`${id}-sill-${i}`, x - .2, x + .2, F, F + 1.25, lo, hi, 'dado');
    sourceHead(`${id}-head-${i}`, x - .2, x + .2, F + 4.45, H, lo, hi,{axis:'x'});
    box(`${id}-frame-bottom-${i}`, x - .28, x + .28, F + 1.18, F + 1.34, lo - .07, hi + .07, 'trim');
    box(`${id}-frame-top-${i}`, x - .27, x + .27, F + 4.35, F + 4.51, lo - .07, hi + .07, 'trim');
    for (const [side, z] of [['a', lo], ['b', hi]]) box(`${id}-frame-${i}-${side}`, x - .27, x + .27, F + 1.25, F + 4.45, z - .07, z + .07, 'trim');
    cursor = hi;
  }
  if (cursor < toZ) box(`${id}-pier-last`, x - .2, x + .2, F, H, cursor, toZ);
}
function windowWallZ(id, z, fromX, toX, windows) {
  let cursor = fromX;
  for (let i = 0; i < windows.length; i++) {
    const [lo, hi] = windows[i];
    if (lo > cursor) box(`${id}-pier-${i}`, cursor, lo, F, H, z - .2, z + .2);
    box(`${id}-sill-${i}`, lo, hi, F, F + 1.25, z - .2, z + .2, 'dado');
    sourceHead(`${id}-head-${i}`, lo, hi, F + 4.45, H, z - .2, z + .2,{incision:id==='south'&&i===1});
    box(`${id}-frame-bottom-${i}`, lo - .07, hi + .07, F + 1.18, F + 1.34, z - .28, z + .28, 'trim');
    box(`${id}-frame-top-${i}`, lo - .07, hi + .07, F + 4.35, F + 4.51, z - .27, z + .27, 'trim');
    for (const [side, x] of [['a', lo], ['b', hi]]) box(`${id}-frame-${i}-${side}`, x - .07, x + .07, F + 1.25, F + 4.45, z - .27, z + .27, 'trim');
    cursor = hi;
  }
  if (cursor < toX) box(`${id}-pier-last`, cursor, toX, F, H, z - .2, z + .2);
}
windowWallZ('north', -444, -83, -47, [[-80, -77.5], [-71.5, -66.5], [-61, -54]]);
windowWallZ('south', -466, -83, -47, [[-80, -75], [-69.5, -61.5], [-54.5, -49]]);
windowWallX('west', -83, -466, -444, [[-461.5, -455.7], [-451.5, -447.5]]);
// Both east-facing doors stay physically open before, during and after reveal.
for (const [id, lo, hi] of [['rear', -466, -463.4], ['middle', -460.6, -451.6], ['front', -448.4, -444]]) {
  box(`east-wall-${id}`, -47.2, -46.8, F, H, lo, hi);
  box(`east-dado-${id}`, -47.25, -46.75, F, F + 1.05, lo, hi, 'dado');
}
for (const entrance of S.entrances) {
  const half = entrance.width / 2;
  box(`${entrance.id}-door-head`, -47.2, -46.8, F + entrance.height, H, entrance.z - half, entrance.z + half);
  box(`${entrance.id}-door-lintel`, -47.38, -46.62, F + entrance.height - .08, F + entrance.height + .16, entrance.z - half - .2, entrance.z + half + .2, 'trim');
  for (const [side, z] of [['a', entrance.z - half - .12], ['b', entrance.z + half + .12]]) {
    box(`${entrance.id}-door-jamb-${side}`, -47.38, -46.62, F, F + entrance.height, z - .1, z + .1, 'trim');
    // Source is visible on the exposed cut, never a readable terminal. Each
    // finite lamination ends at the jamb rather than reaching into the exit.
    for (let row = 0; row < 8; row++) box(`${entrance.id}-source-${side}-${row}`, -47.43 - (row % 3) * .04, -46.57,
      F + .12 + row * .37, F + .17 + row * .37, z - .115, z + .115, 'source');
  }
  box(`${entrance.id}-threshold`, -47.6, -46.25, F - .04, F, entrance.z - half, entrance.z + half, 'source', { support: true });
}

// Broad doors connect a return room to two separate circulation loops. The
// ticket grille belongs beside the service passage, never across its opening.
for (const [id, lo, hi] of [['west', -73, -69], ['east', -65, -57]]) box(`return-front-${id}`, lo, hi, F, F + 3.25, -454.15, -453.85, 'dado');
sourceHead('return-front-head', -73, -57, F + 3.25, H, -454.15, -453.85);
for (const [id, lo, hi] of [['rear', -466, -461.3], ['front', -458.3, -454]]) box(`return-west-${id}`, -73.15, -72.85, F, H, lo, hi, 'dado');
sourceHead('return-west-head', -73.15, -72.85, F + 3.2, H, -461.3, -458.3,{axis:'x'});
for (const [id, lo, hi] of [['rear', -466, -459.5], ['front', -456.5, -454]]) box(`return-east-${id}`, -57.15, -56.85, F, H, lo, hi, 'dado');
sourceHead('return-east-head', -57.15, -56.85, F + 3.2, H, -459.5, -456.5,{axis:'x'});
// Civic picture rails and finite skirting carry the original foyer language.
for (const [id, z] of [['front', -444.26], ['back', -465.74]]) {
  box(`picture-rail-${id}`, -82.8, -47.2, F + 2.7, F + 2.78, z - .055, z + .055, 'trim');
  box(`skirting-${id}`, -82.8, -47.2, F, F + .16, z - .035, z + .035, 'wood');
}
for (const [id, x] of [['north-west', -72], ['north-east', -63], ['south-west', -73.7]]) {
  box(`pilaster-${id}`, x - .22, x + .22, F, H, id.startsWith('north') ? -444.65 : -465.95, id.startsWith('north') ? -444.23 : -465.52, 'trim');
}

// The south wall peels outward around the retained celestial. The incision
// continues above the absent ceiling, so it is visibly a section of Source
// passing through a remembered room rather than a decorated window surround.
for(let row=0;row<34;row++) {
  const y=11.7+row*.22,fan=.38+(row%6)*.16+Math.max(0,row-14)*.045;
  const spans=y<14.45&&y+.19>12.35?[[-70.1,-65.3],[-61.1,-59.2]]:[[-70.1,-59.2]];
  for(let side=0;side<spans.length;side++)box(`incision-course-${row}-${side}`,
    spans[side][0]-(row%3)*.11,spans[side][1]+(row%4)*.07,y,y+.19,-466.2-fan,-465.56,'source');
}

// A torn, load-bearing binding runs above the ordinary return-room entrance.
// Its code has physical stroke depth as well as ink on the cut courses.
box('source-binding',-71.6,-59.0,13.18,14.42,-453.37,-453.24,'source');
const letters={
  r:['11110','10001','10001','11110','10100','10010','10001'],
  e:['11111','10000','10000','11110','10000','10000','11111'],
  t:['11111','00100','00100','00100','00100','00100','00100'],
  u:['10001','10001','10001','10001','10001','10001','01110'],
  n:['10001','11001','11001','10101','10011','10011','10001'],
  '{':['00110','00100','00100','11000','00100','00100','00110'],
  '}':['01100','00100','00100','00011','00100','00100','01100'],
};
for(const [word,start,cell]of [['{',-71.2,.15],['return',-68.8,.15],['}',-60.3,.15]])
  [...word].forEach((letter,index)=>letters[letter].forEach((line,row)=>[...line].forEach((on,col)=>{
    if(on==='1')box(`source-stroke-${word}-${index}-${row}-${col}`,start+index*cell*6+col*cell,
      start+index*cell*6+(col+1)*cell-.018,14.29-(row+1)*cell,14.29-row*cell-.018,-453.23,-453.14,'dark');
  })));

// Finite source abutments end against an enormous inverted native sofa. The
// upholstery itself supplies the roof above both real apertures.
for(let row=0;row<15;row++) {
  const y=H+.3+row*.38,w=.9+(row%4)*.22;
  for(const [side,x]of [['west',-82.25],['east',-47.75]])
    box(`roof-source-abutment-${side}-${row}`,x-w/2,x+w/2,y,y+.32,-461.9+(row%3)*.13,-448.05-(row%4)*.1,'source');
}
// The giant grille is continuous with the wall between the two open exits.
for(let row=0;row<28;row++) {
  const y=12.45+row*.34,reach=.9+(row%5)*.38;
  box(`grille-source-root-${row}`,-47.65,-46.7+reach,y,y+.27,-459.3+(row%3)*.1,-452.7-(row%4)*.1,'source');
}

// The accessible gallery preserves a clear walking volume beneath its deck.
box('gallery-landing', -82.6, -74.2, 11.56, 11.8, -455.7, -454.2, 'wood', { support: true });
box('gallery-deck', -82.6, -76.8, 11.56, 11.8, -463.5, -455.7, 'wood', { support: true });
for (let step = 0; step < 14; step++) {
  const hi = -445.8 - step * .6, lo = hi - .6, top = F + (step + 1) * .2;
  box(`gallery-tread-${step}`, -76.8, -74.2, F, top, lo, hi, 'wood', { support: true });
  // Rails consist of thin finite posts and sloped-profile short caps, leaving
  // the flight's full 2.4m clear width available to ordinary walking.
  for (const [side, x] of [['west', -76.95], ['east', -74.05]]) {
    box(`stair-post-${step}-${side}`, x - .04, x + .04, top, top + 1.02, lo + .22, lo + .30, 'metal');
    box(`stair-rail-${step}-${side}`, x - .055, x + .055, top + .98, top + 1.06, lo - .02, hi + .02, 'wood');
  }
}
for (const [id, minX, maxX, minZ, maxZ] of [
  ['east', -76.84, -76.76, -463.5, -455.7], ['south', -82.6, -76.8, -463.54, -463.46],
  ['west', -82.64, -82.56, -463.5, -454.2],
  ['landing', -82.6, -76.8, -454.24, -454.16],
]) {
  box(`gallery-rail-${id}`, minX, maxX, 12.72, 12.85, minZ, maxZ, 'wood');
  const alongX = maxX - minX > maxZ - minZ, length = alongX ? maxX - minX : maxZ - minZ;
  for (let j = 0; j <= Math.floor(length / .8); j++) {
    const x = alongX ? minX + .08 + j * .8 : (minX + maxX) / 2;
    const z = alongX ? (minZ + maxZ) / 2 : minZ + .08 + j * .8;
    box(`gallery-post-${id}-${j}`, x - .035, x + .035, 11.8, 12.75, z - .035, z + .035, 'metal');
  }
}

const props = [];
// Checked against the actual pack bounds. A conservative tight oriented hull
// keeps furniture contact reliable without a body-sized maze of chair legs.
// These bounds are verified against the saved GLB in the layout regression.
const propBounds = freeze({
  sofa_01: freeze({ min: [-.786471, 0, -.329504], max: [.786471, .797, .329504] }),
  arm_chair_01: freeze({ min: [-.424788, 0, -.382698], max: [.424788, 1.065, .382698] }),
  classic_console_01: freeze({ min: [-.769668, 0, -.29486], max: [.769668, .949, .29486] }),
  wooden_chair_01: freeze({ min: [-.344095, 0, -.329206], max: [.344095, 2.274, .329206] }),
  ticket_counter: freeze({ min: [-1.51, 0, -.41], max: [1.51, 2.68, .41] }),
  box_office_desk: freeze({ min: [-.56, .02, -.29], max: [.56, .53, .29] }),
  chair: freeze({ min: [-.23, .02, -.23], max: [.23, 1.12, .23] }),
});
function prop(id, mesh, x, z, yaw = 0, extra = {}) {
  const entry = freeze({ id: `reception-${id}`, mesh, x, y: F, z, yaw, pitch: 0, roll: 0, scale: 1, ...extra });
  props.push(entry); return entry;
}
prop('foyer-sofa', 'sofa_01', -69.5, -449.8, Math.PI / 2, { scale: 1.55, originalId: 'acq-foyer-sofa-01', collision: true });
prop('foyer-armchair-a', 'arm_chair_01', -66.1, -447.7, -Math.PI/2, { originalId: 'acq-foyer-armchair-01', collision: true });
prop('foyer-armchair-b', 'arm_chair_01', -67.8, -451.9, 0, { originalId: 'acq-foyer-armchair-02', collision: true });
prop('foyer-console-a', 'classic_console_01', -71.2, -444.55, 0, { originalId: 'acq-foyer-console-west', collision: true });
prop('foyer-console-b', 'classic_console_01', -59.7, -444.55, 0, { originalId: 'acq-foyer-console-east', collision: true });
prop('waiting-rug', 'atrium_waiting_rug', -67.3, -449.8, Math.PI / 2);
prop('ticket-grille', 'ticket_counter', -54.3, -454, 0, { scale: .75, originalId: 'box-office-counter', collision: true });
prop('ticket-desk', 'box_office_desk', -54, -456, 0, { originalId: 'box-office-desk', collision: true });
prop('ticket-chair', 'chair', -54, -456.9, 0, { originalId: 'box-office-chair', collision: true });
prop('ticket-stock', 'program_stack', -54.2, -456, 0, { y: F + .54 });
prop('ticket-roll', 'loose_pages', -54.3, -453.93, 0, { y: F + .765 });
prop('return-chair', 'chair', -64, -460, -Math.PI/2, { originalId: 'box-office-chair', collision: true });
prop('return-console', 'classic_console_01', -67.5, -464.9, Math.PI, { collision: true });
prop('return-programme', 'program_stack', -67.5, -464.9, 0, { y: F + .96 });
prop('gallery-armchair', 'arm_chair_01', -81.3, -460, Math.PI / 2, { y: 11.8, collision: true });
prop('gallery-console', 'classic_console_01', -81.3, -456.2, Math.PI / 2, { y: 11.8, collision: true });
prop('lounge-chandelier', 'chandelier_03', -64, -450, 0, { y: 14.9 });
prop('return-chandelier', 'lantern_chandelier_01', -64, -459, 0, { y: 13.1 });
prop('service-chair', 'chair', -49, -465, Math.PI / 2, { collision: true });
prop('inverted-sofa-vault','sofa_01',-65,-455,0,{y:29.7,scaleX:22,scaleY:16,scaleZ:22,roll:Math.PI,sourceArchitecture:true});
prop('extruded-ticket-organ','ticket_counter',-44,-456,Math.PI/2,{y:12.45,scaleX:2.4,scaleY:6,scaleZ:8,sourceArchitecture:true});
export const sourceReceptionPropPlacements = () => props;
export const sourceReceptionSolids = () => solids;

export function sourceReceptionContains(x, z, margin = 0) {
  const b = S.bounds;
  return Number.isFinite(x) && Number.isFinite(z) && x >= b.minX + margin && x <= b.maxX - margin && z >= b.minZ + margin && z <= b.maxZ - margin;
}
export function sourceReceptionOwns(x, z) {
  return sourceReceptionContains(x, z, -.65);
}
export function sourceReceptionRoomAt(x, z, options = {}) {
  if (!sourceReceptionContains(x, z)) return null;
  const feet = typeof options === 'number' ? options : (options.feet ?? F);
  let id = 'lounge', name = 'The Last Reception';
  if (feet > 11.3) { id = 'gallery'; name = 'Upper waiting gallery'; }
  else if (z < -454 && x > -57) { id = 'service'; name = 'Box office service passage'; }
  else if (z < -454 && x > -73) { id = 'return'; name = 'The return room'; }
  else if (z < -454) { id = 'west-loop'; name = 'West waiting passage'; }
  return { id, name, floor: F, ceil: H,
    sourceReception: true, interior: true };
}
function inBox(part, x, z) { return x >= part.minX - EPS && x <= part.maxX + EPS && z >= part.minZ - EPS && z <= part.maxZ + EPS; }
function distanceToBox(part, x, z) {
  return Math.hypot(Math.max(part.minX - x, 0, x - part.maxX), Math.max(part.minZ - z, 0, z - part.maxZ));
}
function furnitureHit(entry, x, z, feet, height, radius) {
  if (!entry.collision) return false;
  const bounds = propBounds[entry.mesh]; if (!bounds) return false;
  const scale = entry.scale || 1;
  if (entry.y + bounds.max[1] * scale <= feet + .03 || entry.y + bounds.min[1] * scale >= feet + height) return false;
  const c = Math.cos(entry.yaw), s = Math.sin(entry.yaw), dx = x - entry.x, dz = z - entry.z;
  const px = (dx * c - dz * s) / scale, pz = (dx * s + dz * c) / scale;
  return distanceToBox({ minX: bounds.min[0], maxX: bounds.max[0], minZ: bounds.min[2], maxZ: bounds.max[2] }, px, pz) < radius / scale - EPS;
}
export function sourceReceptionSupportAt(x, z, { feet = F, maxStep = .45 } = {}) {
  if (!sourceReceptionOwns(x, z)) return null;
  let result = { id: 'reception-bank', floor: F, kind: 'reception-floor' };
  for (const part of solids) if (part.support && inBox(part, x, z) && part.maxY <= feet + maxStep + EPS && part.maxY >= result.floor) {
    result = { id: part.id, floor: part.maxY, kind: part.id.startsWith('gallery-tread') ? 'stair' : 'reception-floor' };
  }
  return { ...result, drop: Number.isFinite(feet) && feet - result.floor > maxStep + EPS };
}
export function sourceReceptionCollisionAt(x, z, { feet = F, height = 1.8, radius = .22 } = {}) {
  if (!sourceReceptionOwns(x, z) || !Number.isFinite(feet)) return null;
  for (const part of solids) {
    if (!part.collision || part.maxY <= feet + .035 || part.minY >= feet + height - EPS) continue;
    if (part.id.startsWith('gallery-tread') && part.maxY <= feet + .45 + EPS) continue;
    if (distanceToBox(part, x, z) < radius - EPS) return { id: part.id, kind: 'reception-solid' };
  }
  for (const entry of props) if (furnitureHit(entry, x, z, feet, height, radius)) return { id: entry.id, kind: 'reception-furniture' };
  return null;
}
export function sourceReceptionTraceWalk(from, to, { radius = .22, height = 1.8, maxStep = .45, sample = .1, validateHeight = false } = {}) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / sample));
  const startFloor = from.floor ?? from.y ?? F, endFloor = to.floor ?? to.y ?? startFloor;
  let feet = startFloor;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
    const support = sourceReceptionSupportAt(x, z, { feet, maxStep });
    if (support) feet = support.floor;
    if (validateHeight && (support?.drop || Math.abs(feet - (startFloor + (endFloor - startFloor) * t)) > .26)) {
      return { ok: false, at: { x, z, floor: feet }, why: 'unsupported-height', support };
    }
    const collision = sourceReceptionCollisionAt(x, z, { feet, height, radius });
    if (collision) return { ok: false, at: { x, z, floor: feet }, collision };
  }
  return { ok: true, floor: feet };
}
export function sourceLastReceptionSegmentClear(a, b, radius = .27) {
  return sourceReceptionTraceWalk(a, b, { radius, validateHeight: true }).ok;
}
export function sourceReceptionLineOfSight(from, to, { eyeHeight = 1.45, targetHeight = 1.3 } = {}) {
  const a = [from.x, (from.floor ?? from.y ?? F) + eyeHeight, from.z];
  const b = [to.x, (to.floor ?? to.y ?? F) + targetHeight, to.z];
  // Slab intersection follows the actual wall returns, stair and deck. Chair
  // bounds intentionally do not become opaque conversation walls; their true
  // visible bodies/grille can be seen through above or between the furniture.
  for (const part of solids) {
    if (!part.collision) continue;
    const min = [part.minX, part.minY, part.minZ], max = [part.maxX, part.maxY, part.maxZ];
    let low = .001, high = .999;
    for (let axis = 0; axis < 3 && low <= high; axis++) {
      const direction = b[axis] - a[axis];
      if (Math.abs(direction) < EPS) {
        if (a[axis] < min[axis] || a[axis] > max[axis]) { high = -1; break; }
      } else {
        const entry = (min[axis] - a[axis]) / direction, exit = (max[axis] - a[axis]) / direction;
        low = Math.max(low, Math.min(entry, exit)); high = Math.min(high, Math.max(entry, exit));
      }
    }
    if (low <= high) return false;
  }
  return true;
}

function geometry(part) {
  const { minX: a, maxX: b, minY: c, maxY: d, minZ: e, maxZ: f } = part;
  return { id: part.id, material: part.material, color: part.color, kind: part.support ? 'walkable' : 'architecture',
    p: [a,c,e, b,c,e, b,c,f, a,c,f, a,d,e, b,d,e, b,d,f, a,d,f],
    i: [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,5,1, 0,4,5, 1,6,2, 1,5,6, 2,7,3, 2,6,7, 3,4,0, 3,7,4] };
}
let geometryCache = null;
export function sourceReceptionGeometry() {
  if (geometryCache) return geometryCache;
  // Collision retains each finite architectural piece. Rendering batches the
  // identical vertices by material, avoiding a draw call for every rail post.
  const groups = new Map();
  for (const solid of solids) {
    const piece = geometry(solid);
    if (!groups.has(piece.material)) groups.set(piece.material, { id: `material-${piece.material}`, material: piece.material,
      color: piece.color, kind: 'architecture', p: [], i: [], pieces: [] });
    const target = groups.get(piece.material), offset = target.p.length / 3;
    target.p.push(...piece.p); target.i.push(...piece.i.map(index => index + offset)); target.pieces.push(piece.id);
  }
  return geometryCache = [...groups.values()];
}

