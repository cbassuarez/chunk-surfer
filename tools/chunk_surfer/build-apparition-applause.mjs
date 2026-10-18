#!/usr/bin/env node
// One recorded applause cue. Sources remain inspectable; signal measurements do
// not establish applause recognition, perceived scale or fresh-player success.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ASSETS=path.join(ROOT,'public/assets/apparition-applause');
const RENDERS=path.join(ROOT,'artifacts/apparition-applause/renders');
const CONFIG={
  id:'hall-addressed-audience-v3',rate:48000,duration:5,referenceListener:{x:0,y:6,yaw:0},
  dry:1,referenceDistance:3,rolloff:.09,wetRolloff:.025,wetPanWidth:.35,
  targetLufs:-27,peakCeilingDbtp:-9,
  sources:[
    {id:'hand-a',file:'artifacts/apparition-applause/materials-v2/freepats/01_02.flac',family:'hand',license:'CC0-1.0'},
    {id:'hand-b',file:'artifacts/apparition-applause/materials-v2/freepats/01_03.flac',family:'hand',license:'CC0-1.0'},
    {id:'hand-c',file:'artifacts/apparition-applause/materials-v2/freepats/01_05.flac',family:'hand',license:'CC0-1.0'},
    {id:'hand-late',file:'artifacts/apparition-applause/materials-v2/freepats/01_06.flac',family:'hand',license:'CC0-1.0'},
    {id:'ensemble',file:'artifacts/apparition-applause/materials/v2/dorian-clair-applause-2363-original.wav',family:'ensemble',license:'CC0-1.0',offset:.825,duration:1.55,fadeIn:.006,fadeOut:.014},
  ],
  contacts:[
    {id:'lead-1',source:'hand-a',lane:'lead-a',treatment:0,ordinary:0,gain:.86,wet:{ordinary:.18,treatment:.12}},
    {id:'lead-2',source:'hand-b',lane:'lead-b',treatment:.48,ordinary:.36,gain:.68,wet:{ordinary:.18,treatment:.12}},
    {id:'lead-3',source:'hand-c',lane:'lead-c',treatment:.565,ordinary:.72,gain:.78,wet:{ordinary:.18,treatment:.12}},
    {id:'audience',source:'ensemble',lane:'ensemble',treatment:.60,ordinary:.80,gain:.82,wet:{ordinary:.10,treatment:.06}},
    {id:'late-hand',source:'hand-late',lane:'lead-a',treatment:2.38,ordinary:3.38,gain:.60,wet:{ordinary:.18,treatment:.12}},
  ],
  meetingWindow:.52,kilnWindow:.88,impulseEndFade:.04,treatmentMeetingWeight:.85,treatmentKilnWeight:.14,
  crush:{bits:11,sampleRate:18000,mix:.12,antialiasCutoff:.90,filterSize:64,branchFadeIn:.002,branchFadeOut:.004},
  comparison:'Full authored-package comparison: timing, reflection send and treatment-only crush differ. Same original identities, excerpts and counts; this does not isolate the DSP effect.',
};
fs.mkdirSync(ASSETS,{recursive:true});fs.mkdirSync(RENDERS,{recursive:true});
const PYTHON=String.raw`
import hashlib,json,math,pathlib,re,subprocess,sys,wave
import numpy as np
j=json.load(sys.stdin);c=j['config'];root=pathlib.Path(j['root']);assets=pathlib.Path(j['assets']);renders=pathlib.Path(j['renders']);rate=c['rate'];frames=round(c['duration']*rate)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',str(p),'-af','pan=mono|c0=c0','-ar',str(rate),'-f','f64le','pipe:1'],check=True,capture_output=True).stdout,dtype='<f8').copy()
def write(p,x,bits=16):
 x=np.asarray(x,dtype=np.float64);x=x[:,None] if x.ndim==1 else x
 if not np.isfinite(x).all() or np.max(np.abs(x),initial=0)>=1:raise ValueError('clipped/nonfinite '+str(p))
 ints=np.rint(x*(2**(bits-1)-1)).astype('<i4');data=ints.astype('<i2').tobytes() if bits==16 else ints.reshape(-1).view(np.uint8).reshape(-1,4)[:,:3].tobytes()
 with wave.open(str(p),'wb') as w:w.setnchannels(x.shape[1]);w.setsampwidth(bits//8);w.setframerate(rate);w.writeframes(data)
def fade(x,seconds,both=False):
 x=x.copy();n=min(len(x)//2,round(seconds*rate));a=.5*(1-np.cos(np.linspace(0,np.pi,n)))
 if both:x[:n]*=a
 x[-n:]*=a[::-1];return x
def edge_fades(x,attack,release):
 x=x.copy();n=min(len(x)//2,round(attack*rate));m=min(len(x)//2,round(release*rate))
 if n:x[:n]*=.5*(1-np.cos(np.linspace(0,np.pi,n)))
 if m:x[-m:]*=.5*(1+np.cos(np.linspace(0,np.pi,m)))
 return x
def resample(x,from_rate,to_rate):
 af=f"aresample={to_rate}:filter_size={c['crush']['filterSize']}:phase_shift=10:linear_interp=0:cutoff={c['crush']['antialiasCutoff']}"
 p=subprocess.run(['ffmpeg','-v','error','-f','f64le','-ar',str(from_rate),'-ac','1','-i','pipe:0','-af',af,'-f','f64le','pipe:1'],input=np.asarray(x,dtype='<f8').tobytes(),capture_output=True,check=True)
 return np.frombuffer(p.stdout,dtype='<f8').copy()
def crush(x):
 low=resample(x,rate,c['crush']['sampleRate']);scale=2**(c['crush']['bits']-1)-1;quantized=np.rint(np.clip(low,-1,1)*scale)/scale
 branch=resample(quantized,c['crush']['sampleRate'],rate)
 branch=np.pad(branch,(0,max(0,len(x)-len(branch))))[:len(x)]
 return edge_fades(branch,c['crush']['branchFadeIn'],c['crush']['branchFadeOut'])
def db_rms(x):return 20*np.log10(max(1e-15,float(np.sqrt(np.mean(x*x)))))
def high_fraction(x):
 power=np.abs(np.fft.rfft(x))**2;freq=np.fft.rfftfreq(len(x),1/rate);return float(np.sum(power[freq>9000])/max(1e-30,np.sum(power)))
def conv(a,b):
 n=len(a)+len(b)-1;size=1<<(n-1).bit_length();return np.fft.irfft(np.fft.rfft(a,size)*np.fft.rfft(b,size),size)[:n]
def measure(x):
 p=subprocess.run(['ffmpeg','-v','info','-f','f32le','-ar',str(rate),'-ac','2','-i','pipe:0','-af','loudnorm=I=-27:TP=-9:LRA=7:print_format=json','-f','null','-'],input=np.asarray(x,dtype='<f4').tobytes(),capture_output=True,check=True)
 d=json.loads(re.findall(r'\{\s*"input_i".*?\}',p.stderr.decode(),re.S)[-1]);return {'integratedLufs':float(d['input_i']),'truePeakDbtp':float(d['input_tp']),'loudnessRangeLu':float(d['input_lra'])}
originals={s['id']:read(root/s['file']) for s in c['sources']};family_gains={family:10**(-12/20)/max(np.max(np.abs(originals[s['id']])) for s in c['sources'] if s['family']==family) for family in ('hand','ensemble')}
sources={};source_report=[];crush_report=[];clean_sources={};clean_weight=1-c['crush']['mix']
for s in c['sources']:
 original=root/s['file'];x=originals[s['id']];start=round(s.get('offset',0)*rate);x=x[start:start+round(s.get('duration',len(x)/rate)*rate)].copy();end_fade=0
 if s['family']=='hand' and abs(x[-1])>1e-7:x=fade(x,.004);end_fade=.004
 if s['family']=='ensemble':x=edge_fades(x,s['fadeIn'],s['fadeOut']);end_fade=s['fadeOut']
 x*=family_gains[s['family']];target=assets/(s['id']+'-v3-clean-48k.wav');write(target,x,24);sources[s['id']]=read(target);clean_sources[s['id']]=sources[s['id']]
 common={**s,'sourceIdentity':s['id'],'sourceSha256':sha(original),'duration':len(x)/rate,'sampleRate':rate,'channels':1,'commonFamilyGainDb':20*np.log10(family_gains[s['family']]),'endFadeSeconds':end_fade}
 source_report.append({**common,'url':'/assets/apparition-applause/'+target.name,'runtimeFile':str(target.relative_to(root)),'sha256':sha(target),'bytes':target.stat().st_size,'condition':'ordinary','changes':'Complete released hand tail retained; common family gain; conditional 4 ms end taper only; no attack edit.' if s['family']=='hand' else 'Exact original 0.825–2.375 s excerpt; common family gain; 6 ms onset / 14 ms release cosine fades; no time stretch or pitch change.'})
 processed=crush(sources[s['id']]);mixed=clean_weight*sources[s['id']]+c['crush']['mix']*processed
 target=assets/(s['id']+'-v3-treatment-48k.wav');write(target,mixed,24);mixed=read(target);sources[s['id']+'-treatment']=mixed
 source_report.append({**common,'id':s['id']+'-treatment','url':'/assets/apparition-applause/'+target.name,'runtimeFile':str(target.relative_to(root)),'sha256':sha(target),'bytes':target.stat().st_size,'condition':'treatment','changes':'Identical clean excerpt/body plus deterministic 12% parallel branch: 48→18 kHz antialias resampling, 11-bit nearest quantization, band-limited 18→48 kHz return; branch-only 2/4 ms edge fades. 88% original clean waveform remains. No pitch shift, synthetic excitation or hard sample hold.'})
 delta=mixed-clean_sources[s['id']];clean=clean_sources[s['id']]
 crush_report.append({'sourceIdentity':s['id'],'frames':len(clean),'mixedFrames':len(mixed),'cleanMixedCorrelation':float(np.dot(clean,mixed)/np.sqrt(np.dot(clean,clean)*np.dot(mixed,mixed))),'differenceRmsDbfs':db_rms(delta),'differenceRelativeToCleanRmsDb':db_rms(delta)-db_rms(clean),'mixedPeakDeltaDb':20*np.log10(np.max(np.abs(mixed))/np.max(np.abs(clean))),'globalPeakIndexDifferenceSamples':int(np.argmax(np.abs(mixed)))-int(np.argmax(np.abs(clean))),'globalPeakIndexNote':'The largest peak can switch between near-equal ensemble contacts; this is not a measured source time shift.','processedBranchEnergyAbove9kHzFraction':high_fraction(processed),'cleanEnergyAbove9kHzFraction':high_fraction(clean),'ordinaryIsClean':True})
responses={};response_report=[]
for key,name,seconds in [('meeting','meeting-room-30cm-original-25ch.wav',c['meetingWindow']),('kiln','hoffmann-kiln-p2-original-bformat.wav',c['kilnWindow'])]:
 original=root/'artifacts/apparition-applause/materials'/name;x=fade(read(original)[:round(seconds*rate)],c['impulseEndFade']);g=1/np.sqrt(np.sum(x*x));x*=g;responses[key]=x
 response_report.append({'id':key,'source':str(original.relative_to(root)),'sourceSha256':sha(original),'channel':0,'retainedSeconds':seconds,'unitDiscreteEnergyGainDb':20*np.log10(g),'timeOfFlightPreserved':True,'endFadeSeconds':c['impulseEndFade'],'license':'CC-BY-4.0'})
treatment=np.zeros(len(responses['kiln']));treatment[:len(responses['meeting'])]+=c['treatmentMeetingWeight']*responses['meeting'];treatment+=c['treatmentKilnWeight']*responses['kiln']
impulses={};impulse_report=[]
for condition,x in [('ordinary',responses['meeting']),('treatment',treatment)]:
 target=assets/(condition+'-measured-w-v3.wav');write(target,x,24);impulses[condition]=read(target)
 impulse_report.append({'id':condition+'Room','url':'/assets/apparition-applause/'+target.name,'runtimeFile':str(target.relative_to(root)),'sha256':sha(target),'bytes':target.stat().st_size,'duration':len(x)/rate,'sampleRate':rate,'channels':1,'convolverNormalize':False,'license':'CC-BY-4.0'})
distance=math.hypot(c['referenceListener']['x'],c['referenceListener']['y']);beyond=max(0,distance-c['referenceDistance']);direct=1/(1+c['rolloff']*beyond);wet_gain=1/(1+c['wetRolloff']*beyond)
def render(condition,layer='mixed'):
 dry=np.zeros(frames);wet=np.zeros(frames);lanes={lane:np.zeros(frames) for lane in ('lead-a','lead-b','lead-c','ensemble')}
 for e in c['contacts']:
  key=e['source']+'-treatment' if condition=='treatment' else e['source'];x=sources[key]
  if layer=='clean':x=clean_weight*clean_sources[e['source']]
  if layer=='crush':x=x-clean_weight*clean_sources[e['source']]
  x=x*e['gain'];at=round(e[condition]*rate);lane=x*c['dry']*direct;dry[at:at+len(x)]+=lane;lanes[e['lane']][at:at+len(x)]+=lane
  tail=conv(x,impulses[condition])*e['wet'][condition]*wet_gain;wet[at:at+len(tail)]+=tail
 return {'dry':np.repeat((dry/np.sqrt(2))[:,None],2,axis=1),'wet':np.repeat((wet/np.sqrt(2))[:,None],2,axis=1),'lanes':lanes}
mixes={k:render(k) for k in ('ordinary','treatment')}
for m in mixes.values():m['full']=m['dry']+m['wet']
raw={k:measure(m['full']) for k,m in mixes.items()};target=min(c['targetLufs'],*(m['integratedLufs']+c['peakCeilingDbtp']-.1-m['truePeakDbtp'] for m in raw.values()),*(m['integratedLufs']+20*np.log10(4) for m in raw.values()))
measurements={}
for condition,m in mixes.items():
 gain=10**((target-raw[condition]['integratedLufs'])/20)
 for role in ('dry','wet','full'):write(renders/(condition+'-'+role+'.wav'),m[role]*gain)
 if condition=='treatment':
  for lane,x in m['lanes'].items():write(renders/('treatment-dry-'+lane+'.wav'),x*gain)
  components={}
  for layer in ('clean','crush'):
   part=render('treatment',layer);components[layer]=(part['dry']+part['wet'])*gain;write(renders/('treatment-'+('clean-layer' if layer=='clean' else 'crush-only')+'.wav'),components[layer],24)
  component_sum_error=float(np.max(np.abs(components['clean']+components['crush']-m['full']*gain)))
 source_counts={s['id']:sum(e['source']==s['id'] for e in c['contacts']) for s in c['sources']}
 action_end=max(e[condition]+len(sources[e['source']])/rate for e in c['contacts']);tail_end=max(e[condition]+len(sources[e['source']])/rate+len(impulses[condition])/rate for e in c['contacts'])
 measurements[condition]={'scoreGain':gain,'scoreGainDb':20*np.log10(gain),'beforeGain':raw[condition],**measure(m['full']*gain),'samplePeakDbfs':20*np.log10(np.max(np.abs(m['full']*gain))),'sourceCounts':source_counts,'runtimeSourceCounts':{k+('-treatment' if condition=='treatment' else ''):v for k,v in source_counts.items()},'sourceEventCount':len(c['contacts']),'distinctSourceCount':len(c['sources']),'isolatedContactCount':4,'ensembleExcerptCount':1,'actionEndSeconds':action_end,'tailEndSeconds':tail_end}
write(renders/'silent-full.wav',np.zeros((frames,2)))
report={'schema':3,'id':c['id'],'designStatus':'v3-package-listening-pending','sourceRecognitionFeedback':'Yes, these read as claps','previousCueFeedback':'V2 sounded too normal and did not feel done to the player.','finalCueListening':'V3 pending; source recognition is not approval of this composition or its light crushing.','comparison':c['comparison'],'crush':{**c['crush'],'sourceMeasurements':crush_report,'cleanPlusCrushComponentSumMaxFloatError':component_sum_error,'method':'Antialiased 18 kHz resampling and 11-bit nearest quantization; band-limited return to 48 kHz. Mixed derivative = 88% unfiltered clean + 12% processed branch. No hard sample-hold aliases, dither, generated noise, pitch shift or time stretch.'},'freshPlayers':0,'sampleRate':rate,'durationSeconds':c['duration'],'referenceListener':c['referenceListener'],'conditions':measurements,'targetIntegratedLufs':target,'requestedTargetIntegratedLufs':c['targetLufs'],'truePeakCeilingDbtp':c['peakCeilingDbtp'],'sources':source_report,'impulses':impulse_report,'responseComponents':response_report,'authorship':'Four isolated contacts from Roberto-recorded FreePats variations and one actual Dorian CLAIR ensemble recording; ensemble size unknown. Four editable tracks are source organization, not four documented recorded people.','renderMethod':'Float64 linear convolution and sums from the exact runtime PCM derivatives; mono equal-power pan at fixed reference; 16-bit diagnostic mix WAV and 24-bit clean/crush component WAVs. Production derivatives are 24-bit PCM.','levelMethod':'FFmpeg loudnorm input analysis; one constant gain per condition. No dynamic normalization or limiter.','limits':['Source releases are edited samples/published WAV, not untouched continuous microphone masters.','Imported measured room responses do not measure the fictional room or establish vast architecture.','Reference LUFS/true peak are technical measurements; perceived matching and comfort require listening.','First-exposure perceptual validation is pending participants.','High clean/mixed correlation characterizes signal preservation, not proof that recognition or light-crush audibility survives.']}
(renders/'render-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
`;
const report=JSON.parse(execFileSync('python3',['-c',PYTHON],{input:JSON.stringify({root:ROOT,assets:ASSETS,renders:RENDERS,config:CONFIG}),maxBuffer:8*1024*1024}).toString());
const assetMap=items=>Object.fromEntries(items.map(({id,url,sha256,license,duration,sourceIdentity})=>[id,{url,sha256,license,duration,sourceIdentity}]));
const assets={sources:assetMap(report.sources),impulses:assetMap(report.impulses)};
const mix={id:CONFIG.id,designStatus:report.designStatus,sourceRecognitionFeedback:report.sourceRecognitionFeedback,durationSeconds:CONFIG.duration,sampleRate:CONFIG.rate,referenceListener:CONFIG.referenceListener,conditions:report.conditions,maxTruePeakDbtp:Math.max(...Object.values(report.conditions).map(m=>m.truePeakDbtp)),maxTailEndSeconds:Math.max(...Object.values(report.conditions).map(m=>m.tailEndSeconds)),crush:report.crush,comparison:CONFIG.comparison,assetSourceCount:report.sources.length,sameSourceIdentity:true,sameSourceCounts:JSON.stringify(report.conditions.ordinary.sourceCounts)===JSON.stringify(report.conditions.treatment.sourceCounts),distinctSourceCount:5,authorship:report.authorship,technicalMatchOnly:true,finalListeningValidated:false,freshPlayersTested:0};
const module=`// Generated by tools/chunk_surfer/build-apparition-applause.mjs.\n// Recognized full-tail hand samples plus an actual recorded ensemble; source counts and origins match across controls.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const entry of Object.values(value))freeze(entry);Object.freeze(value);}return value;};\nexport const APPLAUSE_ASSETS=freeze(${JSON.stringify(assets,null,2)});\nexport const APPARITION_APPLAUSE_MIX=freeze(${JSON.stringify(mix,null,2)});\nconst CONFIG=freeze(${JSON.stringify(CONFIG,null,2)});\nexport function makeApparitionApplauseScore(condition='treatment',{origin={x:0,y:0,z:0},yaw=0}={}){\n if(!['silent','ordinary','treatment'].includes(condition))throw new Error('Unknown applause condition: '+condition);\n const events=condition==='silent'?[]:CONFIG.contacts.map(contact=>({id:contact.id,source:contact.source+(condition==='treatment'?'-treatment':''),sourceIdentity:contact.source,time:contact[condition],position:{x:origin.x,y:origin.z},gain:contact.gain,dry:CONFIG.dry,wet:contact.wet[condition],impulse:condition+'Room',fadeIn:0,fadeOut:0,playbackRate:1,preDelay:0,referenceDistance:CONFIG.referenceDistance,rolloff:CONFIG.rolloff,wetRolloff:CONFIG.wetRolloff,wetPanWidth:CONFIG.wetPanWidth})).sort((a,b)=>a.time-b.time);\n return{id:CONFIG.id+':'+condition,duration:CONFIG.duration,gain:condition==='silent'?1:APPARITION_APPLAUSE_MIX.conditions[condition].scoreGain,events};\n}\n`;
fs.writeFileSync(path.join(ROOT,'src/data/apparition-applause-score.js'),module);
fs.writeFileSync(path.join(ASSETS,'manifest.json'),JSON.stringify({schema:2,id:CONFIG.id,...assets,mix,derivatives:report.sources,responseComponents:report.responseComponents,impulseDerivatives:report.impulses},null,2)+'\n');
const credits=`# Applause source credits and changes\n\nHand samples: FreePats World Percussion, hand clap recorded by Roberto in June 2019 with an AKG condenser microphone. CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . Source: https://github.com/freepats/world-percussion and https://freepats.zenvoid.org/Percussion/world-and-rare-percussion.html . The source README states raw recordings were cropped, edited and processed. The four released samples retain their complete 0.316–0.403 s duration; mono 48 kHz, common gain, conditional final 4 ms cosine taper only. No attack filter/gate, pitch shift or time stretch. One documented recordist; distinct performers are not documented.\n\nEnsemble: Dorian CLAIR, Applause 1 (2363), https://bigsoundbank.com/applause-1-s2363.html . CC0 1.0. Actual indoor applause, ensemble size unknown. Original published 7.2 s mono 48 kHz 24-bit WAV retained in source materials; processing history unknown. Runtime uses exact 0.825–2.375 s excerpt, common gain and 6/14 ms cosine edge fades.\n\nMeeting response: Thomas McKenzie, Sebastian J. Schlecht, Ville Pulkki, A dataset of measured spatial room impulse responses for the transition between coupled rooms, v1.2 (2021), https://doi.org/10.5281/zenodo.4636068 . CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Selected meeting-room trajectory measurement 30 cm, W/channel 0, original file timing retained, 0.52 s window, 40 ms end taper, unit discrete energy gain.\n\nKiln response: Jack Smith, Juan García, Hashim Riaz, Pau Rosell; Audiolab, University of York / OpenAIR, Hoffmann Lime Kiln (2017), position 2, https://www.openair.hosted.york.ac.uk/?page_id=518 . CC BY 4.0. W/channel 0, resampled 96 to 48 kHz, original file timing retained, 0.88 s window, 40 ms end taper, unit discrete energy gain.\n\nOrdinary uses meeting W. Treatment uses 0.85 meeting + 0.14 kiln W. Light sends preserve the recorded hand body and existing indoor ensemble decay. No invented hall tail, synthetic crowd, dynamic normalization or limiter. Treatment additionally mixes an antialiased 18 kHz / 11-bit parallel branch at 12%, leaving 88% original clean waveform. Ordinary stays clean. The exact baked PCM derivatives are shared by runtime, reference and native Live playback. One constant gain matches reference integrated levels. Timing, reflection send and treatment-only processing all differ: this is a full-package comparison, not an isolated DSP experiment. No creator endorses this game. Original files, source pages, SHA-256 records and license evidence accompany the work under artifacts/apparition-applause/materials-v2 and materials/v2. Source recognition was confirmed by the user; final cue listening and fresh-player validation remain pending.\n`;
fs.writeFileSync(path.join(ASSETS,'CREDITS.md'),credits);
const wanted=new Set(['manifest.json','CREDITS.md',...report.sources.map(s=>path.basename(s.runtimeFile)),...report.impulses.map(s=>path.basename(s.runtimeFile))]);
for(const file of fs.readdirSync(ASSETS))if(!wanted.has(file)&&file.endsWith('.wav'))fs.rmSync(path.join(ASSETS,file));
const direct=1/(1+CONFIG.rolloff*Math.max(0,6-CONFIG.referenceDistance));
for(const condition of ['treatment','ordinary']){
 const tracks=['lead-a','lead-b','lead-c','ensemble'].map((lane,index)=>({id:lane,name:`0${index+1} ${lane.toUpperCase()} - ${condition.toUpperCase()}`,role:'dry',muted:false,volumeDb:0,pan:0,annotation:'Editable recorded contacts or real ensemble. All sources occupy one existing world station; tracks are not distinct people.',clips:CONFIG.contacts.filter(c=>c.lane===lane).map(c=>{const source=report.sources.find(s=>s.id===c.source+(condition==='treatment'?'-treatment':''));return{file:path.relative(RENDERS,path.join(ROOT,source.runtimeFile)),atSeconds:c[condition],durationSeconds:source.duration,gainDb:20*Math.log10(report.conditions[condition].scoreGain*c.gain*CONFIG.dry*direct),name:c.id};})}));
 for(const alternative of ['ordinary','treatment'])tracks.push({id:alternative+'-wet',name:`${alternative==='ordinary'?'05':'06'} ${alternative.toUpperCase()} MEASURED WET`,role:alternative+'-wet',muted:alternative!==condition,volumeDb:0,pan:0,clips:[{file:alternative+'-wet.wav',atSeconds:0,durationSeconds:CONFIG.duration,name:'Light measured reflection stem'}]});
 for(const [i,ir]of report.impulses.entries())tracks.push({id:ir.id,name:`0${i+7} ${ir.id.toUpperCase()} IR - MUTED`,role:'reference-ir',muted:true,clips:[{file:path.relative(RENDERS,path.join(ROOT,ir.runtimeFile)),atSeconds:0,name:'Measured scalar W derivative; diagnostic only'}]});
 fs.writeFileSync(path.join(RENDERS,`live-${condition}-manifest.json`),JSON.stringify({schema:1,name:`Apparition Applause V3 - ${condition==='treatment'?'Treatment':'Ordinary Control'}`,tempo:60,annotation:'Four natural solo contacts plus actual recorded ensemble; one existing station. Treatment includes exact baked12% light crush derivatives. Different entrance timing and reflection sends make this a package comparison. V3 listening/player validation pending. Warp off; no dynamics processing.',tracks},null,2)+'\n');
}
fs.writeFileSync(path.join(RENDERS,'README.md'),`# V3: an addressed entrance with light parallel crushing\n\nThe user recognized the FreePats source audition as claps. Three distinct complete contacts lead into an actual indoor ensemble excerpt, followed by one late complete contact. All audio stays anchored at the existing station. Treatment almost begins politely, then two hands collide, an already-active group enters and stops before the final isolated judgment; ordinary uses the same five original identities/excerpts/counts and spatial origin, with different timing, no crushing and different reflection sends. This is a full-package comparison, not an isolated-DSP study. The treatment uses a12% 11-bit/18 kHz antialiased parallel branch; ordinary is clean. 88% of the original waveform is left unfiltered. Full-tail hands remain available as clean derivatives. Both use light measured reflections; no vast-hall or four-recorded-people claim.\n\nOriginal hand samples and the full 7.2 s ensemble recording, source/license evidence and provenance are retained under ../materials-v2 and ../materials/v2. Runtime derivatives/credits are under public/assets/apparition-applause. Rebuild with node tools/chunk_surfer/build-apparition-applause.mjs. Four mono treatment dry stems, two stereo wet alternatives and24-bit clean/crush-only component stems are supplied for editing, and both native Live manifests contain individual source clips with no same-lane overlap.\n\nrender-report.json records static 6 m reference LUFS and true peak, constant gains and exact changes. Neither technical matching nor source recognition approves the completed cue. Final cue listening, normal-play interpretation, comfort and fresh-player first exposures remain pending. Rejected v1 and normal-sounding v2 are preserved in ../rejected-v1 and ../rejected-v2.\n`);
if(report.crush.sourceMeasurements.some(s=>s.processedBranchEnergyAbove9kHzFraction>.001||s.cleanMixedCorrelation<.995)||report.crush.cleanPlusCrushComponentSumMaxFloatError>1e-10)throw new Error('Parallel crush signal checks failed');
if(Object.values(report.conditions).some(c=>c.truePeakDbtp>-9||c.distinctSourceCount!==5)||!mix.sameSourceCounts)throw new Error('Cue verification failed');
console.log(JSON.stringify({id:CONFIG.id,conditions:report.conditions,assetsBytes:fs.readdirSync(ASSETS).reduce((n,f)=>n+fs.statSync(path.join(ASSETS,f)).size,0)},null,2));
