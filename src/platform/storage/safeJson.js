export function safeJsonParse(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'NOT_STRING', value: null };
  try { return { ok: true, value: JSON.parse(raw), error: null }; }
  catch (error) { return { ok: false, value: null, error }; }
}

export function stableJsonStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
