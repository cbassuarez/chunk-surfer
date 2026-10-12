import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_PRE_TAPE, SOURCE_TIER_BY_ID } from '../src/data/source-level.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

function firstMeeting(options = {}, { talks = 0, edgeDoorOpen = false } = {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, {
    seed: 4417, injuries: 0, hasRig: false, ...options,
  });
  const initialState = { ...built.state, edgeDoorOpen, sourceContacts: { ...built.state.sourceContacts, talks } };
  const runtime = createSourceSpaceRuntime({ initialState });
  const origin = initialState.landscapeOrigin;
  const position = { x: origin.x - 24, y: origin.y - 922, facing: 0 };
  runtime.setPlayerPosition(position);
  return { runtime, position };
}

test('the human trace waits at the service court, never pursues, and offers contact only within speaking range', () => {
  const { runtime, position } = firstMeeting();
  const initial = runtime.hushApproachFrame(0);
  assert.equal(initial.active, true);
  assert.equal(initial.safe, true);
  assert.equal(initial.rear.x, position.x);
  assert.equal(initial.rear.y, position.y - 8);
  let frame = initial;
  for (let step = 0; step < 160; step++) frame = runtime.hushApproachFrame(.05);
  assert.deepEqual(frame.rear, initial.rear, 'the human trace does not close the distance');
  assert.equal(runtime.hushMode().colliding, false);
  assert.equal(runtime.hushMode().contactAvailable, true);
  runtime.setPlayerPosition({ ...position, y: position.y + 12 });
  for (let step = 0; step < 160; step++) frame = runtime.hushApproachFrame(.05);
  assert.deepEqual(frame.rear, initial.rear, 'walking away never starts a pursuit');
  assert.equal(runtime.hushMode().contactAvailable, false);
  assert.equal(runtime.beginHushContact(), null, 'contact cannot be opened remotely');
  runtime.setPlayerPosition(position);
  const parked = frame.rear;
  assert.ok(runtime.beginHushContact());
  for (let step = 0; step < 20; step++) frame = runtime.hushApproachFrame(.05);
  assert.deepEqual(frame.rear, parked, 'the speaker does not drift while the body is held for dialogue');
});

test('a saved elevated body cannot speak through the ground into the service court', () => {
  const { runtime, position } = firstMeeting();
  const elevated = createSourceSpaceRuntime({ initialState: {
    ...runtime.state(), sourceDivide: { version: 1, feet: 14.2, fallVelocity: 0, falling: false },
  } });
  elevated.setPlayerPosition(position);
  assert.equal(elevated.hushMode().contactAvailable, false);
  assert.equal(elevated.beginHushContact(), null);
  const reloaded = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(elevated.state())) });
  reloaded.setPlayerPosition(position);
  assert.equal(reloaded.hushMode().contactAvailable, false, 'a reload must preserve height when checking speaking range');
});

for (const origin of [{ x: 0, y: -252 }, { x: 115, y: 1000 }]) {
  test(`the open strata cleft releases exploration without forcing court contact at origin ${origin.x},${origin.y}`, () => {
    const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT, { seed: 4417 });
    const runtime = createSourceSpaceRuntime({ initialState: { ...built.state, landscapeOrigin: origin } });
    const top = { x: origin.x+8, y: origin.y-792, facing: 0 };
    const previous = { x: origin.x+20, y: origin.y-784, facing: 0 };
    runtime.setPlayerPosition(previous);
    assert.equal(runtime.state().firstLiftCompleted, false);
    assert.equal(runtime.geometry.canStep(previous.x,previous.y,top.x,top.y).ok, true);
    for(let n=1,at=previous;n<=80;n++){
      const next={...top,x:previous.x+(top.x-previous.x)*n/80,y:previous.y+(top.y-previous.y)*n/80};
      assert.equal(runtime.geometry.canStep(at.x,at.y,next.x,next.y).ok,true);
      runtime.onStep(at,next);at=next;
    }
    assert.equal(runtime.state().firstLiftCompleted, true, 'the walked inner cleft did not release Source proper');
    assert.equal(runtime.sourceSensoryFrame().mix, 0, 'pressure/audio returns after the inner release');
    const body = runtime.hushApproachFrame(0).rear;
    assert.ok(body.visible, 'the optional human trace is absent from its court');
    assert.deepEqual({ x: body.x, y: body.y }, { x: origin.x - 24, y: origin.y - 930 });
    assert.ok(Math.hypot(body.x - top.x, body.y - top.y) > 120, 'the court intrudes on the arrival forecourt');
    assert.ok(runtime.geometry.cellAt(body.x,body.y), 'the human trace waits outside traversable Source');
    assert.equal(runtime.hushMode().contactAvailable, false);
    assert.equal(runtime.beginHushContact(), null, 'arriving at the opaque turn must not open remote dialogue');
    for (let step = 0; step < 240; step++) runtime.hushApproachFrame(.05);
    assert.deepEqual(runtime.hushApproachFrame(0).rear, body, 'the trace walks into the arrival sightline');
    assert.equal(runtime.hushMode().colliding, false, 'releasing Source introduces a catch');
  });
}

test('questions and walking away preserve position, checkpoint, attempts, and an available return conversation', () => {
  const { runtime, position } = firstMeeting();
  const before = runtime.state();
  assert.deepEqual(before.sourceContacts.insights, []);
  assert.equal(before.injuriesAtEntry, 0);
  assert.equal(before.profile.bestEligible, false);
  assert.ok(runtime.beginHushContact());
  for (const id of ['contact.following', 'contact.way-through', 'contact.identity']) {
    const result = runtime.resolveHushContactChoice(id);
    assert.equal(result.handled, true);
    assert.equal(result.terminal, false);
    assert.equal(result.combat, false);
    assert.deepEqual(result.checkpoint, position);
  }
  const left = runtime.resolveHushContactChoice('contact.leave');
  assert.equal(left.terminal, true);
  assert.equal(left.combat, false);
  assert.deepEqual(left.checkpoint, position);
  assert.equal(runtime.state().checkpointId, before.checkpointId);
  assert.equal(runtime.state().attempts, before.attempts, 'optional conversation must not spend a hidden retry');
  assert.equal(runtime.state().phase, 'landscape');
  assert.equal(runtime.state().finale.route, null);
  runtime.setPlayerPosition({ ...position, x: position.x + 30 });
  assert.equal(runtime.beginHushContact(), null, 'walking away closes the opportunity until the player returns');
  assert.equal(runtime.state().attempts, before.attempts);
  runtime.setPlayerPosition(position);
  assert.equal(runtime.beginHushContact().startAt, 'return', 'returning needs no capture, movement, or answer count');
});

test('an unarmed confirmation is rejected without throwing away the still-open conversation', () => {
  const { runtime } = firstMeeting();
  assert.ok(runtime.beginHushContact());
  const rejected = runtime.resolveHushContactChoice('contact.confirm');
  assert.equal(rejected.handled, false);
  assert.equal(runtime.state().sourceContacts.combatCommitted, false);
  assert.equal(runtime.state().finale.route, null);
  assert.equal(runtime.beginHushContact(), null, 'the original conversation still owns contact');
  const warned = runtime.resolveHushContactChoice('contact.warning');
  assert.equal(warned.handled, true);
  assert.equal(warned.combat, false);
  assert.equal(runtime.resolveHushContactChoice('contact.confirm').combat, true);
  assert.equal(runtime.finalEncounterRequest().adapter, 'combat-v1');
});

test('warning can be declined, then accepted on a later meeting; fresh no-rig, no-injury contact starts combat', () => {
  const { runtime, position } = firstMeeting();
  assert.ok(runtime.beginHushContact());
  runtime.resolveHushContactChoice('contact.warning');
  const left = runtime.resolveHushContactChoice('contact.leave-warning');
  assert.equal(left.combat, false);
  assert.deepEqual(left.checkpoint, position);
  assert.equal(runtime.finalEncounterRequest(), null);
  assert.ok(runtime.beginHushContact());
  runtime.resolveHushContactChoice('contact.warning');
  const contact = runtime.resolveHushContactChoice('contact.confirm');
  assert.equal(contact.combat, true);
  assert.deepEqual(contact.checkpoint, position, 'combat starts here, not at the remote final landmark');
  assert.equal(runtime.state().phase, 'final');
  assert.equal(runtime.state().finale.route, 'contact');
  assert.equal(runtime.state().sourceContacts.combatCommitted, true);
  assert.equal(runtime.hushMode().contactAvailable, false, 'a committed fight cannot open another conversation');
  const request = runtime.finalEncounterRequest();
  assert.equal(request.adapter, 'combat-v1');
  assert.equal(request.rigAvailable, false);
  assert.equal(request.hurtBefore, false);
  assert.equal(request.battleAvailable, true);
  assert.equal(request.rescueEligible, false, 'equipment still determines the rescue advantage');
  const reloaded = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(runtime.state())) });
  reloaded.setPlayerPosition(position);
  assert.equal(reloaded.finalEncounterRequest().adapter, 'combat-v1', 'a reload resumes the committed fight');
});

test('radio history neither qualifies battle nor arms the first-meeting warning', () => {
  const { runtime, position } = firstMeeting();
  const first = runtime.beginHushContact();
  assert.ok(first);
  assert.ok(first.nodes.ask.choices.some((choice) => choice.id === 'contact.warning'), 'the first meeting offers the warning without prior talks');
  assert.equal(runtime.recordHushRadioTalk().handled, false, 'a radio call cannot land in the middle of a conversation');
  assert.deepEqual(runtime.resolveHushContactChoice('contact.leave').checkpoint, position);
  for (let call = 0; call < 2; call++) {
    const result = runtime.recordHushRadioTalk();
    assert.equal(result.handled, true);
    assert.equal(result.talks, 2 + call);
  }
  assert.equal(runtime.state().finale.route, null, 'a radio call commits the route');
  assert.equal(runtime.state().sourceContacts.warningSeen, false, 'a radio call arms the warning');
  const encounter = runtime.beginHushContact();
  assert.ok(encounter.nodes.ask.choices.some((choice) => choice.id === 'contact.warning'), 'radio history must not withhold the warning');
  assert.equal(runtime.resolveHushContactChoice('contact.warning').handled, true);
  assert.equal(runtime.resolveHushContactChoice('contact.confirm').combat, true);
});

test('the legacy catch entry safely leaves and never strands a pending question', () => {
  const { runtime, position } = firstMeeting();
  assert.deepEqual(runtime.handleHushContact(), position);
  assert.equal(runtime.state().finale.route, null);
  assert.ok(runtime.beginHushContact(), 'legacy callers must not leave an invisible pending dialogue');
});

for (const accepted of [false, true]) test('the outskirts return stays open until the bust is ' + (accepted ? 'accepted' : 'declined'), () => {
  // Out through the grey doors, which stand open (see source-edge-door.spec).
  const { runtime } = firstMeeting({ marbleEyes: 'returned' }, { edgeDoorOpen: true });
  const origin = runtime.state().landscapeOrigin;
  const field = { x: origin.x, y: origin.y + SOURCE_PRE_TAPE.from + 1, facing: 0 };
  const outskirts = { x: field.x, y: field.y - 2, facing: 0 };
  runtime.setPlayerPosition(field);
  assert.equal(runtime.geometry.canStep(field.x, field.y, outskirts.x, outskirts.y).ok, true);
  const outward = runtime.onStep(field, outskirts);
  assert.equal(outward.event, 'horizon');
  assert.deepEqual(outward.checkpoint, outskirts, 'entering the outskirts preserves the walked position');
  assert.equal(runtime.state().finalEncounter.outcome, null);
  assert.equal(runtime.state().finale.route, null);
  assert.equal(runtime.geometry.canStep(outskirts.x, outskirts.y, field.x, field.y).ok, true);
  assert.equal(runtime.onStep(outskirts, field).event, 'source-field-returned');
  assert.equal(runtime.state().phase, 'landscape');
  assert.equal(runtime.hushMode().contactAvailable, false, 'the grey-door edge cannot open remote court contact');
  runtime.setPlayerPosition({ x: origin.x - 24, y: origin.y - 922, facing: 0 });
  assert.equal(runtime.hushMode().contactAvailable, true);
  runtime.setPlayerPosition(field);
  runtime.onStep(field, outskirts);
  for (let beat = 0; beat < 3; beat++) runtime.talkToHorizonBust();
  assert.equal(runtime.decideHorizonBust(accepted).decision, accepted ? 'accepted' : 'declined');
  runtime.onStep(outskirts, field);
  assert.equal(runtime.state().phase, 'horizon', 'a bust decision ends the return-to-contact option');
  assert.equal(runtime.beginHushContact(), null);
});
