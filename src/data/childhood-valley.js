import { HOME_COMMONS_WORKS } from './childhood-valley-works.js';

// Grey door coordinates. Everything the player walks on is inside this basin.
// The outlying ridges belong to the horizon and do not imply a second exit.
export const HOME_VALLEY_BOUNDS = Object.freeze({ x0: -49, x1: 43, z0: -14, z1: 116, bottom: -7, top: 11 });

const banks = [
  // The first two rises form the pasture shoulder and the old hill road.
  [-39, 81, 24, 43, 7.7], [-41, 46, 15, 29, 2.3],
  // The eastern yards sit on a terrace, with a wet hollow below.
  [37, 66, 22, 41, 3.4], [25, 52, 15, 30, -1.25],
  [31, 101, 20, 27, 4.8], [-17, 110, 20, 20, 3.8],
  [-36, 5, 19, 23, 3.2], [33, 9, 19, 23, 2.1],
];
export const HOME_VALLEY_GRADES = Object.freeze(banks.map(([x,z,rx,rz,rise]) => Object.freeze({x,z,rx,rz,rise})));

export function homeValleyRise(x, z) {
  return HOME_VALLEY_GRADES.reduce((height, { x: cx, z: cz, rx, rz, rise }) => {
    const strength = Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2);
    return height + rise * strength ** 2;
  }, 0);
}

// Roads are worn through the snow only where they carry actual use. Ends run
// into the pastures or join other roads. None of them depend on the bedroom.
export const HOME_VALLEY_ROADS = Object.freeze([
  { width: 1.62, points: [[0,12],[-11,13],[-22,18],[-30,28],[-29,43],[-20,53],[-19,63],[-27,74],[-33,79],[-25,91],[-11,95],[0,92],[13,87],[23,76],[26,59],[24,47],[24,32],[15,22],[1,18]] },
  { width: 1.18, points: [[-29,43],[-32,52],[-34,63],[-33,79]] },
  { width: 1.24, points: [[-20,53],[-10,52],[0,51],[11,51],[21,46],[24,47]] },
  { width: 1.06, points: [[-19,63],[-12,69],[-12,83],[0,92]] },
  { width: 1.10, points: [[23,76],[15,69],[14,58],[21,46]] },
  { width: .76, points: [[-24,22],[-26.9,22]] },
  { width: .81, points: [[-20,53],[-17.4,56]] },
  { width: .81, points: [[-32,79],[-35.4,78.6],[-40.6,75.5]] },
  { width: .84, points: [[13,87],[15.3,93.1],[16.4,97.6]] },
]);

const stone = 50, wood = 51, slate = 52, metal = 54, ice = 55, paint = 56;
const snow = 57, squaredTimber = 51, iron = 63, weatherboard = 70, lime = 71;
const piece = (id, x0, x1, y0, y1, z0, z1, material, detail = {}) =>
  Object.freeze({ id, x0, x1, y0, y1, z0, z1, material, ...detail });
const trim = (id, x0, x1, y0, y1, z0, z1, material) =>
  piece(id, x0, x1, y0, y1, z0, z1, material, { blocking:false });
const fieldWall = (id,x0,x1,y0,y1,z0,z1) =>
  piece(id,x0,x1,y0,y1,z0,z1,stone,{shape:'field-wall'});
const roof = (id, x0, x1, eave, ridge, z0, z1) =>
  piece(id,x0,x1,eave,ridge,z0,z1,slate,{shape:'roof',blocking:false});

function sideEntry(id, { x, z, side, base, alignment = 'end' }) {
  // Enclosed weatherboard stair. The slope fills behind the lowest stone
  // tread, and the little service porch bears onto the house wall.
  const x0 = side > 0 ? x : x - 1.16, x1 = x0 + 1.16;
  const footprint = (xa, xb, za, zb) => alignment === 'front'
    ? [x+za-z,x+zb-z,z+xa-x,z+xb-x] : [xa,xb,za,zb];
  const grade = (px, pz) => alignment === 'front'
    ? homeValleyRise(x+pz-z,z+px-x) : homeValleyRise(px,pz);
  const joinery = (name, xa, xb, y0, y1, za, zb, finish, decorative = false) => {
    const [left,right,front,back] = footprint(xa,xb,za,zb);
    return piece(`${id}-${name}`,left,right,y0,y1,front,back,finish,{blocking:!decorative});
  };
  const outside = side > 0 ? x1 : x0;
  const outerGrade = Math.max(...[outside, outside+side*.90].flatMap(px =>
    [z-.55,z,z+.42].map(pz=>grade(px,pz))));
  const y = Math.max(base + 1.08, outerGrade + .66);
  const footing = Math.min(grade(x0,z-.88), grade(x1,z+.88), y) - .13;
  const blockX = side > 0 ? x1 - .16 : x0;
  const tread = (i) => {
    const xa = side > 0 ? outside + .06 + i * .28 : outside - .34 - i * .28;
    const xb = xa + .28;
    const top = y - (i + 1) * .16;
    return joinery(`tread-${i+1}`,xa,xb,footing,top,z-.55,z+.42,stone);
  };
  const [roofX0,roofX1,roofZ0,roofZ1] = footprint(x0-.18,x1+.18,z-1.05,z+1.03);
  return [
    joinery('side-stair-stone',x0,x1,footing,y,z-.84,z+.84,stone),
    joinery('side-stair-front',x0,x1,y,y+1.76,z-.84,z-.73,weatherboard),
    joinery('side-stair-rear',x0,x1,y,y+1.76,z+.73,z+.84,weatherboard),
    joinery('side-stair-door',blockX,blockX+.16,y,y+1.76,z-.55,z+.42,squaredTimber),
    joinery('side-stair-jamb',blockX-.027,blockX+.185,y,y+1.82,z-.61,z-.53,weatherboard,true),
    joinery('side-stair-lintel',blockX-.029,blockX+.186,y+1.73,y+1.86,z-.61,z+.48,weatherboard,true),
    roof(`${id}-side-stair-cover`,roofX0,roofX1,y+1.72,y+2.21,roofZ0,roofZ1),
    ...[0, 1, 2].map(tread),
  ];
}

function beamEnds(id, { x, z, halfWidth, base, height }) {
  return [-1, 1].flatMap((side) => [0, 1, 2].map((row) => {
    const at = x+side*(halfWidth-.14), y = base+height+row*.265;
    // The squared wall timbers alternate with the end-wall courses at the
    // corner, breaking the silhouette of the front elevation at close range.
    return trim(`${id}-squared-end-${side}-${row}`,at-.108,at+.108,y,y+.127,
      z-.225,z+.025,squaredTimber);
  }));
}

function cheeseStore(x, z) {
  // A low, detached local storehouse. Its slope-side support is a short
  // quarried-stone footing beneath a squared timber stack.
  const y=homeValleyRise(x,z)+.19;
  const x0=x-1.91, x1=x+1.91, z0=z-1.46, z1=z+1.46;
  const footing=Math.min(...[x0,x1].flatMap(px=>[z0,z1].map(pz=>homeValleyRise(px,pz))))-.15;
  return [
    piece('cheese-store-foot',x0-.09,x1+.09,footing,y,z0-.08,z1+.08,stone),
    piece('cheese-store-wall',x0,x1,y-.012,y+1.84,z0,z1,squaredTimber),
    piece('cheese-store-gable',x0,x1,y+1.83,y+2.47,z0,z1,squaredTimber,{shape:'gable',blocking:false}),
    roof('cheese-store-shingles',x0-.32,x1+.62,y+1.78,y+2.51,z0-.31,z1+.31),
    trim('cheese-store-threshold',x1-.06,x1+.45,y-.08,y+.09,z-.46,z+.44,stone),
    trim('cheese-store-door',x1-.02,x1+.06,y+.071,y+1.60,z-.41,z+.39,weatherboard),
    trim('cheese-store-door-jamb-left',x1+.01,x1+.11,y+.06,y+1.66,z-.48,z-.39,squaredTimber),
    trim('cheese-store-door-jamb-right',x1+.01,x1+.11,y+.06,y+1.66,z+.37,z+.47,squaredTimber),
    trim('cheese-store-door-head',x1+.01,x1+.12,y+1.55,y+1.68,z-.49,z+.48,squaredTimber),
    trim('cheese-store-latch',x1+.059,x1+.17,y+.88,y+.94,z+.19,z+.31,iron),
    ...[-1, 1].flatMap(side=>[
      trim(`cheese-store-verge-bearing-${side}`,x1-.06,x1+.55,y+1.83,y+1.96,z+side*.96-.07,z+side*.96+.07,weatherboard),
      trim(`cheese-store-bracket-${side}`,x1-.02,x1+.30,y+1.59,y+1.84,z+side*.96-.055,z+side*.96+.055,squaredTimber),
    ]),
  ];
}
function closedBuilding(id, { x, z, width, depth, base, eave, ridge, style, front = 'south' }) {
  const x0=x-width/2,x1=x+width/2,z0=z-depth/2,z1=z+depth/2;
  // Footings continue into the lowest corner instead of floating over a slope.
  const footing=Math.min(base,...[x0,x,x1].flatMap(px=>[z0,z,z1].map(pz=>homeValleyRise(px,pz))))-.18;
  const face=front==='north'?1:-1;
  const building=Object.freeze({x,z,width,depth,base,eave,ridge,footing,style,face});
  return [
    piece(id+'-plinth',x0-.09,x1+.09,footing,base+.61,z0-.08,z1+.08,stone,{rendering:false}),
    piece(id+'-closed-envelope',x0,x1,base+.55,eave,z0,z1,stone,{rendering:false}),
    // The closed walls still own collision. This bound also contains the
    // projections of the render-only eaves, stone sills and drains.
    piece(id+'-built-fabric',x0-.42,x1+.42,footing,ridge+.99,z0-(style===0?.54:.42),z1+.42,stone,
      {shape:'architecture',blocking:false,building}),
  ];
}

const site = (id, pieces) => Object.freeze({ id, pieces: Object.freeze(pieces) });
export const HOME_VALLEY_SITES = Object.freeze([
  site('bus-stop', [
    // Road side is open. You can step in and look at the old timetable.
    piece('stop-back',-28.8,-28.55,-.31,2.38,19.5,24.2,wood),
    piece('stop-north-windbreak',-28.6,-26.35,-.30,2.37,23.95,24.2,wood),
    piece('stop-open-corner',-26.68,-26.51,-.25,2.48,19.57,19.75,paint),
    trim('stop-roof',-29.06,-26.23,2.30,3.055,19.15,24.55,slate,{shape:'shelter-roof'}),
    trim('stop-road-eaves',-26.72,-26.48,2.34,2.55,19.58,24.18,72),
    trim('stop-rear-eaves',-28.80,-28.54,2.27,2.54,19.56,24.20,72),
    trim('stop-road-sill',-28.82,-28.53,-.12,.60,19.52,24.23,lime),
    trim('stop-roof-bearer-near',-28.72,-26.50,2.33,2.52,19.59,19.77,70),
    trim('stop-roof-bearer-mid',-28.72,-26.51,2.34,2.52,21.83,21.96,70),
    trim('stop-roof-bearer-far',-28.72,-26.50,2.33,2.52,24.00,24.19,70),
    trim('stop-bench',-28.52,-28.03,.79,.91,20.02,23.53,paint),
    trim('stop-bench-foot-a',-28.47,-28.11,-.03,.79,20.45,20.56,metal),
    trim('stop-bench-foot-b',-28.47,-28.11,-.03,.79,22.98,23.09,metal),
    trim('stop-timetable',-28.55,-28.45,1.07,1.83,21.05,21.69,metal),
    piece('stop-flag-post',-25.5,-25.37,-.18,2.53,22.72,22.86,metal),
    trim('stop-splash-stone',-29.15,-28.74,-.03,.095,24.42,25.15,lime),
    trim('stop-splash-channel',-29.08,-28.81,-.018,.028,25.14,25.55,stone),
    trim('stop-gutter-and-pipe',-29.24,-28.58,.02,2.45,19.08,24.58,76,{shape:'shelter-rainwater'}),
  ]),
  site('common-and-store', [
    ...closedBuilding('store',{x:-17,z:59,width:6.6,depth:4.5,base:-.15,eave:2.78,ridge:4.24,style:0}),
    piece('common-trough',-24.2,-22.0,-.18,.80,53.3,54.25,stone,{shape:'trough'}),
    trim('common-trough-ice',-24.02,-22.18,.63,.68,53.46,54.09,ice),
    piece('common-water-pail',-22.03,-21.68,.06,.48,53.60,53.95,metal,{shape:'trough'}),
    piece('common-bench',-19.6,-18.05,.22,.45,53.8,54.24,paint),
    ...HOME_COMMONS_WORKS,
  ]),
  site('bakery', [
    ...closedBuilding('bakery',{x:-8.8,z:58.3,width:4.2,depth:4.6,base:-.12,eave:2.91,ridge:4.30,style:5}),
    trim('bakery-step',-10.36,-9.06,-.11,.105,55.56,56.12,71),
    trim('bakery-side-vent',-10.94,-10.89,1.85,2.15,58.08,58.53,63),
  ]),
  site('upper-pasture', [
    ...closedBuilding('hay-store',{x:-40.6,z:72.5,width:5.6,depth:5.4,base:6.65,eave:9.34,ridge:10.91,style:1,front:'north'}),
    // The wagon opening is at the upper side. Only its lip emerges from the
    // packed uphill apron; the two retaining cheeks carry the raised threshold.
    piece('hay-store-lip',-42.0,-39.17,6.63,7.49,75.18,76.21,stone),
    piece('hay-store-apron-west',-42.16,-41.92,6.60,7.53,75.19,76.31,stone),
    piece('hay-store-apron-east',-39.26,-39.04,6.78,7.63,75.19,76.34,stone),
    trim('hay-store-snow-edge',-41.86,-39.30,7.487,7.536,76.06,76.21,snow),
    fieldWall('pasture-wall-a',-36.8,-34.5,6.02,7.64,81.1,81.62),
    fieldWall('pasture-wall-b',-34.5,-31.6,5.52,7.10,81.10,81.62),
    piece('pasture-post-a',-31.65,-31.17,5.51,7.38,80.95,81.71,stone),
    piece('pasture-post-b',-29.0,-28.55,4.55,6.31,80.95,81.71,stone),
    fieldWall('pasture-wall-c',-28.6,-26.7,4.1,6.02,81.1,81.62),
  ]),
  site('detached-cheese-store', cheeseStore(-43.2,65.7)),
  site('east-workyard', [
    ...closedBuilding('wash-house',{x:27.1,z:53.7,width:7.0,depth:5.4,base:-.65,eave:2.92,ridge:4.63,style:2}),
    piece('wash-house-tub',17.4,19.8,-1.12,.10,45.76,46.75,stone,{shape:'trough'}),
    trim('wash-house-ice',17.60,19.60,-.08,-.02,45.92,46.59,ice),
    fieldWall('wash-house-drain-wall',16.25,16.76,-1.15,.47,43.6,49.8),
    fieldWall('wash-house-yard-wall',25.4,31.8,-1.12,.39,48.2,48.72),
    piece('wash-house-post',24.99,25.53,-1.06,.88,48.03,48.85,stone),
    trim('yard-rack-rail',17.8,20.35,.55,.66,48.12,48.26,paint),
    piece('yard-rack-left',17.8,17.99,-1.05,.71,48.02,48.31,wood),
    piece('yard-rack-right',20.17,20.35,-1.05,.71,48.02,48.31,wood),
    trim('yard-rack-basin',18.27,19.18,.64,.79,48.02,48.33,ice),
    trim('yard-rack-scrub-board',19.38,19.98,.65,.92,48.06,48.19,wood),
    trim('yard-rack-handle',19.46,19.9,.79,.83,48.025,48.08,paint),
  ]),
  site('north-houses', [
    ...closedBuilding('row-house-one',{x:16.5,z:101,width:8.4,depth:6.9,base:.75,eave:4.63,ridge:6.19,style:6}),
    ...closedBuilding('row-house-two',{x:30.6,z:91,width:7.9,depth:6.0,base:2.81,eave:6.51,ridge:8.16,style:4}),
    ...sideEntry('row-house-one',{x:20.68,z:100.95,side:1,base:.75}),
    ...sideEntry('row-house-two',{x:29.35,z:88.02,side:-1,base:2.81,alignment:'front'}),
    ...beamEnds('row-house-one',{x:16.5,z:97.55,halfWidth:4.2,base:.75,height:1.17}),
    ...beamEnds('row-house-two',{x:30.6,z:88,halfWidth:3.95,base:2.81,height:1.24}),
    trim('ski-workshop-threshold',14.62,16.59,.53,.91,97.13,97.63,71),
    fieldWall('north-yard-wall',17.8,23.1,.10,1.45,95.0,95.55),
    fieldWall('north-yard-return',22.56,23.10,.18,1.55,95.1,98.9),
    piece('north-timber-store',25.5,27.35,1.9,3.45,87.9,89.3,wood),
    roof('north-timber-roof',25.32,27.52,3.46,3.89,87.7,89.5),
    piece('north-yard-woodpile',19.8,21.2,.40,1.28,96.85,97.75,wood),
    trim('north-yard-sawhorse-top',21.68,22.84,.98,1.13,99.65,99.94,paint),
    piece('north-yard-sawhorse-left',21.69,21.88,.09,1.01,99.54,100.05,wood),
    piece('north-yard-sawhorse-right',22.63,22.82,.11,1.01,99.54,100.05,wood),
  ]),
]);
