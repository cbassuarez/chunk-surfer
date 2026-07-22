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
  delete next.id; delete next.role; delete next.when;
  if (line.when) next.if = line.when;
  const cues=runtimeCuesForLine(documentId,line);
  if (cues.length) next.cue = cues[0];
  delete next.cues;
  if (next.text) next.text = interpolateStoryText(next.text, context);
  return next;
}

function runtimeChoice(choice, context = {}) {
  const next = { ...choice };
  delete next.id; delete next.when; delete next.mutations;
  if (choice.when) next.if = choice.when;
  if (choice.mutations?.set) next.set = choice.mutations.set;
  if (choice.mutations?.clear) next.clear = choice.mutations.clear;
  if (next.text) next.text = interpolateStoryText(next.text, context);
  return next;
}

function runtimeNode(node, context = {}, documentId = '') {
  const next = { ...node, lines: (node.lines || []).map((line) => runtimeLine(line, context, documentId)) };
  delete next.id; delete next.type; delete next.when; delete next.mutations;
  if (node.when) next.if = node.when;
  if (node.mutations?.set) next.set = node.mutations.set;
  if (node.mutations?.clear) next.clear = node.mutations.clear;
  if (node.choices) next.choices = node.choices.map((choice) => runtimeChoice(choice, context));
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
