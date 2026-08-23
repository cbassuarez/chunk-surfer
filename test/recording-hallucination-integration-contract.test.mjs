import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main wires recording hallucinations into the secondary HUSH body path', () => {
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /createRecordingHallucinationDirector/);
  assert.match(source, /tickRecordingHallucinations/);
  assert.match(source, /recordingFalseHush/);
  assert.match(source, /recordingFalseHushBody/);
  assert.match(source, /hushSecondary:renderedHushSecondary/);
  assert.match(source, /recordingHallucinationPropInstances/);
  assert.match(source, /meshForApparitionPose\(poseId\)/,
    'recording hallucinations reuse the authored semantic pose library');
  assert.match(source, /emissive:\[\.70,\.90,1,/,
    'pose bodies remain independently legible in the take darkness');
  assert.match(source, /noShadow:true,structural:false/,
    'hallucination bodies remain render-only and cannot enter structural or shadow contacts');
  assert.match(source, /pointInSight\(x,y,/,
    'a blocked candidate cannot consume the whole hallucination unseen');

  const start = source.indexOf('const recordingFalseHushBody');
  const end = source.indexOf('const hushSensory', start);
  const secondary = source.slice(start, end);
  assert.match(secondary, /sourceBracketBody/);
  assert.match(secondary, /recordingFalseHushBody/);
});

test('secondary false HUSH accepts a stronger dedicated look without changing primary HUSH', () => {
  const source = readFileSync('src/render/r3d.js', 'utf8');
  assert.match(source, /hushBodySecondaryLast\.heightM/);
  assert.match(source, /hushBodySecondaryLast\.widthM/);
  assert.match(source, /hushBodySecondaryLast\.glow/);
  assert.match(source, /hushBodySecondaryMode/);
});
