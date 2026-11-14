// CPU-only review movie made from the exact native/startup atlas. No game shell,
// GPU capture, microphone, playback, or audio stream is involved.
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=resolve(import.meta.dirname,'..'),review=join(root,'artifacts/van-icon-study');
const spec=JSON.parse(await readFile(join(root,'assets/brand/app-icon-van-launch.json'),'utf8'));
const atlas=await readFile(join(root,spec.atlas.path));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(atlas)!==spec.atlas.sha256)throw Error('Review atlas differs from the exported native atlas.');
const temporary=await mkdtemp(join(tmpdir(),'chunk-van-review-'));
await mkdir(review,{recursive:true});
try{
 for(let i=0;i<spec.frameCount;i++)await sharp(atlas).extract({left:i%spec.columns*spec.cell,top:Math.floor(i/spec.columns)*spec.cell,width:spec.cell,height:spec.cell})
  .flatten({background:'#181b22'}).png().toFile(join(temporary,`frame-${String(i).padStart(3,'0')}.png`));
 const output=join(review,'launch.webm');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',`${spec.frameCount}/${spec.durationSeconds}`,'-i',join(temporary,'frame-%03d.png'),
  '-frames:v',String(spec.frameCount),'-c:v','libvpx-vp9','-crf','20','-b:v','0','-pix_fmt','yuv420p','-an',output]);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
 if(probe.streams.length!==1||probe.streams[0].codec_type!=='video')throw Error('Review must contain one video stream and no audio.');
 for(const [source,target]of[['tools/app-icon/renderer.mjs','study.mjs'],['tools/app-icon/motion.mjs','motion.mjs'],['tools/app-icon/weather.mjs','weather.mjs'],['tools/app-icon/acquisition.mjs','acquisition.mjs'],['tools/app-icon/transit.glb','transit.glb'],['tools/app-icon/transit-source.json','transit-source.json'],['assets/brand/app-icon-van.png','van-master.png']])await copyFile(join(root,source),join(review,target));
 const reviewHTML=(await readFile(join(root,'tools/app-icon/index.html'),'utf8')).replace('src="./renderer.mjs"','src="./study.mjs"')
  .replace('<h2>The ear stays hidden</h2>','<h2>Silent motion study</h2><video controls muted playsinline preload="none" src="launch.webm" poster="van-preview.png"></video><h2>The ear stays hidden</h2>');
 await writeFile(join(review,'index.html'),reviewHTML);
 await sharp(join(root,spec.rasters['512'].path)).flatten({background:'#181b22'}).png().toFile(join(review,'van-preview.png'));
 const times=[0,.55,1.12,1.6,2.30,2.42,2.70,3.4],samples=times.map(seconds=>({seconds,frame:Math.round(seconds/spec.durationSeconds*(spec.frameCount-1))}));
 for(const size of[256,128]){
  const tiles=[];for(let i=0;i<samples.length;i++){
   const index=samples[i].frame,tile=await sharp(atlas).extract({left:index%spec.columns*spec.cell,top:Math.floor(index/spec.columns)*spec.cell,width:spec.cell,height:spec.cell})
    .resize(size,size).flatten({background:size===128?'#b6b8bc':'#181b22'}).png().toBuffer();
   tiles.push({input:tile,left:i%4*size,top:Math.floor(i/4)*size});
  }
  await sharp({create:{width:4*size,height:2*size,channels:3,background:'#181b22'}}).composite(tiles).png().toFile(join(review,`motion-${size}px.png`));
 }
 await writeFile(join(review,'motion-samples.json'),JSON.stringify({order:'left to right, then next row',samples},null,2)+'\n');
 const report={passed:true,scope:'Exact exported native/startup frames, flattened for silent browser review. Native visible Dock acceptance remains separate.',audioTracks:0,
  frameCount:spec.frameCount,durationSeconds:spec.durationSeconds,atlasSha256:spec.atlas.sha256,videoSha256:sha(await readFile(output)),videoBytes:(await stat(output)).size,
  frameWidth:spec.cell,frameHeight:spec.cell,fit:spec.fit,acquisition:spec.acquisition.provenance,weather:spec.weather,
  probe:{codec:probe.streams[0].codec_name,duration:Number(probe.format.duration),streams:probe.streams.map(s=>s.codec_type)}};
 await writeFile(join(review,'render-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await rm(temporary,{recursive:true,force:true});}
