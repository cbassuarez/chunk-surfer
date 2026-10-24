// The main stair from fixed camera stations, through the real renderer, with a
// per-pixel map of which source drew each pixel.
//
//   STAIR_URL=http://127.0.0.1:5511/ node tools/chunk_surfer/verify-main-stair-views.mjs [--out=artifacts/main-stair-audit/before]
//
// For each station: the actual frame (page screenshot, so the game's own post and
// dither are in it), the same frame with only the stair GLB hidden, and a source
// map computed in node from the identical camera — the observer's own render
// slice marched exactly as r3d marches it, plus the GLB raycast. The frame pair
// is the check on the source map: pixels that change when the GLB is hidden
// must be the pixels the map gives to the mesh. Agreement is reported per
// station; a map that disagrees with the renderer is not evidence.

import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as A from './main-stair-audit.mjs';

const arg=(name,fallback)=>{const hit=process.argv.find((v)=>v.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const OUT=path.resolve(A.ROOT,arg('out','artifacts/main-stair-audit/before'),'stations');
const URL_BASE=process.env.STAIR_URL||'http://127.0.0.1:5511/';
const WIDTH=1280,HEIGHT=800,MAP_W=320,MAP_H=200;
fs.mkdirSync(OUT,{recursive:true});
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
const {STAIR,SOURCE,SOURCE_COLOR,CELL}=A;

// Stations in physical metres. `floor` picks the storey or tread; `look` is a
// world point the camera is turned toward (pitch clamps at ±0.62 as in play).
const C=STAIR.center;
const onHelix=(angleDeg,r,h)=>({x:C.x+Math.sin(angleDeg*Math.PI/180)*r,z:C.z-Math.cos(angleDeg*Math.PI/180)*r,floor:h});
export const STATIONS=[
  {id:'01-foot',title:'Foot of the stair, from the ground hall',at:{x:61.5,z:30.5,floor:0},look:{x:63.6,y:1.4,z:36}},
  {id:'02-under',title:'Ground hall, looking up under the second half-turn',at:{x:59.75,z:38.25,floor:0},look:{x:62,y:3.4,z:35.6}},
  {id:'03-lower-up-well',title:'Mid second half-turn, looking up the well',at:{...onHelix(262,1.4,3.43)},look:{x:63.2,y:9,z:36}},
  {id:'04-upper-landing-back',title:'Upper landing, looking back down the arrival',at:{x:64.75,z:34.25,floor:4.8},look:{x:61.4,y:3.6,z:36.2}},
  {id:'05-upper-mid',title:'Mid third half-turn, looking up the flight',at:{...onHelix(190,1.4,6.0)},look:{...onHelix(250,1.6,0),y:7.6}},
  {id:'06-head-down',title:'Academic head, looking down the well',at:{x:62.25,z:38.25,floor:10},look:{x:63.2,y:2,z:36.2}},
];

async function main(){
  const tris=A.stairMeshTriangles(),bvh=A.buildBVH(tris);
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-surfer-stair-'));
  const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:180000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check']});
  const report={generatedAt:new Date().toISOString(),url:URL_BASE,stations:[],errors:[]};
  try{
    const page=await browser.newPage();await page.setViewport({width:WIDTH,height:HEIGHT,deviceScaleFactor:1});
    await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
    page.on('pageerror',(e)=>report.errors.push(String(e)));
    await page.goto(`${URL_BASE}?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.__probe?.testRun,{timeout:120000});
    for(let i=0;i<30;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);if(id==='title'||id==='world-title'||(i>1&&!id))break;if(id==='eula')await page.keyboard.press('Enter');await sleep(400);}
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush();});await sleep(1200);
    for(const station of STATIONS){
      const logical=A.logicalAt(station.at.x,station.at.z,station.at.floor);
      const eyeY=logical.floor+1.62,dx=station.look.x-station.at.x,dz=station.look.z-station.at.z,dy=station.look.y-eyeY;
      const yaw=Math.atan2(dx,-dz),pitch=Math.max(-.62,Math.min(.62,Math.atan2(dy,Math.hypot(dx,dz))));
      const place=async(hidden)=>page.evaluate(async({lx,ly,yaw,pitch,hidden})=>{
        const PROPS=await import('/src/game/props.js');
        const stair=PROPS.allProps().find((p)=>p.id==='main-open-well-stair');
        if(stair){stair.__groups??=stair.renderGroups;stair.renderGroups=hidden?['__hidden__']:stair.__groups;}
        window.__probe.hush();window.__probe.warpRuntime(lx,ly);window.__probe.lookAtWorld(yaw,pitch);
      },{lx:logical.x,ly:logical.y,yaw,pitch,hidden});
      const settle=async()=>{await sleep(4000);};
      await place(false);await settle();
      const shot=await page.screenshot({type:'webp',quality:92});
      const camera=await page.evaluate(async()=>{const R3=await import('/src/render/r3d.js');return R3.r3dViewCamera();});

      // Source map from the same camera, against the observer's own slice.
      const slice=A.observerSlice(logical.x,logical.y);
      const view={eye:camera.eye,yaw:camera.yaw,pitch:camera.pitch};
      const map=A.sourceMap({slice,bvh,camera:view,width:MAP_W,height:MAP_H,frame:{width:WIDTH,height:HEIGHT}});
      const rgb=Buffer.alloc(MAP_W*MAP_H*3),counts={};
      map.forEach((label,i)=>{const c=SOURCE_COLOR[label.source]||[255,0,255];rgb[i*3]=c[0];rgb[i*3+1]=c[1];rgb[i*3+2]=c[2];counts[label.source]=(counts[label.source]||0)+1;});
      await sharp(rgb,{raw:{width:MAP_W,height:MAP_H,channels:3}}).resize(WIDTH,HEIGHT,{kernel:'nearest'}).webp({lossless:true}).toFile(path.join(OUT,`${station.id}-sources.webp`));

      // THE MAP IS ONLY EVIDENCE IF ITS INPUTS ARE THE RENDERER'S INPUTS.
      //
      // A frame diff with the GLB hidden was tried first and measures the wrong
      // thing: hiding the stair also removes its shadows and bounce, so the
      // whole landing changes, while the thin dark balustrade barely moves a
      // downsampled pixel. So check what the map is built from instead: the
      // exact bytes of the plan slice the page uploads for this position, the
      // exact GLB it fetched, and — for the camera and projection — where the
      // renderer's own r3dProjectWorld puts mesh points the map hit.
      const eye=[view.eye.x,view.eye.y,view.eye.z],hits=[];
      for(let i=0;i<map.length&&hits.length<400;i+=7){
        const label=map[i];if(label.source!==SOURCE.MESH)continue;
        const x=i%MAP_W,y=Math.floor(i/MAP_W),sx=(x+.5)*WIDTH/MAP_W-.5,sy=(y+.5)*HEIGHT/MAP_H-.5;
        const d=A.pixelRay(view,sx,sy,WIDTH,HEIGHT);hits.push({sx,sy,p:eye.map((v,k)=>v+d[k]*label.t)});
      }
      const live=await page.evaluate(async(points)=>{
        const FP=await import('/src/world/floorplan.js'),R3=await import('/src/render/r3d.js');
        const pos=window.__probe.pos(),plan=FP.physicalRenderPlanFor(pos.x,pos.y);
        const hex=async(bytes)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map((b)=>b.toString(16).padStart(2,'0')).join('');
        const glb=await (await fetch('/assets/conservatory-main-stair.glb')).arrayBuffer();
        return{pos,key:plan.key,planSha:await hex(plan.rgba),glbSha:await hex(glb),
          projected:points.map((p)=>R3.r3dProjectWorld({x:p[0],y:p[1],z:p[2]}))};
      },hits.map((h)=>h.p));
      const errors=hits.map((h,k)=>Math.hypot(live.projected[k].x*WIDTH-.5-h.sx,live.projected[k].y*HEIGHT-.5-h.sy));
      const sha=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
      const check={
        planBytesMatch:live.planSha===sha(slice.rgba)&&live.key===slice.key,
        glbBytesMatch:live.glbSha===sha(fs.readFileSync(A.STAIR_GLB)),
        logicalMatch:Math.abs(live.pos.x-logical.x)<1e-9&&Math.abs(live.pos.y-logical.y)<1e-9,
        projection:{points:errors.length,maxPx:+Math.max(0,...errors).toFixed(2),meanPx:+(errors.reduce((a,b)=>a+b,0)/(errors.length||1)).toFixed(2)},
      };

      // For a person: the real frame with the map's mesh outline drawn on it.
      const edge=Buffer.alloc(MAP_W*MAP_H*4);
      for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
        const m=(xx,yy)=>xx>=0&&yy>=0&&xx<MAP_W&&yy<MAP_H&&map[yy*MAP_W+xx].source===SOURCE.MESH;
        if(m(x,y)&&!(m(x-1,y)&&m(x+1,y)&&m(x,y-1)&&m(x,y+1))){const i=(y*MAP_W+x)*4;edge[i]=255;edge[i+1]=0;edge[i+2]=200;edge[i+3]=255;}
      }
      const outline=await sharp(edge,{raw:{width:MAP_W,height:MAP_H,channels:4}}).resize(WIDTH,HEIGHT,{kernel:'nearest'}).png().toBuffer();
      await sharp(shot).composite([{input:outline}]).webp({quality:90}).toFile(path.join(OUT,`${station.id}-overlay.webp`));

      // What the grid alone draws, for comparison.
      await place(true);await settle();
      const hiddenShot=await page.screenshot({type:'webp',quality:92});
      await place(false);
      fs.writeFileSync(path.join(OUT,`${station.id}-frame.webp`),shot);
      fs.writeFileSync(path.join(OUT,`${station.id}-frame-no-mesh.webp`),hiddenShot);
      const entry={id:station.id,title:station.title,logical,camera,slice:slice.key,
        sources:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,+(v/(MAP_W*MAP_H)).toFixed(4)])),check};
      report.stations.push(entry);
      console.log(station.id,JSON.stringify(entry.sources),JSON.stringify(check));
    }
  }catch(e){report.errors.push(String(e.stack||e));console.error(e);}
  finally{await browser.close();fs.rmSync(profile,{recursive:true,force:true});
    fs.writeFileSync(path.join(OUT,'stations.json'),JSON.stringify(report,null,2)+'\n');}
  if(report.errors.length){console.error(report.errors.slice(0,5).join('\n'));process.exitCode=1;}
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
