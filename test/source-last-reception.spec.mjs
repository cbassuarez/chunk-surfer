import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOURCE_LAST_RECEPTION as ROOM, sourceLastReceptionSegmentClear, sourceReceptionCollisionAt } from '../src/data/source-last-reception.js';
import {
  LAST_RECEPTION_GRACE_SECONDS, LAST_RECEPTION_CAPTURE_SECONDS, LAST_RECEPTION_HOLD_SECONDS,
  LAST_RECEPTION_RESIDENTS, createLastReceptionState, serializeLastReceptionState,
  getLastReceptionConversation, finishLastReceptionConversation, cancelLastReceptionConversation,
  updateLastReception, getLastReceptionPresentation, lastReceptionPath,
} from '../src/game/source-last-reception.js';

const at = (id) => ({ ...ROOM.anchors[id] });
function tick(state, seconds, options = {}) {
  const events = [];
  for (let remaining = seconds; remaining > .0001; remaining -= .05) {
    events.push(...updateLastReception(state, { dt: Math.min(.05, remaining), player: at('release'), ...options }).events);
  }
  return events;
}
function reveal(state, path = 'warning') {
  finishLastReceptionConversation(state, 'window-seam');
  if (path === 'warning') finishLastReceptionConversation(state, 'warning-service');
  const conversation = getLastReceptionConversation(state, path);
  assert.equal(conversation.reveals, true);
  finishLastReceptionConversation(state, conversation.id);
}

test('the entire room remains unhurried and freely escapable before a spoken revelation', () => {
  const state = createLastReceptionState();
  const initial = JSON.stringify(state.actors);
  const events = tick(state, 90);
  assert.equal(state.phase, 'exploring');
  assert.equal(state.hold, 0);
  assert.equal(JSON.stringify(state.actors), initial);
  assert.deepEqual(events, []);
  updateLastReception(state, { dt: .1, player: at('serviceOutside') });
  updateLastReception(state, { dt: .1, player: at('mainOutside') });
  assert.equal(state.phase, 'exploring');
  assert.equal(getLastReceptionPresentation(state).locksMovement, false);
});

test('revelation follows an understood fact through several conversation paths, not a cast quota', () => {
  for (const residentId of ['warning', 'window', 'host']) {
    const state = createLastReceptionState();
    if (residentId === 'host') finishLastReceptionConversation(state, 'host-admission');
    reveal(state, residentId);
    assert.equal(state.phase, 'reveal-pending');
    assert.ok(state.seen.length <= 3, 'every resident is never required');
  }
  const state = createLastReceptionState();
  for (const id of ['host-admission', 'guest-a-evening', 'guest-b-curtain', 'warning-service']) finishLastReceptionConversation(state, id);
  assert.equal(state.phase, 'exploring', 'ordinary talk quantity cannot launch the ambush');
});

test('cancelled and open dialogue cannot start the public cue or consume grace', () => {
  const state = createLastReceptionState();
  finishLastReceptionConversation(state, 'window-seam');
  const line = getLastReceptionConversation(state, 'window');
  cancelLastReceptionConversation(state, line.id);
  assert.equal(state.phase, 'exploring');
  finishLastReceptionConversation(state, line.id);
  tick(state, 10, { dialogueOpen: true });
  assert.equal(state.phase, 'reveal-pending');
  assert.equal(state.graceUsed, false);
  const events = updateLastReception(state, { dt: 0, player: at('release'), dialogueOpen: false }).events;
  assert.deepEqual(events.map((event) => event.type), ['public-cue']);
  assert.equal(state.phase, 'grace');
  assert.equal(state.phaseElapsed, 0);
  tick(state, LAST_RECEPTION_GRACE_SECONDS - .1);
  assert.equal(state.phase, 'grace');
  tick(state, .2);
  assert.equal(state.phase, 'converging');
});

test('pause, focus loss, inactive scene and reading stop all local danger and audio clocks', () => {
  for (const blocked of [{ paused: true }, { focused: false }, { active: false }, { dialogueOpen: true }]) {
    const state = createLastReceptionState({ phase: 'converging', phaseElapsed: 4, hold: .7, pleaClock: .1 });
    const before = JSON.stringify(state);
    const events = tick(state, 8, blocked);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(events, []);
  }
});

test('save restoration retains used grace, actor occupation, gait and local hold', () => {
  const state = createLastReceptionState(); reveal(state);
  tick(state, 1.7);
  const restored = createLastReceptionState(JSON.parse(JSON.stringify(serializeLastReceptionState(state))));
  assert.equal(restored.graceUsed, true);
  assert.ok(Math.abs(restored.phaseElapsed - 1.7) < .001);
  tick(restored, .8);
  assert.equal(restored.phase, 'converging');
  tick(restored, 2);
  const saved = serializeLastReceptionState(restored);
  const after = createLastReceptionState(saved);
  assert.deepEqual(after.actors, saved.actors);
  assert.equal(after.phaseElapsed, saved.phaseElapsed);
  assert.equal(after.pleaClock, saved.pleaClock);
  assert.equal(after.graceUsed, true);
  assert.equal(updateLastReception(after, { dt: 0, player: at('release') }).events.some((event) => event.type === 'public-cue'), false);
});

test('all authored resident homes are physically clear and navigation bends around shared solids', () => {
  for (const resident of LAST_RECEPTION_RESIDENTS) {
    assert.equal(sourceReceptionCollisionAt(resident.x, resident.z, { feet: resident.y, radius: .23 }), null, resident.id);
    const path = lastReceptionPath(resident, at('serviceDoor'));
    assert.ok(path.length, `${resident.id} has a service route`);
    for (let i = 0, from = resident; i < path.length; from = path[i++]) {
      assert.equal(sourceLastReceptionSegmentClear(from, path[i], .23), true, `${resident.id} route segment ${i}`);
    }
  }
  assert.equal(sourceLastReceptionSegmentClear(at('gallery'), at('window'), .23), false, 'no straight floating gallery shortcut');
});

test('the upstairs resident actually walks down the supported stair without teleporting or oscillating', () => {
  const state = createLastReceptionState({ phase: 'converging' });
  for (const actor of state.actors) if (actor.id !== 'gallery') Object.assign(actor, at('serviceRoom'));
  let last = { ...state.actors.find((actor) => actor.id === 'gallery') };
  let intermediate = false;
  for (let i = 0; i < 220 && state.phase === 'converging'; i++) {
    updateLastReception(state, { dt: .05, player: at('window') });
    const actor = state.actors.find((entry) => entry.id === 'gallery');
    assert.ok(Math.hypot(actor.x - last.x, actor.y - last.y, actor.z - last.z) <= 1.75 * .05 + .001);
    if (actor.y > 9.1 && actor.y < 11.7) {
      intermediate = true;
      assert.ok(actor.x > -76.81 && actor.x < -74.19, 'intermediate height remains on stair width');
    }
    last = { ...actor };
  }
  assert.equal(intermediate, true);
  assert.ok(last.y < 9.1, 'gallery guest reaches the lower room');
});

test('a sustained hold captures locally, a directional escape breaks it, and no global punishment is owned', () => {
  const player = at('release');
  const caught = createLastReceptionState({ phase: 'converging', phaseElapsed: 4 });
  for (const actor of caught.actors) Object.assign(actor, player);
  const events = tick(caught, LAST_RECEPTION_HOLD_SECONDS + .1, { player });
  assert.equal(caught.phase, 'captured');
  assert.equal(caught.imprint, true);
  assert.equal(events.filter((event) => event.type === 'captured').length, 1);
  assert.deepEqual(events.find((event) => event.type === 'captured').position, { x: -64, y: 9, z: -460, yaw: Math.PI / 2 });
  assert.equal(getLastReceptionPresentation(caught).locksMovement, true);
  const releaseEvents = tick(caught, LAST_RECEPTION_CAPTURE_SECONDS + .1, { player: at('capture') });
  assert.equal(caught.phase, 'released');
  assert.equal(releaseEvents.filter((event) => event.type === 'released').length, 1);
  assert.deepEqual(releaseEvents.find((event) => event.type === 'released').position, { x: player.x, y: player.y, z: player.z, yaw: -Math.PI / 2 });
  assert.equal(getLastReceptionPresentation(caught).locksMovement, false);
  tick(caught, 10, { player });
  assert.equal(caught.phase, 'released', 'release loop cannot recapture');
  for (const forbidden of ['composure', 'maxComposure', 'inventory', 'ending', 'battery', 'injury', 'recordings']) assert.equal(Object.hasOwn(caught, forbidden), false);
  const escaping = createLastReceptionState({ phase: 'converging', phaseElapsed: 4 });
  for (const actor of escaping.actors) Object.assign(actor, player);
  tick(escaping, .4, { player });
  assert.ok(escaping.hold > 0);
  tick(escaping, .6, { player: at('serviceRoom') });
  assert.equal(escaping.hold, 0);
  assert.equal(escaping.phase, 'converging');
  assert.equal(getLastReceptionPresentation(escaping).movementMultiplier, 1);
});

test('either previously open physical exit resolves the ambush and leaves unread conversation available', () => {
  for (const outside of ['mainOutside', 'serviceOutside']) {
    const state = createLastReceptionState({ phase: 'converging', entered: true, phaseElapsed: 4 });
    const events = updateLastReception(state, { dt: .05, player: at(outside) }).events;
    assert.equal(state.phase, 'escaped');
    assert.equal(state.outcome, 'escaped');
    assert.equal(events.filter((event) => event.type === 'escaped').length, 1);
    assert.equal(getLastReceptionConversation(state, 'guest-a').id, 'guest-a-evening');
    tick(state, 8, { player: at('release') });
    assert.equal(state.phase, 'escaped', 'return visits never repeat the trap');
  }
});

test('footfalls and pleas are limited, spatial and pause-safe', () => {
  const state = createLastReceptionState({ phase: 'converging', phaseElapsed: 3, pleaClock: .1 });
  const events = updateLastReception(state, { dt: 1, player: at('release') }).events;
  assert.ok(events.filter((event) => event.type === 'footstep').length <= 3);
  const plea = events.find((event) => event.type === 'plea');
  assert.ok(plea?.residentId && plea.position && plea.text);
  const restore = createLastReceptionState(serializeLastReceptionState(state));
  assert.equal(restore.pleaClock, state.pleaClock);
});

test('both learned routes are escapable at ordinary 2.1m/s and a brief hesitation gives a threatening hold', () => {
  for (const exit of ['mainOutside', 'serviceOutside']) for (const hesitation of [0, 3]) {
    const state = createLastReceptionState(); reveal(state);
    let player = { x: -61, y: 9, z: -457 }, elapsed = 0, maximumHold = 0;
    const path = lastReceptionPath(player, at(exit));
    for (let i = 0; i < 500 && state.phase !== 'escaped' && state.phase !== 'captured'; i++) {
      if (elapsed >= hesitation) {
        let remaining = 2.1 * .05;
        while (remaining > .0001 && path.length) {
          const next = path[0], distance = Math.hypot(next.x - player.x, next.y - player.y, next.z - player.z);
          if (distance < .001) { path.shift(); continue; }
          const advance = Math.min(remaining, distance), t = advance / distance;
          player = { x: player.x + (next.x - player.x) * t, y: player.y + (next.y - player.y) * t, z: player.z + (next.z - player.z) * t };
          remaining -= advance;
          if (advance >= distance - .001) path.shift();
        }
      }
      const frame = updateLastReception(state, { dt: .05, player });
      maximumHold = Math.max(maximumHold, frame.presentation.hold);
      elapsed += .05;
    }
    assert.equal(state.phase, 'escaped', `${exit}, hesitation ${hesitation}`);
    assert.ok(elapsed < 20);
    if (hesitation) assert.ok(maximumHold > .3, 'hesitating produces a visible, breakable hold');
  }
});

test('logical half-metre steps resist holds through the rendered cell interval', () => {
  const player = { x: -51.5, y: 9, z: -458 };
  const state = createLastReceptionState({ phase: 'converging', phaseElapsed: 4, hold: 1.3,
    lastPlayer: { ...player, x: -52 } });
  for (const actor of state.actors) Object.assign(actor, player);
  for (let i = 0; i < 15; i++) updateLastReception(state, { dt: .016, player });
  assert.equal(state.phase, 'converging', 'rendered motion between logical steps must not be mistaken for standing still');
  assert.ok(state.hold < LAST_RECEPTION_HOLD_SECONDS);
  assert.ok(state.movementRemaining > 0);
  assert.equal(createLastReceptionState(serializeLastReceptionState(state)).movementRemaining, state.movementRemaining);
});

test('escape stops the crowd at the seam and flattens a resident without moving the player', () => {
  const state = createLastReceptionState({ phase: 'converging', entered: true });
  const events = updateLastReception(state, { dt: .05, player: at('mainOutside') }).events;
  assert.equal(events.find((event) => event.type === 'escaped').position.x, at('mainOutside').x);
  tick(state, 6, { player: at('mainOutside') });
  const frame = getLastReceptionPresentation(state);
  const flattened = frame.residents.find((resident) => resident.boundaryWeight > .99);
  assert.ok(flattened?.boundary);
  assert.ok(flattened.x < ROOM.bounds.maxX, 'resident never crosses the boundary');
  assert.equal(frame.residents.filter((resident) => resident.mode === 'walk').length, 0);
  assert.equal(createLastReceptionState(serializeLastReceptionState(state)).actors.find((actor) => actor.id === flattened.id).boundarySeconds, 1);
});

test('invalid saves cannot import unknown actors, NaN positions, fake facts or foreign gameplay fields', () => {
  const state = createLastReceptionState({ phase: 'invented', hold: Infinity, composure: -999, knowledge: { truth: true }, seen: ['fake'],
    actors: [{ id: 'host', x: NaN, y: 9, z: -450 }, { id: 'hush', x: -50, y: 9, z: -450 }] });
  assert.equal(state.phase, 'exploring');
  assert.deepEqual(state.knowledge, {});
  assert.deepEqual(state.seen, []);
  assert.equal(state.actors.length, 6);
  assert.equal(state.actors.find((actor) => actor.id === 'host').x, -51.4);
  assert.equal(Object.hasOwn(state, 'composure'), false);
  assert.doesNotThrow(() => JSON.stringify(serializeLastReceptionState(state)));
});
