import { validateConditionExpression } from './conditions.js';

const ID = /^[a-z0-9][a-z0-9._-]*$/i;
export const NARRATIVE_SCHEMA_VERSION = 1;
export const AUDIO_SCHEMA_VERSION = 1;
export const MEDIA_SCHEMA_VERSION = 1;
export const PROJECT_SCHEMA_VERSION = 1;

function issue(errors, path, message) { errors.push({ path, message }); }

function condition(errors, path, value) {
  for (const message of validateConditionExpression(value)) issue(errors, path, message);
}

function mutations(errors, path, value) {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) { issue(errors, path, 'must be an object'); return; }
  for (const key of ['set', 'clear']) {
    if (value[key] == null) continue;
    if (!Array.isArray(value[key])) { issue(errors, `${path}.${key}`, 'must be an array'); continue; }
    for (const [index, item] of value[key].entries()) {
      if (typeof item !== 'string' || !item.trim()) issue(errors, `${path}.${key}.${index}`, 'must be a non-empty string');
      if (key === 'set' && String(item).includes('=') && !String(item).split('=')[0].trim()) issue(errors, `${path}.${key}.${index}`, 'must name a flag before =');
    }
  }
}

function refId(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return String(ref.id || ref.art || ref.key || ref.artId || '');
}

function validateCueRefs(errors, path, refs, cueIds) {
  if (!refs) return;
  if (!Array.isArray(refs)) { issue(errors, path, 'must be an array'); return; }
  for (const [index, cueId] of refs.entries()) {
    if (!ID.test(String(cueId || ''))) issue(errors, `${path}.${index}`, 'must be a stable cue id');
    if (cueIds && !cueIds.has(cueId)) issue(errors, `${path}.${index}`, `unknown cue ${cueId}`);
  }
}

function validateArtRef(errors, path, art, mediaIds) {
  if (!art) return;
  const id = refId(art);
  if (!ID.test(id)) issue(errors, path, 'must reference a stable media id');
  if (mediaIds && !mediaIds.has(id)) issue(errors, path, `unknown media slot ${id}`);
}

function validateCombatMusic(errors, combat) {
  if (combat == null) return;
  const path = 'metadata.combat.music';
  const music = combat?.music;
  const movements = Array.isArray(combat?.movements) ? combat.movements : [];
  const validLead = (value) => ['lead-1', 'lead-2', 'lead-3'].includes(value);
  if (!music || typeof music !== 'object' || Array.isArray(music)) {
    issue(errors, path, 'is required for authored combat');
    return;
  }
  if (!['fixed', 'movement'].includes(music.mode)) issue(errors, `${path}.mode`, 'must be fixed or movement');
  if (music.mode === 'fixed' && !validLead(music.lead)) issue(errors, `${path}.lead`, 'must name lead-1, lead-2, or lead-3');
  if (music.mode === 'movement') {
    if (!Array.isArray(music.movementLeads) || music.movementLeads.length !== movements.length) {
      issue(errors, `${path}.movementLeads`, 'must name one lead per movement');
    } else {
      music.movementLeads.forEach((lead, index) => {
        if (!validLead(lead)) issue(errors, `${path}.movementLeads.${index}`, 'must name lead-1, lead-2, or lead-3');
      });
    }
  }
}

export function validateNarrativeDocument(doc, options = {}) {
  const cueIds = options.cueIds || null;
  const mediaIds = options.mediaIds || null;
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: [{ path: '', message: 'document must be an object' }] };
  if (doc.schemaVersion !== NARRATIVE_SCHEMA_VERSION) issue(errors, 'schemaVersion', `must equal ${NARRATIVE_SCHEMA_VERSION}`);
  if (!ID.test(doc.id || '')) issue(errors, 'id', 'must be a stable identifier');
  if (!doc.title) issue(errors, 'title', 'is required');
  if (!doc.entry) issue(errors, 'entry', 'is required');
  const nodes = doc.nodes || {};
  if (!nodes || typeof nodes !== 'object' || Array.isArray(nodes)) issue(errors, 'nodes', 'must be an object');
  if (!nodes[doc.entry]) issue(errors, 'entry', `target ${doc.entry || '(empty)'} does not exist`);
  validateCombatMusic(errors, doc.metadata?.combat);
  for (const [index, entry] of (doc.entries || []).entries()) if (!nodes[entry]) issue(errors, `entries.${index}`, `target ${entry} does not exist`);
  const seenContentIds = new Set();
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!ID.test(nodeId)) issue(errors, `nodes.${nodeId}`, 'node id is invalid');
    if (!node || typeof node !== 'object') { issue(errors, `nodes.${nodeId}`, 'must be an object'); continue; }
    if (node.id && node.id !== nodeId) issue(errors, `nodes.${nodeId}.id`, 'must match the node map key');
    if (!node.type) issue(errors, `nodes.${nodeId}.type`, 'is required');
    condition(errors, `nodes.${nodeId}.when`, node.when);
    mutations(errors, `nodes.${nodeId}.mutations`, node.mutations);
    validateCueRefs(errors, `nodes.${nodeId}.cues`, node.cues, cueIds);
    validateArtRef(errors, `nodes.${nodeId}.art`, node.art || node.artId, mediaIds);
    for (const [index, line] of (node.lines || []).entries()) {
      const item = typeof line === 'string' ? { text: line } : line;
      if (!item?.text && !item?.direction) issue(errors, `nodes.${nodeId}.lines.${index}`, 'requires text or direction');
      if (!item?.id) issue(errors, `nodes.${nodeId}.lines.${index}.id`, 'stable id is required');
      else if (seenContentIds.has(item.id)) issue(errors, `nodes.${nodeId}.lines.${index}.id`, 'must be unique in document');
      else seenContentIds.add(item.id);
      condition(errors, `nodes.${nodeId}.lines.${index}.when`, item?.when);
      validateCueRefs(errors, `nodes.${nodeId}.lines.${index}.cues`, item?.cues, cueIds);
      validateArtRef(errors, `nodes.${nodeId}.lines.${index}.art`, item?.art || item?.artId, mediaIds);
    }
    const choices = node.choices || [];
    choices.forEach((choice, index) => {
      if (!choice?.id) issue(errors, `nodes.${nodeId}.choices.${index}.id`, 'stable id is required');
      else if (seenContentIds.has(choice.id)) issue(errors, `nodes.${nodeId}.choices.${index}.id`, 'must be unique in document');
      else seenContentIds.add(choice.id);
      if (!choice?.text) issue(errors, `nodes.${nodeId}.choices.${index}.text`, 'is required');
      if (choice?.goto && !nodes[choice.goto]) issue(errors, `nodes.${nodeId}.choices.${index}.goto`, `target ${choice.goto} does not exist`);
      condition(errors, `nodes.${nodeId}.choices.${index}.when`, choice?.when);
      mutations(errors, `nodes.${nodeId}.choices.${index}.mutations`, choice?.mutations);
      validateCueRefs(errors, `nodes.${nodeId}.choices.${index}.cues`, choice?.cues, cueIds);
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
      if (!ID.test(layer?.id || '')) issue(errors, `cues.${index}.layers.${layerIndex}.id`, 'must be a stable identifier');
      if (!assets.has(layer.assetId)) issue(errors, `cues.${index}.layers.${layerIndex}.assetId`, `unknown asset ${layer.assetId}`);
      for (const parameter of ['gain', 'pan', 'playbackRate', 'delay', 'trimStart', 'trimEnd', 'fadeIn', 'fadeOut']) {
        if (layer[parameter] != null && !Number.isFinite(Number(layer[parameter]))) issue(errors, `cues.${index}.layers.${layerIndex}.${parameter}`, 'must be numeric');
      }
      if (Number(layer.gain ?? 1) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.gain`, 'cannot be negative');
      if (Number(layer.pan ?? 0) < -1 || Number(layer.pan ?? 0) > 1) issue(errors, `cues.${index}.layers.${layerIndex}.pan`, 'must be between -1 and 1');
      if (Number(layer.delay || 0) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.delay`, 'cannot be negative');
      if (Number(layer.trimStart || 0) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.trimStart`, 'cannot be negative');
      if (layer.trimEnd != null && Number(layer.trimEnd) < Number(layer.trimStart || 0)) issue(errors, `cues.${index}.layers.${layerIndex}.trimEnd`, 'cannot be before trimStart');
      if (Number(layer.playbackRate ?? 1) <= 0) issue(errors, `cues.${index}.layers.${layerIndex}.playbackRate`, 'must be positive');
      if (Number(layer.fadeIn || 0) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.fadeIn`, 'cannot be negative');
      if (Number(layer.fadeOut || 0) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.fadeOut`, 'cannot be negative');
      for (const [automationIndex, automation] of (layer.automation || []).entries()) {
        if (!automation?.parameter) issue(errors, `cues.${index}.layers.${layerIndex}.automation.${automationIndex}.parameter`, 'is required');
        let previous = -Infinity;
        for (const [pointIndex, point] of (automation.points || []).entries()) {
          if (Number(point?.time) < 0) issue(errors, `cues.${index}.layers.${layerIndex}.automation.${automationIndex}.points.${pointIndex}.time`, 'cannot be negative');
          if (Number(point?.time) < previous) issue(errors, `cues.${index}.layers.${layerIndex}.automation.${automationIndex}.points.${pointIndex}.time`, 'must be sorted');
          previous = Number(point?.time);
          if (!Number.isFinite(Number(point?.value))) issue(errors, `cues.${index}.layers.${layerIndex}.automation.${automationIndex}.points.${pointIndex}.value`, 'must be numeric');
        }
      }
    }
  }
  for (const [index, trigger] of (doc.triggers || []).entries()) {
    if (!ID.test(trigger?.id || '')) issue(errors, `triggers.${index}.id`, 'must be a stable identifier');
    if (!cues.has(trigger.cueId)) issue(errors, `triggers.${index}.cueId`, `unknown cue ${trigger.cueId}`);
    if (!trigger.event) issue(errors, `triggers.${index}.event`, 'is required');
    condition(errors, `triggers.${index}.when`, trigger.when);
  }
  return { ok: errors.length === 0, errors };
}

export function validateMediaProject(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: [{ path: '', message: 'document must be an object' }] };
  if (doc.schemaVersion !== MEDIA_SCHEMA_VERSION) issue(errors, 'schemaVersion', `must equal ${MEDIA_SCHEMA_VERSION}`);
  if (!ID.test(doc.id || '')) issue(errors, 'id', 'must be a stable identifier');
  const assets = new Set();
  for (const [index, asset] of (doc.assets || []).entries()) {
    if (!ID.test(asset?.id || '')) issue(errors, `assets.${index}.id`, 'must be a stable identifier');
    if (assets.has(asset?.id)) issue(errors, `assets.${index}.id`, 'must be unique');
    assets.add(asset?.id);
    if (asset?.kind !== 'placeholder' && !asset?.path) issue(errors, `assets.${index}.path`, 'is required for non-placeholder assets');
  }
  const slots = new Set();
  for (const [index, slot] of (doc.storyArt || []).entries()) {
    if (!ID.test(slot?.id || '')) issue(errors, `storyArt.${index}.id`, 'must be a stable identifier');
    if (slots.has(slot?.id)) issue(errors, `storyArt.${index}.id`, 'must be unique');
    slots.add(slot?.id);
    if (slot?.assetId && !assets.has(slot.assetId)) issue(errors, `storyArt.${index}.assetId`, `unknown media asset ${slot.assetId}`);
    if (!slot?.label) issue(errors, `storyArt.${index}.label`, 'is required');
    if (!slot?.alt) issue(errors, `storyArt.${index}.alt`, 'is required');
  }
  return { ok: errors.length === 0, errors };
}

export function mediaSlots(mediaProjects = []) {
  return new Set(mediaProjects.flatMap((project) => (project.storyArt || []).map((slot) => slot.id)));
}

export function validateProjectManifest(project, available = {}) {
  const errors = [];
  if (!project || typeof project !== 'object') return { ok: false, errors: [{ path: '', message: 'project must be an object' }] };
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) issue(errors, 'schemaVersion', `must equal ${PROJECT_SCHEMA_VERSION}`);
  if (!ID.test(project.id || '')) issue(errors, 'id', 'must be a stable identifier');
  const declaredNarrative = new Set(project.narrative || []);
  for (const path of available.narrativePaths || []) if (!declaredNarrative.has(path)) issue(errors, 'narrative', `${path} is not declared in project.json`);
  const declaredAudio = new Set(project.audio || []);
  for (const path of available.audioPaths || []) if (!declaredAudio.has(path)) issue(errors, 'audio', `${path} is not declared in project.json`);
  const declaredMedia = new Set(project.media || []);
  for (const path of available.mediaPaths || []) if (!declaredMedia.has(path)) issue(errors, 'media', `${path} is not declared in project.json`);
  const docIds = new Set(available.documentIds || []);
  for (const [index, entry] of (project.timeline || []).entries()) {
    if (!ID.test(entry?.id || '')) issue(errors, `timeline.${index}.id`, 'must be a stable identifier');
    for (const [docIndex, documentId] of (entry.documents || []).entries()) if (!docIds.has(documentId)) issue(errors, `timeline.${index}.documents.${docIndex}`, `unknown document ${documentId}`);
  }
  const timelineDocs = new Set((project.timeline || []).flatMap((entry) => entry.documents || []));
  for (const doc of available.documents || []) {
    if (doc.status === 'legacy' || doc.status === 'reference') continue;
    if (!timelineDocs.has(doc.id)) issue(errors, 'timeline', `${doc.id} is active but not placed on the game timeline`);
  }
  return { ok: errors.length === 0, errors };
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
