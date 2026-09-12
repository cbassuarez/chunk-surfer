// Production Canvas WITNESS painter, explicit comparison fixtures only.
// Does not change a profile, unlock state, save, or gameplay meter.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base=process.env.GAME_URL||'http://127.0.0.1:5299';
const output='artifacts/witness-edition/canvas';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const errors=[],reports=[];
try{
  for(const fixture of [
    {id:'monitor',mode:'monitor',width:784,height:453,scale:1,dpr:1},
    {id:'rec-held',mode:'record',held:true,width:784,height:453,scale:1,dpr:1},
    {id:'takes',mode:'browse',width:784,height:453,scale:1,dpr:1},
    {id:'check-retina',mode:'check',width:1152,height:660,scale:1.5,dpr:2},
    {id:'compact',mode:'monitor',width:408,height:408,scale:1,dpr:2},
  ]){
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.stack||String(error)));
    await page.setViewport({width:fixture.width,height:fixture.height,deviceScaleFactor:fixture.dpr});
    await page.goto(`${base}/src/render/recorder-instrument.js`);
    await page.setContent('<base href="/"><style>html,body{margin:0;background:#090e0b}#proof{position:relative;width:100vw;height:100vh}</style><div id="proof"></div>');
    const report=await page.evaluate(async fixture=>{
      const ui=await import('/src/render/ui.js');
      const renderer=await import('/src/render/recorder-view.js');
      const mechanics=await import('/src/game/control-mechanics.js');
      const instrument=await import('/src/render/recorder-instrument.js');
      const material=await import('/src/render/witness-material.js');
      ui.uiInit(document.getElementById('proof'));ui.uiSetScale(fixture.scale);await document.fonts.ready;
      const {cellW,cellH}=ui.uiCellMetrics();
      const width=fixture.width-48,height=fixture.height-48;
      const rect={x:24/cellW,y:24/cellH,w:width/cellW,h:height/cellH};
      const view={rect,mode:fixture.mode,finish:'witness',buttonSet:'sea-glass',phosphor:'ice',witnessEndings:['sacrifice','helped'],
        counter:'02:18',progress:.4,meter:{db:-24,peakDb:-12},roomMeter:{db:-24,peakDb:-12},
        rows:[{ordinal:'01',roomId:'B3',label:'STUDIO B3',status:'SEALED'},{ordinal:'02',roomId:'B5',label:'PUMP ROOM',status:'SEALED'}],selected:0,
        check:{heard:true,line:'The room mic is working. This is not a take.'},
        buttons:{keys:[{id:'rec',label:'REC',lit:!!fixture.held,controlId:'witness-proof:rec'},{id:'stop',label:'STOP',controlId:'witness-proof:stop'},{id:'takes',label:'TAKES',controlId:'witness-proof:takes'}]},
      };
      if(fixture.held){mechanics.pressControl('witness-proof:rec',{held:true});await new Promise(resolve=>setTimeout(resolve,100));}
      const native=[];const original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){
        if(this.canvas.parentElement?.id==='proof'){
          const t=this.getTransform();native.push({text:String(text),x:t.a*x+t.c*y+t.e,y:t.b*x+t.d*y+t.f});
        }
        return original.call(this,text,x,y,...args);
      };
      const samples=[];
      try{
        // Both comparisons put an aggressively different opaque world below
        // the instrument. Matching core pixels proves its real internal tray.
        for(const background of ['#ec00ff','#00ff12']){
          ui.uiClear();ui.uiDraw(({ctx})=>{ctx.fillStyle=background;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);});
          renderer.drawRecorderFace(view);
          const layout=instrument.recorderFaceLayout(rect),canvas=document.querySelector('#proof canvas'),ctx=canvas.getContext('2d');
          samples.push([[40,40],[60,50],[180,52],[40,330],[52,346],[46,100],[80,150]].map(([x,y])=>Array.from(ctx.getImageData(Math.round((24+x*layout.unit)*fixture.dpr),Math.round((24+y*layout.unit)*fixture.dpr),1,1).data)));
        }
        ui.uiClear();renderer.drawRecorderFace(view);
      }finally{CanvasRenderingContext2D.prototype.fillText=original;}
      const layout=instrument.recorderFaceLayout(rect),glass=layout.displayRect;
      const box={x:glass.x*cellW*fixture.dpr,y:glass.y*cellH*fixture.dpr,w:glass.w*cellW*fixture.dpr,h:glass.h*cellH*fixture.dpr};
      const nativeInsideGlass=native.filter(p=>p.x>box.x&&p.x<box.x+box.w&&p.y>box.y&&p.y<box.y+box.h);
      return {fixture,layout,worldSamples:samples,opaqueTray:JSON.stringify(samples[0])===JSON.stringify(samples[1]),nativeInsideGlass,cache:material.witnessMaterialCacheStats()};
    },fixture);
    assert.equal(report.nativeInsideGlass.length,0,`${fixture.id}: no native display text`);
    assert.equal(report.opaqueTray,true,`${fixture.id}: circuitry/display cannot reveal the world`);
    assert.equal(report.layout.buttonSlots.length,3);
    await page.screenshot({path:`${output}/${fixture.id}.png`});reports.push(report);await page.close();
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  await writeFile(`${output}/report.json`,JSON.stringify({source:base,errors,reports},null,2));
  console.log(JSON.stringify({output,errors,fixtures:reports.length}));
}finally{await browser.close();}
