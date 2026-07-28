import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversation } from '../src/game/conversation.js';

test('revisited id-less branch choices only mark the exact selected option spent', () => {
  const convo = createConversation({
    sceneId: 'choice-regression',
    nodes: {
      start: {
        speaker: 'GUARD',
        lines: [{ who: 'direction', text: 'Pick one.', voice: false }],
        choices: [
          { text: 'ask about the door', goto: 'start' },
          { text: 'ask about the work order', goto: 'start' },
          { text: 'ask about the recorder', goto: 'start' },
        ],
      },
    },
  });

  convo.start();
  convo.update(1);
  convo.key({ key: ' ' });
  convo.key({ key: ' ' });

  let view = convo.view();
  assert.equal(view.pending.kind, 'branch');
  assert.equal(view.pending.options.length, 3);

  convo.key({ key: 'Enter' });
  view = convo.view();

  assert.equal(view.pending.kind, 'branch');
  assert.equal(view.spent(view.pending.options[0]), true);
  assert.equal(view.spent(view.pending.options[1]), false);
  assert.equal(view.spent(view.pending.options[2]), false);
  assert.notEqual(view.pending.options[0].contentId, view.pending.options[1].contentId);
});

test('an empty terminal node closes the conversation instead of leaving an empty shell', () => {
  let done = 0;
  const convo = createConversation({
    sceneId: 'empty-terminal-regression',
    nodes: {
      start: { lines: [], choices: [{ text: 'leave it alone', goto: 'done' }] },
      done: { lines: [] },
    },
    onDone: () => { done += 1; },
  });
  convo.start();
  assert.equal(convo.view().pending.kind, 'branch');
  convo.key({ key: 'Enter' });
  assert.equal(done, 1);
  assert.equal(convo.view().finished, true);
});
