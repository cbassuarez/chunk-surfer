import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { transform } from 'esbuild';
import { applyMutations, evaluateCondition, interpolateStoryText } from '../src/narrative/conditions.js';
import { createNarrativeExecutor } from '../src/narrative/executor.js';
import { reachableNodeIds, validateAudioProject, validateMediaProject, validateNarrativeDocument, validateProjectManifest } from '../src/narrative/contracts.js';
import { createCuePlayer } from '../src/audio/cue-player.js';
import { authoredCue, dispatchAuthoredCue } from '../src/audio/authored-cues.js';
import { SOUNDTRACK_GAIN, STORY_GAIN_BASELINES } from '../src/audio/story-audio.js';
import { COLD_OPEN_DIALOGUE, sacrificeEnding, rescueEnding, helpedEnding, druggedReveal, guardEpilogue } from '../src/data/conservatory-script.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
import { validateCombatDefinition } from '../src/game/combat-state.js';
import { rehydrateBattle, rehydrateTree, runtimeBattle, runtimeCuesForLine, runtimeTree } from '../src/narrative/runtime-content.js';
import { authoringMedia, authoringNarrative, authoringProject, authoringRegistryPaths } from '../src/narrative/generated-content.js';
import { STORY_ART } from '../src/game/story-art.js';
import {
  addChoiceWithResponse,
  allocateStoryId,
  attachDetachedAsChoice,
  canMakeLinear,
  detachedStoryNodeIds,
  incomingStoryReferences,
  makeNodeLinear,
  removeChoicePreservingResponse,
  renameStoryNode,
} from '../tools/narrative-studio/src/story-transforms.js';

const studioInspectorSource = await readFile('tools/narrative-studio/src/StoryInspector.tsx', 'utf8');
const studioMainSource = await readFile('tools/narrative-studio/src/main.tsx', 'utf8');
const studioAudioSource = await readFile('tools/narrative-studio/src/AudioWorkspace.tsx', 'utf8');
const studioStyles = await readFile('tools/narrative-studio/src/styles.css', 'utf8');
assert.match(studioInspectorSource, /StoryInspector\(\{[^}]*\bmedia\b/, 'story inspector receives media instead of reading an undefined global');
assert.match(studioMainSource, /import '\.\.\/\.\.\/\.\.\/styles\.css';/, 'studio loads the shared Chunk Surfer stylesheet');
assert.match(studioStyles, /font-family:\s*var\(--cs-mono\)/, 'studio typography comes from Chunk Surfer tokens');
assert.doesNotMatch(studioStyles, /\bInter\b|--cyan|--panel|--ink/, 'studio does not restore its discarded standalone theme');
assert.match(studioStyles, /grid-auto-rows:\s*max-content/, 'timeline rows include their scene cards instead of clipping to the header');
assert.match(studioAudioSource, /layers:\s*firstAsset\s*\?/, 'new cues begin in a valid, editable state');

const transformDocument = {
  schemaVersion: 1,
  id: 'studio-transform',
  title: 'Studio transform',
  status: 'draft',
  entry: 'start',
  regions: [{ id: 'studio-transform.region', title: 'Test', kind: 'scene', nodeIds: ['start', 'next'] }],
  nodes: {
    start: { id: 'start', type: 'dialogue', speaker: 'TEST', lines: [{ id: 'start.line.1', text: 'Prompt.' }], goto: 'next' },
    next: { id: 'next', type: 'dialogue', lines: [{ id: 'next.line.1', text: 'Existing response.' }] },
  },
};
const transformLayout = { schemaVersion: 1, documentId: transformDocument.id, positions: { start: { x: 10, y: 20 }, next: { x: 440, y: 20 } }, regions: {} };
const firstBranch = addChoiceWithResponse(transformDocument, transformLayout, 'start');
assert.equal(firstBranch.document.nodes.start.lines[0].text, 'Prompt.', 'turning a text beat into choices preserves its setup lines');
assert.equal(firstBranch.document.nodes.start.goto, undefined, 'the former automatic continuation becomes the first choice target');
assert.equal(firstBranch.document.nodes.start.choices[0].goto, 'next');
assert.equal(firstBranch.document.nodes.start.type, 'choice');
assert.equal(Object.keys(firstBranch.document.nodes).length, 2, 'an existing continuation is reused instead of duplicated');

const terminalDocument = structuredClone(transformDocument);
delete terminalDocument.nodes.start.goto;
const terminalBranch = addChoiceWithResponse(terminalDocument, transformLayout, 'start');
assert.ok(terminalBranch.responseId && terminalBranch.document.nodes[terminalBranch.responseId], 'a terminal beat receives a linked response node by default');
assert.equal(terminalBranch.document.schemaVersion, 1, 'structural editing keeps narrative schema version 1');

const secondBranch = addChoiceWithResponse(firstBranch.document, firstBranch.layout, 'start');
const generatedResponseId = secondBranch.responseId;
assert.ok(generatedResponseId && secondBranch.document.nodes[generatedResponseId], 'subsequent choices receive a response node');
assert.equal(secondBranch.document.nodes[generatedResponseId].lines[0].text, '', 'new response prose starts ready for authoring');
assert.ok(secondBranch.document.regions[0].nodeIds.includes(generatedResponseId), 'generated responses inherit their parent region');
assert.ok(secondBranch.layout.positions[generatedResponseId].x > secondBranch.layout.positions.start.x, 'generated responses are placed beside their parent');
assert.equal(incomingStoryReferences(secondBranch.document, 'next').length, 1);
const sharedTarget = structuredClone(secondBranch.document);
sharedTarget.nodes.start.choices[1].goto = 'next';
assert.equal(incomingStoryReferences(sharedTarget, 'next').length, 2, 'shared response targets expose every incoming path');
assert.equal(allocateStoryId(secondBranch.document, 'start'), 'start-2', 'allocated structural ids cannot collide with node or content ids');

const removedBranch = removeChoicePreservingResponse(secondBranch.document, secondBranch.layout, 'start', secondBranch.choiceId);
assert.ok(removedBranch.document.nodes[generatedResponseId], 'removing a choice preserves its response content');
assert.ok(detachedStoryNodeIds(removedBranch.document).includes(generatedResponseId), 'preserved response content is reported as detached');
const reattachedBranch = attachDetachedAsChoice(removedBranch.document, removedBranch.layout, 'start', generatedResponseId);
assert.ok(reattachedBranch.document.nodes.start.choices.some((choice) => choice.goto === generatedResponseId), 'detached content can be reattached as a choice');

const linearSource = structuredClone(firstBranch.document);
linearSource.nodes.start.choices[0].mutations = { set: ['visited.response'] };
assert.equal(canMakeLinear(linearSource.nodes.start), true);
const linear = makeNodeLinear(linearSource, firstBranch.layout, 'start');
assert.equal(linear.changed, true);
assert.equal(linear.document.nodes.start.goto, 'next');
assert.equal(linear.document.nodes.start.choices, undefined);
assert.deepEqual(linear.document.nodes.start.mutations.set, ['visited.response'], 'linear conversion preserves choice mutations at node completion');

const specialized = structuredClone(transformDocument);
specialized.nodes.start.type = 'checkpoint';
const specializedBranch = addChoiceWithResponse(specialized, transformLayout, 'start');
assert.equal(specializedBranch.document.nodes.start.type, 'checkpoint', 'specialized node classifications survive structural edits');
const renamed = renameStoryNode(secondBranch.document, secondBranch.layout, generatedResponseId, 'start.custom-response');
assert.ok(renamed.document.nodes['start.custom-response']);
assert.deepEqual(renamed.layout.positions['start.custom-response'], secondBranch.layout.positions[generatedResponseId], 'node renames update editor layout atomically');
assert.deepEqual(JSON.parse(JSON.stringify(renamed.document)), renamed.document, 'structural edits survive the JSON save and reload boundary');

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

for (const [name, profile] of [['natatoriumbattle', 'natatorium'], ['practicebattle', 'practice'], ['hallbattle', 'hall']]) {
  for (const named of [false, true]) {
    const migrated = runtimeBattle(`battle.${name}.${named ? 'named' : 'unnamed'}`);
    assert.equal(migrated.id, profile);
    assert.equal(migrated.combat.kind, 'regular');
    assert.equal(migrated.combat.movements.length, 3);
    assert.deepEqual(validateCombatDefinition(migrated.combat), []);
    assert.deepEqual(migrated.combat.movements.map(({ id, coherence }) => ({ id, coherence })), authoredCombatProfile(profile).movements.map(({ id, coherence }) => ({ id, coherence })));
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
  assert.equal(migrated.id, 'chapel');
  assert.equal(migrated.combat.kind, 'chapel');
  assert.equal(migrated.combat.movements.length, 5);
  assert.deepEqual(validateCombatDefinition(migrated.combat), []);
  assert.ok(migrated.win.length > 0);
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
assert.ok(STORY_ART.surfer.src.includes('story-art/surfer.png'));
assert.equal(authoringMedia[0].id, 'story-art');
assert.equal(authoringNarrative.length, authoringProject.narrative.length);
assert.equal(authoringRegistryPaths.media[0], 'media/story-art.media.json');
assert.equal(validateProjectManifest(authoringProject, { documents: authoringNarrative, documentIds: authoringNarrative.map((doc) => doc.id) }).ok, true);
assert.deepEqual(runtimeCuesForLine('conservatory.cold_open_dialogue', {id:'start.line.7'}), ['pens'], 'audio-project event triggers drive runtime story lines');
assert.ok(audio.assets.length >= 300, 'complete sample bank is indexed');
assert.ok(Number.isFinite(authoredCue('pens').layers[0].gain) && authoredCue('pens').layers[0].gain >= 0, 'authored gain remains a valid tunable parameter');
const tunedAudio = structuredClone(audio);
const tunedLayer = tunedAudio.cues.find((cue) => cue.id === 'pens').layers[0];
Object.assign(tunedLayer, { gain: .314, pan: -.27, playbackRate: .83, fadeIn: .12 });
assert.equal(validateAudioProject(tunedAudio).ok, true, 'Studio parameter edits remain valid without hardcoded mix values');
const invalidGainAudio = structuredClone(tunedAudio);
invalidGainAudio.cues.find((cue) => cue.id === 'pens').layers[0].gain = -.01;
assert.equal(validateAudioProject(invalidGainAudio).ok, false, 'gain remains a validated parameter even though its authored value is tunable');
const invalidPanAudio = structuredClone(tunedAudio);
invalidPanAudio.cues.find((cue) => cue.id === 'pens').layers[0].pan = 1.01;
assert.equal(validateAudioProject(invalidPanAudio).ok, false, 'pan remains constrained to the Web Audio range');
const authoredTitleGain = authoredCue('story.title').layers[0].gain;
assert.equal(SOUNDTRACK_GAIN, STORY_GAIN_BASELINES.title * authoredTitleGain, 'cold-open music uses the Studio-authored layer gain');
assert.ok(SOUNDTRACK_GAIN < STORY_GAIN_BASELINES.title, 'the opening transient is attenuated below the raw title bus baseline');
assert.deepEqual(authoredCue('door').effects, ['story:stop-booth']);
const playback = [], effects = [], acoustics = [];
assert.equal(dispatchAuthoredCue('squelch', {
  play: (url, options) => playback.push({ url, options }),
  effect: (event) => effects.push(event), acoustic: (event) => acoustics.push(event),
}), true);
assert.ok(Number.isFinite(playback[0].options.rate) && playback[0].options.rate > 0, 'authored playback rate is forwarded without freezing its mix value in tests');
assert.equal(acoustics[0].kind, 'radio_squelch');
assert.ok(effects.includes('fear:bump:.22:.5'));

const automationCalls = [];
const fakeParam = (parameter = 'parameter') => ({
  value: 1,
  cancelScheduledValues: (time) => automationCalls.push(['cancel', parameter, time]),
  setValueAtTime: (value, time) => automationCalls.push(['set', parameter, value, time]),
  linearRampToValueAtTime: (value, time) => automationCalls.push(['ramp', parameter, value, time]),
});
const fakeContext = {
  currentTime: 10,
  destination: { connect() {} },
  createBufferSource: () => ({ playbackRate: fakeParam('playbackRate'), detune: fakeParam('detune'), connect() {}, start() {}, stop() {} }),
  createGain: () => ({ gain: fakeParam('gain'), connect() {} }),
  createStereoPanner: () => ({ pan: fakeParam('pan'), connect() {} }),
};
const player = createCuePlayer({ context: fakeContext, destination: fakeContext.destination, loadBuffer: async () => ({ duration: 3 }) });
await player.play({ id: 'automation-test', layers: [{ id: 'automation-test.layer.1', assetId: 'asset', automation: [{ parameter: 'gain', points: [{ time: 0, value: .25 }, { time: .5, value: .75 }] }] }] }, new Map([['asset', { id: 'asset', kind: 'file', path: 'x.wav' }]]));
assert.ok(automationCalls.some((call) => call[0] === 'ramp' && call[1] === 'gain' && call[2] === .75 && call[3] === 10.5));
await player.play({ id: 'parameter-test', layers: [{ id: 'parameter-test.layer.1', assetId: 'asset', gain: .314, pan: -.27, playbackRate: .83 }] }, new Map([['asset', { id: 'asset', kind: 'file', path: 'x.wav' }]]));
assert.ok(automationCalls.some((call) => call[0] === 'set' && call[1] === 'gain' && call[2] === .314), 'edited gain reaches the audio player');
assert.ok(automationCalls.some((call) => call[0] === 'set' && call[1] === 'pan' && call[2] === -.27), 'edited pan reaches the audio player');
assert.ok(automationCalls.some((call) => call[0] === 'set' && call[1] === 'playbackRate' && call[2] === .83), 'edited playback rate reaches the audio player');

const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close((error) => error ? reject(error) : resolve(address.port));
  });
});
const studio = spawn(process.execPath, ['tools/narrative-studio/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, STUDIO_PORT: String(port), STUDIO_NO_OPEN: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let studioOutput = '';
studio.stdout.on('data', (chunk) => { studioOutput += chunk; });
studio.stderr.on('data', (chunk) => { studioOutput += chunk; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`studio did not start\n${studioOutput}`)), 10_000);
    const poll = setInterval(() => {
      if (!studioOutput.includes('Narrative Studio:')) return;
      clearTimeout(timeout); clearInterval(poll); resolve();
    }, 25);
    studio.once('exit', (code) => {
      clearTimeout(timeout); clearInterval(poll);
      reject(new Error(`studio exited before startup (${code})\n${studioOutput}`));
    });
  });
  const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(pageResponse.status, 200, 'studio serves the development page');
  const page = await pageResponse.text();
  assert.equal((page.match(/from "\/@react-refresh"/g) || []).length, 1, 'React refresh is injected exactly once');
  const moduleResponse = await fetch(`http://127.0.0.1:${port}/src/App.tsx`);
  assert.equal(moduleResponse.status, 200, 'studio transforms the development App module');
  await transform(await moduleResponse.text(), { loader: 'js', sourcefile: 'App.tsx' });
} finally {
  if (studio.exitCode === null && studio.signalCode === null) {
    const exited = new Promise((resolve) => studio.once('exit', resolve));
    studio.kill('SIGTERM');
    await exited;
  }
}

console.log('narrative studio contracts tests ok');
