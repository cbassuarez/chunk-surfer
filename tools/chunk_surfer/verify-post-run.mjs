// THE POST-RUN CHAIN, WHICH NOTHING HAS EVER PHOTOGRAPHED.
//
// ending-shots.mjs deliberately BREAKS at `credits`/`return-report`
// (its loop: `if (!top || top === 'credits' || top === 'return-report') break;`)
// and feature-regression-smoke.mjs takes a single frame of the report. So the
// filing docket, the return sheet and the disposition block — the screens the
// player actually reads at the end of a night — had no coverage at all, which
// is how they stayed plain for as long as they did.
//
// Two things this has to do that are not obvious:
//   · commitReturn REFUSES without an active run, so testRun() comes first.
//   · the filing stage holds until the causal tape resolves. Injuring past the
//     causal ceiling refuses the tape and releases it; set SHOW_FILING=1 to sit
//     on that screen instead.
//
//   MOCK_LENS_PORT=5198 node tools/chunk_surfer/tests/mock-lens-service.mjs &
//   npx vite --port 5199 --host 127.0.0.1 &
//   node tools/chunk_surfer/verify-post-run.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const OUT='artifacts/post-run'; fs.mkdirSync(OUT,{recursive:true});
const browser = await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new', protocolTimeout:600000,
  args:['--use-angle=metal','--no-sandbox','--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({width:1280,height:760});
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});
  window.__diffusion={ready:Promise.resolve(),stats:{criticalBank:'calm'},activateBank:async()=>true,retry:async()=>true};
});
const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push('CONSOLE: '+m.text().slice(0,160));});
await page.goto('http://127.0.0.1:5199/index.html?nomic=1&sam=0&diffusion=ws%3A%2F%2F127.0.0.1%3A5198',{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForFunction(()=>!!window.__probe,{timeout:180000});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const top=()=>page.evaluate(()=>window.__scenes?.top?.()?.id||null);

// A real run first — commitReturn refuses without one, which is why the
// report has never been photographed with genuine numbers.
if (await top()==='eula'){ await page.keyboard.press('Enter'); await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='eula',{timeout:60000}); }
await wait(1500);
console.log('after eula:', await top());
console.log('testRun ->', await page.evaluate(()=>!!window.__probe.testRun()));
// Past the causal ceiling so the tape is refused rather than sealing — the
// filing stage otherwise holds forever waiting on it, which is why nothing has
// ever photographed what comes after.
if(!process.env.SHOW_FILING) await page.evaluate(()=>{for(let i=0;i<4;i++)window.__probe.injure?.();});
await wait(3000);
const ok = await page.evaluate(()=>{ try{ return window.__probe.endingCredits?.('sacrifice') ?? null; }catch(e){ return 'ERR '+e.message; } });
console.log('endingCredits ->', JSON.stringify(ok)?.slice(0,80));
// Push through the credits roll to the report.
for(let i=0;i<80 && (await top())!=='return-report';i++){
  await page.evaluate(()=>{const t=window.__scenes?.top?.();t?.update?.(30);});
  await page.keyboard.press('Enter');
  await wait(160);
}
await wait(1200);
console.log('scene:', await top());
await page.screenshot({path:`${OUT}/01-report.png`});

// Advance through the stages to the disposition block.
for (let i=0;i<6;i++){
  await page.keyboard.press('Enter'); await wait(700);
  const id = await top();
  await page.screenshot({path:`${OUT}/0${i+2}-stage.png`});
  if (id!=='return-report') break;
}
console.log('errors:', errs.length?errs.slice(0,4).join('\n  '):'none');
await browser.close();
