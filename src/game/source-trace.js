// THE THREAD, ON THE MACHINE.
//
// Source used to print its objective in the corners — SOURCE / PRIMARY TRACE,
// SIGNAL N / DISTANT, TAPE 100% / 256M, BELLS 0 / 3 HEARD — which read as a
// debug overlay on the one place in the game that should have nothing on it.
// The corners are empty now. The recordist raises the DA-1000 and reads the
// thread off it: where he is on the tape, which way the signal is, and what he
// is looking for, in his own words. Bells are heard and felt, never counted.
//
// Pure: takes the runtime's sourceObjective() and where he is looking, returns
// the fields the recorder face already knows how to draw.
import { SOURCE_BELLS, SOURCE_CHAPEL_OUTSKIRTS, SOURCE_HORIZON } from '../data/source-level.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clock = (seconds) => {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

// What he is looking for, as he would put it — one per objective the runtime
// can return. Runtime labels stay as they are; they are specs' vocabulary.
const NOTES = Object.freeze({
  'open-foh-door': () => 'THE FOH DOOR. OPEN IT.',
  'leave-get-in': () => 'OUT OF THE DOCK. INTO THE WHITE.',
  'white-threshold': () => 'STEP INTO THE WHITE.',
  'shore-walk': () => 'KEEP WALKING. NOTHING TO AIM AT.',
  'first-stair': () => 'THE FIRST STAIR, AHEAD.',
  'long-hall': () => 'FOLLOW THE PAPER.',
  'still-page': () => 'ONE PAGE IS NOT MOVING. FIND IT.',
  'final-horizon': () => 'THE LAST PAGE, AT THE EDGE.',
  'return-paths': () => 'THE GREY DOORS, AT THE EDGE.',
  'normal-exit': () => 'THE GREY DOORS, AT THE EDGE.',
  'horizon-walk': (o) => /OPEN PATH/.test(o.label || '') ? 'THE PATH THE BUST CUT.'
    : o.target ? 'THE ROAD AHEAD.' : 'THE ROAD IS STILL UNDERFOOT.',
  'bell-field': (o) => /IS OPEN/.test(o.label || '') ? 'THE TOWER DOOR IS OPEN.'
    : /OPENS/.test(o.label || '') ? 'SOMETHING IN THESE DOORS OPENS THE TOWER.' : 'BETWEEN THE BELLS. QUIETLY.',
  'chapel-doors': (o) => /FIND/.test(o.label || '') ? 'THE CHAPEL DOOR, END OF THE ROW.' : 'THE TAPE HAS RUN OUT. KEEP WALKING.',
  'chapel-crossing': () => 'THROUGH THE CHAPEL DOOR.',
  'tower-crossing': () => 'INTO THE TOWER.',
});
export const SOURCE_TRACE_OBJECTIVE_IDS = Object.freeze(Object.keys(NOTES));

// What he thinks when he has stood too long without getting closer.
const NUDGES = Object.freeze({
  'horizon-walk': (o) => /OPEN PATH/.test(o.label || '') ? 'The path the bust cut. Follow it.'
    : o.target ? 'The road goes on ahead.' : 'The road is still here. Keep going if you want.',
  'bell-field': (o) => /IS OPEN/.test(o.label || '') ? "The tower door's open now."
    : /OPENS/.test(o.label || '') ? 'Something in these doors opens the tower.' : 'Between them. Slowly.',
  'chapel-doors': (o) => /FIND/.test(o.label || '') ? 'The chapel door is at the end of the row.' : 'Keep walking. The doors are further on.',
  'still-page': () => "One of these pages isn't moving.",
  'final-horizon': () => 'The last page. At the edge.',
  'long-hall': () => 'Follow the paper.',
});

export function sourceTraceNote(objective = {}) {
  const note = NOTES[objective?.id];
  return note ? note(objective) : 'NO THREAD HERE.';
}

export function sourceTraceNudge(objective = {}) {
  const nudge = NUDGES[objective?.id];
  return nudge ? nudge(objective) : 'If I lose the thread, the machine can find it.';
}

// Which way the signal is and how strong, from where he stands and looks.
// facingYaw uses the renderer's convention: forward is (sin yaw, -cos yaw).
export function sourceTraceSignal(objective = {}, { player = null, facingYaw = 0 } = {}) {
  const target = objective?.bearingEligible ? objective.target : null;
  if (!target || !player || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    return { available: false, strength: 0, direction: null, label: 'NO SIGNAL', db: -96 };
  }
  const dx = target.x - player.x, dy = target.y - player.y;
  const relative = wrap(Math.atan2(dx, -dy) - (Number(facingYaw) || 0));
  const facing = (Math.cos(relative) + 1) / 2;
  const metres = Number.isFinite(objective.distanceMeters) ? objective.distanceMeters : Math.hypot(dx, dy) * 0.5;
  const near = 0.6 + 0.4 / (1 + (metres / 80) ** 2);
  const strength = clamp01(facing * facing * near);
  const direction = Math.abs(relative) <= 0.4 ? 'AHEAD'
    : Math.abs(relative) >= 2.4 ? 'BEHIND'
      : relative > 0 ? 'RIGHT' : 'LEFT';
  return { available: true, strength, direction, label: `SIGNAL · ${direction}`, db: -48 + 48 * strength };
}

export function sourceTraceReadout(objective = {}, { player = null, facingYaw = 0 } = {}) {
  const id = objective?.id;
  const tapeSeconds = Number(SOURCE_HORIZON.tapeSeconds) || 0;
  const signal = sourceTraceSignal(objective, { player, facingYaw });
  let counter = '--:--', progress = 0, locationSeconds = 60;
  const locationMarks = [];
  if (id === 'horizon-walk') {
    locationSeconds = Math.max(1, tapeSeconds);
    // Short of the tape there is no position on it yet.
    if (!objective.target) counter = clock(clamp01(objective.horizonProgress) * tapeSeconds);
    progress = clamp01(objective.horizonProgress);
  } else if (id === 'bell-field') {
    counter = clock(tapeSeconds);
    progress = clamp01(objective.horizonProgress);
    const length = Number(SOURCE_BELLS.length);
    const from = Number(SOURCE_BELLS.from);
    if (length > 0 && Number.isFinite(from)) {
      const at = (y) => clamp01((from - y) / length);
      if (Number.isFinite(SOURCE_BELLS.doors?.from)) locationMarks.push({ at: at(SOURCE_BELLS.doors.from), kind: 'event', id: 'doors' });
      if (Number.isFinite(SOURCE_BELLS.room?.threshold)) locationMarks.push({ at: at(SOURCE_BELLS.room.threshold), kind: 'event', id: 'tower-door' });
    }
  } else if (id === 'chapel-doors') {
    counter = clock(tapeSeconds);
    const span = SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorAt;
    progress = span > 0 && Number.isFinite(objective.distance) ? clamp01(1 - objective.distance / span) : 0;
    if (span > 0) locationMarks.push({ at: clamp01((SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom) / span), kind: 'event', id: 'doors' });
  }
  return {
    trace: true,
    note: sourceTraceNote(objective),
    progress,
    signal,
    face: {
      lamp: { text: '◆ TRACE', role: 'ui-blue' },
      counter, counterLabel: 'TAPE POSITION', counterTotal: '',
      levels: null, markers: [], drift: 0,
      meter: { db: signal.db }, meterLabel: signal.label, meterMarks: [], meterThresholdDb: null, roomMeter: null,
      locationSeconds, locationMarks, progress,
    },
  };
}
