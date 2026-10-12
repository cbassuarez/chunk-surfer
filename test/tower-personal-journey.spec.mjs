import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBellsGodPreset } from '../src/game/chunk-surf-god.js';
import { TOWER_PERSONAL_JOURNEY as PLAN, TOWER_PERSONAL_STAGE_IDS, TOWER_PERSONAL_WORLD_IDS,
  towerPersonalWorld, towerPersonalSupportAt } from '../src/data/tower-personal-journey.js';
import { normalizeTowerPersonalJourney, beginTowerPersonalJourney, tickTowerPersonalJourney,
  crossTowerPersonalJourney, towerPersonalDoorCrossing, towerPersonalJourneyFrame,
  leaveTowerPersonalJourney, consumeTowerPersonalReward } from '../src/game/tower-personal-journey.js';

const roadPose = { x: 12, y: -4200, facing: .37, yaw: .37, pitch: -.12 };
const begin = () => beginTowerPersonalJourney(null, { entryDoorId: 'service-door', returnPose: roadPose });
const reload = (journey) => normalizeTowerPersonalJourney(JSON.parse(JSON.stringify(journey)));
const make = (createSourceSpaceRuntime, seed = 4417, override = {}) => createSourceSpaceRuntime({ initialState: {
  ...buildBellsGodPreset(440, { seed }).state, ...override,
} });

function cross(journey, id, gaze = {}) {
  const door = towerPersonalWorld(journey.stage).doors.find((entry) => entry.id === id);
  assert.ok(door, `${journey.stage} has ${id}`);
  const from = { ...journey.pose, x: door.center.x - door.normal.x * .4,
    z: door.center.z - door.normal.z * .4, ...gaze };
  const to = { ...from, x: door.center.x + door.normal.x * .4, z: door.center.z + door.normal.z * .4 };
  const result = crossTowerPersonalJourney({ ...journey, pose: from }, from, to);
  assert.ok(result, `${journey.stage}/${id} passes`);
  return result;
}

function tickFor(journey, seconds, options = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += .1) {
    const dt = Math.min(.1, seconds - elapsed);
    journey = tickTowerPersonalJourney(journey, dt, { ...options,
      audibleSeconds: options.recorderHeld ? dt : 0 }).journey;
  }
  return journey;
}

function moveTo(journey, x, z) {
  const distance = Math.hypot(x - journey.pose.x, z - journey.pose.z), steps = Math.ceil(distance / .3);
  const dx = (x - journey.pose.x) / Math.max(1, steps), dz = (z - journey.pose.z) / Math.max(1, steps);
  for (let n = 0; n < steps; n++) {
    const from = { ...journey.pose }, to = { ...from, x: from.x + dx, z: from.z + dz };
    assert.ok(towerPersonalSupportAt(to.x, to.z, .22, journey.stage), `supported ${journey.stage} ${to.x},${to.z}`);
    const result = crossTowerPersonalJourney(journey, from, to);
    if (result) return { journey: result.journey, result };
    journey = normalizeTowerPersonalJourney({ ...journey, pose: to });
  }
  return { journey, result: null };
}

function walkWorld(journey) {
  const stage = journey.stage, spec = towerPersonalWorld(stage);
  for (const [x, z] of spec.route) {
    const next = moveTo(journey, x, z); journey = next.journey;
    assert.equal(next.result, null, `route only reaches ${stage} threshold`);
  }
  const door = spec.doors.find((entry) => entry.id === 'onward');
  const next = moveTo(journey, door.center.x + door.normal.x * .5, door.center.z + door.normal.z * .5);
  assert.ok(next.result, `${stage} physical exit crossed`);
  return next.journey;
}

function reachAsh(journey = begin()) {
  for (const expected of ['tape-field', 'dead-broadcast', 'ash-room']) {
    journey = cross(journey, 'onward').journey;
    assert.equal(journey.stage, expected);
  }
  return journey;
}

function hear(journey) {
  journey = normalizeTowerPersonalJourney({ ...journey, pose: { ...journey.pose, ...PLAN.recordist } });
  return tickFor(journey, PLAN.listenSeconds, { recorderHeld: true });
}

function returnHall(journey = hear(reachAsh())) {
  journey = cross(journey, 'onward').journey;
  journey = normalizeTowerPersonalJourney({ ...journey, pose: { ...journey.pose, ...PLAN.boy } });
  return tickFor(journey, PLAN.handoverSeconds + .1);
}

test('the voluntary invitation remains reachable and ungated across seeded door deals', async () => {
  const { createSourceSpaceRuntime } = await import('../src/game/source-space-runtime.js');
  for (let seed = 1; seed <= 250; seed++) {
    const doors = make(createSourceSpaceRuntime, seed).doorFieldDoors(), personal = doors.filter((door) => door.personal);
    assert.equal(personal.length, 1, `seed ${seed}`);
    for (const flag of ['shut', 'key', 'wrong', 'fails', 'lockIn']) assert.equal(personal[0][flag], false, `${seed}/${flag}`);
    assert.equal(doors.filter((door) => door.key && !door.shut).length, 2);
  }
});

test('runtime entry clears the old crossing and early leave cannot restore the road', async () => {
  const { createSourceSpaceRuntime } = await import('../src/game/source-space-runtime.js');
  const rt = make(createSourceSpaceRuntime, 31), door = rt.doorFieldDoors().find((entry) => entry.personal);
  const [a, b] = door.threshold, [nx, , nz] = door.normal;
  const from = { x: (a.x + b.x) / 2 + nx * 2, y: (a.y + b.y) / 2 + nz * 2,
    facing: roadPose.facing, yaw: roadPose.yaw, pitch: roadPose.pitch };
  const to = { x: (a.x + b.x) / 2 - nx * 2, y: (a.y + b.y) / 2 - nz * 2 };
  rt.setPlayerPosition(from); rt.openDoorFieldDoor(door.id);
  assert.equal(rt.onStep(from, to).event, 'personal-entry');
  const frame = rt.towerLandFrame();
  assert.equal(frame.active, true); assert.equal(frame.stage, 'school-hall');
  assert.deepEqual(frame.returnPose, from);
  assert.equal(rt.state().station.crossing, null); assert.equal(rt.state().station.walk, null);
  assert.ok(rt.geometry.cellAt(frame.pose.x, frame.pose.y));
  assert.equal(rt.tickBellField(8), null);
  assert.equal(rt.leaveTowerLand(), null);
  assert.equal(rt.state().station.personal.rewardEarned, false);
  const resumed = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(rt.state())) });
  assert.deepEqual(resumed.towerLandFrame().localPose, frame.localPose);
  assert.deepEqual(resumed.towerLandFrame().returnPose, from);
  assert.equal(resumed.leaveTowerLand(), null);
});

test('legacy lock-in entry saves recover onto the committed physical hall without a wrong return', async () => {
  const { createSourceSpaceRuntime } = await import('../src/game/source-space-runtime.js');
  const built = make(createSourceSpaceRuntime), door = built.doorFieldDoors().find((entry) => entry.personal);
  const rt = make(createSourceSpaceRuntime, 4417, { station: { crossing: { id: door.id, variant: 6,
    world: 'school-hall', lockIn: true, wrong: true, released: true, startedAt: 0, forward: [0,-1] },
    walk: { kind: 'lock-in', progress: 1 } }, routeDoorsErased: [door.id] });
  const frame = rt.towerLandFrame();
  assert.equal(frame.active, true); assert.equal(frame.version, 2);
  assert.ok(rt.geometry.cellAt(frame.pose.x, frame.pose.y));
  assert.equal(rt.state().station.crossing, null); assert.equal(rt.tickBellField(2), null);
  assert.equal(rt.leaveTowerLand(), null);
});

test('all authored routes, loops, door apertures and arrivals have shared physical footing', () => {
  assert.strictEqual(towerPersonalWorld('school-hall').supports, towerPersonalWorld('return-hall').supports);
  assert.deepEqual(towerPersonalWorld('school-hall').landmarks, towerPersonalWorld('return-hall').landmarks);
  for (const stage of TOWER_PERSONAL_STAGE_IDS) {
    const spec = towerPersonalWorld(stage);
    assert.ok(towerPersonalSupportAt(spec.spawn.x, spec.spawn.z, .22, stage));
    for (const route of [spec.route, ...(spec.loops || [])]) {
      for (let n = 1; n < route.length; n++) {
        const [ax, az] = route[n - 1], [bx, bz] = route[n], steps = Math.ceil(Math.hypot(bx - ax, bz - az) / .3);
        for (let k = 0; k <= steps; k++) assert.ok(towerPersonalSupportAt(ax + (bx - ax) * k / steps,
          az + (bz - az) * k / steps, .22, stage), `${stage} route ${n}/${k}`);
      }
    }
    for (const door of spec.doors) {
      for (const offset of [-1, 0, 1]) assert.ok(towerPersonalSupportAt(door.center.x + door.normal.x * offset,
        door.center.z + door.normal.z * offset, .22, stage), `${stage}/${door.id} threshold footing ${offset}`);
      assert.ok(towerPersonalSupportAt(door.arrival.x, door.arrival.z, .22, stage));
    }
  }
});

test('entering commits atomically and the first entrance loops into the same hall', () => {
  const initial = begin();
  assert.equal(initial.version, 2); assert.equal(initial.active, true);
  assert.deepEqual(initial.returnPose, roadPose); assert.deepEqual(initial.entryPose, roadPose);
  assert.equal(initial.transition.kind, 'entry'); assert.equal(initial.transition.to, 'school-hall');
  assert.equal(leaveTowerPersonalJourney(initial), null, 'committed entry cannot return early');
  const loop = cross(initial, 'entrance', { yaw: .22, pitch: -.31 });
  assert.equal(loop.journey.stage, 'school-hall'); assert.equal(loop.exit, false);
  assert.equal(loop.transition.kind, 'loop'); assert.equal(loop.transition.arrivalDoorId, 'onward');
  assert.equal(loop.journey.pose.z, -8.25);
  assert.ok(Math.abs(Math.sin(loop.pose.yaw - .22 - Math.PI)) < 1e-10, 'gaze rotates with the portal basis');
  assert.equal(loop.pose.pitch, -.31);
  assert.deepEqual(reload(loop.journey).transition, loop.transition);
  assert.equal(crossTowerPersonalJourney(loop.journey, loop.pose, { ...loop.pose, z: loop.pose.z + .03 }), null,
    'arrival movement cannot bounce through the arrival door');
  assert.deepEqual(beginTowerPersonalJourney(loop.journey, { returnPose: { x: 999, y: 999 } }), loop.journey,
    're-entering an active session cannot reset commitment or overwrite the original road pose');
});

test('door passage requires a physical outward aperture crossing, never focus or proximity', () => {
  const from = { x: 5, z: -9 }, to = { x: 5, z: -10 };
  assert.ok(towerPersonalDoorCrossing('school-hall', from, to));
  assert.equal(towerPersonalDoorCrossing('school-hall', to, from), null);
  assert.equal(towerPersonalDoorCrossing('school-hall', { x: 7, z: -9 }, { x: 7, z: -10 }), null);
  assert.equal(towerPersonalDoorCrossing('school-hall', from, from), null);
  assert.equal(towerPersonalDoorCrossing('school-hall', { x: NaN, z: -9 }, to), null);
  assert.equal(towerPersonalDoorCrossing('school-hall', { x: 6.2, z: -9 }, { x: 6.2, z: -10 }), null,
    'body radius cannot pass through a doorpost');
});

test('the real supported walk traverses four distinct worlds and every reverse door preserves progress', () => {
  let journey = begin();
  for (const stage of ['tape-field', 'dead-broadcast', 'ash-room']) {
    journey = walkWorld(journey);
    assert.equal(journey.stage, stage);
    assert.deepEqual(reload(journey).pose, journey.pose);
    assert.equal(journey.visited[stage], true);
  }
  assert.equal(towerPersonalJourneyFrame(journey).circuitComplete, true);
  const before = reload(journey);
  for (const stage of ['dead-broadcast', 'tape-field', 'school-hall']) {
    journey = cross(journey, 'back').journey;
    assert.equal(journey.stage, stage);
    for (const id of TOWER_PERSONAL_WORLD_IDS) assert.equal(journey.visited[id], true);
  }
  for (const stage of ['tape-field', 'dead-broadcast', 'ash-room']) {
    journey = cross(journey, 'onward').journey; assert.equal(journey.stage, stage);
  }
  assert.equal(journey.listenedSeconds, before.listenedSeconds);
  assert.ok(journey.transition.serial > before.transition.serial);
  assert.deepEqual(reload(journey).worldPoses, journey.worldPoses);
});

test('the ash forward door loops locally until actual audible recording evidence is earned', () => {
  let journey = reachAsh();
  const loop = cross(journey, 'onward');
  assert.equal(loop.journey.stage, 'ash-room'); assert.equal(loop.transition.arrivalDoorId, 'back');
  assert.equal(loop.events[0], 'recording-looped'); assert.equal(loop.exit, false);
  journey = normalizeTowerPersonalJourney({ ...loop.journey, pose: { ...loop.journey.pose, ...PLAN.recordist } });
  assert.equal(towerPersonalJourneyFrame(journey).canListen, true);
  const silent = tickTowerPersonalJourney(journey, .25, { recorderHeld: true });
  assert.equal(silent.journey.listenedSeconds, 0, 'simulation time and raised machine alone are not audible evidence');
  journey = tickFor(journey, 2.2, { recorderHeld: true });
  const partial = reload(journey);
  assert.ok(partial.listenedSeconds > 2.19 && partial.listenedSeconds < 2.21);
  assert.ok(Math.abs(partial.recordingOffsetSeconds - partial.listenedSeconds) < 1e-8);
  journey = tickTowerPersonalJourney(partial, 0, { recorderHeld: true, audibleSeconds: .07, recordingOffset: 2.27 }).journey;
  assert.ok(Math.abs(journey.listenedSeconds - 2.27) < 1e-8, 'lowering flushes the final AudioContext fraction');
  assert.equal(journey.time, partial.time, 'audio flush does not advance choreography');
  journey = tickFor(journey, 7, { recorderHeld: true });
  assert.equal(journey.recordingHeard, true); assert.equal(journey.listenedSeconds, 9);
  assert.equal(cross(journey, 'onward').journey.stage, 'return-hall');
  const hall = normalizeTowerPersonalJourney({ ...journey, stage: 'school-hall', pose: PLAN.recordist });
  assert.equal(towerPersonalJourneyFrame(hall).canListen, false, 'the same coordinates in another world cannot listen');
});

test('pause freezes audible receipts, PCM offset, active clock, handover and collapse', () => {
  let journey = reachAsh(); journey.pose = { ...journey.pose, ...PLAN.recordist };
  journey = tickTowerPersonalJourney(journey, .1, { recorderHeld: true, audibleSeconds: .1, recordingOffset: .1 }).journey;
  assert.deepEqual(tickTowerPersonalJourney(journey, 90, { recorderHeld: true, audibleSeconds: 14,
    recordingOffset: 12, paused: true }).journey, reload(journey));
  journey = returnHall();
  assert.deepEqual(tickTowerPersonalJourney(journey, 90, { paused: true }).journey, reload(journey));
});

test('spatial source offsets survive passage/reload without granting ash listening evidence', () => {
  let journey = begin();
  journey = tickTowerPersonalJourney(journey, .1, { sourceRecordingWorld: 'hall', sourceRecordingOffset: 3.2 }).journey;
  assert.equal(journey.ambientRecordings.hall.offset, 3.2);
  assert.equal(journey.listenedSeconds, 0);
  journey = cross(reload(journey), 'onward').journey;
  assert.equal(journey.ambientRecordings.hall.offset, 3.2);
  const blocked = tickTowerPersonalJourney(journey, .1, { sourceRecordingWorld: 'hall', sourceRecordingOffset: 10 }).journey;
  assert.equal(blocked.ambientRecordings.hall.offset, 3.2, 'a previous world cannot overwrite its source after a transition');
  journey = tickTowerPersonalJourney(journey, 0, { sourceRecordingWorld: 'hall', sourceRecordingOffset: 3.27 }).journey;
  assert.equal(journey.ambientRecordings.hall.offset, 3.27, 'a transition can flush the old live source final fraction');
  journey = tickTowerPersonalJourney(journey, 0, { sourceRecordingWorld: 'tape', sourceRecordingOffset: 2.27 }).journey;
  assert.equal(journey.ambientRecordings.tape.offset, 2.27, 'stopping a live source can checkpoint its final fraction');
  const paused = tickTowerPersonalJourney(journey, 1, { paused: true, sourceRecordingWorld: 'tape',
    sourceRecordingOffset: 7, sourceRecordingFinished: true }).journey;
  assert.deepEqual(paused.ambientRecordings, journey.ambientRecordings);
  journey = tickTowerPersonalJourney(journey, .1, { sourceRecordingWorld: 'tape',
    sourceRecordingOffset: 14, sourceRecordingFinished: true }).journey;
  journey = tickTowerPersonalJourney(reload(journey), .1, { sourceRecordingWorld: 'tape', sourceRecordingOffset: 0 }).journey;
  assert.deepEqual(journey.ambientRecordings.tape, { offset: 14, finished: true });
  assert.equal(journey.recordingHeard, false);
});

test('changed hall waits for proximity, resumes durable handover, and its exit stays safe forever', () => {
  let journey = cross(hear(reachAsh()), 'onward').journey;
  assert.equal(journey.stage, 'return-hall'); assert.equal(journey.handoverSeconds, 0);
  assert.equal(towerPersonalJourneyFrame(journey).exitAvailable, false);
  const loop = cross(journey, 'road-exit');
  assert.equal(loop.exit, false); assert.equal(loop.journey.stage, 'return-hall');
  assert.equal(loop.transition.kind, 'loop'); assert.equal(leaveTowerPersonalJourney(journey), null);
  journey.pose = { ...journey.pose, ...PLAN.boy };
  journey = tickFor(journey, 1.2);
  assert.ok(journey.handoverSeconds > 1.1);
  const saved = reload(journey);
  journey = cross(saved, 'onward').journey;
  assert.equal(journey.stage, 'ash-room', 'backtracking remains available during choreography');
  journey = tickFor(journey, 3.2);
  assert.equal(journey.handoverSeconds, PLAN.handoverSeconds, 'looking or walking away does not cancel the handover');
  journey = cross(journey, 'onward').journey;
  journey = tickFor(reload(journey), 60);
  assert.equal(journey.collapseSeconds, PLAN.collapseSeconds);
  assert.equal(towerPersonalJourneyFrame(journey).exitAvailable, true);
  assert.equal(journey.rewardEarned, false, 'the gift is committed with voluntary physical departure');
  const returned = cross(journey, 'road-exit');
  assert.equal(returned.exit, true); assert.equal(returned.completed, true);
  assert.equal(returned.journey.active, false); assert.equal(returned.journey.completed, true);
  assert.deepEqual(returned.pose, roadPose); assert.deepEqual(returned.transition.arrivalPose, roadPose);
  assert.equal(leaveTowerPersonalJourney(returned.journey), null);
  const consumed = consumeTowerPersonalReward(reload(returned.journey));
  assert.equal(consumed.rewardConsumed, true); assert.equal(consumeTowerPersonalReward(reload(consumed)), null);
  assert.equal(beginTowerPersonalJourney(returned.journey, { returnPose: roadPose }), null);
});

test('v1 compact and completed saves migrate explicitly without losing partial evidence or rewards', () => {
  const old = { version: 1, active: true, stage: 'ash-room', entryDoorId: 'old-door', returnPose: roadPose,
    pose: { ...PLAN.recordist, yaw: .71, pitch: .2 }, listenedSeconds: 3.25, ringAnswered: false };
  const migrated = normalizeTowerPersonalJourney(old);
  assert.equal(migrated.version, 2); assert.equal(migrated.migratedFrom, 1);
  assert.equal(migrated.stage, 'ash-room'); assert.deepEqual(migrated.pose, old.pose);
  assert.equal(migrated.listenedSeconds, 3.25); assert.equal(migrated.recordingOffsetSeconds, 3.25);
  assert.deepEqual(migrated.returnPose, roadPose);
  assert.equal(towerPersonalJourneyFrame(migrated).circuitComplete, true);
  assert.equal(leaveTowerPersonalJourney(migrated), null);
  const legacyConnector = normalizeTowerPersonalJourney({ ...old, stage: 'school-hall', pose: {x:5,z:-25,yaw:.7} });
  assert.equal(legacyConnector.stage, 'tape-field');
  assert.ok(towerPersonalSupportAt(legacyConnector.pose.x,legacyConnector.pose.z,.22,'tape-field'));
  const complete = normalizeTowerPersonalJourney({ ...old, active: false, completed: true, rewardConsumed: true, ringAnswered: true });
  assert.equal(complete.rewardConsumed, true); assert.equal(complete.ringAnswered, true);
  assert.equal(consumeTowerPersonalReward(complete), null); assert.deepEqual(reload(complete), complete);
});

test('normalization rejects unsupported/nonfinite poses and unearned choreography', () => {
  const normalized = normalizeTowerPersonalJourney({ version: 2, active: true, returnPose: roadPose,
    pose: {x:Infinity,z:NaN,yaw:Infinity,pitch:Infinity}, handoverSeconds:4, rewardEarned:true,
    time: Infinity, recordingOffsetSeconds: Infinity });
  assert.ok(towerPersonalSupportAt(normalized.pose.x,normalized.pose.z));
  assert.equal(normalized.pose.yaw, 0); assert.equal(normalized.time, 0);
  assert.equal(normalized.recordingOffsetSeconds, 0); assert.equal(normalized.handoverSeconds, 0);
  assert.equal(normalized.rewardEarned, false); assert.equal(consumeTowerPersonalReward(normalized), null);
  const malformed = normalizeTowerPersonalJourney({ ...normalized, returnPose: {x:Infinity,y:2}, entryPose: null });
  assert.equal(malformed.active, false);
  const frame = towerPersonalJourneyFrame(begin()); frame.worldPoses['school-hall'].x = 999;
  assert.notEqual(towerPersonalJourneyFrame(begin()).worldPoses['school-hall'].x, 999);
});
