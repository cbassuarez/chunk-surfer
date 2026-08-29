// THE HOUSE — a group opponent for the concert hall.
//
// Every other fight in the game is one thing in one room, and the whole combat
// layer is shaped around that: one committed intent per beat, one coherence
// bar, one thing to answer. The hall is the exception the writing has always
// implied and the mechanics never delivered — its third movement is literally
// called APPLAUSE WITHOUT HANDS, and the recordist's refusal is "nobody is
// sitting there". If the seats are full, that refusal stops being available and
// the fight becomes a different problem: not what is it, but which one.
//
// WHAT THIS IS NOT: the emergency-light apparitions. Those live in the world,
// under a director that deliberately never receives player coordinates and
// cannot pursue, approach, or reason about the player (see
// apparition-director.js, and keep that boundary). The house is drawn by the
// battle UI, inside the fight, and it is allowed to look at you — because it is
// a picture of an audience, not a thing walking around the building.
//
// THE SHAPE OF A BEAT
//
//   One row acts. It telegraphs, the same way a single opponent does.
//   The cursor may point at ANY row, including one that is not acting.
//
// So every beat is a real choice with no safe answer: spend it defending
// against the row that is about to hit you, or spend it clearing a row that
// will hit you later and eat this one. Answering the acting row correctly does
// both — that is what a perfect counter is worth against a crowd.
//
// Pure, seeded, and dependency-free: it takes a house and returns a house, so
// combat-state can own one without an import cycle and the tests can drive it
// without a fight around it.

// FNV-1a, the same one the rest of the combat layer uses. Never Math.random in
// here — two players on the same seed must face the same house.
function hash32(...parts) {
  let hash = 2166136261;
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const unit = (...parts) => hash32(...parts) / 4294967296;
const integer = (low, high, ...parts) => low + Math.floor(unit(...parts) * (high - low + 1));
const clampInt = (value, low, high) => Math.max(low, Math.min(high, Math.trunc(Number(value) || 0)));

// The hall, from the floor up. ROW F is not decoration: it is where the named
// thread puts her — "Row F. You had the recorder on your knee. You were setting
// a level while I said it." — so the fight has one seat in it that means
// something, and the player can choose whether to clear it.
// FIVE UNITS, NOT ONE OPPONENT IN FIVE COSTUMES.
//
// Each section owns a job it keeps for the whole encounter, and the job is the
// reason to point at it. Before this the sections differed only in how many
// figures were sitting in them, so the cursor was a formality: every row was
// the same row with a different population, and clearing one only made the
// alternate victory arrive sooner.
//
// The roles are chosen so that no two answer the same question. NEAR FIELD is
// pressure you feel now; CUE is pressure you can see coming; CHORUS makes
// somebody else's blow worse; HOUSE RETURN adds a second contact; WITNESS
// punishes a player who keeps reaching for the same tool. Three of the five are
// only dangerous through another section, which is what makes the order you
// clear them matter.
export const HOUSE_ROLE = Object.freeze({
  NEAR_FIELD: 'near-field',
  WITNESS: 'witness',
  HOUSE_RETURN: 'house-return',
  CHORUS: 'chorus',
  CUE: 'cue',
});

export const HOUSE_ROLE_LABEL = Object.freeze({
  [HOUSE_ROLE.NEAR_FIELD]: 'NEAR FIELD',
  [HOUSE_ROLE.WITNESS]: 'WITNESS',
  [HOUSE_ROLE.HOUSE_RETURN]: 'HOUSE RETURN',
  [HOUSE_ROLE.CHORUS]: 'CHORUS',
  [HOUSE_ROLE.CUE]: 'CUE',
});

export const HOUSE_ROWS = Object.freeze([
  Object.freeze({ id: 'stalls', label: 'STALLS', role: HOUSE_ROLE.NEAR_FIELD }),
  Object.freeze({ id: 'row-f', label: 'ROW F', role: HOUSE_ROLE.WITNESS }),
  Object.freeze({ id: 'boxes', label: 'SIDE BOXES', role: HOUSE_ROLE.HOUSE_RETURN }),
  Object.freeze({ id: 'lower', label: 'LOWER BALCONY', role: HOUSE_ROLE.CHORUS }),
  Object.freeze({ id: 'upper', label: 'UPPER TIER', role: HOUSE_ROLE.CUE }),
]);

// HOW LOUD A MOVE IS, IN THE ONLY TERMS A CROWD UNDERSTANDS.
//
// The combat layer classifies actions by which intent they counter; the house
// needs a second, orthogonal question — where does the force GO. A shape is not
// a new action, it is a reading of an existing one, so nothing outside the hall
// changes and no other encounter has to know these exist.
export const HOUSE_SHAPE = Object.freeze({
  FOCUS: 'focus',       // aimed at one section
  SPILL: 'spill',       // the target and whoever is sitting next to it
  DAMP: 'damp',         // takes a section out of the formation rather than out of the house
  ROOM: 'room',         // reaches every occupied section
  RETURN: 'return',     // goes back at whoever actually threw the blow
});

export const HOUSE_SHAPE_LABEL = Object.freeze({
  [HOUSE_SHAPE.FOCUS]: 'FOCUS',
  [HOUSE_SHAPE.SPILL]: 'SPILL',
  [HOUSE_SHAPE.DAMP]: 'DAMP',
  [HOUSE_SHAPE.ROOM]: 'ROOM',
  [HOUSE_SHAPE.RETURN]: 'RETURN',
});

const ACTION_SHAPE = Object.freeze({
  monitor: HOUSE_SHAPE.FOCUS,
  expose: HOUSE_SHAPE.FOCUS,
  invert: HOUSE_SHAPE.FOCUS,
  'master-take': HOUSE_SHAPE.FOCUS,
  'radio-decoy': HOUSE_SHAPE.FOCUS,
  shout: HOUSE_SHAPE.SPILL,
  playback: HOUSE_SHAPE.SPILL,
  channel: HOUSE_SHAPE.SPILL,
  hold: HOUSE_SHAPE.DAMP,
  tune: HOUSE_SHAPE.DAMP,
  'steady-hands': HOUSE_SHAPE.DAMP,
  whiteout: HOUSE_SHAPE.ROOM,
  'runaway-feedback': HOUSE_SHAPE.ROOM,
  parry: HOUSE_SHAPE.RETURN,
  'fireball-return': HOUSE_SHAPE.RETURN,
});

export const houseShapeFor = (actionId) => ACTION_SHAPE[actionId] || null;

// Sparse on purpose. Enough figures to read as an audience; few enough that the
// empty seats between them do the work, and that every one you put down is
// visible as a change rather than as a number going down.
export const HOUSE_MIN_FIGURES = 6;
export const HOUSE_MAX_FIGURES = 12;

// Loud specials fill a room; a thrown voice does not. WHITEOUT is a light burst
// and RUNAWAY FEEDBACK is the room's own gain turned on itself — both reach
// every seat. RADIO DECOY misdirects one section, and MASTER TAKE is aimed.
export const HOUSE_GROUP_SPECIALS = Object.freeze(['whiteout', 'runaway-feedback']);
export const HOUSE_AIMED_SPECIALS = Object.freeze(['master-take', 'radio-decoy']);
export const isGroupSpecial = (actionId) => HOUSE_GROUP_SPECIALS.includes(actionId);

// WHAT ACTUALLY PUTS SOMEBODY DOWN.
//
// Not damage. Coherence damage and figures were the same currency at first, and
// it made the fight collapse: MONITOR chips for one, a figure costs one, and a
// house of eight was empty in six decisions against an encounter written for
// nine to fifteen. Worse, it made the target cursor a formality — every action
// cleared a seat, so there was never a reason to point anywhere in particular.
//
// A figure goes down when you READ one right, or when you are loud enough that
// reading does not come into it. Ordinary chip damage still runs the movement,
// and touches nobody. That ties the only group fight in the game to the skill
// the rest of the game is about, and makes a perfect counter in the hall worth
// visibly more than a perfect counter anywhere else.
//
// Always exactly one per row, never scaled by damage: the player is counting
// people, and a number that jumps by an amount they cannot predict is a number
// they stop reading.
export function houseStrikeFor(actionId, perfect) {
  if (isGroupSpecial(actionId)) return 'group';
  if (perfect || HOUSE_AIMED_SPECIALS.includes(actionId) || actionId === 'parry') return 'single';
  return null;
}

export function createHouse({ seed = 'hall', figures = null, rows = HOUSE_ROWS } = {}) {
  const wanted = figures == null
    ? integer(HOUSE_MIN_FIGURES, HOUSE_MAX_FIGURES, seed, 'total')
    : clampInt(figures, rows.length, HOUSE_MAX_FIGURES * 2);
  // Everybody gets one, then the remainder is dealt out seeded. A row that
  // started empty could never act and could never be cleared, which would read
  // as a bug rather than as an empty section.
  //
  // The deal is capped, because an uncapped one is not evenly lumpy — it is
  // occasionally catastrophic. Eight figures across five rows landed 4/1/1/1/1
  // on the first seed tried, which reads as one crowd and four mistakes, and
  // makes the target cursor pointless: there is only ever one row worth hitting.
  const cap = Math.ceil(wanted / rows.length) + 1;
  const counts = rows.map(() => 1);
  for (let dealt = rows.length; dealt < wanted; dealt += 1) {
    let index = integer(0, rows.length - 1, seed, 'deal', dealt);
    for (let probe = 0; probe < rows.length && counts[index] >= cap; probe += 1) {
      index = (index + 1) % rows.length;
    }
    counts[index] += 1;
  }
  return {
    seed: String(seed),
    rows: rows.map((row, index) => ({
      id: row.id,
      label: row.label,
      role: row.role || null,
      figures: counts[index],
      seats: counts[index],
      acting: false,
      // A section you have rattled but not yet broken. The second landed blow
      // is the one that empties a seat — see applyHouseAction.
      settled: true,
      // Enemy resolutions this section sits out of the formation for. DAMP puts
      // a section here instead of putting somebody down: it is the answer to a
      // support you cannot afford to let fire but do not have the charge to
      // clear.
      suppressed: 0,
    })),
    target: 0,
    beat: 0,
    lastActing: null,
    leadStreak: 0,
    packet: null,
    cue: null,
    // Tools the player has reached for lately, oldest first. ROW F reads this.
    toolMemory: [],
  };
}

export const houseTotal = (house) => (house?.rows || []).reduce((sum, row) => sum + row.figures, 0);
export const houseSeats = (house) => (house?.rows || []).reduce((sum, row) => sum + row.seats, 0);
export const houseCleared = (house) => !!house && houseTotal(house) === 0;
export const occupiedRows = (house) => (house?.rows || []).filter((row) => row.figures > 0);
export const houseRow = (house, rowId) => (house?.rows || []).find((row) => row.id === rowId) || null;
export const actingRow = (house) => (house?.rows || []).find((row) => row.acting) || null;
export const targetRow = (house) => (house?.rows || [])[house?.target] || null;

// The cursor skips cleared rows. Pointing at an empty section and pressing a
// counter would be a dead beat the player did not know they were spending.
export function moveHouseTarget(house, delta) {
  if (!house) return house;
  const live = occupiedRows(house);
  if (!live.length) return house;
  const step = Math.sign(Number(delta) || 0) || 1;
  let index = house.target;
  for (let guard = 0; guard < house.rows.length; guard += 1) {
    index = (index + step + house.rows.length) % house.rows.length;
    if (house.rows[index].figures > 0) break;
  }
  house.target = index;
  return house;
}

// Name a section outright. A pointer or a finger does not want to walk the rail
// one card at a time, and a cleared section is never a legal destination.
export function selectHouseTarget(house, rowId) {
  if (!house) return house;
  const index = (house.rows || []).findIndex((row) => row.id === rowId);
  if (index < 0 || house.rows[index].figures <= 0) return house;
  house.target = index;
  return house;
}

// Keep the cursor legal after the row under it empties — and keep it NEAR.
// Jumping to the first occupied row throws the player across the house every
// time they clear a section, which loses their place in a fight whose whole
// decision is where they were pointing.
export function settleHouseTarget(house) {
  if (!house) return house;
  if (targetRow(house)?.figures > 0) return house;
  const rows = house.rows;
  for (let distance = 1; distance <= rows.length; distance += 1) {
    for (const index of [house.target - distance, house.target + distance]) {
      if (index >= 0 && index < rows.length && rows[index].figures > 0) {
        house.target = index;
        return house;
      }
    }
  }
  return house;
}

export const liveSections = (house) => occupiedRows(house).filter((row) => row.suppressed <= 0);
export const sectionRole = (house, id) => houseRow(house, id)?.role || null;

// HOW BIG A FORMATION MAY GET, PER MOVEMENT.
//
// Authored in the manifest; these are the fallbacks when a movement says
// nothing. The arc is the whole point: one section alone teaches you what the
// roles do, two teaches you that they combine, three is the fight.
export const HOUSE_FORMATION_DEFAULT = Object.freeze({ supports: 0, ovation: false });

// READABILITY CAPS. A committed packet the player cannot hold in their head is
// the same as a packet they never saw, so the ceilings are hard and the UI
// prints every contributor. +10 is one CHORUS at full strength or two at half;
// beyond that the number stops being a thing you weigh and becomes weather.
export const HOUSE_MAX_SUPPORTS = 2;
export const HOUSE_MAX_MAIN_BONUS = 10;
const FOLLOWUP_ALLOWANCE = Object.freeze({ guided: 1, standard: 1, severe: 2, 'dead-air': 2 });
export const houseFollowUpAllowance = (difficulty) => FOLLOWUP_ALLOWANCE[difficulty] ?? 1;

// THE ATTACK PACKET IS DECIDED ONCE AND THEN IT IS A FACT.
//
// Everything downstream — the preview, the target rail, the reaction track, the
// resolution — reads this same object. Nothing recomputes it, because a group
// attack that is recalculated at resolution time is a group attack the player
// was never actually shown, and the one promise a formation fight has to keep is
// that what it announced is what arrives.
//
// Player intervention may SUPPRESS a contributor between commitment and
// resolution (that is what DAMP and a cleared supporter do, and the packet says
// so out loud). It may never swap the lead for a different one.
function buildPacket(house, beat, { supports = 0, ovation = false, difficulty = 'standard' } = {}) {
  const live = liveSections(house);
  if (!live.length) return null;

  // The lead. Weighted by how many are still sitting in it, biased away from
  // leading twice running, and biased TOWARDS whoever the UPPER TIER cued — a
  // cue you did not disrupt is a cue that pays off.
  const cued = house.cue && live.some((row) => row.id === house.cue) ? house.cue : null;
  // THE CROWD PASSES IT AROUND.
  //
  // A 0.35 weight on the previous lead was not enough: a section holding three
  // figures against neighbours holding one still won a third of the time, so
  // the same row led twice running on 30% of beats and the house read as one
  // opponent again — the exact failure this file opens by describing. The bias
  // is harder now, and a section that has led the last two beats is off the
  // table entirely, so the lead cannot get stuck no matter how the figures fell.
  const streak = house.leadStreak || 0;
  const weights = live.map((row) => row.figures
    * (row.id === house.lastActing ? (streak >= 2 ? 0 : 0.2) : 1)
    * (row.id === cued ? 3 : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = unit(house.seed, 'lead', beat) * total;
  let lead = live[live.length - 1];
  for (let index = 0; index < live.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) { lead = live[index]; break; }
  }

  // Supporters: living, unsuppressed, and not the lead. Chosen seeded so the
  // same seed and the same play give the same fight.
  const bench = live.filter((row) => row.id !== lead.id);
  const wanted = Math.max(0, Math.min(HOUSE_MAX_SUPPORTS, Math.trunc(supports) || 0, bench.length));
  const picked = [];
  for (let slot = 0; slot < wanted; slot += 1) {
    const pool = bench.filter((row) => !picked.some((chosen) => chosen.id === row.id));
    if (!pool.length) break;
    picked.push(pool[integer(0, pool.length - 1, house.seed, 'support', beat, slot)]);
  }

  const followAllowance = houseFollowUpAllowance(difficulty);
  let mainBonus = 0;
  const contributions = [];
  const followUps = [];

  // NEAR FIELD is the one role that pays when it LEADS rather than when it
  // supports, so the stalls are dangerous exactly when you have let them take
  // the beat.
  if (lead.role === HOUSE_ROLE.NEAR_FIELD) {
    mainBonus += 3;
    contributions.push({ id: lead.id, label: lead.label, role: lead.role, effect: 'near-field', amount: 3, lead: true });
  }

  for (const row of picked) {
    if (row.role === HOUSE_ROLE.CHORUS) {
      const amount = Math.min(5, Math.max(0, HOUSE_MAX_MAIN_BONUS - mainBonus));
      if (amount > 0) {
        mainBonus += amount;
        contributions.push({ id: row.id, label: row.label, role: row.role, effect: 'chorus', amount });
      }
      continue;
    }
    if (row.role === HOUSE_ROLE.HOUSE_RETURN) {
      if (followUps.length < followAllowance) {
        followUps.push({ id: row.id, label: row.label, role: row.role, amount: 5 });
        contributions.push({ id: row.id, label: row.label, role: row.role, effect: 'follow-up', amount: 5 });
      }
      continue;
    }
    if (row.role === HOUSE_ROLE.WITNESS) {
      // What it noticed: the tool you have leaned on. A READ is worth more the
      // more you have repeated yourself, and it is visible before it lands.
      const read = houseReadPressure(house);
      if (read > 0) {
        const amount = Math.min(read, Math.max(0, HOUSE_MAX_MAIN_BONUS - mainBonus));
        if (amount > 0) {
          mainBonus += amount;
          contributions.push({ id: row.id, label: row.label, role: row.role, effect: 'read', amount, tool: houseReadTool(house) });
        }
      } else {
        contributions.push({ id: row.id, label: row.label, role: row.role, effect: 'read', amount: 0, tool: null });
      }
      continue;
    }
    if (row.role === HOUSE_ROLE.CUE) {
      contributions.push({ id: row.id, label: row.label, role: row.role, effect: 'cue', amount: 0 });
      continue;
    }
    contributions.push({ id: row.id, label: row.label, role: row.role, effect: 'press', amount: 2 });
    mainBonus = Math.min(HOUSE_MAX_MAIN_BONUS, mainBonus + 2);
  }

  // The cue names the next lead, and says so now. Disrupting the tier before it
  // resolves is what takes that certainty away from it.
  const cueSource = [lead, ...picked].find((row) => row.role === HOUSE_ROLE.CUE) || null;
  const cuePool = live.filter((row) => row.id !== lead.id);
  const nextLead = cueSource && cuePool.length
    ? cuePool[integer(0, cuePool.length - 1, house.seed, 'cue', beat)].id
    : null;

  return {
    beat: Number(beat) || 0,
    leadId: lead.id,
    leadLabel: lead.label,
    leadRole: lead.role,
    supports: picked.map((row) => ({ id: row.id, label: row.label, role: row.role })),
    contributions,
    mainBonus: Math.min(HOUSE_MAX_MAIN_BONUS, mainBonus),
    followUps,
    cue: nextLead,
    cueFrom: cueSource?.id || null,
    ovation: !!ovation && liveSections(house).length >= 3,
    suppressed: [],
  };
}

// WHAT ROW F HAS NOTICED. Three of the last four beats on one tool is a habit,
// and a habit is what a witness is for. Deliberately shallow and deliberately
// visible: the player can see the READ climbing and can break it by changing
// hands, which is the behaviour the role exists to provoke.
export function houseReadTool(house) {
  const memory = house?.toolMemory || [];
  if (memory.length < 2) return null;
  const counts = new Map();
  for (const tool of memory) counts.set(tool, (counts.get(tool) || 0) + 1);
  let best = null;
  for (const [tool, count] of counts) if (!best || count > best.count) best = { tool, count };
  return best && best.count >= 2 ? best.tool : null;
}

export function houseReadPressure(house) {
  const memory = house?.toolMemory || [];
  const tool = houseReadTool(house);
  if (!tool) return 0;
  const count = memory.filter((entry) => entry === tool).length;
  return Math.min(6, Math.max(0, (count - 1) * 3));
}

export function rememberHouseTool(house, actionId) {
  if (!house || !actionId) return house;
  if (actionId === 'target' || actionId === 'wait') return house;
  house.toolMemory = [...(house.toolMemory || []), String(actionId)].slice(-4);
  return house;
}

// Commit one enemy beat as a formation. Replaces the old single-row pick; the
// legacy `acting` flag is kept in sync so anything still reading it sees the
// lead.
export function commitHouseFormation(house, beat, options = {}) {
  if (!house) return house;
  // Suppression is spent at the moment the formation is built, so a DAMP buys
  // exactly one enemy resolution and the player can see it come back.
  for (const row of house.rows) if (row.suppressed > 0) row.suppressed -= 1;
  for (const row of house.rows) row.acting = false;
  const packet = buildPacket(house, beat, { ...HOUSE_FORMATION_DEFAULT, ...options });
  house.beat = Number(beat) || 0;
  house.packet = packet;
  if (!packet) { house.cue = null; return house; }
  const lead = houseRow(house, packet.leadId);
  if (lead) lead.acting = true;
  house.leadStreak = house.lastActing === packet.leadId ? (house.leadStreak || 0) + 1 : 1;
  house.lastActing = packet.leadId;
  house.cue = packet.cue;
  return house;
}

// Which row moves this beat. Weighted by how many are still sitting in it, so a
// full section is the loud one — and biased away from acting twice running,
// because a crowd that keeps hitting from the same place is one opponent again.
export function commitHouseBeat(house, beat) {
  if (!house) return house;
  for (const row of house.rows) row.acting = false;
  const live = occupiedRows(house);
  if (!live.length) return house;
  const weights = live.map((row) => row.figures * (row.id === house.lastActing ? 0.35 : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = unit(house.seed, 'acting', beat) * total;
  let chosen = live[live.length - 1];
  for (let index = 0; index < live.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) { chosen = live[index]; break; }
  }
  chosen.acting = true;
  house.beat = Number(beat) || 0;
  house.lastActing = chosen.id;
  return house;
}

// One point of damage is one figure. Damage is not a health bar here — it is a
// count of people who stop being there, which is the only currency the picture
// can actually show.
export function strikeHouse(house, rowId, damage = 1) {
  const row = houseRow(house, rowId);
  if (!row || row.figures <= 0) return { removed: 0, cleared: false };
  const removed = Math.min(row.figures, Math.max(0, Math.trunc(Number(damage) || 0)));
  row.figures -= removed;
  if (row.figures === 0) row.acting = false;
  settleHouseTarget(house);
  return { removed, cleared: row.figures === 0 };
}

// A group special reaches every occupied row at once. Deliberately one figure
// per row rather than full damage everywhere: against a full house that is five
// people, which is worth banking a charge for, and against a nearly-cleared one
// it is worth much less — so the decision of when to spend it is a real one.
export function strikeHouseAll(house, damage = 1) {
  const rows = occupiedRows(house).map((row) => row.id);
  let removed = 0;
  for (const id of rows) removed += strikeHouse(house, id, damage).removed;
  return { removed, rows: rows.length };
}

// ── the player's side of a group fight ──────────────────────────────────────
//
// SETTLED / UNSETTLED is what lets an ordinary attack matter to a crowd without
// going back to one-figure-per-damage-point. Before this, chip damage touched
// nobody and only a perfect read or a loud special put anyone down — which made
// four fifths of the bag irrelevant to the only fight the bag was built for.
//
// Now every effective blow does something visible: the first rattles a section,
// the second empties a seat, and a clean read still does it in one. The state is
// printed on the target rail, so "this one is already unsettled" is information
// the player has when they choose where to point.
export const nearestOccupied = (house, fromId) => {
  const rows = house?.rows || [];
  const from = rows.findIndex((row) => row.id === fromId);
  if (from < 0) return null;
  for (let distance = 1; distance <= rows.length; distance += 1) {
    for (const index of [from - distance, from + distance]) {
      if (index >= 0 && index < rows.length && rows[index].figures > 0) return rows[index];
    }
  }
  return null;
};

function unsettle(house, rowId, out) {
  const row = houseRow(house, rowId);
  if (!row || row.figures <= 0) return;
  if (row.settled) { row.settled = false; out.unsettled.push(row.id); return; }
  const result = strikeHouse(house, row.id, 1);
  if (result.removed) {
    // A section that loses somebody sits back down. The crowd re-forms around
    // the gap; you do not get to ride one section to zero off a single read.
    const still = houseRow(house, rowId);
    if (still) still.settled = true;
    out.broken.push(row.id);
    if (result.cleared) out.cleared.push(row.id);
  }
}

function breakOne(house, rowId, out) {
  const row = houseRow(house, rowId);
  if (!row || row.figures <= 0) return;
  const result = strikeHouse(house, row.id, 1);
  if (result.removed) {
    const still = houseRow(house, rowId);
    if (still) still.settled = true;
    out.broken.push(row.id);
    if (result.cleared) out.cleared.push(row.id);
  }
}

// Take a section out of the FORMATION rather than out of the house. The answer
// to a supporter you cannot afford to let fire and cannot afford to clear.
export function suppressSection(house, rowId, beats = 1) {
  const row = houseRow(house, rowId);
  if (!row || row.figures <= 0) return false;
  row.suppressed = Math.max(row.suppressed || 0, Math.max(1, Math.trunc(beats) || 1));
  // A committed packet says so immediately. The promise is that the announced
  // attack never silently changes — so it changes LOUDLY, on the card.
  const packet = house.packet;
  if (packet && !packet.suppressed.includes(rowId)) {
    const contributes = packet.leadId === rowId || packet.supports.some((row2) => row2.id === rowId);
    if (contributes) packet.suppressed = [...packet.suppressed, rowId];
  }
  return true;
}

// What a landed action does to the house. One place, so the preview below and
// the resolution can never disagree — they call the same function.
export function applyHouseAction(house, { actionId, perfect = false, targetId = null, shape = null } = {}) {
  const out = { unsettled: [], broken: [], cleared: [], suppressed: [], recommitted: false };
  if (!house) return out;
  const kind = shape || houseShapeFor(actionId);
  const aimed = targetId || targetRow(house)?.id || null;

  if (actionId === 'master-take') { breakOne(house, aimed, out); return out; }
  if (actionId === 'runaway-feedback') {
    for (const row of occupiedRows(house).map((row) => row.id)) breakOne(house, row, out);
    return out;
  }
  if (actionId === 'whiteout') {
    // Light in every eye: the settled sit up, and anyone already sitting up
    // loses somebody. Loud enough that reading does not come into it.
    for (const row of occupiedRows(house).map((row) => row.id)) unsettle(house, row, out);
    return out;
  }
  if (kind === HOUSE_SHAPE.RETURN) {
    const lead = house.packet?.leadId || actingRow(house)?.id || aimed;
    if (perfect) breakOne(house, lead, out);
    else unsettle(house, lead, out);
    return out;
  }
  if (kind === HOUSE_SHAPE.DAMP) {
    if (aimed && suppressSection(house, aimed, 1)) out.suppressed.push(aimed);
    return out;
  }
  if (kind === HOUSE_SHAPE.SPILL) {
    unsettle(house, aimed, out);
    const neighbour = nearestOccupied(house, aimed);
    if (neighbour) unsettle(house, neighbour.id, out);
    return out;
  }
  // FOCUS, and anything unclassified: precise pressure where you pointed. A
  // clean read is the direct break.
  if (perfect) breakOne(house, aimed, out);
  else unsettle(house, aimed, out);
  return out;
}

// WHAT THE ACTION DETAIL MUST SAY OUT LOUD.
//
// "FOCUS → SIDE BOXES · BREAK 1 · CANCEL HOUSE RETURN" rather than a damage
// band. Pure and side-effect free: it reasons about the same state
// applyHouseAction will mutate, so the sentence and the outcome cannot drift.
export function houseActionPreview(house, { actionId, perfect = false, targetId = null } = {}) {
  if (!house) return null;
  const kind = houseShapeFor(actionId);
  if (!kind) return null;
  const aimed = houseRow(house, targetId || targetRow(house)?.id || '');
  const packet = house.packet || null;
  const contributes = (id) => !!packet && (packet.leadId === id || packet.supports.some((row) => row.id === id));
  const roleOf = (id) => HOUSE_ROLE_LABEL[sectionRole(house, id)] || '';
  const effects = [];
  let scope = aimed?.label || '';

  if (actionId === 'master-take') effects.push('BREAK 1');
  else if (actionId === 'runaway-feedback') { scope = 'EVERY SECTION'; effects.push('BREAK 1 EACH'); }
  else if (actionId === 'whiteout') {
    scope = 'EVERY SECTION';
    const already = occupiedRows(house).filter((row) => !row.settled);
    effects.push(already.length ? `BREAK ${already.length} · UNSETTLE THE REST` : 'UNSETTLE ALL');
  } else if (kind === HOUSE_SHAPE.RETURN) {
    scope = packet ? houseRow(house, packet.leadId)?.label || scope : scope;
    effects.push(perfect ? 'BREAK 1' : 'UNSETTLE');
  } else if (kind === HOUSE_SHAPE.DAMP) {
    effects.push('SUPPRESS 1 BEAT');
  } else if (kind === HOUSE_SHAPE.SPILL) {
    const neighbour = aimed ? nearestOccupied(house, aimed.id) : null;
    if (neighbour) scope = `${aimed?.label} + ${neighbour.label}`;
    effects.push(aimed && !aimed.settled ? 'BREAK 1' : 'UNSETTLE');
  } else {
    effects.push(perfect ? 'BREAK 1' : aimed && !aimed.settled ? 'BREAK 1' : 'UNSETTLE');
  }

  // The part that makes the cursor a decision: does this take a piece off the
  // committed attack, and which piece.
  const cancels = [];
  const consider = (id) => { if (id && contributes(id)) cancels.push(`CANCEL ${roleOf(id)}`); };
  if (actionId === 'runaway-feedback' || actionId === 'whiteout') {
    for (const row of occupiedRows(house)) if (contributes(row.id) && row.figures === 1) consider(row.id);
  } else if (kind === HOUSE_SHAPE.DAMP) consider(aimed?.id);
  else if (kind === HOUSE_SHAPE.RETURN) { if (perfect) consider(packet?.leadId); }
  else if (aimed && (perfect || !aimed.settled) && aimed.figures === 1) consider(aimed.id);

  return {
    shape: kind,
    shapeLabel: HOUSE_SHAPE_LABEL[kind],
    scope,
    effects,
    cancels: [...new Set(cancels)],
    text: `${HOUSE_SHAPE_LABEL[kind]} → ${scope} · ${[...effects, ...new Set(cancels)].join(' · ')}`,
  };
}

// What the battle UI draws, and what the thought trace talks about.
export function houseView(house) {
  if (!house) return null;
  return {
    total: houseTotal(house),
    seats: houseSeats(house),
    cleared: houseCleared(house),
    targetId: targetRow(house)?.id || null,
    actingId: actingRow(house)?.id || null,
    rows: house.rows.map((row, index) => ({
      id: row.id,
      label: row.label,
      figures: row.figures,
      seats: row.seats,
      acting: row.acting,
      targeted: index === house.target,
      cleared: row.figures === 0,
    })),
  };
}

// ── the one snapshot ────────────────────────────────────────────────────────
//
// Input, rendering, previews, the thought trace and resolution all read THIS.
// The old houseView is kept for callers that only want figures, but anything
// that needs to know why a section matters comes here — so the target rail, the
// attack card and the resolver cannot tell the player three different stories.
export function houseCombatSnapshot(house) {
  if (!house) return null;
  const packet = house.packet || null;
  const supporting = new Set((packet?.supports || []).map((row) => row.id));
  const suppressedInPacket = new Set(packet?.suppressed || []);
  const live = liveSections(house);
  return {
    total: houseTotal(house),
    seats: houseSeats(house),
    cleared: houseCleared(house),
    targetId: targetRow(house)?.id || null,
    leadId: packet?.leadId || actingRow(house)?.id || null,
    cueId: house.cue || null,
    readTool: houseReadTool(house),
    readPressure: houseReadPressure(house),
    formationSize: live.length,
    // The committed attack, exactly as it will resolve. `suppressed` names the
    // contributors the player has taken off it since it was announced.
    packet: packet && {
      ...packet,
      supports: packet.supports.map((row) => ({ ...row, suppressed: suppressedInPacket.has(row.id) })),
      contributions: packet.contributions.map((row) => ({ ...row, suppressed: suppressedInPacket.has(row.id) })),
      mainBonus: packet.contributions
        .filter((row) => !suppressedInPacket.has(row.id) && (row.effect === 'chorus' || row.effect === 'read' || row.effect === 'near-field' || row.effect === 'press'))
        .reduce((sum, row) => sum + row.amount, 0),
      followUps: packet.followUps.filter((row) => !suppressedInPacket.has(row.id)),
    },
    // One card per section, in house order, which is what the target rail draws.
    sections: house.rows.map((row, index) => ({
      id: row.id,
      label: row.label,
      role: row.role,
      roleLabel: HOUSE_ROLE_LABEL[row.role] || '',
      figures: row.figures,
      seats: row.seats,
      cleared: row.figures === 0,
      settled: row.settled,
      suppressed: row.suppressed > 0,
      targeted: index === house.target,
      lead: packet ? packet.leadId === row.id : row.acting,
      supporting: supporting.has(row.id),
      cued: house.cue === row.id,
      // What the rail prints on its third line.
      status: row.figures === 0 ? 'CLEARED'
        : row.suppressed > 0 ? 'SUPPRESSED'
          : packet?.leadId === row.id ? 'LEADING'
            : supporting.has(row.id) ? 'SUPPORTING'
              : house.cue === row.id ? 'NEXT'
                : row.settled ? `${row.figures} FIGURE${row.figures === 1 ? '' : 'S'}` : 'UNSETTLED',
    })),
  };
}

// THROW VOICE. The selected section inherits the lead, and the packet is rebuilt
// and shown before anything resolves — the one sanctioned way to change who is
// attacking you, and it is the player who does it, in the open.
export function recommitHouseLead(house, rowId, options = {}) {
  if (!house) return null;
  const row = houseRow(house, rowId);
  if (!row || row.figures <= 0 || row.suppressed > 0) return house.packet || null;
  const previous = house.lastActing;
  house.lastActing = null;
  const rebuilt = buildPacket(house, house.beat, options);
  house.lastActing = previous;
  if (!rebuilt) return house.packet || null;
  // Force the lead the player chose, keeping every support and modifier the
  // rebuilt formation produced so the card stays honest about the whole shape.
  for (const section of house.rows) section.acting = false;
  row.acting = true;
  house.packet = {
    ...rebuilt,
    leadId: row.id,
    leadLabel: row.label,
    leadRole: row.role,
    supports: rebuilt.supports.filter((entry) => entry.id !== row.id),
    contributions: rebuilt.contributions.filter((entry) => entry.id !== row.id),
    recommitted: true,
  };
  house.lastActing = row.id;
  return house.packet;
}
