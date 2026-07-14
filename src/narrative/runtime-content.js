// Vite bundles the canonical authoring documents directly into the game. The
// adapter temporarily rehydrates the existing conversation shape while the
// presenters migrate to NarrativeDocument natively.

import coldOpen from '../../content/narrative/conservatory.cold_open_dialogue.story.json' with { type: 'json' };
import postDoor from '../../content/narrative/conservatory.post_door.story.json' with { type: 'json' };
import levelCheck from '../../content/narrative/conservatory.level_check.story.json' with { type: 'json' };
import firstTake from '../../content/narrative/conservatory.first_take.story.json' with { type: 'json' };
import hush from '../../content/narrative/conservatory.hush.story.json' with { type: 'json' };
import radioDead from '../../content/narrative/conservatory.radio_dead.story.json' with { type: 'json' };
import bentRig from '../../content/narrative/conservatory.bent_rig.story.json' with { type: 'json' };
import talisman from '../../content/narrative/conservatory.talisman.story.json' with { type: 'json' };
import chapelKey from '../../content/narrative/conservatory.chapel_key_check.story.json' with { type: 'json' };
import roomMain from '../../content/narrative/room-listen.main_b3.story.json' with { type: 'json' };
import roomTub from '../../content/narrative/room-listen.the_tub.story.json' with { type: 'json' };
import roomAmp from '../../content/narrative/room-listen.amplifications.story.json' with { type: 'json' };
import roomPractice from '../../content/narrative/room-listen.soundnoisemusic.story.json' with { type: 'json' };
import roomChapel from '../../content/narrative/room-listen.lux_nova.story.json' with { type: 'json' };
import radioInitial from '../../content/narrative/radio.initial_checkin.story.json' with { type: 'json' };
import radioSecond from '../../content/narrative/radio.post_second_take_warning.story.json' with { type: 'json' };
import radioThird from '../../content/narrative/radio.pre_third_room_breakdown.story.json' with { type: 'json' };
import hallPlaybackNamed from '../../content/narrative/playback.hallplayback.named.story.json' with { type: 'json' };
import hallPlaybackUnnamed from '../../content/narrative/playback.hallplayback.unnamed.story.json' with { type: 'json' };
import practicePlaybackNamed from '../../content/narrative/playback.practiceplayback.named.story.json' with { type: 'json' };
import practicePlaybackUnnamed from '../../content/narrative/playback.practiceplayback.unnamed.story.json' with { type: 'json' };
import natatoriumPlaybackNamed from '../../content/narrative/playback.natatoriumplayback.named.story.json' with { type: 'json' };
import natatoriumPlaybackUnnamed from '../../content/narrative/playback.natatoriumplayback.unnamed.story.json' with { type: 'json' };
import hallBattleNamed from '../../content/narrative/battle.hallbattle.named.story.json' with { type: 'json' };
import hallBattleUnnamed from '../../content/narrative/battle.hallbattle.unnamed.story.json' with { type: 'json' };
import practiceBattleNamed from '../../content/narrative/battle.practicebattle.named.story.json' with { type: 'json' };
import practiceBattleUnnamed from '../../content/narrative/battle.practicebattle.unnamed.story.json' with { type: 'json' };
import natatoriumBattleNamed from '../../content/narrative/battle.natatoriumbattle.named.story.json' with { type: 'json' };
import natatoriumBattleUnnamed from '../../content/narrative/battle.natatoriumbattle.unnamed.story.json' with { type: 'json' };
import audioProject from '../../content/audio/audio-project.audio.json' with { type: 'json' };
import { interpolateStoryText } from './conditions.js';

const documents = new Map([
  coldOpen, postDoor, levelCheck, firstTake, hush, radioDead, bentRig, talisman, chapelKey,
  roomMain, roomTub, roomAmp, roomPractice, roomChapel,
  radioInitial, radioSecond, radioThird,
  hallPlaybackNamed, hallPlaybackUnnamed, practicePlaybackNamed, practicePlaybackUnnamed, natatoriumPlaybackNamed, natatoriumPlaybackUnnamed,
  hallBattleNamed, hallBattleUnnamed, practiceBattleNamed, practiceBattleUnnamed, natatoriumBattleNamed, natatoriumBattleUnnamed,
].map((document) => [document.id, document]));

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
  return {
    id: meta.id, enemy: meta.enemy, art: meta.art, composure: meta.composure, health: meta.health,
    ...(meta.tools ? { tools: meta.tools } : {}), challenges: meta.challenges || [],
    intro: (document.nodes.start?.lines || []).map(cleanLine), rounds,
    win: (document.nodes.win?.lines || []).map(cleanLine), lose: (document.nodes.lose?.lines || []).map(cleanLine),
  };
}

export function runtimeBattle(id) {
  const document = narrativeDocument(id);
  if (!document) throw new Error(`Missing authored battle document: ${id}`);
  return rehydrateBattle(document);
}
