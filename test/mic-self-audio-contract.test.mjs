import test from 'node:test';
import assert from 'node:assert/strict';
import { micEffectiveLevel, micEffectiveMeasurement, micSetSelfAudioProvider, micSnapshot, micTest } from '../src/game/mic.js';
import { readFileSync } from 'node:fs';

test.afterEach(() => {
  micSetSelfAudioProvider(null);
  micTest(null);
});

test('mic effective measurement subtracts the self-audio provider mask', () => {
  micTest({ rms: 0.08, peak: 0.09 });
  micSetSelfAudioProvider(() => ({ active: true, rms: 0.07, peak: 0.07, maskGain: 1.35, count: 1, latencyMs: 0 }));
  const effective = micEffectiveMeasurement();
  assert.equal(effective.raw.rms, 0.08);
  assert.ok(effective.effective.rms < 0.01);
  assert.equal(micEffectiveLevel(), effective.effective.rms);
  assert.equal(micSnapshot().selfAudioMask.active, true);
});

test('main uses effective mic for monitor and take spoil', () => {
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /program:MONITOR\.monitorProgramMeasurement\(\)/,
    'the actual final speaker bus supplies the cancellation reference');
  assert.match(source, /monitorSetAuxInput\(\(\)=>MIC\.micActive\(\)\?MIC\.micEffectiveMeasurement\(\)\.effective:0\)/);
  assert.match(source, /const measurement=MIC\.micEffectiveMeasurement\(\);\n\s*const m=measurement\.effective\.rms;/);
  assert.doesNotMatch(source, /const m=MIC\.micLevel\(\);\n\s*if\(!MIC\.micMaySpoil\(\)\) return;/);
  const transport = source.slice(source.indexOf('function emitRecorderTransport'), source.indexOf('// Headphones on.'));
  assert.match(transport, /playerGenerated:false/);
  assert.match(transport, /audibleToMonitor:false/,
    'the recorder speaker cue cannot move the semantic player-exposure meter');
});

test('mic setup states that the recorder is stopped and the test is not saved', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const micSetup = source.slice(source.indexOf('function beginMicTest'), source.indexOf('function finishMicTest'));
  assert.match(micSetup, /The recorder is stopped\./,
    'the mic test must distinguish an idle recorder from an armed take');
  assert.match(micSetup, /This test is not saved\./,
    'the privacy promise must identify storage explicitly');
  assert.doesNotMatch(micSetup, /room keeps/i,
    'privacy copy must not rely on room agency');
});
