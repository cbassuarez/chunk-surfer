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
//   npm run studio:runtime                              write
//   node scripts/export-runtime-narrative.mjs --check  exit 1 if stale
//
// The studio server runs this at launch and again whenever src/ changes.
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { stableJson, validateNarrativeDocument } from '../src/narrative/contracts.js';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'src');
export const RUNTIME_NARRATIVE_DIR = resolve(ROOT, 'content/narrative-runtime');
// Text the studio already owns in content/narrative is never listed again
// here: a module the studio imported from (battles, radio, prologue) shows
// only what the import left behind.
const SKIP = [/^narrative\/generated-content\.js$/, /^prototypes\//, /^debug\//];
const STRUCTURAL = new Set(['lines', 'choices', 'options', 'responses', 'replies', 'say', 'text', 'label', 'who', 'speaker', 'first', 'again', 'prompt']);
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
// Module-level string constants (const RUTH = 'Ruth'), so a speaker or line
// named by a constant resolves to its words instead of being dropped.
let CONSTANTS = new Map();
function textOf(expr, src) {
  if (!expr) return null;
  if (expr.type === 'ParenthesizedExpression') return textOf(expr.expression, src);
  if (expr.type === 'Identifier') return CONSTANTS.get(expr.name) ?? null;
  if (expr.type === 'MemberExpression' && !expr.computed) { const v = CONSTANTS.get(src.slice(expr.start, expr.end)); if (v != null) return v; }
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

function collectConstants(ast, src) {
  const out = new Map();
  const visitDecl = (d) => {
    if (d?.type !== 'VariableDeclaration') return;
    for (const v of d.declarations) {
      if (v.id?.type !== 'Identifier' || !v.init) continue;
      const init = v.init.type === 'CallExpression' && /freeze$/.test(src.slice(v.init.callee.start, v.init.callee.end)) ? v.init.arguments[0] : v.init;
      const t = textOf(init, src); if (t != null) { out.set(v.id.name, t); continue; }
      // const WHO = Object.freeze({ RUTH: 'Ruth', ... }) → WHO.RUTH
      if (init?.type === 'ObjectExpression') for (const p of init.properties) if (p.type === 'Property' && !p.computed) { const k = propName(p.key), pv = textOf(p.value, src); if (k && pv != null) out.set(`${v.id.name}.${k}`, pv); }
    }
  };
  for (const stmt of ast.body) visitDecl(stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt);
  return out;
}

// LINE HELPERS. Much dialogue is written through tiny builders,
// const r = text => line('ren', text), choice('Ask…', 'goto'), so the object
// literal never appears at the call site. Each function in the module is read
// once; a call is then evaluated symbolically, its parameters bound to the
// call's arguments, through nested helpers and spreads, to the object it builds.
let HELPERS = new Map();
const unwrapFreeze = (e, src) => {
  while (e && (e.type === 'ParenthesizedExpression' || (e.type === 'CallExpression' && /(^|\.)(freeze|deepFreeze)$/.test(src.slice(e.callee.start, e.callee.end)) && e.arguments[0]))) e = e.type === 'ParenthesizedExpression' ? e.expression : e.arguments[0];
  return e;
};
function returnOf(fn) {
  if (!fn) return null;
  if (fn.body?.type !== 'BlockStatement') return fn.body;
  const ret = fn.body.body.filter((st) => st.type === 'ReturnStatement');
  return ret.length === 1 ? ret[0].argument : null;
}
function collectHelpers(ast) {
  const out = new Map();
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id?.name) out.set(n.id.name, n);
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && (n.init?.type === 'ArrowFunctionExpression' || n.init?.type === 'FunctionExpression')) out.set(n.id.name, n.init);
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.init?.type === 'Identifier') out.set(n.id.name, { alias: n.init.name });
    for (const c of children(n)) visit(c);
  };
  for (const st of ast.body) visit(st);
  for (const [name, fn] of out) if (fn.alias) { const target = out.get(fn.alias); if (target && !target.alias) out.set(name, target); else out.delete(name); }
  return out;
}
function valueText(expr, env, src, depth = 0) {
  if (!expr || depth > 6) return null;
  if (expr.type === 'ParenthesizedExpression') return valueText(expr.expression, env, src, depth);
  if (expr.type === 'Identifier' && env.has(expr.name)) { const b = env.get(expr.name); return b ? valueText(b.node, b.env, src, depth + 1) : null; }
  if (expr.type === 'CallExpression' && src.slice(expr.callee.start, expr.callee.end) === 'String' && expr.arguments[0]) return valueText(expr.arguments[0], env, src, depth + 1);
  // name.toUpperCase() and the like, as speaker labels are often written.
  if (expr.type === 'CallExpression' && expr.callee.type === 'MemberExpression' && !expr.callee.computed && ['toUpperCase', 'toLowerCase', 'trim'].includes(expr.callee.property.name)) {
    const inner = valueText(expr.callee.object, env, src, depth + 1);
    return inner == null ? null : inner[expr.callee.property.name]();
  }
  if (expr.type === 'TemplateLiteral') {
    let out = '';
    expr.quasis.forEach((q, i) => { out += q.value.cooked ?? q.value.raw; const h = expr.expressions[i]; if (h) out += valueText(h, env, src, depth + 1) ?? `{${src.slice(h.start, h.end).replace(/\s+/g, ' ')}}`; });
    return out;
  }
  if (expr.type === 'BinaryExpression' && expr.operator === '+') {
    const a = valueText(expr.left, env, src, depth + 1), b = valueText(expr.right, env, src, depth + 1);
    return a == null && b == null ? null : `${a ?? `{${src.slice(expr.left.start, expr.left.end)}}`}${b ?? `{${src.slice(expr.right.start, expr.right.end)}}`}`;
  }
  if (expr.type === 'ConditionalExpression' || expr.type === 'LogicalExpression') {
    const a = valueText(expr.consequent ?? expr.left, env, src, depth + 1), b = valueText(expr.alternate ?? expr.right, env, src, depth + 1);
    return a == null && b == null ? null : [a, b].filter((v) => v != null && v !== '').join(' / ');
  }
  return textOf(expr, src);
}
// The object a helper call builds: key -> {node, env}.
function shapeOf(expr, env, src, depth = 0) {
  expr = unwrapFreeze(expr, src);
  if (!expr || depth > 5) return null;
  if (expr.type === 'Identifier' && env.has(expr.name)) { const b = env.get(expr.name); return b ? shapeOf(b.node, b.env, src, depth + 1) : null; }
  if (expr.type === 'ObjectExpression') {
    const shape = new Map();
    for (const p of expr.properties) {
      if (p.type === 'SpreadElement') { const inner = shapeOf(p.argument, env, src, depth + 1); if (inner) for (const [k, v] of inner) shape.set(k, v); continue; }
      if (p.type !== 'Property' || p.computed) continue;
      const k = propName(p.key); if (k) shape.set(k, { node: p.value, env });
    }
    return shape;
  }
  if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier' && HELPERS.has(expr.callee.name)) return callShape(expr, env, src, depth + 1);
  return null;
}
function callShape(call, env, src, depth = 0) {
  const fn = HELPERS.get(call.callee.name), body = returnOf(fn);
  if (!fn || !body || depth > 5) return null;
  const bound = new Map();
  fn.params.forEach((param, i) => {
    const name = param.type === 'Identifier' ? param.name : param.type === 'AssignmentPattern' && param.left.type === 'Identifier' ? param.left.name : null;
    if (!name) return;
    const arg = call.arguments[i];
    bound.set(name, arg ? { node: arg, env } : param.type === 'AssignmentPattern' ? { node: param.right, env: new Map() } : null);
  });
  return shapeOf(body, bound, src, depth + 1);
}
const LINE_ARRAYS = /^(lines|remarks|barks|thoughts|murmurs|overheard)$/;
function stringsIn(node, out = []) {
  if (!node) return out;
  if (node.type === 'Literal' && typeof node.value === 'string') out.push(node.value);
  else if (node.type === 'TemplateLiteral' && !node.expressions.length) out.push(node.quasis[0].value.cooked);
  else if (node.type === 'ArrayExpression') for (const el of node.elements) stringsIn(el, out);
  return out;
}

// Constants imported from sibling modules resolve too (a line that says
// COASTAL_NOTE_THOUGHT shows its words). One level deep, cached per file.
const IMPORTED = new Map();
function importedConstants(ast, file) {
  const out = new Map();
  for (const st of ast.body) {
    if (st.type !== 'ImportDeclaration' || !/^\.{1,2}\//.test(st.source.value)) continue;
    const target = resolve(ROOT, file, '..', st.source.value);
    if (!IMPORTED.has(target)) {
      let table = new Map();
      try {
        const src = readFileSync(target, 'utf8'), outer = CONSTANTS, ast2 = parseAst(src, { lang: 'js' });
        CONSTANTS = new Map(); table = collectConstants(ast2, src); CONSTANTS = outer;
        // export { A, B } from './elsewhere.js' passes their words through.
        for (const st2 of ast2.body) if (st2.type === 'ExportNamedDeclaration' && st2.source && /^\.{1,2}\//.test(st2.source.value)) {
          try { const far = readFileSync(resolve(target, '..', st2.source.value), 'utf8'); CONSTANTS = new Map(); const t2 = collectConstants(parseAst(far, { lang: 'js' }), far); CONSTANTS = outer;
            for (const sp of st2.specifiers) { const name = sp.local.name ?? sp.local.value, as = sp.exported.name ?? sp.exported.value; if (t2.has(name)) table.set(as, t2.get(name)); } } catch (_) { CONSTANTS = outer; }
        }
      } catch (_) {}
      IMPORTED.set(target, table);
    }
    const table = IMPORTED.get(target);
    for (const sp of st.specifiers) {
      if (sp.type !== 'ImportSpecifier') continue;
      const name = sp.imported.name ?? sp.imported.value, local = sp.local.name;
      for (const [k, v] of table) if (k === name || k.startsWith(`${name}.`)) out.set(local + k.slice(name.length), v);
    }
  }
  return out;
}
const LINE_CONSTANT = /_(LINES|NOTES|THOUGHTS|BARKS|REMARKS)$/;

export function extractModule(source, file) {
  const ast = parseAst(source, { lang: 'js' });
  CONSTANTS = importedConstants(ast, file); for (const [k, v] of collectConstants(ast, source)) CONSTANTS.set(k, v); HELPERS = collectHelpers(ast);
  const lineStarts = [0]; for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineAt = (n) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= n.start) lo = mid; else hi = mid - 1; } return lo + 1; };
  const nodes = new Map();
  const node = (path) => {
    const id = sanitize(path.filter(Boolean).join('.')) || 'root';
    if (!nodes.has(id)) nodes.set(id, { path: [...path], lines: [], choices: [], at: null });
    return nodes.get(id);
  };
  const emitLine = (path, item, at) => { if (!String(item.text || '').trim()) return; const n = node(path); n.lines.push(item); n.at ??= at; };
  const emitChoice = (path, item, at) => { if (!String(item.text || '').trim()) return; const n = node(path); n.choices.push(item); n.at ??= at; };

  function visit(n, path, ctx) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ObjectExpression') {
      const props = objectProps(n), at = lineAt(n);
      const whoExpr = props.get('who') ?? props.get('speaker');
      const who = textOf(whoExpr, source) ?? (whoExpr ? `{${source.slice(whoExpr.start, whoExpr.end).replace(/\s+/g, ' ')}}` : null);
      const text = textOf(props.get('text'), source);
      let consumed = false;
      // An option the player picks (prompt) before the line it says.
      const prompt = textOf(props.get('prompt'), source);
      if (prompt != null && text != null) emitChoice(path, { text: prompt, source: `${file}:${at}` }, at);
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
      // A thing with its own id (a page, a voice, a topic) groups what it says.
      const ownId = consumed ? null : textOf(props.get('id'), source);
      if (ownId && path.at(-1) !== ownId) path = [...path, ownId];
      const lines = props.get('lines');
      if (lines && lines.type === 'ArrayExpression') {
        for (const el of lines.elements) { const t = el && textOf(el, source); if (t != null) emitLine(path, { who: who || 'thought', text: t, source: `${file}:${lineAt(el)}` }, at); }
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
        // Literal string arrays of lines and first/again pairs were emitted above;
        // anything else under those keys (lines(...) helpers, spreads) is walked.
        if (key === 'lines' && p.value.type === 'ArrayExpression' && p.value.elements.every((el) => el && textOf(el, source) != null)) continue;
        if ((key === 'first' || key === 'again') && textOf(p.value, source) != null) continue;
        const nextPath = key && !STRUCTURAL.has(key) && !/^\d+$/.test(key) ? [...path, key] : path;
        visit(p.value, nextPath, { inChoices: !!key && CHOICE_ARRAYS.has(key) });
      }
      return;
    }
    if (n.type === 'ArrayExpression') { for (const el of n.elements) visit(el, path, ctx); return; }
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && HELPERS.has(n.callee.name)) {
      const shape = callShape(n, new Map(), source), at = lineAt(n);
      if (shape) {
        const get = (k) => shape.get(k), txt = (k) => get(k) ? valueText(get(k).node, get(k).env, source) : null;
        const whoB = get('who') ?? get('speaker');
        const who = whoB ? (valueText(whoB.node, whoB.env, source) ?? `{${source.slice(whoB.node.start, whoB.node.end).replace(/\s+/g, ' ')}}`) : null;
        const text = txt('text'), label = txt('label'), prompt = txt('prompt');
        const target = txt('goto') ?? txt('next') ?? txt('to');
        if (prompt != null && text != null) emitChoice(path, { text: prompt, target, source: `${file}:${at}` }, at);
        if (text != null && who != null) emitLine(path, { who, text, source: `${file}:${at}` }, at);
        else if (label != null && shape.has('value') && txt('value') != null) emitLine(path, { who: txt('type') || n.callee.name, text: `${label}: ${txt('value')}`, source: `${file}:${at}` }, at);
        else if ((text ?? label) != null && (target != null || ctx.inChoices || shape.has('hideWhenAsked'))) emitChoice(path, { text: text ?? label, target, choiceId: txt('id'), source: `${file}:${at}` }, at);
        else if (text != null) emitLine(path, { who: txt('type') || n.callee.name, text, source: `${file}:${at}` }, at);
        // Arrays of plain strings handed to a builder (n('odette', ['…']), guest(…, remarks)).
        for (const [k, b] of shape) if (LINE_ARRAYS.test(k)) {
          const expr = b.node.type === 'CallExpression' && b.node.callee.type === 'MemberExpression' ? b.node.callee.object : b.node;
          const arr = expr.type === 'Identifier' && b.env.has(expr.name) ? b.env.get(expr.name)?.node : expr;
          if (arr?.type === 'ArrayExpression') for (const t of stringsIn(arr)) emitLine(path, { who: who || label || n.callee.name, text: t, source: `${file}:${lineAt(arr)}` }, at);
        }
      }
    }
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
  // export const SOMETHING_LINES = ['…', '…']: copy kept as a list of lines.
  for (const stmt of ast.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const v of decl.declarations) {
      if (v.id?.type !== 'Identifier' || !LINE_CONSTANT.test(v.id.name)) continue;
      const arr = unwrapFreeze(v.init, source);
      if (arr?.type === 'ArrayExpression') for (const t of stringsIn(arr)) emitLine([v.id.name], { who: 'text', text: t, source: `${file}:${lineAt(arr)}` }, lineAt(arr));
    }
  }
  return nodes;
}

export function documentFor(rel, nodes, { skipNodePrefixes = [], canonicalText = new Set() } = {}) {
  for (const n of nodes.values()) {
    n.lines = n.lines.filter((line) => !canonicalText.has(line.text));
    n.choices = n.choices.filter((choice) => !canonicalText.has(choice.text));
  }
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
    tags: ['runtime', 'derived'], regions: [], module: `src/${rel}`,
    notes: `Generated from src/${rel} by scripts/export-runtime-narrative.mjs. Read-only: the game reads the module, not this document. Edit the module (or move the dialogue into content/narrative) and relaunch the studio.`,
    nodes: out,
  };
}

export async function exportRuntimeNarrative({ write = true } = {}) {
  const project = JSON.parse(await readFile(resolve(ROOT, 'content/project.json'), 'utf8'));
  const canonicalIds = new Set(), canonicalText = new Set();
  for (const path of project.narrative || []) {
    try {
      const doc = JSON.parse(await readFile(resolve(ROOT, 'content', path), 'utf8'));
      canonicalIds.add(doc.id);
      for (const n of Object.values(doc.nodes || {})) { for (const line of n.lines || []) canonicalText.add(line.text); for (const choice of n.choices || []) canonicalText.add(choice.text); }
    } catch (_) {}
  }
  const documents = [], index = [];
  for (const full of await walk(SRC)) {
    const rel = relative(SRC, full).split(sep).join('/');
    if (SKIP.some((re) => re.test(rel))) continue;
    const source = await readFile(full, 'utf8');
    if (!/\bwho\s*:|\blines\s*:|\bchoices\s*:|\boptions\s*:|inspect\(|\bfirst\s*:|\btext\s*[:,)}]|_(LINES|NOTES|THOUGHTS|BARKS|REMARKS)\b/.test(source)) continue;
    const nodes = extractModule(source, `src/${rel}`);
    // conservatory-script exports already imported as studio trees stay canonical.
    const skipNodePrefixes = rel === 'data/conservatory-script.js'
      ? [...nodes.keys()].map((k) => k.split('.')[0]).filter((k) => canonicalIds.has(`conservatory.${k.toLowerCase()}`))
      : [];
    const doc = documentFor(rel, nodes, { skipNodePrefixes, canonicalText });
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
    // Only what changed is written, so the studio's file watcher hears real edits.
    for (const [name, text] of files) { let have = null; try { have = await readFile(resolve(RUNTIME_NARRATIVE_DIR, name), 'utf8'); } catch (_) {} if (have !== text) await writeFile(resolve(RUNTIME_NARRATIVE_DIR, name), text, 'utf8'); }
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
