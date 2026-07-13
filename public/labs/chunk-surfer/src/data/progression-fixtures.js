import { freshMeta, freshRunRecord } from '../progression/schema.js';
import { DIFFICULTY_PRESETS } from '../progression/difficulty-defs.js';

export function progressionFixture(id = 'pristine') {
  const meta = freshMeta();
  let run = freshRunRecord({ preset: 'contract', meta, now: 1000, id: `run_lab_${id}` });
  if (id === 'first-return') meta.endingsSeen = ['sacrifice'];
  if (id === 'two-returns') meta.endingsSeen = ['sacrifice', 'inversion'];
  if (id === 'all-returns') meta.endingsSeen = ['sacrifice', 'helped', 'inversion', 'drugged'];
  if (id === 'dead-air-active' || id === 'dead-air-invalid') {
    meta.endingsSeen = ['sacrifice'];
    run = freshRunRecord({ preset: 'dead-air', values: DIFFICULTY_PRESETS['dead-air'].values, meta, now: 1000, id: `run_lab_${id}` });
  }
  if (id === 'dead-air-invalid') {
    run.integrity.deadAir.eligible = false;
    run.integrity.deadAir.invalidations.push({ at: 2000, reason: 'RULE_LOWERED', key: 'escapeTimer', from: 'dead-air', to: 'extended' });
  }
  return { id, meta, run };
}

export const PROGRESSION_CASE_IDS = Object.freeze([
  'pristine',
  'first-return',
  'two-returns',
  'all-returns',
  'dead-air-active',
  'dead-air-invalid',
]);
