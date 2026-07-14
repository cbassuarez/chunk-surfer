import {
  CHUNK_SURF_FLAGS,
  CHUNK_SURF_REQUIRED_ROOMS,
  CHUNK_SURF_ROOMS,
  chunkSurfRoom,
  chunkSurfRouteProfile,
} from '../data/chunk-surf-script.js';

const DIRS = Object.freeze(['north', 'east', 'south', 'west']);
const opposite = Object.freeze({ north: 'south', east: 'west', south: 'north', west: 'east' });

const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];

export function canOfferChunkSurf({
  completedTakes = 0,
  roomId = '',
  alreadyCompleted = false,
} = {}) {
  if (alreadyCompleted) return false;
  if (Number(completedTakes) < 4) return false;
  if (roomId && roomId !== 'lux_nova' && roomId !== 'chapel' && roomId !== 'chapel_approach') return false;
  return true;
}

export function createChunkSurfState({
  drankCoffee = false,
  hasRig = false,
  endingsSeen = [],
  seed = 4417,
} = {}) {
  const profile = chunkSurfRouteProfile({ drankCoffee, hasRig, endingsSeen });
  return {
    active: true,
    profile,
    seed: Number(seed) || 4417,
    roomId: 'approach',
    facing: 'north',
    hasFork: false,
    tuned: [],
    inspected: [],
    recorded: [],
    visited: ['approach'],
    redacted: null,
    completed: false,
    scare: null,
    log: [],
  };
}

export function normalizeChunkSurfState(value = null) {
  if (!value || typeof value !== 'object') return null;
  const state = createChunkSurfState({
    drankCoffee: value.profile?.mandatory,
    hasRig: value.profile?.bestEligible,
    seed: value.seed,
  });
  return {
    ...state,
    ...value,
    profile: value.profile || state.profile,
    roomId: chunkSurfRoom(value.roomId)?.id || 'approach',
    facing: DIRS.includes(value.facing) ? value.facing : 'north',
    hasFork: !!value.hasFork,
    tuned: unique(value.tuned),
    inspected: unique(value.inspected),
    recorded: unique(value.recorded),
    visited: unique(value.visited).length ? unique(value.visited) : ['approach'],
    redacted: value.redacted || null,
    completed: !!value.completed,
    scare: value.scare || null,
    log: Array.isArray(value.log) ? value.log.slice(-12) : [],
  };
}

export function currentChunkSurfRoom(state) {
  return chunkSurfRoom(state?.roomId);
}

function pushLog(state, text, tone = 'primary') {
  return {
    ...state,
    log: [...(state.log || []), { text: String(text || ''), tone }].slice(-12),
  };
}

function mark(state, key, roomId = state.roomId) {
  return { ...state, [key]: unique([...(state[key] || []), roomId]) };
}

export function turnChunkSurf(state, dir) {
  const s = normalizeChunkSurfState(state);
  if (!s || s.completed) return s;
  const idx = DIRS.indexOf(s.facing);
  if (dir === 'left') return { ...s, facing: DIRS[(idx + 3) % 4] };
  if (dir === 'right') return { ...s, facing: DIRS[(idx + 1) % 4] };
  if (DIRS.includes(dir)) return { ...s, facing: dir };
  return s;
}

export function moveChunkSurf(state, dir = 'forward') {
  let s = normalizeChunkSurfState(state);
  if (!s || s.completed) return s;
  const facing = dir === 'back' ? opposite[s.facing] : s.facing;
  const room = currentChunkSurfRoom(s);
  const next = room.exits?.[facing];
  if (!next) {
    if (s.roomId === 'approach' && dir === 'back') {
      return {
        ...pushLog(s, 'Behind you, the corridor breathes in.', 'danger'),
        scare: { reason: 'turned-back', atRoom: s.roomId },
      };
    }
    return pushLog(s, 'The text is solid here.', 'secondary');
  }
  s = {
    ...s,
    roomId: next,
    visited: unique([...s.visited, next]),
    scare: null,
  };
  return pushLog(s, `ENTER ${chunkSurfRoom(next).title}`, 'secondary');
}

export function inspectChunkSurf(state) {
  let s = normalizeChunkSurfState(state);
  if (!s || s.completed) return s;
  const room = currentChunkSurfRoom(s);
  s = mark(s, 'inspected');
  return pushLog(s, room.inspect || 'The line has no comment.', 'primary');
}

export function tuneChunkSurf(state) {
  let s = normalizeChunkSurfState(state);
  if (!s || s.completed) return s;
  const room = currentChunkSurfRoom(s);
  if (!s.hasFork && !room.givesFork) {
    return pushLog(s, 'Nothing in your hand can make the false line vibrate.', 'secondary');
  }
  s = mark(s, 'tuned');
  if (room.givesFork) s = { ...s, hasFork: true };
  return pushLog(s, room.tune || 'The line vibrates and refuses to become clearer.', room.givesFork ? 'green' : 'primary');
}

export function recordChunkSurf(state) {
  let s = normalizeChunkSurfState(state);
  if (!s || s.completed) return s;
  const room = currentChunkSurfRoom(s);
  if (!s.hasFork) return pushLog(s, 'The recorder clicks. Something behind the click screams.', 'danger');
  s = mark(s, 'recorded');
  return pushLog(s, room.record || 'The take comes back wrong.', 'blue');
}

export function redactChunkSurf(state, redactionId) {
  let s = normalizeChunkSurfState(state);
  if (!s || s.completed) return s;
  const room = currentChunkSurfRoom(s);
  if (room.kind !== 'final') return pushLog(s, 'There is nothing here stable enough to redact.', 'secondary');
  const redaction = room.redactions?.find((entry) => entry.id === redactionId) || room.redactions?.[0];
  if (!redaction) return s;
  const requiredDone = CHUNK_SURF_REQUIRED_ROOMS.every((id) => s.tuned.includes(id) || id === 'approach');
  const optionalDone = ['recordist-loop', 'surfer-origin', 'work-order-loop'].filter((id) => s.tuned.includes(id) || s.recorded.includes(id));
  const bestEligible = !!(
    redaction.correct &&
    s.profile?.bestEligible &&
    s.hasFork &&
    requiredDone &&
    optionalDone.length >= 2 &&
    s.recorded.includes('body-room')
  );
  s = {
    ...s,
    redacted: redaction.id,
    completed: true,
    bestEligible,
  };
  return pushLog(s, redaction.result, redaction.correct ? 'green' : 'danger');
}

export function chunkSurfFlagsForState(state) {
  const s = normalizeChunkSurfState(state);
  if (!s) return [];
  return [
    CHUNK_SURF_FLAGS.entered,
    ...(s.completed ? [CHUNK_SURF_FLAGS.completed] : []),
    ...(s.hasFork ? [CHUNK_SURF_FLAGS.fork] : []),
    ...(s.tuned.includes('body-room') ? [CHUNK_SURF_FLAGS.trueLine] : []),
    ...(s.tuned.includes('recordist-loop') || s.recorded.includes('recordist-loop') ? [CHUNK_SURF_FLAGS.optionalRecordist] : []),
    ...(s.tuned.includes('surfer-origin') || s.recorded.includes('surfer-origin') ? [CHUNK_SURF_FLAGS.optionalSurfer] : []),
    ...(s.tuned.includes('work-order-loop') || s.recorded.includes('work-order-loop') ? [CHUNK_SURF_FLAGS.optionalWorkOrder] : []),
    ...(s.redacted === 'body' ? [CHUNK_SURF_FLAGS.correctRedaction] : []),
    ...(s.bestEligible ? [CHUNK_SURF_FLAGS.bestEligible] : []),
  ];
}

export function chunkSurfCompletion(state) {
  const s = normalizeChunkSurfState(state);
  if (!s?.completed) return { completed: false, bestEligible: false, savedRecordist: false };
  const savedRecordist = !!s.bestEligible;
  return {
    completed: true,
    bestEligible: !!s.bestEligible,
    savedRecordist,
    flags: chunkSurfFlagsForState(s),
  };
}

export function chunkSurfProbe(state) {
  const s = normalizeChunkSurfState(state);
  if (!s) return null;
  const room = currentChunkSurfRoom(s);
  return {
    roomId: s.roomId,
    title: room.title,
    facing: s.facing,
    hasFork: s.hasFork,
    tuned: [...s.tuned],
    recorded: [...s.recorded],
    visited: [...s.visited],
    redacted: s.redacted,
    completed: s.completed,
    bestEligible: !!s.bestEligible,
    profile: { ...s.profile },
    exits: { ...(room.exits || {}) },
  };
}

export { CHUNK_SURF_ROOMS };
