// Deterministic renderer inspection. This does not test human comprehension.
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {titleMenuItems} from '../../src/game/title-menu.js';
const dir=new URL('.',import.meta.url).pathname;
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.setViewport({width:1024,height:1000,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5497/');await page.waitForFunction(()=>document.querySelector('iframe'));
 const frame=page.frames().find(f=>f.url()==='about:srcdoc');await frame.waitForFunction(()=>window.VFDStudy);await frame.evaluate(()=>VFDStudy.ready);
 const data=await frame.evaluate(async()=>{
  const V=VFDStudy,c=document.createElement('canvas'),result={menus:{},geometry:[],masks:[],frames:[],captures:{}};
  for(const name of Object.keys(V.profiles))result.menus[name]=V.menu(name);
  const encode=()=>c.toDataURL('image/png').split(',')[1];
  V.drawShell(c);result.shell=encode();
  for(let direction=0;direction<3;direction++){
   const first=V.art(direction,'new-run');
   result.geometry.push({direction,name:V.names[direction],anodes:first.length,minW:Math.min(...first.map(s=>s.w)),minH:Math.min(...first.map(s=>s.h)),maxX:Math.max(...first.map(s=>s.x+s.w)),maxY:Math.max(...first.map(s=>s.y+s.h)),boundsValid:V.ids.every(id=>V.art(direction,id).every(s=>s.x>=0&&s.y>=0&&s.x+s.w<=320&&s.y+s.h<=256))});
   for(const selected of V.ids){V.draw(c,{direction,selected,profile:'filed',mode:'mask'});result.masks.push({direction,selected,png:encode()});}
   for(const selected of ['new-run','continue','settings'])for(const time of [0,80,180,360,600,Infinity]){
    V.draw(c,{direction,selected,profile:'filed',mode:'final',time});result.frames.push({direction,selected,time,png:encode()});
   }
   for(const profile of ['first','filed']){V.draw(c,{direction,selected:profile==='first'?'new-run':'continue',profile,mode:'final'});result.captures[`${direction}-${profile}`]=encode();}
   const catalog=document.createElement('canvas');catalog.width=680;catalog.height=V.ids.length*308/2;const g=catalog.getContext('2d');
   V.ids.forEach((id,i)=>{const p=document.createElement('canvas');V.proof(p,direction,id);const col=i%2,row=Math.floor(i/2);g.drawImage(p,col*340,row*308);g.fillStyle='#e8f3e4';g.font='14px monospace';g.fillText(V.label(id),col*340+12,row*308+18);});result.captures[`${direction}-catalog`]=catalog.toDataURL().split(',')[1];
  }
  return result;
 });
 const meta={first:{},saved:{runs:1},filed:{runs:2,endingsSeen:['one'],knowledge:{documents:{one:true}}},completed:{runs:2,endingsSeen:['one'],knowledge:{documents:{one:true}}},documents:{knowledge:{documents:{one:true}}}};
 for(const name of Object.keys(meta))assert.deepEqual(data.menus[name],titleMenuItems(meta[name],{activeRun:['saved','filed'].includes(name),desktop:true}).map(x=>x.id));
 const hash=png=>createHash('sha256').update(Buffer.from(png,'base64')).digest('hex');
 const fixedMaskChecks=[];for(let d=0;d<3;d++){const entries=data.masks.filter(x=>x.direction===d),unique=new Set(entries.map(x=>hash(x.png)));assert.equal(unique.size,1,`Anode mask changes with selection in direction ${d}`);fixedMaskChecks.push({direction:d,actions:entries.length,uniqueMasks:unique.size,sha256:hash(entries[0].png)});}
 const frameChecks=[];for(let d=0;d<3;d++)for(const id of ['new-run','continue','settings']){const frames=data.frames.filter(f=>f.direction===d&&f.selected===id);assert.notEqual(hash(frames[0].png),hash(frames.at(-1).png));assert.equal(hash(frames.at(-2).png),hash(frames.at(-1).png));frameChecks.push({direction:d,id,uniqueFrames:new Set(frames.map(f=>hash(f.png))).size,restByMs:[480,600,420][d],frame600EqualsInfiniteRest:true});}
 data.geometry.forEach(x=>assert(x.boundsValid));assert.deepEqual(errors,[]);
 for(const [name,png]of Object.entries(data.captures))await writeFile(`${dir}/${name}.png`,Buffer.from(png,'base64'));
 const shell=await sharp(Buffer.from(data.shell,'base64')).raw().toBuffer({resolveWithObject:true});
 let shellDifference=0;
 for(let d=0;d<3;d++){
  const image=await sharp(`${dir}/${d}-filed.png`).raw().toBuffer();
  for(let y=0;y<572;y++)for(let x=0;x<680;x++)if(x<22||x>658||y<53||y>520){const at=(y*680+x)*4;for(let ch=0;ch<4;ch++)if(image[at+ch]!==shell.data[at+ch])shellDifference++;}
 }
 assert.equal(shellDifference,0,'Content escaped into the production shell');
 const tileW=340,tileH=286;
 for(let d=0;d<3;d++){
  const layers=[];
  for(let r=0;r<3;r++)for(let col=0;col<5;col++){
   const f=data.frames.find(x=>x.direction===d&&x.selected===['new-run','continue','settings'][r]&&x.time===[0,80,180,360,600][col]);
   layers.push({input:await sharp(Buffer.from(f.png,'base64')).resize(tileW,tileH).png().toBuffer(),left:col*tileW,top:r*tileH});
  }
  await sharp({create:{width:tileW*5,height:tileH*3,channels:4,background:'#0b160f'}}).composite(layers).png().toFile(`${dir}/${d}-frames.png`);
 }
 const receipt=JSON.parse(await readFile(`${dir}/shell-receipt.json`,'utf8'));const unchanged=[];
 for(const [file,before]of Object.entries(receipt.sourceHashes)){const after=createHash('sha256').update(await readFile(new URL(`../../${file}`,import.meta.url))).digest('hex');assert.equal(after,before);unchanged.push(file);}
 const report={kind:'renderer and geometry checks only; zero unfamiliar-player participants',errors,profileFixturesChecked:Object.keys(meta),geometry:data.geometry,fixedMaskChecks,frameChecks,changedChannelsOutsideAperture:shellDifference,productionSourcesUnchanged:unchanged};
 await writeFile(`${dir}/verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
