import { allocateStoryId, incomingStoryReferences } from './story-transforms.js';
import { buildSceneGraph, choiceGraphId } from './scene-graph.js';
import { patchStoryConnection } from './graph-patching.js';

export const lineGraphId = (owner, collection, id) => `line:${encodeURIComponent(owner)}:${collection}:${encodeURIComponent(id)}`;
export const collectionGraphId = (owner, collection) => `collection:${encodeURIComponent(owner)}:${collection}`;
export function patchObjects(document) {
  const objects = [];
  for (const [nodeId, beat] of Object.entries(document.nodes)) {
    objects.push({ kind: 'beat', nodeId, id: nodeId, graphId: nodeId });
    for (const collection of ['lines', 'revisitLines']) for (const line of beat[collection] || []) objects.push({ kind: 'line', nodeId, collection, id: line.id, graphId: lineGraphId(nodeId, collection, line.id) });
    for (const choice of beat.choices || []) objects.push({ kind: 'choice', nodeId, id: choice.id, graphId: choiceGraphId(nodeId, choice.id) });
  }
  return objects;
}

export function patchObject(document, graphId) { return patchObjects(document).find(object => object.graphId === graphId); }
export function patchValue(document, object) {
  const beat = document.nodes[object?.nodeId];
  return object?.kind === 'beat' ? beat : object?.kind === 'choice' ? beat?.choices?.find(item => item.id === object.id) : beat?.[object?.collection]?.find(item => item.id === object.id);
}
const refused = (document, layout, problem) => ({ document, layout, changed: false, problem });
const finish = (document, layout, selectedId, patchId, message) => ({ document, layout, selectedId, patchId, changed: true, problem: '', message });
const cleanRoute = item => { delete item.goto; delete item.exit; };
const normalize = beat => { if (['choice', 'dialogue'].includes(beat.type)) beat.type = beat.choices?.length ? 'choice' : 'dialogue'; };
const addToRegion = (doc, owner, id) => (doc.regions.find(region => region.nodeIds.includes(owner)) || doc.regions[0])?.nodeIds.push(id);
const offset = (layout, id, fallback = { x: 100, y: 100 }) => { const point = layout.positions[id] || fallback; return { x: point.x + 60, y: point.y + 60 }; };

/** Commands are immutable, schema-backed transactions. The UI owns history. */
export function runPatchCommand(document, layout, command) {
  if (command.type === 'remove-many') {
    let result = { document, layout };
    const objects = [...new Set(command.patchIds)].map(id => patchObject(document, id)).filter(Boolean);
    const owners = new Set(objects.filter(item => item.kind === 'beat').map(item => item.id));
    for (const object of objects.filter(item => item.kind === 'beat' || !owners.has(item.nodeId))) {
      const removed = runPatchCommand(result.document, result.layout, { type: 'remove', object, preserve: false });
      if (!removed.changed) return refused(document, layout, removed.problem);
      result = removed;
    }
    return objects.length ? finish(result.document, result.layout, document.entry, document.entry, 'Selection removed in one transaction; response beats preserved unless selected.') : refused(document, layout, 'Select authored objects to remove.');
  }
  const next = structuredClone(document), geometry = structuredClone(layout);
  const object = command.object || patchObject(document, command.patchId);
  const value = object && patchValue(next, object);
  const beat = next.nodes[command.nodeId || object?.nodeId];
  if (command.type === 'update') {
    if (!value) return refused(document, layout, 'Select an authored object.');
    Object.assign(value, command.fields);
    for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
    return finish(next, geometry, object.nodeId, object.graphId, 'Object updated.');
  }
  if (command.type === 'line') {
    if (!beat) return refused(document, layout, 'A line needs an owning beat.');
    const collection = command.collection || 'lines', rows = beat[collection] ||= [];
    const id = allocateStoryId(next, `${beat.id}.${collection === 'revisitLines' ? 'revisit.' : ''}line`);
    rows.splice(Math.max(0, Math.min(rows.length, command.index ?? rows.length)), 0, { id, who: 'direction', text: 'New line' });
    const patchId = lineGraphId(beat.id, collection, id);
    const index = rows.findIndex(line => line.id === id), position = command.position || { x: 380 + index * 390, y: 80 };
    if (!command.position) {
      const prefix = `line:${encodeURIComponent(beat.id)}:${collection}:`;
      const occupied = rows.filter(line => line.id !== id).map((line, offset) => geometry.positions[lineGraphId(beat.id, collection, line.id)] || { x: 380 + offset * 390, y: 80 });
      for (const [key, point] of Object.entries(geometry.positions)) if (key.startsWith(prefix)) occupied.push(point);
      while (occupied.some(point => Math.abs(point.x - position.x) < 340 && Math.abs(point.y - position.y) < 420)) position.y += 450;
    }
    geometry.positions[patchId] = position;
    return finish(next, geometry, beat.id, patchId, 'Line inserted in its authored sequence.');
  }
  if (command.type === 'move-line') {
    if (object?.kind !== 'line' || !value) return refused(document, layout, 'Select a line to move.');
    const owner = next.nodes[command.ownerId || object.nodeId], collection = command.collection || object.collection;
    if (!owner) return refused(document, layout, 'The destination beat is missing.');
    next.nodes[object.nodeId][object.collection] = next.nodes[object.nodeId][object.collection].filter(line => line.id !== object.id);
    const rows = owner[collection] ||= [];
    rows.splice(Math.max(0, Math.min(rows.length, command.index ?? rows.length)), 0, value);
    const patchId = lineGraphId(owner.id, collection, value.id);
    if (geometry.positions[object.graphId]) { geometry.positions[patchId] = geometry.positions[object.graphId]; if (patchId !== object.graphId) delete geometry.positions[object.graphId]; }
    return finish(next, geometry, owner.id, patchId, 'Line moved; identity and properties preserved.');
  }
  if (command.type === 'choice') {
    if (!beat) return refused(document, layout, 'A choice needs an owning beat.');
    const id = allocateStoryId(next, `${beat.id}.choice`);
    // Preserve the old automatic continuation as an explicit answer. Never
    // silently discard it when adding or moving another answer to this bank.
    if (!beat.choices?.length && (beat.goto || beat.exit)) {
      beat.choices = [{ id: allocateStoryId(next, `${beat.id}.continue`), text: 'Continue', ...(beat.goto ? { goto: beat.goto } : { exit: beat.exit }) }];
      cleanRoute(beat);
    }
    const target = allocateStoryId(next, `${beat.id}.response`);
    next.nodes[target] = { id: target, type: 'dialogue', speaker: beat.speaker || '', lines: [{ id: `${target}.line`, who: 'direction', text: 'New response' }] };
    addToRegion(next, beat.id, target);
    geometry.positions[target] = { x: (geometry.positions[beat.id]?.x || 100) + 960, y: (geometry.positions[beat.id]?.y || 100) + (beat.choices?.length || 0) * 280 };
    (beat.choices ||= []).push({ id, text: 'New choice', goto: target }); normalize(beat);
    return finish(next, geometry, beat.id, choiceGraphId(beat.id, id), 'Choice and response created. Existing continuation retained.');
  }
  if (command.type === 'beat' || command.type === 'successor' || command.type === 'insert') {
    const graph = buildSceneGraph(document, { splitChoices: true, exits: layout.exits });
    const edge = graph.links.find(item => item.id === command.edgeId || (command.type === 'successor' && item.source === command.connection?.source && item.handle === command.connection?.sourceHandle));
    const connection = command.connection || (edge && { source: edge.source, sourceHandle: edge.handle, target: edge.target, targetHandle: edge.targetHandle || 'in' });
    if (command.type !== 'beat' && (!connection || ['ownership', 'revisit'].includes(edge?.kind))) return refused(document, layout, 'Select a progression cable or route outlet.');
    const id = allocateStoryId(next, 'beat');
    const newBeat = { id, type: 'dialogue', lines: [{ id: `${id}.line`, who: 'direction', text: 'New line' }] };
    if (command.type !== 'beat' && edge) {
      const target = graph.boundaries.find(item => item.id === edge.target);
      if (document.nodes[edge.target]) newBeat.goto = edge.target;
      else if (target?.kind === 'exit') { if (target.event) newBeat.exit = target.event; }
      else return refused(document, layout, 'Resolve the missing destination before inserting.');
    }
    next.nodes[id] = newBeat; addToRegion(next, beat?.id || document.entry, id);
    geometry.positions[id] = command.position || offset(geometry, connection?.source || document.entry);
    if (command.type !== 'beat') {
      const result = patchStoryConnection(next, geometry, { ...connection, target: id, targetHandle: 'in' });
      if (!result.changed) return refused(document, layout, result.problem);
      return finish(result.document, result.layout, id, id, command.type === 'insert' ? 'Beat inserted; the original destination is retained.' : 'Connected successor created.');
    }
    return finish(next, geometry, id, id, 'Disconnected beat created. Patch an incoming route to use it.');
  }
  if (command.type === 'duplicate') {
    const requested = (command.patchIds || [object?.graphId]).map(id => patchObject(document, id)).filter(Boolean);
    const beatCopies = new Map(); let last;
    for (const ref of requested.filter(ref => ref.kind === 'beat')) {
      const original = next.nodes[ref.nodeId], copyId = allocateStoryId(next, `${original.id}.copy`), copy = structuredClone(original);
      copy.id = copyId; next.nodes[copyId] = copy; beatCopies.set(original.id, copyId); last = { nodeId: copyId, graphId: copyId };
      for (const collection of ['lines', 'revisitLines', 'choices']) for (const item of copy[collection] || []) item.id = allocateStoryId(next, `${copyId}.${collection}.${item.id}`);
      addToRegion(next, original.id, copyId); geometry.positions[copyId] = offset(geometry, original.id);
    }
    for (const copyId of beatCopies.values()) {
      const copy = next.nodes[copyId];
      if (beatCopies.has(copy.goto)) copy.goto = beatCopies.get(copy.goto);
      for (const choice of copy.choices || []) { if (beatCopies.has(choice.goto)) choice.goto = beatCopies.get(choice.goto); if (beatCopies.has(choice.check?.fail)) choice.check.fail = beatCopies.get(choice.check.fail); }
    }
    for (const ref of requested.filter(ref => ref.kind !== 'beat' && !beatCopies.has(ref.nodeId))) {
      const original = patchValue(next, ref), collection = ref.kind === 'choice' ? 'choices' : ref.collection;
      if (!original) continue;
      const copy = structuredClone(original); copy.id = allocateStoryId(next, `${original.id}.copy`);
      const rows = next.nodes[ref.nodeId][collection]; rows.splice(rows.findIndex(item => item.id === ref.id) + 1, 0, copy);
      const graphId = ref.kind === 'choice' ? choiceGraphId(ref.nodeId, copy.id) : lineGraphId(ref.nodeId, collection, copy.id);
      geometry.positions[graphId] = offset(geometry, ref.graphId); last = { nodeId: ref.nodeId, graphId };
    }
    return last ? finish(next, geometry, last.nodeId, last.graphId, 'Selection duplicated with fresh identities.') : refused(document, layout, 'Select an authored object to duplicate.');
  }
  if (command.type === 'remove') {
    if (!value) return refused(document, layout, 'Select an authored object to remove.');
    if (object.kind === 'beat') {
      if ([next.entry, ...(next.entries || [])].includes(object.id)) return refused(document, layout, 'Declared entries cannot be removed here.');
      if (command.preserve && (value.choices?.length || !value.goto || value.goto === object.id)) return refused(document, layout, 'Bypass requires one continuation to another beat.');
      for (const item of Object.values(next.nodes)) {
        if (item.goto === object.id) { if (command.preserve) item.goto = value.goto; else delete item.goto; }
        for (const choice of item.choices || []) {
          if (choice.goto === object.id) { if (command.preserve) choice.goto = value.goto; else delete choice.goto; }
          if (choice.check?.fail === object.id) {
            if (!command.preserve) return refused(document, layout, 'A check failure route must be reconnected before detaching this beat.');
            choice.check.fail = value.goto;
          }
        }
      }
      for (const ref of patchObjects(next).filter(ref => ref.nodeId === object.id)) delete geometry.positions[ref.graphId];
      delete next.nodes[object.id]; for (const region of next.regions) region.nodeIds = region.nodeIds.filter(id => id !== object.id);
      return finish(next, geometry, value.goto || next.entry, value.goto || next.entry, command.preserve ? 'Beat removed; incoming routes now bypass it.' : 'Beat removed; incoming routes now end.');
    }
    const collection = object.kind === 'choice' ? 'choices' : object.collection;
    beat[collection] = beat[collection].filter(item => item.id !== object.id); normalize(beat);
    delete geometry.positions[object.graphId];
    return finish(next, geometry, beat.id, beat.id, object.kind === 'line' ? 'Line removed; surrounding sequence retained.' : 'Choice removed; response beats preserved.');
  }
  return refused(document, layout, 'Unknown editing command.');
}

export function removalInfo(document, object) {
  const value = patchValue(document, object);
  return { incoming: object?.kind === 'beat' ? incomingStoryReferences(document, object.id).length : 0, canBypass: object?.kind === 'beat' && !!value?.goto && value.goto !== object.id && !value.choices?.length };
}

export function connectLineOrder(document, layout, connection) {
  const target = patchObject(document, connection.target), source = patchObject(document, connection.source);
  if (target?.kind !== 'line' || connection.targetHandle !== 'in') return refused(document, layout, 'A sequence cable needs a line input.');
  const head = collectionGraphId(target.nodeId, target.collection) === connection.source;
  if (connection.sourceHandle !== 'next' || (!head && (source?.kind !== 'line' || source.nodeId !== target.nodeId || source.collection !== target.collection || source.id === target.id))) return refused(document, layout, 'Connect lines in the same normal or return sequence. Move collection explicitly to change ownership.');
  const rows = document.nodes[target.nodeId][target.collection], remaining = rows.filter(item => item.id !== target.id);
  const index = head ? 0 : remaining.findIndex(item => item.id === source.id) + 1;
  if (rows.findIndex(item => item.id === target.id) === index) return refused(document, layout, 'These lines already have that order.');
  return runPatchCommand(document, layout, { type: 'move-line', object: target, index });
}
