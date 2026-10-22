// Native 3D movement acceptance: only the initial north-gallery placement is a QA warp.
// Every route transition thereafter is a real keyboard step against live collision.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { conservatory } from '../../src/data/floorplan/conservatory.js';
import { ACADEMIC_ROOF } from '../../src/data/academic-roof.js';
import { ROOF_PASSWORD } from '../../src/data/roof-password.js';
import { TARGETS } from '../../src/data/conservatory-script.js';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';

const listenPort=Number(process.env.ROOF_WALK_PORT)||5353;
const url = process.env.ROOF_WALK_URL || `http://127.0.0.1:${listenPort}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0`;
const out = resolve(process.env.ROOF_WALK_OUT || 'artifacts/roof-floor-design/live-walk-native');
const gateOnly=process.env.ROOF_WALK_GATE_ONLY==='1';
const dropStudy=process.env.ROOF_WALK_DROP_STUDY==='1';
const fastStudy=process.env.ROOF_WALK_FAST_STUDY==='1';
const stopAtTurn=process.env.ROOF_WALK_STOP_AT_TURN==='1';
const cleanFrames=process.env.ROOF_WALK_CLEAN==='1';
const galleryStartX=Number(process.env.ROOF_WALK_START_X)||44;
const galleryStartY=Number(process.env.ROOF_WALK_START_Y)||243;
const torchOn=process.env.ROOF_WALK_TORCH!=='0';
await mkdir(out, { recursive:true });
const propPackHash=async()=>createHash('sha256').update(await readFile(resolve('public/assets/conservatory-props.glb'))).digest('hex');
const propPackHashStart=await propPackHash();
// Disable HMR: parallel narrative/roof edits during acceptance must not reload
// the browser halfway through a real stair transition.
const server=process.env.ROOF_WALK_URL?null:await createServer({configFile:'vite.config.js',
  server:{host:'127.0.0.1',port:listenPort,strictPort:true,hmr:false}});
if(server)await server.listen();
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP);
const key = p => `${p.x},${p.y}`;
const logical = (x,y) => FP.toRuntimePoint({x,y});
const within = p => (p.x>=84&&p.x<100&&p.y>=478&&p.y<500)||
  (p.x>=316&&p.x<380&&p.y>=548&&p.y<586)||
  (p.x>=380&&p.x<428&&p.y>=540&&p.y<594);
function path(start,end){
  const seen=new Map([[key(start),null]]),queue=[start];
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(key(p)===key(end))break;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const move=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set(['master'])});
      if(!move.ok)continue;
      const to=move.redirect||{x:p.x+dx,y:p.y+dy};
      if(!within(to)||!PROPS.propCanOccupy(to.x,to.y)||seen.has(key(to)))continue;
      seen.set(key(to),{from:key(p),dx,dy,portal:move.edgePortal||null});queue.push(to);
    }
  }
  if(!seen.has(key(end)))throw Error(`No authored path ${key(start)} -> ${key(end)}`);
  const reversed=[];for(let here=key(end);here!==key(start);){
    const edge=seen.get(here);reversed.push({to:here,dx:edge.dx,dy:edge.dy,portal:edge.portal});here=edge.from;
  }
  return reversed.reverse();
}
const profile=await mkdtemp(join(tmpdir(),'chunk-roof-walk-'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,userDataDir:profile,protocolTimeout:90000,
  args:['--no-sandbox','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();await page.setViewport({width:960,height:600,deviceScaleFactor:1});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
const report={url,propPackHashStart,steps:[],captures:[],checks:[],errors:[],start:null,end:null};
let phase='boot';const log=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
const state=()=>page.evaluate(()=>({pos:window.__probe?.pos?.(),floor:window.__probe?.floorH?.(),
  scene:window.__scenes?.top?.()?.id||null,sceneView:window.__scenes?.top?.()?.view?.()||null,
  focus:window.__probe?.interactionFocus?.(),look:window.__probe?.lookAngles?.(),
  group:window.__probe?.world?.(),flags:{access:window.__probe?.flag?.('roof.access')},
  eye:window.__probe?.sourceShoreView?.()?.eye||null,
  lighting:window.__probe?.r3dLighting?.(),
  screen:window.__chunkSurferPixelMesh?.status?.()}));
async function capture(name){phase=name;await new Promise(r=>setTimeout(r,450));const s=await state();const file=join(out,`${name}.webp`);
  await page.screenshot({path:file,type:'webp',quality:82});report.captures.push({name,file,...s});
  if(process.env.ROOF_WALK_RAW==='1'&&/^(01g|03d-outer-guard-(north-deep|car-deep|northwest-deep))/.test(name)){
    const raw=await page.evaluate(()=>({props:window.__probe.sourceShoreCapture?.('props'),
      scene:window.__probe.sourceShoreCapture?.('scene')}));
    for(const[k,data]of Object.entries(raw))if(data)
      await writeFile(join(out,`${name}-${k}.png`),Buffer.from(data.split(',')[1],'base64'));
  }
  console.log('CAPTURE',name,JSON.stringify({pos:s.pos,eye:s.eye,floor:s.floor,scene:s.scene,focus:s.focus?.propId}));return s;}
async function pitchFixture(){
  // A separate camera-boundary fixture is permitted after the actual keyboard
  // route proof. It never substitutes for a stair step or portal traversal.
  await page.evaluate(()=>window.__probe.warpCell(200,284));
  await capture('15-roof-pitch-fixture');
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-2.15));
  const steep=await capture('16-roof-looking-through-glass');
  log('roof admits a downward view through the atrium glass',
    steep.look?.pitch<-1.45&&steep.look?.pitch>-Math.PI/2,steep.look);
  await page.evaluate(()=>window.__probe.warpCell(40,258));
  const reset=await capture('17-gallery-pitch-reset');
  log('descending roof context resets exceptional downward pitch',reset.look?.pitch>=-.63,reset.look);
}
async function walkTo(label,target){
  const from=(await state()).pos;
  const initialRoute=path(from,target);console.log('ROUTE',label,initialRoute.length);
  let moved=0,stalls=0;
  // The first-person controller may consume more than one half-metre cell per
  // keypress, especially while crossing an edge portal. Replan from the real
  // live cell each time; never count a scripted redirect as a keyboard step.
  for(let attempt=0;attempt<initialRoute.length*8+24;attempt++){
    const current=(await state()).pos;
    if(key(current)===key(target))break;
    const route=path(current,target),edge=route[0];phase=`${label}:${attempt+1}`;
    const yaw=Math.atan2(edge.dx,-edge.dy);
    await page.evaluate(yaw=>window.__probe.lookAtWorld(yaw,0),yaw);
    const before=(await state()).pos;
    await page.keyboard.press('w');
    const after=await state();
    const trace={phase,label,index:attempt+1,from:before,to:after.pos,aimed:edge.to,
      floor:after.floor,scene:after.scene,portal:edge.portal};
    report.steps.push(trace);
    if(key(after.pos)===key(before)){
      if(++stalls>=4)throw Error(`Movement stalled at ${phase}: ${key(before)} toward ${edge.to}`);
    }else{
      stalls=0;moved++;
      if(!within(after.pos)||!PROPS.propCanOccupy(after.pos.x,after.pos.y))
        throw Error(`Walk left authored route at ${phase}: ${key(before)} -> ${key(after.pos)}`);
      path(after.pos,target); // prove each live landing still leads to destination
    }
  }
  const arrived=(await state()).pos;
  log(`${label} traversed with keyboard`,key(arrived)===key(target),{presses:moved,target,arrived});
  if(key(arrived)!==key(target))throw Error(`Could not finish ${label}: ${key(arrived)} != ${key(target)}`);
}
try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:60000});
  await page.evaluate(async()=>{
    await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();
  });
  if(cleanFrames)await page.evaluate(()=>{
    // Review-only framing: the UI glyph canvas paints the monitor and route
    // labels over the doorway. Hide that one canvas for architectural captures;
    // the ordinary WebGL world and gameplay/focus state keep running.
    for(const canvas of document.querySelectorAll('#map > canvas'))
      if(canvas.style.zIndex==='8')canvas.style.visibility='hidden';
  });
  const takeFixture=await page.evaluate(({torchOn,galleryStartX,galleryStartY,targets})=>{
    window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','academic.entered'],['roof.access']);
    const take=window.__probe.setTakes(targets,false);
    window.__probe.setTorch(torchOn);
    window.__probe.warpCell(galleryStartX,galleryStartY);
    return{take,keys:window.__probe.keys?.(),takes:window.__probe.rec?.().takes,access:window.__probe.flag?.('roof.access')};
  },{torchOn,galleryStartX,galleryStartY,targets:TARGETS});
  log('staff key is present and recording is not a gate prerequisite',
    takeFixture.keys?.includes('master')&&takeFixture.take?.ok&&takeFixture.takes?.length===0&&takeFixture.access===false,takeFixture);
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-.03));
  // The QA fixture has just switched on the torch. Let its exposure settle to
  // the ordinary gameplay state before assessing the gate's material/read.
  await new Promise(r=>setTimeout(r,1800));
  report.start=await capture('01-north-gallery-gate');
  log('prerequisite placement at north gallery',key(report.start.pos)===key(logical(galleryStartX,galleryStartY)),report.start.pos);
  log('gate selected by ordinary reticle',report.start.focus?.propId==='roof-gate',report.start.focus);
  if(report.start.focus?.propId!=='roof-gate')throw Error(`Roof gate not focusable from north gallery: ${JSON.stringify(report.start.focus)}`);
  await page.keyboard.press('e');
  const lock=await state();
  log('ordinary interaction opens the six-letter word lock',lock.scene==='roof-word-lock',lock.sceneView);
  if(lock.scene!=='roof-word-lock')throw Error('Roof word lock did not open');
  await page.keyboard.type(ROOF_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__probe?.flag?.('roof.access')===true,{timeout:5000});
  const opened=await state();
  log('gate opens via ordinary interaction',opened.flags.access===true,{focus:opened.focus,flags:opened.flags});
  if(!opened.flags.access)throw Error('The service word and staff key did not open the gate');
  await capture('01b-north-gallery-gate-open');
  await walkTo('first grated landing directly outside the door',logical(ACADEMIC_ROOF.stairFoot.x,ACADEMIC_ROOF.stairFoot.y));
  const firstStep=await capture('01c-first-step-into-open-sky');
  log('first real step outside remains on safe ten-metre landing',
    key(firstStep.pos)===key(logical(ACADEMIC_ROOF.stairFoot.x,ACADEMIC_ROOF.stairFoot.y))&&Math.abs(firstStep.floor-10)<.1,
    {pos:firstStep.pos,floor:firstStep.floor});
  const firstLandingRender=await page.evaluate(()=>({
    renderedIds:window.__probe.props().renderedIds,
    lighting:window.__probe.r3dLighting(),
  }));
  const lowerSecurity=firstLandingRender.lighting?.lights?.find(light=>
    Math.abs(light.x-84.35)<.1&&Math.abs(light.y-3.5)<.1&&Math.abs(light.z-1.32)<.1);
  log('first landing selects lower facade security light',!!lowerSecurity&&lowerSecurity.intensity>0,
    lowerSecurity||firstLandingRender.lighting?.lights);
  log('first landing renders real north-street car from exterior ground group',
    firstLandingRender.renderedIds?.includes('district-north-car-east'),
    firstLandingRender.renderedIds?.filter(id=>id.includes('north-car')));
  // From the actual safe door landing, one ordinary oblique glance should
  // place school bays on the left and north street below on the right.
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI*1.5,-.75));
  await capture('01e-first-landing-school-street-oblique');
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI*1.5,-.90));
  await capture('01f-first-landing-school-street-deep');
  await page.evaluate(()=>window.__probe.lookAtWorld(5.62,-.73));
  await capture('01g-first-landing-actual-car-and-facade');
  if(dropStudy&&!fastStudy)for(const [label,yaw,pitch] of[
    ['north-middle',0,-.55],['north-down',0,-.90],
    ['northwest-down',Math.PI*1.75,-.90],['northeast-down',Math.PI*.25,-.90],
    ['facade-middle',Math.PI,-.55],['facade-down',Math.PI,-.90],
  ]){
    await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw,pitch});
    await capture(`01e-drop-study-${label}`);
  }
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-1.52));
  const thresholdDrop=await capture('01d-grating-and-drop-below-threshold');
  log('threshold permits a steep look at the drop',thresholdDrop.look?.pitch<-1.3,thresholdDrop.look);
  if(!gateOnly){
  await walkTo('lower exterior flight beside school windows',logical(171,283));
  await capture('02-windows-fall-below');
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI,0));
  await capture('02a-lower-flight-facade-level');
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI,-.45));
  await capture('02b-lower-flight-facade-down');
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-.65));
  await capture('02c-lower-flight-street-down');
  await walkTo('broad reversible switchback',logical(ACADEMIC_ROOF.stairTurn.x,ACADEMIC_ROOF.stairTurn.y));
  await capture('03-switchback-over-gallery');
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI,0));
  await capture('03e-turn-facade-level');
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI,-.45));
  await capture('03f-turn-facade-down');
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-.65));
  await capture('03g-turn-street-down');
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-1.52));
  const through=await capture('03a-turn-through-open-grating');
  log('outdoor turn permits a real downward look through the escape',through.look?.pitch<-1.3,through.look);
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI*1.75,-.76));
  await capture('03b-turn-school-street-oblique');
  await page.evaluate(()=>window.__probe.lookAtWorld(0,-.86));
  await capture('03c-school-street-drop-beyond-guard');
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI,-.82));
  await capture('03d-lower-school-facade-through-grating');
  if(dropStudy&&!fastStudy)for(const [label,yaw,pitch] of[
    ['north-mid',0,-.48],['north-down',0,-.76],
    ['northwest-mid',Math.PI*1.75,-.48],['northwest-down',Math.PI*1.75,-.76],
    ['northeast-down',Math.PI*.25,-.76],['facade-mid',Math.PI,-.48],
    ['facade-down',Math.PI,-.76],['facade-steep',Math.PI,-1.18],
  ]){
    await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw,pitch});
    await capture(`03c-turn-drop-study-${label}`);
  }
  if(dropStudy){
    await walkTo('outer switchback guard lookout',logical(159,278.5));
    for(const [label,yaw,pitch] of[
      ['north-mid',0,-.48],['north-down',0,-.82],
      ['northwest-down',Math.PI*1.75,-.82],['northeast-down',Math.PI*.25,-.82],
      ['north-deep',0,-1.25],['car-deep',.55,-1.38],['northwest-deep',Math.PI*1.75,-1.18],
      ['facade-down',Math.PI,-.82],['facade-steep',Math.PI,-1.18],
    ]){
      await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw,pitch});
      await capture(`03d-outer-guard-${label}`);
    }
  }
  if(stopAtTurn&&process.env.ROOF_WALK_PITCH_FIXTURE==='1')await pitchFixture();
  if(!stopAtTurn){
  await walkTo('upper open fire-escape flight toward city',logical(184,281));
  await capture('04-city-emerges-on-climb');
  await walkTo('roof-height bridge and north parapet opening',logical(ACADEMIC_ROOF.entry.x,ACADEMIC_ROOF.entry.y));
  await capture('05-roof-entry-after-real-ascent');
  await walkTo('west safe loop',logical(192,285));
  await capture('06-west-loop');
  await walkTo('north safe loop',logical(201,272));
  await capture('07-north-loop');
  await walkTo('Ren approach',logical(210,275));
  await capture('08-ren-approach');
  await walkTo('east safe loop',logical(211,285));
  await capture('09-east-loop');
  await walkTo('west glass seat',logical(200,289));
  // The previous leg ends facing west; turn the camera toward the bay before
  // asking the ordinary reticle/focus system to select it.
  await page.evaluate(()=>{
    const p=window.__probe.pos();
    const bay=window.__probe.props().instances.find(item=>item.id==='roof-sit-west');
    if(!bay)throw Error('west glass seat instance missing');
    window.__probe.lookAtWorld(Math.atan2(bay.x*2+1-p.x,-(bay.y*2+1-p.y)),0);
  });
  const seat=await capture('10-glass-seat-focus');
  log('glass seat focusable after walking',seat.focus?.propId==='roof-sit-west',seat.focus);
  if(seat.focus?.propId==='roof-sit-west'){
    await page.keyboard.press('e');
    await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='academic-roof-sit'&&window.__scenes.top().view?.().phase==='seated',{timeout:10000});
    const sitting=await capture('11-glass-seated');log('glass sit reached via walk',sitting.scene==='academic-roof-sit',sitting.sceneView);
    await page.keyboard.press('e');
    await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='academic-roof-sit',{timeout:10000});
    await capture('12-glass-stood');
  }
  await walkTo('east glass seat',logical(205,286));
  await page.evaluate(()=>{
    const p=window.__probe.pos();
    const bay=window.__probe.props().instances.find(item=>item.id==='roof-sit-east');
    if(!bay)throw Error('east glass seat instance missing');
    window.__probe.lookAtWorld(Math.atan2(bay.x*2+1-p.x,-(bay.y*2+1-p.y)),0);
  });
  const eastSeat=await capture('12a-east-glass-seat-focus');
  log('east glass seat focusable after walking',eastSeat.focus?.propId==='roof-sit-east',eastSeat.focus);
  if(eastSeat.focus?.propId!=='roof-sit-east')throw Error('The east supported-glass bay is not focusable');
  await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='academic-roof-sit'&&window.__scenes.top().view?.().phase==='seated',{timeout:10000});
  const eastSitting=await capture('12b-east-glass-seated');
  log('east glass sit reached via walk',eastSitting.scene==='academic-roof-sit',eastSitting.sceneView);
  await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__scenes?.top?.()?.id!=='academic-roof-sit',{timeout:10000});
  await capture('12c-east-glass-stood');
  await walkTo('return to roof entry',logical(ACADEMIC_ROOF.entry.x,ACADEMIC_ROOF.entry.y));
  await capture('13-roof-return');
  await walkTo('return to upper flight head',logical(ACADEMIC_ROOF.stairHead.x,ACADEMIC_ROOF.stairHead.y));
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI*1.5,-.14));
  await capture('13a-upper-flight-descent');
  await walkTo('return to exposed turn',logical(ACADEMIC_ROOF.stairTurn.x,ACADEMIC_ROOF.stairTurn.y));
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI/2,-.18));
  await capture('13b-turn-and-lower-flight-return');
  await walkTo('return down lower flight',logical(171,283));
  await page.evaluate(()=>window.__probe.lookAtWorld(Math.PI/2,-.12));
  await capture('13c-school-windows-on-return');
  await walkTo('return down exterior stairs and gallery gate',logical(galleryStartX,galleryStartY));
  report.end=await capture('14-north-gallery-return');
  log('ordinary return to north gallery',key(report.end.pos)===key(logical(galleryStartX,galleryStartY)),report.end.pos);
  await pitchFixture();
  }
  }
  report.propPackHashEnd=await propPackHash();
  log('prop pack remained byte-identical through native review',
    report.propPackHashEnd===report.propPackHashStart,report.propPackHashEnd);
}catch(error){report.errors.push({phase,message:String(error.stack||error)});console.error('FATAL',phase,error);}finally{
  try{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('REPORT',join(out,'report.json'));}
  finally{await browser.close();await rm(profile,{recursive:true,force:true});await server?.close();}
}
// Vite may retain a file watcher after close(); all browser, profile, server
// and report cleanup is complete here, so give the QA command a real exit.
process.exit(report.errors.length||report.checks.some(c=>!c.pass)?1:0);
