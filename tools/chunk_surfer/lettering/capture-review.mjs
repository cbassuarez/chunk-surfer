// Native P3/final captures of every production face; no fake reading responses.
import puppeteer from 'puppeteer-core';import fs from 'node:fs';import {createHash} from 'node:crypto';
const corrections=process.env.CHUNK_SURFER_LETTERING_CORRECTIONS==='1',out='artifacts/lettering-production/evidence'+(corrections?'/fixture-corrections':'');fs.mkdirSync(out,{recursive:true});
const prior=corrections?JSON.parse(fs.readFileSync('artifacts/lettering-production/evidence/capture-index.json')):null;
const sources=['src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js','src/render/printed-surface.js',
 'src/render/source-text-atlas.js','src/render/world-lettering-fonts.js','content/chunk-surf/source-atlas.json',
 'src/generated/paper-catalog.js','src/data/paper-pigment.js','assets/paper/world-pigment.png',
 ...['NimbusMonoPS-Bold.otf','NimbusMonoPS-Regular.otf','NimbusRoman-Regular.otf','NimbusSans-Bold.otf','NimbusSans-Regular.otf'].map(file=>'public/assets/fonts/'+file),
 'artifacts/lettering-production/review.js','artifacts/lettering-production/review.html','public/assets/conservatory-props.glb',
 'public/assets/conservatory-props.lettering.json','public/assets/lettering/previous.glb','public/assets/lettering/previous-manifest.json'];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={version:1,date:new Date().toISOString(),sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),frames:[],errors:[],warnings:[],humanReading:'Not performed; images, rendering state and nonblack pixels are not comprehension evidence.',fixtures:'Every mesh/face fixture retains local built geometry; camera, translation and ambient are inspection conditions.'};
if(corrections)Object.assign(report,{corrects:'Sub-0.35m inspection camera placed the actual held torch beyond these tiny surfaces; repeat at a physically valid 0.35m. Geometry, materials and game lighting are unchanged.',priorCaptureIndexSha256:hash('artifacts/lettering-production/evidence/capture-index.json')});
const save=()=>fs.writeFileSync(`${out}/capture-index.json`,JSON.stringify(report,null,2)+'\n');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1560,height:1100,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(['warn','error'].includes(m.type()))report.warnings.push({type:m.type(),text:m.text()});});
 await page.evaluateOnNewDocument(()=>{window.WebSocket=class extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}};});
 await page.goto(`${process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334'}/artifacts/lettering-production/review.html`,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.letteringProduction?.ready||window.letteringProduction?.failure,{timeout:120000});
 const failure=await page.evaluate(()=>window.letteringProduction?.failure);if(failure)throw Error(failure);
 await page.waitForNetworkIdle({idleTime:700,timeout:45000});
 let cases=await page.evaluate(()=>{const S=window.letteringProduction;return[{kind:'encounter',id:'dock',distance:3},{kind:'encounter',id:'vigil',distance:3},...S.meshes.flatMap(mesh=>S.entriesFor(mesh).map(e=>({kind:'fixture',id:e.mesh,faceId:e.id,distance:e.paperIndex!==undefined?.38:e.widthM<.2?.35:e.widthM<.6?.65:e.widthM<1?1.5:3})))];});
 if(corrections){const ids=new Set(prior.frames.filter(f=>f.kind==='fixture'&&(f.distance<.35||f.id==='loose_note_page6')).map(f=>f.faceId));cases=cases.filter(c=>ids.has(c.faceId));}
 const smoke=process.env.CHUNK_SURFER_LETTERING_SMOKE==='1';
 for(const c of smoke?cases.slice(0,1):cases){
  await page.evaluate(async c=>{const S=window.letteringProduction;S.stop();await S.configure({...c,width:960,height:600,scale:1});S.R.r3dSetPixelMesh({reduceMotion:true,reduceFlash:true,memory:false,debugSource:'final'});},c);
  const noBaseline=await page.evaluate(c=>window.letteringProduction.previous.newOnly.some(p=>p.production===c.id&&p.baselineUnavailable),c);
  for(const [asset,mode]of [[noBaseline?'production':'previous',0],['production',3]]){
   const result=await page.evaluate(({c,asset,mode})=>{const S=window.letteringProduction;let s;for(let i=0;i<4;i++)s=S.render({asset,mode,light:'torch',distance:c.distance,stage:'final'});const data=s.frame.getContext('2d').getImageData(0,0,s.frame.width,s.frame.height).data;let nonblack=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>12)nonblack++;return{url:s.frame.toDataURL('image/png'),evidence:s.evidence,nonblackPixels:nonblack};},{c,asset,mode});
   const name=(c.faceId||c.id).replaceAll(':','-'),file=`${c.kind}-${name}-${asset}${noBaseline&&mode===0?'-mode0':''}-final.png`;fs.writeFileSync(`${out}/${file}`,Buffer.from(result.url.split(',')[1],'base64'));delete result.url;
   report.frames.push({file,...c,asset,mode,...result});save();if(result.evidence.glError!==0)throw Error('GL error '+file);if(result.nonblackPixels<20)throw Error('Empty output '+file);
  }
  const raw=await page.evaluate(c=>{const S=window.letteringProduction,v=S.render({asset:'production',mode:3,light:'torch',distance:c.distance,stage:'props'});return{url:v.frame.toDataURL('image/png'),evidence:v.evidence};},c),rawName=`${c.kind}-${(c.faceId||c.id).replaceAll(':','-')}-production-props.png`;fs.writeFileSync(`${out}/${rawName}`,Buffer.from(raw.url.split(',')[1],'base64'));delete raw.url;report.frames.push({file:rawName,...c,...raw});save();
 }
 await page.evaluate(async()=>{const S=window.letteringProduction;await S.configure({kind:'encounter',id:'dock',width:960,height:600,scale:1});await S.compare({distance:3});});
 await page.screenshot({path:`${out}/review-overview.png`,fullPage:false});
 report.defaultModeRestored=await page.evaluate(()=>window.letteringProduction.R.r3dPixelMeshStatus().shaderReady);
 report.sourceHashesAfter=Object.fromEntries(sources.map(p=>[p,hash(p)]));report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();
 if(!report.sourcesUnchanged)throw Error('Renderer or review changed during capture');if(report.errors.length)throw Error('Page errors: '+report.errors.join('; '));
 console.log(JSON.stringify({frames:report.frames.length,sourceHashesUnchanged:report.sourcesUnchanged,errors:report.errors,warnings:report.warnings}));
}catch(error){report.failure=error.message;save();throw error;}finally{let timer;try{await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(()=>{browser.process()?.kill('SIGTERM');r();},10000);})]);}finally{clearTimeout(timer);}}
