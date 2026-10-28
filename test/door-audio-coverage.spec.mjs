import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_DOORS } from '../src/data/conservatory-doors.js';
import { CELL } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import { pointInDoorSweep } from '../src/game/door-runtime.js';
import { createDoorAudioEventPolicy } from '../src/audio/door-events.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const portals = () => { const result = []; FP.forEachDoor(portal => result.push(portal)); return result; };
FP.compile(conservatory.levels, {
  width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
  connectors: conservatory.connectors, edgePortals: conservatory.edgePortals, doors: conservatory.doors,
});
function resetFloorplan() {
  // Only these portals are exercised. Resetting the complete schedule would
  // rebuild every physical span twice per test without testing more behavior.
  for (const portal of portals()) {
    if (!['pub-west-entry', 'pub-east-entry', 'changing-pool'].includes(portal.id)) continue;
    if (portal.runtime.state !== 'closed') FP.setDoorOpen(portal.id, false);
    portal.autoCloseSide = 0;
    portal.runtime.wedge = false;
    portal.runtime.closerArmed = false;
  }
  const policy = createDoorAudioEventPolicy();
  policy.prime(portals());
  return policy;
}
function interact(portal) {
  const alongX = portal.widthAxis === 'x';
  const x = portal.cx - (alongX ? 0 : 3), y = portal.cy - (alongX ? 3 : 0);
  const hit = FP.interactDoor(x, y, alongX ? [0, 1] : [1, 0], new Set(['master', 'chapel']));
  assert.equal(hit?.id, portal.id, 'the full real leaf resolves to its authored portal');
  assert.equal(hit.ok, true);
  return hit;
}
function tick(policy, dt, position = { x: Infinity, y: Infinity }) {
  FP.tickDoors(dt, { playerX: position.x, playerY: position.y });
  return policy.observe(portals(), dt);
}

test('both compiled Lyric entrances sound once per real paired opening and rearm only after full closure', () => {
  for (const id of ['pub-west-entry', 'pub-east-entry']) {
    const policy = resetFloorplan(), portal = portals().find(value => value.id === id);
    assert.equal(portal.definition.leafCount, 2, 'this is the production paired doorway, not a single-leaf fixture');
    assert.deepEqual(policy.observe(portals(), .01), [], 'loading a stable endpoint is silent');
    assert.equal(interact(portal).opened, true);
    const start = policy.observe(portals(), 0);
    assert.equal(start.filter(event => event.semanticKind === 'door_open').length, 1);
    const opening = [];
    for (let index = 0; index < 30; index++) opening.push(...tick(policy, .05));
    assert.equal(opening.filter(event => event.type === 'bell' && event.doorId === id).length, 1,
      'two moving leaves are one entrance activation');
    assert.equal(portal.runtime.state, 'open');
    const held = [];
    for (let index = 0; index < 100; index++) held.push(...tick(policy, .1));
    assert.equal(held.filter(event => event.type === 'bell').length, 0, 'an open pub entrance is not a bell timer');
    assert.equal(interact(portal).closed, true);
    assert.equal(policy.observe(portals(), 0).some(event => event.semanticKind === 'door_close'), false,
      'pressing close is not frame contact');
    const close = tick(policy, 2);
    assert.equal(close.filter(event => event.type === 'closed' && event.doorId === id).length, 1);
    assert.equal(close.filter(event => event.semanticKind === 'door_close').length, 1);
    assert.equal(interact(portal).opened, true);
    policy.observe(portals(), 0);
    assert.equal(tick(policy, .3).filter(event => event.type === 'bell' && event.doorId === id).length, 1);
  }
});

test('a physically occupied production closer cannot emit contact before its leaves can close', () => {
  const policy = resetFloorplan(), portal = portals().find(value => value.id === 'changing-pool');
  assert.equal(interact(portal).opened, true);
  policy.observe(portals(), 0);
  tick(policy, 2);
  assert.equal(interact(portal).closed, true);
  policy.observe(portals(), 0);
  let occupied = null;
  for (let x = portal.cx - 3; x <= portal.cx + 3 && !occupied; x += .25) {
    for (let y = portal.cy - 3; y <= portal.cy + 3; y += .25) {
      if (pointInDoorSweep(portal, x, y)) { occupied = { x, y }; break; }
    }
  }
  assert.ok(occupied, 'fixture occupies the actual paired leaf sweep');
  const before = portal.runtime.openFraction, blocked = tick(policy, 3, occupied);
  assert.equal(portal.runtime.openFraction, before, 'the production collision sweep really stopped the closer');
  assert.equal(blocked.some(event => event.type === 'closed' || event.semanticKind === 'door_close'), false);
  const freed = tick(policy, 3);
  assert.equal(portal.runtime.state, 'closed');
  assert.equal(freed.filter(event => event.semanticKind === 'door_close').length, 1);
  assert.equal(tick(policy, 3).some(event => event.type === 'closed'), false, 'no repeated contact from a stable endpoint');
});

test('restoring the compiled door save seeds every real portal without replaying an opening or bell', () => {
  const policy = resetFloorplan();
  assert.equal(portals().length, CONSERVATORY_DOORS.length);
  FP.setDoorOpen('pub-west-entry', true);
  FP.setDoorOpen('pub-east-entry', true);
  const saved = FP.saveDoorState();
  FP.loadDoorState(saved);
  policy.reset(); policy.prime(portals());
  assert.deepEqual(policy.observe(portals(), .1), []);
  assert.equal(tick(policy, 2).some(event => event.type === 'bell'), false);
});

function mainFunction(name) {
  const start = main.indexOf(`function ${name}(`), next = main.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && next > start, `production ${name} function exists`);
  return main.slice(start, next);
}
function productionPump() {
  const semantics = [], presentation = [], commits = [];
  const policy = createDoorAudioEventPolicy(), causes = new Map();
  const context = vm.createContext({
    FP, CELL, architectureDoorEvents: policy, architectureDoorCauses: causes,
    architectureDoorAudio: { event: (event, anchor) => presentation.push({ event, anchor }) },
    emitDoorArchitecture: (portal, kind, options) => semantics.push({ portal, kind, playerGenerated: options.playerGenerated }),
    usingPlan: () => true, usingSpecialSpace: () => false, px: Infinity, py: Infinity,
    saveCommit: value => commits.push(value), facilityMapCache: null, syncDoorDynamicProps() {},
  });
  vm.runInContext(['doorsForAudio', 'doorAudioAnchor', 'pumpDoorAudioEvents', 'tickDoorRuntime'].map(mainFunction).join('\n'), context);
  context.pumpDoorAudioEvents(0);
  return { context, causes, semantics, presentation, commits };
}

test('the production frame pump connects actual leaf contact to one attributed gameplay event', () => {
  resetFloorplan();
  const h = productionPump(), portal = portals().find(value => value.id === 'pub-west-entry');
  assert.equal(interact(portal).opened, true);
  h.causes.set(portal.id, true); h.context.pumpDoorAudioEvents(0);
  h.context.tickDoorRuntime(.3);
  h.context.tickDoorRuntime(2);
  assert.deepEqual(h.semantics.map(event => [event.kind, event.playerGenerated]), [['door_open', true]]);
  assert.equal(h.presentation.filter(item => item.event.type === 'bell').length, 1);
  assert.ok(h.presentation.every(item => [item.anchor.x, item.anchor.y, item.anchor.z].every(Number.isFinite)),
    'the actual logical-to-physical adapter supplies valid world anchors');
  assert.equal(interact(portal).closed, true);
  h.causes.set(portal.id, true); h.context.pumpDoorAudioEvents(0);
  assert.equal(h.semantics.length, 1, 'manual close request does not advertise an impact');
  h.context.tickDoorRuntime(2);
  assert.deepEqual(h.semantics.map(event => [event.kind, event.playerGenerated]), [['door_open', true], ['door_close', true]]);
  assert.equal(h.causes.has(portal.id), false, 'the completed action releases its attribution');
  h.context.tickDoorRuntime(2);
  assert.equal(h.semantics.length, 2, 'neither a bell nor the stable endpoint duplicates HUSH noise');
  assert.equal(h.commits.length, 2, 'only the two real stable endpoints commit door state');
});
