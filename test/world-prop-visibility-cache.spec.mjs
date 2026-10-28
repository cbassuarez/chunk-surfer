import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { OUTDOOR_ZONES, ZONE,CELL } from '../src/data/floorplan/legend.js';
import {buildingWindowForExteriorObserver} from '../src/world/building-window-views.js';
import { districtLogicalAt } from '../src/data/exterior-district.js';
import { worldPropVisibilityKey } from '../src/game/prop-visibility.js';
import { exteriorRoofArchitectureInstances, exteriorRooflineInstance, EXTERIOR_ROOF_ARCHITECTURE_IDS } from '../src/data/exterior-roofline.js';
import { createHallChandelierRuntime } from '../src/game/hall-chandelier-runtime.js';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
FP.setDoorOpen('stationers-entry', true);
const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const begin = source.indexOf('function render3d(){');
const end = source.indexOf('  // Emergency lamps are a small dynamic layer.', begin);
assert.ok(begin >= 0 && end > begin);
const renderCacheSource = source.slice(begin, end) + '\n}';
const bodyAt = (x, z) => {
  const p = districtLogicalAt(x - .25, z - .25);
  return { x: p.x * 2, y: p.y * 2 };
};
const roofHosts = PROPS.renderInstances({ group: 'academicRoof', inscriptions: false });

test('static visibility keys separate room, civic interior and outdoor roof contexts without depending on a height band', () => {
  const ground = zone => worldPropVisibilityKey({ group: 'ground', zone });
  for (const zone of OUTDOOR_ZONES) assert.equal(ground(zone), ground(ZONE.dock));
  assert.equal(ground(ZONE.pub), ground(ZONE.stationers));
  assert.notEqual(ground(ZONE.getIn), ground(ZONE.stationers), 'same ground group still changes envelope filtering');
  assert.notEqual(ground(ZONE.stationers), ground(ZONE.street), 'civic interiors do not request the outdoor roof import');
  assert.notEqual(ground(ZONE.getIn), ground(ZONE.street));
  assert.notEqual(worldPropVisibilityKey({ group: 'upper', zone: ZONE.getIn }), ground(ZONE.getIn));
  assert.equal(worldPropVisibilityKey({ group: 'ground', zone: ZONE.street, height: 0 }),
    worldPropVisibilityKey({ group: 'ground', zone: ZONE.street, height: .25 }), 'a texture-height band alone must not rebuild props');
});

function makeFrameHost(position) {
  const submissions = [], planUploads = [];
  const chandelierContext = { runId: 'visibility-cache', eligible: false, consumedCount: 0 }, chandelierEvents = [];
  const initialSlice = FP.physicalRenderPlanFor(position.x, position.y);
  const scope = {
    FP, px: position.x, py: position.y,
    apparitionApplauseBlocked: () => false,
    ensureLensStarted() {}, params: () => new URLSearchParams(), sourceDoorArrival: null,
    usingSourceSpace: () => false, towerViewCaptureWanted: false,
    scenes: { worldView: () => null }, openingVehicleScene: null,
    currentEndingApproach: () => null, activeEndingCutscene: null, escape: null,
    usingSpecialSpace: () => false, usingPlan: () => true, usingStairAnomaly: () => false,
    storyMode: false, renderedPlayerPoint: () => ({}),
    r3dCache: { physicalKey: initialSlice.key, physicalGroup: initialSlice.group },
    worldPropVisibilityKey, renderedWorldPropVisibilityKey: '',
    storyGuidanceHighlightRenderKey: 'false:::0.00',
    R3: { r3dSetPlan: (...args) => planUploads.push(args), r3dSetProps: instances => submissions.push(instances) },
  };
  scope.currentExteriorWindow=()=>{
    const point=FP.logicalToPhysical(scope.px,scope.py);
    return buildingWindowForExteriorObserver({x:point.x*CELL,z:point.z*CELL,y:point.y,zone:FP.zoneAt(scope.px,scope.py)});
  };
  scope.hallChandelierRuntime = createHallChandelierRuntime({
    readContext: () => chandelierContext, budgetReady: () => true,
    reserveBudget: () => { chandelierEvents.push('reserve'); return true; },
    persistConsumed: count => { chandelierContext.consumedCount = count; chandelierEvents.push(['save', count]); return true; },
  });
  // Only the submission callback is a test seam. The frame/cache conditions
  // above it execute directly from production. Real props and roof selectors
  // establish why the stale submission differs after an ordinary crossing.
  scope.worldRenderInstances = group => {
    const zone = FP.zoneAt(scope.px, scope.py), closure = exteriorRooflineInstance({ group, zone });
    scope.renderedWorldPropVisibilityKey = worldPropVisibilityKey({ group, zone,exteriorWindowId:scope.currentExteriorWindow()?.id });
    return [...exteriorRoofArchitectureInstances(roofHosts, { group, zone }), ...(closure ? [closure] : [])];
  };
  submissions.push(scope.worldRenderInstances(initialSlice.group)); // normal load/resume submission
  const render = new Function('scope', `with(scope){return (${renderCacheSource});}`)(scope);
  return { scope, submissions, planUploads, render, chandelierContext, chandelierEvents };
}

test('the actual render boundary cancels a protected Hall glow without earning time or starting another episode', () => {
  const host = makeFrameHost(bodyAt(23.75, -17.25)), runtime = host.scope.hallChandelierRuntime;
  host.render();
  assert.equal(runtime.view().reason, 'outside-hall');
  assert.equal(runtime.view().eligibleSeconds, 0);
  host.chandelierContext.eligible = true;
  runtime.configureReview({ firstQuietSeconds: [.01, .01] });
  runtime.tick(.02); runtime.tick(.2);
  assert.ok(runtime.view().active && runtime.view().power > 0, 'negative control: a real emitted glow is live');
  assert.deepEqual(host.chandelierEvents, ['reserve', ['save', 1]]);
  host.chandelierContext.paused = true;
  host.render();
  assert.equal(runtime.view().active, false);
  assert.equal(runtime.view().power, 0);
  assert.equal(runtime.view().reason, 'paused');
  host.chandelierContext.paused = false;
  host.render();
  assert.equal(runtime.view().eligibleSeconds, 0, 'render guards cannot advance the quiet clock');
  assert.deepEqual(host.chandelierEvents, ['reserve', ['save', 1]], 'rendering cannot reserve or persist another episode');
});

test('actual frame cache repairs an indoor resume when ordinary accepted ground steps leave and return to the shop', () => {
  const start = bodyAt(23.75, -17.25), host = makeFrameHost(start);
  const route = [-17.25, -16.75, -16.25, -15.75, -15.25, -14.75, -14.25, -13.75].map(z => bodyAt(23.75, z));
  assert.equal(FP.zoneAt(start.x, start.y), ZONE.stationers);
  assert.deepEqual(host.submissions[0], [], 'resume inside really omits outdoor roof construction');
  const steps = [...route.slice(1), ...route.slice(0, -1).reverse()];
  let contextChanges = 0, oldKey = host.scope.renderedWorldPropVisibilityKey;
  for (const next of steps) {
    const from = { x: host.scope.px, y: host.scope.py };
    const move = FP.canStep(from.x, from.y, next.x, next.y, { keys: new Set() });
    assert.equal(move.ok, true, 'the fixture uses a real accepted ordinary movement step');
    assert.equal(move.redirect, undefined, 'this shop is reached without a test warp or portal refresh');
    assert.equal(PROPS.propCanOccupy(next.x, next.y, { from }), true);
    host.scope.px = next.x; host.scope.py = next.y;
    const zone = FP.zoneAt(next.x, next.y), slice = FP.physicalRenderPlanFor(next.x, next.y);
    assert.equal(slice.group, 'ground', 'render group never changes, preserving the original stale-cache trigger');
    const expectedKey = worldPropVisibilityKey({ group: slice.group, zone });
    if (expectedKey !== oldKey) contextChanges++;
    oldKey = expectedKey;
    const before = host.submissions.length;
    host.render();
    assert.equal(host.submissions.length - before, expectedKey === worldPropVisibilityKey({ group: 'ground', zone: FP.zoneAt(from.x, from.y) }) ? 0 : 1,
      'exactly one static rebuild occurs when visibility dependencies change');
    assert.equal(host.scope.renderedWorldPropVisibilityKey, expectedKey);
    const ids = host.submissions.at(-1).map(instance => instance.id);
    const expected = exteriorRoofArchitectureInstances(roofHosts, { group: 'ground', zone }).map(instance => instance.id);
    assert.deepEqual(ids.filter(id => EXTERIOR_ROOF_ARCHITECTURE_IDS.includes(id)), expected,
      'outdoor roof geometry must not remain absent after an indoor resume');
  }
  assert.equal(contextChanges, 2);
  assert.equal(host.submissions.length, 3, 'one resume, one exterior crossing and one interior return');
  assert.deepEqual(host.submissions.at(-1), []);
});

test('a changed visibility context also refreshes without a different slice texture key', () => {
  const host = makeFrameHost(bodyAt(23.75, -17.25));
  const outside = bodyAt(23.75, -13.75);
  host.scope.px = outside.x; host.scope.py = outside.y;
  const slice = FP.physicalRenderPlanFor(outside.x, outside.y);
  host.scope.r3dCache.physicalKey = slice.key;
  host.scope.r3dCache.physicalGroup = slice.group;
  host.render();
  assert.equal(host.submissions.length, 2, 'visibility cannot depend on the plan-texture invalidation happening first');
  assert.deepEqual(host.submissions.at(-1).filter(instance => EXTERIOR_ROOF_ARCHITECTURE_IDS.includes(instance.id)).map(instance => instance.id),
    EXTERIOR_ROOF_ARCHITECTURE_IDS);
  host.render();
  assert.equal(host.submissions.length, 2, 'the repaired context remains cached on an unchanged frame');
});
