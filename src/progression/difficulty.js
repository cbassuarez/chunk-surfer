import { DEFAULT_RULE_VALUES } from './schema.js';
import {
  BREATH_RULES,
  DIFFICULTY_PRESETS,
  ESCAPE_RULES,
  NAVIGATION_RULES,
  PRESET_ORDER,
  PRESENCE_RULES,
  RECORDING_RULES,
  REDACTION_RULES,
  RULE_OPTIONS,
  TORCH_RULES,
} from './difficulty-defs.js';

export function deadAirUnlocked(meta) {
  return Array.isArray(meta?.endingsSeen) && meta.endingsSeen.length > 0;
}

export function presetUnlocked(id, meta) {
  return id !== 'dead-air' || deadAirUnlocked(meta);
}

export function availablePresets(meta) {
  return PRESET_ORDER
    .filter((id) => presetUnlocked(id, meta))
    .map((id) => DIFFICULTY_PRESETS[id]);
}

export function presetById(id, meta = null) {
  const requested = DIFFICULTY_PRESETS[id];
  if (requested && presetUnlocked(id, meta)) return requested;
  return DIFFICULTY_PRESETS.contract;
}

export function normalizeRuleValues(values = {}) {
  const out = { ...DEFAULT_RULE_VALUES };
  for (const [key, options] of Object.entries(RULE_OPTIONS)) {
    const value = values?.[key];
    if (options.includes(value)) out[key] = value;
  }
  return out;
}

export function rulesForPreset(id, meta = null) {
  const preset = presetById(id, meta);
  return {
    startedPreset: preset.id,
    currentPreset: preset.id,
    custom: false,
    values: { ...preset.values },
  };
}

export function resolveDifficulty(runRules = null) {
  const values = normalizeRuleValues(runRules?.values);
  return Object.freeze({
    id: runRules?.currentPreset || 'contract',
    values: Object.freeze({ ...values }),
    presence: PRESENCE_RULES[values.presencePressure] || PRESENCE_RULES.standard,
    recording: RECORDING_RULES[values.recordingForgiveness] || RECORDING_RULES.standard,
    redaction: REDACTION_RULES[values.redactionAssistance] || REDACTION_RULES.standard,
    navigation: NAVIGATION_RULES[values.navigationSignal] || NAVIGATION_RULES.directional,
    escape: ESCAPE_RULES[values.escapeTimer] || ESCAPE_RULES.standard,
    torch: TORCH_RULES[values.torchDrain] || TORCH_RULES.standard,
    fear: BREATH_RULES[values.involuntaryBreath] || BREATH_RULES.standard,
  });
}

export function cycleRuleValue(key, current, delta = 1) {
  const options = RULE_OPTIONS[key] || [];
  if (!options.length) return current;
  const at = Math.max(0, options.indexOf(current));
  return options[(at + delta + options.length) % options.length];
}
