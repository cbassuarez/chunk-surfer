import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import {
  LanguageVariant,
  SyntaxKind,
  isKeywordKind,
  isLiteralKind,
  isPunctuationKind,
  isTriviaKind,
} from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = 'content/chunk-surf/source-atlas.json';

// Only committed, shipped runtime and authoring sources may become visible.
// Lines are copied byte-for-byte: unsafe candidates are omitted, never
// rewritten into source that does not actually exist.
const SOURCE_FILES = Object.freeze([
  'src/game/chunk-surf-state.js',
  'src/game/presence.js',
  'src/game/hush-field.js',
  'src/game/hush-audio-runtime.js',
  'src/game/hush-director.js',
  'src/audio/acoustic-propagation.js',
  'src/game/recordist.js',
  'src/game/playback.js',
  'src/game/radio.js',
  'src/game/battle.js',
  'src/data/battles.js',
  'src/progression/runtime.js',
  'src/progression/events.js',
  'content/narrative/battle.chapel.feeling.story.json',
  'content/narrative/conservatory.cold_open_dialogue.story.json',
]);

const SECTORS = Object.freeze({
  hall: {
    title: 'LONG HALL / CALL CHAIN',
    anchors: ['canOfferChunkSurf', 'chunkSurfCompletion', 'TAKE_COMPLETED', 'beginTake', 'returnPoint'],
  },
  fork: {
    title: 'TUNING FORK',
    anchors: ['LANDMARK_TUNED', 'hasFork', 'tune', 'lightOn', 'currentWorldNoise'],
  },
  recordist: {
    title: 'PREVIOUS CONTRACTOR',
    anchors: ['recordist', 'takeProgress', 'sealTake', 'takes', 'recording'],
  },
  student: {
    title: 'STUDENT FILE',
    anchors: ['chapel-surfer', 'student-trained', 'music-inside-files', 'PROCESS'],
  },
  workOrder: {
    title: 'WORK ORDER',
    anchors: ['chapel-contract', 'five-rooms', 'account-feeds-body', 'TAKE_COMPLETED'],
  },
  body: {
    title: 'BODY RETURN',
    anchors: ['borrowed-body-return', 'BODY', 'RETURN', 'caughtCount', 'awareness'],
  },
  final: {
    title: 'FINAL REDACTION',
    anchors: ['source-not-body', 'borrowed-body-return', 'source-you', 'REDACTION_CONFIRMED'],
  },
  hush: {
    title: 'HUSH / PRESENCE',
    anchors: ['updatePresence', 'offerSoundTarget', 'publicSnapshot', 'targetX', 'huntSpeed', 'visibleFrom'],
  },
});

const UNSAFE = [
  /https?:\/\//i,
  /\/Users\//,
  /\b(process\.env|import\.meta\.env)\b/,
  /\b(?:password|secret|private[_-]?key|auth[_-]?token)\b\s*[:=]/i,
  /\b(?:TAURI_SIGNING|APPLE_|CODESIGN|NOTAR|GITHUB_TOKEN)\b/i,
];

function safeExactLine(line) {
  const text = String(line ?? '').replace(/\r$/, '');
  return !!text.trim() && text.length <= 240 && !UNSAFE.some((pattern) => pattern.test(text));
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jsTokens(text) {
  const out = [];
  const scanner = createScanner(false, LanguageVariant.Standard, text);
  for (;;) {
    const token = scanner.scan();
    if (token === SyntaxKind.EndOfFile) break;
    const value = scanner.getTokenText();
    if (!value || /^\s+$/.test(value)) continue;
    const start = scanner.getTokenStart(), end = scanner.getTokenEnd();
    const kind = isTriviaKind(token) ? 'comment'
      : isKeywordKind(token) ? 'keyword'
        : token === SyntaxKind.Identifier || token === SyntaxKind.PrivateIdentifier ? 'identifier'
          : token === SyntaxKind.NumericLiteral || token === SyntaxKind.BigIntLiteral ? 'number'
            : isLiteralKind(token) ? 'string'
              : isPunctuationKind(token) ? 'punctuation' : 'text';
    out.push({ text: value, kind, start, end });
  }
  return out;
}

function jsonTokens(text) {
  const out = [];
  const re = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g;
  for (const match of text.matchAll(re)) {
    const value = match[0];
    const after = text.slice((match.index || 0) + value.length);
    const kind = value[0] === '"'
      ? (/^\s*:/.test(after) ? 'property' : 'string')
      : /^-?\d/.test(value) ? 'number'
        : /^(true|false|null)$/.test(value) ? 'keyword' : 'punctuation';
    out.push({ text: value, kind, start: match.index || 0, end: (match.index || 0) + value.length });
  }
  return out;
}

function takeContext(file, index, radius = 7) {
  const out = [];
  for (let i = Math.max(0, index - radius); i <= Math.min(file.lines.length - 1, index + radius); i += 1) {
    const text = file.lines[i];
    if (!safeExactLine(text)) continue;
    const language = file.language;
    out.push({
      id: `${file.path}:${i + 1}:${hash(text)}`,
      file: file.path,
      line: i + 1,
      text,
      hash: hash(text),
      referenceHash: hash(`${file.path}:${i + 1}:${text}`),
      language,
      tokens: language === 'json' ? jsonTokens(text) : jsTokens(text),
    });
  }
  return out;
}

function selectSector(files, id, spec) {
  const lines = [];
  const seen = new Set();
  for (const file of files) {
    for (let index = 0; index < file.lines.length; index += 1) {
      const lower = file.lines[index].toLowerCase();
      if (!spec.anchors.some((anchor) => lower.includes(String(anchor).toLowerCase()))) continue;
      for (const entry of takeContext(file, index)) {
        const key = `${entry.file}:${entry.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(entry);
      }
    }
  }
  return { id, title: spec.title, anchors: spec.anchors, sourceLines: lines.slice(0, 120) };
}

const files = [];
for (const path of SOURCE_FILES) {
  const raw = await readFile(resolve(ROOT, path), 'utf8');
  files.push({ path, language: extname(path) === '.json' ? 'json' : 'javascript', lines: raw.split(/\r?\n/) });
}

const sectors = Object.fromEntries(
  Object.entries(SECTORS).map(([id, spec]) => [id, selectSector(files, id, spec)]),
);

for (const [id, sector] of Object.entries(sectors)) {
  if (sector.sourceLines.length < 8) throw new Error(`${id} has too few exact source lines`);
  for (const entry of sector.sourceLines) {
    const file = files.find((candidate) => candidate.path === entry.file);
    const exact = file?.lines?.[entry.line - 1];
    if (exact !== entry.text || hash(exact) !== entry.hash) {
      throw new Error(`${entry.file}:${entry.line} failed exact provenance validation`);
    }
  }
}

const all = new Map();
for (const sector of Object.values(sectors)) {
  for (const entry of sector.sourceLines) all.set(entry.id, entry);
}

const atlas = {
  schemaVersion: 2,
  id: 'chunk-surf.source-atlas',
  generatedFrom: SOURCE_FILES,
  exactSource: true,
  leakGuard: {
    policy: ['reject-network-addresses', 'reject-local-machine-paths', 'reject-credential-literals', 'reject-environment-reads'],
  },
  sectors,
  entries: Object.fromEntries([...all].sort(([a], [b]) => a.localeCompare(b))),
  stats: {
    files: SOURCE_FILES.length,
    sectors: Object.keys(sectors).length,
    sourceLines: all.size,
    javascriptLines: [...all.values()].filter((entry) => entry.language === 'javascript').length,
    jsonLines: [...all.values()].filter((entry) => entry.language === 'json').length,
  },
};

const json = `${JSON.stringify(atlas, null, 2)}\n`;
if (UNSAFE.some((pattern) => pattern.test(json))) throw new Error('generated atlas contains unsafe content');

const fullOut = resolve(ROOT, OUT);
await mkdir(dirname(fullOut), { recursive: true });
await writeFile(fullOut, json, 'utf8');
console.log(`Generated ${OUT}: ${atlas.stats.sectors} sectors, ${atlas.stats.sourceLines} exact source lines.`);
