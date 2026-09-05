// WHAT A CORRIDOR IS FOR, SAID IN OBJECTS.
//
// The circulation in this building was bare on purpose, and the reason is
// written down beside the props that used to be here (conservatory-props.js,
// "Stair flights, landings, and their approach corridors intentionally stay
// bare"): rails, paintings, furniture, frames and hanging fixtures made the safe
// throat ambiguous. That is a real finding — in the dark, with a torch, the
// player reads the route off the architecture, and a chair in the middle of it
// costs more than it gives. A portrait, two chairs and a chandelier came out of
// the practice corridor for exactly this, and
// test/conservatory-space-layout.test.mjs keeps them out.
//
// So nothing here goes back into the route. This dresses the PLANE. Every
// placement is wall-mounted, non-blocking and above the walking envelope: a mark
// ON the corridor, never an object IN it. The throat is still the throat, and
// the torch still reads it.
//
// A CORRIDOR IS A SHAPE, NOT A ZONE. The obvious detector — ZONE.none, which is
// what the '.' and ',' glyphs compile to — finds the basement service run and
// the ground spine and misses the two longest corridors in the building, because
// the practice spine and the academic core carry their WING's zone (both sides
// of a practice door read ZONE.practice). Worse, door apertures also compile as
// ZONE.none, so a zone test beside a door matches the doorway itself — the trap
// wall-contact.js warns about. So corridors are found by section instead: a cell
// narrow on one axis and long on the other is a corridor whatever it is zoned,
// which is also what makes it feel like one.
//
// Generated rather than typed, for the same reason the skirting is: the plan
// moves — sometimes under another pair of hands — and a corridor dressed by hand
// is a corridor that drifts off its own wall.
//
// Pure, and takes the same small plan reader wall-contact.js does, so the rules
// can be proved against a hand-built grid with no browser and no GPU.

import { F, ZONE } from '../data/floorplan/legend.js';
import { wallFaces, yawFromNormal } from './wall-contact.js';
import { FACILITY_SPACES } from '../data/building-map.js';

// Runtime cells per authored metre. Props are authored in metres; the plan and
// its wall runs are in cells. Matches PLAN_SCALE in floorplan/legend.js.
const CELLS_PER_METRE = 2;
// THE AUTHORED METRE THAT ROUND-TRIPS BACK TO THIS CELL.
//
// props.js resolves a placement with rt(m) = Math.round(m * PLAN_SCALE), so cell
// C is the metre C/2 and nothing else. The intuitive "centre of the cell",
// (C + 0.5)/2, rounds UP — Math.round(C + 0.5) is C + 1 — which put every
// fixture in this module one cell past its own wall, and every east-facing plate
// inside the masonry, where propsInit drops it for being solid.
const m = (cell) => cell / CELLS_PER_METRE;

export const CORRIDOR = Object.freeze({
  // A corridor is at most five metres across — and the five is measured on the
  // COMPILED plan, not the authored one. conservatory.widenCorridors is on, so
  // widenCorridorRuns() opens these up before anything sees them: the ground
  // spine is authored three metres and compiles to five, and the dance wing
  // corridor reaches thirteen where it opens into the studios. Six cells was the
  // authored width, and it found almost nothing — because almost nothing is
  // still that width by the time it is walked.
  //
  // The hall's aisles, which are the reason to have an upper bound at all, are
  // kept out by GROUPS rather than by this number.
  MAX_WIDTH_CELLS: 10,
  // ...and at least twelve metres long. Shorter than that is a lobby or a
  // threshold, not a run, and the things that make a corridor bearable are the
  // things that make a LONG one bearable.
  MIN_LENGTH_CELLS: 24,
  // How far a span probe will walk before giving up. Any real room is wider than
  // this, so the loop exits on the width test rather than on the cap.
  MAX_PROBE_CELLS: 80,
  // The wings that have circulation worth dressing. The hall, the tower and
  // St Brendan's are excluded on purpose: their long thin spaces are aisles,
  // spiral turrets and an ambulatory, each already authored with its own kit.
  GROUPS: Object.freeze(['ground', 'basement', 'upper', 'academic']),
  // Named rooms that happen to be slot-shaped. The foyer's north side is a 2m
  // deep run twenty metres long, and it holds an authored console suite; the
  // dock, the chapel, the plant annex and the get-in are the same story. They
  // are corridor-shaped and they are rooms, and the only thing that tells them
  // apart is that somebody named them — so the name is what is used.
  //
  // The wings are NOT listed, deliberately. ZONE.practice and ZONE.academic
  // carry both the spine and the rooms off it, which is exactly why zone alone
  // cannot find a corridor and the section test above exists.
  SKIP_ZONES: Object.freeze([ZONE.foyer, ZONE.dock, ZONE.chapel, ZONE.plant, ZONE.getIn]),
});

// A generated fixture names the wall it came from (mountNormal), so props.js
// filters the contact search to that face instead of taking the nearest one. In
// a three-metre corridor the nearest face to a cell centre is a coin toss
// between the two sides, and losing it puts a notice board on the far wall
// facing away. Nothing is nudged off the cell any more: rt() rounds a position
// back to its cell regardless, so the old nudge moved nothing and only obscured
// which wall was meant.

// A run has to be long enough that a fixture reads as placed on it rather than
// jammed into a corner, spaced about six metres, and never within a metre of an
// end.
const MIN_RUN_CELLS = 6;
const SPACING_CELLS = 12;
const END_MARGIN_CELLS = 2;

const KEY = (x, y) => `${x},${y}`;
const inspect = (first, again) => ({ first, again });

function freeRun(plan, x, y, dx, dy) {
  let n = 0;
  for (let i = 1; i <= CORRIDOR.MAX_PROBE_CELLS; i += 1) {
    if (plan.isSolid(x + dx * i, y + dy * i)) break;
    n += 1;
  }
  return n;
}

/**
 * Every cell whose free section reads as a corridor, keyed `"x,y"`. The value
 * carries the axis the corridor RUNS along, which is the long one.
 */
export function corridorCells(plan) {
  const size = plan.size?.() ?? plan.planSize?.() ?? { w: 0, h: 0 };
  const out = new Map();
  for (let y = 0; y < size.h; y += 1) {
    for (let x = 0; x < size.w; x += 1) {
      if (plan.isSolid(x, y)) continue;
      const spanX = 1 + freeRun(plan, x, y, 1, 0) + freeRun(plan, x, y, -1, 0);
      const spanY = 1 + freeRun(plan, x, y, 0, 1) + freeRun(plan, x, y, 0, -1);
      const narrow = Math.min(spanX, spanY), long = Math.max(spanX, spanY);
      if (narrow > CORRIDOR.MAX_WIDTH_CELLS) continue;
      if (long < CORRIDOR.MIN_LENGTH_CELLS) continue;
      const group = plan.physical?.(x, y)?.renderGroup
        ?? plan.logicalToPhysical?.(x, y)?.renderGroup ?? '';
      if (!CORRIDOR.GROUPS.includes(group)) continue;
      if (CORRIDOR.SKIP_ZONES.includes(plan.zoneAt(x, y))) continue;
      // A STAIR IS NOT A CORRIDOR, even where it is corridor-shaped and runs
      // straight into one. The bare-circulation note names "stair flights,
      // landings, and their approach corridors" first, and it is right about the
      // flights for a reason the rest of this module cannot improve on: on a
      // stair the architecture is doing load-bearing work telling you where the
      // treads are, and hanging things beside it competes with that.
      //
      // Measured before this line existed: 26 of 70 placements landed on stair
      // cells, including ten boards in a row down the main basement flight,
      // because the basement service corridor runs alongside that stair for
      // ninety cells and reads as one continuous narrow space.
      if (plan.hasFlag?.(x, y, F.STAIR)) continue;
      out.set(KEY(x, y), { x, y, axis: spanX > spanY ? 'x' : 'y', width: narrow, group });
    }
  }
  return out;
}

/**
 * The part of a corridor you actually walk down: corridor cells with open floor
 * on all four sides.
 *
 * The full section is not the throat. A three-metre corridor is six cells, and a
 * desk tucked against one edge of it leaves the route entirely clear — which is
 * what the author of the practice landing's desk stack meant by "safely out of
 * the route". Stripping the cells that touch a wall leaves the clear middle,
 * which is the thing the bare-circulation rule is protecting and the thing a
 * torch has to be able to read.
 */
export function corridorThroatCells(plan, cells = corridorCells(plan)) {
  const out = new Map();
  for (const [key, cell] of cells) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => plan.isSolid(cell.x + dx, cell.y + dy));
    if (!edge) out.set(key, cell);
  }
  return out;
}

/**
 * Wall runs that bound a corridor, merged on this module's own terms.
 *
 * wallRuns() deliberately breaks a run whenever the MATERIAL changes, because a
 * baked skirting has to change with it. Corridors get their material from
 * inheritCorridorMaterials(), which re-surfaces every cell from the nearest room
 * within eight cells — so a corridor passing four rooms changes material four
 * times, and the 48m basement service run comes back as fragments six cells
 * long. That is right for skirting and useless here: a notice board does not
 * care what the wall is made of. These runs break only on a gap.
 */
export function corridorWallRuns(plan, cells = corridorCells(plan)) {
  const lines = new Map();
  for (const f of wallFaces(plan)) {
    if (f.arcId) continue;
    const cell = cells.get(KEY(f.x, f.y));
    if (!cell) continue;
    const axis = f.nx !== 0 ? 'y' : 'x';
    const along = axis === 'x' ? f.y : f.x;
    const key = `${f.nx},${f.ny},${along}`;
    if (!lines.has(key)) lines.set(key, { nx: f.nx, ny: f.ny, axis, along, at: [] });
    lines.get(key).at.push({ at: axis === 'x' ? f.x : f.y, group: cell.group });
  }
  const runs = [];
  for (const line of lines.values()) {
    line.at.sort((a, b) => a.at - b.at);
    let start = 0;
    for (let i = 1; i <= line.at.length; i += 1) {
      const broken = i === line.at.length || line.at[i].at !== line.at[i - 1].at + 1;
      if (!broken) continue;
      const span = line.at.slice(start, i);
      start = i;
      if (span.length < MIN_RUN_CELLS) continue;
      runs.push({
        nx: line.nx, ny: line.ny, axis: line.axis, along: line.along,
        from: span[0].at, to: span[span.length - 1].at + 1,
        group: span[0].group,
      });
    }
  }
  // Stable output: this array gets diffed by eye when the building moves.
  return runs.sort((a, b) => a.group.localeCompare(b.group)
    || a.axis.localeCompare(b.axis) || a.along - b.along || a.from - b.from);
}

// ── WHAT HANGS ON A CORRIDOR WALL IN A MUSIC SCHOOL ──────────────────────────
//
// Sorted by wing, because the four kinds of corridor here are four different
// institutions. The basement is services and reads as plant: pipe runs at high
// level and the distribution panels that go with them. Ground is the school
// talking to the public. Upper is the practice wing talking to itself — booking
// sheets and the notice about instrument cases. Academic is the exam board.
//
// Every entry is wall-mounted and non-blocking, and nothing sits below 1.15m, so
// nothing is in the walking envelope. The basement's pipe run is held to 1.85
// because ';' is a 2.45m ceiling and a pipe at shoulder height in a low corridor
// is a thing you walk into.
//
// Nothing here uses power_box_01, which reads like the obvious choice and is
// ABSENT FROM THE PACKED GLB — it has no entry in PROP_BOUNDS or MESH_SURFACE,
// so it draws nothing. The five authored acq-services-panel-* props use it and
// are invisible today; that is a pre-existing bug and it needs a pack rebuild,
// not a placement. The plant pipe family is packed and wall-mounted, and says
// the same thing about a service corridor.
//
// Every wing's kit ends in a public_exit_sign, which is the one piece of
// wayfinding that belongs on a corridor wall rather than at a landing: it is
// read at a distance, in the dark, by someone who wants out. Held at 2.42 under
// the 3.5m corridor ceiling, and at 1.98 in the basement, where ';' is 2.45.
//
// Nothing here is a portrait, a frame or anything that hangs. The note this
// module opens with names those specifically, and a corridor that reads as a
// gallery is the failure it describes.
const FIXTURES = {
  basement: [
    { mesh: 'plant_pipe_straight', elevation: 1.85, interactive: false },
    { mesh: 'plant_pipe_bank', elevation: 1.62, inspect: inspect(
      'A bank of four pipes on the same brackets, lagged and stencilled with a circuit number where they leave the wall.',
      'One of the five circuits the plant room lists. The lagging is warm nowhere along it.') },
    { mesh: 'plant_pipe_straight', elevation: 1.85, interactive: false },
    { mesh: 'notice_board', elevation: 1.25, inspect: inspect(
      'A works notice in a wall frame: isolation procedure, two extensions, and a date in the last maintenance period.',
      'Both extensions are internal. Nothing in this building is answering them.') },
    { mesh: 'public_exit_sign', elevation: 1.98, scale: 0.8, interactive: false },
  ],
  ground: [
    { mesh: 'notice_board', elevation: 1.28, inspect: inspect(
      'A timetable under glass. Rooms down one side, hours across the top, and a term that has ended.',
      'Every hour is spoken for. None of it happened tonight.') },
    { mesh: 'notice_board', elevation: 1.35, scale: 0.86, inspect: inspect(
      'A concert bill with DATE TO BE CONFIRMED overprinted across the middle.',
      'The overprint is newer than the bill and older than the closure.') },
    { mesh: 'notice_board', elevation: 1.22, inspect: inspect(
      'A staff rota, annotated in three hands and corrected in a fourth.',
      'The fourth hand crossed out more than it wrote.') },
    { mesh: 'public_exit_sign', elevation: 2.42, interactive: false },
  ],
  upper: [
    { mesh: 'notice_board', elevation: 1.30, inspect: inspect(
      'A practice-room booking sheet, ruled by hand into half-hours.',
      'Initials in most of the boxes. The same three, over and over.') },
    { mesh: 'notice_board', elevation: 1.24, scale: 0.9, inspect: inspect(
      'A notice about instrument cases: not in the corridor, not against the radiators, not overnight.',
      'It is pinned at the one point in the wing where there is nowhere else to put them.') },
    { mesh: 'notice_board', elevation: 1.38, inspect: inspect(
      'A fire notice. Assembly point, the name of a warden, and the date of the last drill.',
      'The drill was held. The date is inside the closure.') },
    { mesh: 'public_exit_sign', elevation: 2.42, interactive: false },
  ],
  academic: [
    { mesh: 'notice_board', elevation: 1.32, inspect: inspect(
      'An examination notice. Grades, dates, and a list of what a candidate may bring in.',
      'A pencil, and nothing else.') },
    { mesh: 'notice_board', elevation: 1.26, scale: 0.88, inspect: inspect(
      'A reading list for the vocal studies course, photocopied until the lower third went to grey.',
      'Someone has written a title in the margin that is not on the list.') },
    { mesh: 'plant_pipe_valve', elevation: 1.72, interactive: false },
    { mesh: 'public_exit_sign', elevation: 2.42, interactive: false },
  ],
};

export function wallFixtures(plan, cells = corridorCells(plan)) {
  const out = [];
  // A counter PER WING, not one global one. Shared, the count was carried across
  // wings by whatever order the runs came in, so the basement — whose kit is
  // mostly pipe runs and panels — drew notice boards nearly every time and the
  // services never appeared. Each wing now cycles its own kit.
  const n = new Map();
  for (const run of corridorWallRuns(plan, cells)) {
    const kit = FIXTURES[run.group];
    if (!kit) continue;
    for (let at = run.from + END_MARGIN_CELLS; at <= run.to - END_MARGIN_CELLS; at += SPACING_CELLS) {
      const cx = run.axis === 'x' ? at : run.along;
      const cy = run.axis === 'x' ? run.along : at;
      if (!cells.has(KEY(cx, cy))) continue;
      const seen = n.get(run.group) || 0;
      const spec = kit[seen % kit.length];
      n.set(run.group, seen + 1);
      out.push({
        id: `corridor-fixture-${run.group}-${run.axis}${run.along}-${at}`,
        yaw: yawFromNormal(run.nx, run.ny),
        scale: 1,
        blocks: false,
        mount: 'wall',
        ...spec,
        x: m(cx),
        y: m(cy),
        mountNormal: { nx: run.nx, ny: run.ny },
      });
    }
  }
  return out;
}

// ── THE PLATE BESIDE THE DOOR ────────────────────────────────────────────────
//
// door_stencil is a blank plate — the mesh is one paper-material box, and the
// "B3" the dance wing reads by lives entirely in that prop's inspect text. This
// keeps that convention rather than inventing a second one: the plate is the
// institutional motif you see from down the corridor, and the room's name is
// what you get for walking up to it. Real lettering would need the 5x7
// rasteriser in build-props.mjs and a 25MB pack rebuild; the text already does
// the work, so it stays text.
//
// Names come from FACILITY_SPACES, which has known which doorIds belong to which
// room since the map was authored, and has never reached the world. Nothing here
// invents a name.
//
// Placed against a real corridor wall face rather than by stepping off the door,
// because beside an opening is masonry and the arithmetic that says otherwise
// lands the plate inside the wall.
function spaceByDoorId() {
  const out = new Map();
  for (const space of FACILITY_SPACES) {
    for (const id of space.doorIds || []) if (!out.has(id)) out.set(id, space);
  }
  return out;
}

export function doorPlates(plan, doors = [], cells = corridorCells(plan)) {
  const byDoor = spaceByDoorId();
  const faces = [];
  for (const run of corridorWallRuns(plan, cells)) {
    for (let at = run.from; at < run.to; at += 1) {
      faces.push({
        x: run.axis === 'x' ? at : run.along,
        y: run.axis === 'x' ? run.along : at,
        nx: run.nx, ny: run.ny, group: run.group,
      });
    }
  }
  const out = [];
  const taken = new Set();
  for (const door of doors) {
    const space = byDoor.get(door.id);
    if (!space) continue;
    const cx = Number(door.cx), cy = Number(door.cy);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    // Clear of the leaf, and close enough to belong to this door.
    const ideal = (door.aperture?.width || 1.9) / 2 + 0.55;
    let best = null, bestCost = Infinity;
    for (const f of faces) {
      const key = KEY(f.x, f.y);
      if (taken.has(key)) continue;
      const d = Math.hypot(m(f.x) - m(cx), m(f.y) - m(cy));
      if (d < ideal - 0.35 || d > ideal + 1.4) continue;
      const cost = Math.abs(d - ideal);
      if (cost < bestCost) { bestCost = cost; best = f; }
    }
    if (!best) continue;
    taken.add(KEY(best.x, best.y));
    out.push({
      id: `plate-${door.id}`,
      mesh: 'door_stencil',
      x: m(best.x),
      y: m(best.y),
      yaw: yawFromNormal(best.nx, best.ny),
      mountNormal: { nx: best.nx, ny: best.ny },
      scale: 1,
      mount: 'wall',
      elevation: 1.62,
      blocks: false,
      inspect: inspect(
        `${space.label}, stencilled on the plate beside the opening.`,
        `${space.shortLabel || space.label}. Still where the plan says it is.`,
      ),
    });
  }
  return out;
}

// ── THE LANDING YOU ARRIVE ON ───────────────────────────────────────────────
//
// Sparingly, and only where there is nothing at all. The tower already has the
// best arrival signage in the building — a plaque and a bulkhead and an anchored
// light at every landing — and the chapel seam got its two signs when that level
// was authored. The main stair has none, at any of its three floors, and neither
// end of the basement stair has more than a failing emergency casing.
//
// So: four landings, named here rather than derived, because "every landing"
// would include twelve tower turns that are already done and eight cathedral
// spiral points that are one cell wide. A floor indicator you find at the turn is
// a moment; the same fitting at every turn is wallpaper.
//
// The fittings are the two unplaced pair meshes, and they are 3m wide because a
// stair here is 3m wide — they were built for this and have sat in the pack
// unused. Both carry an integral sign plate, which is why the light and the
// wayfinding are one placement rather than two.
export const LANDING_FITTINGS = Object.freeze({
  'main-basement-stair/ground-landing': {
    mesh: 'stair_bulkhead_pair', label: 'GROUND',
    first: 'A caged bulkhead pair over the head of the basement stair, with a sign plate between them reading GROUND.',
    again: 'Ground. The way back up, if the stair is still where you left it.',
  },
  'main-basement-stair/b3-landing': {
    mesh: 'stair_bulkhead_pair', label: 'DANCE WING / B1-B5',
    first: 'A bulkhead pair at the foot of the stair. The plate lists the dance wing and the studios on it, B1 to B5.',
    again: 'B4 is not on the plate. It is not on the plan either.',
  },
  'main-open-well/upper-floor-landing': {
    mesh: 'stair_sconce_pair_opal', label: 'PRACTICE WING',
    first: 'A pair of opal sconces on the landing wall, with a small dark plate between them: THE PRACTICE WING.',
    again: 'The plate has an arrow on it. It points along a corridor that is not quite where it says.',
  },
  'main-open-well/academic-floor-landing': {
    mesh: 'stair_sconce_pair_opal', label: 'VOCAL STUDIES',
    first: 'Opal sconces and a plate at the top of the well: VOCAL STUDIES, and a list of studios.',
    again: 'The list is longer than the number of doors on this floor.',
  },
});

// The landing's longest wall, as a direction and a cell to stand on. A landing is
// a small rectangle, so this is a count over its own cells rather than anything
// clever: the side with the most masonry behind it is the back wall, and the back
// wall is where a fitting goes.
function landingWall(plan, at, size) {
  let best = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const on = [];
    for (let oy = 0; oy < size.y; oy += 1) {
      for (let ox = 0; ox < size.x; ox += 1) {
        const x = at.x + ox, y = at.y + oy;
        if (plan.isSolid(x, y)) continue;
        if (plan.isSolid(x + dx, y + dy)) on.push({ x, y });
      }
    }
    if (!on.length) continue;
    if (!best || on.length > best.on.length) best = { dx, dy, on };
  }
  if (!best) return null;
  // The middle of that wall, so a 3m fitting is not hung across a corner.
  const mid = best.on[Math.floor(best.on.length / 2)];
  return { cell: mid, nx: -best.dx || 0, ny: -best.dy || 0, cells: best.on.length };
}

/**
 * Fittings for the named landings. `landings` is the compiled stair descriptors'
 * own records — `{ key, at, size }` in AUTHORED units, exactly as conservatory.js
 * declares them, because `at` is the logical frame the plan is written in.
 * `physicalAt` is the render frame and is NOT interchangeable with it.
 */
export function landingFittings(plan, landings = []) {
  const out = [];
  for (const landing of landings) {
    const spec = LANDING_FITTINGS[landing.key];
    if (!spec) continue;
    const at = { x: Math.round(landing.at.x * CELLS_PER_METRE), y: Math.round(landing.at.y * CELLS_PER_METRE) };
    const size = {
      x: Math.max(1, Math.round((landing.size?.x ?? 1) * CELLS_PER_METRE)),
      y: Math.max(1, Math.round((landing.size?.y ?? 1) * CELLS_PER_METRE)),
    };
    const wall = landingWall(plan, at, size);
    // A landing with no wall of its own is an open well edge, not a place to hang
    // a three-metre fitting. Skip it rather than snapping to something distant.
    if (!wall || wall.cells < 2) continue;
    out.push({
      id: `landing-${landing.key.split('/')[1]}`,
      mesh: spec.mesh,
      x: m(wall.cell.x),
      y: m(wall.cell.y),
      yaw: yawFromNormal(wall.nx, wall.ny),
      scale: 1,
      blocks: false,
      mount: 'wall',
      mountNormal: { nx: wall.nx, ny: wall.ny },
      elevation: 2.2,
      landingLabel: spec.label,
      inspect: inspect(spec.first, spec.again),
    });
  }
  return out;
}

// ── THE ONE FLIGHT THAT STILL FITS ITS OWN HANDRAILS ────────────────────────
//
// Three `*_stair_dressing` meshes are packed and none was ever placed. Measured
// against every flight in the building, only one pair matches:
//
//   basement_stair_dressing   rise 4.00 over 10.07   main-basement-stair 4.00/10.00
//   upper_stair_dressing      rise 5.75 over 11.05   nothing
//   academic_stair_dressing   rise 6.15 over 10.05   nothing
//
// The main stair is a spiral of winders now, and its flights are 2.4-2.6m half
// coils over 6.5-7m runs. The upper and academic assemblies are sized for the
// STRAIGHT stair the spiral replaced, so they cannot be placed without running
// eleven metres of handrail through a helix — which is why they have sat unused.
// They need rebuilding against the spiral (`addMainStairDressing` in
// build-props.mjs, which also still takes the `runner:true` stair carpet that
// all three of its call sites decline), not a placement.
//
// The expected run and rise are written down so that a future stair edit fails
// loudly here instead of quietly hanging a handrail in mid-air.
export const FLIGHT_DRESSING = Object.freeze({
  'main-basement-stair/west-flight': Object.freeze({
    mesh: 'basement_stair_dressing', run: 10.0, rise: -4.0, tolerance: 0.4,
    first: 'Steel handrails down both sides of the flight, and the treads under them worn pale in the middle.',
    again: 'Twenty rises. The wear says most people took them two at a time.',
  }),
});

// The flight's centre line, measured off the stair cells rather than off the
// descriptor. `from` is a corner and `width` extends to one side of it, but WHICH
// side is not consistent between stairs — the basement flight runs one way and
// the tower flights the other. Counting the actual stair cells either side of the
// start settles it without a table of exceptions.
function flightCentre(plan, from, dir, hasStair) {
  const px = dir.y, py = -dir.x;              // perpendicular, either sign
  const reach = (sign) => {
    let n = 0;
    for (let i = 1; i <= 12; i += 1) {
      const x = Math.round(from.x + px * sign * i), y = Math.round(from.y + py * sign * i);
      if (plan.isSolid(x, y) || !hasStair(x, y)) break;
      n += 1;
    }
    return n;
  };
  const plus = reach(1), minus = reach(-1);
  if (!plus && !minus) return null;
  const shift = (plus - minus) / 2;
  return { x: from.x + px * shift, y: from.y + py * shift };
}

/**
 * Handrail assemblies for the flights whose geometry still matches their mesh.
 * `flights` are the stair descriptors' own records in AUTHORED metres.
 */
export function flightDressing(plan, flights = []) {
  const hasStair = (x, y) => (plan.hasFlag ? plan.hasFlag(x, y, F.STAIR) : true);
  const out = [];
  for (const flight of flights) {
    const spec = FLIGHT_DRESSING[flight.key];
    if (!spec) continue;
    const dx = flight.to.x - flight.from.x, dy = flight.to.y - flight.from.y;
    const run = Math.hypot(dx, dy);
    const rise = flight.toH - flight.fromH;
    // The mesh has a baked rise and run. If the stair has been re-cut since,
    // placing it would hang handrails through the air, so refuse instead.
    if (Math.abs(run - spec.run) > spec.tolerance) continue;
    if (Math.abs(rise - spec.rise) > spec.tolerance) continue;
    const dir = { x: dx / run, y: dy / run };
    const fromCells = { x: flight.from.x * CELLS_PER_METRE, y: flight.from.y * CELLS_PER_METRE };
    const centre = flightCentre(plan, fromCells, dir, hasStair);
    if (!centre) continue;
    out.push({
      id: `flight-${flight.key.split('/')[0]}`,
      mesh: spec.mesh,
      x: m(centre.x),
      y: m(centre.y),
      // Local +Z maps to world (-sin yaw, cos yaw), so this points the assembly
      // down the flight from its head, which is where the mesh origin sits.
      yaw: Math.atan2(-dir.x, dir.y),
      scale: 1,
      blocks: false,
      structural: true,
      inspect: inspect(spec.first, spec.again),
    });
  }
  return out;
}

export function corridorDressing(plan, { doors = [], landings = [], flights = [] } = {}) {
  const cells = corridorCells(plan);
  return [
    ...doorPlates(plan, doors, cells),
    ...wallFixtures(plan, cells),
    ...landingFittings(plan, landings),
    ...flightDressing(plan, flights),
  ];
}
