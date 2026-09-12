// Production item-renderer proofs for independently loaded GLBs. Three views
// per asset exercise surfaces that a front-only illustration cannot provide.
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {VAN_KIT_MODELS} from '../../src/data/van-kit-models.js';
const base=process.env.GAME_URL||'http://127.0.0.1:5297',output='artifacts/van-kit-models';
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage(),errors=[],reports=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewport({width:800,height:660,deviceScaleFactor:1});
 await page.goto(`${base}/src/data/van-kit-models.js`);
 await page.setContent('<base href="/"><style>html,body{margin:0;background:#141b17}canvas{display:block;width:800px;height:600px}h2{font:16px Arial;color:#c7cbb4;margin:14px 24px}</style><h2 id="name"></h2><canvas id="model"></canvas>');
 await page.evaluate(async()=>{
  const {createAsciiObject}=await import('/src/render/vendor/ascii-object/renderer.js');
  const {ITEM_ASCII_OPTIONS}=await import('/src/data/item-portraits.js');
  window.__modelProof=createAsciiObject({canvas:document.querySelector('canvas')},{...ITEM_ASCII_OPTIONS,ascii:false,background:'#141b17'});
 });
 for(const item of Object.values(VAN_KIT_MODELS)){
  await page.evaluate(async item=>{
   document.querySelector('#name').textContent=item.name;
   await new Promise((resolve,reject)=>window.__modelProof.setOptions({...item.lighting,src:`/${item.model}`,scale:item.scale,onLoad:resolve,onError:reject}));
  },item);
  for(const[pose,yaw,pitch]of[['front',0,-.12],['back',Math.PI,-.18],['edge',Math.PI*.54,-.22]]){
   await page.evaluate(({yaw,pitch})=>{window.__modelProof.resetView();window.__modelProof.orbitBy(yaw,pitch);window.__modelProof.renderFrame();},{yaw,pitch});
   await page.screenshot({path:`${output}/${item.id}-${pose}.png`});
  }
  const inspection=await page.evaluate(async id=>{
   const {createItemInspection,itemInspectionStats}=await import('/src/game/item-inspection.js');
   const item=createItemInspection(id);if(!item)throw new Error(`No registry entry: ${id}`);await item.ready;
   for(let i=0;i<400&&!item.view().ready&&!item.view().failed;i++)await new Promise(resolve=>setTimeout(resolve,20));
   const loaded=item.view();item.key({key:'ArrowRight'});const rotated=item.view();item.reset();item.dispose();
   return{loaded,rotated,after:itemInspectionStats()};
  },item.id);
  if(!inspection.loaded.ready||inspection.rotated.yaw===inspection.loaded.yaw||inspection.after.active)throw new Error(`Inspection failed: ${item.id}`);
  reports.push({id:item.id,inspection});console.log(`Rendered and rotated ${item.id}`);
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${output}/report.json`,JSON.stringify({source:base,errors,items:reports},null,2));
}finally{await browser.close();}
