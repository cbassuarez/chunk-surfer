// What the Surfer can throw back at the player during the Source fight.
//
// This is deliberately smaller and earlier-lived than a causal tape. A causal
// tape is sealed after an ending; the Source fight happens before that seal and
// must survive a quit. The manifest keeps only authored provenance plus a
// bounded set of player poses. It never stores microphone or program audio.

export const SOURCE_REPLAY_SCHEMA = 2;
export const SOURCE_REPRISE_IDS = Object.freeze(['call-site', 'borrowed-body', 'final-clause']);

const MAX_TAKES = 8;
const MAX_BATTLES = 12;
const MAX_CONTACTS = 8;
const MAX_FRAMES = 96;
const MAX_ID = 96;

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value, fallback = '') => typeof value === 'string' ? value.slice(0, MAX_ID) : fallback;
const point = (value) => {
  const source = object(value);
  if (!Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.y))) return null;
  return { x: Number(source.x), y: Number(source.y) };
};

function pose(value) {
  const source = object(value);
  if (!Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.y))) return null;
  return {
    t: Math.max(0, Math.round(finite(source.t))),
    x: Number(source.x),
    y: Number(source.y),
    yaw: finite(source.yaw),
    pitch: finite(source.pitch),
    floorH: finite(source.floorH),
    roomId: text(source.roomId),
    renderGroup: text(source.renderGroup),
    spaceId: text(source.spaceId),
  };
}

function boundedFrames(value) {
  const frames = (Array.isArray(value) ? value : []).map(pose).filter(Boolean);
  if (frames.length <= MAX_FRAMES) return frames;
  const out = [];
  for (let index = 0; index < MAX_FRAMES; index += 1) {
    out.push(frames[Math.round(index * (frames.length - 1) / (MAX_FRAMES - 1))]);
  }
  return out;
}

function normalizeTake(value, index = 0) {
  const source = object(value);
  const roomId = text(source.roomId);
  if (!roomId) return null;
  // Schema 1 accidentally treated `place` (the hall-deck label used by the
  // ordinary recorder) as a point. Accept the briefly-written point shape as a
  // legacy mark, but keep the two facts separate from here on: `mark` is where
  // the punch-in happened, `place` is what part of the room it was called.
  const legacyMark = point(source.place);
  return {
    ordinal: Math.max(1, Math.floor(finite(source.ordinal, index + 1))),
    roomId,
    mark: point(source.mark) || legacyMark,
    place: typeof source.place === 'string' ? text(source.place) : '',
    contaminated: !!source.contaminated,
    startedAt: Math.max(0, Math.round(finite(source.startedAt))),
    completedAt: Math.max(0, Math.round(finite(source.completedAt))),
    approach: boundedFrames(source.approach),
    fallback: !!source.fallback,
  };
}

function normalizeBattle(value) {
  const source = object(value);
  const id = text(source.id);
  if (!id) return null;
  return {
    id,
    result: ['win', 'lose', 'abort'].includes(source.result) ? source.result : 'win',
    at: Math.max(0, Math.round(finite(source.at))),
    locus: point(source.locus),
    frames: boundedFrames(source.frames),
  };
}

function normalizeContact(value) {
  const source = object(value);
  const reason = text(source.reason, 'contact');
  return {
    reason,
    at: Math.max(0, Math.round(finite(source.at))),
    injuryCount: Math.max(0, Math.floor(finite(source.injuryCount))),
    locus: point(source.locus),
    frames: boundedFrames(source.frames),
  };
}

function normalizeSourceEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = object(value);
  return {
    at: Math.max(0, Math.round(finite(source.at))),
    locus: point(source.locus),
    frames: boundedFrames(source.frames),
  };
}

function normalizeEncounter(value) {
  const source = object(value);
  const completed = [...new Set((Array.isArray(source.completed) ? source.completed : [])
    .filter((id) => SOURCE_REPRISE_IDS.includes(id)))];
  const active = SOURCE_REPRISE_IDS.includes(source.active) ? source.active : null;
  return {
    completed,
    active,
    movementIndex: Math.max(0, Math.min(2, Math.floor(finite(source.movementIndex)))),
    // Combat owns the meaning of this opaque, JSON-safe continuation. The
    // manifest only makes the handoff durable; the combat normalizer validates
    // it again before use.
    continuation: source.continuation && typeof source.continuation === 'object'
      ? structuredClone(source.continuation)
      : null,
  };
}

export function freshSourceReplayManifest({ runId = '' } = {}) {
  return {
    schema: SOURCE_REPLAY_SCHEMA,
    runId: text(runId),
    takes: [],
    battles: [],
    hushContacts: [],
    sourceEntry: null,
    encounter: normalizeEncounter(null),
  };
}

export function normalizeSourceReplayManifest(value, { runId = '' } = {}) {
  const source = object(value);
  const manifestRunId = text(source.runId) || text(runId);
  // Replay evidence belongs to one night. A copied/stale manifest must not
  // make a new run remember places that player has not visited.
  if (runId && manifestRunId && manifestRunId !== runId) return freshSourceReplayManifest({ runId });
  return {
    schema: SOURCE_REPLAY_SCHEMA,
    runId: manifestRunId,
    takes: (Array.isArray(source.takes) ? source.takes : []).slice(0, MAX_TAKES)
      .map(normalizeTake).filter(Boolean).sort((a, b) => a.ordinal - b.ordinal),
    battles: (Array.isArray(source.battles) ? source.battles : []).slice(-MAX_BATTLES)
      .map(normalizeBattle).filter(Boolean),
    hushContacts: (Array.isArray(source.hushContacts) ? source.hushContacts : []).slice(-MAX_CONTACTS)
      .map(normalizeContact).filter(Boolean),
    sourceEntry: normalizeSourceEntry(source.sourceEntry),
    encounter: normalizeEncounter(source.encounter),
  };
}

export function beginSourceReplayTake(manifest, {
  ordinal,
  roomId,
  mark = null,
  place = null,
  startedAt = 0,
  approach = [],
} = {}) {
  const base = normalizeSourceReplayManifest(manifest);
  return normalizeTake({ ordinal, roomId, mark, place, startedAt, approach }, base.takes.length);
}

export function completeSourceReplayTake(manifest, pending, {
  completedAt = 0,
  contaminated = false,
} = {}) {
  const base = normalizeSourceReplayManifest(manifest);
  const take = normalizeTake({ ...pending, completedAt, contaminated }, base.takes.length);
  if (!take) return base;
  const takes = base.takes.filter((entry) => entry.ordinal !== take.ordinal && entry.roomId !== take.roomId);
  takes.push(take);
  return normalizeSourceReplayManifest({ ...base, takes }, { runId: base.runId });
}

export function noteSourceReplayBattle(manifest, battle) {
  const base = normalizeSourceReplayManifest(manifest);
  return normalizeSourceReplayManifest({ ...base, battles: [...base.battles, battle] }, { runId: base.runId });
}

export function noteSourceReplayContact(manifest, contact) {
  const base = normalizeSourceReplayManifest(manifest);
  return normalizeSourceReplayManifest({ ...base, hushContacts: [...base.hushContacts, contact] }, { runId: base.runId });
}

export function noteSourceReplayEntry(manifest, entry) {
  const base = normalizeSourceReplayManifest(manifest);
  return normalizeSourceReplayManifest({ ...base, sourceEntry: entry }, { runId: base.runId });
}

export function checkpointSourceReprise(manifest, {
  id,
  movementIndex,
  continuation = null,
  completed = false,
} = {}) {
  const base = normalizeSourceReplayManifest(manifest);
  if (!SOURCE_REPRISE_IDS.includes(id)) return base;
  const completedIds = completed ? [...base.encounter.completed, id] : base.encounter.completed;
  return normalizeSourceReplayManifest({
    ...base,
    encounter: {
      completed: completedIds,
      active: completed ? null : id,
      movementIndex,
      continuation,
    },
  }, { runId: base.runId });
}

function takeSegment(take) {
  return {
    kind: 'recording-room',
    id: `take:${take.ordinal}:${take.roomId}`,
    roomId: take.roomId,
    takeOrdinal: take.ordinal,
    place: take.place,
    frames: take.approach,
    mark: take.mark,
    fallback: !!take.fallback || take.approach.length === 0,
  };
}

// Produces choreography facts, not dialogue. Empty evidence stays empty; the
// fallback may reconstruct a route through completed rooms but can never add a
// room, encounter, or contact the player did not actually reach.
export function buildSourceReprisePlan(manifest) {
  const source = normalizeSourceReplayManifest(manifest);
  const takes = source.takes.map(takeSegment);
  const firstBattle = source.battles[0] || null;
  const firstContact = source.hushContacts[0] || null;
  return {
    'call-site': {
      id: 'call-site',
      segments: takes.slice(0, 2),
      finalMark: takes[Math.min(1, takes.length - 1)]?.id || null,
    },
    'borrowed-body': {
      id: 'borrowed-body',
      segments: [
        firstBattle && { ...firstBattle, kind: 'battle-space', id: `battle:${firstBattle.id}` },
        firstContact && { ...firstContact, kind: 'hush-contact', id: `contact:${firstContact.at}` },
        takes[Math.min(1, takes.length - 1)] || null,
      ].filter(Boolean),
      finalMark: takes[Math.min(1, takes.length - 1)]?.id || null,
    },
    'final-clause': {
      id: 'final-clause',
      segments: [
        ...takes.slice(0, 4),
        source.sourceEntry && { ...source.sourceEntry, kind: 'source-threshold', id: 'source-entry' },
      ].filter(Boolean),
      finalMark: source.sourceEntry ? 'source-entry' : takes[Math.min(3, takes.length - 1)]?.id || null,
    },
  };
}

export function sourceReplayFallback({ runId = '', takes = [] } = {}) {
  return normalizeSourceReplayManifest({
    runId,
    takes: (Array.isArray(takes) ? takes : []).map((take, index) => ({
      ordinal: index + 1,
      roomId: take?.roomId,
      mark: take?.mark || take?.cell || null,
      place: take?.place || '',
      contaminated: !!take?.contaminated,
      approach: [],
      fallback: true,
    })),
  }, { runId });
}
