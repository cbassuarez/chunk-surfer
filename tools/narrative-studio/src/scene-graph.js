/** Source relationships drive this view. X is progression, never elapsed time. */
/** @typedef {import('./types').NarrativeDocument} NarrativeDocument */

/** @param {NarrativeDocument} document @param {boolean} fromCode */
export function sceneScopes(document, fromCode = false) {
  const ids = Object.keys(document.nodes);
  const prefix = document.sourceGraph?.scopePrefix;
  const all = { id: 'all', title: fromCode ? 'All extracted source material' : 'Whole document', nodeIds: ids };
  if (!fromCode || !prefix) return [all];
  const scoped = ids.filter(id => id.startsWith(`${prefix}.`));
  return scoped.length ? [{ id: prefix, title: 'Opening conversation · source node table', nodeIds: scoped }, all] : [all];
}

export const choiceGraphId = (ownerId, choiceId) => `choice:${encodeURIComponent(ownerId)}:${encodeURIComponent(choiceId)}`;
export const exitGraphId = event => `terminal:${encodeURIComponent(event || '')}`;

/** @param {NarrativeDocument} document @param {{fromCode?: boolean, nodeIds?: string[], splitChoices?: boolean, exits?: import('./types').StoryLayout['exits']}} options */
export function buildSceneGraph(document, { fromCode = false, nodeIds = Object.keys(document.nodes), splitChoices = false, exits = {} } = {}) {
  const included = new Set(nodeIds);
  const entries = new Set((fromCode ? document.sourceGraph?.entryIds || [] : [document.entry, ...(document.entries || [])]).filter(id => included.has(id)));
  const links = [];
  const boundaries = [];
  const choices = [];
  const boundary = (source, handle, label, kind, event = '') => {
    const id = splitChoices && kind === 'exit' ? exitGraphId(event) : `boundary:${source}:${handle}`;
    if (!boundaries.some(item => item.id === id)) boundaries.push({ id, label, kind, event });
    return id;
  };
  if (splitChoices && !fromCode) {
    boundary('', '', 'End conversation', 'exit');
    for (const { event } of Object.values(exits)) boundary('', '', `Exit · ${event}`, 'exit', event);
  }
  const add = (source, handle, target, label, when = '', kind = 'next') => {
    const resolved = included.has(target);
    links.push({ id: `${source}:${handle}`, source, target: resolved ? target : boundary(source, handle, `Unresolved target · ${target}`, 'unresolved'), handle, label, when, kind: resolved ? kind : 'unresolved' });
  };
  for (const id of nodeIds) {
    const node = document.nodes[id];
    if (!node) continue;
    if (node.goto || node.targetName) add(id, 'goto', String(node.goto || node.targetName), 'Continue');
    if (node.exit || node.action) links.push({ id: `${id}:exit`, source: id, target: boundary(id, 'exit', `${node.exit ? 'Exit' : 'Code action'} · ${node.exit || node.action}`, 'exit', String(node.exit || node.action)), handle: 'exit', label: 'Exit', when: '', kind: 'exit' });
    for (const [index, choice] of (node.choices || []).entries()) {
      const source = splitChoices ? choiceGraphId(id, choice.id) : id;
      const handle = splitChoices ? 'route' : `choice:${choice.id}`;
      if (splitChoices) {
        choices.push({ id: source, ownerId: id, choice, index });
        links.push({ id: `owner:${source}`, source: id, target: source, handle: 'choices', targetHandle: 'owner', label: `${index + 1}`, when: '', kind: 'ownership' });
      }
      if (choice.goto || choice.targetName) add(source, handle, String(choice.goto || choice.targetName), `${index + 1}. ${choice.text}`, choice.when || String(choice.if || ''));
      else {
        const label = choice.exit ? `Exit · ${choice.exit}` : fromCode ? 'Unresolved · continuation in code' : 'End of branch';
        links.push({ id: `${source}:${handle}`, source, target: boundary(source, handle, label, fromCode && !choice.exit ? 'unresolved' : 'exit', choice.exit || ''), handle, label: `${index + 1}. ${choice.text}`, when: choice.when || '', kind: fromCode && !choice.exit ? 'unresolved' : 'exit' });
      }
      if (choice.check?.fail) add(source, splitChoices ? 'fail' : `check:${choice.id}`, choice.check.fail, `Caller check failed · ${choice.check.pass}`, choice.check.pass, 'check');
    }
    // The extractor preserves return prose as a separate collection. This is a
    // presentation variant of its parent, not a chronological continuation.
    if (fromCode && id.endsWith('.revisitLines')) {
      const parent = id.slice(0, -'.revisitLines'.length);
      if (included.has(parent)) links.push({ id: `${parent}:revisit`, source: parent, target: id, handle: 'revisit', label: 'On return · alternate lines', when: '', kind: 'revisit' });
    }
  }
  const allIds = [...nodeIds, ...choices.map(item => item.id), ...boundaries.map(item => item.id)];
  const outgoing = new Map(allIds.map(id => [id, links.filter(link => link.source === id)]));
  const incoming = new Map(allIds.map(id => [id, links.filter(link => link.target === id)]));
  const reachable = new Set();
  const pending = [...entries];
  while (pending.length) {
    const id = pending.pop();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const edge of outgoing.get(id) || []) pending.push(edge.target);
  }
  // Break only DFS back edges for ranking. Joins use the longest remaining
  // path so that a short route cannot pull a merge ahead of a longer route.
  const state = new Map(), ordered = [];
  const visit = id => {
    if (state.has(id)) return;
    state.set(id, 1);
    for (const edge of outgoing.get(id) || []) {
      if (state.get(edge.target) === 1) { edge.back = true; if (!['revisit', 'ownership'].includes(edge.kind)) edge.kind = 'return'; }
      else visit(edge.target);
    }
    state.set(id, 2); ordered.push(id);
  };
  for (const id of [...entries, ...allIds]) visit(id);
  const ranks = Object.fromEntries(allIds.map(id => [id, 0]));
  for (const id of ordered.reverse()) for (const edge of outgoing.get(id) || []) {
    if (!edge.back) ranks[edge.target] = Math.max(ranks[edge.target], ranks[id] + 1);
  }
  // Independent sets are separate lanes. No relationship is invented from
  // source order, a generated entry list, or a document's region membership.
  const components = [], seen = new Set();
  for (const root of [...entries, ...allIds]) {
    if (seen.has(root)) continue;
    const ids = [], queue = [root]; seen.add(root);
    while (queue.length) {
      const id = queue.shift(); ids.push(id);
      for (const edge of [...(outgoing.get(id) || []), ...(incoming.get(id) || [])]) {
        const other = edge.source === id ? edge.target : edge.source;
        if (!seen.has(other)) { seen.add(other); queue.push(other); }
      }
    }
    components.push(ids);
  }
  const facts = Object.fromEntries(nodeIds.map(id => [id, {
    entry: entries.has(id), detached: entries.size > 0 && !reachable.has(id),
    join: (incoming.get(id) || []).filter(edge => edge.kind !== 'return' && edge.kind !== 'revisit').length > 1,
    returning: (incoming.get(id) || []).some(edge => edge.kind === 'return'),
    incoming: (incoming.get(id) || []).length, outgoing: (outgoing.get(id) || []).length,
    rank: ranks[id],
  }]));
  return { nodeIds, choices, entries, links, boundaries, components, ranks, facts, reachable,
    unresolved: links.filter(link => link.kind === 'unresolved').length };
}

/** @param {ReturnType<typeof buildSceneGraph>} graph @param {NarrativeDocument} document
 * @param {Record<string, {width?: number, height?: number}>} sizes */
export function layoutSceneGraph(graph, document, sizes = {}) {
  /** @type {Record<string, {x: number, y: number}>} */
  const positions = {};
  const shelfWidth = Math.max(1920, ...graph.components.map(ids => (Math.max(...ids.map(id => graph.ranks[id])) + 1) * 480));
  let top = 90, left = 80, shelfBottom = top;
  for (const component of graph.components) {
    const width = (Math.max(...component.map(id => graph.ranks[id])) + 1) * 480;
    if (left > 80 && left + width > shelfWidth + 80) { left = 80; top = shelfBottom + 100; }
    const columns = new Map();
    for (const id of component) {
      const rank = graph.ranks[id];
      if (!columns.has(rank)) columns.set(rank, []);
      columns.get(rank).push(id);
    }
    let bottom = top;
    for (const [rank, ids] of columns) {
      let y = top;
      for (const id of ids) {
        positions[id] = { x: left + rank * 480, y };
        const node = document.nodes[id];
        const height = sizes[id]?.height || (node ? 354 + (node.when ? 28 : 0) : graph.choices.some(item => item.id === id) ? 250 : 100);
        y += height + 64;
      }
      bottom = Math.max(bottom, y);
    }
    left += width;
    shelfBottom = Math.max(shelfBottom, bottom);
  }
  return positions;
}
