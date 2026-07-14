// Shared presentation pressure for dread systems.
//
// Gameplay truth stays in its owning modules:
// - semantic noise/HUSH hearing in hush-audio-runtime
// - recording spoil noise in recordist
// - proximity/catch logic in presence
//
// This reducer is only the player-facing pressure contract. It prevents the
// heartbeat, take hiss, monitor collapse, personal interference and radio decay
// from each independently stacking to full intensity.

const clamp01 = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

function fieldAmount(field, key) {
  return clamp01(field?.presentation?.[key] ?? field?.absorption?.[key] ?? 0);
}

function auditionPressure(audition) {
  if (!audition) return 0;
  const pressure = audition.pressure || {};
  return Math.max(
    clamp01(audition.agitation) * 0.76,
    clamp01(audition.interest) * 0.42,
    clamp01(audition.certainty) * 0.36,
    clamp01(pressure.recentEnergy) * 0.58,
    clamp01(pressure.impulsiveNoise) * 0.48,
  );
}

export function computeFearPressure({
  fear = 0,
  recordingProgress = 0,
  recording = false,
  hushField = null,
  hushAudition = null,
  personalInterference = false,
  radio = null,
} = {}) {
  const baseFear = clamp01(fear);
  const take = recording ? clamp01(recordingProgress) : 0;
  const hushAudio = fieldAmount(hushField, 'audio');
  const hushMonitor = fieldAmount(hushField, 'monitor');
  const hushLight = fieldAmount(hushField, 'light');
  const heard = auditionPressure(hushAudition);
  const personal = personalInterference ? 1 : 0;
  const radioDead = radio?.dead ? 1 : 0;
  const radioDropped = radio?.dropped ? 0.42 : 0;

  // Heartbeat is bodily fear plus a small amount of monitor-field pressure. It
  // should not become a second HUSH meter.
  const heartbeat = clamp01(Math.max(
    baseFear,
    hushMonitor * 0.34,
    heard * 0.28,
    personal * 0.10,
  ));

  // Tape hiss remains primarily the take clock. Other systems can roughen it,
  // but cannot max it out by themselves.
  const tapeHiss = clamp01(
    take
    + baseFear * 0.10
    + hushMonitor * 0.16
    + personal * 0.14
    + radioDead * 0.08
    + radioDropped * 0.04
  );

  // Monitor/field overlay is allowed to be more HUSH-forward because it is
  // explicitly instrumentation, not recording-state truth.
  const monitorHiss = clamp01(Math.max(
    take * 0.62,
    hushMonitor * 0.82,
    heard * 0.44,
    personal * 0.18,
    radioDead * 0.16,
  ));

  const visualDread = clamp01(Math.max(
    baseFear,
    hushLight * 0.28,
    hushAudio * 0.18,
  ));

  const mapDisturbance = clamp01(Math.max(
    hushMonitor * 0.72,
    heard * 0.54,
    personal * 0.10,
  ));

  return Object.freeze({
    overall: clamp01(Math.max(baseFear, tapeHiss * 0.38, monitorHiss * 0.50, visualDread)),
    heartbeat,
    tapeHiss,
    monitorHiss,
    visualDread,
    mapDisturbance,
    inputs: Object.freeze({
      fear: baseFear,
      take,
      hushAudio,
      hushMonitor,
      hushLight,
      heard,
      personal,
      radioDead,
      radioDropped,
    }),
  });
}

