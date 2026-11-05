// Every line the game can say, for the Narrative Studio.
//
// Much of the game's dialogue is authored straight in JS: conversation trees,
// bench talks, bouncers, vigils, the bust, thought trees, barks built inside
// functions. The studio's canonical documents (content/narrative) only cover
// what was imported, so the studio went stale every time dialogue was written
// in code. This reads the SOURCE itself with the TypeScript parser and collects
// every dialogue line ({who, text}), thought (lines: [...]), choice (an item of
// a choices/options array with text or label) and inspection (inspect(a, b) or
// {first, again}) wherever it sits, then writes one read-only studio document
// per module into content/narrative-runtime/. The game never reads these: they
// are a view of the code, regenerated on every studio launch.
//
//   node scripts/export-runtime-narrative.mjs          write
//   node scripts/export-runtime-narrative.mjs --check  exit 1 if stale
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { stableJson, validateNarrativeDocument } from '../src/narrative/contracts.js';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'src');
export const RUNTIME_NARRATIVE_DIR = resolve(ROOT, 'content/narrative-runtime');
// Modules whose dialogue the studio already owns canonically (the runtime
// reads the studio documents, these are their legacy import sources).
const CANONICAL_MODULES = new Set(['data/battles.js', 'data/radio-script.js', 'data/prologue.js']);
const SKIP = [/^narrative\/generated-content\.js$/, /^prototypes\//, /^debug\//];
const STRUCTURAL = new Set(['lines', 'choices', 'options', 'responses', 'replies', 'say', 'text', 'label', 'who', 'speaker', 'first', 'again']);
const CHOICE_ARRAYS = new Set(['choices', 'options', 'responses', 'replies', 'answers']);
const ID = /^[a-z0-9][a-z0-9._-]*$/i;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

function propName(key) {
  if (!key) return null;
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') return key.name;
  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')) return String(key.value);
  return null;
}

// Text a player can read from an expression: literals, templates (holes
// shown as {expr}), concatenations, and either side of a ternary.
function textOf(expr, src) {
  if (!expr) return null;
  if (expr.type === 'ParenthesizedExpression') return textOf(expr.expression, src);
  if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
  if (expr.type === 'TemplateLiteral') {
    let out = '';
    expr.quasis.forEach((q, i) => { out += q.value.cooked ?? q.value.raw; if (expr.expressions[i]) out += `{${src.slice(expr.expressions[i].start, expr.expressions[i].end).replace(/\s+/g, ' ')}}`; });
    return out;
  }
  if (expr.type === 'BinaryExpression' && expr.operator === '+') {
    const a = textOf(expr.left, src), b = textOf(expr.right, src);
    if (a == null && b == null) return null;
    return `${a ?? `{${src.slice(expr.left.start, expr.left.end)}}`}${b ?? `{${src.slice(expr.right.start, expr.right.end)}}`}`;
  }
  if (expr.type === 'ConditionalExpression') {
    const a = textOf(expr.consequent, src), b = textOf(expr.alternate, src);
    if (a == null && b == null) return null;
    return [a, b].filter((v) => v != null && v !== '').join(' / ');
  }
  return null;
}

function objectProps(obj) {
  const props = new Map();
  for (const p of obj.properties) if (p.type === 'Property' && !p.computed) { const n = propName(p.key); if (n) props.set(n, p.value); }
  return props;
}

function sanitize(value) {
  let id = String(value || '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^[^a-z0-9]+/i, '').replace(/-+/g, '-');
  return id || 'root';
}

function children(n) {
  const out = [];
  for (const [key, value] of Object.entries(n)) {
    if (key === 'start' || key === 'end' || key === 'type' || !value || typeof value !== 'object') continue;
    if (Array.isArray(value)) { for (const v of value) if (v && typeof v.type === 'string') out.push(v); }
    else if (typeof value.type === 'string') out.push(value);
  }
  return out;
}

export function extractModule(source, file) {
  const ast = parseAst(source, { lang: 'js' });
  const lineStarts = [0]; for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineAt = (n) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= n.start) lo = mid; else hi = mid - 1; } return lo + 1; };
  const nodes = new Map();
  const node = (path) => {
    const id = sanitize(path.filter(Boolean).join('.')) || 'root';
    if (!nodes.has(id)) nodes.set(id, { path: [...path], lines: [], choices: [], at: null });
    return nodes.get(id);
  };
  const emitLine = (path, item, at) => { if (!String(item.text || '').trim()) return; const n = node(path); n.lines.push(item); n.at ??= at; };
  const emitChoice = (path, item, at) => { const n = node(path); n.choices.push(item); n.at ??= at; };

  function visit(n, path, ctx) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ObjectExpression') {
      const props = objectProps(n), at = lineAt(n);
      const who = textOf(props.get('who') ?? props.get('speaker'), source);
      const text = textOf(props.get('text'), source);
      let consumed = false;
      if (who != null && text != null) {
        const line = { who, text, source: `${file}:${at}` };
        const q = props.get('quotes'), quotes = textOf(q, source); if (quotes) line.quotes = quotes; else if (q) line.quotesExpr = source.slice(q.start, q.end);
        emitLine(path, line, at); consumed = true;
      } else if (ctx.inChoices && (text != null || props.has('label'))) {
        const label = text ?? textOf(props.get('label'), source);
        if (label) {
          const target = textOf(props.get('goto') ?? props.get('next') ?? props.get('to') ?? props.get('target') ?? props.get('node'), source);
          const id = textOf(props.get('id'), source);
          emitChoice(path, { text: label, target, choiceId: id, source: `${file}:${at}` }, at); consumed = true;
        }
      }
      const lines = props.get('lines');
      if (lines && lines.type === 'ArrayExpression') {
        for (const el of lines.elements) { const t = textOf(el, source); if (t != null) emitLine(path, { who: who || 'thought', text: t, source: `${file}:${lineAt(el)}` }, at); }
      }
      const first = textOf(props.get('first'), source), again = textOf(props.get('again'), source);
      if (first != null && again != null) {
        emitLine(path, { who: 'inspect', text: first, source: `${file}:${at}` }, at);
        emitLine(path, { who: 'inspect', text: `(again) ${again}`, source: `${file}:${at}` }, at);
      }
      for (const p of n.properties) {
        if (p.type !== 'Property') { visit(p, path, { inChoices: false }); continue; }
        const key = p.computed ? null : propName(p.key);
        if (consumed && key && STRUCTURAL.has(key)) continue;
        if (key === 'lines' || key === 'first' || key === 'again') continue;
        const nextPath = key && !STRUCTURAL.has(key) && !/^\d+$/.test(key) ? [...path, key] : path;
        visit(p.value, nextPath, { inChoices: !!key && CHOICE_ARRAYS.has(key) });
      }
      return;
    }
    if (n.type === 'ArrayExpression') { for (const el of n.elements) visit(el, path, ctx); return; }
    if (n.type === 'CallExpression') {
      const callee = source.slice(n.callee.start, n.callee.end);
      if (/(^|\.)inspect$/.test(callee) && n.arguments.length >= 1) {
        const a = textOf(n.arguments[0], source), b = textOf(n.arguments[1], source);
        if (a != null) emitLine(path, { who: 'inspect', text: a, source: `${file}:${lineAt(n)}` }, lineAt(n));
        if (b != null) emitLine(path, { who: 'inspect', text: `(again) ${b}`, source: `${file}:${lineAt(n)}` }, lineAt(n));
      }
    }
    if (n.type === 'FunctionDeclaration' && n.id?.name) { for (const c of children(n)) visit(c, [...path, n.id.name], { inChoices: false }); return; }
    if (n.type === 'MethodDefinition' && !n.computed) { visit(n.value, [...path, propName(n.key)], { inChoices: false }); return; }
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.init) { visit(n.init, [...path, n.id.name], { inChoices: false }); return; }
    for (const c of children(n)) visit(c, path, ctx.inChoices && (c.type === 'ParenthesizedExpression' || c.type === 'SpreadElement' || c.type === 'ConditionalExpression' || c.type === 'LogicalExpression') ? ctx : { inChoices: false });
  }
  for (const stmt of ast.body) visit(stmt, [], { inChoices: false });
  return nodes;
}

export function documentFor(rel, nodes, { skipNodePrefixes = [] } = {}) {
  const id = sanitize(`runtime.${rel.replace(/\.js$/, '').split(sep).join('.').split('/').join('.')}`);
  const out = {}, entries = [];
  for (const [nodeId, n] of nodes) {
    if (!n.lines.length && !n.choices.length) continue;
    if (skipNodePrefixes.some((p) => nodeId === p || nodeId.startsWith(`${p}.`))) continue;
    out[nodeId] = { id: nodeId, type: n.choices.length ? 'choice' : 'line', lines: [], choices: [], source: n.lines[0]?.source || n.choices[0]?.source };
    entries.push(nodeId);
  }
  for (const nodeId of entries) {
    const n = nodes.get(nodeId), doc = out[nodeId];
    n.lines.forEach((line, i) => doc.lines.push({ id: `${nodeId}.l${i}`, ...line }));
    n.choices.forEach((choice, i) => {
      const item = { id: `${nodeId}.c${i}`, text: choice.text, source: choice.source };
      if (choice.choiceId) item.choiceId = choice.choiceId;
      if (choice.target) {
        const prefix = nodeId.split('.').slice(0, -1).join('.');
        const hit = [`${prefix}.${choice.target}`, choice.target, `${nodeId.split('.')[0]}.${choice.target}`].find((c) => out[sanitize(c)]);
        if (hit) item.goto = sanitize(hit); else item.targetName = choice.target;
      }
      doc.choices.push(item);
    });
    if (!doc.choices.length) delete doc.choices;
  }
  if (!entries.length) return null;
  return {
    schemaVersion: 1, id, title: `Runtime · ${rel}`, status: 'reference', readOnly: true, entry: entries[0], entries,
    tags: ['runtime', 'derived'],
    notes: `Generated from src/${rel} by scripts/export-runtime-narrative.mjs. Read-only: the game reads the module, not this document. Edit the module (or move the dialogue into content/narrative) and relaunch the studio.`,
    nodes: out,
  };
}

export async function exportRuntimeNarrative({ write = true } = {}) {
  const project = JSON.parse(await readFile(resolve(ROOT, 'content/project.json'), 'utf8'));
  const canonicalIds = new Set();
  for (const path of project.narrative || []) {
    try { canonicalIds.add(JSON.parse(await readFile(resolve(ROOT, 'content', path), 'utf8')).id); } catch (_) {}
  }
  const documents = [], index = [];
  for (const full of await walk(SRC)) {
    const rel = relative(SRC, full).split(sep).join('/');
    if (CANONICAL_MODULES.has(rel) || SKIP.some((re) => re.test(rel))) continue;
    const source = await readFile(full, 'utf8');
    if (!/\bwho\s*:|\blines\s*:|\bchoices\s*:|\boptions\s*:|inspect\(|\bfirst\s*:/.test(source)) continue;
    const nodes = extractModule(source, `src/${rel}`);
    // conservatory-script exports already imported as studio trees stay canonical.
    const skipNodePrefixes = rel === 'data/conservatory-script.js'
      ? [...nodes.keys()].map((k) => k.split('.')[0]).filter((k) => canonicalIds.has(`conservatory.${k.toLowerCase()}`))
      : [];
    const doc = documentFor(rel, nodes, { skipNodePrefixes });
    if (!doc) continue;
    // A trace whose quoted source is computed at runtime has no literal to
    // check here; that is a fact about the code, not an authoring error.
    const result = validateNarrativeDocument(doc);result.errors=result.errors.filter((e)=>!/\.quotes$/.test(e.path));result.ok=!result.errors.length;
    if (!result.ok) throw new Error(`${rel}: ${result.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')}`);
    const lines = Object.values(doc.nodes).reduce((n, x) => n + x.lines.length, 0), choices = Object.values(doc.nodes).reduce((n, x) => n + (x.choices?.length || 0), 0);
    documents.push(doc);
    index.push({ id: doc.id, path: `narrative-runtime/${doc.id}.story.json`, module: `src/${rel}`, nodes: doc.entries.length, lines, choices, sourceSha256: createHash('sha256').update(source).digest('hex') });
  }
  const files = new Map(documents.map((doc) => [`${doc.id}.story.json`, stableJson(doc)]));
  files.set('index.json', stableJson({ schemaVersion: 1, generator: 'scripts/export-runtime-narrative.mjs', documents: index }));
  if (write) {
    await mkdir(RUNTIME_NARRATIVE_DIR, { recursive: true });
    for (const name of await readdir(RUNTIME_NARRATIVE_DIR)) if (!files.has(name)) await rm(resolve(RUNTIME_NARRATIVE_DIR, name));
    for (const [name, text] of files) await writeFile(resolve(RUNTIME_NARRATIVE_DIR, name), text, 'utf8');
  }
  return { files, index };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const check = process.argv.includes('--check');
  const { files, index } = await exportRuntimeNarrative({ write: !check });
  if (check) {
    let stale = [];
    for (const [name, text] of files) { let have = null; try { have = await readFile(resolve(RUNTIME_NARRATIVE_DIR, name), 'utf8'); } catch (_) {} if (have !== text) stale.push(name); }
    const present = await readdir(RUNTIME_NARRATIVE_DIR).catch(() => []);
    stale.push(...present.filter((name) => !files.has(name)));
    if (stale.length) { console.error(`runtime narrative is stale (${stale.length}): ${stale.slice(0, 8).join(', ')}. Run node scripts/export-runtime-narrative.mjs`); process.exit(1); }
  }
  const totals = index.reduce((t, d) => ({ docs: t.docs + 1, lines: t.lines + d.lines, choices: t.choices + d.choices }), { docs: 0, lines: 0, choices: 0 });
  console.log(JSON.stringify(totals));
}
