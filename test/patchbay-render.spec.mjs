import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBagModel } from '../src/game/bag-model.js';
import { PIN_SOURCES, TECHNIQUE_DEFS, learnCombatTechnique, normalizeCombatBuild } from '../src/game/combat-progression.js';
import { patchBayLayout } from '../src/render/bag-skills.js';
import { PATCH_LCD_GLYPHS } from '../src/render/patch-lcd-glyphs.js';
import { patchInstrumentState } from '../src/render/patch-channel-strip.js';
import { channelLcdState, skillLcdState } from '../src/render/patch-lcd.js';
import { PATCH_COLORS, drawPatchCable, drawPatchLabel, drawPatchRack, drawPatchSocket, patchCableCurve } from '../src/render/patchbay-material.js';

function layout(build = null, region = { x: 2, y: 4, w: 96, h: 26 }) {
  const tree = buildBagModel({ build, hasRig: true }).sections.find((section) => section.id === 'skills').tree;
  return patchBayLayout({ region, branches: tree.branches });
}

test('every skill has one coloured input and only installed skills have an output', () => {
  const empty = layout();
  assert.equal(empty.nodes.length, TECHNIQUE_DEFS.length);
  assert.equal(empty.inputs.length, TECHNIQUE_DEFS.length);
  assert.equal(empty.outputs.length, 0);
  assert.equal(empty.sources.length, 6);
  assert.equal(empty.cables.length, 0, 'an unowned skill never draws a speculative cable');
  assert.equal(new Set(Object.values(PATCH_COLORS)).size, 6);
  for (const node of empty.nodes) {
    assert.equal(node.input.techniqueId, node.techniqueId);
    assert.equal(node.input.skillId, node.id);
    assert.equal(node.input.kind, 'input');
    assert.equal(node.output, null);
    assert.ok(PATCH_COLORS[node.branch]);
    assert.equal(node.input.branch, node.branch);
  }
  let build = normalizeCombatBuild(null, PIN_SOURCES.encounters);
  const head = TECHNIQUE_DEFS.find((entry) => entry.branch === 'torch' && !entry.requires);
  const next = TECHNIQUE_DEFS.find((entry) => entry.requires === head.id);
  for (const entry of [head, next]) build = learnCombatTechnique(build, entry.id, { hasRig: true }).build;
  const installed = layout(build);
  assert.equal(installed.outputs.length, build.techniques.length);
  assert.equal(installed.cables.length, build.techniques.length);
  assert.ok(installed.cables.every((cable) => cable.from.branch === cable.to.branch));
});

test('lead topology follows real prerequisites and never the row immediately above', () => {
  let build = normalizeCombatBuild(null, PIN_SOURCES.encounters, {
    'pin.academic': true, 'pin.tower': true, 'pin.gallery': true,
  });
  const root = TECHNIQUE_DEFS.find((entry) => entry.branch === 'torch' && !entry.requires);
  const dependent = TECHNIQUE_DEFS.find((entry) => entry.requires === root.id);
  const direct = TECHNIQUE_DEFS.find((entry) => entry.branch === 'nerve' && entry.tier === 2);
  for (const entry of [root, dependent, direct]) build = learnCombatTechnique(build, entry.id, { hasRig: true }).build;
  const bay = layout(build);
  const lead = (id) => bay.cables.find((cable) => cable.to.techniqueId === id);
  assert.equal(lead(root.id).from.id, 'supply:torch');
  assert.equal(lead(dependent.id).from.techniqueId, root.id);
  assert.equal(lead(direct.id).from.id, 'supply:nerve');
  assert.equal(lead(dependent.id).to.kind, 'input');
  assert.equal(lead(dependent.id).from.kind, 'output');
});

test('rack sockets and return tray stay recoverable at wide and compact sizes', () => {
  for (const region of [
    { x: 2, y: 4, w: 96, h: 26 }, { x: 0, y: 0, w: 60, h: 14 }, { x: 0, y: 0, w: 34, h: 10 },
  ]) {
    const bay = layout(null, region);
    const { rack, detail, tray, side } = bay.strip;
    const inside = (box, outer) => {
      const epsilon = 1e-9;
      return box.x >= outer.x - epsilon && box.y >= outer.y - epsilon
        && box.x + box.w <= outer.x + outer.w + epsilon
        && box.y + box.h <= outer.y + outer.h + epsilon;
    };
    assert.ok(inside(rack, region) && inside(detail, region));
    assert.ok(inside(tray, detail));
    assert.ok(side ? rack.x + rack.w < detail.x : rack.y + rack.h < detail.y);
    for (const socket of bay.sockets) {
      assert.ok(inside(socket.hit, rack), `${socket.id}: target stays inside the rack`);
      assert.ok(inside({ x: socket.x, y: socket.y, w: 0, h: 0 }, socket.hit));
    }
    for (const node of bay.nodes) {
      const [left,right]=[node.input.hit,node.outPosition.hit].sort((a,b)=>a.x-b.x);
      assert.ok(left.x + left.w < right.x,`${node.id}: the two contacts never overlap`);
    }
  }
});

function probe() {
  const calls = [], state = { globalAlpha: .8, shadowBlur: 0 }, stack = [];
  const gradient = () => ({ addColorStop() {} });
  const methods = { save() { stack.push({ ...state }); }, restore() { Object.assign(state, stack.pop()); }, createLinearGradient: gradient, createRadialGradient: gradient };
  const ctx = new Proxy(state, { get(target, key) {
    return methods[key] || target[key] || ((...args) => calls.push({ key, args, state: { ...state } }));
  }, set(target, key, value) { target[key] = value; return true; } });
  return { ctx, calls, state };
}

test('material primitives form nickel throats, continuous rack metal and solid hanging cables', () => {
  const p = probe();
  drawPatchRack(p.ctx, 0, 0, 700, 48, { dpr: 1 });
  drawPatchSocket(p.ctx, 50, 30, 7, { color: PATCH_COLORS.torch });
  drawPatchCable(p.ctx, { x: 50, y: 30 }, { x: 90, y: 90 }, { color: PATCH_COLORS.torch });
  drawPatchLabel(p.ctx, 20, 5, 90, 15);
  assert.ok(p.calls.filter((call) => call.key === 'arc').length >= 8, 'jack mouth has several real concentric bevels');
  assert.ok(p.calls.some((call) => call.key === 'bezierCurveTo'), 'leads hang under their own apparent weight');
  assert.ok(!p.calls.some((call) => call.key === 'setLineDash'), 'no hypothetical topology is drawn');
  assert.ok(!p.calls.some((call) => ['drawImage', 'getImageData'].includes(call.key)), 'no per-frame texture readback');
  assert.equal(p.state.globalAlpha, .8, 'passive material respects parent transparency');
  const curve = patchCableCurve({ x: 10, y: 20 }, { x: 80, y: 100 });
  assert.deepEqual(curve.from, { x: 10, y: 20 });
  assert.deepEqual(curve.to, { x: 80, y: 100 });
  assert.ok(curve.c2.y > curve.to.y, 'the loose lead bows below its destination');
});

test('the Skills panel has a single renderer with routed leads and a return tray', () => {
  const source = readFileSync(new URL('../src/render/bag-skills.js', import.meta.url), 'utf8');
  const strip = readFileSync(new URL('../src/render/patch-channel-strip.js', import.meta.url), 'utf8');
  assert.match(source, /uiDraw\(surface => drawChannelStripBay\(/);
  assert.doesNotMatch(source, /drawLampButton|drawButtonCluster|drawAlternate|\blook\b/);
  assert.match(strip, /for\(const cable of tree\.cables\)/);
  assert.match(strip, /RETURN TO SPARES/);
});

test('every skill and idle channel has a distinct LCD glyph', () => {
  const ids = [...new Set(TECHNIQUE_DEFS.map(entry => entry.branch)), ...TECHNIQUE_DEFS.map(entry => entry.id)];
  const glyphs = ids.map(id => {
    const glyph = PATCH_LCD_GLYPHS[id];
    assert.equal(glyph?.length, 9, id);
    assert.ok(glyph.every(row => /^[.#]{11}$/.test(row)), id);
    return glyph.join('');
  });
  assert.equal(new Set(glyphs).size, ids.length);
});

test('the channel LCD follows fitted skills in the current case draft', () => {
  const id = 'skill:torch.whiteout';
  const entries = [
    { id: 'skill:torch.afterimage', techniqueId: 'torch.afterimage', tier: 1, owned: true },
    { id, techniqueId: 'torch.whiteout', tier: 2, owned: true, pending: true },
    { id: 'skill:torch.overexpose', techniqueId: 'torch.overexpose', tier: 3, enabled: true },
  ];
  assert.deepEqual(channelLcdState('torch', entries, entries[0].id),
    { glyph: 'torch.afterimage', state: 'patched' });
  assert.deepEqual(channelLcdState('torch', entries, entries[2].id),
    { glyph: 'torch.whiteout', state: 'pending' });
  assert.deepEqual(channelLcdState('torch', entries.slice(2), null),
    { glyph: 'torch', state: 'idle' });
  assert.equal(skillLcdState(entries[2]), 'ready');
});

test('a one-for-one lead swap marks both edits without changing lead stock', () => {
  const stock = { b3LeadEarned: true, rewardedFlags: ['pin.academic'] };
  const settledBuild = normalizeCombatBuild({ ...stock, techniques: ['recorder.room-tone'] });
  const build = normalizeCombatBuild({ ...stock, techniques: ['radio.misdirection'] });
  const model = buildBagModel({ build, settledBuild });
  const section = model.sections.find(item => item.id === 'skills');
  assert.equal(section.tree.pins.spent, 1);
  assert.equal(section.tree.pins.unspent, 1);
  assert.match(section.countLabel, /1 NEW.*1 PULLED/);
  const edit = patchInstrumentState(section.tree.pins);
  assert.equal(edit.edited, true);
  assert.equal(edit.changes, '+1 NEW / -1 PULLED');
  assert.equal(edit.message, 'CLOSE CASE TO APPLY');
  const reopened = buildBagModel({ build }).sections.find(item => item.id === 'skills');
  assert.equal(patchInstrumentState(reopened.tree.pins).edited, false);
});

test('route witnesses describe the current gesture and clear after release or cancel', () => {
  const pins = { pending: 0, pulled: 0 };
  const valid = patchInstrumentState(pins, { targetId: 'input', valid: true });
  assert.equal(valid.matched, true);
  assert.equal(valid.fault, false);
  const invalid = patchInstrumentState(pins, { targetId: 'input', valid: false });
  assert.equal(invalid.fault, true);
  assert.equal(invalid.matched, false);
  const tray = patchInstrumentState(pins, { returnHover: true, valid: true });
  assert.equal(tray.message, 'RELEASE TO RETURN');
  assert.equal(tray.matched, false);
  assert.equal(tray.fault, false);
  const idle = patchInstrumentState(pins);
  assert.equal(idle.fault, false);
  assert.equal(idle.message, '');
});


test('the bypass has a dedicated pair of contacts and no standard output socket', () => {
  const funded = normalizeCombatBuild(null, PIN_SOURCES.encounters);
  const rig = learnCombatTechnique(funded,'rig.overdub',{hasRig:true}).build;
  const live = learnCombatTechnique(rig,'rig.return-bridge',{hasRig:true}).build;
  const bay = layout(live);
  const node = bay.nodes.find(node => node.techniqueId === 'rig.return-bridge');
  assert.equal(node.output, null);
  assert.ok(node.feed.x < node.input.x);
  assert.deepEqual(bay.terminals,[node.feed]);
  assert.equal(bay.cables.find(cable => cable.skillId === node.id).from.id,node.feed.id);
});
