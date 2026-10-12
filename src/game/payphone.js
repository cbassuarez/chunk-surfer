// THE PHONE BOX ON THE ARRIVAL ROAD, AND THE NETWORK IT IS ON.
//
// A red kiosk by a lamp column, on every pass of the repeating scene. Inside it
// is a grey pay-on-answer coinbox with a black rotary dial, and the network it
// is on is 1988's. Only the box is: the building, the recorder and his van are
// whenever they are. Out here the network is from before, and that is part of
// what is wrong (docs/plans/phone-box-1988.md).
//
// No numbers that connect to strangers for comedy, no voices narrating the dial
// tone, no dialling until the network hands back the woman he lost. Numbers he
// has a reason to know do what those numbers did on a Tuesday night in 1988, and
// every number he needs has to be found: on the van's dash, in the chained
// directory, scratched into the paint, from directory enquiries, on a page that
// will not stop finding him. Nothing is remembered for him.
//
// Pure: the scene, the audio and main read what this decides.

const freeze = Object.freeze;

export const PAYPHONE_ERA = 1988;

// ── THE NUMBERS ─────────────────────────────────────────────────────────────
// 1988 formats: London is 01 and seven digits, every other area code is four
// digits and six more. 0632 is the code British television used for numbers
// that must not ring anybody. The office is the letterhead's number as it was
// before 1995 — the letterhead in the building prints the modern one, with a
// digit this exchange has never heard of.
export const PAYPHONE_NUMBERS = freeze({
  van: freeze({ digits: '0836900417', label: 'the car phone in the van' }),
  flat: freeze({ digits: '0632960188', label: 'his flat' }),
  lyle: freeze({ digits: '0532960283', label: 'the payphone in Lyle\'s hall' }),
  sarah: freeze({ digits: '0632960331', label: 'Sarah' }),
  sister: freeze({ digits: '0632960552', label: 'her sister' }),
  lodge: freeze({ digits: '0632960214', label: 'Ellery lodge' }),
  office: freeze({ digits: '0484221906', label: 'the general office' }),
  clock: freeze({ digits: '123', label: 'the speaking clock' }),
  emergency: freeze({ digits: '999', label: 'emergency' }),
  operator: freeze({ digits: '100', label: 'the operator' }),
  enquiries: freeze({ digits: '192', label: 'directory enquiries' }),
});
// The kiosk's own number, printed on its card the way every box's was.
export const PAYPHONE_KIOSK_NUMBER = '0632960901';
// The letterhead's modern form of the office line.
export const PAYPHONE_LETTERHEAD_OFFICE = '01484221906';

// What 1988 connects without money in the slot.
export const PAYPHONE_FREE = freeze(['emergency', 'operator', 'clock', 'enquiries']);
const FREE = new Set(PAYPHONE_FREE);

// ── THE PASSES ──────────────────────────────────────────────────────────────
// Zero-based pass indices on the repeating scene (source-outskirts-arrival.js).
export const PAYPHONE_PASS = freeze({
  // Passes 1–9: the box is quiet; calling himself rings the van.
  earlyLast: 8,
  // Pass 14: the box rings, and the scene repeats until he answers and speaks.
  loop: 13,
  // Pass 22 on: lifting the receiver, he is already on the line with himself.
  late: 21,
});

// Where her page turns up, and when it stops being a page and becomes weather.
export const SARAH_PAGE = freeze({
  // In a lodge's visitors' ledger, early.
  ledgerFrom: 1,
  ledgerTo: 12,
  // Caught on the fence, on a pass that has broken.
  fenceFrom: 14,
  // On the van's dashboard, where he cannot miss it.
  dashboardFrom: 17,
  // From here: the flurry, until the tape.
  flurryFrom: 15,
});

// ── WHAT IS WRITTEN IN THE BOX ─────────────────────────────────────────────
// The card behind the dial.
export const PAYPHONE_CARD = freeze([
  'EMERGENCY 999',
  'OPERATOR 100',
  'DIRECTORY ENQUIRIES 192',
  'SPEAKING CLOCK 123',
  'THIS PAYPHONE 0632 960901',
]);
// The instruction plate, because pay on answer has to be learned.
export const PAYPHONE_INSTRUCTIONS = freeze([
  'LIFT HANDSET · LISTEN FOR DIAL TONE',
  'DIAL NUMBER',
  'WHEN YOU HEAR RAPID PIPS',
  'INSERT MONEY',
]);
// Scratched into the paint at head height. Most are other people's. A few are
// his, half gone: the digits that are missing are on the van's dash, and the
// lodge's is on the card outside.
export const PAYPHONE_SCRATCHES = freeze([
  freeze({ text: 'KAREN 0632 960 440', whose: 'stranger' }),
  freeze({ text: 'TAXIS 0632 960 777', whose: 'stranger' }),
  freeze({ text: 'CAR 0836 9_0 4_7', whose: 'van', points: 'the Dymo label on the van\'s dash' }),
  freeze({ text: 'LODGE 0632 96_ 214 SEE CARD', whose: 'lodge', points: 'the card by the lodge window' }),
  freeze({ text: 'DON\'T RING HER', whose: 'nobody' }),
  freeze({ text: 'D 0532 9602__', whose: 'stranger' }),
]);
// The chained directory, open at the surname. The page with her on it is torn
// out; her sister's line is on the facing page.
export const PAYPHONE_DIRECTORY = freeze({
  surname: 'ASHWORTH',
  torn: true,
  listed: freeze([
    freeze({ text: 'Ashworth J. 14 Carr Lane ........ 0632 960552', who: 'sister' }),
    freeze({ text: 'Ashworth R.M. 3 Mill Row ........ 0632 960619', who: 'stranger' }),
  ]),
});

// ── THE DIAL ────────────────────────────────────────────────────────────────
// A GPO dial: ten pulses a second, 66 ms break and 33 ms make. 0 is ten pulses.
// The exchange's tones, to the BT standard (SIN 350), as a 1988 box heard them.
export const UK_TONES = freeze({
  dial: freeze({ hz: freeze([350, 440]), cadence: null }),
  ringing: freeze({ hz: freeze([400, 450]), cadence: freeze([0.4, 0.2, 0.4, 2.0]) }),
  engaged: freeze({ hz: freeze([400]), cadence: freeze([0.375, 0.375]) }),
  unobtainable: freeze({ hz: freeze([400]), cadence: null }),
});
// Keypad tone pairs. The box has a dial; these are kept for the line's own
// tests and anything else on the network that still presses keys.
export const DTMF = freeze({
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477],
  4: [770, 1209], 5: [770, 1336], 6: [770, 1477],
  7: [852, 1209], 8: [852, 1336], 9: [852, 1477],
  '*': [941, 1209], 0: [941, 1336], '#': [941, 1477],
});

// ── the dial ──
export const ROTARY_PULSES_PER_SECOND = 10;
export const ROTARY_BREAK_SECONDS = 0.066;
export const ROTARY_MAKE_SECONDS = 0.034;
export const rotaryPulses = (digit) => (String(digit) === '0' ? 10 : Math.max(1, Math.min(9, Number(digit) || 0)));
// How long the dial takes to come back from a digit, with the rest at the stop.
export const rotaryReturnSeconds = (digit) => 0.12 + rotaryPulses(digit) / ROTARY_PULSES_PER_SECOND;
// The finger holes, clockwise from the finger stop: 1 is nearest it, 0 furthest.
export const ROTARY_HOLES = freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
// How far the dial has to turn to bring each hole to the stop, in radians.
export const rotaryTravel = (digit) => (rotaryPulses(digit) + 1) * (Math.PI / 6.4);

// When the 1988 exchange stops waiting for digits: services are three, London is
// 01 and seven, every other code is ten, a local number is six. It waits five
// seconds after a digit before giving up on a number that never completed.
export const PAYPHONE_INTERDIGIT_SECONDS = 5;
export function numberComplete(digits = '') {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return false;
  if (d[0] === '1' || d[0] === '9') return d.length >= 3;
  if (d.startsWith('01')) return d.length >= 9;
  if (d[0] === '0') return d.length >= 10;
  return d.length >= 6;
}
export const PAYPHONE_MAX_DIGITS = 10;
export const normaliseDialled = (input = '') => String(input ?? '').replace(/\D/g, '').slice(0, PAYPHONE_MAX_DIGITS);

// Grouped as a 1988 card would print it: 0632 960188, 01 234 5678, 999.
export function formatDialled(digits = '') {
  const d = normaliseDialled(digits);
  if (d.length <= 4) return d;
  if (d.startsWith('01')) return `01 ${d.slice(2, 5)} ${d.slice(5)}`.trim();
  return `${d.slice(0, 4)} ${d.slice(4)}`;
}

// ── WHO ANSWERS ─────────────────────────────────────────────────────────────
// Which call hands the C-17 key back this run, from what he said at the gate:
// the job's paperwork is the office; trusting the man in the lodge is the lodge;
// asking after the last recordist's tape is the clock. No trunk, the office.
export function payphoneKeyCall(flags = {}) {
  const has = (flag) => !!(typeof flags === 'function' ? flags(flag) : flags?.[flag]);
  if (has('cold.trunk.night')) return 'lodge';
  if (has('cold.trunk.last')) return 'clock';
  return 'office';
}

const ENTRY = new Map(Object.entries(PAYPHONE_NUMBERS).map(([id, entry]) => [entry.digits, id]));
const outcomeOf = (id, fields) => freeze({ id, node: null, tone: 'ringing', rings: 3, answers: true, pays: false, cost: null, grants: freeze([]), ...fields, grants: freeze(fields.grants || []) });

// What dialling these digits does.
//   id       which call it is
//   node     the story node it plays when answered (null: nothing is said)
//   tone     ringing / engaged / unobtainable
//   rings    how many rings before it is answered, or before he gives up
//   answers  whether anybody picks up (nobody pays for a phone nobody answers)
//   pays     pay on answer: rapid pips until the slot is fed
//   grants   'chapel-key' or 'sheet', once each, ever
//   cost     'grid': this call costs one composure grid, once
//   rings    at `ringsAt` ('van'), his own phone rings out there too
export function payphoneOutcome({ digits = '', flags = {}, hasChapelKey = false, pass = 0 } = {}) {
  const has = (flag) => !!(typeof flags === 'function' ? flags(flag) : flags?.[flag]);
  const value = (flag) => (typeof flags === 'function' ? flags(flag) : flags?.[flag]);
  const dialled = normaliseDialled(digits);
  if (!dialled) return outcomeOf('nothing', { tone: 'none', rings: 0, answers: false });
  // The letterhead's number, a digit too long for this exchange: a London number.
  if (dialled.startsWith('01')) return outcomeOf('london', { node: 'london', tone: 'unobtainable', rings: 0, answers: false });
  const id = ENTRY.get(dialled);
  if (!id) return outcomeOf('unobtainable', { node: 'unobtainable', tone: 'unobtainable', rings: 0, answers: false });
  const pays = !FREE.has(id);
  const keyCall = payphoneKeyCall(flags) === id;
  if (keyCall) {
    if (!hasChapelKey) {
      const granted = has('phone.key.granted');
      return outcomeOf(id, { node: granted ? `${id}-again` : `${id}-key`, tone: id === 'clock' ? 'none' : 'ringing', rings: id === 'clock' ? 0 : 3, pays, grants: granted ? [] : ['chapel-key'], keyCall: true });
    }
    const sheet = has('phone.sheet.granted');
    return outcomeOf(id, { node: sheet ? 'hold-again' : 'hold', tone: id === 'clock' ? 'none' : 'ringing', rings: id === 'clock' ? 0 : 3, pays, grants: sheet ? [] : ['sheet'], keyCall: true });
  }
  switch (id) {
    case 'van': {
      // Off the hook since he answered it on an early pass: engaged for good.
      if (has('phone.van.offhook')) return outcomeOf(id, { node: null, tone: 'engaged', rings: 0, answers: false });
      return outcomeOf(id, { node: 'van-ringing', tone: 'ringing', rings: 12, answers: false, ringsAt: 'van' });
    }
    case 'flat': return outcomeOf(id, { node: has('phone.called.flat') ? 'flat-again' : 'flat', rings: 4, pays });
    case 'lyle': return outcomeOf(id, { node: has('phone.called.lyle') ? 'lyle-again' : 'lyle', rings: 9, pays });
    case 'sarah': {
      if (has('phone.called.sarah')) return outcomeOf(id, { node: 'sarah-again', tone: 'engaged', rings: 0, answers: false });
      const confessed = value('confession.kind') === 'name' && value('confession.value') === 'Sarah';
      return outcomeOf(id, { node: confessed ? 'sarah-confessed' : 'sarah', rings: 6, pays, cost: has('phone.cost.sarah') ? null : 'grid' });
    }
    case 'sister': return outcomeOf(id, { node: 'sister', rings: 14, answers: false });
    case 'lodge': return outcomeOf(id, { node: 'lodge', rings: 11, answers: false, ringsAt: 'lodge' });
    case 'office': return outcomeOf(id, { node: 'office', rings: 11, answers: false });
    case 'clock': return outcomeOf(id, { node: 'clock', tone: 'none', rings: 0 });
    case 'emergency': return outcomeOf(id, { node: 'emergency', rings: 1 });
    case 'operator': return outcomeOf(id, { node: 'operator', rings: 2 });
    case 'enquiries': return outcomeOf(id, { node: 'enquiries', rings: 2 });
    default: return outcomeOf('unobtainable', { node: 'unobtainable', tone: 'unobtainable', rings: 0, answers: false });
  }
}

// A call that comes to the box rather than going out of it. On the loop pass the
// box rings as he reaches it, until he has answered it and spoken; from the late
// passes, whenever he lifts the receiver, he is already on the line.
export function payphoneIncoming({ pass = 0, flags = {}, lifting = false, micLive = false } = {}) {
  const has = (flag) => !!(typeof flags === 'function' ? flags(flag) : flags?.[flag]);
  if (pass === PAYPHONE_PASS.loop && !has('phone.loop.broken')) return freeze({ id: 'loop', node: 'loop', rings: Infinity, forced: true });
  if (pass >= PAYPHONE_PASS.late && lifting) {
    return freeze({ id: 'self-line', node: micLive ? 'self-line-mic' : 'self-line', rings: 0, forced: false, cost: has('phone.cost.self') ? null : 'grid' });
  }
  return null;
}

// Whether a pass holds him until the box has been answered.
export const payphoneLoopHolds = ({ pass = 0, flags = {} } = {}) => payphoneIncoming({ pass, flags })?.forced === true;

// The flags a finished call leaves behind.
export function payphoneCallFlags(outcome) {
  if (!outcome || ['nothing', 'unobtainable', 'london'].includes(outcome.id)) return [];
  const out = [`phone.called.${outcome.id}`];
  if (outcome.grants?.includes('chapel-key')) out.push('phone.key.granted');
  if (outcome.grants?.includes('sheet')) out.push('phone.sheet.granted');
  if (outcome.cost === 'grid') out.push(outcome.id === 'self-line' ? 'phone.cost.self' : `phone.cost.${outcome.id}`);
  return out;
}
