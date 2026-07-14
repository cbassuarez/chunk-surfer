// Shared, deliberately small condition language for authored story content.
// It mirrors the game's flag grammar but evaluates against an explicit context,
// which makes the same content deterministic in the game, tests, and studio.

const CMP = /^([A-Za-z_][\w.]*)\s*(>=|<=|==|!=|>|<)\s*(.+)$/;

export function contextValue(context, path) {
  const parts = String(path || '').split('.');
  let value = context;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

function literal(value) {
  const src = String(value).trim();
  if (/^-?\d+(?:\.\d+)?$/.test(src)) return Number(src);
  if (src === 'true') return true;
  if (src === 'false') return false;
  if (src === 'null') return null;
  return src.replace(/^(['"])(.*)\1$/, '$2');
}

function atom(expression, context) {
  const src = String(expression || '').trim();
  if (!src) return true;
  if (src.startsWith('!')) return !atom(src.slice(1), context);
  const match = CMP.exec(src);
  if (!match) return !!contextValue(context, src);
  const left = contextValue(context, match[1]);
  const right = literal(match[3]);
  switch (match[2]) {
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    case '==': return left == right; // Authored DSL intentionally permits numeric string comparisons.
    case '!=': return left != right;
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    default: return false;
  }
}

export function evaluateCondition(expression, context = {}) {
  if (expression == null || expression === '') return true;
  return String(expression).split('||').some((clause) =>
    clause.split('&&').every((part) => atom(part, context)));
}

export function applyMutations(context = {}, mutations = {}) {
  const next = structuredClone(context);
  const flags = next.flags || (next.flags = {});
  for (const entry of mutations.set || []) {
    const [name, raw] = String(entry).split('=');
    const value = raw === undefined ? true : literal(raw);
    flags[name.trim()] = value;
  }
  for (const name of mutations.clear || []) flags[String(name).trim()] = false;
  return next;
}

export function interpolateStoryText(text, context = {}) {
  return String(text ?? '').replace(/\{([A-Za-z_][\w.]*)\}/g, (whole, path) => {
    const value = contextValue(context, path);
    return value == null ? whole : String(value);
  });
}
