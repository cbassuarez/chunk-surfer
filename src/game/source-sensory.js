// SOURCE STOPS FEELING LIKE A THREAT BEFORE IT STOPS CONTAINING ONE.
//
// This is presentation only. It never changes Presence state, the HUSH field,
// navigation, collision, or whether the body is submitted to the renderer. The
// still page drains the operator-facing pressure channels; the Pressure behind
// it remains an independently visible thing.

const clamp01 = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
};

const FELT_PRESSURE_KEYS = Object.freeze([
  'overall',
  'heartbeat',
  'tapeHiss',
  'monitorHiss',
  'visualDread',
  'mapDisturbance',
]);

export function sourceSensoryMix({ phase = '', transitionProgress = 0, settled = false } = {}) {
  if (phase === 'hall' || phase === 'haystack') return 1;
  if (phase === 'transforming') {
    if (settled) return 0;
    return 1 - clamp01(transitionProgress);
  }
  return 0;
}

export function attenuateSourceFearPressure(pressure = {}, mix = 1) {
  const gain = clamp01(mix);
  const next = { ...pressure, sourceSensoryMix: gain };
  for (const key of FELT_PRESSURE_KEYS) next[key] = clamp01(pressure?.[key]) * gain;
  return Object.freeze(next);
}

// HUSH audio receives a presentation copy of the field. Audio/monitor pressure
// drain away, while light absorption and the raw field used to draw the body do
// not. A visible Pressure is therefore not evidence that the operator must hear
// hiss or feel a pulse.
export function attenuateSourceHushAudioField(field = null, mix = 1) {
  if (!field) return field;
  const gain = clamp01(mix);
  const absorption = field.absorption || {};
  const presentation = field.presentation || {};
  return {
    ...field,
    absorption: {
      ...absorption,
      audio: clamp01(absorption.audio) * gain,
      monitor: clamp01(absorption.monitor) * gain,
    },
    ...(field.presentation ? {
      presentation: {
        ...presentation,
        audio: clamp01(presentation.audio) * gain,
        monitor: clamp01(presentation.monitor) * gain,
        hiss: clamp01(presentation.hiss) * gain,
      },
    } : {}),
    sourceSensoryMix: gain,
  };
}

// The first nothingness has no room of its own. These are transmission gains
// from the room left behind and the receiving hardware, measured from the
// actual body rather than elapsed walking time. A long detour stays a detour.
export function sourceShoreOutside(frame = null) {
  return !!(frame?.active && frame.outside && !frame.proper);
}

const distance = (value) => Number.isFinite(Number(value))
  ? Math.max(0, Number(value)) : Infinity;
const finiteFalloff = (metres, full, end) => {
  const d = distance(metres);
  if (!Number.isFinite(d)) return 0;
  const t = clamp01((d - full) / (end - full));
  return (1 - t) * (1 - t) * (1 + 2 * t);
};

export function sourceShoreSensoryFrame(frame = null) {
  const active = sourceShoreOutside(frame);
  const surface = frame?.surface || (frame?.lift?.boarded ? 'lift' : 'void');
  const roomDistance = distance(frame?.distanceFromRoomMetres);
  const bankDistance = distance(frame?.distanceToBankMetres);
  const liftDistance = distance(frame?.distanceToLiftMetres ?? bankDistance);
  return Object.freeze({
    active,
    // Nothing is emitted by the volume itself. Even a long pause cannot turn
    // the distant air handler into an ambient bed that follows the player.
    roomLeak: active ? finiteFalloff(roomDistance, 0, 26) : 0,
    liftGain: active ? finiteFalloff(liftDistance, 2, 30) : 0,
    metalReturn: active ? finiteFalloff(bankDistance, 1, 11) : 0,
    footstepGain: active && surface === 'void' ? .74 : 1,
    footstepMuffle: active ? (surface === 'void' ? .86 : .30) : null,
    surface,
    liftMoving: active && frame?.lift?.moving === true,
    liftPhase: String(frame?.lift?.phase || ''),
  });
}
