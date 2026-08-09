import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CREDITS } from '../src/data/credits.js';
import { EXTERIOR_INSPECTABLES } from '../src/data/exterior-district.js';
import { WORK_ORDER } from '../src/data/conservatory-script.js';

const legacyTerm = /\bconservator(?:y|ies)\b/i;
const copyKeys = new Set([
  'alt', 'body', 'caption', 'description', 'heading', 'label', 'lines', 'raw',
  'subtitle', 'text', 'title',
]);

function collectCopy(value, path = '$', key = '') {
  if (typeof value === 'string') return copyKeys.has(key) ? [{ path, value }] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectCopy(item, `${path}[${index}]`, key));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([childKey, child]) => (
    collectCopy(child, `${path}.${childKey}`, childKey)
  ));
}

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }));
  return nested.flat();
}

const authoredFiles = [
  ...await jsonFiles('content/narrative'),
  ...await jsonFiles('content/media'),
];

const offenders = [];
for (const file of authoredFiles) {
  const document = JSON.parse(await readFile(file, 'utf8'));
  for (const item of collectCopy(document)) {
    if (legacyTerm.test(item.value)) offenders.push(`${file}:${item.path} = ${item.value}`);
  }
}

for (const [name, value] of Object.entries({ CREDITS, EXTERIOR_INSPECTABLES, WORK_ORDER })) {
  for (const item of collectCopy(value, name, 'body')) {
    if (legacyTerm.test(item.value)) offenders.push(`${item.path} = ${item.value}`);
  }
}

for (const file of ['src/game/coldopen.js', 'src/game/credits.js']) {
  const source = await readFile(file, 'utf8');
  if (/ELLERY CONSERVATORY\b/.test(source)) offenders.push(`${file} contains legacy display copy`);
}

assert.deepEqual(
  offenders,
  [],
  'Player-facing authored copy must say “conservatoire”; preserve “conservatory” only in technical IDs and paths.',
);

console.log('conservatoire copy contract passed');
