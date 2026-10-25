// A service that has failed to end. The people are light/pressure residues,
// never residents, opponents, interaction targets or another recording event.
// Positions are AUTHORED metres, beside the existing 1908 pews; the centre
// aisle, inner screen, chancel step and both tower thresholds keep their use.
export const CHAPEL_DRESSING_ASSET = 'assets/chapel-dressing.glb';
export const CHAPEL_DRESSING_PREFIX = 'chapel-dressing:';
// A congregant is drawn in three rigid parts so it can turn toward you: legs
// that stay in the pew, an upper body that twists about the pelvis, and a head
// that turns about the neck (see game/chapel-apparitions.js). The celebrant
// and the servers keep their robes on one body. Ceiling bodies cling.
export const CHAPEL_DRESSING_MESH = Object.freeze({
  seatedLower: 'chapel_presence_seated_lower', seatedUpper: 'chapel_presence_seated_upper',
  bowedLower: 'chapel_presence_bowed_lower', bowedUpper: 'chapel_presence_bowed_upper',
  kneelingLower: 'chapel_presence_kneeling_lower', kneelingUpper: 'chapel_presence_kneeling_upper',
  celebrant: 'chapel_presence_celebrant',
  acolyte: 'chapel_presence_acolyte',
  head: 'chapel_presence_head',
  // Choir-only articulated face; the original pressure head remains the
  // watcher/ceiling pose when the ordinary service is not audible.
  singingHead: 'chapel_presence_singing_head',
  singingJaw: 'chapel_presence_singing_jaw',
  clinging: 'chapel_presence_clinging',
  cherub: 'chapel_presence_cherub',
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
      const figure = kneeling ? 'kneeling' : (index % 2 ? 'bowed' : 'seated');
      return [freeze({
        id: `${CHAPEL_DRESSING_PREFIX}presence-${index}`,
        mesh: M[`${figure}Lower`], figure,
        x: x + offset, y: y + (kneeling ? .95 : -.045),
        yaw: Math.PI + ((index % 5) - 2) * .018,
        scale: .95 + (index % 4) * .025,
        kind: 'presence', role: 'congregant', posture: kneeling ? 'kneeling-prayer' : 'seated-prayer', row, bank, seat,
      })];
    }))),
    freeze({ id: `${CHAPEL_DRESSING_PREFIX}celebrant`, mesh: M.celebrant, figure: 'celebrant',
      ...CHAPEL_MASS.celebrant, scale: 1, kind: 'presence', role: 'celebrant', posture: 'orans' }),
    ...CHAPEL_MASS.acolytes.map((at, index) => freeze({
      id: `${CHAPEL_DRESSING_PREFIX}acolyte-${index}`, mesh: M.acolyte, figure: 'acolyte',
      ...at, scale: index ? .96 : 1.015, kind: 'presence', role: 'acolyte', posture: 'kneeling-prayer',
    })),
  ],
);

// THE CEILING. Bodies flat to the stone, crawling, heads turned down to you.
// Most cling to the low ceiling under the west gallery (8.45 m, over the
// middle pews and the aisle) and two to the narthex ceiling you walk in under;
// three are up in the vault over the altar, where the nave opens to 17.8 m.
// AUTHORED metres; `surface` names the kind of ceiling: a `flat` one is read
// from the plan, the `vault` is the chapel_vault prop's pitched shells.
const ceiling = (id, x, y, surface, heading) => freeze({
  id: `${CHAPEL_DRESSING_PREFIX}ceiling-${id}`, mesh: M.clinging, figure: 'clinging',
  x, y, surface, heading, scale: .97, kind: 'presence', role: 'ceiling', posture: 'clinging',
});
const cherub = (id, x, y, surface, heading, scale) => freeze({
  id: `${CHAPEL_DRESSING_PREFIX}ceiling-${id}`, mesh: M.cherub, figure: 'cherub',
  x, y, surface, heading, scale, kind: 'presence', role: 'ceiling', posture: 'cramped-winged',
  // Visual inhabitants, never six additional watchers or recorder-noise sources.
  presentationOnly: true,
});
export const CHAPEL_CEILING = freeze([
  ceiling('loft-a', 89.6, 69.5, 'flat', .4), ceiling('loft-b', 95.2, 71.8, 'flat', 2.6),
  ceiling('loft-c', 91.0, 74.6, 'flat', -1.2), ceiling('loft-d', 94.4, 77.9, 'flat', .9),
  ceiling('loft-e', 89.2, 79.8, 'flat', -2.4),
  ceiling('vault-altar-w', 90.4, 83.6, 'vault', 1.7), ceiling('vault-altar-e', 95.0, 86.2, 'vault', -1.4),
  ceiling('vault-altar', 91.4, 89.9, 'vault', 3.0),
  ceiling('narthex-e', 94.6, 61.5, 'flat', -.3), ceiling('narthex-w', 90.1, 64.2, 'flat', 2.2),
  // Two unequal nests: just above the arrival, and in the altar vault.
  cherub('cherub-entry-a', 91.65, 62.35, 'flat', -.55, .93),
  cherub('cherub-entry-b', 92.95, 63.15, 'flat', 1.85, .81),
  cherub('cherub-entry-c', 94.10, 62.75, 'flat', -2.5, .88),
  cherub('cherub-altar-a', 91.65, 85.25, 'vault', .35, 1.02),
  cherub('cherub-altar-b', 93.20, 85.85, 'vault', -1.65, .90),
  cherub('cherub-altar-c', 92.70, 87.40, 'vault', 2.65, .83),
]);
// The vault is the chapel_vault prop's two pitched shells (build-props.mjs):
// 9.5 m at the walls to 13 m at the ridge, measured from the floor under the
// prop's own anchor (it does not follow the chancel step), ridge on x 92.5.
export const CHAPEL_CEILINGS = freeze({
  vault: freeze({ anchor: freeze({ x: 92.5, y: 75.5 }), ridgeX: 92.5, halfSpan: 6, wall: 9.5, ridge: 13 }),
});

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
  presences: 48, ceiling: 16, dressing: 26, meshes: 19,
  packedTriangles: 30000, packBytes: 1800000,
  // Instanced anatomical poses, not 48 unique draw calls. No light or shadow
  // map is added by this treatment; all ink belongs to the existing renderer.
  additionalLights: 0, additionalShadowMaps: 0, maxPresenceDistance: 34,
});
