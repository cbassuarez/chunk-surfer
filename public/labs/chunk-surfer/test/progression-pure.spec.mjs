import assert from 'node:assert/strict';

import {
  DEFAULT_RULE_VALUES,
  ENDING_IDS,
  EVENT_SCHEMA_VERSION,
  freshLedger,
  freshMeta,
  freshRunRecord,
  normalizeLedger,
  normalizeMeta,
  normalizeRun,
} from '../src/progression/schema.js';
import {
  DIFFICULTY_PRESETS,
  PRESET_ORDER,
  RULE_OPTIONS,
  RULE_RANK,
} from '../src/progression/difficulty-defs.js';
import {
  availablePresets,
  deadAirUnlocked,
  normalizeRuleValues,
  resolveDifficulty,
} from '../src/progression/difficulty.js';
import {
  applyRuleChange,
  beginIntegrity,
  isLowerChallenge,
  previewRuleChange,
} from '../src/progression/integrity.js';
import { createEventBus, EVENT_TYPES, validateEvent } from '../src/progression/events.js';
import { reduceRunLedger } from '../src/progression/run-ledger.js';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENT_DEFS } from '../src/progression/achievement-defs.js';
import { evaluateAchievements } from '../src/progression/achievements.js';
import { deriveUnlocks, diffUnlocks } from '../src/progression/unlocks.js';
import { buildRunSummary, returnIndexEntries } from '../src/progression/report.js';
import { choiceContentId, lineContentId } from '../src/progression/knowledge.js';
import { localStatKey, platformStatId, queueChangedStats } from '../src/progression/stat-defs.js';

const event = (type, payload = {}, seq = 1) => ({
  schema: EVENT_SCHEMA_VERSION,
  id: `run_test:${String(seq).padStart(6, '0')}`,
  runId: 'run_test',
  seq,
  at: 1000 + seq,
  type,
  source: 'test',
  payload,
});

// Definitions and Contract parity.
assert.equal(new Set(PRESET_ORDER).size, PRESET_ORDER.length);
assert.deepEqual(PRESET_ORDER, ['story', 'contract', 'night', 'dead-air']);
for (const id of PRESET_ORDER) assert.equal(DIFFICULTY_PRESETS[id].id, id);
for (const [key, options] of Object.entries(RULE_OPTIONS)) {
  assert.ok(options.includes(DEFAULT_RULE_VALUES[key]), `${key} lacks its Contract default`);
  assert.equal(new Set(options).size, options.length, `${key} has duplicate options`);
}

const contract = resolveDifficulty({ currentPreset: 'contract', values: DEFAULT_RULE_VALUES });
assert.equal(contract.presence.baseSpeedScale, 1);
assert.equal(contract.presence.huntSpeedScale, 1);
assert.equal(contract.presence.hearingScale, 1);
assert.equal(contract.recording.spoilNoiseScale, 1);
assert.equal(contract.redaction.healthBonus, 0);
assert.equal(contract.redaction.maxAttempts, 2);
assert.equal(contract.escape.seconds, 120);
assert.equal(contract.torch.drainScale, 1);
assert.equal(contract.fear.fearDecayScale, 1);
assert.equal(contract.navigation.showMap, true);
assert.equal(contract.navigation.showDistance, true);

const story = resolveDifficulty({ currentPreset: 'story', values: DIFFICULTY_PRESETS.story.values });
const night = resolveDifficulty({ currentPreset: 'night', values: DIFFICULTY_PRESETS.night.values });
const deadAir = resolveDifficulty({ currentPreset: 'dead-air', values: DIFFICULTY_PRESETS['dead-air'].values });
assert.ok(story.presence.baseSpeedScale < contract.presence.baseSpeedScale);
assert.ok(story.torch.drainScale < contract.torch.drainScale);
assert.ok(night.presence.baseSpeedScale > contract.presence.baseSpeedScale);
assert.ok(deadAir.presence.baseSpeedScale >= night.presence.baseSpeedScale);
assert.ok(deadAir.escape.seconds < night.escape.seconds);
assert.equal(deadAirUnlocked(freshMeta()), false);
assert.equal(deadAirUnlocked({ endingsSeen: ['sacrifice'] }), true);
assert.deepEqual(availablePresets(freshMeta()).map((p) => p.id), ['story', 'contract', 'night']);
assert.deepEqual(availablePresets({ endingsSeen: ['helped'] }).map((p) => p.id), PRESET_ORDER);
assert.deepEqual(normalizeRuleValues({ presencePressure: 'nonsense', escapeTimer: 'off' }), {
  ...DEFAULT_RULE_VALUES,
  escapeTimer: 'off',
});

// Integrity is append-only and accessibility-independent by construction.
assert.deepEqual(beginIntegrity('contract').deadAir, {
  startedEligible: false,
  eligible: false,
  invalidations: [],
});
assert.equal(beginIntegrity('dead-air').deadAir.eligible, true);
for (const [key, ranks] of Object.entries(RULE_RANK)) {
  const ordered = Object.entries(ranks).sort((a, b) => a[1] - b[1]);
  if (ordered.length < 2) continue;
  assert.equal(isLowerChallenge(key, ordered.at(-1)[0], ordered[0][0]), true, key);
}
const deadAirRun = freshRunRecord({
  preset: 'dead-air',
  values: DIFFICULTY_PRESETS['dead-air'].values,
  meta: { endingsSeen: ['sacrifice'] },
  now: 100,
  id: 'run_dead_air',
});
const preview = previewRuleChange(deadAirRun, 'escapeTimer', 'extended');
assert.equal(preview.needsIntegrityWarning, true);
const invalidated = applyRuleChange(deadAirRun, preview.change, 500);
assert.equal(invalidated.integrity.deadAir.eligible, false);
assert.equal(invalidated.integrity.deadAir.invalidations.length, 1);
assert.equal(invalidated.rules.currentPreset, 'custom');
const cannotRequalify = applyRuleChange(invalidated, { key: 'escapeTimer', to: 'dead-air' }, 600);
assert.equal(cannotRequalify.integrity.deadAir.eligible, false);
assert.equal(cannotRequalify.integrity.deadAir.invalidations.length, 1);

// Event validation and bus isolation.
assert.equal(validateEvent(event(EVENT_TYPES.TAKE_COMPLETED, { roomId: 'main_b3', elapsed: 45 })), true);
assert.equal(validateEvent(event(EVENT_TYPES.TAKE_COMPLETED, { roomId: 'main_b3' })), false);
assert.equal(validateEvent(event('made.up', {})), false);
const seen = [];
const errors = [];
const bus = createEventBus({ onError: (...args) => errors.push(args) });
const off = bus.on(EVENT_TYPES.HUSH_MET, () => seen.push('specific'));
bus.on('*', () => seen.push('wildcard'));
bus.on(EVENT_TYPES.HUSH_MET, () => { throw new Error('isolated'); });
bus.emit(event(EVENT_TYPES.HUSH_MET));
assert.deepEqual(seen, ['specific', 'wildcard']);
assert.equal(errors.length, 1);
off();
bus.emit(event(EVENT_TYPES.HUSH_MET, {}, 2));
assert.deepEqual(seen, ['specific', 'wildcard', 'wildcard']);

// Ledger reduction.
let ledger = freshLedger();
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.TAKE_COMPLETED, { roomId: 'main_b3', elapsed: 45 }, 1));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.TAKE_COMPLETED, { roomId: 'main_b3', elapsed: 45 }, 2));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.TAKE_SPOILED, { roomId: 'the_tub' }, 3));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.PLAYER_INJURED, { count: 2 }, 4));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.BATTLE_STARTED, { id: 'hall' }, 5));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.BATTLE_FINISHED, { id: 'hall', result: 'win', attempts: 1, firstPass: true }, 6));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.DOCUMENT_READ, { id: 'work-order' }, 7));
ledger = reduceRunLedger(ledger, event(EVENT_TYPES.DOCUMENT_READ, { id: 'work-order' }, 8));
assert.equal(ledger.takes.completed, 2);
assert.deepEqual(ledger.takes.rooms, ['main_b3']);
assert.equal(ledger.takes.spoiled, 1);
assert.equal(ledger.injuries, 2);
assert.equal(ledger.battles.started, 1);
assert.equal(ledger.battles.won, 1);
assert.equal(ledger.battles.firstPassWon, 1);
assert.deepEqual(ledger.documentsRead, ['work-order']);
assert.equal(ledger.seq, 8);
assert.deepEqual(normalizeLedger({ takes: { rooms: ['a', 'a'] } }).takes.rooms, ['a']);

// Achievement definitions are canonical and inaccessible settings are absent.
assert.equal(new Set(ACHIEVEMENT_DEFS.map((d) => d.id)).size, ACHIEVEMENT_DEFS.length);
for (const def of ACHIEVEMENT_DEFS) {
  assert.equal(ACHIEVEMENT_BY_ID[def.id], def);
  assert.ok(def.events.length > 0, `${def.id} has no event`);
}
const forbidden = ['flash', 'shake', 'textCps', 'instantText', 'volume', 'music', 'dialog', 'sfx', 'mic'];
for (const def of ACHIEVEMENT_DEFS) {
  const source = String(def.test);
  assert.equal(/\bsettings\b/.test(source), false, `${def.id} references settings`);
  for (const key of forbidden) {
    const property = new RegExp(`(?:\\.|\\?\\.)${key}\\b`);
    assert.equal(property.test(source), false, `${def.id} references ${key}`);
  }
}

const achievementRun = freshRunRecord({ now: 1, id: 'run_test' });
achievementRun.ledger.takes.rooms = ['a', 'b', 'c', 'd', 'e'];
achievementRun.ledger.takes.completed = 5;
const profile = freshMeta();
assert.deepEqual(
  evaluateAchievements({
    event: event(EVENT_TYPES.TAKE_COMPLETED, { roomId: 'e', elapsed: 45 }),
    profile,
    run: achievementRun,
  }).sort(),
  ['ACH_FIRST_TAKE', 'ACH_FIVE_ROOMS'].sort(),
);
const deadAirSummary = {
  rules: { startedPreset: 'dead-air' },
  integrity: { deadAir: { eligible: true } },
  takes: { completed: 5, spoiled: 0 },
  battles: { started: 3, lost: 0, firstPassWon: 3 },
  injuries: 0,
};
assert.ok(evaluateAchievements({
  event: event(EVENT_TYPES.RUN_FINISHED, { summary: deadAirSummary }),
  profile,
  run: achievementRun,
  summary: deadAirSummary,
}).includes('ACH_DEAD_AIR'));

// Replay unlock graph and withheld return presentation.
const pristineUnlocks = deriveUnlocks(freshMeta());
assert.equal(pristineUnlocks.deadAir, false);
const firstMeta = { ...freshMeta(), endingsSeen: ['sacrifice'] };
const firstUnlocks = deriveUnlocks(firstMeta);
assert.equal(firstUnlocks.deadAir, true);
assert.equal(firstUnlocks.returnIndex, true);
assert.equal(firstUnlocks.seenTextAcceleration, true);
assert.equal(firstUnlocks.condensedCheckIn, true);
const allMeta = { ...freshMeta(), endingsSeen: [...ENDING_IDS] };
assert.equal(deriveUnlocks(allMeta).customShift, true);

const customRun = freshRunRecord({
  preset: 'custom',
  values: { ...DEFAULT_RULE_VALUES, escapeTimer: 'off' },
  meta: allMeta,
  now: 10,
  id: 'run_custom',
});
assert.equal(customRun.rules.startedPreset, 'custom');
assert.equal(customRun.integrity.deadAir.startedEligible, false);
assert.equal(resolveDifficulty(customRun.rules).escape.seconds, null);
assert.ok(diffUnlocks(pristineUnlocks, firstUnlocks).includes('deadAir'));
const index = returnIndexEntries(firstMeta);
assert.equal(index.filter((x) => x.seen).length, 1);
assert.equal(index.find((x) => !x.seen).displayTitle, '████████████');
assert.equal(index.find((x) => !x.seen).displayClassification, '');

// Stable replay IDs do not depend on display copy when explicit semantic IDs exist.
assert.equal(lineContentId({ sceneId: 's', nodeId: 'n', line: { id: 'line.semantic', text: 'old' }, index: 0 }), 'line.semantic');
assert.equal(choiceContentId({ sceneId: 's', nodeId: 'n', choice: { knowledgeId: 'route.semantic', id: 'surface.a', text: 'old' }, index: 0 }), 'route.semantic');
assert.equal(choiceContentId({ sceneId: 's', nodeId: 'n', choice: { knowledgeId: 'route.semantic', id: 'surface.b', text: 'new' }, index: 9 }), 'route.semantic');

// Report prefers authoritative take/injury state.
const reportRun = freshRunRecord({ preset: 'contract', now: 1000, id: 'run_report' });
reportRun.ledger.takes.rooms = ['stale'];
reportRun.ledger.takes.spoiled = 2;
const report = buildRunSummary({
  endingId: 'inversion',
  save: { run: reportRun, playSeconds: 500 },
  meta: firstMeta,
  authoritative: { rec: { takes: ['a', 'b', 'c', 'd', 'e'], injuries: 1 }, missingEquipment: ['radio'] },
  now: 2000,
});
assert.equal(report.takes.completed, 5);
assert.equal(report.injuries, 1);
assert.deepEqual(report.equipment.missing, ['radio']);
assert.equal(report.durationSeconds, 500);

// Defensive normalization and stat mapping.
const repairedRun = normalizeRun({
  id: '',
  status: 'broken',
  rules: { values: { escapeTimer: 'bogus' } },
  ledger: { takes: { rooms: ['a', 'a'] } },
}, { activeFallback: true });
assert.equal(repairedRun.status, 'active');
assert.deepEqual(repairedRun.ledger.takes.rooms, ['a']);
const repairedMeta = normalizeMeta({ endingsSeen: ['sacrifice', 'sacrifice', 'unknown'], stats: { runsStarted: -5 } });
assert.deepEqual(repairedMeta.endingsSeen, ['sacrifice']);
assert.equal(repairedMeta.stats.runsStarted, 0);
assert.equal(platformStatId('takesCompleted'), 'STAT_TAKES_COMPLETED');
assert.equal(localStatKey('STAT_TAKES_COMPLETED'), 'takesCompleted');
assert.deepEqual(queueChangedStats({ takesCompleted: 1 }, { takesCompleted: 3 }, {}), { STAT_TAKES_COMPLETED: 3 });

console.log('progression pure tests ok');
