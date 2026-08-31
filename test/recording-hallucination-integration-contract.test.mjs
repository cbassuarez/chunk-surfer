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
  assert.match(source, /recordingHallucinationVisualFrame/,
    'the body card and pose cluster share deterministic motion and glitch timing');
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

// THE BEAT WAS FIRING AND NOBODY EVER SAW IT.
//
// Measured on 2026-08-27: the director started four events inside one clean
// forty-five second take and placed a body for every one of them. All four were
// staged within thirty degrees of the look axis, and the take overlay — opaque,
// centred, on screen for the whole take — covered them from the shins up. The
// two facts that fix it are that the panel's geometry has exactly one owner,
// and that a candidate is asked whether it clears that panel before it is used.
test('a hallucination is staged where the take overlay is not', () => {
  const source = readFileSync('src/main.js', 'utf8');

  assert.match(source, /function takePanelRect\(\{cols,rows,progress=0\}\)/,
    'the DA-1000 panel rect is one function, so the draw and the staging cannot drift');
  const overlay = source.slice(source.indexOf('function drawTakeOverlay'), source.indexOf('function installProbe'));
  assert.match(overlay, /takePanelRect\(\{cols,rows,progress:p\}\)/,
    'the overlay must draw the same rect the staging tests against');

  const clears = source.slice(source.indexOf('function clearsTakeOverlay'), source.indexOf('function recordingFalseHushCandidate'));
  assert.match(clears, /r3dProjectWorld/,
    'clearance is measured through the real projection, not a hand-computed angle');
  assert.match(clears, /takePanelRect/);

  const candidate = source.slice(source.indexOf('function recordingFalseHushCandidate'), source.indexOf('function recordingHallucinationPropInstances'));
  assert.match(candidate, /for\(let pass=0;pass<2;pass\+\+\)/,
    'a covered position is a fallback, never the first choice');
  assert.match(candidate, /if\(pass===0&&!clearsTakeOverlay\(x,y\)\)continue;/);

  // Every staging candidate must be far enough off the look axis to have a
  // chance of clearing the panel at all. A body dead ahead of a man staring at
  // a meter is a body he cannot see.
  const pattern = candidate.slice(candidate.indexOf('const pattern=['), candidate.indexOf('];', candidate.indexOf('const pattern=[')));
  const entries = [...pattern.matchAll(/\{f:([\d.]+),r:(-?[\d.]+)\}/g)].map(([, f, r]) => ({ f: Number(f), r: Number(r) }));
  assert.equal(entries.length, 9);
  for (const { f, r } of entries) {
    assert.ok(Math.abs(r) / f >= 0.6, `candidate f:${f} r:${r} stages inside the overlay's own footprint`);
  }
});

test('the live tick records why it declined, so an invisible beat can be measured', () => {
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /let recordingHallucinationWhy=/);
  assert.match(source, /why:recordingHallucinationWhy/,
    '__probe.recordingHallucination reports the gate that closed');
});
