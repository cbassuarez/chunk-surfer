export const CAUSAL_TAPE_SCHEMA = 1;
export const CAUSAL_TOPOLOGY_HASH = 'conservatory-night:v2';
export const CAUSAL_SPINE_IDS = Object.freeze([
  'spine:service-threshold',
  'spine:b3-first-slate',
  'spine:second-recording',
  'spine:first-reference',
  'spine:practice-wing',
  'spine:source-threshold',
  'spine:bell-row',
  'spine:chapel-contact',
]);
export const CAUSAL_ACTORS = Object.freeze([
  'hush',
  'playerShadow',
  'chunkSurfer',
  'building',
  'system',
]);

const ACTOR_SET = new Set(CAUSAL_ACTORS);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const rounded = (value, places = 4) => {
  const scale = 10 ** places;
  return Math.round(finite(value) * scale) / scale;
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function causalContentHash(value) {
  const source = { ...(value || {}) };
  delete source.contentHash;
  const text = canonicalJson(source);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + i;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

function normalizeFrame(frame = {}) {
  return {
    t: Math.max(0, Math.round(finite(frame.t))),
    x: rounded(frame.x),
    y: rounded(frame.y),
    floorH: rounded(frame.floorH),
    yaw: rounded(frame.yaw),
    pitch: rounded(frame.pitch),
    roomId: typeof frame.roomId === 'string' ? frame.roomId : '',
    renderGroup: typeof frame.renderGroup === 'string' ? frame.renderGroup : '',
    spaceId: typeof frame.spaceId === 'string' && frame.spaceId ? frame.spaceId : 'conservatory',
    perceived: !!frame.perceived,
  };
}

function deltaFrame(previous, current) {
  const delta = { dt: current.t - previous.t };
  for (const key of ['x', 'y', 'floorH', 'yaw', 'pitch']) {
    const value = rounded(current[key] - previous[key]);
    if (value) delta[key] = value;
  }
  for (const key of ['roomId', 'renderGroup', 'spaceId', 'perceived']) {
    if (current[key] !== previous[key]) delta[key] = current[key];
  }
  return delta;
}

export function packShadowFrames(frames, segmentMs = 30_000) {
  const sorted = (Array.isArray(frames) ? frames : [])
    .map(normalizeFrame)
    .sort((a, b) => a.t - b.t);
  const segments = [];
  let current = null;
  let previous = null;
  for (const frame of sorted) {
    const start = Math.floor(frame.t / segmentMs) * segmentMs;
    if (!current || current.start !== start) {
      current = { start, base: frame, deltas: [] };
      segments.push(current);
      previous = frame;
      continue;
    }
    current.deltas.push(deltaFrame(previous, frame));
    previous = frame;
  }
  return segments;
}

export function unpackShadowFrames(segments) {
  const out = [];
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment?.base) continue;
    let previous = normalizeFrame(segment.base);
    out.push(previous);
    for (const raw of Array.isArray(segment.deltas) ? segment.deltas : []) {
      const next = { ...previous, t: previous.t + Math.max(0, Math.round(finite(raw.dt))) };
      for (const key of ['x', 'y', 'floorH', 'yaw', 'pitch']) {
        if (raw[key] != null) next[key] = rounded(previous[key] + finite(raw[key]));
      }
      for (const key of ['roomId', 'renderGroup', 'spaceId', 'perceived']) {
        if (raw[key] != null) next[key] = raw[key];
      }
      previous = normalizeFrame(next);
      out.push(previous);
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function normalizeEvent(event = {}, index = 0) {
  const actor = ACTOR_SET.has(event.actor) ? event.actor : 'system';
  return {
    id: typeof event.id === 'string' && event.id ? event.id : `event:${index}`,
    at: Math.max(0, Math.round(finite(event.at))),
    order: Math.max(0, Math.round(finite(event.order, index))),
    type: typeof event.type === 'string' ? event.type : 'unknown',
    actor,
    payload: canonicalize(event.payload && typeof event.payload === 'object' ? event.payload : {}),
  };
}

function normalizeAnchor(anchor = {}, index = 0) {
  return {
    id: typeof anchor.id === 'string' && anchor.id ? anchor.id : `anchor:${index}`,
    at: Math.max(0, Math.round(finite(anchor.at))),
    order: Math.max(0, Math.round(finite(anchor.order, index))),
    verb: ['taunt', 'haunt', 'manifest', 'contact'].includes(anchor.verb) ? anchor.verb : 'haunt',
    locus: {
      x: rounded(anchor.locus?.x),
      y: rounded(anchor.locus?.y),
      floorH: rounded(anchor.locus?.floorH),
      roomId: typeof anchor.locus?.roomId === 'string' ? anchor.locus.roomId : '',
      spaceId: typeof anchor.locus?.spaceId === 'string' && anchor.locus.spaceId ? anchor.locus.spaceId : 'conservatory',
      radius: Math.max(0.5, rounded(anchor.locus?.radius, 2) || 2.5),
    },
    armingWindowMs: Math.max(1, Math.round(finite(anchor.armingWindowMs, 6000))),
    weight: anchor.verb === 'contact' || Number(anchor.weight) === 2 ? 2 : 1,
    required: !!anchor.required,
    class: anchor.class === 'incidental' ? 'incidental' : anchor.required ? 'spine' : 'authored',
    payload: canonicalize(anchor.payload && typeof anchor.payload === 'object' ? anchor.payload : {}),
  };
}

export function sealCausalTape(value = {}) {
  const events = (Array.isArray(value.events) ? value.events : [])
    .map(normalizeEvent)
    .sort((a, b) => a.at - b.at || a.order - b.order || a.id.localeCompare(b.id));
  const anchors = (Array.isArray(value.anchors) ? value.anchors : [])
    .map(normalizeAnchor)
    .sort((a, b) => a.at - b.at || a.order - b.order || a.id.localeCompare(b.id));
  const tape = {
    schema: CAUSAL_TAPE_SCHEMA,
    topologyHash: typeof value.topologyHash === 'string' ? value.topologyHash : CAUSAL_TOPOLOGY_HASH,
    runId: String(value.runId || ''),
    returnSummaryId: String(value.returnSummaryId || ''),
    endingId: String(value.endingId || ''),
    durationMs: Math.max(0, Math.round(finite(value.durationMs))),
    qualification: {
      injuries: Math.max(0, Math.floor(finite(value.qualification?.injuries))),
      difficulty: String(value.qualification?.difficulty || 'contract'),
      completedAt: Math.max(0, Math.round(finite(value.qualification?.completedAt, Date.now()))),
    },
    shadowFrames: value.shadowFrames?.[0]?.base
      ? value.shadowFrames
      : packShadowFrames(value.shadowFrames),
    events,
    anchors,
    presentationIntervals: (Array.isArray(value.presentationIntervals) ? value.presentationIntervals : [])
      .map((interval) => ({
        start: Math.max(0, Math.round(finite(interval.start))),
        end: Math.max(0, Math.round(finite(interval.end))),
        id: String(interval.id || 'scene'),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end),
    requirements: {
      // Topology v2 is defined by the authored causal spine. Keeping this in
      // the sealed contract (instead of trusting a caller flag) prevents a
      // structurally incomplete current-topology tape from being promoted.
      causalSpine: (value.topologyHash||CAUSAL_TOPOLOGY_HASH)===CAUSAL_TOPOLOGY_HASH||value.requireCausalSpine
        ? [...CAUSAL_SPINE_IDS] : [],
    },
  };
  return Object.freeze({ ...tape, contentHash: causalContentHash(tape) });
}

export function validateCausalTape(tape, { topologyHash = CAUSAL_TOPOLOGY_HASH } = {}) {
  if (!tape || tape.schema !== CAUSAL_TAPE_SCHEMA) return { ok: false, reason: 'SOURCE_TAPE_INCOMPATIBLE' };
  if (tape.topologyHash !== topologyHash) return { ok: false, reason: 'TOPOLOGY_INCOMPATIBLE' };
  if (!tape.runId || !tape.returnSummaryId || !tape.endingId) return { ok: false, reason: 'TAPE_INCOMPLETE' };
  if (causalContentHash(tape) !== tape.contentHash) return { ok: false, reason: 'CHECKSUM_FAILURE' };
  const required = tape.topologyHash===CAUSAL_TOPOLOGY_HASH
    ? CAUSAL_SPINE_IDS
    : Array.isArray(tape.requirements?.causalSpine) ? tape.requirements.causalSpine : [];
  const anchorIds = new Set((tape.anchors || []).map((anchor) => anchor.id));
  if (required.some((id) => !anchorIds.has(id))) return { ok: false, reason: 'CAUSAL_SPINE_INCOMPLETE' };
  if ((tape.shadowFrames || []).some((segment) => !segment?.base?.spaceId)) return { ok: false, reason: 'SPACE_DATA_INCOMPLETE' };
  if ((tape.anchors || []).some((anchor) => !anchor?.locus?.spaceId)) return { ok: false, reason: 'SPACE_DATA_INCOMPLETE' };
  return { ok: true, tape };
}

export function tapeQualifies(injuries) {
  return Math.max(0, Math.floor(finite(injuries))) <= 1;
}

export function shadowFrameAt(tape, at) {
  const frames = unpackShadowFrames(tape?.shadowFrames);
  if (!frames.length) return null;
  const t = Math.max(0, finite(at));
  let left = frames[0];
  let right = frames[frames.length - 1];
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].t >= t) { right = frames[i]; left = frames[i - 1]; break; }
    left = frames[i];
  }
  if (right.t <= left.t || t <= left.t) return { ...left };
  const mix = Math.min(1, Math.max(0, (t - left.t) / (right.t - left.t)));
  const result = { ...left, t: Math.round(t) };
  for (const key of ['x', 'y', 'floorH', 'yaw', 'pitch']) result[key] = rounded(left[key] + (right[key] - left[key]) * mix);
  if (mix >= 0.5) {
    result.roomId = right.roomId;
    result.renderGroup = right.renderGroup;
    result.spaceId = right.spaceId;
    result.perceived = right.perceived;
  }
  return result;
}
