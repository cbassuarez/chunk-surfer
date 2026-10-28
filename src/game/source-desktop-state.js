// The Source shell has three finite plates. Breaching it changes where the
// fight is presented, never how many simulations or clocks own the encounter.
export const SOURCE_DESKTOP_VERSION = 1;
export const SOURCE_SHELTER_PLATES = 3;
export const SOURCE_EXPOSE_COVER_DAMAGE = 5;
export const SOURCE_DESKTOP_BREACH_SECONDS = 2.4;

// One owner clock drives both the passive native surface and its contained
// fallback. The failure is a held presentation, never a second combat turn.
export function sourceDesktopFailureBeat(elapsed = 0) {
  const time = Math.max(0, Math.min(SOURCE_DESKTOP_BREACH_SECONDS, Number(elapsed) || 0));
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const fade = clamp01((time - 1.15) / .5);
  return {
    time,
    stage: time < .35 ? 'held' : time < 1.15 ? 'diagnostic' : time < SOURCE_DESKTOP_BREACH_SECONDS ? 'peeling' : 'exposed',
    peel: clamp01((time - 1.15) / (SOURCE_DESKTOP_BREACH_SECONDS - 1.15)),
    diagnostic: time < .35 || time >= 1.65 ? 0 : time < 1.15 ? 1 : 1 - fade * fade * (3 - 2 * fade),
  };
}

const count = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const ids = (value) => [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id))];

export function normalizeSourceDesktop(value = null, { breaks = [], movementIds = null } = {}) {
  const allowed = Array.isArray(movementIds) ? new Set(movementIds) : null;
  const spent = ids([...ids(value?.breaks), ...ids(breaks)]).filter((id) => !allowed || allowed.has(id)).slice(0, SOURCE_SHELTER_PLATES);
  const capacity = Math.max(0, SOURCE_SHELTER_PLATES - spent.length);
  const breached = !!value?.breached || spent.length > 0;
  return {
    version: SOURCE_DESKTOP_VERSION,
    breached,
    tier: clamp(Math.max(spent.length, count(value?.tier, breached ? 1 : 0)), 0, SOURCE_SHELTER_PLATES),
    breaks: spent,
    cover: clamp(count(value?.cover, breached ? 0 : capacity), 0, capacity),
  };
}

export const sourceDesktopCapacity = (value) => Math.max(0, SOURCE_SHELTER_PLATES - normalizeSourceDesktop(value).breaks.length);
export const sourceDesktopGuard = (movementIndex = 0) => 5 - clamp(count(movementIndex), 0, 2);

export function breachSourceDesktop(value, movementId) {
  const state = normalizeSourceDesktop(value);
  if (!movementId || state.breaks.includes(movementId)) return state;
  return normalizeSourceDesktop({ ...state, breached: true, breaks: [...state.breaks, movementId], cover: 0, tier: state.tier + 1 });
}

export function rebuildSourceCover(value) {
  const state = normalizeSourceDesktop(value);
  return { ...state, cover: Math.min(sourceDesktopCapacity(state), state.cover + 1) };
}

export function spendSourceCover(value) {
  const state = normalizeSourceDesktop(value);
  const spent = state.cover > 0;
  return { state: { ...state, cover: Math.max(0, state.cover - 1) }, spent };
}

export function absorbSourceCover(value, damage, movementIndex = 0) {
  const state = normalizeSourceDesktop(value);
  const incoming = Math.max(0, count(damage));
  if (!incoming || !state.cover) return { state, damage: incoming, prevented: 0, spent: false };
  const prevented = Math.min(incoming, sourceDesktopGuard(movementIndex));
  return { state: { ...state, cover: state.cover - 1 }, damage: incoming - prevented, prevented, spent: true };
}
