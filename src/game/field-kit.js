// Fictional field hardware. These selectors never change device permissions,
// microphone calibration, channel count, accessibility, or the player's volume.
// Consumers multiply their authored values by these bounded, baseline-one scales.
import { deriveUnlocks, witnessEditionStatus, WITNESS_EDITION_ID } from '../progression/unlocks.js';

const option = (id, label, description, effects = {}) => Object.freeze({
  id, label, description, effects: Object.freeze({ ...effects }),
});
export const FLASHLIGHT_HOUSING_COLORS = Object.freeze({ graphite: '#363f3c', olive: '#686c48', ivory: '#c5c5ad' });
const RECORDER_PLASTICS = Object.freeze({
  classic: ['#bc6b57', '#bcbda9', '#c9a151'],
  signal: ['#bc6b57', '#729aa9', '#d0bc64'],
  'sea-glass': ['#d09179', '#a7bda0', '#bcbda9'],
});

export const FIELD_KIT_OPTIONS = Object.freeze({
  headphones: Object.freeze([
    option('reference', 'REFERENCE', 'Balanced monitor and surrounding sound. No modifiers.'),
    option('closed', 'CLOSED BACK', 'Monitor level +15%; surrounding sound −10% while monitoring.',
      { monitorGainScale: 1.15, surroundingGainScale: .9 }),
    option('open', 'OPEN BACK', 'Surrounding sound +10%; monitor level −15% while monitoring.',
      { monitorGainScale: .85, surroundingGainScale: 1.1 }),
  ]),
  microphone: Object.freeze([
    option('reference', 'REFERENCE', 'Balanced incidental-noise pickup and take length. No modifiers.'),
    option('directional', 'DIRECTIONAL', 'Incidental recording noise −15%; takes need 10% longer.',
      { recordingNoiseScale: .85, takeDurationScale: 1.1 }),
    option('wide', 'WIDE FIELD', 'Takes finish 10% sooner; incidental recording noise +15%.',
      { recordingNoiseScale: 1.15, takeDurationScale: .9 }),
  ]),
  recorder: Object.freeze([
    option('reference', 'REFERENCE', 'Balanced overload margin and field-cell draw. No modifiers.'),
    option('low-draw', 'LOW DRAW', 'Field-cell drain −15%; recording overload margin −10%.',
      { torchDrainScale: .85, spoilToleranceScale: .9 }),
    option('headroom', 'HIGH HEADROOM', 'Recording overload margin +10%; field-cell drain +15%.',
      { spoilToleranceScale: 1.1, torchDrainScale: 1.15 }),
  ]),
  flashlight: Object.freeze([
    option('reference', 'REFERENCE', 'Balanced beam width, reach, and battery draw. No modifiers.'),
    option('throw', 'LONG THROW', 'A narrow beam reaches 25% farther; flashlight battery draw +20%.',
      { flashlightReachScale: 1.25, flashlightConeScale: .65, flashlightDrainScale: 1.2 }),
    option('flood', 'INSPECTION', 'A wide inspection beam reaches 25% less far; flashlight battery draw −10%.',
      { flashlightReachScale: .75, flashlightConeScale: 1.35, flashlightDrainScale: .9 }),
  ]),
  cosmetics: Object.freeze({
    faceplate: Object.freeze([
      option('aluminum', 'BRUSHED ALUMINUM', 'Unpainted aluminum faceplate. Appearance only.'),
      option('black', 'BLACK', 'Black enamel faceplate. Appearance only.'),
      option('olive', 'OLIVE', 'Olive enamel faceplate. Appearance only.'),
      option(WITNESS_EDITION_ID, 'WITNESS EDITION', 'Witness Edition recorder faceplate. Appearance only; keys and phosphor remain your choice.'),
    ]),
    buttons: Object.freeze([
      option('classic', 'CLASSIC', 'Red, ivory, and amber plastic. Appearance only.'),
      option('signal', 'SIGNAL', 'Red, blue, and yellow plastic. Appearance only.'),
      option('sea-glass', 'SEA GLASS', 'Coral, pale green, and ivory plastic. Appearance only.'),
    ]),
    vfd: Object.freeze([
      option('faithful', 'FAITHFUL', 'The instrument’s original phosphor colors. Appearance only.'),
      option('amber', 'AMBER', 'Amber display phosphor. Appearance only.'),
      option('ice', 'ICE BLUE', 'Ice-blue display phosphor. Appearance only.'),
    ]),
    flashlightHousing: Object.freeze([
      option('graphite', 'GRAPHITE', 'Graphite flashlight housing. Appearance only; the beam is unchanged.'),
      option('olive', 'OLIVE', 'Olive flashlight housing. Appearance only; the beam is unchanged.'),
      option('ivory', 'IVORY', 'Ivory flashlight housing. Appearance only; the beam is unchanged.'),
    ]),
  }),
});

export function freshFieldKit() {
  return { schema: 1, headphones: 'reference', microphone: 'reference', recorder: 'reference', flashlight: 'reference',
    cosmetics: { faceplate: 'aluminum', buttons: 'classic', vfd: 'faithful', flashlightHousing: 'graphite' } };
}

const known = (options, id, fallback) => options.some((entry) => entry.id === id) ? id : fallback;

export function normalizeFieldKit(value = null) {
  const defaults = freshFieldKit();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { schema: 1,
    headphones: known(FIELD_KIT_OPTIONS.headphones, source.headphones, defaults.headphones),
    microphone: known(FIELD_KIT_OPTIONS.microphone, source.microphone, defaults.microphone),
    recorder: known(FIELD_KIT_OPTIONS.recorder, source.recorder, defaults.recorder),
    flashlight: known(FIELD_KIT_OPTIONS.flashlight, source.flashlight, defaults.flashlight),
    cosmetics: Object.fromEntries(Object.entries(FIELD_KIT_OPTIONS.cosmetics).map(([key, choices]) =>
      [key, known(choices, source.cosmetics?.[key], defaults.cosmetics[key])])),
  };
}

// Catalog normalization above is deliberately unaware of profile ownership.
// Fitting and persisted equipment must pass through this separate authority.
// `kit` is accepted alongside the choice for shared workbench call sites; an
// equipped id never proves its own ownership.
export function fieldKitOptionAvailability(kit, group, id, meta = null) {
  const key = typeof group === 'string' ? group.replace(/^cosmetics\./, '') : '';
  const choices = FIELD_KIT_OPTIONS.cosmetics[key] || FIELD_KIT_OPTIONS[key];
  if (!Array.isArray(choices) || !choices.some((entry) => entry.id === id)) {
    return { visible: false, available: false, owned: false, count: 0, required: 0,
      endingIds: [], reason: 'UNKNOWN FIELD-KIT OPTION' };
  }
  if (key === 'faceplate' && id === WITNESS_EDITION_ID) {
    const status = witnessEditionStatus(meta);
    return { ...status, available: status.owned };
  }
  return { visible: true, available: true, owned: true, count: 0, required: 0,
    endingIds: [], reason: '' };
}

export function resolveFieldKit(value = null, meta = null) {
  const kit = normalizeFieldKit(value);
  if (!fieldKitOptionAvailability(kit, 'faceplate', kit.cosmetics.faceplate, meta).available) {
    kit.cosmetics.faceplate = freshFieldKit().cosmetics.faceplate;
  }
  return kit;
}

// The established profile selection is a single finish id, not a coordinated
// theme. Applying it never changes hardware, key colors, or display phosphor.
export function fieldKitForNewRun(meta = null, value = null) {
  const kit = resolveFieldKit(value, meta);
  const selected = meta?.cosmetics?.selected;
  if (fieldKitOptionAvailability(kit, 'faceplate', selected, meta).available) {
    kit.cosmetics.faceplate = selected;
  }
  return kit;
}

// Returns the complete `cosmetics` value for metaCommit({ cosmetics: ... }).
// Unknown or locked requests cannot replace an existing preference. Legacy
// cosmetic ids remain intact until the player explicitly fits a known finish.
export function fieldKitCosmeticSelection(value = null, meta = null) {
  const current = meta?.cosmetics;
  const selected = value?.cosmetics?.faceplate;
  return {
    unlocked: deriveUnlocks(meta).cosmetics,
    selected: fieldKitOptionAvailability(value, 'faceplate', selected, meta).available
      ? selected : typeof current?.selected === 'string' ? current.selected : null,
  };
}

export function fieldKitEffects(value = null) {
  const kit = normalizeFieldKit(value);
  const effects = { monitorGainScale: 1, surroundingGainScale: 1, recordingNoiseScale: 1,
    takeDurationScale: 1, spoilToleranceScale: 1, torchDrainScale: 1,
    flashlightReachScale: 1, flashlightConeScale: 1, flashlightDrainScale: 1 };
  for (const group of ['headphones', 'microphone', 'recorder', 'flashlight']) {
    Object.assign(effects, FIELD_KIT_OPTIONS[group].find((entry) => entry.id === kit[group]).effects);
  }
  return Object.freeze(effects);
}

// Shared inventory/inspection facts come from the very same option registry as
// fitting. Keep item identity (`recorder`) outside this presentation payload so
// choosing a model can never move it out of its existing combat/loadout slot.
export function fieldKitSummary(value = null) {
  const kit = normalizeFieldKit(value);
  const describe = (options, id) => {
    const selected = options.find((entry) => entry.id === id);
    return { id: selected.id, label: selected.label, description: selected.description };
  };
  const hardware = Object.fromEntries(['headphones', 'microphone', 'recorder', 'flashlight'].map((group) =>
    [group, describe(FIELD_KIT_OPTIONS[group], kit[group])]));
  const cosmetics = Object.fromEntries(Object.entries(FIELD_KIT_OPTIONS.cosmetics).map(([group, options]) =>
    [group, describe(options, kit.cosmetics[group])]));
  const title = 'FIELD RECORDER';
  return {
    title, label: title,
    subtitle: `${hardware.microphone.label} MIC / ${hardware.headphones.label} HEADPHONES`,
    description: [hardware.recorder, hardware.microphone, hardware.headphones, hardware.flashlight].map((item) => item.description).join(' '),
    facts: [
      ['AMP', hardware.recorder.label],
      ['MICROPHONE', hardware.microphone.label],
      ['HEADPHONES', hardware.headphones.label],
      ['FLASHLIGHT', hardware.flashlight.label],
      ...Object.entries(hardware).filter(([, item]) => item.id !== 'reference')
        .map(([group, item]) => [`${group.toUpperCase()} FIT`, item.description]),
      ['FINISH', `${cosmetics.faceplate.label} / ${cosmetics.buttons.label} KEYS / ${cosmetics.vfd.label} VFD`],
    ],
    hardware, cosmetics, effects: fieldKitEffects(kit),
  };
}

export function fieldKitInspection(value = null, group = 'recorder') {
  if (!['recorder', 'headphones', 'microphone', 'flashlight', 'amp'].includes(group)) return null;
  const summary = fieldKitSummary(value);
  const selected = summary.hardware[group === 'amp' ? 'recorder' : group];
  const id = group === 'recorder' ? 'recorder' : group === 'flashlight' ? 'light' : `${group}-${selected.id}`;
  const title = group === 'recorder' ? 'FIELD RECORDER' : `${selected.label} ${group.toUpperCase()}`;
  const description = group === 'recorder'
    ? 'Portable field recorder. Capture, monitor, and replay takes; the selected microphone and amplifier supply the signal path.'
    : selected.description;
  const functions = { recorder: 'CAPTURE / MONITOR', headphones: 'MONITOR / SURROUNDINGS', microphone: 'ROOM-TONE PICKUP',
    flashlight: 'FIELD ILLUMINATION', amp: 'RECORDING GAIN / FIELD-CELL DRAW' };
  const finish=summary.cosmetics.faceplate.id,buttons=RECORDER_PLASTICS[summary.cosmetics.buttons.id];
  return {
    id, title, label: title,
    ...(group === 'recorder' ? {
      materialColors: {
        'recorder-faceplate': finish === 'olive' ? '#61694b' : finish === 'black' ? '#242b2d' : '#bfc2b5',
        'recorder-ink': finish === 'aluminum' ? '#28312b' : '#d7d9bd',
        ...Object.fromEntries(['rec','stop','takes'].map((key,index)=>[`recorder-button-${key}`,buttons[index]])),
      },
      recorderPhosphor: summary.cosmetics.vfd.id,
    } : {}),
    ...(group === 'flashlight' ? { modelId: `flashlight-${selected.id}`,
      materialColors: { 'flashlight-housing': FLASHLIGHT_HOUSING_COLORS[summary.cosmetics.flashlightHousing.id] } } : {}),
    subtitle: group === 'recorder' ? `${summary.cosmetics.faceplate.label} / PORTABLE RECORDER`
      : `FIELD ${group.toUpperCase()}`,
    description,
    facts: [
      ['POSITION', 'CARRIED'], ['FUNCTION', functions[group]],
      ...(group === 'recorder' ? [] : [['FIT', selected.label], ['TRADEOFF', selected.description]]),
      ...(group === 'flashlight' ? [['HOUSING', summary.cosmetics.flashlightHousing.label]] : []),
      ...(group === 'recorder' ? [
        ['BATTLE', 'MONITOR CAPTURES A TAKE / PLAYBACK SPENDS IT'],
        summary.facts.find(([label]) => label === 'FINISH'),
      ] : []),
    ],
    battleCapable: group === 'recorder',
  };
}

// Old bags already contained the kit. Only new van-preparation runs require
// the separate fitting/acquisition steps; loading an old night must not remove it.
export function normalizeFieldKitOwnership(flags = {}) {
  const next = flags && typeof flags === 'object' && !Array.isArray(flags) ? { ...flags } : {};
  if (next['bag.taken'] === true && next['van.preparation.v1'] !== true) {
    next['kit.taken'] = true;
    next['kit.fitted'] = true;
    next['van.difficulty.chosen'] = true;
  }
  return next;
}
