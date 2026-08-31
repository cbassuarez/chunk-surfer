// Collects everything known about the nine endings into one thing the page can
// render.
//
// It comes from three places that have never been read side by side:
// data/endings.js says what an ending is, data/ending-gates.js says how it is
// reached and what stops it, and content/narrative/*.story.json is what it
// actually says out loud. This joins them up and reports anything that does not
// line up.
//
// Nothing here writes to disk.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ROOT, citationReader } from '../shared.mjs';
import { ENDING_IDS } from '../../../src/progression/schema.js';
import {
  ENDING_MANIFEST,
  ENDING_AUDIO_TODO,
  ENDING_EVENT,
  endingCodaVariant,
  endingContractErrors,
} from '../../../src/data/endings.js';
import { ENDING_GATES, ENDING_FAMILY, endingGateErrors } from '../../../src/data/ending-gates.js';
import { ENDING_REPLAY_UNLOCKS } from '../../../src/progression/unlocks.js';
import { NEXT_ENDING_HINTS } from '../../../src/game/post-run-copy.js';
import { ENDING_ARCHIVE } from '../../../src/data/ending-archive.js';

const NARRATIVE = resolve(ROOT, 'content/narrative');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// A piece of writing, reduced to what the page needs: how big it is, which
// lines only some players hear, and where every line lives, so a scene beat
// that names a line can be turned into a link into the studio.
async function loadDocument(documentId) {
  const path = `content/narrative/${documentId}.story.json`;
  let data;
  try { data = await readJson(resolve(NARRATIVE, `${documentId}.story.json`)); }
  catch { return { id: documentId, path, missing: true, nodes: 0, lines: 0, choices: 0, conditions: [], lineIndex: {} }; }
  const nodes = Object.entries(data.nodes || {});
  const lineIndex = {};
  const conditions = new Set();
  let lines = 0;
  let choices = 0;
  for (const [nodeId, node] of nodes) {
    for (const line of node.lines || []) {
      lines += 1;
      if (line.id) lineIndex[line.id] = nodeId;
      if (line.if || line.when) conditions.add(String(line.if || line.when));
    }
    for (const choice of node.choices || []) {
      choices += 1;
      if (choice.if || choice.when) conditions.add(String(choice.if || choice.when));
    }
    if (node.if || node.when) conditions.add(String(node.if || node.when));
  }
  return {
    id: documentId,
    path,
    missing: false,
    title: data.title || '',
    status: data.status || '',
    entry: data.entry || '',
    nodeIds: nodes.map(([id]) => id),
    nodes: nodes.length,
    lines,
    choices,
    conditions: [...conditions].sort(),
    lineIndex,
  };
}

// One ending picks its last page based on what the player disclosed, so ask it
// twice rather than assuming there is only one answer.
function codaVariants(id) {
  const probes = [
    { label: 'disclosed nothing', dossier: { confession: { kind: 'nothing' } } },
    { label: 'disclosed something', dossier: { confession: { kind: 'said' } } },
  ];
  const seen = new Map();
  for (const probe of probes) {
    const variant = endingCodaVariant(id, probe.dossier);
    if (!seen.has(variant)) seen.set(variant, []);
    seen.get(variant).push(probe.label);
  }
  const entries = [...seen.entries()];
  // Same answer both times means it does not vary, so drop the explanation.
  return entries.map(([variant, when]) => ({ variant, when: entries.length > 1 ? when.join(' / ') : '' }));
}

const timelineSummary = (steps = []) => {
  const counts = {};
  for (const step of steps) counts[step.kind] = (counts[step.kind] || 0) + 1;
  const last = steps.length ? Math.max(...steps.map((step) => step.at)) : 0;
  return { count: steps.length, seconds: last, counts, steps };
};

export async function buildAudit() {
  const project = await readJson(resolve(ROOT, 'content/project.json'));
  const registered = new Set((project.narrative || []).map((path) => path.split('/').pop().replace(/\.story\.json$/, '')));

  const citation = citationReader();
  const citeAll = async (entries) => Promise.all(entries.map(async (entry) => ({ ...entry, where: await citation(entry.where) })));

  const documents = new Map();
  const document = async (id) => {
    if (!id) return null;
    if (!documents.has(id)) documents.set(id, await loadDocument(id));
    return documents.get(id);
  };

  const endings = [];
  for (const id of ENDING_IDS) {
    const manifest = ENDING_MANIFEST[id];
    const gate = ENDING_GATES[id];
    const findings = [];

    const tree = await document(manifest.tree);
    if (tree.missing) findings.push(`The writing for this ending (${manifest.tree}) is not there.`);
    else if (!registered.has(manifest.tree)) findings.push(`${manifest.tree} is not listed in content/project.json, so the studio will not show it.`);

    const passages = [];
    for (const [arrival, documentId] of Object.entries(manifest.passage || {})) {
      const loaded = await document(documentId);
      if (loaded.missing) findings.push(`The short scene that should play when ${arrival} (${documentId}) is not there.`);
      passages.push({ arrival, document: loaded });
    }

    const codas = [];
    for (const entry of codaVariants(id)) {
      const documentId = `ending.epilogue.${entry.variant}`;
      const loaded = await document(documentId);
      if (loaded.missing) findings.push(`The last page (${documentId}) is not there.`);
      codas.push({ ...entry, document: loaded });
    }

    // A scene beat names one line of dialogue. Finding which part of the
    // document that line sits in is what makes the link land in the right
    // place, and a line that cannot be found means the beat is pointing at
    // writing that has since been changed.
    const beats = [];
    for (const beat of manifest.cutscene?.beats || []) {
      const dialogue = [];
      for (const source of beat.dialogue || []) {
        const [documentId, lineId] = String(source).split('#');
        const loaded = await document(documentId);
        const node = loaded.lineIndex?.[lineId] || null;
        if (loaded.missing) findings.push(`The scene beat "${beat.id}" points at ${documentId}, which is not there.`);
        else if (!node) findings.push(`The scene beat "${beat.id}" asks for the line ${lineId}, and there is no such line in ${documentId}.`);
        dialogue.push({ documentId, lineId, node, missing: loaded.missing || !node });
      }
      beats.push({ ...beat, dialogue });
    }

    // The list of sound still to make names the file that is missing
    // (ending.bed.sacrifice); the ending names the slot it is borrowing
    // instead (ending.sacrifice). One per ending, plus any shared sounds this
    // ending's scene actually asks for.
    const cues = new Set((manifest.cutscene?.beats || []).map((beat) => beat.cue).filter(Boolean));
    const audioTodo = ENDING_AUDIO_TODO.filter((entry) => entry.id === `ending.bed.${id}` || cues.has(entry.id));
    const bedTodo = audioTodo.find((entry) => entry.kind === 'bed');
    if (manifest.audio.placeholder) {
      findings.push(bedTodo
        ? `The music is still the opening title theme. What it needs: ${bedTodo.note}`
        : `The music is a stand-in and nobody has written down what should replace it.`);
    }

    const archive = ENDING_ARCHIVE[manifest.residue] || null;
    if (!archive) findings.push(`Nothing has been written for the file this ending leaves behind (${manifest.residue}).`);
    if (ENDING_REPLAY_UNLOCKS[id]?.archiveEntry !== manifest.residue) {
      findings.push(`This ending says it leaves behind ${manifest.residue}, but the unlock list says ${ENDING_REPLAY_UNLOCKS[id]?.archiveEntry || 'nothing'}.`);
    }

    const requires = await citeAll(gate.requires || []);
    const blocks = await citeAll(gate.blocks || []);
    const arrivals = [];
    for (const arrival of manifest.arrivals) {
      const described = gate.arrivals?.[arrival] || null;
      arrivals.push({
        arrival,
        how: described?.how || '',
        where: described ? await citation(described.where) : null,
        passage: manifest.passage?.[arrival] || null,
      });
    }
    for (const entry of [...requires, ...blocks, ...arrivals]) {
      if (entry.where && !entry.where.resolved) findings.push(`A description points at ${entry.where.symbol} in ${entry.where.file}, and it is not there any more.`);
    }

    endings.push({
      id,
      title: manifest.title,
      classification: manifest.classification,
      family: ENDING_FAMILY[gate.family],
      summary: gate.summary,
      hint: NEXT_ENDING_HINTS[id] || '',
      arrivals,
      requires,
      blocks,
      objective: manifest.objective
        ? { ...manifest.objective, timeline: timelineSummary(manifest.objective.timeline) }
        : null,
      environment: timelineSummary(manifest.environment),
      tree,
      passages,
      codas,
      beats,
      cutscene: manifest.cutscene,
      hush: manifest.hush,
      companion: manifest.companion,
      image: manifest.image,
      audio: { ...manifest.audio, todo: audioTodo },
      residue: manifest.residue,
      archive: archive ? { id: archive.id, title: archive.title, classification: archive.classification, filedBy: archive.filedBy } : null,
      unlock: ENDING_REPLAY_UNLOCKS[id] || null,
      findings,
    });
  }

  const contract = endingContractErrors();
  const gates = endingGateErrors();
  return {
    generatedAt: new Date().toISOString(),
    families: Object.values(ENDING_FAMILY),
    eventVocabulary: Object.values(ENDING_EVENT),
    endings,
    global: {
      contract,
      gates,
      findings: endings.flatMap((ending) => ending.findings.map((text) => ({ id: ending.id, text }))),
    },
  };
}
