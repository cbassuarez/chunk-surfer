import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSceneGraph, layoutSceneGraph, sceneScopes } from '../tools/narrative-studio/src/scene-graph.js';
import { extractModule, documentFor } from '../scripts/export-runtime-narrative.mjs';
import { OPENING_PROLOGUE } from '../src/data/opening-prologue.js';
import { rehydrateTree } from '../src/narrative/runtime-content.js';
import { createNarrativeExecutor } from '../src/narrative/executor.js';

const authored = async id => JSON.parse(await readFile(`content/narrative/${id}.story.json`, 'utf8'));
const node = (id, extra = {}) => ({ id, type: 'dialogue', lines: [{ id: `${id}.l`, text: id }], ...extra });
const edgePairs = graph => graph.links.filter(e => !e.target.startsWith('boundary:') && e.kind !== 'revisit').map(e => `${e.source}->${e.target}`).sort();

for (const id of ['conservatory.first_take', 'conservatory.cold_open_dialogue', 'source-space.door-field', 'source-space.last-light', 'conservatory.radio_dead']) {
  test(`${id}: every authored node and runtime transition is represented`, async () => {
    const document = await authored(id), before = JSON.stringify(document), runtime = rehydrateTree(document), graph = buildSceneGraph(document);
    assert.deepEqual(graph.nodeIds, Object.keys(document.nodes));
    assert.deepEqual([...graph.entries].sort(), [...new Set([document.entry, ...(document.entries || [])])].sort());
    const expected = Object.entries(runtime).flatMap(([id, n]) => [n.goto, ...(n.choices || []).map(c => c.goto)].filter(Boolean).map(target => `${id}->${target}`)).sort();
    assert.deepEqual(edgePairs(graph), expected);
    const positions = layoutSceneGraph(graph, document);
    assert.equal(new Set(Object.values(positions).map(p => `${p.x},${p.y}`)).size, Object.keys(positions).length);
    for (const link of graph.links) if (!['return', 'revisit'].includes(link.kind)) assert.ok(positions[link.target].x > positions[link.source].x, `${link.id} progresses right`);
    assert.equal(JSON.stringify(document), before, 'view/layout cannot mutate authored content');
  });
}

test('a longer branch joins after both parents; cycles, self-loops and disconnected nodes survive', () => {
  const document = { id: 'fixture', entry: 'start', entries: [], regions: [], nodes: {
    start: node('start', { choices: [{ id: 'short', text: 'Short', goto: 'join' }, { id: 'long', text: 'Long', goto: 'a', when: 'unlocked' }] }),
    a: node('a', { goto: 'b' }), b: node('b', { goto: 'join' }),
    join: node('join', { choices: [{ id: 'back', text: 'Again', goto: 'start' }, { id: 'self', text: 'Stay', goto: 'join' }, { id: 'exit', text: 'Leave', exit: 'done' }] }),
    detached: node('detached', { goto: 'missing' }),
  } };
  const graph = buildSceneGraph(document), p = layoutSceneGraph(graph, document);
  assert.equal(graph.facts.join.join, true);
  assert.ok(p.join.x > p.b.x && p.join.x > p.start.x);
  assert.equal(graph.links.find(e => e.id === 'join:choice:back').kind, 'return');
  assert.equal(graph.links.find(e => e.id === 'join:choice:self').kind, 'return');
  assert.equal(graph.links.find(e => e.id === 'start:choice:long').when, 'unlocked');
  assert.equal(graph.facts.detached.detached, true);
  assert.equal(graph.components.length, 2);
  assert.equal(graph.unresolved, 1);
  assert.ok(graph.boundaries.some(b => b.label === 'Exit · done'));
  assert.ok(graph.boundaries.some(b => b.label === 'Unresolved target · missing'));
});

test('source collection order and generated entries never become inferred starts or transitions', () => {
  const document = { entry: 'b', entries: ['b', 'a'], regions: [], nodes: { b: node('b'), a: node('a') } };
  const graph = buildSceneGraph(document, { fromCode: true });
  assert.equal(graph.entries.size, 0); assert.equal(graph.links.length, 0);
  assert.equal(graph.components.length, 2); assert.equal(graph.facts.a.detached, false);
  assert.equal(sceneScopes(document, true)[0].title, 'All extracted source material');
});

test('the opening graph agrees with the original runtime table, including spread returns and an empty terminal', async () => {
  const path = 'src/data/opening-prologue.js';
  const document = documentFor('data/opening-prologue.js', extractModule(await readFile(path, 'utf8'), path));
  const scope = sceneScopes(document, true)[0];
  const graph = buildSceneGraph(document, { fromCode: true, nodeIds: scope.nodeIds });
  assert.deepEqual([...graph.entries], [`nodes.${OPENING_PROLOGUE.entry}`]);
  for (const [id, original] of Object.entries(OPENING_PROLOGUE.nodes)) {
    const exported = document.nodes[`nodes.${id}`];
    assert.ok(exported, `original node ${id} is present`);
    assert.equal(exported.goto, original.goto ? `nodes.${original.goto}` : undefined, `${id} continuation`);
    assert.deepEqual((exported.choices || []).map(c => c.goto), (original.choices || []).map(c => c.goto ? `nodes.${c.goto}` : undefined), `${id} choices`);
    assert.deepEqual(exported.lines.map(l => l.text), original.lines.filter(l => l.text).map(l => l.text), `${id} dialogue`);
    if (original.revisitLines?.length) {
      const variant = document.nodes[`nodes.${id}.revisitLines`];
      assert.deepEqual(variant.lines.map(l => l.text), original.revisitLines.map(l => l.text));
      assert.ok(graph.links.some(e => e.source === `nodes.${id}` && e.target === variant.id && e.kind === 'revisit'));
    }
  }
  assert.equal(graph.unresolved, 0);
  assert.ok(graph.links.some(e => e.source === 'nodes.f-home' && e.target === 'nodes.fate' && e.kind === 'return'));
  assert.ok(graph.nodeIds.includes('nodes.card'));
  assert.equal(graph.reachable.size, graph.nodeIds.length);
});

test('canonical conditional paths agree with executor availability and effects', () => {
  const document = { id: 'conditional', entry: 'start', nodes: {
    start: node('start', { choices: [{ id: 'open', text: 'Open', goto: 'end', when: 'unlocked', mutations: { set: ['visited'] } }] }),
    end: node('end'),
  } };
  const graph = buildSceneGraph(document), edge = graph.links[0];
  assert.equal(edge.when, 'unlocked');
  const locked = createNarrativeExecutor(document, { unlocked: false }); locked.advance();
  assert.equal(locked.view().choices.length, 0);
  const open = createNarrativeExecutor(document, { unlocked: true }); open.advance();
  assert.equal(open.view().choices[0].goto, edge.target); open.choose('open');
  assert.equal(open.view().nodeId, edge.target); assert.equal(open.view().context.flags.visited, true);
});

import { choiceGraphId, exitGraphId } from '../tools/narrative-studio/src/scene-graph.js';
import { patchStoryConnection, reconnectStoryConnection, unplugStoryConnections } from '../tools/narrative-studio/src/graph-patching.js';
import { createConversation } from '../src/game/conversation.js';

const patchFixture = () => ({
  document: { schemaVersion: 1, id: 'patch', title: 'Patch', entry: 'start', regions: [], nodes: {
    start: node('start', { type: 'choice', choices: [{ id: 'a', text: 'Go', goto: 'answer', when: 'unlocked', mutations: { set: ['visited'] } }] }),
    answer: node('answer'), other: node('other'),
  } }, layout: { schemaVersion: 1, documentId: 'patch', positions: {}, regions: {} },
});

test('each choice is a distinct patch object with ownership and a runtime route', async () => {
  const document = await authored('conservatory.cold_open_dialogue');
  const graph = buildSceneGraph(document, { splitChoices: true });
  const expected = Object.values(document.nodes).reduce((n, node) => n + (node.choices?.length || 0), 0);
  assert.equal(graph.choices.length, expected);
  assert.equal(new Set(graph.choices.map(c => c.id)).size, expected);
  for (const choice of graph.choices) {
    const owner = graph.links.find(e => e.kind === 'ownership' && e.target === choice.id);
    assert.equal(owner.source, choice.ownerId);
    const route = graph.links.find(e => e.source === choice.id);
    assert.equal(route.handle, 'route');
    if (choice.choice.goto) assert.equal(route.target, choice.choice.goto);
  }
  const positions = layoutSceneGraph(graph, document);
  for (const choice of graph.choices) assert.ok(positions[choice.id].x > positions[choice.ownerId].x);
});

test('patching a choice reroutes the real executor and preserves its words, condition and mutations', () => {
  const { document, layout } = patchFixture(), before = JSON.stringify(document);
  const result = patchStoryConnection(document, layout, { source: choiceGraphId('start', 'a'), sourceHandle: 'route', target: 'other', targetHandle: 'in' });
  assert.equal(result.changed, true); assert.equal(JSON.stringify(document), before);
  assert.deepEqual(result.document.nodes.start.choices[0], { ...document.nodes.start.choices[0], goto: 'other' });
  const executor = createNarrativeExecutor(result.document, { unlocked: true }); executor.advance(); executor.choose('a');
  assert.equal(executor.view().nodeId, 'other'); assert.equal(executor.view().context.flags.visited, true);
});

test('exit terminals and unplugging map to existing exit / completion semantics', () => {
  const { document, layout } = patchFixture();
  layout.exits = { [exitGraphId('leave-room')]: { event: 'leave-room' } };
  const result = patchStoryConnection(document, layout, { source: choiceGraphId('start', 'a'), sourceHandle: 'route', target: exitGraphId('leave-room'), targetHandle: 'in' });
  assert.equal(result.document.nodes.start.choices[0].exit, 'leave-room');
  assert.equal(result.document.nodes.start.choices[0].goto, undefined);
  const executor = createNarrativeExecutor(result.document, { unlocked: true }); executor.advance(); executor.choose('a'); assert.equal(executor.view().finished, true);
  const graph = buildSceneGraph(result.document, { splitChoices: true, exits: layout.exits });
  const route = graph.links.find(e => e.source === choiceGraphId('start', 'a'));
  assert.equal(route.target, exitGraphId('leave-room'));
  const unplugged = unplugStoryConnections(result.document, layout, [route.id]);
  assert.equal(unplugged.document.nodes.start.choices[0].exit, undefined);
  assert.equal(unplugged.document.nodes.start.choices[0].goto, undefined);
});

test('ownership cables move a choice without duplicating it or losing its response; incompatible sockets refuse changes', () => {
  const { document, layout } = patchFixture();
  const result = patchStoryConnection(document, layout, { source: 'other', sourceHandle: 'choices', target: choiceGraphId('start', 'a'), targetHandle: 'owner' });
  assert.equal(result.document.nodes.start.choices, undefined);
  assert.deepEqual(result.document.nodes.other.choices, document.nodes.start.choices);
  assert.ok(result.document.nodes.answer);
  for (const connection of [
    { source: 'start', sourceHandle: 'goto', target: 'answer' },
    { source: 'answer', sourceHandle: 'exit', target: 'other' },
    { source: choiceGraphId('start', 'a'), sourceHandle: 'route', target: choiceGraphId('start', 'a') },
  ]) assert.equal(patchStoryConnection(document, layout, connection).changed, false);
});

test('moving a cable source replaces its old route and keeps the destination route in one transaction', () => {
  const { document, layout } = patchFixture();
  const old = `${choiceGraphId('start', 'a')}:route`;
  const result = reconnectStoryConnection(document, layout, old, { source: 'other', sourceHandle: 'goto', target: 'answer', targetHandle: 'in' });
  assert.equal(result.changed, true);
  assert.equal(result.document.nodes.other.goto, 'answer');
  assert.equal(result.document.nodes.start.choices[0].goto, undefined);
  assert.equal(document.nodes.start.choices[0].goto, 'answer', 'the history snapshot is unchanged');
  const returned = reconnectStoryConnection(document, layout, old, { source: choiceGraphId('start', 'a'), sourceHandle: 'route', target: 'start', targetHandle: 'in' });
  assert.equal(returned.document.nodes.start.choices[0].goto, 'start', 'moving only the destination retains the replacement');
  document.nodes.other.goto = 'answer';
  const merged = reconnectStoryConnection(document, layout, old, { source: 'other', sourceHandle: 'goto', target: 'answer', targetHandle: 'in' });
  assert.equal(merged.changed, true, 'moving onto an already matching outlet still removes the old source route');
  assert.equal(merged.document.nodes.start.choices[0].goto, undefined);
  assert.equal(merged.document.nodes.other.goto, 'answer');
});

test('named end event and plain completion have distinct terminals; patch geometry survives serialization', () => {
  const { document, layout } = patchFixture();
  layout.exits = { [exitGraphId('end')]: { event: 'end' } };
  layout.positions = { [choiceGraphId('start', 'a')]: { x: 612, y: 240 }, [exitGraphId('end')]: { x: 1200, y: 240 } };
  const roundTrip = JSON.parse(JSON.stringify(layout));
  assert.deepEqual(roundTrip, layout);
  const graph = buildSceneGraph(document, { splitChoices: true, exits: roundTrip.exits });
  assert.notEqual(exitGraphId(''), exitGraphId('end'));
  assert.ok(graph.boundaries.some(item => item.id === exitGraphId('') && item.event === ''));
  assert.ok(graph.boundaries.some(item => item.id === exitGraphId('end') && item.event === 'end'));
});

test('the actual conversation controller follows an opening return represented by the patch graph', async () => {
  const file = 'src/data/opening-prologue.js';
  const document = documentFor('data/opening-prologue.js', extractModule(await readFile(file, 'utf8'), file));
  const graph = buildSceneGraph(document, { fromCode: true, splitChoices: true });
  const convo = createConversation({ nodes: OPENING_PROLOGUE.nodes, startAt: 'fate', sceneId: 'studio-return-proof', voiceEnabled: false });
  const reachBoard = () => {
    for (let i = 0; i < 200; i++) { const view = convo.view(); if (view.pending?.kind === 'branch') return view; convo.update(20); convo.key({ key: 'Enter' }); }
    assert.fail('No question board');
  };
  try {
    convo.start(); const board = reachBoard();
    const index = board.pending.options.findIndex(c => c.goto === 'f-home'); assert.ok(index >= 0);
    convo.selectChoice(index, { sound: false }); convo.key({ key: 'Enter' }); assert.equal(convo.view().nodeId, 'f-home');
    const returned = reachBoard(); assert.equal(returned.nodeId, 'fate');
    assert.ok(graph.links.some(e => e.source === 'nodes.f-home' && e.target === 'nodes.fate' && e.kind === 'return'));
    assert.ok(!returned.pending.options.some(c => c.goto === 'f-home'), 'the actual spent question is hidden on return');
  } finally { convo.stop(); }
});
