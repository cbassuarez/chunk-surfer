// Pure state for the redaction battles. Rendering and audio live in battle.js;
// this module only knows about words, blackout bars, revealed text, grafted
// signal words, readings, and turns.

const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9'-]/g, '');

function normalizeTokenSpec(spec, fallbackText = '') {
  if (typeof spec === 'string') return { text: spec };
  if (spec && typeof spec === 'object') return { ...spec, text: String(spec.text ?? fallbackText) };
  return { text: String(fallbackText) };
}

export function tokenizeRedaction(id, source, { hidden = [], grafts = [], insertions = [] } = {}) {
  const make = (spec, i, kind) => {
    const token = normalizeTokenSpec(spec);
    const tokenId = token.id ? `${id}:${token.id}` : `${id}:${kind}:${i}`;
    return {
      id: tokenId,
      text: token.text,
      key: clean(token.text),
      kind,
      label: token.label || '',
      falseText: !!token.falseText,
    };
  };
  if (Array.isArray(source)) {
    return source.map((spec, i) => {
      const token = normalizeTokenSpec(spec);
      return make(token, i, token.kind || 'printed');
    });
  }
  const printed = String(source || '').trim().split(/\s+/).filter(Boolean).map((text, i) => make({ text }, i, 'printed'));
  return [
    ...printed,
    ...hidden.map((spec, i) => make(spec, i, 'hidden')),
    ...grafts.map((spec, i) => make(spec, i, 'graft')),
    ...insertions.map((spec, i) => make(spec, i, 'insertion')),
  ];
}

export function resolveTokenRefs(tokens, refs = []) {
  return refs.map((ref) => {
    if (Number.isInteger(ref)) return tokens[ref]?.id;
    if (tokens.some((t) => t.id === ref)) return ref;
    const raw = String(ref);
    const namespaced = tokens.find((t) => t.id.endsWith(`:${raw}`));
    if (namespaced) return namespaced.id;
    const [word, nthRaw] = raw.split('#');
    const nth = Math.max(1, Number(nthRaw) || 1);
    const matches = tokens.filter((t) => t.key === clean(word));
    return matches[nth - 1]?.id;
  }).filter(Boolean);
}

export function authorRedactionChallenge(id, source, {
  title = '',
  claim = '',
  hidden = [],
  grafts = [],
  insertions = [],
  tools = {},
  readings = [],
  opponentMoves = [],
  terminal = false,
} = {}) {
  const tokens = tokenizeRedaction(id, source, { hidden, grafts, insertions });
  return {
    id,
    title: title || id.replace(/[-_]/g, ' ').toUpperCase(),
    claim,
    tools: {
      reveal: hidden.length > 0 || tokens.some((t) => t.kind === 'hidden'),
      graft: grafts.length > 0 || tokens.some((t) => t.kind === 'graft'),
      ...(tools || {}),
    },
    terminal: !!terminal,
    tokens: tokens.map(({ id: tokenId, text, kind, label, falseText }) => ({ id: tokenId, text, kind, label, falseText })),
    readings: readings.map((r, i) => ({
      id: r.id || `${id}:reading:${i}`,
      meaning: r.meaning || 'Reading holds.',
      routeBias: r.routeBias || null,
      grants: Array.isArray(r.grants) ? [...r.grants] : [],
      locks: Array.isArray(r.locks) ? [...r.locks] : [],
      pressureDelta: Number(r.pressureDelta) || 0,
      required: resolveTokenRefs(tokens, r.required),
      forbidden: resolveTokenRefs(tokens, r.forbidden),
      maxVisible: Math.max(1, Number(r.maxVisible) || tokens.length),
    })),
    opponentMoves: opponentMoves.map((m) => ({
      blackout: resolveTokenRefs(tokens, m.blackout),
      scrape: resolveTokenRefs(tokens, m.scrape),
      insert: resolveTokenRefs(tokens, m.insert),
      notice: m.notice || '',
    })),
  };
}

export function createRedactionState(challenge) {
  const revealed = new Set();
  const grafted = new Set();
  const inserted = new Set();
  for (const t of challenge.tokens || []) {
    if (t.kind === 'printed') continue;
    if (t.kind === 'hidden' && t.startRevealed) revealed.add(t.id);
    if (t.kind === 'graft' && t.startGrafted) grafted.add(t.id);
    if (t.kind === 'insertion' && t.startInserted) inserted.add(t.id);
  }
  return {
    challenge,
    player: new Set(),
    opponent: new Set(),
    revealed,
    grafted,
    inserted,
    opponentInserted: new Set(),
    cursor: 0,
    attempts: 0,
    history: [],
    lastReading: null,
    pressure: 0,
  };
}

function snapshot(state) {
  return {
    player: new Set(state.player),
    revealed: new Set(state.revealed),
    grafted: new Set(state.grafted),
    inserted: new Set(state.inserted),
  };
}

function restore(state, snap) {
  state.player = new Set(snap.player || []);
  state.revealed = new Set(snap.revealed || []);
  state.grafted = new Set(snap.grafted || []);
  state.inserted = new Set(snap.inserted || []);
}

export function tokenActive(state, token) {
  if (!token) return false;
  if (token.kind === 'printed') return true;
  if (token.kind === 'hidden') return state.revealed.has(token.id) || state.inserted.has(token.id) || state.opponentInserted.has(token.id);
  if (token.kind === 'graft') return state.grafted.has(token.id) || state.inserted.has(token.id) || state.opponentInserted.has(token.id);
  if (token.kind === 'insertion') return state.inserted.has(token.id) || state.opponentInserted.has(token.id);
  return true;
}

export function tokenVisible(state, id) {
  const token = state.challenge.tokens.find((t) => t.id === id);
  return tokenActive(state, token) && !state.player.has(id) && !state.opponent.has(id);
}

export function visibleTokenIds(state) {
  return state.challenge.tokens.filter((t) => tokenVisible(state, t.id)).map((t) => t.id);
}

export function activeTokens(state) {
  return state.challenge.tokens.filter((t) => tokenActive(state, t));
}

export function survivingText(state) {
  return state.challenge.tokens.filter((t) => tokenVisible(state, t.id)).map((t) => t.text).join(' ');
}

export function revealHidden(state) {
  const ids = state.challenge.tokens.filter((t) => t.kind === 'hidden' && !state.revealed.has(t.id)).map((t) => t.id);
  if (!ids.length) return false;
  state.history.push(snapshot(state));
  ids.forEach((id) => state.revealed.add(id));
  const first = state.challenge.tokens.findIndex((t) => ids.includes(t.id));
  if (first >= 0) state.cursor = first;
  return true;
}

export function graftSignal(state) {
  const ids = state.challenge.tokens.filter((t) => t.kind === 'graft' && !state.grafted.has(t.id)).map((t) => t.id);
  if (!ids.length) return false;
  state.history.push(snapshot(state));
  ids.forEach((id) => state.grafted.add(id));
  const first = state.challenge.tokens.findIndex((t) => ids.includes(t.id));
  if (first >= 0) state.cursor = first;
  return true;
}

export function toggleRedaction(state, id) {
  if (!id || state.opponent.has(id) || !tokenActive(state, state.challenge.tokens.find((t) => t.id === id))) return false;
  state.history.push(snapshot(state));
  if (state.player.has(id)) state.player.delete(id);
  else state.player.add(id);
  return true;
}

export function redactStroke(state, ids = []) {
  const next = ids.filter((id) => id && !state.opponent.has(id) && !state.player.has(id));
  if (!next.length) return false;
  state.history.push(snapshot(state));
  for (const id of next) state.player.add(id);
  return true;
}

export function beginRedactionStroke(state) {
  state.history.push(snapshot(state));
}

export function paintRedaction(state, id, redacted = true) {
  if (!id || state.opponent.has(id) || !tokenActive(state, state.challenge.tokens.find((t) => t.id === id))) return false;
  if (redacted) state.player.add(id);
  else state.player.delete(id);
  return true;
}

export function undoRedaction(state) {
  const previous = state.history.pop();
  if (!previous) return false;
  restore(state, previous);
  return true;
}

export function readingMatches(state, reading) {
  const visible = new Set(visibleTokenIds(state));
  if (visible.size > reading.maxVisible) return false;
  if (!reading.required.every((id) => visible.has(id))) return false;
  if (reading.forbidden.some((id) => visible.has(id))) return false;
  return true;
}

export function validateReading(state) {
  const index = state.challenge.readings.findIndex((r) => readingMatches(state, r));
  const reading = index >= 0 ? state.challenge.readings[index] : null;
  const text = survivingText(state);
  if (reading) state.lastReading = { ...reading, text };
  return {
    ok: index >= 0,
    reading: index,
    readingId: reading?.id || null,
    meaning: reading?.meaning || '',
    routeBias: reading?.routeBias || null,
    grants: reading?.grants ? [...reading.grants] : [],
    locks: reading?.locks ? [...reading.locks] : [],
    pressureDelta: Number(reading?.pressureDelta) || 0,
    text,
  };
}

export function applyOpponentMove(state) {
  const moves = state.challenge.opponentMoves || [];
  const move = moves[Math.min(state.attempts, Math.max(0, moves.length - 1))] || { blackout: [], scrape: [], insert: [] };
  state.history.length = 0;
  for (const id of move.scrape || []) state.player.delete(id);
  for (const id of move.insert || []) {
    state.inserted.add(id);
    state.opponentInserted.add(id);
  }
  for (const id of move.blackout || []) {
    state.player.delete(id);
    state.opponent.add(id);
  }
  state.attempts++;
  return move;
}

export function layoutRedactionTokens(challengeOrState, width) {
  const state = challengeOrState?.challenge ? challengeOrState : null;
  const challenge = state ? state.challenge : challengeOrState;
  const tokens = state ? activeTokens(state) : (challenge?.tokens || []);
  const rows = [];
  let x = 0, y = 0;
  for (const token of tokens) {
    const index = challenge.tokens.findIndex((t) => t.id === token.id);
    const w = Math.max(1, String(token.text).length);
    if (x && x + w > width) { x = 0; y++; }
    rows.push({ id: token.id, index, x, y, w });
    x += w + 1;
  }
  return rows;
}

export function moveRedactionCursor(state, direction, layout) {
  const active = layout.length ? layout : layoutRedactionTokens(state, 80);
  const current = active.find((p) => p.index === state.cursor) || active[0];
  if (!current) return 0;
  if (direction === 'left') {
    const i = Math.max(0, active.findIndex((p) => p.index === current.index) - 1);
    state.cursor = active[i]?.index ?? current.index;
  } else if (direction === 'right') {
    const i = Math.min(active.length - 1, active.findIndex((p) => p.index === current.index) + 1);
    state.cursor = active[i]?.index ?? current.index;
  } else {
    const dy = direction === 'up' ? -1 : 1;
    const targetY = current.y + dy;
    const candidates = active.filter((p) => p.y === targetY);
    if (candidates.length) {
      const center = current.x + current.w / 2;
      state.cursor = candidates.reduce((best, p) =>
        Math.abs((p.x + p.w / 2) - center) < Math.abs((best.x + best.w / 2) - center) ? p : best,
      candidates[0]).index;
    }
  }
  return state.cursor;
}

function solvable(challenge, opponent = new Set()) {
  return challenge.readings.filter((r) =>
    r.required.length > 0 &&
    r.required.length <= r.maxVisible &&
    r.required.every((id) => !opponent.has(id)));
}

export function validateBattleDefinition(battle) {
  const errors = [];
  if (!battle?.challenges?.length) errors.push(`${battle?.id || 'battle'} has no challenges`);
  for (const challenge of battle?.challenges || []) {
    const ids = new Set(challenge.tokens.map((t) => t.id));
    if (ids.size !== challenge.tokens.length) errors.push(`${challenge.id} has duplicate token ids`);
    if ((challenge.readings || []).length < 2) errors.push(`${challenge.id} needs multiple readings`);
    for (const reading of challenge.readings || []) {
      for (const id of [...reading.required, ...reading.forbidden]) if (!ids.has(id)) errors.push(`${challenge.id} references ${id}`);
      if (!reading.meaning) errors.push(`${challenge.id}/${reading.id} needs a meaning`);
    }
    const opponent = new Set();
    if (!solvable(challenge, opponent).length) errors.push(`${challenge.id} starts unsolvable`);
    for (const move of challenge.opponentMoves || []) {
      for (const id of [...(move.blackout || []), ...(move.scrape || []), ...(move.insert || [])]) if (!ids.has(id)) errors.push(`${challenge.id} opponent move references ${id}`);
      for (const id of move.blackout || []) opponent.add(id);
      const count = solvable(challenge, opponent).length;
      if (!challenge.terminal && count < 2) errors.push(`${challenge.id} has fewer than two readings after opponent move`);
      if (challenge.terminal && count < 1) errors.push(`${challenge.id} becomes unsolvable after opponent move`);
    }
  }
  return errors;
}
