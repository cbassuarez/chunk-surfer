// Physical inventory of the van bench. These are semantic objects, not screen
// coordinates: both picking and packing use the same authored catalogue.
export const WORKBENCH_VARIANTS = Object.freeze({
  headphones: Object.freeze(['reference', 'closed', 'open']),
  microphone: Object.freeze(['reference', 'directional', 'wide']),
  recorder: Object.freeze(['reference', 'low-draw', 'headroom']),
  flashlight: Object.freeze(['reference', 'throw', 'flood']),
  faceplate: Object.freeze(['aluminum', 'black', 'olive']),
});

const names = {
  headphones: ['REFERENCE HEADPHONES', 'CLOSED HEADPHONES', 'OPEN HEADPHONES'],
  microphone: ['REFERENCE MICROPHONE', 'DIRECTIONAL MICROPHONE', 'WIDE-FIELD MICROPHONE'],
  recorder: ['REFERENCE AMP', 'LOW-DRAW AMP', 'HIGH-HEADROOM AMP'],
  flashlight: ['FIELD FLASHLIGHT', 'LONG-THROW FLASHLIGHT', 'FLOOD FLASHLIGHT'],
  faceplate: ['BRUSHED ALUMINUM', 'BLACK ANODIZED', 'OLIVE ENAMEL'],
};
const columns = {
  headphones: { x: -6.6, width: 1.8 }, microphone: { x: -4.55, width: 1.5 },
  recorder: { x: 4.55, width: 1.65 }, flashlight: { x: 6.65, width: 1.8 },
};
export const WORKBENCH_TRAYS = Object.freeze([
  { group: 'headphones', label: '01 / MONITORING', x: -6.6, z: -.35, w: 2.05, d: 7.0 },
  { group: 'microphone', label: '02 / MICROPHONE', x: -4.55, z: -.35, w: 1.8, d: 7.0 },
  { group: 'recorder', label: '03 / AMPLIFIER', x: 4.55, z: -.35, w: 1.9, d: 7.0 },
  { group: 'flashlight', label: '04 / LIGHTING', x: 6.65, z: -.35, w: 2.0, d: 7.0 },
  { group: 'faceplate', label: 'SERVICE / FACEPLATES', x: 0, z: 4.4, w: 6.55, d: 1.55 },
].map(Object.freeze));

export function workbenchSelection(kit = {}, group) {
  return group === 'faceplate' ? kit.cosmetics?.faceplate || 'aluminum' : kit[group] || 'reference';
}

export function workbenchCatalog(state = {}) {
  const kit = state.fieldKit || {}, packed = new Set(state.packedGroups || []);
  const faceplate = workbenchSelection(kit, 'faceplate');
  const objects = [
    { key: 'case', kind: 'case', modelId: 'field-case', label: 'FIELD CASE', position: [0, .025, -.45], width: 6.45, glow: !state.bagTaken },
    { key: 'recorder', kind: 'inspect', item: 'recorder', modelId: faceplate === 'witness' ? 'field-recorder-witness' : 'field-recorder', label: 'FIELD RECORDER', position: [-1.35, .025, -4.4], width: 2.0, bay: 'recorder', destination: state.bagTaken ? 'case' : 'bench' },
    { key: 'radio', kind: 'inspect', item: 'radio', modelId: 'radio', label: 'RADIO', position: [1.25, .025, -4.4], width: 1.3, bay: 'radio', destination: state.bagTaken ? 'case' : 'bench' },
    { key: 'map', kind: 'map', modelId: 'map', item: 'map', label: 'SONIC SURVEY', position: [4.55, .025, 4.4], width: 1.8, bay: 'survey-indicator', destination: state.bagTaken && state.mapTaken ? 'case' : 'bench', glow: !state.mapTaken },
    { key: 'spanner', kind: 'spanner', modelId: 'plant-spanner', item: 'plant-spanner', label: 'OPTIONAL / SPANNER', position: [-6.15, .025, 4.4], width: 2.15, destination: state.spannerTaken ? 'case' : 'bench', bay: 'headphone-lead' },
  ];
  for (const [group, options] of Object.entries(WORKBENCH_VARIANTS)) {
    options.forEach((optionId, index) => {
      const selected = workbenchSelection(kit, group) === optionId;
      const isPlate = group === 'faceplate', column = columns[group];
      objects.push({ key: `variant:${group}:${optionId}`, kind: 'variant', group, optionId,
        modelId: `${group === 'recorder' ? 'amp' : group}-${optionId}`, label: names[group][index],
        position: isPlate ? [-2.15 + index * 2.15, .045, 4.4] : [column.x, .045, -2.6 + index * 2.35],
        width: isPlate ? 1.85 : column.width, selected,
        bay: group === 'recorder' ? 'amp' : group,
        destination: isPlate && selected ? 'device' : selected && packed.has(group) && state.bagTaken ? 'case' : 'bench',
      });
    });
  }
  if (state.witness?.visible || state.witness?.owned) objects.push({
    key: 'witness', kind: 'variant', group: 'faceplate', optionId: 'witness', modelId: 'witness-faceplate',
    label: state.witness?.owned ? 'WITNESS / REPLACEMENT PLATE' : 'WITNESS / LOCKED PREVIEW',
    position: [6.75, .045, 4.4], width: 1.9, selected: faceplate === 'witness', locked: !state.witness?.owned,
    destination: faceplate === 'witness' ? 'device' : 'bench',
  });
  return objects.map(object => ({ destination: 'bench', ...object }));
}

export function workbenchFocusKey(group, state = {}) {
  if (['faceplate', 'buttons', 'vfd'].includes(group)) return 'recorder';
  if (group === 'flashlightHousing' || group === 'light') group = 'flashlight';
  if (group === 'amp') group = 'recorder';
  if (WORKBENCH_VARIANTS[group] && group !== 'faceplate') return `variant:${group}:${workbenchSelection(state.fieldKit, group)}`;
  return group;
}

export function workbenchTargetMetadata(object) {
  return { kind: object.kind, modelId: object.modelId, label: object.label,
    ...(object.item ? { item: object.item } : {}), ...(object.group ? { group: object.group, optionId: object.optionId } : {}),
    packed: object.destination === 'case', locked: !!object.locked,
  };
}
