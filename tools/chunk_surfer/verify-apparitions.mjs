// Fixed-seed art-review matrix for the emergency-light apparitions.
//
// This is intentionally probe-directed: it aims at submitted apparition
// bearings and records composition/director/shadow metadata beside each PNG.
// It never searches the framebuffer for the reddest wall and mistakes that for
// evidence that a body or projected shadow is actually composed in the shot.
//
//   npx vite --port 5199 --host 127.0.0.1
//   npm run verify:apparitions

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.APPARITION_URL || 'http://127.0.0.1:5199';
const SOURCE = process.env.APPARITION_SOURCE || 'final';
const OUT = path.resolve(process.env.APPARITION_OUT || 'artifacts/apparitions-review');
const ZONE = Object.freeze({ foyer: 2, natatorium: 4, hall: 5, bellTower: 12, academic: 13 });
const POSES = Object.freeze(['neutral', 'side', 'stoop', 'head_turn', 'arm_out', 'weight_shift', 'symmetric']);
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 600000,
  args: [
    '--use-angle=metal',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  // The lens server supplies engraved marks. This matrix verifies the actual
  // world/emergency/shadow/compositor path over the procedural fallback field.
  window.__diffusion = {
    ready: Promise.resolve(),
    stats: { criticalBank: 'calm' },
    activateBank: async () => true,
    retry: async () => true,
  };
});

const shaderErrors = [];
page.on('pageerror', (error) => shaderErrors.push(`PAGEERROR: ${String(error)}`));
page.on('console', (message) => {
  const value = message.text();
  if (/shader|GLSL|compile|ERROR:/i.test(value)) shaderErrors.push(value);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const top = () => page.evaluate(() => window.__scenes?.top?.()?.id || null);
const wait = (fn, timeout = 300000, arg = undefined) => page.waitForFunction(fn, { timeout }, arg);

await page.goto(`${BASE_URL}/index.html?nomic=1&sam=0&skiptut=1&nothink=0&pixelMeshSource=${encodeURIComponent(SOURCE)}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await wait(() => !!window.__scenes?.top?.()?.id);
if (await top() === 'eula') {
  await page.keyboard.press('Enter');
  await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000);
}
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter');
await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);

async function recover(tries = 12) {
  for (let index = 0; index < tries; index++) {
    const ready = await page.evaluate(() => window.__chunkParity?.().screen === 'game'
      && !window.__scenes?.top?.()?.id);
    if (ready) return true;
    await page.keyboard.press(index % 2 ? 'Escape' : 'Enter');
    await sleep(500);
  }
  return false;
}

await page.evaluate(() => window.__probe.testRun());
await sleep(1800);
await recover(6);

async function warp(location) {
  if (location.towerPreset) {
    const tower = await page.evaluate((preset) => window.__probe.towerPreset(preset), location.towerPreset);
    if (tower?.phase !== 'tower_active') throw new Error(`Could not establish live tower state for ${location.id}`);
    await sleep(500);
  }
  const landed = location.door
    ? await page.evaluate((door) => window.__probe.godWarpDoor(door), location.door)
    : location.cell
      ? await page.evaluate(([x, y]) => window.__probe.warpCell(x, y), location.cell)
    : await page.evaluate((zone) => window.__probe.godWarpZone(zone), location.zone);
  await sleep(1100);
  if (!landed || !await recover()) throw new Error(`Could not warp to ${location.id}`);
}

async function setScene({
  location,
  effects = 'full',
  reduceDread = false,
  torch = false,
  renderScale = 1,
  seed,
}) {
  await page.evaluate(() => {
    window.__probe.apparitionCaptureLight(null);
    window.__probe.setPower('sp02', true);
    window.__probe.setPower('sp03', true);
  });
  await page.evaluate(([mode, dread, light, scale]) => {
    window.__probe.apparitionEffects(mode);
    window.__probe.setReduceDread(dread);
    window.__probe.setTorch(light);
    window.__chunkSurferDisplay.setRenderScale(scale);
  }, [effects, reduceDread, torch, renderScale]);
  await warp(location);
  await page.evaluate((value) => window.__probe.apparitionReset(value), seed);
  await sleep(180);
  if (effects !== 'off' && !reduceDread) {
    // Pin the practical that the live ranking actually selected before turning
    // to inspect one of its bodies. Without that capture-only pin, aiming at a
    // body can legitimately select a different behind-the-shoulder lamp; the
    // screenshot would then describe one frame while looking at another.
    await waitForSubmission({ active: true });
    const lightId = await page.evaluate(() => window.__probe.apparitionGate()?.submitted?.lightId || null);
    await page.evaluate((id) => window.__probe.apparitionCaptureLight(id), lightId);
    await aimAt(1);
    await waitForSubmission({ active: true });
    await page.evaluate((value) => window.__probe.apparitionReset(value), seed);
    await waitForSubmission({ active: true });
  }
}

async function waitForSubmission(expected = {}, timeout = 16000) {
  await wait((match) => {
    const submitted = window.__probe.apparitionGate()?.submitted;
    if (!submitted) return false;
    if (match.active === false) return submitted.active === false;
    if (!submitted.active) return false;
    if (match.card && submitted.card !== match.card) return false;
    if (match.phase && submitted.cardPhase !== match.phase) return false;
    if (match.presentation && submitted.presentation !== match.presentation) return false;
    return true;
  }, timeout, expected);
}

async function aimAt(index = 1) {
  const data = await page.evaluate(() => window.__probe.apparitions());
  const bodyAt = Math.max(0, data.bodies?.findIndex((body) => body.index === index) ?? -1);
  const yaw = Number(data.bearings?.[bodyAt]);
  const pitch = Number(data.pitches?.[bodyAt]);
  if (Number.isFinite(yaw)) await page.evaluate(([nextYaw, pitch]) =>
    window.__probe.lookAtWorld(nextYaw, pitch), [yaw, Number.isFinite(pitch) ? pitch : -.05]);
  await sleep(100);
  return data;
}

const results = [];
async function capture(id, authored = {}, { submission = { active: true } } = {}) {
  await waitForSubmission(submission, submission.active === false ? 6000 : 16000);
  if (submission.active !== false) {
    await wait(() => {
      const gate = window.__probe.apparitionGate();
      const light = gate?.candidates?.find((candidate) => candidate.id === gate?.submitted?.lightId);
      return Number(light?.intensity) > .12;
    }, 16000);
  }
  const snapshot = await page.evaluate(() => ({
    gate: window.__probe.apparitionGate(),
    apparitions: window.__probe.apparitions(),
    scene: window.__probe.sceneStats(128),
    shadow: window.__probe.props()?.pack?.shadow || null,
    effects: window.__probe.light()?.effectsMode || null,
  }));
  if (submission.active !== false && !snapshot.gate?.submitted?.active) {
    throw new Error(`${id} lost its active apparition submission before capture`);
  }
  const record = {
    id,
    ...authored,
    capturedAt: new Date().toISOString(),
    ...snapshot,
  };
  const png = path.join(OUT, `${id}.png`);
  const json = path.join(OUT, `${id}.json`);
  await page.screenshot({ path: png });
  fs.writeFileSync(json, `${JSON.stringify(record, null, 2)}\n`);
  results.push(record);
  process.stdout.write(`  ${id}: ${snapshot.gate?.submitted?.compositionId || 'none'} · `
    + `${snapshot.gate?.submitted?.figures || 0}/${snapshot.gate?.submitted?.visibleBodies || 0} figures/visible\n`);
  return record;
}

const LOCATIONS = Object.freeze({
  foyer: Object.freeze({ id: 'foyer', door: 'hall-acoustic-pair' }),
  hall: Object.freeze({ id: 'hall', zone: ZONE.hall }),
  // East deck, just north of the basin's service corner. The standard doorway
  // hook is intentionally close to its bulkhead and therefore exercises the
  // far-side safety fallback; this plate needs to review the authored pool-edge
  // composition itself.
  natatorium: Object.freeze({ id: 'natatorium', cell: Object.freeze([92, 46]) }),
  academic: Object.freeze({ id: 'academic', zone: ZONE.academic }),
  // The tower egress fittings are route-gated as well as circuit-gated. Enter
  // the authored live-route fixture before reviewing the service landing so a
  // stale/default Foreshadow save cannot produce a deceptively empty plate.
  tower: Object.freeze({ id: 'tower', towerPreset: 'tower-arrival', door: 'tower-service-single' }),
});

process.stdout.write('POSES\n');
await setScene({ location: LOCATIONS.hall, seed: 'review:poses', effects: 'reduced', renderScale: 1 });
await waitForSubmission({ active: true });
for (const poseId of POSES) {
  await page.evaluate((seed) => window.__probe.apparitionReset(seed), `review:pose:${poseId}`);
  await waitForSubmission({ active: true });
  // Repeat the reviewed pose across the three established stations. This is a
  // capture plate, not an initial director assignment: repetition makes subtle
  // head/weight contours inspectable at three depths without changing runtime
  // pose selection.
  const companions = [poseId, poseId, poseId];
  const accepted = await page.evaluate((poses) => window.__probe.apparitionPoses(poses), companions);
  if (!accepted) throw new Error(`Pose override rejected for ${poseId}`);
  await capture(`pose-${poseId}`, { family: 'pose', poseId, seed: `review:pose:${poseId}` });
}

process.stdout.write('SPACES\n');
for (const [name, location] of Object.entries(LOCATIONS)) {
  const seed = `review:space:${name}`;
  await setScene({ location, seed, effects: 'full', renderScale: 1 });
  await capture(`space-${name}`, { family: 'space', location: name, seed });
}

process.stdout.write('CONTINUITY\n');
await setScene({ location: LOCATIONS.hall, seed: 'review:continuity', effects: 'full' });
await capture('continuity-baseline', { family: 'continuity', event: 'baseline', seed: 'review:continuity' });
for (const kind of ['reorientation', 'stillness', 'absence', 'substitution', 'peripheral']) {
  const seed = `review:continuity:${kind}`;
  await page.evaluate((value) => window.__probe.apparitionReset(value), seed);
  await waitForSubmission({ active: true });
  await page.evaluate(([card, index]) => window.__probe.apparitionForce(card, index), [kind, kind === 'peripheral' ? 2 : 1]);
  await waitForSubmission({ active: true, card: kind });
  await capture(`continuity-${kind}`, { family: 'continuity', event: kind, seed }, {
    submission: { active: true, card: kind },
  });
}

await page.evaluate((value) => window.__probe.apparitionReset(value), 'review:continuity:delayed');
await waitForSubmission({ active: true });
await page.evaluate(() => window.__probe.apparitionForce('delayed_reveal', 2));
await waitForSubmission({ active: true, card: 'delayed_reveal', phase: 'shadow' });
await capture('continuity-delayed-shadow', {
  family: 'continuity', event: 'delayed_reveal', phase: 'shadow', seed: 'review:continuity:delayed',
}, { submission: { active: true, card: 'delayed_reveal', phase: 'shadow' } });
await waitForSubmission({ active: true, card: 'delayed_reveal', phase: 'reveal' });
await capture('continuity-delayed-body', {
  family: 'continuity', event: 'delayed_reveal', phase: 'reveal', seed: 'review:continuity:delayed',
}, { submission: { active: true, card: 'delayed_reveal', phase: 'reveal' } });

await page.evaluate((value) => window.__probe.apparitionReset(value), 'review:continuity:hard');
await waitForSubmission({ active: true });
await page.evaluate(() => window.__probe.apparitionHardReveal(1));
await waitForSubmission({ active: true, presentation: 'hard' });
await capture('continuity-hard-reveal', {
  family: 'continuity', event: 'hard_reveal', seed: 'review:continuity:hard',
}, { submission: { active: true, presentation: 'hard' } });

process.stdout.write('ACCESSIBILITY AND LIGHTING\n');
for (const kind of ['reorientation', 'stillness']) {
  const seed = `review:reduced:${kind}`;
  await setScene({ location: LOCATIONS.hall, seed, effects: 'reduced' });
  await waitForSubmission({ active: true });
  await page.evaluate(([card, index]) => window.__probe.apparitionForce(card, index), [kind, 1]);
  await waitForSubmission({ active: true, card: kind });
  await capture(`reduced-${kind}`, { family: 'accessibility', effects: 'reduced', event: kind, seed }, {
    submission: { active: true, card: kind },
  });
}

await setScene({ location: LOCATIONS.hall, seed: 'review:off', effects: 'off' });
await capture('accessibility-off', { family: 'accessibility', effects: 'off', seed: 'review:off' }, {
  submission: { active: false },
});
await setScene({ location: LOCATIONS.hall, seed: 'review:reduce-dread', effects: 'full', reduceDread: true });
await capture('accessibility-reduce-dread', {
  family: 'accessibility', effects: 'full', reduceDread: true, seed: 'review:reduce-dread',
}, { submission: { active: false } });

for (const [id, torch, renderScale] of [
  ['lighting-torch-off-shadow-1024', false, 1],
  ['lighting-torch-on-shadow-1024', true, 1],
  ['lighting-torch-off-shadow-512', false, .5],
]) {
  const seed = `review:${id}`;
  await setScene({ location: LOCATIONS.hall, seed, effects: 'full', torch, renderScale });
  await capture(id, { family: 'lighting', torch, renderScale, seed });
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  source: SOURCE,
  caseCount: results.length,
  shaderErrors,
  cases: results,
};
fs.writeFileSync(path.join(OUT, 'matrix.json'), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();

if (shaderErrors.length) {
  process.stderr.write(`${shaderErrors.length} browser/shader diagnostics were captured.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Wrote ${results.length} PNG/JSON review pairs and matrix.json to ${OUT}\n`);
}
