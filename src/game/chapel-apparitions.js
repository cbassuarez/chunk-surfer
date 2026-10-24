// THE CHAPEL'S RULE: THEY WATCH YOU, AND THE TAPE HEARS THEM.
//
// Every place has its own rules. Here the congregation is never still: each
// body twitches, its upper body twists in the pew and its head snaps round to
// you in jumps, never a smooth pan. Bodies on the ceiling crawl. Everyone who
// can see you murmurs, and the murmur lands on a take, so this is the hardest
// room in the building to record: you need a place few of them can see, and to
// keep still in it (moving brings more heads round, faster).
//
// Pure apart from a small per-figure state (where each head is pointing and
// when it next jumps); `frame` is called once per rendered frame with the
// eye and returns prop instances with full matrices, the watchers and the
// murmur. Positions are physical metres, as the rest of the props.

import { CHAPEL_DRESSING_MESH as M, CHAPEL_CEILINGS } from '../data/chapel-dressing.js';
import { CHAPEL_PRESENCE_PIVOTS as PIVOTS } from '../data/generated/chapel-dressing-geometry.js';

export const CHAPEL_APPARITION = Object.freeze({
  // Whether a body can see you: the twist and the head together turn this far
  // from the altar, and no further. Directly behind them you are not seen.
  sightDeg: 135, twistDeg: 34, headDeg: 104, pitchDeg: 48, range: 30,
  saccade: Object.freeze({ minS: .35, maxS: 1.6, snapS: .055 }),
  twitch: Object.freeze({ meanS: 2.6, ceilingMeanS: 1.5, riseS: .07, decayS: .14 }),
  // Murmur reaching a point: each voice falls off as 1/(1+(d/ref)^2), voices
  // add as energy. `gain` puts it on the recordist's noise scale, where 0.18
  // spoils a take (config ROOM_TONE.spoilNoise).
  murmur: Object.freeze({ ref: 2.5, unseen: .16, throughStone: .2, gain: .055, voices: 8 }),
  // How worked up the room is. A rolling take makes it worse by the second, and
  // worst at the end: measured over the nave for a still recordist, 95% of it
  // is clean at 10s, 22% at 30s, 9% at the 45s minimum and two spots at 60s.
  agitation: Object.freeze({ idle: .25, takeStart: .3, takeEnd: 4.2, curve: 2, moving: .4 }),
  // How often each body re-checks whether stone stands between it and you.
  sightCheckS: .3,
  crawl: Object.freeze({ radius: .85, rate: .045 }),
});

const DEG = Math.PI / 180;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

// ── Column-major 4x4, the props renderer's convention ───────────────────────
// Its yaw maps local x to (cos, 0, sin) and local -z (forward) to (sin, 0, -cos),
// so a world bearing atan2(dx, -dz) is the yaw that faces along (dx, dz).
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const scale = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const yawM = (a) => { const c = Math.cos(a), n = Math.sin(a); return [c, 0, n, 0, 0, 1, 0, 0, -n, 0, c, 0, 0, 0, 0, 1]; };
// Positive pitch tips forward (-z) up toward +y.
const pitchM = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const rollM = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
// A frame from three world axes (right, up, back = local +z) and an origin.
const basis = (x, y, z, o) => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

// ── Where the ceiling bodies are ────────────────────────────────────────────
// Authored metres to physical, the same way the congregation is placed; then
// up to the named ceiling, with its slope. A body that would sit in rock, or
// under a ceiling that is not the one authored, is left out rather than floated.
export function chapelCeilingPlacements(plan, ceiling = []) {
  if (!plan?.isLoaded?.()) return [];
  const out = [];
  for (const p of ceiling) {
    const rx = Math.round(p.x * 2), ry = Math.round(p.y * 2);
    if (plan.isSolid(rx, ry)) continue;
    const at = plan.logicalToPhysical(rx, ry);
    if (!at || at.renderGroup !== 'upper') continue;
    const ceil = plan.ceilAt(rx, ry);
    let height, normal;
    if (p.surface === 'flat') {
      // A flat ceiling is whatever the plan says this room's is.
      height = ceil; normal = [0, -1, 0];
    } else {
      const v = CHAPEL_CEILINGS.vault, u = p.x - v.ridgeX;
      const base = plan.floorAt(Math.round(v.anchor.x * 2), Math.round(v.anchor.y * 2));
      height = base + v.wall + (v.halfSpan - Math.abs(u)) / v.halfSpan * (v.ridge - v.wall);
      // Only where the room really opens into the vault, never in a lower room.
      if (Math.abs(u) > v.halfSpan - .3 || ceil < height + .2) continue;
      const slope = (v.ridge - v.wall) / v.halfSpan, n = Math.hypot(slope, 1);
      // Down and in, toward the ridge line's side of the room.
      normal = [-Math.sign(u) * slope / n, -1 / n, 0];
    }
    out.push({ ...p, x: at.x * .5 + (p.x - rx * .5), y: height, z: at.z * .5 + (p.y - ry * .5),
      normal, zone: plan.zoneAt(rx, ry), kind: 'presence', role: 'ceiling' });
  }
  return out;
}

// Whether stone stands between two points, by the spans the renderer draws: a
// sample is clear when some span of its column is open air at that height.
// Pews, people and props do not hide you; walls and floors do.
export function chapelLineOfSight(spans, a, b, { step = .25, skip = .3 } = {}) {
  if (!(spans instanceof Map)) return true;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z], length = Math.hypot(...d);
  for (let t = skip; t < length - skip; t += step) {
    const x = a.x + d[0] * t / length, y = a.y + d[1] * t / length, z = a.z + d[2] * t / length;
    const list = spans.get(`${Math.floor(x * 2)},${Math.floor(z * 2)}`);
    if (!list || !list.some((s) => y > s.floor - .05 && y < s.ceil + .05)) return false;
  }
  return true;
}

// ── The runtime ─────────────────────────────────────────────────────────────
export function createChapelApparitions() {
  const figures = new Map();
  let lastTime = null;
  const stateFor = (p) => {
    let f = figures.get(p.id);
    if (!f) {
      const random = rng(hash(p.id));
      f = { random, head: { yaw: 0, pitch: 0 }, headTarget: { yaw: 0, pitch: 0 }, twist: 0, twistTarget: 0,
        nextSaccade: random() * 1.2, nextTwitch: random() * 3, twitchAt: -99, twitchVector: [0, 0, 0, 0],
        phase: random() * 100, crawlSeed: random() * 50 };
      figures.set(p.id, f);
    }
    return f;
  };

  function twitchOf(f, t) {
    const age = t - f.twitchAt, T = CHAPEL_APPARITION.twitch;
    if (age < 0 || age > T.riseS + T.decayS * 5) return 0;
    return age < T.riseS ? age / T.riseS : Math.exp(-(age - T.riseS) / T.decayS);
  }

  // Schedules a figure's next head jump and next twitch. Moving brings heads
  // round faster; a rolling take makes the whole room worse.
  function schedule(f, t, { moving = 0, recording = false, ceiling = false, reduced = false }) {
    const S = CHAPEL_APPARITION.saccade, T = CHAPEL_APPARITION.twitch;
    const pace = (moving > .05 ? .55 : 1) * (recording ? .7 : 1) * (reduced ? 1.6 : 1);
    if (t >= f.nextSaccade) {
      f.nextSaccade = t + (S.minS + (S.maxS - S.minS) * f.random()) * pace;
      f.saccadeDue = true;
    }
    if (t >= f.nextTwitch) {
      const mean = (ceiling ? T.ceilingMeanS : T.meanS) * (recording ? .55 : 1) * (moving > .05 ? .7 : 1) * (reduced ? 2.2 : 1);
      f.nextTwitch = t - Math.log(1 - f.random() * .999) * mean;
      f.twitchAt = t;
      const r = () => f.random() * 2 - 1;
      f.twitchVector = [r(), r(), r(), r()];
    }
  }

  // Sight is re-checked a few times a second per body, not every frame.
  function sees(f, from, to, canSee, timeSec) {
    if (!canSee) return true;
    if (f.sightAt == null || timeSec - f.sightAt >= CHAPEL_APPARITION.sightCheckS || timeSec < f.sightAt) {
      f.sightAt = timeSec; f.sight = !!canSee(from, to);
    }
    return f.sight;
  }

  function frame({
    congregation = [], ceiling = [], eye = null, timeSec = 0, moving = 0, recording = false,
    takeProgress = 0, effectsMode = 'full', variantFor = () => 0, emissiveFor = () => [0, 0, 0, 0],
    canSee = null,
  } = {}) {
    const dt = lastTime == null ? 0 : clamp(timeSec - lastTime, 0, .1);
    lastTime = timeSec;
    const reduced = effectsMode === 'reduced', amp = reduced ? .35 : 1, tremor = reduced ? 0 : 1;
    const A = CHAPEL_APPARITION, instances = [], voices = [];
    let watchers = 0;
    const snap = 1 - Math.exp(-dt / (reduced ? .16 : A.saccade.snapS));
    const slow = 1 - Math.exp(-dt / .45);
    const G = CHAPEL_APPARITION.agitation;
    const agitation = (recording ? G.takeStart + (G.takeEnd - G.takeStart) * clamp(takeProgress, 0, 1) ** G.curve : G.idle)
      + G.moving * clamp(moving, 0, 1);
    const emit = (p, mesh, matrix, extra = {}) => instances.push({
      id: extra.id || p.id, mesh, matrix, x: matrix[12], y: matrix[13], z: matrix[14], yaw: 0, scale: 1,
      zone: p.zone, structural: false, noShadow: true, blocks: false, interactive: false, kind: 'presence',
      apparitionVariant: variantFor(p), emissive: emissiveFor(p), ...extra,
    });

    for (const p of congregation) {
      const f = stateFor(p), kind = p.figure || 'seated', pivots = PIVOTS[kind] || PIVOTS.seated;
      schedule(f, timeSec, { moving, recording, reduced });
      const s = p.scale || 1, body = mul(translate(p.x, p.y, p.z), mul(yawM(p.yaw || 0), scale(s)));
      // Where you are from this body: a bearing relative to its altar-facing yaw.
      let seen = false, open = true, relYaw = 0, pitch = 0, distance = Infinity;
      if (eye) {
        const neck = apply(body, pivots.head), dx = eye.x - neck[0], dy = eye.y - neck[1], dz = eye.z - neck[2];
        distance = Math.hypot(dx, dz, dy);
        relYaw = wrap(Math.atan2(dx, -dz) - (p.yaw || 0));
        pitch = Math.atan2(dy, Math.hypot(dx, dz));
        open = distance < A.range && sees(f, { x: neck[0], y: neck[1], z: neck[2] }, eye, canSee, timeSec);
        seen = open && Math.abs(relYaw) < A.sightDeg * DEG;
      }
      if (f.saccadeDue) {
        f.saccadeDue = false;
        // A jump lands near you, never exactly: two to five degrees off.
        const miss = (f.random() * 2 - 1) * (2 + 3 * f.random()) * DEG;
        if (seen) {
          const twist = clamp(relYaw * .38, -A.twistDeg * DEG, A.twistDeg * DEG);
          f.twistTarget = twist;
          f.headTarget = { yaw: clamp(relYaw - twist + miss, -A.headDeg * DEG, A.headDeg * DEG), pitch: clamp(pitch + miss * .5, -A.pitchDeg * DEG, A.pitchDeg * DEG) };
        } else {
          // Unseen, a head drifts back toward the altar, by fits.
          f.twistTarget *= .4;
          f.headTarget = { yaw: f.headTarget.yaw * .35 + miss * 3, pitch: f.headTarget.pitch * .35 };
        }
      }
      f.head.yaw += (f.headTarget.yaw - f.head.yaw) * snap;
      f.head.pitch += (f.headTarget.pitch - f.head.pitch) * snap;
      f.twist += (f.twistTarget - f.twist) * slow;
      if (seen) watchers++;
      const k = twitchOf(f, timeSec) * amp, v = f.twitchVector, w = 2 * Math.PI;
      const shake = tremor * .009 * Math.sin(timeSec * w * (9 + (f.phase % 4)) + f.phase);
      const twitchUpper = mul(yawM(f.twist + k * v[0] * .16), mul(pitchM(k * v[1] * .17 + shake), rollM(k * v[2] * .13)));
      const rest = pivots.headRest || [0, 0, 0];
      const headTurn = mul(yawM(f.head.yaw + k * v[3] * .26 + shake * 2), pitchM(rest[0] + f.head.pitch + k * v[1] * .22));
      if (kind === 'celebrant' || kind === 'acolyte') {
        const robe = mul(body, mul(translate(...pivots.upper), mul(mul(yawM(k * v[0] * .08), rollM(k * v[2] * .06)), translate(...pivots.upper.map((q) => -q)))));
        emit(p, M[kind], robe);
        emit(p, M.head, mul(robe, mul(translate(...pivots.head), headTurn)), { id: `${p.id}:head` });
      } else {
        emit(p, M[`${kind}Lower`], body);
        const upper = mul(body, mul(translate(...pivots.upper), twitchUpper));
        emit(p, M[`${kind}Upper`], upper, { id: `${p.id}:upper` });
        const neck = pivots.head.map((q, i) => q - pivots.upper[i]);
        emit(p, M.head, mul(upper, mul(translate(...neck), headTurn)), { id: `${p.id}:head` });
      }
      const intensity = (seen ? 1 : A.murmur.unseen) * (open ? 1 : A.murmur.throughStone) * (1 + agitation) * (1 + .8 * k);
      voices.push({ id: p.id, x: p.x, y: p.y + 1.2 * s, z: p.z, intensity, seen });
    }

    for (const p of ceiling) {
      const f = stateFor(p);
      schedule(f, timeSec, { moving, recording, ceiling: true, reduced });
      // Crawling: wandering a small patch of ceiling on two slow oscillators,
      // body turned the way it goes. A pure function of time, like the red beat.
      const C = A.crawl, t = timeSec * C.rate + f.crawlSeed, n = p.normal || [0, -1, 0];
      // Across the ceiling's slope (flat under the gallery), and along the nave.
      const across = [-n[1], n[0], 0];
      const a = Math.sin(t * 1.7) * C.radius, c = Math.cos(t * 1.31 + 1) * C.radius;
      const at = [p.x + across[0] * a, p.y + across[1] * a, p.z + c];
      const heading = (p.heading || 0) + Math.sin(t * .9) * .9;
      // Body frame: its back (local +y) faces down into the room, belly to the
      // stone, head (local -z) along the ceiling. Right-handed: x = y cross z.
      const up = n, fwd0 = [Math.sin(heading), 0, -Math.cos(heading)];
      const dot = fwd0[0] * up[0] + fwd0[1] * up[1] + fwd0[2] * up[2];
      const fwd = (() => { const q = fwd0.map((x, i) => x - up[i] * dot), l = Math.hypot(...q) || 1; return q.map((x) => x / l); })();
      const back = fwd.map((x) => -x), right = [up[1] * back[2] - up[2] * back[1], up[2] * back[0] - up[0] * back[2], up[0] * back[1] - up[1] * back[0]];
      const k = twitchOf(f, timeSec) * amp, v = f.twitchVector, s = p.scale || 1;
      const bodyM = mul(basis(right, up, back, at), mul(mul(yawM(k * v[0] * .3), pitchM(k * v[1] * .25)), scale(s)));
      emit(p, M.clinging, bodyM);
      // The head turns all the way to you. Nothing about its neck stops it.
      const pivots = PIVOTS.clinging, headAt = apply(bodyM, pivots.head);
      let watchingYou = false, look = mul(translate(...headAt), scale(s));
      if (eye) {
        const d = [eye.x - headAt[0], eye.y - headAt[1], eye.z - headAt[2]], dist = Math.hypot(...d);
        watchingYou = dist < A.range && sees(f, { x: headAt[0], y: headAt[1], z: headAt[2] }, eye, canSee, timeSec);
        if (f.saccadeDue || !f.lookDir) { f.saccadeDue = false; const miss = (f.random() * 2 - 1) * .06; f.lookTarget = d.map((x, i) => x / (dist || 1) + (i === 1 ? 0 : miss)); }
        f.lookDir = f.lookDir ? f.lookDir.map((x, i) => x + (f.lookTarget[i] - x) * snap) : f.lookTarget;
        const lf = (() => { const l = Math.hypot(...f.lookDir) || 1; return f.lookDir.map((x) => x / l); })();
        const yaw = Math.atan2(lf[0], -lf[2]), pitchTo = Math.asin(clamp(lf[1], -1, 1));
        look = mul(translate(...headAt), mul(yawM(yaw + k * v[3] * .4), mul(pitchM(pitchTo + k * v[2] * .3), mul(rollM(Math.sin(timeSec * 1.3 + f.phase) * .5), scale(s)))));
      }
      emit(p, M.head, look, { id: `${p.id}:head` });
      if (watchingYou) watchers++;
      voices.push({ id: p.id, x: headAt[0], y: headAt[1], z: headAt[2], intensity: (watchingYou ? 1.15 : A.murmur.unseen * A.murmur.throughStone) * (1 + agitation) * (1 + .8 * k), seen: watchingYou });
    }
    return { instances, watchers, voices, agitation };
  }

  return { frame, reset() { figures.clear(); lastTime = null; } };
}

// The murmur reaching a point (the eye, or the recorder during a take), on the
// recordist's noise scale. Voices add as energy.
export function chapelMurmurAt(voices, point) {
  const R = CHAPEL_APPARITION.murmur;
  if (!point) return 0;
  let energy = 0;
  for (const v of voices || []) {
    const d = Math.hypot(v.x - point.x, v.y - point.y, v.z - point.z);
    energy += v.intensity / (1 + (d / R.ref) ** 2);
  }
  return R.gain * Math.sqrt(energy);
}

// The audio wants a handful of positioned voices, not sixty: gather the
// murmurers into the loudest few clusters as heard from the listener.
export function chapelMurmurVoices(voices, listener, count = CHAPEL_APPARITION.murmur.voices) {
  if (!listener) return [];
  const R = CHAPEL_APPARITION.murmur, cells = new Map();
  for (const v of voices || []) {
    const key = `${Math.floor(v.x / 3)},${Math.floor(v.z / 3)},${Math.floor(v.y / 3)}`;
    const d = Math.hypot(v.x - listener.x, v.y - listener.y, v.z - listener.z), heard = v.intensity / (1 + (d / R.ref) ** 2);
    const c = cells.get(key) || { key, x: 0, y: 0, z: 0, weight: 0, heard: 0 };
    c.x += v.x * heard; c.y += v.y * heard; c.z += v.z * heard; c.weight += heard; c.heard += heard;
    cells.set(key, c);
  }
  return [...cells.values()].filter((c) => c.weight > 0).sort((a, b) => b.heard - a.heard).slice(0, count)
    .map((c) => ({ id: `murmur:${c.key}`, x: c.x / c.weight, y: c.y / c.weight, z: c.z / c.weight, gain: Math.sqrt(c.heard) * R.gain / .18 }));
}
