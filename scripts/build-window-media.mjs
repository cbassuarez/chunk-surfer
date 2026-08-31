import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=resolve(import.meta.dirname,'..');
const SOURCE_DIR=resolve(process.argv[2]||'/Users/seb/Downloads');
const OUT_DIR=join(ROOT,'public','window-media');
const MANIFEST_PATH=join(ROOT,'content','media','window-media.media.json');

const SOURCES=Object.freeze([
  {id:'flowers-seb',file:'dmosh-bloom_flowers-seb.mov',start:0,duration:5,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Datamoshed flower footage',creator:'Sebastian Suarez-Solis',license:'Project-owned',sourceUrl:null,operations:['trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'sunflower-datamosh',file:'dmosh-bloom-girasol.mp4',start:18,duration:12,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Polinización de un girasol',creator:'Oscar Gil Fernández',license:'CC BY 2.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Polinizaci%C3%B3n_de_un_girasol.webm',operations:['datamoshed derivative','trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'bellringers-datamosh',file:'dmosh-bloom-doppio.mp4',start:0,duration:12,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Bolognese bellringing doppio a cappio',creator:'Renato Morselli',license:'CC BY 3.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Bolognese_bellringing_doppio_a_cappio.ogg',operations:['datamoshed derivative','trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'cathedral',file:'Bristol_Cathedral_interior_(4K,_60_FPS,_2023.08.12).webm',start:34,duration:13,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Bristol Cathedral interior (4K, 60 FPS, 2023.08.12)',creator:'George Si',license:'CC BY 3.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Bristol_Cathedral_interior_%284K,_60_FPS,_2023.08.12%29.webm',operations:['trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'demolition',file:'Urheilutalo_Oulu_20221216.webm',start:8,duration:12,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Urheilutalo Oulu 20221216',creator:'Estormiz',license:'CC0-1.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Urheilutalo_Oulu_20221216.webm',operations:['trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'clouds',file:'clouds.mp4',start:2,duration:12,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Clouds timelapse',creator:'John Fowler',license:'CC BY 2.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Clouds_timelapse.ogv',operations:['trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'eclipse',file:'Partial_Eclipse,_UK_10-06-21.webm',start:32,duration:12,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Partial Eclipse, UK 10-06-21',creator:'Adrian Parsons',license:'CC BY 3.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Partial_Eclipse,_UK_10-06-21.webm',operations:['trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'pollination',file:'Polinización_de_un_girasol.webm',start:2,duration:12,width:640,height:360,fps:15,sensitivity:'none',
    sourceTitle:'Polinización de un girasol',creator:'Oscar Gil Fernández',license:'CC BY 2.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Polinizaci%C3%B3n_de_un_girasol.webm',operations:['trimmed','loop-dissolved','resized','silent transcode','color processed']},
  {id:'eye-s3',file:'Zoonotic-helminths-affecting-the-human-eye-1756-3305-4-41-S3.ogv',start:8,duration:10,width:320,height:240,fps:12,sensitivity:'clinical',
    sourceTitle:'Zoonotic helminths affecting the human eye S3',creator:'Otranto and Eberhard',license:'CC BY 2.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Zoonotic-helminths-affecting-the-human-eye-1756-3305-4-41-S3.ogv',operations:['trimmed','loop-dissolved','silent transcode','color processed']},
  {id:'eye-s5',file:'Zoonotic-helminths-affecting-the-human-eye-1756-3305-4-41-S5.ogv',start:3,duration:12,width:320,height:240,fps:12,sensitivity:'clinical',
    sourceTitle:'Zoonotic helminths affecting the human eye S5',creator:'Otranto and Eberhard; video courtesy Dr. W.E. Burr',license:'CC BY 2.0',sourceUrl:'https://commons.wikimedia.org/wiki/File:Zoonotic-helminths-affecting-the-human-eye-1756-3305-4-41-S5.ogv',operations:['trimmed','loop-dissolved','silent transcode','color processed']},
]);

function sha256(path){return createHash('sha256').update(readFileSync(path)).digest('hex');}
function run(args){
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
  if(result.status!==0)throw new Error(`ffmpeg failed (${result.status}): ${args.at(-1)}`);
}
function filterFor(spec){
  const scale=`scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height}`;
  const offset=Math.max(0.01,spec.duration-.25).toFixed(3);
  return `[0:v]fps=${spec.fps},${scale},split=2[whole][head];`
    +`[whole]trim=duration=${spec.duration},setpts=PTS-STARTPTS[a];`
    +`[head]trim=duration=0.25,setpts=PTS-STARTPTS[b];`
    +`[a][b]xfade=transition=fade:duration=0.25:offset=${offset},format=yuv420p[v]`;
}

mkdirSync(OUT_DIR,{recursive:true});
const assets=[];
for(const spec of SOURCES){
  const source=join(SOURCE_DIR,spec.file);
  statSync(source);
  const webm=join(OUT_DIR,`${spec.id}.webm`);
  const mp4=join(OUT_DIR,`${spec.id}.mp4`);
  const poster=join(OUT_DIR,`${spec.id}.png`);
  const common=['-ss',String(spec.start),'-i',source,'-filter_complex',filterFor(spec),'-map','[v]','-an','-t',String(spec.duration),'-r',String(spec.fps)];
  run([...common,'-c:v','libvpx-vp9','-deadline','good','-cpu-used','4','-row-mt','1','-crf','34','-b:v','0','-g',String(spec.fps),webm]);
  run([...common,'-c:v','libx264','-preset','slow','-crf','23','-g',String(spec.fps),'-keyint_min',String(spec.fps),'-sc_threshold','0','-movflags','+faststart',mp4]);
  run(['-ss',String(spec.start+.2),'-i',source,'-vf',`fps=1,scale=${spec.width}:${spec.height}:force_original_aspect_ratio=increase,crop=${spec.width}:${spec.height}`,'-frames:v','1','-an',poster]);
  assets.push({
    id:spec.id,kind:'video',path:`window-media/${spec.id}.webm`,aspectRatio:spec.width/spec.height,width:spec.width,height:spec.height,fps:spec.fps,
    trim:{startSeconds:spec.start,durationSeconds:spec.duration,loopDissolveSeconds:.25},sensitivity:spec.sensitivity,
    source:{file:basename(source),sha256:sha256(source),title:spec.sourceTitle,creator:spec.creator,license:spec.license,url:spec.sourceUrl},
    derivatives:{
      webm:{path:`window-media/${spec.id}.webm`,codec:'vp9',sha256:sha256(webm),bytes:statSync(webm).size},
      mp4:{path:`window-media/${spec.id}.mp4`,codec:'h264',sha256:sha256(mp4),bytes:statSync(mp4).size},
      poster:{path:`window-media/${spec.id}.png`,codec:'png',sha256:sha256(poster),bytes:statSync(poster).size},
    },
    modifications:spec.operations,
  });
}
const manifest={schemaVersion:1,id:'window-media',generatedBy:'scripts/build-window-media.mjs',networkAtRuntime:false,audioPolicy:'silent',assets};
writeFileSync(MANIFEST_PATH,`${JSON.stringify(manifest,null,2)}\n`);
console.log(`wrote ${assets.length} media records to ${MANIFEST_PATH}`);
