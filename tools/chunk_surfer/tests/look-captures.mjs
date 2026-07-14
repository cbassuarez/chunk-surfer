// Fixed-camera visual acceptance capture. Run with Vite and the local critical
// diffusion service already running; calibration is intentionally not bypassed.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const OUTPUT=path.join(ROOT,'artifacts','look-captures');
const BASE=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5173';
const CHROME=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILES=['calm','explore','booth','battle','hush','rupture'];
const COVERAGE_LIMIT={calm:.20,explore:.40,booth:.60,battle:.75,hush:.60,rupture:.75};
const CAMERAS=[
  {id:'corridor',cell:[15,12]},
  {id:'material-room',cell:[38,12]},
  {id:'dark-contrast',cell:[66,65]},
];

fs.mkdirSync(OUTPUT,{recursive:true});
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();
await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
await page.goto(`${BASE}/index.html?mode=story&renderer=3d&skiptut=1&nothink=1&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:60000});

// This waits through mandatory service validation, the startup material bank,
// and the complete opening credit clock before the fixed-camera run begins.
await page.waitForFunction(()=>{
  const status=window.__chunkSurferPixelMesh?.status?.();
  return status?.framesRendered>4 && !['lens-calibration','opening-credits'].includes(window.__scenes?.top?.()?.id);
},{timeout:20*60*1000,polling:500});

async function settle(profile,debugSource='final',accessibility={}){
  await page.evaluate(({profile,debugSource,accessibility})=>{
    window.__chunkSurferPixelMesh.setDebugSource(debugSource);
    window.__chunkSurferPixelMesh.setAccessibility(accessibility);
    window.__chunkSurferPixelMesh.setProfile(profile);
  },{profile,debugSource,accessibility});
  await page.waitForFunction((id)=>{
    const look=window.__chunkSurferPixelMesh.lookStatus();
    const bank=window.__chunkSurferPixelMesh.bankStatus();
    return look?.id===id && bank?.bank===id && !bank?.transitioning;
  },{timeout:15000,polling:100},profile);
  await new Promise((resolve)=>setTimeout(resolve,250));
}

async function capture(camera,name){
  await page.evaluate(([x,y])=>window.__probe.warpCell(x,y),camera.cell);
  await new Promise((resolve)=>setTimeout(resolve,300));
  await page.screenshot({path:path.join(OUTPUT,`${camera.id}--${name}.png`)});
}

async function captureMask(camera,profile){
  await page.evaluate(([x,y])=>window.__probe.warpCell(x,y),camera.cell);
  await new Promise((resolve)=>setTimeout(resolve,300));
  const canvas=await page.$('canvas.r3d');
  const buffer=await canvas.screenshot({path:path.join(OUTPUT,`${camera.id}--${profile}--mask.png`)});
  const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let active=0;
  for(let i=0;i<data.length;i+=3)if(Math.max(data[i],data[i+1],data[i+2])>=128)active++;
  return active/(info.width*info.height);
}

for(const profile of PROFILES){
  await settle(profile);
  for(const camera of CAMERAS)await capture(camera,profile);
  await settle(profile,'mask');
  for(const camera of CAMERAS){
    const coverage=await captureMask(camera,profile);
    if(coverage>COVERAGE_LIMIT[profile])throw new Error(`${profile}/${camera.id} excitation ${(coverage*100).toFixed(1)}% exceeds ${(COVERAGE_LIMIT[profile]*100).toFixed(0)}%`);
  }
}

for(const source of ['world','signal','memory','edge']){
  await settle('explore',source);
  for(const camera of CAMERAS)await capture(camera,`explore--ablation-${source}`);
}

for(const variant of [
  {id:'reduce-flash',reduceFlash:true},
  {id:'reduce-motion',reduceMotion:true},
  {id:'reduce-both',reduceFlash:true,reduceMotion:true},
]){
  await settle('battle','final',variant);
  for(const camera of CAMERAS)await capture(camera,`battle--${variant.id}`);
}

fs.writeFileSync(path.join(OUTPUT,'manifest.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),profiles:PROFILES,cameras:CAMERAS,
  ablations:['world','signal','memory','edge','mask'],coverageLimit:COVERAGE_LIMIT,
  accessibility:['reduce-flash','reduce-motion','reduce-both'],
},null,2));
await browser.close();
console.log(`wrote visual acceptance captures to ${OUTPUT}`);
