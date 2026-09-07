import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compatibleSkillInputs,
  connectSkillPatch,
  skillPatchAvailability,
  skillPatchSource,
} from '../src/game/skill-patchbay.js';
import {
  PIN_SOURCES,
  TECHNIQUE_DEFS,
  learnCombatTechnique,
  normalizeCombatBuild,
} from '../src/game/combat-progression.js';
import { TECHNIQUE as T } from '../src/game/combat-state.js';

const funded = () => normalizeCombatBuild(null, PIN_SOURCES.encounters);
const buildWith = (...ids) => ids.reduce((build, id) => {
  const result = learnCombatTechnique(build, id, { hasRig: true });
  assert.equal(result.changed, true, `fixture can patch ${id}`);
  return result.build;
}, funded());
const rejected = (build, source, target, options = {}) => {
  const before = structuredClone(build);
  assert.equal(skillPatchAvailability(build, source, target, options).enabled, false);
  const result = connectSkillPatch(build, source, target, options);
  assert.equal(result.changed, false);
  assert.deepEqual(result.build, before, 'failed routing is atomic');
  assert.deepEqual(build, before, 'the input build is never mutated');
  assert.deepEqual(result.pulled, []);
  assert.deepEqual(result.patched, []);
  assert.ok(result.reason);
  return result;
};

test('an available lead patches exactly one input and only compatible inputs are advertised', () => {
  const build = funded(), source = skillPatchSource(T.AFTERIMAGE);
  assert.equal(skillPatchAvailability(build, source, T.AFTERIMAGE).enabled, true);
  assert.deepEqual(compatibleSkillInputs(build, source), [`skill:${T.AFTERIMAGE}`]);
  const result = connectSkillPatch(build, source, `skill:${T.AFTERIMAGE}`);
  assert.equal(result.changed, true);
  assert.equal(result.build.unspent, build.unspent - 1);
  assert.deepEqual(result.patched, [T.AFTERIMAGE]);
  assert.deepEqual(result.pulled, []);
  assert.deepEqual(build.techniques, []);
});

test('same-column cables still require the exact authored upstream socket', () => {
  const build = buildWith(T.AFTERIMAGE, T.WHITEOUT);
  const whiteoutFeed = skillPatchSource(T.WHITEOUT);
  rejected(build, skillPatchSource(T.AFTERIMAGE), T.OVEREXPOSE);
  rejected(build, whiteoutFeed, T.OVEREXPOSE);
  const expected = skillPatchSource(T.OVEREXPOSE);
  assert.equal(expected.techniqueId, T.WHITEOUT);
  assert.deepEqual(compatibleSkillInputs(build, expected), [`skill:${T.OVEREXPOSE}`]);
  assert.equal(connectSkillPatch(build, expected, T.OVEREXPOSE).changed, true);
});

test('locked outputs have no continuity, even when their source descriptor is known', () => {
  const build = funded(), source = skillPatchSource(T.WHITEOUT);
  const failed = rejected(build, source, T.WHITEOUT);
  assert.match(failed.reason, /CONTINUITY/);
  assert.deepEqual(compatibleSkillInputs(build, source), []);
  const connected = buildWith(T.AFTERIMAGE);
  assert.equal(skillPatchAvailability(connected, source, T.WHITEOUT).enabled, true);
});

test('cross-column, counterfeit, input, self, and cycle sources cannot bypass the tree', () => {
  const build = buildWith(T.AFTERIMAGE, T.WHITEOUT);
  rejected(build, skillPatchSource(T.PUNCH_IN), T.OVEREXPOSE);
  const source = skillPatchSource(T.OVEREXPOSE);
  rejected(build, { ...source, id: 'output:skill:counterfeit' }, T.OVEREXPOSE);
  rejected(build, { ...source, branch: 'radio' }, T.OVEREXPOSE);
  rejected(build, { ...source, kind: 'input' }, T.OVEREXPOSE);
  rejected(build, { ...source, id: `output:skill:${T.OVEREXPOSE}`, techniqueId: T.OVEREXPOSE }, T.OVEREXPOSE);
  rejected(build, source, T.AFTERIMAGE);
  rejected(build, null, T.OVEREXPOSE);
  rejected(build, source, 'not-an-authored-skill');
  assert.equal(skillPatchSource('not-an-authored-skill'), null);
});

test('wrong reroute targets preserve the full original dependent chain and cable balance', () => {
  const build = buildWith(T.AFTERIMAGE, T.WHITEOUT, T.OVEREXPOSE);
  assert.equal(build.unspent, 0);
  const source = skillPatchSource(T.AFTERIMAGE), options = { rerouteId: T.AFTERIMAGE };
  rejected(build, source, T.PUNCH_IN, options);
  rejected(build, source, T.OVEREXPOSE, options);
  rejected(build, source, T.AFTERIMAGE, { rerouteId: T.PUNCH_IN });
  assert.deepEqual(build.techniques, [T.AFTERIMAGE, T.WHITEOUT, T.OVEREXPOSE]);
});

test('returning a moved plug to its own input is a no-op retaining every descendant', () => {
  const build = buildWith(T.AFTERIMAGE, T.WHITEOUT, T.OVEREXPOSE);
  for (const id of build.techniques) {
    const result = connectSkillPatch(build, skillPatchSource(id), id, { rerouteId: id });
    assert.equal(result.changed, false);
    assert.equal(result.reason, '');
    assert.deepEqual(result.build, build);
    assert.deepEqual(result.pulled, []);
    assert.deepEqual(result.patched, []);
  }
});

test('a valid same-supply reroute releases dependent leads before installing its new destination', () => {
  const build = buildWith(T.STEADY_NERVE, T.RIPOSTE, T.SECOND_WIND);
  const source = skillPatchSource(T.STEADY_NERVE), options = { rerouteId: T.STEADY_NERVE };
  assert.equal(build.unspent, 0);
  assert.ok(compatibleSkillInputs(build, source, options).includes(`skill:${T.BRACE}`));
  const result = connectSkillPatch(build, source, T.BRACE, options);
  assert.equal(result.changed, true);
  assert.deepEqual(result.pulled, [T.STEADY_NERVE, T.RIPOSTE, T.SECOND_WIND]);
  assert.deepEqual(result.patched, [T.BRACE]);
  assert.deepEqual(result.build.techniques, [T.BRACE]);
  assert.equal(result.build.unspent, 2);
  assert.equal(result.build.pinsEarned, build.pinsEarned);
  assert.deepEqual(build.techniques, [T.STEADY_NERVE, T.RIPOSTE, T.SECOND_WIND]);
});

test('no spare lead and finalized zero-starter runs never create a cable', () => {
  const empty = normalizeCombatBuild();
  const challenge = normalizeCombatBuild(null, [], null, { tutorialComplete: true, combatAssistance: 'severe' });
  const spent = buildWith(T.AFTERIMAGE, T.WHITEOUT, T.PUNCH_IN);
  for (const build of [empty, challenge, spent]) {
    const source = skillPatchSource(T.DEEP_RESERVE);
    assert.deepEqual(compatibleSkillInputs(build, source), []);
    assert.match(rejected(build, source, T.DEEP_RESERVE).reason, /NO SPARE LEAD/);
  }
  const noRig = funded();
  assert.match(rejected(noRig, skillPatchSource(T.OVERDUB), T.OVERDUB).reason, /BENT RIG/);
});

test('every authored routing source follows requires rather than the displayed tier', () => {
  for (const definition of TECHNIQUE_DEFS) {
    const source = skillPatchSource(definition.id);
    assert.equal(source.kind, 'output');
    assert.equal(source.branch, definition.branch);
    assert.equal(source.techniqueId, definition.requires || null);
    assert.equal(source.id, definition.requires ? `output:skill:${definition.requires}` : `supply:${definition.branch}`);
  }
  assert.equal(skillPatchSource(T.ROOM_TONE).id, 'supply:recorder', 'tier four can still be an independent input');
  assert.equal(skillPatchSource(T.HEADROOM).id, 'supply:fork', 'a flat tier three does not invent a tier-two prerequisite');
});
