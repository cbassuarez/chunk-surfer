// THE ENDING RUNTIME. Everything about an ending that is not I/O.
//
// Two jobs:
//
//   1. THE DOSSIER — the whole night, in one object, before the ending speaks.
//   2. THE FLAGS — that object projected into the save so authored content can
//      condition on it.
//
// ── why the dossier is nearly free ──────────────────────────────────────────
//
// buildRunSummary (progression/report.js) already computes everything an ending
// could want to know: takes completed, spoiled, aborted and contaminated, which
// rooms, injuries, battles won and lost, disclosures, documents, equipment
// issued/missing/dropped/recovered, power, interference. It is PURE. It was only
// ever called inside commitReturn, which runs after the ending has finished
// talking — so an ending that wanted to mention the night had to go and fetch
// each fact itself, and none of them did. Calling the same function at the TOP of
// the ending costs nothing and hands it the lot.
//
// ── why the flags ───────────────────────────────────────────────────────────
//
// Authored `when` conditions become `if` at runtime (narrative/runtime-content.js)
// and are evaluated by flagTest, which reads SAVE FLAGS and nothing else. It has
// no way to see an object. So the dossier is projected into an `ending.*`
// namespace and the JSON conditions on that:
//
//   when: "ending.arrival.defeated"
//   when: "ending.takes.clean>=5"
//   when: "ending.confession.name && !ending.confession.sarah"
//   when: "!ending.equipment.complete"
//
// Enumerations become BOOLEAN flags rather than string compares, because
// flagTest's comparison operator only accepts a numeric literal on the right.
// That is a real constraint of the grammar, not a preference.

import { buildRunSummary } from '../progression/report.js';
import { ENDING_ARRIVAL, endingManifest } from '../data/endings.js';

const EMPTY_SUMMARY = Object.freeze({
  takes: { completed: 0, spoiled: 0, aborted: 0, rooms: [], contaminated: [], places: {} },
  injuries: 0,
  battles: { started: 0, won: 0, lost: 0, firstPassWon: 0, results: {} },
  disclosures: { found: 0, ids: [] },
  documents: { read: 0, ids: [] },
  equipment: { issued: 4, returned: 4, missing: [], dropped: [], recovered: [] },
  power: { live: [], everRestored: [] },
  durationSeconds: 0,
});

// The four registers a disclosure can be in. `nothing` is not the absence of an
// answer — it is an answer, and it is the one the building finds most useful
// (see guestLines in data/conservatory-script.js, which has always known this).
const CONFESSION_KINDS = ['name', 'reason', 'feeling', 'nothing'];
// The four places a hall take can be rolled from. This is a CLOSED list and the
// flag projection enumerates it, so a new deck in the concert hall has to be
// added here or an ending can never ask about it. `stair` is included because a
// take rolled on the galleria flight is a real thing a player can do.
const HALL_TAKE_PLACES = ['orchestra', 'stage', 'lower', 'upper', 'stair'];

// EVERY DISCLOSURE IS A SENTENCE HE SAID OUT LOUD IN A ROOM.
//
// These are the eight the game can actually reach (conservatory.post_door and
// conservatory.first_take), and they are not interchangeable: "four hundred
// quid" and "you don't leave a building angry" are different men. The endings
// quote the exact one back, hours later, which is the whole point of a building
// that collects references — so every value gets its own flag, not just Sarah.
const CONFESSION_VALUES = [
  'sarah',        // "Sarah'll have gone up. She won't check the drive till morning."
  'nobody',       // "Nobody's expecting me till Thursday. That has always been fine."
  'craft',        // "I want to hear that natatorium."
  'money',        // "Four hundred quid. I am not walking out on a paid job."
  'superstition', // "You don't leave a building angry. You finish, and you thank it."
  'named',        // "Must be him that was sayin' all that."
  'denied',       // "I'm tired. I've been up since five."
  'procedure',    // "Levels. Slate. Roll."
];

function safeSummary(args) {
  // A god-menu jump or a dev finalize can reach an ending with no run on the
  // save. The ending still has to play; it simply has nothing to remember.
  try { return buildRunSummary(args) || EMPTY_SUMMARY; } catch { return EMPTY_SUMMARY; }
}

// `live` is everything the summary does not carry: flags, Source state, the HUSH
// tally. Passed in rather than imported so this module stays testable without a
// save, a renderer or a browser.
export function buildEndingDossier({
  endingId,
  arrival = ENDING_ARRIVAL.AGREED,
  save = null,
  meta = null,
  authoritative = {},
  live = {},
  now = Date.now(),
} = {}) {
  const summary = safeSummary({ endingId, save, meta, authoritative, now });
  const takes = summary.takes || EMPTY_SUMMARY.takes;
  const equipment = summary.equipment || EMPTY_SUMMARY.equipment;
  const battles = summary.battles || EMPTY_SUMMARY.battles;

  const kindRaw = String(live.confessionKind || '');
  const kind = CONFESSION_KINDS.includes(kindRaw) ? kindRaw : 'nothing';
  const value = kind === 'nothing' ? '' : String(live.confessionValue || '').trim();

  const contaminated = [...new Set(takes.contaminated || [])];
  const rooms = [...new Set(takes.rooms || [])];
  const clean = Math.max(0, rooms.length - contaminated.length);

  return {
    ending: endingId,
    arrival,
    coffee: !!live.drankCoffee,

    // WHAT HE SAID. The whole answer, not a boolean about one name.
    confession: {
      kind,
      value,
      // "Sarah" is still special — it is the name the rest of the game is built
      // around — but it is now one case of a general thing rather than the only
      // case that exists.
      sarah: kind === 'name' && /^sarah$/i.test(value),
      spoken: kind !== 'nothing',
    },

    takes: {
      completed: rooms.length,
      spoiled: Number(takes.spoiled) || 0,
      aborted: Number(takes.aborted) || 0,
      contaminated: contaminated.length,
      clean,
      rooms,
      full: rooms.length >= 5,
      places: { ...(takes.places || {}) },
    },

    injuries: Number(summary.injuries) || 0,
    battles: {
      won: Number(battles.won) || 0,
      lost: Number(battles.lost) || 0,
      firstPassWon: Number(battles.firstPassWon) || 0,
      flawless: (Number(battles.lost) || 0) === 0,
    },

    equipment: {
      missing: [...(equipment.missing || [])],
      recovered: [...(equipment.recovered || [])],
      complete: (equipment.missing || []).length === 0,
    },

    // WHAT HAPPENED IN SOURCE. `outcome` is rescue | contain | submit | null.
    source: {
      entered: !!live.sourceEntered,
      outcome: live.sourceOutcome || null,
      rescued: live.sourceOutcome === 'rescue',
      traces: [...(live.sourceTraces || [])],
    },

    hush: {
      contacts: Math.max(0, Number(live.hushContacts) || 0),
      dockSpent: !!live.dockSpent,
      dockVariant: live.dockVariant || null,
    },

    reference: {
      density: Math.max(0, Math.min(100, Number(live.referenceDensity) || 0)),
      breadth: Math.max(0, Number(live.referenceBreadth) || 0),
    },

    door: { searched: live.doorSearched || null },
    documents: Number(summary.documents?.read) || 0,
    disclosures: Number(summary.disclosures?.found) || 0,
    power: { restored: (summary.power?.everRestored || []).length },
    durationSeconds: Number(summary.durationSeconds) || 0,
    summary,
  };
}

// NO HYPHENS IN A FLAG NAME.
//
// flagTest happens to tolerate one — it falls through to a raw lookup — but the
// studio's validateConditionExpression does not: its PATH is /^[A-Za-z_][\w.]*$/
// and \w has no hyphen in it. So `when: "ending.arrival.timed-out"` would pass in
// the game and be rejected by the validator, which is the worst of both. The
// arrival's VALUE stays 'timed-out' because that is what it is called; only the
// flag key is folded.
const flagKey = (value) => String(value).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// The dossier as save flags. Returns a plain object for the caller to merge and
// commit ONCE — flagSet writes the save on every call, and forty of those in a
// row on the frame an ending starts is forty serialisations for no reason.
export function projectDossierFlags(dossier) {
  if (!dossier) return {};
  const flags = {};
  const set = (name, value) => { flags[`ending.${name}`] = value; };

  set('id', dossier.ending);
  for (const arrival of Object.values(ENDING_ARRIVAL)) {
    set(`arrival.${flagKey(arrival)}`, dossier.arrival === arrival);
  }
  set('coffee', dossier.coffee);

  set('confession.spoken', dossier.confession.spoken);
  set('confession.sarah', dossier.confession.sarah);
  for (const kind of CONFESSION_KINDS) set(`confession.${kind}`, dossier.confession.kind === kind);
  const value = dossier.confession.value.toLowerCase();
  for (const known of CONFESSION_VALUES) set(`confession.said.${known}`, value === known);
  // A disclosure the game can reach but this list does not know about. It should
  // never fire; if it does, an ending is quoting a sentence nobody wrote a reply
  // for and the spec that enumerates CONFESSION_VALUES needs a new entry.
  set('confession.said.unknown', dossier.confession.spoken && !CONFESSION_VALUES.includes(value));

  set('takes.completed', dossier.takes.completed);
  set('takes.clean', dossier.takes.clean);
  set('takes.spoiled', dossier.takes.spoiled);
  set('takes.aborted', dossier.takes.aborted);
  set('takes.contaminated', dossier.takes.contaminated);
  set('takes.full', dossier.takes.full);
  // WHERE THE HALL TAKE WAS ROLLED, as booleans. `flagTest` only compares a
  // numeric literal on the right, so an enumeration must arrive as one flag per
  // value or `place=='upper'` silently degrades to a truthiness test. No hyphens
  // either: flagTest tolerates one and validateConditionExpression does not, so a
  // hyphenated flag works in the game and fails authoring validation.
  const hallPlace = dossier.takes.places?.amplifications || null;
  for (const place of HALL_TAKE_PLACES) set(`takes.hall.${place}`, hallPlace === place);
  // Rolled from anywhere above the stalls. The two balconies are the reason the
  // galleria stairs exist, so this is the flag an ending should usually ask.
  set('takes.hall.aloft', hallPlace === 'lower' || hallPlace === 'upper');

  set('injuries', dossier.injuries);
  set('untouched', dossier.injuries === 0);
  set('battles.lost', dossier.battles.lost);
  set('battles.flawless', dossier.battles.flawless);

  set('equipment.missing', dossier.equipment.missing.length);
  set('equipment.complete', dossier.equipment.complete);
  for (const item of ['light', 'recorder', 'map', 'radio']) {
    set(`equipment.lost.${item}`, dossier.equipment.missing.includes(item));
  }

  set('source.entered', dossier.source.entered);
  for (const outcome of ['rescue', 'contain', 'submit']) {
    set(`source.${outcome}`, dossier.source.outcome === outcome);
  }
  set('source.traces', dossier.source.traces.length);

  set('hush.contacts', dossier.hush.contacts);
  set('hush.untouched', dossier.hush.contacts === 0);
  set('dock.spent', dossier.hush.dockSpent);

  set('reference.density', dossier.reference.density);
  set('reference.saturated', dossier.reference.density >= 90);
  set('reference.unclassified', dossier.reference.density < 20);

  set('door.searched', !!dossier.door.searched);
  set('documents', dossier.documents);
  set('disclosures', dossier.disclosures);
  set('power.restored', dossier.power.restored);
  return flags;
}

// Every flag name this module can produce, for the spec that checks authored
// `when` conditions only name facts that exist. Derived from a maximal dossier so
// it can never drift from projectDossierFlags.
export function dossierFlagNames() {
  return Object.keys(projectDossierFlags(buildEndingDossier({
    endingId: 'sacrifice',
    live: { confessionKind: 'name', confessionValue: 'Sarah', sourceOutcome: 'rescue' },
  }))).sort();
}

// The disclosures the game can reach, for the spec that checks every authored
// reply names one that exists.
export function confessionValues() { return [...CONFESSION_VALUES]; }

// ── the timeline ────────────────────────────────────────────────────────────
//
// An ending's environment and audio are authored in seconds from its first line.
// This turns that into "what has become due since I last asked", so the caller
// can drive it from an ordinary frame tick without knowing anything about it.
// Takes the STEPS, not the manifest, because there are two of these clocks now:
// the ending's own environment timeline and the objective's, which runs while the
// player is still walking (the building closing behind him on the way back to the
// screen; the collapse under both legs of the escape; the man on your shoulder
// talking as you carry him).
export function dueTimelineSteps(steps, fromSeconds, toSeconds) {
  const list = Array.isArray(steps) ? steps : (steps?.environment || []);
  if (!(toSeconds > fromSeconds)) return [];
  return list.filter((step) => step.at > fromSeconds && step.at <= toSeconds);
}

// The ordered documents an ending plays: its arrival passage, if this route has
// one, and then the ending itself. The passage is where a defeat stops being a
// silent handoff.
export function endingDocuments(endingId, arrival, dossier = null) {
  const manifest = endingManifest(endingId);
  if (!manifest) return [];
  const out = [];
  const passage = manifest.passage?.[arrival];
  if (passage) out.push({ id: passage, kind: 'passage', slate: 'THE CHAPEL' });
  const tree = typeof manifest.tree === 'function' ? manifest.tree(dossier) : manifest.tree;
  out.push({ id: tree, kind: 'ending', slate: '' });
  for (const id of manifest.tail || []) out.push({ id, kind: 'ending', slate: '' });
  return out;
}
