// THE FIRST OUTSKIRTS: THE NIGHT HE ARRIVED, OVER AND OVER.
//
// Behind the grey goods doors at the far edge of the field is not more field.
// First there is nothing — still, dark ground — and then a scene he has already
// walked through: outside the bay at night, the road he came in on, lamp columns
// too evenly spaced, the lodge lit with nobody in it, the late bus at the
// shelter with its engine off, the van with its back open.
//
// And then the same scene again. And again, for about a kilometre. It is short
// and it repeats, and the repetition is the point: you know where the lodge will
// be before you reach it. What changes is the wear. Every pass is a little more
// worn than the last — a lamp out, a piece missing — and later passes go wrong:
// the whole scene mirrored, stuttering, everyone turned to face you, the bus
// across the road, the road gone. Early on it almost never happens. Near the end
// it almost always does.
//
// Pure data, deterministic, no seed: the road is the same road for everybody.
// A piece with an `inspect` key can be looked at; its words live in the studio
// document source-space.outskirts, one node per key (and `-again` / `-far`
// variants for going back to it, or finding it further down the road).
// Coordinates are metres: `across` is world +x (east), `along` is the distance
// out from where the road starts (world -z), past the still stretch. Yaws are
// sourceMatrix yaws, where local +z faces world (sin yaw, cos yaw): yaw 0 faces
// back toward the door, the way he came — which is to say, toward him.

import { outskirtsTownPlacement, outskirtsTownBoundaryCollision } from './source-outskirts-town.js';
export { SOURCE_OUTSKIRTS_TOWN, outskirtsTownSet } from './source-outskirts-town.js';

const freeze = Object.freeze;

// One pass is exactly one road section long, so sections meet end to end.
export const OUTSKIRT_STRETCH_METRES = 34.4;
// Where the first pass starts, past the apron.
export const OUTSKIRT_STRETCH_START = 6;
// About a kilometre of road: it runs out a short walk from the head of the tape.
export const OUTSKIRT_STRETCH_COUNT = 29;
// The same thing counted the way the tools count it.
export const OUTSKIRT_REPEAT_COUNT = OUTSKIRT_STRETCH_COUNT;
// Lamp columns, east kerb, at a spacing no council ever achieved.
export const OUTSKIRT_LAMP_SPACING = 8.6;
// A lamp you have walked this far past, and are not looking at, goes out.
export const OUTSKIRT_LAMP_OFF_BEHIND = 9;
// Meshes the body walks over rather than into.
export const OUTSKIRT_WALKABLE_MESHES = freeze(['yard_road', 'outskirts_road', 'yard_markings', 'wet_footprint', 'loose_note']);

// The verges have a real edge. The runtime uses the same inner faces to prevent
// walking around the first wall end from the still ground, rather than inventing
// a second, wider corridor outside the visible boundary.
export const OUTSKIRT_CORRIDOR = freeze({ halfWidth: 11.5, boundaryThroughPass: 20, boundaryMeshOffset: 11.66 });
// Player-facing pass 8. The front of the transverse bus points east. A 1.70m
// opening between its nose and the rail leaves 1.20m for the body's centre after
// the 25cm radius on either side. There is no alternative route around the back.
export const OUTSKIRT_BUS_ENCOUNTER = freeze({
  pass: 7, busKey: 'bus', womanKey: 'bus-woman', across: 0, along: 24.5, yaw: -Math.PI / 2,
  approachAlong: 19, closeAlong: 22.7, crossedAlong: 27,
  laneMinAcross: 4.6, laneMaxAcross: 6.3, laneAcross: 5.45,
  physicalClearance: 1.7, bodyClearance: 1.2,
  womanAcross: 4.12, womanAlong: 24.3,
});
// The seventh lodge's guard sits beside the hatch facing the road. Character,
// chair and lower side ledge share one floor origin and local -Z facing.
// Coordinates are lodge-local metres; contacts below are character-local.
export const OUTSKIRT_FOLD_ENCOUNTER = freeze({
  pass: 6, guardKey: 'booth-guard', mesh: 'outskirts_fold_guard', version: 1,
  root: freeze([-0.73, 0.12, -2.05]), yaw: 0,
  chairMesh: 'outskirts_fold_chair', ledgeMesh: 'outskirts_fold_sideledge',
  palm: freeze([-1.28, 0.94, -2.19]), assetPalm: freeze([-0.55, 0.82, -0.14]),
  assetSeat: freeze([0, 0.47, 0.04]),
  assetSoles: freeze([freeze([-0.20, 0.001, -0.51]), freeze([0.20, 0.001, -0.51])]),
  trigger: freeze([0, -0.10]), reach: 1.65,
  forceStart: 1.1, forceDuration: 1.45, foldDuration: 12, writheDuration: 24,
});
// One authored sighting, under the third sodium lamp of the last intact road
// pass. The bus and lodge are gone by then, leaving the pair a bare stage. Separate
// roots keep the dog's averted gaze and four planted feet independent of the
// handler's later look-back. The lead is decorative, not a crossing barrier.
export const OUTSKIRT_DOG_ENCOUNTER = freeze({
  pass: 20, handlerKey: 'dog-walker-handler', dogKey: 'dog-walker-dog', leadKey: 'dog-walker-lead',
  handlerAcross: 1.4, dogAcross: 3.4, along: 21.8,
  handlerYaw: Math.PI, dogYaw: -Math.PI / 2,
});
// Deliberate lifetimes replace independent disappearance rolls. An inspection
// must still have its physical place when its late node becomes available.
export const OUTSKIRT_LIFECYCLE = freeze({
  fence: 8, booth: 18, shelter: 19, busWoman: 12, bus: 19,
  postbox: 19, bin: 19, bench: 19, car: 22, gate: 19,
  road: 20, boundary: 20, van: 25, phone: 26,
});

const put = (id, mesh, across, along, extra = {}) => freeze({ id, mesh, across, along, yaw: 0, y: 0, ...extra });
// Attachments are authored against the actual support surface, not road-space
// guesses. A changed parent arrangement carries its contents and inspection point.
function attach(parent, id, mesh, x, y, z, extra = {}) {
  const { yaw = 0, ...rest } = extra, c = Math.cos(parent.yaw), s = Math.sin(parent.yaw);
  return put(id, mesh, parent.across + x * c + z * s, parent.along + x * s - z * c,
    { y: parent.y + y, yaw: parent.yaw + yaw, attachedTo: parent.id, ...rest });
}
function rotateAttachment(piece, parent, delta) {
  const x = piece.across - parent.across, z = -(piece.along - parent.along), c = Math.cos(delta), s = Math.sin(delta);
  return freeze({ ...piece, across: parent.across + x * c + z * s,
    along: parent.along + x * s - z * c, yaw: piece.yaw + delta });
}

// A fixed hash, so the wear and the breaks are the same every time.
function hash(k, key, salt) {
  let h = 2166136261 ^ (k * 374761393) ^ (salt * 668265263);
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const jitter = (k, key, salt, amount) => (hash(k, key, salt) - 0.5) * 2 * amount;

// ── THE APRON, OUTSIDE THE DOORS ────────────────────────────────────────────
export const OUTSKIRT_APRON = freeze([
  put('apron-markings', 'yard_markings', 0, 3.2),
  put('apron-lamp', 'yard_lamp_column', 5.4, 1.4, { yaw: Math.PI, lamp: true }),
  put('apron-skip', 'yard_skip', -6.8, 2.6, { yaw: 0.18, inspect: 'skip' }),
  put('apron-boundary-west', 'outskirts_boundary_wall_6', -11.66, 2.2, { structural: true }),
  put('apron-boundary-east', 'outskirts_boundary_rail_6', 11.56, 2.2, { structural: true }),
]);

// ── THE SCENE ───────────────────────────────────────────────────────────────
// `along` is within the pass. This is the whole of it, as it first is.
export const OUTSKIRT_STRETCH = freeze([
  put('road', 'outskirts_road', 0, OUTSKIRT_STRETCH_METRES / 2, { yaw: Math.PI / 2 }),
  freeze({id:'gate',...outskirtsTownPlacement('yard-gate-piers'),inspect:'gate',collision:outskirtsTownBoundaryCollision()}),
  freeze({id:'fence',...outskirtsTownPlacement('yard-hedge-near'),inspect:'fence'}),
  ...[0, 1, 2, 3].map((k) => {
    const p=outskirtsTownPlacement('yard-lamp-column');
    return freeze({id:`lamp-${k}`,...p,along:p.along+(k-1)*OUTSKIRT_LAMP_SPACING,lamp:true,inspect:'lamp'});
  }),
  // The lodge, lit, window onto the road.
  freeze({id:'booth',...outskirtsTownPlacement('yard-booth'),inspect:'lodge',interact:[-.45,-1.8],closeReach:1.6}),
  freeze({id:'booth-interior',...outskirtsTownPlacement('yard-booth-interior',{mesh:'outskirts_lodge_interior'})}),
  freeze({id:'booth-practicals',...outskirtsTownPlacement('yard-booth-practicals',{mesh:'outskirts_lodge_practicals'}),glow:[1,.76,.48,1.6]}),
  freeze({id:'booth-glazing',...outskirtsTownPlacement('yard-booth-glazing',{mesh:'outskirts_lodge_glazing'})}),
  // The shelter on the far kerb, open side to the road, and the late bus at it.
  freeze({id:'shelter',...outskirtsTownPlacement('yard-bus-shelter'),inspect:'shelter',interact:[1.35,-1.2],closeReach:1.6}),
  // The bus is the authored Source encounter, rather than a stationary copy
  // of ordinary moving district traffic. Pass7 keeps its measured nose gap.
  put('bus', 'outskirts_bus', 4.3, 25.5, { yaw: 0, glow: [0.9, 0.93, 1, 0.22], inspect: 'bus', interact: [-1.6, -3.15], closeReach: 1.8 }),
  // Her face is local -Z, as in the ordinary yard. Keep both the face and the
  // conversation anchor on the road side of the shelter.
  freeze({id:'bus-woman',...outskirtsTownPlacement('yard-bus-waiter',{mesh:'outskirts_bus_woman'}),inspect:'woman',interact:[0,-.5],closeReach:1.6}),
  // THE PHONE BOX, on the far kerb by the second lamp, door to the road. It
  // repeats with the rest of the scene, worn and broken with it: every pass has
  // the same box, and the same number on its card. src/game/payphone.js.
  put('phone-box', 'city_phone_box', 8.6, 12.4, { yaw: -Math.PI / 2, payphone: true }),
  // Street furniture on the far kerb, each with something in it for the patient:
  // the pillar box past the phone box, the bin by the shelter, a bench after it.
  put('postbox', 'district_post_box', 9.4, 15.2, { yaw: Math.PI / 2, inspect: 'postbox', interact: [0, -0.48], closeReach: 1.6 }),
  put('bin', 'district_bin_cluster', 9.2, 19.4, { yaw: Math.PI / 2, inspect: 'bin', interact: [0, -0.65], closeReach: 1.6 }),
  put('bench', 'district_bench', 9.0, 28.4, { yaw: Math.PI / 2, inspect: 'bench', interact: [0, -0.75], closeReach: 1.6 }),
  // The van, back doors open toward him.
  freeze({id:'van',...outskirtsTownPlacement('yard-van'),inspect:'van',interact:[0,2.35],closeReach:1.8}),
  freeze({id:'van-lamp',...outskirtsTownPlacement('yard-van-lamp'),glow:[1,.86,.6,2.4]}),
]);

// Pieces that are people or vehicles: a pass that turns things to face him turns these.
const FACES = freeze(['bus', 'bus-woman', 'van', 'van-lamp', 'booth-guard']);

// ── EACH PASS, WORN, AND SOMETIMES BROKEN ───────────────────────────────────
// What goes badly wrong on a pass that breaks. Nothing is giant, fallen or
// floating: it is always the order of things that fails, never the things.
export const OUTSKIRT_BREAKS = freeze([
  'mirrored',   // the whole scene the wrong way round
  'stutter',    // everything twice, a step apart, like a skipped frame
  'turned',     // every person and vehicle facing him
  'blocked',    // the bus parked across the road
  'no-road',    // the road is not there; everything else is
  'crowd',      // her, at every lamp
  'swapped',    // the van where the lodge is, the lodge where the van is
  'emptied',    // only the road and the lamps, and all but one of those out
  'stranger',   // a man with a dog, standing in the middle of the road
  // Losing himself (docs/plans/outskirts-losing-himself.md):
  'played-back',     // the pass runs like tape: rain up for a moment, lamps on in reverse, a dropout
  'unfinished',      // things only their timber frames, like a set nobody finished building
  'already-walked',  // wet footprints ahead of him in his own gait, and the doors already open
  'silent',          // no sound at all but his breathing, too close
]);

// What he says the first time a pass breaks that way.
const BREAK_LINES = freeze({
  mirrored: 'That is the wrong way round.',
  stutter: 'I have just walked past that.',
  turned: 'They are all looking.',
  blocked: 'It was not parked like that.',
  'no-road': 'Where is the road.',
  crowd: 'How many of her are there.',
  swapped: 'That is not where that goes.',
  emptied: 'Everybody has gone.',
  stranger: 'He is in the road.',
  'played-back': 'It is running backwards.',
  unfinished: 'Nobody finished building it.',
  'already-walked': 'Somebody has just been along here.',
  silent: 'Listen.',
});

const LAST = OUTSKIRT_STRETCH_COUNT - 1;
// How worn pass k is (0 to 1), and how likely it is to break. The first two are
// clean so the scene can be learned; after that the chance climbs slowly and
// then steeply.
export const outskirtWear = (k) => Math.max(0, Math.min(1, k / LAST));
// The loop pass (PAYPHONE_PASS.loop in src/game/payphone.js, index 13) is never
// broken: its box has to be there, ringing, every time round.
const QUIET_PASSES = freeze([0, 1, 13, 28]);
// Breaks the road must have at least once, whatever the hash says, on a pass it
// leaves unbroken: somebody walking the road a moment ahead of him.
const PINNED_BREAKS = freeze({ 7: 'blocked', 17: 'already-walked', 20: 'stranger', 21: 'no-road', 23: 'unfinished', 26: 'emptied', 27: 'stutter' });
export const outskirtBreakChance = (k) => (k < 2 ? 0 : 0.06 + 0.7 * outskirtWear(k) ** 2);

// THE ROAD GOES. Where along it (by wear, 0 to 1) each kind of thing starts to
// stop being there; it thins out over a stretch either side rather than switching
// off. First the fence, then the kerb furniture, the shelter, the lodge, the bus,
// the gate and the road itself, then his van, and last the phone boxes. The lamps
// never go: the late passes are lamps standing in black.
const GONE_AT = freeze([
  [/^fence/, 0.3],
  [/^bus-woman/, 0.5],
  // The shelter stays a little longer than she does: long enough to find his coat on it.
  [/^(shelter|coat)$/, 0.62],
  [/^(booth)/, 0.58],
  [/^(bin|bench|postbox)/, 0.62],
  [/^bus/, 0.62],
  [/^car$/, 0.66],
  [/^(gate|page-fence)$/, 0.68],
  [/^dog-walker/, 0.7],
  [/^road$/, 0.74],
  [/^footprint/, 0.8],
  [/^(van|page-dash)/, 0.84],
  [/^phone-box$/, 0.92],
]);
export function outskirtGoneAt(id) {
  const key = String(id).replace(/-stutter$/, '').replace(/-crowd-\d+$/, '').replace(/-\d+$/, '');
  for (const [pattern, at] of GONE_AT) if (pattern.test(key)) return at;
  return null;
}
function vanished(k, piece) {
  if (piece.lamp) return false;
  if (piece.keepThrough != null && k <= piece.keepThrough) return false;
  const id = piece.id.replace(/-stutter$/, '');
  const life = OUTSKIRT_LIFECYCLE;
  if (/^boundary/.test(id)) return k > life.boundary;
  if (/^funnel/.test(id)) return false;
  if (/^fence/.test(id)) return k > life.fence;
  if (/^booth/.test(id)) return k > life.booth;
  if (/^(shelter|coat)/.test(id)) return k > life.shelter;
  if (/^bus-woman/.test(id)) return k > life.busWoman;
  if (/^bus$/.test(id)) return k > life.bus;
  if (/^postbox/.test(id)) return k > life.postbox;
  if (/^bin/.test(id)) return k > life.bin;
  if (/^bench/.test(id)) return k > life.bench;
  if (/^car/.test(id)) return k > life.car;
  if (/^(gate|page-fence)/.test(id)) return k > life.gate;
  if (id === 'road') return k > life.road;
  if (/^footprint/.test(id)) return k !== 17;
  if (/^(van|page-dash)/.test(id)) return k > life.van;
  if (id === 'phone-box') return k > life.phone;
  return false;
}

export const OUTSKIRT_PASSES = freeze(Array.from({ length: OUTSKIRT_STRETCH_COUNT }, (_, k) => {
  const broken = !QUIET_PASSES.includes(k) && hash(k, 'break', 1) < outskirtBreakChance(k);
  // Keep every prior hash outcome except an incidental second stranger. The
  // chosen pair is a singular encounter, not a repeatable late-road variant.
  const sampled = OUTSKIRT_BREAKS[Math.floor(hash(k, 'break-kind', 2) * OUTSKIRT_BREAKS.length) % OUTSKIRT_BREAKS.length];
  const kind = PINNED_BREAKS[k] || (broken ? (sampled === 'stranger' ? 'silent' : sampled) : null);
  return freeze({ k, wear: outskirtWear(k), breakChance: outskirtBreakChance(k), break: kind });
}));

// Legacy import contract only. Runtime uses the fixed canonical initialOnly
// frontage in outskirtsTownSet(); this elevation must never follow the camera.
export const OUTSKIRT_ELEVATION = freeze({ ...outskirtsTownPlacement('opening-street-frontage'), fixed:true, initialOnly:true });

// ── WHAT HAPPENS, ONCE EACH ─────────────────────────────────────────────────
// trigger: 'reach' fires on passing `along`; 'lookBack' on facing back toward
// the door once past `along`; 'unseen' when `piece` has been seen and then
// left out of view. `stretch` makes `along` pass-relative. Lines are his, and
// sparse; the first pass that breaks each way has a line of its own.
const firstBreaks = () => {
  const seen = new Set();
  return OUTSKIRT_PASSES.filter((pass) => pass.break && !seen.has(pass.break) && seen.add(pass.break));
};
// The lines each beat was written with, kept here as notes. On the road they are
// not said: the road shows what changed, and he does not narrate it.
const BEATS_WRITTEN = freeze([
  freeze({ id: 'outside', trigger: 'reach', along: 2, line: 'Outside. The same night.' }),
  freeze({ id: 'lodge', trigger: 'reach', stretch: 0, along: 10, line: 'Lit. Nobody in it.' }),
  freeze({ id: 'lamps-behind', trigger: 'lookBack', stretch: 0, along: 22, line: 'They go out behind me.' }),
  freeze({ id: 'again', trigger: 'reach', stretch: 1, along: 1.2, line: 'I have walked this bit.' }),
  freeze({ id: 'aboard', trigger: 'reach', stretch: 1, along: 21, line: 'She got on.' }),
  freeze({ id: 'guard-gone', trigger: 'unseen', stretch: 2, piece: 'booth-guard', line: 'He was there.' }),
  freeze({ id: 'worse', trigger: 'reach', stretch: 9, along: 16, line: 'It is worse every time.' }),
  freeze({ id: 'how-many', trigger: 'reach', stretch: 16, along: 1, line: 'How many times is that.' }),
  freeze({ id: 'morning', trigger: 'reach', stretch: 20, along: 10, line: 'It should be light by now.' }),
  freeze({ id: 'doors-gone', trigger: 'lookBack', stretch: 23, along: 16, line: 'I cannot see the doors.' }),
  ...firstBreaks().map((pass) => freeze({ id: `break-${pass.break}`, trigger: 'reach', stretch: pass.k, along: 5, line: BREAK_LINES[pass.break] })),
  freeze({ id: 'road-ends', trigger: 'reach', along: OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_COUNT * OUTSKIRT_STRETCH_METRES + 1, line: 'The boxes stop. The road keeps going.' }),
]);
export const OUTSKIRT_BEATS = freeze(BEATS_WRITTEN.map(({ line, ...beat }) => freeze({ ...beat, written: line })));

// One pass of the scene: the same pieces, worn by `wear`, then broken if it breaks.
function passPieces(pass) {
  const { k, wear } = pass;
  const base = Object.fromEntries(OUTSKIRT_STRETCH.map((piece) => [piece.id, piece]));
  const kept = (id) => !vanished(k, { id });
  // Recognition needs a trustworthy baseline. A landmark moves only when the
  // pass explicitly changes its arrangement, never because of ambient jitter.
  const off = (piece) => piece;
  let pieces = [];
  pieces.push(base.road, base.gate);
  // The civic gate owns the visible court boundary. The old six-panel2m
  // corridor walls hid the canonical shop windows and made a second enclosure.
  if (kept('boundary') && k === OUTSKIRT_BUS_ENCOUNTER.pass) {
    for (const side of [-1, 1]) for (let j = 0; j < 6; j += 1) {
      pieces.push(put(`boundary-${side < 0 ? 'west' : 'east'}-${j}`, side < 0 ? 'outskirts_boundary_wall_6' : 'outskirts_boundary_rail_6',
        side * (side < 0 ? OUTSKIRT_CORRIDOR.boundaryMeshOffset : 11.56), -0.8 + 3 + j * 6, { structural: true }));
    }
  }
  if (kept('fence')) pieces.push(off(base.fence, 0.5));
  for (let j = 0; j < 4; j += 1) {
    pieces.push(freeze({ ...off(base[`lamp-${j}`], 0.2),
      // The pair is first read in a real sodium pool. The regular wear roll
      // otherwise extinguishes this very lamp on their only authored pass.
      dark: k === OUTSKIRT_DOG_ENCOUNTER.pass && j === 2 ? false : hash(k, `lamp-${j}`, 3) < wear * 0.55 }));
  }
  if (kept('booth')) {
    const lodge = off(base.booth, 0.4);
    for (const id of ['booth', 'booth-interior', 'booth-glazing']) pieces.push(freeze({ ...base[id], across: lodge.across, along: lodge.along, yaw: lodge.yaw }));
    // The lodge light dims with wear, and goes out for good near the end.
    if (wear < 0.9) {
      const glow = base['booth-practicals'].glow;
      pieces.push(freeze({ ...base['booth-practicals'], across: lodge.across, along: lodge.along, yaw: lodge.yaw, glow: [glow[0], glow[1], glow[2], glow[3] * (1 - wear * 0.85)] }));
    }
    pieces.push(put('booth-hatch', 'outskirts_lodge_hatch', lodge.across, lodge.along, { yaw: lodge.yaw }));
    pieces.push(put('booth-phone', 'outskirts_lodge_phone', lodge.across, lodge.along, { yaw: lodge.yaw }));
    pieces.push(put('booth-kettle', 'outskirts_lodge_kettle', lodge.across, lodge.along, { yaw: lodge.yaw }));
    if ([1, 2, 3, 4, 10, 11, 12, 13, 15, 16, 17].includes(k)) pieces.push(put('booth-ledger', 'outskirts_lodge_ledger', lodge.across, lodge.along, { yaw: lodge.yaw, inspect: k === 2 ? undefined : 'ledger', interact: [-0.68, -1.8], closeReach: 1.6, focusPriority: 9 }));
    // The same man as Wrong Fold, still upright. His feet meet the lodge's
    // .20m plinth and his head clears the service window. Local +Z faces into
    // the lodge, keeping his back to the road; the inspection stays at the hatch.
    if (k === 2) pieces.push(attach(lodge, 'booth-guard', 'outskirts_fold_guard', -.73, .20, .05, {
      yaw: Math.PI, character: freeze({ clip: 'idle', time: 0, loop: true }),
      unwatched: 'vanish', inspect: 'guard', interact: [-.28, 1.85], closeReach: 1.8, focusPriority: 9,
      collision: [{ minX: -.19, maxX: .19, minZ: -.17, maxZ: .17 }],
    }));
    if (k === OUTSKIRT_FOLD_ENCOUNTER.pass) {
      const seated = OUTSKIRT_FOLD_ENCOUNTER;
      pieces.push(
        attach(lodge, 'booth-fold-chair', seated.chairMesh, ...seated.root, { yaw: seated.yaw,
          collision: [{ minX: -0.27, maxX: 0.27, minZ: -0.22, maxZ: 0.31 }] }),
        attach(lodge, 'booth-fold-sideledge', seated.ledgeMesh, ...seated.root, { yaw: seated.yaw,
          collision: [{ minX: -0.69, maxX: -0.41, minZ: -0.20, maxZ: 0.90 }] }),
        attach(lodge, 'booth-guard', seated.mesh, ...seated.root, { yaw: seated.yaw, inspect: 'fold-guard', interact: [0, -0.90], closeReach: 1.8,
          encounter: 'wrong-fold', collision: [{ minX: -0.36, maxX: 0.36, minZ: -0.68, maxZ: 0.28 }] }),
      );
    }
  }
  if (kept('shelter')) {
    pieces.push(base.shelter);
    // The ordinary shell already includes its timetable. Its real timber
    // bench is a separate mesh, exactly as in the arrival court.
    pieces.push(attach(base.shelter,'shelter-bench','yard_look_bench',-1,0,0,{
      collision:[{minX:-.36,maxX:.38,minZ:-1.62,maxZ:1.62}],
    }));
  }
  // From the middle of the road his coat is over the back of the shelter seat.
  if (k >= 12 && kept('shelter')) pieces.push(attach(base.shelter,'coat','draped_coat',-.9,.5475,.2,{inspect:'coat'}));
  if (kept('bin')) pieces.push(off(base.bin, 0.4));
  if (kept('bench')) pieces.push(off(base.bench, 0.4));
  // A car parked short of the gate from the fifth pass on, engine ticking, radio on.
  if (k >= 4 && kept('car')) pieces.push(put('car', 'outskirts_car', 4.5, 6.2, { yaw: Math.PI, inspect: 'car', interact: [1.2, -0.45], closeReach: 1.6 }));
  if (kept('bus')) pieces.push(off(base.bus, 0.3));
  // Late on, every box's handset hangs off its shelf on the cord, and the door stands open.
  pieces.push(freeze({ ...off(base['phone-box'], 0.15), yaw: base['phone-box'].yaw, handsetHanging: k >= 17, doorAjar: k >= 22 }));
  pieces.push(off(base.postbox, 0.2));
  if (k === 0) pieces.push(base['bus-woman']);
  else if (k === 1 && kept('bus')) {
    // Stand in the aisle on the .50m saloon floor. The old x=.6 bus-local
    // placement put both legs through the fourth seat; attach to the actual
    // bus so any later arrangement carries its occupant with it.
    const bus = pieces.find((piece) => piece.id === 'bus');
    pieces.push(attach(bus, 'bus-woman-aboard', 'outskirts_bus_woman', 0, .50, 1.3, { yaw: Math.PI / 2 }));
  }
  else if (kept('bus-woman')) pieces.push(freeze({ ...off(base['bus-woman'], 0.5), watcher: hash(k, 'watch', 9) < 0.25 + wear * 0.6 }));
  if (kept('van')) pieces.push(base.van,attach(base.van,'van-lamp','yard_van_lamp',0,2.3,2,{glow:base['van-lamp'].glow}));
  // THE VAN FILLS UP. Nobody says so: pass by pass his own kit turns up in the
  // back, then his bag with the letter in it, then her page on the dash and more of
  // it, and at the end his headphones laid on the blanket and the car phone's
  // handset hanging out of the side on its cord. Its words (source-space.outskirts
  // van.b0–b5) get worse on the same fifths of the road.
  if (kept('van')) {
    const band = Math.min(5, Math.floor(k / 5));
    // Only reached by leaning into the back of the van; from further off, the van.
    if (k >= 6) pieces.push(attach(base.van, 'van-bag', 'soft_bag', 0.30, 1.09, 1.34, { yaw: 0.3, inspect: 'bag', interact: [0, 0.2], closeReach: 2.2, focusPriority: 9 }));
    if (band >= 1) pieces.push(attach(base.van, 'van-case', 'speaker_cabinet', 0.45, 0.67, -0.30, { yaw: 0.1 }));
    if (band >= 2) pieces.push(attach(base.van, 'van-radio', 'walkie_radio', -0.65, 1.10, 1.10, { yaw: 1.2 }));
    const dash = band >= 4 ? 7 : band >= 3 ? 3 : 0;
    for (let j = 0; j < dash; j += 1) pieces.push(attach(base.van, `van-dash-page-${j}`, 'loose_note', (j - (dash - 1) / 2) * 0.18, 1.36 + j * 0.004, -3.1 + (j % 2) * 0.025, { yaw: (j % 3 - 1) * 0.18 }));
    if (band >= 5) {
      pieces.push(
        attach(base.van, 'van-headphones', 'ending_headphones', 0.35, 1.174, 1.75),
        attach(base.van, 'van-cord', 'city_phone_box_cord', 1.5, 1.25, -0.2),
        attach(base.van, 'van-handset', 'city_phone_box_handset', 1.5, 0.8, -0.2),
      );
    }
  }

  // HER PAGE, the one torn out of the phone book in the box, keeps finding him:
  // in the lodge ledger early, caught on the fence once the scene has broken,
  // on the van's dashboard late. (From the late passes it stops being one page:
  // main's flurry.) SARAH_PAGE in src/game/payphone.js holds the passes.
  const ledgerHere = pieces.some((piece) => piece.id === 'booth-ledger');
  if (k >= 1 && k <= 12 && ledgerHere) pieces.push(attach(base.booth, 'page-ledger', 'loose_note', -0.68, 1.51, -1.40, { inspect: 'page-ledger', interact: [0, -0.40], closeReach: 1.6 }));
  // The fence is among the first things to go; by then her page is caught on the gate piers.
  if (k >= 14 && pass.break) pieces.push(put('page-fence', 'loose_note', -1.9, 0.9, { y: 0.95, yaw: Math.PI / 2, inspect: 'page-fence', closeReach: 1.4 }));
  if (k >= 17 && kept('van')) pieces.push(attach(base.van, 'page-dash', 'loose_note', 0, 1.36, -3.1, { inspect: 'page-dash', interact: [0, -0.75], closeReach: 1.6 }));

  switch (pass.break) {
    case 'mirrored':
      {
        const originals=new Map(pieces.map(p=>[p.id,p]));
        const mirrored=pieces.map(piece=>piece.id==='road'||piece.structural||piece.payphone?piece:freeze({...piece,across:-piece.across,yaw:-piece.yaw}));
        const parents=new Map(mirrored.map(p=>[p.id,p]));
        pieces=mirrored.map(piece=>{
          const original=originals.get(piece.id),parent=originals.get(piece.attachedTo),target=parents.get(piece.attachedTo);
          if(!parent||!target)return piece;
          const moved=rotateAttachment(original,parent,target.yaw-parent.yaw);
          return freeze({...moved,across:moved.across+target.across-parent.across,along:moved.along+target.along-parent.along});
        });
      }
      break;
    case 'stutter':
      pieces = [...pieces, ...pieces.filter((piece) => piece.id !== 'road' && !piece.payphone && !piece.structural)
        .map((piece) => freeze({ ...piece, id: `${piece.id}-stutter`, along: piece.along + 2.2, inspect: undefined }))];
      break;
    case 'turned': {
      const van = pieces.find((piece) => piece.id === 'van');
      pieces = pieces.map((piece) => {
        if (van && piece.attachedTo === 'van') return rotateAttachment(piece, van, Math.PI);
        return FACES.includes(piece.id) ? freeze({ ...piece, yaw: piece.yaw+Math.PI, watcher: piece.id === 'bus-woman' || piece.watcher }) : piece;
      });
      break;
    }
    case 'blocked':
      pieces = pieces.filter((piece) => piece.id !== 'bus' && (k !== OUTSKIRT_BUS_ENCOUNTER.pass || !piece.id.startsWith('bus-woman')));
      pieces.push(put('bus', 'outskirts_bus', 0, 24.5, {
        yaw: OUTSKIRT_BUS_ENCOUNTER.yaw, inspect: 'bus', interact: [-1.6, -3.15], closeReach: 1.8,
        keepThrough: k, encounter: k === OUTSKIRT_BUS_ENCOUNTER.pass ? 'bus-close' : undefined,
      }));
      // Both ends meet a visible barrier. Only the east nose gap remains, and
      // its width is shared with the collision helper and traversal test.
      pieces.push(
        put('funnel-west', 'outskirts_bus_funnel_west', -8.05, 24.5, { yaw: Math.PI / 2, structural: true }),
        put('funnel-east', 'outskirts_bus_funnel_east', 8.9, 24.5, { yaw: Math.PI / 2, structural: true }),
      );
      if (k === OUTSKIRT_BUS_ENCOUNTER.pass) pieces.push(put('bus-woman', 'outskirts_bus_woman',
        OUTSKIRT_BUS_ENCOUNTER.womanAcross, OUTSKIRT_BUS_ENCOUNTER.womanAlong,
        { yaw: -Math.PI / 2, y: 0.50, inspect: 'woman', closeReach: 1.6, interact: [0, 0], keepThrough: k, encounter: 'bus-close', watcher: false, collision: 'none' }));
      break;
    case 'no-road':
      pieces = pieces.filter((piece) => piece.id !== 'road');
      break;
    case 'crowd':
      pieces = pieces.filter((piece) => piece.id !== 'bus-woman').concat([0, 1, 2, 3].map((j) =>
        put(`bus-woman-crowd-${j}`, 'outskirts_bus_woman', 5.2, 3 + j * OUTSKIRT_LAMP_SPACING + 0.8, { yaw: Math.PI / 2, watcher: true, keepThrough: k, ...(j === 1 ? { inspect: 'woman', closeReach: 1.6 } : {}) })));
      break;
    case 'swapped':
      pieces = pieces.map((piece) => {
        const da=base.van.across-base.booth.across,dl=base.van.along-base.booth.along;
        if (piece.attachedTo === 'booth'||piece.id.startsWith('booth')) return freeze({...piece,across:piece.across+da,along:piece.along+dl});
        if (piece.id === 'van' || piece.attachedTo === 'van') return freeze({...piece,across:piece.across-da,along:piece.along-dl});
        return piece;
      });
      break;
    case 'emptied':
      pieces = pieces.filter((piece) => ['road', 'gate'].includes(piece.id) || piece.lamp || piece.payphone || piece.structural)
        .map((piece) => (piece.lamp ? freeze({ ...piece, dark: piece.id !== 'lamp-0' }) : piece));
      break;
    case 'stranger':
      pieces = pieces.concat(
        put(OUTSKIRT_DOG_ENCOUNTER.handlerKey, 'outskirts_dog_handler',
          OUTSKIRT_DOG_ENCOUNTER.handlerAcross, OUTSKIRT_DOG_ENCOUNTER.along, {
            yaw: OUTSKIRT_DOG_ENCOUNTER.handlerYaw, watcher: true, inspect: 'dog',
            interact: [.65, 0], closeReach: 2.2,
            // A small sodium bounce holds the silhouette in this sparse pool;
            // both it and the ordinary flashlight still pass through dither.
            glow: [1, .72, .43, .005],
            character: freeze({ clip: 'idle', time: 0, loop: true }),
            collision: [freeze({ minX: -.23, maxX: .23, minZ: -.19, maxZ: .19 })],
          }),
        put(OUTSKIRT_DOG_ENCOUNTER.dogKey, 'outskirts_vacant_dog',
          OUTSKIRT_DOG_ENCOUNTER.dogAcross, OUTSKIRT_DOG_ENCOUNTER.along, {
            yaw: OUTSKIRT_DOG_ENCOUNTER.dogYaw,
            glow: [1, .72, .43, .005],
            // The raised trunk is open under the two true voids. Only feet and
            // lower limbs stop the player; the road remains passable around it.
            collision: freeze([-1, 1].flatMap((side) => [
              freeze({ minX: side * .22 - .10, maxX: side * .22 + .10, minZ: -.59, maxZ: -.39 }),
              freeze({ minX: side * .24 - .10, maxX: side * .24 + .10, minZ: .69, maxZ: .89 }),
            ])),
          }),
        put(OUTSKIRT_DOG_ENCOUNTER.leadKey, 'outskirts_slack_lead',
          OUTSKIRT_DOG_ENCOUNTER.handlerAcross, OUTSKIRT_DOG_ENCOUNTER.along, {
            yaw: 0, collision: 'none',
          }),
      );
      break;
    case 'unfinished':
      // A set nobody finished: most things are only their timber frame
      // (source-space-runtime draws a flagged piece as set_beam edges).
      pieces = pieces.map((piece) => (!['road', 'gate'].includes(piece.id) && !piece.lamp && !piece.payphone && !piece.structural && (piece.id === 'van' || hash(k, piece.id, 47) < 0.7)
        ? freeze({ ...piece, unfinished: true, inspect: undefined }) : piece));
      break;
    case 'already-walked': {
      // Somebody walked this pass a moment ahead of him, in his gait, and left the doors open.
      for (let j = 0; j * 0.39 + 1.2 < OUTSKIRT_STRETCH_METRES - 1; j += 1) {
        // Wet: they catch the lamps, so they print lighter than the dry road round
        // them. Laid just proud of the road surface (its markings top out at 24 mm).
        pieces.push(put(`footprint-${j}`, 'wet_footprint', (j % 2 ? 0.13 : -0.13) + Math.sin(j * 0.21) * 0.35, 1.2 + j * 0.39, { y: 0.03, yaw: Math.PI + (j % 2 ? 0.08 : -0.08), glow: [0.78, 0.84, 0.9, 0.35] }));
      }
      pieces = pieces.map((piece) => (piece.payphone ? freeze({ ...piece, doorAjar: true }) : piece));
      break;
    }
    case 'played-back':
    case 'silent':
      // Nothing to lay out: these are played (source-space-runtime outskirtsPassBreak, main).
      break;
    default:
      break;
  }
  pieces = pieces.filter((piece) => !vanished(k, piece));
  // What belongs to something goes with it: no dash pages hanging where the van
  // was, no lodge lamp standing in the air.
  const has = (id) => pieces.some((piece) => piece.id === id);
  return pieces.filter((piece) => {
    if ((piece.id.startsWith('van-') || piece.id.startsWith('page-dash')) && !has('van')) return false;
    if ((piece.id.startsWith('booth-') || piece.attachedTo === 'booth') && !has('booth')) return false;
    if (piece.id === 'coat' && !has('shelter')) return false;
    return true;
  });
}

// Pass-local layout also permits inspecting an authored break independently of
// the fixed schedule. The full arrival always uses the deterministic schedule.
export function outskirtsPassLayout(k, options = {}) {
  const pass = OUTSKIRT_PASSES[k];
  return pass ? passPieces(options.break === undefined ? pass : { ...pass, break: options.break }) : [];
}

// Every piece on every pass, in road metres, worn and broken as the pass says.
export function outskirtsArrivalLayout() {
  const out = OUTSKIRT_APRON.map((piece) => freeze({ ...piece, key: piece.id, stretch: -1, repeat: -1, watcher: false, dark: false }));
  for (const pass of OUTSKIRT_PASSES) {
    const start = OUTSKIRT_STRETCH_START + pass.k * OUTSKIRT_STRETCH_METRES;
    for (const piece of passPieces(pass)) {
      const { inspect, ...rest } = piece;
      out.push(freeze({
        watcher: false, dark: false, ...rest,
        ...(inspect ? { inspect } : {}),
        key: piece.id,
        // `r` for road, and the pass: the payphone and its bells address pieces
        // on the box's own pass by these ids (r13-van, r13-booth).
        id: `r${pass.k}-${piece.id}`,
        stretch: pass.k,
        repeat: pass.k,
        wear: pass.wear,
        broken: pass.break,
        along: start + piece.along,
      }));
    }
  }
  // THE LAST LIGHT. After the last pass, sixty metres of black, then one faulty
  // streetlight, its arm reaching over the road, and his DA-1000 lying on the
  // tarmac under it.
  const end = { stretch: OUTSKIRT_STRETCH_COUNT, repeat: OUTSKIRT_STRETCH_COUNT, wear: 1, broken: null, watcher: false, dark: false };
  out.push(freeze({ ...put('last-light', 'yard_lamp_column', OUTSKIRT_LAST_LIGHT.across + 1.6, OUTSKIRT_LAST_LIGHT.along, { yaw: Math.PI, lamp: true, faulty: true }), ...end, key: 'last-light', id: 'end-last-light' }));
  out.push(freeze({ ...put('last-recorder', 'ending_recorder_open', OUTSKIRT_LAST_LIGHT.across, OUTSKIRT_LAST_LIGHT.along, { yaw: Math.PI / 2, lastRecorder: true }), ...end, key: 'last-recorder', id: 'end-last-recorder' }));
  // The remnant of a service enclosure only resolves over the final eleven
  // metres of black. It meets the actual field edge, so approaching the light
  // is physical geometry rather than a hidden trigger across the whole void.
  const threshold = OUTSKIRT_LAST_THRESHOLD;
  for (const side of [-1, 1]) {
    const dx = side * (threshold.railAcross - threshold.outerAcross);
    const dz = -(threshold.throatAlong - threshold.fromAlong);
    for (let j = 0; j < 6; j += 1) {
      const t = (j + 0.5) / 6, key = `last-guide-${side < 0 ? 'west' : 'east'}-${j}`;
      out.push(freeze({ ...put(key, 'outskirts_boundary_rail_6', side * threshold.outerAcross + dx * t,
        threshold.fromAlong + (threshold.throatAlong - threshold.fromAlong) * t,
        { yaw: Math.atan2(dx, dz), structural: true, lastThreshold: true }), ...end, key, id: `end-${key}` }));
    }
    const key = `last-rail-${side < 0 ? 'west' : 'east'}`;
    out.push(freeze({ ...put(key, 'outskirts_boundary_rail_6', side * threshold.railAcross, threshold.throatAlong + 3,
      { structural: true, lastThreshold: true }), ...end, key, id: `end-${key}` }));
  }
  out.push(freeze({ ...put('last-service-stop', 'outskirts_boundary_rail_6', 0, threshold.endpointAlong,
    { yaw: Math.PI / 2, structural: true, lastThreshold: true }), ...end, key: 'last-service-stop', id: 'end-last-service-stop' }));
  return out;
}

// Where a beat stands, in road metres.
export function outskirtBeatAlong(beat) {
  if (!Number.isFinite(beat?.along)) return null;
  return Number.isInteger(beat.stretch)
    ? OUTSKIRT_STRETCH_START + beat.stretch * OUTSKIRT_STRETCH_METRES + beat.along
    : beat.along;
}

export const OUTSKIRT_ROAD_END = OUTSKIRT_STRETCH_START + OUTSKIRT_STRETCH_COUNT * OUTSKIRT_STRETCH_METRES;
// Where the one faulty light stands, in road metres: sixty metres past the last pass.
export const OUTSKIRT_LAST_LIGHT = freeze({ along: OUTSKIRT_ROAD_END + 62, across: 0 });
// Standing here, where its reflection stood, starts the recording.
export const OUTSKIRT_LAST_MARK = freeze({ along: OUTSKIRT_LAST_LIGHT.along - 0.9, across: OUTSKIRT_LAST_LIGHT.across });
// The retained set's six real 6m panels per diagonal: no mesh scaling. The
// continuous unravelling runtime removes these guide and stop pieces, leaving
// the recording pool optional and the road open through the old tape seam.
export const OUTSKIRT_LAST_THRESHOLD = freeze({
  outerAcross: 36, railAcross: 1.15,
  throatAlong: OUTSKIRT_LAST_MARK.along - 2.2,
  fromAlong: OUTSKIRT_LAST_MARK.along - 2.2 - Math.sqrt(36 ** 2 - (36 - 1.15) ** 2),
  endpointAlong: OUTSKIRT_LAST_MARK.along + 1.1,
});
