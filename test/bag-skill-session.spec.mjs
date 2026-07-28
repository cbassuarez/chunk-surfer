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

console.log('bag skill session contracts passed');
