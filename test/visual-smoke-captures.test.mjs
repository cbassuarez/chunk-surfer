import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('feature smoke captures the restored title, authored slates, cinematic roll, and return report', () => {
  const source = readFileSync('tools/chunk_surfer/tests/feature-regression-smoke.mjs', 'utf8');
  for (const file of [
    '01-opening-credits.png',
    '01-opening-credits-compact.png',
    '01b-opening-creator.png',
    '01b-opening-creator-compact.png',
    '01c-opening-sound-design.png',
    '01c-opening-sound-design-compact.png',
    '01d-opening-quotation.png',
    '01d-opening-quotation-compact.png',
    '02-title-current-build.png',
    '02-title-compact.png',
    '03aa-academic-garden-before-drift.png',
    '03ab-academic-garden-after-drift.png',
    '03f-atrium-hall-vestibule-approach.png',
    '03g-atrium-hall-vestibule-threshold.png',
    '06a-hush-brush-picker.png',
    '06b-hush-brush-release.png',
    '06c-hush-brush-failed-thought.png',
    '06d-hush-brush-hard-contact.png',
    '06e-hush-brush-reduced.png',
    '06f-hush-active-recording-exclusion.png',
    '06g-hush-taken-contact.png',
    '07-natatorium-long-hall.png',
    '07-signal-combat-chapel.png',
    '07l-dock-sodium-seam.png',
    '07l-dance-stair-failure.png',
    '07l-plant-indicator.png',
    '07l-natatorium-roof-bounce.png',
    '07l-hall-stage-door.png',
    '07o-natatorium-single-vault.png',
    '07o-hall-seating-rises-to-rear.png',
    '07l-practice-emergency-end.png',
    '07l-academic-skylight.png',
    '07l-chapel-cold-shaft.png',
    '07l-tower-light-bands.png',
    '07m-sp01-off.png',
    '07m-sp01-on.png',
    '07p-plant-entrance-sp01-off.png',
    '07p-plant-entrance-sp01-on.png',
    '07p-plant-switchgear-sp01-off.png',
    '07p-plant-switchgear-sp01-on.png',
    '07p-plant-annex-manifold-sp01-off.png',
    '07p-plant-annex-manifold-sp01-on.png',
    '07q-plant-manifold-hissing.png',
    '07r-plant-heavy-wrench-pursuit.png',
    '07s-radio-deployed-live.png',
    '07s-radio-deployed-calling.png',
    '07s-radio-map-calling.png',
    '07s-radio-deployed-dead.png',
    '07s-radio-bag-dead.png',
    '07n-torch-clean.png',
    '07n-torch-warm.png',
    '07n-torch-failing.png',
    '07n-torch-flat.png',
    '07a-upper-stair-normal-dark.png',
    '07aa-practice-corridor-dead-end-dark.png',
    '07b-basement-stair-normal-dark.png',
    '08-chunk-surf-long-hall.png',
    '08-source-hunt-contact-960x600.png',
    '08b-peal-count-in.png',
    '08d-bells-standing.png',
    '09-credits-opening-card.png',
    '09-credits-opening-card-compact.png',
    '10-credits-roll-early.png',
    '10-credits-roll-early-compact.png',
    '11-credits-roll-mid.png',
    '11-credits-roll-mid-compact.png',
    '12-credits-closing-card.png',
    '12-credits-closing-card-compact.png',
    '13-return-report-after-credits.png',
    '13-return-report-after-credits-compact.png',
  ]) {
    assert.match(source, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source,/08a-source-tower-\$\{mode\}\.png/);
  assert.match(source,/08c-peal-phrase-\$\{phrase\+1\}\.png/);
  assert.match(source,/phraseRows=\[0,14,28,42,56,70\]/);
  assert.match(source, /__probe\.openCredits\(\)/);
  assert.match(source, /__probe\.endingCredits\('sacrifice'\)/);
  assert.match(source, /chunkSurf\.state\.phase,'hall'/);
  assert.match(source, /__probe\.godWarpGetIn\(\)/);
  assert.match(source, /\[\['reduced',true\],\['full',false\]\]/);
  assert.match(source, /07c-stair-\$\{mode\}-phase-\$\{stage\+1\}\.png/);
  assert.match(source, /stairPerformance=await samplePerformance\(\)/);
  assert.match(source, /map\.player\.resolved,true/);
  for(const id of['loading-bay','get-in','front-atrium','studio-b3','natatorium','concert-hall','practice-wing','academic-gallery','chapel','plant-room']){
    assert.match(source,new RegExp(`'${id}'`));
  }
  for(const id of['front-main','hall-vestibule','chapel-c17','practice-west-1','plant-spur','foh-office','pool-lobby','tower-hatch']){
    assert.match(source,new RegExp(`'${id}'`));
  }
  assert.match(source,/04c-god-location-\$\{id\}\.png/);
  assert.match(source,/04d-god-door-\$\{id\}\.png/);
  assert.match(source,/__probe\.godWarpHook\(hook\)/);
  assert.match(source,/__probe\.godWarpDoor\(kind\)/);
  for (const stem of [
    '03h-atrium-entrance',
    '03i-atrium-waiting',
    '03j-atrium-box-office',
    '03k-atrium-garden',
    '03l-atrium-hall-approach',
  ]) {
    assert.match(source, new RegExp(`\\['${stem}'`));
  }
  assert.match(source, /for\(const state of\['off','on'\]\)/);
  assert.match(source, /\$\{stem\}-sp03-\$\{state\}\.png/);
  assert.doesNotMatch(source, /08-chunk-surf-source-fault\.png/);
});

test('feature smoke runner is portable across release operating systems', () => {
  const source = readFileSync('tools/chunk_surfer/tests/run-feature-regression-smoke.mjs', 'utf8');
  assert.match(source, /path\.join\(root,'node_modules','vite','bin','vite\.js'\)/);
  assert.match(source, /mock-lens-service\.mjs/);
  assert.match(source, /feature-regression-smoke\.mjs/);
  assert.match(source, /process\.platform/);
  assert.match(source, /Visual smoke exceeded/);
  const capture = readFileSync('tools/chunk_surfer/tests/feature-regression-smoke.mjs', 'utf8');
  assert.doesNotMatch(capture, /page\.evaluate\([^\n]*requestAnimationFrame/);
  assert.match(capture, /interactionTimeout=process\.platform==='linux'\?30000:10000/);
  assert.match(capture, /FEATURE_SMOKE_FRAME_TIMEOUT_MS/);
  assert.match(capture, /snapshot\.samples<minimumSamples&&Date\.now\(\)<deadline/);
});

test('mock lens unwraps depth packets before echoing a decodable material image', () => {
  const source = readFileSync('tools/chunk_surfer/tests/mock-lens-service.mjs', 'utf8');
  assert.match(source, /bytes\[0\]!==0x4c\|\|bytes\[1\]!==0x32/);
  assert.match(source, /readUInt32LE\(2\)/);
  assert.match(source, /bytes\.subarray\(6,6\+frameLength\)/);
  assert.match(source, /createHash\('sha256'\)\.update\(bytes\)/);
  assert.match(source, /socket\.send\(bytes\)/);
});
