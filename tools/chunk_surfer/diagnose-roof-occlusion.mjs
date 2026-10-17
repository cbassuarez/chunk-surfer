// A/B inspect the real renderer at the walked roof-entry camera angle.
import puppeteer from 'puppeteer-core';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const out=resolve('artifacts/roof-floor-design/live-walk-native/occlusion');await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'chunk-roof-occ-'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,userDataDir:profile,protocolTimeout:90000,args:['--no-sandbox','--enable-webgl','--use-angle=metal']});
const page=await browser.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
const shots=[];let phase='boot';
async function capture(name){phase=name;await new Promise(r=>setTimeout(r,500));const state=await page.evaluate(()=>({
  pos:window.__probe.pos(),look:window.__probe.lookAngles(),props:window.__probe.props()?.renderedIds,
}));const file=join(out,`${name}.webp`);await page.screenshot({path:file,type:'webp',quality:90});shots.push({name,file,...state});console.log('CAPTURE',name,state.props?.filter(id=>/roof|atrium|skylight|baseboard/.test(id)));}
try{
  await page.goto('http://127.0.0.1:5353/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:60000});
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','roof.access','academic.entered']);
    window.__probe.warpCell(193,294);window.__probe.lookAtWorld(-Math.PI/2,0);});
  await capture('01-entry-baseline');
  const dom=await page.evaluate(()=>[[100,50],[200,80],[200,120],[800,80],[600,80]].map(([x,y])=>({x,y,
    nodes:document.elementsFromPoint(x,y).slice(0,8).map(e=>({tag:e.tagName,id:e.id,cls:e.className,background:getComputedStyle(e).backgroundColor,opacity:getComputedStyle(e).opacity}))})));
  console.log('DOM',JSON.stringify(dom));
  await writeFile(join(out,'dom-samples.json'),JSON.stringify(dom,null,2));
  const raw=await page.evaluate(()=>window.__probe.sourceShoreCapture?.('scene'));
  if(raw)await writeFile(join(out,'scene-raw.png'),Buffer.from(raw.split(',')[1],'base64'));
  const groups=[
    ['02-minus-stair',['academic-roof-service-stair']],
    ['03-minus-roof-structure',['academic-roof-structure']],
    ['04-minus-roof-glazing',['academic-roof-glazing']],
    ['05-minus-skylight',['academic-skylight']],
    ['06-minus-atrium',['academic-atrium-structure']],
    ['07-minus-roof-baseboard',['baseboard-academicRoof']],
    ['08-minus-academic-baseboard',['baseboard-academic']],
    ['09-minus-dock-roof',['dock-scene-roof']],
    ['10-minus-bay-canopy',['bay-canopy']],
    ['11-minus-bay-elevation',['bay-west-elevation']],
  ];
  for(const[name,ids]of groups){
    await page.evaluate(async ids=>{const source=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/props.js')?.name;
      const props=await import(source||'/src/game/props.js');for(const id of ids)props.setLooseProp(id,null);
      window.__probe.warpCell(193,294);window.__probe.lookAtWorld(-Math.PI/2,0);},ids);
    await capture(name);
  }
  await page.evaluate(async()=>{const source=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/props.js')?.name;
    const props=await import(source||'/src/game/props.js');const ids=props.allProps().filter(p=>(p.renderGroups||[]).includes('ground')).map(p=>p.id);
    for(const id of ids)props.setLooseProp(id,null);window.__probe.warpCell(193,294);window.__probe.lookAtWorld(-Math.PI/2,0);});
  await capture('12-minus-all-ground-props');
}catch(e){console.error('FATAL',phase,e);shots.push({fatal:phase,error:String(e.stack||e)});}finally{
  await writeFile(join(out,'report.json'),JSON.stringify(shots,null,2));await browser.close();await rm(profile,{recursive:true,force:true});
}
