import assert from 'node:assert/strict';

import { makeBagScene } from '../src/game/bag.js';
import * as scenes from '../src/game/scenes.js';
import { normalizeCombatBuild, PIN_SOURCES } from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';

const base = normalizeCombatBuild(null, PIN_SOURCES.encounters);
const applied = [];
const bag = makeBagScene({
  getBuild: () => base,
  hasRig: () => true,
  focus: { sectionId: 'skills', entryId: `skill:${TECHNIQUE.AFTERIMAGE}` },
  onApplySkills: (build, meta) => applied.push({ build, meta }),
});

scenes.push(bag);
bag.key({ key: 'Enter', code: 'Enter' });

assert.equal(applied.length, 0, 'choosing a modification does not update gameplay while the case is open');
assert.deepEqual(bag.debugState().chosenTechniqueIds, [TECHNIQUE.AFTERIMAGE]);
assert.ok(bag.debugState().workingBuild.techniques.includes(TECHNIQUE.AFTERIMAGE),
  'the open case previews the chosen modification and unlocks its branch');

scenes.pop();
assert.equal(applied.length, 1, 'closing the case applies its choices exactly once');
assert.ok(applied[0].build.techniques.includes(TECHNIQUE.AFTERIMAGE));
assert.deepEqual(applied[0].meta.techniqueIds, [TECHNIQUE.AFTERIMAGE]);

bag.exit();
assert.equal(applied.length, 1, 'a repeated lifecycle exit cannot apply the same choice twice');

// ── A SESSION THAT ONLY PULLS STILL COMMITS ──────────────────────────────────
//
// The commit used to be gated on "did you choose something", so a case opened
// only to pull a lead out closed having written nothing: the socket emptied on
// screen and was full again the next time you looked. The gate is "did the rig
// change" now, and this is the test that says so.
{
  const settled = normalizeCombatBuild(
    { techniques: [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT] },
    PIN_SOURCES.encounters,
  );
  assert.deepEqual(settled.techniques, [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT],
    'the run is on disk before the case is opened');

  const pulls = [];
  const pullBag = makeBagScene({
    getBuild: () => settled,
    hasRig: () => true,
    focus: { sectionId: 'skills', entryId: `skill:${TECHNIQUE.WHITEOUT}` },
    onApplySkills: (build, meta) => pulls.push({ build, meta }),
  });
  scenes.push(pullBag);
  pullBag.key({ key: 'Enter', code: 'Enter' });

  assert.equal(pullBag.debugState().workingBuild.techniques.includes(TECHNIQUE.WHITEOUT), false,
    'the lead comes out of the socket while the case is open');
  assert.deepEqual(pullBag.debugState().chosenTechniqueIds, [],
    'and nothing was chosen, which is exactly the case the old gate dropped');

  scenes.pop();
  assert.equal(pulls.length, 1, 'closing the case writes the pull');
  assert.deepEqual(pulls[0].build.techniques, [TECHNIQUE.AFTERIMAGE]);
  assert.deepEqual(pulls[0].meta.pulled, [TECHNIQUE.WHITEOUT], 'and says what came out');
  assert.deepEqual(pulls[0].meta.patched, []);
}

// A case opened and closed with nothing touched still writes nothing.
{
  const quiet = [];
  const idle = makeBagScene({
    getBuild: () => base,
    hasRig: () => true,
    focus: { sectionId: 'skills' },
    onApplySkills: (build, meta) => quiet.push({ build, meta }),
  });
  scenes.push(idle);
  scenes.pop();
  assert.equal(quiet.length, 0, 'an untouched case commits nothing');
}

console.log('bag skill session contracts passed');
