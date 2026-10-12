import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { streetSetForMaterial } from '../src/render/props3d.js';

const renderer = await readFile(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
test('the production mirrored submission excludes the rebuilt road and preserves the recorded double', () => {
  const source = renderer.slice(renderer.indexOf('function visibleGroups('), renderer.indexOf('\nfunction uploadInstances('));
  const skip = renderer.match(/const REFLECTION_SKIP=new Set\([^;]+;/)[0];
  const context = {
    staticInstances: [
      { mesh: 'outskirts_road' }, { mesh: 'yard_road' }, { mesh: 'wet_footprint' },
      { mesh: 'outskirts_bus' }, { mesh: 'player_shadow_figure', reflectionOnly: true, noShadow: true },
    ], dynamicInstances: [], emergencyShadowInstances: [], diagnosticInstances: [],
    propDiagnosticsEnabled: false, propDiagnosticOptions: null,
    propInstanceVisible: () => true, resolvedMeshName: p => p.mesh,
  };
  vm.createContext(context);
  vm.runInContext(`${skip}\n${source}\nvar mainGroups=visibleGroups([0,0,0],90);var mirrorGroups=visibleGroups([0,0,0],90,{reflection:true});`, context);
  assert.ok(context.mainGroups.has('outskirts_road'));
  assert.ok(!context.mainGroups.has('player_shadow_figure'));
  assert.deepEqual([...context.mirrorGroups.keys()], ['outskirts_bus', 'player_shadow_figure']);
});

test('new close street surfaces use the existing production texture sets', () => {
  assert.equal(streetSetForMaterial('outskirts municipal enamel'), 'rustyPaintedMetal');
  assert.equal(streetSetForMaterial('outskirts ivory coachwork'), 'weatheredRender');
  assert.equal(streetSetForMaterial('outskirts black iron'), 'rustyMetal04');
  assert.equal(streetSetForMaterial('outskirts face in rain'), null, 'skin must retain its own authored material');
});
