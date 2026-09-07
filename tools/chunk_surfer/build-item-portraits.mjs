import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.GAME_URL||'http://127.0.0.1:5203';
await mkdir('artifacts/item-portraits',{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--use-angle=metal']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
 await page.goto(`${base}/item-portraits-lab.html`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__portraits);
 const items=await page.evaluate(()=>window.__portraits.items);
 for(const item of items){for(const size of[512,192]){const data=await page.evaluate(({id,size})=>window.__portraits.bake(id,size),{id:item.id,size});await writeFile(`public/assets/items/${item.id}-${size}.webp`,Buffer.from(data.split(',')[1],'base64'));}console.log('Baked',item.id);}
 await page.reload({waitUntil:'networkidle0'});await page.screenshot({path:'artifacts/item-portraits/contact-sheet.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));console.log('Portraits baked with the live ASCII renderer.');
}finally{await browser.close();}
