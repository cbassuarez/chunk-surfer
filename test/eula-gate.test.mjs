import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { eulaAccepted, eulaGateSections, eulaSections, eulaVersion } from '../src/game/eula.js';
import { freshMeta, normalizeMeta } from '../src/progression/schema.js';

const normalizeText = (text) => String(text || '').replace(/\r\n?/g, '\n');
const read = (path) => normalizeText(readFileSync(path, 'utf8'));
const EULA = read('LEGAL/EULA.md');

test('the displayed agreement is the bundled agreement', () => {
  // Importing the shipped file is what stops the screen and the bundle from
  // drifting apart. A hand-copied excerpt would pass review once and rot.
  assert.match(read('src/game/eula-text.js'), /from '\.\.\/\.\.\/LEGAL\/EULA\.md\?raw'/);
  assert.match(read('src/game/eula-scene.js'), /EULA_TEXT.*from '\.\/eula-text\.js'/s);
  const tauri = JSON.parse(read('src-tauri/tauri.lens.conf.json'));
  assert.equal(tauri.bundle?.resources?.['../LEGAL/EULA.md'], 'EULA.md');
});

test('the version is parsed from the document and gates acceptance', () => {
  const version = eulaVersion(EULA);
  assert.match(version, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(eulaAccepted({ eulaAccepted: version }, EULA), true);
  assert.equal(eulaAccepted({ eulaAccepted: '' }, EULA), false);
  assert.equal(eulaAccepted({}, EULA), false);
  // A revised licence must be accepted again rather than inherited.
  assert.equal(eulaAccepted({ eulaAccepted: '1999-01-01' }, EULA), false);
});

test('the gate shows the model-use restrictions the OpenRAIL licence requires', () => {
  const gate = eulaGateSections(EULA);
  const titles = gate.map((section) => section.title.toLowerCase());
  assert.ok(titles.some((t) => t.includes('model-use restrictions')), 'restrictions must be on the gate');
  assert.ok(titles.some((t) => t.includes('model resources')), 'the bundled stack must be named on the gate');
  const body = gate.flatMap((section) => section.lines).join(' ').toLowerCase();
  // Spot-check the restrictions that OpenRAIL-M Attachment A exists to carry.
  for (const required of ['minors', 'harass', 'law or regulation', 'discriminate']) {
    assert.ok(body.includes(required), `gate text must carry "${required}"`);
  }
  assert.ok(eulaSections(EULA).length > gate.length, 'full text stays available beyond the gate');
});

test('the EULA parser is line-ending safe', () => {
  const crlf = EULA.replace(/\n/g, '\r\n');
  assert.equal(eulaVersion(crlf), eulaVersion(EULA));
  assert.deepEqual(
    eulaGateSections(crlf).map((section) => section.title),
    eulaGateSections(EULA).map((section) => section.title),
  );
  assert.deepEqual(
    eulaGateSections(crlf).map((section) => section.lines),
    eulaGateSections(EULA).map((section) => section.lines),
  );
});

test('acceptance is persisted in the profile and survives normalization', () => {
  assert.equal(freshMeta().eulaAccepted, '');
  const stored = normalizeMeta({ ...freshMeta(), eulaAccepted: '2026-07-16', eulaAcceptedAt: 1234 });
  assert.equal(stored.eulaAccepted, '2026-07-16');
  assert.equal(stored.eulaAcceptedAt, 1234);
  assert.equal(normalizeMeta({ eulaAccepted: 42 }).eulaAccepted, '');
});

test('the gate stands ahead of calibration, lens startup, and declining quits', () => {
  const main = read('src/main.js');
  const gateIndex = main.indexOf('if(!eulaAccepted(getMeta(),EULA_TEXT))');
  const calibrationIndex = main.indexOf('pushCalibration();', gateIndex);
  // The model may not be asked to do work before the licence is accepted.
  assert.ok(gateIndex >= 0, 'the EULA gate must exist');
  assert.ok(calibrationIndex > gateIndex, 'the EULA gate must precede lens calibration');
  assert.match(main, /function lensEulaAccepted\(\)\s*\{[^}]*eulaAccepted\(getMeta\(\),EULA_TEXT\)/s);
  assert.match(main, /function lensStartBlockedByEula\(\)\s*\{[^}]*!lensEulaAccepted\(\)/s);
  assert.match(main, /function ensureLensStarted[\s\S]*?lensStartBlockedByEula\(\)/);
  assert.match(main, /async function requireLensStarted[\s\S]*?model licence must be accepted before lens startup/);
  assert.match(main, /ensureLensStarted\(qp,\{quietBlocked:true\}\)/);
  assert.match(main, /ensureLensStarted\(params\(\),\{quietBlocked:true\}\)/);
  assert.match(main, /onDecline:requestQuitDesktop/);
  assert.match(main, /metaCommit\(\{eulaAccepted:version/);
  // And it stays readable afterwards.
  assert.match(main, /openLicence: \(\) => scenes\.push\(makeEulaScene\(\{ reviewOnly: true \}\)\)/);
  assert.match(read('src/game/settings.js'), /LICENCE \/ EULA/);
});

test('the licence screen offers no way past it but the two real answers', () => {
  const scene = read('src/game/eula-scene.js');
  assert.match(scene, /I ACCEPT/);
  assert.match(scene, /DECLINE AND QUIT/);
  assert.doesNotMatch(scene, /skip|later|dismiss|remind me/i);
  assert.match(scene, /blocksInput: true/);
});
