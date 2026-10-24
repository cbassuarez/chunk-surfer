// THE EAR ROOM, MEASURED (data/stop-listening.js). Phase-1 evidence only: it
// changes nothing in the game. Through the REAL diffusion lens, never the mock:
// the mock is honest about lighting and dishonest about ink, grain and density,
// and legibility is ink, grain and density.
//
//   npm run lens:local                                   (ws://127.0.0.1:8000)
//   npx vite --host 127.0.0.1 --port 5199 --strictPort
//   node tools/chunk_surfer/measure-ear-room.mjs frames|audio|fear [room ...]
//
//   frames  from each room's doorway: the first ten seconds as he comes in, a
//           beam sweep, and every frame again with the ears, the writing and
//           the sheet left out in turn (__probe.stopListeningHide), torch on
//           and off. Displayed frames (page screenshots), because the lens and
//           the dither happen on the way to the screen.
//   audio   the AudioContext's own output, tapped where every node meets the
//           destination, plus the gut layer by itself where it leaves its
//           module: standing, walking, without the gut, during a take, and the
//           take played back.
//   fear    a real B3 take, then in through the candidate's door, sampling the
//           game's fear number and presented pressure four times a second.
//
// Analysis (LUFS, spectra, OCR, differentials) is analyse-ear-room.py.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { STOP_LISTENING_ROOMS } from '../../src/data/stop-listening.js';

const LENS = process.env.LENS_URL || 'ws://127.0.0.1:8000';
const BASE = process.env.CHUNK_SURFER_URL || 'http://127.0.0.1:5199';
const OUT = 'artifacts/ear-room/phase1';
const S = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;
const ALL_TAKES = ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'];
// facing: warpCell's quarter turns (1 is east). yaw: the world bearing into the
// room. outside: a cell on the corridor side of the door, for the fear walk.
const ROOMS = {
  the_tub: { facing: 2, yaw: S, encounters: ['natatorium-approach'], outside: [84, 26.4] },
  amplifications: { facing: 1, yaw: E, outside: [97.6, 24.5] },
  soundnoisemusic: { facing: 3, yaw: W, flags: ['practice.metronomes.quieted', 'practice.student.heard'], outside: [77.5, 54.5] },
};
const SWEEP = [-90, -45, 0, 45, 90, 180];
// `null` hides a kind that does not exist: the same resync and redraw as every
// other omission with nothing taken away, so its difference from `all` is what
// the act of toggling costs, separate from the lens's own boil (`all-again`).
const CONDITIONS = { all: [], 'no-ears': ['ear', 'heap'], 'no-writing': ['writing'], 'no-sheet': ['sheet'], null: ['none'] };
const SAMPLES = [0, 1, 2];

const mode = process.argv[2] || 'frames';
const only = process.argv.slice(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every connection into the destination is also fed to a recorder, and the gut
// layer's own output is fed to a second one at the point it leaves its module
// (the first connect from a node it made to a node it did not).
function capturePatch() {
  const proto = AudioNode.prototype, connect = proto.connect;
  const cap = window.__earCap = { recording: false, chunks: { mix: [], gut: [] }, rate: 0, gutLinks: [] };
  for (const name of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!/^create/.test(name) || typeof BaseAudioContext.prototype[name] !== 'function') continue;
    const make = BaseAudioContext.prototype[name];
    BaseAudioContext.prototype[name] = function (...args) {
      const node = make.apply(this, args);
      if (node && typeof node === 'object' && /stop-listening-gut/.test(new Error().stack || '')) node.__fromGut = true;
      return node;
    };
  }
  function taps(ctx) {
    if (ctx.__earTaps) return ctx.__earTaps;
    const sink = ctx.createGain(); sink.gain.value = 0; connect.call(sink, ctx.destination);
    const recorder = (name) => {
      const sp = ctx.createScriptProcessor(4096, 2, 2);
      sp.onaudioprocess = (e) => {
        if (!cap.recording) return;
        cap.chunks[name].push([new Float32Array(e.inputBuffer.getChannelData(0)), new Float32Array(e.inputBuffer.getChannelData(1))]);
      };
      connect.call(sp, sink);
      return sp;
    };
    cap.rate = ctx.sampleRate;
    ctx.__earTaps = { mix: recorder('mix'), gut: recorder('gut') };
    return ctx.__earTaps;
  }
  proto.connect = function (target, ...rest) {
    const ctx = this.context;
    if (ctx && target === ctx.destination && !ctx.__earInTap) {
      ctx.__earInTap = true;
      try { connect.call(this, taps(ctx).mix); } finally { ctx.__earInTap = false; }
    } else if (this.__fromGut && target instanceof AudioNode && !target.__fromGut) {
      connect.call(this, taps(ctx).gut);
      cap.gutLinks.push({ from: this, to: target });
    }
    return connect.call(this, target, ...rest);
  };
  // Gut off: cut its output from the bus without touching its own gain, which
  // its runtime rewrites every frame.
  window.__earGut = (on) => {
    for (const { from, to } of cap.gutLinks) {
      try { from.disconnect(to); } catch { /* not connected */ }
      if (on) connect.call(from, to);
    }
    return cap.gutLinks.length;
  };
  window.__earStart = () => { cap.chunks = { mix: [], gut: [] }; cap.recording = true; return cap.rate; };
  window.__earStop = async () => {
    cap.recording = false;
    const out = {};
    for (const [name, chunks] of Object.entries(cap.chunks)) {
      const n = chunks.reduce((s, [l]) => s + l.length, 0), pcm = new Int16Array(n * 2);
      let at = 0;
      for (const [l, r] of chunks) for (let i = 0; i < l.length; i++) {
        pcm[at++] = Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767)));
        pcm[at++] = Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767)));
      }
      const blob = new Blob([pcm.buffer]);
      out[name] = await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    }
    return { rate: cap.rate, ...out };
  };
}

function wav(file, b64, rate) {
  const data = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

async function boot(browser) {
  const context = await (browser.createBrowserContext?.() ?? browser.createIncognitoBrowserContext());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => { errors.push(String(e)); console.log('  PAGEERROR', String(e).slice(0, 200)); });
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }));
  if (mode === 'audio') await page.evaluateOnNewDocument(capturePatch);
  // Sound and fear are not pictures: they get the lens stub the pixel harness
  // uses (startLens yields to an existing __diffusion), so they never queue
  // behind a frame capture for the GPU. Frames always get the real lens.
  if (mode !== 'frames') await page.evaluateOnNewDocument(() => {
    window.__diffusion = { ready: Promise.resolve(), stats: { criticalBank: 'calm', resident: true, state: 'stub' },
      activateBank: async () => true, retry: async () => true };
  });
  await page.goto(`${BASE}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&diffusion=${encodeURIComponent(LENS)}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const deadline = Date.now() + 600000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('boot never reached the game');
    const at = await page.evaluate(() => ({ id: window.__scenes?.top?.()?.id || null, screen: window.__chunkParity?.().screen || null })).catch(() => ({}));
    if (at.screen === 'game') break;
    if (at.id === 'opening-credits') await page.evaluate(() => window.__scenes.top().update(30));
    else if (['eula', 'title', 'difficulty-select'].includes(at.id)) await page.keyboard.press('Enter');
    else if (at.id === 'warning') { await page.keyboard.press('Enter'); await page.keyboard.press('n'); }
    await sleep(500);
  }
  // Every material bank, not just the boot one: frames taken while banks are
  // still arriving would be measuring the lens loading, not the room.
  const t0 = Date.now();
  if (mode !== 'frames') return { page, errors, lens: { state: 'stub' } };
  await page.waitForFunction(() => window.__diffusion?.stats?.resident === true, { timeout: 900000, polling: 1000 });
  const lens = await page.evaluate(() => ({ ...window.__diffusion.stats }));
  console.log(`  lens resident after ${((Date.now() - t0) / 1000).toFixed(0)}s: banks ${lens.banksReady} state ${lens.state} mutation ${lens.mutationState}`);
  return { page, errors, lens };
}

async function stage(page, roomId) {
  const room = ROOMS[roomId];
  await page.evaluate((flags) => {
    window.__probe.testRun();
    window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint', 'kit.fitted', ...flags]);
  }, room.flags || []);
  await sleep(3000);
  await page.evaluate((all) => { window.__probe.setTakes(all, false); window.__probe.setTakes(['main_b3'], true); }, ALL_TAKES);
  for (const id of room.encounters || []) await page.evaluate((e) => window.__probe.clearEncounter(e), id);
  const state = await page.evaluate(() => window.__probe.stopListeningReset());
  if (!state.staged.includes(roomId)) throw new Error(`${roomId} not staged: ${state.staged}`);
  const entry = STOP_LISTENING_ROOMS[roomId].entry;
  await page.evaluate(([x, y, f]) => window.__probe.warpCell(x, y, f), [entry.x, entry.y, room.facing]);
  await page.evaluate((yaw) => { window.__probe.setTorch(true); window.__probe.lookAtWorld(yaw, 0); }, room.yaw);
  let entered = await page.evaluate(() => window.__probe.stopListeningEnterHere());
  // Some authored entries sit a step short of the room's own zone (the wing's
  // is on the landing). One step in to cross it, then back to the doorway.
  if (entered.state.room !== roomId) {
    const step = 1.1, ahead = [entry.x + Math.sin(room.yaw) * step, entry.y - Math.cos(room.yaw) * step];
    await page.evaluate(([x, y, f]) => window.__probe.warpCell(x, y, f), [...ahead, room.facing]);
    entered = await page.evaluate(() => window.__probe.stopListeningEnterHere());
    await page.evaluate(([x, y, f, yaw]) => { window.__probe.warpCell(x, y, f); window.__probe.lookAtWorld(yaw, 0); }, [entry.x, entry.y, room.facing, room.yaw]);
  }
  if (entered.state.room !== roomId) throw new Error(`${roomId} was not entered (here ${entered.here})`);
  return entered;
}

async function shot(page, file) { await page.screenshot({ path: file }); }
async function settle(page, ms) {
  await sleep(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function frames(browser, roomId) {
  const dir = `${OUT}/${roomId}/frames`; fs.mkdirSync(dir, { recursive: true });
  const { page, errors, lens } = await boot(browser);
  const room = ROOMS[roomId], log = { room: roomId, lens, shots: [] };
  try {
    const entered = await stage(page, roomId);
    const t0 = Date.now();
    log.entered = { room: entered.state.room, byKind: entered.byKind };
    // The first ten seconds, as he comes through: looking in, light on, the
    // arrival line arriving when it arrives.
    for (const t of [0.5, 2, 4, 6, 8, 10]) {
      const wait = t * 1000 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      const file = `${dir}/first10-t${String(t).replace('.', '_')}.png`;
      await shot(page, file);
      log.shots.push({ kind: 'first10', t, file, speech: await page.evaluate(() => window.__probe.speech()) });
    }
    // Let the arrival lines finish so the band is empty for the measurements.
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await sleep(250); }
    await settle(page, 2500);
    for (const torch of [true, false]) {
      await page.evaluate((on) => window.__probe.setTorch(on), torch);
      const offsets = torch ? SWEEP : [0];
      for (const off of offsets) {
        const yaw = room.yaw + off * Math.PI / 180;
        await page.evaluate((y) => window.__probe.lookAtWorld(y, 0), yaw);
        // all, each omission, then all again: the second `all` is the lens's
        // own frame-to-frame change, the floor every difference is judged by.
        for (const [cond, kinds] of [...Object.entries(CONDITIONS), ['all-again', []]]) {
          if (!torch && !['all', 'no-ears', 'null', 'all-again'].includes(cond)) continue;
          await page.evaluate((k) => window.__probe.stopListeningHide(k), kinds);
          await settle(page, 1100);
          for (const k of SAMPLES) {
            const file = `${dir}/sweep-${torch ? 'on' : 'off'}-${off}-${cond}-${k}.png`;
            await shot(page, file);
            log.shots.push({ kind: 'sweep', torch, off, cond, k, file });
            fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log, null, 1));
            await sleep(300);
          }
        }
      }
      await page.evaluate(() => window.__probe.stopListeningHide([]));
    }
    // Looking down from the doorway, the way a man does when the floor is wrong.
    await page.evaluate((yaw) => { window.__probe.setTorch(true); window.__probe.lookAtWorld(yaw, -0.6); }, room.yaw);
    for (const [cond, kinds] of [['all', []], ['no-ears', ['ear', 'heap']], ['null', ['none']], ['all-again', []]]) {
      await page.evaluate((k) => window.__probe.stopListeningHide(k), kinds);
      await settle(page, 1100);
      for (const k of SAMPLES) {
        const file = `${dir}/down-on-0-${cond}-${k}.png`;
        await shot(page, file);
        log.shots.push({ kind: 'down', torch: true, off: 0, cond, k, file });
        await sleep(300);
      }
    }
    await page.evaluate(() => window.__probe.stopListeningHide([]));
    // THE POSITIVE CONTROL. Each painted wall, square on from 1.6 m, lit. If
    // OCR cannot read the paint here, it proves nothing about the doorway.
    const writing = STOP_LISTENING_ROOMS[roomId].writing;
    for (let i = 0; i < writing.length; i++) {
      const w = writing[i], n = w.mountNormal;
      const at = [w.x + n.nx * 1.6, w.y + n.ny * 1.6], yaw = Math.atan2(-n.nx, n.ny);
      await page.evaluate(([x, y, yw]) => { window.__probe.warpCell(x, y); window.__probe.setTorch(true); window.__probe.lookAtWorld(yw, -0.08); }, [...at, yaw]);
      for (const [cond, kinds] of [['all', []], ['no-writing', ['writing']]]) {
        await page.evaluate((k) => window.__probe.stopListeningHide(k), kinds);
        await settle(page, 1300);
        const file = `${dir}/close-${i}-${cond}.png`;
        await shot(page, file);
        log.shots.push({ kind: 'close', torch: true, off: i, cond, k: 0, file, mesh: w.mesh, elevation: w.elevation });
      }
      await page.evaluate(() => window.__probe.stopListeningHide([]));
    }
    log.errors = errors;
  } finally {
    fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log, null, 1));
    await page.browserContext().close();
  }
}

async function record(page, dir, name, seconds, during = null) {
  await page.evaluate(() => window.__earStart());
  const t0 = Date.now();
  if (during) await during();
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  const got = await page.evaluate(() => window.__earStop());
  for (const stem of ['mix', 'gut']) wav(`${dir}/${name}.${stem}.wav`, got[stem], got.rate);
  const audio = await page.evaluate(() => window.__probe.stopListening().audio);
  console.log(`  ${name}: ${seconds}s @ ${got.rate} Hz · audible ${audio?.audible} muted ${audio?.muted}`);
  return { name, seconds, rate: got.rate, audio };
}

async function audio(browser, roomId) {
  const dir = `${OUT}/${roomId}/audio`; fs.mkdirSync(dir, { recursive: true });
  const { page, errors } = await boot(browser);
  const room = ROOMS[roomId], log = { room: roomId, takes: [] };
  try {
    await stage(page, roomId);
    await page.waitForFunction(() => window.__probe.stopListening().audio?.loaded, { timeout: 60000 });
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await sleep(250); }
    await sleep(4000);
    log.links = await page.evaluate(() => window.__earGut(true));
    log.takes.push(await record(page, dir, 'still', 15));
    await page.evaluate(() => window.__earGut(false));
    log.takes.push(await record(page, dir, 'still-no-gut', 15));
    await page.evaluate(() => window.__earGut(true));
    log.takes.push(await record(page, dir, 'walk', 8, async () => {
      await page.keyboard.down('ArrowUp'); await sleep(5000); await page.keyboard.up('ArrowUp');
    }));
    const entry = STOP_LISTENING_ROOMS[roomId].entry;
    await page.evaluate(([x, y, f, yaw]) => { window.__probe.warpCell(x, y, f); window.__probe.lookAtWorld(yaw, 0); }, [entry.x, entry.y, room.facing, room.yaw]);
    await sleep(2000);
    // His job: headphones on and roll. What the monitor carries while it rolls.
    log.roll = await page.evaluate(() => window.__probe.rollTake());
    log.takes.push(await record(page, dir, 'take', 20));
    // Let it run to a keepable length, then stop and play it back.
    for (let i = 0; i < 80 && await page.evaluate(() => window.__probe.rec().recording); i++) await sleep(1000);
    log.afterTake = await page.evaluate(() => ({ rec: { takes: window.__probe.rec().takes, spoiled: window.__probe.rec().spoiled, spoilReason: window.__probe.rec().spoilReason, elapsed: window.__probe.rec().takeElapsed } }));
    await page.evaluate(() => window.__probe.stopTake());
    await sleep(1500);
    await page.keyboard.press('p');
    await sleep(500);
    log.playback = await page.evaluate(() => window.__probe.playback());
    log.takes.push(await record(page, dir, 'playback', 20));
    log.playbackAfter = await page.evaluate(() => window.__probe.playback());
    log.errors = errors;
  } finally {
    fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log, null, 1));
    await page.browserContext().close();
  }
}

async function fear(browser, roomId) {
  const dir = `${OUT}/${roomId}/fear`; fs.mkdirSync(dir, { recursive: true });
  const { page, errors } = await boot(browser);
  const room = ROOMS[roomId], samples = [], marks = [];
  let sampling = true, t0 = Date.now();
  const sampler = (async () => {
    while (sampling) {
      const s = await page.evaluate(() => {
        const p = window.__presentedFearPressure || {}, f = window.__probe.fear(), pr = window.__probe.presence();
        return { fear: f.level, overall: p.overall ?? null, heartbeat: p.heartbeat ?? null, visualDread: p.visualDread ?? null,
          monitorHiss: p.monitorHiss ?? null, presence: { active: !!pr.active, dist: pr.dist ?? null, pressure: pr.pressure ?? null },
          here: window.__probe.stopListening().here, earRoom: window.__probe.stopListening().state.room,
          recording: window.__probe.rec().recording };
      }).catch(() => null);
      if (s) samples.push({ t: (Date.now() - t0) / 1000, ...s });
      await sleep(250);
    }
  })();
  const mark = (what) => { marks.push({ t: (Date.now() - t0) / 1000, what }); console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s ${what}`); };
  try {
    await page.evaluate((flags) => {
      window.__probe.testRun();
      window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint', 'kit.fitted', ...flags]);
    }, room.flags || []);
    for (const id of room.encounters || []) await page.evaluate((e) => window.__probe.clearEncounter(e), id);
    await sleep(3000);
    t0 = Date.now();
    await page.evaluate(() => window.__probe.godWarpHook('studio-b3'));
    await sleep(3000);
    // A real B3 take will not finish headless (its first minute waits on a
    // recording fragment), so do what its completion does: B3 goes on tape
    // and the building's presence is summoned, exactly as
    // summonPresence('take-complete') would (spawnBuildingPresence).
    mark('B3 on tape; presence summoned as take-complete does');
    const summoned = await page.evaluate(() => { window.__probe.setTakes(['main_b3'], true); return window.__probe.spawnPresenceHabitable(); });
    mark(`presence ${summoned ? 'spawned' : 'NOT spawned'}`);
    await page.evaluate(() => window.__probe.stopTake());
    await sleep(15000);
    mark('outside the door');
    await page.evaluate(([x, y, f, yaw]) => { window.__probe.warpCell(x, y, f); window.__probe.setTorch(true); window.__probe.lookAtWorld(yaw, 0); }, [...room.outside, room.facing, room.yaw]);
    await sleep(8000);
    mark('walk in');
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__probe.stopListening().here)) !== roomId; i++) await sleep(100);
    await page.keyboard.up('ArrowUp');
    if ((await page.evaluate(() => window.__probe.stopListening().here)) !== roomId) {
      const entry = STOP_LISTENING_ROOMS[roomId].entry;
      await page.evaluate(([x, y, f, yaw]) => { window.__probe.warpCell(x, y, f); window.__probe.lookAtWorld(yaw, 0); }, [entry.x, entry.y, room.facing, room.yaw]);
      await page.evaluate(() => window.__probe.stopListeningEnterHere());
      mark('door shut: warped through');
    }
    mark(`inside: ear room ${await page.evaluate(() => window.__probe.stopListening().state.room)}`);
    await sleep(30000);
    mark('end');
  } finally {
    sampling = false; await sampler;
    fs.writeFileSync(`${dir}/samples.json`, JSON.stringify({ room: roomId, marks, samples, errors }, null, 1));
    await page.browserContext().close();
  }
}

// THE OCR CONTROL. A sign the game means you to read: the PRACTICE WING plate
// on the upper landing, from 1.6 m, by torch, through the same lens. If OCR
// reads this and not the paint, the paint is the problem; if it reads neither,
// OCR is the problem and the paint result means nothing.
async function control(browser) {
  const dir = `${OUT}/control`; fs.mkdirSync(dir, { recursive: true });
  const { page, errors } = await boot(browser);
  const log = { shots: [] };
  try {
    await page.evaluate(() => { window.__probe.testRun(); window.__probe.setFlags(['combat.trained', 'setup.levels', 'setup.waypoint', 'kit.fitted']); });
    await sleep(3000);
    const plate = await page.evaluate(() => window.__probe.props().instances.find((p) => p.id === 'landing-upper-floor-landing') || null);
    log.plate = plate;
    if (!plate) throw new Error('no landing plate prop');
    // Try each side; keep the frames, the analysis decides which one faced it.
    for (const [name, dx, dy] of [['n', 0, -3.2], ['s', 0, 3.2], ['e', 3.2, 0], ['w', -3.2, 0]]) {
      const at = { x: plate.x + dx, y: plate.y + dy };
      const yaw = Math.atan2(-dx, dy);
      // warpCell takes authored metres; props report runtime cells, and a
      // runtime point is round(metres * 2) + 1.
      await page.evaluate(([x, y]) => window.__probe.warpCell(x, y), [(at.x - 1) / 2, (at.y - 1) / 2]);
      const pos = await page.evaluate(() => window.__probe.pos());
      await page.evaluate((y) => { window.__probe.setTorch(true); window.__probe.lookAtWorld(y, 0.05); }, yaw);
      await settle(page, 1500);
      const file = `${dir}/plate-${name}.png`;
      await shot(page, file);
      log.shots.push({ name, file, at, pos, yaw });
    }
    log.errors = errors;
  } finally {
    fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log, null, 1));
    await page.browserContext().close();
  }
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 900000,
});
try {
  if (mode === 'control') await control(browser);
  else for (const roomId of Object.keys(ROOMS)) {
    if (only.length && !only.includes(roomId)) continue;
    console.log(`${mode} ${roomId}`);
    await ({ frames, audio, fear })[mode](browser, roomId);
  }
} catch (error) {
  console.error('FAIL', error.stack); process.exitCode = 1;
} finally { await browser.close(); }
