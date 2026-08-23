import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('opening pre-cold-open bed is registered and shipped', () => {
  const source = readFileSync('src/audio/story-audio.js', 'utf8');
  assert.match(source, /openingBed:\s*assetUrl\('audio\/game\/opening_scene_bed_pre_cold_open\.mp3'\)/);
  assert.ok(existsSync('public/audio/game/opening_scene_bed_pre_cold_open.mp3'));
  assert.ok(!existsSync('public/audio/game/opening_scene_bed_pre_cold_open.mp3.asd'));
});

test('opening bed has its own music baseline below the title', () => {
  const source = readFileSync('src/audio/story-audio.js', 'utf8');
  assert.match(source, /title:\s*0\.42/);
  assert.match(source, /openingBed:\s*0\.30/);
  assert.match(source, /OPENING_BED_GAIN/);
  assert.match(source, /openingbedgain/);
});

test('story audio exposes opening bed transport controls', () => {
  const source = readFileSync('src/audio/story-audio.js', 'utf8');
  assert.match(source, /startOpeningSceneBed/);
  assert.match(source, /setOpeningSceneBedProximity/);
  assert.match(source, /commitOpeningSceneBedToColdOpenTitle/);
  assert.match(source, /stopOpeningSceneBed/);
  assert.match(source, /OPENING_BED_LOOP_SECONDS/);
});
