// HEAR THE EAR ROOM WITHOUT PLAYING TO IT.
//
// Runs the real runtime (src/audio/stop-listening-gut.js) in an
// OfflineAudioContext in headless Chrome: he comes in at the door, walks to the
// first heap, turns slowly through a full circle, then opens the monitor for
// three seconds and closes it again. Writes one stereo WAV per room and prints
// level and balance, so a change to the mix can be measured as well as heard.
//
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/render-stop-listening-preview.mjs [room ...]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { STOP_LISTENING_ROOMS, STOP_LISTENING_ROOM_IDS } from '../../src/data/stop-listening.js';

const PORT = Number(process.env.PORT) || 5199;
const OUT = 'artifacts/stop-listening/preview';
fs.mkdirSync(OUT, { recursive: true });
const rooms = process.argv.slice(2).length ? process.argv.slice(2) : STOP_LISTENING_ROOM_IDS;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 240)));
await page.goto(`http://127.0.0.1:${PORT}/src/audio/stop-listening-gut.js`, { waitUntil: 'load' });

function wav(left, right, rate) {
  const n = left.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

for (const roomId of rooms) {
  const room = STOP_LISTENING_ROOMS[roomId];
  const result = await page.evaluate(async ({ roomId, room }) => {
    const { createStopListeningGutRuntime } = await import('/src/audio/stop-listening-gut.js');
    const rate = 44100, seconds = 18, step = 0.05;
    const ctx = new OfflineAudioContext(2, rate * seconds, rate);
    let seed = 4417;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const runtime = createStopListeningGutRuntime({ context: ctx, destination: ctx.destination, random, urlFor: (f) => `/audio/stop-listening/${f}` });
    // Decode first, the way the room has usually loaded by the time he is in it.
    runtime.update({ active: true, roomId, voices: [], yaw: 0 });
    await new Promise((resolve) => { const t = setInterval(() => { if (runtime.update({ active: true, roomId, voices: [], yaw: 0 }).loaded) { clearInterval(t); resolve(); } }, 50); });
    const heap = room.heaps[0], entry = room.entry;
    const frames = [];
    for (let t = 0; t < seconds; t += step) {
      ctx.suspend(t).then(() => {
        // 0-6 s walk in; 6-13 s turn a full circle; 13-16 s the monitor is open.
        const walk = Math.min(1, t / 6);
        const x = entry.x + (heap.x - entry.x) * walk * .8, y = entry.y + (heap.y - entry.y) * walk * .8;
        const ahead = Math.atan2(heap.x - entry.x, -(heap.y - entry.y));
        const yaw = ahead + (t > 6 ? Math.min(1, (t - 6) / 7) * Math.PI * 2 : 0);
        const voices = room.voices.map((v, i) => ({ id: `${roomId}:${i}`, dx: v.x - x, dz: v.y - y, gain: v.gain }));
        const f = runtime.update({ active: true, roomId, voices, yaw, muted: t >= 13 && t < 16 });
        if (Math.abs(t * 2 - Math.round(t * 2)) < 1e-6) frames.push({ t, audible: f.audible, fired: f.fired, pan0: f.voices?.[0]?.pan });
        ctx.resume();
      });
    }
    const out = await ctx.startRendering();
    const L = out.getChannelData(0), R = out.getChannelData(1);
    const stats = (a, b, from, to) => { let s = 0, p = 0, l = 0, r = 0; for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i++) { const m = (a[i] + b[i]) / 2; s += m * m; p = Math.max(p, Math.abs(a[i]), Math.abs(b[i])); l += a[i] * a[i]; r += b[i] * b[i]; } const n = Math.max(1, Math.floor((to - from) * rate)); return { rmsDb: +(10 * Math.log10(s / n + 1e-12)).toFixed(1), peak: +p.toFixed(3), balanceDb: +(10 * Math.log10((l + 1e-12) / (r + 1e-12))).toFixed(1) }; };
    return { rate, left: Array.from(L), right: Array.from(R), frames,
      walk: stats(L, R, 1, 6), turn: stats(L, R, 6, 13), monitor: stats(L, R, 13.5, 16), after: stats(L, R, 16.5, 18) };
  }, { roomId, room });
  fs.writeFileSync(`${OUT}/${roomId}.wav`, wav(result.left, result.right, result.rate));
  const fired = result.frames.at(-1)?.fired ?? 0;
  console.log(`${roomId.padEnd(16)} walk ${JSON.stringify(result.walk)}  turn ${JSON.stringify(result.turn)}  monitor-open ${JSON.stringify(result.monitor)}  after ${JSON.stringify(result.after)}  events ${fired}`);
}
await browser.close();
console.log(`wrote ${OUT}/*.wav`);
