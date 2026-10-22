// A service that has failed to end. The people are light/pressure residues,
// never residents, opponents, interaction targets or another recording event.
// Positions are AUTHORED metres, beside the existing 1908 pews; the centre
// aisle, inner screen, chancel step and both tower thresholds keep their use.
export const CHAPEL_DRESSING_ASSET = 'assets/chapel-dressing.glb';
export const CHAPEL_DRESSING_PREFIX = 'chapel-dressing:';
export const CHAPEL_DRESSING_MESH = Object.freeze({
  seated: 'chapel_presence_seated',
  bowed: 'chapel_presence_bowed',
  kneeling: 'chapel_presence_kneeling',
  celebrant: 'chapel_presence_celebrant',
  acolyte: 'chapel_presence_acolyte',
  writing: 'chapel_writing_stop',
  overwritten: 'chapel_writing_overwritten',
  empty: 'chapel_writing_empty',
  hands: 'chapel_wall_hand_traces',
  drag: 'chapel_floor_drag',
  votive: 'chapel_wax_hair_votive',
});

const M = CHAPEL_DRESSING_MESH;
const freeze = value => Object.freeze(value);

// One held Eucharistic prayer, not a crowd of unrelated idle animations.
// The building gives us a British collegiate chapel, an altar and 1908 fixtures;
// it does not establish a denomination or a present-day rite. The visual
// grammar is shared western liturgy: prayer toward the altar, a vested
// celebrant with extended hands, and two kneeling servers. No spoken service,
// named clergy, sacred objects to collect or invented institutional history.
export const CHAPEL_MASS = freeze({
  moment: 'held-eucharistic-prayer',
  totalPresences: 48, congregants: 45, celebrants: 1, acolytes: 2,
  orientation: 'toward-existing-altar',
  altar: freeze({ x: 92.5, y: 88.8 }),
  celebrant: freeze({ x: 92.5, y: 88.05, yaw: Math.PI }),
  // The organ console crowds the altar's rear, so the north working station
  // faces the altar. Nobody is squeezed into that 385mm rear gap.
  acolytes: freeze([
    freeze({ x: 90.75, y: 88.25, yaw: Math.PI }),
    freeze({ x: 94.35, y: 88.25, yaw: Math.PI }),
  ]),
});

// Deliberate empty places and unequal shoulders keep it a service rather than
// a picket fence. Nine people remain seated; the others kneel in the clear row
// gaps. Hands and heads differ by a few centimetres without breaking the held
// common prayer. Every survivor keeps the SAME world station forever.
const seatedPlaces = freeze([1, 7, 16, 25, 30, 37, 40, 47, 50]);
const servicePlaces = freeze([43, 48, 53]);
export const CHAPEL_CONGREGATION = freeze(
  [...[62, 65, 68, 71, 74, 77, 80, 83, 86].flatMap((y, row) =>
    [89, 96].flatMap((x, bank) => [-.82, 0, .82].flatMap((offset, seat) => {
      const index = row * 6 + bank * 3 + seat;
      if ([4, 12, 23, 31, 42, 51, ...servicePlaces].includes(index)) return [];
      const kneeling = !seatedPlaces.includes(index);
      return [freeze({
        id: `${CHAPEL_DRESSING_PREFIX}presence-${index}`,
        mesh: kneeling ? M.kneeling : (index % 2 ? M.bowed : M.seated),
        x: x + offset, y: y + (kneeling ? .95 : -.045),
        yaw: Math.PI + ((index % 5) - 2) * .018,
        scale: .95 + (index % 4) * .025,
        kind: 'presence', role: 'congregant', posture: kneeling ? 'kneeling-prayer' : 'seated-prayer', row, bank, seat,
      })];
    }))),
    freeze({ id: `${CHAPEL_DRESSING_PREFIX}celebrant`, mesh: M.celebrant,
      ...CHAPEL_MASS.celebrant, scale: 1, kind: 'presence', role: 'celebrant', posture: 'orans' }),
    ...CHAPEL_MASS.acolytes.map((at, index) => freeze({
      id: `${CHAPEL_DRESSING_PREFIX}acolyte-${index}`, mesh: M.acolyte,
      ...at, scale: index ? .96 : 1.015, kind: 'presence', role: 'acolyte', posture: 'kneeling-prayer',
    })),
  ],
);

// Three hands: the large exhausted statement; a patient repetition below it;
// the institution's "empty room" description worked over until it is a stain.
// Human reach is the datum. Nothing spells a password, grants a collectible,
// implies a click target or consumes a recording.
const writing = (id, mesh, x, y, nx, ny, elevation, scale = 1) => freeze({
  id: `${CHAPEL_DRESSING_PREFIX}${id}`, mesh, x, y, elevation, scale,
  mount: 'wall', mountNormal: freeze({ nx, ny }), kind: 'writing',
});
const floor = (id, mesh, x, y, yaw = 0, scale = 1, elevation = .009) => freeze({
  id: `${CHAPEL_DRESSING_PREFIX}${id}`, mesh, x, y, yaw, scale, elevation, kind: 'trace',
});
export const CHAPEL_DRESSING = freeze([
  writing('writing-west-entry', M.writing, 87, 65, 1, 0, 1.25, .80),
  writing('writing-east-entry', M.overwritten, 98.5, 64.8, -1, 0, .94, .88),
  writing('writing-west-first', M.empty, 87, 70.8, 1, 0, 1.45, 1.0),
  writing('writing-west-middle', M.overwritten, 87, 76.7, 1, 0, .86, 1.14),
  writing('writing-west-long', M.writing, 87, 82.0, 1, 0, 1.55, 1.05),
  writing('writing-east-first', M.writing, 98.5, 70.8, -1, 0, 1.15, .91),
  writing('writing-east-middle', M.empty, 98.5, 76.9, -1, 0, 1.75, 1.05),
  writing('writing-east-last', M.overwritten, 98.5, 83.4, -1, 0, .92, .95),
  writing('hands-west-a', M.hands, 87, 73.6, 1, 0, .62, 1.15),
  writing('hands-west-b', M.hands, 87, 85.5, 1, 0, .57, .93),
  writing('hands-east-a', M.hands, 98.5, 73.6, -1, 0, .72, 1.0),
  writing('hands-east-b', M.hands, 98.5, 80.0, -1, 0, .50, 1.08),
  // Traces stop at the pew ends. They do not paint a trail down the walkable
  // centre, nor borrow the ear room's recognisable anatomical floor material.
  ...[65, 71, 77, 83, 86].flatMap((y, row) => [89, 96].map((x, bank) =>
    floor(`drag-${row}-${bank}`, M.drag, x, y - .72, (bank ? -.1 : .12) + row * .04, .72 + row * .055))),
  // Spent tallow, hair embedded in its cooled run, singed cloth wicks. These
  // remain small offerings beside the ALTAR rather than a second focal object
  // on top of the ritual's existing central table or monitor.
  floor('votive-west', M.votive, 88.65, 89.95, .16, 1.15),
  floor('votive-east', M.votive, 96.45, 89.35, -.4, .93),
  floor('votive-west-pew', M.votive, 88.00, 80.35, .85, .72),
  floor('votive-east-pew', M.votive, 97.05, 74.3, -.45, .68),
]);

export const CHAPEL_DRESSING_BUDGET = freeze({
  presences: 48, dressing: 26, meshes: 11,
  packedTriangles: 24000, packBytes: 1800000,
  // Instanced anatomical poses, not 48 unique draw calls. No light or shadow
  // map is added by this treatment; all ink belongs to the existing renderer.
  additionalLights: 0, additionalShadowMaps: 0, maxPresenceDistance: 34,
});
