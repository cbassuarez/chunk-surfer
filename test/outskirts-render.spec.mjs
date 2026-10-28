import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { streetSetForMaterial } from '../src/render/props3d.js';

const renderer = await readFile(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
test('the production mirrored submission excludes the rebuilt road and preserves the recorded double', () => {
  const source = renderer.slice(renderer.indexOf('const SOURCE_DOOR_SCENERY='), renderer.indexOf('\nfunction uploadInstances('));
  assert.ok(source.includes('function sourceDoorSceneryInView('),'the production frustum filter is extracted with visibleGroups');
  const skip = renderer.match(/const REFLECTION_SKIP=new Set\([^;]+;/)[0];
  const context = {
    staticInstances: [
      { mesh: 'outskirts_road' }, { mesh: 'yard_road' }, { mesh: 'wet_footprint' },
      { mesh: 'outskirts_bus' }, { mesh: 'player_shadow_figure', reflectionOnly: true, noShadow: true },
    ], dynamicInstances: [], roofWatcherInstances: [], emergencyShadowInstances: [], diagnosticInstances: [],
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

test('folded arrival extinction is batched separately while ordinary and mirrored materials keep their defaults', () => {
  const source = renderer.slice(renderer.indexOf('const SOURCE_DOOR_SCENERY='), renderer.indexOf('\nfunction uploadInstances('));
  const skip = renderer.match(/const REFLECTION_SKIP=new Set\([^;]+;/)[0];
  const context = { staticInstances: [
    { mesh: 'yard_booth', id: 'ground' },
    { mesh: 'yard_booth', id: 'folded', outskirtsFoldVisibility: .5 },
  ], dynamicInstances: [], roofWatcherInstances: [], emergencyShadowInstances: [], diagnosticInstances: [],
    propDiagnosticsEnabled: false, propDiagnosticOptions: null,
    propInstanceVisible: () => true, resolvedMeshName: p => p.mesh };
  vm.createContext(context);
  vm.runInContext(`${skip}\n${source}\nvar main=visibleGroups([0,0,0],90);var wet=visibleGroups([0,0,0],90,{reflection:true});`, context);
  assert.equal(context.main.size, 2, 'upper and ordinary streets inherited the same fog uniform');
  assert.equal(context.main.get('yard_booth')[0].id, 'ground');
  assert.deepEqual([...context.wet.keys()], [...context.main.keys()], 'wet road used a different upper street');
  assert.match(renderer, /const fold=list\[0\]\.outskirtsFoldVisibility;gl\.uniform2f\(U\('uOutskirtsFold'\),Number\.isFinite\(fold\)\?1:0,Number\.isFinite\(fold\)\?fold:1\)/);
  assert.match(renderer, /if\(uOutskirtsFold\.x>\.5\)/, 'ordinary surfaces must not enter the extinction branch');
});
