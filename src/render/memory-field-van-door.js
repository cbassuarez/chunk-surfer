// Field-scale recollection of the Transit Mk3 driver's door built in
// tools/chunk_surfer/source-drive-study/build-drive-cabin.py. The wheel cut,
// black slider guides, enamel skin, and recessed release belong to one leaf.
// The frame stays in threshold coordinates. The leaf rotates about x=0.
import { MEMORY_FIELD } from '../data/memory-field.js';

const mesh = () => ({ p: [], i: [] });
function triangle(group, a, b, c) {
  const index = group.p.length / 3;
  group.p.push(...a, ...b, ...c);
  group.i.push(index, index + 1, index + 2);
}
function quad(group, a, b, c, d) {
  triangle(group, a, b, c);
  triangle(group, a, c, d);
}
const plane = (points, z) => points.map(([x, y]) => [x, y, z]);
function bridge(group, a, b) {
  for (let j = 0; j < a.length; j++) {
    const k = (j + 1) % a.length;
    quad(group, a[j], a[k], b[k], b[j]);
  }
}
function face(group, points, backwards = false) {
  for (let j = 1; j + 1 < points.length; j++) {
    if (backwards) triangle(group, points[0], points[j + 1], points[j]);
    else triangle(group, points[0], points[j], points[j + 1]);
  }
}
function fromCorner(points, corner) {
  return [...points.slice(corner), ...points.slice(0, corner)];
}
function slab(group, points, z0, z1) {
  const a = plane(points, z0), b = plane(points, z1);
  face(group, a, true);
  face(group, b);
  bridge(group, a, b);
}
function roundedRect(x0, x1, y0, y1, radius) {
  return [
    [x0 + radius, y0], [x1 - radius, y0], [x1, y0 + radius], [x1, y1 - radius],
    [x1 - radius, y1], [x0 + radius, y1], [x0, y1 - radius], [x0, y0 + radius],
  ];
}
function rail(group, a, b, width, z0, z1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  const x = -dy / length * width * .5, y = dx / length * width * .5;
  slab(group, [[a[0]-x,a[1]-y],[b[0]-x,b[1]-y],[b[0]+x,b[1]+y],[a[0]+x,a[1]+y]], z0, z1);
}
function surround(group, points, width, z0, z1) {
  for (let j = 0; j < points.length; j++) rail(group, points[j], points[(j + 1) % points.length], width, z0, z1);
}
function cap(group, x, y, radius, z0, z1) {
  const points = Array.from({ length: 8 }, (_, j) => [
    x + radius * Math.cos(j * Math.PI / 4), y + radius * Math.sin(j * Math.PI / 4),
  ]);
  slab(group, points, z0, z1);
}
function part(name, group, base, roughness, metallic, emissive) {
  return Object.freeze({ name: 'mf_door_' + name, ...group, base: [...base, 1], roughness, metallic, emissive });
}

function doorPanel(enamel, trim, metal, w, waist) {
  const inset = .042, outer = w - inset;
  const lipX0 = w - .368, lipX1 = w - .103, lipY0 = waist - .227, lipY1 = waist - .108;
  const shell = [
    [inset, .710], [.095, .686], [.149, .590], [.223, .378], [.310, .185], [.366, .088],
    [outer-.035, .066], [outer, .098], [outer, waist - .020], [outer-.030, waist+.005],
    [inset+.032, waist+.005], [inset, waist-.021],
  ];

  // A crown in the pressed steel slopes into the return. The latch cavity
  // is cut through the outer skin by adjoining the four bands to its rim.
  const shoulder = shell.map(([x, y]) => [x * .970 + w * .015, y * .970 + waist * .015]);
  bridge(enamel, plane(shell, -.046), plane(shell, .022));
  bridge(enamel, plane(shell, .022), plane(shoulder, .050));
  face(enamel, plane(fromCorner(shell, 6), -.046), true);
  const shellSide = shoulder.slice(0, 8);
  shellSide.push([shoulder[8][0],lipY0],[shoulder[11][0],lipY0]);
  face(enamel, plane(fromCorner(shellSide, 6), .050));
  const left = shoulder[11][0], right = shoulder[8][0];
  const front = (x, y) => [x, y, .050];
  quad(enamel, front(left,lipY0),front(lipX0,lipY0),front(lipX0,lipY1),front(left,lipY1));
  quad(enamel, front(lipX1,lipY0),front(right,lipY0),front(right,lipY1),front(lipX1,lipY1));
  face(enamel, plane([[left,lipY1],[right,lipY1],...shoulder.slice(8)], .050));

  // Reinforced finger recess, visible gaps behind the pull, rider-side vinyl.
  const opening = [[lipX0,lipY0],[lipX1,lipY0],[lipX1,lipY1],[lipX0,lipY1]];
  const recess = [[lipX0+.019,lipY0+.014],[lipX1-.019,lipY0+.014],
    [lipX1-.019,lipY1-.017],[lipX0+.019,lipY1-.017]];
  bridge(trim, plane(opening,.050), plane(recess,.020));
  face(trim, plane(recess,.020));
  surround(metal, roundedRect(lipX0-.002,lipX1+.002,lipY0-.002,lipY1+.002,.023), .013, .050,.055);
  slab(trim, roundedRect(lipX0+.037,lipX1-.028,lipY0+.044,lipY1-.028,.018), .056,.081);
  for (const x of [lipX0+.052,lipX1-.044]) cap(metal,x,(lipY0+lipY1)*.5,.011,.052,.075);
  cap(metal, lipX1-.031, lipY0+.025, .014, .026,.042);
  slab(trim, roundedRect(.230,outer-.062,.720,waist-.041,.060), -.072,-.047);
  slab(trim, roundedRect(.277,outer-.096,.739,.837,.029), -.087,-.073);
  slab(metal, roundedRect(w-.332,w-.122,waist-.177,waist-.139,.015), -.107,-.073);
  for (const x of [.286,w-.138]) cap(metal,x,.765,.010,-.094,-.084);
  rail(trim,[.103,waist-.019],[outer,waist-.019],.037,-.077,.055);
  rail(enamel,[.402,.169],[outer-.035,.175],.026,.049,.063);
  rail(trim,[.464,.066],[outer-.073,.066],.032,-.051,.052);
  for (const y of [.79,waist-.126]) {
    slab(metal, roundedRect(.010,.093,y-.044,y+.047,.015), -.036,.073);
    cap(trim,.035,y,.012,.070,.081);
  }
}

let geometry;
export function memoryFieldVanDoorGeometry() {
  if (geometry) return geometry;
  const { halfWidth: half, height } = MEMORY_FIELD.door;
  const w = 2 * half, waist = 1.23, top = height + .009, rake = .321;
  const enamel = mesh(), trim = mesh(), glass = mesh(), metal = mesh();
  const post = mesh(), tread = mesh(), channels = mesh();
  doorPanel(enamel, trim, metal, w, waist);
  const window = [[.098,waist], [w-.102,waist], [w-.102,top-.042],
    [rake+.052,top-.042], [.202,top-.228]];
  // The inner glass is smoked and large enough to read in the engraving. The
  // rubber guide surrounds it on both sides and the metal lip holds the pane.
  surround(enamel, window, .097,-.048,.049);
  surround(trim, window, .041,-.060,.060);
  surround(metal, window, .010,.057,.064);
  slab(glass, window, -.010,.010);
  rail(trim,[.488,waist+.017],[.549,top-.047],.029,-.057,.057);
  rail(metal,[.496,waist+.020],[.556,top-.049],.009,.056,.061);

  // Off-axis mirror housing at the hinge side gives a recognisable back and
  // a bright inset on the driver's side. A short mount owns the gap beneath it.
  const mirror = roundedRect(-.253,-.071,waist+.081,waist+.322,.038);
  rail(metal,[.117,waist+.048],[-.114,waist+.133],.038,.036,.152);
  slab(trim,mirror,.079,.172);
  slab(metal,roundedRect(-.236,-.086,waist+.097,waist+.306,.022),.067,.081);

  // Raked A post, upright B post, folded lip facing the door gasket, and a
  // tread flush enough to physically walk across. No opaque plate spans it.
  const jamb = [[-half-.058,.043],[-half-.058,waist],[-half+.218,height-.107],
    [-half+rake-.003,height+.045],[half+.055,height+.045],[half+.055,.043]];
  for (let i = 0; i < jamb.length - 1; i++) {
    rail(post,jamb[i],jamb[i+1],.108,-.092,.101);
    const nudge = i < 3 ? .027 : i === 3 ? 0 : -.025;
    const a = [jamb[i][0]+nudge,jamb[i][1]-(i===3?.019:0)];
    const b = [jamb[i+1][0]+nudge,jamb[i+1][1]-(i===3?.019:0)];
    rail(channels,a,b,.035,-.104,.106);
  }
  const sill = roundedRect(-half-.083,half+.111,-.012,.021,.011);
  slab(tread,sill,-.173,.133);
  slab(post,roundedRect(-half-.097,half+.131,-.042,-.009,.013),-.186,.152);
  for (const z of [-.111,-.034,.041,.108]) {
    slab(channels,roundedRect(-half+.04,half-.02,.020,.025,.002),z-.010,z+.010);
  }
  slab(channels,roundedRect(-half-.076,-half+.017,.744,.885,.012),.090,.123);
  slab(channels,roundedRect(half+.006,half+.073,waist-.25,waist-.099,.014),.104,.133);

  geometry = Object.freeze([
    part('leaf',enamel,[.69,.687,.641],.39,.16,[.087,.083,.070]),
    part('glass',glass,[.102,.172,.179],.20,.20,[.018,.030,.038]),
    part('trim',trim,[.105,.109,.109],.89,0,[.018,.018,.017]),
    part('metal',metal,[.45,.45,.385],.42,.66,[.042,.043,.035]),
    part('post',post,[.65,.638,.594],.54,.15,[.069,.067,.056]),
    part('sill',tread,[.261,.255,.213],.93,.12,[.028,.028,.024]),
    part('hole',channels,[.076,.090,.084],.89,0,[.011,.013,.012]),
  ]);
  return geometry;
}
