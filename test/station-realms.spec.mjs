import assert from 'node:assert/strict';
import test from 'node:test';
import { REALM_POCKETS, homeSnowHeight } from '../src/data/realm-pockets.js';
import { HOME_HOUSE } from '../src/data/childhood-house.js';
import { HOME_APPROACH_WALLS, homeGroundProfile } from '../src/data/childhood-grounds.js';
import { HOME_VALLEY_SITES } from '../src/data/childhood-valley.js';
import { HOME_MOUNTAIN_TRAILS, HOME_MOUNTAIN_SITES, HOME_VALLEY_TREES } from '../src/data/childhood-valley-trail.js';
import { createStationRealm, normalizeStationRealm, moveStationRealm, stationRealmFloor,
  stationRealmCanOccupy, stationRealmFrame, stationRealmAtWindow, stationRealmSeed, STATION_DECOHERENCE_SECONDS } from '../src/game/station-realms.js';

const create = (variant = 1, home = false) => createStationRealm({ variant, home,
  seed: stationRealmSeed(4417, variant), entryDoorId: `door-${variant}`,
  returnPose: { x: 8, y: -3000, yaw: .3, pitch: .1, facing: 0 }, now: 10 });

test('six canonical pockets have real support, obstacles, reachable bends and matching floor tops', () => {
  const paths = [
    [[0, 7.5], [4, 7.5], [4, 18]],
    [[0, 9.5], [5, 9.5], [5, 20]],
    [[0, 8.5], [4, 8.5], [4.5, 19]],
    [[0, 21]],
    [[0, 9.5], [4, 9.5], [4, 17], [8.5, 17], [8.5, 20]],
    [[0, 20]],
  ];
  assert.equal(REALM_POCKETS.length, 6);
  for (const pocket of REALM_POCKETS) {
    const realm = create(pocket.variant, true); // Do not eject while checking the physical route.
    assert.equal(stationRealmFloor(pocket.variant, 0, 1), 0);
    assert.equal(stationRealmCanOccupy(pocket.variant, 100, 100), false);
    const solid = pocket.solids[0];
    assert.equal(stationRealmCanOccupy(pocket.variant, solid.center[0], solid.center[2]), false);
    for (const [x, z] of paths[pocket.variant]) {
      for (let attempts = 0; Math.hypot(x - realm.pose.x, z - realm.pose.z) > .04 && attempts < 1000; attempts += 1) {
        const dx = x - realm.pose.x, dz = z - realm.pose.z, length = Math.hypot(dx, dz);
        const result = moveStationRealm(realm, { dx: dx / length * Math.min(.085, length), dz: dz / length * Math.min(.085, length) }, 10);
        assert.ok(result.movedDistance > 0, `${pocket.world}: authored route blocked at ${JSON.stringify(realm.pose)}`);
      }
      assert.ok(Math.hypot(x - realm.pose.x, z - realm.pose.z) < .04, `${pocket.world}: could not reach its reveal`);
    }
    const frame = stationRealmFrame(realm, 12);
    assert.ok(realm.steps <= pocket.stepBudget, `${pocket.world}: reveal comes after its normal walking allowance`);
    assert.equal(frame.pose.floorY, stationRealmFloor(pocket.variant, realm.pose.x, realm.pose.z));
    assert.equal(frame.time, 12);
  }
});

test('footsteps come from actual distance, preserve partial stride, and ignore update cadence', () => {
  const fine = create(), coarse = create();
  for (let i = 0; i < 10; i += 1) moveStationRealm(fine, { dx: .04, dz: .08 });
  for (let i = 0; i < 2; i += 1) moveStationRealm(coarse, { dx: .2, dz: .4 });
  assert.equal(fine.steps, coarse.steps);
  assert.ok(Math.abs(fine.strideM - coarse.strideM) < 1e-8);
  assert.ok(fine.strideM > 0);
  const restored = normalizeStationRealm(JSON.parse(JSON.stringify(fine)));
  assert.deepEqual(restored, fine);
  moveStationRealm(fine, { dx: -.2, dz: .4 });
  moveStationRealm(restored, { dx: -.2, dz: .4 });
  assert.deepEqual(restored, fine);
  const before = { steps: fine.steps, strideM: fine.strideM };
  for (let i = 0; i < 50; i += 1) moveStationRealm(fine, { yaw: i / 10, pitch: .2 });
  assert.deepEqual({ steps: fine.steps, strideM: fine.strideM }, before);
});

test('forward, backward and strafe all spend the same distance-based budget', () => {
  for (const [dx, dz] of [[.085, 0], [-.085, 0], [0, .085], [0, -.085]]) {
    const realm = create();
    realm.pose.z = 4;
    for (let i = 0; i < 1000 && realm.stage === 'inside'; i += 1) {
      const direction = Math.floor(i / 8) % 2 ? -1 : 1;
      moveStationRealm(realm, { dx: dx * direction, dz: dz * direction }, 15);
    }
    assert.equal(realm.steps, REALM_POCKETS[1].stepBudget);
    assert.equal(realm.stage, 'decohering');
    assert.equal(realm.returnReason, 'budget');
    assert.equal(stationRealmFrame(realm, 15).decoherence, 0);
    assert.ok(Math.abs(stationRealmFrame(realm, 15 + STATION_DECOHERENCE_SECONDS / 2).decoherence - .5) < 1e-8);
    assert.ok(stationRealmFrame(realm, 15 + STATION_DECOHERENCE_SECONDS).decoherence > 1 - 1e-8);
  }
});

test('a blocked wall gives no footsteps and swept movement cannot tunnel through it', () => {
  const realm = create(5, true);
  realm.pose.z = 69.7;
  moveStationRealm(realm, { dz: 100 });
  const before = { ...realm.pose }, steps = realm.steps, stride = realm.strideM;
  for (let i = 0; i < 20; i += 1) {
    const result = moveStationRealm(realm, { dz: .085 });
    assert.equal(result.movedDistance, 0);
    assert.equal(result.footsteps, 0);
    assert.equal(result.blocked, true);
  }
  assert.deepEqual(realm.pose, before);
  assert.equal(realm.steps, steps);
  assert.equal(realm.strideM, stride);
});

test('a return to the commons recovers the exact outbound steps, including a backstep', () => {
  const realm = create(5, true);
  realm.pose = { ...realm.pose, x: -26, z: 49 };
  moveStationRealm(realm, { dz: .68, yaw: 0 });
  moveStationRealm(realm, { dx: .68, yaw: Math.PI / 2 });
  moveStationRealm(realm, { dx: -.68, yaw: Math.PI / 2 });
  const oldv = realm.homeState.oldv;
  assert.equal(oldv.returned, false);
  assert.equal(oldv.steps.length, 3);
  assert.deepEqual(oldv.steps.map(row => row[3]), [-1, 1, -1]);
  // These are 3D strides on shallow graded snow, so their planar displacements
  // are slightly shorter than .68 metres. Check the bend and return endpoints.
  assert.ok(Math.abs(oldv.steps[0][1] - 49.68) < .015);
  assert.ok(Math.abs(oldv.steps[1][0] + 25.32) < .015);
  assert.ok(Math.abs(oldv.steps[2][0] + 26) < .015);
  assert.equal(oldv.steps[1][2], oldv.steps[2][2]);
  for (let i = 0; i < 8; i++) moveStationRealm(realm, { dz: -.8 });
  assert.equal(realm.homeState.oldv.left, true);
  const saved = normalizeStationRealm(JSON.parse(JSON.stringify(realm)));
  for (let i = 0; i < 8; i++) moveStationRealm(saved, { dz: .8 });
  assert.equal(saved.homeState.oldv.returned, true);
  assert.deepEqual(saved.homeState.oldv.steps, realm.homeState.oldv.steps);
  assert.deepEqual(saved.homeState.oldv.steps.slice(0, 3), oldv.steps);
});

test('the entrance is a physical retreat plane, and eligible whiteout exceeds ordinary allowance', () => {
  const retreat = create();
  moveStationRealm(retreat, { dz: -.6 });
  const result = moveStationRealm(retreat, { dz: -.6 }, 13);
  assert.equal(result.retreated, true);
  assert.equal(retreat.stage, 'returning');
  assert.equal(retreat.returnReason, 'retreat');
  const home = create(5, true);
  for (let i = 0; i < 1000; i += 1) moveStationRealm(home, { dz: .085 }, 13);
  assert.ok(home.steps > REALM_POCKETS[5].stepBudget);
  assert.equal(home.stage, 'inside');
  const frame = stationRealmFrame(home, 13);
  assert.ok(frame.atWindow && frame.home.nearWindow);
  assert.equal(frame.home.fold, 1);
  assert.ok(home.pose.z < 70);
});

test('each rendered entrance post blocks the body while the clear opening permits retreat', () => {
  for (let variant = 0; variant < 6; variant += 1) {
    for (const x of [-.82, .82]) {
      const realm = create(variant, true);
      realm.pose.x = x;
      const result = moveStationRealm(realm, { dz: -1.2 }, 13);
      assert.equal(result.blocked, true, `${variant}: the visible post must refuse the body`);
      assert.equal(result.retreated, false);
      assert.equal(realm.stage, 'inside');
      assert.ok(realm.pose.z >= .36 - 1e-8);
      const before = { ...realm.pose }, steps = realm.steps;
      for (let i = 0; i < 10; i += 1) moveStationRealm(realm, { dz: -.085 }, 13);
      assert.deepEqual(realm.pose, before);
      assert.equal(realm.steps, steps, 'pushing against a post cannot spend the walking allowance');
    }
    const opening = create(variant, true);
    opening.pose.x = .49;
    const result = moveStationRealm(opening, { dz: -1.2 }, 13);
    assert.equal(result.retreated, true, `${variant}: the body fits through the actual clear opening`);
    assert.equal(opening.returnReason, 'retreat');
  }
});

test('saved poses recover to support and returned frames are independent', () => {
  const realm = create(5, true);
  realm.homeState = { recognized: true, attention: .7, nested: { value: 1 } };
  const frame = stationRealmFrame(realm, 12);
  assert.deepEqual(frame.window, REALM_POCKETS[5].home.window);
  frame.pose.x = 100; frame.returnPose.x = 100; frame.homeState.nested.value = 2; frame.window.x = 100;
  assert.equal(realm.pose.x, 0);
  assert.equal(realm.returnPose.x, 8);
  assert.equal(realm.homeState.nested.value, 1);
  assert.equal(stationRealmFrame(realm, 12).window.x, REALM_POCKETS[5].home.window.x, 'the window target must remain the shared authored geometry');
  assert.equal(stationRealmFrame(create(1), 12).window, null);
  const recovered = normalizeStationRealm({ ...realm, pose: { x: Infinity, z: 500 }, strideM: Infinity });
  assert.deepEqual(recovered.pose, { x: 0, z: 1, yaw: 0, pitch: 0 });
  assert.equal(recovered.strideM, 0);
  assert.equal(stationRealmSeed(4417, 1), stationRealmSeed(4417, 1));
  assert.notEqual(stationRealmSeed(4417, 1), stationRealmSeed(4417, 2));
});

function walkTo(realm, x, z) {
  let travelled = 0;
  for (let i = 0; Math.hypot(x - realm.pose.x, z - realm.pose.z) > 1e-7 && i < 1600; i += 1) {
    const dx = x - realm.pose.x, dz = z - realm.pose.z, length = Math.hypot(dx, dz);
    const result = moveStationRealm(realm, { dx: dx / length * Math.min(.06, length),
      dz: dz / length * Math.min(.06, length) }, 15);
    assert.ok(result.movedDistance > 0, `house approach blocked at ${JSON.stringify(realm.pose)}`);
    travelled += result.movedDistance;
  }
  assert.ok(Math.hypot(x - realm.pose.x, z - realm.pose.z) < 1e-7);
  return travelled;
}

test('the lower whiteout way forms a walkable loop with a physical wall and field opening', () => {
  const realm = create(5, true);
  walkTo(realm, 0, 19.5);
  walkTo(realm, 5.05, 20.1);
  walkTo(realm, 5.05, 40);
  assert.ok(stationRealmFloor(5, 5.05, 40) < -.65);
  assert.ok(homeGroundProfile(5.05, 40).shelter > .85);
  assert.equal(homeGroundProfile(0, 40).shelter, 0);
  assert.equal(stationRealmAtWindow(realm), false);
  assert.deepEqual(normalizeStationRealm(JSON.parse(JSON.stringify(realm))), realm);
  for (let i = 0; i < 35; i++) moveStationRealm(realm, { dx: -.08 }, 15);
  assert.ok(realm.pose.x > 3.2, 'the body crosses the visible boundary wall');
  walkTo(realm, 5.05, 40);
  walkTo(realm, 5.05, 49.9);
  walkTo(realm, 0, 53.1);
  walkTo(realm, 0, 61);
  assert.equal(realm.stage, 'inside');
  assert.equal(stationRealmAtWindow(realm), false);
  const gap = create(5, true);
  walkTo(gap, 0, 34);
  walkTo(gap, 5.05, 34);
  assert.equal(gap.stage, 'inside');
  for (const wall of HOME_APPROACH_WALLS) {
    const x = wall.id === 'house-boundary-left' ? -3.4 : (wall.x0 + wall.x1) / 2;
    const z = (wall.z0 + wall.z1) / 2;
    assert.equal(stationRealmCanOccupy(5, x, z, homeSnowHeight(x, z)), false, wall.id);
  }
});

test('the valley circuit and return work without entering the bedroom recognition area', () => {
  let realm = create(5, true);
  const route = [[0,12],[-12,13],[-23,18],[-24,22],[-24,29],[-29,39],[-28,49],[-25,52],[-20,53],
    [-13,54],[-13,63],[-20,65],[-27,74],[-32,79],[-25.5,79.2],[-25.2,85],[-15,91],[0,92],
    [13,87],[23,76],[22.8,59],[21,46],[23,34],[15,22],[1,17],[0,2.5]];
  for (const [x,z] of route) {
    walkTo(realm,x,z);
    assert.equal(realm.stage,'inside');
    assert.equal(stationRealmAtWindow(realm),false);
    if(z===79){
      assert.ok(stationRealmFloor(5,x,z)>5);
      const restored=normalizeStationRealm(JSON.parse(JSON.stringify(realm)));
      assert.deepEqual(restored,realm);
      realm=restored;
    }
  }
  assert.ok(realm.steps>REALM_POCKETS[5].stepBudget);
  walkTo(realm,0,.6);
  const exit=moveStationRealm(realm,{dz:-1},16);
  assert.equal(exit.retreated,true);
  assert.equal(realm.returnReason,'retreat');
  assert.equal(realm.windowReached,false);

  assert.equal(stationRealmCanOccupy(5,-27.1,22,stationRealmFloor(5,-27.1,22)),true,'the bus shelter is actually open');
  for(const {pieces} of HOME_VALLEY_SITES)for(const piece of pieces.filter(piece=>piece.id.endsWith('closed-envelope'))){
    const x=(piece.x0+piece.x1)*.5,z=(piece.z0+piece.z1)*.5;
    assert.equal(stationRealmCanOccupy(5,x,z,stationRealmFloor(5,x,z)),false,piece.id);
  }
});

test('wooded climb, off-road shelter and alternate descent share real support with the valley', () => {
  const trails = Object.fromEntries(HOME_MOUNTAIN_TRAILS.map(({id,points}) => [id,points]));
  let realm = create(5, true);
  const follow = (points) => {
    for (const [x,z] of points) {
      walkTo(realm,x,z);
      assert.equal(stationRealmAtWindow(realm),false);
      assert.equal(realm.stage,'inside');
    }
  };
  follow([[0,12],[-12,13],[-23,18],[-24,22],[-24,29],[-29,39],[-28,49],[-25,52],[-20,53],
    [-13,54],[-13,63],[-20,65],[-27,74],[-32,79],[-25.3,79.2],...trails['hay-cut']]);
  const fork = stationRealmFrame(realm).pose.floorY;
  follow(trails['timber-track'].slice(1,5));
  follow(trails['woodcutters-rest'].slice(1));
  follow([[-66.2,106.4]]);
  const deck = HOME_MOUNTAIN_SITES.find(({id})=>id==='timber-rest').pieces.find(({id})=>id==='timber-rest-floor');
  assert.ok(Math.abs(stationRealmFrame(realm).pose.floorY-deck.y1)<1e-9);
  follow([[-64,107],[-61,108],[-57,109],...trails['timber-track'].slice(5)]);
  const lookout = stationRealmFrame(realm).pose.floorY;
  assert.ok(lookout - fork > 20,'the mountain must be a real climb from the trailhead');
  const restored = normalizeStationRealm(JSON.parse(JSON.stringify(realm)));
  assert.deepEqual(restored,realm);
  realm=restored;
  follow(trails['spring-track'].slice(1,5));
  follow(trails['spring-spur'].slice(1));
  follow([...trails['spring-spur'].slice(0,-1).reverse(),...trails['spring-track'].slice(5)]);
  assert.equal(stationRealmFrame(realm).pose.floorY,fork);
  for (const {x,y,z} of HOME_VALLEY_TREES) {
    assert.equal(stationRealmFloor(5,x,z),y,'the forest is rooted in traversable terrain');
    assert.equal(stationRealmCanOccupy(5,x,z,y),false,'a visible trunk must stop the body');
  }
});

test('the level upstairs approach joins finite continuous scoured snow without a flat support overriding it', () => {
  for (let z = 1; z < 69.8; z += .08) assert.equal(stationRealmFloor(5, 0, z), 0);
  for (const scour of HOME_HOUSE.snowScours) {
    assert.equal(homeSnowHeight(scour.x, scour.z), -scour.depth);
    const edge = scour.x + scour.radiusX, epsilon = 1e-4;
    assert.equal(homeSnowHeight(edge + epsilon, scour.z), 0);
    assert.ok(Math.abs(homeSnowHeight(edge - epsilon, scour.z)) < 1e-7, 'scour seam has a vertical lip');
    let previous = homeSnowHeight(scour.x - scour.radiusX - .08, scour.z);
    for (let x = scour.x - scour.radiusX; x <= scour.x + scour.radiusX + .08; x += .08) {
      const height = homeSnowHeight(x, scour.z);
      assert.ok(Number.isFinite(height) && height <= 0 && height >= -scour.depth);
      assert.ok(Math.abs(height - previous) < .45, 'an authored grade contains an unwalkable body step');
      previous = height;
    }
  }
  for (const [x, z] of [[-2.65, 72], [6.2, 73.1]]) {
    assert.ok(stationRealmFloor(5, x, z) < -.5, 'the snow-route box filled its scour back in');
    assert.equal(stationRealmFloor(5, x, z), homeSnowHeight(x, z));
  }
});

test('both front corners and lower-storey traces are reachable while every house face stops the body', () => {
  for (const [x, z, intoHouse] of [[-2.65, 72, .085], [6.2, 73.1, -.085]]) {
    const realm = create(5, true);
    walkTo(realm, 0, 66.8);
    walkTo(realm, x < 0 ? -3.5 : 6.2, 66.8);
    const sideLength = Math.hypot(x - realm.pose.x, z - realm.pose.z);
    const sideTravel = walkTo(realm, x, z);
    assert.ok(sideTravel > sideLength + .03, 'footsteps ignored the descent into scoured snow');
    assert.equal(realm.stage, 'inside');
    assert.equal(stationRealmAtWindow(realm), false, 'the encounter activated through an opaque side wall');
    for (let i = 0; i < 30; i += 1) moveStationRealm(realm, { dx: intoHouse }, 15);
    const before = { ...realm.pose };
    const stopped = moveStationRealm(realm, { dx: intoHouse }, 15);
    assert.equal(stopped.movedDistance, 0);
    assert.equal(stopped.blocked, true);
    assert.deepEqual(realm.pose, before);
    assert.ok(x < 0 ? realm.pose.x < HOME_HOUSE.x0 : realm.pose.x > HOME_HOUSE.x1);
  }
  const back = create(5, true);
  walkTo(back, 0, 66.8); walkTo(back, 6.2, 66.8); walkTo(back, 6.2, 78); walkTo(back, 1.6, 78);
  for (let i = 0; i < 30; i += 1) moveStationRealm(back, { dz: -.085 }, 15);
  assert.equal(moveStationRealm(back, { dz: -.085 }, 15).movedDistance, 0);
  assert.ok(back.pose.z > HOME_HOUSE.z1);
  for (const [x, z] of [[-8.1, 72], [9.1, 72], [0, 81.1]]) {
    assert.equal(stationRealmCanOccupy(5, x, z, homeSnowHeight(x, z)), false, 'visible snowbank did not stop the body');
  }
});

test('a save on scoured snow preserves its pose, gaze, stride and physical eye height', () => {
  const realm = create(5, true);
  walkTo(realm, 0, 66.8); walkTo(realm, 6.2, 66.8); walkTo(realm, 6.2, 73.1);
  moveStationRealm(realm, { yaw: -.7, pitch: -.15 }, 17);
  realm.homeState = { recognized: true, attention: 0, awayDistance: .12 };
  const saved = normalizeStationRealm(JSON.parse(JSON.stringify(realm)));
  assert.deepEqual(saved, realm);
  assert.ok(stationRealmFrame(saved, 17).pose.floorY < -.5);
  moveStationRealm(realm, { dz: .06 }, 17); moveStationRealm(saved, { dz: .06 }, 17);
  assert.deepEqual(saved, realm);
});

test('the concealing gust uses its late authored interval without changing position or walking allowance', () => {
  const realm = create(5, true), { foldFrom, foldTo } = REALM_POCKETS[5].home;
  for (const [z, expected] of [[foldFrom - 1, 0], [foldFrom, 0], [(foldFrom + foldTo) / 2, .5], [foldTo, 1]]) {
    realm.pose.z = z;
    const before = JSON.stringify(realm), frame = stationRealmFrame(realm, 18);
    assert.ok(Math.abs(frame.home.fold - expected) < 1e-10);
    assert.equal(JSON.stringify(realm), before, 'presentation teleported the body or spent footsteps');
  }
});

test('supported side viewpoints reveal lower-storey heads within the actual downward-look limit', () => {
  const left = HOME_HOUSE.secondaryWindows.find((item) => item.id === 'lower-left');
  const door = HOME_HOUSE.lowerDoor;
  for (const { x, z, opening } of [{ x: -4.2, z: 72, opening: left }, { x: 7.2, z: 73.1, opening: door }]) {
    const realm = create(5, true);
    walkTo(realm, 0, 66.8); walkTo(realm, x, 66.8); walkTo(realm, x, z);
    const floor = stationRealmFloor(5, x, z), eye = floor + REALM_POCKETS[5].eyeHeight;
    assert.equal(stationRealmCanOccupy(5, x, z, floor), true);
    const head = opening.y + opening.halfHeight;
    const pitch = Math.atan2(head - eye, Math.hypot(opening.x - x, opening.z - z));
    assert.ok(pitch > -.60, `lower-storey head requires a clipped look at pitch ${pitch}`);
    assert.ok(head - homeSnowHeight(opening.x, opening.z) > .25, 'only a grazing seam of the lower opening escapes the snow');
  }
  assert.equal(homeSnowHeight(-8.5, 72), 0);
  assert.equal(homeSnowHeight(9.5, 73.1), 0);
});
