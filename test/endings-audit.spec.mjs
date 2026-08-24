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

import { ENDING_IDS } from '../src/progression/schema.js';
import { endingCodaVariant } from '../src/data/endings.js';
import { confessionValues } from '../src/game/ending-runtime.js';

const story = (id) => JSON.parse(readFileSync(`content/narrative/${id}.story.json`, 'utf8'));
const mainSource = readFileSync('src/main.js','utf8');
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
  'ending.false-door', 'ending.inversion-start',
  'ending.sacrifice', 'ending.helped', 'ending.surfaced',
  'ending.inversion', 'ending.drugged',
  'ending.arrival.defeated', 'ending.arrival.timed-out',
  'ending.epilogue.out', 'ending.epilogue.client', 'ending.epilogue.nobody',
  'ending.epilogue.helped', 'ending.epilogue.drugged', 'ending.epilogue.surfaced',
]) {
  const doc = story(id);
  assert.ok(Object.keys(doc.nodes).length > 0, `${id} has content`);
}
// THE SACRIFICE USED TO BE TWELVE DOCUMENTS — named × injuries 0–5 — and this
// asserted the whole matrix was on disk, because a five-injury run would
// otherwise crash on the last line of the game. It is one document that reads the
// dossier now, so the guarantee moves: every injury count must still reach a line,
// or the same run ends on a shorter ending than it earned.
{
  const doc = story('ending.sacrifice');
  const conditions = (doc.nodes.start.lines || []).map((l) => l.when).filter(Boolean);
  for (let injuries = 0; injuries <= 5; injuries += 1) {
    const reached = conditions.some((c) => c === `ending.injuries==${injuries}`)
      || (injuries === 0 && conditions.includes('ending.untouched'))
      || (injuries >= 5 && conditions.some((c) => /ending\.injuries>=\d/.test(c)));
    assert.ok(reached, `a run with ${injuries} injuries still gets its own line`);
  }
  // And every disclosure the game can actually reach has a reply, which is the
  // thing that was broken: only "Sarah" ever changed a word of any ending.
  for (const value of confessionValues()) {
    assert.ok(conditions.includes(`ending.confession.said.${value}`),
      `the sacrifice answers "${value}" — every disclosure is a sentence he said out loud`);
  }
  assert.ok(conditions.includes('ending.confession.nothing'), 'and answers having said nothing');
}

// Every terminal choice hands back to an embodied world action before its final
// text: walk the surfaced route, touch the chapel screen to stay, or run the
// inversion from the chapel where the choice was actually made.
assert.match(mainSource,/escape=\{kind:'surfaced',stage:'public-doors'/,'surfaced carries Alan through the public exit');
assert.match(mainSource,/escape\.stage='service-road'/,'surfaced continues down the service road');
assert.match(mainSource,/sign-returned-alan/,'surfaced ends only after both names reach RETURNED');
assert.match(mainSource,/escape=\{kind:'stay',stage:'commit'/,'sacrifice and helped require the chapel-screen commitment');
assert.match(mainSource,/escape=\{ kind:'inversion',stage:'door'/,'inversion retains the playable two-door escape');

// The early Scene Dock choice and the late ending choice are separate verbs.
// Touching the vanished goods door teaches the route; it does not choose an
// ending. At the Chapel, a player still needs the bent rig and must explicitly
// choose the inversion. A combat proof remains the second authored way to learn
// that route.
{
  const touchStart=mainSource.indexOf('function tryTheGreyDoor');
  const touchEnd=mainSource.indexOf('function postDoorThought',touchStart);
  const touch=mainSource.slice(touchStart,touchEnd);
  assert.match(touch,/opening\.postDoor\.started/,'only the inside-door interaction starts the search beat');

  const thoughtStart=touchEnd;
  const thoughtEnd=mainSource.indexOf('\nfunction ',thoughtStart+1);
  const thought=mainSource.slice(thoughtStart,thoughtEnd);
  assert.match(thought,/door\.grey\.searched=/,'completing the beat records knowledge of the missing exit');
  assert.doesNotMatch(thought,/finale\.grant\.route\.inversion/,
    'the early beat records knowledge rather than forging a Chapel combat proof');

  const qualifyStart=mainSource.indexOf('function canInvertEnding');
  const qualifyEnd=mainSource.indexOf('\nfunction ',qualifyStart+1);
  const qualify=mainSource.slice(qualifyStart,qualifyEnd);
  assert.match(qualify,/if\(!flagTest\('has\.interface'\)\) return false/,'the bent rig remains required');
  assert.match(qualify,/proven \|\| learned/,'combat proof or the deliberate door search can qualify inversion');

  const choiceStart=mainSource.indexOf('function openEndingChoice');
  const choiceEnd=mainSource.indexOf('\nfunction ',choiceStart+1);
  const choice=mainSource.slice(choiceStart,choiceEnd);
  assert.match(choice,/endingChoice\(\{/,'the route is still offered at the explicit Chapel ending board');
}
// WHICH GATE SCENE CLOSES AN ENDING MOVED INTO THE CONTRACT.
//
// It was a five-branch ternary in finishEnding that no ending could see. The
// guarantee is the same one and it is asserted at its new home: every terminal id
// resolves to a distinct authored coda, and staying with nothing disclosed still
// gets the one gate scene the player is not in.
assert.equal(endingCodaVariant('surfaced'),'surfaced','surfaced reaches its two-person gate epilogue');
assert.equal(endingCodaVariant('inversion'),'out');
assert.equal(endingCodaVariant('helped'),'helped');
assert.equal(endingCodaVariant('drugged'),'drugged');
assert.equal(endingCodaVariant('sacrifice',{confession:{kind:'nothing'}}),'nobody');
assert.equal(endingCodaVariant('sacrifice',{confession:{kind:'reason'}}),'client');
{
  const codas=new Set(ENDING_IDS.map((id)=>endingCodaVariant(id,{confession:{kind:'name'}})));
  assert.equal(codas.size,ENDING_IDS.length,'no two endings share a gate scene');
}
assert.doesNotMatch(mainSource,/THE PLANT ROOM · REVERSED/,'the inversion no longer claims to teleport to the plant room');

console.log('endings audit passed');
