// Remembered Room: actual still-page input, free room exploration and a real FOH crossing.
// Start a server separately. This harness never starts one or warps into the dock.
// SOURCE_ARRIVAL_URL=http://127.0.0.1:5311 SOURCE_ARRIVAL_OUT=/private/tmp/source-dock \
//   node tools/chunk_surfer/verify-source-arrival-live.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const base=process.env.SOURCE_ARRIVAL_URL||'http://127.0.0.1:5311';
const reduced=process.env.SOURCE_ARRIVAL_REDUCED_MOTION==='1';
const out=resolve(process.env.SOURCE_ARRIVAL_OUT||`/private/tmp/chunk-surfer-source-dock/${reduced?'reduced':'normal'}`);
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const errors=[],checks=[],failures=[],snapshots={},roaming=[];
let browser,page,failure=null,doorSamples=[];
await mkdir(out,{recursive:true});
function check(value,name,details=null){
  checks.push({name,passed:!!value,...(details==null?{}:{details})});
  if(!value)failures.push(name);
  console.log(`${value?'PASS':'FAIL'} ${name}${details==null?'':` ${JSON.stringify(details)}`}`);
}
const top=()=>page.evaluate(()=>window.__scenes?.top()?.id||null);
const position=()=>page.evaluate(()=>window.__probe.pos());
const samePosition=(a,b,tolerance=1e-6)=>Math.hypot(a.x-b.x,a.y-b.y)<=tolerance;
const sameLook=(a,b)=>!!a&&!!b&&Math.abs(Math.atan2(Math.sin(a.yaw-b.yaw),Math.cos(a.yaw-b.yaw)))<1e-6&&Math.abs(a.pitch-b.pitch)<1e-6;
async function clearSpeech(){await page.evaluate(()=>window.__probe.hush?.());}
async function press(key){await page.keyboard.press(key);await sleep(120);}
async function aim(yaw=0,pitch=0){await page.evaluate(v=>window.__probe.lookAtWorld(v.yaw,v.pitch),{yaw,pitch});await sleep(100);}
async function hold(keys,milliseconds){
  for(const key of keys)await page.keyboard.down(key);
  try{await sleep(milliseconds);}finally{for(const key of keys)await page.keyboard.up(key);}
  await sleep(70);
}
async function shot(name,captureStages=false){
  await page.screenshot({path:join(out,`${name}.png`)});
  if(captureStages)for(const stage of ['props','scene','vfd']){
    const data=await page.evaluate(stage=>window.__arrivalRenderer.r3dCaptureStageCanvas(stage)?.toDataURL('image/png'),stage);
    if(data)await writeFile(join(out,`${name}-${stage}.png`),Buffer.from(data.split(',')[1],'base64'));
  }
  console.log('CAPTURE',name);
}
async function evidence(name){
  const result=snapshots[name]=await page.evaluate(()=>{
    const p=window.__probe,r=window.__arrivalRenderer,pos=p.pos(),live=p.props();
    return{
      source:p.chunkSurf(),position:pos,look:p.lookAngles(),torchOn:!!p.rec().light,
      lighting:p.r3dLighting(),lights:p.sourceLights(),props:p.sourceProps(),
      pack:live.pack,submittedIds:live.renderedIds,performance:p.performance(),settings:p.settings(),
      rendererEye:r.r3dEyePoint(),pixelMesh:window.__chunkSurferPixelMesh?.lookStatus?.()||null,
      frontEndPlate:r.r3dFrontEndPlate(),liveFrontEndNegative:p.frontEndGrade(),
      playerCell:p.sourceCell(pos.x,pos.y),scene:window.__scenes?.top()?.view?.()||null,
      moduleUrls:window.__arrivalModuleUrls,
      importedRendererMatchesLive:JSON.stringify(r.r3dPropStats())===JSON.stringify(live.pack),
    };
  });
  console.log('EVIDENCE',name,JSON.stringify({position:result.position,look:result.look,portal:result.source.landing?.portal,lighting:result.lighting}));
  return result;
}
async function setTorch(on){
  if(await page.evaluate(()=>!!window.__probe.rec().light)!==on)await press('f');
  await clearSpeech();await sleep(220);
  check(await page.evaluate(()=>!!window.__probe.rec().light)===on,`real F sets torch ${on?'on':'off'}`);
}
// The planner reads the actual physical field. Only real WASD executes its route.
async function planTo(target){
  return page.evaluate(target=>{
    const p=window.__probe,pos=p.pos(),o=p.chunkSurf().landscapeOrigin;
    const start={x:Math.round(pos.x-o.x),y:Math.round(pos.y-o.y)},goal={x:Math.round(target.x-o.x),y:Math.round(target.y-o.y)};
    const key=v=>`${v.x},${v.y}`,queue=[start],seen=new Set([key(start)]),parents=new Map();
    const cell=v=>window.__arrivalLanding.sourceLandingPropCollisionAt(v.x,v.y,{radiusMetres:.30})
      ?null:p.sourceCell(o.x+v.x,o.y+v.y)?.physical;
    for(let index=0;index<queue.length;index++){
      const at=queue[index];
      if(Math.hypot(at.x-goal.x,at.y-goal.y)<1.1){
        const route=[at];let cursor=at;
        while(parents.has(key(cursor))){cursor=parents.get(key(cursor));route.push(cursor);}
        return route.reverse().slice(1).map(v=>({x:o.x+v.x,y:o.y+v.y}));
      }
      const from=cell(at);
      for(const [dx,dy]of [[0,-1],[1,0],[0,1],[-1,0]]){
        const next={x:at.x+dx,y:at.y+dy},k=key(next);
        if(next.x<-10||next.x>10||next.y<-19||next.y>18||seen.has(k))continue;
        const to=cell(next);if(!to||(from&&Math.abs(to.floor-from.floor)>.45))continue;
        seen.add(k);parents.set(k,at);queue.push(next);
      }
    }
    return null;
  },target);
}
async function walkTo(target,tolerance=.75){
  await aim(0,-.06);
  for(let attempt=0;attempt<3;attempt++){
    if(samePosition(await position(),target,tolerance))return;
    const route=await planTo(target);assert.ok(route,`no physical route to ${JSON.stringify(target)}`);
    for(const waypoint of [...route,target]){
      for(let n=0;n<6;n++){
        const before=await position(),dx=waypoint.x-before.x,dy=waypoint.y-before.y;
        if(Math.hypot(dx,dy)<=tolerance)break;
        // A key edge takes one real grid step. Holding for 40ms can already
        // take two at the room's 46ms cadence and oscillate across a waypoint.
        const key=Math.abs(dx)>Math.abs(dy)?dx>0?'d':'a':dy>0?'s':'w';
        await page.keyboard.press(key);await sleep(65);
        if(samePosition(before,await position(),.015))break;
      }
    }
  }
  assert.ok(samePosition(await position(),target,tolerance+.3),`WASD stopped short of ${JSON.stringify(target)} at ${JSON.stringify(await position())}`);
}

try{
  browser=await puppeteer.launch({
    executablePath:process.env.SOURCE_ARRIVAL_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:process.env.SOURCE_ARRIVAL_HEADFUL!=='1',protocolTimeout:120000,
    args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-renderer-backgrounding','--disable-background-timer-throttling'],
  });
  page=await browser.newPage();
  page.on('pageerror',error=>{errors.push(String(error));console.error('PAGEERROR',String(error));});
  page.on('console',message=>{if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|WebGL.*context.*lost/i.test(message.text()))errors.push(message.text());});
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  const url=new URL(base);for(const [key,value]of Object.entries({nodisplaynotice:'1',skipwarn:'1',nomic:'1',sam:'0',nothink:'1'}))url.searchParams.set(key,value);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&['eula','opening-credits','title'].includes(window.__scenes?.top()?.id),{timeout:90000});
  await page.evaluate(async reduced=>{
    await window.__probe.testRun();window.__probe.tutSkip();
    const moduleUrl=path=>performance.getEntriesByType('resource').findLast(entry=>new URL(entry.name).pathname===path)?.name||path;
    window.__arrivalModuleUrls={save:moduleUrl('/src/game/save.js'),renderer:moduleUrl('/src/render/r3d.js'),landing:moduleUrl('/src/data/source-landing.js')};
    window.__arrivalRenderer=await import(window.__arrivalModuleUrls.renderer);
    window.__arrivalLanding=await import(window.__arrivalModuleUrls.landing);
    const save=await import(window.__arrivalModuleUrls.save),desired={shake:reduced?'reduced':'full',flash:reduced?'off':'full',objectiveHints:'full'};
    save.saveCommit({settings:{...window.__probe.settings(),...desired}});
    if(window.__probe.settings().shake!==desired.shake)window.__chunkSurferDesktopMenu?.dispatch({id:'reduce_motion',checked:reduced});
    if(window.__probe.settings().flash!==desired.flash)window.__probe.apparitionEffects(desired.flash);
    if(window.__probe.settings().objectiveHints!==desired.objectiveHints)window.__probe.setObjectiveHints(desired.objectiveHints);
    window.__chunkSurferPixelMesh?.setAccessibility({reduceMotion:reduced,reduceFlash:reduced});
    window.__probe.propDiagnostics(true);window.__probe.sourcePreset('haystack');
  },reduced);
  await clearSpeech();await aim(.17,-.18);await sleep(500);
  const before=await evidence('stillSheet');await shot('01-still-sheet');assert.equal(before.source.phase,'haystack');
  await press('e');assert.equal(await top(),'source-still-page','real E raises the actual still page');
  if(!reduced){await sleep(120);await shot('02-page-raising');}
  await page.waitForFunction(()=>window.__scenes?.top()?.view?.().arrival?.stage==='held',{timeout:15000});
  const raised=await evidence('pageRaised');await shot('02-page-raised');
  check(samePosition(raised.position,before.position),'taking the page preserves body coordinates');
  await press('e');
  if(!reduced)await shot('03-page-lowering');
  await page.waitForFunction(()=>window.__scenes?.top()?.id!=='source-still-page',{timeout:15000});
  await page.waitForFunction(()=>window.__probe.chunkSurf().phase==='landscape',{timeout:30000});await sleep(350);
  const dock=await evidence('dockArrival');await shot('03-dock-arrival',true);
  check(samePosition(dock.position,before.position),'page transition preserves the physical hinge address');
  check(sameLook(dock.look,before.look),'page transition preserves heading and pitch',{before:before.look,after:dock.look});
  check(dock.source.landing.void.sceneDock&&dock.playerCell.physical,'the revealed dock has solid standing ground');
  check(dock.frontEndPlate.amount===0&&dock.frontEndPlate.negative===0&&dock.liveFrontEndNegative===false,'review entry releases the title plate');
  check(dock.importedRendererMatchesLive,'stage diagnostics use the live renderer instance');
  check(dock.source.landing.flashlight.mode==='normal'&&dock.lighting.sourceEmergency===0,'the room uses physical carried light without Source red');
  check(dock.settings.shake===(reduced?'reduced':'full')&&dock.settings.flash===(reduced?'off':'full'),'the live game uses the requested effects settings',dock.settings);
  check(dock.props.some(prop=>prop.id==='source-landing:dock-scene-roof'&&prop.mesh==='scene_dock_roof_structure')&&dock.submittedIds.includes('source-landing:dock-scene-roof'),'the real authored roof reaches the renderer');
  const landmarks=await page.evaluate(()=>{
    const l=window.__arrivalLanding,o=window.__probe.chunkSurf().landscapeOrigin,world=v=>({x:o.x+v.x,y:o.y+v.y});
    return{origin:o,door:world(l.SOURCE_LANDING_PORTAL_LOCAL),rear:world(l.SOURCE_LANDING_REAR_LOCAL),contract:l.sourceLandingContract(),design:l.SOURCE_DOCK_DESIGN,anchors:l.sourceLandingRecognitions(o)};
  });snapshots.landmarks=landmarks;
  check(JSON.stringify(landmarks.contract.bounds)===JSON.stringify({minX:58,maxX:73,minY:4,maxY:14}),'remembered room preserves the authored dimensions');
  check(landmarks.anchors.length===3&&landmarks.anchors.every(anchor=>dock.submittedIds.includes(`source-landing:${anchor.sourcePropId}`)),'all three recognition anchors reach the renderer',landmarks.anchors.map(anchor=>anchor.id));
  const hushAddress=dock.source.landing.tableau.rear;

  await walkTo({x:landmarks.origin.x,y:landmarks.origin.y+5});await aim(0,-.06);
  const sideBefore=await position(),sideLook=await page.evaluate(()=>window.__probe.lookAngles());
  await hold(['d'],280);const sideAfter=await position();
  check(sideAfter.x>sideBefore.x+.15&&Math.abs(sideAfter.y-sideBefore.y)<.15,'held D sidesteps without turning',{before:sideBefore,after:sideAfter});
  check(sameLook(sideLook,await page.evaluate(()=>window.__probe.lookAngles())),'sidestepping preserves head bearing');await hold(['a'],280);
  const diagonalBefore=await position();await hold(['w','d'],280);const diagonalAfter=await position();
  check(diagonalAfter.x>diagonalBefore.x+.1&&diagonalAfter.y<diagonalBefore.y-.1,'held W+D moves diagonally',{before:diagonalBefore,after:diagonalAfter});
  const points=await page.evaluate(o=>{
    const result=[];for(const y of [10,4,-2,-8,-12])for(const x of [-6,0,6]){const cell=window.__probe.sourceCell(o.x+x,o.y+y)?.physical;if(cell&&!window.__arrivalLanding.sourceLandingPropCollisionAt(x,y,{radiusMetres:.30}))result.push({x:o.x+x,y:o.y+y,local:{x,y},cell});}return result;
  },landmarks.origin);
  check(points.length>=10,'conservative furniture collision leaves broad exploration space',{gridTargets:points.length});
  for(const [index,target]of points.entries()){
    await walkTo(target);const pos=await position(),cell=await page.evaluate(p=>window.__probe.sourceCell(p.x,p.y)?.physical,pos);roaming.push({target:target.local,position:pos,cell});
    check(cell?.sourceLanding&&cell.floor===0&&Math.abs(cell.ceil-5.5)<1e-6,`roaming target ${index+1} retains floor and roof`,{target:target.local,cell});
    if([0,Math.floor(points.length/2),points.length-1].includes(index)){await evidence(`roaming${index}`);await shot(`04-roaming-${index}`);}
  }
  const explored=await evidence('roomExplored');
  check(samePosition(explored.source.landing.tableau.rear,hushAddress),'rear HUSH retains its address while exploring');
  check(!explored.source.landing.portal.requested&&!explored.source.landing.portal.sealed,'exploration does not open or commit the exit');
  for(const anchor of landmarks.anchors){
    await walkTo({x:anchor.standX,y:anchor.standY});const at=await position();
    await aim(Math.atan2(anchor.x-at.x,-(anchor.y-at.y)),-.10);await clearSpeech();
    const beforeInspect=await evidence(`recognitionBefore:${anchor.id}`);
    check(beforeInspect.source.focus?.id===anchor.id&&beforeInspect.source.focus?.kind==='source-dock-inspect',`${anchor.id} owns a reachable physical prompt`);
    await press('e');const afterInspect=await evidence(`recognitionAfter:${anchor.id}`);await shot(`04-recognition-${anchor.id.split(':')[1]}`);
    check(samePosition(beforeInspect.position,afterInspect.position)&&afterInspect.source.phase==='landscape'&&!afterInspect.source.landing.portal.requested&&!afterInspect.source.landing.portal.sealed,`${anchor.id} is optional and leaves the room freely walkable`);
    await clearSpeech();
  }
  await walkTo(landmarks.origin);await aim(0,-.06);const torchPosition=await position(),torchLook=await page.evaluate(()=>window.__probe.lookAngles());
  await setTorch(false);await evidence('torchOff');await shot('05-torch-off',true);
  await setTorch(true);await evidence('torchOn');await shot('06-torch-on',true);
  check(samePosition(await position(),torchPosition)&&sameLook(await page.evaluate(()=>window.__probe.lookAngles()),torchLook),'torch captures share the exact viewpoint');

  // Start one real step from the leaf. The body must fit between both jambs,
  // and held W crosses as soon as the centre line has honest clear width.
  await walkTo({x:landmarks.door.x,y:landmarks.door.y+1});await aim(0,0);await clearSpeech();
  const closed=await evidence('doorClosed');await shot('07-door-closed',true);
  check(closed.source.focus?.kind==='source-landing-door','the physical FOH leaf owns the open prompt');
  await page.evaluate(door=>{
    const frames=window.__arrivalDoorFrames={active:true,samples:[],captures:{}};
    function sample(now){
      if(!frames.active)return;
      const source=window.__probe.chunkSurf(),portal=source.landing.portal;
      frames.samples.push({now,position:window.__probe.pos(),portal,void:source.landing.void,doorCell:window.__probe.sourceCell(door.x,door.y)});
      const name=source.landing.void.approach&&portal.phase==='opening'?'crossing':portal.phase==='opening'&&portal.progress>=.35?'opening':portal.phase==='closing'&&portal.progress<=.8?'closing':null;
      if(name&&!frames.captures[name]){
        const data=window.__arrivalRenderer.r3dCaptureStageCanvas('vfd')?.toDataURL('image/png');
        if(data)frames.captures[name]={now,progress:portal.progress,data};
      }
      requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
  },landmarks.door);
  await page.keyboard.down('w');await page.keyboard.press('e');
  let capturedOpening=false,capturedPassable=false,capturedClosing=false,crossed=null;
  try{
    for(let n=0;n<180;n++){
      await sleep(70);const state=await page.evaluate(()=>window.__probe.chunkSurf()),portal=state.landing.portal;
      if(!capturedOpening&&portal.progress>0&&portal.progress<1){await evidence('doorOpening');await shot('08-door-opening');capturedOpening=true;}
      if(!capturedPassable&&portal.passable){await evidence('rapidCrossing');await shot('09-rapid-crossing');capturedPassable=true;}
      const at=await position(),clear=Math.hypot((at.x-landmarks.door.x)*.5-.5,(at.y-landmarks.door.y)*.5)>1.3;
      if(state.landing.void.approach&&portal.sealed&&clear){crossed=state;break;}
    }
  }finally{await page.keyboard.up('w');}
  assert.ok(crossed,'real held W must cross and commit departure');
  const outside=await evidence('outside');await shot('10-outside-threshold');
  check(outside.source.landing.void.approach&&outside.source.landing.void.whiteout>.5,'white exposure takes ownership after body crossing');
  await aim(Math.PI,0);
  for(let n=0;n<80;n++){
    const state=await page.evaluate(()=>window.__probe.chunkSurf()),portal=state.landing.portal;
    if(!capturedClosing&&portal.closing&&portal.progress>0&&portal.progress<1){await evidence('doorClosing');await shot('11-door-closing-lookback',true);capturedClosing=true;}
    if(portal.sealed&&portal.progress<=1e-6)break;await sleep(70);
  }
  const sealed=await evidence('doorSealed');await shot('12-door-sealed-lookback',true);
  const recordedDoor=await page.evaluate(()=>{window.__arrivalDoorFrames.active=false;return window.__arrivalDoorFrames;});doorSamples=recordedDoor.samples;
  for(const [phase,capture]of Object.entries(recordedDoor.captures)){
    await writeFile(join(out,`door-${phase}-sample-vfd.png`),Buffer.from(capture.data.split(',')[1],'base64'));
    snapshots[`doorSample:${phase}`]={now:capture.now,progress:capture.progress};
  }
  check(capturedOpening&&(capturedPassable||recordedDoor.captures.crossing)&&(capturedClosing||recordedDoor.captures.closing),'opening, rapid crossing and closing each receive a live capture');
  check(doorSamples.some(sample=>sample.void.approach&&sample.portal.phase==='opening'&&sample.portal.progress<1),'real held W crosses while the opening swing is still moving');
  check(sealed.source.landing.portal.sealed&&sealed.source.landing.portal.progress===0,'the leaf completes its closing swing and seals');
  check(doorSamples.every(sample=>!!sample.doorCell.render),'the rendered aperture remains present through all door phases');
  const jumps=doorSamples.slice(1).filter((sample,index)=>Math.abs(sample.portal.progress-doorSamples[index].portal.progress)>3.5*(sample.now-doorSamples[index].now)/1000+.04);
  check(jumps.length===0,'rapid crossing never snaps the leaf pose',{jumps});
  check(errors.length===0,'arrival, roaming, torch and door produce no JavaScript or shader errors',errors);
  assert.deepEqual(failures,[],'Remembered Room live acceptance');
}catch(error){failure=String(error?.stack||error);process.exitCode=1;console.error(failure);if(page)try{await evidence('failure');await shot('failure',true);}catch(captureError){console.error('FAILURE CAPTURE',String(captureError));}}
finally{
  if(page)for(const key of ['w','a','s','d'])await page.keyboard.up(key).catch(()=>{});
  await writeFile(join(out,'report.json'),JSON.stringify({base,reduced,checks,failures,errors,failure,roaming,doorSamples,snapshots},null,2));
  await browser?.close();
}
