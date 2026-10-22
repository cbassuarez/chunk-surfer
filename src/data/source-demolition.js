// One recognizable copy stands just beyond the get-in's real FOH threshold.
// Physical metres start at that portal: along points into the first nothingness,
// across is relative to its centre. No support or collision is added.
const freeze = Object.freeze;
export const SOURCE_DEMOLITION = freeze({
  version: 2,
  sequenceId: 'source-demolition:first-shore-v2',
  mesh: 'conservatory_west_elevation',
  along: 30,
  across: 12,
  floor: 0,
  yaw: Math.PI / 2,
  nearFrom: -18,
  preloadFrom: -18,
  nearTo: 70,
  commitmentAt: 1.25,
  commitmentHalfWidth: .28,
  duration: 18,
  maxTick: .1,
  maxAcceptedStep: 2,
  releaseFrom: 3.15,
  releaseTo: 9,
  frontReach: 35,
  fillReadyAt: 4.8,
  occupancyBeat: .65,
  pocket: freeze({ from: 8, to: 38, halfWidth: 18 }),
});

// Static acoustic stations belong to the facade, never to the current camera.
// Z is negative along, matching the Source matrix convention. Main applies
// the actual doorway's world origin; the height is already absolute metres.
const anchor = (x, y, along) => freeze({ x, y, z: -along });
export const SOURCE_DEMOLITION_ANCHORS = freeze({
  building: anchor(12, 0, 30),
  strain: anchor(1.95, 4.2, 30),
  infill: anchor(15.75, 4, 30.3),
  course: anchor(8.55, 12, 31),
  roof: anchor(12, 24, 31),
  release: anchor(12, 5.4, 30.6),
  pocket: anchor(0, 0, 23),
});

export const SOURCE_DEMOLITION_CUES = freeze([
  freeze({ type: 'infill', at: 1, gain: .76 }),
  freeze({ type: 'release', at: 3.15, gain: .78 }),
  freeze({ type: 'course', at: 3.2, gain: .9 }),
  freeze({ type: 'roof', at: 7.5, gain: 1 }),
]);

export const SOURCE_DEMOLITION_INTENT = freeze({
  recognition: 'A familiar building stands impossibly close beyond the room just left.',
  cause: 'Independent structural courses fail and release held human residues from inside.',
  agency: 'Stopping or retreating outside the dark region can preserve a view of the event.',
  nothingness: 'Bodies consume the first few paces of this same shore; the long walk and receiving lift remain ahead.',
  checks: freeze([
    'No observer turn moves the building, spirit origins or structural pieces.',
    'The real passable exit commits the event; opening the leaf, looking, loading or warping cannot.',
    'A finite nearby world region becomes black only after bodies fill it; leaving restores ordinary sight.',
    'The same floor, body pose, encounter receipts and onward route survive.',
    'No health, battery, recording, route choice, pursuit or fall penalty is introduced.',
  ]),
});
