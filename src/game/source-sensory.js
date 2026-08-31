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
