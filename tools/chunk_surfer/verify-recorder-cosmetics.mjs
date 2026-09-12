// Production painter proof: no game save, input handler, or fake live meter.
// The listed dB readings are explicit fixtures for comparing pigment only.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base=process.env.GAME_URL||'http://127.0.0.1:5297';
const output='artifacts/recorder-cosmetics';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,args:['--use-angle=metal'],
});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.stack||String(error)));
try{
  await page.setViewport({width:784,height:1390,deviceScaleFactor:1});
  await page.goto(`${base}/src/render/recorder-instrument.js`);
  await page.setContent('<base href="/"><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#090e0b}#proof{position:relative;width:100vw;height:100vh}</style><div id="proof"></div>');
  await page.evaluate(async()=>{
    const ui=await import('/src/render/ui.js');ui.uiInit(document.getElementById('proof'));ui.uiSetScale(1);
    await document.fonts.ready;
  });
  const reports=[];
  for(const mode of ['monitor','check']){
    reports.push(await page.evaluate(async mode=>{
      const ui=await import('/src/render/ui.js'),renderer=await import('/src/render/recorder-view.js');
      const instrument=await import('/src/render/recorder-instrument.js');
      const {cellW,cellH}=ui.uiCellMetrics();ui.uiClear();
      const combinations=[
        {finish:'aluminum',buttonSet:'classic',phosphor:'faithful'},
        {finish:'black',buttonSet:'signal',phosphor:'amber'},
        {finish:'olive',buttonSet:'sea-glass',phosphor:'ice'},
      ];
      return combinations.map((cosmetics,index)=>{
        const py=index*454+35;
        ui.uiDraw(({ctx,dpr})=>{ctx.save();ctx.font=`12px Arial`;ctx.fillStyle='#afb7a8';ctx.fillText(`${cosmetics.finish.toUpperCase()}  /  ${cosmetics.buttonSet.toUpperCase()}  /  ${cosmetics.phosphor.toUpperCase()}`,36*dpr,(py-10)*dpr);ctx.restore();});
        const rect={x:24/cellW,y:py/cellH,w:736/cellW,h:405/cellH};
        renderer.drawRecorderFace({rect,mode,...cosmetics,counter:'02:18',progress:.4,
          meter:{db:-24,peakDb:-12},roomMeter:{db:-24,peakDb:-12},note:'MATERIAL COMPARISON · FIXTURE −24 dB',
          check:{heard:true,line:'The room mic is working. This is not a take.'},
          buttons:{keys:[{id:'rec',label:'REC'},{id:'stop',label:'STOP'},{id:'takes',label:'TAKES'}]},
        });
        return{mode,...cosmetics,palette:instrument.recorderDisplayPalette(cosmetics),rect};
      });
    },mode));
    await page.screenshot({path:`${output}/${mode}.png`});
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert.equal(new Set(reports[0].map(report=>report.palette.counter)).size,3);
  await writeFile(`${output}/report.json`,JSON.stringify({source:base,errors,fixtures:reports},null,2));
  console.log(JSON.stringify({output,errors,fixtures:reports.length*3}));
}finally{await browser.close();}
