// The street remembers an encounter, rather than re-dealing it on a timer.
import { busWomanWrongOriginCuePlan, crossedBusWomanWrongOriginCues } from './bus-woman-wrong-origin-cues.js';
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const ids = (v, max = 256) => [...new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length < 120) : [])].slice(-max);
const clamp = (n, a, b) => Math.max(a, Math.min(b, finite(n)));
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const mix = (a, b, t) => a + (b - a) * t;
const FOLD_PHASES = new Set(['armed', 'force', 'pain', 'spent']);
const BODY_CLIPS = new Set(['idle', 'walk', 'turn']);
const FOLD_EFFORTS = [3.15, 4.95, 7.8, 9.0, 10.35];
const WRITHE_EFFORTS = [3.8, 7.9, 13.1, 17.7, 21.0];
const WRITHE_SECONDS = 24;
const GAIT_SECONDS = 1.1, GAIT_METRES = 1.2;

function effortIndexAt(elapsed) {
  let index = -1;
  for (let i = 0; i < FOLD_EFFORTS.length; i++) if (elapsed >= FOLD_EFFORTS[i]) index = i;
  if (elapsed < 12) return index;
  const cycle = Math.floor((elapsed - 12) / WRITHE_SECONDS), local = (elapsed - 12) % WRITHE_SECONDS;
  index = FOLD_EFFORTS.length + cycle * WRITHE_EFFORTS.length - 1;
  for (let i = 0; i < WRITHE_EFFORTS.length; i++) if (local >= WRITHE_EFFORTS[i]) index = FOLD_EFFORTS.length + cycle * WRITHE_EFFORTS.length + i;
  return index;
}
function normalizeFold(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const phase = FOLD_PHASES.has(v.phase) ? v.phase : 'armed';
  const elapsed = phase === 'armed' ? 0 : clamp(v.elapsed, 0, 3_600_000);
  return { version: 1, phase, elapsed, seed: Math.floor(clamp(v.seed, 0, 0xffffffff)),
    cues: ids(v.cues, 8), lastEffort: Math.max(effortIndexAt(elapsed), Math.floor(Number.isFinite(v.lastEffort) ? clamp(v.lastEffort, -1, 1_000_000) : -1)) };
}
function normalizeLocomotion(value) {
  if (!value || typeof value !== 'object') return null;
  const v = value;
  return {
    pass: Math.floor(clamp(v.pass, 0, 28)), along: clamp(v.along, -10, 2000), across: clamp(v.across, -36, 36),
    yaw: angle(finite(v.yaw)), pitch: clamp(v.pitch, -1.5, 1.5), heading: angle(finite(v.heading, finite(v.yaw))),
    headYaw: clamp(v.headYaw, -1.2, 1.2), speed: clamp(v.speed, 0, 5), gaitTime: clamp(v.gaitTime, 0, 3_600_000),
    walkWeight: clamp(v.walkWeight, 0, 1), clip: BODY_CLIPS.has(v.clip) ? v.clip : 'idle', clipTime: clamp(v.clipTime, 0, 3_600_000),
    leftContact: clamp(v.leftContact == null ? 1 : v.leftContact, 0, 1), rightContact: clamp(v.rightContact == null ? 1 : v.rightContact, 0, 1),
    floorOffset: clamp(v.floorOffset, -2, 5), motionUntil: clamp(v.motionUntil, 0, 3_600_000),
  };
}
function normalizeWoman(value = {}) {
  const moment = n => n == null ? null : clamp(n, 0, 3_600_000);
  return { ticketReturned: !!value.ticketReturned,
    receivedAt: moment(value.receivedAt), receiveId: typeof value.receiveId === 'string' ? value.receiveId.slice(0, 120) : null,
    acknowledgedAt: moment(value.acknowledgedAt), acknowledgeYaw: clamp(value.acknowledgeYaw ?? .26, -.6, .6), stepAt: moment(value.stepAt) };
}
// A bounded capture/replay record. The full walk history belongs to Source state,
// not every causal frame. Unknown versions are deliberately not approximated.
export function normalizeOutskirtsCharacterFrame(value) {
  if (!value || typeof value !== 'object' || (value.version != null && value.version !== 1)) return null;
  return { version: 1, clock: clamp(value.clock, 0, 3_600_000), fold: normalizeFold(value.fold), locomotion: normalizeLocomotion(value.locomotion),
    busStage: clamp(value.busStage, 0, 4), woman: normalizeWoman(value.woman) };
}

export function normalizeOutskirtsExperience(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    seen: ids(v.seen), lampsOff: ids(v.lampsOff), actions: ids(v.actions),
    loopTurns: Math.floor(clamp(v.loopTurns, 0, 1_000_000)), loopHolding: v.loopHolding === true,
    observed: (Array.isArray(v.observed) ? v.observed : []).filter(p => typeof p?.id === 'string').slice(-128)
      .map(p => ({ id: p.id.slice(0, 120), seen: !!p.seen, gone: !!p.gone, epoch: clamp(p.epoch, 0, 32), face: p.face == null ? null : finite(p.face) })),
    busStage: clamp(v.busStage, 0, 4),
    woman: normalizeWoman(v.woman),
    history: (Array.isArray(v.history) ? v.history : []).slice(-1800)
      .filter(p => Number.isFinite(p?.along) && Number.isFinite(p?.across))
      .map(p => ({ pass: clamp(p.pass, 0, 28), along: finite(p.along), across: clamp(p.across, -36, 36), yaw: finite(p.yaw), clock: Math.max(0, finite(p.clock)),
        ...(p.body ? { body: normalizeLocomotion(p.body) } : {}) })),
    clock: Math.max(0, finite(v.clock, v.history?.at(-1)?.clock || 0)),
    fold: normalizeFold(v.fold || ((Array.isArray(v.observed) ? v.observed : []).some(p => p?.id === 'r6-booth-guard' && p.gone) ? { phase: 'spent' } : {})),
    locomotion: normalizeLocomotion(v.locomotion),
    playback: { started: !!v.playback?.started, done: !!v.playback?.done, elapsed: Math.max(0, finite(v.playback?.elapsed)) },
  };
}

export function createOutskirtsExperience(initialState) {
  const state = normalizeOutskirtsExperience(initialState);
  const events = [];
  // Delivery cursors are deliberately not saved: the first rendered/ticked
  // sample after a load establishes the current pose without replaying it.
  const womanCueSamples = new Map();
  function boundHistory(pass) {
    if (state.history.length <= 1800) return;
    const take = (points, limit) => points.length <= limit ? points : Array.from({ length: limit }, (_, i) => points[Math.round(i * (points.length - 1) / (limit - 1))]);
    // Keep the preceding walk and the current pass's starting clock even after
    // a very long stop/turn. Older traversals share the remaining bounded space.
    const previous = take(state.history.filter(p => p.pass === pass - 1), 800);
    const current = take(state.history.filter(p => p.pass === pass), 800);
    const older = take(state.history.filter(p => p.pass !== pass && p.pass !== pass - 1), 1800 - previous.length - current.length);
    state.history = [...older, ...previous, ...current].sort((a, b) => a.clock - b.clock);
  }
  function remember({ pass, along, across, yaw = 0, body = null }) {
    const clock = state.clock;
    const previous = state.history.at(-1);
    const sameRest = p => p?.pass === pass && p.body?.clip === 'idle' && p.body.walkWeight === 0 && p.body.speed === 0
      && Math.abs(p.along - along) < .001 && Math.abs(p.across - across) < .001 && Math.abs(angle(p.yaw - yaw)) < .001
      && ['pitch', 'heading', 'headYaw', 'floorOffset'].every(key => Math.abs(p.body[key] - body[key]) < .001);
    if (body?.clip === 'idle' && body.walkWeight === 0 && body.speed === 0 && sameRest(previous) && sameRest(state.history.at(-2))) {
      // Two keys retain the real duration of a pause. Repeating an identical
      // stance every second would eventually erase the walk being replayed.
      state.history[state.history.length - 1] = { pass, along, across, yaw, clock, body: { ...body } };
      return;
    }
    if (!previous || previous.pass !== pass || Math.abs(previous.along - along) > .65
      || Math.abs(previous.across - across) > .25 || Math.abs(previous.yaw - yaw) > .16
      || clock - previous.clock > (body && body.walkWeight > .05 ? .15 : 1.2)
      || (body && previous.body && (Math.abs(body.pitch - previous.body.pitch) > .12 || body.clip !== previous.body.clip))) {
      state.history.push({ pass, along, across, yaw, clock, ...(body ? { body: { ...body } } : {}) });
      boundHistory(pass);
    }
  }
  function echo(pass, localAlong, repeatMetres, startMetres, timeOffset = 0) {
    // Replay the preceding traversal on its recorded clock. If the player stops
    // now, the earlier walk continues; its own pauses and turns still happen.
    const samples = state.history.filter(p => p.pass === pass - 1);
    if (!samples.length) return null;
    const began = state.history.find(p => p.pass === pass);
    let best = samples[0], bestIndex = 0;
    if (began) {
      const at = samples[0].clock + Math.max(0, state.clock - began.clock + timeOffset);
      for (let i = 0; i < samples.length; i++) {
        best = samples[i];
        bestIndex = i;
        const next = samples[i + 1];
        if (!next || next.clock > at) {
          if (next) {
            const t = clamp((at - best.clock) / (next.clock - best.clock || 1), 0, 1);
            const turn = Math.atan2(Math.sin(next.yaw - best.yaw), Math.cos(next.yaw - best.yaw));
            const body = best.body || next.body;
            const interpolated = body ? { ...body } : null;
            if (interpolated && best.body && next.body) {
              for (const key of ['pitch', 'speed', 'gaitTime', 'walkWeight', 'clipTime', 'leftContact', 'rightContact', 'floorOffset']) interpolated[key] = mix(best.body[key], next.body[key], t);
              for (const key of ['heading', 'headYaw']) interpolated[key] = best.body[key] + angle(next.body[key] - best.body[key]) * t;
              if (best.body.clip !== next.body.clip) { interpolated.clip = t < .5 ? best.body.clip : next.body.clip; interpolated.clipTime = t < .5 ? best.body.clipTime : next.body.clipTime; }
            }
            best = { along: mix(best.along, next.along, t), across: mix(best.across, next.across, t), yaw: best.yaw + turn * t, clock: at,
              ...(interpolated ? { body: interpolated } : {}) };
          }
          break;
        }
      }
    } else {
      const target = startMetres + (pass - 1) * repeatMetres + localAlong;
      for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i].along - target) < Math.abs(best.along - target)) { best = samples[i]; bestIndex = i; }
    }
    // Old saves have a genuine recorded root path but no rig track. Their body
    // is a deterministic reconstruction, never represented as captured joints.
    const before = samples[Math.max(0, bestIndex === samples.length - 1 ? bestIndex - 1 : bestIndex)];
    const after = samples[Math.min(samples.length - 1, bestIndex + 1)];
    const distance = Math.hypot(after.along - before.along, after.across - before.across);
    const speed = distance / Math.max(.1, after.clock - before.clock);
    const body = best.body || normalizeLocomotion({ pass: pass - 1, along: best.along, across: best.across, yaw: best.yaw, heading: best.yaw,
      gaitTime: Math.max(0, best.along - startMetres - (pass - 1) * repeatMetres) / GAIT_METRES * GAIT_SECONDS,
      speed, walkWeight: speed > .05 ? 1 : 0, clip: speed > .05 ? 'walk' : 'idle', clipTime: best.clock || 0 });
    return { across: best.across, yaw: best.yaw, along: startMetres + (pass + 1) * repeatMetres + (best.along - startMetres - (pass - 1) * repeatMetres), body: { ...body }, recordedClock: best.clock || 0 };
  }
  function characterFrame() { return normalizeOutskirtsCharacterFrame(state); }
  function applyCharacterFrame(value) {
    const frame = normalizeOutskirtsCharacterFrame(value);
    if (!frame) return false;
    state.clock = frame.clock; state.fold = frame.fold; state.locomotion = frame.locomotion;
    state.busStage = frame.busStage; state.woman = frame.woman;
    womanCueSamples.clear();
    return true;
  }
  function tickCharacters(dt, { pass = 0, along = 0, across = 0, yaw = 0, pitch = 0, speed: suppliedSpeed,
    moving: suppliedMoving, floorOffset = 0, foldNear = false, foldPosition = {}, seed = 0, record = true, suspended = false } = {}) {
    const delta = suspended ? 0 : clamp(dt, 0, .25);
    if (!delta) return { transition: false, frame: characterFrame() };
    state.clock = Math.round((state.clock + delta) * 1e6) / 1e6;
    const previous = state.locomotion;
    const samePass = previous && previous.pass === pass;
    const distance = samePass ? Math.hypot(along - previous.along, across - previous.across) : 0;
    const moved = distance > .005 && distance < 3;
    const motionUntil = moved ? state.clock + .22 : previous?.motionUntil || 0;
    const speed = Number.isFinite(suppliedSpeed) ? clamp(suppliedSpeed, 0, 5) : moved ? Math.min(3, distance / delta) : state.clock < motionUntil ? previous?.speed || 0 : 0;
    const moving = suppliedMoving == null ? speed > .05 : !!suppliedMoving;
    const heading = moved ? Math.atan2(across - previous.across, along - previous.along)
      : previous ? angle(previous.heading + clamp(angle(yaw - previous.heading), -delta * 1.8, delta * 1.8)) : yaw;
    const turning = !moving && previous && Math.abs(angle(yaw - previous.yaw)) > .015;
    const clip = moving ? 'walk' : turning ? 'turn' : previous?.clip === 'turn' && previous.clipTime < 1.2 ? 'turn' : 'idle';
    const clipTime = clip === previous?.clip ? previous.clipTime + delta : 0;
    const gaitTime = (previous?.gaitTime || 0) + (moved ? distance : 0) / GAIT_METRES * GAIT_SECONDS;
    const walkWeight = clamp((previous?.walkWeight || 0) + (moving ? 1 : -1) * delta / .18, 0, 1);
    const cycle = (gaitTime % GAIT_SECONDS) / GAIT_SECONDS;
    const contactBoundary = Math.min(cycle, Math.abs(cycle - .5), 1 - cycle) < 1e-5;
    state.locomotion = normalizeLocomotion({ pass, along, across, yaw, pitch, heading, headYaw: angle(yaw - heading), speed, gaitTime,
      walkWeight, clip, clipTime, leftContact: !moving || contactBoundary || cycle >= .5 ? 1 : 0,
      rightContact: !moving || contactBoundary || cycle < .5 ? 1 : 0, floorOffset, motionUntil });
    if (record) remember({ pass, along, across, yaw, body: state.locomotion });
    const fold = state.fold;
    let transition = false;
    const cue = (id, kind, strength) => {
      if (fold.cues.includes(id)) return;
      fold.cues.push(id); state.actions.push(id);
      events.push({ id, cue: kind, ...foldPosition, strength });
    };
    if (fold.phase === 'armed' && foldNear) {
      fold.phase = 'force'; fold.elapsed = 0; fold.seed = Math.floor(clamp(seed, 0, 0xffffffff)); transition = true;
      cue('r6:fold-start', 'fold-cloth', .48);
    } else if (fold.phase === 'force' || fold.phase === 'pain') {
      const before = fold.elapsed; fold.elapsed = Math.round((fold.elapsed + delta) * 1e6) / 1e6;
      if (before < 1.1 && fold.elapsed >= 1.1) { transition = true; cue('r6:fold-force', 'fold-pressure', .68); }
      if (before < 2.55 && fold.elapsed >= 2.55) { fold.phase = 'pain'; transition = true; cue('r6:fold-land', 'fold-contact', .75); }
      if (before < 12 && fold.elapsed >= 12) transition = true;
      const effort = effortIndexAt(fold.elapsed);
      if (effort > fold.lastEffort) transition = true;
      for (let i = fold.lastEffort + 1; i <= effort; i++) {
        if (i === 0) cue('r6:fold-strain', 'fold-strain', .62);
        else {
          const continuation = i >= FOLD_EFFORTS.length, marker = continuation ? (i - FOLD_EFFORTS.length) % WRITHE_EFFORTS.length : i;
          events.push({ id: `r6:fold-effort:${i}`, cue: 'fold-effort', ...foldPosition, variant: i % 3,
            strength: continuation ? ([1, 3].includes(marker) ? .38 : .58) : [.45, .62, .54][i % 3] });
        }
      }
      fold.lastEffort = effort;
    }
    return { transition, frame: characterFrame() };
  }
  function bus({ active, along, across, visible, near, crossed, position, acknowledgeYaw = .26 }) {
    if (!active) return state.busStage;
    const emit = (cue, strength) => events.push({ id: `outskirts-bus:${cue}`, cue, ...position, strength });
    if (state.busStage === 0 && visible) { state.busStage = 1; emit('bus-air', .5); }
    // A rushed player still gets the close event. Waiting at a safe distance
    // never consumes it; retreat never resets it.
    if (state.busStage < 2 && near) { state.busStage = 2; state.woman.acknowledgedAt = state.clock; state.woman.acknowledgeYaw = clamp(acknowledgeYaw, -.6, .6); emit('coat-rustle', .65); }
    if (state.busStage >= 2 && state.busStage < 3 && crossed) { state.busStage = 3; state.woman.stepAt = state.clock; emit('footstep', .8); }
    if (state.busStage === 3 && visible && crossed) state.busStage = 4;
    return state.busStage;
  }
  function action(id, cue, position, { strength, variant } = {}) {
    if (state.actions.includes(id)) return false;
    state.actions.push(id);
    events.push({ id, cue, ...position, strength: strength ?? (cue === 'hatch-impact' ? .8 : .5),
      ...(variant != null ? { variant } : {}) });
    return true;
  }
  function womanWrongOrigin({ actorId, mode, seconds, stage, position, near = false, visible = true,
    suspended = false, paused = false, replayed = false, reducedMotion = false, clock = state.clock } = {}) {
    if (typeof actorId !== 'string' || !/^[\w-]{1,64}$/.test(actorId)) return false;
    const sample = busWomanWrongOriginCuePlan({ mode, seconds, stage, clock, woman:state.woman });
    const previous = womanCueSamples.get(actorId);
    womanCueSamples.set(actorId, sample);
    if (womanCueSamples.size>32) womanCueSamples.delete(womanCueSamples.keys().next().value);
    if (!near || !visible || suspended || paused || replayed || reducedMotion || !sample
      || Math.abs(clock-state.clock)>.00001) return false;
    let changed=false;
    for (const cue of crossedBusWomanWrongOriginCues(previous,sample)) {
      const prefix=`woman-traction:${actorId}:${sample.kind}:${cue.phase}:`;
      const markers=state.actions.filter(id=>id.startsWith(prefix));
      const last=markers.reduce((n,id)=>Math.max(n,Number(id.slice(prefix.length))||0),-1);
      if (last>=sample.epoch) continue;
      // One high-water marker per actor/action/phase bounds persistence even
      // during a very long wait. Rewinding an old saved frame cannot replay it.
      state.actions=state.actions.filter(id=>!id.startsWith(prefix));
      changed=action(prefix+sample.epoch,'woman-traction',position,{strength:cue.strength,variant:cue.variant})||changed;
    }
    return changed;
  }
  function womanState({ ticketReturned, receiveId } = {}) {
    if (ticketReturned != null) state.woman.ticketReturned = !!ticketReturned;
    if (receiveId && state.woman.receivedAt == null) {
      state.woman.receivedAt = state.clock; state.woman.receiveId = receiveId;
    }
    return { ...state.woman };
  }
  return {
    remember, echo, bus, action, tickCharacters, characterFrame, applyCharacterFrame, womanState, womanWrongOrigin,
    setRoadLoop: ({ turns = state.loopTurns, holding = state.loopHolding } = {}) => {
      state.loopTurns = Math.floor(clamp(turns, 0, 1_000_000)); state.loopHolding = holding === true;
      return { turns: state.loopTurns, holding: state.loopHolding };
    },
    rebaseRoadLocomotion: deltaAlong => {
      // Recorded earlier traversals remain original evidence. Only the live
      // derivative used to measure this frame's speed changes coordinate frame.
      if (state.locomotion && Number.isFinite(deltaAlong)) state.locomotion.along += deltaAlong;
    },
    busStage: () => state.busStage,
    hasAction: id => state.actions.includes(id),
    events: () => events.splice(0),
    setPlayback: value => { state.playback = { ...state.playback, ...value }; },
    playback: () => ({ ...state.playback }),
    snapshot: ({ seen = state.seen, lampsOff = state.lampsOff, observed = state.observed } = {}) => ({
      ...state, seen: [...seen], lampsOff: [...lampsOff], observed,
      actions: [...state.actions], history: state.history.map(p => ({ ...p, ...(p.body ? { body: { ...p.body } } : {}) })),
      fold: { ...state.fold, cues: [...state.fold.cues] }, locomotion: state.locomotion && { ...state.locomotion }, woman: { ...state.woman }, playback: { ...state.playback },
    }),
  };
}
