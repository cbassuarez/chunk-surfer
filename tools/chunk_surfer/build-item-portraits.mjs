import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5203';
const onlyArg=process.argv.find(arg=>arg.startsWith('--only='));
const only=onlyArg?onlyArg.slice(7).split(',').filter(Boolean):null;
if(only&&(!only.length||only.some(id=>!/^[-a-z0-9]+$/.test(id))))throw new Error('Use --only=item-id[,item-id]');
await mkdir('artifacts/item-portraits',{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
 await page.goto(`${base}/item-portraits-lab.html`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__portraits);
 const catalogue=await page.evaluate(()=>window.__portraits.items);
 if(only)for(const id of only)if(!catalogue.some(item=>item.id===id))throw new Error(`Unknown item ${id}`);
 const items=only?catalogue.filter(item=>only.includes(item.id)):catalogue;
 if(!process.argv.includes('--review-only'))for(const item of items){for(const size of[512,192]){const data=await page.evaluate(({id,size})=>window.__portraits.bake(id,size),{id:item.id,size});await writeFile(`public/assets/items/${item.id}-${size}.webp`,Buffer.from(data.split(',')[1],'base64'));}console.log('Baked',item.id);}
 await page.reload({waitUntil:'networkidle0'});
 if(only)await page.evaluate(ids=>{for(const el of document.querySelectorAll('.item'))if(!ids.includes(el.querySelector('h2').textContent))el.remove();},only);
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.screenshot({path:`artifacts/item-portraits/${only?only.join('-')+'-contact-sheet':'contact-sheet'}.png`,fullPage:true});
 if(!only){
  await page.evaluate(()=>{const ids=['recorder','radio','coffee','badge','keyring','chapel-key','plant-spanner'];for(const el of document.querySelectorAll('.item'))if(!ids.includes(el.querySelector('h2').textContent))el.remove();});
  await page.setViewport({width:1200,height:850,deviceScaleFactor:1});
  await page.screenshot({path:'artifacts/item-portraits/revised-items.png',fullPage:true});
 }
 if(errors.length)throw new Error(errors.join('\n'));console.log('Portraits baked with the live ASCII renderer.');
}finally{await browser.close();}
