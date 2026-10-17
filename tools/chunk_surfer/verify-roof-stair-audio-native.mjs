// Samples the real game loop at the external escape's authored cells. The
// larger roof-walk harness proves continuous keyboard traversal separately.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ACADEMIC_ROOF } from '../../src/data/academic-roof.js';

const out=resolve(process.env.ROOF_STAIR_AUDIO_OUT||'artifacts/roof-floor-design/live-walk-native/stair-audio-matrix.json');
const url=process.env.ROOF_STAIR_AUDIO_URL||'http://127.0.0.1:5374/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
const server=process.env.ROOF_STAIR_AUDIO_URL?null:await createServer({configFile:'vite.config.js',
  server:{host:'127.0.0.1',port:5374,strictPort:true,hmr:false}});
if(server)await server.listen();
const profile=await mkdtemp(join(tmpdir(),'chunk-roof-stair-audio-'));
let browser;
const report={url,samples:[],checks:[],errors:[]};
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
try{
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:true,userDataDir:profile,protocolTimeout:90000,
    args:['--no-sandbox','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  page.on('pageerror',error=>report.errors.push(String(error)));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:60000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();});
  const places=[
    ['gallery',ACADEMIC_ROOF.gateInspect.x,ACADEMIC_ROOF.gateInspect.y],
    ['first exterior tread',ACADEMIC_ROOF.stairFoot.x,ACADEMIC_ROOF.stairFoot.y],
    ['lower windows',169,283],
    ['switchback turn',ACADEMIC_ROOF.stairTurn.x,ACADEMIC_ROOF.stairTurn.y],
    ['upper flight',184,281],
    ['roof bridge',ACADEMIC_ROOF.northBridge.x,ACADEMIC_ROOF.northBridge.y],
    ['roof',ACADEMIC_ROOF.entry.x,ACADEMIC_ROOF.entry.y],
    ['gallery return',ACADEMIC_ROOF.gateInspect.x,ACADEMIC_ROOF.gateInspect.y],
  ];
  for(const[name,x,y]of places){
    await page.evaluate(({x,y})=>window.__probe.warpCell(x,y),{x,y});
    await new Promise(r=>setTimeout(r,700));
    const sample=await page.evaluate(()=>({position:window.__probe.pos(),
      sound:window.__probe.roofStairAudio(),context:window.__probe.audio().actx}));
    report.samples.push({name,...sample});
    console.log('SAMPLE',name,JSON.stringify(sample));
  }
  const by=Object.fromEntries(report.samples.map(sample=>[sample.name,sample]));
  check('the game audio context is running',by['lower windows'].context==='running',by['lower windows'].context);
  check('gallery has no outside stair bed',!by.gallery.sound.frame&&!by.gallery.sound.sky&&
    by.gallery.sound.windPresence===0,by.gallery.sound);
  check('the first external tread receives outdoor weather',by['first exterior tread'].sound.sky&&
    by['first exterior tread'].sound.windPresence>=.7&&by['first exterior tread'].sound.windActive,
    by['first exterior tread'].sound);
  check('ordinary practice is scheduled once by the lower windows',
    by['lower windows'].sound.frame?.practicePresence>.22&&
    by['lower windows'].sound.practiceCue?.playedThisVisit,by['lower windows'].sound);
  for(const name of ['switchback turn','upper flight','roof bridge'])
    check(`${name} has wind and no classroom practice`,by[name].sound.sky&&
      by[name].sound.windPresence===1&&by[name].sound.frame?.practicePresence===0,
      by[name].sound);
  check('roof returns to its normal sky weather',by.roof.sound.sky&&!by.roof.sound.frame&&
    by.roof.sound.windPresence===1,by.roof.sound);
  check('descent back to gallery clears outdoor classification',
    !by['gallery return'].sound.sky&&!by['gallery return'].sound.frame&&
    by['gallery return'].sound.windPresence===0,by['gallery return'].sound);
  check('no page errors',report.errors.length===0,report.errors);
}catch(error){report.errors.push(String(error));throw error;}
finally{
  await mkdir(resolve(out,'..'),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2));
  await browser?.close();await server?.close();await rm(profile,{recursive:true,force:true});
}
if(report.checks.some(check=>!check.pass))process.exitCode=1;
process.exit(process.exitCode||0);
