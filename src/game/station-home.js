// The window holds attention, not a clock. Looking, approaching and explicitly
// settling supply its pull; turning back to the snow restores the outside.
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const unit = (value) => Math.max(0, Math.min(1, finite(value)));
export const STATION_HOME_LEAVE_METRES = .35;

export function createStationHomeState(saved = {}) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const departed = source.departed === true;
  const recognized = source.recognized === true || departed;
  return {
    recognized,
    departed,
    settled: recognized && !departed && source.settled === true,
    attention: recognized && !departed ? unit(source.attention) : 0,
    awayArmed: recognized && !departed && source.awayArmed === true,
    outwardDistance: recognized && !departed
      ? Math.max(0, Math.min(STATION_HOME_LEAVE_METRES, finite(source.outwardDistance))) : 0,
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

// `outwardDistance` is the signed change in actual distance from the window,
// in metres. A held key, a blocked step, or a glance is not a departure.
// Call with the current interactionDown each frame, including release frames.
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
  // An interaction held on arrival is not a fresh decision to leave the house.
  if (wasRecognized && fresh) {
    if (input.action === 'look' && atWindow) effects.look = true;
    else if ((input.action === 'stay' || input.action === 'settle') && atWindow && input.lookingAtWindow === true) {
      state.settled = true;
      effects.stay = true;
    } else if (input.action === 'turn-away') effects.depart = true;
  }

  if (state.recognized && input.lookingTowardSnow === true) {
    state.awayArmed = true;
    state.settled = false;
    const travelled = finite(input.outwardDistance);
    if (wasRecognized && travelled > 0) state.outwardDistance = Math.min(STATION_HOME_LEAVE_METRES, state.outwardDistance + travelled);
    else if (travelled < 0) state.outwardDistance = 0;
  } else {
    state.awayArmed = false;
    state.outwardDistance = 0;
  }
  if (wasRecognized && state.awayArmed && state.outwardDistance >= STATION_HOME_LEAVE_METRES) effects.depart = true;

  state.attention = atWindow && input.lookingAtWindow === true && input.lookingTowardSnow !== true
    ? (state.settled ? 1 : 0.2 + 0.55 * unit(input.approach)) : 0;
  if (effects.depart) {
    state.departed = true;
    state.settled = false;
    state.awayArmed = false;
    state.outwardDistance = 0;
    state.attention = 0;
  }
  return result();
}
