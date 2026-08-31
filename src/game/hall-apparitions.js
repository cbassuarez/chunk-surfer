// THE HALL APPARITIONS — three former audience members, not a room with hit points.
//
// Each member owns a body, a seat of origin, health, an authored combat intent,
// a place in initiative, and an independently telegraphed parry.  The auditorium
// is still the stage around them, but no wall, row, balcony, or acoustic return
// can be selected or defeated.

const clampInt = (value, low, high) => Math.max(low, Math.min(high, Math.trunc(Number(value) || 0)));

function hash32(...parts) {
  let hash = 2166136261;
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const HALL_APPARITION_COUNT = 3;
export const HALL_APPARITION_HEALTH = 30;
export const HALL_REDIRECT_PERCENT = 8;

export const HALL_APPARITION_ROLE = Object.freeze({
  WITNESS: 'witness',
  RETURN: 'return',
  CUE: 'cue',
});

export const HALL_APPARITION_ROLE_LABEL = Object.freeze({
  [HALL_APPARITION_ROLE.WITNESS]: 'WITNESS',
  [HALL_APPARITION_ROLE.RETURN]: 'RETURN',
  [HALL_APPARITION_ROLE.CUE]: 'CUE',
});

// Anonymous on purpose. Their seats distinguish them without inventing names or
// biographies the story has never supplied. The fused-chair poses make the
// origin literal even after they stand to fight.
export const HALL_APPARITION_DEFS = Object.freeze([
  Object.freeze({ id: 'apparition-row-f', label: 'APPARITION 01', seat: 'ROW F', role: HALL_APPARITION_ROLE.WITNESS, pose: 'head-turn' }),
  Object.freeze({ id: 'apparition-stalls', label: 'APPARITION 02', seat: 'STALLS', role: HALL_APPARITION_ROLE.RETURN, pose: 'stoop' }),
  Object.freeze({ id: 'apparition-box', label: 'APPARITION 03', seat: 'SIDE BOX', role: HALL_APPARITION_ROLE.CUE, pose: 'arm-out' }),
]);

export function createHallApparitions({ seed = 'hall', health = HALL_APPARITION_HEALTH, members = HALL_APPARITION_DEFS } = {}) {
  const maxHealth = Math.max(1, Math.trunc(Number(health) || HALL_APPARITION_HEALTH));
  return {
    schema: 1,
    seed: String(seed),
    round: 0,
    target: 0,
    activeActorId: 'player',
    activeIndex: -1,
    lastPlayerTargets: [],
    members: members.slice(0, HALL_APPARITION_COUNT).map((member, index) => ({
      id: String(member.id || `apparition-${index + 1}`),
      label: String(member.label || `APPARITION ${String(index + 1).padStart(2, '0')}`),
      seat: String(member.seat || 'AUDITORIUM'),
      role: member.role || HALL_APPARITION_ROLE.WITNESS,
      pose: member.pose || 'head-turn',
      health: maxHealth,
      maxHealth,
      acting: false,
      guard: null,
      intentId: null,
    })),
  };
}

export const liveHallApparitions = (roster) => (roster?.members || []).filter((member) => member.health > 0);
export const hallApparitionsDefeated = (roster) => !!roster && liveHallApparitions(roster).length === 0;
export const hallApparitionTotalHealth = (roster) => liveHallApparitions(roster).reduce((sum, member) => sum + member.health, 0);
export const hallApparition = (roster, id) => (roster?.members || []).find((member) => member.id === id) || null;
export const activeHallApparition = (roster) => hallApparition(roster, roster?.activeActorId);
export const targetedHallApparition = (roster) => (roster?.members || [])[roster?.target] || null;

export function settleHallTarget(roster) {
  if (!roster) return roster;
  if (targetedHallApparition(roster)?.health > 0) return roster;
  const members = roster.members || [];
  for (let distance = 1; distance <= members.length; distance += 1) {
    for (const index of [roster.target - distance, roster.target + distance]) {
      if (index >= 0 && index < members.length && members[index].health > 0) {
        roster.target = index;
        return roster;
      }
    }
  }
  return roster;
}

export function moveHallTarget(roster, delta) {
  if (!roster || !liveHallApparitions(roster).length) return roster;
  const step = Math.sign(Number(delta) || 0) || 1;
  let index = roster.target;
  for (let guard = 0; guard < roster.members.length; guard += 1) {
    index = (index + step + roster.members.length) % roster.members.length;
    if (roster.members[index].health > 0) break;
  }
  roster.target = index;
  return roster;
}

export function selectHallTarget(roster, id) {
  if (!roster) return roster;
  const index = roster.members.findIndex((member) => member.id === id && member.health > 0);
  if (index >= 0) roster.target = index;
  return roster;
}

// A multi-target special grows outward from the selected primary. With three
// stable cards this makes every pair selectable by moving the primary, while
// keeping Q/E, controller shoulders, pointer, and touch on one targeting model.
export function hallTargetIds(roster, cap = 1) {
  if (!roster) return [];
  settleHallTarget(roster);
  const primary = targetedHallApparition(roster);
  if (!primary || primary.health <= 0) return [];
  const wanted = clampInt(cap, 1, HALL_APPARITION_COUNT);
  const ids = [primary.id];
  for (let distance = 1; ids.length < wanted && distance < roster.members.length; distance += 1) {
    for (const index of [roster.target + distance, roster.target - distance]) {
      const member = roster.members[(index + roster.members.length) % roster.members.length];
      if (member?.health > 0 && !ids.includes(member.id)) ids.push(member.id);
      if (ids.length >= wanted) break;
    }
  }
  return ids;
}

// Commit the three authored intents to three bodies once per round. The first
// living member is the next actor after the player; each later member owns its
// own intent and its own enemy turn.
export function commitHallApparitionRound(roster, round, intents = []) {
  if (!roster) return roster;
  roster.round = Math.max(0, Math.trunc(Number(round) || 0));
  roster.activeActorId = 'player';
  roster.activeIndex = -1;
  for (const member of roster.members) member.acting = false;
  const authored = Array.isArray(intents) ? intents.filter((intent) => intent?.id) : [];
  roster.members.forEach((member, index) => {
    member.intentId = authored.length ? authored[(index + roster.round) % authored.length].id : null;
  });
  settleHallTarget(roster);
  return roster;
}

export function beginHallEnemyTurns(roster) {
  if (!roster) return null;
  const index = roster.members.findIndex((member) => member.health > 0);
  if (index < 0) return null;
  for (const member of roster.members) member.acting = false;
  roster.activeIndex = index;
  roster.activeActorId = roster.members[index].id;
  roster.members[index].acting = true;
  return roster.members[index];
}

// Returns the next living enemy, or null after the third slot hands initiative
// back to the player.
export function advanceHallEnemyTurn(roster) {
  if (!roster) return null;
  for (const member of roster.members) member.acting = false;
  for (let index = Math.max(-1, roster.activeIndex) + 1; index < roster.members.length; index += 1) {
    const member = roster.members[index];
    if (member.health <= 0) continue;
    roster.activeIndex = index;
    roster.activeActorId = member.id;
    member.acting = true;
    return member;
  }
  roster.activeIndex = -1;
  roster.activeActorId = 'player';
  return null;
}

export function hallIntentId(roster, actorId = null) {
  const actor = hallApparition(roster, actorId || roster?.activeActorId)
    || liveHallApparitions(roster)[0]
    || null;
  return actor?.intentId || null;
}

// One visibly armed parry at most. It is deterministic and telegraphed on the
// member's card. Every member can own it; no invisible random check happens at
// the moment the player commits.
export function armNextHallParry(roster) {
  if (!roster) return null;
  for (const member of roster.members) member.guard = null;
  const live = liveHallApparitions(roster);
  if (!live.length) return null;
  // Two rounds out of three carry a guard. The first round is clean teaching.
  if (roster.round === 0 || hash32(roster.seed, 'parry-cadence', roster.round) % 3 === 0) return null;
  const member = live[hash32(roster.seed, 'parry-owner', roster.round) % live.length];
  member.guard = { mode: 'parry', armedRound: roster.round + 1 };
  return member;
}

function redirectTarget(roster, fromId, actionId) {
  const pool = liveHallApparitions(roster).filter((member) => member.id !== fromId);
  if (!pool.length) return null;
  const index = hash32(roster.seed, 'redirect-target', roster.round, fromId, actionId) % pool.length;
  return pool[index];
}

export function applyHallApparitionAction(roster, {
  actionId = '', targetIds = [], damage = 0,
} = {}) {
  const result = { targets: [], damaged: [], defeated: [], parried: [], redirects: [], dealt: 0 };
  if (!roster) return result;
  const amount = Math.max(0, Math.trunc(Number(damage) || 0));
  const ids = [...new Set((targetIds || []).filter(Boolean))];
  result.targets = ids;
  roster.lastPlayerTargets = ids;

  for (const id of ids) {
    const member = hallApparition(roster, id);
    if (!member || member.health <= 0 || amount <= 0) continue;
    if (member.guard) {
      member.guard = null;
      const roll = hash32(roster.seed, 'parry-redirect', roster.round, member.id, actionId) % 100;
      const redirected = roll < HALL_REDIRECT_PERCENT ? redirectTarget(roster, member.id, actionId) : null;
      if (redirected) {
        const before = redirected.health;
        redirected.health = Math.max(0, redirected.health - amount);
        const dealt = before - redirected.health;
        result.dealt += dealt;
        result.damaged.push({ id: redirected.id, damage: dealt, redirected: true });
        result.redirects.push({ from: member.id, to: redirected.id, damage: dealt });
        if (redirected.health === 0) result.defeated.push(redirected.id);
      } else result.parried.push(member.id);
      continue;
    }
    const before = member.health;
    member.health = Math.max(0, member.health - amount);
    const dealt = before - member.health;
    result.dealt += dealt;
    result.damaged.push({ id: member.id, damage: dealt, redirected: false });
    if (member.health === 0) result.defeated.push(member.id);
  }
  settleHallTarget(roster);
  return result;
}

export function hallApparitionSnapshot(roster, { targetIds = null } = {}) {
  if (!roster) return null;
  const scoped = new Set(targetIds || hallTargetIds(roster, 1));
  const live = liveHallApparitions(roster);
  return {
    total: live.length,
    totalHealth: hallApparitionTotalHealth(roster),
    defeated: hallApparitionsDefeated(roster),
    targetId: targetedHallApparition(roster)?.id || null,
    targetIds: [...scoped],
    activeActorId: roster.activeActorId,
    nextActorId: live[0]?.id || null,
    initiative: [
      { id: 'player', label: 'YOU', side: 'player', active: roster.activeActorId === 'player', defeated: false },
      ...roster.members.map((member) => ({
        id: member.id, label: member.label, side: 'enemy', active: roster.activeActorId === member.id, defeated: member.health <= 0,
      })),
    ],
    members: roster.members.map((member, index) => ({
      id: member.id,
      label: member.label,
      seat: member.seat,
      role: member.role,
      roleLabel: HALL_APPARITION_ROLE_LABEL[member.role] || '',
      pose: member.pose,
      health: member.health,
      maxHealth: member.maxHealth,
      defeated: member.health <= 0,
      primary: index === roster.target,
      targeted: scoped.has(member.id),
      acting: roster.activeActorId === member.id,
      parryReady: !!member.guard,
      intentId: member.intentId,
      status: member.health <= 0 ? 'DEFEATED'
        : member.guard ? 'PARRY READY'
          : roster.activeActorId === member.id ? 'ACTING'
            : `${member.health}/${member.maxHealth}`,
    })),
  };
}

export function hallApparitionView(roster) {
  const snapshot = hallApparitionSnapshot(roster);
  if (!snapshot) return null;
  return {
    activeActorId: snapshot.activeActorId,
    targetIds: snapshot.targetIds,
    members: snapshot.members,
  };
}
