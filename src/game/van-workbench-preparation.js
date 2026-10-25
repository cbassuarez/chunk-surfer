import { BENCH_PACK_GROUPS, prepareWorkbenchFlags } from './bench-preparation.js';
import { normalizeFieldKit, resolveFieldKit } from './field-kit.js';
import { normalizeVanPreparation, prepareVanDifficultyFinalization } from '../progression/van-preparation.js';
import { DIFFICULTY_PRESETS } from '../progression/difficulty-defs.js';
import { presetUnlocked } from '../progression/difficulty.js';
import { deriveUnlocks } from '../progression/unlocks.js';

// An explicit starter-kit action fills empty bays. It never replaces a choice
// already packed, changes a finish, or chooses the run's shift.
export function prepareVanReferenceKit({ flags = {}, fieldKit = null } = {}) {
  const nextFlags = { ...flags }, nextKit = normalizeFieldKit(fieldKit);
  const groups = BENCH_PACK_GROUPS.filter(group => flags[`van.packed.${group}`] !== true);
  for (const group of groups) {
    nextKit[group] = 'reference';
    nextFlags[`van.packed.${group}`] = true;
  }
  return { fieldKit: nextKit, flags: nextFlags, groups, changed: groups.length > 0 };
}

// The shelf offers a complete standard case. Deriving that offer grants
// nothing: only an explicit packing action or TAKE CASE commits this patch.
export function offeredVanPreparation(save = {}, meta = null) {
  const flags = prepareWorkbenchFlags(save.flags || {});
  const reference = prepareVanReferenceKit({ flags, fieldKit: resolveFieldKit(save.fieldKit, meta) });
  const difficultyLocked = flags['van.difficulty.pending'] !== true;
  let difficulty = normalizeVanPreparation(save.vanPreparation).difficulty;
  if (difficultyLocked) {
    difficulty = normalizeVanPreparation({ difficulty: { preset: save.run?.rules?.currentPreset,
      values: save.run?.rules?.values } }).difficulty
      || normalizeVanPreparation({ difficulty: { preset: 'contract' } }).difficulty;
  } else if (!difficulty) {
    const preferred = save.settings?.lastDifficulty;
    const allowed = preferred === 'custom' ? deriveUnlocks(meta).customShift
      : Object.hasOwn(DIFFICULTY_PRESETS, preferred) && presetUnlocked(preferred, meta);
    difficulty = normalizeVanPreparation({ difficulty: { preset: allowed ? preferred : 'contract',
      values: save.settings?.customShiftRules } }).difficulty;
  }
  return {
    fieldKit: reference.fieldKit,
    flags: { ...reference.flags, 'bag.taken': true, 'kit.taken': true, 'map.taken': true },
    vanPreparation: difficultyLocked ? normalizeVanPreparation(save.vanPreparation) : { schema: 1, difficulty },
    difficulty, difficultyLocked, caseClaimed: save.flags?.['bag.taken'] === true,
  };
}

// The finalizer sees the offered kit without first saving an intermediate
// acquisition. Its complete patch can be committed by the owner once.
export function prepareVanCaseTake(save = {}, meta = null, now = Date.now()) {
  if (save.flags?.['van.closed']) return { ok: false, reason: 'VAN_CLOSED', event: null, patch: null };
  const offer = offeredVanPreparation(save, meta);
  const patch = { fieldKit: offer.fieldKit, flags: offer.flags, vanPreparation: offer.vanPreparation };
  if (save.flags?.['van.difficulty.pending'] === true) {
    const result = prepareVanDifficultyFinalization({ ...save, ...patch }, offer.difficulty, meta, now);
    return result.ok ? { ...result, patch: { ...patch, ...result.patch } } : result;
  }
  return { ok: true, event: null, patch: { ...patch, flags: { ...patch.flags, 'kit.fitted': true } } };
}

// Optional shelf reading preserves existing notes and badge choices. Returning
// from it never shoulders the case or closes the van.
export function vanWorkbenchNotesTree(tree = {}) {
  const next = structuredClone(tree);
  if (next.hub?.choices) next.hub.choices = next.hub.choices.map(choice => choice.goto === 'leave'
    ? { ...choice, text: 'back to the workbench' } : choice);
  if (next.leave) next.leave = { ...next.leave,
    lines: [{ who: 'direction', text: 'You set the note back beside the open case.' }] };
  return next;
}

const PREPARATION_FLAGS = Object.freeze([
  'van.preparation.v1', 'van.bench.v2', 'van.difficulty.pending',
  'bag.taken', 'kit.taken', 'map.taken', 'kit.fitted',
  ...BENCH_PACK_GROUPS.map(group => `van.packed.${group}`),
  'van.spanner.decided', 'van.spanner.taken',
  'van.difficulty.chosen', 'van.run-started', 'van.closed',
]);

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  }
  return value;
}

// Compare only preparation's durable facts. Position, play time, unrelated
// story flags and profile statistics can legitimately change around a write.
export function vanPreparationSaveProjection(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
  return ordered({
    run: {
      id: save.run?.id ?? null,
      startedAt: save.run?.startedAt ?? null,
      rules: save.run?.rules ?? null,
      integrity: save.run?.integrity ?? null,
      ledgerSeq: Number(save.run?.ledger?.seq) || 0,
    },
    flags: Object.fromEntries(PREPARATION_FLAGS.map(key => [key, save.flags?.[key] === true])),
    fieldKit: normalizeFieldKit(save.fieldKit),
    vanPreparation: normalizeVanPreparation(save.vanPreparation),
    spannerOwned: save.plantIncident?.spannerOwned === true,
    settings: {
      lastDifficulty: save.settings?.lastDifficulty ?? null,
      customShiftRules: save.settings?.customShiftRules ?? null,
    },
  });
}

export function vanPreparationSaveMatches(expected, actual) {
  const before = vanPreparationSaveProjection(expected), after = vanPreparationSaveProjection(actual);
  return before !== null && after !== null && JSON.stringify(before) === JSON.stringify(after);
}

function cosmeticSelection(meta) {
  return {
    selected: typeof meta?.cosmetics?.selected === 'string' ? meta.cosmetics.selected : null,
    unlocked: [...new Set((Array.isArray(meta?.cosmetics?.unlocked) ? meta.cosmetics.unlocked : [])
      .filter(id => typeof id === 'string'))].sort(),
  };
}

// The owner has already applied its change to the session. Queue functions are
// supplied so this receipt stays ordered with ordinary writes. A failed receipt
// does not roll that change back; the same visible selection can be retried.
export async function persistVanPreparation({ save, meta = null, saveGame, saveProfile,
  loadSave, loadProfile } = {}) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { ok: false, reason: 'NO_SAVE' };
  if (typeof saveGame !== 'function' || typeof loadSave !== 'function'
    || (meta !== null && (typeof saveProfile !== 'function' || typeof loadProfile !== 'function'))) {
    return { ok: false, reason: 'STORAGE_UNAVAILABLE' };
  }
  let snapshot, profile;
  try { snapshot = structuredClone(save); profile = meta === null ? null : structuredClone(meta); }
  catch (error) { return { ok: false, reason: 'INVALID_SNAPSHOT', error: String(error?.message || error) }; }
  let phase = 'SAVE_WRITE';
  try {
    if (profile !== null) {
      phase = 'PROFILE_WRITE';
      if (await saveProfile(profile) !== true) return { ok: false, reason: 'PROFILE_NOT_ACKNOWLEDGED' };
    }
    phase = 'SAVE_WRITE';
    if (await saveGame(snapshot) !== true) return { ok: false, reason: 'SAVE_NOT_ACKNOWLEDGED' };
    phase = 'SAVE_READ';
    if (!vanPreparationSaveMatches(snapshot, await loadSave())) return { ok: false, reason: 'SAVE_MISMATCH' };
    if (profile !== null) {
      phase = 'PROFILE_READ';
      const actual = await loadProfile();
      if (!actual || JSON.stringify(cosmeticSelection(profile)) !== JSON.stringify(cosmeticSelection(actual))) {
        return { ok: false, reason: 'PROFILE_MISMATCH' };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `${phase}_FAILED`, error: String(error?.message || error) };
  }
}
