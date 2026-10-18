import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assetUrl } from '../../../src/platform/paths.js';

const out = 'artifacts/source-experience-study/last-light';
await mkdir(out, { recursive: true });
const main = await readFile('src/main.js', 'utf8');
const storyPath = 'content/narrative/source-space.last-light.story.json';
const raw = await readFile(storyPath, 'utf8'), story = JSON.parse(raw);
const lines = story.nodes.recording.lines;
const sha = value => createHash('sha256').update(value).digest('hex');
const runtimePath = main.match(/const LAST_LIGHT_AUDIO='([^']+)'/)[1];
const documentedFile = story.notes.match(/public\/assets\/audio\/outskirts\/last-light\.mp3/)[0];
const deliveredPath = documentedFile.replace(/^public\//, '');
globalThis.document = { baseURI: 'http://127.0.0.1:5334/' };
const resolvedUrl = assetUrl(runtimePath), documentedUrl = assetUrl(deliveredPath);
async function exists(path) { try { const value = await stat(path); return { exists: true, bytes: value.size }; } catch(error) { if(error.code !== 'ENOENT') throw error; return { exists: false, bytes: null }; } }
async function inspect(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { url, status: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length,
    sha256: sha(bytes), isHtml: /^\s*(?:<!doctype html|<html)/i.test(bytes.subarray(0, 200).toString()) };
}
const requests = await Promise.allSettled([inspect(resolvedUrl), inspect(documentedUrl)]);
const fileChecks = await Promise.all([exists('public/' + runtimePath), exists(documentedFile)]);
let observed = null, baselineMain = null;
try { observed = JSON.parse(await readFile('artifacts/source-experience-study/live-baseline/last-light-observed.json', 'utf8')); } catch {}
try { baselineMain = await readFile('artifacts/source-experience-study/baseline/src/main.js', 'utf8'); } catch {}
const section = value => value?.slice(value.indexOf('const LAST_LIGHT_AUDIO='), value.indexOf('\nfunction enterHorizon(')) || '';
const sectionMatchesObservedBaseline = !!baselineMain && sha(section(main)) === sha(section(baselineMain));
const findings = [];
if (!fileChecks[0].exists) findings.push('No audio master exists at the runtime delivery path.');
if (!fileChecks[1].exists) findings.push('No audio master exists at the location documented in the active narrative.');
if (runtimePath !== deliveredPath) findings.push('The runtime loader and documented delivery path disagree.');
if (requests.some(r => r.status === 'fulfilled' && r.value.isHtml)) findings.push('At least one tested audio URL returns development HTML, which cannot be decoded as its intended audio master.');
if (observed?.lastLight?.mode === 'placeholder') findings.push('The saved live witness entered placeholder mode; its own timestamp, source state and capture limits must accompany that claim.');
const report = {
  schema: 1, kind: 'last-light-production-artifact-audit', at: new Date().toISOString(),
  source: { mainSha256: sha(main), storyPath, storySha256: sha(raw), assetResolver: 'src/platform/paths.js:assetUrl (actual imported production function; declared root document.baseURI)',
    lastLightSectionSha256: sha(section(main)), sectionMatchesObservedBaseline },
  runtime: { path: runtimePath, url: resolvedUrl, file: 'public/' + runtimePath, ...fileChecks[0] },
  documentedDelivery: { path: deliveredPath, url: documentedUrl, file: documentedFile, ...fileChecks[1] },
  pathAgreement: runtimePath === deliveredPath,
  requests: requests.map(result => result.status === 'fulfilled' ? result.value : { error: String(result.reason) }),
  script: { lines: lines.length, finalCueSeconds: Math.max(...lines.map(line => Number(line.at) || 0)),
    fallbackDurationSeconds: Math.max(...lines.map(line => Number(line.at) || 0)) + 2.5,
    copyChanged: false, sourceStatus: 'Active narrative still labels every line a draft for owner review before final takes.', cueSheet: 'recording-cues.json' },
  ownerConfirmation: { finishedTakesExist: false, source: 'Direct user response in this task: No finished takes yet' },
  proven: findings,
  observedWitness: observed ? { path: 'live-baseline/last-light-observed.json', atUnixMs: observed.atUnixMs,
    mode: observed.lastLight?.mode, done: observed.lastLight?.done, elapsed: observed.lastLight?.elapsed,
    duration: observed.lastLight?.duration, sourceActive: observed.lastLight?.source, audioContext: observed.audio?.actx,
    viewport: observed.viewport, captureChunkError: observed.capture?.chunkError } : null,
  sourceMechanisms: ['Missing or undecodable audio deliberately enters timed captions plus existing hiss.',
    'Actual recording mode routes a nonspatial voice source through bandpass/gain into the existing sfx/program chain.',
    'Timed captions currently run in placeholder mode only; adding the real master changes caption availability.',
    'The lamp extinguishes when the fallback or actual recording finishes. Successful completion alone does not prove voiced audio played.',
    'This recording remains optional; movement is free and retreat does not stop its playback.'],
  proposedIntegration: { canonicalDelivery: documentedFile, exactSourceReplacement: {
    before: "const LAST_LIGHT_AUDIO='audio/outskirts/last-light.mp3';",
    after: "const LAST_LIGHT_AUDIO='assets/audio/outskirts/last-light.mp3';"
  }, status: 'Proposed contract correction only; production code unchanged; no replacement voice or performed after-test.' },
  pending: ['Review the existing draft copy before recording both performers.', 'Verify the mastered file through the existing bandpass/gain/hiss/output chain.',
    'Resolve caption availability with the actual performance clock; do not silently lose the current text channel when the master arrives.',
    'Test ordinary approach, actual voiced-mode playback, pause/reload offset and final-word/lamp timing.', 'Fresh-player listening and human-memory recall.'],
  limits: ['HTTP inspection is an asset/loader diagnosis, not a listening test.', 'A temporary viewport fault in the long capture is separately excluded from normal-composition claims.',
    'Finishing the real performance is expected to strengthen the encounter; emotional benefit is not demonstrated by its current placeholder.']
};
await writeFile(out + '/asset-audit.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(out + '/recording-cues.json', JSON.stringify({ schema: 1, kind: 'existing-last-light-recording-cues', source: storyPath,
  sourceSha256: sha(raw), status: 'Unrecorded existing copy; no new dialogue', durationFromExistingCuesSeconds: report.script.fallbackDurationSeconds,
  deliveryFile: documentedFile, sourceMaster: 'Retain unprocessed performer/field takes separately from the delivery MP3.', lines }, null, 2) + '\n');
console.log(JSON.stringify({ report: out + '/asset-audit.json', runtimeFileExists: report.runtime.exists,
  documentedFileExists: report.documentedDelivery.exists, pathAgreement: report.pathAgreement, requests: report.requests,
  fallbackDurationSeconds: report.script.fallbackDurationSeconds }, null, 2));
