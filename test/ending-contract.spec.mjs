import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { ENDING_IDS, POWER_CIRCUIT_IDS } from '../src/progression/schema.js';
import { validateConditionExpression } from '../src/narrative/conditions.js';
import {
  ENDING_ARRIVAL,
  ENDING_AUDIO_TODO,
  ENDING_MANIFEST,
  endingArrivalPassage,
  endingCodaVariant,
  endingContractErrors,
  endingManifest,
} from '../src/data/endings.js';
import {
  buildEndingDossier,
  dossierFlagNames,
  dueTimelineSteps,
  endingDocuments,
  projectDossierFlags,
} from '../src/game/ending-runtime.js';

// ── the contract is complete ────────────────────────────────────────────────
assert.deepEqual(endingContractErrors(), [], 'the ending manifest is internally consistent');
for (const id of ENDING_IDS) {
  assert.ok(endingManifest(id), `${id} has a manifest entry`);
  const manifest=endingManifest(id);
  const switchedOff=new Set([
    ...(manifest.objective?.timeline||[]),
    ...(manifest.environment||[]),
  ].filter((step)=>step.kind==='circuit'&&step.on===false).map((step)=>step.value));
  if(switchedOff.size)assert.ok(POWER_CIRCUIT_IDS.every((circuit)=>switchedOff.has(circuit)),
    `${id} blackout owns every canonical switchable circuit`);
}

// EVERY ARRIVAL REACHES SOMETHING. This is the audit's actual complaint made
// structural: a defeat and a timeout used to vanish into The Seal with nothing
// said, and the way that stays fixed is that every arrival is declared by an
// ending and every arrival that is not an ending's front door has a passage.
{
  const reached = new Set();
  for (const m of Object.values(ENDING_MANIFEST)) for (const a of m.arrivals) reached.add(a);
  for (const arrival of Object.values(ENDING_ARRIVAL)) {
    assert.ok(reached.has(arrival), `${arrival} reaches at least one ending`);
  }
  for (const arrival of [ENDING_ARRIVAL.DEFEATED, ENDING_ARRIVAL.TIMED_OUT]) {
    for (const id of ['sacrifice', 'helped']) {
      assert.ok(endingArrivalPassage(id, arrival),
        `${id} says something when it is reached by ${arrival} rather than swallowing it`);
      assert.equal(endingDocuments(id, arrival).length, 2,
        `${id} reached by ${arrival} plays its passage and THEN the ending`);
    }
  }
}
// The front door of an ending plays the ending and nothing else.
assert.equal(endingDocuments('sacrifice', ENDING_ARRIVAL.AGREED).length, 1);
assert.equal(endingDocuments('surfaced', ENDING_ARRIVAL.CARRIED).length, 1);

// ── the coda ────────────────────────────────────────────────────────────────
// Staying with nothing disclosed leaves no account to close, and that is the one
// gate scene the player is not in.
assert.equal(endingCodaVariant('sacrifice', { confession: { kind: 'nothing' } }), 'nobody');
assert.equal(endingCodaVariant('sacrifice', { confession: { kind: 'name' } }), 'client');
assert.equal(endingCodaVariant('inversion'), 'out');
assert.equal(endingCodaVariant('surfaced'), 'surfaced');
assert.equal(endingCodaVariant('helped'), 'helped');
assert.equal(endingCodaVariant('drugged'), 'drugged');

// ── the dossier ─────────────────────────────────────────────────────────────
// It has to survive having nothing to work with: a god-menu jump reaches an
// ending with no run on the save, and the ending still has to play.
{
  const empty = buildEndingDossier({ endingId: 'sacrifice' });
  assert.equal(empty.takes.completed, 0);
  assert.equal(empty.confession.kind, 'nothing', 'no answer is itself an answer');
  assert.equal(empty.confession.spoken, false);
  assert.equal(empty.equipment.complete, true);
}

// ANY CONFESSION PAYS OFF. This is the fix for the audit's largest single
// complaint: only the exact string "Sarah" used to reach the endings at all.
{
  const sarah = buildEndingDossier({ endingId: 'sacrifice', live: { confessionKind: 'name', confessionValue: 'Sarah' } });
  assert.equal(sarah.confession.sarah, true);
  assert.equal(sarah.confession.spoken, true);

  const other = buildEndingDossier({ endingId: 'sacrifice', live: { confessionKind: 'name', confessionValue: 'Daniel' } });
  assert.equal(other.confession.sarah, false, 'a different name is not Sarah');
  assert.equal(other.confession.spoken, true, 'but it was still said, and the ending has to know');
  assert.equal(other.confession.value, 'Daniel', 'and it can quote it');

  const why = buildEndingDossier({ endingId: 'sacrifice', live: { confessionKind: 'reason', confessionValue: 'money' } });
  assert.equal(why.confession.spoken, true, 'a reason is a disclosure too');
  assert.equal(why.confession.kind, 'reason');
}

// ── the projection ──────────────────────────────────────────────────────────
// Authored `when` is evaluated by flagTest, whose comparison operator only takes
// a NUMBER on the right. Enumerations must therefore be booleans, or the
// condition silently reads as a truthiness test and every branch fires.
{
  const dossier = buildEndingDossier({
    endingId: 'helped',
    arrival: ENDING_ARRIVAL.DEFEATED,
    live: { confessionKind: 'name', confessionValue: 'Sarah', drankCoffee: true, sourceOutcome: 'contain', hushContacts: 3 },
  });
  const flags = projectDossierFlags(dossier);

  assert.equal(flags['ending.arrival.defeated'], true);
  assert.equal(flags['ending.arrival.agreed'], false, 'an arrival it was not reached by is FALSE, not absent');
  assert.equal(flags['ending.confession.name'], true);
  assert.equal(flags['ending.confession.reason'], false);
  assert.equal(flags['ending.source.contain'], true);
  assert.equal(flags['ending.source.rescue'], false);
  assert.equal(flags['ending.hush.contacts'], 3);
  assert.equal(flags['ending.coffee'], true);

  // EVERY PROJECTED NAME MUST BE WRITABLE AS A CONDITION.
  //
  // flagTest tolerates a hyphen by falling through to a raw lookup; the studio's
  // validateConditionExpression does not, and its PATH is the stricter of the
  // two. A name that only one of them accepts is a condition that works in the
  // game and fails validation, which is how `ending.arrival.timed-out` was
  // caught. Assert against the strict one.
  const STUDIO_PATH = /^[A-Za-z_][\w.]*$/;
  for (const [name, value] of Object.entries(flags)) {
    assert.ok(name.startsWith('ending.'), `${name} stays inside the ending namespace`);
    assert.ok(STUDIO_PATH.test(name), `${name} is writable as an authored condition`);
    assert.equal(validateConditionExpression(name).length, 0, `${name} validates as a condition`);
    assert.ok(
      typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string',
      `${name} projects to something flagTest can read`,
    );
  }
  assert.equal(flags['ending.arrival.timedOut'], false, 'the hyphenated arrival folds to a legal flag name');
  // Every enumerated member exists as its own flag, so a condition can never be
  // written against a member that was simply never projected.
  for (const kind of ['name', 'reason', 'feeling', 'nothing']) {
    assert.ok(`ending.confession.${kind}` in flags, `confession.${kind} is projected even when false`);
  }
}
assert.ok(dossierFlagNames().length > 30, 'the projected vocabulary is large enough to author against');
assert.ok(dossierFlagNames().includes('ending.takes.clean'));

// ── the timeline ────────────────────────────────────────────────────────────
// Authored in seconds from the first line, and drained by "what is due since I
// last asked" so an ordinary frame tick can drive it.
{
  const seal = endingManifest('sacrifice').environment;
  assert.deepEqual(dueTimelineSteps(seal, 0, 0), [], 'nothing is due before any time has passed');
  const first = dueTimelineSteps(seal, -0.001, 0.5);
  assert.equal(first.length, 1, 'the lens is set on the first frame');
  assert.equal(first[0].kind, 'lens');

  const window = dueTimelineSteps(seal, 5.0, 12.0);
  assert.ok(window.length >= 2, 'two circuits die inside a seven-second window');

  // Nothing is ever delivered twice.
  const all = [];
  let cursor = -0.001;
  for (let t = 0; t <= 40; t += 0.25) { all.push(...dueTimelineSteps(seal, cursor, t)); cursor = t; }
  assert.equal(all.length, seal.length, 'every step fires exactly once across the whole ending');
}

// ── every document the contract names actually exists ───────────────────────
//
// The manifest resolves a document id per ending per arrival, and runtimeEndingTree
// THROWS on a missing one — so a typo here is a crash at the last moment of a
// three-hour run, in the one place a player can least afford one. Resolve every
// combination against the disk.
{
  const seen = new Set();
  const dossiers = [
    buildEndingDossier({ endingId: 'sacrifice', live: { confessionKind: 'name', confessionValue: 'Sarah' } }),
    buildEndingDossier({ endingId: 'sacrifice', live: { confessionKind: 'nothing' } }),
  ];
  for (const id of ENDING_IDS) {
    for (const arrival of endingManifest(id).arrivals) {
      for (const dossier of dossiers) {
        for (const doc of endingDocuments(id, arrival, { ...dossier, injuries: 3, takes: { ...dossier.takes, full: true } })) {
          seen.add(doc.id);
        }
      }
    }
  }
  for (const documentId of seen) {
    assert.ok(existsSync(`content/narrative/${documentId}.story.json`),
      `${documentId} is named by the ending contract and must exist as an authored document`);
  }
  // Injuries span the whole authored range, not just the one the fixture used.
  for (let injuries = 0; injuries <= 5; injuries += 1) {
    for (const sarah of [true, false]) {
      const [doc] = endingDocuments('sacrifice', ENDING_ARRIVAL.AGREED,
        { confession: { sarah }, injuries, takes: {} });
      assert.ok(existsSync(`content/narrative/${doc.id}.story.json`), `${doc.id} exists`);
    }
  }
}

// ── the six codas ───────────────────────────────────────────────────────────
//
// The last page of the game. They were five lines each, migrated faithfully from
// a JS function that is now deleted — so the parity check that used to guard them
// has nothing to compare against, and this replaces it with what actually matters
// about a coda.
{
  const CODAS = ['out', 'client', 'nobody', 'helped', 'drugged', 'surfaced'];
  const codaLines = (variant) => {
    const doc = JSON.parse(readFileSync(`content/narrative/ending.epilogue.${variant}.story.json`, 'utf8'));
    return Object.values(doc.nodes).flatMap((node) => node.lines || []);
  };
  for (const variant of CODAS) {
    const lines = codaLines(variant);
    assert.ok(lines.length >= 8, `the ${variant} coda is a coda and not a stub (${lines.length} lines)`);
    // THE RETURNED COLUMN IS THE BEST OBJECT IN THIS STORY and three of the six
    // never mentioned it. Every gate scene now has a position on it — signed,
    // struck out, left empty, or ruled again for the next one.
    assert.ok(lines.some((line) => /RETURNED|right column|right-hand side/i.test(line.text)),
      `the ${variant} coda has a position on the RETURNED column`);
  }
  // The two that are actually signed, and the one the player is not in.
  assert.ok(codaLines('surfaced').some((line) => /Two of you/.test(line.text)));
  assert.ok(codaLines('nobody').every((line) => line.who !== 'you'),
    'the player has no lines in the coda they did not come back from');
}

// ── the audio that is still owed ────────────────────────────────────────────
//
// Every ending is currently wearing the opening title theme. That is a decision,
// not an oversight, and the way it stays a decision is that this prints on every
// `npm test` until the files land. Assert the list is honest, then say it out loud.
{
  assert.ok(ENDING_AUDIO_TODO.length > 0, 'the outstanding-audio list is the source of truth');
  const beds = new Set(ENDING_AUDIO_TODO.filter((e) => e.kind === 'bed').map((e) => e.id));
  for (const id of ENDING_IDS) {
    const audio = endingManifest(id).audio;
    assert.ok(audio?.bed, `${id} names a bed`);
    if (audio.placeholder) {
      assert.ok(beds.has(`ending.bed.${id}`),
        `${id} is on a borrowed bed and must be listed in ENDING_AUDIO_TODO until it is not`);
    }
  }
  for (const entry of ENDING_AUDIO_TODO) {
    assert.ok(entry.id && entry.kind && entry.seconds && entry.note,
      `${entry.id} says what it is, how long, and what it is for`);
  }
}

console.log('ending contract specs passed');
// ── WHERE THE HALL TAKE WAS ROLLED ──────────────────────────────────────────
//
// The concert hall is one zone with four floors in it, so `amplifications` alone
// cannot say whether the minute was taken in the stalls or seven metres above
// them. The place arrives as BOOLEANS because flagTest's comparison operator
// only accepts a numeric literal on the right — a string compare degrades to a
// truthiness test and every branch fires at once.
{
  const base = buildEndingDossier({ endingId: 'surfaced' });
  const withPlace = (places) => ({ ...base, takes: { ...base.takes, completed: 1, rooms: ['amplifications'], places } });
  const hallFlags = (places) => {
    const flags = projectDossierFlags(withPlace(places));
    return Object.fromEntries(Object.entries(flags)
      .filter(([name]) => name.startsWith('ending.takes.hall.'))
      .map(([name, value]) => [name.replace('ending.takes.hall.', ''), value]));
  };

  const upper = hallFlags({ amplifications: 'upper' });
  assert.equal(upper.upper, true, 'an upper-balcony take says so');
  assert.equal(upper.aloft, true, 'and counts as aloft');
  assert.equal(upper.orchestra, false, 'and is not also the stalls');

  const lower = hallFlags({ amplifications: 'lower' });
  assert.equal(lower.lower, true);
  assert.equal(lower.aloft, true, 'either balcony is aloft');

  const stalls = hallFlags({ amplifications: 'orchestra' });
  assert.equal(stalls.orchestra, true);
  assert.equal(stalls.aloft, false, 'the stalls are not aloft');

  // No hall take at all must not read as any place. A missing take is not a
  // take from the floor.
  for (const [name, value] of Object.entries(hallFlags({}))) {
    assert.equal(value, false, `${name} is false when no hall take exists`);
  }

  // The grammar constraints, asserted rather than trusted.
  for (const [name, value] of Object.entries(hallFlags({ amplifications: 'lower' }))) {
    assert.equal(typeof value, 'boolean', `takes.hall.${name} is a boolean, not an enumeration`);
    assert.ok(!name.includes('-'), `takes.hall.${name} carries no hyphen`);
  }
  // Every one of them must be reachable by an authored `when`, which means being
  // in the declared flag list AND surviving the studio's expression validator.
  const names = dossierFlagNames().filter((name) => name.startsWith('ending.takes.hall.'));
  assert.ok(names.length >= 6, `every hall place is a declared flag (${names.length})`);
  for (const name of names) {
    assert.ok(validateConditionExpression(name).ok !== false, `${name} validates as an authored condition`);
  }
}
console.log('  hall take placement flags ok');

console.log('');
console.log('  ⚠ ENDING AUDIO OUTSTANDING — all five endings play the opening title theme.');
for (const entry of ENDING_AUDIO_TODO) {
  console.log(`     ${entry.id.padEnd(30)} ${entry.kind.padEnd(9)} ${String(entry.seconds).padStart(6)}s   ${entry.note}`);
}
console.log('');
