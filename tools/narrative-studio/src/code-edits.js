// WORDS IN CODE. A document generated from a game module (content/narrative-
// runtime) is edited in the Studio like any other, but a save is written back
// into the module's string literals, so only words can change: a line's
// speaker and text, and a choice's text. Everything else in the document is
// the shape of the code — which beats exist, their order, where a choice
// leads, conditions — and is compared here and refused. The same check runs
// in the browser before an edit lands and on the server before a save.

const WORDS = { line: ['who', 'text'], choice: ['text'] };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const keysOf = (...objects) => [...new Set(objects.flatMap((o) => Object.keys(o || {})))]
  .filter((key) => objects.some((o) => o?.[key] !== undefined));

const SHAPE = {
  nodes: 'Beats are part of the code, so add, remove or rename them in the module',
  lines: 'Lines are added, removed and reordered in the module',
  choices: 'Choices are added, removed and reordered in the module',
};
const fieldName = (key) => ({ goto: 'where it continues', when: 'its condition', exit: 'its exit', cues: 'its cues', mutations: 'its flags', speaker: 'the beat heading', type: 'the beat type', regions: 'regions', entry: 'the entry beat', title: 'the title', notes: 'the notes', status: 'the status' }[key] || key);

export function codeEdits(base, next) {
  const edits = [], refused = [];
  const refuse = (where, what) => refused.push({ where, what });
  for (const key of keysOf(base, next)) {
    if (key === 'nodes') continue;
    if (!same(base[key], next[key])) refuse('document', `${fieldName(key)} is generated from the module`);
  }
  const baseIds = Object.keys(base.nodes || {}), nextIds = Object.keys(next.nodes || {});
  if (!same(baseIds, nextIds)) refuse('document', SHAPE.nodes);
  for (const id of baseIds) {
    const a = base.nodes[id], b = next.nodes?.[id];
    if (!b) continue;
    for (const key of keysOf(a, b)) {
      if (key === 'lines' || key === 'choices') continue;
      if (!same(a[key], b[key])) refuse(id, `${fieldName(key)} is set in the module`);
    }
    for (const [kind, key] of [['line', 'lines'], ['choice', 'choices']]) {
      const before = a[key] || [], after = b[key] || [];
      if (!same(before.map((item) => item.id), after.map((item) => item.id))) { refuse(id, SHAPE[key]); continue; }
      before.forEach((item, index) => {
        const other = after[index];
        for (const field of keysOf(item, other)) {
          if (WORDS[kind].includes(field)) {
            if ((item[field] ?? '') !== (other[field] ?? '')) edits.push({ kind, nodeId: id, id: item.id, field, from: item[field] ?? '', to: other[field] ?? '' });
          } else if (!same(item[field], other[field])) refuse(item.id, `${fieldName(field)} is set in the module`);
        }
      });
    }
  }
  return { edits, refused };
}

// The words a document's field may not take, from the server's codeFields:
// a field built entirely in code is locked; a partly built one names the
// parts ({room}, a helper's prefix) that have to stay as written.
export function codeFieldProblem(codeFields, id, field, value) {
  const rule = codeFields?.[id]?.[field];
  if (!rule) return '';
  if (rule.locked) return rule.locked;
  const missing = (rule.keep || []).filter((part) => !String(value ?? '').includes(part));
  return missing.length ? `Keep ${missing.map((part) => `“${part}”`).join(', ')} as written: ${missing.length === 1 ? 'it is' : 'they are'} built in code` : '';
}
