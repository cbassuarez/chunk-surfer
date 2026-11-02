import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUB_FRONT_SKY, PUB_FRONT_SKY_GLSL, pubFrontSkyEligible, pubFrontSkySurface, pubFrontFasciaEligible } from '../src/render/pub-front-material.js';
import { EXTERIOR_PUB, pubPhysicalFromLocal, pubPhysicalAt } from '../src/data/exterior-pub.js';
import { ZONE } from '../src/data/floorplan/legend.js';

const outward = { x: 0, y: 0, z: -1 };
const inward = { x: 0, y: 0, z: 1 };
const turnedNormal=normal=>({x:normal.z,y:normal.y,z:-normal.x});
function traceActualScalarBinding(source,uniform,frames,bindings,{primitive=false}={}){
  const call=source.match(new RegExp("setMaterialScalar\\('"+uniform+"',[^;]+\\);"));
  const group=source.indexOf('for(const [key,list] of groups)'),loop=source.indexOf('for(const p of m.primitives){',group),draw=source.indexOf('gl.drawElementsInstanced',loop);
  assert.ok(call&&call.index>group&&call.index<draw,'the actual draw group binds '+uniform);
  assert.equal(call.index>loop,primitive,'the binding belongs to its real group/primitive ownership');
  const begin=source.indexOf('const materialScalars = new Map();'),end=source.indexOf('// The atlas and morph bindings use different units',begin);
  assert.ok(begin>=0&&end>begin);
  let value=1;const gl={uniform1f(_name,next){value=next;}},U=name=>name;
  return new Function('gl','U','frames','read',...Object.keys(bindings),source.slice(begin,end)+
    '\nreturn frames.map(({name,list,p})=>{'+call[0]+'return read();});')(gl,U,frames,()=>value,...Object.values(bindings));
}

test('only the ordinary Lyric facade instance can receive this local sky treatment', () => {
  for (const zone of [ZONE.street, ZONE.civicCourt, ZONE.dock, ZONE.pub])
    assert.equal(pubFrontSkyEligible('exterior_pub_frontage', [{ zone }]), true);
  for (const zone of [ZONE.sourceSpace, ZONE.hall])
    assert.equal(pubFrontSkyEligible('exterior_pub_frontage', [{ zone }]), false);
  for (const name of ['district_terrace_frontage', 'district_passage_frontage', 'exterior_pub_interior', 'pub_warm_interior', 'source_pub_interior'])
    assert.equal(pubFrontSkyEligible(name, [{ zone: ZONE.civicCourt }]), false);
  assert.equal(pubFrontSkyEligible('exterior_pub_frontage', []), false);
  assert.equal(pubFrontSkyEligible('exterior_pub_frontage', [{ zone: ZONE.pub }, { zone: ZONE.sourceSpace }]), false);
});

test('both actual printed fascia faces receive the missing outdoor incident light', () => {
  const bytes = fs.readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const facade = json.meshes.find(mesh => mesh.name === PUB_FRONT_SKY.mesh);
  const signs = facade.extras.lettering.filter(entry => entry.id.startsWith('pub-lyric-fascia-'));
  assert.equal(signs.length, 2);
  for (const sign of signs) {
    const p = pubPhysicalFromLocal({ x: sign.center[0], z: sign.center[2]-24 });
    const point = { ...p, y: EXTERIOR_PUB.floor + sign.center[1] };
    assert.equal(pubFrontSkySurface(point, turnedNormal(outward)), true, sign.id);
    assert.equal(pubFrontSkySurface(point, turnedNormal(inward)), false, `${sign.id}: the back face stays indoors`);
    assert.equal(pubFrontSkySurface(point, turnedNormal(outward), false), false, 'a Source copy cannot enable the treatment by coordinates alone');
  }
});

test('the turned pub retains exposed front, return and roof planes while adjacent shops and its retired footprint stay unchanged', () => {
  const {bounds,floor,frontWorldZ}=EXTERIOR_PUB,x=(bounds.x0+bounds.x1)/2,z=(bounds.z0+bounds.z1)/2;
  const sample=(point,normal)=>pubFrontSkySurface(pubPhysicalAt(point),turnedNormal(normal));
  assert.equal(sample({x,y:1.74,z:frontWorldZ-.15},outward),true);
  assert.equal(sample({x:bounds.x0,y:2,z},{x:-1,y:0,z:0}),true);
  assert.equal(sample({x,y:14,z},{x:0,y:1,z:0}),true);
  for(const point of[{x:bounds.x1+5,y:3.77,z:frontWorldZ-.5},{x:bounds.x1+25,y:6,z:frontWorldZ-.5},{x,y:2,z:frontWorldZ-9},{x,y:20,z:frontWorldZ}])
    assert.equal(sample(point,outward),false);
  assert.equal(sample({x,y:EXTERIOR_PUB.ceiling,z},{x:0,y:-1,z:0}),false,'ordinary interior ceiling remains unlit by this helper');
  assert.equal(sample({x,y:floor,z},{x:0,y:1,z:0}),false,'ordinary interior floor remains unlit by this helper');
  assert.equal(pubFrontSkySurface({x:-10,y:1.74,z:107.1},outward),false,'the old off-block Lyric footprint is not another outdoor light receiver');
});

test('the real prop fragment pass uses the bounded surface test inside its existing sky term', () => {
  const source = fs.readFileSync(new URL('../src/render/props3d.js', import.meta.url), 'utf8');
  assert.match(source, /\$\{PUB_FRONT_SKY_GLSL\}/);
  assert.match(source, /uSkyExposed>\.5\|\|pubFrontSkySurface\(uPubFrontSky,vWorld,n\)/);
  const frames=[{name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.pub}]},{name:'source_pub_interior',list:[{zone:ZONE.pub}]},
    {name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.dock}]},{name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.sourceSpace}]}];
  assert.deepEqual(traceActualScalarBinding(source,'uPubFrontSky',frames,{pubFrontSkyEligible}),[1,0,1,0],
    'cached sky state resets for unrelated meshes and Source copies before their actual draw');
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
  const p={materialName:'physical print: institution: aged gilt pub fascia lettering',printedSurface:{coverage:'baseColorAlpha',polarity:'light-on-dark',process:'aged gilt pub fascia lettering',emission:'none'}};
  const frames=[{name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.pub}],p},{name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.pub}],p:{}},
    {name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.pub}],p},{name:PUB_FRONT_SKY.mesh,list:[{zone:ZONE.sourceSpace}],p}];
  assert.deepEqual(traceActualScalarBinding(source,'uPubFasciaPaint',frames,{pubFrontFasciaEligible},{primitive:true}),[1,0,1,0],
    'cached fascia finish is evaluated and reset for each actual primitive');
  assert.ok(source.indexOf('${PUB_FASCIA_PAINT_GLSL}') < source.indexOf('vec3 col=base*surfaceIncident'));
  assert.match(source, /printedSurfaceTag\(printedCoverage,printPolarity\)/, 'the finish does not replace the existing authored coverage marks');
});
