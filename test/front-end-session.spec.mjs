import assert from 'node:assert/strict';

import {
  affinityMatches,
  handoffFor,
  makeProspectiveRunPlan,
  makeResumeLaunchPlan,
} from '../src/game/run-launch-plan.js';
import { FRONT_END_STATE, FrontEndSession } from '../src/game/front-end-session.js';
import { irisBands } from '../src/game/iris-transition.js';
import {
  FRONT_END_PLATE_PRESETS,
  interpolateFrontEndPlate,
  normalizeFrontEndPlate,
} from '../src/render/front-end-plate.js';

const prospective = makeProspectiveRunPlan({
  meta: { runs: 2 },
  save: { px: 4, py: 8, run: null },
  position: { x: 10, y: 20 },
  view: { yaw: 1.25, pitch: -0.15 },
  now: 123456,
  random: () => 0.25,
});

assert.equal(prospective.kind, 'new');
assert.equal(prospective.initialPosition.x, 10);
assert.equal(prospective.initialPosition.y, 20);
assert.equal(prospective.initialView.yaw, 1.25);
assert.equal(handoffFor({
  backdrop: prospective.affinity,
  destination: prospective.affinity,
}), 'lift');

const resumableSave = {
  run: { id: 'RUN-A', status: 'active' },
  area: 'conservatory',
  px: 2,
  py: 3,
  view: { yaw: 0.7, pitch: 0.1 },
  cameraRevision: 5,
  checkpointRevision: 9,
};
const resume = makeResumeLaunchPlan(resumableSave, { runs: 4 });
assert.equal(resume.exact, true);
assert.equal(affinityMatches(resume.affinity, { ...resume.affinity }), true);
assert.equal(handoffFor({
  backdrop: resume.affinity,
  destination: prospective.affinity,
}), 'iris');

const nonExactResume = makeResumeLaunchPlan({
  ...resumableSave,
  area: 'source-space',
}, { runs: 4 });
assert.equal(nonExactResume.exact, false);
assert.equal(handoffFor({
  backdrop: nonExactResume.affinity,
  destination: nonExactResume.affinity,
}), 'iris');

const session = new FrontEndSession({ plan: prospective });
session.markCameraReady({ exact: true });
session.enterTitle();
assert.equal(session.state, FRONT_END_STATE.TITLE);
assert.equal(session.beginLift(), true);
for (let i = 0; i < 120 && session.state !== FRONT_END_STATE.LIVE; i += 1) {
  session.update(1 / 120);
}
assert.equal(session.state, FRONT_END_STATE.LIVE);
assert.equal(session.snapshot().plate.amount, 0);
assert.equal(session.snapshot().hudAlpha, 1);
assert.equal(session.snapshot().inputReady, true);

assert.equal(normalizeFrontEndPlate(FRONT_END_PLATE_PRESETS.gameplay).amount, 0);
assert.equal(interpolateFrontEndPlate(
  FRONT_END_PLATE_PRESETS.title,
  FRONT_END_PLATE_PRESETS.gameplay,
  1,
).amount, 0);

for (const [cols, rows] of [
  [80, 30],
  [160, 45],
  [320, 180],
  [1920, 1080],
]) {
  const bands = irisBands({ progress: 1, cols, rows });
  assert.equal(bands.covered, true);
  assert.ok(
    bands.left + bands.right >= cols || bands.top + bands.bottom >= rows,
    `iris must fully cover ${cols}x${rows}`,
  );
}

console.log('front-end-session specs passed');
