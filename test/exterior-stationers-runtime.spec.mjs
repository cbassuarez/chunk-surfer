import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CELL, F, ZONE, isOutdoorZone } from '../src/data/floorplan/legend.js';
import { CONSERVATORY_DOORS } from '../src/data/conservatory-doors.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { CONSERVATORY_LIGHTS, LIGHT_POWER_MODE, resolveLightingContext, resolveLocalLights } from '../src/data/conservatory-lights.js';
import {
  EXTERIOR_STATIONERS as S, EXTERIOR_STATIONERS_PACK,
  STATIONERS_LEVELS, STATIONERS_DOORS, STATIONERS_PROPS, STATIONERS_COLLIDERS, STATIONERS_LIGHTS,
} from '../src/data/exterior-stationers.js';
import { districtLogicalAt } from '../src/data/exterior-district.js';
import { isExteriorObserver, shouldHideCrossEnvelopeProp } from '../src/game/prop-visibility.js';
import { getInGoodsDoorAim } from '../src/game/get-in-door-entry.js';
import { captureExteriorMapSource, usesExteriorMap } from '../src/game/exterior-map-model.js';
import { EXTERIOR_MAP_SPACE_IDS } from '../src/data/exterior-map-ids.js';
import { FACILITY_SPACE_IDS } from '../src/data/building-map.js';
import * as OBJ from '../src/game/objectives.js';
import { parseGlb } from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

FP.compile(conservatory.levels, conservatory);

test('the occupied stationer has its own readable lighting rather than the dark unknown-room fallback',()=>{
  const context=resolveLightingContext({group:'ground',zone:ZONE.stationers,spaceId:S.spaceId});
  const fallback=resolveLightingContext({group:'ground',zone:ZONE.none});
  assert.ok(context.ambientIntensity>fallback.ambientIntensity*4);
  assert.ok(context.ambientIntensity<=resolveLightingContext({zone:ZONE.pub}).ambientIntensity);
  assert.equal(context.captureExposure,1.5);
  const lights=resolveLocalLights(context,{origin:{x:23.75,z:-17.25},liveCircuits:new Set()});
  assert.deepEqual(lights.map(l=>l.id).sort(),STATIONERS_LIGHTS.map(l=>l.id).sort());
  for(const light of lights){
    const source=STATIONERS_LIGHTS.find(l=>l.id===light.id);
    assert.equal(light.powerMode,LIGHT_POWER_MODE.EXTERNAL);
    assert.equal(light.intensity,source.intensity);
    assert.equal(light.radius,source.radius);
  }
});
const placed = PROPS.propsInit(FP);
const rendered = PROPS.renderInstances({ group: 'ground', inscriptions: false });
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const rendererSource = fs.readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const bodyAt = (x, z) => {
  const logical = districtLogicalAt(x - CELL / 2, z - CELL / 2);
  return { x: logical.x / CELL, y: logical.y / CELL };
};
const aisle = bodyAt(23.75, -17.25), approach = bodyAt(S.door.x, -14.25);
const renderCellAt = (slice, x, z) => {
  const i = (Math.floor(z / CELL) - slice.originY) * slice.w + Math.floor(x / CELL) - slice.originX;
  assert.ok(i >= 0 && i < slice.solid.length);
  return { solid: slice.solid[i], floor: slice.floor[i], ceil: slice.ceil[i], flags: slice.flags[i], zone: slice.zone[i] };
};
const shopSlice = FP.physicalRenderPlanFor(aisle.x, aisle.y);
const streetSlice = FP.physicalRenderPlanFor(approach.x, approach.y);
const shopCell = renderCellAt(shopSlice, 23.75, -17.25);

test('the optional shop enters the actual plan, prop registry, colliders and ordinary door schedule exactly once', () => {
  for (const level of STATIONERS_LEVELS) assert.equal(conservatory.levels.filter(candidate => candidate.id === level.id).length, 1);
  for (const door of STATIONERS_DOORS) {
    assert.equal(CONSERVATORY_DOORS.filter(candidate => candidate.id === door.id).length, 1);
    assert.equal(FP.doorState().filter(candidate => candidate.id === door.id).length, 1);
  }
  for (const prop of STATIONERS_PROPS) {
    assert.ok(PROP_MESH[prop.mesh]);
    assert.equal(placed.filter(candidate => candidate.id === prop.id).length, 1);
    const draw = rendered.find(candidate => candidate.id === prop.id);
    assert.ok(draw);
    assert.equal(draw.mesh, S.room.mesh);
    assert.equal(draw.x, S.room.anchor.x);
    assert.equal(draw.z, S.room.anchor.z);
    assert.equal(draw.y, S.floor);
    assert.equal(draw.zone, ZONE.stationers);
  }
  for (const collider of STATIONERS_COLLIDERS) {
    assert.equal(PROPS.structuralColliders().filter(candidate => candidate.id === collider.id).length, 1);
  }
  const row = CONSERVATORY_PROPS.find(prop => prop.id === S.row.id);
  assert.equal(row.mesh, S.row.mesh);
  assert.equal(row.fallbackMesh, S.row.sourceMesh, 'a rejected optional room pack retains the original closed terrace');
});

test('walking and weather semantics remain an ordinary dry room while its render envelope belongs to the city', () => {
  assert.equal(FP.zoneAt(aisle.x, aisle.y), ZONE.stationers);
  assert.ok(Math.abs(FP.floorAt(aisle.x, aisle.y) - S.floor) < 1e-6);
  assert.equal(FP.flagsAt(aisle.x, aisle.y) & F.SKY, 0);
  assert.equal(isOutdoorZone(ZONE.stationers), false);
  assert.equal(isExteriorObserver({ zone: ZONE.stationers }), true);
  assert.equal(PROPS.propCanOccupy(aisle.x, aisle.y), true);
  const row = rendered.find(prop => prop.id === S.row.id);
  const room = rendered.find(prop => prop.id === STATIONERS_PROPS[0].id);
  assert.equal(shouldHideCrossEnvelopeProp(row, { observerZone: ZONE.stationers }), false);
  assert.equal(shouldHideCrossEnvelopeProp(room, { observerZone: ZONE.stationers }), false);
  assert.equal(shouldHideCrossEnvelopeProp({ id: 'interior-control', mesh: 'school_desk', x: 70, z: 40 },
    { observerZone: ZONE.stationers }), true, 'an optional street room cannot expose institutional interiors');
});

test('street and shop observers retain the same mesh-owned underlay without generic ceiling or floor interference', () => {
  for (const slice of [shopSlice, streetSlice]) {
    const cell = renderCellAt(slice, 23.75, -17.25);
    assert.equal(cell.solid, 0);
    assert.equal(cell.zone, ZONE.stationers);
    assert.equal(cell.flags & F.SKY, F.SKY);
    assert.ok(Math.abs(cell.floor - (S.floor - S.renderUnderlayDrop)) < 1e-6);
    assert.equal(cell.ceil, 24, 'actual room ceiling is the depth-writing standalone shell');
  }
  assert.equal(FP.zoneAt(approach.x, approach.y), ZONE.civicCourt);
  assert.equal(FP.flagsAt(approach.x, approach.y) & F.SKY, F.SKY);
  assert.ok(Math.abs(FP.floorAt(aisle.x, aisle.y) - S.floor) < 1e-6, 'render underlay never lowers the walking surface');
});

test('the production rain predicate keeps both mesh-owned interiors dry and the doorstep exposed', () => {
  const expression = rendererSource.match(/bool cameraInWeather=([^;]+);/)?.[1];
  assert.ok(expression, 'inspect the production weather condition, not a copied JS approximation');
  const js = expression.replace(/\$\{ZONE\.(\w+)\}/g, (_match, key) => {
    assert.ok(Number.isInteger(ZONE[key]));
    return ZONE[key];
  });
  const inWeather = new Function('uUsePlan', 'eyeCell', 'FLAG_SKY', `return !!(${js});`);
  assert.equal(inWeather(1, shopCell, F.SKY), false, 'render-only SKY must not add rain inside the shop');
  assert.equal(inWeather(1, { flags: F.SKY, zone: ZONE.pub }, F.SKY), false);
  assert.equal(inWeather(1, renderCellAt(streetSlice, S.door.x, -14.25), F.SKY), true);
  assert.equal(inWeather(1, { flags: 0, zone: ZONE.getIn }, F.SKY), false);
});

test('the actual district map captures the shop aisle and exposes one persistent optional entrance mark', () => {
  assert.equal(usesExteriorMap({ zone: ZONE.stationers, height: S.floor }), true);
  assert.equal(usesExteriorMap({ zone: ZONE.getIn, height: 0 }), false);
  assert.equal(usesExteriorMap({ zone: ZONE.academicRoof, height: 17 }), false);
  // Bound the capture to this real room and its immediate public approach; the
  // full district collision/route test belongs to exterior-map.spec.mjs.
  const cells = new Map([...FP.physicalSpanData().cells].filter(([key]) => {
    const [x, z] = key.split(',').map(Number);
    return x * CELL >= 18 && x * CELL <= 26 && z * CELL >= -21 && z * CELL <= -13;
  }));
  const projectLogical = point => {
    const rt = FP.toRuntimePoint(point), at = FP.logicalToPhysical(rt.x, rt.y);
    return { x: at.x, z: at.z, height: at.y, renderGroup: at.renderGroup };
  };
  const source = captureExteriorMapSource({ physical: { cells }, projectLogical, renderedInstances: rendered,
    canOccupy: span => PROPS.propCanOccupy(span.logicalX, span.logicalY) });
  const physical = FP.logicalToPhysical(aisle.x, aisle.y);
  assert.ok(source.floors[0].visibilityOpen.has(`${Math.floor(physical.x)},${Math.floor(physical.z)}`));
  const mark = source.spaces.find(space => space.id === 'outside:stationers');
  assert.ok(mark && mark.waypointable && mark.selectable);
  assert.deepEqual(mark.position, { x: S.door.x, y: S.door.z + 1.25 });
  assert.deepEqual(mark.doorIds, [S.door.id]);
  assert.equal(mark.floorId, 'district');
  assert.equal(source.district.footprints.filter(shape => shape.role === 'stationers').length, 1);
  assert.ok(EXTERIOR_MAP_SPACE_IDS.includes(mark.id));
  OBJ.setPlayerWaypoint({ spaceId: mark.id, floorId: mark.floorId, label: mark.label, position: mark.position });
  const saved = structuredClone(OBJ.saveObjState());
  OBJ.clearWaypoint();
  OBJ.loadObjState(saved, { validTargets: [], validSpaces: FACILITY_SPACE_IDS });
  assert.equal(OBJ.playerWaypoint()?.spaceId, mark.id);
  assert.deepEqual(OBJ.playerWaypoint()?.position, mark.position);
  OBJ.clearWaypoint();
});

test('actual door focus withholds entry until both standalone pack meshes are available', () => {
  const readySource = rendererSource.match(/export function r3dStationersReady\(\)\s*\{[^\n]+\}/)?.[0];
  assert.ok(readySource);
  const focusStart = mainSource.indexOf('function aimedWorldDoor(facing,maxCells=5){');
  const focusEnd = mainSource.indexOf('\nfunction focusedWorldDoor(', focusStart);
  assert.ok(focusStart >= 0 && focusEnd > focusStart);
  const focusSource = mainSource.slice(focusStart, focusEnd);
  const pack = parseGlb(fs.readFileSync(new URL('../public' + EXTERIOR_STATIONERS_PACK, import.meta.url)));
  const completeCatalog = pack.json.meshes.map(mesh => mesh.name);
  assert.ok(completeCatalog.includes(S.row.mesh) && completeCatalog.includes(S.room.mesh));
  FP.setDoorOpen(S.door.id, false);
  for (const catalog of [[], [S.row.mesh], [S.room.mesh], completeCatalog]) {
    const ready = new Function('P3', `${readySource.replace(/^export /, '')};return r3dStationersReady;`)(
      { propMeshCatalog: () => catalog });
    const scope = { usingPlan: () => true, usingSpecialSpace: () => false, FP,
      px: approach.x, py: approach.y, CELL, GREY_DOOR_ID: 'dock-grey-exterior', getInGoodsDoorAim,
      R3: { r3dStationersReady: ready } };
    const focus = new Function('scope', `with(scope){return (${focusSource});}`)(scope);
    const hit = focus([0, -1]);
    const expected = catalog.includes(S.row.mesh) && catalog.includes(S.room.mesh);
    assert.equal(ready(), expected);
    assert.equal(hit?.portal?.id || null, expected ? S.door.id : null);
  }
});

test('the separate room pack cannot abort later building loads and its ordinary task lights stay independent', async () => {
  const start = rendererSource.indexOf('.then(()=>P3.addPropPack(assetUrl(EXTERIOR_STATIONERS_PACK))');
  const end = rendererSource.indexOf(".then(()=>P3.addPropPack(assetUrl('assets/opening-street.glb'))", start);
  assert.ok(start >= 0 && end > start);
  const load = new Function('P3', 'assetUrl', 'EXTERIOR_STATIONERS_PACK', 'console',
    `return Promise.resolve()${rendererSource.slice(start, end).trim()};`);
  let nextReached = false;
  await load({ addPropPack: () => Promise.reject(new Error('test missing optional shop')) }, path => path,
    EXTERIOR_STATIONERS_PACK, { warn() {} }).then(() => { nextReached = true; });
  assert.equal(nextReached, true, 'the optional shop must not prevent street, door and stair loading');
  for (const light of STATIONERS_LIGHTS) {
    const registered = CONSERVATORY_LIGHTS.filter(candidate => candidate.id === light.id);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].powerMode, LIGHT_POWER_MODE.EXTERNAL);
    assert.ok(registered[0].zones.includes(ZONE.stationers));
    assert.ok(registered[0].zones.includes(ZONE.street));
    assert.equal(registered[0].circuit, null);
  }
});
