// The SKILLS tab.
//
// This replaced a full-screen text list that a player could not read: eighteen
// rows of prose in one column, running off the bottom of the panel, reachable
// only from a kit item that stayed hidden until you had already earned a pin.
//
// What a legible upgrade screen has to do, and therefore what this pins:
//
//   · THREE unmistakable states per node — owned, affordable, locked;
//   · a locked node names its blocker, by name, not "TIER I REQUIRED";
//   · the prerequisite chain is real structure (branch column, tier row), so a
//     path's depth is visible before anything is read;
//   · unspent pins are surfaced as the urgent thing they are;
//   · and nothing can be bought that the rules do not allow, whatever the UI
//     lets you point at.

import assert from 'node:assert/strict';

import { buildBagModel } from '../src/game/bag-model.js';
import {
  PIN_SOURCES,
  TECHNIQUE_DEFS,
  learnCombatTechnique,
  normalizeCombatBuild,
} from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';
import {
  BRANCH_ICON,
  SKILL_STATE,
  skillKindLabel,
  skillState,
  skillsTreeLayout,
} from '../src/render/bag-skills.js';

const skillsOf = (model) => model.sections.find((section) => section.id === 'skills');
const treeFor = (build, hasRig = true) => skillsOf(buildBagModel({ build, hasRig })).tree;
const flat = (tree) => tree.branches.flatMap((branch) => branch.entries);
const find = (tree, id) => flat(tree).find((entry) => entry.techniqueId === id);

// ── it is a section of the case, like KIT and MAP ────────────────────────────
const fresh = buildBagModel({});
assert.deepEqual(fresh.sections.map((s) => s.id), ['kit', 'map', 'files', 'skills'],
  'SKILLS is a fourth tab, not a separate screen');
assert.ok(skillsOf(fresh).entries.length === TECHNIQUE_DEFS.length,
  'every technique is an addressable entry, so the shared nav can select it');

// ── the shape is the tree ───────────────────────────────────────────────────
const empty = treeFor(null);
assert.equal(empty.branches.length, new Set(TECHNIQUE_DEFS.map((t) => t.branch)).size,
  'one column per branch');
for (const branch of empty.branches) {
  const tiers = branch.entries.map((entry) => entry.tier);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b), `${branch.id} descends in tier order`);
  assert.equal(new Set(tiers).size, tiers.length, `${branch.id} has one node per tier`);
  assert.ok(BRANCH_ICON[branch.id], `${branch.id} has an icon, so the column reads without text`);
}
// The two tier-4 specials belong to their branches, not to a seventh column.
assert.equal(find(empty, TECHNIQUE.MASTER_TAKE).branch, 'recorder');
assert.equal(find(empty, TECHNIQUE.RUNAWAY_FEEDBACK).branch, 'rig');
assert.equal(empty.maxTier, 4);

// ── three states, and a locked node says why by NAME ────────────────────────
assert.equal(skillState({ owned: true, enabled: false }), SKILL_STATE.OWNED);
assert.equal(skillState({ owned: false, enabled: true }), SKILL_STATE.AFFORDABLE);
assert.equal(skillState({ owned: false, enabled: false }), SKILL_STATE.LOCKED);

// No pins at all: nothing is affordable, and it says so in those words.
const broke = treeFor(null);
assert.equal(broke.pins.unspent, 0);
assert.ok(flat(broke).every((entry) => entry.state === SKILL_STATE.LOCKED));
assert.match(find(broke, TECHNIQUE.AFTERIMAGE).blockedBy, /NEEDS A PIN/);

// With pins: tier 1 is affordable, tier 2 names the tier-1 technique it wants.
const funded = treeFor(normalizeCombatBuild(null, PIN_SOURCES.encounters));
assert.ok(funded.pins.unspent > 0, 'cleared encounters return pins');
assert.equal(find(funded, TECHNIQUE.AFTERIMAGE).state, SKILL_STATE.AFFORDABLE);
assert.equal(find(funded, TECHNIQUE.WHITEOUT).state, SKILL_STATE.LOCKED);
assert.match(find(funded, TECHNIQUE.WHITEOUT).blockedBy, /AFTERIMAGE/,
  'a locked node names its prerequisite instead of numbering a tier');
// The rig branch says the rig is missing, and where the rig is.
const noRig = treeFor(normalizeCombatBuild(null, PIN_SOURCES.encounters), false);
assert.match(find(noRig, TECHNIQUE.OVERDUB).blockedBy, /BENT RIG/);
assert.match(find(noRig, TECHNIQUE.OVERDUB).blockedBy, /PLANT ROOM/, '...and where to get it');

// ── moves and passives are stated, not coded in guillemets ──────────────────
assert.equal(skillKindLabel({ active: true }), 'A MOVE YOU FIRE');
assert.equal(skillKindLabel({ special: true }), 'ONCE PER FIGHT');
assert.equal(skillKindLabel({}), 'ALWAYS ON');
assert.equal(skillKindLabel(find(funded, TECHNIQUE.AFTERIMAGE)), 'ALWAYS ON');
assert.equal(skillKindLabel(find(funded, TECHNIQUE.WHITEOUT)), 'A MOVE YOU FIRE');
assert.equal(skillKindLabel(find(funded, TECHNIQUE.MASTER_TAKE)), 'ONCE PER FIGHT');

// ── only affordable nodes offer the buy ─────────────────────────────────────
for (const entry of flat(funded)) {
  const offers = !!entry.actions.primary;
  assert.equal(offers, entry.state === SKILL_STATE.AFFORDABLE,
    `${entry.label} offers FIT exactly when it is affordable`);
}

// ── buying one moves the tree with it ───────────────────────────────────────
let build = normalizeCombatBuild(null, PIN_SOURCES.encounters);
const before = treeFor(build).pins.unspent;
build = learnCombatTechnique(build, TECHNIQUE.AFTERIMAGE, { hasRig: true }).build;
const after = treeFor(build);
assert.equal(find(after, TECHNIQUE.AFTERIMAGE).state, SKILL_STATE.OWNED);
assert.equal(find(after, TECHNIQUE.WHITEOUT).state, SKILL_STATE.AFFORDABLE, 'the chain opens up');
assert.equal(after.pins.unspent, before - 1, 'and it cost a pin');
assert.equal(find(after, TECHNIQUE.AFTERIMAGE).actions.primary, null, 'an owned node is not re-buyable');

// ── the count on the tab is about the urgent thing ──────────────────────────
assert.match(skillsOf(buildBagModel({ build: normalizeCombatBuild(null, PIN_SOURCES.encounters) })).countLabel, /PIN/,
  'unspent pins are what the tab advertises');
assert.match(skillsOf(buildBagModel({ build })).countLabel, /PIN|FITTED/);

// ── the geometry fits the panel it is given, and shrinks ────────────────────
for (const region of [
  { x: 2, y: 4, w: 96, h: 26 },
  { x: 0, y: 0, w: 60, h: 14 },
  { x: 0, y: 0, w: 34, h: 10 },
]) {
  const layout = skillsTreeLayout({ region, branches: empty.branches, maxTier: empty.maxTier });
  assert.equal(layout.cols, empty.branches.length);
  assert.ok(layout.tileW >= 3, 'a tile never collapses to nothing');
  assert.ok(layout.detail.y + layout.detail.h <= region.y + region.h + 0.001,
    'the detail strip stays inside the region');
  const lastColumnRight = layout.columnX(layout.cols - 1) + layout.tileW;
  assert.ok(lastColumnRight <= region.x + region.w + 1,
    `six columns fit ${region.w} wide (${lastColumnRight} vs ${region.x + region.w})`);
  const deepestBottom = layout.tileY(empty.maxTier) + layout.tileH;
  assert.ok(deepestBottom <= layout.detail.y + 0.001,
    'the deepest tier never runs into the detail strip');
  assert.ok(layout.headline.y < layout.treeTop,
    'the pin count has its own row rather than printing over the tab strip');
  assert.ok(layout.treeTop >= region.y,
    'and the tree starts inside the region it was given');
}

console.log('bag skills contracts passed');
