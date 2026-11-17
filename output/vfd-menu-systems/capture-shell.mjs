// Review assets only. No production imports this directory.
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=`${root}/output/vfd-menu-systems`;
const server=await createServer({root,server:{host:'127.0.0.1',port:5494,hmr:false,watch:null},logLevel:'error',plugins:[{
 name:'vfd-shell-only',configureServer(v){v.middlewares.use('/__vfd-shell',(_,res)=>{
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:transparent}#map{position:relative;width:1280px;height:760px}</style><div id="map"></div>');});}
}]});
await server.listen();
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:760,deviceScaleFactor:1});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__vfd-shell`);
 const result=await page.evaluate(async()=>{
  const UI=await import('/src/render/ui.js'),P=await import('/src/render/presentation.js'),M=await import('/src/render/instrument-material.js'),F=await import('/src/render/vfd-font.js');
  UI.uiInit(document.getElementById('map'));await document.fonts.ready;
  Object.defineProperty(performance,'now',{value:()=>12000});
  const frame={x:36,y:5,w:78,h:28},aperture=P.machinePanelAperture(36,5,78,28);
  const program={active:true,rms:.0014049424671828262,peak:.004882956854999065,clipped:false};
  const MON=await import('/src/audio/monitor.js');
  UI.uiClear();P.withMachinePanel(36,5,78,28,{label:'CASE SELECT',source:'4417-C',glass:false,meter:true,meterSnapshot:{...MON.monitorSnapshotForRms(program.rms,{peak:program.peak}),sourceId:'title-program'},footerParts:[{action:'select',label:'SELECT'},{action:'confirm',label:'CONFIRM'}]},()=>{});
  const canvas=[...document.querySelectorAll('#map>canvas')].find(c=>c.style.zIndex==='8');
  const glass=document.createElement('canvas');glass.width=1280;glass.height=760;
  M.drawInstrumentGlass(glass.getContext('2d'),{x:aperture.x*8.45,y:aperture.y*20,w:aperture.w*8.45,h:aperture.h*20,dpr:1,grid:false,reducedMotion:false});
  const font=Object.fromEntries([...new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!?/+-_()[]<>%&=')].map(c=>[c,F.vfdGlyph(c)]));
  return {plate:canvas.toDataURL(),glass:glass.toDataURL(),font,frame,aperture,metrics:{cellW:8.45,cellH:20},program};
 });
 const crop={left:294,top:94,width:680,height:572},assets={};
 for(const key of ['plate','glass']){
  const png=Buffer.from(result[key].split(',')[1],'base64');
  await sharp(png).extract(crop).png().toFile(`${out}/${key}.png`);
  assets[key]='data:image/webp;base64,'+(await sharp(png).extract(crop).webp({lossless:true}).toBuffer()).toString('base64');
 }
 // Existing recorded world/feedback composite. Its original case is fully
 // occluded by the identically placed review case. Never treated as live output.
 const bg=await sharp(`${root}/artifacts/menu-feedback-live/2026-11-16/feedback-offscreen.png`).webp({quality:78}).toBuffer();
 assets.background='data:image/webp;base64,'+bg.toString('base64');
 assets.font=result.font;
 await writeFile(`${out}/assets.json`,JSON.stringify(assets));
 const sourceHashes={};for(const path of ['src/game/title.js','src/game/title-menu.js','src/render/instrument-material.js','src/render/presentation.js','src/game/save.js'])sourceHashes[path]=createHash('sha256').update(await readFile(`${root}/${path}`)).digest('hex');
 await writeFile(`${out}/shell-receipt.json`,JSON.stringify({kind:'production shell and cover-glass passes; review-only content composited between them',frame:result.frame,aperture:result.aperture,metrics:result.metrics,crop,program:result.program,background:'Existing feedback-offscreen.png; recorded world, frozen optical sample; not a live game capture',sourceHashes},null,2)+'\n');
 console.log(JSON.stringify({assetBytes:Buffer.byteLength(JSON.stringify(assets)),crop,aperture:result.aperture}));
}finally{await browser.close();await server.close();}
