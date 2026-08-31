import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  applyFieldPresentationPolicy,
  applyHushTorchInterference,
  computeHushField,
  effectiveTorchScale,
  hushAbsenceLook,
  hushPhysicallySensed,
  inactiveHushField,
} from '../src/game/hush-field.js';
import { hushMixTargets } from '../src/audio/hush-mix.js';

const operator = { position: { x: 0, y: 0 }, roomId: 'room', floorId: 'g' };
const at = (x, options = {}) => applyFieldPresentationPolicy(computeHushField({
  hush: { active: true, position: { x, y: 0 }, roomId: 'room', floorId: 'g' },
  operator,
  now: options.now ?? 1000,
  occlusion: options.occlusion ?? 0,
}), options.settings || {});

test('the sensory trace precedes contact and strengthens monotonically', () => {
  const far = at(50);
  const near = at(34);
  const engulf = at(20);
  assert.equal(far.stage, 'trace');
  assert.equal(near.stage, 'near');
  assert.equal(engulf.stage, 'engulf');
  assert.ok(far.absorption.light < near.absorption.light);
  assert.ok(near.absorption.light < engulf.absorption.light);
  assert.ok(far.absorption.audio < near.absorption.audio);
  assert.ok(near.absorption.audio < engulf.absorption.audio);
});

test('minimap sensing begins at embodied pressure, not at simulation spawn', () => {
  const subliminal=at(50);
  const felt=at(40);
  assert.equal(subliminal.stage,'trace');
  assert.equal(hushPhysicallySensed({field:subliminal}),false);
  assert.equal(hushPhysicallySensed({field:felt}),true);
  assert.equal(hushPhysicallySensed({visible:true,field:inactiveHushField()}),true);
  assert.equal(hushPhysicallySensed({field:inactiveHushField(),authoredPressure:.08}),true,
    'an authored physical tableau can become sensible without borrowing the generic HUSH field');
});

test('geometry suppresses remote torch interference without deleting the local absence', () => {
  const open = at(20);
  const blocked = at(20, { occlusion: 1 });
  assert.ok(blocked.absorption.light < open.absorption.light * .2);
  assert.ok(blocked.absorption.audio < open.absorption.audio);
  assert.ok(hushAbsenceLook({ active: true, field: blocked }).strength >= .88);
  assert.deepEqual(hushAbsenceLook({ active: false, field: open }), { active: false, strength: 0, radiusM: 0 });
});

test('HUSH interference corrupts the whole torch contract without spending battery', () => {
  const torch = {
    band: 'clean', health: .8, power: 1, reach: 1,
    color: [1, .94, .82], coneInner: .88, coneOuter: .94, spill: .05,
  };
  const field = at(20);
  const corrupted = applyHushTorchInterference(torch, field);
  assert.equal(corrupted.health, torch.health);
  assert.equal(corrupted.band, torch.band);
  assert.ok(corrupted.power < torch.power);
  assert.ok(corrupted.reach < torch.reach);
  assert.ok(corrupted.coneInner > torch.coneInner);
  assert.ok(corrupted.spill < torch.spill);
  assert.equal(corrupted.power, effectiveTorchScale(field));
});

test('flicker-off keeps steady dimming and sound still collapses in the inner field', () => {
  const lowPulse = at(10, { now: 0, settings: { hushLightFlicker: 'off' } });
  const highPulse = { ...lowPulse, pulse: 1 };
  assert.equal(effectiveTorchScale(lowPulse), effectiveTorchScale(highPulse));
  assert.ok(effectiveTorchScale(lowPulse) < .65);
  const mix = hushMixTargets(lowPulse, {}, { monitorGain: 1, monitorOpen: true });
  assert.ok(mix.worldGain < .25);
  assert.ok(mix.worldLowpassHz < 1800);
  assert.ok(mix.monitorDryGain < .2);
});

test('the final absence pass consumes props, practicals, and beacons together', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const propComposite = renderer.indexOf('if(propView < archView + 0.015){ col = prop.rgb; zView = propView; }');
  const absencePass = renderer.indexOf('// The HUSH is not a dark decal on the walls');
  assert.ok(propComposite >= 0 && absencePass > propComposite, 'HUSH absorption runs after the mesh-prop composite');
  assert.match(renderer, /uHush;\s*\/\/ x, z, absorption strength, radius in metres/);
  assert.match(renderer, /state\.hush\?\.radiusM \?\? 0/);
  assert.match(renderer, /float surfaceSpan=min\(span,[\s\S]*?float s = clamp\([\s\S]*?surfaceSpan\)/,
    'the absence clips to the nearest composed surface instead of projecting through props');
});

test('the cover silhouette is a depth-aware world manifestation after the absence pass', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const pixelMesh = await readFile(new URL('../src/render/pixel-mesh/shader.js', import.meta.url), 'utf8');
  const absencePass = renderer.indexOf('// The HUSH is not a dark decal on the walls');
  const bodyPass = renderer.indexOf('compositeHushBody(uHushBody,uHushBodyLook');
  assert.ok(bodyPass > absencePass, 'the broad light-eating field resolves before the authored body composite');
  assert.match(renderer, /bodyView<zView\+\.012/, 'the silhouette is occluded by the nearest architecture or prop depth');
  assert.match(renderer, /Cell bodyCell=cellAtI/, 'the silhouette stands on the authored floor height');
  assert.match(renderer, /hushScreen\(col,glowLayer\)/, 'the outer glow uses a Screen composite');
  assert.match(renderer, /vec3 dodged=hushColorDodge\(col,dodgeLayer\)/, 'the figure resolves through Color Dodge');
  assert.match(renderer, /HUSH_BODY_ASSET_REV='8f52397c'/, 'the generated body URL is fingerprinted against stale webview caches');
  assert.match(renderer, /uHushBodyPost/, 'the body compositor crosses the acquisition boundary explicitly');
  assert.match(renderer, /acquisitionGlow/, 'only authored SDF coverage is keyed for post-acquisition glow');
  assert.match(renderer, /acquisitionBody=bodyAlpha/, 'the acquisition bridge carries the full authored negative mass, not line art');
  assert.match(renderer, /float aa=clamp\(fwidth\(sdf\)\*1\.35,\.7,2\.6\)/, 'minification cannot expand the silhouette into billboard coverage');
  assert.match(renderer, /float cardFade=smoothstep\(\.008,\.055,cardDistance\)/, 'all manifestation channels fade before the transparent card perimeter');
  assert.match(renderer, /silhouette=max\(sourceCoverage,smoothstep\(-aa,aa,sdf\)\)\*cardFade/, 'the billboard guard applies to body depth as well as visible light');
  assert.match(pixelMesh, /Reconstruct the cover compositor after acquisition/);
  assert.match(pixelMesh, /finalColor\*=1\.0-fieldAbsorb/, 'the post-acquisition body begins by consuming the surrounding exposure');
  assert.match(pixelMesh, /finalColor=mix\(finalColor,swallowed,body\*\.96\)/, 'the human silhouette resolves as negative mass');
  assert.match(pixelMesh, /hushScreen\(finalColor/);
  assert.match(pixelMesh, /hushColorDodge\(finalColor/);
  assert.doesNotMatch(pixelMesh, /vec3\(\.74,\.82,\.80\)/, 'the compositor cannot regress to a white-hot character sprite');
  assert.match(renderer, /sourceCoverage=smoothstep\(\.28,\.72,bodySample\.g\)/,
    'the soft source matte cannot expose the rectangular smart-object bounds');
  assert.match(renderer, /haloSupport=1\.0-smoothstep\(9\.0,14\.0,outsideDistance\)/,
    'the outer glow reaches exact zero before the billboard edge');
  assert.doesNotMatch(renderer, /col\*=1\.0-silhouette/,
    'the body pass never darkens the rectangular intersection card');
  assert.match(renderer, /if\(silhouette\*resolved>\.018\) zView=min\(zView,bodyView\)/,
    'only silhouette coverage may write depth; the transparent billboard cannot become a black rectangle');
  assert.match(renderer, /uHushBodyTex/);
  assert.match(renderer, /HUSH_BODY_MODES=Object\.freeze\(\['live','core','glow','off'\]\)/);
});

test('the HUSH SDF is the compact, provenance-tracked cover figure', async () => {
  const png = await readFile(new URL('../assets/hush/hush-body-sdf.png', import.meta.url));
  const runtimePng = await readFile(new URL('../public/assets/hush/hush-body-sdf.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 128);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(createHash('sha256').update(png).digest('hex'), '8f52397c0c2b050c4b3f78b14f6a7fb3040f8fa0253498c928151ffeb280d655');
  assert.equal(createHash('sha256').update(runtimePng).digest('hex'), createHash('sha256').update(png).digest('hex'));
  const provenance = JSON.parse(await readFile(new URL('../assets/hush/provenance.json', import.meta.url), 'utf8'));
  assert.equal(provenance.source.sha256, 'b2b6d9050bae346d1b90fac329ece047a6108d17d7d47c1499f13882c3e950d5');
  assert.deepEqual(provenance.processed.size, [128, 256]);
  assert.equal(provenance.processed.alphaFloor, 32);
  assert.equal(provenance.processed.distanceSource, 'thresholded figure alpha; smart-object canvas wash excluded');
  assert.equal(provenance.processed.sha256, createHash('sha256').update(png).digest('hex'));
});

test('special spaces suppress the building HUSH body except Source, and diagnostics expose its compositor', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /hushBodySpaceAllowed=!usingSpecialSpace\(\)\|\|usingSourceSpace\(\)/);
  assert.match(main, /hushBodyAllowed:!worldView\?\.suppressActors&&hushBodySpaceAllowed/);
  assert.match(main, /hushSecondary:renderedHushSecondary/, 'Source bracket does not supply the render-only forward manifestation');
  assert.match(main, /HUSH BODY COMPOSITE/);
  assert.match(main, /hushBody:\(\)=>R3\.r3dHushBodyStatus/);
});
