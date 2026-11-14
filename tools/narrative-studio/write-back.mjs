// WRITE-BACK. A Studio save of a document generated from a game module puts
// the new words into the module itself: the exporter keeps, for every line
// and choice, the pieces its text was read from (scripts/export-runtime-
// narrative.mjs) — literals with their spans, and fixed parts such as
// constants, {holes} and a helper's own text. An edit is mapped onto the
// literals, each changed literal is re-encoded in its own quoting, and the
// file is patched only where the literal still reads exactly as exported.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { codeEdits } from './src/code-edits.js';

const joined = (pieces) => pieces.map((p) => p.t).join('');

// Put the change into the one region of the old text that differs; the
// pieces it touches must all be literals. Insertion at a boundary goes to
// the literal it touches, so "Hello{name}" + "," still finds "Hello".
function spliceRegion(pieces, next) {
  const old = joined(pieces), offsets = [];
  let o = 0; for (const p of pieces) { offsets.push(o); o += p.t.length; }
  const max = Math.min(old.length, next.length);
  let p = 0; while (p < max && old[p] === next[p]) p++;
  let s = 0; while (s < max - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const x = p, y = old.length - s, r = next.slice(p, next.length - s), values = new Map();
  if (x === y) {
    let k = pieces.findIndex((pc, i) => pc.lit && offsets[i] < x && x < offsets[i] + pc.t.length);
    if (k < 0) k = pieces.findIndex((pc, i) => pc.lit && offsets[i] + pc.t.length === x);
    if (k < 0) k = pieces.findIndex((pc, i) => pc.lit && offsets[i] === x);
    if (k < 0) return null;
    const at = x - offsets[k];
    values.set(k, pieces[k].t.slice(0, at) + r + pieces[k].t.slice(at));
    return values;
  }
  const hit = pieces.map((_, i) => i).filter((i) => pieces[i].t.length && offsets[i] < y && offsets[i] + pieces[i].t.length > x);
  if (!hit.length || hit.some((i) => !pieces[i].lit)) return null;
  hit.forEach((i, n) => {
    const t = pieces[i].t, from = Math.max(0, x - offsets[i]), to = Math.min(t.length, y - offsets[i]);
    values.set(i, t.slice(0, from) + (n === 0 ? r : '') + t.slice(to));
  });
  return values;
}

// When the edit is spread out, find the fixed parts in order and give each
// gap between them to the literals there.
function anchorFixed(pieces, next) {
  const values = new Map();
  let cursor = 0, run = [];
  const flush = (end) => {
    const gap = next.slice(cursor, end);
    if (!run.length) return gap === '';
    const sub = run.map((i) => pieces[i]), inner = spliceRegion(sub, gap);
    if (!inner) return false;
    for (const [k, v] of inner) values.set(run[k], v);
    return true;
  };
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].lit) { run.push(i); continue; }
    if (!pieces[i].t) continue;
    const at = next.indexOf(pieces[i].t, cursor);
    if (at < 0 || !flush(at)) return null;
    cursor = at + pieces[i].t.length; run = [];
  }
  return flush(next.length) ? values : null;
}

export function assignText(pieces, next) {
  if (!pieces?.some((p) => p.lit)) throw new Error('Set in code, not written on this line, so it is changed in the module');
  if (joined(pieces) === next) return new Map();
  const values = spliceRegion(pieces, next) ?? anchorFixed(pieces, next);
  if (!values) {
    const keep = [...new Set(pieces.filter((p) => !p.lit && p.t.trim()).map((p) => p.t))];
    throw new Error(`Keep ${keep.map((t) => `“${t}”`).join(', ')} as written: built in code`);
  }
  for (const [i, v] of values) if (v === pieces[i].t) values.delete(i);
  return values;
}

// The new words in the literal's own quoting.
export function encodeLiteral(value, lit) {
  if (lit.kind === 'quasi') {
    let body = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r');
    if (!lit.raw.includes('\n')) body = body.replace(/\n/g, '\\n');
    return body;
  }
  const q = lit.raw[0] === '"' ? '"' : "'";
  return q + value.replace(/\\/g, '\\\\').replace(q === '"' ? /"/g : /'/g, `\\${q}`)
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + q;
}

function itemsOf(doc) {
  const items = new Map();
  for (const node of Object.values(doc.nodes || {})) {
    for (const line of node.lines || []) items.set(line.id, { item: line, words: ['who', 'text'] });
    for (const choice of node.choices || []) items.set(choice.id, { item: choice, words: ['text'] });
  }
  return items;
}
const spanKey = (lit) => `${lit.file}:${lit.start}:${lit.end}`;

// base: the document as the Studio loaded it; edited: what it reads now;
// current/edits: a fresh export of the module and its pieces. A field that
// moved in code since the Studio loaded it is a conflict, never overwritten.
export function planWriteBack({ base, edited, current, edits, module }) {
  const { edits: changes, refused } = codeEdits(base, edited);
  const conflicts = [], bySpan = new Map();
  if (refused.length) return { changes, refused, conflicts, patches: [], alsoChanged: [] };
  const now = itemsOf(current);
  for (const change of changes) {
    const item = now.get(change.id)?.item;
    if (!item || (item[change.field] ?? '') !== change.from) { conflicts.push({ where: change.id, what: 'This changed in the code after the Studio loaded it. Reload, then make the edit again' }); continue; }
    let values;
    try { values = assignText(edits.get(change.id)?.[change.field], change.to); }
    catch (error) { refused.push({ where: change.id, what: error.message }); continue; }
    const pieces = edits.get(change.id)[change.field];
    for (const [i, value] of values) {
      const lit = pieces[i].lit, key = spanKey(lit), prior = bySpan.get(key);
      if (module && lit.file !== module) { refused.push({ where: change.id, what: `These words live in ${lit.file}` }); continue; }
      if (prior && prior.value !== value) { refused.push({ where: change.id, what: `Shares its words in code with ${prior.id}; give both the same text` }); continue; }
      bySpan.set(key, { lit, value, id: change.id });
    }
  }
  const edited_ = new Set(changes.map((c) => `${c.id}#${c.field}`)), alsoChanged = [];
  for (const [id, fields] of edits) for (const [field, pieces] of Object.entries(fields || {})) {
    if (edited_.has(`${id}#${field}`)) continue;
    if (pieces?.some((p) => p.lit && bySpan.has(spanKey(p.lit)))) alsoChanged.push(`${id}#${field}`);
  }
  const patches = [...bySpan.values()].map(({ lit, value }) => ({ file: lit.file, start: lit.start, end: lit.end, expect: lit.raw, text: encodeLiteral(value, lit) }));
  return { changes, refused, conflicts, patches, alsoChanged };
}

// Patch each file where its literals still read exactly as exported. Only
// .js files under src/ are ever written; one file is replaced in one rename.
export async function applyPatches(patches, root) {
  const srcRoot = resolve(root, 'src'), byFile = new Map();
  for (const patch of patches) byFile.set(patch.file, [...(byFile.get(patch.file) || []), patch]);
  const plans = [];
  for (const [file, list] of byFile) {
    const full = resolve(root, file);
    if (!full.startsWith(`${srcRoot}${sep}`) || !full.endsWith('.js')) throw new Error(`${file} is not a game module`);
    const source = await readFile(full, 'utf8');
    list.sort((a, b) => b.start - a.start);
    let out = source, floor = Infinity;
    for (const patch of list) {
      if (patch.end > floor) throw new Error(`${file}: two edits overlap`);
      if (source.slice(patch.start, patch.end) !== patch.expect) throw new Error(`${file} changed while saving; reload and try again`);
      out = out.slice(0, patch.start) + patch.text + out.slice(patch.end);
      floor = patch.start;
    }
    plans.push({ full, file, out });
  }
  for (const { full, out } of plans) {
    const temporary = `${full}.${process.pid}.studio.tmp`;
    await writeFile(temporary, out, 'utf8');
    await rename(temporary, full);
  }
  return plans.map((p) => p.file);
}

// What the Studio shows about each field: locked (built entirely in code) or
// the fixed parts to keep. Fields with nothing to say are left out.
export function codeFields(doc, edits) {
  const out = {};
  const locked = { locked: 'Set in code, not written on this line, so it is changed in the module' };
  for (const [id, { words }] of itemsOf(doc)) {
    for (const field of words) {
      const pieces = edits?.get(id)?.[field];
      if (!pieces?.some((p) => p.lit)) { (out[id] ||= {})[field] = locked; continue; }
      const keep = [...new Set(pieces.filter((p) => !p.lit && p.t.trim()).map((p) => p.t))];
      if (keep.length) (out[id] ||= {})[field] = { keep };
    }
  }
  return out;
}
