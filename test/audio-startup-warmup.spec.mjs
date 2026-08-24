import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cuesInit, preloadAll } from '../src/audio/cues.js';

test('authored cue warming never floods the decoder pool', async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let peak = 0;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  cuesInit({
    decodeAudioData: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return {};
    },
  }, {});
  try {
    const results = await preloadAll(['cue-a', 'cue-b', 'cue-c', 'cue-d', 'cue-e'], { concurrency: 2 });
    assert.equal(results.length, 5);
    assert.ok(peak <= 2, `decoder concurrency stays at two (observed ${peak})`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startup warms the playable opening before the wider game corpus', () => {
  const story = readFileSync('src/audio/story-audio.js', 'utf8');
  assert.match(story, /export function preloadOpeningAudio\(\)/);
  for (const token of [
    'STORY_AUDIO.title',
    'STORY_AUDIO.openingBed',
    'STORY_AUDIO.rain',
    'STORY_AUDIO.booth',
    'STORY_AUDIO.typing',
  ]) assert.match(story, new RegExp(token.replace('.', '\\.')));

  const main = readFileSync('src/main.js', 'utf8');
  const start = main.indexOf('function warmGameAudio()');
  const end = main.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start, 'priority warmup function can be located');
  const body = main.slice(start, end);
  const opening = body.indexOf('preloadOpeningAudio');
  const cues = body.indexOf('CUES.preloadAll');
  const props = body.indexOf('preloadPropStems');
  const battle = body.indexOf('preloadBattleMusic');
  assert.ok(opening >= 0 && opening < cues && cues < props && props < battle,
    'opening audio, bounded cues, instruments, and battle score warm in that order');
  assert.doesNotMatch(main.slice(main.indexOf('function ensureCtx'), start),
    /CUES\.preloadAll|preloadBattleMusic\(\)|preloadPropStems\(\)|STORY\.preloadAll\(\)/,
    'AudioContext construction no longer launches the bulk decodes independently');
});

