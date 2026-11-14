const views = [
  { name: 'store-frontage', stop: [-20, 53, .38], target: [-16.96, 1.78, 57.0] },
  { name: 'commons-crossfall', stop: [-20, 53, .38], target: [-15.65, .15, 54.35] },
  { name: 'roof-and-eaves', stop: [-16.1, 52.6, .38], target: [-16.65, 2.79, 56.8] },
  { name: 'downpipe-and-outfall', stop: [-12.9, 54.45, .38], target: [-14.04, .29, 56.13] },
  { name: 'wall-and-plinth-return', stop: [-12.55, 58.8, .38], target: [-13.70, .75, 58.8] },
];
const westApproach = [[0, 12], [-8.5, 13], [-15, 15], [-23, 18], [-24, 22], [-24, 29],
  [-29, 39], [-28, 49], [-25, 52]];
const angleDifference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export async function reviewValleyConstruction({
  page, check, shot, hold, sleep, lookWorld, snapshot, waitFor, walkHome, report, entryYaw,
  samplePerformance, constructionPass, baseline, baselinePath,
}) {
  const before = await snapshot();
  const entry = before.realm.frame;
  check('construction review is inside the real childhood valley',
    entry?.home?.eligible && entry.stage === 'inside', entry?.pose);
  const evidence = { pass: constructionPass, entryDoorId: entry.entryDoorId,
    viewport: report.gpu?.viewport, renderer: report.gpu?.renderer, stops: [], comparisons: [] };
  report.valleyConstruction = evidence;
  if (baselinePath) evidence.baselineReceipt = baselinePath;
  const protection = state => JSON.stringify({
    takes: state.takes, phase: state.source.phase, fieldReturns: state.station?.fieldReturns,
    ending: state.ending, home: state.realm.frame?.homeState?.recognized,
    atWindow: state.realm.frame?.atWindow, windowReached: state.realm.frame?.windowReached,
  });
  const initialProgression = protection(before);

  async function walk(points) {
    for (const [x, z, radius] of points) await walkHome({ x, z }, entryYaw, radius);
  }

  async function aimAt(target, frame) {
    const [x, y, z] = target;
    const { pose } = frame;
    const yaw = Math.atan2(x - pose.x, z - pose.z);
    const pitch = Math.atan2(y - pose.floorY - frame.eyeHeight, Math.hypot(x - pose.x, z - pose.z));
    await lookWorld(entryYaw + yaw, pitch);
    await waitFor(state => {
      const actual = state.realm.frame?.pose;
      return actual && angleDifference(actual.yaw, yaw) < .06 && Math.abs(actual.pitch - pitch) < .05;
    }, 6000, 'construction sightline settles');
  }

  await walk(westApproach);
  for (const view of views) {
    const reference = baseline?.valleyConstruction?.stops?.find(stop => stop.name === view.name);
    const target = reference ? [reference.pose.x, reference.pose.z, .38] : view.stop;
    await walk([target]);
    await aimAt(view.target, (await snapshot()).realm.frame);
    await sleep(220);
    const state = await shot(`valley-construction-${view.name}`);
    const { pose } = state.realm.frame;
    const stop = { name: view.name, pose, target: view.target };
    evidence.stops.push(stop);
    check(`ordinary movement reaches the ${view.name} inspection`,
      Number.isFinite(pose.floorY) && Math.hypot(pose.x - view.stop[0], pose.z - view.stop[1]) <= .8,
      pose);
    if (view.name === 'store-frontage' || view.name === 'wall-and-plinth-return') {
      stop.performance = await samplePerformance(`valley-construction-${view.name}`, { minimumFps: null });
    }
    if (reference) {
      const separation = Math.hypot(pose.x - reference.pose.x, pose.z - reference.pose.z);
      const yawDifference = angleDifference(pose.yaw, reference.pose.yaw);
      const pitchDifference = Math.abs(pose.pitch - reference.pose.pitch);
      const fps = stop.performance && reference.performance ? {
        before: reference.performance.fps, after: stop.performance.fps,
        difference: stop.performance.fps - reference.performance.fps,
      } : null;
      const comparison = { view: view.name, separation, yawDifference, pitchDifference, fps };
      evidence.comparisons.push(comparison);
      check(`matched player-eye framing at the ${view.name}`,
        separation <= .4 && yawDifference <= .28 && pitchDifference <= .20, comparison);
    }
  }

  const wallStart = (await snapshot()).realm.frame.pose;
  await lookWorld(entryYaw - Math.PI / 2, 0);
  await hold('w', 1000);
  const wallStop = (await snapshot()).realm.frame.pose;
  await hold('w', 600);
  const wallRepeat = (await snapshot()).realm.frame.pose;
  check('ordinary forward input stops at the visible east store wall',
    wallStop.x < wallStart.x - .20 && wallStop.x >= -13.80
      && Math.hypot(wallRepeat.x - wallStop.x, wallRepeat.z - wallStop.z) < .055,
    { wallStart, wallStop, wallRepeat });
  await shot('valley-construction-wall-contact');
  await walk([[-12.55, 58.8, .38], [-12.6, 55.45, .38], [-12.9, 54.1, .38], [-16.1, 52.6], [-20, 53]]);
  const after = await snapshot();
  check('the frontage and side path rejoin without changing childhood progression or takes',
    after.realm.frame?.entryDoorId === entry.entryDoorId && protection(after) === initialProgression,
    { after: after.realm.frame?.pose, unchanged: protection(after) === initialProgression });

  evidence.collision = await page.evaluate(async () => {
    const { stationRealmCanOccupy, stationRealmFloor } = await import('/src/game/station-realms.js');
    return [
      ['lane', -20, 53.1], ['east approach', -12.9, 54.45], ['side path', -12.55, 58.8],
      ['store body', -17.0, 58.8], ['building behind the pane', 0, 74],
    ].map(([name, x, z]) => {
      const floor = stationRealmFloor(5, x, z);
      return { name, x, z, floor, open: floor !== null && stationRealmCanOccupy(5, x, z, floor) };
    });
  });
  check('read-only support and collision agree with the three walkable stations and both closed buildings',
    evidence.collision.every((point, index) => point.open === (index < 3)), evidence.collision);
}
