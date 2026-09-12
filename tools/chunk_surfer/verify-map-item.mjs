// Local render proof for the original Survey Indicator, without modifying any
// existing item's model, portrait, or review images.
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5199';
const out='artifacts/item-portraits';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.setViewport({width:1000,height:760,deviceScaleFactor:1});
 await page.goto(`${base}/item-portraits-lab.html`,{waitUntil:'networkidle0'});
 await page.evaluate(async()=>{
  const {createAsciiObject}=await import('/src/render/vendor/ascii-object/renderer.js');
  const {ITEM_PORTRAITS,ITEM_ASCII_OPTIONS}=await import('/src/data/item-portraits.js');
  const canvas=document.createElement('canvas');
  canvas.style.cssText='width:960px;height:720px';document.body.replaceChildren(canvas);
  const item=ITEM_PORTRAITS.map;
  await new Promise((resolve,reject)=>{
   const engine=createAsciiObject({canvas},{...ITEM_ASCII_OPTIONS,...item.lighting,ascii:false,background:'#151a15',src:`/${item.model}`,scale:item.scale,onLoad:resolve,onError:reject});
   window.__mapProof={engine,canvas};
  });
 });
 for(const[pose,yaw,pitch]of[['front',0,0],['back',Math.PI,.12],['edge',Math.PI*.56,-.13]]){
  const data=await page.evaluate(({yaw,pitch})=>{
   const {engine,canvas}=window.__mapProof;engine.resetView();engine.orbitBy(yaw,pitch);engine.renderFrame();return canvas.toDataURL('image/png');
  },{yaw,pitch});
  await writeFile(`${out}/map-${pose}.png`,Buffer.from(data.split(',')[1],'base64'));
 }
 // Exercise the actual production inspection owner, not only the standalone
 // model viewer: load once, rotate by input, restore, then release the owner.
 const inspection=await page.evaluate(async()=>{
  const {createItemInspection,itemInspectionStats}=await import('/src/game/item-inspection.js');
  const item=createItemInspection('map');await item.ready;
  for(let i=0;i<400&&!item.view().ready&&!item.view().failed;i++)await new Promise(resolve=>setTimeout(resolve,20));
  const loaded=item.view();item.key({key:'ArrowRight'});const rotated=item.view();item.reset();const reset=item.view();item.dispose();
  return{loaded,rotated,reset,after:itemInspectionStats()};
 });
 if(!inspection.loaded.ready||inspection.loaded.failed||inspection.rotated.yaw===inspection.loaded.yaw||inspection.reset.yaw!==0||inspection.after.active)
  throw new Error(`Inspection lifecycle failed: ${JSON.stringify(inspection)}`);
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(`${out}/map-report.json`,JSON.stringify({item:'map',views:['front','back','edge'],inspection,pageErrors:errors},null,2)+'\n');
 console.log('Survey Indicator front/back/edge render and production inspection lifecycle passed.');
}finally{await browser.close();}
