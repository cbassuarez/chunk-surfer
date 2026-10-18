// Attach only to the existing root-owned browser; never launch one.
import { createInterface } from 'node:readline';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.connect({browserWSEndpoint:process.env.SOURCE_ATTACH_WS,protocolTimeout:120000,defaultViewport:null});
const pages=await browser.pages(),page=pages.find(page=>page.url().startsWith('http://127.0.0.1:5334/')&&!page.url().includes('artifacts/'));
if(!page)throw new Error('Original game page not found');
await page.setViewport({width:960,height:600,deviceScaleFactor:1});
const out=resolve(process.env.SOURCE_ATTACH_OUT||'artifacts/source-experience-study/live-baseline');await mkdir(out,{recursive:true});
const commands=[],write=value=>process.stdout.write(`${JSON.stringify(value)}\n`),sleep=ms=>new Promise(done=>setTimeout(done,ms));
const safe=value=>String(value||'witness').replace(/[^a-zA-Z0-9_.-]/g,'-');
write({ready:true,attached:true,url:page.url(),out});
try{
  for await(const line of createInterface({input:process.stdin,terminal:false})){
    if(!line.trim())continue;let entry;
    try{
      entry=JSON.parse(line);commands.push({at:Date.now(),...entry});let result;
      switch(entry.op){
        case'eval':result=await page.evaluate(code=>(0,eval)(code),entry.code);break;
        case'query':result=await page.evaluate(()=>({pos:__probe.pos(),look:__probe.lookAngles(),source:__probe.chunkSurf(),scene:window.__scenes?.top?.()?.id||null,view:window.__scenes?.top?.()?.view?.()||null,keys:__probe.keys(),capture:__sourceExperienceCapture.status()}));break;
        case'down':await page.keyboard.down(entry.key);result=true;break;
        case'up':await page.keyboard.up(entry.key);result=true;break;
        case'press':await page.keyboard.press(entry.key,entry.options||{});result=true;break;
        case'hold':await page.keyboard.down(entry.key);try{await sleep(Math.min(30000,entry.ms||100));}finally{await page.keyboard.up(entry.key);}result=true;break;
        case'mouse':await page.mouse.move(entry.x,entry.y,entry.options||{});result=true;break;
        case'click':await page.mouse.click(entry.x,entry.y,entry.options||{});result=true;break;
        case'wait':await sleep(Math.min(30000,entry.ms||100));result=true;break;
        case'mark':result=await page.evaluate(label=>__sourceExperienceCapture.mark(label),entry.label);break;
        case'shot':{const path=join(out,`${safe(entry.name)}.png`);await page.screenshot({path});result={path};break;}
        case'stop':{
          const value=await page.evaluate(()=>__sourceExperienceCapture.stop());
          const path=join(out,`${safe(entry.name||'source-default-continuous')}.json`);
          if(value?.report){await writeFile(path,JSON.stringify({...value.report,attachedControllerCommands:commands,scopeNotes:['One initial hall-entry/chapel-readiness fixture; this baseline did not carry kit setup flags, so no raised-recorder claim.','Developer-assisted route with recorded long observation pauses; not unbriefed play or physical OS-window proof.']},null,2));result={path,bytes:value.report.bytes,chunkError:value.report.chunkError,continuous:value.report.continuousAfterInitialFixture};}else result=value;break;
        }
        case'close':result={disconnected:true,browserClosed:false};break;
        default:throw new Error(`Unknown op ${entry.op}`);
      }
      write({id:entry.id||null,ok:true,result});if(entry.op==='close')break;
    }catch(error){write({id:entry?.id||null,ok:false,error:String(error?.stack||error)});}
  }
}finally{await writeFile(join(out,`attached-controller-${Date.now()}.json`),JSON.stringify({commands,disconnectedAt:Date.now()},null,2));await browser.disconnect();}
