import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import * as conservatory from '../src/data/conservatory-script.js';
import * as battles from '../src/data/battles.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
import { dialogue as legacyPrologue } from '../src/data/prologue.js';
import { radioDialogue } from '../src/data/radio-script.js';
import { RADIO_CUES } from '../src/data/radio-cues.js';
import { CUE, PAGE_TURNS } from '../src/audio/cues.js';
import { STORY_AUDIO } from '../src/audio/story-audio.js';
import { HUSH_MISCHIEF_CUES } from '../src/data/hush-cues.js';
import { ACOUSTIC_CATALOGUE } from '../src/audio/acoustic-catalogue.js';
import { stableJson } from '../src/narrative/contracts.js';

const ROOT = resolve(import.meta.dirname, '..');
const STORY_DIR = resolve(ROOT, 'content/narrative');
const AUDIO_DIR = resolve(ROOT, 'content/audio');
const LAYOUT_DIR = resolve(ROOT, 'content/layout');
const FORCE = process.argv.includes('--force');

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeLine(line, nodeId, index) {
  const src = typeof line === 'string' ? { text: line } : clone(line || {});
  if (src.direction && !src.text) { src.text = src.direction; src.role = 'direction'; delete src.direction; }
  src.id ||= `${nodeId}.line.${index + 1}`;
  if (src.if && !src.when) { src.when = src.if; delete src.if; }
  if (src.cue && !src.cues) { src.cues = [src.cue]; delete src.cue; }
  return src;
}

function normalizeChoice(choice, nodeId, index) {
  const src = clone(choice || {});
  src.id ||= `${nodeId}.choice.${index + 1}`;
  if (src.if && !src.when) { src.when = src.if; delete src.if; }
  if (src.set || src.clear) {
    src.mutations = { ...(src.set ? { set: src.set } : {}), ...(src.clear ? { clear: src.clear } : {}) };
    delete src.set; delete src.clear;
  }
  return src;
}

function normalizeTree(id, title, tree, { status = 'active', regionKind = 'scene', notes = '', tags = [] } = {}) {
  const nodes = {};
  for (const [nodeId, raw] of Object.entries(tree || {})) {
    const node = clone(raw || {});
    node.id = nodeId;
    node.type ||= (node.choices?.length ? 'choice' : 'dialogue');
    node.lines = (node.lines || []).map((line, index) => normalizeLine(line, nodeId, index));
    if (node.choices) node.choices = node.choices.map((choice, index) => normalizeChoice(choice, nodeId, index));
    if (node.if && !node.when) { node.when = node.if; delete node.if; }
    if (node.set || node.clear) {
      node.mutations = { ...(node.set ? { set: node.set } : {}), ...(node.clear ? { clear: node.clear } : {}) };
      delete node.set; delete node.clear;
    }
    nodes[nodeId] = node;
  }
  for (const node of Object.values(nodes)) {
    if (node.goto && !nodes[node.goto]) { node.exit = node.goto; delete node.goto; }
    for (const choice of node.choices || []) {
      if (choice.goto && !nodes[choice.goto]) { choice.exit = choice.goto; delete choice.goto; }
    }
  }
  const entry = nodes.start ? 'start' : Object.keys(nodes)[0];
  const inbound = new Set();
  for (const node of Object.values(nodes)) {
    if (node.goto) inbound.add(node.goto);
    for (const choice of node.choices || []) if (choice.goto) inbound.add(choice.goto);
  }
  const entries = Object.keys(nodes).filter((nodeId) => !inbound.has(nodeId));
  return {
    schemaVersion: 1, id, title, status, entry, entries,
    tags, notes,
    regions: [{ id: `${id}.region`, title, kind: regionKind, color: regionKind === 'ending' ? '#ad6a3b' : '#245c62', nodeIds: Object.keys(nodes) }],
    nodes,
  };
}

function sequence(id, title, lines, options = {}) {
  return normalizeTree(id, title, { start: { type: options.regionKind === 'ending' ? 'ending' : 'sequence', lines } }, options);
}

function battleGraph(id, title, battle) {
  const tree = { start: { type: 'battle', speaker: battle.enemy, art: battle.art, lines: battle.intro || [], goto: battle.rounds?.length ? 'round-1' : 'outcome' } };
  (battle.rounds || []).forEach((round, index) => {
    const nodeId = `round-${index + 1}`;
    const next = index + 1 < battle.rounds.length ? `round-${index + 2}` : 'outcome';
    const prompt = Array.isArray(round.checkpoint?.prompt) ? round.checkpoint.prompt : [];
    const options = round.checkpoint?.options || [];
    tree[nodeId] = {
      type: options.length ? 'checkpoint' : 'battle-round',
      lines: [
        ...(round.before || []).map((line) => ({ ...line, channel: 'before' })),
        ...prompt.map((line) => ({ ...line, channel: 'checkpoint-prompt' })),
        ...(round.onListen || []).map((line) => ({ ...line, channel: 'on-listen' })),
        ...(round.after || []).map((line) => ({ ...line, channel: 'after' })),
      ],
      choices: options.length ? options.map((option) => ({ ...option, goto: next })) : undefined,
      goto: options.length ? undefined : next,
      battle: { nature: round.nature, threat: round.threat },
    };
  });
  tree.outcome = { type: 'checkpoint', lines: [], choices: [
    { id: 'outcome.win', text: 'Composure held', goto: 'win', mechanic: 'win' },
    { id: 'outcome.lose', text: 'Composure broke', goto: 'lose', mechanic: 'lose' },
  ] };
  tree.win = { type: 'ending', lines: battle.win || [] };
  tree.lose = { type: 'ending', lines: battle.lose || [] };
  const doc = normalizeTree(id, title, tree, { regionKind: 'scene', tags: ['battle'] });
  doc.metadata = { id: battle.id, enemy: battle.enemy, art: battle.art || null, combat: authoredCombatProfile(battle.id) };
  doc.regions.push({ id: `${id}.endings`, title: 'Battle outcomes', kind: 'ending', color: '#8b3c48', nodeIds: ['win', 'lose'] });
  return doc;
}

const documents = [];
const add = (doc) => documents.push(doc);

for (const [key, title] of [
  ['COLD_OPEN_DIALOGUE', 'Cold Open'], ['POST_DOOR', 'After the Door'], ['LEVEL_CHECK', 'Level Check'],
  ['FIRST_TAKE', 'First Take'], ['BENT_RIG', 'Bent Rig'], ['TALISMAN', 'Talisman'],
  ['HUSH', 'The HUSH'], ['RADIO_DEAD', 'Dead Radio'], ['CHAPEL_KEY_CHECK', 'Chapel Key Check'],
]) {
  if (conservatory[key]) add(normalizeTree(`conservatory.${slug(key)}`, title, conservatory[key]));
}

for (const room of conservatory.TARGETS || []) {
  add(normalizeTree(`room-listen.${room}`, `Room Listen · ${room.replaceAll('_', ' ')}`, conservatory.roomListen(room, '{label}'), { tags: ['room-listen'] }));
}

for (const cueId of Object.values(RADIO_CUES)) {
  add(normalizeTree(`radio.${slug(cueId)}`, `Radio · ${cueId}`, radioDialogue(cueId, { roomLabel: '{roomLabel}' }), { tags: ['radio'] }));
}

for (const named of [false, true]) {
  const variant = named ? 'named' : 'unnamed';
  for (const [factory, title] of [
    ['hallPlayback', 'Concert Hall Playback'], ['practicePlayback', 'Practice Wing Playback'], ['natatoriumPlayback', 'Natatorium Playback'],
  ]) add(normalizeTree(`playback.${slug(factory)}.${variant}`, `${title} · ${variant}`, battles[factory](named), { tags: ['playback', variant] }));
  for (const [factory, title] of [
    ['natatoriumBattle', 'Natatorium Battle'], ['practiceBattle', 'Practice Wing Battle'], ['hallBattle', 'Concert Hall Battle'],
  ]) add(battleGraph(`battle.${slug(factory)}.${variant}`, `${title} · ${variant}`, battles[factory](named)));
}

for (const fixture of [
  { id: 'nothing', options: { kind: 'nothing' } },
  { id: 'name-sarah', options: { kind: 'name', value: 'Sarah' } },
  { id: 'name-other', options: { kind: 'name', value: 'Someone' } },
  { id: 'reason-money', options: { kind: 'reason', value: 'money' } },
  { id: 'reason-superstition', options: { kind: 'reason', value: 'superstition' } },
  { id: 'reason-other', options: { kind: 'reason', value: 'work' } },
  { id: 'feeling', options: { kind: 'feeling', value: 'dread' } },
]) add(battleGraph(`battle.chapel.${fixture.id}`, `Chapel · ${fixture.id}`, battles.chapelBoss(fixture.options)));

for (const fixture of [
  { id: 'base', options: {} },
  { id: 'rig', options: { canInvert: true } },
  { id: 'surface', options: { canSurface: true } },
  { id: 'all', options: { canInvert: true, canSurface: true } },
]) add(normalizeTree(`ending.choice.${fixture.id}`, `Ending Choice · ${fixture.id}`, conservatory.endingChoice(fixture.options), { regionKind: 'ending', tags: ['ending', 'choice'] }));

for (const named of [false, true]) {
  const variant = named ? 'named' : 'unnamed';
  for (let injuries = 0; injuries <= 5; injuries++) add(sequence(`ending.sacrifice.${variant}.injuries-${injuries}`, `Sacrifice · ${variant} · ${injuries} injuries`, conservatory.sacrificeEnding({ named, injuries }), { regionKind: 'ending', tags: ['ending', variant] }));
  add(sequence(`ending.rescue.${variant}`, `Rescue · ${variant}`, conservatory.rescueEnding(named), { regionKind: 'ending', tags: ['ending'] }));
  add(sequence(`ending.helped.${variant}`, `Helped · ${variant}`, conservatory.helpedEnding({ named }), { regionKind: 'ending', tags: ['ending'] }));
}
add(sequence('ending.inversion-start', 'Inversion · Start', conservatory.INVERT_START, { regionKind: 'ending', tags: ['ending'] }));
add(sequence('ending.false-door', 'Inversion · False Door', conservatory.FALSE_DOOR, { regionKind: 'ending', tags: ['ending'] }));
add(sequence('ending.inversion-final', 'Inversion · Final', conservatory.INVERSION_FINAL, { regionKind: 'ending', tags: ['ending'] }));
add(sequence('ending.drugged.complete', 'Drugged Reveal · complete', conservatory.druggedReveal({ takes: 5 }), { regionKind: 'ending', tags: ['ending'] }));
add(sequence('ending.drugged.partial', 'Drugged Reveal · partial', conservatory.druggedReveal({ takes: 4 }), { regionKind: 'ending', tags: ['ending'] }));
for (const variant of ['out', 'client', 'nobody', 'helped', 'drugged']) add(sequence(`ending.epilogue.${variant}`, `Guard Epilogue · ${variant}`, conservatory.guardEpilogue(variant), { regionKind: 'ending', tags: ['ending', 'epilogue'] }));
add(normalizeTree('legacy.prologue', 'Legacy Prologue', legacyPrologue, { status: 'legacy', regionKind: 'legacy', tags: ['legacy'], notes: 'Retained for reference; not an active runtime entry.' }));

async function audioFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await audioFiles(path));
    else if (['.mp3', '.wav', '.ogg', '.flac'].includes(extname(entry.name).toLowerCase())) out.push(path);
  }
  return out;
}

function assetIdFor(path) { return `asset.${slug(path.replace(/^audio\//, '').replace(/\.[^.]+$/, '').replaceAll('/', '.'))}`; }

async function buildAudioProject() {
  const files = await audioFiles(resolve(ROOT, 'public/audio'));
  const assets = files.sort().map((file) => {
    const path = relative(resolve(ROOT, 'public'), file).replaceAll('\\', '/');
    return { id: assetIdFor(path), kind: 'file', path, tags: path.split('/').slice(1, -1) };
  });
  for (const kind of ['hush-fragment', 'instrument', 'equipment', 'negative', 'menu-hiss', 'ui-click']) {
    assets.push({ id: `procedural.${kind}`, kind: 'procedural', generator: kind, tags: ['procedural'] });
  }
  const byPath = new Map(assets.map((asset) => [asset.path, asset.id]));
  const cues = [];
  const cueById = new Map();
  const putCue = (cue) => { if (!cueById.has(cue.id)) { cueById.set(cue.id, cue); cues.push(cue); } };
  const authoredMix = {
    door: { gain: .95, effects: ['story:stop-booth'] }, scream: { gain: .95, effects: ['fx:shake:2.6:900', 'threat:report'] },
    keyturn: { gain: .85, effects: ['story:stop-rain'] }, rewind: { gain: .80 }, bag: { gain: .75 }, pens: { gain: .62 },
    signature: { gain: .70 }, slides: { gain: .78 }, keys: { gain: .70 }, kit: { gain: .72 },
  };
  for (const [name, path] of Object.entries(CUE)) {
    const mix = authoredMix[name] || {};
    putCue({ id: name, title: name.replaceAll('_', ' '), bus: 'sfx', concurrency: 'overlap', layers: [{ id: `${name}.layer`, assetId: byPath.get(path) || assetIdFor(path), gain: mix.gain ?? 1, playbackRate: 1, pan: 0 }], ...(mix.effects ? { effects: mix.effects } : {}) });
  }
  PAGE_TURNS.forEach((path, index) => putCue({ id: `page-turn.${index + 1}`, title: `Page turn ${index + 1}`, bus: 'sfx', concurrency: 'overlap', layers: [{ id: `page-turn.${index + 1}.layer`, assetId: byPath.get(path) || assetIdFor(path), gain: .2, playbackRate: 1, pan: 0 }] }));
  for (const [name, path] of Object.entries(STORY_AUDIO)) {
    putCue({ id: `story.${name}`, title: `Story ${name}`, bus: name === 'title' ? 'music' : 'dialog', concurrency: 'replace', layers: [{ id: `story.${name}.layer`, assetId: byPath.get(path) || assetIdFor(path), gain: 1, playbackRate: 1, pan: 0, loop: ['title', 'booth', 'rain', 'tape'].includes(name) }] });
  }
  const battleAsset = (name) => byPath.get(`audio/game/battle/${name}.mp3`) || assetIdFor(`audio/game/battle/${name}.mp3`);
  putCue({ id: 'battle.bed', title: 'Battle bed', bus: 'music', concurrency: 'replace', layers: [{ id: 'battle.bed.layer', assetId: battleAsset('bed'), gain: .72, playbackRate: 1, pan: 0, loop: true }] });
  [3, 2.35, .75].forEach((gain, index) => putCue({ id: `battle.lead.${index + 1}`, title: `Battle lead ${index + 1}`, bus: 'music', concurrency: 'replace', layers: [{ id: `battle.lead.${index + 1}.layer`, assetId: battleAsset(`lead-${index + 1}`), gain, playbackRate: 1, pan: 0, loop: true }] }));
  [[.4, 1.25], [1.7, 1.35], [1.8, 1.4]].forEach(([fillGain, tailGain], index) => {
    const variant = index + 1;
    putCue({ id: `battle.entry.${variant}`, title: `Battle entry ${variant}`, bus: 'music', concurrency: 'replace', layers: [
      { id: `battle.entry.${variant}.fill`, assetId: battleAsset(`entry-${variant}-fill`), gain: fillGain, playbackRate: 1, pan: 0 },
      { id: `battle.entry.${variant}.tail`, assetId: battleAsset(`entry-${variant}-tail`), gain: tailGain, playbackRate: 1, pan: 0 },
    ] });
  });
  putCue({ id: 'freeze', title: 'Rupture freeze', bus: 'sfx', concurrency: 'replace', layers: [], effects: ['fx:flash:120', 'fx:shake:1.6:700', 'look:rupture'] });
  putCue({ id: 'squelch', title: 'Radio squelch', bus: 'sfx', concurrency: 'overlap', layers: [{ id: 'squelch.layer', assetId: byPath.get(CUE.recorder), gain: .55, playbackRate: .4, pan: 0 }], effects: ['threat:report', 'fear:bump:.22:.5'], acoustic: { kind: 'radio_squelch', sourceKind: 'equipment', sourceId: 'radio', reason: 'the radio', level: .34, emitsWorldNoise: true, maySpoilTake: true, markHeard: true } });
  for (const item of HUSH_MISCHIEF_CUES) {
    putCue({ id: item.id, title: item.caption?.text || item.id, bus: item.delivery === 'monitor' ? 'monitor' : 'world', concurrency: 'overlap', layers: [{ id: `${item.id}.layer`, assetId: `procedural.${item.audio.sound}`, gain: item.audio.gain, playbackRateRange: item.audio.pitchRange }], acoustic: { ...item.gameplay, sourcePolicy: item.sourcePolicy } });
  }
  const triggers = [];
  for (const doc of documents) {
    for (const [nodeId, node] of Object.entries(doc.nodes)) {
      (node.cues || []).forEach((cueId) => triggers.push({ id: `trigger.${doc.id}.${nodeId}.${cueId}`, event: `story.node-enter:${doc.id}:${nodeId}`, cueId }));
      (node.lines || []).forEach((line) => (line.cues || []).forEach((cueId) => triggers.push({ id: `trigger.${doc.id}.${line.id}.${cueId}`, event: `story.line:${doc.id}:${line.id}`, cueId })));
      (node.choices || []).forEach((choice) => (choice.cues || []).forEach((cueId) => triggers.push({ id: `trigger.${doc.id}.${choice.id}.${cueId}`, event: `story.choice:${doc.id}:${choice.id}`, cueId })));
    }
  }
  return { schemaVersion: 1, id: 'chunk-surfer.audio', assets, cues, triggers, acousticCatalogue: clone(ACOUSTIC_CATALOGUE), buses: ['dialog', 'sfx', 'music', 'menu', 'monitor', 'world'] };
}

if (!FORCE) {
  try {
    await access(resolve(ROOT, 'content/project.json'));
    throw new Error('Authoring content already exists. It is canonical and was not overwritten. Use studio:reimport only when intentionally rebuilding it from legacy sources.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
if (FORCE) await Promise.all([
  rm(STORY_DIR, { recursive: true, force: true }),
  rm(AUDIO_DIR, { recursive: true, force: true }),
  rm(LAYOUT_DIR, { recursive: true, force: true }),
]);
await Promise.all([mkdir(STORY_DIR, { recursive: true }), mkdir(AUDIO_DIR, { recursive: true }), mkdir(LAYOUT_DIR, { recursive: true })]);
for (const doc of documents) {
  await writeFile(resolve(STORY_DIR, `${doc.id}.story.json`), stableJson(doc));
  const positions = {};
  Object.keys(doc.nodes).forEach((nodeId, index) => { positions[nodeId] = { x: 80 + (index % 4) * 360, y: 100 + Math.floor(index / 4) * 260 }; });
  await writeFile(resolve(LAYOUT_DIR, `${doc.id}.layout.json`), stableJson({ schemaVersion: 1, documentId: doc.id, positions, regions: {} }));
}
await writeFile(resolve(AUDIO_DIR, 'audio-project.audio.json'), stableJson(await buildAudioProject()));
await writeFile(resolve(ROOT, 'content/project.json'), stableJson({ schemaVersion: 1, id: 'chunk-surfer', narrative: documents.map((doc) => `narrative/${doc.id}.story.json`), audio: ['audio/audio-project.audio.json'] }));
console.log(`Imported ${documents.length} narrative documents and the complete public audio bank.`);
