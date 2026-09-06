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
  // A deliberate player call is speech through the handheld, not the carrier
  // burst above. Keep it near the existing .34 gameplay emission (~-30.24 dB),
  // speech-band and sustained, and do not let the HUSH learn the player's call.
  radio_call: D({ levelDb: -30, durationMs: 480, spectrum: S(.18, .84, .52), impulsiveness: .14, family: 'radio', canBeMimicked: false }),
  radio_drop: D({ levelDb: -8, durationMs: 680, spectrum: S(.88, .74, .52), impulsiveness: .96, family: 'impact', canBeMimicked: true }),
  door_open: D({ levelDb: -24, durationMs: 420, spectrum: S(.58, .62, .38), impulsiveness: .62, family: 'architecture', canBeMimicked: true }),
  door_close: D({ levelDb: -18, durationMs: 480, spectrum: S(.76, .66, .34), impulsiveness: .78, family: 'architecture', canBeMimicked: true }),
  keys_impact: D({ levelDb: -10, durationMs: 520, spectrum: S(.18, .78, .94), impulsiveness: .94, family: 'metal', canBeMimicked: true }),
  instrument_note: D({ levelDb: -20, durationMs: 1100, spectrum: S(.36, .88, .62), impulsiveness: .54, family: 'instrument', canBeMimicked: true }),
  handling_noise: D({ levelDb: -31, durationMs: 360, spectrum: S(.28, .68, .46), impulsiveness: .48, family: 'handling', canBeMimicked: true }),
  impact_loud: D({ levelDb: -6, durationMs: 560, spectrum: S(.90, .78, .44), impulsiveness: 1, family: 'impact', canBeMimicked: true }),
  operator_voice_activity: D({ levelDb: -30, durationMs: 480, spectrum: S(.18, .84, .52), impulsiveness: .14, family: 'voice', canBeMimicked: false }),
  bell_tenor_toll: D({ levelDb: -4, durationMs: 9000, spectrum: S(1, .78, .34), impulsiveness: .82, family: 'bell', canBeMimicked: true }),
  bell_change_strike: D({ levelDb: -2, durationMs: 11000, spectrum: S(.94, .86, .52), impulsiveness: .88, family: 'bell', canBeMimicked: false }),
  // THE FOUNTAIN. The only continuous source in the catalogue, and the only one
  // that is not something anybody did.
  //
  // Everything above is an EVENT — a footstep, a door, a bell — with a start and
  // an end, which is why they all carry an impulsiveness worth reading. Running
  // water never starts. The duration here is a nominal analysis window rather
  // than a length, because the entry exists to describe a steady state.
  //
  // It earns its place by MASKING. The park fountain is on a supply that was
  // never on Ellery's meter, so it has run every night since the building shut,
  // and a body standing beside it is harder to hear — see fountainMaskingDb in
  // audio/fountain-water.js, which derives its ceiling from this levelDb rather
  // than from a number typed twice. The bells are the precedent: they mask too,
  // through the same maskingDb hook in acoustic-propagation.js.
  //
  // Not mimickable. The HUSH does a great many things in this building; putting
  // a municipal water supply back on is not one of them.
  // Down from −26. It is a municipal fountain in an empty park, not a weir: at
  // −26 it masked ten decibels of footstep standing over it and dominated the
  // outdoor mix. Four decibels of cover is a fountain you can hide a footstep
  // near, which is the fact this entry exists to state.
  fountain_water: D({ levelDb: -32, durationMs: 1000, spectrum: S(.22, .68, .74), impulsiveness: .06, family: 'water', canBeMimicked: false }),

  // THE BYPASS LETTING GO. The other continuous source, and the loudest thing
  // the player can do to this building on purpose.
  //
  // Emitted from the plant-header puzzle when the wrong fitting is chosen: the
  // header dumps into the room and the take is spoiled. -8 puts it with the
  // things that end a take outright (radio_drop, metal_stair_strike) rather
  // than with the things you can talk over. Steam is a broadband hiss with a
  // body behind it, so the spectrum leans high without going thin, and the
  // impulsiveness is low but not a fountain's: there IS a moment it lets go,
  // and then it is just a roar.
  //
  // Not mimickable, and for a reason the call site already states rather than a
  // judgement about the HUSH: the emission carries audibleToHush:false, so the
  // HUSH never hears this and cannot learn what it has not heard.
  steam_vent: D({ levelDb: -8, durationMs: 2600, spectrum: S(.34, .72, .92), impulsiveness: .22, family: 'architecture', canBeMimicked: false }),

  // ── THE PLANT, AND THE TOOLS THAT SHUT IT ────────────────────────────────
  //
  // These four were being EMITTED without ever being DEFINED. emitNoise passes
  // `kind` through verbatim, bypassing inferAcousticKind, so an unknown kind
  // does not throw and does not warn — it silently resolves to the generic
  // defaults in normalizeAcousticEvent: 300ms, spectrum .33/.66/.33,
  // impulsiveness .5, family 'handling'. Which is to say a two-metre cast-iron
  // Stillson dragged down a flight of stairs was filed next to picking up a
  // clipboard, and nothing anywhere said so.
  //
  // They share a family so the HUSH's family cooldowns treat the whole plant
  // errand as one activity rather than as four unrelated noises.

  // Cast iron over concrete. The loudest sustained thing the player can do, and
  // the only one that never starts: impulsiveness is near zero because a drag
  // has no attack, which is exactly what separates it from the strike below.
  metal_drag: D({ levelDb: -16, durationMs: 900, spectrum: S(.74, .56, .62), impulsiveness: .08, family: 'tool', canBeMimicked: false }),
  // The same iron meeting a riser. A drag and a strike are acoustic opposites
  // and used to be the same catalogue entry — this is the one the stairs needed.
  metal_stair_strike: D({ levelDb: -8, durationMs: 480, spectrum: S(.88, .72, .78), impulsiveness: .95, family: 'tool', canBeMimicked: false }),
  // The Stillson closing the pipe. One clank, and the errand is over.
  metal_impact: D({ levelDb: -12, durationMs: 700, spectrum: S(.68, .74, .82), impulsiveness: .92, family: 'tool', canBeMimicked: true }),
  // The adjustable spanner doing the same job quietly. This is what having had
  // the sense to pick up the small tool actually sounds like.
  tool_click: D({ levelDb: -40, durationMs: 90, spectrum: S(.10, .52, .80), impulsiveness: .88, family: 'tool', canBeMimicked: true }),

  // Not the player. Every chair in a practice room moving at once, which is the
  // building doing something rather than somebody doing something to it.
  furniture_scrape: D({ levelDb: -20, durationMs: 620, spectrum: S(.62, .58, .44), impulsiveness: .34, family: 'furniture', canBeMimicked: false }),

  // Cloth and body weight over stone. Not an impact and not a tool: a soft,
  // low, continuous load being moved by someone who is trying not to drop it.
  // Deliberately quiet — this one is inaudible to the HUSH where it is emitted,
  // and it is in the catalogue so that stays a decision rather than an accident.
  body_drag: D({ levelDb: -34, durationMs: 820, spectrum: S(.66, .38, .14), impulsiveness: .10, family: 'body', canBeMimicked: false }),
  // The HUSH speaking. Distinct from operator_voice_activity, which is a living
  // person's throat: this one is the building using a voice, so it can never be
  // mimicked — there is nothing to mimic it WITH.
  voice: D({ levelDb: -22, durationMs: 900, spectrum: S(.24, .82, .46), impulsiveness: .12, family: 'voice', canBeMimicked: false }),
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
