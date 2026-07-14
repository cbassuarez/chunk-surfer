import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reachableNodeIds, validateAudioProject, validateNarrativeDocument } from '../src/narrative/contracts.js';

const ROOT = resolve(import.meta.dirname, '..');
const errors = [];
const documents = [];
for (const name of (await readdir(resolve(ROOT, 'content/narrative'))).filter((name) => name.endsWith('.story.json')).sort()) {
  const doc = JSON.parse(await readFile(resolve(ROOT, 'content/narrative', name), 'utf8'));
  documents.push(doc);
  const result = validateNarrativeDocument(doc);
  for (const item of result.errors) errors.push(`${name}:${item.path}: ${item.message}`);
  const reached = reachableNodeIds(doc);
  for (const nodeId of Object.keys(doc.nodes || {})) if (!reached.has(nodeId)) errors.push(`${name}:nodes.${nodeId}: unreachable from declared entries`);
}
const audioPath = resolve(ROOT, 'content/audio/audio-project.audio.json');
const audio = JSON.parse(await readFile(audioPath, 'utf8'));
for (const item of validateAudioProject(audio).errors) errors.push(`audio-project.audio.json:${item.path}: ${item.message}`);
for (const asset of audio.assets || []) {
  if (asset.kind !== 'file') continue;
  try { await access(resolve(ROOT, 'public', asset.path)); }
  catch { errors.push(`audio-project.audio.json:assets.${asset.id}: missing public/${asset.path}`); }
}
const cueIds = new Set((audio.cues || []).map((cue) => cue.id));
for (const doc of documents) {
  for (const node of Object.values(doc.nodes || {})) {
    for (const cueId of [ ...(node.cues || []), ...(node.lines || []).flatMap((line) => line.cues || []), ...(node.choices || []).flatMap((choice) => choice.cues || []) ]) {
      if (!cueIds.has(cueId)) errors.push(`${doc.id}: unknown cue ${cueId}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} authoring validation error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Authoring content valid: ${documents.length} story documents, ${audio.assets.length} assets, ${audio.cues.length} cues, ${audio.triggers.length} triggers.`);
}
