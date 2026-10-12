import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { REALM_POCKETS } from '../src/data/realm-pockets.js';
import { stationRealmFloor, stationRealmCanOccupy } from '../src/game/station-realms.js';
import { HOME_WINDOW, realmCameraPosition, realmPocketBoxes, homeRealmAcquisition } from '../src/render/realm-pocket-geometry.js';
import { createRealmEyeInterpolator } from '../src/render/realm-eye.js';

test('realm eye heights follow the same authored support tops as body collision', () => {
  for (const pocket of REALM_POCKETS) {
    for (const support of pocket.supports) {
      const [x, , z] = support.center;
      const floor = stationRealmFloor(pocket.variant, x, z);
      assert.notEqual(floor, null);
      assert.deepEqual(realmCameraPosition({ variant: pocket.variant, pose: { x, z }, eyeHeight: pocket.eyeHeight }),
        [x, floor + pocket.eyeHeight, z], `${pocket.world}/${support.id} renders a different floor`);
    }
    const boxes = realmPocketBoxes(pocket.variant);
    assert.equal(boxes.length, pocket.supports.length + pocket.solids.length);
    boxes[0].center[0] += 999;
    assert.notEqual(boxes[0].center[0], pocket.supports[0].center[0], 'render preparation mutated the collision definition');
  }
});

function renderHarness() {
  const source = readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  const begin = source.indexOf('export function renderSourceCrossing(');
  assert.ok(begin >= 0);
  const uniforms = new Map(); let draws = 0, blending = false;
  const gl = new Proxy({ isProgram: () => true, drawArrays() { draws++; },
    BLEND:'blend',enable(cap){if(cap==='blend')blending=true;},disable(cap){if(cap==='blend')blending=false;},
    uniform1f: (name, ...value) => uniforms.set(name, value), uniform2f: (name, ...value) => uniforms.set(name, value),
    uniform3f: (name, ...value) => uniforms.set(name, value), uniform4f: (name, ...value) => uniforms.set(name, value),
    uniform3fv: (name, value) => uniforms.set(name, Array.from(value)),
  }, { get: (target, key) => target[key] || (() => {}) });
  const sandbox = { gl, crossingProgram: {}, crossingVao: {}, CU: (name) => name, realmCameraPosition,homeRealmAcquisition,
    realmEyeInterpolator: createRealmEyeInterpolator() };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(begin).replace('export function', 'function') + '\nglobalThis.render=renderSourceCrossing;', sandbox);
  return { render: sandbox.render, uniforms, get draws() { return draws; },get blending(){return blending;} };
}

test('coherent home carries acquisition depth with blending off; entry and departure retain fade opacity', () => {
  const h=renderHarness(),realm={variant:5,stage:'inside',pose:{x:.4,z:69.2,yaw:.2,pitch:-.1},home:{eligible:true},decoherence:0};
  h.render({realm,variant:5,reveal:1});
  assert.deepEqual(h.uniforms.get('uRealmDepth'),[1]);
  assert.equal(h.blending,false,'packed depth must never be interpreted as transparency');
  for(const change of [{reveal:.8},{realm:{...realm,stage:'returning'}},{realm:{...realm,decoherence:.2}},{variant:4}]){
    h.render({realm,variant:5,reveal:1,...change});
    assert.deepEqual(h.uniforms.get('uRealmDepth'),[0]);
  }
});

test('home acquisition uses the physical realm eye and matching mirrored ray convention', () => {
  const realm={variant:5,stage:'inside',pose:{x:.4,z:69.2,yaw:.2,pitch:-.1,floorY:0},home:{eligible:true},decoherence:0};
  const a=homeRealmAcquisition({realm,reveal:1});
  assert.deepEqual(a.cameraMetres,[-.4,1.62,69.2]);
  const f=[Math.sin(a.yaw),a.pitch,-Math.cos(a.yaw)],length=Math.hypot(...f);
  const expected=[-Math.sin(.2)*Math.cos(.1),-Math.sin(.1),Math.cos(.2)*Math.cos(.1)];
  f.forEach((v,i)=>assert.ok(Math.abs(v/length-expected[i])<1e-12));
  assert.equal(homeRealmAcquisition({realm:{...realm,home:{eligible:false}},reveal:1}),null);
});

test('the side scour lowers the rendered eye and acquisition together while the upstairs approach stays level', () => {
  for(const [x,z] of [[-2.65,72],[6.2,73.1]]){
    const floor=stationRealmFloor(5,x,z);
    assert.ok(floor<-.8,'the lower-storey viewing space must have real depressed ground');
    const realm={variant:5,stage:'inside',pose:{x,z,yaw:0,pitch:0},home:{eligible:true},decoherence:0};
    const eye=realmCameraPosition(realm);
    assert.deepEqual(eye,[x,floor+REALM_POCKETS[5].eyeHeight,z]);
    assert.deepEqual(homeRealmAcquisition({realm,reveal:1}).cameraMetres,[-x,eye[1],z]);
    realm.pose.floorY=floor;
    assert.deepEqual(realmCameraPosition(realm),eye,'saved-frame floor and renderer support lookup must agree');
  }
  for(const z of [1,40,58,66.7,69.2]){
    assert.equal(realmCameraPosition({variant:5,pose:{x:0,z}})[1],REALM_POCKETS[5].eyeHeight,
      'no hidden climb should explain reaching the upstairs pane');
  }
});

test('the production crossing pass uploads actual position, sideways gaze and window state, then clears them for legacy crossings', () => {
  const h = renderHarness(), realm = { variant: 5, pose: { x: 1, z: 67, floorY: 0 }, eyeHeight: 1.62,
    decoherence: .4, home: { eligible: true, fold: 1 } };
  assert.equal(h.render({ reveal: 1, variant: 5, dir: [1, 0], pitch: 0, realm,
    homePresentation: { attention: .7 }, torchPower: 1, timeSec: 31 }), true);
  assert.deepEqual(h.uniforms.get('uRealmEye'), [1, 1.62, 67]);
  assert.deepEqual(h.uniforms.get('uDir'), [1, 0], 'a sideways look was silently changed into a diagonal look');
  assert.deepEqual(h.uniforms.get('uRealmView'), [1, 0, 0]);
  assert.deepEqual(h.uniforms.get('uHomeState'), [1, .7, .7, 1]);
  assert.deepEqual(h.uniforms.get('uTime'), [31]);
  realm.pose.x = -1;
  h.render({ reveal: 1, variant: 5, realm, reducedMotion: true, timeSec: 31 });
  assert.deepEqual(h.uniforms.get('uRealmEye'), [-1, 1.62, 67], 'lateral walking did not move the rendering camera');
  assert.deepEqual(h.uniforms.get('uTime'), [0]);
  h.render({ reveal: 1, variant: 6 });
  assert.deepEqual(h.uniforms.get('uRealmActive'), [0]);
  assert.deepEqual(h.uniforms.get('uRealmDecoherence'), [0]);
  assert.deepEqual(h.uniforms.get('uHomeState'), [0, 0, 0, 0]);
  assert.equal(h.draws, 3);
});

test('realm eye follows a body step within 45ms while look stays immediate in the production pass', () => {
  const h = renderHarness(), realm = { variant: 5, startedAt: 1, pose: { x: 0, z: 67, floorY: 0 } };
  h.render({ reveal: 1, realm, realmId: 'home', frameTimeSec: 1 });
  realm.pose.x = .085;
  h.render({ reveal: 1, realm, realmId: 'home', frameTimeSec: 1.045, dir: [1, 0] });
  assert.deepEqual(h.uniforms.get('uRealmEye'), [0, 1.62, 67]);
  assert.deepEqual(h.uniforms.get('uRealmView'), [1, 0, 0], 'position smoothing delayed the new gaze');
  h.render({ reveal: 1, realm, realmId: 'home', frameTimeSec: 1.0675 });
  assert.ok(Math.abs(h.uniforms.get('uRealmEye')[0] - .0425) < 1e-9);
  h.render({ reveal: 1, realm, realmId: 'home', frameTimeSec: 1.09 });
  assert.deepEqual(h.uniforms.get('uRealmEye'), [.085, 1.62, 67]);
});

test('realm eye segments remain bounded and reset for replacement, teleport and teardown', () => {
  const eye = createRealmEyeInterpolator();
  assert.deepEqual(eye.position('first', [0, 1.62, 0], 1), [0, 1.62, 0]);
  eye.position('first', [.085, 1.62, 0], 1.045);
  const before = eye.position('first', [.17, 1.62, 0], 1.0675);
  assert.ok(Math.abs(before[0] - .0425) < 1e-9, 'retarget jumped to the previous body position');
  for (const time of [1.08, 1.10, 1.12, 5]) {
    const position = eye.position('first', [.17, 1.62, 0], time);
    assert.ok(position[0] >= before[0] && position[0] <= .17, 'camera overshot the collision-owned path');
  }
  assert.deepEqual(eye.position('next-crossing', [.20, 1.62, 0], 5.01), [.20, 1.62, 0]);
  assert.deepEqual(eye.position('next-crossing', [0, 1.62, 67], 5.02), [0, 1.62, 67]);
  eye.position('next-crossing', [.085, 1.62, 67], 5.03);
  eye.reset();
  assert.deepEqual(eye.position('next-crossing', [.085, 1.62, 67], 5.04), [.085, 1.62, 67]);
  assert.deepEqual(eye.position('next-crossing', [.1, 1.62, 67], 1), [.1, 1.62, 67], 'clock rewind retained a stale eye');
});

test('the physical window shares the runtime wall position and remains closed to the body', () => {
  const home = REALM_POCKETS[5].home;
  assert.deepEqual(HOME_WINDOW, home.window);
  assert.equal(HOME_WINDOW.z, home.wallZ);
  assert.equal(stationRealmCanOccupy(5, HOME_WINDOW.x, HOME_WINDOW.z, 0), false);
  assert.equal(stationRealmCanOccupy(5, HOME_WINDOW.x, HOME_WINDOW.z - 1, 0), true);
  assert.ok(HOME_WINDOW.bottom < REALM_POCKETS[5].eyeHeight && HOME_WINDOW.top > REALM_POCKETS[5].eyeHeight,
    'the standing outside camera cannot look through the actual aperture');
});
