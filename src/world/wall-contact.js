// WHERE THE WALLS ACTUALLY ARE.
//
// Two jobs in this building were being done by typing coordinates: standing a
// thing flat against a wall, and running a base course along one. Both are
// answerable from the compiled plan, and neither was being asked.
//
// The last attempt at a base course (`addSecondPerimeterWall`, still in
// build-props.mjs) built a SECOND wall out of hand-typed axis/plane/spans values.
// It could not know where the real wall was, so it did not sit on one — the
// atrium's comment records the lower courses "visually reading as wainscoting",
// which is what a skirting looks like when it is floating off its wall. Nothing
// here is typed. Every face comes out of the plan.
//
// A NOTE ON SPACES, because it is the trap. Walls are drawn in a per-cell
// PHYSICAL frame, not in logical cells: `logicalToPhysical` gives each cell its
// own physical x/z, its OWN floor height, its render group, and an arcId, and on
// an arc it rotates intra-cell offsets along the tangent. So a run that is
// straight in logical space can be curved in the space it is drawn in. Runs
// break on arcs for exactly that reason.
//
// Pure, and takes a small plan-reader rather than importing the floorplan
// singleton, so the rules are testable against a hand-built grid with no browser
// and no GPU (the same reason game/yard-vigil.js is shaped this way).
//
// The reader needs: size(), isSolid(x,y), floorAt(x,y), zoneAt(x,y),
// materialAt(x,y), and optionally logicalToPhysical(x,y) and doorAt(x,y).

export const WALL_CONTACT = Object.freeze({
  // Metres per logical cell. Matches CELL in data/floorplan/legend.js; passed in
  // rather than imported so this module stays free of the floorplan's deps.
  CELL_METRES: 0.5,
  // How far to look for a wall when snapping a prop. Eight cells is four metres:
  // far enough to catch something authored loosely, near enough that a prop in
  // the middle of a hall does not get dragged to a distant wall.
  SEARCH_CELLS: 8,
  // A prop this far from a face is treated as already against it.
  FLUSH_M: 0.10,
});

const KEY = (x, y) => `${x},${y}`;

// The four ways out of a cell, as [dx, dy].
const STEPS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

function reader(plan) {
  const size = plan.size?.() ?? plan.planSize?.() ?? { w: 0, h: 0 };
  return {
    w: size.w, h: size.h,
    isSolid: (x, y) => !!plan.isSolid(x, y),
    floorAt: (x, y) => Number(plan.floorAt?.(x, y)) || 0,
    zoneAt: (x, y) => plan.zoneAt?.(x, y) ?? 0,
    materialAt: (x, y) => plan.materialAt?.(x, y) ?? 0,
    doorAt: (x, y) => plan.doorAt?.(x, y) ?? null,
    physical: (x, y) => plan.logicalToPhysical?.(x, y) ?? null,
  };
}

const inside = (p, x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h;

// IS THERE A VERTICAL SURFACE HERE, RISING FROM THIS CELL'S FLOOR?
//
// Two cases carry a skirting. Solid rock next door is the obvious one. A
// neighbour whose floor is HIGHER is the other — that is a riser, and a riser is
// a wall as far as the base of it is concerned. A neighbour with a lower ceiling
// (a header) is not: there is no wall at floor level under a doorway's head.
function facesWall(p, x, y, dx, dy) {
  const nx = x + dx, ny = y + dy;
  if (!inside(p, nx, ny)) return true;              // the edge of the world is a wall
  if (p.isSolid(nx, ny)) return true;
  return p.floorAt(nx, ny) > p.floorAt(x, y) + 0.02;
}

/**
 * Every wall face in the plan, in logical cells.
 * `nx,ny` is the outward normal — it points from the wall INTO the room.
 */
export function wallFaces(plan, { skipDoors = true } = {}) {
  const p = reader(plan);
  const out = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.isSolid(x, y)) continue;
      // A skirting must not run across an opening. Door cells also compile as
      // ZONE.none, which is a known trap in this plan, so the portal is the
      // thing to test rather than the zone.
      if (skipDoors && p.doorAt(x, y)) continue;
      for (const [dx, dy] of STEPS) {
        if (!facesWall(p, x, y, dx, dy)) continue;
        if (skipDoors && p.doorAt(x + dx, y + dy)) continue;
        const at = p.physical(x, y);
        out.push({
          // `|| 0` because -dx is NEGATIVE ZERO when dx is 0, and -0 fails a
          // strict deepEqual against 0 while looking identical in every log.
          x, y, nx: -dx || 0, ny: -dy || 0,
          floor: p.floorAt(x, y),
          zone: p.zoneAt(x, y),
          material: p.materialAt(x, y),
          renderGroup: at?.renderGroup ?? '',
          arcId: at?.arcId ?? 0,
        });
      }
    }
  }
  return out;
}

// Two faces can share a run only if everything that decides how the skirting is
// DRAWN is the same. Floor height especially: a run that spans a step would
// bridge it in mid-air, which is the failure this whole module exists to avoid.
function joinable(a, b) {
  return a.nx === b.nx && a.ny === b.ny
    && Math.abs(a.floor - b.floor) < 1e-6
    && a.renderGroup === b.renderGroup
    && a.zone === b.zone
    && a.material === b.material
    && !a.arcId && !b.arcId;
}

/**
 * Wall faces merged into runs along their own axis. An arc cell is never merged
 * — its physical position is rotated per cell, so a straight logical run would
 * cut the corner the stair turns.
 *
 * Each run is `{ nx, ny, axis, from, to, along, cells, floor, zone, material,
 * renderGroup, arcId }` in logical cells, where `axis` is the axis the run
 * travels along ('x' or 'y') and `along` is its fixed coordinate.
 */
export function wallRuns(plan, opts = {}) {
  const faces = wallFaces(plan, opts);
  const byKey = new Map();
  for (const f of faces) byKey.set(`${f.nx},${f.ny},${KEY(f.x, f.y)}`, f);

  const runs = [];
  const used = new Set();
  for (const f of faces) {
    const id = `${f.nx},${f.ny},${KEY(f.x, f.y)}`;
    if (used.has(id)) continue;
    // A face whose normal is on x travels along y, and vice versa.
    const axis = f.nx !== 0 ? 'y' : 'x';
    const step = axis === 'x' ? [1, 0] : [0, 1];
    const cells = [f];
    used.add(id);
    if (!f.arcId) {
      for (let dir = 1; dir >= -1; dir -= 2) {
        let cx = f.x, cy = f.y;
        for (;;) {
          cx += step[0] * dir; cy += step[1] * dir;
          const nid = `${f.nx},${f.ny},${KEY(cx, cy)}`;
          const nf = byKey.get(nid);
          if (!nf || used.has(nid) || !joinable(f, nf)) break;
          used.add(nid);
          if (dir > 0) cells.push(nf); else cells.unshift(nf);
        }
      }
    }
    const coords = cells.map((c) => (axis === 'x' ? c.x : c.y));
    runs.push({
      nx: f.nx, ny: f.ny, axis,
      along: axis === 'x' ? f.y : f.x,
      from: Math.min(...coords), to: Math.max(...coords) + 1,
      cells,
      floor: f.floor, zone: f.zone, material: f.material,
      renderGroup: f.renderGroup, arcId: f.arcId,
    });
  }
  return runs;
}

// THE SHAPE THE BAKED SKIRTING IS A FUNCTION OF.
//
// Baseboards are generated from these runs at build time, and the floorplan is
// edited constantly — sometimes by somebody else working in parallel. Baked
// geometry that no longer matches its wall is the exact bug this module was
// written to end, so the pack records a digest of this and a test fails when it
// has moved on. Kept here, next to the runs, so the builder and the guard cannot
// drift apart by computing it two different ways.
//
// Returns a stable string; the caller hashes it (node's crypto in the builder).
export function wallRunsDigest(runs) {
  return JSON.stringify(runs.map((r) => [
    r.nx, r.ny, r.axis, r.along, r.from, r.to,
    Number(r.floor.toFixed(4)), r.material, r.renderGroup, r.arcId,
  ]));
}

// A prop's yaw takes its LOCAL +z to world (-sin yaw, cos yaw) — the convention
// the whole prop pack is built to (see the van's doors). To face out of a wall
// along the outward normal, solve that for the normal.
export function yawFromNormal(nx, ny) {
  return Math.atan2(-nx, ny);
}

/**
 * The nearest wall face to a point, for standing something against it.
 *
 * `x,y` are logical cells and may be fractional. Returns null when there is no
 * wall within the search radius — the caller decides what that means, because
 * silently snapping to a wall four rooms away is worse than not snapping.
 */
export function wallContactAt(plan, x, y, { searchCells = WALL_CONTACT.SEARCH_CELLS, cellMetres = WALL_CONTACT.CELL_METRES, prefer = null } = {}) {
  const p = reader(plan);
  const cx = Math.floor(x), cy = Math.floor(y);
  let best = null;
  for (let oy = -searchCells; oy <= searchCells; oy++) {
    for (let ox = -searchCells; ox <= searchCells; ox++) {
      const gx = cx + ox, gy = cy + oy;
      if (!inside(p, gx, gy) || p.isSolid(gx, gy)) continue;
      for (const [dx, dy] of STEPS) {
        if (!facesWall(p, gx, gy, dx, dy)) continue;
        // The plane of the face, in logical cells: the boundary between this
        // cell and the solid one, not the centre of either.
        const planeX = dx === 0 ? null : gx + (dx > 0 ? 1 : 0);
        const planeY = dy === 0 ? null : gy + (dy > 0 ? 1 : 0);
        // Distance from the point to that plane, and the point's offset ALONG it.
        const dist = planeX !== null ? Math.abs(x - planeX) : Math.abs(y - planeY);
        const along = planeX !== null ? y - (gy + 0.5) : x - (gx + 0.5);
        if (Math.abs(along) > 0.5) continue;          // not in front of this face
        const nx = -dx || 0, ny = -dy || 0;
        if (prefer && (prefer.nx !== nx || prefer.ny !== ny)) continue;
        if (best && dist >= best.cells) continue;
        best = {
          nx, ny, cells: dist, gap: dist * cellMetres,
          planeX, planeY,
          yaw: yawFromNormal(nx, ny),
          cell: { x: gx, y: gy },
          floor: p.floorAt(gx, gy),
        };
      }
    }
  }
  return best;
}

/**
 * Where a prop of a given half-depth should stand to be flat against that wall,
 * in logical cells. `halfDepth` is metres from the prop's centre to its back.
 *
 * Idempotent by construction: it solves for a position from the wall PLANE, so
 * running it on an already-snapped prop returns the same answer rather than
 * walking it further into the wall each time.
 */
export function snapToWall(contact, { halfDepth = 0, cellMetres = WALL_CONTACT.CELL_METRES } = {}) {
  if (!contact) return null;
  const backOff = halfDepth / cellMetres;
  const x = contact.planeX !== null ? contact.planeX + contact.nx * backOff : null;
  const y = contact.planeY !== null ? contact.planeY + contact.ny * backOff : null;
  return { x, y, yaw: contact.yaw, nx: contact.nx, ny: contact.ny };
}
