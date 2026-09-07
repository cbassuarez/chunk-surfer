import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import { makeColdOpenScene } from '../src/game/coldopen.js';

const clearScenes = () => { while (scenes.depth()) scenes.pop(); };
test.afterEach(clearScenes);

test('a cinematic line waits for its physical action without speaking, ageing, or triggering twice', () => {
  let actionStarts = 0;
  let typingStarts = 0;
  let completed = 0;
  const action = { id: 'ending-action:contact-won', blocksInput: true, key: () => true };
  const hold = { id: 'ending-hold:contact-won', blocksInput: true };
  const finale = makeColdOpenScene({
    id: 'finale', ambient: false, worldUnderlay: true,
    beats: [
      { sourceId: 'start.line.6', text: 'Recorder in hand.', voice: false },
      { sourceId: 'start.line.7', text: 'Open channel.', voice: false },
    ],
    audio: { startTyping: () => { typingStarts += 1; } },
    onLine(line) {
      if (line.sourceId !== 'start.line.7') return;
      actionStarts += 1;
      scenes.push(action);
    },
    onDone() { completed += 1; scenes.push(hold); },
  });

  scenes.push(finale);
  scenes.update(1);
  scenes.key({ key: 'Enter' });
  assert.equal(scenes.top(), action);
  assert.equal(actionStarts, 1);
  assert.equal(typingStarts, 1, 'the transmission does not begin before holding the recorder');
  scenes.update(2);
  assert.equal(finale.view().typed, 0);
  assert.equal(finale.view().lineAge, 0, 'the covered transcript receives no dwell credit');
  scenes.key({ key: 'Enter' });
  assert.equal(completed, 0, 'action input cannot complete the underlying transcript');

  scenes.remove(action);
  scenes.update(1);
  assert.equal(typingStarts, 2, 'the chosen line starts once after the action returns');
  assert.equal(actionStarts, 1, 'resumption does not refire the authored action hook');
  scenes.key({ key: 'Enter' });
  assert.equal(completed, 1);
  assert.equal(scenes.depth(), 1);
  assert.equal(scenes.top(), hold);
  assert.equal(scenes.has('finale'), false, 'the last physical image has no retained transcript');
});

test('a terminal choice removes its own conversation when its callback opens a child scene', () => {
  let completed = 0;
  let childExits = 0;
  const child = { id: 'ending-action', exit() { childExits += 1; } };
  const finale = makeColdOpenScene({
    id: 'finale', ambient: false,
    opening: { start: { lines: [], choices: [{ text: 'Lower the headphones.' }] } },
    onChoice: () => scenes.push(child),
    onDone: () => { completed += 1; },
  });
  scenes.push(finale);
  scenes.key({ key: 'Enter' });

  assert.equal(completed, 1);
  assert.equal(childExits, 0, 'completion must not pop the newly opened action');
  assert.equal(scenes.top(), child);
  assert.equal(scenes.depth(), 1);
  assert.equal(scenes.has('finale'), false);
});

test('aborting a deferred ending releases it without restarting voice or completing a later scene', () => {
  let typingStarts = 0;
  let completed = 0;
  const action = { id: 'ending-action', blocksInput: true };
  const finale = makeColdOpenScene({
    id: 'finale', ambient: false, worldUnderlay: true,
    beats: [{ sourceId: 'last-line', text: 'Still here.', voice: false }],
    audio: { startTyping: () => { typingStarts += 1; } },
    onLine: () => scenes.push(action),
    onDone: () => { completed += 1; },
  });
  scenes.push(finale);
  scenes.remove(finale);
  finale.update(10);
  finale.key({ key: 'Enter' });
  assert.equal(typingStarts, 0);
  assert.equal(completed, 0);
  assert.equal(scenes.top(), action);
});
