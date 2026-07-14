const ID = /^[a-z0-9][a-z0-9._-]*$/i;

export const NARRATIVE_SCHEMA_VERSION = 1;
export const AUDIO_SCHEMA_VERSION = 1;

function issue(errors, path, message) { errors.push({ path, message }); }

export function validateNarrativeDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: [{ path: '', message: 'document must be an object' }] };
  if (doc.schemaVersion !== NARRATIVE_SCHEMA_VERSION) issue(errors, 'schemaVersion', `must equal ${NARRATIVE_SCHEMA_VERSION}`);
  if (!ID.test(doc.id || '')) issue(errors, 'id', 'must be a stable identifier');
  if (!doc.title) issue(errors, 'title', 'is required');
  if (!doc.entry) issue(errors, 'entry', 'is required');
  const nodes = doc.nodes || {};
  if (!nodes[doc.entry]) issue(errors, 'entry', `target ${doc.entry || '(empty)'} does not exist`);
  const seenContentIds = new Set();
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!ID.test(nodeId)) issue(errors, `nodes.${nodeId}`, 'node id is invalid');
    if (!node || typeof node !== 'object') { issue(errors, `nodes.${nodeId}`, 'must be an object'); continue; }
    for (const [index, line] of (node.lines || []).entries()) {
      const item = typeof line === 'string' ? { text: line } : line;
      if (!item?.text && !item?.direction) issue(errors, `nodes.${nodeId}.lines.${index}`, 'requires text or direction');
      if (item?.id) {
        if (seenContentIds.has(item.id)) issue(errors, `nodes.${nodeId}.lines.${index}.id`, 'must be unique in document');
        seenContentIds.add(item.id);
      }
    }
    const choices = node.choices || [];
    choices.forEach((choice, index) => {
      if (!choice?.id) issue(errors, `nodes.${nodeId}.choices.${index}.id`, 'stable id is required');
      else if (seenContentIds.has(choice.id)) issue(errors, `nodes.${nodeId}.choices.${index}.id`, 'must be unique in document');
      else seenContentIds.add(choice.id);
      if (!choice?.text) issue(errors, `nodes.${nodeId}.choices.${index}.text`, 'is required');
      if (choice?.goto && !nodes[choice.goto]) issue(errors, `nodes.${nodeId}.choices.${index}.goto`, `target ${choice.goto} does not exist`);
    });
    if (node.goto && !nodes[node.goto]) issue(errors, `nodes.${nodeId}.goto`, `target ${node.goto} does not exist`);
  }
  for (const [index, region] of (doc.regions || []).entries()) {
    if (!ID.test(region?.id || '')) issue(errors, `regions.${index}.id`, 'must be a stable identifier');
  }
  return { ok: errors.length === 0, errors };
}

export function reachableNodeIds(doc, context = null) {
  const reached = new Set();
  const pending = [...new Set([doc?.entry, ...(doc?.entries || [])].filter(Boolean))];
  while (pending.length) {
    const id = pending.shift();
    if (reached.has(id) || !doc.nodes?.[id]) continue;
    reached.add(id);
    const node = doc.nodes[id];
    if (node.goto) pending.push(node.goto);
    for (const choice of node.choices || []) {
      if (choice.goto && (!context || conditionFor(choice, context))) pending.push(choice.goto);
    }
  }
  return reached;
}

function conditionFor(item, context) {
  if (!item?.when) return true;
  // Keep contracts dependency-free; callers that need filtered reachability can
  // pass pre-filtered documents. This conservative check preserves all paths.
  return context ? true : true;
}

export function validateAudioProject(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: [{ path: '', message: 'document must be an object' }] };
  if (doc.schemaVersion !== AUDIO_SCHEMA_VERSION) issue(errors, 'schemaVersion', `must equal ${AUDIO_SCHEMA_VERSION}`);
  const assets = new Set();
  for (const [index, asset] of (doc.assets || []).entries()) {
    if (!ID.test(asset?.id || '')) issue(errors, `assets.${index}.id`, 'must be a stable identifier');
    if (assets.has(asset?.id)) issue(errors, `assets.${index}.id`, 'must be unique');
    assets.add(asset?.id);
    if (!asset?.path && asset?.kind !== 'procedural') issue(errors, `assets.${index}.path`, 'is required for file assets');
  }
  const cues = new Set();
  for (const [index, cue] of (doc.cues || []).entries()) {
    if (!ID.test(cue?.id || '')) issue(errors, `cues.${index}.id`, 'must be a stable identifier');
    if (cues.has(cue?.id)) issue(errors, `cues.${index}.id`, 'must be unique');
    cues.add(cue?.id);
    if (!(cue.layers || []).length && !cue.effects?.length) issue(errors, `cues.${index}`, 'requires at least one layer or effect');
    for (const [layerIndex, layer] of (cue.layers || []).entries()) {
      if (!assets.has(layer.assetId)) issue(errors, `cues.${index}.layers.${layerIndex}.assetId`, `unknown asset ${layer.assetId}`);
      if (Number(layer.trimStart || 0) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.trimStart`, 'cannot be negative');
      if (Number(layer.playbackRate ?? 1) <= 0) issue(errors, `cues.${index}.layers.${layerIndex}.playbackRate`, 'must be positive');
    }
  }
  for (const [index, trigger] of (doc.triggers || []).entries()) {
    if (!cues.has(trigger.cueId)) issue(errors, `triggers.${index}.cueId`, `unknown cue ${trigger.cueId}`);
    if (!trigger.event) issue(errors, `triggers.${index}.event`, 'is required');
  }
  return { ok: errors.length === 0, errors };
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
