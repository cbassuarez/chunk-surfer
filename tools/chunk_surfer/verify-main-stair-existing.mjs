// Attach-only stair inspection. Uses the parent's existing Chromium context;
// never creates/closes a browser or page, navigates, changes rendering, or bakes.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as A from './main-stair-audit.mjs';

const OUT = path.resolve('artifacts/ellery-fabric-finish/native');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const { FP } = A.compileConservatory();
const key = p => `${Math.floor(p.x)},${Math.floor(p.y)}`;
// Same real-cell search as A.logicalAt, restricted to this authored stair and
// its halls so a distant room cannot win a requested local floor station.
function logicalAtStair(x, z, floor) {
  const plan = FP.floorplan(), owners = new Set(['main-open-well', 'grand_ground_stair_hall', 'grand_upper_stair_hall', 'academic_stair_loggia']);
  let best = null;
  for (let ly = 0; ly < plan.h; ly++) for (let lx = 0; lx < plan.w; lx++) {
    const i = ly * plan.w + lx;
    if (plan.solid[i] || plan.collisionOnly?.[i] || !owners.has(plan.owner[i]) || Math.abs(plan.floor[i] - floor) > .35) continue;
    const p = FP.logicalToPhysical(lx + .5, ly + .5), distanceM = Math.hypot(p.x * .5 - x, p.z * .5 - z);
    if (!best || distanceM < best.distanceM) best = { x: lx + .5, y: ly + .5, distanceM, floor: plan.floor[i], owner: plan.owner[i] };
  }
  return best;
}
const start = logicalAtStair(63, 32.25, 0);
const upper = logicalAtStair(64.25, 34.25, 4.8);
const detail = logicalAtStair(63.95, 34.05, .34);
console.log(JSON.stringify({ stage: 'actual-placements', start, upper, detail }));
for (const [name, point] of Object.entries({ start, upper, detail })) {
  if (!point || point.x < 0 || point.y < 0 || point.distanceM > .7) throw Error(`Invalid actual ${name} placement: ${JSON.stringify(point)}`);
}

function routeField(from, goal) {
  const first = { x: Math.floor(from.x), y: Math.floor(from.y) }, queue = [first], seen = new Set([key(first)]), edges = new Map();
  const inside = q => {
    const p = FP.logicalToPhysical(q.x + .5, q.y + .5);
    return p.x * .5 >= 58 && p.x * .5 <= 69 && p.z * .5 >= 28 && p.z * .5 <= 42 && p.y >= -.1 && p.y <= 5;
  };
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const step = FP.canStep(p.x, p.y, p.x + dx, p.y + dy);
      if (!step.ok) continue;
      const q = { x: Math.floor(step.redirect?.x ?? p.x + dx), y: Math.floor(step.redirect?.y ?? p.y + dy) };
      if (!inside(q)) continue;
      out.push({ dx, dy, to: key(q) });
      if (!seen.has(key(q))) { seen.add(key(q)); queue.push(q); }
    }
    edges.set(key(p), out);
  }
  if (!seen.has(key(goal))) throw Error(`No bounded ordinary stair route ${key(from)} -> ${key(goal)}`);
  const into = new Map();
  for (const [fromKey, out] of edges) for (const edge of out) {
    if (!into.has(edge.to)) into.set(edge.to, []);
    into.get(edge.to).push(fromKey);
  }
  const distance = new Map([[key(goal), 0]]), breadth = [key(goal)];
  for (let i = 0; i < breadth.length; i++) for (const fromKey of into.get(breadth[i]) || []) {
    if (!distance.has(fromKey)) { distance.set(fromKey, distance.get(breadth[i]) + 1); breadth.push(fromKey); }
  }
  const field = {};
  for (const [fromKey, out] of edges) {
    const best = out.filter(edge => distance.has(edge.to)).sort((a, b) => distance.get(a.to) - distance.get(b.to))[0];
    if (best && distance.get(best.to) < distance.get(fromKey)) field[fromKey] = { dx: best.dx, dy: best.dy };
  }
  return { field, steps: distance.get(key(from)), goal: key(goal), reachableCells: queue.length };
}
const up = routeField(start, upper), down = routeField(upper, start);
fs.mkdirSync(OUT, { recursive: true });
const receipt = { kind: 'existing-page-stair-final', startedAt: new Date().toISOString(),
  qualification: 'Declared valid logical placements; ordinary W keyboard movement with route-guided camera steering. Existing Chromium/Metal page and final game shader. No new browser/page, navigation, viewport/exposure/shader or asset changes; no uninterrupted fresh play or human acceptance claimed.',
  placements: { start, upper, detail }, asset: { path: 'public/assets/conservatory-main-stair.glb', sha256: sha(fs.readFileSync(A.STAIR_GLB)) },
  route: { up: up.steps, down: down.steps }, legs: [], screenshots: [], errors: [] };
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:58945', defaultViewport: null, protocolTimeout: 120000 });
let page;
async function state() {
  return page.evaluate(() => {
    const { FP, R, P } = window.__arrivalQA, pos = __probe.pos();
    return { pos, physical: FP.logicalToPhysical(pos.x, pos.y), floor: FP.floorAt(pos.x, pos.y),
      camera: R.r3dViewCamera(), look: R.r3dLookAngles(), scene: window.__scenes?.top()?.id || null,
      shader: window.__chunkSurferPixelMesh?.status?.(), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      meshes: P.propMeshCatalog().filter(name => /main_open_well_stair|main_stair_wall/.test(name)) };
  });
}
async function shot(filename) {
  const bytes = await page.screenshot({ path: path.join(OUT, filename) });
  receipt.screenshots.push({ file: filename, sha256: sha(bytes), bytes: bytes.length, state: await state() });
}
try {
  page = (await browser.pages()).find(candidate => candidate.url().startsWith('http://127.0.0.1:5337/?nodisplaynotice'));
  if (!page) throw Error('Exact existing parent game page is absent');
  await page.bringToFront();
  receipt.url = page.url();
  receipt.initial = await state();
  if (receipt.initial.scene) throw Error(`Existing game is blocked by ${receipt.initial.scene}; leaving its scene intact`);
  receipt.modules = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => /\/src\/(?:world\/floorplan|render\/r3d|render\/props3d)\.js|conservatory-main-stair\.glb/.test(entry.name))
    .map(entry => ({ name: entry.name, duration: entry.duration })));
  await page.evaluate(({ start }) => {
    __probe.warpRuntime(start.x, start.y);
    __probe.lookAtWorld(Math.PI, -.32);
    __arrivalQA.R.r3dSnapCameraOnNextFrame?.();
  }, { start });
  await wait(650);
  await shot('stair-walk-start-final.png');

  for (const [name, leg] of [['up', up], ['down', down]]) {
    await page.evaluate(({ leg, name }) => {
      const { R, FP } = __arrivalQA;
      const operation = window.__stairExistingWalk = { name, running: true, start: performance.now(), samples: [], inputs: [], done: false, off: null };
      const cellKey = p => `${Math.floor(p.x)},${Math.floor(p.y)}`;
      operation.listener = event => { if (event.code === 'KeyW') operation.inputs.push({ ms: performance.now() - operation.start, type: event.type, code: event.code, repeat: event.repeat }); };
      addEventListener('keydown', operation.listener); addEventListener('keyup', operation.listener);
      const tick = now => {
        if (!operation.running) return;
        const pos = __probe.pos(), camera = R.r3dViewCamera(), look = R.r3dLookAngles(), physical = FP.logicalToPhysical(pos.x, pos.y);
        operation.samples.push({ ms: now - operation.start, pos, physical, floor: FP.floorAt(pos.x, pos.y), eye: camera?.eye,
          yaw: camera?.yaw, pitch: camera?.pitch, planYaw: (camera?.yaw || 0) - (look?.yaw || 0), input: operation.inputs.at(-1)?.type || null });
        const k = cellKey(pos), edge = leg.field[k];
        if (operation.done) { requestAnimationFrame(tick); return; }
        if (k === leg.goal) operation.done = true;
        else if (!edge) operation.off = k;
        else __probe.lookAtWorld(Math.atan2(edge.dx, -edge.dy) + FP.arcYawOffset(pos.x, pos.y, physical.x, physical.z), -.34);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { leg, name });
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(() => __stairExistingWalk.done || __stairExistingWalk.off, { timeout: 45000, polling: 200 });
    } catch (error) { receipt.errors.push(`${name}: ${error.message}`); }
    await page.keyboard.up('w');
    await wait(350);
    const trace = await page.evaluate(() => {
      const op = __stairExistingWalk; op.running = false;
      removeEventListener('keydown', op.listener); removeEventListener('keyup', op.listener);
      return { name: op.name, done: op.done, off: op.off, samples: op.samples, inputs: op.inputs };
    });
    fs.writeFileSync(path.join(OUT, `stair-walk-${name}-final.json`), JSON.stringify(trace, null, 2) + '\n');
    const final = await state();
    receipt.legs.push({ name, steps: leg.steps, reached: trace.done && trace.samples.some(sample => key(sample.pos) === leg.goal),
      exactStopAfterKeyRelease: key(final.pos) === leg.goal, goalCell: leg.goal, off: trace.off,
      frames: trace.samples.length, durationMs: trace.samples.at(-1)?.ms, inputs: trace.inputs,
      floorRange: [Math.min(...trace.samples.map(s => s.floor)), Math.max(...trace.samples.map(s => s.floor))], final });
    await shot(`stair-walk-${name}-final.png`);
    console.log(JSON.stringify({ leg: name, ...receipt.legs.at(-1) }));
    if (!trace.done || trace.off) { receipt.errors.push(`${name}: route incomplete at ${key(final.pos)}`); break; }
  }

  // A close view from a genuinely occupied tread, not an analytic span's -1
  // placeholder logical address. This placement is separate from movement.
  await page.evaluate(detail => {
    __probe.warpRuntime(detail.x, detail.y);
    __arrivalQA.R.r3dSnapCameraOnNextFrame?.();
  }, detail);
  await wait(700);
  await page.evaluate(() => __probe.lookAtWorld(2.45, -.62));
  await wait(400);
  receipt.detail = await state();
  if (receipt.detail.pos.x < 0 || receipt.detail.pos.y < 0 || Math.abs(receipt.detail.floor - detail.floor) > .001) throw Error('Detail placement did not reach its real occupied tread');
  await shot('stair-detail-final.png');
  receipt.final = await state();
} catch (error) { receipt.errors.push(String(error.stack || error)); console.error(error); }
finally {
  if (page) {
    try { await page.keyboard.up('w'); await page.evaluate(() => { if (window.__stairExistingWalk) window.__stairExistingWalk.running = false; }); } catch {}
  }
  receipt.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'stair-walk-final-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  browser.disconnect();
}
console.log(JSON.stringify({ receipt: path.join(OUT, 'stair-walk-final-receipt.json'), errors: receipt.errors }));
if (receipt.errors.length || receipt.legs.some(leg => !leg.reached)) process.exitCode = 1;
