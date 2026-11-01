// Offline only. The selected CC0 human word keeps its original pitch/speed.
// Grain and a finite authored room tail are baked; Source owns runtime audio.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {bitcrush,levelMatch} from './stop-listening-dsp.mjs';
import {stopListeningImpulse,STOP_LISTENING_REVERB} from '../../src/audio/stop-listening-gut.js';

const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'public/audio/threshold-gag');
const sourceFolder=resolve(root,'assets/threshold-gag-audio-source'),review=resolve(root,'artifacts/ellery-threshold-gag');
const booOnly=process.argv.includes('--boo-only');
// A local override: the shared ear-room profiles retain their own authored
// treatment. Keep the selected human performance and room response intact.
const booCrush=Object.freeze({bits:6,rate:18000,mix:.98});
for(const folder of [out,sourceFolder,review])mkdirSync(folder,{recursive:true});
const run=(program,args)=>{const r=spawnSync(program,args,{encoding:'utf8'});if(r.status!==0)throw Error(`${program}: ${r.stderr}`);return r.stdout;};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const rawFile=resolve(sourceFolder,'En-us-boo.ogg');
if(sha(rawFile)!=='371374c5a5b22e3775dab17c7d7c76745d846f9b6339f3913359c2ebc4acd59e')throw Error('Approved Dinoroki human original changed.');
const decode=(file,rate=24000)=>{
 const r=spawnSync('ffmpeg',['-v','error','-i',file,'-f','f32le','-acodec','pcm_f32le','-ac','1','-ar',String(rate),'-'],{maxBuffer:4000000});if(r.status!==0)throw Error(String(r.stderr));
 return new Float32Array(new Uint8Array(r.stdout).buffer);
};
const inspect=(file,rate=24000)=>{
 const samples=decode(file,rate);let peak=0,sum=0,last=0,first=-1;
 for(let i=0;i<samples.length;i++){const value=Math.abs(samples[i]);if(!Number.isFinite(value))throw Error('Non-finite sample');peak=Math.max(peak,value);sum+=value*value;if(value>.0003){if(first<0)first=i;last=i;}}
 return{seconds:samples.length/rate,analysisSampleRate:rate,analysisChannels:1,analysisMethod:'FFmpeg mono decode; stereo originals/IR use FFmpeg channel fold for this diagnostic only.',peakDbFS:20*Math.log10(Math.max(1e-12,peak)),rmsDbFS:10*Math.log10(Math.max(1e-12,sum/samples.length)),firstAudibleSeconds:Math.max(0,first)/rate,lastAudibleSeconds:last/rate};
};
const metadata=file=>({file:file.startsWith(out+'/')?file.slice(out.length+1):file.slice(root.length+1),sha256:sha(file),bytes:readFileSync(file).byteLength,...inspect(file)});
const rate=48000,seed=0x454c4c59,shape=STOP_LISTENING_REVERB.main_b3;
let randomState=seed;
const random=()=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return(randomState>>>0)/4294967296;};
const context={sampleRate:rate,createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{numberOfChannels:channels,length,sampleRate,getChannelData:i=>data[i]};}};
const ir=stopListeningImpulse(context,shape,random);
// ConvolverNode.normalize RMS calibration, before folding the stereo response
// to one local HRTF emitter. Authored noise/reflections, never a measurement.
let power=0;for(let ch=0;ch<2;ch++)for(const v of ir.getChannelData(ch))power+=v*v;
power=Math.max(.000125,Math.sqrt(power/(2*ir.length)));
const normalizationScale=.00125*44100/rate/power;
const irStereo=new Float32Array(ir.length*2),irMono=new Float32Array(ir.length);
for(let i=0;i<ir.length;i++){for(let ch=0;ch<2;ch++)irStereo[i*2+ch]=ir.getChannelData(ch)[i];irMono[i]=(ir.getChannelData(0)[i]+ir.getChannelData(1)[i])*.5*normalizationScale;}

const temp=mkdtempSync(resolve(tmpdir(),'ellery-threshold-audio-'));
let convolutionStats;
try{
 run('ffmpeg',['-v','error','-y','-i',rawFile,'-map_metadata','-1','-c:a','pcm_s24le',resolve(out,'boo-human-source.wav')]);
 const clean=resolve(sourceFolder,'boo-clean-edit.wav');
 // Full accepted word/breath timing; only speaker bandwidth/level/edge fades.
 run('ffmpeg',['-v','error','-y','-i',rawFile,'-map_metadata','-1','-af','highpass=f=100:p=2,lowpass=f=8000:p=2,volume=0.63,afade=t=in:d=0.002,afade=t=out:st=0.4564:d=0.008','-ac','1','-ar',String(rate),'-c:a','pcm_s24le',clean]);
 const cleanSamples=decode(clean,rate),crushed=levelMatch(bitcrush(cleanSamples,rate,booCrush),cleanSamples);
 const dryPath=resolve(temp,'crushed.f32'),irPath=resolve(temp,'impulse.f32'),stereoPath=resolve(temp,'impulse-stereo.f32'),mixPath=resolve(temp,'mix.f32'),wetPath=resolve(temp,'wet.f32');
 writeFileSync(dryPath,Buffer.from(crushed.buffer));writeFileSync(irPath,Buffer.from(irMono.buffer));writeFileSync(stereoPath,Buffer.from(irStereo.buffer));
 run('ffmpeg',['-v','error','-y','-f','f32le','-ar',String(rate),'-ac','1','-i',dryPath,'-map_metadata','-1','-c:a','pcm_s24le',resolve(sourceFolder,'boo-crushed-dry.wav')]);
 run('ffmpeg',['-v','error','-y','-f','f32le','-ar',String(rate),'-ac','2','-i',stereoPath,'-map_metadata','-1','-c:a','pcm_f32le',resolve(sourceFolder,'main-b3-authored-impulse.wav')]);
 // Full finite linear convolution; preserve all .456 s after the last sample.
 const py=`import sys,json,numpy as np\nx=np.fromfile(sys.argv[1],dtype='<f4').astype(np.float64)\nh=np.fromfile(sys.argv[2],dtype='<f4').astype(np.float64)\nn=len(x)+len(h)-1\nk=1 << (n-1).bit_length()\nr=np.fft.irfft(np.fft.rfft(x,k)*np.fft.rfft(h,k),k)[:n]\nw=r*float(sys.argv[4])\n# Stable signal-energy window, not a claim to speech recognition.\nblock=960\nlevels=np.array([np.sqrt(np.mean(x[i:i+block]**2)) for i in range(0,len(x),block)])\nactive=np.flatnonzero(levels>=max(levels)*10**(-24/20))\na=int(active[0]*block); b=min(len(x),int((active[-1]+1)*block))\ndry_rms=np.sqrt(np.mean(x[a:b]**2)); wet_before=np.sqrt(np.mean(w[a:b]**2))\ntarget_db=-18.0\ngain=float(10**(target_db/20)*dry_rms/max(wet_before,1e-12))\nw*=gain\n# Full IR duration retained, final numerical response brought to zero.\nf=min(240,len(w)); w[-f:]*=np.linspace(1,0,f)\ny=w.copy(); y[:len(x)]+=x\nassert np.max(np.abs(y))<10**(-3/20), 'Wet-only calibration exhausted headroom'\ny.astype('<f4').tofile(sys.argv[3]); w.astype('<f4').tofile(sys.argv[5])\nwet_after=np.sqrt(np.mean(w[a:b]**2))\ndb=lambda v:float(20*np.log10(max(v,1e-12)))\nprint(json.dumps({'fullConvolutionSamples':n,'fftSize':k,'dryGain':1.0,'postMixRmsMatchGain':1.0,'responseCalibrationGain':gain,'responseCalibrationGainDb':db(gain),'wetSend':float(sys.argv[4]),'targetActiveWetToDryDb':target_db,'activeWindowMethod':'20 ms dry-RMS blocks within 24 dB of strongest block; first through last qualifying block','activeWindowStartSeconds':a/48000,'activeWindowEndSeconds':b/48000,'activeDryRmsDbFS':db(dry_rms),'uncalibratedActiveWetRmsDbFS':db(wet_before),'calibratedActiveWetRmsDbFS':db(wet_after),'actualActiveWetToDryDb':db(wet_after/dry_rms),'retainedTailSeconds':(len(h)-1)/48000,'finite':bool(np.all(np.isfinite(y)))}))`;
 convolutionStats=JSON.parse(run('python3',['-c',py,dryPath,irPath,mixPath,String(shape.wet),wetPath]));
 run('ffmpeg',['-v','error','-y','-f','f32le','-ar',String(rate),'-ac','1','-i',wetPath,'-map_metadata','-1','-c:a','pcm_s24le',resolve(sourceFolder,'boo-wet-response.wav')]);
 run('ffmpeg',['-v','error','-y','-f','f32le','-ar',String(rate),'-ac','1','-i',mixPath,'-map_metadata','-1','-ar','24000','-c:a','pcm_s16le',resolve(out,'boo.wav')]);
 copyFileSync(resolve(out,'boo.wav'),resolve(review,'boo-approved-treated-preview.wav'));
 copyFileSync(clean,resolve(review,'boo-approved-clean-preview.wav'));
}finally{rmSync(temp,{recursive:true,force:true});}

const derivatives=[
 {id:'hinge',source:'public/audio/doors/metal-hinge-01.wav',from:.12,seconds:.205,fadeIn:.004,fadeOut:.025,filter:'highpass=f=160:p=2,lowpass=f=4200:p=2',gain:.50},
 {id:'wood-stop',source:'public/audio/doors/timber-close-01.wav',from:.018,seconds:.245,fadeIn:.002,fadeOut:.035,filter:'highpass=f=110:p=2,lowpass=f=4800:p=2',gain:1},
 {id:'settle',source:'public/audio/doors/timber-close-01.wav',from:.24,seconds:.185,fadeIn:.005,fadeOut:.04,filter:'highpass=f=130:p=2,lowpass=f=3500:p=2',gain:1},
];
if(!booOnly)for(const c of derivatives)run('ffmpeg',['-v','error','-y','-ss',String(c.from),'-i',resolve(root,c.source),'-t',String(c.seconds),'-af',`${c.filter},volume=${c.gain},afade=t=in:d=${c.fadeIn},afade=t=out:st=${c.seconds-c.fadeOut}:d=${c.fadeOut}`,'-ac','1','-ar','24000','-c:a','pcm_s16le',resolve(out,c.id+'.wav')]);
const inherited=JSON.parse(readFileSync(resolve(root,'public/audio/doors/manifest.json'),'utf8')).sources.filter(s=>['a-sounds-587337','kranhytt-674784'].includes(s.id));
const clips=['boo','hinge','wood-stop','settle'].map(id=>({id,...metadata(resolve(out,id+'.wav')),...(derivatives.find(d=>d.id===id)||{})}));
const recipe={schema:1,source:'En-us-boo.ogg',sampleRate:rate,sourceTrim:false,pitchOrTimeChange:false,
 cleanEdit:{highpassHz:100,lowpassHz:8000,gain:.63,attackSeconds:.002,releaseSeconds:.008,releaseAtSeconds:.4564,channels:1},
 bitcrush:{module:'tools/chunk_surfer/stop-listening-dsp.mjs',function:'bitcrush',profile:'boo-heavy',...booCrush,rmsMatchedToClean:true,change:'User requested more bitcrushing after the 9-bit/24 kHz/.86 derivative. Local 6-bit signed quantization, 18 kHz independent hold clock and .98 crushed mix; preserve selected human timing/pitch and shared ear-room profiles.'},
 reverb:{module:'src/audio/stop-listening-gut.js',function:'stopListeningImpulse',profile:'main_b3',...shape,seed,random:'xorshift32',irChannels:2,emitterChannels:1,normalizationScale,normalizationReference:'https://www.w3.org/TR/webaudio/#dom-convolvernode-normalize',method:'Synthesized decaying-noise/early-reflection IR, deterministically authored. Not measured; not a recording of this room. Mono fold of normalized stereo IR before convolution; one physical HRTF emitter at runtime. Wet-only response gain is calibrated after normalization to -18 dB active-window RMS relative to dry; 0.14 send, IR shape and dry level stay fixed.',wetIsAdditive:true,normalization:'ConvolverNode RMS calibration (.00125 * 44100 / sampleRate / max(.000125, IR_RMS)), followed by separately stated wet response gain.',wetResponse:metadata(resolve(sourceFolder,'boo-wet-response.wav')),...convolutionStats},
 output:{file:'public/audio/threshold-gag/boo.wav',sampleRate:24000,bits:16,channels:1,finiteTailFadeSeconds:.005}};
writeFileSync(resolve(sourceFolder,'processing-recipe.json'),JSON.stringify(recipe,null,2)+'\n');
const credits={schema:2,generatedBy:'tools/chunk_surfer/build-threshold-gag-audio.mjs',date:'2026-10-31',purpose:'One small mechanical joke: mounted release, timber contact, settling and a slightly late human boo through established grain and compact authored room tail. No horror sting or threat cue.',
 voice:{text:'boo.',phoneticIntent:'/buː/',method:'Recorded human pronunciation by Dinoroki, original own-work CC0 upload. User selected the short take after audition; no TTS, AI voice, clone, pitch manipulation or time stretching.',author:'Dinoroki',credit:'Boo pronunciation by Dinoroki (En-us-boo.ogg), CC0 1.0, Wikimedia Commons. Speaker edit, game bitcrushing and authored reverb by Chunk Surfer.',title:'En-us-boo.ogg',sourceUrl:'https://commons.wikimedia.org/wiki/File:En-us-boo.ogg',downloadUrl:'https://upload.wikimedia.org/wikipedia/commons/5/5d/En-us-boo.ogg',sourcePublished:'2024-04-13',retrieved:'2026-10-31',license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',authorPermissionEvidence:'Primary Commons file page identifies Dinoroki as author, own work, and explicitly CC0 1.0; original SHA1 matches Commons metadata.',outputStatus:'Selected human source with requested bitcrushing/reverb. Original upload is compressed OGG; no raw microphone/PCM master was available. Retained WAV is a decode, not an original recording master.',original:{...metadata(rawFile),sha1:'8c7b1496e52001ea6841db97fbf51a5f94d37e52',channels:2,sampleRate:44100,container:'Ogg Vorbis'},sourceLicensePage:{file:'assets/threshold-gag-audio-source/dinoroki-source-page.html',sha256:sha(resolve(sourceFolder,'dinoroki-source-page.html'))},unprocessed:{...metadata(resolve(out,'boo-human-source.wav')),sampleRate:44100,bits:24,channels:2,description:'Unmodified decode of selected original; no filtering, level, timing, pitch or performance change.'},cleanEdit:metadata(resolve(sourceFolder,'boo-clean-edit.wav')),crushedDry:metadata(resolve(sourceFolder,'boo-crushed-dry.wav')),authoredImpulse:metadata(resolve(sourceFolder,'main-b3-authored-impulse.wav')),processing:{...recipe,pitchOrTimeChange:false},screening:{selected:'User explicitly selected the shorter Dinoroki human audition and requested the existing bitcrushing/reverb stack.',rejected:[{title:'eSpeak boo',reason:'User rejected synthetic speech.'},{title:'JeanMyna_VA take 3',reason:'User: Still too performed; find a flatter take. Originals retained under artifacts as rejected research; excluded from shipping source folder.'},{title:'Dull Boo',author:'JelloApocalypse',url:'https://freesound.org/people/JelloApocalypse/sounds/802628/',reason:'Original CC BY-NC 4.0 is outside the requested commercially usable licenses; mirror claims were not treated as permission.'}],listening:'Human authoring selection is established for the clean short source. No agent listening or final processed/in-game listening acceptance claimed.'}},
 mechanicalSources:inherited,mechanicalChanges:'Unchanged original-pitch excerpts of existing licensed project doors; bounded filters, mono 24k PCM, fades and stated gain. Assembly surrogates, not recordings of this apparatus.',click:{method:'Runtime finite synthesized bipolar contact, 14 ms; no recorded source or scare dispatcher.'},clips,
 bank:{runtimeClipCount:clips.length,encodedBytes:clips.reduce((s,c)=>s+c.bytes,0),decodedSeconds:clips.reduce((s,c)=>s+c.seconds,0),sourceAndReviewFilesExcludedFromRuntimeLoading:true},
 acceptance:{sourceListening:'The user selected Dinoroki\'s short human take after audition. This does not establish processed mix/in-game acceptance.',runtime:'Current human+DSP actual-game capture and listening review required. Offline levels/finite signal checks establish technical limits only.'}};
writeFileSync(resolve(out,'credits.json'),JSON.stringify(credits,null,2)+'\n');
writeFileSync(resolve(review,'audio-provenance.json'),JSON.stringify(credits,null,2)+'\n');
console.log(JSON.stringify({bank:credits.bank,clips:clips.map(({id,seconds,bytes,sha256,peakDbFS,rmsDbFS})=>({id,seconds,bytes,sha256,peakDbFS,rmsDbFS}))},null,2));
