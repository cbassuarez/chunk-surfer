import test from 'node:test';
import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { DOOR_ARCHETYPES } from '../src/data/conservatory-doors.js';
import * as FP from '../src/world/floorplan.js';
import { MATERIAL } from '../src/data/floorplan/legend.js';
import {
  PUBLIC_SANITARY_CORE, PUBLIC_SANITARY_PARTITIONS, BUILDING_AMENITY_LEVELS,
  BUILDING_AMENITY_DOORS, BUILDING_AMENITY_COLLIDERS, BUILDING_AMENITY_MESHES,
  BUILDING_AMENITY_PROPS, BUILDING_AMENITY_SURVEY_NODES,
} from '../src/data/building-amenities.js';
import { buildBuildingAmenities } from '../tools/chunk_surfer/building-amenities-geometry.mjs';

const alreadyIntegrated = conservatory.doors.some((d) => d.id === 'public-wc-large');
const levels = alreadyIntegrated ? conservatory.levels : [...conservatory.levels, ...BUILDING_AMENITY_LEVELS];
const doors = alreadyIntegrated ? conservatory.doors : [...conservatory.doors, ...BUILDING_AMENITY_DOORS];
FP.compile(levels, { width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors, edgePortals: conservatory.edgePortals, doors });
const rt = (v) => Math.round(v * 2);
const inBox = (x, y, p, padding = 0) => {
  const c = Math.cos(-(p.yaw || 0)), s = Math.sin(-(p.yaw || 0)), dx = x - p.x, dy = y - p.y;
  return Math.abs(dx * c - dy * s) <= (p.width ?? p.w) / 2 + padding
    && Math.abs(dx * s + dy * c) <= (p.depth ?? p.d) / 2 + padding;
};
const canStand = (x, y) => {
  const cx = rt(x - .25), cy = rt(y - .25), floor = FP.floorAt(cx, cy);
  if (FP.isSolid(cx, cy) || FP.doorAt(cx, cy)?.open === false) return false;
  if (BUILDING_AMENITY_COLLIDERS.some((p) => floor >= p.minElevation - .05 && floor <= p.maxElevation + .05 && inBox(x, y, p))) return false;
  return !BUILDING_AMENITY_PROPS.some((p) => p.blocks && Math.abs((p.floorOverride || 0) - floor) < .1
    && inBox(x, y, { ...BUILDING_AMENITY_MESHES[p.mesh], ...p,
      w: BUILDING_AMENITY_MESHES[p.mesh].w * (p.scale || 1), d: BUILDING_AMENITY_MESHES[p.mesh].d * (p.scale || 1) }, .20));
};
const walk = (points) => {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .125));
    for (let s = 0; s <= steps; s += 1) {
      const x = a[0] + (b[0] - a[0]) * s / steps, y = a[1] + (b[1] - a[1]) * s / steps;
      assert.ok(canStand(x, y), `body path blocked at ${x.toFixed(3)},${y.toFixed(3)}`);
    }
  }
};

test('approved public core compiles as lower service accommodation with two real unlocked doors', () => {
  for (const door of BUILDING_AMENITY_DOORS) {
    const actual = FP.doorState().find((d) => d.id === door.id);
    assert.ok(actual, door.id); assert.equal(actual.keyId, null); assert.equal(actual.open, true);
    assert.equal(actual.closer, 'none'); assert.equal(actual.mesh, DOOR_ARCHETYPES[door.archetype].mesh);
  }
  for (const [x, y] of [[75.75, 24.75], [77.25, 25.75], [80.75, 26.25]]) {
    assert.equal(FP.floorAt(rt(x), rt(y)), 0);
    assert.equal(FP.cellAt(rt(x), rt(y)).ceil, 3.5);
    assert.equal(FP.materialAt(rt(x), rt(y)), MATERIAL.wetTile);
  }
  const overlaps = FP.physicalSpanData().overlaps.filter((o) => /sanitary/.test(`${o.a.owner} ${o.b.owner}`));
  assert.deepEqual(overlaps, []);
});

test('both WC cubicles and the open washroom are entered by actual body paths', () => {
  walk([[76.75, 22.75], [76.75, 24.75], [76.75, 25.0]]);
  walk([[80.75, 22.75], [80.75, 24.25], [79.25, 24.25], [79.25, 25.25]]);
  // Closing either real leaf refuses its throat and reopening restores it.
  for (const [id, x, y] of [['public-wc-large', 76.75, 23.75], ['public-wc-standard', 79.25, 24.75]]) {
    FP.setDoorOpen(id, false); assert.equal(canStand(x, y), false, `${id}: closed`);
    FP.setDoorOpen(id, true); assert.equal(canStand(x, y), true, `${id}: reopened`);
  }
  assert.equal(canStand(78.25, 25.25), false, 'cubicle divider is body-solid');
  assert.equal(canStand(81.75, 25.25), false, 'outside side wall is body-solid');
  assert.equal(canStand(76.25, 26.0), false, 'toilet pedestal/bowl has collision');
});

test('approved circulation, pool washing and story-counter approach remain clear', () => {
  walk([[75.75, 22.25], [95.25, 22.25]]);
  walk([[85.25, 22.25], [85.25, 26.25]]);
  walk([[74.25, 31.75], [74.25, 30.25], [72.75, 30.25]]);
  walk([[17.25, 272.75], [17.25, 271.25], [17.25, 270.75]]);
  assert.equal(canStand(80.46,25.75),false,'parked cupboard leaf blocks a body before it reaches the visible panel');
  walk([[80.95,24.25],[80.95,25.50],[80.95,25.85]]);
  for (const p of PUBLIC_SANITARY_PARTITIONS) {
    assert.ok(p.x - p.width / 2 >= PUBLIC_SANITARY_CORE.x0 - 1e-8);
    assert.ok(p.x + p.width / 2 <= PUBLIC_SANITARY_CORE.x1 + 1e-8);
    assert.ok(p.y - p.depth / 2 >= PUBLIC_SANITARY_CORE.y0 - 1e-8);
    assert.ok(p.y + p.depth / 2 <= PUBLIC_SANITARY_CORE.y1 + 1e-8);
  }
  const counter = BUILDING_AMENITY_PROPS.find((p) => p.id === 'amenity-staff-tea-counter');
  assert.equal(counter.x, 18.3); assert.equal(counter.y, 271.4); assert.equal(counter.floorOverride, 10);
  assert.ok(Math.abs(counter.renderOffsetX + Math.round(counter.x * 2) / 2 - 18.3) < 1e-10);
  assert.ok(Math.abs(counter.renderOffsetZ + Math.round(counter.y * 2) / 2 - 271.4) < 1e-10);
});

test('every amenity mesh is constructed, finite and made of functional visible parts', () => {
  const meshes = new Map(), materials = [];
  const MAT = Object.fromEntries(['wood', 'black', 'poolBlue', 'ivory', 'paper', 'steel', 'agedWhite', 'cloth', 'navy'].map((s, i) => [s, i]));
  const add = (kind) => (m, ...args) => m.parts.push({ kind, args });
  buildBuildingAmenities({ mesh: (name) => { const m = { name, parts: [] }; meshes.set(name, m); return m; }, materials, MAT,
    addBox: add('box'), addBeam: add('beam'), addEllipsoid: add('ellipsoid'), addCylinder: add('cylinder'), addQuad: add('quad') });
  assert.deepEqual(new Set(meshes.keys()), new Set(Object.keys(BUILDING_AMENITY_MESHES)));
  for (const m of meshes.values()) {
    assert.ok(m.parts.length >= 5, m.name);
    assert.ok(m.parts.flatMap((p) => p.args.flat(Infinity)).filter((v) => typeof v === 'number').every(Number.isFinite), m.name);
    for (const p of m.parts) assert.ok(Number.isInteger(p.args[{box:2,beam:3,ellipsoid:2,cylinder:3,quad:4}[p.kind]]), `${m.name}: every part has a real material`);
  }
  const toilet = meshes.get('amenity_toilet').parts;
  assert.ok(toilet.filter((p) => p.kind === 'quad').length >= 64, 'open bowl interior, exterior and separate rim/seat');
  const basin = meshes.get('amenity_washbasin').parts;
  assert.equal(basin.filter((p) => p.kind === 'quad').length, 4, 'four concave bowl surfaces');
  assert.ok(basin.filter((p) => p.kind === 'beam').length >= 6, 'tap, trap and brackets are visible geometry');
  const cupboard = meshes.get('amenity_cleaner_cupboard').parts;
  const parkedLeaf=cupboard.find(p=>p.kind==='box'&&p.args[1][0]===.045&&p.args[1][1]===2.04&&p.args[1][2]===.44);
  const cupboardPose=BUILDING_AMENITY_PROPS.find(p=>p.id==='amenity-cleaner-cupboard');
  const leafBody=BUILDING_AMENITY_COLLIDERS.find(p=>p.id==='amenity-cleaner-parked-leaf-body');
  assert.ok(parkedLeaf&&leafBody,'the actual parked panel has a separate body proxy');
  const leafCentre=parkedLeaf.args[0],c=Math.cos(cupboardPose.yaw),s=Math.sin(cupboardPose.yaw);
  assert.ok(Math.abs(leafBody.x-(cupboardPose.x+c*leafCentre[0]-s*leafCentre[2]))<1e-9);
  assert.ok(Math.abs(leafBody.y-(cupboardPose.y+s*leafCentre[0]+c*leafCentre[2]))<1e-9);
  assert.equal(leafBody.yaw,cupboardPose.yaw);
  assert.equal(leafBody.width,parkedLeaf.args[1][0]+leafBody.bodyMargin*2);
  assert.equal(leafBody.depth,parkedLeaf.args[1][2]+leafBody.bodyMargin*2);
  assert.equal(leafBody.minElevation,leafCentre[1]-parkedLeaf.args[1][1]/2);
  assert.equal(leafBody.maxElevation,leafCentre[1]+parkedLeaf.args[1][1]/2);
  assert.ok(leafBody.x+leafBody.width/2<80.75,'the cupboard leaf does not claim the washroom approach lane');
  const slopStart = cupboard.findIndex((p) => p.kind === 'quad');
  const mopHandle = cupboard.findIndex((p) => p.kind === 'beam' && p.args[0][0] > .20 && p.args[1][1] > 1.5);
  assert.ok(slopStart >= 0 && mopHandle > slopStart, 'maintenance washing occupies the existing lower bay before the retained mop');
  const slop = cupboard.slice(slopStart, mopHandle), registry = BUILDING_AMENITY_MESHES.amenity_cleaner_cupboard;
  const partBounds = (p) => {
    if (p.kind === 'quad') return { min: [0,1,2].map((axis) => Math.min(...p.args.slice(0,4).map((v) => v[axis]))), max: [0,1,2].map((axis) => Math.max(...p.args.slice(0,4).map((v) => v[axis]))) };
    if (p.kind === 'beam') return { min: [0,1,2].map((axis) => Math.min(p.args[0][axis],p.args[1][axis])-p.args[2]/2), max: [0,1,2].map((axis) => Math.max(p.args[0][axis],p.args[1][axis])+p.args[2]/2) };
    const radius = p.kind === 'cylinder' ? [p.args[1],p.args[2]/2,p.args[1]] : p.args[1].map((v) => v/2);
    return { min:p.args[0].map((v,i)=>v-radius[i]),max:p.args[0].map((v,i)=>v+radius[i]) };
  };
  assert.equal(slop.filter((p) => p.kind === 'quad' && p.args.slice(0,4).some((v) => v[1] === .55)).length,4,'four concave faces leave an actual open washing bowl');
  assert.ok(slop.some((p) => p.kind === 'cylinder' && p.args[1] === .020 && p.args[0][1] < .34),'drain sits at the basin low point');
  assert.ok(!slop.filter((p)=>p.kind==='box'||p.kind==='cylinder'||p.kind==='ellipsoid').some((p)=>{
    const b=partBounds(p);return b.min[0]<-.14&&b.max[0]>-.14&&b.min[2]<0&&b.max[2]>0&&b.max[1]>.36&&b.min[1]<.64;
  }),'the opening above the drain has no solid lid or filled ellipsoid');
  for(const part of slop){const b=partBounds(part);
    assert.ok(b.min[0]>=-registry.w/2&&b.max[0]<=.12,'washing point stays left of the retained mop');
    assert.ok(b.min[2]>=-registry.d/2&&b.max[2]<=registry.d/2,'washing point stays inside the registered cupboard depth');
    assert.ok(b.min[1]>=-.021&&b.max[1]<=registry.h,'only the service pipe penetrates the floor by at most20mm');
  }
  const plumbing=slop.filter((p)=>p.kind==='beam'),same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-9);
  const drainStem=plumbing.find((p)=>p.args[0][1]<.31&&p.args[0][1]>.29&&p.args[0][2]===0);
  assert.ok(drainStem,'drain has a visible waste stem');
  const pending=[drainStem.args[0]],seen=new Set();let reachesFloor=false;
  while(pending.length){const at=pending.pop(),key=at.join(',');if(seen.has(key))continue;seen.add(key);
    if(at[1]===0&&at[2]<-.18)reachesFloor=true;
    for(const p of plumbing){if(same(p.args[0],at))pending.push(p.args[1]);if(same(p.args[1],at))pending.push(p.args[0]);}
  }
  assert.ok(reachesFloor,'waste stem, trap and service drop form a connected route to the floor');
  assert.equal(plumbing.filter((p)=>p.args[0][1]===0&&p.args[1][1]>.70).length,2,'both tap supplies rise from the floor service route');
  assert.ok(meshes.get('amenity_staff_counter').parts.length > 80, 'sink, kettle, three open mugs, flex, cloth and belongings');
  const services = meshes.get('amenity_staff_service_connections').parts;
  assert.ok(services.some((p) => p.kind === 'beam' && p.args[1][0] >= .515), 'water/waste actually reach x19 masonry from anchor18.5');
  const wallSocket = services.find((p) => p.kind === 'box' && p.args[0][1] === 1.35 && p.args[1][0] === .025);
  assert.ok(wallSocket, 'socket has a real wall mounting');
  assert.ok(Math.abs(18.5 + wallSocket.args[0][0] + wallSocket.args[1][0] / 2 - 19) < 1e-10, 'socket back meets actual partition face');
  const wallContact = (id, width, axis, wall) => {
    const placed = BUILDING_AMENITY_PROPS.find((p) => p.id === id);
    const part = meshes.get(placed.mesh).parts.find((p) => p.kind === 'box' && p.args[1][0] === width);
    assert.ok(part, `${id}: physical mounting part exists`);
    const scale = placed.scale || 1, localX = part.args[0][0] * scale, localZ = (part.args[0][2] - part.args[1][2] / 2) * scale;
    const yaw = placed.yaw || 0;
    const world = axis === 'x' ? placed.x + localX * Math.cos(yaw) - localZ * Math.sin(yaw)
      : placed.y + localX * Math.sin(yaw) + localZ * Math.cos(yaw);
    assert.ok(Math.abs(world - wall) <= .026, `${id}: mounting surface is ${(Math.abs(world - wall) * 100).toFixed(1)}cm off actual wall`);
  };
  wallContact('amenity-large-wc', .47, 'y', 26.68);
  wallContact('amenity-standard-wc', .47, 'y', 26.68);
  wallContact('amenity-public-washbasin', .56, 'x', 81.68);
  wallContact('amenity-large-wc-mirror-soap', .62, 'x', 78.18);
  wallContact('amenity-pool-mirror-soap', .62, 'y', 28);
  wallContact('amenity-public-drinking-fountain', .56, 'x', 97);
  wallContact('amenity-staff-coat-lockers', 1.4, 'x', 19);
  assert.ok(materials.every((m) => !m.emissiveFactor), 'powered-off amenities invent no glowing pilots');
});

test('native survey nodes include both doorways, entered spaces and the protected welfare approach', () => {
  for (const id of ['public-wc-large-threshold', 'public-wc-large-interior', 'public-wc-standard-threshold', 'pool-shower-interior', 'staff-counter-approach', 'public-drinking-fountain', 'staff-lockers-approach']) {
    assert.ok(BUILDING_AMENITY_SURVEY_NODES.some((n) => n.id === id));
  }
  assert.equal(BUILDING_AMENITY_DOORS.every((d) => d.key === null), true);
});

test('the public drinking fountain clears the existing honours boards and services panel',()=>{
  const fountain=BUILDING_AMENITY_PROPS.find(p=>p.id==='amenity-public-drinking-fountain');
  const spec=BUILDING_AMENITY_MESHES[fountain.mesh],body=BUILDING_AMENITY_COLLIDERS.find(p=>p.id==='amenity-drinking-fountain-body');
  const approach=BUILDING_AMENITY_SURVEY_NODES.find(p=>p.id==='public-drinking-fountain');
  // Actual atrium_public_fittings geometry: host z15, three2.05m boards at
  // local z.2,3.05,5.9. Their low edge1.16 overlaps the fountain backplate.
  const boards=[.2,3.05,5.9].map(z=>({min:15+z-2.05/2,max:15+z+2.05/2}));
  const min=fountain.y-spec.w/2,max=fountain.y+spec.w/2;
  for(const board of boards)assert.ok(max<board.min||min>board.max,'an existing honours board hides the bowl/backplate');
  // Measured imported power_box_01 +X extent, with the existing SP03 scale.
  const panelEnd=16+.174881*1.76;
  assert.ok(min>panelEnd+.05,'fountain overlaps the adjacent services panel');
  assert.equal(body.y,fountain.y,'physical body follows the moved visible fixture');
  assert.equal(approach.y,fountain.y,'native survey faces the actual fixture');
  assert.ok(approach.x<body.x-body.width/2,'approach remains outside the real blocking body');
});
