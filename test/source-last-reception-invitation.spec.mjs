import assert from 'node:assert/strict';
import test from 'node:test';
import { SOURCE_LAST_RECEPTION as ROOM, sourceReceptionCollisionAt, sourceLastReceptionSegmentClear } from '../src/data/source-last-reception.js';
import {
  createLastReceptionState, serializeLastReceptionState, getLastReceptionConversation,
  finishLastReceptionConversation, cancelLastReceptionConversation, updateLastReception,
} from '../src/game/source-last-reception.js';

const at = (id) => ({ ...ROOM.anchors[id] });
const story = ['host-admission', 'guest-a-evening', 'guest-b-curtain', 'window-seam', 'warning-service', 'gallery-no-ending', 'warning-truth', 'window-truth', 'host-truth'];
function ready(phase = 'released') {
  return createLastReceptionState({ phase, imprint: phase === 'released', seen: story, entered: true });
}
function finish(state, resident, choice) {
  const line = getLastReceptionConversation(state, resident);
  return { line, result: finishLastReceptionConversation(state, line.id, choice) };
}
function tick(state, seconds, options = {}) {
  const events = [];
  for (let left = seconds; left > .00001; left -= .05) events.push(...updateLastReception(state,
    { dt: Math.min(.05, left), player: at('lounge'), ...options }).events);
  return events;
}
function roundtrip(state) { return createLastReceptionState(JSON.parse(JSON.stringify(serializeLastReceptionState(state)))); }

test('invitation is an optional resolved-room undertaking; original story remains first', () => {
  for (const phase of ['exploring', 'reveal-pending', 'grace', 'converging', 'captured']) {
    const state = createLastReceptionState({ phase, seen: story });
    const line = getLastReceptionConversation(state, 'warning');
    assert.notEqual(line?.id, 'warning-window-invitation', phase);
  }
  for (const phase of ['released', 'escaped']) {
    const state = createLastReceptionState({ phase });
    assert.equal(getLastReceptionConversation(state, 'warning').id, 'warning-service');
    finishLastReceptionConversation(state, 'warning-service');
    assert.equal(getLastReceptionConversation(state, 'warning').id, 'warning-window-invitation');
    finishLastReceptionConversation(state, 'window-seam');
    assert.equal(getLastReceptionConversation(state, 'warning').id, 'warning-truth');
    finishLastReceptionConversation(state, 'warning-truth');
    assert.equal(state.phase, phase, 'reading original truth after resolution never re-arms the crowd');
    assert.equal(getLastReceptionConversation(state, 'warning').id, 'warning-window-invitation');
  }
});

test('offer and delivery require terminal choice completion; reads, cancellation and unknown choices do nothing', () => {
  const state = ready();
  const offer = getLastReceptionConversation(state, 'warning');
  const before = JSON.stringify(state);
  assert.deepEqual(offer.choices.map(choice => choice.id), ['accept', 'decline']);
  getLastReceptionConversation(state, 'warning');
  cancelLastReceptionConversation(state, offer.id);
  finishLastReceptionConversation(state, offer.id);
  finishLastReceptionConversation(state, offer.id, 'invented');
  finishLastReceptionConversation(state, 'window-window-invitation', 'deliver');
  assert.equal(JSON.stringify(state), before);
  assert.equal(finish(state, 'warning', 'accept').result.changed, true);
  assert.equal(state.windowInvitation.status, 'carrying');
  const delivery = getLastReceptionConversation(state, 'window');
  const carrying = JSON.stringify(state);
  cancelLastReceptionConversation(state, delivery.id);
  finishLastReceptionConversation(state, delivery.id);
  assert.equal(JSON.stringify(state), carrying);
  finishLastReceptionConversation(state, delivery.id, 'leave-unsaid');
  assert.equal(state.windowInvitation.status, 'carrying');
  finishLastReceptionConversation(state, delivery.id, 'deliver');
  assert.equal(state.windowInvitation.status, 'delivered');
  assert.equal(state.windowInvitation.settling, true);
  assert.equal(finishLastReceptionConversation(state, delivery.id, 'deliver').changed, false, 'stale completed branch cannot deliver twice');
});

test('decline and explicit abandonment can be reconsidered; leaving quietly preserves the promise', () => {
  let state = ready('escaped');
  finish(state, 'warning', 'decline');
  assert.equal(state.windowInvitation.status, 'declined');
  assert.equal(state.windowInvitation.declinedReason, 'declined');
  state = roundtrip(state);
  finish(state, 'warning', 'accept');
  const initial = { ...state.windowInvitation };
  tick(state, 2, { player: at('serviceOutside') });
  assert.deepEqual(state.windowInvitation, initial, 'departure is not an invented failure or completion');
  state = roundtrip(state);
  assert.equal(getLastReceptionConversation(state, 'window').id, 'window-window-invitation');
  finish(state, 'warning', 'continue');
  assert.equal(state.windowInvitation.status, 'carrying');
  finish(state, 'warning', 'abandon');
  assert.equal(state.windowInvitation.status, 'declined');
  assert.equal(state.windowInvitation.declinedReason, 'abandoned');
  assert.equal(getLastReceptionConversation(state, 'warning').id, 'warning-window-invitation');
  finish(state, 'warning', 'accept');
  finish(state, 'window', 'deliver');
  const done = { ...state.windowInvitation };
  finishLastReceptionConversation(state, 'warning-window-reminder', 'abandon');
  assert.deepEqual(state.windowInvitation, done, 'old reminder cannot undo a delivered message');
});

test('delivered invitation changes this resident through a physical clear route and leaves a persistent acknowledgment', () => {
  for (const phase of ['released', 'escaped']) {
    let state = ready(phase);
    finish(state, 'warning', 'accept');
    finish(state, 'window', 'deliver');
    let previous = { ...state.actors.find(actor => actor.id === 'window') };
    const first = { ...previous };
    for (let n = 0; n < 600 && state.windowInvitation.settling; n++) {
      updateLastReception(state, { dt: .05, player: at('windowNorth') });
      const actor = state.actors.find(actor => actor.id === 'window');
      assert.ok(Math.hypot(actor.x - previous.x, actor.y - previous.y, actor.z - previous.z) <= 1.65 * .05 + .00001, 'ordinary resident speed, no jump');
      assert.equal(sourceReceptionCollisionAt(actor.x, actor.z, { feet: actor.y, radius: .23 }), null);
      assert.equal(sourceLastReceptionSegmentClear(previous, actor, .23), true);
      previous = { ...actor };
      if (n === 30) state = roundtrip(state);
    }
    assert.equal(state.windowInvitation.settled, true);
    assert.equal(state.windowInvitation.settling, false);
    const window = state.actors.find(actor => actor.id === 'window');
    assert.ok(Math.hypot(window.x - first.x, window.z - first.z) > 8);
    assert.ok(Math.hypot(window.x - ROOM.anchors[state.windowInvitation.destination].x, window.z - ROOM.anchors[state.windowInvitation.destination].z) < .2);
    assert.equal(window.speed, 0);
    const guest = state.actors.find(actor => actor.id === 'guest-a');
    assert.ok(Math.abs(window.yaw - Math.atan2(guest.x - window.x, guest.z - window.z)) < .001);
    const acknowledgment = getLastReceptionConversation(state, 'warning');
    assert.equal(acknowledgment.id, 'warning-window-thanks');
    cancelLastReceptionConversation(state, acknowledgment.id);
    assert.equal(state.windowInvitation.acknowledged, false);
    finishLastReceptionConversation(state, acknowledgment.id);
    state = roundtrip(state);
    assert.equal(state.windowInvitation.acknowledged, true);
    assert.notEqual(getLastReceptionConversation(state, 'warning').id, acknowledgment.id);
    assert.equal(state.phase, phase);
    assert.equal(state.imprint, phase === 'released');
    assert.equal(state.outcome, phase === 'released' ? 'captured' : 'escaped');
    assert.equal(state.actors.length, 6);
  }
});

test('errand movement and state freeze with modal, focus, inactivity, pause or absence', () => {
  for (const block of [{ paused: true }, { dialogueOpen: true }, { focused: false }, { active: false }]) {
    const state = ready();
    finish(state, 'warning', 'accept'); finish(state, 'window', 'deliver');
    const before = JSON.stringify(state);
    assert.deepEqual(tick(state, 4, block), []);
    assert.equal(JSON.stringify(state), before);
  }
  const absent = ready(); finish(absent, 'warning', 'accept'); finish(absent, 'window', 'deliver');
  const actor = { ...absent.actors.find(entry => entry.id === 'window') };
  tick(absent, 4, { player: at('mainOutside') });
  assert.deepEqual(absent.actors.find(entry => entry.id === 'window'), actor, 'the visible change waits for the returning player');
  assert.equal(absent.windowInvitation.settling, true);
});

test('all invitation states normalize and roundtrip without touching gameplay costs or knowledge', () => {
  const state = ready();
  const knowledge = { ...state.knowledge };
  const seen = [...state.seen];
  for (const action of ['decline', 'accept']) {
    finish(state, 'warning', action);
    assert.deepEqual(roundtrip(state).windowInvitation, state.windowInvitation);
  }
  finish(state, 'window', 'deliver');
  tick(state, 1);
  assert.deepEqual(roundtrip(state).windowInvitation, state.windowInvitation);
  assert.deepEqual(state.knowledge, knowledge);
  assert.deepEqual(state.seen, seen);
  for (const field of ['inventory', 'equipment', 'ending', 'composure', 'battery', 'injury']) assert.equal(Object.hasOwn(state, field), false);
  const invalid = createLastReceptionState({ windowInvitation: { status: 'rescued', settled: true, acknowledged: true } });
  assert.equal(invalid.windowInvitation.status, 'unoffered');
  assert.equal(invalid.windowInvitation.settled, false);
  assert.equal(invalid.windowInvitation.acknowledged, false);
});

test('company destination follows actual post-ambush occupation, not the deserted original chairs', () => {
  const state = ready();
  for (const actor of state.actors) Object.assign(actor, at('release'));
  finish(state, 'warning', 'accept'); finish(state, 'window', 'deliver');
  assert.equal(state.windowInvitation.destination, 'serviceLink');
  tick(state, 8, { player: at('release') });
  const window = state.actors.find(actor => actor.id === 'window');
  assert.equal(state.windowInvitation.settled, true);
  assert.ok(Math.hypot(window.x - ROOM.anchors.release.x, window.z - ROOM.anchors.release.z) < 3.8);
  assert.equal(state.imprint, true);
  assert.equal(state.phase, 'released');
});

test('a window resident who reached the retaining seam can turn back without retaining its flattened pose', () => {
  const state = createLastReceptionState({ phase: 'escaped', seen: story, entered: true,
    exit: 'mainDoor', boundaryActor: 'window', phaseElapsed: 8 });
  const window = state.actors.find(actor => actor.id === 'window');
  Object.assign(window, { ...ROOM.anchors.mainInside, x: -47.3, boundarySeconds: 1 });
  finish(state, 'warning', 'accept'); finish(state, 'window', 'deliver');
  tick(state, 2, { player: at('mainOutside') });
  assert.ok(window.boundarySeconds > 0);
  tick(state, .1, { player: at('mainInside') });
  assert.equal(window.boundarySeconds, 0);
  tick(state, 25);
  assert.equal(state.windowInvitation.settled, true);
  assert.equal(window.boundarySeconds, 0);
});
