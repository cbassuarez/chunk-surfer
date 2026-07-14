import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  mediaSlots,
  reachableNodeIds,
  validateAudioProject,
  validateMediaProject,
  validateNarrativeDocument,
  validateProjectManifest,
} from '../src/narrative/contracts.js';

const ROOT = resolve(import.meta.dirname, '..');
const errors = [];
const documents = [];
const project = JSON.parse(await readFile(resolve(ROOT, 'content/project.json'), 'utf8'));
const narrativePaths = (await readdir(resolve(ROOT, 'content/narrative'))).filter((name) => name.endsWith('.story.json')).sort().map((name) => `narrative/${name}`);
const audioPaths = (await readdir(resolve(ROOT, 'content/audio'))).filter((name) => name.endsWith('.audio.json')).sort().map((name) => `audio/${name}`);
const mediaPaths = (await readdir(resolve(ROOT, 'content/media'))).filter((name) => name.endsWith('.media.json')).sort().map((name) => `media/${name}`);

const mediaProjects = [];
for (const path of project.media || []) {
  const media = JSON.parse(await readFile(resolve(ROOT, 'content', path), 'utf8'));
  mediaProjects.push(media);
  for (const item of validateMediaProject(media).errors) errors.push(`${path}:${item.path}: ${item.message}`);
  for (const asset of media.assets || []) {
    if (!asset.path) continue;
    try { await access(resolve(ROOT, 'public', asset.path)); }
    catch { errors.push(`${path}:assets.${asset.id}: missing public/${asset.path}`); }
  }
}

const mediaIds = mediaSlots(mediaProjects);
const audioPath = resolve(ROOT, 'content/audio/audio-project.audio.json');
const audio = JSON.parse(await readFile(audioPath, 'utf8'));
const cueIds = new Set((audio.cues || []).map((cue) => cue.id));

for (const path of project.narrative || []) {
  const name = path.split('/').pop();
  const doc = JSON.parse(await readFile(resolve(ROOT, 'content/narrative', name), 'utf8'));
  documents.push(doc);
  const result = validateNarrativeDocument(doc, { cueIds, mediaIds });
  for (const item of result.errors) errors.push(`${name}:${item.path}: ${item.message}`);
  const reached = reachableNodeIds(doc);
  for (const nodeId of Object.keys(doc.nodes || {})) if (!reached.has(nodeId)) errors.push(`${name}:nodes.${nodeId}: unreachable from declared entries`);
}
for (const item of validateAudioProject(audio).errors) errors.push(`audio-project.audio.json:${item.path}: ${item.message}`);
for (const asset of audio.assets || []) {
  if (asset.kind !== 'file') continue;
  try { await access(resolve(ROOT, 'public', asset.path)); }
  catch { errors.push(`audio-project.audio.json:assets.${asset.id}: missing public/${asset.path}`); }
}
for (const doc of documents) {
  for (const node of Object.values(doc.nodes || {})) {
    for (const cueId of [ ...(node.cues || []), ...(node.lines || []).flatMap((line) => line.cues || []), ...(node.choices || []).flatMap((choice) => choice.cues || []) ]) {
      if (!cueIds.has(cueId)) errors.push(`${doc.id}: unknown cue ${cueId}`);
    }
  }
}
for (const item of validateProjectManifest(project, { narrativePaths, audioPaths, mediaPaths, documents, documentIds: documents.map((doc) => doc.id) }).errors) {
  errors.push(`project.json:${item.path}: ${item.message}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} authoring validation error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Authoring content valid: ${documents.length} story documents, ${audio.assets.length} audio assets, ${audio.cues.length} cues, ${audio.triggers.length} triggers, ${mediaIds.size} media slots.`);
}
