import { DIFFICULTY_PRESETS } from './difficulty-defs.js';
import { normalizeRuleValues, presetUnlocked, rulesForPreset } from './difficulty.js';
import { beginIntegrity } from './integrity.js';
import { deriveUnlocks } from './unlocks.js';
import { EVENT_SCHEMA_VERSION } from './schema.js';
import { EVENT_TYPES } from './events.js';
import { reduceRunLedger } from './run-ledger.js';
import { workbenchPackingComplete } from '../game/bench-preparation.js';

export function freshVanPreparation() { return { schema: 1, difficulty: null }; }

// A workbench selection remains a draft until the player packs the case.
// Preset values are always authored, never trusted numbers from a save/widget.
export function normalizeVanPreparation(value = null) {
  const source = value?.difficulty;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return freshVanPreparation();
  const preset = source.preset;
  if (preset !== 'custom' && !Object.hasOwn(DIFFICULTY_PRESETS, preset)) return freshVanPreparation();
  return { schema: 1, difficulty: { preset,
    values: preset === 'custom' ? normalizeRuleValues(source.values) : { ...DIFFICULTY_PRESETS[preset].values },
  } };
}

// Construct one save transaction containing both the initial rule identity and
// its RUN_STARTED ledger entry. The caller publishes `event` after committing;
// it must not feed it back through emitProgress and increment the ledger twice.
export function prepareVanDifficultyFinalization(save, selection = save?.vanPreparation?.difficulty, meta = null, now = Date.now()) {
  const flags = save?.flags || {};
  const run = save?.run;
  const reject = (reason) => ({ ok: false, changed: false, reason, event: null, patch: null });
  if (!run?.id || run.status !== 'active') return reject('NO_ACTIVE_RUN');
  if (flags['van.preparation.v1'] !== true || flags['van.difficulty.pending'] !== true) return reject('NOT_PENDING');
  if (!workbenchPackingComplete(flags)) return reject('KIT_INCOMPLETE');
  if (flags['van.difficulty.chosen'] === true || flags['van.run-started'] === true) return reject('ALREADY_FINALIZED');
  // Recovery safety: an old or malformed late-game save cannot claim a new
  // Dead Air start or change the starter-cable issue by adding pending flags.
  if (flags.prologueDone || flags['combat.trained'] || (save.takes?.length || 0) > 0
      || (run.ledger?.takes?.completed || 0) > 0 || (run.ledger?.battles?.started || 0) > 0) return reject('RUN_ALREADY_PROGRESSED');
  const draft = normalizeVanPreparation({ difficulty: selection }).difficulty;
  if (!draft) return reject('NO_DIFFICULTY');
  if (draft.preset === 'custom' ? !deriveUnlocks(meta).customShift : !presetUnlocked(draft.preset, meta)) return reject('PRESET_LOCKED');
  const rules = draft.preset === 'custom'
    ? { startedPreset: 'custom', currentPreset: 'custom', custom: true, values: draft.values }
    : rulesForPreset(draft.preset, meta);
  const at = Number.isFinite(Number(now)) ? Number(now) : Number(run.startedAt) || 0;
  const seq = (Number(run.ledger?.seq) || 0) + 1;
  const event = { schema: EVENT_SCHEMA_VERSION, id: `${run.id}:${String(seq).padStart(6, '0')}`,
    runId: run.id, seq, at, type: EVENT_TYPES.RUN_STARTED,
    source: 'progression.vanPreparation', payload: { preset: rules.startedPreset },
  };
  return { ok: true, changed: true, event, patch: {
    flags: { ...flags, 'kit.fitted': true, 'van.difficulty.pending': false,
      'van.difficulty.chosen': true, 'van.run-started': true },
    run: { ...run, rules, integrity: beginIntegrity(rules.startedPreset), ledger: reduceRunLedger(run.ledger, event) },
    settings: { ...save.settings, lastDifficulty: rules.startedPreset,
      ...(rules.custom ? { customShiftRules: { ...rules.values } } : {}) },
    vanPreparation: freshVanPreparation(),
  } };
}
