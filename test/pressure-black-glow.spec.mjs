import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  PRESSURE_FINISH_FRAG,
  PRESSURE_SCENE_GLSL,
} from '../src/render/pressure-composite.js';
import { props3dDebugShaders } from '../src/render/props3d.js';

// Execute the emitted shader's actual scalar expressions. This catches changes
// to the active material, rather than testing an independently copied CPU look.
const step = (edge, value) => value < edge ? 0 : 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const expression = name => {
  const found = PRESSURE_FINISH_FRAG.match(new RegExp(`float ${name}=([^;]+);`));
  assert.ok(found, `active fragment no longer assigns ${name}`);
  return found[1];
};
const execute = (source, values) => Function('step', 'clamp', ...Object.keys(values), `return (${source});`)(step, clamp, ...Object.values(values));
const glowExpression = PRESSURE_FINISH_FRAG.match(/c\+=vec3\(([^;]+)\);/)[1];
const sealExpression = PRESSURE_FINISH_FRAG.match(/c\*=([^;]+);/)[1];
function finish({ background, mass = 1, core = 1, exposure = 1, nearGlow = 1, midGlow = 1, wideGlow = 1, farGlow = 1 }) {
  const coreMask = execute(expression('coreMask'), { mass, core });
  const exterior = execute(expression('exterior'), { mass });
  const glowLight = execute(expression('glowLight'), { nearGlow, midGlow, wideGlow, farGlow, exterior });
  const normalizedExposure = execute(expression('exposure'), { uCaptureExposure: exposure });
  const white = execute(glowExpression, { glowLight, exposure: normalizedExposure });
  const seal = execute(sealExpression, { coreMask });
  return background.map(channel => clamp((channel + white) * seal, 0, 1));
}

test('every visible Pressure core is exact neutral black across background and capture exposure', () => {
  for (const background of [[0, 0, 0], [.36, .48, .47], [1, 1, 1], [1, .025, .012]]) {
    for (const exposure of [1, 1.8, 6, 12]) {
      for (const mass of [.019, .27, .68, .96, 1]) {
        assert.deepEqual(finish({ background, exposure, mass }), [0, 0, 0]);
      }
    }
  }
  assert.equal(step(.018, .017), 0, 'discarded sub-threshold coverage must not become a black rectangle');
});

test('the active physical scene also seals actual covered triangles before acquisition', () => {
  const core = PRESSURE_SCENE_GLSL.match(/col\*=([^;]+);/)[1];
  for (const prior of [0, .015, .5, 1, 12]) {
    assert.equal(prior * execute(core, { a: .96 }), 0);
    assert.equal(prior * execute(core, { a: 0 }), prior);
  }
  assert.match(PRESSURE_SCENE_GLSL, /g\.a\*step\(d,zView\+\.022\)\*core/);
  assert.match(PRESSURE_SCENE_GLSL, /if\(a>\.018\)zView=min\(zView,d\)/);
});

test('external radiance is neutral white, exposure-normalized and spatially finite', () => {
  const background = [0, 0, 0];
  const near = finish({ background, mass: 0 });
  assert.deepEqual(near, [1, 1, 1], 'near supported radiance should reach white, not a blue-grey fringe');
  const far = finish({ background, mass: 0, nearGlow: 0, midGlow: 0, wideGlow: 0 });
  assert.ok(far[0] > 0 && far[0] < .05);
  assert.equal(far[0], far[1]);
  assert.equal(far[1], far[2]);
  assert.ok(near[0] > far[0]);
  for (const exposure of [1, 1.8, 6, 12]) {
    const result = finish({ background, mass: 0, nearGlow: 0, midGlow: 0, wideGlow: 0, exposure });
    assert.ok(Math.abs(result[0] * exposure - far[0]) < 1e-12, 'world sensor sensitivity must not change the authored white energy');
  }
  assert.deepEqual(finish({ background, mass: 0, nearGlow: 0, midGlow: 0, wideGlow: 0, farGlow: 0 }), background);
  assert.match(PRESSURE_FINISH_FRAG, /glowCoverage\(uv\+d\*px\*15\.0,front\)/);
  assert.doesNotMatch(PRESSURE_FINISH_FRAG, /px\*(?:1[6-9]|[2-9][0-9])\./);
});

test('core-only, glow-only and off retain their actual triangle footprint and depth occlusion', () => {
  const background = [.31, .31, .31];
  assert.deepEqual(finish({ background, mass: .96, core: 0 }), background,
    'glow-only must leave the real body interior transparent');
  assert.deepEqual(finish({ background, mass: 0, core: 0, nearGlow: 0, midGlow: 0, wideGlow: 0, farGlow: 0 }), background);
  assert.match(PRESSURE_FINISH_FRAG, /float glowCoverage\([^}]+g\.a\*glow\*step\(meshDepth\(g\),min\(front,worldDepth\(uv\)\)\+\.022\)/,
    'glow must require a glow-flagged triangle and respect source and destination world surfaces');
  assert.match(PRESSURE_FINISH_FRAG, /float depth=mass\*core>\.018\?1\.0\/\(1\.0\+min\(front,meshDepth\(g\)\)\*\.14\):src\.a/,
    'external radiance cannot replace the world depth');
  const shader = props3dDebugShaders().pressureFragment;
  assert.match(shader, /64\.0\*uPressure\.y\+128\.0\*uPressure\.z/);
  assert.match(shader, /dot\(vWorld-uEye,uForward\)/);
});

test('Pressure material still enters the shared recording instead of a smooth final repaint', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  assert.match(renderer, /const pressureSourceTex = finishPressure\(sceneTex\);[\s\S]*?runBurstPass\(pressureSourceTex, now\)/);
  const post = renderer.slice(renderer.indexOf('function presentThroughPost('), renderer.indexOf('export function r3dSourceIdentityStatus'));
  assert.doesNotMatch(post, /finishPressure\(/);
  const merge = PRESSURE_FINISH_FRAG.slice(PRESSURE_FINISH_FRAG.indexOf('if(uAcquiredOnly>.5)'), PRESSURE_FINISH_FRAG.indexOf('vec3 c=src.rgb'));
  assert.match(merge, /mix\(src\.rgb,texture\(uAcquired,uv\)\.rgb,support\)/);
  assert.match(merge, /coreMask\+glowLight/);
});

test('material identity is emitted alongside the exact already occluded finite finish', () => {
  assert.match(PRESSURE_FINISH_FRAG, /layout\(location=0\)out vec4 o;/);
  assert.match(PRESSURE_FINISH_FRAG, /layout\(location=1\)out vec4 oIdentity;/);
  assert.match(PRESSURE_FINISH_FRAG, /oIdentity=vec4\(coreMask,step\(\.000001,glowLight\),0\.0,1\.0\);/);
  const identityIndex = PRESSURE_FINISH_FRAG.indexOf('oIdentity=vec4(');
  assert.ok(identityIndex > PRESSURE_FINISH_FRAG.indexOf('float glowLight='));
  assert.ok(identityIndex < PRESSURE_FINISH_FRAG.indexOf('if(uAcquiredOnly>.5)'));
  assert.equal(execute('step(.000001,glowLight)', { glowLight: 0 }), 0);
  assert.equal(execute('step(.000001,glowLight)', { glowLight: .025 }), 1);
  assert.equal(execute(expression('coreMask'), { mass: 0, core: 1 }), 0,
    'hidden/stale geometry must not claim a core identity');
});

test('the active glow sampler rejects a hidden emitter as well as an obstructed destination', () => {
  const body = PRESSURE_FINISH_FRAG.match(/float glowCoverage\(vec2 uv,float front\)\{([^}]+)\}/)[1]
    .replace(/\b(?:vec4|float)\s+(\w+)\s*=/g, 'const $1=');
  const sample = Function('uv', 'front', 'texture', 'uGeometry', 'floor', 'meshDepth', 'worldDepth', 'step', 'min', body);
  let worldReads = 0;
  const run = ({ alpha = .96, flags = 192 / 255, bodyDepth = 6, sourceDepth = 20, destinationDepth = 20 } = {}) => {
    worldReads = 0;
    return sample([.5, .5], destinationDepth, () => ({ a: alpha, b: flags }), null, Math.floor,
      () => bodyDepth, () => { worldReads++; return sourceDepth; }, step, Math.min);
  };
  assert.equal(run({ sourceDepth: 4 }), 0,
    'a triangle behind its own wall cannot emit into the open sky beside that wall');
  assert.equal(run(), .96, 'an open visible emitter must retain its white radiance');
  assert.equal(run({ destinationDepth: 4 }), 0,
    'visible source radiance must not paint a nearer wall at its destination');
  assert.equal(run({ alpha: 0 }), 0);
  assert.equal(worldReads, 0, 'empty geometry should avoid the additional scene/prop depth reads');
  assert.equal(run({ flags: 64 / 255 }), 0);
  assert.equal(worldReads, 0, 'core-only geometry should not sample glow occlusion');
});
