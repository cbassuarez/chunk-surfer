// Presentation receipts only. These never grant knowledge, accept work, move
// a quest or choose a map target; the quest owners remain authoritative.
const VERSION = 1;
const LIMIT = 64;
const own = (value) => value && typeof value === 'object' && !Array.isArray(value);
export const journalTrackable = entry => !!entry && (typeof entry.trackable === 'boolean' ? entry.trackable : entry.state === 'active');
export const journalTrackingKey = entry => entry?.trackingKey || entry?.id || null;

export function journalPinnedEntry(entries, memory = {}) {
  memory = own(memory) ? memory : {};
  const entry = (entries || []).find(value => value.id === memory.journalPinnedId);
  if (!journalTrackable(entry)) return null;
  const key = journalTrackingKey(entry);
  // A pre-key pin can retain its original undertaking, but cannot adopt an
  // independently accepted follow-up merely because it shares a file.
  return memory.journalPinnedKey ? memory.journalPinnedKey === key ? entry : null
    : entry.followUp ? null : entry;
}

export function normalizeJournalReview(value) {
  if (!own(value) || value.version !== VERSION || !own(value.seen)) return null;
  const seen = Object.fromEntries(Object.entries(value.seen).filter(([id, revision]) =>
    id.length > 0 && id.length <= 128 && typeof revision === 'string' && /^r1:[a-f0-9]{16}$/.test(revision)).slice(0, LIMIT));
  return { version: VERSION, seen };
}

export function journalRevision(entry = {}) {
  // Only facts presented in the record. No live countdown, map availability,
  // input state, selection, tracking or UI acknowledgement enters this value.
  const text = JSON.stringify([entry.id, entry.nature, entry.commitment, entry.stage,
    entry.state, entry.status, entry.summary, entry.nextLabel, entry.next,
    entry.milestones, entry.records, entry.closure, entry.followUp,
    entry.evidence, entry.outcome, entry.location]);
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    a = Math.imul(a ^ char, 16777619) >>> 0;
    b = Math.imul(b ^ char, 2246822519) >>> 0;
  }
  return `r1:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export function createJournalReview(saved) {
  let memory = normalizeJournalReview(saved);
  let initialized = !!memory;
  const revisions = new Map(), changedThisOpening = new Set();
  function decorate(entries = []) {
    const safe = Array.isArray(entries) ? entries : [];
    revisions.clear();
    for (const entry of safe) revisions.set(entry.id, journalRevision(entry));
    if (!initialized) {
      // Old saves and the first opening establish a quiet baseline. Without
      // recorded observation there is no honest chronology to announce.
      memory = { version: VERSION, seen: Object.fromEntries([...revisions].slice(0, LIMIT)) };
      initialized = true;
    }
    return safe.map(entry => {
      const unseen = memory.seen[entry.id] !== revisions.get(entry.id);
      if (unseen) changedThisOpening.add(entry.id);
      return { ...entry, unseen, updated: changedThisOpening.has(entry.id) };
    });
  }
  function presented(id) {
    const revision = revisions.get(id);
    if (!revision || memory?.seen[id] === revision) return false;
    memory.seen[id] = revision;
    const keys = Object.keys(memory.seen);
    for (const stale of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete memory.seen[stale];
    return true;
  }
  return { decorate, presented, memory: () => memory ? { version: VERSION, seen: { ...memory.seen } } : null };
}
