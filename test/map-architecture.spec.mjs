import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMapArchitecture } from '../src/game/map-architecture.js';
import { floorForHeight } from '../src/game/map-projection.js';
import { captureFloorplanMapSource, buildMapModel } from '../src/game/map-model.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { F, ZONE } from '../src/data/floorplan/legend.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';

const span = (floor = 0, extra = {}) => ({ floor, ceil: floor + 3, flags: 0,
  zone: ZONE.foyer, renderGroup: 'ground', spaceId: 'test-room', owner: 'test-room', ...extra });
const physical = entries => ({ cells: new Map(entries) });
const capture = (cells, extra = {}) => captureMapArchitecture({ definition: BUILDING_MAP,
  physical: cells, topologyStride: 2, ...extra });
const covered = (surfaces, x, y) => surfaces.some(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

test('architectural rectangles merge real cells, retain holes and share the physical origin', () => {
  const cells = [];
  for (let y = -2; y < 1; y++) for (let x = 4; x < 7; x++) {
    if (x !== 5 || y !== -1) cells.push([`${x},${y}`, [span()]]);
  }
  const a = capture(physical(cells)), level = a.levels[0];
  assert.deepEqual(a.origin, { x: 0, y: 0, height: 0 });
  assert.deepEqual(a.units, { horizontalMetresPerUnit: 1, verticalMetresPerUnit: 1, topologyStride: 2 });
  assert.deepEqual(level.bounds, { minX: 2, minY: -1, maxX: 3.5, maxY: .5 });
  assert.equal(level.surfaces.reduce((n, r) => n + r.w * r.h, 0), 2);
  assert.ok(level.surfaces.length < 8, 'runs are merged, not one mesh per half-metre cell');
  assert.equal(covered(level.surfaces, 2.75, -.25), false, 'the central well stays open');
  assert.ok(level.boundaries.some(edge => edge.x0 === 2.5 && edge.x1 === 2.5));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(level.surfaces[0]));
  assert.throws(() => { level.surfaces[0].w = 100; }, TypeError);
  cells[0][1][0].floor = 20;
  assert.equal(level.height, 0, 'source mutation cannot mutate the captured instrument');
});

test('wall cutaways respect real headroom and ownership seams are not invented walls', () => {
  const a = capture(physical([
    ['0,0', [span(0, { ceil: .25, owner: 'west' })]],
    ['1,0', [span(0, { ceil: .25, owner: 'east' })]],
  ]));
  assert.equal(a.levels.length, 2);
  for (const level of a.levels) for (const edge of level.boundaries) {
    assert.ok(edge.wallHeight >= 0 && edge.wallHeight <= .25);
    assert.equal(edge.x0 === .5 && edge.x1 === .5, false, 'a metadata seam is open air');
  }
  const outside = capture(physical([['0,0', [span(0, { zone: ZONE.street, flags: F.SKY })]]]));
  assert.equal(outside.buildingBounds, null);
  assert.ok(outside.levels[0].boundaries.every(edge => edge.wallHeight === 0));
});

test('vertical spans at one footprint remain distinct and stairs retain intermediate heights', () => {
  const a = capture(physical([['0,0', [span(8.6, { renderGroup: 'tower' }), span(13.2, { renderGroup: 'tower' })]]]), {
    stairPortals: [{ id: 'tower:flight', p0: [0, 0], p1: [8, 0], floor0: 8.6, floor1: 13.2,
      group0: 'tower', group1: 'tower', rises: 4 }],
    stairRuns: [{ id: 'tower:flight', owner: 'tower', width: 3 }],
  });
  assert.deepEqual(a.levels.map(level => level.height), [8.6, 13.2]);
  assert.deepEqual(a.levels.map(level => level.bounds), [a.bounds, a.bounds]);
  assert.equal(a.stairs.length, 1, 'same-page stairs are not discarded');
  assert.deepEqual(a.stairs[0].points.map(point => point.height), [8.6, 9.75, 10.9, 12.05, 13.2]);
  assert.equal(a.stairs[0].points.at(-1).x, 4);
  assert.equal(a.stairs[0].width, 1.5, 'width comes from the authored run, not portal detection radius');
});

test('a spiral uses its authored curved flight, not the coincident portal centres', () => {
  const a = capture(physical([['0,0', [span()]]]), { stairPortals: [{ id: 'well:spiral',
    p0: [10, 10], p1: [10, 10], floor0: 0, floor1: 4.8, group0: 'ground', group1: 'upper', rises: 12,
    arc: { cx: 10, cz: 10, ri: 2, ro: 6, theta0: 0, sweep: Math.PI * 2 },
  }] });
  const stair = a.stairs[0];
  assert.equal(stair.curved, true); assert.equal(stair.points.length, 13);
  assert.notDeepEqual(stair.points[3], stair.points[0]);
  for (const point of stair.points) assert.ok(Math.abs(Math.hypot(point.x - 5, point.y - 5) - 2) < 1e-9);
  assert.equal(stair.points.at(-1).height, 4.8);
});

test('room-area selection assigns only unambiguous real connected components', () => {
  const cells = physical([
    ['0,0', [span()]], ['1,0', [span()]], ['2,0', [span(0, { flags: F.DOOR })]],
    ['3,0', [span()]], ['4,0', [span()]],
  ]);
  const anchors = [{ id: 'space:left', floorId: 'g', height: 0, position: { x: .25, y: .25 } },
    { id: 'space:right', floorId: 'g', height: 0, position: { x: 1.75, y: .25 } }];
  let a = capture(cells, { spaces: anchors });
  assert.deepEqual(new Set(a.levels[0].surfaces.map(r => r.mapSpaceId)), new Set(['space:left', null, 'space:right']));
  a = capture(cells, { spaces: [...anchors, { id: 'space:other-left', floorId: 'g', height: 0, position: { x: .75, y: .25 } }] });
  assert.equal(a.levels[0].surfaces.some(r => r.mapSpaceId === 'space:left'), false);
  assert.equal(a.levels[0].surfaces.some(r => r.mapSpaceId === 'space:other-left'), false,
    'two anchors do not manufacture an invisible room partition');
});

test('shared floor classification respects the physical structure in overlapping high bands', () => {
  for (const height of [6.7, 7.5, 8.44]) {
    assert.equal(floorForHeight(BUILDING_MAP, height, { renderGroup: 'hall' }).id, 'u1');
    assert.equal(floorForHeight(BUILDING_MAP, height, { renderGroup: 'upper' }).id, 'u1');
  }
  assert.equal(floorForHeight(BUILDING_MAP, 7.4, { renderGroup: 'academic' }).id, 'academic');
  assert.equal(floorForHeight(BUILDING_MAP, 10.2, { renderGroup: 'cathedral' }).id, 'tower');
  assert.equal(floorForHeight(BUILDING_MAP, 10, { renderGroup: 'tower' }).id, 'tower');
  assert.equal(floorForHeight(BUILDING_MAP, 10, { renderGroup: 'academic' }).id, 'academic');
  assert.equal(floorForHeight(BUILDING_MAP, 8).id, 'tower', 'unknown identity retains prior height fallback');
  assert.equal(floorForHeight(BUILDING_MAP, 2, { renderGroup: 'upper' }).id, 'g');
});

test('real compiled building preserves every flight, true tower elevations and live policy/pose', () => {
  FP.compile(conservatory.levels, { width: conservatory.width, height: conservatory.height,
    widenCorridors: conservatory.widenCorridors, connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [] });
  const source = captureFloorplanMapSource({ definition: BUILDING_MAP, physical: FP.physicalSpanData(),
    stairPortals: FP.floorplan().stairPortals, stairRuns: FP.floorplan().stairRuns, projectLogical: point => {
      const r = FP.toRuntimePoint(point), p = FP.logicalToPhysical(r.x, r.y);
      return { x: p.x, z: p.z, height: p.y, renderGroup: p.renderGroup };
    } });
  const a = source.architecture;
  assert.equal(a.stairs.length, FP.floorplan().stairPortals.length);
  assert.ok(a.stairs.filter(stair => stair.owner).every(stair => stair.width > 0));
  assert.ok(a.levels.some(level => level.owner === 'tower_ringing_room' && level.height === 8.6));
  assert.ok(a.levels.some(level => level.owner === 'tower_bell_chamber' && level.height === 13.2));
  assert.ok(a.levels.filter(level => level.renderGroup === 'hall').every(level => level.floorId !== 'tower'));
  assert.ok(source.connectors.filter(c => c.sourceId?.startsWith('main-open-well')).every(c =>
    c.a.floorId !== 'tower' && c.b.floorId !== 'tower'));
  assert.ok(a.stats.surfaces < a.stats.spans / 4, 'one-time capture merges the large cell raster');
  const player = { x: 180, y: 110, height: 13.2, renderGroup: 'tower' };
  const model = buildMapModel({ source, player, navigation: { showMapTopology: true }, landmarkState: {
    'landmark:ringing-room': { visible: true }, 'landmark:bell-chamber': { visible: true },
  } });
  assert.equal(model.architecture, a, 'refreshes share immutable geometry, not rebuilt meshes');
  assert.equal(model.player.height, 13.2);
  assert.ok(Math.abs(model.spaces.find(space => space.id === 'landmark:bell-chamber').height - 13.2) < .0001);
  assert.ok(source.connectors.every(c => Number.isFinite(c.a.height) && Number.isFinite(c.b.height)));
  assert.equal(buildMapModel({ source, player, navigation: { showMapTopology: false } }).architecture, null);
  assert.equal(buildMapModel({ source: null }).architecture, null);
  assert.equal(captureMapArchitecture(), null, 'no fallback building is fabricated');
});
