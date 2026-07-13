// Deterministic fixtures for ?maplab=1 and pure tests.

import { buildMapModel } from './map-model.js';

const openRect = (x0, y0, x1, y1) => {
  const out = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.add(`${x},${y}`);
  return out;
};

const runsForRect = (x0, y0, x1, y1) => {
  const runs = [];
  for (let y = y0; y <= y1; y++) runs.push({ y, x0, x1 });
  return runs;
};

export function fixtureMapSource() {
  const b1 = openRect(0, 0, 44, 26);
  const g = openRect(0, 0, 44, 26);
  const u1 = openRect(0, 0, 44, 26);
  return {
    version: 1,
    topologyStride: 1,
    definition: { version: 1, floors: [
      { id:'b1',order:-1,label:'BASEMENT',shortLabel:'B1',minHeight:-Infinity,maxHeight:-2.75 },
      { id:'g',order:0,label:'GROUND',shortLabel:'G',minHeight:-2.75,maxHeight:3.25 },
      { id:'u1',order:1,label:'UPPER',shortLabel:'U1',minHeight:3.25,maxHeight:Infinity },
    ] },
    floors: [
      { id: 'b1', order: -1, label: 'BASEMENT', shortLabel: 'B1', bounds: { minX: 0, minY: 0, maxX: 44, maxY: 26 }, open: b1, runs: runsForRect(0, 0, 44, 26) },
      { id: 'g', order: 0, label: 'GROUND', shortLabel: 'G', bounds: { minX: 0, minY: 0, maxX: 44, maxY: 26 }, open: g, runs: runsForRect(0, 0, 44, 26) },
      { id: 'u1', order: 1, label: 'UPPER', shortLabel: 'U1', bounds: { minX: 0, minY: 0, maxX: 44, maxY: 26 }, open: u1, runs: runsForRect(0, 0, 44, 26) },
    ],
    targets: [
      { id: 'target:main_b3', roomId: 'main_b3', sequence: 1, label: 'STUDIO B3', shortLabel: 'B3', floorId: 'b1', position: { x: 10, y: 10 }, selectable: true, waypointable: true },
      { id: 'target:the_tub', roomId: 'the_tub', sequence: 2, label: 'THE NATATORIUM', shortLabel: 'NAT', floorId: 'g', position: { x: 12, y: 15 }, selectable: true, waypointable: true },
      { id: 'target:amplifications', roomId: 'amplifications', sequence: 3, label: 'THE CONCERT HALL', shortLabel: 'HALL', floorId: 'g', position: { x: 34, y: 9 }, selectable: true, waypointable: true },
      { id: 'target:soundnoisemusic', roomId: 'soundnoisemusic', sequence: 4, label: 'THE PRACTICE WING', shortLabel: 'WING', floorId: 'u1', position: { x: 13, y: 18 }, selectable: true, waypointable: true },
      { id: 'target:lux_nova', roomId: 'lux_nova', sequence: 5, label: 'THE CHAPEL', shortLabel: 'CHAP', floorId: 'u1', position: { x: 35, y: 16 }, selectable: true, waypointable: true },
    ],
    connectors: [
      { id: 'connector:b1-g', kind: 'stairs', a: { floorId: 'b1', position: { x: 39, y: 22 } }, b: { floorId: 'g', position: { x: 5, y: 22 } } },
      { id: 'connector:g-u1', kind: 'stairs', a: { floorId: 'g', position: { x: 39, y: 4 } }, b: { floorId: 'u1', position: { x: 5, y: 4 } } },
    ],
  };
}

export const MAP_LAB_CASES = Object.freeze([
  { id: 'fresh-contract', policy: 'directional', player: { floorId: 'b1', roomId: 'main_b3', position: { x: 7, y: 11 } }, target: null, done: 0 },
  { id: 'same-floor-waypoint', policy: 'directional', player: { floorId: 'b1', roomId: 'main_b3', position: { x: 22, y: 11 } }, target: 'main_b3', done: 1 },
  { id: 'cross-floor-waypoint', policy: 'directional', player: { floorId: 'b1', roomId: null, position: { x: 7, y: 20 } }, target: 'lux_nova', done: 2 },
  { id: 'story-route', policy: 'full', player: { floorId: 'g', roomId: 'the_tub', position: { x: 7, y: 15 } }, target: 'amplifications', done: 2 },
  { id: 'dead-air-contact', policy: 'minimal', player: { floorId: 'b1', roomId: 'main_b3', position: { x: 7, y: 11 } }, target: 'main_b3', done: 1, contact: 'locked' },
  { id: 'unresolved-return', policy: 'directional', player: { floorId: 'g', roomId: 'the_tub', position: { x: 20, y: 15 } }, target: null, done: 0, contact: 'unresolved' },
  { id: 'complete', policy: 'directional', player: { floorId: 'u1', roomId: 'lux_nova', position: { x: 33, y: 16 } }, target: null, done: 5 },
]);

function policy(id) {
  if (id === 'full') return { id, showMapTopology: true, showExactPlayer: true, showAllTargetLabels: true, showWaypoint: true, showCrossFloorConnector: true, showRoute: true, minimapMode: 'topology' };
  if (id === 'minimal') return { id, showMapTopology: false, showExactPlayer: true, showAllTargetLabels: false, showWaypoint: true, showCrossFloorConnector: false, showRoute: false, minimapMode: 'compass' };
  return { id: 'directional', showMapTopology: true, showExactPlayer: true, showAllTargetLabels: false, showWaypoint: true, showCrossFloorConnector: true, showRoute: false, minimapMode: 'topology' };
}

export function mapLabJob(testCase) {
  const labels = ['STUDIO B3', 'THE NATATORIUM', 'THE CONCERT HALL', 'THE PRACTICE WING', 'THE CHAPEL'];
  const ids = ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'];
  return {
    done: testCase.done || 0,
    total: 5,
    unfiled: [],
    rooms: ids.map((roomId, index) => ({
      roomId, label: labels[index], recorded: index < (testCase.done || 0), marked: testCase.target === roomId,
      stamp: index < (testCase.done || 0) ? `22:${String(40 + index).padStart(2, '0')}` : '',
      notes: index === 0 ? [{ id: 'work-order', title: 'WORK ORDER 4417-C', preview: 'Five room tones. Sixty seconds each. Unbroken.' }] : [],
    })),
  };
}

export function mapLabModel(testCase, source = fixtureMapSource()) {
  const contact = testCase.contact ? {
    id: 'contact:hush', kind: 'acoustic-anomaly', label: 'SOURCE / NO RECORD', state: testCase.contact,
    observation: testCase.contact === 'unresolved'
      ? { observedAt: 900, expiresAt: 3000, floorId: 'g', roomId: null, position: null, precision: 'region', confidence: .48, region: [{ x: 25, y: 8 }, { x: 31, y: 10 }, { x: 28, y: 15 }] }
      : { observedAt: 900, expiresAt: 3000, floorId: 'b1', roomId: 'main_b3', position: { x: 33, y: 11 }, precision: 'point', confidence: .94 },
    presentation: { disturbance: .72 },
  } : null;
  return buildMapModel({
    source,
    job: mapLabJob(testCase),
    objectiveState: { target: testCase.target },
    player: { resolved: true, x: testCase.player.position.x, y: testCase.player.position.y, height: testCase.player.floorId === 'b1' ? -4 : testCase.player.floorId === 'u1' ? 5 : 0, roomId: testCase.player.roomId, heading: Math.PI / 2 },
    doors: [], contacts: contact ? [contact] : [], navigation: policy(testCase.policy),
  });
}
