// Every ending, played and photographed.
//
// The endings are the least-walked part of the game — three hours and a specific
// route each — so they were also the least LOOKED at, which is most of how they
// stayed four lines long. playEnding() is the whole path now (dossier, flags,
// arrival passage, timeline, coda), so driving it from here exercises exactly
// what a real run reaches.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/tests/ending-shots.mjs [tag]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const tag = process.argv[2] || 'now';
const output = path.resolve(process.env.OUT || `artifacts/ending-shots/${tag}`);
fs.mkdirSync(output, { recursive: true });

// One representative arrival for every distinct ending. Arrival variants are
// narrative branches inside Sacrifice; the physical contract belongs to the
// nine route IDs below.
const ALL_RUNS = [
  { id: 'sacrifice', arrival: 'agreed', note: 'chose to stay, named her' },
  { id: 'helped', arrival: 'agreed', note: 'the coffee' },
  { id: 'inversion', arrival: 'escaped', note: 'out through the other door' },
  { id: 'drugged', arrival: 'escaped', note: 'out, and it was nothing' },
  { id: 'surfaced', arrival: 'carried', note: 'carried him out' },
  { id: 'contact-won', arrival: 'agreed', note: 'held the open channel' },
  { id: 'contact-lost', arrival: 'defeated', note: 'became the distant dot' },
  { id: 'tower-won', arrival: 'carried', note: 'dragged him through the west doors' },
  { id: 'tower-lost', arrival: 'defeated', note: 'the completed peal' },
];
const only = String(process.env.ONLY || '').trim();
const requested = only ? only.split(',').map((id) => id.trim()) : null;
if(requested?.some((id)=>!ALL_RUNS.some((run)=>run.id===id)))throw new Error(`Unknown ending requested by ONLY=${only}`);
const RUNS = process.env.LEGS_ONLY==='1'?[]:requested?ALL_RUNS.filter((run)=>requested.includes(run.id)):ALL_RUNS;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--use-angle=metal', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
try {
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = async (f, t = 240000) => {
  try{return await page.waitForFunction(f,{timeout:t});}
  catch(error){
    console.error('ending acceptance wait failed',await page.evaluate(()=>({
      scene:window.__scenes?.top?.()?.id,view:window.__scenes?.top?.()?.view?.(),
    })).catch(()=>null));
    await page.screenshot({path:path.join(output,'wait-failure.png')}).catch(()=>{});
    throw error;
  }
};

const baseURL=process.env.BASE_URL||'http://127.0.0.1:5199';
await page.goto(`${baseURL}/index.html?nodisplaynotice=1&nomic=1&sam=0&skiptut=1&nothink=0&diffusion=`
  + encodeURIComponent('ws://127.0.0.1:5198'), { waitUntil: 'domcontentloaded', timeout: 60000 });
await wait(() => !!window.__scenes?.top?.()?.id);
if (await page.evaluate(() => window.__scenes.top().id) === 'eula') {
  await page.keyboard.press('Enter');
  await wait(() => window.__scenes?.top?.()?.id !== 'eula', 30000);
}
await wait(() => window.__scenes?.top?.()?.id === 'opening-credits');
await page.evaluate(() => window.__scenes.top().update(30));
await wait(() => window.__scenes?.top?.()?.id === 'title', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'difficulty-select', 60000);
await page.keyboard.press('Enter');
await wait(() => window.__scenes?.top?.()?.id === 'warning', 60000);
await page.keyboard.press('Enter'); await page.keyboard.press('n');
await wait(() => window.__chunkParity?.().screen === 'game', 240000);
if (await page.evaluate(() => window.__scenes?.top?.()?.id === 'arrival')) {
  await wait(() => window.__scenes?.top?.()?.id !== 'arrival', 30000);
}

// A night worth reading back. Without this every ending is handed an empty
// dossier and every conditional limb reads as the "did nothing" branch.
await page.evaluate(() => window.__probe.setFlags([
  'confession.kind=name', 'confession.value=Sarah',
  'door.grey.searched=tried', 'dock.haunting.spent',
]));

const evidence = [];
for (const run of RUNS) {
  // reviewEnding changes only the starting camera/location. From this point on
  // it is playEnding(), the real conversations, clocks, actions and final hold.
  const started = await page.evaluate(([id, arrival]) => window.__probe.reviewEnding(id, arrival), [run.id, run.arrival]);
  await new Promise((r) => setTimeout(r, 900));
  const dossier = await page.evaluate(() => {
    const d = window.__probe.endingDossier();
    return d && { arrival: d.arrival, confession: d.confession, takes: d.takes.completed, coffee: d.coffee };
  });
  const stem = `${run.id}--${run.arrival}`;
  await page.screenshot({ path: path.join(output, `${stem}-01.png`) });

  // Page through authored prose, but do not fake the physical resolution. Time
  // beats run on their actual clock and held actions use their actual key.
  let frame = 1;
  let resolutionFrames = 0;
  for (let i = 0; i < 180; i += 1) {
    const top = await page.evaluate(() => window.__scenes?.top?.()?.id || null);
    if (!top || top === 'credits' || top === 'return-report') break;
    if (top.startsWith('ending-action:')) {
      const key = run.id === 'contact-won' ? 'r' : run.id === 'contact-lost' ? 'w' : 'e';
      await page.keyboard.down(key);
      await new Promise((r) => setTimeout(r, 1650));
      await page.screenshot({ path: path.join(output, `${stem}-action.png`) });
      await page.keyboard.up(key);
      await new Promise((r) => setTimeout(r, 180));
      continue;
    }
    if (top.startsWith('ending-resolution:')) {
      resolutionFrames += 1;
      await new Promise((r) => setTimeout(r, 720));
      if (resolutionFrames % 2 === 1) {
        frame += 1;
        await page.screenshot({ path: path.join(output, `${stem}-${String(frame).padStart(2, '0')}.png`) });
      }
      continue;
    }
    if (top.startsWith('ending-hold:')) {
      frame += 1;
      await page.screenshot({ path: path.join(output, `${stem}-final.png`) });
      // The native presentation leaves media on the desktop around the game.
      // Browser acceptance necessarily composes those panes into the canvas,
      // so take one additional plate of the authored world itself. This is not
      // a substitute render: it is the same live frame with only the Simulate
      // DOM layer hidden, and catches weak camera/body/prop staging that a busy
      // media score could otherwise disguise.
      await page.evaluate(() => {
        const sim = document.querySelector('.window-choreography-sim');
        if (sim) sim.dataset.acceptanceHidden = 'true';
      });
      await new Promise((r) => setTimeout(r, 140));
      await page.screenshot({ path: path.join(output, `${stem}-world.png`) });
      await page.evaluate(() => document.querySelector('.window-choreography-sim')?.removeAttribute('data-acceptance-hidden'));
      break;
    }
    if (run.id === 'drugged' && top === 'finale') {
      const options = await page.evaluate(() => window.__scenes?.top?.()?.view?.()?.pending?.options?.length || 0);
      if (options) {
        // The evidence tape is deliberately a hub. For this all-endings pass,
        // select its authored exit instead of repeatedly replaying option one.
        for (let option = 1; option < options; option += 1) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
    }
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 150));
    if (i % 8 === 7) {
      frame += 1;
      await page.screenshot({ path: path.join(output, `${stem}-${String(frame).padStart(2, '0')}.png`) });
    }
  }
  const physical = await page.evaluate(() => window.__probe?.endingCutscene?.() || null);
  evidence.push({run,dossier,started,physical});
  if (!physical?.embodiment?.finalHold || !physical?.embodiment?.finalActionId)
    errors.push(`${run.id}: did not reach its physical final action and held image`);
  console.log(stem.padEnd(28), run.note.padEnd(34), JSON.stringify(dossier),
    'beat', physical?.state?.cursor, 'stage', JSON.stringify(physical?.embodiment), 'frames', frame);
  // Back to a clean world for the next one.
  while (await page.evaluate(() => !!window.__scenes?.top?.())) {
    await page.evaluate(() => window.__scenes.pop());
  }
  await new Promise((r) => setTimeout(r, 400));
}
fs.writeFileSync(path.join(output, 'ending-evidence.json'), JSON.stringify(evidence, null, 2));

// ── the playable legs ───────────────────────────────────────────────────────
// The three objectives are the part of an ending the player is IN, and until now
// nothing looked at them: the carry went at walking pace and the building did not
// close behind anybody. Set each one up and let its clock run.
for (const leg of process.env.SKIP_LEGS==='1'?[]:[
  { id: 'sacrifice', set: () => window.__probe.endObjective('stay'), note: 'the walk back to the screen' },
  { id: 'surfaced', set: () => window.__probe.endObjective('surfaced'), note: 'the carry' },
  { id: 'inversion', set: () => window.__probe.endObjective('inversion'), note: 'the collapse under the run' },
]) {
  const state = await page.evaluate(leg.set);
  const paceBefore = await page.evaluate(() => window.__probe.moveInterval());
  await new Promise((r) => setTimeout(r, 6000));
  await page.screenshot({ path: path.join(output, `leg-${leg.id}.png`) });
  console.log(`leg ${leg.id}`.padEnd(20), leg.note.padEnd(30), JSON.stringify(state), 'moveMs', paceBefore);
  await page.evaluate(() => window.__probe.endObjective(null));
}

console.log(errors.length ? `page errors: ${errors.slice(0, 4).join(' | ')}` : 'no page errors');
if(errors.length)process.exitCode=1;
} finally {
  await browser.close();
}
