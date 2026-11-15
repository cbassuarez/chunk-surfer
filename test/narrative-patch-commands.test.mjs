import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runPatchCommand, connectLineOrder, lineGraphId, collectionGraphId, patchObject } from '../tools/narrative-studio/src/patch-commands.js';
import { patchStoryConnection, unplugStoryConnections } from '../tools/narrative-studio/src/graph-patching.js';
import { buildSceneGraph, choiceGraphId } from '../tools/narrative-studio/src/scene-graph.js';
import { createConversationProbe } from '../tools/narrative-studio/src/conversation-probe.js';
import { validateNarrativeDocument } from '../src/narrative/contracts.js';
import { rehydrateTree } from '../src/narrative/runtime-content.js';
import { contextValue, evaluateCondition } from '../src/narrative/conditions.js';
import { renameStoryNode } from '../tools/narrative-studio/src/story-transforms.js';

const fixture = () => ({
  document: { schemaVersion: 1, id: 'patch-fixture', title: 'Patch fixture', status: 'draft', entry: 'start', regions: [{ id: 'scene', kind: 'scene', title: 'Scene', nodeIds: ['start', 'middle', 'end'] }], nodes: {
    start: { id: 'start', type: 'dialogue', lines: [{ id: 'one', who: 'direction', text: 'One', sourceId: 'raw-one', unknown: { retain: true } }, { id: 'two', who: 'me', text: 'Two', prompt: 'Say two', when: 'ready', cue: 'test' }, { id: 'three', text: 'Three' }], revisitLines: [{ id: 'return-one', text: 'Again' }], goto: 'middle' },
    middle: { id: 'middle', type: 'dialogue', lines: [{ id: 'middle-line', text: 'Middle' }], goto: 'end', mutations: { set: ['caller.owned'] } },
    end: { id: 'end', type: 'dialogue', lines: [{ id: 'end-line', text: 'End' }] },
  } }, layout: { schemaVersion: 1, documentId: 'patch-fixture', positions: { start: { x: 0, y: 0 }, middle: { x: 480, y: 0 } }, regions: {} },
});
const assertValid = doc => assert.deepEqual(validateNarrativeDocument(doc).errors, []);
const line = (doc, id) => patchObject(doc, lineGraphId('start', 'lines', id));

test('inserting a beat into a real route preserves its destination, state and unrelated data', () => {
  const { document, layout } = fixture(), before = structuredClone({ document, layout });
  const inserted = runPatchCommand(document, layout, { type: 'insert', edgeId: 'start:goto', position: { x: 240, y: 120 } });
  assert.equal(inserted.changed, true); assertValid(inserted.document);
  assert.equal(inserted.document.nodes.start.goto, inserted.selectedId);
  assert.equal(inserted.document.nodes[inserted.selectedId].goto, 'middle');
  assert.deepEqual(inserted.document.nodes.middle, document.nodes.middle);
  assert.deepEqual({ document, layout }, before, 'history frame is not mutated');
  const bypassed = runPatchCommand(inserted.document, inserted.layout, { type: 'remove', object: patchObject(inserted.document, inserted.selectedId), preserve: true });
  assert.equal(bypassed.document.nodes.start.goto, 'middle');
  assert.deepEqual(bypassed.document, document, 'insert / bypass preserves the original semantic document');
});

test('line insertion, sequence patching and collection moves retain stable IDs and every property', () => {
  const { document, layout } = fixture();
  const added = runPatchCommand(document, layout, { type: 'line', nodeId: 'start', index: 1 });
  assert.equal(added.document.nodes.start.lines.length, 4); assertValid(added.document);
  const reordered = connectLineOrder(document, layout, { source: lineGraphId('start', 'lines', 'three'), sourceHandle: 'next', target: lineGraphId('start', 'lines', 'one'), targetHandle: 'in' });
  assert.deepEqual(reordered.document.nodes.start.lines.map(l => l.id), ['two', 'three', 'one']);
  assert.deepEqual(reordered.document.nodes.start.lines[2], document.nodes.start.lines[0]);
  const moved = runPatchCommand(document, layout, { type: 'move-line', object: line(document, 'two'), collection: 'revisitLines', index: 0 });
  assert.deepEqual(moved.document.nodes.start.revisitLines[0], document.nodes.start.lines[1]);
  assert.equal(moved.document.nodes.start.lines.length, 2); assertValid(moved.document);
  const head = connectLineOrder(document, layout, { source: collectionGraphId('start', 'lines'), sourceHandle: 'next', target: lineGraphId('start', 'lines', 'three'), targetHandle: 'in' });
  assert.equal(head.document.nodes.start.lines[0].id, 'three');
  assert.equal(connectLineOrder(document, layout, { source: collectionGraphId('start', 'revisitLines'), sourceHandle: 'next', target: lineGraphId('start', 'lines', 'three'), targetHandle: 'in' }).changed, false);
});

test('creating and reparenting answers preserves existing automatic routes, then branches can rejoin', () => {
  const { document, layout } = fixture();
  const created = runPatchCommand(document, layout, { type: 'choice', nodeId: 'start' });
  assert.equal(created.document.nodes.start.goto, undefined);
  assert.equal(created.document.nodes.start.choices[0].goto, 'middle', 'prior route becomes an explicit answer');
  assertValid(created.document);
  const newChoice = created.document.nodes.start.choices[1];
  created.layout.positions[created.patchId] = { x: 600, y: 240 };
  const conditioned = runPatchCommand(created.document, created.layout, { type: 'update', object: patchObject(created.document, created.patchId), fields: { when: 'ready', mutations: { set: ['heard'] } } });
  const joined = patchStoryConnection(conditioned.document, conditioned.layout, { source: created.patchId, sourceHandle: 'route', target: 'middle', targetHandle: 'in' });
  const graph = buildSceneGraph(joined.document, { splitChoices: true });
  assert.equal(graph.facts.middle.join, true);
  const moved = patchStoryConnection(joined.document, joined.layout, { source: 'middle', sourceHandle: 'choices', target: created.patchId, targetHandle: 'owner' });
  assert.equal(moved.document.nodes.middle.choices[0].goto, 'end', 'reparenting does not discard the new owner continuation');
  assert.equal(moved.document.nodes.middle.choices[1].id, newChoice.id);
  assert.equal(moved.document.nodes.middle.choices[1].when, 'ready');
  assert.deepEqual(moved.document.nodes.middle.choices[1].mutations, { set: ['heard'] });
  assert.ok(moved.document.nodes[newChoice.goto], 'the previous response remains available'); assertValid(moved.document);
  assert.deepEqual(moved.layout.positions[choiceGraphId('middle', newChoice.id)], { x: 600, y: 240 });
  assert.equal(moved.layout.positions[created.patchId], undefined, 'synthetic owner geometry is moved, not abandoned');
});

test('duplication allocates fresh IDs, retargets only internal selected routes, and preserves source provenance', () => {
  const { document, layout } = fixture();
  const result = runPatchCommand(document, layout, { type: 'duplicate', patchIds: ['start', 'middle'] });
  assertValid(result.document);
  assert.equal(result.document.nodes['start.copy'].goto, 'middle.copy');
  assert.equal(result.document.nodes['middle.copy'].goto, 'end');
  assert.equal(result.document.nodes['start.copy'].lines[0].sourceId, 'raw-one');
  assert.deepEqual(result.document.nodes['start.copy'].lines[0].unknown, { retain: true });
  assert.notEqual(result.document.nodes['start.copy'].revisitLines[0].id, 'return-one');
  assert.equal(document.nodes.start.goto, 'middle');
});

test('removal is explicit: bypass a linear beat or end incoming routes; entries and branches refuse bypass', () => {
  const { document, layout } = fixture();
  const removed = runPatchCommand(document, layout, { type: 'remove', object: patchObject(document, 'middle'), preserve: false });
  assert.equal(removed.document.nodes.start.goto, undefined); assert.ok(removed.document.nodes.end); assertValid(removed.document);
  const bypassed = runPatchCommand(document, layout, { type: 'remove', object: patchObject(document, 'middle'), preserve: true });
  assert.equal(bypassed.document.nodes.start.goto, 'end'); assertValid(bypassed.document);
  assert.equal(runPatchCommand(document, layout, { type: 'remove', object: patchObject(document, 'start'), preserve: false }).changed, false);
  const branched = runPatchCommand(document, layout, { type: 'choice', nodeId: 'middle' });
  assert.equal(runPatchCommand(branched.document, branched.layout, { type: 'remove', object: patchObject(branched.document, 'middle'), preserve: true }).changed, false);
});

test('a complete editing sequence can undo and redo exact document, layout and identities', () => {
  const initial = fixture(), past = [], future = []; let current = initial;
  const apply = command => { const result = runPatchCommand(current.document, current.layout, command); assert.equal(result.changed, true); past.push(structuredClone(current)); current = { document: result.document, layout: result.layout }; assertValid(current.document); return result; };
  const inserted = apply({ type: 'insert', edgeId: 'start:goto' });
  apply({ type: 'line', nodeId: inserted.selectedId });
  const answer = apply({ type: 'choice', nodeId: inserted.selectedId });
  apply({ type: 'update', object: patchObject(current.document, answer.patchId), fields: { when: 'ready', mutations: { set: ['tested'] } } });
  apply({ type: 'duplicate', patchIds: [answer.patchId] });
  const final = structuredClone(current);
  while (past.length) { future.push(current); current = past.pop(); }
  assert.deepEqual(current, initial);
  while (future.length) current = future.pop();
  assert.deepEqual(current, final);
  assert.deepEqual(JSON.parse(JSON.stringify(current)), final, 'save/reload has no hidden graph execution state');
});

test('generated sequences of insert, reorder, duplicate and remove preserve invariants', () => {
  let { document, layout } = fixture();
  for (let index = 0; index < 60; index++) {
    const rows = document.nodes.start.lines;
    const command = index % 4 === 0 ? { type: 'line', nodeId: 'start', index: index % (rows.length + 1) }
      : index % 4 === 1 ? { type: 'duplicate', object: line(document, rows[index % rows.length].id) }
      : index % 4 === 2 ? { type: 'move-line', object: line(document, rows[rows.length - 1].id), index: 0 }
      : { type: 'remove', object: line(document, rows[1].id) };
    const result = runPatchCommand(document, layout, command); assert.equal(result.changed, true);
    document = result.document; layout = result.layout; assertValid(document);
    assert.equal(document.nodes.start.goto, 'middle'); assert.equal(document.nodes.middle.goto, 'end');
  }
});

test('production probe respects speech permission, conditional lines, effects, spent questions and return prose', () => {
  const { document } = fixture();
  document.nodes.start.choices = [{ id: 'ask', text: 'Ask', goto: 'middle', when: 'ready', hideWhenAsked: true, mutations: { set: ['question.asked', 'literal=false', 'count=2'], clear: ['old'] } }, { id: 'leave', text: 'Leave', exit: 'leave-room' }];
  delete document.nodes.start.goto; document.nodes.start.type = 'choice'; document.nodes.middle.goto = 'start';
  const probe = createConversationProbe(document, { flags: { ready: true } });
  try {
    assert.equal(probe.view().line.sourceId, 'one');
    let frame = probe.advance(); assert.equal(frame.pending.kind, 'say'); assert.equal(frame.pending.options[0].text, 'Say two');
    assert.ok(!frame.events.some(e => e.lineId === 'two'), 'permission has not fired the line callback');
    frame = probe.choose(0); assert.ok(frame.events.some(e => e.lineId === 'two'));
    probe.advance(); frame = probe.advance(); assert.equal(frame.pending.kind, 'branch');
    frame = probe.choose(0); assert.equal(frame.nodeId, 'middle'); assert.equal(frame.context.flags['question.asked'], true);
    assert.equal(frame.context.flags.literal, 'false', 'assignment parsing is the same as the game flag callback');
    assert.equal(frame.context.flags.count, 2); assert.equal(frame.context.flags.old, false);
    frame = probe.advance(); assert.equal(frame.nodeId, 'start'); assert.equal(frame.line.sourceId, 'return-one');
    frame = probe.advance(); assert.deepEqual(frame.pending.options.map(c => c.sourceId), ['leave']);
    frame = probe.choose(0); assert.equal(frame.finished, true); assert.ok(frame.events.some(e => e.type === 'caller-boundary' && e.text.includes('leave-room')));
    assert.equal(frame.context.flags['caller.owned'], undefined, 'node effects are not silently invented by the probe');
  } finally { probe.stop(); }
  const locked = createConversationProbe(document, { flags: { ready: false } });
  try { assert.equal(locked.advance().line.sourceId, 'three', 'a hidden speech decision is skipped'); } finally { locked.stop(); }
});

test('canonical return prose is adapted with conditions, cues and source identities just like normal lines', async () => {
  const doc = JSON.parse(await readFile('content/narrative/conservatory.cold_open_dialogue.story.json', 'utf8'));
  const runtime = rehydrateTree(doc);
  for (const [id, node] of Object.entries(doc.nodes)) for (const [index, line] of (node.revisitLines || []).entries()) {
    assert.equal(runtime[id].revisitLines[index].sourceId, line.id);
    assert.equal(runtime[id].revisitLines[index].if, line.when);
  }
  assert.equal(contextValue({ 'confession.kind': 'name' }, 'confession.kind'), 'name');
  assert.equal(evaluateCondition('confession.kind == name', { 'confession.kind': 'name' }), true);
});

test('caller check failure routes stay visible, can be retargeted, and cannot be silently unplugged', async () => {
  const document = JSON.parse(await readFile('content/narrative/source-space.contact.story.json', 'utf8'));
  const graph = buildSceneGraph(document, { splitChoices: true }), checks = graph.links.filter(link => link.handle === 'fail');
  assert.ok(checks.length);
  for (const link of checks) {
    const choice = graph.choices.find(item => item.id === link.source);
    assert.equal(link.target, choice.choice.check.fail);
    assert.match(link.label, /Caller check failed/);
  }
  const link = checks[0], choice = graph.choices.find(item => item.id === link.source), target = Object.keys(document.nodes).find(id => id !== choice.choice.check.fail);
  const layout = { schemaVersion: 1, documentId: document.id, positions: {}, regions: {} };
  const retargeted = patchStoryConnection(document, layout, { source: link.source, sourceHandle: 'fail', target, targetHandle: 'in' });
  assert.equal(retargeted.changed, true);
  assert.equal(retargeted.document.nodes[choice.ownerId].choices.find(item => item.id === choice.choice.id).check.fail, target);
  const unplugged = unplugStoryConnections(retargeted.document, layout, [link.id]);
  assert.deepEqual(unplugged.document, retargeted.document, 'failure cannot become an invalid missing check target');
});

test('a renamed beat retains its line and choice patch geometry, and batch removal is all-or-nothing', () => {
  const { document, layout } = fixture();
  layout.positions[lineGraphId('middle', 'lines', 'middle-line')] = { x: 700, y: 400 };
  const renamed = renameStoryNode(document, layout, 'middle', 'renamed');
  assert.deepEqual(renamed.layout.positions[lineGraphId('renamed', 'lines', 'middle-line')], { x: 700, y: 400 });
  assert.equal(renamed.document.nodes.start.goto, 'renamed');
  const rejected = runPatchCommand(document, layout, { type: 'remove-many', patchIds: ['middle', 'start'] });
  assert.equal(rejected.changed, false); assert.deepEqual(rejected.document, document);
  const removed = runPatchCommand(document, layout, { type: 'remove-many', patchIds: ['middle', 'end'] });
  assert.equal(removed.changed, true); assert.deepEqual(Object.keys(removed.document.nodes), ['start']); assertValid(removed.document);
});

test('creating from an already-connected port retains its prior destination; identical patches do not create history', () => {
  const { document, layout } = fixture();
  assert.equal(patchStoryConnection(document, layout, { source: 'start', sourceHandle: 'goto', target: 'middle', targetHandle: 'in' }).changed, false);
  const result = runPatchCommand(document, layout, { type: 'successor', connection: { source: 'start', sourceHandle: 'goto', target: '', targetHandle: 'in' } });
  assert.equal(result.document.nodes.start.goto, result.selectedId);
  assert.equal(result.document.nodes[result.selectedId].goto, 'middle'); assertValid(result.document);
});
