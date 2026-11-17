// THE SEATS STAND ON THE RAKE THE PLAYER WALKS.
//
// The seating mesh used to carry its own rake (1.55m rows rising .45) while
// hallGroundProfile terraces the bowl in two-metre treads rising .44. The two
// disagreed by up to three-quarters of a metre: the front rows sank into the
// floor and the back rows hung in the air. This module is the seating's only
// geometry source. It restates hallGroundProfile's terrace and aisle rules, and
// test/hall-mesh-alignment.spec.mjs checks every row against the compiled plan,
// so a re-raked bowl fails a test instead of drifting.
//
// Mesh-local metres: origin at the prop anchor (authored 113,23), +z toward the
// rear, y = 0 at the front of the house. The placement in conservatory-props.js
// puts that y = 0 at HALL_SEATING.house in world metres.

// Mirrors hallGroundProfile in floorplan/conservatory.js.
const HALL_ORIGIN = Object.freeze({ x: 98, y: 4 });
const TERRACE = Object.freeze({ firstLocalY: 8, depth: 2, rise: .44, count: 12 });
const AISLES_LOCAL_X = Object.freeze([[1, 4], [13, 16], [25, 28]]);

// The two transverse gangways props.js keeps clear in the seating collision:
// the cross-over (|z - 1| < .85) and the strip before the first row (z < -7.7).
// Its outer bound is |z| <= 9.25. A row whose seat leaves that band is not drawn,
// because the player could walk through it.
const COLLISION = Object.freeze({ crossCentre: 1, crossHalf: .85, frontEdge: -7.7, rear: 9.25 });

const PITCH = .72, SEAT_DEPTH = .54;
// Two rows share each two-metre tread, a metre apart, facing the stage at -z.
// Their centres sit this far behind the tread's front; the rear row's back
// clears the next riser by .16m and each row keeps about half a metre of knee
// room. (Koerner's 1,135 seats need the bowl at this density.)
const ROW_SET_BACKS = Object.freeze([.6, 1.6]);

export const HALL_SEATING = (() => {
  const anchor = Object.freeze({ x: 113, y: 23 });
  const toLocalX = (hallX) => HALL_ORIGIN.x + hallX - anchor.x;
  const toLocalZ = (hallY) => HALL_ORIGIN.y + hallY - anchor.y;
  // Seat blocks are the spans between aisles, in local metres.
  const blocks = [];
  for (let i = 0; i < AISLES_LOCAL_X.length - 1; i++) {
    blocks.push([toLocalX(AISLES_LOCAL_X[i][1] + 1), toLocalX(AISLES_LOCAL_X[i + 1][0])]);
  }
  const seatXs = blocks.flatMap(([a, b]) => {
    const xs = []; for (let x = a + PITCH / 2; x <= b - PITCH / 2 + 1e-6; x += PITCH) xs.push(+x.toFixed(3));
    return xs;
  });
  const terraces = [];
  for (let t = 0; t < TERRACE.count; t++) {
    const front = toLocalZ(TERRACE.firstLocalY + t * TERRACE.depth);
    const top = +(t * TERRACE.rise).toFixed(3);
    const seatZs = ROW_SET_BACKS.map((back) => front + back).filter((seatZ) => {
      const lo = seatZ - SEAT_DEPTH / 2, hi = seatZ + SEAT_DEPTH / 2;
      return lo >= COLLISION.frontEdge && hi <= COLLISION.rear
        && !(hi > COLLISION.crossCentre - COLLISION.crossHalf && lo < COLLISION.crossCentre + COLLISION.crossHalf);
    });
    terraces.push(Object.freeze({ terrace: t, front, depth: TERRACE.depth, top, seatZs: Object.freeze(seatZs) }));
  }
  // The terrace masses stop short of the side walls: the public garden takes the
  // west shoulder up to a wall at hall x3 in the front rows (balconyRows and the
  // garden hall clip), and the plan renderer draws every floor under the arms.
  const width = [toLocalX(4), toLocalX(27)];
  return Object.freeze({
    anchor, house: -2.5, pitch: PITCH, seatDepth: SEAT_DEPTH, width: Object.freeze(width),
    blocks: Object.freeze(blocks.map((b) => Object.freeze(b))), seatXs: Object.freeze(seatXs),
    terraces: Object.freeze(terraces),
    seatCount: seatXs.length * terraces.reduce((n, t) => n + t.seatZs.length, 0),
  });
})();

// THE BALCONIES ARE SEATED TOO.
//
// Koerner seats 1,135 across stalls and two tiers. Ours held its whole audience
// in the stalls, so the balconies read as empty shelves and the room was
// acoustically empty for its 14,700 m3. Seats go only where a player is not
// needed: each arm keeps its two wall-side metres as the walkway hall-tiers
// walks (and the upper east arm's galleria flight lands on), the arms' rear six
// metres stay open where they meet the rear cross aisle and band, the upper
// band keeps a front cross aisle and the stalls' centre aisle, and the
// presence's four authored seats (HALL_UPPER_SEATS) are never covered.
//
// Positions are physical metres (an authored cell k spans [k, k+1)); heights are
// world metres. Logical cells are the balcony drawings' own (lower y40+,
// upper y82+), which is what the collision is keyed on.
const BALCONY = Object.freeze({
  lower: Object.freeze({ logicalY: 40, base: 4.0, rear: false }),
  upper: Object.freeze({ logicalY: 82, base: 7.5, rear: true }),
});
// Mirrors balconyCascade in floorplan/conservatory.js.
const cascade = (base, localY) => base - Math.min(4, Math.max(0, Math.floor((36 - localY) / 6))) * .44;
const ARM_TIERS = Object.freeze([[8, 13], [13, 19], [19, 25], [25, 31]]);
// Rail-side row first. West seats face +x (yaw pi/2), east seats -x (-pi/2).
const ARM_ROWS = Object.freeze([
  Object.freeze({ side: 'west', localX: 4, x: .6, yaw: Math.PI / 2 }),
  Object.freeze({ side: 'west', localX: 3, x: .6, yaw: Math.PI / 2 }),
  Object.freeze({ side: 'east', localX: 25, x: .4, yaw: -Math.PI / 2 }),
  Object.freeze({ side: 'east', localX: 26, x: .4, yaw: -Math.PI / 2 }),
]);
const BAND_ROWS = Object.freeze([33.4, 34.3, 35.2, 36.1]);
const BAND_BLOCKS = Object.freeze([[5, 13], [17, 25]]);
// HALL_UPPER_SEATS in main.js, as upper-drawing local cells.
const PRESENCE_CELLS = Object.freeze([[4, 17], [14, 32], [28, 17], [28, 32]]);

export const HALL_BALCONY_SEATING = (() => {
  const seats = [], blocked = new Set();
  const cellsUnder = (x0, x1, z0, z1) => {
    const out = [];
    for (let cx = Math.floor(x0); cx < Math.ceil(x1); cx++) for (let cz = Math.floor(z0); cz < Math.ceil(z1); cz++) out.push([cx, cz]);
    return out;
  };
  const place = (deck, spec, seat) => {
    const half = SEAT_DEPTH / 2;
    const cells = cellsUnder(seat.x - half, seat.x + half, seat.z - half, seat.z + half)
      .map(([cx, cz]) => [cx - HALL_ORIGIN.x, cz - HALL_ORIGIN.y]);
    if (deck === 'upper' && cells.some(([lx, ly]) => PRESENCE_CELLS.some(([px, py]) => px === lx && py === ly))) return;
    seats.push(Object.freeze({ deck, ...seat }));
    for (const [lx, ly] of cells) blocked.add(`${lx},${spec.logicalY + ly}`);
  };
  for (const [deck, spec] of Object.entries(BALCONY)) {
    for (const row of ARM_ROWS) for (const [from, to] of ARM_TIERS) {
      for (let ly = from + PITCH / 2; ly <= to - PITCH / 2 + 1e-6; ly += PITCH) {
        place(deck, spec, { x: HALL_ORIGIN.x + row.localX + row.x, z: +(HALL_ORIGIN.y + ly).toFixed(3),
          y: +cascade(spec.base, Math.floor(ly)).toFixed(3), yaw: row.yaw, part: `${row.side}-arm` });
      }
    }
    if (!spec.rear) continue;
    for (const ly of BAND_ROWS) for (const [from, to] of BAND_BLOCKS) {
      for (let lx = from + PITCH / 2; lx <= to - PITCH / 2 + 1e-6; lx += PITCH) {
        place(deck, spec, { x: +(HALL_ORIGIN.x + lx).toFixed(3), z: HALL_ORIGIN.y + ly, y: spec.base, yaw: 0, part: 'rear-band' });
      }
    }
  }
  // The prop stands on the upper band, behind its seats; its pose sits at world
  // zero so the mesh carries absolute heights like the stalls' structure does.
  const anchor = Object.freeze({ logical: Object.freeze({ x: 20, y: BALCONY.upper.logicalY + 34 }),
    physical: Object.freeze({ x: HALL_ORIGIN.x + 20, z: HALL_ORIGIN.y + 34 }), floor: BALCONY.upper.base });
  return Object.freeze({ anchor, pitch: PITCH, seatDepth: SEAT_DEPTH, seats: Object.freeze(seats),
    blockedCells: blocked, presenceCells: PRESENCE_CELLS, seatCount: seats.length,
    totalWithStalls: seats.length + HALL_SEATING.seatCount });
})();
