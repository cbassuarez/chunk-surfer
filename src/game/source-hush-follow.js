// HUSH FOLLOWS FROM THE DOOR.
//
// Once the Scene Dock has been taken back he stands where its door was, and
// from then on he comes after you. He walks the ground you walked, in your
// footsteps, and never shortens the distance on his own. Before the lift he
// gives ground when you come at him. In Source proper, keep coming and he
// comes to meet you, and the distance you close stays closed. He is late to
// everything, keeps his own pace and stops now and then, so his steps never
// answer yours one for one.
//
// Pure. Positions are Source-local metres: x, z and the floor under him.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback);

export const SOURCE_HUSH_FOLLOW = Object.freeze({
  // The distance he keeps once the door is gone, and after a fall is cut.
  gap: Object.freeze({ min: 14, max: 22, afterCut: 12, afterTalk: 11, contact: 2.2 }),
  // He sets off only once you are this much past his distance, and stops a
  // little short of it, so following comes in spells rather than a tow rope.
  slack: 3,
  settle: .5,
  // Walking pace in metres per second. He is slower than you when close and
  // faster when he has fallen well behind; the pace itself drifts.
  pace: Object.freeze({ base: 4.1, behindGain: .55, min: 1.4, max: 6.3, drift: .14 }),
  meetPace: Object.freeze({ min: 2.2, max: 3.4 }),
  accel: 3, decel: 4.5,
  // How long a change in what you are doing takes to reach him.
  notice: Object.freeze({ tau: .7, min: .35, max: 1.0 }),
  // Approach speeds (m/s, filtered) that count as coming at him.
  approach: Object.freeze({ start: .8, stop: .3 }),
  // Before the lift he backs away rather than let you close. He keeps at least
  // this much between you, and backs off harder inside it.
  yield: Object.freeze({ floor: 9, pace: .9, push: 2.5, accel: 6 }),
  pause: Object.freeze({ every: Object.freeze([10, 22]), length: Object.freeze([.8, 2.2]) }),
  turnRate: 1.8,
  // He stops about three metres off; contact reaches a little past that.
  contactRange: 3.6,
  contactFloor: 1.2,
  // Breadcrumbs: one per half metre walked, or per change of level.
  crumb: Object.freeze({ step: .5, rise: .4, loop: .9, max: 900 }),
});
const F = SOURCE_HUSH_FOLLOW;

function seeded(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSourceHushFollow(value = null) {
  const v = value && typeof value === 'object' ? value : {};
  const active = !!v.active && [v.x, v.z, v.floor].every((n) => Number.isFinite(Number(n)));
  return {
    version: 1,
    active,
    x: active ? Number(v.x) : 0,
    z: active ? Number(v.z) : 0,
    floor: active ? Number(v.floor) : 0,
    heading: finite(v.heading),
    gap: clamp(v.gap ?? F.gap.max, F.gap.contact, F.gap.max),
  };
}

const headingTo = (from, to) => Math.atan2(to.x - from.x, -(to.z - from.z));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// `lineClear(a, b)` answers whether he can walk straight between two points on
// the same level without leaving the ground; the runtime owns the geometry.
export function createSourceHushFollow(initial = null, { seed = 1, lineClear = () => false } = {}) {
  const random = seeded(seed);
  const between = ([lo, hi]) => lo + (hi - lo) * random();
  let state = normalizeSourceHushFollow(initial);
  let trail = state.active ? [{ x: state.x, z: state.z, floor: state.floor }] : [];
  let speed = 0, clock = 0, phase = random() * 6.283;
  let intent = 'wait', pendingIntent = 'wait', pendingFor = 0, pendingNeeds = between([F.notice.min, F.notice.max]);
  let filteredApproach = 0, lastPlayer = null;
  let pauseIn = between(F.pause.every), pauseLeft = 0;
  let withdrawTo = 0, lineCheckIn = 0;

  function distanceTo(player) { return Math.hypot(player.x - state.x, player.z - state.z); }

  function begin({ x, z, floor, heading = 0, player = null }) {
    state = { ...state, active: true, x, z, floor, heading };
    const d = player ? distanceTo(player) : F.gap.max;
    state.gap = clamp(d, F.gap.min, F.gap.max);
    trail = [{ x, z, floor }];
    intent = pendingIntent = 'wait'; speed = 0; lastPlayer = null; filteredApproach = 0;
  }

  // Lay a breadcrumb where the player now stands. Walking back over your own
  // path takes the loop out, so the trail is always one way from him to you.
  function record(player) {
    if (!state.active || !player) return;
    const point = { x: player.x, z: player.z, floor: finite(player.floor) };
    const last = trail[trail.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < F.crumb.step && Math.abs(point.floor - last.floor) < F.crumb.rise) return;
    for (let i = 1; i < trail.length - 1; i++) {
      const crumb = trail[i];
      if (Math.abs(crumb.floor - point.floor) < F.crumb.rise
        && Math.hypot(point.x - crumb.x, point.z - crumb.z) < F.crumb.loop) {
        trail.length = i + 1;
        break;
      }
    }
    trail.push(point);
    if (trail.length > F.crumb.max) trail.splice(1, trail.length - F.crumb.max);
  }

  // A fall through Source proper is cut to the forecourt. He is put back in
  // the strata behind you, on the cleft's own path.
  function relocate(path = [], player = null) {
    if (!path.length) return;
    const at = path[0];
    state = { ...state, active: true, x: at.x, z: at.z, floor: at.floor, gap: F.gap.afterCut };
    state.heading = player ? headingTo(state, player) : state.heading;
    trail = path.map((p) => ({ x: p.x, z: p.z, floor: p.floor }));
    intent = pendingIntent = 'wait'; speed = 0; lastPlayer = null; filteredApproach = 0;
  }

  // After a talk he gives you room: a few slow steps back, and a longer
  // distance kept from then on, until you close it again.
  function release() {
    if (!state.active) return;
    state.gap = Math.max(state.gap, F.gap.afterTalk);
    withdrawTo = 6; intent = pendingIntent = 'withdraw'; speed = 0;
  }

  function decide(next, dt) {
    if (next === intent) { pendingIntent = next; pendingFor = 0; return; }
    if (next !== pendingIntent) { pendingIntent = next; pendingFor = 0; pendingNeeds = between([F.notice.min, F.notice.max]); }
    pendingFor += dt;
    if (pendingFor >= pendingNeeds) { intent = next; pendingFor = 0; }
  }

  function steer(target, wanted, dt, { backwards = false, face = null, accel = F.accel } = {}) {
    const dx = target.x - state.x, dz = target.z - state.z, d = Math.hypot(dx, dz);
    const rate = wanted > speed ? accel : F.decel;
    speed += clamp(wanted - speed, -rate * dt, rate * dt);
    const move = Math.min(d, Math.max(0, speed) * dt);
    if (d > 1e-6) { state.x += dx / d * move; state.z += dz / d * move; }
    if (Number.isFinite(target.floor)) {
      const rise = target.floor - state.floor;
      state.floor += clamp(rise, -3 * dt, 3 * dt);
    }
    const look = face ?? (backwards || d < 1e-6 ? null : Math.atan2(dx, -dz));
    if (look !== null) turnToward(look, dt);
    return d - move;
  }

  function turnToward(heading, dt) {
    const delta = wrap(heading - state.heading);
    state.heading = wrap(state.heading + clamp(delta, -F.turnRate * dt, F.turnRate * dt));
  }

  // Walk the breadcrumbs toward the player, taking a straight line wherever
  // the ground allows it.
  function walkTrail(player, wanted, dt) {
    lineCheckIn -= dt;
    if (lineCheckIn <= 0) {
      lineCheckIn = .25;
      if (lineClear({ x: state.x, z: state.z, floor: state.floor }, player)) trail = [{ x: player.x, z: player.z, floor: finite(player.floor) }];
    }
    while (trail.length > 1 && Math.hypot(trail[0].x - state.x, trail[0].z - state.z) < .35) trail.shift();
    const target = trail[0] || player;
    steer(target, wanted, dt);
  }

  function tick(dt, { player, proper = false, busy = false } = {}) {
    if (!state.active || !player) return frame(player);
    const seconds = clamp(dt, 0, .25);
    clock += seconds;
    const d = distanceTo(player);
    // Only the player's own movement toward him counts as coming at him. His
    // walking closes distance too, and must never read as being approached.
    if (lastPlayer && seconds > 0 && d > 1e-6) {
      const rate = ((player.x - lastPlayer.x) * (state.x - player.x) + (player.z - lastPlayer.z) * (state.z - player.z)) / d / seconds;
      filteredApproach += (rate - filteredApproach) * (1 - Math.exp(-seconds / F.notice.tau));
    }
    lastPlayer = { x: player.x, z: player.z };
    if (busy) { speed = 0; turnToward(headingTo(state, player), seconds); return frame(player); }

    const coming = filteredApproach > (intent === 'meet' || intent === 'yield' ? F.approach.stop : F.approach.start);
    let next;
    if (intent === 'withdraw' && !coming) next = d >= withdrawTo ? 'wait' : 'withdraw';
    // Come at him and he stops following. In Source proper he comes to meet
    // you; before the lift he only gives ground.
    else if (coming) next = proper ? (d > F.gap.contact ? 'meet' : 'wait') : (d < state.gap - 1 ? 'yield' : 'wait');
    else if (d > state.gap + (intent === 'follow' ? F.settle : F.slack)) next = 'follow';
    else next = 'wait';
    // Inside the yield floor there is no waiting to notice: he steps back.
    if (!proper && d < F.yield.floor) { intent = pendingIntent = 'yield'; }
    else decide(next, seconds);

    if (intent === 'follow' && pauseLeft <= 0) {
      pauseIn -= seconds;
      if (pauseIn <= 0 && d < state.gap + 8) { pauseLeft = between(F.pause.length); pauseIn = between(F.pause.every); }
    }
    if (pauseLeft > 0) {
      pauseLeft -= seconds;
      steer(state, 0, seconds, { face: headingTo(state, player) });
      return frame(player);
    }

    const drift = 1 + F.pace.drift * Math.sin(clock * .31 + phase) + F.pace.drift * .4 * Math.sin(clock * 1.07 + phase * 2);
    if (intent === 'follow') {
      const behind = Math.max(0, d - state.gap);
      const wanted = clamp((F.pace.base + F.pace.behindGain * (behind - F.slack)) * drift, F.pace.min, F.pace.max);
      walkTrail(player, wanted, seconds);
    } else if (intent === 'meet') {
      // The distance you close stays closed, and he closes it with you.
      state.gap = clamp(Math.min(state.gap, d), F.gap.contact, F.gap.max);
      // Stop short of the body: the distance he would need to stop counts.
      const stopping = speed * speed / (2 * F.decel);
      const wanted = d - stopping <= F.gap.contact + .8 ? 0 : (F.meetPace.min + (F.meetPace.max - F.meetPace.min) * (.5 + .5 * Math.sin(clock * .53 + phase))) * drift;
      walkTrail(player, wanted, seconds);
    } else if (intent === 'yield' || intent === 'withdraw') {
      const away = d > 1e-6 ? { x: state.x - (player.x - state.x) / d, z: state.z - (player.z - state.z) / d } : { x: state.x, z: state.z + 1 };
      const pressed = Math.max(0, filteredApproach);
      const wanted = intent === 'withdraw' ? 1.1
        : Math.max(pressed * F.yield.pace, d < F.yield.floor ? pressed + (F.yield.floor - d) * F.yield.push : 0) * drift;
      const target = { ...away, floor: state.floor };
      if (intent === 'withdraw' && !lineClear({ x: state.x, z: state.z, floor: state.floor }, target)) { intent = pendingIntent = 'wait'; speed = 0; }
      else steer(target, wanted, seconds, { backwards: true, face: headingTo(state, player), accel: intent === 'yield' ? F.yield.accel : F.accel });
      // Ground given up is ground he no longer needs to walk back over.
      if (trail.length) trail[0] = { x: state.x, z: state.z, floor: state.floor };
    } else {
      steer(state, 0, seconds, { face: headingTo(state, player) });
    }
    return frame(player);
  }

  function frame(player = null) {
    const d = player && state.active ? distanceTo(player) : Infinity;
    return Object.freeze({
      active: state.active, x: state.x, z: state.z, floor: state.floor, heading: state.heading,
      gap: state.gap, distance: d, intent: pauseLeft > 0 ? 'pause' : intent, speed,
      withinContact: state.active && d <= F.contactRange && player && Math.abs(finite(player.floor) - state.floor) <= F.contactFloor,
      trail: trail.length,
    });
  }

  return {
    begin, record, relocate, release, tick, frame,
    snapshot: () => ({ version: 1, active: state.active, x: state.x, z: state.z, floor: state.floor, heading: state.heading, gap: state.gap }),
  };
}
