// Small licensed performance palette. Source downloads are preserved in the
// study directory; this producer never downloads or rewrites those recordings.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const out=path.join(ROOT,'public/audio/doors');
const study='artifacts/door-sound-study/source-audio';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(path.join(ROOT,file));
const immutable=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(immutable);Object.freeze(value);}return value;};
const inputs=[
 {id:'775noise-494565',author:'775noise',title:'Shop door bell.wav',num:494565,licence:'CC0 1.0',original:{sampleRate:44100,bits:16,channels:1},changes:'Four independently excited bell excerpts. Each receives the same -1 dB headroom and 2 ms edge fades. Relative recorded levels retained; no pitch/time alteration.'},
 {id:'kranhytt-674791',author:'Kranhytt',title:'small wooden creaking attic door opening slow 2.wav',num:674791,licence:'CC BY 4.0',original:{sampleRate:96000,bits:24,channels:2},changes:'Opening excerpt, mono downmix, 2 ms edge fades; no pitch/time change, EQ or normalization.'},
 {id:'kranhytt-674784',author:'Kranhytt',title:'small wooden creaking attic door closing 1.wav',num:674784,licence:'CC BY 4.0',original:{sampleRate:96000,bits:24,channels:2},changes:'Contact excerpt beginning about 30 ms before the main attack, retaining the recorded settling tail. Mono downmix and 2 ms edge fades; no pitch/time change or normalization.'},
 {id:'kranhytt-674788',author:'Kranhytt',title:'small wooden creaking attic door closing 5.wav',num:674788,licence:'CC BY 4.0',original:{sampleRate:96000,bits:24,channels:2},changes:'Second independently performed contact excerpt with recorded tail. Mono downmix and 2 ms edge fades; no pitch/time change or normalization.'},
 {id:'a-sounds-587337',author:'a-sounds',title:'DOORMetl_Squeaky metal door open and close, different speeds, garden door.wav',num:587337,licence:'CC0 1.0',original:{sampleRate:48000,bits:24,channels:1},changes:'Two real hinge-motion excerpts from the same metal garden door. 5 ms start/25 ms end fades; no pitch, stretch, EQ or normalization. Not an institutional hydraulic-closer recording.'},
 {id:'wlabarron-475312',author:'wlabarron',title:'Push-bar fire door opening',num:475312,licence:'CC0 1.0',original:{sampleRate:44100,codec:'M4A, approximately 120 kb/s',channels:2},changes:'Opening/push-bar excerpt, mono downmix, 2 ms edge fades. Original upload is already lossy; no claim of a lossless master.'},
 {id:'joao-janz-485111',author:'Joao_Janz',title:'Glass Door Closing 1_1',num:485111,licence:'CC0 1.0',original:{sampleRate:48000,bits:24,channels:2},changes:'Main glazed-door seating transient excerpt. Mono downmix, -3 dB export headroom and 2 ms edge fades; no pitch/time alteration. Source author already gain-staged, filtered and de-noised the recording.'},
];
const sources=inputs.map(s=>{
 const sourceFile=`${study}/${s.num}-hq-preview.mp3`,page=`${study}/${s.num}-page.html`,html=read(page).toString();
 const download=html.match(/https:\/\/cdn\.freesound\.org\/previews\/[^\s"<>]+-hq\.mp3/)?.[0];
 const licenceUrl=s.licence==='CC BY 4.0'?'https://creativecommons.org/licenses/by/4.0/':'https://creativecommons.org/publicdomain/zero/1.0/';
 if(!html.includes(licenceUrl)&&!html.includes(licenceUrl.replace('https:','http:')))throw Error(`Missing per-item licence evidence: ${s.id}`);
 return{id:s.id,author:s.author,title:s.title,url:`https://freesound.org/people/${s.author}/sounds/${s.num}/`,licence:s.licence,licenceUrl,changes:s.changes,
  deliveryKind:'freesound-hq-preview',sourceFile,sourceFileSha256:sha(read(sourceFile)),download,
  sourcePage:page,sourcePageSha256:sha(read(page)),originalSpecification:s.original,
  masterAccess:'Original upload not downloaded; source page offers it after login. Production uses the explicitly licensed public MP3 preview.'};
});
const heritageSourceFile=`${study}/bigsoundbank-1270-original.wav`,heritagePage=`${study}/bigsoundbank-1270-page.html`;
if(!read(heritagePage).toString().includes('CC0 (public domain): Free and royalty-free'))throw Error('Missing per-item CC0 evidence for BigSoundBank 1270');
sources.push({id:'bigsoundbank-1270',author:'Joseph SARDIN',title:'Old glass door',url:'https://bigsoundbank.com/old-glass-door-s1270.html',licence:'CC0 1.0',licenceUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
 changes:'One ordered opening/closing performance divided into opening, closing travel and seating excerpts. Uniform -3 dB export headroom and 2 ms edge fades; original 48 kHz retained, PCM24 converted to mono PCM16. No EQ, pitch/time change or normalization. Source has 35 exact full-scale samples and short flat peaks; gain does not repair these. Direction follows the publisher description; native/human timbre acceptance remains pending.',
 deliveryKind:'bigsoundbank-original-bwf',sourceFile:heritageSourceFile,sourceFileSha256:sha(read(heritageSourceFile)),download:'https://bigsoundbank.com/UPLOAD/bwf-en/1270.wav',
 sourcePage:heritagePage,sourcePageSha256:sha(read(heritagePage)),originalSpecification:{sampleRate:48000,bits:24,channels:1},
 masterAccess:'Public original BWF WAV downloaded from the per-item AudioObject link without an account; embedded BWF copyright also states CC0 / WTFPL / Public domain.'});
const sourceById=Object.fromEntries(sources.map(s=>[s.id,s]));
const spec=[
 ...[[.28,1.95],[2.38,4],[4.445,6.1],[6.72,null]].map(([start,end],n)=>({id:`lyric-bell-0${n+1}`,family:'bell',action:'bell',variant:n+1,sourceId:'775noise-494565',start,end,processingGainDb:-1,gainDb:-7,role:'Separate real bell activation; uncalibrated recorded excitation'})),
 {id:'timber-open-01',family:'timber',action:'open',variant:1,sourceId:'kranhytt-674791',start:0,end:null,gainDb:0,role:'Old light timber opening; runtime must stop the movement sound when the leaf stops'},
 {id:'timber-close-01',family:'timber',action:'close',variant:1,sourceId:'kranhytt-674784',start:.58,end:null,gainDb:-3,role:'Seating contact and retained settling tail; main attack about 30 ms after excerpt start'},
 {id:'timber-close-02',family:'timber',action:'close',variant:2,sourceId:'kranhytt-674788',start:.19,end:null,gainDb:-3,role:'Independent same-door seating contact and tail; main attack about 30 ms after excerpt start'},
 {id:'metal-hinge-01',family:'metal',action:'motionClose',variant:1,sourceId:'a-sounds-587337',start:5.32,end:7.05,gainDb:-10,fadeIn:.005,fadeOut:.025,role:'Actual metal garden hinge; direction and physical force are not calibrated. Runtime gates it to actual movement.'},
 {id:'metal-hinge-02',family:'metal',action:'motionClose',variant:2,sourceId:'a-sounds-587337',start:24.55,end:26.05,gainDb:-10,fadeIn:.005,fadeOut:.025,role:'Second real same-door hinge gesture; runtime movement gate required'},
 {id:'pushbar-open-01',family:'pushbar',action:'open',variant:1,sourceId:'wlabarron-475312',start:.10,end:null,gainDb:-6,role:'Real fire-door push-bar/opening action; no additional invented hydraulic hiss'},
 {id:'glazed-close-01',family:'glazed',action:'close',variant:1,sourceId:'joao-janz-485111',start:.16,end:.72,processingGainDb:-3,gainDb:-7,role:'Main glass-door seat, approximately 30 ms before contact attack; not glass breakage'},
 {id:'heritage-glass-open-01',family:'heritage-glazed',action:'open',variant:1,sourceId:'bigsoundbank-1270',start:.12,end:2.45,sampleRate:48000,processingGainDb:-3,gainDb:-16,role:'Opening and handling of the same old glass door; narrowly matched to the existing mahogany/glass public pair. Publisher-described action order; timbre acceptance pending.'},
 {id:'heritage-glass-motion-01',family:'heritage-glazed',action:'motionClose',variant:1,sourceId:'bigsoundbank-1270',start:3.90,end:4.86,sampleRate:48000,processingGainDb:-3,gainDb:-16,role:'Closing travel before the main seating impact, from the same old glass performance. Movement-gated; no invented closer or force variation.'},
 {id:'heritage-glass-close-01',family:'heritage-glazed',action:'close',variant:1,sourceId:'bigsoundbank-1270',start:4.86,end:5.85,sampleRate:48000,processingGainDb:-3,gainDb:-7,role:'Main seating impact and settling tail from the same old glass performance; principal contact about 40 ms after excerpt start.'},
];
const families={
 bell:{bell:spec.filter(s=>s.family==='bell').map(s=>s.id)},
 timber:{open:['timber-open-01'],close:['timber-close-01','timber-close-02']},
 metal:{open:['legacy-open'],close:['legacy-close'],motionClose:['metal-hinge-01','metal-hinge-02']},
 glazed:{open:['legacy-open'],close:['glazed-close-01']},
 'heritage-glazed':{open:['heritage-glass-open-01'],motionClose:['heritage-glass-motion-01'],close:['heritage-glass-close-01']},
 pushbar:{open:['pushbar-open-01'],close:['legacy-close']},
 legacy:{open:['legacy-open'],close:['legacy-close'],key:['legacy-key']},
};
const familyStatus={
 bell:{status:'Four selected real activations',variation:4,limits:'Source recording is public HQ MP3 preview; no measured force calibration.'},
 timber:{status:'New same-door opening and two seating performances',limits:'Light attic-door identity is not a recording of Ellery’s heavy acoustic leaves. Native timbre acceptance pending; movement voices must stop when leaf motion stops.'},
 metal:{status:'New motion gestures; inherited opening/seat contacts',limits:'Garden hinge is not a goods-door weight or a quiet hydraulic closer. It is kept low and movement-gated; heavy-door timbre acceptance pending.'},
 glazed:{status:'New actual glazed seating contact; inherited opening',limits:'One performed close only; no fake pitch-shifted alternate. Coherent full glass-door session remains an explicit gap.'},
 'heritage-glazed':{status:'One coherent original old-glass opening, closing travel and seating session',limits:'Narrowly matched to mahogany/glass public doors only. One performance, not calibrated force variants. Publisher-described action order; native/human timbre acceptance pending. Original has 35 exact full-scale samples and short flat peaks, not repaired by uniform -3 dB headroom. Not a hydraulic closer, pool or wired-glass source.'},
 pushbar:{status:'New actual push-bar/opening; inherited closure',limits:'Candidate new fire slam rejected because of severe decoded overshoot/limited waveform. Full quiet-closer family remains a gap.'},
};
function analyse(file,sampleRate=44100){
 const raw=execFileSync('ffmpeg',['-v','error','-i',file,'-ac','1','-ar',String(sampleRate),'-f','f32le','-'],{maxBuffer:32*1024*1024});
 let peak=0,sq=0,over=0;for(let i=0;i<raw.length;i+=4){const v=raw.readFloatLE(i);if(!Number.isFinite(v))throw Error('Non-finite audio sample');peak=Math.max(peak,Math.abs(v));sq+=v*v;if(Math.abs(v)>=1)over++;}
 const db=v=>v>0?Number((20*Math.log10(v)).toFixed(4)):null;
 return{durationSeconds:raw.length/4/sampleRate,sampleRate,channels:1,peakDbFS:db(peak),rmsDbFS:db(Math.sqrt(sq/(raw.length/4))),samplesAtOrAboveFullScale:over};
}
fs.mkdirSync(out,{recursive:true});const clips=[];
for(const s of spec){
 const source=sourceById[s.sourceId],sampleRate=s.sampleRate??44100,target=path.join(out,`${s.id}.wav`),sourceStats=analyse(path.join(ROOT,source.sourceFile),sampleRate);
 const end=s.end??sourceStats.durationSeconds,duration=end-s.start;if(!(duration>0&&s.start>=0&&end<=sourceStats.durationSeconds+.001))throw Error(`Invalid excerpt: ${s.id}`);
 const fadeIn=s.fadeIn??.002,fadeOut=s.fadeOut??.002,processingGainDb=s.processingGainDb??0;
 const filters=[`volume=${processingGainDb}dB`,`afade=t=in:st=0:d=${fadeIn}`,`afade=t=out:st=${Math.max(0,duration-fadeOut)}:d=${fadeOut}`];
 execFileSync('ffmpeg',['-v','error','-y','-ss',String(s.start),'-i',path.join(ROOT,source.sourceFile),'-t',String(duration),'-ac','1','-ar',String(sampleRate),'-af',filters.join(','),'-c:a','pcm_s16le','-map_metadata','-1',target]);
 const bytes=fs.readFileSync(target),stats=analyse(target,sampleRate);if(stats.samplesAtOrAboveFullScale)throw Error(`Export clips full-scale samples: ${s.id}`);
 clips.push({id:s.id,url:`audio/doors/${s.id}.wav`,family:s.family,action:s.action,variant:s.variant,sourceId:s.sourceId,
  sourceFile:source.sourceFile,sourceFileSha256:source.sourceFileSha256,sourceStartSeconds:s.start,sourceEndSeconds:end,
  processingGainDb,gainDb:s.gainDb,edgeFadesSeconds:{in:fadeIn,out:fadeOut},sha256:sha(bytes),bytes:bytes.length,...stats,
  sourceRole:s.role,forceCategory:null,pitchOrTimeVariation:false,deliveryKind:source.deliveryKind==='bigsoundbank-original-bwf'?'original-bwf-derived':'freesound-hq-preview-derived',
  listeningStatus:'Source-described identity and measured excerpt; no claim of independent/native timbre acceptance.'});
}
const inherited=[
 {id:'legacy-open',url:'audio/game/door_close.mp3',family:'legacy',action:'open',gainDb:0},
 {id:'legacy-close',url:'audio/game/door_close.mp3',family:'legacy',action:'close',gainDb:0},
 {id:'legacy-key',url:'audio/game/the_key_turns.mp3',family:'legacy',action:'key',gainDb:0},
].map(s=>({...s,sha256:sha(read(`public/${s.url}`)),bytes:read(`public/${s.url}`).length,deliveryKind:'inherited-project-fallback',sourceId:'inherited-project-audio',
 provenance:'Existing shipped project cue, preserved where no convincing new recording is available. External provenance not re-established by this task.'}));
const assets=Object.fromEntries([...clips,...inherited].map(c=>[c.id,c]));
const manifest={schema:1,generatedBy:'tools/chunk_surfer/prepare-door-audio.mjs',date:'2026-10-28',
 purpose:'A small real-performance palette for physical door events, with explicit partial-family inherited fallbacks.',
 sources,clips,inheritedAssets:inherited,families,familyStatus,
 measurement:'Mono decoded sample peak and ungated full-excerpt RMS. These are not oversampled true peak, perceived loudness or measured door force.',
 preparation:'Public MP3 previews decoded to 44.1kHz mono PCM16 WAV; original old-glass BWF retains 48kHz when converted from PCM24 to mono PCM16. Trim, uniform per-source headroom where specified, and small edge fades only. No normalization, EQ, pitch, time stretch, generated variation or baked reverb.',
 sourceIntegrity:sources.every(s=>sha(read(s.sourceFile))===s.sourceFileSha256),
 totalNewBytes:clips.reduce((n,c)=>n+c.bytes,0),totalNewDurationSeconds:clips.reduce((n,c)=>n+c.durationSeconds,0)};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const generated=`// GENERATED by tools/chunk_surfer/prepare-door-audio.mjs.\n// File gain is already applied; gainDb is runtime playback attenuation only.\nconst freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};\nexport const DOOR_AUDIO_ASSETS=freeze(${JSON.stringify(assets,null,2)});\nexport const DOOR_AUDIO_FAMILIES=freeze(${JSON.stringify(families,null,2)});\nexport const DOOR_AUDIO_FAMILY_STATUS=freeze(${JSON.stringify(familyStatus,null,2)});\nexport const DOOR_AUDIO_SOURCES=freeze(${JSON.stringify(sources,null,2)});\n`;
fs.writeFileSync(path.join(ROOT,'src/data/door-audio-assets.js'),generated);
fs.writeFileSync(path.join(ROOT,'artifacts/door-sound-study/production-audio-build.json'),JSON.stringify({schema:1,date:manifest.date,
 sourceManifest:'public/audio/doors/manifest.json',manifestSha256:sha(fs.readFileSync(path.join(out,'manifest.json'))),
 moduleSha256:sha(Buffer.from(generated)),producerSha256:sha(read('tools/chunk_surfer/prepare-door-audio.mjs')),
 newFiles:clips.length,newBytes:manifest.totalNewBytes,sourceIntegrity:manifest.sourceIntegrity,
 boundaries:familyStatus,rejectedNewClosure:{source:'https://freesound.org/people/wlabarron/sounds/475313/',
 decodedMonoPeakDbFS:3.841,atOrOverFullScaleSamples:2693,totalDecodedSamples:60416,
 reason:'4.4574% decoded mono samples reach/exceed full scale. This is not proof from overshoot alone of audible clipping, but fails the conservative quality comparison; do not replace a known inherited closure with it.'}},null,2)+'\n');
console.log(JSON.stringify({newFiles:clips.length,newBytes:manifest.totalNewBytes,sources:sources.length,ids:clips.map(c=>c.id),sourceIntegrity:manifest.sourceIntegrity}));
