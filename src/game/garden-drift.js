// The atrium garden changes as authored arrangements, not as random noise.
// Each pose stays inside the broad authored planter footprint so the visual
// movement remains compatible with the conservative static navigation mask.

export const GARDEN_UNOBSERVED_MS = 12_000;
export const GARDEN_NOTICE_RATE = .32;

const pose = (dx, dz, dyaw) => Object.freeze({ dx, dz, dyaw });

export const GARDEN_LAYOUTS = Object.freeze([
  Object.freeze({
    id: 'original',
    poses: Object.freeze({
      'academic-garden-planter-west': pose(0, 0, 0),
      'academic-garden-planter-east': pose(0, 0, 0),
      'academic-garden-tree-west': pose(0, 0, 0),
      'academic-garden-tree-east': pose(0, 0, 0),
      'academic-garden-leaves-north': pose(0, 0, 0),
      'academic-garden-leaves-south': pose(0, 0, 0),
    }),
  }),
  Object.freeze({
    id: 'crossed-passage',
    poses: Object.freeze({
      'academic-garden-planter-west': pose(1.55, 1.05, .98),
      'academic-garden-planter-east': pose(-1.65, -.95, -1.04),
      'academic-garden-tree-west': pose(1.55, 1.05, 1.25),
      'academic-garden-tree-east': pose(-1.65, -.95, -1.28),
      'academic-garden-leaves-north': pose(2.20, 1.18, 1.06),
      'academic-garden-leaves-south': pose(-2.05, -1.20, -1.14),
    }),
  }),
  Object.freeze({
    id: 'facing-basin',
    poses: Object.freeze({
      'academic-garden-planter-west': pose(1.05, 1.75, 1.32),
      'academic-garden-planter-east': pose(-1.18, -1.65, -1.25),
      'academic-garden-tree-west': pose(1.05, 1.75, 1.54),
      'academic-garden-tree-east': pose(-1.18, -1.65, -1.48),
      'academic-garden-leaves-north': pose(-1.82, 1.85, -1.34),
      'academic-garden-leaves-south': pose(1.96, -1.72, 1.28),
    }),
  }),
  Object.freeze({
    id: 'open-aisle',
    poses: Object.freeze({
      'academic-garden-planter-west': pose(-1.35, 1.55, -.72),
      'academic-garden-planter-east': pose(1.35, -1.45, .78),
      'academic-garden-tree-west': pose(-1.35, 1.55, -1.02),
      'academic-garden-tree-east': pose(1.35, -1.45, 1.06),
      'academic-garden-leaves-north': pose(2.28, -.82, 1.42),
      'academic-garden-leaves-south': pose(-2.18, .90, -1.36),
    }),
  }),
]);

export function gardenLayoutForEpoch(epoch = 0) {
  const index = ((Math.floor(Number(epoch) || 0) % GARDEN_LAYOUTS.length) + GARDEN_LAYOUTS.length) % GARDEN_LAYOUTS.length;
  return GARDEN_LAYOUTS[index];
}

export function gardenRecallForLayout(layoutId = 'original') {
  switch (layoutId) {
    case 'crossed-passage':
      return 'The planters made a crooked passage to the basin last time I was in here. I could have sworn they did.';
    case 'facing-basin':
      return 'Both dead trees were turned in toward the basin last time I was in here. I could have sworn they were.';
    case 'open-aisle':
      return 'There was a clean aisle between the planters last time I was in here. I could have sworn there was.';
    default:
      return 'The west planter was square beneath the broken skylight last time I was in here. I could have sworn it was.';
  }
}

// A rearrangement and the player consciously clocking it are separate events.
// Most changes should sit in memory as unease, not open a line every time the
// atrium is crossed.
export function shouldNoticeGardenShift(epoch = 0, random = null) {
  // Runtime cadence is deterministic so this ambient beat cannot perturb the
  // global random stream used by HUSH, combat, or authored scare selection.
  // The optional roll is only for a focused boundary test.
  const roll = typeof random === 'function'
    ? Number(random())
    : (((Math.abs(Math.floor(Number(epoch) || 0)) * 7 + 3) % 19) / 19);
  return Number.isFinite(roll) && roll < GARDEN_NOTICE_RATE;
}

export function createGardenWatchState() {
  return Object.freeze({
    inside: false,
    hasSeen: false,
    leftAt: null,
    shiftedWhileAway: false,
  });
}

export function tickGardenWatch(state, { inside = false, now = 0 } = {}) {
  const previous = state || createGardenWatchState();
  const at = Number.isFinite(Number(now)) ? Number(now) : 0;
  if (inside) {
    const shouldRecall = !previous.inside && previous.hasSeen && previous.shiftedWhileAway;
    return {
      state: Object.freeze({
        inside: true,
        hasSeen: true,
        leftAt: null,
        shiftedWhileAway: false,
      }),
      shouldShift: false,
      shouldRecall,
    };
  }
  if (previous.inside) {
    return {
      state: Object.freeze({
        inside: false,
        hasSeen: previous.hasSeen,
        leftAt: at,
        shiftedWhileAway: false,
      }),
      shouldShift: false,
      shouldRecall: false,
    };
  }
  if (!previous.hasSeen || previous.shiftedWhileAway || previous.leftAt == null) {
    return { state: previous, shouldShift: false, shouldRecall: false };
  }
  if (at - previous.leftAt < GARDEN_UNOBSERVED_MS) {
    return { state: previous, shouldShift: false, shouldRecall: false };
  }
  return {
    state: Object.freeze({ ...previous, shiftedWhileAway: true }),
    shouldShift: true,
    shouldRecall: false,
  };
}
