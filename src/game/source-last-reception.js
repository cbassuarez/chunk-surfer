import * as receptionGeometry from '../data/source-last-reception.js';

const ROOM = receptionGeometry.SOURCE_LAST_RECEPTION;
const PHASES = new Set(['exploring', 'reveal-pending', 'grace', 'converging', 'captured', 'released', 'escaped']);
const RESOLVED = new Set(['released', 'escaped']);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
const finite = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y - b.y) * 1.5);
const point = (p) => ({ x: p.x, y: p.y ?? ROOM.floor, z: p.z });
const anchor = (id) => point(ROOM.anchors[id]);

export const LAST_RECEPTION_GRACE_SECONDS = 2.35;
export const LAST_RECEPTION_CAPTURE_SECONDS = 3.2;
export const LAST_RECEPTION_HOLD_SECONDS = 1.45;
export const LAST_RECEPTION_RESIDENTS = Object.freeze([
  { id: 'host', name: 'The host', x: -51.4, y: 9, z: -449.4, yaw: Math.PI / 2, speed: 1.55, delay: 0 },
  { id: 'guest-a', name: 'The seated guest', x: -65.3, y: 9, z: -447.7, yaw: Math.PI/2, speed: 1.8, delay: .45 },
  { id: 'guest-b', name: 'The other guest', x: -62, y: 9, z: -451.8, yaw: -1.3, speed: 1.7, delay: .2 },
  { id: 'window', name: 'The person at the window', x: -79, y: 9, z: -450, yaw: -Math.PI / 2, speed: 1.65, delay: .9 },
  { id: 'warning', name: 'The quiet resident', x: -61, y: 9, z: -457, yaw: -1.8, speed: 1.6, delay: 1.15 },
  { id: 'gallery', name: 'The guest upstairs', x: -80, y: 11.8, z: -457, yaw: Math.PI / 2, speed: 1.75, delay: .7 },
]);
const BY_ID = new Map(LAST_RECEPTION_RESIDENTS.map((resident) => [resident.id, resident]));

const CONVERSATIONS = Object.freeze([
  { id: 'host-admission', residentId: 'host', title: 'Late admission', facts: ['waiting'], lines: [
    'You are quite all right. We keep a place for late arrivals.',
    'The performance? I am afraid we have stopped making announcements. It was upsetting the guests.',
    'You may look around. The passage behind the box office comes back outside. People prefer to know that first.',
  ] },
  { id: 'guest-a-evening', residentId: 'guest-a', title: 'The last evening', facts: ['waiting', 'contradiction'], lines: [
    'I came for a concert. The man in that chair came for something else. We had the same ticket.',
    'He says the curtain never rose. I remember it coming down.',
    'Do not sit there. We have been keeping it for someone.',
  ] },
  { id: 'guest-b-curtain', residentId: 'guest-b', title: 'The curtain', facts: ['waiting', 'contradiction'], lines: [
    'There was no concert. There was not even a curtain. I would remember a curtain.',
    'I only came in to ask the way. They gave me that chair.',
    'I keep thinking someone will come through the door who knows what to do.',
  ] },
  { id: 'window-seam', residentId: 'window', title: 'The outside', facts: ['detention', 'boundary'], lines: [
    'You can see a long way from here. I have tried every part of that door.',
    'My hand goes thin at the frame. Like the edge of a sheet. The rest of me will not follow it.',
    'You are breathing. None of us can do that.',
  ] },
  { id: 'warning-service', residentId: 'warning', title: 'The other passage', facts: ['service'], lines: [
    'Behind the ticket grille. Through here, then to the right. The service passage leads outside.',
    'Walk it if you like. There is no lock. They have never needed one.',
    'I would rather you knew the room before anyone told you why we are here.',
  ] },
  { id: 'gallery-no-ending', residentId: 'gallery', title: 'The waiting room', facts: ['detention'], lines: [
    'You can hear every conversation from up here. The stories change. The people do not.',
    'This is where they keep us. We did not understand that when we arrived, either.',
    'The quiet one knows the passage. Please listen before the others notice you listening.',
  ] },
  { id: 'warning-truth', residentId: 'warning', title: 'What they are waiting for', requires: 'detention', reveals: true, facts: ['truth'], lines: [
    'This place holds what is left of people. I do not know who built it, or whether they remember us.',
    'They think a living person could carry a voice out. All of them have a voice they cannot bear to leave here.',
    'You can leave. That is what they have been waiting for.',
  ] },
  { id: 'window-truth', residentId: 'window', title: 'A living visitor', requires: 'boundary', reveals: true, facts: ['truth'], lines: [
    'It is not the door keeping you. It only keeps us.',
    'They have been discussing how many people a living person might carry. They cannot agree to leave anyone behind.',
    'You can leave. They mean to go with you.',
  ] },
  { id: 'host-truth', residentId: 'host', title: 'The guest we needed', requires: 'detention', reveals: true, facts: ['truth'], lines: [
    'We have tried to make this a pleasant place. It is still a place we are being held.',
    'Forgive me. We have never had a guest who could leave. They will all want to ask you.',
    'You can leave. Please remember that while they are asking.',
  ] },
]);
const CONVERSATION_BY_ID = new Map(CONVERSATIONS.map((conversation) => [conversation.id, conversation]));

function initialActor(resident) {
  return { id: resident.id, x: resident.x, y: resident.y, z: resident.z, yaw: resident.yaw,
    distance: 0, footstepDistance: 0, boundarySeconds: 0, speed: 0, path: [], repath: 0, mode: resident.id === 'guest-a' ? 'seated' : 'idle' };
}

function validPosition(value) {
  if (!value || !['x', 'y', 'z'].every((key) => Number.isFinite(Number(value[key])))) return false;
  return Number(value.x) >= -85 && Number(value.x) <= -43 && Number(value.z) >= -468 && Number(value.z) <= -442
    && Number(value.y) >= ROOM.floor - .1 && Number(value.y) <= ROOM.galleryFloor + .25;
}

/** Serializable local custody only. No inventory, injury, recording or ending fields are owned here. */
export function createLastReceptionState(saved = null) {
  const input = saved && typeof saved === 'object' ? saved : {};
  const phase = PHASES.has(input.phase) ? input.phase : 'exploring';
  const seen = Array.isArray(input.seen) ? [...new Set(input.seen.filter((id) => CONVERSATION_BY_ID.has(id)))] : [];
  const knowledge = {};
  for (const id of seen) for (const fact of CONVERSATION_BY_ID.get(id).facts || []) knowledge[fact] = true;
  const actors = LAST_RECEPTION_RESIDENTS.map((resident) => {
    const base = initialActor(resident);
    const found = Array.isArray(input.actors) && input.actors.find((actor) => actor?.id === resident.id);
    if (!validPosition(found)) return base;
    return { ...base, x: Number(found.x), y: Number(found.y), z: Number(found.z), yaw: finite(found.yaw, base.yaw),
      distance: clamp(found.distance, 0, 100000), speed: clamp(found.speed, 0, resident.speed),
      footstepDistance: clamp(found.footstepDistance ?? found.distance, 0, 100000),
      boundarySeconds: clamp(found.boundarySeconds, 0, 1),
      path: Array.isArray(found.path) ? found.path.filter(validPosition).map(point) : [], repath: clamp(found.repath, 0, .65),
      mode: ['idle', 'walk', 'reach', 'seated'].includes(found.mode) ? found.mode : 'idle' };
  });
  return {
    version: 1, phase, seen, knowledge, actors,
    elapsed: clamp(input.elapsed, 0, 100000), phaseElapsed: clamp(input.phaseElapsed, 0, 100000),
    graceUsed: !!input.graceUsed || ['converging', 'captured', 'released', 'escaped'].includes(phase),
    hold: phase === 'converging' ? clamp(input.hold, 0, LAST_RECEPTION_HOLD_SECONDS) : 0,
    contactActor: BY_ID.has(input.contactActor) ? input.contactActor : null,
    brushCooldown: clamp(input.brushCooldown, 0, 6), holdAnnounced: !!input.holdAnnounced,
    entered: !!input.entered || phase !== 'exploring', visits: clamp(input.visits, 0, 9999),
    outcome: ['captured', 'released'].includes(phase) ? 'captured' : phase === 'escaped' ? 'escaped' : null,
    imprint: !!input.imprint || ['captured', 'released'].includes(phase),
    lastPlayer: validPosition(input.lastPlayer) ? point(input.lastPlayer) : null,
    exit: ['mainDoor', 'serviceDoor'].includes(input.exit) ? input.exit : null,
    pleaClock: clamp(input.pleaClock ?? 2.8, 0, 4), pleaIndex: clamp(input.pleaIndex, 0, 100000),
    lastPleaResident: BY_ID.has(input.lastPleaResident) ? input.lastPleaResident : null,
    boundaryActor: BY_ID.has(input.boundaryActor) ? input.boundaryActor : null,
    movementRemaining: clamp(input.movementRemaining, 0, .32),
  };
}

export function serializeLastReceptionState(state) {
  return createLastReceptionState(state);
}

export function getLastReceptionConversation(state, residentId) {
  if (!BY_ID.has(residentId) || ['grace', 'converging', 'captured', 'reveal-pending'].includes(state.phase)) return null;
  const eligible = CONVERSATIONS.filter((entry) => entry.residentId === residentId
    && !state.seen.includes(entry.id) && (!entry.requires || state.knowledge[entry.requires]));
  const next = eligible[0];
  if (next) return { ...next, speaker: BY_ID.get(residentId).name, lines: [...next.lines], facts: [...next.facts] };
  const lines = state.imprint
    ? ['They are speaking to the chair now. They seem relieved that you have decided to stay.']
    : RESOLVED.has(state.phase)
      ? ['I saw you cross. I am trying to remember exactly how it looked.']
      : ['There is time to look around. The room has been here a long time.'];
  return { id: `${residentId}-quiet`, residentId, title: 'The last reception', speaker: BY_ID.get(residentId).name,
    lines, facts: [], reveals: false, repeat: true };
}

export function finishLastReceptionConversation(state, conversationOrResidentId) {
  const supplied = typeof conversationOrResidentId === 'object' ? conversationOrResidentId?.id : conversationOrResidentId;
  const conversation = CONVERSATION_BY_ID.get(supplied) || (BY_ID.has(supplied) ? getLastReceptionConversation(state, supplied) : null);
  if (!conversation || conversation.repeat || state.seen.includes(conversation.id)) return { changed: false, pendingReveal: false };
  if (conversation.requires && !state.knowledge[conversation.requires]) return { changed: false, pendingReveal: false };
  state.seen.push(conversation.id);
  for (const fact of conversation.facts || []) state.knowledge[fact] = true;
  if (conversation.reveals && state.phase === 'exploring') {
    state.phase = 'reveal-pending';
    state.phaseElapsed = 0;
  }
  return { changed: true, pendingReveal: state.phase === 'reveal-pending' };
}

// The dialogue system owns open/close. Finishing arms the cue, but it can only
// become public on a later playable update; cancellation never finishes a line.
export function closeLastReceptionDialogue() {}
export function cancelLastReceptionConversation() {}

function nodes() {
  const list = ROOM.navNodes || Object.entries(ROOM.anchors).map(([id, value]) => ({ id, ...point(value) }));
  return Array.isArray(list) ? list.map((node) => ({ ...point(node), id: node.id }))
    : Object.entries(list).map(([id, node]) => ({ ...point(node), id }));
}
const NAV = () => nodes();
function clear(a, b) {
  return typeof receptionGeometry.sourceLastReceptionSegmentClear !== 'function'
    || receptionGeometry.sourceLastReceptionSegmentClear(a, b, .23);
}
function nearestNode(position, list) {
  const sorted = [...list].sort((a, b) => dist(position, a) - dist(position, b));
  return sorted.find((node) => clear(position, node)) || sorted[0] || null;
}

/** Dijkstra on the authored, physically checked room/stair routes. */
export function lastReceptionPath(from, to) {
  if (clear(from, to)) return [point(to)];
  const list = NAV();
  const start = nearestNode(from, list), end = nearestNode(to, list);
  if (!start || !end) return [];
  const adjacency = new Map(list.map((node) => [node.id, []]));
  const byId = new Map(list.map((node) => [node.id, node]));
  for (const edge of ROOM.navEdges || []) {
    const [a, b] = Array.isArray(edge) ? edge : [edge.from, edge.to];
    if (!byId.has(a) || !byId.has(b)) continue;
    adjacency.get(a).push(b); adjacency.get(b).push(a);
  }
  const costs = new Map([[start.id, 0]]), previous = new Map(), open = new Set([start.id]);
  while (open.size) {
    const current = [...open].reduce((best, id) => costs.get(id) < costs.get(best) ? id : best);
    open.delete(current);
    if (current === end.id) break;
    for (const next of adjacency.get(current) || []) {
      const cost = costs.get(current) + dist(byId.get(current), byId.get(next));
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, cost); previous.set(next, current); open.add(next);
    }
  }
  if (!costs.has(end.id)) return [];
  const path = [end.id];
  while (path[0] !== start.id) path.unshift(previous.get(path[0]));
  const result = path.map((id) => point(byId.get(id)));
  if (clear(end, to)) result.push(point(to));
  // Replanning from between nodes must not walk back to the nearest anchor.
  // Keep the furthest directly reachable point on the selected physical path.
  while (result.length > 1 && clear(from, result[1])) result.shift();
  return result;
}

function moveActor(actor, target, seconds, resident) {
  actor.repath -= seconds;
  if (actor.repath <= 0 || !actor.path.length) {
    actor.path = lastReceptionPath(actor, target);
    actor.repath = .45 + LAST_RECEPTION_RESIDENTS.indexOf(resident) * .025;
  }
  let remaining = resident.speed * seconds;
  const start = point(actor);
  while (remaining > .0001 && actor.path.length) {
    const next = actor.path[0];
    const length = Math.hypot(next.x - actor.x, next.z - actor.z, next.y - actor.y);
    if (length < .06) { actor.path.shift(); continue; }
    const advance = Math.min(remaining, length);
    const fraction = advance / length;
    const candidate = { x: actor.x + (next.x - actor.x) * fraction, y: actor.y + (next.y - actor.y) * fraction,
      z: actor.z + (next.z - actor.z) * fraction };
    if (!clear(actor, candidate)) { actor.path = []; actor.repath = .15; break; }
    actor.yaw = Math.atan2(candidate.x - actor.x, candidate.z - actor.z);
    Object.assign(actor, candidate);
    actor.distance += advance;
    remaining -= advance;
    if (advance >= length - .0001) actor.path.shift();
  }
  actor.speed = Math.hypot(actor.x - start.x, actor.y - start.y, actor.z - start.z) / Math.max(seconds, .001);
  actor.mode = actor.speed > .08 ? 'walk' : 'idle';
}

function playerInside(player) {
  return player.x > -83.1 && player.x < -46.75 && player.z > -466.1 && player.z < -443.9
    && player.y >= ROOM.floor - .5 && player.y <= ROOM.galleryFloor + .8;
}

function crossedExit(player) {
  if (player.x < -46.72 || Math.abs(player.y - ROOM.floor) > 1) return null;
  if (Math.abs(player.z - ROOM.anchors.mainDoor.z) <= 2.1) return 'mainDoor';
  if (Math.abs(player.z - ROOM.anchors.serviceDoor.z) <= 1.9) return 'serviceDoor';
  return null;
}

function threatTarget(state, actor, player) {
  // Two residents reach intersections first; everyone else takes the actual
  // room routes. They never become impassable collision capsules.
  if (actor.id === 'host' && state.phaseElapsed < 10 && dist(player, anchor('mainInside')) > 4.5) return anchor('mainInside');
  if (actor.id === 'warning' && state.phaseElapsed < 12 && dist(player, anchor('serviceRoom')) > 4) return anchor('serviceRoom');
  return player;
}

function frameActors(state) {
  return state.actors.map((actor) => {
    const rise = actor.id === 'guest-a' ? state.phase === 'exploring' || state.phase === 'reveal-pending' ? 0
      : state.phase === 'grace' ? clamp(state.phaseElapsed / 1.3, 0, 1) : 1 : 1;
    return { ...actor, path: undefined, repath: undefined, phase: state.phase, elapsed: state.elapsed, rise,
      // The body sits in its chair, then rises into the clear standing aisle.
      seatOffset:actor.id==='guest-a'?{x:-.8*(1-rise),z:0}:null,
      mode: rise < 1 ? 'seated' : actor.mode,
      attention: ['grace', 'converging'].includes(state.phase) ? 1 : .25,
      boundary: state.phase === 'escaped' && state.exit && dist(actor, anchor(state.exit)) < .85,
      boundaryWeight: clamp(actor.boundarySeconds / .9, 0, 1),
    };
  });
}

export function getLastReceptionResidents(state) {
  const actors = frameActors(state);
  if (state.imprint) actors.push({ id: 'imprint', ...anchor('capture'), yaw: Math.PI / 2, phase: state.phase,
    mode: 'imprint', speed: 0, distance: 0, elapsed: state.elapsed, attention: 0 });
  return actors;
}

export function getLastReceptionPresentation(state) {
  const phase = state.phase;
  const residents = getLastReceptionResidents(state);
  const hold = clamp(state.hold / LAST_RECEPTION_HOLD_SECONDS, 0, 1);
  const subtitle = phase === 'grace' ? '“He can leave.”' : phase === 'captured' ? 'They are speaking to the chair.'
    : phase === 'released' ? 'They have kept your place. The service passage is still open.'
      : phase === 'converging' && hold > .08 ? 'Hands at your shoulders. Keep moving.' : null;
  return { phase, elapsed: state.elapsed, phaseElapsed: state.phaseElapsed, hold,
    threat: phase === 'converging' ? clamp(.28 + hold * .72, 0, 1) : 0,
    custody: phase === 'captured' ? 'captured' : RESOLVED.has(phase) ? 'released' : hold > .08 ? 'held'
      : phase === 'converging' ? 'surrounded' : 'free',
    locksMovement: phase === 'captured', movementMultiplier: phase === 'captured' ? 0 : 1,
    cue: phase === 'grace' ? 'public-repetition' : null, subtitle,
    resolved: RESOLVED.has(phase), residents, imprint: state.imprint };
}

/** All encounter time stops while paused, unfocused, inactive or reading. */
export function updateLastReception(state, { dt = 0, player = null, active = true, paused = false, dialogueOpen = false, focused = true } = {}) {
  const events = [];
  let footstepCount = 0;
  const current = player && Number.isFinite(Number(player.x)) && Number.isFinite(Number(player.z))
    ? { x: Number(player.x), y: finite(player.y, ROOM.floor), z: Number(player.z) } : null;
  const result = () => ({ events, presentation: getLastReceptionPresentation(state), residents: getLastReceptionResidents(state) });
  if (!active || paused || dialogueOpen || !focused || !current) return result();
  const inside = playerInside(current);
  // The game moves in half-metre logical cells while rendering a continuous
  // step. Carry movement resistance across that ordinary cell interval.
  if (state.lastPlayer && dist(current, state.lastPlayer) > .03) state.movementRemaining = .32;
  if (inside && !state.entered) { state.entered = true; state.visits += 1; }
  if (state.phase === 'reveal-pending') {
    state.phase = state.graceUsed ? 'converging' : 'grace';
    state.phaseElapsed = 0;
    state.graceUsed = true;
    events.push({ type: 'public-cue', residentId: 'guest-b', who: 'The other guest', text: 'He can leave.' });
  }
  const exit = crossedExit(current);
  if (exit && state.entered && ['grace', 'converging'].includes(state.phase)) {
    state.phase = 'escaped'; state.phaseElapsed = 0; state.outcome = 'escaped'; state.exit = exit;
    state.hold = 0; state.contactActor = null;
    state.boundaryActor = [...state.actors].sort((a, b) => dist(a, anchor(exit)) - dist(b, anchor(exit)))[0]?.id || 'host';
    for (const actor of state.actors) { actor.mode = 'idle'; actor.speed = 0; actor.path = []; }
    events.push({ type: 'escaped', text: 'Their hands flatten at the edge of the frame. You cross.', position: point(current) });
  }
  let remaining = clamp(dt, 0, 2);
  while (remaining > .00001) {
    const step = Math.min(remaining, .05); remaining -= step;
    state.elapsed += step; state.phaseElapsed += step;
    state.movementRemaining = Math.max(0, state.movementRemaining - step);
    state.brushCooldown = Math.max(0, state.brushCooldown - step);
    if (state.phase === 'grace') {
      for (const actor of state.actors) {
        actor.yaw = Math.atan2(current.x - actor.x, current.z - actor.z);
        actor.mode = 'idle'; actor.speed = 0;
      }
      if (state.phaseElapsed >= LAST_RECEPTION_GRACE_SECONDS) {
        state.phase = 'converging'; state.phaseElapsed = 0;
        events.push({ type: 'convergence', residentId: 'host', who: 'The host', text: 'Please. Take me with you.' });
      }
      continue;
    }
    if (state.phase === 'captured') {
      if (state.phaseElapsed >= LAST_RECEPTION_CAPTURE_SECONDS) {
        state.phase = 'released'; state.phaseElapsed = 0; state.hold = 0; state.contactActor = null;
        for (const actor of state.actors) {
          actor.mode = 'idle'; actor.speed = 0;
          actor.yaw = Math.atan2(ROOM.anchors.capture.x - actor.x, ROOM.anchors.capture.z - actor.z);
          actor.path = [];
        }
        events.push({ type: 'released', position: { ...anchor('release'), yaw: -Math.PI / 2 }, text: 'They are asking the chair to take them. The passage behind the grille is open.' });
      }
      continue;
    }
    if (state.phase === 'escaped') {
      const host = state.actors.find((actor) => actor.id === (state.boundaryActor || 'host'));
      const door = anchor(state.exit || 'mainDoor');
      if (host && dist(host, door) > .3 && state.phaseElapsed < 24) moveActor(host, { ...door, x: door.x - .3 }, step, BY_ID.get(host.id));
      if (host && dist(host, door) < .85) {
        host.boundarySeconds = Math.min(1, host.boundarySeconds + step);
        host.yaw = Math.PI / 2;
        host.mode = 'reach'; host.speed = 0;
      }
      continue;
    }
    if (state.phase !== 'converging' || !inside) continue;
    for (const actor of state.actors) {
      const resident = BY_ID.get(actor.id);
      if (state.phaseElapsed < resident.delay) continue;
      moveActor(actor, threatTarget(state, actor, current), step, resident);
      if (actor.distance - actor.footstepDistance >= 1.18) {
        actor.footstepDistance = actor.distance;
        if (footstepCount < 3 && dist(actor, current) < 17) {
          footstepCount += 1;
          events.push({ type: 'footstep', residentId: actor.id, position: point(actor) });
        }
      }
    }
    state.pleaClock -= step;
    if (state.pleaClock <= 0) {
      const nearby = [...state.actors].sort((a, b) => dist(a, current) - dist(b, current));
      const speaker = nearby.find((actor) => actor.id !== state.lastPleaResident) || nearby[0];
      const pleas = { host: 'Please. We kept a place for you.', 'guest-a': 'I can be quiet. You would not notice me.',
        'guest-b': 'There is room for one more.', window: 'Do not leave me at the door.',
        warning: 'Please. I cannot stay here.', gallery: 'Can you hear me now?' };
      state.lastPleaResident = speaker.id; state.pleaIndex += 1;
      state.pleaClock = 2.7 + (state.pleaIndex % 3) * .45;
      events.push({ type: 'plea', residentId: speaker.id, who: BY_ID.get(speaker.id).name, text: pleas[speaker.id], position: point(speaker) });
    }
    const contacts = state.actors.filter((actor) => Math.abs(actor.y - current.y) < .8 && dist(actor, current) < .85 && clear(actor, current));
    const nearest = contacts.sort((a, b) => dist(a, current) - dist(b, current))[0];
    if (!nearest) {
      state.hold = Math.max(0, state.hold - step * 2.4);
      if (!state.hold) { state.contactActor = null; state.holdAnnounced = false; }
      continue;
    }
    nearest.mode = 'reach';
    nearest.yaw = Math.atan2(current.x - nearest.x, current.z - nearest.z);
    state.contactActor = nearest.id;
    // Directional movement resists a hold. Do not slow a visitor below the
    // crowd's pace: that would turn first contact into an inescapable capture.
    state.hold += step * (state.movementRemaining > 0 ? .35 : 1);
    if (state.brushCooldown <= 0) {
      state.brushCooldown = 5;
      events.push({ type: 'brush', residentId: nearest.id, who: BY_ID.get(nearest.id).name, text: 'Wait. Just one of us.' });
    }
    if (state.hold > .28 && !state.holdAnnounced) {
      state.holdAnnounced = true;
      events.push({ type: 'hold', residentId: nearest.id, text: 'Hands at your shoulders. Keep moving.' });
    }
    if (state.hold >= LAST_RECEPTION_HOLD_SECONDS) {
      state.phase = 'captured'; state.phaseElapsed = 0; state.imprint = true; state.outcome = 'captured';
      for (const actor of state.actors) { actor.speed = 0; actor.mode = 'idle'; actor.path = []; }
      events.push({ type: 'captured', position: { ...anchor('capture'), yaw: Math.PI / 2 }, text: 'A chair scrapes. Your shape stays seated when you rise.' });
    }
  }
  state.lastPlayer = point(current);
  return result();
}
