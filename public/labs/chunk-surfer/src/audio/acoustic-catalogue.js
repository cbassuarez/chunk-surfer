// Authoritative gameplay acoustics. These values describe how the building and
// the HUSH interpret an action; they are intentionally independent from the
// player's output-volume settings and from whether an audio file loaded.

const S = (low, mid, high) => Object.freeze({ low, mid, high });
const D = (value) => Object.freeze(value);

export const ACOUSTIC_CATALOGUE = Object.freeze({
  footstep_slow: D({ levelDb: -43, durationMs: 170, spectrum: S(.48, .46, .16), impulsiveness: .40, family: 'movement', canBeMimicked: true }),
  footstep_walk: D({ levelDb: -34, durationMs: 170, spectrum: S(.64, .54, .20), impulsiveness: .58, family: 'movement', canBeMimicked: true }),
  footstep_injured: D({ levelDb: -27, durationMs: 220, spectrum: S(.72, .62, .26), impulsiveness: .64, family: 'movement', canBeMimicked: true }),
  breath_fear: D({ levelDb: -39, durationMs: 780, spectrum: S(.12, .76, .42), impulsiveness: .08, family: 'body', canBeMimicked: true }),
  page_turn: D({ levelDb: -45, durationMs: 420, spectrum: S(.04, .38, .86), impulsiveness: .24, family: 'paper', canBeMimicked: false }),
  bag_rummage: D({ levelDb: -25, durationMs: 620, spectrum: S(.18, .76, .48), impulsiveness: .42, family: 'equipment', canBeMimicked: true }),
  recorder_transport: D({ levelDb: -38, durationMs: 120, spectrum: S(.12, .58, .74), impulsiveness: .84, family: 'equipment', canBeMimicked: true }),
  radio_squelch: D({ levelDb: -12, durationMs: 920, spectrum: S(.22, .84, .92), impulsiveness: .72, family: 'radio', canBeMimicked: true }),
  radio_drop: D({ levelDb: -8, durationMs: 680, spectrum: S(.88, .74, .52), impulsiveness: .96, family: 'impact', canBeMimicked: true }),
  door_open: D({ levelDb: -24, durationMs: 420, spectrum: S(.58, .62, .38), impulsiveness: .62, family: 'architecture', canBeMimicked: true }),
  door_close: D({ levelDb: -18, durationMs: 480, spectrum: S(.76, .66, .34), impulsiveness: .78, family: 'architecture', canBeMimicked: true }),
  keys_impact: D({ levelDb: -10, durationMs: 520, spectrum: S(.18, .78, .94), impulsiveness: .94, family: 'metal', canBeMimicked: true }),
  instrument_note: D({ levelDb: -20, durationMs: 1100, spectrum: S(.36, .88, .62), impulsiveness: .54, family: 'instrument', canBeMimicked: true }),
  handling_noise: D({ levelDb: -31, durationMs: 360, spectrum: S(.28, .68, .46), impulsiveness: .48, family: 'handling', canBeMimicked: true }),
  impact_loud: D({ levelDb: -6, durationMs: 560, spectrum: S(.90, .78, .44), impulsiveness: 1, family: 'impact', canBeMimicked: true }),
  operator_voice_activity: D({ levelDb: -30, durationMs: 480, spectrum: S(.18, .84, .52), impulsiveness: .14, family: 'voice', canBeMimicked: false }),
});

export function catalogueEntry(kind) {
  return ACOUSTIC_CATALOGUE[kind] || null;
}

export function gameNoiseToDb(level, fallback = -36) {
  const n = Number(level);
  if (!Number.isFinite(n)) return fallback;
  // Existing gameplay levels are roughly 0..1. Map that range into a stable
  // semantic scale without pretending it is calibrated SPL.
  return Math.max(-72, Math.min(0, -52 + n * 64));
}

export function inferAcousticKind(reason = '', level = 0.2, { step = false, slow = false, injured = false } = {}) {
  if (step) return injured ? 'footstep_injured' : slow ? 'footstep_slow' : 'footstep_walk';
  const text = String(reason).toLowerCase();
  if (text.includes('breath')) return 'breath_fear';
  if (text.includes('page')) return 'page_turn';
  if (text.includes('bag')) return 'bag_rummage';
  if (text.includes('radio') && (text.includes('floor') || text.includes('drop'))) return 'radio_drop';
  if (text.includes('radio')) return 'radio_squelch';
  if (text.includes('key')) return 'keys_impact';
  if (text.includes('door') && text.includes('open')) return 'door_open';
  if (text.includes('door')) return 'door_close';
  if (text.includes('instrument') || text.includes('sounded')) return 'instrument_note';
  if (Number(level) >= .5) return 'impact_loud';
  return 'handling_noise';
}

export function validateAcousticCatalogue(catalogue = ACOUSTIC_CATALOGUE) {
  const errors = [];
  for (const [id, def] of Object.entries(catalogue || {})) {
    if (!id) errors.push('empty acoustic id');
    if (!Number.isFinite(def?.levelDb)) errors.push(`${id}: invalid levelDb`);
    if (!Number.isFinite(def?.durationMs) || def.durationMs <= 0) errors.push(`${id}: invalid durationMs`);
    if (!Number.isFinite(def?.impulsiveness) || def.impulsiveness < 0 || def.impulsiveness > 1) errors.push(`${id}: invalid impulsiveness`);
    for (const band of ['low', 'mid', 'high']) {
      const value = def?.spectrum?.[band];
      if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`${id}: invalid spectrum.${band}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
