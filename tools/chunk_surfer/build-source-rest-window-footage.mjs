// Rebuild the one new licensed moving-footage excerpt. Does not download,
// regenerate other media, alter source clocks or modify the native app/profile.
import {readFileSync,writeFileSync,statSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..'),source=process.argv[2];
if(!source)throw Error('Pass the original DIY Ferrocell WebM file. The source URL and licence are in public/window-media/ferrocell-fields.credits.json.');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),manifestPath=join(root,'content/media/window-media.media.json'),
  manifest=JSON.parse(readFileSync(manifestPath,'utf8')),record=JSON.parse(readFileSync(join(root,'public/window-media/ferrocell-fields.credits.json'),'utf8'));
if(sha(source)!==record.source.sha256)throw Error('Source differs from the reviewed and credited original.');
const output=join(root,'public/window-media');mkdirSync(output,{recursive:true});
const run=args=>{const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});if(r.status!==0)throw Error('Footage transcode failed');};
const filter='scale=640:360:force_original_aspect_ratio=increase,crop=640:360';
for(const [extension,codec,args] of [['webm','vp9',['-c:v','libvpx-vp9','-crf','34','-b:v','0','-deadline','good','-cpu-used','4']],['mp4','h264',['-c:v','libx264','-crf','24','-preset','fast','-movflags','+faststart']]]){
 const path=join(output,record.id+'.'+extension);run(['-ss','62','-i',source,'-t','16','-vf',filter,'-r','15','-an',...args,path]);
 record.derivatives[extension]={path:'window-media/'+record.id+'.'+extension,codec,sha256:sha(path),bytes:statSync(path).size};
}
const poster=join(output,record.id+'.png');run(['-ss','63','-i',source,'-vf',filter,'-frames:v','1',poster]);
record.derivatives.poster={path:'window-media/'+record.id+'.png',codec:'png',sha256:sha(poster),bytes:statSync(poster).size};
const index=manifest.assets.findIndex(a=>a.id===record.id);if(index<0)manifest.assets.push(record);else manifest.assets[index]=record;
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');writeFileSync(join(output,record.id+'.credits.json'),JSON.stringify(record,null,2)+'\n');
console.log('Rebuilt one 16-second silent moving-footage excerpt with verified source and derivative hashes.');
