import { CHAPEL_CONGREGATION } from './chapel-dressing.js';

// One ongoing prayer, already in progress. These are existing bodies, not
// camera-relative voices or new people. A recorded group answers from one
// pew station at a time; copying that same recording into a synthetic choir
// would erase the small human congregation we actually have.
export const CHAPEL_SERVICE_ANCHORS = Object.freeze([
  { id: 'officiant', presenceId: 'chapel-dressing:celebrant', radius: 36, mouthHeight: 1.49 },
  { id: 'front', presenceId: 'chapel-dressing:presence-44', radius: 27, mouthHeight: 1.13 },
  { id: 'middle', presenceId: 'chapel-dressing:presence-28', radius: 25, mouthHeight: 1.13 },
  { id: 'rear', presenceId: 'chapel-dressing:presence-2', radius: 25, mouthHeight: 1.13 },
].map(station => {
  const body = CHAPEL_CONGREGATION.find(p => p.id === station.presenceId);
  if (!body) throw new Error(`Chapel service has no existing body for ${station.id}`);
  return Object.freeze({ ...station, x: body.x, y: body.y, scale: body.scale || 1 });
}));

export const CHAPEL_SERVICE = Object.freeze({
  cycleSeconds: 118,
  // An age/phase, never an entry cue. This clock is owned by the audio context
  // and continues during absence; no visit counter or progression is created.
  phaseOffsetSeconds: 31.6,
  gain: .78,
  dialogueGain: .16,
  fadeInSeconds: .85,
  fadeOutSeconds: .045,
  maxSources: 8,
  reverbSeconds: 3.8,
  preDelaySeconds: .028,
});

const event = (id, clip, at, anchor, extra = {}) => Object.freeze({ id, clip, at, anchor, ...extra });
export const CHAPEL_SERVICE_PHRASES = Object.freeze([
  event('pater-address', 'priest-pater-address', 0, 'officiant'),
  event('pater-bread', 'priest-pater-bread', 15.95, 'officiant'),
  event('pater-deliverance', 'priest-pater-deliverance', 27.75, 'officiant'),
  event('first-answer', 'response-amen', 38.4, 'rear'),
  event('communion', 'priest-communion-invitation', 53.9, 'officiant'),
  event('second-answer', 'response-amen', 72.5, 'middle'),
  event('blessing', 'priest-communion-blessing', 86.2, 'officiant'),
  event('last-answer', 'response-amen', 99.0, 'front'),
  event('cloth-a', 'movement-cloth', 12.2, 'middle'),
  event('pew-a', 'movement-pew', 47.1, 'rear'),
  event('cloth-b', 'movement-cloth', 80.4, 'front'),
  event('pew-b', 'movement-pew', 110.5, 'middle'),
]);

// Quiet recorded human occupancy, alternated with overlapping edge fades.
// Different room slices are never pitched into fake additional performers.
export const CHAPEL_SERVICE_BEDS = Object.freeze([
  event('room-a', 'room-a', 0, 'middle', { period: 13.8, bed: true }),
  event('room-b', 'room-b', 6.2, 'rear', { period: 13.8, bed: true }),
]);

export function chapelServiceEvents(time, clips, { phaseOffset = CHAPEL_SERVICE.phaseOffsetSeconds } = {}) {
  if (!Number.isFinite(time) || time < 0) return [];
  const byId = clips instanceof Map ? clips : new Map((clips || []).map(c => [c.id, c]));
  const age = time + phaseOffset, events = [];
  const append = (definition, cycle, period) => {
    const clip = byId.get(definition.clip);
    if (!clip || !(clip.duration > 0)) return;
    const at = cycle * period + definition.at - phaseOffset;
    // A long clause crossing an entry or a clock tick is joined in progress.
    // No missed-event queue is drained after a menu, take or distant visit.
    if (at + clip.duration <= time || at > time + .075) return;
    events.push({ ...definition, at, until: at + clip.duration,
      key: `${definition.id}:${cycle}`, clip });
  };
  const cycle = Math.floor(age / CHAPEL_SERVICE.cycleSeconds);
  for (const n of [cycle - 1, cycle]) for (const definition of CHAPEL_SERVICE_PHRASES) append(definition, n, CHAPEL_SERVICE.cycleSeconds);
  for (const definition of CHAPEL_SERVICE_BEDS) {
    const n = Math.floor((age - definition.at) / definition.period);
    for (const index of [n - 1, n]) append(definition, index, definition.period);
  }
  return events.sort((a, b) => a.at - b.at);
}
