import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CELL } from '../src/data/floorplan/legend.js';
import { outskirtsArrivalLayout, outskirtsPassLayout } from '../src/data/source-outskirts-arrival.js';
import { outskirtsCollisionBoxes, outskirtsPointBlocked } from '../src/game/outskirts-geometry.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const layout = outskirtsArrivalLayout();
const women = layout.filter((piece) => /^bus-woman/.test(piece.key));
const fixture = () => {
  const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  return runtime;
};
const stand = (runtime, x, z) => {
  const position = { x: x / CELL - .5, y: z / CELL - .5 };
  runtime.setPlayerPosition(position);
  return position;
};
const instances = (runtime, position, viewYaw = 0) => runtime.propInstances(position.x, position.y, { viewYaw });
const ticketFollows = (frame, id) => {
  const parent = frame.find((instance) => instance.id === id);
  const ticket = frame.find((instance) => instance.id === `${id}:return-half`);
  assert.ok(parent && ticket, `${id} lost its return half`);
  const matrix = parent.matrix;
  const contact = [.28, .98, -.12];
  const expected = [0, 1, 2].map((axis) => matrix[12 + axis] + contact.reduce((n, v, k) => n + matrix[k * 4 + axis] * v, 0));
  expected.forEach((value, axis) => assert.ok(Math.abs(ticket.matrix[12 + axis] - value) < .0001, `${id} paper left its hand on axis ${axis}`));
  return parent;
};

test('all thirteen current recurrences and the authored duplicate variants retain one woman asset', () => {
  assert.equal(women.length, 13);
  assert.deepEqual([...new Set(women.map((piece) => piece.mesh))], ['outskirts_bus_woman']);
  for (const kind of ['crowd', 'stutter', 'mirrored', 'turned']) {
    const variant = outskirtsPassLayout(5, { break: kind }).filter((piece) => /^bus-woman/.test(piece.id));
    assert.ok(variant.length, `${kind} lost the woman`);
    assert.ok(variant.every((piece) => piece.mesh === 'outskirts_bus_woman'));
  }
});

test('the aboard recurrence stands on the bus floor in the aisle, clear of all seat volumes', () => {
  const woman = women.find((piece) => piece.key === 'bus-woman-aboard');
  const bus = layout.find((piece) => piece.stretch === woman.stretch && piece.key === 'bus');
  const dx = woman.across - bus.across, dz = -(woman.along - bus.along);
  const x = dx * Math.cos(bus.yaw) - dz * Math.sin(bus.yaw);
  const z = dx * Math.sin(bus.yaw) + dz * Math.cos(bus.yaw);
  assert.equal(woman.attachedTo, 'bus');
  assert.equal(woman.y - bus.y, .50);
  assert.equal(outskirtsPointBlocked(outskirtsCollisionBoxes(bus), x, z, .25), false, 'her legs are inside a seat');
});

test('every current recurrence carries returned paper at the rendered right hand, including aboard', () => {
  const runtime = fixture();
  runtime.setOutskirtsWorldState({ ticketReturned: true });
  for (const woman of women) {
    const p = runtime.outskirtsPiece(woman.id);
    const position = stand(runtime, p.x - 1, p.z + 1);
    ticketFollows(instances(runtime, position), woman.id);
  }
  runtime.setOutskirtsWorldState({ ticketReturned: false });
  const p = runtime.outskirtsPiece('r0-bus-woman');
  const position = stand(runtime, p.x - 1, p.z + 1);
  assert.ok(!instances(runtime, position).some((item) => /^r\d+-bus-woman.*:return-half$/.test(item.id)), 'return paper appeared before it was given');
});

test('an unseen watcher turns her front toward the remembered player and carries the ticket with her', () => {
  const runtime = fixture();
  runtime.setOutskirtsWorldState({ ticketReturned: true });
  const p = runtime.outskirtsPiece('r5-bus-woman');
  const eye = { x: p.x - 1.2, z: p.z + .7 };
  const position = stand(runtime, eye.x, eye.z);
  const toward = Math.atan2(p.x - eye.x, -(p.z - eye.z));
  const first = ticketFollows(instances(runtime, position, toward), p.id);
  const turned = ticketFollows(instances(runtime, position, toward + Math.PI), p.id);
  assert.notDeepEqual([...turned.matrix], [...first.matrix], 'the watcher did not turn');
  const direction = [eye.x - p.x, eye.z - p.z], distance = Math.hypot(...direction);
  const facingDot = (-turned.matrix[8] * direction[0] - turned.matrix[10] * direction[1]) / distance;
  assert.ok(facingDot > .999, 'her back faces the player');
});

test('the bus-gap acknowledgement faces the player and keeps paper attached through its retained step', () => {
  const runtime = fixture();
  runtime.setOutskirtsWorldState({ ticketReturned: true });
  const p = runtime.outskirtsPiece('r7-bus-woman');
  for (const [dx, dz, minimumStage] of [[1.33, 1, 2], [1.33, -3, 3]]) {
    const eye = { x: p.x + dx, z: p.z + dz };
    const position = stand(runtime, eye.x, eye.z);
    const viewYaw = Math.atan2(p.x - eye.x, -(p.z - eye.z));
    assert.ok(runtime.outskirtsStreetFrame({ viewYaw }).encounter.stage >= minimumStage);
    const parent = ticketFollows(instances(runtime, position, viewYaw), p.id);
    const direction = [eye.x - parent.matrix[12], eye.z - parent.matrix[14]], distance = Math.hypot(...direction);
    const facingDot = (-parent.matrix[8] * direction[0] - parent.matrix[10] * direction[1]) / distance;
    assert.ok(facingDot > .999, 'the close acknowledgement shows her back');
    if (minimumStage >= 3) assert.ok(Math.abs(parent.matrix[14] - (p.z - .18)) < .0001);
  }
});

test('the crowd inspection uses its physical woman anchor for the ticket action', () => {
  // Run the production handler with an authored crowd pass. Crowd is a
  // supported break variant, though absent from today's deterministic route.
  const source = readFileSync(new URL('../src/game/source-space-runtime.js', import.meta.url), 'utf8');
  const begin = source.indexOf('  function outskirtsPerformAction(');
  const end = source.indexOf('\n  function outskirtsStreetFrame(', begin);
  const called = [];
  const sandbox = {
    inOutskirtsView: () => true,
    outskirtsPassAt: () => 5,
    outskirtPieces: () => [{ stretch: 5, key: 'bus-woman-crowd-1', inspect: 'woman', x: 5.2, z: -12.4 }],
    streetAnchor: (piece) => piece,
    outskirtsEye: () => ({ x: 5.0, z: -12.2 }),
    outskirtsSightClear: () => true,
    streetExperience: { action: (...args) => { called.push(args); return true; } },
    streetActionAt: new Map(), edgeDoorClock: () => 12,
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(begin, end), sandbox);
  assert.equal(sandbox.outskirtsPerformAction({ action: 'ticket', pass: 5 }).handled, true);
  assert.equal(called[0][0], 'r5:ticket');
  assert.equal(called[0][2].key, 'bus-woman-crowd-1');
});

test('inspection copy remains spatially true aboard and at the shelter without changing her identity', () => {
  const story = JSON.parse(readFileSync(new URL('../content/narrative/source-space.outskirts.story.json', import.meta.url), 'utf8'));
  const nodes = story.nodes;
  assert.doesNotMatch(JSON.stringify([nodes.woman, nodes['woman-after']]), /at the shelter/);
  assert.match(nodes.woman.lines[0].text, /coat buttoned wrong/);
  assert.match(nodes['woman-given'].lines[0].text, /right pocket/);
  assert.match(story.notes, /The woman is nobody/);
});
