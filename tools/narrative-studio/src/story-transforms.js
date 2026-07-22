const clone = (value) => structuredClone(value);

function allContentIds(document) {
  const ids = new Set(Object.keys(document.nodes || {}));
  for (const node of Object.values(document.nodes || {})) {
    if (node.id) ids.add(node.id);
    for (const line of node.lines || []) if (line?.id) ids.add(line.id);
    for (const choice of node.choices || []) if (choice?.id) ids.add(choice.id);
  }
  return ids;
}

export function allocateStoryId(document, base) {
  const used = allContentIds(document);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function responsePosition(layout, parentId, choiceIndex) {
  const parent = layout.positions?.[parentId] || { x: 120, y: 120 };
  const occupied = new Set(Object.values(layout.positions || {}).map((point) => `${Math.round(point.x)},${Math.round(point.y)}`));
  const position = { x: parent.x + 430, y: parent.y + choiceIndex * 250 };
  while (occupied.has(`${Math.round(position.x)},${Math.round(position.y)}`)) position.y += 48;
  return position;
}

function inheritRegion(document, parentId, childId) {
  const region = document.regions?.find((item) => item.nodeIds.includes(parentId));
  if (region && !region.nodeIds.includes(childId)) region.nodeIds.push(childId);
}

function normalizeBranchType(node, branching) {
  if (!['dialogue', 'choice'].includes(node.type)) return;
  node.type = branching ? 'choice' : 'dialogue';
}

function createResponseNode(document, layout, parentId, choiceIndex) {
  const responseId = allocateStoryId(document, `${parentId}.response-${choiceIndex + 1}`);
  const lineId = allocateStoryId(document, `${responseId}.line.1`);
  const parent = document.nodes[parentId];
  document.nodes[responseId] = {
    id: responseId,
    type: 'dialogue',
    speaker: parent?.speaker || '',
    lines: [{ id: lineId, who: 'direction', text: '' }],
  };
  layout.positions = { ...(layout.positions || {}), [responseId]: responsePosition(layout, parentId, choiceIndex) };
  inheritRegion(document, parentId, responseId);
  return responseId;
}

export function addChoiceWithResponse(document, layout, nodeId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  const node = nextDocument.nodes[nodeId];
  if (!node) return { document: nextDocument, layout: nextLayout, selectedId: nodeId, choiceId: null, responseId: null };
  const choices = [...(node.choices || [])];
  const choiceId = allocateStoryId(nextDocument, `${nodeId}.choice.${choices.length + 1}`);
  let responseId = null;
  if (!choices.length && node.goto) {
    responseId = node.goto;
    delete node.goto;
  } else {
    responseId = createResponseNode(nextDocument, nextLayout, nodeId, choices.length);
  }
  choices.push({ id: choiceId, text: '', goto: responseId });
  node.choices = choices;
  normalizeBranchType(node, true);
  return { document: nextDocument, layout: nextLayout, selectedId: nodeId, choiceId, responseId };
}

export function createResponseForChoice(document, layout, nodeId, choiceId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  const node = nextDocument.nodes[nodeId];
  const choice = node?.choices?.find((item) => item.id === choiceId);
  if (!node || !choice) return { document: nextDocument, layout: nextLayout, selectedId: nodeId, responseId: null };
  const index = node.choices.indexOf(choice);
  const responseId = createResponseNode(nextDocument, nextLayout, nodeId, index);
  choice.goto = responseId;
  delete choice.exit;
  return { document: nextDocument, layout: nextLayout, selectedId: nodeId, responseId };
}

export function removeChoicePreservingResponse(document, layout, nodeId, choiceId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  const node = nextDocument.nodes[nodeId];
  if (!node) return { document: nextDocument, layout: nextLayout, selectedId: nodeId, detachedTarget: null };
  const choice = (node.choices || []).find((item) => item.id === choiceId);
  node.choices = (node.choices || []).filter((item) => item.id !== choiceId);
  if (!node.choices.length) {
    delete node.choices;
    normalizeBranchType(node, false);
  }
  return { document: nextDocument, layout: nextLayout, selectedId: nodeId, detachedTarget: choice?.goto || null };
}

function mergeMutations(target, source) {
  const set = [...new Set([...(target?.set || []), ...(source?.set || [])])];
  const clear = [...new Set([...(target?.clear || []), ...(source?.clear || [])])];
  return set.length || clear.length ? { ...(set.length ? { set } : {}), ...(clear.length ? { clear } : {}) } : undefined;
}

export function canMakeLinear(node) {
  const choice = node?.choices?.length === 1 ? node.choices[0] : null;
  return !!choice?.goto && !choice.when && !(choice.cues || []).length && !choice.exit;
}

export function makeNodeLinear(document, layout, nodeId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  const node = nextDocument.nodes[nodeId];
  if (!canMakeLinear(node)) return { document: nextDocument, layout: nextLayout, selectedId: nodeId, changed: false };
  const choice = node.choices[0];
  node.goto = choice.goto;
  node.mutations = mergeMutations(node.mutations, choice.mutations);
  if (!node.mutations) delete node.mutations;
  delete node.choices;
  normalizeBranchType(node, false);
  return { document: nextDocument, layout: nextLayout, selectedId: nodeId, changed: true };
}

export function incomingStoryReferences(document, targetId) {
  const incoming = [];
  for (const [nodeId, node] of Object.entries(document.nodes || {})) {
    if (node.goto === targetId) incoming.push({ nodeId, kind: 'goto', choiceId: null });
    for (const choice of node.choices || []) if (choice.goto === targetId) incoming.push({ nodeId, kind: 'choice', choiceId: choice.id });
  }
  return incoming;
}

export function detachedStoryNodeIds(document) {
  const reached = new Set();
  const pending = [...new Set([document.entry, ...(document.entries || [])].filter(Boolean))];
  while (pending.length) {
    const id = pending.shift();
    if (reached.has(id) || !document.nodes?.[id]) continue;
    reached.add(id);
    const node = document.nodes[id];
    if (node.goto) pending.push(node.goto);
    for (const choice of node.choices || []) if (choice.goto) pending.push(choice.goto);
  }
  return Object.keys(document.nodes || {}).filter((id) => !reached.has(id));
}

export function attachDetachedAsChoice(document, layout, nodeId, targetId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  const node = nextDocument.nodes[nodeId];
  if (!node || !nextDocument.nodes[targetId] || nodeId === targetId) return { document: nextDocument, layout: nextLayout, selectedId: nodeId, choiceId: null };
  const choices = [...(node.choices || [])];
  if (!choices.length && node.goto) {
    choices.push({ id: allocateStoryId(nextDocument, `${nodeId}.choice.1`), text: '', goto: node.goto });
    delete node.goto;
  }
  const choiceId = allocateStoryId(nextDocument, `${nodeId}.choice.${choices.length + 1}`);
  choices.push({ id: choiceId, text: '', goto: targetId });
  node.choices = choices;
  normalizeBranchType(node, true);
  return { document: nextDocument, layout: nextLayout, selectedId: nodeId, choiceId };
}

export function deleteStoryNode(document, layout, nodeId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  if (!nextDocument.nodes[nodeId] || nodeId === nextDocument.entry || (nextDocument.entries || []).includes(nodeId)) {
    return { document: nextDocument, layout: nextLayout, selectedId: nodeId, changed: false };
  }
  delete nextDocument.nodes[nodeId];
  delete nextLayout.positions?.[nodeId];
  for (const node of Object.values(nextDocument.nodes)) {
    if (node.goto === nodeId) delete node.goto;
    for (const choice of node.choices || []) if (choice.goto === nodeId) delete choice.goto;
  }
  for (const region of nextDocument.regions || []) region.nodeIds = region.nodeIds.filter((id) => id !== nodeId);
  return { document: nextDocument, layout: nextLayout, selectedId: nextDocument.entry, changed: true };
}

export function renameStoryNode(document, layout, nodeId, nextId) {
  const nextDocument = clone(document);
  const nextLayout = clone(layout);
  if (!nextId || nextId === nodeId || !nextDocument.nodes[nodeId] || nextDocument.nodes[nextId]) {
    return { document: nextDocument, layout: nextLayout, selectedId: nodeId, changed: false };
  }
  nextDocument.nodes[nextId] = { ...nextDocument.nodes[nodeId], id: nextId };
  delete nextDocument.nodes[nodeId];
  if (nextDocument.entry === nodeId) nextDocument.entry = nextId;
  if (nextDocument.entries) nextDocument.entries = nextDocument.entries.map((id) => id === nodeId ? nextId : id);
  for (const node of Object.values(nextDocument.nodes)) {
    if (node.goto === nodeId) node.goto = nextId;
    for (const choice of node.choices || []) if (choice.goto === nodeId) choice.goto = nextId;
  }
  for (const region of nextDocument.regions || []) region.nodeIds = region.nodeIds.map((id) => id === nodeId ? nextId : id);
  if (nextLayout.positions?.[nodeId]) {
    nextLayout.positions[nextId] = nextLayout.positions[nodeId];
    delete nextLayout.positions[nodeId];
  }
  return { document: nextDocument, layout: nextLayout, selectedId: nextId, changed: true };
}
