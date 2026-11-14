// The window holds attention, not a clock. Looking, approaching and explicitly
// settling supply its pull; turning back to the snow restores the outside.
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const unit = (value) => Math.max(0, Math.min(1, finite(value)));

export function createStationHomeState(saved = {}) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const departed = source.departed === true;
  const recognized = source.recognized === true || departed;
  return {
    recognized,
    departed,
    viewedRoom: recognized && source.viewedRoom === true,
    settled: recognized && !departed && source.settled === true,
    attention: recognized && !departed ? unit(source.attention) : 0,
    interactionDown: source.interactionDown === true,
  };
}

export const normalizeStationHomeState = createStationHomeState;
export const serializeStationHomeState = createStationHomeState;

// Shared by the local sound mix and the caller's snow footsteps. No gain or
// filter survives the local window presentation, and full clarity is immediate
// in the model when he turns toward the snow.
export function stationHomePresentation(attention = 0) {
  const pull = unit(attention);
  return {
    attention: pull,
    windGain: 1 - 0.82 * pull,
    footstepGain: 1 - 0.88 * pull,
    windLowpassHz: Math.round(16000 - 15400 * pull),
    warmthGain: 0.08 + 0.08 * pull,
  };
}

// Walking out uses the realm's physical return door. The window offers a
// separate deliberate exit. Call on both press and release.
export function updateStationHome(previous, input = {}) {
  const state = createStationHomeState(previous);
  const effects = { recognize: false, look: false, stay: false, depart: false };
  const result = () => ({ state, effects, presentation: stationHomePresentation(state.attention) });
  if (input.paused === true || state.departed) return result();

  const wasRecognized = state.recognized;
  const atWindow = input.atWindow === true;
  const down = input.interactionDown === true;
  const fresh = down && !state.interactionDown;
  state.interactionDown = down;

  if (atWindow && !wasRecognized) {
    state.recognized = true;
    effects.recognize = true;
  }
  if (atWindow && input.viewingRoom === true) state.viewedRoom = true;
  // An interaction held on arrival is not a fresh decision to leave the house.
  if (wasRecognized && fresh) {
    if (input.action === 'look' && atWindow) {
      effects.look = true;
      state.viewedRoom = true;
    }
    else if ((input.action === 'stay' || input.action === 'settle') && atWindow && input.lookingAtWindow === true) {
      state.settled = true;
      effects.stay = true;
    } else if (input.action === 'turn-away') effects.depart = true;
  }

  if (input.lookingTowardSnow === true) state.settled = false;

  state.attention = atWindow && input.lookingAtWindow === true && input.lookingTowardSnow !== true
    ? (state.settled ? 1 : 0.2 + 0.55 * unit(input.approach)) : 0;
  if (effects.depart) {
    state.departed = true;
    state.settled = false;
    state.attention = 0;
  }
  return result();
}
