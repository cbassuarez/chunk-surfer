// Generated registry bundles the canonical authoring manifest directly into
// the game. This adapter temporarily rehydrates the existing conversation
// shape while presenters migrate to NarrativeDocument natively.

import {
  authoringAudioProject,
  authoringDocumentsById,
  authoringNarrative,
  authoringProject,
} from './generated-content.js';
import { interpolateStoryText } from './conditions.js';
import { attachCombatDefinition } from '../data/combat-definitions.js';

const documents = authoringDocumentsById;
const audioProject = authoringAudioProject || { triggers: [] };

// Local-English dialogue polish lives at the registry adapter while the
// Narrative Studio documents remain the canonical source of record. Keep this
// intentionally small and source-id addressed: these are voice/locality edits,
// not a general string replacement pass.
const LOCAL_ENGLISH_TEXT_POLISH = new Map([
  ['conservatory.cold_open_dialogue:start.line.3', 'You all right? You here for the Ellery gig? Christ. They actually sent someone tonight.'],
  ['conservatory.cold_open_dialogue:start.line.5', 'Came through about five.'],
  ['conservatory.cold_open_dialogue:start.line.8', 'Coffee if you want it. It is not a proper brew, but it is hot. Work order is there. Keys when you sign.'],
  ['conservatory.cold_open_dialogue:order.rooms.power.line.1', 'The site office had the power cut months back — cheaper than paying for a building they are about to knock down.'],
  ['conservatory.cold_open_dialogue:order.money.line.2', 'I saw the dispatch call come up on the call-out board at four and said yes almost before I finished reading it.'],
  ['conservatory.cold_open_dialogue:order.client.line.2', 'No website. A landline and a registered-office post box in Croydon.'],
  ['conservatory.cold_open_dialogue:order.client.revisit.line.1', 'W. Ellery Holdings. A landline and a registered-office post box in Croydon.'],
  ['conservatory.cold_open_dialogue:order.client.worse.line.1', 'Worse, and been paid slower. A dead landline is not much of a red flag in this trade. A dead landline that pays half up front is nearly a reference.'],
  ['conservatory.cold_open_dialogue:order.deadline.line.1', 'Thursday, six in the morning. After that there is no building to be in — only dust and the planning notice for a development.'],
  ['conservatory.cold_open_dialogue:guard.line.2', 'Keys and forms. Past the grey door is not my patch.'],
  ['conservatory.cold_open_dialogue:guard.revisit.line.1', 'Still the door, the keyring, and the book. Ask away.'],
  ['conservatory.cold_open_dialogue:guard.revisit.line.2', 'Ask what you like. Yard is my patch. In there is not.'],
  ['conservatory.cold_open_dialogue:guard.inside.why.line.2', 'I have a chair, a telly, and a flask. Whatever is in there is not paying me to look at it.'],
  ['conservatory.cold_open_dialogue:guard.shift.line.2', "Nobody. Site's condemned. They stopped paying for the night watch when they stopped paying for the power. Last shift tonight."],
  ['conservatory.cold_open_dialogue:guard.shift.bell.line.1', 'And nothing. Gate code is on your sheet. It is a demolition site, mate, not a bank.'],
  ['conservatory.cold_open_dialogue:guard.radio.line.2', 'Channel two. Give us a shout on the hour if you remember. If it hisses, stop talking and let it settle.'],
  ['conservatory.cold_open_dialogue:guard.radio.line.3', 'If somebody answers and it is not me — do not get chatting.'],
  ['conservatory.cold_open_dialogue:guard.radio.revisit.line.1', 'Channel two. On the hour. Do not give it a shake.'],
  ['conservatory.cold_open_dialogue:guard.radio.choice.1', 'what if I give it a shake?'],
]);

function polishLocalEnglish(documentId = '', sourceId = '', text = '') {
  return LOCAL_ENGLISH_TEXT_POLISH.get(`${documentId}:${sourceId}`) || text;
}

const cueTriggers = new Map();
for (const trigger of audioProject.triggers || []) {
  const list=cueTriggers.get(trigger.event)||[];
  list.push(trigger.cueId);
  cueTriggers.set(trigger.event,list);
}

export function runtimeCuesForLine(documentId, line = {}) {
  const event=line.id ? `story.line:${documentId}:${line.id}` : '';
  const triggered=event ? cueTriggers.get(event) : null;
  return [...(triggered?.length ? triggered : (line.cues || []))];
}

function runtimeLine(line, context = {}, documentId = '') {
  const next = { ...line };
  if (line.id && !next.sourceId) next.sourceId = line.id;
  delete next.id; delete next.role; delete next.when;
  if (line.when) next.if = line.when;
  const cues=runtimeCuesForLine(documentId,line);
  if (cues.length) next.cue = cues[0];
  delete next.cues;
  if (next.text) next.text = polishLocalEnglish(documentId, next.sourceId || line.id, interpolateStoryText(next.text, context));
  return next;
}

function runtimeChoice(choice, context = {}, documentId = '') {
  const next = { ...choice };
  if (choice.id && !next.sourceId) next.sourceId = choice.id;
  delete next.id; delete next.when; delete next.mutations;
  if (choice.when) next.if = choice.when;
  if (choice.mutations?.set) next.set = choice.mutations.set;
  if (choice.mutations?.clear) next.clear = choice.mutations.clear;
  if (next.text) next.text = polishLocalEnglish(documentId, next.sourceId || choice.id, interpolateStoryText(next.text, context));
  return next;
}

function runtimeNode(node, context = {}, documentId = '') {
  const next = { ...node, sourceId: node.id, lines: (node.lines || []).map((line) => runtimeLine(line, context, documentId)) };
  delete next.id; delete next.type; delete next.when; delete next.mutations;
  if (node.when) next.if = node.when;
  if (node.mutations?.set) next.set = node.mutations.set;
  if (node.mutations?.clear) next.clear = node.mutations.clear;
  if (node.choices) next.choices = node.choices.map((choice) => runtimeChoice(choice, context, documentId));
  return next;
}

export function narrativeDocument(id) { return documents.get(id) || null; }
export function narrativeDocuments() { return [...documents.values()]; }
export function narrativeTimeline() { return authoringProject.timeline || []; }
export function runtimeEntrypoints() { return authoringProject.runtimeEntrypoints || authoringNarrative.map((document) => document.id); }
export function rehydrateTree(document, context = {}) {
  return Object.fromEntries(Object.entries(document.nodes).map(([nodeId, node]) => [nodeId, runtimeNode(node, context, document.id)]));
}
export function runtimeTree(id, context = {}) {
  const document = narrativeDocument(id);
  if (!document) throw new Error(`Missing authored narrative document: ${id}`);
  return rehydrateTree(document, context);
}

export function rehydrateBattle(document) {
  const meta = document.metadata || {};
  const roundNodes = Object.values(document.nodes).filter((node) => /^round-\d+$/.test(node.id)).sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)));
  const cleanLine = (line) => { const next = runtimeLine(line,{},document.id); delete next.channel; return next; };
  const rounds = roundNodes.map((node) => {
    const channel = (name) => (node.lines || []).filter((line) => line.channel === name).map(cleanLine);
    const checkpointOptions = (node.choices || []).map((choice) => {
      const next = runtimeChoice(choice); delete next.goto; delete next.mechanic; return next;
    });
    return {
      nature: node.battle?.nature, threat: node.battle?.threat,
      before: channel('before'), onListen: channel('on-listen'), after: channel('after'),
      ...(checkpointOptions.length ? { checkpoint: { prompt: channel('checkpoint-prompt'), options: checkpointOptions } } : {}),
    };
  });
  const battle = {
    id: meta.id, enemy: meta.enemy, art: meta.art, composure: meta.composure, health: meta.health,
    ...(meta.tools ? { tools: meta.tools } : {}),
    intro: (document.nodes.start?.lines || []).map(cleanLine), rounds,
    win: (document.nodes.win?.lines || []).map(cleanLine), lose: (document.nodes.lose?.lines || []).map(cleanLine),
  };
  return attachCombatDefinition(battle, meta.combat || null);
}

export function runtimeBattle(id) {
  const document = narrativeDocument(id);
  if (!document) throw new Error(`Missing authored battle document: ${id}`);
  return rehydrateBattle(document);
}
