// THE WALK IN. Crossing the snow door puts him in whiteout, and his own
// faculties ask him what he walked toward here (source-space.door-field,
// `home.arrive`). Each choice carries `arrive`: what he named, which the wind
// parts the snow around first (render/home-arrival-glsl.js). When the questions
// run out the rest of the valley comes in, all at once.
//
// The state is only times on the station clock, so a paused game holds the
// reveal where it is, and every frame is a pure function of the clock.

export const HOME_ARRIVAL_START = 'home.arrive';
export const HOME_ARRIVAL_FLAG = 'station.home.arrived';
export const HOME_ARRIVAL_ANCHORS = Object.freeze(['lines', 'houses', 'ridge', 'tree', 'window']);
// The wind takes a while to part the snow around one thing.
export const HOME_ARRIVAL_NAMED_SECONDS = 5.5;
// The last thing named keeps a short lead before the rest arrives.
export const HOME_ARRIVAL_REST_DELAY = 1.2;
export const HOME_ARRIVAL_REST_SECONDS = 7;

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const ease = (value) => { const k = Math.max(0, Math.min(1, value)); return k * k * (3 - 2 * k); };

export function createHomeArrival(key = '', now = 0) {
  return { key: String(key), startedAt: finite(now), named: {}, restAt: null };
}

export function finishHomeArrival(state, now = 0, delay = HOME_ARRIVAL_REST_DELAY) {
  if (!state || state.restAt != null) return state;
  return { ...state, restAt: finite(now) + Math.max(0, finite(delay)) };
}

// `arrive` is one anchor, a list of them, or 'all' for the rest of the valley.
export function nameHomeArrival(state, arrive, now = 0) {
  if (!state) return state;
  let next = state;
  for (const anchor of Array.isArray(arrive) ? arrive : arrive ? [arrive] : []) {
    if (anchor === 'all') next = finishHomeArrival(next, now);
    else if (HOME_ARRIVAL_ANCHORS.includes(anchor) && next.named[anchor] == null) {
      next = { ...next, named: { ...next.named, [anchor]: finite(now) } };
    }
  }
  return next;
}

export function homeArrivalComplete(state, now = 0) {
  return !!state && state.restAt != null && finite(now) >= state.restAt + HOME_ARRIVAL_REST_SECONDS;
}

// What the shader is told this frame, or null once the whiteout has gone.
export function homeArrivalFrame(state, now = 0) {
  if (!state || homeArrivalComplete(state, now)) return null;
  const at = finite(now);
  const level = (from, seconds) => (from == null ? 0 : ease((at - from) / seconds));
  const frame = { whiteout: 1, rest: level(state.restAt, HOME_ARRIVAL_REST_SECONDS) };
  for (const anchor of HOME_ARRIVAL_ANCHORS) frame[anchor] = level(state.named[anchor], HOME_ARRIVAL_NAMED_SECONDS);
  return frame;
}
