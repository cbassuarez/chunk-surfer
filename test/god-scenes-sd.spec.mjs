// The God menu's reach into the newer scenes (drives, Source journeys, side
// quests, the third floor, the tutorial's newer beats), and the stable diffusion
// switch that gives a no-SD baseline for heap and frame measurements.
//
// Run: node --test test/god-scenes-sd.spec.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lensDevControl, lensProcesses } from '../tools/chunk_surfer/lens-dev-control.mjs';
import { GOD_PLACE_SECTIONS } from '../src/data/god-hooks.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.js');
const renderer = read('../src/render/r3d.js');

function functionSource(name, source = main) {
  const start = source.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing production function ${name}`);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end + 2).replace(/^export /, '');
}
const godTabs = functionSource('godTabs');
const rowIn = (rows, id) => new RegExp(`(id:|warp\\()'${id}'`).test(rows);
const tabRows = (id) => {
  const start = godTabs.indexOf(`{id:'${id}',name:`);
  assert.ok(start >= 0, `God tab ${id}`);
  const next = godTabs.indexOf('\n    {id:', start + 1);
  return godTabs.slice(start, next < 0 ? undefined : next);
};

test('the new tabs exist and each scene row goes through that scene\'s own entry', () => {
  for (const id of ['places', 'drives', 'quests', 'academic']) tabRows(id);
  const drives = tabRows('drives');
  for (const row of ['drive-opening-van', 'drive-getin-teaser', 'drive-source-cut', 'drive-source-resume', 'drive-coastal-memory'])
    assert.ok(rowIn(drives, row), row);
  const entries = {
    godOpeningVehicle: /beginOpeningVehicleArrival\(\{god:true\}\)/,
    godGetInDriveTeaser: /beginGetInDriveTeaser\(/,
    godSourceDrive: /beginSourceDriveJourney\(\{review:true/,
    godCoastalMemory: /beginCoastalMemoryJourney\(\)/,
    godSourceEarthfall: /beginSourceEarthfall\(entry\)/,
    godDreamFigure: /beginDreamFigure\(\)/,
    godDaydream: /beginDaydream\(\)/,
    godArrivalTitle: /beginGetInArrivalTitle\(\)/,
    godPracticeStudent: /openPracticeStudent\(\)/,
    godRoofWordLock: /interactAcademicRoofProp\(\{action:'roof-gate'\}\)/,
    godRoofCitySeat: /sitAtRoofCitySeat\(\)/,
  };
  for (const [helper, entry] of Object.entries(entries)) {
    assert.match(functionSource(helper), entry, helper);
    assert.ok(godTabs.includes(helper), `${helper} is reachable from a row`);
  }
  // The van's URL checks are for the harness; a God review must pass them.
  assert.match(functionSource('beginOpeningVehicleArrival'), /debugSpawn:!god&&params\(\)\.has\('at'\)/);
  for (const row of ['source-coastal-memory', 'source-earthfall', 'source-pub-door', 'source-pub-inside', 'bust-recognition', 'bust-ritual', 'bust-return'])
    assert.ok(rowIn(tabRows('source-space'), row), row);
  for (const row of ['quest-student', 'quest-metronomes-stop', 'quest-eyes-returned', 'quest-watcher-arm', 'quest-costume-exchange', 'quest-sustained-note', 'quest-pub-favours', 'quest-pub-bar'])
    assert.ok(rowIn(tabRows('quests'), row), row);
  for (const row of ['tutorial-daydream', 'tutorial-dream-figure', 'arrival-title', 'transfer-room', 'archive'])
    assert.ok(rowIn(tabRows('scenes'), row), row);
  for (const row of ['roof-word-lock', 'roof-city-seat-sit']) assert.ok(rowIn(tabRows('roof'), row), row);
  // godTabs is evaluated as plain script by the repair suite.
  assert.equal(godTabs.includes('import.meta'), false);
});

test('the PLACES tab is built from the shared sections, and the third floor lists its rooms', () => {
  assert.match(tabRows('places'), /GOD_PLACE_SECTIONS\.flatMap/);
  assert.match(tabRows('academic'), /GOD_PLACE_SECTIONS\.find\(\(group\)=>group\.label==='Third floor'\)/);
  assert.ok(GOD_PLACE_SECTIONS.some((group) => group.label === 'Third floor' && group.hooks.length >= 10));
});

test('godProbe reaches a nested probe and answers null for one that is not there', () => {
  const calls = [];
  const ctx = vm.createContext({ window: { __probe: { a: { b: (...args) => { calls.push(args); return 'ok'; } } } } });
  vm.runInContext(functionSource('godProbe'), ctx);
  assert.equal(ctx.godProbe('a.b', 1, 2), 'ok');
  assert.deepEqual(calls, [[1, 2]]);
  assert.equal(ctx.godProbe('a.missing'), null);
  assert.equal(ctx.godProbe('nothing.here'), null);
});

test('the LOOK STACK opens with the stable diffusion switch, the nuke and the readings', () => {
  const look = tabRows('look');
  const first = look.indexOf("section('Stable diffusion')");
  assert.ok(first >= 0 && first < look.indexOf("section('Authored profiles')"));
  for (const row of ['sd-switch', 'sd-nuke', 'sd-processes', 'sd-client', 'sd-memory']) assert.ok(rowIn(look, row), row);
  assert.match(look, /id:'sd-nuke',label:'NUKE ALL SD INSTANCES',danger:true,activate:nukeStableDiffusion/);
});

function sdContext({ off = false, lens = null, storage = new Map(), dev = true, fetchReply = null, survivors = [] } = {}) {
  const events = [], looks = [], local = [];
  const store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  const R3 = {
    released: false, restored: 0,
    r3dReleaseSurfaceDream() { this.released = true; return { released: true, freedBytes: 96 * 1048576 }; },
    r3dRestoreSurfaceDream() { this.released = false; this.restored++; },
    r3dSurfaceDreamMemory() { return { released: this.released, dreamBytes: this.released ? 0 : 64, stageBytes: 0, markBytes: 0, burstBytes: 0 }; },
  };
  const window = { __diffusion: lens };
  const ctx = vm.createContext({
    console, Promise, Map, Date, String, Math, window, R3, globalThis: { localStorage: store, performance: { memory: { usedJSHeapSize: 1234 } } },
    sdOff: off, sdLastNuke: null, sdLastScan: null, lensStarting: null, lensDisabled: false, lensBlockedEulaLogged: false, SD_OFF_KEY: 'chunk-surfer.sd-off',
    IS_TAURI: false, DEV: dev, activeLookProfile: 'explore',
    params: () => new URLSearchParams(), pushEvent: (line) => events.push(line), applyLookProfile: (name) => looks.push(name),
    setLocalDiffusionActive: (on) => local.push(on), lensStartBlockedByEula: () => false,
    startLens: async () => ({ started: true }),
    fetched: [],
    fetch: async (url, init) => {
      ctx.fetched.push({ url, init });
      if (fetchReply) return fetchReply;
      const body = url.includes('dry=1') ? { dry: true, running: survivors, killed: [], foreign: [] } : { stoppedManaged: false, killed: [{ pid: 7 }], foreign: [] };
      return { ok: true, json: async () => body };
    },
  });
  const names = ['stableDiffusionOff', 'switchStableDiffusionOff', 'switchStableDiffusionOn', 'scanStableDiffusionProcesses', 'nukeStableDiffusion', 'stableDiffusionReport', 'ensureLensStarted', 'requireLensStarted'];
  // import.meta is module-only; the dev branch is otherwise the production text.
  vm.runInContext(names.map((name) => functionSource(name)).join('\n').replace(/import\.meta\.env\?\.DEV/g, 'DEV'), ctx);
  return { ctx, events, looks, local, R3, storage, window };
}

test('switching SD off stops the client, closes its bitmaps, frees the textures, and keeps it off', async () => {
  let stopped = 0, closed = 0;
  const frame = () => ({ close: () => closed++ });
  const lens = { stop: () => stopped++, stats: { state: 'live', framesOut: 40, framesIn: 12 }, banks: new Map([['calm', [[frame(), frame()], frame()]], ['dark', [[frame()]]]]) };
  const f = sdContext({ lens });
  assert.equal(f.ctx.stableDiffusionReport().client, true);
  f.ctx.switchStableDiffusionOff();
  assert.equal(stopped, 1); assert.equal(closed, 4); assert.equal(lens.banks.size, 0);
  assert.equal(f.window.__diffusion, null); assert.equal(f.R3.released, true);
  assert.deepEqual(f.local, [false]); assert.deepEqual(f.looks, ['explore']);
  assert.equal(f.storage.get('chunk-surfer.sd-off'), '1');
  assert.match(f.events.at(-1), /96 MB/);
  // Nothing starts it again while it is off: not a look profile, not the boot gate.
  assert.equal(f.ctx.ensureLensStarted(), null);
  await assert.rejects(f.ctx.requireLensStarted(), /licence/);
  const report = f.ctx.stableDiffusionReport();
  assert.equal(report.off, true); assert.equal(report.client, false); assert.equal(report.framesOut, 0); assert.equal(report.textureBytes, 0);
  assert.equal(report.jsHeapBytes, 1234);
});

test('switching SD back on restores the textures and starts the lens through the usual gate', async () => {
  const f = sdContext({ off: true, storage: new Map([['chunk-surfer.sd-off', '1']]) });
  assert.equal(f.ctx.switchStableDiffusionOn(), true);
  assert.equal(f.storage.has('chunk-surfer.sd-off'), false);
  assert.equal(f.R3.restored, 1); assert.deepEqual(f.local, [true]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.looks, ['explore']);
});

test('the nuke switches SD off first, ends the lens processes, then looks again', async () => {
  const f = sdContext({ lens: { stop() {}, banks: new Map() } });
  const result = await f.ctx.nukeStableDiffusion();
  assert.equal(f.ctx.stableDiffusionOff(), true);
  const [nuke, scan] = f.ctx.fetched;
  assert.equal(nuke.url, '/__chunk/lens/nuke'); assert.equal(nuke.init.method, 'POST');
  assert.equal(nuke.init.headers['x-chunk-dev-control'], '1');
  assert.equal(scan.url, '/__chunk/lens/nuke?dry=1');
  assert.equal(result.killed.length, 1); assert.equal(result.survivors.length, 0); assert.equal(result.error, null);
  assert.equal(f.ctx.sdLastNuke, result);
  // Something that came back is reported, not hidden.
  const stubborn = sdContext({ survivors: [{ pid: 9 }] });
  assert.equal((await stubborn.ctx.nukeStableDiffusion()).survivors.length, 1);
  assert.match(stubborn.events.at(-1), /1 STILL RUNNING/);
  const refused = sdContext({ fetchReply: { ok: false, status: 403 } });
  assert.match((await refused.ctx.nukeStableDiffusion()).error, /403/);
  // A release page with no desktop shell has nothing to end, and says so.
  const release = sdContext({ dev: false });
  const quiet = await release.ctx.nukeStableDiffusion();
  assert.equal(release.ctx.fetched.length, 0); assert.equal(quiet.killed.length, 0);
  assert.match((await release.ctx.scanStableDiffusionProcesses()).error, /cannot see/);
});

test('the boot gate and its retry pass straight through with SD off', () => {
  assert.match(main, /const calibrate=async\(\)=>stableDiffusionOff\(\)\?null:activateStartupBank\(await requireLensStarted\(qp\)\);/);
  assert.match(main, /retry:async\(\)=>\{\n\s+if\(stableDiffusionOff\(\)\)return null;/);
  assert.match(main, /params\(\)\.has\('nosd'\)/);
  // Booting into the baseline frees the arrays the renderer allocates up front,
  // and nothing that wakes the building turns diffusion back on.
  assert.match(main, /R3\.r3dInit\(MAP_EL\);\n.*\n.*\n\s+if\(stableDiffusionOff\(\)\)R3\.r3dReleaseSurfaceDream\?\.\(\);/);
  assert.match(functionSource('setLocalDiffusionActive'), /active&&!stableDiffusionOff\(\)/);
});

test('the renderer can release and restore every generated texture', () => {
  for (const name of ['r3dReleaseSurfaceDream', 'r3dRestoreSurfaceDream', 'r3dSurfaceDreamMemory'])
    assert.match(renderer, new RegExp(`export function ${name}\\(`), name);
  const release = functionSource('r3dReleaseSurfaceDream', renderer);
  assert.match(release, /for\(const t of \[surfDreamTex,surfDreamStageTex,surfMarkTex\]\)if\(t\)gl\.deleteTexture\(t\);/);
  assert.match(release, /gl\.deleteTexture\(burstTex\)/);
  assert.match(functionSource('r3dBeginSurfaceDreamBank', renderer), /if\(surfDreamReleased\)r3dRestoreSurfaceDream\(\);/);
});

test('the desktop shell has a nuke command, and the page can call it', () => {
  const rust = read('../src-tauri/src/lens_service.rs'), lib = read('../src-tauri/src/lib.rs'), service = read('../src/platform/lens-service.js');
  assert.match(rust, /#\[tauri::command\]\s*(pub )?(async )?fn chunk_lens_nuke/);
  assert.match(lib, /lens_service::chunk_lens_nuke/);
  assert.match(service, /export async function nukeNativeLens\(/);
  assert.match(service, /invoke\('chunk_lens_nuke'\)/);
  assert.match(read('../vite.config.js'), /lensDevControl\(\)/);
});

test('the dev nuke ends every copy of this game\'s lens and reports other diffusion servers', () => {
  const root = '/Users/someone/chunk-surfer';
  const ps = () => [
    `  101 /usr/bin/python3 ${root}/tools/chunk_surfer/diffusion_server/server.py --port 8001`,
    '  102 /Applications/Chunk Surfer.app/Contents/MacOS/chunk-lens --port 9000',
    '  103 /usr/bin/python3 /elsewhere/diffusion_server/server.py',
    '  104 /opt/other/chunk-lens',
    '  105 /usr/bin/node vite',
    `  106 /bin/zsh -c grep server.py ${root}`,
  ].join('\n');
  // Every chunk-lens is this game's sidecar, whichever build left it running;
  // a lens server is this game's when it is this repo's layout, any checkout.
  const found = lensProcesses({ ps });
  assert.deepEqual(found.ours.map((p) => p.pid), [101, 102, 104]);
  assert.deepEqual(found.foreign.map((p) => p.pid), [103]);
});

test('the dev endpoint refuses anything but a same-origin POST with its header', async () => {
  let handler = null;
  lensDevControl().configureServer({ config: { root: '/nowhere' }, middlewares: { use: (path, fn) => { assert.equal(path, '/__chunk/lens/nuke'); handler = fn; } } });
  const call = async (req) => { const res = { statusCode: 200, body: '', setHeader() {}, end(b) { this.body = b; } }; await handler(req, res); return res; };
  const host = 'localhost:5173';
  assert.equal((await call({ method: 'GET', headers: { host, 'x-chunk-dev-control': '1' } })).statusCode, 403);
  assert.equal((await call({ method: 'POST', headers: { host } })).statusCode, 403);
  assert.equal((await call({ method: 'POST', headers: { host, origin: 'http://evil.example', 'x-chunk-dev-control': '1' } })).statusCode, 403);
  assert.equal(lensDevControl().apply, 'serve');
  // A dry run reports and ends nothing (this reads the real process table).
  const dry = await call({ method: 'POST', url: '/?dry=1', headers: { host, origin: `http://${host}`, 'x-chunk-dev-control': '1' } });
  assert.equal(dry.statusCode, 200);
  const report = JSON.parse(dry.body);
  assert.equal(report.dry, true); assert.equal(report.killed.length, 0); assert.ok(Array.isArray(report.running));
});

test('the desktop shell scans and nukes by the same rule', () => {
  const rust = read('../src-tauri/src/lens_service.rs');
  assert.match(rust, /fn chunk_lens_scan/);
  assert.match(read('../src-tauri/src/lib.rs'), /lens_service::chunk_lens_scan/);
  assert.match(rust, /command\.contains\("chunk_surfer\/diffusion_server\/server\.py"\)/);
  assert.match(read('../src/platform/lens-service.js'), /invoke\('chunk_lens_scan'\)/);
});

test('none of the new copy uses the words ruled out', () => {
  const start = main.indexOf('// ── GOD ROWS FOR THE SCENES AND PLACES ADDED SINCE THE LAST SWEEP');
  const end = main.indexOf('function godTabs(){');
  const sdStart = main.indexOf('// ── THE NO-SD BASELINE'), sdEnd = main.indexOf('let lensDisabled=false;');
  assert.ok(start > 0 && end > start && sdStart > 0 && sdEnd > sdStart);
  const rowsOf = (id) => tabRows(id);
  const texts = [main.slice(start, end), main.slice(sdStart, sdEnd), rowsOf('places'), rowsOf('drives'), rowsOf('quests'), rowsOf('academic'),
    read('../tools/chunk_surfer/lens-dev-control.mjs'), read('../src/data/god-hooks.js')];
  // The sustained-note adversary's code id is the one exception: the row has to
  // pass it, and the row's label says SUSTAINED NOTE.
  for (const text of texts) assert.doesNotMatch(text.replace(/'held'/g, ''), /\bheld\b|\bhold(s|ing)?\b|threshold/i);
});
