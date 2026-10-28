// Passive Missing Man performance. Runtime owns the root, elapsed/phase clocks
// and accepted travel; PCM owns speech. No Date/RAF, hand-axis guess or free
// jaw/breathing oscillator enters this descriptor.
import { TOWER_WARNING } from '../data/tower-warning.js';

export const TOWER_WARNING_PERFORMANCE = Object.freeze({
  version: 1, smokePeriodSeconds: 18, smokeGestureSeconds: 2.8,
  handStopSeconds: .24, handLowerEndSeconds: .82,
  maxHeadYaw: .42, maxNeckYaw: .15,
  departureHeadHoldSeconds: .20, departureHeadReleaseSeconds: 1.45,
  idleSmokeDensity: .12, speechSmokeGain: .38,
  clips: Object.freeze({ hold: 'warning_hold', smoke: 'warning_smoke', walk: 'warning_walk' }),
});
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, finite(v, lo)));
const smooth = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
const angle = v => Math.atan2(Math.sin(finite(v)), Math.cos(finite(v)));
const nonnegative = v => Math.max(0, finite(v));
const identity = () => [0, 0, 0, 1];
function axisOf(rig) {
  if (!rig || !Array.isArray(rig.yawAxis) || rig.yawAxis.length !== 3 || !rig.yawAxis.every(Number.isFinite)) return null;
  const length = Math.hypot(...rig.yawAxis);
  return length > .999 && length < 1.001 ? rig.yawAxis.map(v => v / length) : null;
}
function quaternion(axis, radians) {
  if (!axis) return identity();
  const s = Math.sin(radians / 2);
  return [...axis.map(v => v * s), Math.cos(radians / 2)];
}
function clipAtWaitingTime(elapsed, duration) {
  const cycle = nonnegative(elapsed) % TOWER_WARNING_PERFORMANCE.smokePeriodSeconds;
  return Math.min(duration, cycle);
}
function handLiftAt(time, duration) {
  const t = duration > 0 ? time * TOWER_WARNING_PERFORMANCE.smokeGestureSeconds / duration : 0;
  return smooth(t / .4) * (1 - smooth((t - 1.3) / .8));
}
function speechAt(frame, audio, paused) {
  const lineId = frame.line?.id == null ? null : String(frame.line.id);
  const owned = !!lineId && lineId === audio?.lineId && lineId === audio?.envelope?.lineId;
  const available = owned && audio?.ready === true && audio?.envelope?.available === true && !audio?.error && !audio?.done;
  const active = available && frame.speaking === true && audio?.active === true && audio?.envelope?.active === true
    && !audio?.paused && !paused;
  const value = active ? clamp(audio.envelope.value) : 0;
  const heldValue = available && paused ? clamp(audio.envelope.heldValue) : value;
  return { available, active, value, heldValue, offset: nonnegative(audio?.offset), lineId: owned ? lineId : null,
    source: available ? 'pcm' : null };
}

// The built GLB carries a compact missingMan record; the bake receipt may
// carry the expanded contract. Both resolve to the same validated channels.
export function towerWarningAssetContract(value = null) {
  const raw = value?.missingMan || value || {};
  return {
    clips: { hold: raw.clips?.hold || raw.holdClip || TOWER_WARNING_PERFORMANCE.clips.hold,
      smoke: raw.clips?.smoke || raw.gestureClip || TOWER_WARNING_PERFORMANCE.clips.smoke,
      walk: raw.clips?.walk || raw.walkClip || TOWER_WARNING_PERFORMANCE.clips.walk,
      depart: raw.clips?.depart || raw.departureClip || null },
    durations: { smoke: finite(raw.durations?.smoke ?? raw.gestureDurationSec, TOWER_WARNING_PERFORMANCE.smokeGestureSeconds),
      walk: finite(raw.durations?.walk ?? raw.walkDurationSec),depart: finite(raw.durations?.depart ?? raw.departureDurationSec) },
    gait: { strideMetres: finite(raw.gait?.strideMetres ?? raw.strideM) },
    rig: { head: raw.rig?.head || { bone: 'head', yawAxis: raw.gazeAxes?.head },
      neck: raw.rig?.neck || { bone: 'neck', yawAxis: raw.gazeAxes?.neck },
      jaw: raw.rig?.jaw || { bone: 'jaw' } },
    morphs: { coat: raw.morphs?.coat || raw.morphs?.coatSettle,
      collar: raw.morphs?.collar || raw.morphs?.collarSettle },
    cigarette: raw.cigarette || raw.anchors || null,
  };
}

export function towerWarningPerformance(frame = {}, {
  listener = null, audio = null, reducedMotion = false, paused = false, assetContract = null,
} = {}) {
  frame = frame && typeof frame === 'object' ? frame : { phase: 'absent', visible: false };
  const spec = TOWER_WARNING_PERFORMANCE, phase = String(frame.phase || 'waiting');
  const elapsed = nonnegative(frame.elapsed), phaseSeconds = nonnegative(frame.phaseSeconds);
  const position = frame.position || TOWER_WARNING.position, yaw = finite(frame.yaw, TOWER_WARNING.yaw);
  const visible = frame.visible !== false && !['departed', 'absent', 'gone', 'complete', 'done'].includes(phase);
  const held = paused === true || frame.blocked === true || frame.paused === true;
  const soft = reducedMotion === true || frame.reducedMotion === true;
  const contract = towerWarningAssetContract(assetContract), clips = contract.clips;
  const smokeDuration = clamp(contract.durations.smoke, .01, 10);
  const walkDuration = finite(contract.durations.walk);
  const strideMetres = finite(contract.gait.strideMetres);
  const gaitReady = walkDuration > 0 && walkDuration < 10 && strideMetres > .1 && strideMetres < 3;
  const travelMetres = nonnegative(frame.distance ?? frame.travelMetres);
  const departing = phase === 'leaving' || phase === 'departing';
  const walking = departing && frame.walking === true && !frame.blocked;
  const cycles = gaitReady ? travelMetres / strideMetres : 0;
  const clipTime = gaitReady ? cycles * walkDuration : 0;
  const preserveStep = departing && gaitReady && (walking || travelMetres > 0);

  let clip = clips.hold, time = 0, lift = 0;
  if (preserveStep) { clip = clips.walk; time = clipTime; }
  else if(departing&&clips.depart&&contract.durations.depart>0){
    clip=clips.depart;time=Math.min(phaseSeconds,contract.durations.depart);
  }
  else if (!soft && phase === 'waiting') {
    time = clipAtWaitingTime(elapsed, smokeDuration);
    if (time < smokeDuration) { clip = clips.smoke; lift = handLiftAt(time, smokeDuration); }
    else time = 0;
  } else if (!soft && phase === 'turning') {
    // The exact pre-interaction pose stops before the hand completes its
    // existing baked lowering path. No additive arm/finger rotation is used.
    const entryTime = clipAtWaitingTime(Math.max(0, elapsed - phaseSeconds), smokeDuration);
    if (entryTime < smokeDuration) {
      time = entryTime + (smokeDuration - entryTime) * smooth((phaseSeconds - spec.handStopSeconds) / (spec.handLowerEndSeconds - spec.handStopSeconds));
      clip = clips.smoke; lift = handLiftAt(time, smokeDuration);
    }
  }

  const dx = finite(listener?.x, position.x) - finite(position.x), dz = finite(listener?.z, position.z) - finite(position.z);
  const hasListener = listener && Number.isFinite(listener.x) && Number.isFinite(listener.z);
  const distance = hasListener ? Math.hypot(dx, dz) : Infinity;
  const desiredYaw = hasListener ? angle(Math.atan2(dx, -dz) - yaw) : finite(frame.headYaw);
  const rangeWeight = hasListener ? 1 - smooth((distance - TOWER_WARNING.interactRadius) / (TOWER_WARNING.attentionRadius - TOWER_WARNING.interactRadius)) : clamp(frame.attentionWeight);
  const frontWeight = 1 - smooth((Math.abs(desiredYaw) - 1.12) / .95);
  const phaseWeight = phase === 'waiting' ? .28 : phase === 'turning' ? .28 + .72 * smooth(phaseSeconds / .18) : phase === 'speaking' ? 1
    : departing ? 1 - smooth((phaseSeconds - spec.departureHeadHoldSeconds) / (spec.departureHeadReleaseSeconds - spec.departureHeadHoldSeconds)) : 0;
  const weight = visible ? rangeWeight * frontWeight * phaseWeight * (soft ? .35 : 1) : 0;
  const semanticYaw = clamp(desiredYaw, -.57, .57) * weight;
  const headYaw = clamp(semanticYaw * .74, -spec.maxHeadYaw, spec.maxHeadYaw);
  const neckYaw = clamp(semanticYaw * .26, -spec.maxNeckYaw, spec.maxNeckYaw);
  const head = contract.rig.head, neck = contract.rig.neck;
  const headAxis = axisOf(head), neckAxis = axisOf(neck);
  const joints = { [contract.rig.jaw?.bone || 'jaw']: { rotation: identity() } };
  // Game root yaw and standard right-handed joint quaternion yaw have
  // opposite signs. Validated local axes come from the built bind hierarchy.
  if (headAxis && head?.bone) joints[head.bone] = { rotation: quaternion(headAxis, -headYaw) };
  if (neckAxis && neck?.bone) joints[neck.bone] = { rotation: quaternion(neckAxis, -neckYaw) };

  const speech = speechAt(frame, audio, held);
  const energy = held ? speech.heldValue : speech.value;
  let coatLag = 0;
  if (phase === 'turning') coatLag = smooth(phaseSeconds / .28) * (1 - .65 * smooth((phaseSeconds - .35) / .5));
  else if (phase === 'speaking') coatLag = .35 * (1 - smooth(phaseSeconds / .78)) + energy * .04;
  else if (departing) coatLag = smooth((phaseSeconds - 1.05) / .22) * (1 - smooth((phaseSeconds - 1.52) / .7));
  coatLag *= soft ? .25 : 1;
  const morphs = {};
  if (typeof contract.morphs.coat === 'string') morphs[contract.morphs.coat] = clamp(coatLag);
  if (typeof contract.morphs.collar === 'string') morphs[contract.morphs.collar] = clamp(coatLag * .35);

  return { version: 1, phase, clock: elapsed, visible, paused: held,
    character: { clip, time, loop: preserveStep, joints, morphs },
    attention: { desiredYaw, headYaw, neckYaw, weight, rigReady: !!headAxis && !!neckAxis },
    hand: { lift, held: held || phase === 'turning' && phaseSeconds < spec.handStopSeconds,
      clipOwned: true, overrides: false },
    gait: { active: walking && gaitReady && !held, heldPose: preserveStep && !walking,
      contractReady: gaitReady, travelMetres, strideMetres: gaitReady ? strideMetres : null, cycles, clipTime },
    cloth: { lag: clamp(coatLag), channelApplied: Object.keys(morphs).length > 0 },
    speech,
    smoke: { clock: elapsed, enabled: visible, animated: visible && !soft, emitting: visible && !soft && !held,
      density: visible ? spec.idleSmokeDensity + energy * spec.speechSmokeGain : 0,
      inward: true,
      energy, socket: contract.cigarette },
    diagnostics: { noIndependentClock: true, jawAnimated: false, armAxesGuessed: false,
      geometryAndRootOwnedByRuntime: true, heldSilhouette: !walking, axisContractReady: !!headAxis && !!neckAxis },
  };
}
