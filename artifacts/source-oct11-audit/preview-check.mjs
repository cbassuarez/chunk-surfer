import puppeteer from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';

const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  for (const width of [768,352]) {
    await page.setViewport({width,height:960,deviceScaleFactor:1});
    await page.goto('file:///tmp/source-breakdown-preview.html');
    await page.waitForSelector('iframe');
    const frame=page.frames().find(f=>f.parentFrame());
    await frame.waitForSelector('#source-breakdown-study canvas');
    await new Promise(r=>setTimeout(r,300));
    for (let i=0;i<3;i++) {
      if(i)await frame.click('.viz-carousel-next');
      await new Promise(r=>setTimeout(r,120));
      const stats=await frame.evaluate(i=>{
        const root=document.getElementById('source-breakdown-study');
        const selected=root.querySelector(':scope > section:not([hidden])').dataset.variant;
        const target=root.querySelector(`[data-concept="${i}"]`);
        target.querySelector('[data-moment="2"]').click();
        const canvas=target.querySelector('canvas');
        const ctx=canvas.getContext('2d');
        const first=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let before=0;for(let j=0;j<first.length;j+=100)before+=first[j];
        target.querySelector('[data-moment="1"]').click();
        const next=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let after=0;for(let j=0;j<next.length;j+=100)after+=next[j];
        return {variant:i,selected,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
          canvas:{width:canvas.width,height:canvas.height},before,after,
          overflow:[...target.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1&&e.clientWidth>0).map(e=>e.className)};
      },i);
      await new Promise(r=>setTimeout(r,120));
      await page.screenshot({path:`artifacts/source-oct11-audit/study-${width}-${i}.png`,fullPage:true});
      checks.push({width,...stats});
      if(stats.scrollWidth>stats.clientWidth||stats.overflow.length||stats.before===stats.after||stats.selected!==['Continuous unravelling','Spatial fold','Failed playback'][i])throw new Error(JSON.stringify(stats));
    }
  }
} finally {
  await writeFile('artifacts/source-oct11-audit/preview-report.json',JSON.stringify({checks,errors},null,2));
  await browser.close();
}
if(errors.length)throw new Error(errors.join('\n'));
console.log('PASS',checks.length,'scene, interaction and responsive checks');
