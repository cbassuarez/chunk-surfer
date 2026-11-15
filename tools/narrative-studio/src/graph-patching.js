import { buildSceneGraph, choiceGraphId } from './scene-graph.js';
import { allocateStoryId } from './story-transforms.js';

/** @typedef {import('./types').NarrativeDocument} NarrativeDocument */
/** @typedef {import('./types').StoryLayout} StoryLayout */

/** The patcher changes the existing schema, not a second execution graph.
 * @param {NarrativeDocument} document @param {StoryLayout} layout
 * @param {{source: string | null, target: string | null, sourceHandle?: string | null, targetHandle?: string | null}} connection */
export function patchStoryConnection(document, layout, connection) {
  const unchanged = problem => ({ document, layout, selectedId: null, changed: false, problem });
  const graph = buildSceneGraph(document, { splitChoices: true, exits: layout.exits });
  const choiceSource = graph.choices.find(item => item.id === connection.source);
  const choiceTarget = graph.choices.find(item => item.id === connection.target);
  const master = connection.source && document.nodes[connection.source];
  const target = connection.target && document.nodes[connection.target];
  const exit = graph.boundaries.find(item => item.id === connection.target && item.kind === 'exit');
  if (choiceSource && connection.sourceHandle === 'fail') {
    if (!choiceSource.choice.check || !target || connection.targetHandle !== 'in') return unchanged('A caller check failure needs an existing dialogue destination.');
    if (choiceSource.choice.check.fail === connection.target) return unchanged('This check already routes there.');
    const next = structuredClone(document);
    next.nodes[choiceSource.ownerId].choices.find(item => item.id === choiceSource.choice.id).check.fail = connection.target;
    return { document: next, layout, selectedId: choiceSource.ownerId, changed: true, problem: '' };
  }
  if (connection.sourceHandle === 'choices' && master && choiceTarget && connection.targetHandle === 'owner') {
    if (choiceTarget.ownerId === connection.source) return unchanged('This choice already belongs to this beat.');
    const next = structuredClone(document), previous = next.nodes[choiceTarget.ownerId], owner = next.nodes[connection.source];
    previous.choices = (previous.choices || []).filter(item => item.id !== choiceTarget.choice.id);
    if (!previous.choices.length) { delete previous.choices; if (previous.type === 'choice') previous.type = 'dialogue'; }
    if (!owner.choices?.length && (owner.goto || owner.exit)) owner.choices = [{ id: allocateStoryId(next, `${owner.id}.continue`), text: 'Continue', ...(owner.goto ? { goto: owner.goto } : { exit: owner.exit }) }];
    owner.choices = [...(owner.choices || []), structuredClone(choiceTarget.choice)];
    if (['choice', 'dialogue'].includes(owner.type)) owner.type = 'choice';
    delete owner.goto; delete owner.exit;
    const geometry = structuredClone(layout), nextId = choiceGraphId(connection.source, choiceTarget.choice.id);
    if (geometry.positions[choiceTarget.id]) { geometry.positions[nextId] = geometry.positions[choiceTarget.id]; delete geometry.positions[choiceTarget.id]; }
    return { document: next, layout: geometry, selectedId: connection.source, changed: true, problem: '' };
  }
  const route = choiceSource && connection.sourceHandle === 'route';
  const direct = master && ['goto', 'exit'].includes(connection.sourceHandle || '');
  if (!route && !direct) return unchanged('Connect CHOICES to a choice input, or a route output to a beat / exit.');
  if (master?.choices?.length) return unchanged('This beat branches. Patch the individual choice outputs instead.');
  if (!target && !exit) return unchanged('A route needs a dialogue input or an exit terminal.');
  if (connection.targetHandle && connection.targetHandle !== 'in') return unchanged('A route needs a dialogue or exit input, not an ownership port.');
  if (connection.sourceHandle === 'exit' && !exit) return unchanged('An EXIT output needs an exit terminal.');
  const next = structuredClone(document);
  const item = route ? next.nodes[choiceSource.ownerId].choices.find(item => item.id === choiceSource.choice.id) : next.nodes[connection.source];
  if (target ? item.goto === connection.target && !item.exit : !item.goto && String(item.exit || '') === exit.event) return unchanged('This output already routes there.');
  delete item.goto; delete item.exit;
  if (target) item.goto = connection.target;
  else if (exit.event) item.exit = exit.event;
  return { document: next, layout, selectedId: route ? choiceSource.ownerId : connection.source, changed: true, problem: '' };
}

/** @param {NarrativeDocument} document @param {StoryLayout} layout @param {string[]} edgeIds */
export function unplugStoryConnections(document, layout, edgeIds) {
  const graph = buildSceneGraph(document, { splitChoices: true, exits: layout.exits }), next = structuredClone(document);
  for (const link of graph.links.filter(item => edgeIds.includes(item.id) && item.handle !== 'fail' && !['ownership', 'revisit'].includes(item.kind))) {
    const choice = graph.choices.find(item => item.id === link.source);
    const item = choice ? next.nodes[choice.ownerId].choices.find(item => item.id === choice.choice.id) : next.nodes[link.source];
    if (item) { delete item.goto; delete item.exit; }
  }
  return { document: next, layout };
}

/** Replacing a cable's source must also unplug its old route, in one undo step.
 * Ownership is moved by its source end; its choice input stays attached.
 * @param {NarrativeDocument} document @param {StoryLayout} layout @param {string} edgeId
 * @param {{source: string | null, target: string | null, sourceHandle?: string | null, targetHandle?: string | null}} connection */
export function reconnectStoryConnection(document, layout, edgeId, connection) {
  const graph = buildSceneGraph(document, { splitChoices: true, exits: layout.exits });
  const old = graph.links.find(link => link.id === edgeId);
  const result = patchStoryConnection(document, layout, connection);
  if (old && old.source !== connection.source && result.problem === 'This output already routes there.') {
    const unplugged = unplugStoryConnections(document, layout, [edgeId]);
    if (JSON.stringify(unplugged.document) !== JSON.stringify(document)) return { ...unplugged, selectedId: graph.choices.find(item => item.id === connection.source)?.ownerId || connection.source, changed: true, problem: '' };
  }
  if (!old || !result.changed || old.kind === 'ownership' || (old.source === connection.source && old.handle === connection.sourceHandle)) return result;
  const unplugged = unplugStoryConnections(result.document, result.layout, [edgeId]);
  return { ...result, ...unplugged };
}
