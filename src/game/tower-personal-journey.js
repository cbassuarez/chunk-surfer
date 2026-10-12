import { TOWER_PERSONAL_JOURNEY as PLAN, TOWER_PERSONAL_STAGE_IDS, TOWER_PERSONAL_WORLD_IDS,
  towerPersonalWorld, towerPersonalSupportAt, towerPersonalObjective } from '../data/tower-personal-journey.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, finite(value)));
const angle = (value) => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
const returnPose = (value) => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
  ? { x: Number(value.x), y: Number(value.y), facing: finite(value.facing), yaw: finite(value.yaw), pitch: clamp(value.pitch, -1.4, 1.4) } : null;
const validStage = (stage) => TOWER_PERSONAL_STAGE_IDS.includes(stage);
const completeCircuit = (visited) => TOWER_PERSONAL_WORLD_IDS.every((stage) => visited[stage]);
const localPose = (value, stage) => {
  const spawn = towerPersonalWorld(stage).spawn;
  let x = finite(value?.x, spawn.x), z = finite(value?.z, spawn.z);
  if (!towerPersonalSupportAt(x, z, .22, stage)) { x = spawn.x; z = spawn.z; }
  return { x, z, yaw: finite(value?.yaw, spawn.yaw), pitch: clamp(value?.pitch, -1.4, 1.4) };
};
const copyTransition = (value) => {
  if (!value || typeof value !== 'object' || !Number.isFinite(Number(value.serial))) return null;
  const to = value.to === 'road' ? 'road' : validStage(value.to) ? value.to : null;
  const from = value.from === 'road' ? 'road' : validStage(value.from) ? value.from : null;
  if (!to || !from) return null;
  return { serial: Math.max(0, Math.floor(Number(value.serial))),
    kind: ['entry', 'passage', 'loop', 'exit'].includes(value.kind) ? value.kind : 'passage',
    from, to, doorId: String(value.doorId || '').slice(0, 120),
    arrivalDoorId: value.arrivalDoorId ? String(value.arrivalDoorId).slice(0, 120) : null,
    fromPose: from === 'road' ? returnPose(value.fromPose) : localPose(value.fromPose, from),
    arrivalPose: to === 'road' ? returnPose(value.arrivalPose) : localPose(value.arrivalPose, to) };
};

export function normalizeTowerPersonalJourney(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const legacy = source.version !== 2;
  const completed = !!source.completed, back = returnPose(source.returnPose || source.entryPose);
  let stage = validStage(source.stage) ? source.stage : 'school-hall';
  // v1 placed the hall/connector/workroom on one floor. Map occupied regions,
  // retaining earned evidence and giving credit for the worlds they replace.
  if (legacy && stage === 'school-hall' && finite(source.pose?.z, 17) < -11) {
    stage = finite(source.pose?.z) < -39 ? 'ash-room' : 'tape-field';
  }
  const visited = Object.fromEntries(TOWER_PERSONAL_STAGE_IDS.map((id) => [id, !!source.visited?.[id]]));
  const recordingHeard = completed || !!source.recordingHeard;
  if (back || source.active || completed) visited['school-hall'] = true;
  if (legacy) {
    const index = TOWER_PERSONAL_STAGE_IDS.indexOf(stage);
    for (let n = 0; n <= index; n++) visited[TOWER_PERSONAL_STAGE_IDS[n]] = !!back || completed;
    if (recordingHeard || stage === 'return-hall') for (const id of TOWER_PERSONAL_WORLD_IDS) visited[id] = true;
  }
  if (completed) for (const id of TOWER_PERSONAL_STAGE_IDS) visited[id] = true;
  const worldPoses = Object.fromEntries(TOWER_PERSONAL_STAGE_IDS.map((id) => [id, localPose(source.worldPoses?.[id], id)]));
  const pose = localPose(source.pose || worldPoses[stage], stage);
  worldPoses[stage] = { ...pose };
  const earnedHandover = recordingHeard && completeCircuit(visited);
  const ambientRecordings = Object.fromEntries(['hall', 'tape', 'broadcast'].map((world) => {
    const receipt = source.ambientRecordings?.[world], finished = completed || !!receipt?.finished;
    return [world, { offset: finished ? PLAN.recordingSeconds : clamp(receipt?.offset, 0, PLAN.recordingSeconds), finished }];
  }));
  const transition = copyTransition(source.transition);
  const portal = source.portalLatch;
  const portalLatch = portal && portal.stage === stage && towerPersonalWorld(stage).doors.some((door) => door.id === portal.doorId)
    ? { stage, doorId: portal.doorId } : null;
  return {
    version: 2, active: !!source.active && !!back && !completed, stage,
    graphVersion: 2, migratedFrom: source.migratedFrom === 1 || legacy && (source.version === 1 || source.active || completed) ? 1 : null,
    entryDoorId: typeof source.entryDoorId === 'string' ? source.entryDoorId.slice(0, 120) : null,
    returnPose: back, entryPose: returnPose(source.entryPose) || back && { ...back },
    pose, worldPoses, visited, transition, portalLatch, ambientRecordings,
    time: Math.max(0, finite(source.time)),
    listenedSeconds: recordingHeard ? PLAN.listenSeconds : clamp(source.listenedSeconds, 0, PLAN.listenSeconds),
    recordingOffsetSeconds: ((finite(source.recordingOffsetSeconds ?? source.recordingOffset, finite(source.listenedSeconds)) % PLAN.recordingSeconds) + PLAN.recordingSeconds) % PLAN.recordingSeconds,
    recordingHeard,
    handoverSeconds: completed ? PLAN.handoverSeconds : earnedHandover ? clamp(source.handoverSeconds, 0, PLAN.handoverSeconds) : 0,
    collapseSeconds: completed ? PLAN.collapseSeconds : earnedHandover && finite(source.handoverSeconds) >= PLAN.handoverSeconds ? clamp(source.collapseSeconds, 0, PLAN.collapseSeconds) : 0,
    completed, rewardEarned: completed,
    rewardConsumed: !!source.rewardConsumed && completed,
    ringAnswered: !!source.ringAnswered,
  };
}

export function beginTowerPersonalJourney(value, { entryDoorId, returnPose: back } = {}) {
  const journey = normalizeTowerPersonalJourney(value);
  if (journey.completed) return null;
  if (journey.active) return journey;
  if (!returnPose(back)) return null;
  const stage = journey.recordingHeard && completeCircuit(journey.visited) ? 'return-hall' : 'school-hall';
  const pose = { ...towerPersonalWorld(stage).spawn };
  return normalizeTowerPersonalJourney({ ...journey, active: true, stage,
    entryDoorId: entryDoorId || journey.entryDoorId, returnPose: back, entryPose: back,
    pose, visited: { ...journey.visited, [stage]: true },
    transition: { serial: (journey.transition?.serial || 0) + 1, kind: 'entry', from: 'road', to: stage,
      doorId: entryDoorId || journey.entryDoorId, arrivalDoorId: stage === 'school-hall' ? 'entrance' : 'onward',
      fromPose: back, arrivalPose: pose } });
}

export function towerPersonalJourneyFrame(value) {
  const journey = normalizeTowerPersonalJourney(value), { x, z } = journey.pose;
  const spec = towerPersonalWorld(journey.stage), distance = Math.hypot(x - PLAN.recordist.x, z - PLAN.recordist.z);
  const canListen = journey.active && journey.stage === 'ash-room' && distance <= PLAN.listenRadius;
  const circuitComplete = completeCircuit(journey.visited);
  const exitAvailable = journey.active && journey.stage === 'return-hall' && circuitComplete
    && journey.recordingHeard && journey.handoverSeconds >= PLAN.handoverSeconds;
  return { ...journey, world: spec.world, recordingOffset: journey.recordingOffsetSeconds,
    canListen, recordingLevel: canListen ? Math.max(.25, 1 - distance / 7) : 0,
    circuitComplete, changedHall: circuitComplete && journey.recordingHeard,
    handover: journey.handoverSeconds / PLAN.handoverSeconds,
    collapse: journey.collapseSeconds / PLAN.collapseSeconds, exitAvailable,
    doors: spec.doors.map((door) => ({ ...door, center: { ...door.center }, normal: { ...door.normal }, arrival: { ...door.arrival } })),
    objective: towerPersonalObjective(journey),
    weather: { snow: journey.active && spec.world === 'hall' ? .62 : 0,
      ash: journey.active && spec.world === 'ash' ? .45 : 0 },
  };
}

// Only an outward crossing of a real aperture is a passage. Being close to a
// door, looking at it, or pressing an interaction never moves the player.
export function towerPersonalDoorCrossing(stage, from, to, radius = .22) {
  if (![from?.x, from?.z, to?.x, to?.z].every((n) => Number.isFinite(Number(n)))) return null;
  for (const door of towerPersonalWorld(stage).doors) {
    const a = (from.x - door.center.x) * door.normal.x + (from.z - door.center.z) * door.normal.z;
    const b = (to.x - door.center.x) * door.normal.x + (to.z - door.center.z) * door.normal.z;
    if (a > 1e-6 || b <= 1e-6 || b - a <= 1e-8) continue;
    const t = -a / (b - a), hit = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    const lateral = (hit.x - door.center.x) * door.normal.z - (hit.z - door.center.z) * door.normal.x;
    if (Math.abs(lateral) <= door.halfWidth - Math.max(0, finite(radius, .22))) return { door, hit, lateral };
  }
  return null;
}

export function crossTowerPersonalJourney(value, fromPose, toPose) {
  const journey = normalizeTowerPersonalJourney(value);
  if (!journey.active) return null;
  const crossed = towerPersonalDoorCrossing(journey.stage, fromPose, toPose);
  if (!crossed) return null;
  const { door, hit } = crossed;
  const inward = -((fromPose.x - door.center.x) * door.normal.x + (fromPose.z - door.center.z) * door.normal.z);
  if (journey.portalLatch?.doorId === door.id && inward < .08) return null;
  const sourcePose = localPose({ ...journey.pose, ...fromPose,
    yaw: toPose.yaw ?? fromPose.yaw ?? journey.pose.yaw,
    pitch: toPose.pitch ?? fromPose.pitch ?? journey.pose.pitch }, journey.stage);
  journey.pose = sourcePose; journey.worldPoses[journey.stage] = { ...sourcePose };
  if (door.exit && towerPersonalJourneyFrame(journey).exitAvailable) {
    const result = leaveTowerPersonalJourney(journey);
    return { ...result, exit: true, event: 'personal-exit', events: ['completed'], transition: result.journey.transition };
  }
  let destinationStage = door.toStage, destinationDoorId = door.toDoorId, loop = !!door.loop;
  if (door.requiresRecording && !journey.recordingHeard) {
    destinationStage = 'ash-room'; destinationDoorId = 'back'; loop = true;
  }
  if (door.exit) { destinationStage = 'return-hall'; destinationDoorId = 'onward'; loop = true; }
  const destination = towerPersonalWorld(destinationStage), arrivalDoor = destination.doors.find((item) => item.id === destinationDoorId);
  if (!arrivalDoor) return null;
  const delta = Math.atan2(-arrivalDoor.normal.x, arrivalDoor.normal.z) - Math.atan2(door.normal.x, -door.normal.z);
  const lx = hit.x - door.center.x, lz = hit.z - door.center.z;
  const pose = localPose({ x: arrivalDoor.arrival.x + lx * Math.cos(delta) - lz * Math.sin(delta),
    z: arrivalDoor.arrival.z + lx * Math.sin(delta) + lz * Math.cos(delta),
    yaw: angle(sourcePose.yaw + delta), pitch: sourcePose.pitch }, destinationStage);
  const from = journey.stage;
  journey.stage = destinationStage; journey.pose = pose;
  journey.worldPoses[destinationStage] = { ...pose }; journey.visited[destinationStage] = true;
  journey.portalLatch = { stage: destinationStage, doorId: destinationDoorId };
  journey.transition = { serial: (journey.transition?.serial || 0) + 1, kind: loop ? 'loop' : 'passage',
    from, to: destinationStage, doorId: door.id, arrivalDoorId: destinationDoorId,
    fromPose: sourcePose, arrivalPose: { ...pose } };
  const events = loop ? [door.requiresRecording ? 'recording-looped' : door.exit ? 'exit-looped' : 'entrance-looped']
    : [destinationStage === 'return-hall' ? 'hall-returned' : `${destinationStage}-entered`];
  const saved = normalizeTowerPersonalJourney(journey);
  return { journey: saved, pose: { ...saved.pose }, exit: false, event: 'personal-transition', events,
    transition: saved.transition, frame: towerPersonalJourneyFrame(saved) };
}

export function tickTowerPersonalJourney(value, dt = 0,
  { recorderHeld = false, audibleSeconds = 0, recordingOffset, paused = false,
    sourceRecordingWorld, sourceRecordingOffset, sourceRecordingFinished = false } = {}) {
  const journey = normalizeTowerPersonalJourney(value), events = [];
  if (!journey.active || paused) return { journey, events, frame: towerPersonalJourneyFrame(journey) };
  const seconds = clamp(dt, 0, .25), frame = towerPersonalJourneyFrame(journey);
  journey.time += seconds;
  const sourceReceipt = journey.ambientRecordings[sourceRecordingWorld];
  if (sourceReceipt && (sourceRecordingWorld === frame.world || seconds === 0) && !sourceReceipt.finished) {
    if (Number.isFinite(Number(sourceRecordingOffset))) sourceReceipt.offset = clamp(sourceRecordingOffset, 0, PLAN.recordingSeconds);
    if (sourceRecordingFinished) { sourceReceipt.finished = true; sourceReceipt.offset = PLAN.recordingSeconds; }
  }
  if (frame.canListen && recorderHeld) {
    // AudioContext evidence is independent of simulation dt: lowering can flush
    // its final live fraction with dt=0, without advancing any choreography.
    const audible = clamp(audibleSeconds, 0, PLAN.recordingSeconds);
    if (Number.isFinite(Number(recordingOffset))) {
      journey.recordingOffsetSeconds = ((Number(recordingOffset) % PLAN.recordingSeconds) + PLAN.recordingSeconds) % PLAN.recordingSeconds;
    } else journey.recordingOffsetSeconds = (journey.recordingOffsetSeconds + audible) % PLAN.recordingSeconds;
    if (!journey.recordingHeard) {
      journey.listenedSeconds = Math.min(PLAN.listenSeconds, journey.listenedSeconds + audible);
      if (journey.listenedSeconds >= PLAN.listenSeconds - 1e-8) {
        journey.listenedSeconds = PLAN.listenSeconds; journey.recordingHeard = true; events.push('recording-heard');
      }
    }
  }
  const eligible = journey.stage === 'return-hall' && completeCircuit(journey.visited) && journey.recordingHeard;
  if (seconds > 0 && eligible && journey.handoverSeconds === 0
    && Math.hypot(journey.pose.x - PLAN.boy.x, journey.pose.z - PLAN.boy.z) <= PLAN.handoverRadius) {
    journey.handoverSeconds = seconds; events.push('handover-started');
  } else if (journey.handoverSeconds > 0 && journey.handoverSeconds < PLAN.handoverSeconds) {
    journey.handoverSeconds = Math.min(PLAN.handoverSeconds, journey.handoverSeconds + seconds);
    if (journey.handoverSeconds >= PLAN.handoverSeconds - 1e-8) {
      journey.handoverSeconds = PLAN.handoverSeconds; events.push('handover-finished');
    }
  }
  if (journey.handoverSeconds >= PLAN.handoverSeconds) journey.collapseSeconds = Math.min(PLAN.collapseSeconds, journey.collapseSeconds + seconds);
  journey.worldPoses[journey.stage] = { ...journey.pose };
  return { journey, events, frame: towerPersonalJourneyFrame(journey) };
}

export function leaveTowerPersonalJourney(value) {
  const journey = normalizeTowerPersonalJourney(value);
  if (!towerPersonalJourneyFrame(journey).exitAvailable || !journey.returnPose) return null;
  journey.active = false; journey.completed = true; journey.rewardEarned = true;
  journey.transition = { serial: (journey.transition?.serial || 0) + 1, kind: 'exit', from: journey.stage, to: 'road',
    doorId: 'road-exit', arrivalDoorId: null, fromPose: { ...journey.pose }, arrivalPose: { ...journey.returnPose } };
  return { journey: normalizeTowerPersonalJourney(journey), pose: { ...journey.returnPose }, completed: true };
}

export function consumeTowerPersonalReward(value) {
  const journey = normalizeTowerPersonalJourney(value);
  if (!journey.rewardEarned || journey.rewardConsumed) return null;
  return { ...journey, rewardConsumed: true };
}
