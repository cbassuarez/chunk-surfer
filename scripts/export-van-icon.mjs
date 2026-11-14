// Export the approved isolated Transit study; this never loads a game shell.
import {mkdir, mkdtemp, readFile, readdir, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {VAN_ICON_LAUNCH} from '../tools/app-icon/motion.mjs';
import {STARTUP_VAN_LAYOUT,STARTUP_VAN_BUDGET} from '../tools/app-icon/startup-layout.mjs';
import {VAN_ICON_ACQUISITION_PROVENANCE,VAN_ICON_ACQUISITION_PROFILE} from '../tools/app-icon/acquisition.mjs';
import {encodeStartupVanVideo} from './build-startup-van-assets.mjs';
import sharp from 'sharp';

const root=resolve(import.meta.dirname,'..');
const out=join(root,'assets/brand');
const profile=await mkdtemp(join(tmpdir(),'chunk-van-icon-export-'));
const startupOnly=process.argv.includes('--startup');
const {frameCount,cell,columns,rows,durationSeconds:duration}=startupOnly?STARTUP_VAN_LAYOUT:VAN_ICON_LAUNCH;
const hash=b=>createHash('sha256').update(b).digest('hex');
const studyOnly=process.argv.includes('--study');
const sizes=new Set(startupOnly?[128]:[16,24,32,48,64,128,256,512,1024]);
if(!startupOnly)for(const file of await readdir(join(root,'src-tauri/icons'))){if(!file.endsWith('.png'))continue;
  const info=await sharp(join(root,'src-tauri/icons',file)).metadata();if(info.width===info.height)sizes.add(info.width);}
const rasterSizes=[...sizes].sort((a,b)=>a-b);
async function renderInputs({startup=false}={}){
  const result={},files=['tools/app-icon/renderer.mjs','tools/app-icon/motion.mjs','tools/app-icon/weather.mjs','tools/app-icon/acquisition.mjs','tools/app-icon/transit.glb','tools/app-icon/transit-source.json',
    'src/render/pixel-mesh/transparent.js','src/render/pixel-mesh/shader.js','src/render/pixel-mesh/final-look.js','src/render/pixel-mesh/screens.js','src/render/look-profiles.js','src/render/world-light-treatment.js','public/assets/blue-noise-64.png'];
  if(startup)files.push('tools/app-icon/startup-layout.mjs');
  for(const file of files)result[file]=hash(await readFile(join(root,file)));return result;
}
let browser,server;
try{
  if(startupOnly&&studyOnly)throw Error('Choose --startup or --study; a startup export must render its own full small atlas.');
  // A fresh server avoids an unrelated long-lived Vite graph serving cached
  // module text after watcher exclusions. It serves only the isolated page we
  // request and is closed along with Chrome.
  let studyURL=process.env.VAN_ICON_STUDY_URL;
  if(!studyURL){server=await createServer({root,configFile:false,cacheDir:join(profile,'vite-cache'),logLevel:'error',optimizeDeps:{entries:['tools/app-icon/index.html']},server:{host:'127.0.0.1',port:0}});await server.listen();studyURL=`http://127.0.0.1:${server.httpServer.address().port}/tools/app-icon/`;}
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,
    args:['--mute-audio','--use-angle=metal','--no-first-run','--no-default-browser-check'],protocolTimeout:120000});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));page.on('console',message=>{if(message.type()==='error'&&!/favicon/.test(message.location().url||''))errors.push(message.text());});
  await page.goto(studyURL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__vanIconStudy?.ready,{timeout:60000});
  const result=await page.evaluate(({frameCount,cell,columns,rows,duration,launch,rasterSizes,studyOnly,startupOnly,shaderFingerprint,profilePolicy})=>{
    const study=window.__vanIconStudy,atlas=document.createElement('canvas');atlas.width=columns*cell;atlas.height=rows*cell;
    if(JSON.stringify(study.launch)!==JSON.stringify(launch))throw Error('Icon page and exporter disagree about the full launch clock. A stale renderer may be cached.');
    if(study.acquisition().provenance.shaderFingerprint!==shaderFingerprint)throw Error('The loaded runtime acquisition differs from the hashed game shader.');
    if(JSON.stringify(study.acquisition().profilePolicy)!==JSON.stringify(profilePolicy))throw Error('The loaded hero acquisition profile differs from its source.');
    const ctx=atlas.getContext('2d');ctx.imageSmoothingEnabled=false;
    if(!studyOnly)for(let index=0;index<frameCount;index++){
      study.renderAt(index/(frameCount-1)*duration,{size:cell,startupLoop:startupOnly,reduceFlash:startupOnly});
      ctx.drawImage(study.canvas,index%columns*cell,Math.floor(index/columns)*cell);
    }
    const captureCandidate=variant=>{
      const rasters={},rasterReports={};for(const size of rasterSizes){rasters[size]=study.still(size,variant);const rendered=study.acquisition();rasterReports[size]={
        width:study.canvas.width,height:study.canvas.height,sourceWidth:rendered.sourceWidth,sourceHeight:rendered.sourceHeight,
        screenPeriodPx:rendered.screenPeriodPx,cellPx:rendered.cellPx,shaderFingerprint:rendered.provenance.shaderFingerprint,
        recordingCaptureMix:rendered.profilePolicy.recording.captureMix,vfdToneAmount:rendered.profilePolicy.vfd.toneAmount,variant,
        weather:study.weather()};}
      const samples=[];for(const time of startupOnly?[]:[.35,1.12,2.30,2.42,2.95,3.4]){
        study.renderAt(time,{size:256,variant});const sample={time,png:study.canvas.toDataURL('image/png'),acquisition:study.acquisition(),weather:study.weather()};
        if(studyOnly)sample.raw=study.rawStill(time,256,variant);samples.push(sample);
      }
      return{rasters,rasterReports,samples,acquisition:study.acquisition(),weather:study.weather()};
    };
    const primary=captureCandidate('detail'),variants=studyOnly?{detail:primary,ink:captureCandidate('ink')}:null;
    study.renderAt(duration,{size:startupOnly?128:1024});
    return{atlas:studyOnly?null:atlas.toDataURL('image/png'),master:primary.rasters[startupOnly?128:1024],...primary,variants,fit:study.fit,lampCentres:study.lampCentres()};
  },{frameCount,cell,columns,rows,duration,launch:VAN_ICON_LAUNCH,rasterSizes,studyOnly,startupOnly,shaderFingerprint:VAN_ICON_ACQUISITION_PROVENANCE.shaderFingerprint,profilePolicy:VAN_ICON_ACQUISITION_PROFILE});
  if(errors.length)throw Error(errors.join('\n'));
  const png=value=>Buffer.from(value.split(',')[1],'base64');
  if(startupOnly){
    await mkdir(out,{recursive:true});
    const atlas=await sharp(png(result.atlas)).png({palette:true,colours:256,dither:0,effort:10,compressionLevel:9}).toBuffer();
    const poster=await sharp(png(result.master)).png({palette:true,colours:256,dither:0,effort:10,compressionLevel:9}).toBuffer();
    const decodedBytes=columns*cell*rows*cell*4+128*128*4;
    if(atlas.length>STARTUP_VAN_BUDGET.atlasEncodedBytes||poster.length>STARTUP_VAN_BUDGET.posterEncodedBytes||decodedBytes>STARTUP_VAN_BUDGET.totalDecodedBytes)
      throw Error('The optional app van exceeded its startup resource budget.');
    const video=await encodeStartupVanVideo(atlas);
    const atlasPath='assets/brand/app-icon-van-startup.png',posterPath='assets/brand/app-icon-van-startup-poster.png';
    const videoPath='assets/brand/app-icon-van-startup.mp4';
    await writeFile(join(root,atlasPath),atlas);await writeFile(join(root,posterPath),poster);await writeFile(join(root,videoPath),video);
    const manifest={version:5,purpose:'optional lightweight app widget',...STARTUP_VAN_LAYOUT,pngWidth:columns*cell,pngHeight:rows*cell,
      atlas:{path:atlasPath,sha256:hash(atlas),bytes:atlas.length,renderedAtOutputResolution:true},
      poster:{path:posterPath,sha256:hash(poster),bytes:poster.length,render:result.rasterReports[128],renderedAtOutputResolution:true},
      video:{path:videoPath,sha256:hash(video),bytes:video.length,codec:'H.264',background:'#020807',audioTracks:0},
      encoding:{format:'indexed PNG',paletteColours:256,additionalDithering:false},decodedBytes,budget:STARTUP_VAN_BUDGET,
      acquisition:result.acquisition,inputs:await renderInputs({startup:true}),nativeDockChanged:false};
    await writeFile(join(out,'app-icon-startup.json'),JSON.stringify(manifest,null,2)+'\n');
    console.log(JSON.stringify({startupExported:true,frameCount,cell,columns,rows,duration,atlasBytes:atlas.length,posterBytes:poster.length,
      videoBytes:video.length,decodedBytes,atlasSha256:hash(atlas),posterSha256:hash(poster),videoSha256:hash(video),errors}));
  }else if(studyOnly){
    const studyOut=join(root,'artifacts/van-icon-study/dither-weather-study');await mkdir(studyOut,{recursive:true});
    const variants={};
    for(const[name,value]of Object.entries(result.variants)){
      const location=join(studyOut,name);await mkdir(location,{recursive:true});
      for(const [size,data]of Object.entries(value.rasters))await writeFile(join(location,`van-${size}.png`),png(data));
      for(const sample of value.samples){await writeFile(join(location,`motion-${sample.time.toFixed(2)}.png`),png(sample.png));await writeFile(join(location,`raw-${sample.time.toFixed(2)}.png`),png(sample.raw));}
      variants[name]={acquisition:value.acquisition,weather:value.weather,rasterReports:value.rasterReports,samples:value.samples.map(({png,raw,...sample})=>sample)};
    }
    const report={scope:'Actual game acquisition rendered at each final size; moving-weather samples, not native Dock acceptance',sizes:rasterSizes,
      variants,errors};
    await writeFile(join(studyOut,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({study:true,out:studyOut,variants:Object.keys(variants),shader:result.acquisition.provenance.shaderFingerprint,errors}));
    process.exitCode=0;
  }else{
  await mkdir(out,{recursive:true});await mkdir(join(out,'app-icon-van-rasters'),{recursive:true});
  const atlas=png(result.atlas),master=png(result.master);
  await writeFile(join(out,'app-icon-van.png'),master);
  await writeFile(join(out,'app-icon-van-launch.png'),atlas);
  const rasters={};for(const[size,data]of Object.entries(result.rasters)){
    const bytes=png(data),path=Number(size)===1024?'assets/brand/app-icon-van.png':`assets/brand/app-icon-van-rasters/${size}.png`;
    if(Number(size)!==1024)await writeFile(join(root,path),bytes);
    rasters[size]={path,sha256:hash(bytes),width:Number(size),height:Number(size),renderedAtOutputResolution:true,render:result.rasterReports[size]};
  }
  const inputs=await renderInputs();
  await writeFile(join(out,'app-icon-van-launch.json'),JSON.stringify({version:3,...VAN_ICON_LAUNCH,pngWidth:columns*cell,pngHeight:rows*cell,frameOrder:'row-major; PNG top-left origin',alpha:true,audioTracks:0,
    master:{path:'assets/brand/app-icon-van.png',sha256:hash(master)},atlas:{path:'assets/brand/app-icon-van-launch.png',sha256:hash(atlas),renderedAtOutputResolution:true},rasters,inputs,fit:result.fit,lampCentres:result.lampCentres,
    acquisition:result.acquisition,weatherStudy:result.samples.map(({png,...sample})=>sample)},null,2)+'\n');
  console.log(JSON.stringify({exported:true,frameCount,cell,columns,rows,duration,masterSha256:hash(master),atlasSha256:hash(atlas),errors}));
  }
}finally{await browser?.close();await server?.close();await rm(profile,{recursive:true,force:true});}
