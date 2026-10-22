import { PUBLIC_SANITARY_CORE, PUBLIC_SANITARY_PARTITIONS, POOL_WASH_PARTITIONS } from '../../src/data/building-amenities.js';

// Authored staff appliance, in metres; the separate flex retains its existing
// landing. Reuse the counter's subdued materials and keep every curved part
// explicit so the spout remains hollow and the handle leaves real finger room.
export function buildStaffCounterKettle({ m, MAT, enamel, nickel, inner, addBox, addBeam, addEllipsoid, addQuad }) {
  const origin = [.13, .9425, -.01], segments = 32;
  const at = ([x, y, z]) => [origin[0] + x, origin[1] + y, origin[2] + z];
  const radial = (r, y, a) => at([r * Math.cos(a), y, r * Math.sin(a)]);
  const revolved = (profile, mat, opening = false) => {
    for (let j = 1; j < profile.length; j += 1) {
      const [r0, y0] = profile[j - 1], [r1, y1] = profile[j];
      for (let i = 0; i < segments; i += 1) {
        const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
        // The spout root overlaps this small genuine opening in the shoulder.
        if (opening && y0 >= .164 && y1 <= .199 && Math.cos((a + b) / 2) < -.985) continue;
        addQuad(m, radial(r0, y0, a), radial(r1, y1, a), radial(r1, y1, b), radial(r0, y0, b), mat);
      }
    }
  };
  // A swept round section in the XY plane. Its frame follows the curve rather
  // than joining a row of cylinders; the end of a hollow sweep has only a rim.
  const swept = (path, radii, mat, wall = 0) => {
    const frames = path.map((p, i) => {
      const before = path[Math.max(0, i - 1)], after = path[Math.min(path.length - 1, i + 1)];
      const dx = after[0] - before[0], dy = after[1] - before[1], length = Math.hypot(dx, dy);
      return [-dy / length, dx / length];
    });
    const point = (j, a, inside = false) => {
      const p = path[j], r = radii[j] - (inside ? wall : 0), [nx, ny] = frames[j];
      return at([p[0] + nx * r * Math.cos(a), p[1] + ny * r * Math.cos(a), r * Math.sin(a)]);
    };
    for (let j = 1; j < path.length; j += 1) for (let i = 0; i < 16; i += 1) {
      const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
      addQuad(m, point(j - 1, a), point(j - 1, b), point(j, b), point(j, a), mat);
      if (wall) addQuad(m, point(j - 1, a, true), point(j, a, true), point(j, b, true), point(j - 1, b, true), inner);
    }
    if (wall) {
      const end = path.length - 1;
      for (let i = 0; i < 16; i += 1) {
        const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
        addQuad(m, point(end, a), point(end, b), point(end, b, true), point(end, a, true), nickel);
      }
    }
  };
  // Low rolled metal foot seats exactly on the existing .9425m worktop.
  revolved([[.091, 0], [.098, .002], [.101, .006], [.100, .010], [.096, .014]], nickel);
  revolved([[.094, .012], [.104, .026], [.110, .060], [.110, .104], [.103, .164], [.091, .199], [.076, .218], [.067, .223]], enamel, true);
  // A narrow neck seam, removable domed lid and separate cool-touch knob.
  revolved([[.067, .222], [.069, .224], [.069, .226]], MAT.black);
  revolved([[.070, .226], [.071, .229], [.066, .234], [.047, .243], [.014, .248]], nickel);
  addEllipsoid(m, at([0, .262, 0]), [.018, .018, .018], MAT.black, 8, 16);
  // A short rising pour, tapering from its shoulder socket to a 26mm bore.
  // No end cap or dark disc fills the mouth; its inner wall supplies the depth.
  swept([[-.084, .160], [-.104, .177], [-.132, .202], [-.158, .220], [-.181, .228]],
    [.027, .025, .022, .019, .0165], enamel, .0035);
  // Rounded C handle: two attached heels, a generous hollow grip and a small
  // unlit rocker low on the heel. Its ends enter the body, not floating beside it.
  swept([[.084, .199], [.112, .211], [.151, .208], [.177, .183], [.184, .136], [.177, .083], [.148, .054], [.101, .049]],
    [.012, .012, .013, .013, .013, .013, .012, .012], MAT.black);
  addBox(m, at([.112, .041, 0]), [.021, .010, .018], MAT.black);
  // The existing flex begins here; this small gland closes the base-to-flex joint.
  addBeam(m, [.184, .955, -.091], [.19, .95, -.10], .012, MAT.black);
  // Two small losses in the enamel, rather than a decorative overall dirt wash.
  for (const [a, y, da, dy] of [[1.82, .058, .018, .003], [2.07, .092, .012, .004]]) {
    addQuad(m, radial(.1103, y, a), radial(.1103, y + dy, a), radial(.1103, y + dy, a + da), radial(.1103, y, a + da), nickel);
  }
}

// A small later-fit metal sink, seated in the counter's real worktop opening.
// Keep its old footprint and service junctions, but leave the bowl/drain open
// and show a continuous return below the exposed underside.
export function buildStaffCounterSink({ m, MAT, nickel, inner, addBox, addBeam, addCylinder, addQuad }) {
  for (const z of [-.190, .190]) addBox(m, [-.59, .9475, z], [.60, .010, .050], nickel);
  for (const x of [-.865, -.315]) addBox(m, [x, .9475, 0], [.050, .010, .330], nickel);
  const top = [[-.84, .9525, -.165], [-.34, .9525, -.165], [-.34, .9525, .165], [-.84, .9525, .165]];
  const low = [[-.77, .7825, -.105], [-.41, .7825, -.105], [-.41, .7825, .105], [-.77, .7825, .105]];
  const outerTop = [[-.842, .9445, -.167], [-.338, .9445, -.167], [-.338, .9445, .167], [-.842, .9445, .167]];
  const outerLow = [[-.772, .7795, -.107], [-.408, .7795, -.107], [-.408, .7795, .107], [-.772, .7795, .107]];
  const hole = [[-.608, .7775, -.018], [-.572, .7775, -.018], [-.572, .7775, .018], [-.608, .7775, .018]];
  const underHole = hole.map(([x, y, z]) => [x, y - .003, z]);
  for (let i = 0; i < 4; i += 1) {
    const next = (i + 1) % 4;
    addQuad(m, top[i], low[i], low[next], top[next], nickel);
    addQuad(m, outerTop[i], outerTop[next], outerLow[next], outerLow[i], nickel);
    // The floor falls toward an opening, rather than spanning it with a box.
    addQuad(m, low[i], hole[i], hole[next], low[next], nickel);
    addQuad(m, outerLow[i], outerLow[next], underHole[next], underHole[i], nickel);
  }
  const drain = (r, y, a) => [-.59 + r * Math.cos(a), y, r * Math.sin(a)];
  for (let i = 0; i < 16; i += 1) {
    const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
    // A rolled circular flange covers the construction opening. The 28mm
    // centre is a real bore, lined down to the connected tailpiece.
    addQuad(m, drain(.028, .7805, a), drain(.014, .7805, a), drain(.014, .7805, b), drain(.028, .7805, b), nickel);
    addQuad(m, drain(.014, .7805, a), drain(.014, .755, a), drain(.014, .755, b), drain(.014, .7805, b), inner);
    addQuad(m, drain(.028, .7805, a), drain(.028, .7805, b), drain(.028, .7735, b), drain(.028, .7735, a), nickel);
    addQuad(m, drain(.028, .7735, a), drain(.028, .7735, b), drain(.022, .7735, b), drain(.022, .7735, a), nickel);
    addQuad(m, drain(.022, .7735, a), drain(.022, .7735, b), drain(.022, .755, b), drain(.022, .755, a), nickel);
  }
  // Preserve the existing tap's main stem and reach; its short downturned
  // outlet and mechanical lever distinguish it from an unexplained pipe.
  addCylinder(m, [-.59, 1.06, -.20], .018, .22, nickel, 10);
  addBeam(m, [-.59, 1.16, -.20], [-.59, 1.16, -.06], .029, nickel);
  addBeam(m, [-.59, 1.16, -.06], [-.59, 1.125, -.06], .029, nickel);
  addCylinder(m, [-.59, 1.1245, -.06], .0085, .001, inner, 10);
  addBox(m, [-.55, 1.077, -.20], [.09, .012, .025], nickel);
  // Round-section P trap. Its low centre is 95mm below the unchanged outlet;
  // the return rises before turning into the separate wall-service mesh.
  const path = [[-.59, .755, 0], [-.59, .5425, 0]];
  for (let i = 1; i <= 8; i += 1) {
    const a = i * Math.PI / 8;
    path.push([-.59, .5425 - .0475 * Math.sin(a), -.0475 + .0475 * Math.cos(a)]);
  }
  path.push([-.59, .56, -.095]);
  for (let i = 1; i <= 4; i += 1) {
    const a = i * Math.PI / 8;
    path.push([-.59, .56 + .03 * Math.sin(a), -.125 + .03 * Math.cos(a)]);
  }
  path.push([-.59, .59, -.19]);
  const frames = path.map((p, i) => {
    const before = path[Math.max(0, i - 1)], after = path[Math.min(path.length - 1, i + 1)];
    const dy = after[1] - before[1], dz = after[2] - before[2], length = Math.hypot(dy, dz);
    return [-dz / length, dy / length];
  });
  const pipe = (i, a) => [path[i][0] + .022 * Math.cos(a), path[i][1] + .022 * frames[i][0] * Math.sin(a), path[i][2] + .022 * frames[i][1] * Math.sin(a)];
  for (let j = 1; j < path.length; j += 1) for (let i = 0; i < 12; i += 1) {
    const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6;
    addQuad(m, pipe(j - 1, a), pipe(j, a), pipe(j, b), pipe(j - 1, b), nickel);
  }
  // These starts match the two actual service mesh pipes after the counter's
  // +pi/2 placement; they no longer stop short of the underside of the tap.
  for (const [x, y] of [[-.70, .72], [-.50, .82]]) {
    addBeam(m, [x, y, -.30], [x, y, -.20], .017, nickel);
    addBeam(m, [x, y, -.20], [x, .93, -.20], .017, nickel);
    addBeam(m, [x, .93, -.20], [-.59, .95, -.20], .017, nickel);
    addBox(m, [x, y + .035, -.20], [.032, .045, .030], nickel);
  }
}

// Small project-authored fixtures. Open bowls, plumbing and separate functional
// parts replace the usual solid-box shorthand; all dimensions are metres.
export function buildBuildingAmenities({ mesh, materials, MAT, addBox, addBeam, addEllipsoid, addCylinder, addQuad }) {
  const material = (name, rgb, metallic = 0, roughness = .8) => {
    const id = materials.length;
    materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: metallic, roughnessFactor: roughness } });
    return id;
  };
  const porcelain = material('amenity old warm porcelain', [.64, .66, .58], .01, .36);
  const inner = material('amenity dark bowl drain', [.025, .035, .033], 0, .85);
  const nickel = material('amenity dulled nickel plumbing', [.34, .37, .34], .78, .56);
  const tile = material('amenity municipal green tile', [.24, .35, .29], .01, .48);
  const plaster = material('amenity old cream distemper', [.47, .47, .39], 0, .94);
  const grout = material('amenity stained grout', [.14, .18, .15], 0, .95);
  const mop = material('amenity dry mop cotton', [.28, .29, .24], 0, 1);
  const mirror = material('amenity tarnished mirror face', [.24, .29, .28], .70, .31);
  const enamel = material('amenity pale kettle enamel', [.50, .53, .43], .10, .58);
  const ox = PUBLIC_SANITARY_CORE.anchor.x, oz = PUBLIC_SANITARY_CORE.anchor.y;
  const wallDimensions = (p) => [p.width <= .5 ? .14 : p.width, p.depth <= .5 ? .14 : p.depth];
  const wall = (m, p, ax, az) => {
    const [w, d] = wallDimensions(p), x = p.x - ax, z = p.y - az;
    addBox(m, [x, p.height / 2, z], [w, p.height, d], plaster);
    addBox(m, [x, .70, z], [w + .009, 1.40, d + .009], tile);
    addBox(m, [x, .085, z], [w + .018, .17, d + .018], MAT.poolBlue);
    addBox(m, [x, 1.405, z], [w + .018, .045, d + .018], porcelain);
    for (const y of [.35, .70, 1.05]) addBox(m, [x, y, z], [w + .011, .006, d + .011], grout);
  };
  {
    const m = mesh('amenity_public_core_shell');
    for (const p of PUBLIC_SANITARY_PARTITIONS) wall(m, p, ox, oz);
    // The shared existing steel frame ends at x79.83; this short return meets
    // the thin divider face at79.93 instead of leaving a 100mm slit beside it.
    addBox(m, [79.88 - ox, 1.70, 24.75 - oz], [.16, 3.40, .14], plaster);
    addBox(m, [79.88 - ox, .70, 24.75 - oz], [.17, 1.40, .15], tile);
    addBox(m, [0, 3.46, 0], [7, .08, 3.5], plaster);
    // A visible boxed drain/soil stack ends at the service ceiling. It is a
    // plumbing route, not an unexplained freestanding pipe in the aisle.
    addBox(m, [-3.07, 1.6, 1.32], [.22, 3.2, .22], plaster);
    addBox(m, [-2.951, .62, 1.32], [.018, .39, .20], nickel);
    for (const dx of [-.10, .10]) addBox(m, [-2.937, .62 + dx, 1.32], [.006, .025, .07], MAT.steel);
    const local = (x, y, z) => [x - ox, y, z - oz];
    // Ordinary dead practicals belong to this purpose-built enclosure; generic
    // wall-fixture discovery sees no DDA wall at these thin mesh partitions.
    const bulkhead = (x, z, side = -1, y = 2.35) => {
      addBox(m, local(x, y, z), [.055, .31, .23], nickel);
      addBox(m, local(x + side * .037, y, z), [.04, .24, .17], porcelain);
      for (const dz of [-.075, .075]) addBeam(m, local(x + side * .065, y - .135, z + dz), local(x + side * .065, y + .135, z + dz), .012, nickel);
      for (const dy of [-.12, .12]) addBeam(m, local(x + side * .065, y + dy, z - .09), local(x + side * .065, y + dy, z + .09), .012, nickel);
    };
    bulkhead(81.65, 24.75); bulkhead(75.35, 24.65, 1); bulkhead(79.90, 25.75, -1, 2.40);
    addBox(m, local(81.65, 1.15, 24.20), [.035, .13, .085], porcelain);
    addBox(m, local(81.626, 1.15, 24.20), [.012, .045, .025], nickel);
    addBox(m, local(77.55, 1.15, 23.845), [.085, .13, .035], porcelain);
    addBox(m, local(77.55, 1.15, 23.869), [.025, .045, .012], nickel);
    addBox(m, local(79.90, 1.15, 25.40), [.035, .13, .085], porcelain);
    addBox(m, local(79.876, 1.15, 25.40), [.012, .045, .025], nickel);
    addBox(m, local(80.75, 2.80, 26.65), [.52, .35, .05], nickel);
    addBox(m, local(80.75, 2.80, 26.615), [.46, .28, .025], inner);
    for (const dy of [-.10, -.05, 0, .05, .10]) addBox(m, local(80.75, 2.80 + dy, 26.595), [.43, .012, .018], nickel);
    addBox(m, local(80.75, 3.08, 26.52), [.20, .38, .16], nickel);
    addBox(m, local(80.75, 3.20, 26.65), [.20, .16, .30], nickel);
    // Transfer face into the same high-level service route from the large WC.
    addBox(m, local(78.168, 2.85, 26.05), [.018, .22, .38], inner);
    for (const dy of [-.075, -.025, .025, .075]) addBox(m, local(78.15, 2.85 + dy, 26.05), [.018, .012, .34], nickel);
  }
  {
    const m = mesh('amenity_pool_wash_screens');
    for (const p of POOL_WASH_PARTITIONS) wall(m, p, 72.25, 30.25);
    for (const z of [-.75, .75]) {
      addBox(m, [0, 2.215, z], [2.57, .045, .18], porcelain);
      for (const x of [-1.10, 1.10]) addCylinder(m, [x, .10, z], .04, .20, nickel, 8);
    }
  }
  const ring = (m, { y, rx, rz, ix, iz, cy = 0, mat = porcelain, segments = 16 }) => {
    for (let i = 0; i < segments; i += 1) {
      const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
      addQuad(m, [rx * Math.cos(a), y, cy + rz * Math.sin(a)], [ix * Math.cos(a), y, cy + iz * Math.sin(a)],
        [ix * Math.cos(b), y, cy + iz * Math.sin(b)], [rx * Math.cos(b), y, cy + rz * Math.sin(b)], mat);
    }
  };
  {
    const m = mesh('amenity_toilet');
    addBox(m, [0, .14, -.10], [.25, .28, .33], porcelain);
    addBox(m, [0, .77, -.28], [.44, .36, .17], porcelain);
    addBox(m, [0, .966, -.28], [.47, .035, .19], porcelain);
    addBox(m, [.23, .83, -.27], [.065, .025, .025], nickel);
    // Open bowl: exterior, concave interior and a separate seat. There is no
    // white solid ellipsoid under the dark opening to fill it back in.
    for (let i = 0; i < 16; i += 1) {
      const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
      const point = (t, y, rx, rz) => [rx * Math.cos(t), y, .025 + rz * Math.sin(t)];
      addQuad(m, point(a, .43, .24, .34), point(b, .43, .24, .34), point(b, .25, .14, .21), point(a, .25, .14, .21), porcelain);
      addQuad(m, point(a, .43, .17, .26), point(a, .31, .10, .17), point(b, .31, .10, .17), point(b, .43, .17, .26), porcelain);
    }
    ring(m, { y: .433, rx: .24, rz: .34, ix: .17, iz: .26, cy: .025 });
    ring(m, { y: .452, rx: .245, rz: .345, ix: .165, iz: .252, cy: .025, mat: MAT.black });
    addEllipsoid(m, [0, .306, .025], [.10, .008, .17], inner, 4, 12);
    for (const x of [-.115, .115]) addBox(m, [x, .46, -.235], [.035, .018, .06], nickel);
    addBeam(m, [0, .59, -.28], [0, .42, -.18], .055, nickel);
    addBeam(m, [.12, .14, -.31], [.12, .52, -.31], .018, nickel);
    addBox(m, [.12, .28, -.32], [.09, .035, .028], nickel);
  }
  {
    const m = mesh('amenity_washbasin');
    // Four raised rim sides and four sloping bowl faces leave an actual bowl.
    addBox(m, [0, .835, -.196], [.56, .08, .045], porcelain);
    addBox(m, [0, .835, .196], [.56, .08, .045], porcelain);
    for (const x of [-.26, .26]) addBox(m, [x, .835, 0], [.045, .08, .36], porcelain);
    const top = [[-.235, .85, -.17], [.235, .85, -.17], [.235, .85, .17], [-.235, .85, .17]];
    const low = [[-.14, .73, -.09], [.14, .73, -.09], [.14, .73, .09], [-.14, .73, .09]];
    for (let i = 0; i < 4; i += 1) addQuad(m, top[i], low[i], low[(i + 1) % 4], top[(i + 1) % 4], porcelain);
    addBox(m, [0, .724, 0], [.28, .012, .18], porcelain);
    addCylinder(m, [0, .734, 0], .019, .004, inner, 12);
    addCylinder(m, [0, .94, -.18], .018, .18, nickel, 10);
    addBeam(m, [0, 1.025, -.18], [0, 1.025, -.07], .032, nickel);
    addBeam(m, [0, 1.025, -.07], [0, 1.00, -.055], .028, nickel);
    for (const x of [-.12, .12]) { addCylinder(m, [x, .91, -.18], .017, .09, nickel, 8); addBox(m, [x, .96, -.18], [.06, .012, .022], nickel); }
    addBeam(m, [0, .72, 0], [0, .51, 0], .048, nickel);
    addBeam(m, [0, .51, 0], [0, .51, -.16], .048, nickel);
    addBeam(m, [0, .51, -.16], [0, .68, -.16], .048, nickel);
    for (const x of [-.17, .17]) addBeam(m, [x, .77, -.18], [x, .70, .10], .028, nickel);
  }
  {
    const m = mesh('amenity_mirror_soap');
    addBox(m, [0, .45, 0], [.62, .72, .028], nickel);
    addBox(m, [0, .45, .018], [.55, .65, .012], mirror);
    addBox(m, [.19, .03, .055], [.13, .13, .10], porcelain);
    addBox(m, [.19, -.04, .072], [.045, .028, .035], nickel);
    addBox(m, [-.18, .02, .050], [.18, .08, .09], nickel);
    addBox(m, [-.18, .065, .055], [.13, .018, .055], MAT.paper);
    for (const x of [-.28, .28]) addBox(m, [x, .78, .020], [.012, .018, .008], MAT.steel);
  }
  {
    const m = mesh('amenity_grab_rail');
    addBeam(m, [-.34, .47, .06], [.34, .47, .06], .034, nickel);
    addBeam(m, [-.34, .47, .06], [-.34, .84, .06], .034, nickel);
    for (const x of [-.34, .34]) { addBeam(m, [x, .47, .06], [x, .47, 0], .03, nickel); addBox(m, [x, .47, -.008], [.075, .075, .018], nickel); }
  }
  {
    const m = mesh('amenity_paper_holder');
    addBox(m, [0, 0, 0], [.19, .15, .018], nickel);
    addBox(m, [0, .03, .05], [.14, .09, .08], MAT.ivory);
    addBox(m, [0, -.05, .08], [.12, .065, .006], MAT.paper);
    for (const x of [-.08, .08]) addBox(m, [x, .015, .05], [.018, .10, .095], nickel);
  }
  {
    const m = mesh('amenity_hook_rail');
    addBox(m, [0, 0, 0], [.72, .09, .025], MAT.wood);
    for (const x of [-.25, 0, .25]) { addBeam(m, [x, 0, .02], [x, -.025, .085], .025, nickel); addBeam(m, [x, -.025, .085], [x, .035, .09], .025, nickel); }
  }
  {
    const m = mesh('amenity_floor_drain');
    addBox(m, [0, .009, 0], [.24, .018, .24], nickel);
    addBox(m, [0, .019, 0], [.20, .002, .20], inner);
    for (let x = -.08; x <= .081; x += .04) addBox(m, [x, .022, 0], [.012, .004, .20], nickel);
  }
  {
    const m = mesh('amenity_shower_column');
    addBox(m, [0, 1.07, 0], [.15, 2.14, .035], tile);
    addCylinder(m, [0, 1.25, .045], .018, 1.65, nickel, 10);
    addBeam(m, [0, 2.07, .045], [0, 2.07, .29], .035, nickel);
    addBeam(m, [0, 2.07, .29], [0, 2.01, .33], .034, nickel);
    addEllipsoid(m, [0, 1.99, .33], [.085, .028, .085], nickel, 6, 12);
    addBox(m, [0, 1.09, .075], [.14, .055, .04], nickel);
    for (const x of [-.055, .055]) addBox(m, [x, 1.09, .10], [.025, .08, .025], MAT.ivory);
    addBox(m, [.125, 1.30, .065], [.12, .035, .12], nickel);
    addBox(m, [.125, 1.33, .065], [.08, .025, .055], MAT.paper);
    for (const y of [.55, 1.70]) addBox(m, [0, y, .03], [.075, .035, .035], nickel);
  }
  {
    const m = mesh('amenity_cleaner_cupboard');
    for (const x of [-.41, .41]) addBox(m, [x, 1.02, 0], [.04, 2.04, .46], MAT.wood);
    addBox(m, [0, 1.02, -.22], [.82, 2.04, .03], MAT.wood);
    for (const y of [.04, 1.18, 1.65, 2.025]) addBox(m, [0, y, 0], [.86, .035, .48], MAT.wood);
    addBox(m, [-.18, 1.40, 0], [.20, .29, .18], MAT.agedWhite);
    addCylinder(m, [.18, 1.29, 0], .065, .18, MAT.steel, 10);
    addBox(m, [.10, 1.78, -.02], [.42, .15, .28], mop);
    // Open enamel slop sink in the former bucket bay. The right-hand mop and
    // upper stores stay clear; the washing point shares this core's wet zone.
    const top = [[-.335, .55, -.15], [.055, .55, -.15], [.055, .55, .15], [-.335, .55, .15]];
    const low = [[-.30, .32, -.10], [.02, .32, -.10], [.02, .32, .10], [-.30, .32, .10]];
    const outerTop = [[-.37, .53, -.18], [.09, .53, -.18], [.09, .53, .18], [-.37, .53, .18]];
    const outerLow = [[-.315, .29, -.115], [.035, .29, -.115], [.035, .29, .115], [-.315, .29, .115]];
    for (let i = 0; i < 4; i += 1) {
      const next = (i + 1) % 4;
      addQuad(m, top[i], low[i], low[next], top[next], MAT.agedWhite);
      addQuad(m, outerTop[i], outerTop[next], outerLow[next], outerLow[i], MAT.agedWhite);
    }
    for (const z of [-.17, .17]) addBox(m, [-.14, .53, z], [.46, .055, .035], MAT.agedWhite);
    for (const x of [-.3525, .0725]) addBox(m, [x, .53, 0], [.035, .055, .305], MAT.agedWhite);
    addBox(m, [-.14, .314, 0], [.32, .012, .20], MAT.agedWhite);
    addCylinder(m, [-.14, .321, 0], .028, .006, nickel, 12);
    addCylinder(m, [-.14, .325, 0], .020, .004, inner, 12);
    // Trap turns upward before reaching the back waste, which drops through
    // the cabinet plinth to the floor service route rather than ending in air.
    const waste = [[-.14, .305, 0], [-.14, .18, 0], [-.14, .18, -.13], [-.14, .25, -.13], [-.14, .25, -.19], [-.14, 0, -.19]];
    for (let i = 1; i < waste.length; i += 1) addBeam(m, waste[i - 1], waste[i], .040, nickel);
    for (const x of [-.28, 0]) {
      addBeam(m, [x, 0, -.19], [x, .73, -.19], .017, nickel);
      addBeam(m, [x, .69, -.205], [x, .69, -.15], .025, nickel);
      addBox(m, [x, .74, -.15], [.065, .014, .025], nickel);
      addBeam(m, [x, .69, -.15], [x, .69, -.08], .025, nickel);
    }
    addBeam(m, [-.28, .69, -.08], [0, .69, -.08], .026, nickel);
    addBeam(m, [-.14, .69, -.08], [-.14, .77, -.08], .026, nickel);
    addBeam(m, [-.14, .77, -.08], [-.14, .77, .015], .026, nickel);
    addBeam(m, [-.14, .77, .015], [-.14, .72, .015], .025, nickel);
    addBeam(m, [.23, .08, .07], [.30, 1.74, -.08], .025, MAT.wood);
    for (const dx of [-.10, -.05, 0, .05, .10]) addBeam(m, [.23, .11, .07], [.23 + dx, .025, .10], .026, mop);
    // A narrow door left against its return exposes ordinary contents.
    addBox(m, [.44, 1.02, .23], [.045, 2.04, .44], MAT.agedWhite);
    addBox(m, [.466, .99, .32], [.018, .11, .025], nickel);
  }
  {
    const m = mesh('amenity_staff_counter');
    for (const x of [-.97, .97]) addBox(m, [x, .45, 0], [.05, .90, .56], tile);
    addBox(m, [0, .08, 0], [2, .16, .56], tile);
    addBox(m, [.40, .47, .27], [1.10, .68, .03], MAT.agedWhite);
    for (const x of [.13, .67]) addBox(m, [x, .70, .292], [.16, .025, .014], nickel);
    // Four pieces leave the actual .54 x .37m sink cutout. The kettle and all
    // dry work still rest on the original .9425m top plane.
    addBox(m, [-.93, .91, 0], [.14, .065, .60], MAT.wood);
    addBox(m, [.34, .91, 0], [1.32, .065, .60], MAT.wood);
    for (const z of [-.2425, .2425]) addBox(m, [-.59, .91, z], [.54, .065, .115], MAT.wood);
    addBox(m, [0, 1.13, -.282], [2, .40, .035], tile);
    buildStaffCounterSink({ m, MAT, nickel, inner, addBox, addBeam, addCylinder, addQuad });
    // Kettle and the first length of flex toward the actual wall connection.
    // The outlet belongs to the separate service mesh, on the real partition.
    buildStaffCounterKettle({ m, MAT, enamel, nickel, inner, addBox, addBeam, addEllipsoid, addQuad });
    addBeam(m, [.19, .95, -.10], [.34, .95, -.24], .009, MAT.black);
    for (const [x, z, color] of [[.50, .07, MAT.ivory], [.74, -.04, MAT.poolBlue], [.81, .17, enamel]]) {
      for (let i = 0; i < 12; i += 1) {
        const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6;
        addQuad(m, [x + .055 * Math.cos(a), .95, z + .055 * Math.sin(a)], [x + .055 * Math.cos(a), 1.06, z + .055 * Math.sin(a)],
          [x + .055 * Math.cos(b), 1.06, z + .055 * Math.sin(b)], [x + .055 * Math.cos(b), .95, z + .055 * Math.sin(b)], color);
        addQuad(m, [x + .055 * Math.cos(a), 1.06, z + .055 * Math.sin(a)], [x + .043 * Math.cos(a), 1.06, z + .043 * Math.sin(a)],
          [x + .043 * Math.cos(b), 1.06, z + .043 * Math.sin(b)], [x + .055 * Math.cos(b), 1.06, z + .055 * Math.sin(b)], color);
      }
      addCylinder(m, [x, .951, z], .043, .003, inner, 12);
      addBox(m, [x + .072, 1.005, z], [.035, .055, .025], color);
    }
    addBox(m, [-.10, .95, .22], [.25, .013, .12], mop);
    addBox(m, [.64, 1.05, -.21], [.16, .18, .13], MAT.paper);
    addBox(m, [.64, 1.15, -.21], [.17, .025, .14], MAT.steel);
    // A small bag and folded cardigan claim the shelf without blocking work.
    addBox(m, [.48, .25, -.04], [.40, .16, .31], MAT.cloth);
    addBox(m, [.77, .27, -.06], [.30, .19, .27], MAT.navy);
  }
  {
    // Unrotated logical anchor18.5,271.0; the actual east wall begins atx19.
    // Low plumbing reaches that masonry, and the high socket is fixed to it.
    // The approved 2×0.6m counter itself stays exactly in its original box.
    const m = mesh('amenity_staff_service_connections');
    addBeam(m, [-.01, .59, -.19], [.52, .59, -.19], .044, nickel);
    for (const [z, y] of [[-.30, .72], [-.10, .82]]) {
      addBeam(m, [.10, y, z], [.515, y, z], .017, nickel);
      addBox(m, [.492, y, z], [.035, .055, .055], nickel);
    }
    addBox(m, [.32, .51, -.20], [.32, .88, .24], plaster);
    addBox(m, [.145, .51, -.20], [.025, .78, .20], MAT.agedWhite);
    for (const y of [.16, .86]) addBox(m, [.128, y, -.20], [.006, .018, .045], nickel);
    addBox(m, [.4875, 1.35, .74], [.025, .14, .14], MAT.agedWhite);
    for (const z of [.71, .77]) for (const y of [1.34, 1.37]) addBox(m, [.472, y, z], [.004, .016, .012], inner);
    const lead = [[.04, .95, .74], [.18, .92, .74], [.36, .93, .74], [.46, 1.00, .74], [.46, 1.31, .74]];
    for (let i = 1; i < lead.length; i += 1) addBeam(m, lead[i - 1], lead[i], .009, MAT.black);
    addBox(m, [.45, 1.31, .74], [.05, .06, .04], MAT.black);
    addBox(m, [.494, 1.35, .802], [.004, .035, .012], MAT.agedWhite);
  }
  {
    // Public drinking point, distinct from the WC basins. Local -Z is the
    // wall. Offset the fixture within its air-cell anchor so its back meets97.
    const m = mesh('amenity_public_drinking_fountain'), shifted = (p) => [p[0], p[1], p[2] - .28];
    const box = (c, s, mat) => addBox(m, shifted(c), s, mat);
    const beam = (a, b, w, mat) => addBeam(m, shifted(a), shifted(b), w, mat);
    box([0, 1.02, -.2075], [.56, .40, .025], nickel);
    box([0, .68, -.08], [.34, .28, .24], porcelain);
    box([0, .90, -.175], [.52, .05, .05], nickel);
    box([0, .90, .175], [.52, .05, .05], nickel);
    for (const x of [-.235, .235]) box([x, .90, 0], [.05, .05, .30], nickel);
    const top = [[-.21, .91, -.15], [.21, .91, -.15], [.21, .91, .15], [-.21, .91, .15]];
    const low = [[-.12, .81, -.06], [.12, .81, -.06], [.12, .81, .06], [-.12, .81, .06]];
    for (let i = 0; i < 4; i += 1) addQuad(m, shifted(top[i]), shifted(low[i]), shifted(low[(i + 1) % 4]), shifted(top[(i + 1) % 4]), nickel);
    box([0, .803, 0], [.24, .014, .12], nickel);
    addCylinder(m, shifted([0, .813, 0]), .017, .004, inner, 10);
    beam([.15, .925, -.03], [.15, .98, -.03], .026, nickel);
    beam([.15, .98, -.03], [.10, .995, -.03], .020, nickel);
    box([0, .80, .193], [.11, .055, .035], nickel);
    box([0, .80, .216], [.072, .028, .014], MAT.steel);
    beam([0, .80, 0], [0, .45, 0], .045, nickel);
    beam([0, .45, 0], [0, .45, -.22], .045, nickel);
    beam([-.13, .54, -.21], [-.13, .81, -.21], .018, nickel);
    box([-.13, .62, -.20], [.07, .025, .03], nickel);
    for (const x of [-.18, .18]) beam([x, .62, -.20], [x, .85, .08], .032, nickel);
  }
  {
    // A shallow staff bay south of the reception doorway. Back at local-.50
    // reaches the actualx19 partition from the open-air anchor18.5.
    const m = mesh('amenity_staff_coat_lockers');
    addBox(m, [0, 1.02, -.49], [1.40, 1.92, .02], tile);
    for (const x of [-.68, 0, .68]) addBox(m, [x, 1.02, -.32], [.035, 1.92, .36], tile);
    for (const y of [.075, 1.965]) addBox(m, [0, y, -.32], [1.40, .03, .36], tile);
    addBox(m, [.34, 1.02, -.13], [.62, 1.84, .025], MAT.agedWhite);
    addBox(m, [.12, 1.04, -.108], [.035, .16, .025], nickel);
    for (const x of [.18, .27, .36, .45, .54]) addBox(m, [x, 1.75, -.114], [.035, .055, .006], inner);
    addBox(m, [-.34, 1.72, -.31], [.60, .025, .34], tile);
    addBox(m, [-.34, .29, -.31], [.60, .025, .34], tile);
    addBeam(m, [-.56, 1.60, -.36], [-.12, 1.60, -.36], .025, nickel);
    addBeam(m, [-.34, 1.59, -.36], [-.34, 1.47, -.30], .018, nickel);
    addBox(m, [-.34, 1.43, -.29], [.44, .14, .16], MAT.navy);
    addBox(m, [-.34, 1.12, -.27], [.35, .60, .14], MAT.navy);
    addBox(m, [-.34, 1.82, -.30], [.39, .14, .26], MAT.cloth);
    for (const x of [-.45, -.24]) addBox(m, [x, .19, -.27], [.13, .12, .25], MAT.black);
  }
}
