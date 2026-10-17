// Native 3D visual fixture for the century-stay ending presentation. The full
// player-earned route and checkpoint resume are accepted separately by
// verify-roof-quest-live.mjs.
import puppeteer from 'puppeteer-core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const out = resolve(process.env.ROOF_ENDING_OUT || 'artifacts/roof-floor-design/live/ending-native');
const url = process.env.ROOF_ENDING_URL || 'http://127.0.0.1:5351/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'chunk-roof-ending-'));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, userDataDir: profile, protocolTimeout: 300000,
  args: ['--no-sandbox', '--enable-webgl', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
const report = { url, captures: [], checks: [], errors: [] };
let stage = 'boot';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
page.on('pageerror', error => report.errors.push({ stage, type: 'pageerror', message: String(error.stack || error) }));
page.on('console', message => {
  const value = message.text();
  if (/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(value))
    report.errors.push({ stage, type: 'console', message: value });
});
const check = (pass, name, detail) => {
  report.checks.push({ pass: !!pass, name, detail });
  console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail ?? null));
};
async function state() {
  return page.evaluate(() => ({
    scene: window.__scenes?.top?.()?.id || null,
    view: window.__scenes?.top?.()?.view?.() || null,
    ending: window.__probe?.endingCutscene?.() || null,
    choreography: window.__probe?.windowChoreographyDebug?.() || null,
    pos: window.__probe?.pos?.() || null,
    floor: window.__probe?.floorH?.() || null,
    renRendered: window.__probe?.endingCutscene?.()?.props?.some(prop => prop.id === 'ending-roof-ren') || false,
    viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    savedCheckpoint: JSON.parse(localStorage.getItem('chunk-surfer:save:v4') || 'null')?.endingCutscene || null,
  }));
}
async function shot(name) {
  stage = name; await sleep(450);
  const s = await state();
  const path = join(out, `${name}.webp`);
  await page.screenshot({ path, type: 'webp', quality: 89 });
  report.captures.push({ name, path, state: s });
  console.log('CAPTURE', name, path, JSON.stringify({ scene: s.scene, pos: s.pos, ending: s.ending?.phase, choreography: s.choreography?.composition, renRendered: s.renRendered }));
  return s;
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  console.log('BOOT document loaded');
  await page.waitForFunction(() => window.__probe?.testRun && window.__scenes?.top?.()?.id, { timeout: 120000 });
  console.log('BOOT probe ready');
  if ((await state()).scene === 'eula') {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__scenes?.top?.()?.id !== 'eula', { timeout: 20000 });
    console.log('BOOT licence accepted');
  }
  const launched = await page.evaluate(async () => {
    await window.__probe.testRun();
    window.__probe.tutSkip();
    window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels', 'combat.trained', 'setup.waypoint', 'academic.entered', 'roof.access']);
    window.__probe.warpCell(209, 275);
    return window.__probe.playEnding('sacrifice', 'agreed', { variant: 'century-stay' });
  });
  console.log('ENDING launched', JSON.stringify(launched));
  await page.waitForFunction(() => ['finale', 'ending-action:sacrifice'].includes(window.__scenes?.top?.()?.id),
    { timeout: 20000 });
  if (!['finale', 'ending-action:sacrifice'].includes((await state()).scene))
    throw new Error(`Probe did not enter century-stay staging: ${(await state()).scene}`);
  const early = await shot('01-early-century-stay');
  check(early.viewport.innerWidth >= 960 && early.viewport.innerHeight >= 600, 'safe native viewport', early.viewport);
  check(early.savedCheckpoint?.variant === 'century-stay', 'century-stay variant checkpoint written', early.savedCheckpoint);
  check(early.choreography?.composition === null, 'generic media panes absent', early.choreography?.composition);
  check(early.renRendered, 'Ren remains in physical roof render', { renRendered: early.renRendered });
  for (let i = 0; i < 10; i++) {
    const s = await state();
    if (s.scene === 'ending-action:sacrifice' || s.scene?.startsWith('ending-resolution:') || s.scene?.startsWith('ending-hold:')) break;
    if (s.scene === 'finale') {
      if (s.view?.lineAge < .28 && !s.view?.typing) await sleep(Math.ceil((.28 - s.view.lineAge) * 1000));
      await page.keyboard.press('Enter');
    }
    await sleep(140);
  }
  const later = await shot('02-after-dialogue-advance');
  check(later.choreography?.composition === null, 'generic panes remain absent after dialogue', later.choreography?.composition);
  if (later.scene === 'ending-action:sacrifice') {
    await page.keyboard.down('e');
    await sleep(900);
    await shot('03-palm-hold-roof');
    await page.keyboard.up('e');
  }
  check(report.errors.length === 0, 'no shader or page errors', report.errors);
} catch (error) {
  report.errors.push({ stage, type: 'fatal', message: String(error.stack || error) });
  console.error(error);
} finally {
  await browser.close();
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await rm(profile, { recursive: true, force: true });
  console.log('REPORT', join(out, 'report.json'));
}
