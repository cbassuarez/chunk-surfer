// Bronze Reliquary presentation. This module owns no inventory, navigation,
// audio device or wall clock: explicit gameplay consent starts the ritual,
// while its returned frame and cue receipts drive every presentation consumer.

export const BUST_PERFORMANCE_SCHEMA = 1;
export const BUST_PERFORMANCE_DURATION = Object.freeze({ recognition: 10, ritual: 5 });
export const BUST_PERFORMANCE_LIMITS = Object.freeze({
  headYaw: 22 * Math.PI / 180,
  headPitch: 14 * Math.PI / 180,
  eyeYaw: 18 * Math.PI / 180,
  eyePitch: 12 * Math.PI / 180,
});

const marker = (id, time, target) => Object.freeze({ id, time, target });
export const BUST_PERFORMANCE_CUES = Object.freeze({
  returned: Object.freeze([
    marker('shutter-left-unlock', .65, 'left-eye'),
    marker('shutter-right-unlock', 1.15, 'right-eye'),
    marker('eye-left-seat', 2.6, 'left-eye'),
    marker('eye-right-seat', 3.1, 'right-eye'),
    marker('neck-takes-weight', 3.8, 'neck'),
    marker('neck-locks', 9.5, 'neck'),
  ]),
  carried: Object.freeze([
    marker('case-eye-knock', .35, 'case'),
    marker('shutter-left-unlock', .7, 'left-eye'),
    marker('shutter-right-unlock', 1.4, 'right-eye'),
    marker('neck-takes-weight', 1.8, 'neck'),
    marker('neck-locks', 9.5, 'neck'),
  ]),
  ritual: Object.freeze([
    marker('seal-contact', 0, 'seal'),
    marker('linkage-takes-weight', .38, 'neck'),
    marker('seal-depresses', .5, 'seal'),
    marker('bearing-turns', 1.75, 'neck'),
    marker('bearing-locks', 4.45, 'neck'),
  ]),
});

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, finite(value)));
const evidenceOf = value => value === 'returned' || value === 'carried' ? value : 'none';
const durationOf = phase => BUST_PERFORMANCE_DURATION[phase];
const cueId = (phase, evidence, id) => `reliquary:${phase}:${phase === 'recognition' ? evidence : 'committed'}:${id}`;
const phaseMarkers = (phase, evidence) => BUST_PERFORMANCE_CUES[phase === 'recognition' ? evidence : phase] || [];
const neutralGaze = () => ({
  headYaw: 0, headPitch: 0, eyeLYaw: 0, eyeLPitch: 0, eyeRYaw: 0, eyeRPitch: 0,
  targetYaw: 0, targetPitch: 0, targetDistance: 8, targetAge: 0, following: false,
});
const knownReceipts = new Set([
  ...['returned', 'carried'].flatMap(evidence => phaseMarkers('recognition', evidence).map(cue => cueId('recognition', evidence, cue.id))),
  ...phaseMarkers('ritual').map(cue => cueId('ritual', 'none', cue.id)),
]);

function consumeRemaining(state, phase) {
  const evidence = state.recognition.evidence;
  const receipts = new Set(state.cueReceipts);
  for (const cue of phaseMarkers(phase, evidence)) receipts.add(cueId(phase, evidence, cue.id));
  state.cueReceipts = [...receipts];
}

// Normalization is deliberately safe on a live reducer dispatch. Unlike
// hydration it preserves a playing clip and does not consume future markers.
export function normalizeBustPerformanceState(saved = {}, legacy = {}) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const old = legacy && typeof legacy === 'object' ? legacy : {};
  // The profile is the authoritative owner during legacy hydration. A freshly
  // normalized missing performance has evidence:'none'; that placeholder must
  // not hide the profile's carried/returned branch.
  const evidence = evidenceOf(old.evidence ?? old.eyeEvidence ?? source.evidence);
  const rawRecognition = source.recognition && typeof source.recognition === 'object' ? source.recognition : {};
  const recognized = !!(rawRecognition.received || old.recognized || old.recognised || source.recognized || source.recognised);
  const hasRecognitionReceipt = rawRecognition.received || rawRecognition.status === 'playing' || rawRecognition.status === 'settled';
  const recognitionEvidence = evidenceOf(hasRecognitionReceipt ? rawRecognition.evidence ?? evidence : evidence);
  const recognitionReceived = recognized || rawRecognition.status === 'playing' || rawRecognition.status === 'settled';
  let recognitionStatus = recognitionReceived
    ? rawRecognition.status === 'playing' && recognitionEvidence !== 'none' ? 'playing' : 'settled'
    : 'idle';
  let recognitionTime = recognitionStatus === 'settled' ? 10 : Math.max(0, Math.min(10, finite(rawRecognition.time)));
  if (recognitionTime >= 10 && recognitionStatus === 'playing') recognitionStatus = 'settled';
  if (!recognitionReceived) recognitionTime = 0;
  const rawRitual = source.ritual && typeof source.ritual === 'object' ? source.ritual : {};
  // Animation state alone never creates consent, including malformed saves.
  const committed = !!(rawRitual.committed || old.committed || old.accepted || source.committed || source.accepted);
  let ritualStatus = committed ? rawRitual.status === 'playing' ? 'playing' : 'settled' : 'idle';
  let ritualTime = ritualStatus === 'settled' ? 5 : committed ? Math.max(0, Math.min(5, finite(rawRitual.time))) : 0;
  if (ritualTime >= 5 && ritualStatus === 'playing') ritualStatus = 'settled';
  const rawGaze = source.gaze && typeof source.gaze === 'object' ? source.gaze : {};
  const gaze = neutralGaze();
  for (const key of ['headYaw', 'headPitch', 'eyeLYaw', 'eyeLPitch', 'eyeRYaw', 'eyeRPitch']) {
    const limit = key.startsWith('head')
      ? BUST_PERFORMANCE_LIMITS[key]
      : BUST_PERFORMANCE_LIMITS[key.endsWith('Yaw') ? 'eyeYaw' : 'eyePitch'];
    gaze[key] = clamp(rawGaze[key], limit);
  }
  gaze.targetYaw = clamp(rawGaze.targetYaw, Math.PI);
  gaze.targetPitch = clamp(rawGaze.targetPitch, Math.PI / 2);
  gaze.targetDistance = Math.max(.1, Math.min(1000, finite(rawGaze.targetDistance, 8)));
  gaze.targetAge = Math.max(0, Math.min(60, finite(rawGaze.targetAge)));
  gaze.following = !!rawGaze.following;
  const state = {
    schema: BUST_PERFORMANCE_SCHEMA,
    evidence,
    sceneTime: Math.max(0, finite(source.sceneTime)),
    recognition: { received: recognitionReceived, evidence: recognitionEvidence, status: recognitionStatus, time: recognitionTime },
    ritual: { received: committed, committed, status: ritualStatus, time: ritualTime },
    cueReceipts: [...new Set((Array.isArray(source.cueReceipts) ? source.cueReceipts : []).filter(id => knownReceipts.has(id)))],
    gaze,
  };
  if (recognitionStatus === 'settled') consumeRemaining(state, 'recognition');
  if (ritualStatus === 'settled') consumeRemaining(state, 'ritual');
  return state;
}

// Use once when constructing a runtime from disk. An interrupted event is a
// durable receipt, not an invitation to replay sound or initiation on reload.
export function createBustPerformanceState(saved = {}, legacy = {}) {
  const state = normalizeBustPerformanceState(saved, legacy);
  if (state.recognition.received) {
    state.recognition.status = 'settled';
    state.recognition.time = 10;
    consumeRemaining(state, 'recognition');
  }
  if (state.ritual.committed) {
    state.ritual.status = 'settled';
    state.ritual.time = 5;
    consumeRemaining(state, 'ritual');
  }
  state.gaze.following = false;
  return state;
}

export function beginBustRecognition(saved, evidence = saved?.evidence) {
  const state = normalizeBustPerformanceState(saved);
  if (state.recognition.received || state.ritual.committed) return { state, started: false };
  state.evidence = evidenceOf(evidence);
  state.recognition = {
    received: true, evidence: state.evidence,
    status: state.evidence === 'none' ? 'settled' : 'playing',
    time: state.evidence === 'none' ? 10 : 0,
  };
  state.gaze = neutralGaze();
  return { state, started: true };
}

// This is called only after the existing explicit route choice has accepted.
// It performs no navigation or evidence transaction. routeOpen is true from
// this call, including the first frame of the five-second ceremony.
export function beginBustRitual(saved, { evidence = saved?.evidence } = {}) {
  const state = normalizeBustPerformanceState(saved);
  if (state.ritual.committed) return { state, started: false, routeOpen: true };
  const eligible = evidenceOf(evidence);
  if (eligible === 'none') return { state, started: false, routeOpen: false };
  state.evidence = eligible;
  if (state.recognition.received) {
    state.recognition.status = 'settled';
    state.recognition.time = 10;
    consumeRemaining(state, 'recognition');
  }
  state.ritual = { received: true, committed: true, status: 'playing', time: 0 };
  state.gaze = neutralGaze();
  return { state, started: true, routeOpen: true };
}

function quaternion(axis, angle) {
  const value = Math.sin(angle / 2);
  return [axis === 'x' ? value : 0, axis === 'y' ? value : 0, 0, Math.cos(angle / 2)];
}

export function describeBustPerformance(saved, { evidence = saved?.evidence } = {}) {
  const state = normalizeBustPerformanceState(saved);
  const visibleEvidence = evidenceOf(evidence);
  let clip = 'blind', time = 0, phase = 'blind';
  if (state.ritual.committed) {
    phase = state.ritual.status === 'playing' ? 'ritual' : 'committed';
    clip = state.ritual.status === 'playing' ? 'ritual' : 'settled';
    time = state.ritual.status === 'playing' ? state.ritual.time : 1;
  } else if (state.recognition.received && state.recognition.evidence !== 'none') {
    phase = state.recognition.status === 'playing' ? 'recognition' : 'attentive';
    clip = state.recognition.evidence === 'returned' ? 'recognition-returned' : 'recognition-carried';
    time = state.recognition.time;
  }
  // Authored clips own the complete mechanism during recognition and ritual.
  // Gaze overlays become active only after recognition has seated its parts.
  const track = phase === 'attentive';
  const gaze = track ? state.gaze : neutralGaze();
  return {
    schema: BUST_PERFORMANCE_SCHEMA,
    phase, clip, time, loop: false,
    evidence: visibleEvidence,
    eyesVisible: visibleEvidence === 'returned',
    routeOpen: state.ritual.committed,
    blocksMovement: false,
    joints: {
      neck_yaw: { rotation: quaternion('y', gaze.headYaw) },
      neck_pitch: { rotation: quaternion('x', gaze.headPitch) },
      eye_L_yaw: { rotation: quaternion('y', visibleEvidence === 'returned' ? gaze.eyeLYaw : 0) },
      eye_L_pitch: { rotation: quaternion('x', visibleEvidence === 'returned' ? gaze.eyeLPitch : 0) },
      eye_R_yaw: { rotation: quaternion('y', visibleEvidence === 'returned' ? gaze.eyeRYaw : 0) },
      eye_R_pitch: { rotation: quaternion('x', visibleEvidence === 'returned' ? gaze.eyeRPitch : 0) },
    },
  };
}

function advanceGaze(state, dt, options) {
  const gaze = state.gaze;
  const attentive = state.recognition.status === 'settled' && state.recognition.received
    && state.evidence !== 'none' && !state.ritual.committed;
  const target = state.evidence === 'carried' ? options.bag ?? options.gaze : options.gaze;
  if (!attentive || !options.inAudience || !target || options.reducedMotion) {
    gaze.following = false;
    return;
  }
  const yaw = clamp(target.yaw, Math.PI), pitch = clamp(target.pitch, Math.PI / 2);
  const distance = Math.max(.1, Math.min(1000, finite(target.distance, 8)));
  if (!gaze.following || Math.hypot(yaw - gaze.targetYaw, pitch - gaze.targetPitch) > 6 * Math.PI / 180) gaze.targetAge = 0;
  const oldAge = gaze.targetAge;
  gaze.targetYaw = yaw;
  gaze.targetPitch = pitch;
  gaze.targetDistance = distance;
  gaze.targetAge = Math.min(60, oldAge + dt);
  gaze.following = true;
  // A new fixation reaches the eyes before the heavy neck is allowed to move.
  const headDt = Math.max(0, gaze.targetAge - .24) - Math.max(0, oldAge - .24);
  const headFraction = 1 - Math.exp(-headDt / .9);
  const desiredHeadYaw = clamp(yaw * .7, BUST_PERFORMANCE_LIMITS.headYaw);
  const desiredHeadPitch = clamp(pitch * .6, BUST_PERFORMANCE_LIMITS.headPitch);
  gaze.headYaw += (desiredHeadYaw - gaze.headYaw) * headFraction;
  gaze.headPitch += (desiredHeadPitch - gaze.headPitch) * headFraction;
  if (state.evidence !== 'returned') return;
  const eyeFraction = 1 - Math.exp(-dt / .1), convergence = Math.atan2(.31, distance);
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const desiredYaw = clamp(yaw - gaze.headYaw + convergence * sign, BUST_PERFORMANCE_LIMITS.eyeYaw);
    const desiredPitch = clamp(pitch - gaze.headPitch, BUST_PERFORMANCE_LIMITS.eyePitch);
    gaze[`eye${side}Yaw`] += (desiredYaw - gaze[`eye${side}Yaw`]) * eyeFraction;
    gaze[`eye${side}Pitch`] += (desiredPitch - gaze[`eye${side}Pitch`]) * eyeFraction;
  }
}

export function advanceBustPerformance(saved, dt = 0, options = {}) {
  const state = normalizeBustPerformanceState(saved);
  const before = JSON.stringify(state);
  const cues = [];
  const seconds = Math.max(0, finite(dt));
  if (options.paused || options.hidden) return { state, frame: describeBustPerformance(state), cues, changed: false };
  if (options.evidence !== undefined) state.evidence = evidenceOf(options.evidence);
  const phase = state.ritual.status === 'playing' ? 'ritual' : state.recognition.status === 'playing' ? 'recognition' : null;
  if (phase) state.sceneTime += Math.min(seconds, Math.max(0, durationOf(phase) - state[phase].time));
  let gazeDt = seconds;
  if (phase) {
    const event = state[phase], previousTime = event.time;
    event.time = options.reducedMotion ? durationOf(phase) : Math.min(durationOf(phase), event.time + seconds);
    const markers = phaseMarkers(phase, state.recognition.evidence);
    const receipts = new Set(state.cueReceipts);
    const crossed = markers.filter(cue => cue.time >= previousTime && cue.time <= event.time
      && !receipts.has(cueId(phase, state.recognition.evidence, cue.id)));
    for (const cue of crossed) receipts.add(cueId(phase, state.recognition.evidence, cue.id));
    // Reduced motion settles geometry in one frame. Consume all markers but
    // sound only the last contact, avoiding a burst of compressed machinery.
    for (const cue of options.reducedMotion ? crossed.slice(-1) : crossed) cues.push({
      ...cue, receipt: cueId(phase, state.recognition.evidence, cue.id), phase,
      evidence: state.evidence,
    });
    state.cueReceipts = [...receipts];
    if (event.time >= durationOf(phase)) event.status = 'settled';
    gazeDt = options.reducedMotion ? 0 : Math.max(0, seconds - (durationOf(phase) - previousTime));
  }
  advanceGaze(state, gazeDt, options);
  return { state, frame: describeBustPerformance(state), cues, changed: JSON.stringify(state) !== before };
}

// Skipping is presentation-only: it cannot accept a route or alter evidence.
export function settleBustPerformance(saved) {
  return createBustPerformanceState(saved);
}
