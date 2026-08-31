import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'content/media/window-media.media.json'),'utf8'));
const sha256=(path)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const errors=[];
if(manifest.schemaVersion!==1||manifest.networkAtRuntime!==false||manifest.audioPolicy!=='silent')errors.push('manifest contract');
if(!Array.isArray(manifest.assets)||manifest.assets.length<10)errors.push('asset count');
for(const asset of manifest.assets||[]){
  if(!asset.id||!['none','clinical'].includes(asset.sensitivity))errors.push(`${asset.id}:metadata`);
  if(asset.width>640||asset.height>360||asset.trim?.startSeconds<0||asset.trim?.durationSeconds<=0)errors.push(`${asset.id}:bounds`);
  if(!asset.source?.sha256||!asset.source?.creator||!asset.source?.license)errors.push(`${asset.id}:source`);
  for(const kind of ['webm','mp4','poster']){
    const record=asset.derivatives?.[kind],path=record&&resolve(root,'public',record.path);
    if(!record||!path||!existsSync(path)){errors.push(`${asset.id}:${kind}:missing`);continue;}
    if(record.sha256!==sha256(path)||record.bytes!==statSync(path).size)errors.push(`${asset.id}:${kind}:hash`);
    if(kind==='poster')continue;
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height','-of','json',path],{encoding:'utf8'});
    if(probe.status!==0){errors.push(`${asset.id}:${kind}:probe`);continue;}
    const streams=JSON.parse(probe.stdout||'{}').streams||[];
    if(streams.some((stream)=>stream.codec_type==='audio'))errors.push(`${asset.id}:${kind}:audio`);
    const video=streams.find((stream)=>stream.codec_type==='video');
    if(!video||video.width>640||video.height>360)errors.push(`${asset.id}:${kind}:resolution`);
  }
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`window media valid: ${manifest.assets.length} silent assets`);
