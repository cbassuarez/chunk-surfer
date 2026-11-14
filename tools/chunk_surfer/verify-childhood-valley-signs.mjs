import { HOME_VALLEY_SIGN_GROUPS } from '../../src/data/childhood-valley-signs.js';

const angleDifference = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const westApproach = [[0, 12], [-8.5, 13], [-15, 15], [-23, 18], [-24, 22]];
const commonsApproach = [[-24, 21.5], [-24, 29], [-29, 39], [-28, 49], [-25, 52], [-20, 53]];
const uplandApproach = [[-13, 54], [-13, 63], [-20, 65], [-27, 74], [-32, 79], [-25.3, 79.2], [-25.2, 85], [-32, 87], [-43, 90]];
const signs = new Map(HOME_VALLEY_SIGN_GROUPS.flatMap(group => group.pieces).map(piece => [piece.id, piece]));
const axes = ['x', 'y', 'z'];

function sightline(ids) {
  const pieces = ids.map(id => signs.get(id));
  const [side, normalAxis] = pieces[0].face;
  const normal = axes.map(axis => axis === normalAxis ? (side === '+' ? 1 : -1) : 0);
  const target = axes.map(axis => {
    const low = Math.min(...pieces.map(piece => piece[axis + '0']));
    const high = Math.max(...pieces.map(piece => piece[axis + '1']));
    return axis === normalAxis ? (side === '+' ? high : low) : (low + high) / 2;
  });
  return { normal, target };
}

export async function reviewValleySigns({ check, shot, sleep, lookWorld, snapshot, waitFor, walkHome, report, entryYaw }) {
  const before = await snapshot();
  const entry = before.realm.frame;
  check('sign review is inside the real childhood valley', entry?.home?.eligible && entry.stage === 'inside', entry?.pose);
  const evidence = { entryDoorId: entry.entryDoorId, stops: [] };
  report.valleySigns = evidence;
  const progression = state => JSON.stringify({
    takes: state.takes, phase: state.source.phase, fieldReturns: state.station?.fieldReturns,
    ending: state.ending, recognized: state.realm.frame?.homeState?.recognized,
    atWindow: state.realm.frame?.atWindow, windowReached: state.realm.frame?.windowReached,
  });
  const initial = progression(before);

  async function walk(points) {
    for (const [x, z, radius] of points) await walkHome({ x, z }, entryYaw, radius);
  }

  async function photograph(name, ...ids) {
    const { normal, target } = sightline(ids);
    const { pose, eyeHeight } = (await snapshot()).realm.frame;
    const dx = target[0] - pose.x, dy = target[1] - pose.floorY - eyeHeight, dz = target[2] - pose.z;
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const distance = Math.hypot(dx, dy, dz), face = -(dx * normal[0] + dy * normal[1] + dz * normal[2]) / distance;
    await lookWorld(entryYaw + yaw, pitch);
    await waitFor(state => {
      const actual = state.realm.frame?.pose;
      return actual && angleDifference(actual.yaw, yaw) < .06 && Math.abs(actual.pitch - pitch) < .05;
    }, 6000, `the ${name} sightline settles`);
    await sleep(240);
    const state = await shot(`valley-signs-${name}`);
    const actual = state.realm.frame?.pose;
    const unchanged = progression(state) === initial;
    evidence.stops.push({ name, ids, pose: actual, target, normal, distance, face });
    check(`ordinary walking can frame the ${name} sign from its public face`,
      Number.isFinite(actual?.floorY) && distance <= 9 && face >= .42 && unchanged,
      { pose: actual, target, normal, distance, face, unchanged });
  }

  await walk([...westApproach, [-24.5, 19.3, .38]]);
  await photograph('postauto-road-flag', 'postauto-flag-south');
  await walk([[-24, 22, .38]]);
  await photograph('shelter-approach', 'postauto-enamel-name', 'postauto-paper-departures', 'visitor-paper');
  await walk([[-27.12, 21.48, .37]]);
  await photograph('shelter-close', 'postauto-enamel-name', 'postauto-paper-departures', 'visitor-paper');
  await photograph('winter-departures', 'postauto-paper-departures');
  await walk([[-26.95, 22.45, .38]]);
  await photograph('visitor-slip', 'visitor-paper');
  if (process.env.ROUTE_VERIFY_VALLEY_SIGNS_EXTENDED === '0') return;
  await walk([...commonsApproach.slice(0, -1), [-23.55, 51.9, .38]]);
  await photograph('pump-notice', 'pump-enamel-water');
  await walk([[-20, 53, .38]]);
  await photograph('commons-store', 'dorfladen-painted-face', 'commons-public-works-paper', 'commons-resident-wood-note');
  await walk([[-20.4, 53.05, .32], [-20.4, 55.15, .38], [-19.5, 55.45, .38]]);
  await photograph('commons-notices', 'commons-public-works-paper', 'commons-resident-wood-note');
  await walk([[-20.4, 55.15, .38], [-20.4, 53.05, .38]]);
  await walk([[-13, 54], [-8.8, 52, .38]]);
  await photograph('bakery-frontage', 'bakery-lettered-face', 'bakery-paper-hours');
  await walk([[-9.15, 54.6, .38]]);
  await photograph('bakery-hours', 'bakery-paper-hours');
  if (process.env.ROUTE_VERIFY_VALLEY_SIGNS_EXTENDED === 'near') return;
  await walk([[-8.8, 52], [-13, 54]]);
  await walk(uplandApproach);
  await walk([[-42.52, 89.2, .38]]);
  await photograph('upland-fork', 'upper-fork-left-blade', 'upper-fork-right-blade');
  await walk([[-43, 90], [-32, 87], [-25.2, 85], [-15, 91], [0, 92], [13, 87], [15.3, 93.1], [16.5, 95.55, .38]]);
  await photograph('ski-workshop', 'ski-workshop-paint');
}
