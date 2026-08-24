// Visual acceptance for mandatory guidance and the lodge window diorama.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-story-wayfinding.mjs
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { STORY_WAYFINDING_CAPTURE_PRESETS } from '../../src/data/story-wayfinding-captures.js';

const output=path.resolve(process.env.OUT||'artifacts/story-wayfinding');
fs.mkdirSync(output,{recursive:true});
const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:300000,
  args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling'],
});
const page=await browser.newPage();await page.setViewport({width:1280,height:760});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
const errors=[];page.on('pageerror',(error)=>errors.push(error.message));
const wait=(fn,timeout=240000)=>page.waitForFunction(fn,{timeout});
await page.goto('http://127.0.0.1:5199/index.html?skiptut=1&nomic=1&sam=0&diffusion='+encodeURIComponent('ws://127.0.0.1:5198'),{waitUntil:'domcontentloaded',timeout:60000});
await wait(()=>!!window.__scenes?.top?.()?.id);
if(await page.evaluate(()=>window.__scenes.top().id)==='eula'){await page.keyboard.press('Enter');await wait(()=>window.__scenes?.top?.()?.id!=='eula',30000);}
await wait(()=>window.__scenes?.top?.()?.id==='opening-credits');await page.evaluate(()=>window.__scenes.top().update(30));
await wait(()=>window.__scenes?.top?.()?.id==='title',60000);await page.keyboard.press('Enter');await page.keyboard.press('Enter');
await wait(()=>window.__scenes?.top?.()?.id==='difficulty-select',60000);await page.keyboard.press('Enter');
await wait(()=>window.__scenes?.top?.()?.id==='warning',60000);await page.keyboard.press('Enter');await page.keyboard.press('n');
await wait(()=>window.__chunkParity?.().screen==='game');
await page.evaluate(()=>{window.__probe.setTorchBattery(1);window.__probe.setTorch(true);window.__probe.nightSeed(.37);});

for(const preset of STORY_WAYFINDING_CAPTURE_PRESETS){
  const result=await page.evaluate((id)=>window.__probe.storyCapturePreset(id),preset.id);
  if(!result?.target?.id)throw new Error(`${preset.id}: no derived target`);
  await new Promise((resolve)=>setTimeout(resolve,preset.stallMs||1100));
  const state=await page.evaluate(()=>({guidance:window.__probe.storyGuidance(),props:window.__probe.props(),scene:window.__probe.scene()}));
  const propId=state.guidance.target?.propId;
  const doorId=state.guidance.target?.doorId;
  const targetRendered=propId
    ? state.props.renderedIds.includes(propId)
    : doorId
      ? state.props.renderedIds.some((id)=>id===doorId||id.includes(`:${doorId}:`)||id.endsWith(`:${doorId}`))
      : true;
  const highlighted=!!state.guidance.highlight?.visible;
  const highlightMatches=!highlighted
    || (!!propId&&state.guidance.highlight.propId===propId)
    || (!!doorId&&state.guidance.highlight.doorId===doorId);
  if(preset.hintMode==='off'&&highlighted)throw new Error(`${preset.id}: target illuminated in OFF mode`);
  if((preset.hintMode==='full'||preset.hintMode==='reduced')&&state.guidance.sameRenderedSpace&&(!highlighted||!highlightMatches||!targetRendered))throw new Error(`${preset.id}: expected illuminated target object`);
  await page.screenshot({path:path.join(output,preset.file)});
  console.log(preset.id.padEnd(30),result.target.id,state.scene||'world',highlighted?'object-lit':'bearing-only');
}

await browser.close();
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`wrote ${STORY_WAYFINDING_CAPTURE_PRESETS.length} story-wayfinding captures to ${output}`);
