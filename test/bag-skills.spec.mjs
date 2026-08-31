// The SKILLS tab.
//
// This replaced a full-screen text list that a player could not read: eighteen
// rows of prose in one column, running off the bottom of the panel, reachable
// only from a kit item that stayed hidden until you had already earned a pin.
//
// What a legible upgrade screen has to do, and therefore what this pins:
//
//   · FOUR unmistakable states per node — installed, chosen, available, locked;
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
const treeFor = (build, hasRig = true, settledBuild = null) => skillsOf(buildBagModel({ build, settledBuild, hasRig })).tree;
const flat = (tree) => tree.branches.flatMap((branch) => branch.entries);
const find = (tree, id) => flat(tree).find((entry) => entry.techniqueId === id);

// ── it is a section of the case, like KIT and MAP ────────────────────────────
const fresh = buildBagModel({});
assert.deepEqual(fresh.sections.map((s) => s.id), ['kit', 'map', 'sheets', 'skills'],
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
assert.equal(empty.maxTier, 5);

// ── three states, and a locked node says why by NAME ────────────────────────
assert.equal(skillState({ owned: true, enabled: false }), SKILL_STATE.OWNED);
assert.equal(skillState({ owned: true, pending: true, enabled: false }), SKILL_STATE.PENDING);
assert.equal(skillState({ owned: false, enabled: true }), SKILL_STATE.AFFORDABLE);
assert.equal(skillState({ owned: false, enabled: false }), SKILL_STATE.LOCKED);

// No pins at all: nothing is affordable, and it says so in those words.
const broke = treeFor(null);
assert.equal(broke.pins.unspent, 0);
assert.ok(flat(broke).every((entry) => entry.state === SKILL_STATE.LOCKED));
assert.match(find(broke, TECHNIQUE.AFTERIMAGE).blockedBy, /NO SPARE LEAD/);

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
assert.equal(skillKindLabel({ active: true }), 'MANUAL TECHNIQUE');
assert.equal(skillKindLabel({ special: true }), 'SPECIAL · COSTS CHARGE');
assert.equal(skillKindLabel({}), 'PASSIVE EFFECT');
assert.equal(skillKindLabel(find(funded, TECHNIQUE.AFTERIMAGE)), 'PASSIVE EFFECT');
// Every special is the same kind of thing now: charge-priced, repeatable, and
// named as such wherever the player meets it. WHITEOUT used to be sorted apart
// from MASTER TAKE only because they were limited in different ways.
assert.equal(skillKindLabel(find(funded, TECHNIQUE.WHITEOUT)), 'SPECIAL · COSTS CHARGE');
assert.equal(skillKindLabel(find(funded, TECHNIQUE.MASTER_TAKE)), 'SPECIAL · COSTS CHARGE');

// ── every socket offers exactly one thing, or nothing ───────────────────────
//
// With nothing patched this only ever sees OPEN and NO REACH, which is why it
// has to be run again below over a build that carries something — otherwise it
// is green and blind to the state the pull feature added.
for (const entry of flat(funded)) {
  const offers = !!entry.actions.primary;
  assert.equal(offers, entry.state === SKILL_STATE.AFFORDABLE,
    `${entry.label} offers PATCH exactly when it is open`);
}

// ── buying one moves the tree with it ───────────────────────────────────────
let build = normalizeCombatBuild(null, PIN_SOURCES.encounters);
const before = treeFor(build).pins.unspent;
build = learnCombatTechnique(build, TECHNIQUE.AFTERIMAGE, { hasRig: true }).build;
const after = treeFor(build, true, normalizeCombatBuild(null, PIN_SOURCES.encounters));
assert.equal(find(after, TECHNIQUE.AFTERIMAGE).state, SKILL_STATE.PENDING);
assert.equal(find(after, TECHNIQUE.WHITEOUT).state, SKILL_STATE.AFFORDABLE, 'the chain opens up');
assert.equal(after.pins.unspent, before - 1, 'and it cost a pin');
assert.equal(find(after, TECHNIQUE.AFTERIMAGE).actions.primary.id, 'pull-cable', 'a patched socket offers the lead back, never a second lead');
assert.equal(after.pins.pending, 1, 'the case distinguishes this session from installed modifications');

// ── a patched socket gives the lead back ────────────────────────────────────
//
// The same loop as above, over a build that actually carries something. A
// socket either takes a lead or gives one back; NO REACH does neither.
{
  let run = normalizeCombatBuild(null, PIN_SOURCES.encounters,
    { 'pin.academic': true, 'pin.tower': true, 'pin.gallery': true });
  for (const id of [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT]) {
    run = learnCombatTechnique(run, id, { hasRig: true }).build;
  }
  const tree = treeFor(run);
  for (const entry of flat(tree)) {
    const primary = entry.actions.primary?.id || null;
    const expected = entry.state === SKILL_STATE.LOCKED ? null
      : entry.state === SKILL_STATE.AFFORDABLE ? 'patch-cable' : 'pull-cable';
    assert.equal(primary, expected, `${entry.label} offers the right one thing`);
  }

  // The head of a run warns before it takes the run with it. A lone pull does
  // not — pressing the same key again is the undo, and a modal in front of that
  // would make re-rigging tedious.
  const head = find(tree, TECHNIQUE.AFTERIMAGE);
  const leaf = find(tree, TECHNIQUE.WHITEOUT);
  const confirmOf = (entry) => entry.actionList.find((action) => action.id === 'pull-cable')?.confirm || null;
  assert.ok(confirmOf(head), 'pulling the head of a run asks first');
  assert.equal(confirmOf(leaf), null, 'pulling a leaf does not');
  assert.match(confirmOf(head).body, /WHITEOUT/, 'and the warning names what it drops');
  assert.ok(!/torch\./.test(confirmOf(head).body), 'by name, never by id');
  assert.equal(head.actions.primary.destructive, false,
    'the descriptor owns the confirm; destructive would route to the poorer one');
}

// ── the cable is drawn where the signal runs, not where the tiers are ───────
//
// Four sockets sit under another and are NOT fed by it — ROOM TONE, HEADROOM,
// and the first two rungs of NERVE, which are patched direct. The old drawing
// ran a line into all four.
{
  const tree = treeFor(normalizeCombatBuild(null, PIN_SOURCES.encounters));
  const leadOf = (id) => find(tree, id).lead;
  for (const id of [TECHNIQUE.ROOM_TONE, TECHNIQUE.HEADROOM, TECHNIQUE.BRACE, TECHNIQUE.STEADY_NERVE]) {
    assert.equal(leadOf(id), null, `${find(tree, id).label} is patched direct and takes no cable`);
  }
  // ...and nerve is not chain-free either: its last two rungs are a real run.
  assert.ok(leadOf(TECHNIQUE.RIPOSTE), 'RIPOSTE is fed by STEADY NERVE');
  assert.ok(leadOf(TECHNIQUE.SECOND_WIND), 'SECOND WIND is fed by RIPOSTE');
  assert.equal(leadOf(TECHNIQUE.WHITEOUT).fromTier, 1, 'the cable comes from the prerequisite, not from tier - 1');
  assert.equal(leadOf(TECHNIQUE.WHITEOUT).live, false, 'and it is dark until the run carries');

  let run = normalizeCombatBuild(null, PIN_SOURCES.encounters);
  for (const id of [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT]) {
    run = learnCombatTechnique(run, id, { hasRig: true }).build;
  }
  assert.equal(find(treeFor(run), TECHNIQUE.WHITEOUT).lead.live, true, 'lit once both ends carry');
}

// ── the count on the tab is about the urgent thing ──────────────────────────
assert.match(skillsOf(buildBagModel({ build: normalizeCombatBuild(null, PIN_SOURCES.encounters) })).countLabel, /LEAD/,
  'spare leads are what the tab advertises');
assert.match(skillsOf(buildBagModel({ build, settledBuild: normalizeCombatBuild(null, PIN_SOURCES.encounters) })).countLabel, /LEAD|NEW|PATCHED|PULLED/);

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
