// Production PBR renderer, real GLBs, three independently inspectable surfaces.
// The served HTML fixture avoids Chromium's raw-module source-view document.
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {BENCH_MODELS,vanKitModel} from '../../src/data/van-kit-models.js';
const base=process.env.GAME_URL||'http://127.0.0.1:5297',output='artifacts/bench-models';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage(),errors=[],reports=[],images=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewport({width:800,height:650,deviceScaleFactor:1});
 await page.setRequestInterception(true);
 page.on('request',req=>req.url()===`${base}/__bench_model_proof.html`?req.respond({status:200,contentType:'text/html',body:'<!doctype html><html><style>html,body{margin:0;background:#141b17}canvas{display:block;width:800px;height:600px}h2{font:16px Arial;color:#c7cbb4;margin:14px 24px}</style><h2 id="name"></h2><canvas id="model"></canvas></html>'}):req.continue());
 await page.goto(`${base}/__bench_model_proof.html`,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const {createAsciiObject}=await import('/src/render/vendor/ascii-object/renderer.js');
  const {ITEM_ASCII_OPTIONS}=await import('/src/data/item-portraits.js');
  window.__modelProof=createAsciiObject({canvas:document.querySelector('canvas')},{...ITEM_ASCII_OPTIONS,ascii:false,background:'#141b17'});
 });
 for(const item of[vanKitModel('field-case'),...Object.values(BENCH_MODELS)]){
  await page.evaluate(async item=>{
   document.querySelector('#name').textContent=item.name;
   await new Promise((resolve,reject)=>window.__modelProof.setOptions({...item.lighting,src:`/${item.model}`,scale:item.scale,onLoad:resolve,onError:reject}));
  },item);
  for(const[pose,yaw,pitch]of[['front',.28,-.20],['back',Math.PI,-.22],['edge',Math.PI*.44,-.40]]){
   await page.evaluate(({yaw,pitch})=>{window.__modelProof.resetView();window.__modelProof.orbitBy(yaw,pitch);window.__modelProof.renderFrame();},{yaw,pitch});
   const data=await page.screenshot({path:`${output}/${item.id}-${pose}.png`});
   if(pose==='front')images.push({id:item.id,data:`data:image/png;base64,${Buffer.from(data).toString('base64')}`});
  }
  reports.push({id:item.id,poses:['front','back','edge']});console.log(`Rendered ${item.id}`);
 }
 await page.setViewport({width:1600,height:1300,deviceScaleFactor:1});
 await page.evaluate(images=>{
  window.__modelProof.destroy();document.body.innerHTML='<main></main>';
  document.querySelector('main').style='display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px';
  for(const image of images){const el=document.createElement('img');el.src=image.data;el.style='width:100%';document.querySelector('main').append(el);}
 },images);
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.screenshot({path:`${output}/contact-sheet.png`,fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${output}/report.json`,JSON.stringify({source:base,errors,items:reports},null,2));
}finally{await browser.close();}
