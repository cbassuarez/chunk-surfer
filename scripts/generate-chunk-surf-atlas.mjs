import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = 'content/chunk-surf/source-atlas.json';

const SOURCE_FILES = Object.freeze([
  'src/game/chunk-surf-state.js',
  'src/game/chunk-surf-scene.js',
  'src/data/chunk-surf-script.js',
  'src/game/recordist.js',
  'src/game/playback.js',
  'src/game/radio.js',
  'src/game/battle.js',
  'src/progression/runtime.js',
  'src/progression/events.js',
  'src/data/battles.js',
  'src/data/conservatory-script.js',
]);

const ROOM_SECTORS = Object.freeze({
  approach: {
    title: 'CALL CHAIN INTO SOURCE FAULT',
    anchors: ['beginChunkSurf', 'chunkSurfAvailable', 'chunkSurfMandatory', 'moveChunkSurf', 'approach'],
  },
  'fork-room': {
    title: 'OBJECT: TUNING_FORK',
    anchors: ['tuneChunkSurf', 'hasFork', 'givesFork', 'fork-room', 'TUNING_FORK'],
  },
  'recordist-loop': {
    title: 'PREVIOUS CONTRACTOR',
    anchors: ['recordChunkSurf', 'recordist-loop', 'REC', 'takes', 'previousRecordist'],
  },
  'surfer-origin': {
    title: 'STUDENT FILE / SURFER ORIGIN',
    anchors: ['surfer-origin', 'chapel-surfer', 'route.surfaced', 'SURFER', 'student'],
  },
  'work-order-loop': {
    title: 'WORK ORDER SOURCE',
    anchors: ['work-order-loop', 'WORK_ORDER', 'DELIVER', 'ACCEPTANCE', 'five clean minutes'],
  },
  'body-room': {
    title: 'BODY RETURN',
    anchors: ['body-room', 'BODY', 'RETURN', 'previousRecordist.body', 'savedRecordist'],
  },
  'final-page': {
    title: 'FINAL PAGE / REDACTION',
    anchors: ['final-page', 'redactChunkSurf', 'redactions', 'correctRedaction', 'BODY BORROWED'],
  },
});

const BANNED = [
  /https?:\/\//i,
  /\/Users\//,
  /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|KEY|AUTH)[A-Z0-9_]*\b/,
  /\b(process\.env|import\.meta\.env)\b/,
  /\b(GITHUB_|TAURI_SIGNING|APPLE_|CODESIGN|NOTAR)/i,
  /\b(release-preflight|diagnostics|support|issues\/new)\b/i,
];

function sanitizeLine(line) {
  let text = String(line || '')
    .replace(/\t/g, '  ')
    .replace(/\s+$/g, '')
    .slice(0, 132);
  for (const pattern of BANNED) text = text.replace(pattern, '[REDACTED]');
  return text;
}

function safeLine(line) {
  const text = sanitizeLine(line);
  if (!text.trim()) return false;
  if (BANNED.some((pattern) => pattern.test(text))) return false;
  return true;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function identifiers(line) {
  return [...new Set(String(line).match(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g) || [])]
    .filter((item) => !['const', 'let', 'var', 'return', 'function', 'export', 'import', 'from', 'true', 'false'].includes(item))
    .slice(0, 8);
}

function takeContext(lines, index, radius = 5) {
  const out = [];
  for (let i = Math.max(0, index - radius); i <= Math.min(lines.length - 1, index + radius); i++) {
    if (!safeLine(lines[i])) continue;
    out.push({ line: i + 1, text: sanitizeLine(lines[i]), tokens: identifiers(lines[i]) });
  }
  return out;
}

function selectSectorLines(files, roomId, spec) {
  const matches = [];
  for (const file of files) {
    for (const [index, line] of file.lines.entries()) {
      const lower = line.toLowerCase();
      const hit = spec.anchors.some((anchor) => lower.includes(String(anchor).toLowerCase()));
      if (!hit) continue;
      matches.push({ file: file.path, anchorLine: index + 1, context: takeContext(file.lines, index, 7) });
    }
  }
  const sourceLines = [];
  const seen = new Set();
  for (const match of matches) {
    for (const item of match.context) {
      const key = `${match.file}:${item.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sourceLines.push({ ...item, file: match.file, hash: hash(`${match.file}:${item.line}:${item.text}`) });
    }
  }
  return {
    id: roomId,
    title: spec.title,
    anchors: spec.anchors,
    sourceLines: sourceLines.slice(0, 90),
  };
}

const files = [];
for (const path of SOURCE_FILES) {
  const raw = await readFile(resolve(ROOT, path), 'utf8');
  files.push({ path, lines: raw.split(/\r?\n/) });
}

const sectors = Object.fromEntries(Object.entries(ROOM_SECTORS).map(([roomId, spec]) => [roomId, selectSectorLines(files, roomId, spec)]));
const sourceLineCount = Object.values(sectors).reduce((sum, sector) => sum + sector.sourceLines.length, 0);
const atlas = {
  schemaVersion: 1,
  id: 'chunk-surf.source-atlas',
  generatedFrom: SOURCE_FILES,
  leakGuard: {
    policy: ['network-addresses', 'local-machine-paths', 'credential-like-terms', 'environment-reads', 'shipping-tooling', 'diagnostic-links'],
  },
  sectors,
  stats: {
    files: SOURCE_FILES.length,
    sectors: Object.keys(sectors).length,
    sourceLines: sourceLineCount,
  },
};

for (const [roomId, sector] of Object.entries(sectors)) {
  if (sector.sourceLines.length < 8) throw new Error(`${roomId} has too few literal source lines`);
}

const json = `${JSON.stringify(atlas, null, 2)}\n`;
if (BANNED.some((pattern) => pattern.test(json))) throw new Error('generated atlas contains banned content');

const fullOut = resolve(ROOT, OUT);
await mkdir(dirname(fullOut), { recursive: true });
await writeFile(fullOut, json, 'utf8');
console.log(`Generated ${OUT}: ${atlas.stats.sectors} sectors, ${atlas.stats.sourceLines} source lines.`);
