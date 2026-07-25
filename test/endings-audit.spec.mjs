// THE ENDINGS AUDIT.
//
// Five terminal ids: sacrifice, helped, inversion, drugged, surfaced. What this
// file defends is that they are all still REACHABLE, that they are reached by the
// things the design says reach them, and — the failure that actually happened —
// that nothing quietly collapses them into one.
//
// The collapse to watch for is structural rather than textual. `finishCombat`
// grants `route.*` for whichever chapel proof you landed and LOCKS the complement
// (locks = !grants), and `openEndingChoice` checks `grant && !lock`. So a route
// granted anywhere OTHER than the chapel fight is dead on arrival — the lock
// follows it in the same breath. That is exactly what happened when the grey door
// started granting `route.inversion`, and it is why qualification is now
// two-track (see canInvertEnding in main.js).
//
// The cold open is audited too, because it is the one scene that runs before the
// player knows anything: it must be able to commit at most the things we chose,
// and must not touch a route flag at all.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const story = (id) => JSON.parse(readFileSync(`content/narrative/${id}.story.json`, 'utf8'));
const mutationsOf = (doc) => {
  const out = [];
  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    const push = (m, where) => {
      for (const entry of m?.set || []) out.push({ nodeId, where, flag: String(entry).split('=')[0], entry });
      for (const entry of m?.clear || []) out.push({ nodeId, where, flag: String(entry), entry, clear: true });
    };
    push(node.mutations, 'node');
    for (const choice of node.choices || []) push(choice.mutations, 'choice');
  }
  return out;
};

// ── the cold open commits exactly three kinds of thing ──────────────────────
const cold = mutationsOf(story('conservatory.cold_open_dialogue'));
assert.ok(cold.length > 20, 'the cold open still has its branching');

const ALLOWED_COLD_PREFIXES = ['cold.', 'prologue.knowledge.', 'has.coffee'];
for (const m of cold) {
  assert.ok(
    ALLOWED_COLD_PREFIXES.some((p) => m.flag === p || m.flag.startsWith(p)),
    `the cold open must not commit "${m.flag}" (${m.nodeId}/${m.where}) — it runs before the player knows anything`,
  );
}
// The three things it is allowed to decide, spelled out so a new one is a choice
// somebody made on purpose rather than a flag that leaked in.
const coldFlags = new Set(cold.map((m) => m.flag));
assert.ok(coldFlags.has('has.coffee'), 'the coffee is offered in the booth');
assert.ok(coldFlags.has('prologue.knowledge.self'), 'and the framing is chosen there');

// NOTHING in the cold open touches a route, a grant, a lock, or an ending.
for (const m of cold) {
  assert.ok(!/^finale\./.test(m.flag), `the cold open must not set finale state (${m.flag})`);
  assert.ok(!/^route\./.test(m.flag), `the cold open must not unlock a route (${m.flag})`);
  assert.ok(m.flag !== 'ending.choice', 'the cold open must not pick an ending');
  assert.ok(m.flag !== 'drank.coffee', 'taking the coffee is not drinking it — that is a second, later decision');
  assert.ok(!/^confession\./.test(m.flag), 'the confession is not made in the booth');
}

// The framings are mutually exclusive: each one clears the other two, so the
// post-door beat can never be in two frames at once.
const frames = ['self', 'guard', 'tape'];
for (const frame of frames) {
  const setter = cold.find((m) => m.flag === `prologue.knowledge.${frame}` && !m.clear);
  assert.ok(setter, `${frame} framing is reachable`);
  const doc = story('conservatory.cold_open_dialogue');
  const node = doc.nodes[setter.nodeId];
  const choice = (node.choices || []).find((c) => (c.mutations?.set || []).includes(`prologue.knowledge.${frame}`));
  const cleared = choice.mutations.clear || [];
  for (const other of frames.filter((f) => f !== frame)) {
    assert.ok(cleared.includes(`prologue.knowledge.${other}`), `choosing ${frame} clears ${other}`);
  }
}

// ── the ending choice trees have not lost a route ───────────────────────────
// The variant is picked in code (openEndingChoice → endingChoice), so each tree
// must actually offer what its name promises, or a qualified player is silently
// handed a smaller ending.
const routeOf = { sacrifice: 'feed', inversion: 'invert', surfaced: 'surface' };
const expected = {
  'ending.choice.base': ['sacrifice'],
  'ending.choice.rig': ['sacrifice', 'inversion'],
  'ending.choice.surface': ['sacrifice', 'surfaced'],
  'ending.choice.all': ['sacrifice', 'inversion', 'surfaced'],
};
for (const [id, routes] of Object.entries(expected)) {
  const doc = story(id);
  const offered = new Set();
  for (const node of Object.values(doc.nodes)) {
    for (const choice of node.choices || []) {
      for (const entry of choice.mutations?.set || []) {
        const [flag, value] = String(entry).split('=');
        if (flag === 'ending.choice') offered.add(value);
      }
    }
  }
  assert.deepEqual([...offered].sort(), [...routes].sort(), `${id} offers exactly ${routes.join(' + ')}`);
  // Refusing must never be a dead end: every tree's "refuse" node still leads
  // somewhere that commits.
  const nothing = doc.nodes.nothing;
  if (nothing) {
    assert.ok((nothing.choices || []).length > 0, `${id}: refusing to author is not a soft-lock`);
  }
  for (const route of routes) {
    assert.ok(doc.nodes[routeOf[route]], `${id} has a ${route} node to land on`);
  }
}

// ── and the endings themselves still exist ──────────────────────────────────
// Every terminal finishEnding() id needs the tree it presents. A missing document
// throws at runtime, deep in the finale, where nobody would find it.
for (const id of [
  'ending.false-door', 'ending.inversion-start', 'ending.inversion-final',
  'ending.rescue.named', 'ending.rescue.unnamed',
  'ending.helped.named', 'ending.helped.unnamed',
  'ending.drugged.complete', 'ending.drugged.partial',
  'ending.epilogue.out', 'ending.epilogue.client', 'ending.epilogue.nobody',
  'ending.epilogue.helped', 'ending.epilogue.drugged',
]) {
  const doc = story(id);
  assert.ok(Object.keys(doc.nodes).length > 0, `${id} has content`);
}
// The sacrifice ending is per-injury and per-name, and the whole matrix has to be
// there or a five-injury run crashes at the last line of the game.
for (const named of ['named', 'unnamed']) {
  for (let injuries = 0; injuries <= 5; injuries += 1) {
    const doc = story(`ending.sacrifice.${named}.injuries-${injuries}`);
    assert.ok(Object.keys(doc.nodes).length > 0, `sacrifice ${named}/${injuries} exists`);
  }
}

console.log('endings audit passed');
