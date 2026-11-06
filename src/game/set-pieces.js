// One-off scares, each fired by something the player is already doing with their
// attention locked: the light coming back, the recorder in their hands, a page,
// the relief of a clean minute. Pure: the host owns placement, light and sound.
//
// None of these is the Hush. Each is a false figure with no gameplay authority,
// like the takes' false Hush: it hears nothing, hurts nothing, spoils nothing, and
// never moves. It is simply there, then not. The catch keeps its voice, its ring
// and the dull room for itself, so the worst thing in the building stays the worst.
export const SET_PIECE = Object.freeze({
  ids: Object.freeze(['torch', 'meter', 'document', 'relief', 'spoil']),
  // Startle fades fast with repetition, and needs calm to land in. One of each at
  // most, and the budget is smaller than the set, so a run never gets all of them.
  calmSeconds: 90, maxPerRun: 4, patienceSeconds: 150, dangerMetres: 12,
  vacuumFloor: .16,
  // Small, so the figure doesn't put out the room it needs to be seen against.
  figureRadiusM: 1.4, figureHeightM: 2.12, figureWidthM: .72,
  torch: Object.freeze({ heldSeconds: 20, darkSeconds: 3, cutSeconds: 1.7, figureSeconds: .28, recutSeconds: .2, metres: 2.6, hit: .8 }),
  meter: Object.freeze({ openSeconds: 2.5, pinSeconds: 6, figureSeconds: .42, negativeSeconds: .083, metres: 2.2, hit: .7 }),
  document: Object.freeze({ readSeconds: 5, figureSeconds: .5, negativeSeconds: .083, metres: 2.4, hit: .75 }),
  relief: Object.freeze({ quietSeconds: 1.8, expireSeconds: 14, figureSeconds: .72, metres: 1.1, frontMetres: 2.4, hit: .85 }),
  spoil: Object.freeze({ hit: .6 }),
});

const unitHash = text => {
  let h = 2166136261 >>> 0;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0) / 0xffffffff;
};

export function createScareDirector({ seed = '', spent = [] } = {}) {
  const used = new Set(spent);
  let calm = 0, forced = null, carrying = null;
  // The one piece with no player action to wait for gets a wait of its own, or it
  // would arrive ninety seconds after every load.
  const patience = unitHash(seed) * SET_PIECE.patienceSeconds;
  return {
    patience,
    tick(dt = 0, { danger = false } = {}) { calm = danger ? 0 : calm + Math.max(0, Number(dt) || 0); },
    ready(id, { patient = false } = {}) {
      if (forced === id) return true;
      if (used.has(id) || used.size >= SET_PIECE.maxPerRun) return false;
      return calm >= SET_PIECE.calmSeconds + (patient ? patience : 0);
    },
    spend(id) { used.add(id); calm = 0; if (forced === id) { forced = null; carrying = id; } },
    release() { carrying = null; },
    // The God menu's way in: the same trigger, with the budget out of its way.
    force(id) { forced = id; used.delete(id); },
    forced: () => forced || carrying,
    snapshot: () => ({ calm, patience, spent: [...used], forced: forced || carrying }),
  };
}

// `closed` is the recorder lowered or the page put down; `quiet` is how long
// nobody has been speaking. Both are the host's to read.
export function createSetPiece(id, { entry = 'cut', reducedFlash = false } = {}) {
  const c = SET_PIECE[id];
  let t = 0, hitDone = false;
  let revealAt = id === 'torch' ? (entry === 'click' ? 0 : c.cutSeconds) : null;
  const recut = id === 'torch' && !reducedFlash ? c.recutSeconds : 0;
  return {
    id, entry,
    step(dt = 0, { closed = false, quiet = 0 } = {}) {
      t += Math.max(0, Number(dt) || 0);
      if (revealAt === null && (id === 'relief' ? quiet >= c.quietSeconds : closed)) revealAt = t;
      const since = revealAt === null ? null : t - revealAt, shown = since !== null && since >= 0;
      const inFigure = shown && since < c.figureSeconds;
      const hit = shown && !hitDone;
      if (hit) hitDone = true;
      const frame = {
        hit,
        // The page is the one that stands there while you aren't looking at it.
        figure: id === 'document' ? (since === null || inFigure) : inFigure,
        torchCut: id === 'torch' && (!shown || (!inFigure && since < c.figureSeconds + recut)),
        pinned: id === 'meter' && since === null && t < c.pinSeconds,
        negative: (id === 'meter' || id === 'document') && shown && since < c.negativeSeconds,
        // The room falls away first, so the hit has somewhere to land.
        vacuum: !shown || inFigure ? SET_PIECE.vacuumFloor : 1,
        done: false,
      };
      if (id === 'torch') frame.done = shown && since >= c.figureSeconds + recut;
      else if (shown) frame.done = since >= c.figureSeconds;
      else if (id === 'meter') frame.done = t >= c.pinSeconds;
      else if (id === 'relief') frame.done = t >= c.expireSeconds;
      return Object.freeze(frame);
    },
  };
}

// Whether the hand jumped within 300 ms of a hit, so a scare is a number across
// playtests rather than an opinion. Mouse only, and it stays on this machine.
export function createStartleMeter({ windowMs = 300, baselineMs = 1000, minimum = 40, ratio = 3 } = {}) {
  let moves = [], pending = null;
  return {
    move(at, dx = 0, dy = 0) {
      moves.push({ at, speed: Math.hypot(Number(dx) || 0, Number(dy) || 0) });
      if (moves.length > 2048) moves = moves.slice(-1024);
    },
    hit(at, id) { pending = { at, id }; },
    settle(at) {
      if (!pending || at < pending.at + windowMs) return null;
      const before = moves.filter(m => m.at >= pending.at - baselineMs && m.at < pending.at);
      const after = moves.filter(m => m.at >= pending.at && m.at <= pending.at + windowMs);
      const baseline = before.length ? before.reduce((sum, m) => sum + m.speed, 0) / before.length : 0;
      const peak = after.reduce((most, m) => Math.max(most, m.speed), 0);
      const limit = Math.max(minimum, baseline * ratio), first = after.find(m => m.speed >= limit);
      const row = { id: pending.id, at: Math.round(pending.at), baseline: +baseline.toFixed(1), peak: +peak.toFixed(1),
        jolt: !!first, reactionMs: first ? Math.round(first.at - pending.at) : null };
      pending = null; moves = moves.filter(m => m.at >= at - baselineMs);
      return row;
    },
  };
}
