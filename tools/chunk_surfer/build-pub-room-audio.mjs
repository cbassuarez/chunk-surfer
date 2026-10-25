// User-owned music plus two CC0 field recordings. Original inputs untouched.
// Fetch sources separately using the manifest URLs; this builder is offline.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'public/audio/pub-room'),evidence=path.join(root,'artifacts/pub-audio');
const sourceMusic=process.argv[2]||'/Users/seb/Downloads/29.wav';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(args){return cp.execFileSync('ffmpeg',['-hide_banner','-nostdin',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});}
function measure(p){const r=cp.spawnSync('ffmpeg',['-hide_banner','-nostats','-i',p,'-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(r.status)throw Error(r.stderr);return r.stderr.slice(r.stderr.lastIndexOf('Summary:'));}
fs.mkdirSync(out,{recursive:true});
const sources=[
{id:'music',title:'29.wav',author:'User supplied original work',source:sourceMusic,rights:'User states this is their own work and explicitly authorizes use as the bar music.',license:'User-owned; no Creative Commons relicensing implied',sourceMasterRetained:true},
{id:'company',title:'Wine Bar Ambience, Light Talking, Around 20 People',author:'rbn_yng',url:'https://freesound.org/people/rbn_yng/sounds/275639/',download:'https://cdn.freesound.org/previews/275/275639_3095330-hq.mp3',source:path.join(evidence,'sources/wine-bar-ambience-preview.mp3'),page:path.join(evidence,'sources/pub-source-page.html'),license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',sourceMasterRetained:false},
{id:'rain',title:'rain - outside window.wav',author:'Anthousai',url:'https://freesound.org/people/Anthousai/sounds/398741/',download:'https://cdn.freesound.org/previews/398/398741_5923045-hq.mp3',source:path.join(evidence,'sources/rain-outside-window-preview.mp3'),page:path.join(evidence,'sources/rain-source-page.html'),license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',sourceMasterRetained:false},
];
const outputs=[];
for(const s of sources){
  if(s.page&&!/creativecommons\.org\/publicdomain\/zero\/1\.0\//.test(fs.readFileSync(s.page,'utf8')))throw Error('No original CC0 proof: '+s.id);
  const probe=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',s.source],{encoding:'utf8'}));
  s.sourceSha256=sha(s.source);s.sourceBytes=fs.statSync(s.source).size;s.sourceDuration=+probe.format.duration;s.pageSha256=s.page?sha(s.page):undefined;
  let file,filter,args;
  if(s.id==='music'){
    file='29-bar-radio.mp3';
    // The full 5:30 performance is retained. Mono is physically motivated by
    // one backbar loudspeaker; 32kHz keeps its decoded bank below 43MB.
    filter='aformat=channel_layouts=mono,highpass=f=65,lowpass=f=11000,loudnorm=I=-23:LRA=14:TP=-3,afade=t=in:st=0:d=0.03,afade=t=out:st=330.073979:d=0.03';
    args=['-i',s.source,'-af',filter];
  }else{
    file=s.id==='company'?'company.mp3':'rain-window.mp3';
    const seconds=s.id==='company'?84:22,fade=s.id==='company'?2:1;
    // Tail-to-head overlap makes a genuine waveform-continuous short loop;
    // the retained centre otherwise keeps the field recording's chronology.
    filter=`[0:a]atrim=start=${s.id==='company'?40:0}:duration=${seconds},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,highpass=f=${s.id==='company'?130:75},lowpass=f=${s.id==='company'?4500:9000},loudnorm=I=-25:LRA=10:TP=-6,aresample=32000,asplit=3[tail][head][middle];[tail]atrim=start=${seconds-fade}:end=${seconds},asetpts=PTS-STARTPTS[t];[head]atrim=start=0:end=${fade},asetpts=PTS-STARTPTS[h];[t][h]acrossfade=d=${fade}:c1=tri:c2=tri[seam];[middle]atrim=start=${fade}:end=${seconds-fade},asetpts=PTS-STARTPTS[m];[seam][m]concat=n=2:v=0:a=1[out]`;
    args=['-i',s.source,'-filter_complex',filter,'-map','[out]'];
  }
  const output=path.join(out,file);
  run(['-v','error','-y',...args,'-map_metadata','-1','-map_chapters','-1','-ac','1','-ar','32000','-c:a','libmp3lame','-b:a',s.id==='music'?'112k':'96k',output]);
  const p=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',output],{encoding:'utf8'}));
  outputs.push({id:s.id,file,bytes:fs.statSync(output).size,sha256:sha(output),sampleRate:32000,channels:1,duration:+p.format.duration,decodedFloat32Bytes:Math.ceil(+p.format.duration*32000)*4,filter,measured:measure(output)});
}
const manifest={version:1,sources,outputs,encodedBytes:outputs.reduce((n,x)=>n+x.bytes,0),decodedFloat32Bytes:outputs.reduce((n,x)=>n+x.decodedFloat32Bytes,0),audition:{sourceAuditionByAssistant:false,actualGameMixVerified:false,reason:'No auditory input available in this tool session. Signal integrity and graph behavior checked independently; root verifies actual encounter mix.'},limits:{liveFileVoices:3,liveTotalWithFurniture:6},treatment:'Quiet user track at a backbar loudspeaker; low indistinct room company at the occupied snug; exterior rain transmitted through nearest real glass/open door. Sources never emit game noise events. Recording and dialogue duck the continuous room layers and defer furniture contacts. Pause, blur, Source and disposal immediately disconnect voices.'};
if(manifest.decodedFloat32Bytes>60*1024*1024)throw Error('Pub audio bank exceeds 60MiB');
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:outputs.map(({id,file,bytes,duration})=>({id,file,bytes,duration})),encodedBytes:manifest.encodedBytes,decodedFloat32Bytes:manifest.decodedFloat32Bytes},null,2));
