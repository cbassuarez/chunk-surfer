import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUB_FRONT_SKY, PUB_FRONT_SKY_GLSL, pubFrontSkyEligible, pubFrontSkySurface } from '../src/render/pub-front-material.js';
import { EXTERIOR_PUB, pubWorldFromLocal } from '../src/data/exterior-pub.js';
import { ZONE } from '../src/data/floorplan/legend.js';

const outward = { x: 0, y: 0, z: -1 };
const inward = { x: 0, y: 0, z: 1 };

test('only the ordinary Lyric facade instance can receive this local sky treatment', () => {
  for (const zone of [ZONE.street, ZONE.civicCourt, ZONE.pub])
    assert.equal(pubFrontSkyEligible('district_civic_frontage', [{ zone }]), true);
  for (const zone of [ZONE.sourceSpace, ZONE.hall, ZONE.dock])
    assert.equal(pubFrontSkyEligible('district_civic_frontage', [{ zone }]), false);
  for (const name of ['district_terrace_frontage', 'district_passage_frontage', 'exterior_pub_interior', 'pub_warm_interior', 'source_pub_interior'])
    assert.equal(pubFrontSkyEligible(name, [{ zone: ZONE.civicCourt }]), false);
  assert.equal(pubFrontSkyEligible('district_civic_frontage', []), false);
  assert.equal(pubFrontSkyEligible('district_civic_frontage', [{ zone: ZONE.pub }, { zone: ZONE.sourceSpace }]), false);
});

test('both actual printed fascia faces receive the missing outdoor incident light', () => {
  const bytes = fs.readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const facade = json.meshes.find(mesh => mesh.name === PUB_FRONT_SKY.mesh);
  const signs = facade.extras.lettering.filter(entry => entry.id.startsWith('pub-lyric-fascia-'));
  assert.equal(signs.length, 2);
  for (const sign of signs) {
    const p = pubWorldFromLocal({ x: sign.center[0], z: sign.center[2] });
    const point = { ...p, y: EXTERIOR_PUB.floor + sign.center[1] };
    assert.equal(pubFrontSkySurface(point, outward), true, sign.id);
    assert.equal(pubFrontSkySurface(point, inward), false, `${sign.id}: the back face stays indoors`);
    assert.equal(pubFrontSkySurface(point, outward, false), false, 'a Source copy cannot enable the treatment by coordinates alone');
  }
});

test('the two pub deeds retain exposed front, return and roof planes while the adjacent shops stay unchanged', () => {
  assert.equal(pubFrontSkySurface({ x: -10, y: 1.74, z: 107.1 }, outward), true);
  assert.equal(pubFrontSkySurface({ x: -14, y: 2, z: 109.8 }, { x: -1, y: 0, z: 0 }), true);
  assert.equal(pubFrontSkySurface({ x: -10, y: 14, z: 110 }, { x: 0, y: 1, z: 0 }), true);
  for (const point of [{ x: 10, y: 3.77, z: 106.74 }, { x: 30, y: 6, z: 106.7 }, { x: -10, y: 2, z: 99 }, { x: -10, y: 20, z: 107 }])
    assert.equal(pubFrontSkySurface(point, outward), false);
  assert.equal(pubFrontSkySurface({ x: -10, y: 3.52, z: 109.8 }, { x: 0, y: -1, z: 0 }), false, 'ordinary interior ceiling remains unlit by this helper');
  assert.equal(pubFrontSkySurface({ x: -10, y: .12, z: 109.8 }, { x: 0, y: 1, z: 0 }), false, 'ordinary interior floor remains unlit by this helper');
});

test('the real prop fragment pass uses the bounded surface test inside its existing sky term', () => {
  const source = fs.readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  assert.match(source, /\$\{PUB_FRONT_SKY_GLSL\}/);
  assert.match(source, /uSkyExposed>\.5\|\|pubFrontSkySurface\(uPubFrontSky,vWorld,n\)/);
  assert.match(source, /uniform1f\(U\('uPubFrontSky'\),pubFrontSkyEligible\(name,list\)\?1:0\)/);
  assert.ok(PUB_FRONT_SKY_GLSL.includes(`point.x<${PUB_FRONT_SKY.x0}`));
  assert.doesNotMatch(PUB_FRONT_SKY_GLSL, /emissive|uAmbientIntensity|uLight|printedCoverage/);
});

test('the finish override selects exactly the two existing ordinary pub fascia primitives', async () => {
  const { PUB_FASCIA_PAINT, pubFrontFasciaEligible } = await import('../src/render/pub-front-material.js');
  const bytes = fs.readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const picked = [];
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const material = json.materials[primitive.material];
    const descriptor = { materialName: material.name, printedSurface: material.extras?.printedSurface };
    if (pubFrontFasciaEligible(mesh.name, descriptor, [{ zone: ZONE.civicCourt }])) {
      picked.push({ mesh: mesh.name, triangles: json.accessors[primitive.indices].count / 3 });
      assert.equal(pubFrontFasciaEligible(mesh.name, descriptor, [{ zone: ZONE.sourceSpace }]), false);
      for (const changed of [{ materialName: 'brass' }, { printedSurface: { ...descriptor.printedSurface, process: 'another gilt inscription' } }, { printedSurface: { ...descriptor.printedSurface, emission: 'pigment' } }])
        assert.equal(pubFrontFasciaEligible(mesh.name, { ...descriptor, ...changed }, [{ zone: ZONE.pub }]), false);
    }
  }
  assert.deepEqual(picked, [{ mesh: PUB_FRONT_SKY.mesh, triangles: 4 }], 'only the two existing four-vertex signs; no other material alias');
  assert.equal(PUB_FASCIA_PAINT.metallic, 0);
});

test('matte cream pigment increases diffuse reflectance while clear stock and exact coverage remain unchanged', async () => {
  const { PUB_FASCIA_PAINT, pubFrontFasciaSample } = await import('../src/render/pub-front-material.js');
  const original = { base: [.20, .08, .007], metallic: .78, roughness: .36 };
  const core = pubFrontFasciaSample({ ...original, coverage: 1 });
  assert.deepEqual(core.base, PUB_FASCIA_PAINT.color);
  assert.equal(core.metallic, 0);assert.equal(core.roughness, .78);
  assert.deepEqual(pubFrontFasciaSample({ ...original, coverage: 0 }), original, 'no halo or repainting outside the original pigment');
  assert.deepEqual(pubFrontFasciaSample({ ...original, coverage: 1, enabled: false }), original, 'excluded scene receives the exact original finish');
  const edge = pubFrontFasciaSample({ ...original, coverage: .5 });
  assert.deepEqual(edge.base, original.base.map((v, i) => v + (PUB_FASCIA_PAINT.color[i] - v) * .5));
  const luminance = rgb => rgb.reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  assert.ok(luminance(core.base) * (1 - core.metallic) > 10 * luminance(original.base) * (1 - original.metallic), 'ordinary off-specular direct illumination now has a useful diffuse receiver');
  assert.ok(core.base.every(value => value >= 0 && value <= 1), 'reflectance remains bounded, without emission or HDR material gain');
});

test('the real material pass uses the scoped finish before ordinary illumination and preserves the print coverage', () => {
  const source = fs.readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  assert.match(source, /uniform1f\(U\('uPubFasciaPaint'\),pubFrontFasciaEligible\(name,p,list\)\?1:0\)/);
  assert.ok(source.indexOf('${PUB_FASCIA_PAINT_GLSL}') < source.indexOf('vec3 col=base*surfaceIncident'));
  assert.match(source, /printedSurfaceTag\(printedCoverage,printPolarity\)/, 'the finish does not replace the existing authored coverage marks');
});
