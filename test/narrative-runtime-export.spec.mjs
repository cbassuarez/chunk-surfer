// The studio's view of dialogue still written in code (scripts/export-runtime-narrative.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractModule, documentFor } from '../scripts/export-runtime-narrative.mjs';
import { validateNarrativeDocument } from '../src/narrative/contracts.js';

const fixture = `
const RUTH = 'Ruth Mallory';
const WHO = Object.freeze({ GUARD: 'the guard' });
const line = (who, text) => ({ who, text });
const r = text => line('ren', text);
const c = (id, text, goto) => ({ id, text, goto });
const lines = (...items) => items;
const n = (actor, lines) => ({ speaker: actor.toUpperCase(), lines: lines.map(x => x) });
export const VOICES = {
  ruth: { id: 'ruth', tree: { start: { lines: lines(
    { who: RUTH, text: 'Mind the gap by the west doors.' },
    { who: 'me', prompt: 'Ask about the rota.', text: 'What is the rota for?' },
  ) } } },
};
export const ROOF = { start: { lines: [r('Turn it over.'), { who: WHO.GUARD, text: 'Not tonight.' }], choices: [c('a', 'Ask again.', 'start'), c('b', 'Leave.', 'done')] } };
export const PARTY = n('odette', ['Still warm.', 'You cannot have been here long.']);
export const SHEET_LINES = ['For the part that would not play.'];
`;

test('lines built through helpers, constants and prompts all reach the studio', () => {
  const nodes = extractModule(fixture, 'src/data/fixture.js');
  const all = [...nodes.values()].flatMap(n => n.lines.map(l => `${l.who}: ${l.text}`));
  const choices = [...nodes.values()].flatMap(n => n.choices.map(c => c.text));
  for (const expected of ['Ruth Mallory: Mind the gap by the west doors.', 'me: What is the rota for?', 'ren: Turn it over.',
    'the guard: Not tonight.', 'ODETTE: Still warm.', 'ODETTE: You cannot have been here long.', 'text: For the part that would not play.'])
    assert.ok(all.includes(expected), `missing ${expected}\n${all.join('\n')}`);
  for (const expected of ['Ask about the rota.', 'Ask again.', 'Leave.']) assert.ok(choices.includes(expected), `missing choice ${expected}`);
  const doc = documentFor('data/fixture.js', nodes);
  assert.equal(doc.readOnly, true); assert.deepEqual(doc.regions, []); assert.equal(doc.module, 'src/data/fixture.js');
  const back = Object.values(doc.nodes).flatMap(n => n.choices || []).find(c => c.text === 'Ask again.');
  assert.ok(back.goto && doc.nodes[back.goto], 'a choice that names a sibling beat links to it');
  assert.equal(validateNarrativeDocument(doc).ok, true);
});

test('text the studio already owns is not listed twice', () => {
  const nodes = extractModule(fixture, 'src/data/fixture.js');
  const doc = documentFor('data/fixture.js', nodes, { canonicalText: new Set(['Turn it over.', 'Leave.']) });
  const texts = Object.values(doc.nodes).flatMap(n => [...n.lines.map(l => l.text), ...(n.choices || []).map(c => c.text)]);
  assert.ok(!texts.includes('Turn it over.') && !texts.includes('Leave.')); assert.ok(texts.includes('Not tonight.'));
});
