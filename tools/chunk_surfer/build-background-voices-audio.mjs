// Background voices: open field recordings of people (src/data/background-voices-audio.js).
//   node tools/chunk_surfer/build-background-voices-audio.mjs [--refetch]
// Fetches each Freesound page, refuses it unless the page carries the licence the data claims
// (and no NonCommercial or ShareAlike licence), downloads that sound's published HQ MP3
// preview, and renders a mono 32 kHz loop into public/audio/background-voices/. Pages and
// previews are kept in artifacts/background-voices/sources (not shipped). The game's own
// bitcrushing happens later, at playback, so nothing here wears the sound down.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {BACKGROUND_VOICES_AUDIO_SOURCES as SOURCES,BACKGROUND_VOICE_PLACES as PLACES} from '../../src/data/background-voices-audio.js';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'public/audio/background-voices'),held=path.join(root,'artifacts/background-voices/sources');
const refetch=process.argv.includes('--refetch');
const RATE=32000,FADE=2,LOUDNESS=-25;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const probe=file=>JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
function loudness(file){
  const r=cp.spawnSync('ffmpeg',['-hide_banner','-nostats','-i',file,'-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(r.status)throw Error(r.stderr);
  const s=r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return{integratedLufs:+s.match(/I:\s+(-?[\d.]+) LUFS/)?.[1],truePeakDbfs:+s.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]};
}
async function get(url,{text=false}={}){
  for(let attempt=0;attempt<5;attempt++){
    const r=await fetch(url,{headers:{'user-agent':'chunk-surfer-audio-build'}});
    if(r.status===429){await wait(4000*(attempt+1));continue;}
    if(!r.ok)throw Error(`${r.status} ${url}`);
    return text?r.text():Buffer.from(await r.arrayBuffer());
  }
  throw Error(`rate limited: ${url}`);
}
// The licence link the data claims must be on the page, and no licence the game can't use.
function checkLicence(s,html){
  const want=s.licenceUrl.replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!new RegExp(`https?://${want.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')}/?["']`).test(html))throw Error(`${s.id}: the page does not carry ${s.licence}`);
  if(/creativecommons\.org\/licenses\/[a-z-]*(nc|sa)[a-z-]*\//i.test(html))throw Error(`${s.id}: the page carries a NonCommercial or ShareAlike licence`);
}

fs.mkdirSync(out,{recursive:true});fs.mkdirSync(held,{recursive:true});
const sources=[],outputs=[];
for(const s of SOURCES){
  const pageFile=path.join(held,`${s.id}.html`),previewFile=path.join(held,`${s.id}.mp3`);
  if(refetch||!fs.existsSync(pageFile)){fs.writeFileSync(pageFile,await get(s.url,{text:true}));await wait(1500);}
  const html=fs.readFileSync(pageFile,'utf8');checkLicence(s,html);
  const num=s.url.match(/sounds\/(\d+)\//)[1];
  const preview=html.match(new RegExp(`https://cdn\\.freesound\\.org/previews/\\d+/${num}_\\d+-hq\\.mp3`))?.[0];
  if(!preview)throw Error(`${s.id}: no HQ preview on the page`);
  if(refetch||!fs.existsSync(previewFile)){fs.writeFileSync(previewFile,await get(preview));await wait(1500);}
  const sourceDuration=+probe(previewFile).format.duration;
  const start=s.start||0,length=s.seconds??Math.max(4,sourceDuration-start-.5);
  if(start+length>sourceDuration+.05)throw Error(`${s.id}: excerpt runs past the recording (${sourceDuration.toFixed(1)} s)`);
  const fade=Math.min(FADE,length*.12);
  // Seamless loop: the excerpt's last `fade` seconds are crossfaded (equal power) into its
  // first, so the end of the loop runs straight on into its beginning.
  const filter=`[0:a]atrim=start=${start}:duration=${length},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,`
    +`highpass=f=90,lowpass=f=9000,loudnorm=I=${LOUDNESS}:LRA=11:TP=-6,aresample=${RATE},asplit=3[a][b][c];`
    +`[a]atrim=start=${length-fade}:end=${length},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${fade}:curve=qsin[tail];`
    +`[b]atrim=start=0:end=${fade},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fade}:curve=qsin[head];`
    +`[c]atrim=start=${fade}:end=${length-fade},asetpts=PTS-STARTPTS[middle];`
    +`[tail][head]amix=inputs=2:normalize=0:duration=longest[seam];[seam][middle]concat=n=2:v=0:a=1[out]`;
  const file=path.join(out,`${s.id}.mp3`);
  cp.execFileSync('ffmpeg',['-hide_banner','-nostdin','-v','error','-y','-i',previewFile,'-filter_complex',filter,'-map','[out]',
    '-map_metadata','-1','-ac','1','-ar',String(RATE),'-c:a','libmp3lame','-b:a','96k',file]);
  const duration=+probe(file).format.duration;
  sources.push({id:s.id,place:s.place,title:s.title,author:s.author,url:s.url,licence:s.licence,licenceUrl:s.licenceUrl,
    download:preview,encoding:'Freesound HQ MP3 preview; not the original upload',sourceDuration,sourceSha256:sha(fs.readFileSync(previewFile)),pageSha256:sha(html)});
  outputs.push({id:s.id,place:s.place,file:`${s.id}.mp3`,bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file)),sampleRate:RATE,channels:1,
    duration,loopSeconds:duration,excerpt:{start,seconds:length},crossfadeSeconds:fade,filter,measured:loudness(file),decodedFloat32Bytes:Math.ceil(duration*RATE)*4});
  console.log(`${s.id.padEnd(30)} ${s.licence.padEnd(9)} ${duration.toFixed(1).padStart(6)} s`);
}
const places=Object.fromEntries(Object.keys(PLACES).map(place=>[place,outputs.filter(o=>o.place===place).reduce((n,o)=>n+o.decodedFloat32Bytes,0)]));
for(const[place,bytes]of Object.entries(places))if(bytes>40*1024*1024)throw Error(`${place} decodes to ${(bytes/1048576).toFixed(1)} MiB`);
const manifest={version:1,sources,outputs,encodedBytes:outputs.reduce((n,o)=>n+o.bytes,0),decodedFloat32BytesByPlace:places,
  audition:{byAssistant:false,reason:'No listening in this session: excerpts chosen from the uploaders\' descriptions; the game mix is unverified.'}};
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`${outputs.length} loops, ${(manifest.encodedBytes/1024).toFixed(0)} KiB; decoded MiB by place`,Object.fromEntries(Object.entries(places).map(([k,v])=>[k,+(v/1048576).toFixed(1)])));
