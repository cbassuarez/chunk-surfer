// Walk the main stair up and down with ordinary W presses, recording the eye
// every frame, and report any frame where it jumps.
//
//   STAIR_URL=http://127.0.0.1:5511/ node tools/chunk_surfer/verify-main-stair-walk.mjs [--out=artifacts/main-stair-audit/after]
//
// The route is planned on the compiled plan with canStep (redirects included,
// so landings' seams are crossed the way the body crosses them). The eye is
// sampled in the page on every animation frame: physical position and the
// plan's own rotation under the camera (world yaw less look yaw), which is the
// part a seam or a helix can turn. Aiming between steps changes only the look.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as A from './main-stair-audit.mjs';

const arg=(name,fallback)=>{const hit=process.argv.find((v)=>v.startsWith(`--${name}=`));return hit?hit.slice(name.length+3):fallback;};
const OUT=path.resolve(A.ROOT,arg('out','artifacts/main-stair-audit/after'));
const URL_BASE=process.env.STAIR_URL||'http://127.0.0.1:5511/';
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
fs.mkdirSync(OUT,{recursive:true});
const {FP}=A.compileConservatory();
const key=(p)=>`${Math.floor(p.x)},${Math.floor(p.y)}`;

// A route FIELD: for every cell reachable from the start, the step that gets
// nearest the goal. Steering from the field, a body that drifts to another lane
// of a flight (lanes are walkable side to side) is still on a route.
function routeField(start,goal){
  const a={x:Math.floor(start.x),y:Math.floor(start.y)},edges=new Map(),queue=[a],seen=new Set([key(a)]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i],out=[];
    for(const [dx,dy] of[[1,0],[-1,0],[0,1],[0,-1]]){
      const r=FP.canStep(p.x,p.y,p.x+dx,p.y+dy);if(!r.ok)continue;
      const q={x:Math.floor(r.redirect?.x??p.x+dx),y:Math.floor(r.redirect?.y??p.y+dy)};out.push({dx,dy,to:key(q)});
      if(!seen.has(key(q))){seen.add(key(q));queue.push(q);}
    }
    edges.set(key(p),out);
  }
  if(!seen.has(key(goal)))throw new Error(`no route ${key(a)} -> ${key(goal)}`);
  const into=new Map();for(const [from,out] of edges)for(const e of out){if(!into.has(e.to))into.set(e.to,[]);into.get(e.to).push(from);}
  const dist=new Map([[key(goal),0]]),bfs=[key(goal)];
  for(let i=0;i<bfs.length;i++)for(const from of into.get(bfs[i])||[])if(!dist.has(from)){dist.set(from,dist.get(bfs[i])+1);bfs.push(from);}
  const field={};
  for(const [from,out] of edges){const best=out.filter((e)=>dist.has(e.to)).sort((m,n)=>dist.get(m.to)-dist.get(n.to))[0];if(best&&dist.get(best.to)<dist.get(from))field[from]={dx:best.dx,dy:best.dy};}
  return{field,steps:dist.get(key(a)),goal:key(goal)};
}

async function main(){
  const start=A.logicalAt(61.5,30.5,0),top=A.logicalAt(62.75,38.25,10);
  const up=routeField(start,top),down=routeField(top,start);
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-surfer-stair-walk-'));
  const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:300000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache','--no-first-run','--no-default-browser-check']});
  const report={generatedAt:new Date().toISOString(),url:URL_BASE,route:{up:up.steps,down:down.steps},legs:[],errors:[]};
  try{
    const page=await browser.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
    await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
    page.on('pageerror',(e)=>report.errors.push(String(e)));
    await page.goto(`${URL_BASE}?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>window.__probe?.testRun,{timeout:120000});
    for(let i=0;i<30;i++){const id=await page.evaluate(()=>window.__scenes?.top()?.id);if(id==='title'||id==='world-title'||(i>1&&!id))break;if(id==='eula')await page.keyboard.press('Enter');await sleep(400);}
    await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush();});await sleep(1000);
    await page.evaluate(({x,y})=>window.__probe.warpRuntime(x,y),{x:start.x,y:start.y});await sleep(1500);
    for(const [name,leg] of[['up',up],['down',down]]){
      // Keep W down the whole way, as a player does, and steer from inside the
      // page every frame: face the next edge of the route (its logical
      // bearing turned by the helix under that cell), and record the eye.
      await page.evaluate(async({field,goal})=>{
        const R3=await import('/src/render/r3d.js'),FP=await import('/src/world/floorplan.js');
        window.__walk=[];window.__walkOn=true;window.__walkState={off:null,done:false};
        const k=(p)=>`${Math.floor(p.x)},${Math.floor(p.y)}`;
        const tick=()=>{
          if(!window.__walkOn)return;
          const v=R3.r3dViewCamera(),l=R3.r3dLookAngles(),pos=window.__probe.pos(),st=window.__walkState;
          window.__walk.push({t:performance.now(),x:v.eye.x,y:v.eye.y,z:v.eye.z,plan:v.yaw-(l?.yaw||0),cell:k(pos)});
          const e=field[k(pos)];
          if(k(pos)===goal)st.done=true;
          else if(!e)st.off=k(pos);
          else{const p=FP.logicalToPhysical(pos.x,pos.y),yaw=Math.atan2(e.dx,-e.dy)+FP.arcYawOffset(pos.x,pos.y,p.x,p.z);
            window.__probe.lookAtWorld(yaw,-.05);}
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },{field:leg.field,goal:leg.goal});
      await page.keyboard.down('w');
      const end=await page.waitForFunction(()=>window.__walkState.done||window.__walkState.off,{timeout:240000,polling:500}).then(()=>page.evaluate(()=>window.__walkState),()=>({timeout:true}));
      await page.keyboard.up('w');
      if(end.off||end.timeout)report.errors.push(`${name}: ${end.off?`reached ${end.off}, which has no way on`:'did not finish in four minutes'}`);
      await sleep(800);
      const samples=await page.evaluate(()=>{window.__walkOn=false;return window.__walk;});
      const final=await page.evaluate(()=>window.__probe.pos());
      // A jump is judged against the walk's own pace at that frame's time
      // step, because a headless frame can be 30-100 ms: three times the
      // median speed (and a floor of 15 cm, 10 cm of rise, 4° of turn) in one
      // frame is a teleport, not a stride, a riser or the helix turning.
      const rates=(f)=>{const v=[];for(let i=1;i<samples.length;i++){const dt=(samples[i].t-samples[i-1].t)/1000;if(dt>0){const q=f(samples[i-1],samples[i]);if(q>1e-6)v.push(q/dt);}}v.sort((a,b)=>a-b);return v[v.length>>1]||0;};
      const planarOf=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z),riseOf=(a,b)=>Math.abs(b.y-a.y);
      const turnOf=(a,b)=>{let t=Math.abs(b.plan-a.plan)%(Math.PI*2);return Math.min(t,Math.PI*2-t)*180/Math.PI;};
      const vPlanar=rates(planarOf),vRise=rates(riseOf),vTurn=rates(turnOf);
      const jumps=[];let maxPlanar=0,maxRise=0,maxTurn=0;
      for(let i=1;i<samples.length;i++){
        const a=samples[i-1],b=samples[i],dt=(b.t-a.t)/1000,planar=planarOf(a,b),rise=riseOf(a,b),turn=turnOf(a,b);
        maxPlanar=Math.max(maxPlanar,planar);maxRise=Math.max(maxRise,rise);maxTurn=Math.max(maxTurn,turn);
        const reasons=[];
        if(planar>Math.max(.15,3*vPlanar*dt))reasons.push('position');
        if(rise>Math.max(.10,3*vRise*dt))reasons.push('height');
        if(turn>Math.max(4,3*vTurn*dt))reasons.push('turn');
        if(reasons.length)jumps.push({frame:i,reasons,dtMs:Math.round(dt*1000),planar:+planar.toFixed(3),rise:+rise.toFixed(3),turnDeg:+turn.toFixed(2),at:[+b.x.toFixed(2),+b.y.toFixed(2),+b.z.toFixed(2)],cell:b.cell});
      }
      const result={name,steps:leg.steps,frames:samples.length,reached:key(final)===leg.goal,final,medianPerSecond:{planarM:+vPlanar.toFixed(3),riseM:+vRise.toFixed(3),planTurnDeg:+vTurn.toFixed(1)},
        maxPerFrame:{planarM:+maxPlanar.toFixed(3),riseM:+maxRise.toFixed(3),planTurnDeg:+maxTurn.toFixed(2)},jumps};
      report.legs.push(result);
      fs.writeFileSync(path.join(OUT,`walk-${name}.json`),JSON.stringify(samples));
      console.log(name,JSON.stringify({steps:result.steps,frames:result.frames,reached:result.reached,median:result.medianPerSecond,max:result.maxPerFrame,jumps:jumps.length}));
    }
  }catch(e){report.errors.push(String(e.stack||e));console.error(e);}
  finally{await browser.close();fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(OUT,'walk.json'),JSON.stringify(report,null,2)+'\n');}
  if(report.errors.length||report.legs.some((l)=>!l.reached||l.jumps.length))process.exitCode=1;
}
await main();
