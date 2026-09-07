import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBagModel } from '../src/game/bag-model.js';
import { PIN_SOURCES, TECHNIQUE_DEFS, learnCombatTechnique, normalizeCombatBuild } from '../src/game/combat-progression.js';
import { patchBayLayout } from '../src/render/bag-skills.js';
import { PATCH_COLORS, drawPatchCable, drawPatchLabel, drawPatchRack, drawPatchSocket, patchCableCurve } from '../src/render/patchbay-material.js';

function layout(build = null, region = { x: 2, y: 4, w: 96, h: 26 }) {
  const tree = buildBagModel({ build, hasRig: true }).sections.find((section) => section.id === 'skills').tree;
  return patchBayLayout({ region, branches: tree.branches, maxTier: tree.maxTier });
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
    assert.ok(bay.detail.y + bay.detail.h <= region.y + region.h + 1e-9);
    assert.ok(bay.returnZone.x >= region.x);
    assert.ok(bay.returnZone.x + bay.returnZone.w <= region.x + region.w);
    assert.ok(bay.returnZone.y + bay.returnZone.h <= bay.treeTop);
    for (const socket of bay.sockets) {
      assert.ok(socket.hit.x >= region.x, `${socket.id}: hit stays inside left rack edge`);
      assert.ok(socket.hit.x + socket.hit.w <= region.x + region.w);
      assert.ok(socket.hit.y >= bay.treeTop);
      assert.ok(socket.hit.y + socket.hit.h <= bay.detail.y);
      assert.ok(socket.hit.w > socket.rX * 2);
      assert.ok(socket.hit.h > socket.rY * 2);
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

test('skills body has no lamp-button renderer and shows only the live routed leads', () => {
  const source = readFileSync(new URL('../src/render/bag-skills.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /drawLampButton|drawButtonCluster/);
  assert.match(source, /for \(const cable of tree\.cables\)/);
  assert.match(source, /patchDrag\?\.rerouteId === cable\.skillId/);
  assert.match(source, /SPARES \/ RETURN LEAD/);
  assert.match(source, /DRAG MATCHING SEND TO INPUT/);
});
