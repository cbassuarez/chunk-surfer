// Production-renderer study. Current now means the implemented Quiet carrier.
// Run from the repo root: node tools/chunk_surfer/title-header-study.mjs
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const root=process.cwd(), live=process.argv.includes('--live'), qa=process.argv.includes('--qa'), out=`${root}/artifacts/title-header-study${live?'/live':''}`;
await mkdir(out,{recursive:true});
const originalTitle=await readFile(`${root}/src/game/title.js`,'utf8');
const begin=originalTitle.indexOf("      drawTitleHeaderDirection('quiet-carrier',"), end=originalTitle.indexOf('      const menuY = body.y + 12;',begin);
if(begin<0||end<0)throw Error('Title source changed: review the study insertion point.');
const originalBlock=originalTitle.slice(begin,end);
const reviewBlock=`
      const study=window.__titleHeaderReview;
      if(study?.program){programRms=study.program.rms;programPeak=study.program.peak;programClipped=study.program.clipped;}
      if(study?.direction&&study.direction!=='current'){
        study.layout=drawStudyHeaderDirection(study.direction,{body,item:items[sel],signal:{...monitorSnapshotForRms(programRms,{peak:programPeak,clipped:programClipped}),sourceId:'title-header-study-program'}});
      }else{
${originalBlock}
      }
      if(study)study.frame={body:{...body},x,y,w,h,cols,rows};
`;
const transformed=originalTitle.slice(0,begin)+reviewBlock+originalTitle.slice(end);
const server=await createServer({root,server:{host:'127.0.0.1',port:5489,strictPort:false,hmr:false,watch:null},logLevel:'error',
 plugins:[{name:'title-header-study',enforce:'pre',configureServer(vite){vite.middlewares.use('/__title-header-study',(_req,res)=>{
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#020807}#map{position:relative;width:1280px;height:800px}</style></head><body><div id="map"></div></body></html>`);
 })},transform(code,id){
  if(id.split('?')[0]!==`${root}/src/game/title.js`)return;
  return {code:`import {drawTitleHeaderDirection as drawStudyHeaderDirection} from '/src/render/title-header-directions.js';\n`+transformed
   .replace('      withMachinePanel(x, y, w, h, {','      if(window.__titleHeaderReview?.program){programRms=window.__titleHeaderReview.program.rms;programPeak=window.__titleHeaderReview.program.peak;programClipped=window.__titleHeaderReview.program.clipped;}\n      withMachinePanel(x, y, w, h, {')
   .replace("        label: 'CASE SELECT',","        glass: window.__titleHeaderReview?.bare ? false : {},\n        label: 'CASE SELECT',")
   .replace('if(weather)renderBootWeather(weather,{alpha:weather.presentationAlpha});','if(weather&&!window.__titleHeaderReview)renderBootWeather(weather,{alpha:weather.presentationAlpha});'),map:null};
 }}]});
await server.listen();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,protocolTimeout:120000,
 args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--mute-audio']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(document,'hasFocus',{value:()=>true});
  const request=window.requestAnimationFrame.bind(window);window.__reviewRaf={hold:false};
  window.requestAnimationFrame=callback=>request(time=>{if(!window.__reviewRaf.hold)callback(time);});
 });
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${live?'?nodisplaynotice=1&skipwarn=1&nomic=1&skiptut=1&sam=0&weather=rain':'__title-header-study'}`,{waitUntil:'domcontentloaded',timeout:60000});
 if(live){
  await page.waitForFunction(()=>window.__probe&&window.__scenes?.top?.(),{timeout:90000});
  await page.evaluate(()=>{if(window.__scenes.top().id==='opening-credits')window.__scenes.top().update(60);});
  await page.waitForFunction(()=>window.__chunkStartup?.status()==='ready',{timeout:180000});
 }
 const setup=await page.evaluate(async(live)=>{
  const UI=await import('/src/render/ui.js'),TITLE=await import('/src/game/title.js'),SAVE=await import('/src/game/save.js'),MON=await import('/src/audio/monitor.js'),ATLAS=await import('/src/render/atlas.js'),TRACE=await import('/src/audio/dual-trace.js');
  window.__reviewRaf.hold=true;
  if(!live)UI.uiInit(document.getElementById('map'));await document.fonts.ready;
  // Exact observation from the actual game's post-output monitor during this
  // review, before isolating its title scene from asynchronous world loading.
  const samples=[];if(live)for(let i=0;i<12;i++){samples.push(MON.monitorProgramMeasurement());await new Promise(r=>setTimeout(r,40));}
  const program=live?samples.filter(s=>s.active).sort((a,b)=>b.rms-a.rms)[0]:{active:true,rms:0.0014049424671828262,peak:0.004882956854999065,clipped:false};
  if(!program)throw Error('Missing measured program signal.');
  if(!live)samples.push(program);
  window.__titleHeaderReview={direction:'current',program,envelope:program.rms,bare:false};
  window.__headerStudyApi={UI,TITLE,SAVE,MON,ATLAS,TRACE};
  // Hold the actual multiplex/optical clock, never the measured signal value.
  Object.defineProperty(performance,'now',{value:()=>12000,configurable:true});
  if(live)document.getElementById('startupRecovery').hidden=true;
  return {program,samples,boot:window.__chunkStartup?.diagnostics?.(),provenance:'Actual game monitorProgramMeasurement, 1280×800, 2026-11-16. Review uses a frozen observed sample; no audio synthesis.'};
 },live);
 await writeFile(`${out}/signal.json`,JSON.stringify(setup,null,2));
 const render=async(direction,profile='empty',scale=1,bare=false)=>page.evaluate(async({direction,profile,scale,bare})=>{
  const {UI,TITLE,SAVE,ATLAS,TRACE}=window.__headerStudyApi,meta=SAVE.getMeta(),save=SAVE.getSave();
  Object.assign(meta,{endingsSeen:profile==='filed'?['fixture-a','fixture-b','fixture-c']:[],leftMidRun:profile==='saved',runs:profile==='empty'?0:3,knowledge:{documents:profile==='filed'?Object.fromEntries(Array.from({length:12},(_,i)=>[`fixture-${i}`,true])):{}}});
  save.run=profile==='saved'?{id:'header-study',status:'active'}:null;
  Object.assign(window.__titleHeaderReview,{direction,bare});
  UI.uiSetScale(scale);UI.uiClear();TRACE.resetDualTraceMeters();
  const scene=TITLE.makeTitleScene({presentationState:()=>({menuAlpha:1})});scene.update(2);scene.render();
  const canvas=[...document.querySelectorAll('#map>canvas')].find(c=>c.style.zIndex==='8');
  const {frame,layout}=window.__titleHeaderReview,m=UI.uiCellMetrics(),dpr=ATLAS.atlasDpr();
  return{frame,layout,metrics:{...m,dpr},canvas:{w:canvas.width,h:canvas.height},png:canvas.toDataURL().split(',')[1],rect:canvas.getBoundingClientRect().toJSON()};
 },{direction,profile,scale,bare});
 const report={disclosure:'Actual title scene with a review-only renderer substitution confined to its header callback; production glyph ROM, atlas, well, glass and lower menu. Frozen measured program signal and multiplex clock. Current is the implemented Quiet carrier.',errors,checks:[],sourceHashes:{}};
 for(const file of ['src/game/title.js','src/render/title-header-directions.js','src/render/vfd-font.js','src/render/atlas.js','src/render/presentation.js'])report.sourceHashes[file]=createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex');
 for(const profile of ['empty','saved','filed'])for(const direction of ['current','wideband','split-register','quiet-carrier']){
  const result=await render(direction,profile),buf=Buffer.from(result.png,'base64');
  const {frame:f,metrics:m}=result;
  const crop={left:Math.floor(f.x*m.cellW-10),top:Math.floor(f.y*m.cellH-6),width:Math.ceil(f.w*m.cellW+20),height:Math.ceil((f.body.y+11.9-f.y)*m.cellH+6)};
  await writeFile(`${out}/${direction}-${profile}-raw.png`,buf);
  await sharp(buf).extract(crop).png().toFile(`${out}/${direction}-${profile}-header.png`);
  await sharp(buf).extract({left:crop.left,top:crop.top,width:crop.width,height:Math.ceil(f.h*m.cellH+12)}).png().toFile(`${out}/${direction}-${profile}-panel.png`);
  if(profile==='empty'){
   await page.screenshot({path:`${out}/${direction}-composite.png`});
   const bare=await render(direction,profile,1,true);await writeFile(`${out}/${direction}-before-glass.png`,Buffer.from(bare.png,'base64'));
  }
  report.checks.push({direction,profile,frame:f,layout:result.layout,metrics:m,crop});
 }
 if(qa){
  const {DISPLAY_CONTRACT}=await import('../../src/platform/display-policy.js');
  report.viewportChecks=[];
  for(const dpr of [1,2])for(const preset of DISPLAY_CONTRACT.windowPresets){
   await page.setViewport({width:preset.width,height:preset.height,deviceScaleFactor:dpr});
   await page.evaluate(async({width,height})=>{
    const {computeStageLayout}=await import('/src/platform/display-policy.js'),stage=computeStageLayout(width,height),el=document.getElementById('map');
    Object.assign(el.style,{position:'absolute',width:`${stage.stageWidth}px`,height:`${stage.stageHeight}px`,left:`${stage.left}px`,top:`${stage.top}px`,transform:`scale(${stage.scale})`,transformOrigin:'top left'});
   },preset);
   for(const scale of DISPLAY_CONTRACT.uiScalePresets)for(const direction of ['wideband','split-register','quiet-carrier']){
    const result=await render(direction,'saved',scale.value);
    if(result.metrics.dpr!==dpr)throw Error('Wrong DPR');
    const {layout,frame:f,metrics:m}=result;
    for(const op of layout){if(op.x<f.body.x||op.x+op.w>f.body.x+f.body.w||op.y+op.h>f.body.y+11.3)throw Error(`Clipping ${preset.id} ${scale.id} ${direction}`);}
    // Check emitted pixels outside the header budget by rendering every
    // direction against the same baseline UI; the lower menu must be identical.
    const reference=await render('current','saved',scale.value);
    const a=await sharp(Buffer.from(result.png,'base64')).raw().toBuffer({resolveWithObject:true}),b=await sharp(Buffer.from(reference.png,'base64')).raw().toBuffer();
    const firstRow=Math.ceil((f.body.y+12)*m.cellH*dpr),lastRow=Math.floor((f.y+f.h-3)*m.cellH*dpr);
    let changedLower=0,maxLowerDelta=0,alphaDelta=0;
    for(let y=firstRow;y<lastRow;y++)for(let x=0;x<a.info.width;x++){
     const at=(y*a.info.width+x)*4;
     const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(a.data[at+c]-b[at+c])));
     if(delta)changedLower++;
     maxLowerDelta=Math.max(maxLowerDelta,delta);alphaDelta=Math.max(alphaDelta,Math.abs(a.data[at+3]-b[at+3]));
    }
    // Production glow scratch surfaces can differ by one or two RGB bytes
    // when their backing size grows (also documented by verify-vfd-glow).
    if(maxLowerDelta>2||alphaDelta)throw Error(`Lower-menu change ${preset.id} UI ${scale.id} DPR ${dpr} ${direction}: ${changedLower} pixels, max ${maxLowerDelta}, alpha ${alphaDelta}`);
    report.viewportChecks.push({viewport:preset.id,uiScale:scale.value,dpr,direction,canvas:result.canvas,changedLower,maxLowerDelta,alphaDelta});
    if(['960x600','1280x800','1920x1080'].includes(preset.id)&&[.8,1,1.5].includes(scale.value)&&dpr===1){
     await render(direction,'saved',scale.value);
     await page.screenshot({path:`${out}/qa-${direction}-${preset.id}-ui${scale.id}.png`});
    }
   }
  }
 }
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({out,program:setup.program,errors,captures:report.checks.length,boot:setup.boot?.phase,viewportChecks:report.viewportChecks?.length}));
}finally{await browser.close();await server.close();}
