import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function productionFunction(name, endMarker, environment) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${name} production extraction boundary exists`);
  return new Function('environment', `with (environment) { return (${main.slice(start, end).trim()}); }`)(environment);
}

function harness({ runtime = null, look = { yaw: 1.2, pitch: -.3 }, px = 144, py = -224, drive = null, pub = null, continuation = null } = {}) {
  const commits = [], calls = [];
  const environment = {
    chunkSurfRuntime: runtime, sourceDriveSession: drive, sourcePubScene: pub, sourceContinuationScene: continuation, px, py,
    commitSourceDrive(){calls.push('drive-checkpoint');return true;},
    commitSourcePub(){calls.push('pub-checkpoint');return true;},
    commitSourceContinuation(){calls.push('continuation-checkpoint');return true;},
    R3: { r3dLookAngles() { calls.push('look'); return look; } },
    saveCommit(patch) { calls.push('commit'); commits.push(structuredClone(patch)); },
    stationRealmLook() { calls.push('station-look'); },
  };
  environment.usingSourceSpace = productionFunction('usingSourceSpace', '\n// THE CAMERA SOURCE', environment);
  environment.sourceCameraPatch = productionFunction('sourceCameraPatch', '\nfunction saveSourceView(', environment);
  return {
    save: productionFunction('saveSourceView', '\n// DROPPING THE SOURCE RUNTIME', environment),
    cameraPatch: environment.sourceCameraPatch, commits, calls,
  };
}

test('ordinary-world pause saves no Source view and never dereferences an absent runtime', () => {
  const h = harness();
  assert.equal(h.save(), false, 'a run-level pause outside Source has no Source state to save');
  assert.deepEqual(h.commits, [], 'ordinary pause must not write Source area, position, state or view');
  assert.deepEqual(h.calls, [], 'the boundary check precedes camera sampling');
});

test('active Source keeps its normal view, position and runtime-state save', () => {
  const calls = [];
  const state = Object.freeze({ stage: 'white-walk', revision: 8 });
  const h = harness({ runtime: { state() { calls.push('state'); return state; } } });
  assert.equal(h.save(), true);
  assert.deepEqual(h.commits, [{ sourceView: { yaw: 1.2, pitch: -.3, x: 144, y: -224 }, px: 144, py: -224, chunkSurf: state, area: 'source-space' }]);
  assert.deepEqual(calls, ['state']);
  assert.deepEqual(h.calls, ['look', 'commit']);
});

test('active Source with no usable camera patch retains its previous no-save semantics', () => {
  for (const look of [null, {}, { yaw: NaN, pitch: 0 }, { yaw: 0, pitch: Infinity }]) {
    let stateReads = 0;
    const h = harness({ runtime: { state() { stateReads++; return {}; } }, look });
    assert.equal(h.save(), false);
    assert.deepEqual(h.commits, []);
    assert.equal(stateReads, 0, 'a missing camera patch does not change runtime state or commit a replacement view');
  }
});

test('active station realm keeps its dedicated look update and existing state save without a Source-camera patch', () => {
  const state = { stationRealm: { live: true } };
  const h = harness({ runtime: { stationRealmFrame() { return { realm: 'station' }; }, state() { h.calls.push('state'); return state; } } });
  assert.equal(h.save(), true);
  assert.deepEqual(h.calls, ['station-look', 'state', 'commit']);
  assert.deepEqual(h.commits, [{ px: 144, py: -224, chunkSurf: state, area: 'source-space' }]);
  assert.equal(Object.hasOwn(h.commits[0], 'sourceView'), false);
});

test('the actual camera-patch helper retains optional anchors and station exclusion', () => {
  const normal = harness({ runtime: {} });
  assert.deepEqual(normal.cameraPatch(), { sourceView: { yaw: 1.2, pitch: -.3 } });
  assert.deepEqual(normal.cameraPatch(0, 0), { sourceView: { yaw: 1.2, pitch: -.3, x: 0, y: 0 } });
  const station = harness({ runtime: { stationRealmFrame: () => ({}) } });
  assert.deepEqual(station.cameraPatch(0, 0), {});
  assert.deepEqual(station.calls, [], 'station view is not sampled through the ordinary Source camera');
});


test('car presentation saves its vehicle checkpoint without stamping its look onto the held exterior body',()=>{
 const h=harness({runtime:{state(){throw Error('The ordinary view save must not run');}},drive:{}});
 assert.deepEqual(h.cameraPatch(144,-224),{});
 assert.equal(h.save(),true);
 assert.deepEqual(h.calls,['drive-checkpoint']);
 assert.deepEqual(h.commits,[]);
});


test('Source pub saves its local checkpoint while preserving the exterior camera anchor',()=>{
 const checkpoint={stage:2,task:1,x:18.25,z:1.25,yaw:-2.3,pitch:.4,returnPose:{x:144,y:-224,yaw:1.2,pitch:-.3}};
 const h=harness({runtime:{state(){throw Error('A borrowed bar camera must not rewrite ordinary Source state');}},pub:{serialize:()=>checkpoint},look:{yaw:-2.3,pitch:.4}});
 assert.deepEqual(h.cameraPatch(144,-224),{},'the bar gaze must never be stamped onto its held exterior position');
 assert.equal(h.save(),true);assert.deepEqual(h.calls,['pub-checkpoint']);assert.deepEqual(h.commits,[]);
 assert.deepEqual(checkpoint.returnPose,{x:144,y:-224,yaw:1.2,pitch:-.3});
});
