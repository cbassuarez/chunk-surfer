import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OUTSKIRTS_BUS_PASSAGE as BUS } from '../src/data/outskirts-bus-passage.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { OUTSKIRTS_BUS_RAIN_GLSL, outskirtsBusRainUniforms, trimOutskirtsBusRain, outskirtsBusInteriorLightMix } from '../src/render/outskirts-bus-weather.js';
import { busPassageLampPower } from '../src/game/outskirts-bus-passage.js';

const EPSILON = .0001;
const near = (a, b, why = '') => assert.ok(Math.abs(a - b) < EPSILON, `${why}: ${a} != ${b}`);
const uniforms = (yaw = 0) => outskirtsBusRainUniforms({ centreXCells: 200, centreZCells: -600, baseYCells: 30.4, yaw });
const point = (u, x, y, z) => [u.uBusRainRoof[0] + 2 * (x * u.uBusRainFrame[0] + z * u.uBusRainFrame[1]),
  u.uBusRainRoof[2] + 2 * y, u.uBusRainRoof[1] + 2 * (-x * u.uBusRainFrame[1] + z * u.uBusRainFrame[0])];
const local = (u, p) => {
  const x = (p[0] - u.uBusRainRoof[0]) * .5, z = (p[2] - u.uBusRainRoof[1]) * .5;
  return [x * u.uBusRainFrame[0] - z * u.uBusRainFrame[1], (p[1] - u.uBusRainRoof[2]) * .5,
    x * u.uBusRainFrame[1] + z * u.uBusRainFrame[0]];
};

test('sky shelter changes across the physical doorway while practicals follow retained boarding time',()=>{
  const origin={x:100,y:15.2,z:-300,yaw:Math.PI/2};
  const world=(x,z)=>[origin.x+z,origin.y+2.12,origin.z-x];
  assert.equal(outskirtsBusInteriorLightMix(world(-2,-3.15),origin),0);
  assert.equal(outskirtsBusInteriorLightMix(world(0,-3.15),origin),1);
  const half=outskirtsBusInteriorLightMix(world(-1.045,-3.15),origin);
  near(half,.5,'shelter blends over the threshold instead of cutting exposure');
  assert.equal(outskirtsBusInteriorLightMix(world(0,5),origin),0);
  assert.deepEqual(busPassageLampPower({entered:false,clock:30,enteredAt:null}),{front:1,rear:.72,strips:[1,1,1,1]});
  near(busPassageLampPower({entered:true,trapAt:10,clock:10.35}).front,1);
  near(busPassageLampPower({entered:true,trapAt:10,clock:10.47}).front,.14);
  assert.equal(busPassageLampPower({entered:true,enteredAt:10,clock:999}).rear,.72);
  const runtimeSource=fs.readFileSync(new URL('../src/game/source-space-runtime.js',import.meta.url),'utf8');
  assert.match(runtimeSource,/front-lamps[^\n]*power.front[^\n]*rear-lamps[^\n]*power.rear/);
  assert.match(runtimeSource,/lighting:\{origin:[\s\S]*?face:[\s\S]*?power\}/,'lighting and fixture emission must share retained power');
});

test('uniforms keep cells, metres, model ground, yaw and recording translation explicit', () => {
  const u = outskirtsBusRainUniforms({ centreXCells: 200, centreZCells: -600, baseYCells: 30.4,
    yaw: Math.PI / 2, patternOriginOffsetMetres: { x: 7, z: -34.4 } });
  assert.deepEqual([...u.uBusRainRoof].slice(0, 2), [214, Math.fround(-668.8)]);
  near(u.uBusRainRoof[2], 30.4); assert.equal(u.uBusRainRoof[3], 1);
  near(u.uBusRainFrame[0], 0); near(u.uBusRainFrame[1], 1);
  const same = outskirtsBusRainUniforms({ centreXCells: 214, centreZCells: -668.8, baseYCells: 30.4, yaw: Math.PI / 2 });
  assert.deepEqual(u, same, 'the pattern translation was applied twice');
  for (const invalid of [{}, { centreXCells: '200', centreZCells: 0, baseYCells: 0, yaw: 0 },
    { centreXCells: 0, centreZCells: 0, baseYCells: Infinity, yaw: 0 },
    { centreXCells: 0, centreZCells: 0, baseYCells: 0, yaw: NaN },
    { centreXCells: 0, centreZCells: 0, baseYCells: 0, yaw: 0, patternOriginOffsetMetres: [0, 0, 34.4] }]) {
    assert.equal(outskirtsBusRainUniforms(invalid).uBusRainRoof[3], 0);
  }
});

test('the solid roof removes interior streaks while exterior, above-roof and below-floor rain remains', () => {
  for (const yaw of [0, .5, Math.PI / 2, -Math.PI / 2]) {
    const u = uniforms(yaw), a = point(u, -.2, 2.2, -.3), b = point(u, .1, 1.4, .2);
    assert.deepEqual(trimOutskirtsBusRain(a, b, u), [], `rain remains in the saloon at yaw${yaw}`);
    for (const [p, q] of [[[1.5, 2, 0], [1.6, 1.2, .1]], [[0, 2, -5], [.1, 1.2, -5.1]],
      [[0, 3.5, 0], [.1, 3.2, .1]], [[0, .4, 0], [.1, .1, .1]]]) {
      const from = point(u, ...p), to = point(u, ...q);
      assert.deepEqual(trimOutskirtsBusRain(from, to, u), [[from, to]], 'outside rain was disabled');
    }
    const off = { ...u, uBusRainRoof: Float32Array.from([...u.uBusRainRoof].slice(0, 3).concat(0)) };
    assert.deepEqual(trimOutskirtsBusRain(a, b, off), [[a, b]]);
  }
});

test('a descending streak ends on the real barrel roof rather than its crown plane', () => {
  const u = uniforms(.5);
  for (const x of [0, .6, 1.1]) {
    const a = point(u, x, 3.6, 0), b = point(u, x, 2.2, 0), result = trimOutskirtsBusRain(a, b, u);
    assert.equal(result.length, 1); assert.deepEqual(result[0][0], a);
    const roof = BUS.rainRoof.eaves + BUS.rainRoof.rise * Math.sin(Math.PI * (x + BUS.rainRoof.halfWidth) / (BUS.rainRoof.halfWidth * 2));
    near(local(u, result[0][1])[1], roof, 'curved roof contact');
    const reversed = trimOutskirtsBusRain(b, a, u);
    near(local(u, reversed[0][0])[1], roof, 'reverse contact'); assert.deepEqual(reversed[0][1], a);
  }
});

test('a crossing streak retains both outside-window fragments and the above-eaves shoulders', () => {
  const u = uniforms(Math.PI / 2), a = point(u, -2, 2.2, 0), b = point(u, 2, 2.2, 0);
  const split = trimOutskirtsBusRain(a, b, u);
  assert.equal(split.length, 2); assert.deepEqual(split[0][0], a); assert.deepEqual(split[1][1], b);
  near(local(u, split[0][1])[0], -BUS.rainRoof.halfWidth); near(local(u, split[1][0])[0], BUS.rainRoof.halfWidth);
  const shoulders = trimOutskirtsBusRain(point(u, -2, 3, 0), point(u, 2, 3, 0), u);
  assert.equal(shoulders.length, 2);
  near(local(u, shoulders[0][1])[0], -BUS.rainRoof.halfWidth * 2 / 3, 'left barrel/eaves intersection');
  near(local(u, shoulders[1][0])[0], BUS.rainRoof.halfWidth * 2 / 3, 'right barrel/eaves intersection');
});

test('front/back crossings, translation and recording rebases use the same oriented physical footprint', () => {
  const u = uniforms(.5), from = point(u, 0, 2.2, -5), to = point(u, 0, 2.2, -4);
  const result = trimOutskirtsBusRain(from, to, u); assert.equal(result.length, 1);
  near(local(u, result[0][1])[2], BUS.rainRoof.frontZ);
  const rebased = outskirtsBusRainUniforms({ centreXCells: 200 - 80, centreZCells: -600 + 68.8,
    baseYCells: 30.4, yaw: .5, patternOriginOffsetMetres: { x: 40, z: -34.4 } });
  assert.deepEqual(rebased, u); assert.deepEqual(trimOutskirtsBusRain(from, to, rebased), result);
  assert.deepEqual(from, point(u, 0, 2.2, -5), 'trimming mutates the original weather field');
  assert.throws(() => trimOutskirtsBusRain([0, NaN, 0], [0, 0, 0], u), TypeError);
});

test('Source submits the actual roof pose, applies the array-to-offset adapter once and tests both visible pieces', () => {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength, { seed: 4417, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state }); runtime.setPlayerPosition(built.position);
  const bus = runtime.outskirtsPiece('r7-bus'), position = { x: bus.x / CELL - .5, y: bus.z / CELL - .5 };
  runtime.setPlayerPosition(position);
  const frame = runtime.outskirtsBusPassageFrame(); assert.equal(frame.active, true);
  near(frame.rainShelter.x, bus.x); near(frame.rainShelter.z, bus.z); near(frame.rainShelter.yaw, bus.yaw);
  near(frame.rainShelter.y, runtime.geometry.floorAt(position.x, position.y) - BUS.floor, 'model ground instead of eye/deck');
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /sourceRainShelter:usingSourceSpace\(\)\?chunkSurfRuntime\.outskirtsBusPassageFrame\?\.\(\)\?\.rainShelter\?\?null:null/);
  const renderer = fs.readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  assert.match(renderer, /const RAIN_GLSL\s*=\s*GLASS_COURT_RAIN_GLSL\+OUTSKIRTS_BUS_RAIN_GLSL/);
  assert.match(renderer, /centreXCells:\(sourceRainShelter\?\.x\|\|0\)\/CELL[\s\S]*?baseYCells:\(sourceRainShelter\?\.y\|\|0\)\/CELL/);
  assert.match(renderer, /patternOriginOffsetMetres:\{x:patternOriginOffsetMetres\[0\],z:patternOriginOffsetMetres\[2\]\}/);
  assert.match(renderer, /uniform4fv\(sourceVoidPhysicalU\('uBusRainRoof'\),busRain\.uBusRainRoof\)/);
  const trim = renderer.indexOf('int pieces=outskirtsBusTrimRain(a,b,a0,b0,a1,b1)');
  assert.ok(trim > renderer.indexOf('if(!glassCourtTrimRain(a,b))return 0.0;'));
  assert.match(renderer.slice(trim, trim + 350), /if\(pieces==0\)return 0\.0;[\s\S]*rayToSegment\(ro, rd, a0, b0\)[\s\S]*if\(pieces>1\)d=min\(d,rayToSegment\(ro,rd,a1,b1\)\)/);
  assert.match(OUTSKIRTS_BUS_RAIN_GLSL, /uniform vec4 uBusRainRoof/);
  assert.match(OUTSKIRTS_BUS_RAIN_GLSL, /pa=\(a\.xz-uBusRainRoof\.xy\)\*\.5/);
});
