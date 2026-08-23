import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSpeech,
  createSpeechDispatch,
  isSpeaking,
  say,
  speaking,
  speechDispatchSnapshot,
  speechInit,
  updateSpeech,
} from '../src/game/speech.js';

let now = 0;
let room = 'get-in';
speechInit({ now: () => now, context: () => room });

test.beforeEach(() => {
  clearSpeech();
  now = 0;
  room = 'get-in';
});

test('an escaped action cancels its current line and dependent tail atomically', () => {
  const action = createSpeechDispatch({ id:'inspect:desk' });
  action.sayAll([
    { who:'you', text:'The drawer sticks.' },
    { who:'direction', text:'Inside it, a key turns over.' },
  ]);
  updateSpeech(.016);
  assert.equal(speaking()?.text, 'The drawer sticks.');

  action.cancel();
  assert.equal(isSpeaking(), false);
  assert.equal(speechDispatchSnapshot().queued.length, 0);
});

test('leaving the originating room drops the active thought and its chain', () => {
  const action = createSpeechDispatch({ id:'action:valve' });
  action.sayAll([
    { who:'direction', text:'The wheel begins to move.' },
    { who:'you', text:'That is enough pressure.' },
  ]);
  updateSpeech(.016);
  room = 'corridor';
  updateSpeech(.016);
  assert.equal(isSpeaking(), false);
  assert.equal(speechDispatchSnapshot().dispatches.length, 0);
});

test('an unstarted stale event expires instead of surfacing after the action', () => {
  say({ who:'you', text:'Old handling note.' }, { maxWaitMs:100 });
  now = 101;
  updateSpeech(.016);
  assert.equal(isSpeaking(), false);
});

test('a repeated action supersedes an older firing of the same family', () => {
  const oldAction = createSpeechDispatch({ id:'mark-room' });
  oldAction.say({ who:'you', text:'Studio B2. Marked.' });
  const newAction = createSpeechDispatch({ id:'mark-room' });
  newAction.say({ who:'you', text:'Studio B3. Marked.' });
  updateSpeech(.016);
  assert.equal(speaking()?.text, 'Studio B3. Marked.');
});

test('authored delay is owned by the dispatch clock, not a free timer', () => {
  const action = createSpeechDispatch({ id:'door-settle' });
  action.say({ who:'direction', text:'The closer takes the weight.' }, { delayMs:250 });
  now = 249;
  updateSpeech(.016);
  assert.equal(speaking(), null);
  assert.equal(isSpeaking(), true, 'the valid delayed event remains pending');
  now = 250;
  updateSpeech(.016);
  assert.equal(speaking()?.text, 'The closer takes the weight.');
});

test('the queue cap counts authored moments rather than amputating a long chain', () => {
  const action = createSpeechDispatch({ id:'earned-debrief' });
  action.sayAll(Array.from({ length:7 }, (_, index) => ({ who:'you', text:`beat ${index + 1}` })));
  const heard = [];
  for(let guard=0;guard<40&&isSpeaking();guard++){
    updateSpeech(20);
    const line=speaking()?.text;
    if(line&&heard[heard.length-1]!==line)heard.push(line);
  }
  assert.deepEqual(heard, ['beat 1','beat 2','beat 3','beat 4','beat 5','beat 6','beat 7']);
});
