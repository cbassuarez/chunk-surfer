// Package only the optional, lightweight app widget. Native Dock/ICNS artwork
// and its finite launch are a separate asset family and are never changed here.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {STARTUP_VAN_LAYOUT,STARTUP_VAN_BUDGET} from '../tools/app-icon/startup-layout.mjs';

export const STARTUP_VAN_SOURCE='assets/brand/app-icon-startup.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function encodeStartupVanVideo(atlas) {
  const {frameCount,columns,cell,durationSeconds}=STARTUP_VAN_LAYOUT;
  const temp=await mkdtemp(join(tmpdir(),'chunk-startup-video-'));
  const destination=join(temp,'startup.mp4');
  try{
    const frames=[];
    for(let index=0;index<frameCount;index++){
      frames.push(await sharp(atlas).extract({
        left:index%columns*cell,top:Math.floor(index/columns)*cell,width:cell,height:cell,
      }).flatten({background:'#020807'}).raw().toBuffer());
    }
    const fpsNumerator=frameCount*10;
    const fpsDenominator=Math.round(durationSeconds*10);
    const encoding=spawnSync(process.env.FFMPEG_PATH||'ffmpeg',[
      '-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24',
      '-video_size',cell+'x'+cell,'-framerate',fpsNumerator+'/'+fpsDenominator,'-i','pipe:0',
      '-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-preset','slow',
      '-movflags','+faststart',destination,
    ],{input:Buffer.concat(frames),encoding:'utf8'});
    if(encoding.error)throw encoding.error;
    if(encoding.status!==0)throw Error('Startup van video encoding failed: '+encoding.stderr);
    const video=await readFile(destination);
    if(video.length>STARTUP_VAN_BUDGET.videoEncodedBytes)throw Error('The app van video exceeded its startup budget.');
    return video;
  }finally{
    await rm(temp,{recursive:true,force:true});
  }
}

export async function packageStartupVanAssets({root=resolve(import.meta.dirname,'..'),required=true,fallbackPoster=null}={}){
  let manifestBytes;
  try{manifestBytes=await readFile(join(root,STARTUP_VAN_SOURCE));}
  catch(error){
    if(required||error.code!=='ENOENT')throw error;
    if(fallbackPoster){
      const info=await sharp(fallbackPoster).metadata();
      if(info.width!==128||info.height!==128||fallbackPoster.length>STARTUP_VAN_BUDGET.posterEncodedBytes)throw Error('The optional app poster exceeded its startup budget.');
      const target=join(root,'public/app-icon');await mkdir(target,{recursive:true});await writeFile(join(target,'van-startup-poster.png'),fallbackPoster);
    }
    return{packaged:false,reason:'Optional app atlas has not been rendered; only its small static fallback is available.'};
  }
  const source=JSON.parse(manifestBytes);
  for(const key of['frameCount','cell','cellSize','columns','rows','durationSeconds'])
    if(source[key]!==STARTUP_VAN_LAYOUT[key])throw Error(`Unexpected app-only van ${key}.`);
  for(const key of['stages','stagesSeconds','weather'])
    if(JSON.stringify(source[key])!==JSON.stringify(STARTUP_VAN_LAYOUT[key]))throw Error(`App-only van ${key} differs from its authored clock.`);
  for(const[path,expected]of Object.entries(source.inputs||{}))
    if(hash(await readFile(join(root,path)))!==expected)throw Error(`App van render source changed: ${path}. Render startup assets again.`);
  const atlas=await readFile(join(root,source.atlas.path)),poster=await readFile(join(root,source.poster.path));
  const video=await readFile(join(root,source.video.path));
  if(hash(atlas)!==source.atlas.sha256||hash(poster)!==source.poster.sha256||hash(video)!==source.video.sha256)
    throw Error('App van artwork differs from its render manifest.');
  const a=await sharp(atlas).metadata(),p=await sharp(poster).metadata();
  const decoded=a.width*a.height*4+p.width*p.height*4;
  if(a.width!==source.columns*source.cell||a.height!==source.rows*source.cell||p.width!==128||p.height!==128||!a.hasAlpha||!p.hasAlpha)
    throw Error('App van has unexpected dimensions or coverage.');
  if(atlas.length>STARTUP_VAN_BUDGET.atlasEncodedBytes||poster.length>STARTUP_VAN_BUDGET.posterEncodedBytes
    ||video.length>STARTUP_VAN_BUDGET.videoEncodedBytes||decoded>STARTUP_VAN_BUDGET.totalDecodedBytes)
    throw Error('The optional app van exceeded its startup budget.');
  const target=join(root,'public/app-icon');await mkdir(target,{recursive:true});
  await writeFile(join(target,'van-startup.mp4'),video);await writeFile(join(target,'van-startup-poster.png'),poster);
  const metadata={version:5,purpose:'optional lightweight app widget',...STARTUP_VAN_LAYOUT,
    video:'van-startup.mp4',poster:'van-startup-poster.png',
    videoSha256:source.video.sha256,posterSha256:source.poster.sha256,
    bytes:{video:video.length,poster:poster.length},
    acquisition:source.acquisition.provenance,sourceManifestSha256:hash(manifestBytes),
    notes:'App-only 128px recording of the van in rain through the game shader. The van enters and leaves the frame so the shot can loop while the game loads.'};
  await writeFile(join(target,'van-startup.json'),JSON.stringify(metadata,null,2)+'\n');
  // Remove only the former app-side copies. The canonical/native Dock atlas,
  // master and ICNS resources are deliberately untouched.
  for(const file of['van-startup.png','van-launch.png','van-launch.json','van.png'])await rm(join(target,file),{force:true});
  return{packaged:true,source:STARTUP_VAN_SOURCE,frameCount:source.frameCount,cell:source.cell,atlasBytes:atlas.length,
    posterBytes:poster.length,videoBytes:video.length,totalDecodedBytes:decoded,
    atlasSha256:source.atlas.sha256,posterSha256:source.poster.sha256,videoSha256:source.video.sha256};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  packageStartupVanAssets().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
}
