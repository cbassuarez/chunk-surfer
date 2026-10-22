import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isVoiced, profileFor } from '../src/audio/sam-voice.js';
import { transcriptBlocks, transcriptSource } from '../src/render/transcript.js';
import { freshStoryArtShotState, resolveStoryArtShot } from '../src/game/story-art-shot.js';
import { flagTest } from '../src/game/flags.js';
import { makeThoughtScene } from '../src/game/thoughts.js';
import * as scenes from '../src/game/scenes.js';

// Run the actual dispatch/presenter code with a mouth spy. This verifies the
// speaker reaching audio.start, rather than merely inspecting profile names.
function loadGame(file, exports, extra = {}) {
  const starts = [], panels = [];
  const source = readFileSync(new URL(`../src/game/${file}.js`, import.meta.url), 'utf8')
    .replace(/^import\b[\s\S]*?;\n/gm, '')
    .replace(/\bexport (?=(?:function|const|let|class)\b)/g, '');
  const globals = {
    performance, setTimeout, clearTimeout, console,
    createSamDialogVoice: () => ({
      warm() {}, stop() {},
      start(text, options) {
        starts.push({ text, ...options });
        return { done: () => true, progress: () => 1, stop() {}, finish() {} };
      },
    }),
    isVoiced, textCps: value => value, TYPE_GAIN: 1, TYPE_LEVEL: {},
    freshStoryArtShotState, resolveStoryArtShot, flagTest,
    uiSize: () => ({ cols: 112, rows: 48 }),
    uiWrap: text => [String(text)], uiText() {},
    withMachinePanel: (x, y, w, h, options) => panels.push(options),
    ...extra,
  };
  const api = runInNewContext(`${source}\n;({${exports.join(',')}})`, globals);
  return { ...api, starts, panels };
}

const guests = ['celeste', 'emile', 'odette', 'lucien', 'agathe', 'noe', 'sabine'];

test('conversation voice overrides retain ghost identities and player permission to speak', () => {
  const { createConversation, starts } = loadGame('conversation', ['createConversation']);
  const convo = createConversation({ nodes: { start: { lines: [
    { who: 'unknown', voiceSpeaker: 'society-celeste', sourceLabel: 'CELESTE', text: 'You kept his place.' },
    { who: 'unknown', voiceSpeaker: 'society-emile', sourceLabel: 'EMILE', text: 'I kept hers.' },
    { who: 'me', voiceSpeaker: 'me', sourceLabel: 'YOU', text: 'Welcome back.' },
  ] } } });
  convo.start();
  assert.equal(starts[0].speaker, 'society-celeste');
  assert.equal(convo.view().who, 'unknown', 'voice identity does not replace the dialogue role');
  convo.update(1);
  convo.key({ key: 'Enter' });
  assert.equal(starts[1].speaker, 'society-emile');
  assert.equal(convo.view().history[0].sourceLabel, 'CELESTE');
  convo.update(1);
  convo.key({ key: 'Enter' });
  assert.equal(convo.view().pending.kind, 'say');
  assert.equal(starts.length, 2, 'borrowed player speech still awaits permission');
  assert.equal(convo.view().history[1].sourceLabel, 'EMILE');
  convo.key({ key: 'Enter' });
  assert.equal(starts[2].speaker, 'me', 'the borrowed mouth uses the exact existing player profile');
  convo.stop();
});

test('nonblocking speech passes each opt-in name and voice while keeping legacy defaults', () => {
  const speech = loadGame('speech', ['say', 'updateSpeech', 'drawSpeech', 'clearSpeech', 'speaking']);
  for (const guest of guests) {
    speech.clearSpeech();
    speech.say({ who: 'unknown', voiceSpeaker: `society-${guest}`, sourceLabel: guest.toUpperCase(), text: 'Do sit with us.' });
    speech.updateSpeech(.016);
    speech.drawSpeech();
    assert.equal(speech.starts.at(-1).speaker, `society-${guest}`);
    assert.equal(speech.panels.at(-1).source, guest.toUpperCase());
    assert.equal(speech.speaking().who, 'unknown');
  }
  speech.clearSpeech();
  speech.say({ who: 'guard', text: 'Sign here.' });
  speech.updateSpeech(.016);
  speech.drawSpeech();
  assert.equal(speech.starts.at(-1).speaker, 'guard');
  assert.equal(speech.panels.at(-1).source, 'GUARD');
  const count = speech.starts.length;
  for (const line of [
    { who: 'unknown', voiceSpeaker: 'society-celeste', voice: false, text: 'Silent caption.' },
    { who: 'you', voiceSpeaker: 'society-celeste', text: 'An internal thought.' },
  ]) {
    speech.clearSpeech(); speech.say(line); speech.updateSpeech(.016);
  }
  assert.equal(speech.starts.length, count, 'metadata cannot turn silent or internal lines into voices');
  speech.clearSpeech();
});

test('named voices have distinct profiles and the player profile stays exact', () => {
  const profiles = guests.map(guest => {
    const id = `society-${guest}`;
    assert.equal(isVoiced(id), true);
    const profile = profileFor(id);
    assert.notEqual(profile, profileFor('missing-speaker'));
    assert.ok(profile.lp >= 3800, 'society dialogue retains an intelligible upper band');
    return JSON.stringify(profile);
  });
  assert.equal(new Set(profiles).size, 7);
  assert.deepEqual(profileFor('me'), { rate: 1, gain: 1, hp: 90, lp: 6000 });
});

test('caption names survive history and keep reciprocal ghosts in separate transcript groups', () => {
  const blocks = transcriptBlocks({
    history: [
      { who: 'unknown', sourceLabel: 'CELESTE', text: 'His chair.', serial: 1 },
      { who: 'unknown', sourceLabel: 'EMILE', text: 'Her chair.', serial: 2 },
    ],
    who: 'unknown', line: { text: 'My chair.', sourceLabel: 'ODETTE' }, typed: 9, lineSerial: 3,
  });
  assert.deepEqual(blocks.map(block => block.speaker), ['CELESTE', 'EMILE', 'ODETTE']);
  assert.ok(blocks.every(block => block.role.side === 'left'));
  const player = transcriptBlocks({ who: 'me', line: { text: 'Welcome.', sourceLabel: 'YOU' }, typed: 8 });
  assert.equal(player[0].role.side, 'right');
  const legacy = transcriptBlocks({ who: 'unknown', line: { text: 'Stay.' }, typed: 5 });
  assert.equal(legacy[0].speaker, 'UNKNOWN');
});

test('thought monitor shows the current ghost name and keeps unsaid player choices local', () => {
  let view = { who: 'unknown', line: { sourceLabel: 'CELESTE' } };
  const thought = loadGame('thoughts', ['makeThoughtScene'], {
    createConversation: () => ({ view: () => view }),
    uiScrim() {}, scenes: {}, transcriptSource, promptLine: () => 'CONTINUE',
    layoutTranscriptChoices: () => ({ height: 0 }),
    resolveStoryArt: () => null,
  });
  const scene = thought.makeThoughtScene({ nodes: {} });
  for (const guest of guests) {
    view = { who: 'unknown', line: { sourceLabel: guest.toUpperCase() } };
    scene.render();
    assert.equal(thought.panels.at(-1).source, guest.toUpperCase());
  }
  view = { who: 'me', line: { sourceLabel: 'CELESTE' }, pending: { kind: 'say' } };
  scene.render();
  assert.equal(thought.panels.at(-1).source, 'LOCAL');
  view = { who: 'guard' };
  scene.render();
  assert.equal(thought.panels.at(-1).source, 'RX');
});


test('external removal releases a dialogue once; completion and Escape keep distinct outcomes', () => {
  for (const action of ['remove', 'clear', 'complete', 'escape']) {
    scenes.clear();
    let completed = 0, cancelled = 0, exited = 0;
    const scene = makeThoughtScene({
      id: `society-lease-${action}`,
      nodes: { start: { lines: [{ who: 'direction', text: 'The reception waits.', voice: false }] } },
      onDone: () => completed++, onCancel: () => cancelled++, onExit: () => exited++,
    });
    scenes.push(scene);
    if (action === 'complete') { scene.update(1); scene.key({ key: 'Enter' }); }
    else if (action === 'escape') scene.key({ key: 'Escape' });
    else if (action === 'clear') scenes.clear();
    else scenes.remove(scene);
    scenes.remove(scene);
    assert.equal(scenes.depth(), 0, action);
    assert.equal(exited, 1, action);
    assert.equal(completed, action === 'complete' ? 1 : 0, action);
    assert.equal(cancelled, action === 'complete' ? 0 : 1, action);
  }
});
