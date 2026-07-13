// Pure state for the redaction battles. Rendering and audio live in battle.js;
// this module only knows about words, blackout bars, readings, and turns.

const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9'-]/g, '');

export function tokenizeRedaction(id, source) {
  return String(source || '').trim().split(/\s+/).filter(Boolean).map((text, i) => ({
    id: `${id}:${i}`,
    text,
    key: clean(text),
  }));
}

export function resolveTokenRefs(tokens, refs = []) {
  return refs.map((ref) => {
    if (Number.isInteger(ref)) return tokens[ref]?.id;
    if (tokens.some((t) => t.id === ref)) return ref;
    const [word, nthRaw] = String(ref).split('#');
    const nth = Math.max(1, Number(nthRaw) || 1);
    const matches = tokens.filter((t) => t.key === clean(word));
    return matches[nth - 1]?.id;
  });
}

export function authorRedactionChallenge(id, source, { readings = [], opponentMoves = [] } = {}) {
  const tokens = tokenizeRedaction(id, source);
  return {
    id,
    tokens: tokens.map(({ id: tokenId, text }) => ({ id: tokenId, text })),
    readings: readings.map((r) => ({
      required: resolveTokenRefs(tokens, r.required),
      forbidden: resolveTokenRefs(tokens, r.forbidden),
      maxVisible: Math.max(1, Number(r.maxVisible) || tokens.length),
    })),
    opponentMoves: opponentMoves.map((m) => ({
      blackout: resolveTokenRefs(tokens, m.blackout),
      scrape: resolveTokenRefs(tokens, m.scrape),
    })),
  };
}

export function createRedactionState(challenge) {
  return {
    challenge,
    player: new Set(),
    opponent: new Set(),
    cursor: 0,
    attempts: 0,
    history: [],
  };
}

export function tokenVisible(state, id) {
  return !state.player.has(id) && !state.opponent.has(id);
}

export function visibleTokenIds(state) {
  return state.challenge.tokens.filter((t) => tokenVisible(state, t.id)).map((t) => t.id);
}

export function survivingText(state) {
  return state.challenge.tokens.filter((t) => tokenVisible(state, t.id)).map((t) => t.text).join(' ');
}

export function toggleRedaction(state, id) {
  if (!id || state.opponent.has(id)) return false;
  state.history.push(new Set(state.player));
  if (state.player.has(id)) state.player.delete(id);
  else state.player.add(id);
  return true;
}

export function redactStroke(state, ids = []) {
  const next = ids.filter((id) => id && !state.opponent.has(id) && !state.player.has(id));
  if (!next.length) return false;
  state.history.push(new Set(state.player));
  for (const id of next) state.player.add(id);
  return true;
}

export function beginRedactionStroke(state) {
  state.history.push(new Set(state.player));
}

export function paintRedaction(state, id, redacted = true) {
  if (!id || state.opponent.has(id)) return false;
  if (redacted) state.player.add(id);
  else state.player.delete(id);
  return true;
}

export function undoRedaction(state) {
  const previous = state.history.pop();
  if (!previous) return false;
  state.player = previous;
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
  return { ok: index >= 0, reading: index, text: survivingText(state) };
}

export function applyOpponentMove(state) {
  const moves = state.challenge.opponentMoves || [];
  const move = moves[Math.min(state.attempts, Math.max(0, moves.length - 1))] || { blackout: [], scrape: [] };
  state.history.length = 0;
  for (const id of move.scrape || []) state.player.delete(id);
  for (const id of move.blackout || []) {
    state.player.delete(id);
    state.opponent.add(id);
  }
  state.attempts++;
  return move;
}

export function layoutRedactionTokens(challenge, width) {
  const rows = [];
  let x = 0, y = 0;
  for (let i = 0; i < challenge.tokens.length; i++) {
    const token = challenge.tokens[i];
    const w = Math.max(1, String(token.text).length);
    if (x && x + w > width) { x = 0; y++; }
    rows.push({ id: token.id, index: i, x, y, w });
    x += w + 1;
  }
  return rows;
}

export function moveRedactionCursor(state, direction, layout) {
  const current = layout[state.cursor] || layout[0];
  if (!current) return 0;
  if (direction === 'left') state.cursor = Math.max(0, state.cursor - 1);
  else if (direction === 'right') state.cursor = Math.min(layout.length - 1, state.cursor + 1);
  else {
    const dy = direction === 'up' ? -1 : 1;
    const targetY = current.y + dy;
    const candidates = layout.filter((p) => p.y === targetY);
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
  return challenge.readings.some((r) =>
    r.required.length > 0 && r.required.length <= r.maxVisible && r.required.every((id) => !opponent.has(id)));
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
    }
    const opponent = new Set();
    if (!solvable(challenge, opponent)) errors.push(`${challenge.id} starts unsolvable`);
    for (const move of challenge.opponentMoves || []) {
      for (const id of move.blackout || []) opponent.add(id);
      if (!solvable(challenge, opponent)) errors.push(`${challenge.id} becomes unsolvable after opponent move`);
    }
  }
  return errors;
}
