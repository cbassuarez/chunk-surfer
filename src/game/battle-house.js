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
export const HOUSE_ROWS = Object.freeze([
  Object.freeze({ id: 'stalls', label: 'STALLS' }),
  Object.freeze({ id: 'row-f', label: 'ROW F' }),
  Object.freeze({ id: 'boxes', label: 'SIDE BOXES' }),
  Object.freeze({ id: 'lower', label: 'LOWER BALCONY' }),
  Object.freeze({ id: 'upper', label: 'UPPER TIER' }),
]);

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
      figures: counts[index],
      seats: counts[index],
      acting: false,
    })),
    target: 0,
    beat: 0,
    lastActing: null,
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
