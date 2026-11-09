// Final opening-only subtraction: one frozen native camera/clock, moon on/off,
// then the real chosen act with ordinary accelerated dialogue and no pose.
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const eyeInkStudy=process.env.OPHANIM_EYE_INK==='1';
const settledOnly=process.env.OPHANIM_SETTLED_ONLY==='1';
const out=resolve(process.env.OPHANIM_OUT||'artifacts/opening-ophanim-audit/final-staging'),wait=ms=>new Promise(done=>setTimeout(done,ms));
const sources=['src/data/opening-prologue.js','src/game/opening-prologue-scene.js','src/render/opening-omen.js','src/render/source-rest-horizon-pass.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
await mkdir(out,{recursive:true});const report={method:eyeInkStudy?'One explicit prologue QA entry, then ordinary accelerated keyboard dialogue chooses gaze and reaches the production acknowledgment. The following pair freezes that actual camera/clock and changes only the opening eye ink from prismatic to neutral; ray-winning material identities locate the retained eye after lensing. Not a new full New Run or unfamiliar-human acceptance.':'One explicit prologue QA entry. First two comparisons freeze the actual interval camera/clock and vary only moon presence or eye uniform in one native renderer/context. Then pose is cleared and ordinary accelerated keyboard dialogue chooses gaze; all subsequent camera and eye changes use production behavior. Not a new full New Run or unfamiliar-human acceptance.',captures:[],checks:[],errors:[],sourceStart:await hashes()};
if(settledOnly)report.method='One explicit prologue QA entry, ordinary accelerated dialogue selects gaze, then input stops on the actual kept acknowledgment node. Real time advances until the production camera/radius and exactly one closed eye settle. Only then does a pause freeze the unchanged frame for atomic raw/VFD/material capture. No stage seek, art override or phase change.';
let server,browser,page,profile;
const view=()=>page.evaluate(()=>window.__probe.sixLoop.prologue.view());
async function question(id){
  for(let n=0;n<100;n++){const value=await view();if(value?.pending){if(value.nodeId!==id)throw Error(`Expected ${id}, received ${value.nodeId}`);return value;}await page.keyboard.press('Enter');await wait(180);}
  throw Error('Question unreachable: '+id);
}
async function choose(id){const v=await view(),options=v.pending.options,at=options.findIndex(row=>row.goto===id);if(at<0)throw Error('No answer '+id);for(let n=0;n<(at-(v.pending.index||0)+options.length)%options.length;n++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await wait(200);}
async function capture(name){
  const file=join(out,`${name}.png`);await page.screenshot({path:file});
  const snapshot=await page.evaluate(()=>({view:window.__probe.sixLoop.prologue.view(),horizon:window.__probe.sixLoop.prologue.state().horizon,
    glError:document.querySelector('canvas.r3d').getContext('webgl2').getError(),images:Object.fromEntries(['scene','vfd','marks','mark-alpha'].map(layer=>[layer,window.__probe.sourceShoreCapture(layer)]))}));
  const files={};for(const[layer,data]of Object.entries(snapshot.images)){const file=join(out,`${name}-${layer}.png`);await writeFile(file,Buffer.from(data.slice(data.indexOf(';base64,')+8),'base64'));files[layer]=file;}delete snapshot.images;
  report.captures.push({name,file,files,...snapshot});
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log('CAPTURE',name,JSON.stringify({node:snapshot.view.nodeId,stage:snapshot.view.stageId,shut:snapshot.view.stage.shut,act:snapshot.view.openingAct,gl:snapshot.glError}));
}
async function inspectEyeVisibility(){
  report.eyeVisibility=await page.evaluate(async()=>{
    const R3=await import('/src/render/r3d.js');
    const marks=R3.r3dCaptureStageCanvas('marks'),tag=R3.r3dCaptureStageCanvas('mark-alpha');
    const a=marks.getContext('2d').getImageData(0,0,marks.width,marks.height).data,b=tag.getContext('2d').getImageData(0,0,tag.width,tag.height).data;
    const eyes=new Map();for(let y=0;y<marks.height;y++)for(let x=0;x<marks.width;x++){
      const at=(y*marks.width+x)*4;if(b[at]!==171||a[at]===0)continue;
      const id=Math.round(a[at]*32/255)-1;if(id<0||id>23)continue;
      const e=eyes.get(id)||{id,pixels:0,minX:x,maxX:x,minY:y,maxY:y};e.pixels++;e.minX=Math.min(e.minX,x);e.maxX=Math.max(e.maxX,x);e.minY=Math.min(e.minY,y);e.maxY=Math.max(e.maxY,y);eyes.set(id,e);
    }
    const rect=document.querySelector('canvas.r3d').getBoundingClientRect();
    return{width:marks.width,height:marks.height,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},eyes:[...eyes.values()].sort((a,b)=>a.id-b.id)};
  });
  const closed=report.eyeVisibility.eyes.find(eye=>eye.id===0);
  report.checks.push({name:'retained eye0 actually wins visible ray fragments after lensing',pass:!!closed,detail:closed||null});
  if(closed){
    const {width,height,rect}=report.eyeVisibility,sx=rect.width/width,sy=rect.height/height;
    const x=Math.max(0,rect.x+closed.minX*sx-36),y=Math.max(0,rect.y+closed.minY*sy-36);
    const w=Math.min(1280-x,(closed.maxX-closed.minX+1)*sx+72),h=Math.min(800-y,(closed.maxY-closed.minY+1)*sy+72);
    report.eyeVisibility.closedEyeCrop=join(out,'04-native-retained-eye-detail.png');await page.screenshot({path:report.eyeVisibility.closedEyeCrop,clip:{x,y,width:w,height:h}});
  }
}
try{
  server=await createServer({configFile:'vite.config.js',server:{host:'127.0.0.1',port:5421,strictPort:true,hmr:false,watch:null}});await server.listen();
  profile=await mkdtemp(join(tmpdir(),'chunk-ophanim-final-'));browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,pipe:true,defaultViewport:null,protocolTimeout:300000,args:['--no-sandbox','--window-size=1280,800','--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
  page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));page.on('pageerror',error=>report.errors.push(String(error.stack||error)));
  await page.goto('http://127.0.0.1:5421/?nodisplaynotice=1&skipwarn=1&nomic=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes.top()?.id,{timeout:300000,polling:1000});await page.keyboard.press('Enter');
  await page.evaluate(async()=>{await window.__probe.testRun();window.__probe.tutSkip();window.__probe.sixLoop.prologue.begin();});
  await page.waitForFunction(()=>window.__probe.sixLoop.prologue.view()?.phase==='film',{timeout:300000,polling:300});
  await question('there');await choose('quiet');await question('look');
  if(settledOnly){
    await choose('interval-eyes');await question('interval-eyes');await choose('interval-meet');
    for(let n=0;n<100&&(await view())?.nodeId!=='kept';n++){await page.keyboard.press('Enter');await wait(180);}
    const holdStarted=Date.now();
    await page.waitForFunction(()=>{const v=window.__probe.sixLoop.prologue.view();return v?.nodeId==='kept'&&v.stageId==='kept'&&Math.abs(v.stage.shut-1)<1e-6&&Math.abs(v.stage.radius-1.2)<1e-6;},{timeout:30000,polling:150});
    report.realSettlingHoldMs=Date.now()-holdStarted;
    const settled=await view();report.checks.push({name:'the actual kept acknowledgment settles to exactly one closed eye',pass:settled.nodeId==='kept'&&settled.stageId==='kept'&&settled.stage.shut===1,detail:{node:settled.nodeId,stage:settled.stageId,shut:settled.stage.shut,radius:settled.stage.radius}});
    await page.evaluate(()=>window.__scenes.top().pause());await wait(400);await capture('01-ordinary-settled-acknowledgment');
    await inspectEyeVisibility();await page.evaluate(()=>window.__scenes.top().resume());
  }else if(eyeInkStudy){
    await choose('interval-eyes');await question('interval-eyes');await wait(5500);
    await choose('interval-meet');await question('job');await wait(4500);
    await capture('01-ordinary-acknowledgment-neutral-eyes');
    await page.evaluate(()=>{const scene=window.__scenes.top();scene.pause();scene.pose({...scene.view().stage,eyePresentation:[1,.96]});});await wait(1000);
    await capture('02-same-camera-prismatic-eye-ink');
    await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose({...scene.view().stage,eyePresentation:[2,.96]});});await wait(1000);
    await capture('03-same-camera-neutral-eye-ink');
    report.eyeVisibility=await page.evaluate(async()=>{
      const R3=await import('/src/render/r3d.js');
      const marks=R3.r3dCaptureStageCanvas('marks'),tag=R3.r3dCaptureStageCanvas('mark-alpha');
      const a=marks.getContext('2d').getImageData(0,0,marks.width,marks.height).data,b=tag.getContext('2d').getImageData(0,0,tag.width,tag.height).data;
      const eyes=new Map();for(let y=0;y<marks.height;y++)for(let x=0;x<marks.width;x++){
        const at=(y*marks.width+x)*4;if(b[at]!==171||a[at]===0)continue;
        const id=Math.round(a[at]*32/255)-1;if(id<0||id>23)continue;
        const e=eyes.get(id)||{id,pixels:0,minX:x,maxX:x,minY:y,maxY:y};e.pixels++;e.minX=Math.min(e.minX,x);e.maxX=Math.max(e.maxX,x);e.minY=Math.min(e.minY,y);e.maxY=Math.max(e.maxY,y);eyes.set(id,e);
      }
      const rect=document.querySelector('canvas.r3d').getBoundingClientRect();
      return{width:marks.width,height:marks.height,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},eyes:[...eyes.values()].sort((a,b)=>a.id-b.id)};
    });
    const closed=report.eyeVisibility.eyes.find(eye=>eye.id===0);
    report.checks.push({name:'retained eye0 actually wins visible ray fragments after lensing',pass:!!closed,detail:closed||null});
    if(closed){
      const {width,height,rect}=report.eyeVisibility,sx=rect.width/width,sy=rect.height/height;
      const x=Math.max(0,rect.x+closed.minX*sx-36),y=Math.max(0,rect.y+closed.minY*sy-36);
      const w=Math.min(1280-x,(closed.maxX-closed.minX+1)*sx+72),h=Math.min(800-y,(closed.maxY-closed.minY+1)*sy+72);
      report.eyeVisibility.closedEyeCrop=join(out,'04-native-retained-eye-detail.png');await page.screenshot({path:report.eyeVisibility.closedEyeCrop,clip:{x,y,width:w,height:h}});
    }
    await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose(null);scene.resume();});
  }else{
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.seekStage('interval');scene.pause();const pose=scene.view().stage;scene.pose({...pose,moon:1,eyePresentation:[1,.96]});});await wait(700);
  await capture('01-same-camera-moon-on-rejected');
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose({...scene.view().stage,moon:0,eyePresentation:[1,.96]});});await wait(700);
  await capture('02-same-camera-moon-off');
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose({...scene.view().stage,moon:0,eyePresentation:[0,0]});});await wait(700);
  await capture('03-same-camera-previous-knots');
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose({...scene.view().stage,moon:0,eyePresentation:[1,.96]});});await wait(700);
  await capture('04-same-camera-watching-apertures');
  await page.evaluate(()=>{const scene=window.__scenes.top();scene.pose(null);scene.resume();});
  await choose('interval-eyes');await question('interval-eyes');await wait(5500);await capture('05-real-one-eye-remains');
  await choose('interval-meet');await question('job');await wait(7000);await capture('06-real-chosen-gaze-retained');
  }
  const value=await view();report.checks.push({name:'ordinary chosen gaze retains one closed eye in the final no-moon product',pass:value.openingAct?.id==='gaze'&&value.stage.shut>=1&&value.stage.moon===0});
  await page.keyboard.down('e');await wait(1350);await page.keyboard.up('e');await wait(300);
  report.checks.push({name:'the ordinary held skip releases the final staging',pass:await page.evaluate(()=>window.__scenes.top()?.id!=='opening-prologue')});
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;console.error(report.failure);}
finally{report.sourceEnd=await hashes();report.sourcesStable=JSON.stringify(report.sourceStart)===JSON.stringify(report.sourceEnd);await browser?.close().catch(()=>{});await server?.close().catch(()=>{});if(profile)await rm(profile,{recursive:true,force:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log('CLOSED',JSON.stringify({checks:report.checks,errors:report.errors,failure:report.failure||null}));}
