// The cable gesture is another input to the existing progression reducer, not
// another skill tree. A failed drop never spends a lead or tears out a chain.
import { TECHNIQUE_DEFS, normalizeCombatBuild, learnCombatTechnique, pullCombatTechnique, techniqueAvailability } from './combat-progression.js';

const definition = id => TECHNIQUE_DEFS.find(item => item.id === String(id || '').replace(/^skill:/, ''));
const idOf = value => definition(typeof value === 'string' ? value : value?.techniqueId || value?.skillId)?.id || null;

export function skillPatchSource(id) {
  const target = definition(id);
  if (!target) return null;
  return target.requires
    ? { id: `output:skill:${target.requires}`, kind: 'output', branch: target.branch, techniqueId: target.requires, skillId: `skill:${target.requires}` }
    : { id: `supply:${target.branch}`, kind: 'output', branch: target.branch, techniqueId: null, skillId: null };
}

function patchCandidate(value, source, targetId, { hasRig = false, rerouteId = null } = {}) {
  const original = normalizeCombatBuild(value), target = definition(targetId);
  const oldId = idOf(rerouteId);
  const pull = oldId ? pullCombatTechnique(original, oldId) : null;
  const build = pull?.changed ? pull.build : original;
  if (rerouteId && !pull?.changed) return { original, reason: 'THAT LEAD IS NO LONGER PATCHED' };
  if (!target || !source) return { original, reason: 'CHOOSE AN INPUT SOCKET' };
  if (source.kind !== 'output') return { original, reason: 'START FROM AN OUTPUT SOCKET' };
  if (source.branch !== target.branch) return { original, reason: 'MATCH THE SOCKET COLOR AND COLUMN' };
  const expected = skillPatchSource(target.id);
  // Check the fixed allowlisted source identity as well as its current power.
  if (source.id !== expected.id) return { original, reason: target.requires ? `FEED FROM ${definition(target.requires).label}` : 'FEED THIS INPUT FROM THE COLUMN SUPPLY' };
  if (expected.techniqueId && !build.techniques.includes(expected.techniqueId)) return { original, reason: 'SOURCE OUTPUT HAS NO CONTINUITY' };
  const availability = techniqueAvailability(build, target.id, { hasRig });
  if (!availability.enabled) return { original, reason: availability.reason };
  return { original, build, target, pull, reason: '' };
}

export function skillPatchAvailability(value, source, targetId, options = {}) {
  const candidate = patchCandidate(value, source, targetId, options);
  return { enabled: !candidate.reason, reason: candidate.reason };
}

export function compatibleSkillInputs(value, source, options = {}) {
  return TECHNIQUE_DEFS.filter(item => skillPatchAvailability(value, source, item.id, options).enabled)
    .map(item => `skill:${item.id}`);
}

export function connectSkillPatch(value, source, targetId, options = {}) {
  const candidate = patchCandidate(value, source, targetId, options);
  if (candidate.reason) return { changed: false, build: candidate.original, pulled: [], patched: [], reason: candidate.reason };
  const result = learnCombatTechnique(candidate.build, candidate.target.id, options);
  if (!result.changed) return { ...result, build: candidate.original, pulled: [], patched: [] };
  // Releasing an existing plug back into its own socket is a true no-op: do not
  // silently pull its dependent chain and then only put its parent back.
  if (idOf(options.rerouteId) === candidate.target.id) return { changed: false, build: candidate.original, pulled: [], patched: [], reason: '' };
  const pulled = candidate.original.techniques.filter(id => !result.build.techniques.includes(id));
  const patched = result.build.techniques.filter(id => !candidate.original.techniques.includes(id));
  return { changed: !!(pulled.length || patched.length), build: result.build, pulled, patched, reason: '' };
}
