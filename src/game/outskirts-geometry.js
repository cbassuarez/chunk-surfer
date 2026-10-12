// Explicit horizontal collision for the first outskirts. All rectangles are in
// prop-local metres; the caller applies the SAME yaw/translation as rendering
// and expands them by the body radius. [] is an intentional passable result,
// not a request to fall back to the full prop bounds.
const rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
const box = (x, z, width, depth) => rect(x - width / 2, x + width / 2, z - depth / 2, z + depth / 2);
const floorDecoration = /^(?:wet_footprint|loose_note|ending_recorder|ending_headphones|soft_bag|speaker_cabinet|walkie_radio|draped_coat)|(?:_interior|_practicals|_glazing|_timetable|_hatch|_phone|_kettle|_ledger|_signed|_cord|_handset|_lamp)$|^yard_booth_handoff$/;

export const OUTSKIRTS_BODY_RADIUS = 0.25;

function footprint(bounds) {
  if (!bounds?.min || !bounds?.max) return null;
  const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
  if (![x0, y0, z0, x1, y1, z1].every(Number.isFinite)) return null;
  return rect(x0, x1, z0, z1);
}

export function outskirtsCollisionBoxes(piece, bounds = null) {
  if (!piece || piece.collision === 'none' || piece.payphone) return [];
  if (Array.isArray(piece.collision)) return piece.collision.map((entry) => ({ ...entry }));
  const mesh = String(piece.mesh || '');
  if (floorDecoration.test(mesh) || /^(?:yard_road|outskirts_road|yard_markings)$/.test(mesh)) return [];
  // A horizontal paper sheet, rain glint or ground decal cannot become a wall
  // merely because the body's collision code is two-dimensional.
  if (bounds?.max?.[1] - bounds?.min?.[1] <= 0.08) return [];
  if (piece.unfinished) {
    const b = footprint(bounds);
    if (!b) return [];
    // The horizontal bottom beams are a low step. Only the four surviving
    // vertical corner posts obstruct the body; the former room volume does not.
    return [b.minX, b.maxX].flatMap((x) => [b.minZ, b.maxZ].map((z) => box(x, z, 0.14, 0.14)));
  }
  if (piece.lamp || mesh === 'yard_lamp_column') return [box(0, 0, 0.22, 0.22)];
  if (mesh === 'outskirts_boundary_wall_6') return [box(0, 0, 0.32, 6)];
  if (mesh === 'outskirts_boundary_rail_6') return [box(0, 0, 0.12, 6)];
  if (mesh === 'outskirts_hedge_run_6') return [box(0, 0, 0.60, 6)];
  if (mesh === 'outskirts_bus_funnel_west') return [box(0, 0, 0.12, 6.9)];
  if (mesh === 'outskirts_bus_funnel_east') return [box(0, 0, 0.12, 5.2)];
  if (mesh === 'outskirts_bus') return [
    box(1.165, 0, 0.12, 9.2), // closed far side
    box(-1.165, -4.15, 0.12, 0.90), box(-1.165, 1.0, 0.12, 7.20), // entry gap -3.70..-2.60
    box(0, -4.54, 2.45, 0.12), box(0, 4.54, 2.45, 0.12), // windscreen and rear
    ...Array.from({ length: 7 }, (_, row) => [-0.77, 0.77].map((x) => rect(x - 0.375, x + 0.375, -2.10 + row * 0.88 - 0.335, -2.10 + row * 0.88 + 0.355))).flat(),
    rect(0.40, 0.96, -3.67, -3.05), // driver seat
    rect(-0.45, -0.15, -4.04, -3.76), // fare box
  ];
  if (mesh === 'ambient_late_bus') return [box(0, 0, 2.45, 9.2)];
  if (mesh === 'outskirts_bus_door') return [box(0, 0.55, 0.08, 1.10)];
  if (mesh === 'outskirts_shelter' || mesh === 'city_bus_shelter') return [
    box(-1.22, 0, 0.12, 4.4), // rear screen
    box(0, -2.24, 2.4, 0.12), box(0, 2.24, 2.4, 0.12), // end screens
    box(-0.73, 0, 0.52, 3.2), // bench, leaving the open front usable
    box(1.20, -2.20, 0.12, 0.12), box(1.20, 2.20, 0.12, 0.12),
  ];
  if (mesh === 'outskirts_lodge' || mesh === 'yard_booth') return [
    box(-1.42, 0, 0.18, 2.60), box(1.42, 0, 0.18, 2.60),
    box(0, 1.21, 3.02, 0.18), box(0, -1.21, 3.02, 0.18),
    rect(-1.39, 0.43, -1.64, -1.18), // projecting hatch counter
  ];
  if (mesh === 'yard_gate_piers') return [
    box(0, -2.65, 0.78, 0.86), box(0, 2.65, 0.78, 0.86),
    // Rail wings exist as railings, not an invisible slab across the opening.
    box(0.13, -4.60, 0.32, 4.0), box(0.13, 4.60, 0.32, 4.0),
  ];
  if (mesh === 'yard_van') return [
    box(0, -2.57, 2.02, 1.92), // cab and bulkhead
    box(-1.0, 0.35, 0.10, 4.20), box(1.0, 0.35, 0.10, 4.20), // cargo sides
    box(0, 1.42, 1.70, 0.96), // real shelf: a lean-in target, not a walk-through van
  ];
  if (mesh === 'district_post_box') return [box(0, 0, 0.72, 0.72)];
  if (mesh === 'district_bin_cluster') return [box(-0.42, 0, 0.72, 0.72), box(0.42, 0.12, 0.72, 0.72)];
  if (mesh === 'district_bench') return [box(0, 0.05, 2.0, 0.48)];
  if (mesh === 'city_parked_car') return [box(0, 0, 1.84, 4.3)];
  if (mesh === 'outskirts_car') return [box(0, 0, 2.06, 4.50)];
  if (/^(?:outskirts_(?:bus_woman|guard|stranger)|exterior_bus_woman|yard_booth_guard_idle)$/.test(mesh)) {
    const b = footprint(bounds);
    return [box(b ? (b.minX + b.maxX) / 2 : 0, b ? (b.minZ + b.maxZ) / 2 : 0, 0.38, 0.34)];
  }
  const b = footprint(bounds);
  return b ? [b] : [];
}

// Useful to collision callers and route tests. The point is in prop-local space.
export function outskirtsPointBlocked(boxes, x, z, radius = OUTSKIRTS_BODY_RADIUS) {
  return boxes.some((b) => x >= b.minX - radius && x <= b.maxX + radius
    && z >= b.minZ - radius && z <= b.maxZ + radius);
}
