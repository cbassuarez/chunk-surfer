import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyMutations, evaluateCondition, interpolateStoryText } from '../src/narrative/conditions.js';
import { createNarrativeExecutor } from '../src/narrative/executor.js';
import { reachableNodeIds, validateAudioProject, validateMediaProject, validateNarrativeDocument, validateProjectManifest } from '../src/narrative/contracts.js';
import { createCuePlayer } from '../src/audio/cue-player.js';
import { authoredCue, dispatchAuthoredCue } from '../src/audio/authored-cues.js';
import { COLD_OPEN_DIALOGUE, sacrificeEnding, rescueEnding, helpedEnding, druggedReveal, guardEpilogue } from '../src/data/conservatory-script.js';
import { natatoriumBattle, practiceBattle, hallBattle, chapelBoss } from '../src/data/battles.js';
import { rehydrateBattle, rehydrateTree, runtimeBattle, runtimeCuesForLine, runtimeTree } from '../src/narrative/runtime-content.js';
import { authoringMedia, authoringNarrative, authoringProject, authoringRegistryPaths } from '../src/narrative/generated-content.js';
import { STORY_ART } from '../src/game/story-art.js';

assert.equal(evaluateCondition('met && keys>=3', { met: true, keys: 3 }), true);
assert.equal(evaluateCondition('missing || keys<2', { keys: 3 }), false);
assert.equal(interpolateStoryText('{steps} steps in {room.name}.', { steps: 12, room: { name: 'the hall' } }), '12 steps in the hall.');
assert.deepEqual(applyMutations({ flags: { old: true } }, { set: ['ending.choice=inversion', 'keys=3'], clear: ['old'] }).flags,
  { old: false, 'ending.choice': 'inversion', keys: 3 });

const fixture = {
  schemaVersion: 1, id: 'test.story', title: 'Test', status: 'active', entry: 'start', regions: [],
  nodes: {
    start: { id: 'start', type: 'choice', lines: [{ id: 'start.line.1', text: 'Choose.', cues: ['pens'] }], choices: [
      { id: 'start.choice.a', text: 'A', goto: 'end', mutations: { set: ['picked=a'] } },
      { id: 'start.choice.hidden', text: 'Hidden', goto: 'end', when: 'unlock' },
    ] },
    end: { id: 'end', type: 'ending', lines: [{ id: 'end.line.1', text: 'Done {picked}.' }] },
  },
};
assert.equal(validateNarrativeDocument(fixture).ok, true);
assert.equal(validateNarrativeDocument(fixture, { cueIds: new Set(['pens']), mediaIds: new Set(['guard']) }).ok, true);
assert.deepEqual([...reachableNodeIds(fixture)].sort(), ['end', 'start']);
const executor = createNarrativeExecutor(fixture, { flags: {} });
executor.advance();
assert.deepEqual(executor.view().choices.map((choice) => choice.id), ['start.choice.a']);
assert.ok(executor.view().events.some((event) => event.type === 'cue' && event.cueId === 'pens'));
executor.choose('start.choice.a');
assert.equal(executor.view().context.flags.picked, 'a');
executor.advance();
assert.equal(executor.view().finished, true);

const dangling = structuredClone(fixture);
dangling.nodes.start.choices[0].goto = 'missing';
assert.equal(validateNarrativeDocument(dangling).ok, false);
const invalidAuthoring = structuredClone(fixture);
delete invalidAuthoring.nodes.end.lines[0].id;
invalidAuthoring.nodes.start.when = 'flags. &&';
invalidAuthoring.nodes.start.lines[0].cues = ['missing-cue'];
invalidAuthoring.nodes.start.lines[0].art = { id: 'missing-art' };
const invalidResult = validateNarrativeDocument(invalidAuthoring, { cueIds: new Set(['pens']), mediaIds: new Set(['guard']) });
assert.equal(invalidResult.ok, false);
assert.ok(invalidResult.errors.some((item) => item.path.endsWith('.id')));
assert.ok(invalidResult.errors.some((item) => item.message.includes('unknown cue')));
assert.ok(invalidResult.errors.some((item) => item.message.includes('unknown media')));

const authored = JSON.parse(await readFile('content/narrative/conservatory.cold_open_dialogue.story.json', 'utf8'));
assert.equal(Object.keys(authored.nodes).length, Object.keys(COLD_OPEN_DIALOGUE).length, 'cold-open import preserves every runtime node');
for (const id of Object.keys(COLD_OPEN_DIALOGUE)) assert.ok(authored.nodes[id], `missing imported cold-open node ${id}`);

for (const [name, factory] of [['natatoriumbattle', natatoriumBattle], ['practicebattle', practiceBattle], ['hallbattle', hallBattle]]) {
  for (const named of [false, true]) {
    const legacy = factory(named);
    const migrated = runtimeBattle(`battle.${name}.${named ? 'named' : 'unnamed'}`);
    assert.equal(migrated.id, legacy.id);
    assert.equal(migrated.enemy, legacy.enemy);
    assert.equal(migrated.rounds.length, (legacy.rounds || []).length);
    assert.deepEqual(migrated.rounds.map((round) => round.onListen.length), (legacy.rounds || []).map((round) => (round.onListen || []).length));
    assert.deepEqual(migrated.win, legacy.win);
    assert.deepEqual(migrated.lose, legacy.lose);
  }
}
const radioRuntime = runtimeTree('radio.pre_third_room_breakdown', { ROOMLABEL: 'THE CONCERT HALL' });
assert.match(JSON.stringify(radioRuntime), /THE CONCERT HALL/);
const roomRuntime = runtimeTree('room-listen.main_b3', { label: 'The Concert Hall' });
assert.match(JSON.stringify(roomRuntime), /The Concert Hall/);

const readStory = async (id) => JSON.parse(await readFile(`content/narrative/${id}.story.json`, 'utf8'));
for (const named of [false, true]) for (const injuries of [0, 2, 5]) {
  const id = `ending.sacrifice.${named ? 'named' : 'unnamed'}.injuries-${injuries}`;
  assert.deepEqual(rehydrateTree(await readStory(id)).start.lines, sacrificeEnding({ named, injuries }), id);
}
for (const named of [false, true]) {
  assert.deepEqual(rehydrateTree(await readStory(`ending.rescue.${named ? 'named' : 'unnamed'}`)).start.lines, rescueEnding(named));
  assert.deepEqual(rehydrateTree(await readStory(`ending.helped.${named ? 'named' : 'unnamed'}`)).start.lines, helpedEnding({ named }));
}
assert.deepEqual(rehydrateTree(await readStory('ending.drugged.complete')).start.lines, druggedReveal({ takes: 5 }));
assert.deepEqual(rehydrateTree(await readStory('ending.drugged.partial')).start.lines, druggedReveal({ takes: 4 }));
for (const variant of ['out', 'client', 'nobody', 'helped', 'drugged']) assert.deepEqual(rehydrateTree(await readStory(`ending.epilogue.${variant}`)).start.lines, guardEpilogue(variant));
for (const fixture of [
  ['nothing', { kind: 'nothing' }], ['name-sarah', { kind: 'name', value: 'Sarah' }],
  ['reason-money', { kind: 'reason', value: 'money' }], ['feeling', { kind: 'feeling', value: 'dread' }],
]) {
  const migrated = rehydrateBattle(await readStory(`battle.chapel.${fixture[0]}`));
  const legacy = chapelBoss(fixture[1]);
  assert.equal(migrated.enemy, legacy.enemy); assert.equal(migrated.rounds.length, legacy.rounds.length); assert.deepEqual(migrated.win, legacy.win);
}

const audio = JSON.parse(await readFile('content/audio/audio-project.audio.json', 'utf8'));
assert.equal(validateAudioProject(audio).ok, true);
const badAudio = structuredClone(audio);
badAudio.cues[0].layers[0].trimStart = 5;
badAudio.cues[0].layers[0].trimEnd = 1;
assert.equal(validateAudioProject(badAudio).ok, false);
const media = JSON.parse(await readFile('content/media/story-art.media.json', 'utf8'));
assert.equal(validateMediaProject(media).ok, true);
assert.equal(STORY_ART.guard.caption, 'Gate booth / Ellery Conservatory');
assert.equal(STORY_ART.surfer.src, null);
assert.equal(authoringMedia[0].id, 'story-art');
assert.equal(authoringNarrative.length, authoringProject.narrative.length);
assert.equal(authoringRegistryPaths.media[0], 'media/story-art.media.json');
assert.equal(validateProjectManifest(authoringProject, { documents: authoringNarrative, documentIds: authoringNarrative.map((doc) => doc.id) }).ok, true);
assert.deepEqual(runtimeCuesForLine('conservatory.cold_open_dialogue', {id:'start.line.7'}), ['pens'], 'audio-project event triggers drive runtime story lines');
assert.ok(audio.assets.length >= 300, 'complete sample bank is indexed');
assert.equal(authoredCue('pens').layers[0].gain, .62);
assert.deepEqual(authoredCue('door').effects, ['story:stop-booth']);
const playback = [], effects = [], acoustics = [];
assert.equal(dispatchAuthoredCue('squelch', {
  play: (url, options) => playback.push({ url, options }),
  effect: (event) => effects.push(event), acoustic: (event) => acoustics.push(event),
}), true);
assert.equal(playback[0].options.rate, .4);
assert.equal(acoustics[0].kind, 'radio_squelch');
assert.ok(effects.includes('fear:bump:.22:.5'));

const automationCalls = [];
const fakeParam = () => ({
  value: 1,
  cancelScheduledValues: (time) => automationCalls.push(['cancel', time]),
  setValueAtTime: (value, time) => automationCalls.push(['set', value, time]),
  linearRampToValueAtTime: (value, time) => automationCalls.push(['ramp', value, time]),
});
const fakeContext = {
  currentTime: 10,
  destination: { connect() {} },
  createBufferSource: () => ({ playbackRate: fakeParam(), detune: fakeParam(), connect() {}, start() {}, stop() {} }),
  createGain: () => ({ gain: fakeParam(), connect() {} }),
  createStereoPanner: () => ({ pan: fakeParam(), connect() {} }),
};
const player = createCuePlayer({ context: fakeContext, destination: fakeContext.destination, loadBuffer: async () => ({ duration: 3 }) });
await player.play({ id: 'automation-test', layers: [{ id: 'automation-test.layer.1', assetId: 'asset', automation: [{ parameter: 'gain', points: [{ time: 0, value: .25 }, { time: .5, value: .75 }] }] }] }, new Map([['asset', { id: 'asset', kind: 'file', path: 'x.wav' }]]));
assert.ok(automationCalls.some((call) => call[0] === 'ramp' && call[1] === .75 && call[2] === 10.5));

console.log('narrative studio contracts tests ok');
