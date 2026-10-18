// Persistent owned Chrome session. One JSON object per stdin line; one response
// per line. No automatic route progress, server, profile reuse or teleport.
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';

const out = resolve(process.env.SOURCE_STUDY_OUT || 'artifacts/source-experience-study/live');
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'chunk-source-study-'));
const errors = [], commands = [];
const browser = await puppeteer.launch({ executablePath: process.env.SOURCE_STUDY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: process.env.SOURCE_STUDY_HEADFUL !== '1', userDataDir: profile, protocolTimeout: 120000,
  args: ['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=8388608','--media-cache-size=8388608'] });
const page = await browser.newPage(); await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
let chunkPath = null;
await page.exposeFunction('__sourceExperienceWriteChunk', async base64 => {
  if (!chunkPath) throw new Error('No owned movie sink is active');
  await appendFile(chunkPath, Buffer.from(base64, 'base64'));
});
await page.evaluateOnNewDocument(() => {
  const NativeSocket = window.WebSocket;
  class QuietHmrSocket extends EventTarget {
    static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
    constructor(url) { super(); this.url=String(url); this.readyState=1; this.bufferedAmount=0; queueMicrotask(()=>this.dispatchEvent(new Event('open'))); }
    send() {} close() { this.readyState=3; }
  }
  window.WebSocket = class extends NativeSocket { constructor(url, protocols) { if(protocols==='vite-hmr') return new QuietHmrSocket(url); super(url, protocols); } };
});
page.on('pageerror', error => errors.push({ type:'pageerror', text:String(error), at:Date.now() }));
page.on('console', message => { if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|context.*lost/i.test(message.text())) errors.push({type:'console',text:message.text(),at:Date.now()}); });
const url = new URL(process.env.SOURCE_STUDY_URL || 'http://127.0.0.1:5334/');
for (const [key,value] of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1'})) url.searchParams.set(key,value);
await page.goto(url.href, { waitUntil:'domcontentloaded', timeout:60000 });
await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:120000});
const write = value => process.stdout.write(`${JSON.stringify(value)}\n`);
write({ready:true,url:url.href,out,scene:await page.evaluate(()=>window.__scenes.top()?.id),profile});
const wait = ms => new Promise(done=>setTimeout(done,ms));
const safeName = value => String(value || 'witness').replace(/[^a-zA-Z0-9_.-]/g,'-');
let recordingName = 'continuous';
async function command(entry) {
  commands.push({at:Date.now(),...entry});
  switch(entry.op) {
    case 'eval': return page.evaluate(source => (0,eval)(source), entry.code);
    case 'query': return page.evaluate(()=>({scene:window.__scenes?.top?.()?.id||null,view:window.__scenes?.top?.()?.view?.()||null,
      source:window.__probe.chunkSurf?.(),position:window.__probe.pos?.(),look:window.__probe.lookAngles?.(),why:window.__probe.why?.(),audio:window.__probe.audio?.(),
      capture:window.__sourceExperienceCapture?.status?.(),pixelMesh:window.__chunkSurferPixelMesh?.status?.()}));
    case 'down': await page.keyboard.down(entry.key); return true;
    case 'up': await page.keyboard.up(entry.key); return true;
    case 'press': await page.keyboard.press(entry.key,entry.options||{}); return true;
    case 'hold': await page.keyboard.down(entry.key); try { await wait(Math.min(30000,entry.ms||100)); } finally { await page.keyboard.up(entry.key); } return true;
    case 'mouse': await page.mouse.move(entry.x,entry.y,entry.options||{}); return true;
    case 'click': await page.mouse.click(entry.x,entry.y,entry.options||{}); return true;
    case 'wheel': await page.mouse.wheel({deltaX:entry.deltaX||0,deltaY:entry.deltaY||0}); return true;
    case 'wait': await wait(Math.min(30000,entry.ms||100)); return true;
    case 'shot': { const path=join(out,`${safeName(entry.name)}.png`);await page.screenshot({path});return {path}; }
    case 'witness': { const data=await page.evaluate(()=>window.__sourceExperienceCapture.witness());const path=join(out,`${safeName(entry.name)}-canvas.png`);await writeFile(path,Buffer.from(data.split(',')[1],'base64'));return {path}; }
    case 'record': {
      recordingName=safeName(entry.name||'continuous');
      if(await page.evaluate(()=>!!window.__sourceExperienceCapture?.active))throw new Error('Capture is already active');
      chunkPath=join(out,`${recordingName}.webm`); await writeFile(chunkPath,Buffer.alloc(0));
      return page.evaluate(async options=>{const {installSourceExperienceCapture}=await import('/tools/chunk_surfer/source-experience-study/capture-installer.js');await document.fonts.ready;return installSourceExperienceCapture(options);},entry.options||{});
    }
    case 'mark': return page.evaluate(label=>window.__sourceExperienceCapture?.mark(label),entry.label);
    case 'stop': {
      const result=await page.evaluate(()=>window.__sourceExperienceCapture?.stop());
      if(!result)return null;
      const video=join(out,`${recordingName}.webm`),report=join(out,`${recordingName}.json`);
      if(result.videoBase64)await writeFile(video,Buffer.from(result.videoBase64,'base64'));
      await writeFile(report,JSON.stringify({...result.report,browserErrors:errors,commandLog:commands},null,2));chunkPath=null;
      return {video,report,bytes:result.report.bytes,continuous:result.report.continuousAfterInitialFixture,chunkError:result.report.chunkError,errors};
    }
    case 'close': return {closed:true};
    default: throw new Error(`Unknown op ${entry.op}`);
  }
}
try {
  for await (const line of createInterface({input:process.stdin,terminal:false})) {
    if(!line.trim())continue;let entry;
    try { entry=JSON.parse(line); const result=await command(entry);write({id:entry.id||null,ok:true,result});if(entry.op==='close')break; }
    catch(error) {write({id:entry?.id||null,ok:false,error:String(error?.stack||error)});}
  }
} finally {
  if(await page.evaluate(()=>!!window.__sourceExperienceCapture?.active).catch(()=>false)) await command({op:'stop'}).catch(error=>write({closingCaptureError:String(error)}));
  await writeFile(join(out,'session.json'),JSON.stringify({url:url.href,commands,errors,closedAt:Date.now()},null,2));
  await browser.close();await rm(profile,{recursive:true,force:true});
}
