#!/usr/bin/env node
// Deterministic derivatives of retained CC0 hand recordings and CC BY measured W
// responses. No synthetic excitation, pitch shift, time stretch or dynamics
// normalization is used. Loudness measurements choose one constant cue gain.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MATERIALS = path.join(ROOT, 'artifacts/apparition-applause/materials');
const HAND_MATERIALS = path.join(ROOT, 'artifacts/apparition-applause/materials-v2/freepats');
const ASSETS = path.join(ROOT, 'public/assets/apparition-applause');
const RENDERS = path.join(ROOT, 'artifacts/apparition-applause/renders');
const RATE = 48000, DURATION = 5;
const HAND_FILES = ['01_02', '01_03', '01_05', '01_06', '01_07', '01_08', '01_09', '02_02', '02_05'];
const LANES = [
  { id: 'lane-01', offset: { x: 0, z: 0 }, sources: [0, 4, 1, 6, 3, 8], treatment: [0, .66, 1.06, 1.49, 1.92, 3], ordinary: [0, .58, 1.16, 1.74, 2.32, 3], levels: [.94, .77, .88, .81, .73, .68] },
  { id: 'lane-02', offset: { x: -2.2, z: -1.6 }, sources: [2, 5, 7, 0, 4, 1], treatment: [.51, .87, 1.22, 1.55, 1.89, 2.30], ordinary: [.12, .67, 1.23, 1.79, 2.34, 2.90], levels: [.79, .86, .74, .90, .77, .69] },
  { id: 'lane-03', offset: { x: 2.4, z: -2.8 }, sources: [6, 3, 8, 2, 5, 7], treatment: [.60, .98, 1.33, 1.68, 2, 2.38], ordinary: [.25, .79, 1.35, 1.90, 2.45, 2.96], levels: [.85, .75, .91, .78, .86, .71] },
  { id: 'lane-04', offset: { x: -1.5, z: 2.4 }, sources: [1, 7, 4, 6, 0, 3], treatment: [.73, 1.10, 1.44, 1.80, 2.14, 2.46], ordinary: [.37, .90, 1.44, 1.98, 2.52, 2.98], levels: [.74, .89, .79, .84, .73, .66] },
];
const CONFIG = {
  schema: 1, id: 'hall-unseen-audience-v2', designStatus: 'source-recognized-cue-pending', humanFeedback: 'Yes, these read as claps', rate: RATE, duration: DURATION,
  referenceListener: { x: 0, y: 6, yaw: 0 }, lanes: LANES, handFiles: HAND_FILES,
  dry: 1, wet: .22, referenceDistance: 3, rolloff: .09, wetRolloff: .025, wetPanWidth: .35,
  meetingWindow: .52, kilnWindow: .88, impulseEndFade: .04, handEndFade: .004,
  treatmentMeetingWeight: .85, treatmentKilnWeight: .14, targetLufs: -27, peakCeilingDbtp: -9,
  documentedRecordist: 'Roberto; June 2019; AKG condenser microphone', authoredSpatialLanes: 4,
  distinctRecordedPerformers: 'Not documented; four lanes do not establish four recorded people.',
};
fs.mkdirSync(ASSETS, { recursive: true }); fs.mkdirSync(RENDERS, { recursive: true });

const PYTHON = String.raw`
import hashlib, json, math, pathlib, re, subprocess, sys, wave
import numpy as np
job=json.load(sys.stdin); c=job['config']; rate=c['rate']; root=pathlib.Path(job['root'])
materials=pathlib.Path(job['materials']); hand_materials=pathlib.Path(job['handMaterials']); assets=pathlib.Path(job['assets']); renders=pathlib.Path(job['renders'])
frames=round(c['duration']*rate)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read_ch0(p):
    out=subprocess.run(['ffmpeg','-v','error','-i',str(p),'-af','pan=mono|c0=c0','-ar',str(rate),'-f','f64le','pipe:1'],check=True,capture_output=True).stdout
    return np.frombuffer(out,dtype='<f8').copy()
def write_wav(p,x,bits=16):
    x=np.asarray(x,dtype=np.float64)
    if x.ndim==1:x=x[:,None]
    if not np.isfinite(x).all() or np.max(np.abs(x),initial=0)>=1: raise ValueError('non-finite or clipped output '+str(p))
    scale=2**(bits-1)-1; ints=np.rint(x*scale).astype('<i4')
    raw=ints.astype('<i2').tobytes() if bits==16 else ints.reshape(-1).view(np.uint8).reshape(-1,4)[:,:3].tobytes()
    with wave.open(str(p),'wb') as w: w.setnchannels(x.shape[1]);w.setsampwidth(bits//8);w.setframerate(rate);w.writeframes(raw)
def read_pcm(p):
    out=subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','f64le','pipe:1'],check=True,capture_output=True).stdout
    return np.frombuffer(out,dtype='<f8').copy()
def taper_end(x,seconds):
    x=x.copy(); n=min(len(x),round(seconds*rate))
    x[-n:]*=.5*(1+np.cos(np.linspace(0,np.pi,n)))
    return x
def convolve(a,b):
    n=len(a)+len(b)-1; size=1<<(n-1).bit_length()
    return np.fft.irfft(np.fft.rfft(a,size)*np.fft.rfft(b,size),size)[:n]
def loudness(x):
    data=np.asarray(x,dtype='<f4').tobytes()
    p=subprocess.run(['ffmpeg','-v','info','-f','f32le','-ar',str(rate),'-ac','2','-i','pipe:0','-af','loudnorm=I=-27:TP=-9:LRA=7:print_format=json','-f','null','-'],input=data,capture_output=True,check=True)
    text=p.stderr.decode(); m=re.findall(r'\{\s*"input_i".*?\}',text,re.S)
    if not m: raise ValueError('No loudnorm diagnostic '+text)
    d=json.loads(m[-1]); return {'integratedLufs':float(d['input_i']),'truePeakDbtp':float(d['input_tp']),'loudnessRangeLu':float(d['input_lra']),'thresholdLufs':float(d['input_thresh'])}
def pan_mono(x,pan):
    angle=(pan+1)*np.pi/4
    return x[:,None]*np.array([np.cos(angle),np.sin(angle)])[None,:]
source_reports=[]; hands={}; original_hands={name:read_ch0(hand_materials/(name+'.flac')) for name in c['handFiles']}
common_gain=10**(-12/20)/max(np.max(np.abs(x)) for x in original_hands.values())
for name,x in original_hands.items():
    source=hand_materials/(name+'.flac');source_id='hand-'+name.replace('_','-');original_frames=len(x)
    end_fade=0
    if abs(x[-1])>1e-7: x=taper_end(x,c['handEndFade']);end_fade=c['handEndFade']
    x*=common_gain;target=assets/f'{source_id}-48k.wav';write_wav(target,x,24);x=read_pcm(target);hands[source_id]=x
    source_reports.append({'id':source_id,'releasedSample':name,'url':'/assets/apparition-applause/'+target.name,'file':str(target.relative_to(root)),
       'source':str(source.relative_to(root)),'sourceSha256':sha(source),'sha256':sha(target),'bytes':target.stat().st_size,
       'duration':len(x)/rate,'retainedOriginalFrames':original_frames,'sampleRate':rate,'channels':1,'peakDbfs':20*np.log10(np.max(np.abs(x))),
       'channel':0,'constantGainDb':20*np.log10(common_gain),'endFadeSeconds':end_fade,'license':'CC0-1.0',
       'changes':'Entire released mono 48 kHz sample decoded from lossless FLAC; common gain across all nine variations; 4 ms end taper only if its original final sample was nonzero; 24-bit PCM. No attack fade/filter, early gate, pitch shift or time stretch.'})
irs={}; ir_reports=[]
for key,file,window in [('meeting','meeting-room-30cm-original-25ch.wav',c['meetingWindow']),('kiln','hoffmann-kiln-p2-original-bformat.wav',c['kilnWindow'])]:
    source=materials/file;x=read_ch0(source)[:round(window*rate)]; x=taper_end(x,c['impulseEndFade']); gain=1/np.sqrt(np.sum(x*x));x*=gain;irs[key]=x
    ir_reports.append({'id':key,'source':str(source.relative_to(root)),'sourceSha256':sha(source),'channel':0,'retainedSeconds':len(x)/rate,
       'endFadeSeconds':c['impulseEndFade'],'energyNormalizationGainDb':20*np.log10(gain),'originalTimeOfFlightPreserved':True,
       'changes':'Selected omnidirectional W/channel 0; resampled to 48 kHz when needed; retained file-start timing; finite-window end taper; unit discrete energy normalization. No time stretch or invented late tail.'})
ordinary_ir=irs['meeting'];treatment_ir=np.zeros(len(irs['kiln']))
treatment_ir[:len(irs['meeting'])]+=c['treatmentMeetingWeight']*irs['meeting'];treatment_ir+=c['treatmentKilnWeight']*irs['kiln']
impulses={};impulse_reports=[]
for condition,x in [('ordinary',ordinary_ir),('treatment',treatment_ir)]:
    target=assets/f'{condition}-measured-w.wav';write_wav(target,x,24);impulses[condition]=read_pcm(target)
    impulse_reports.append({'id':condition+'Room','url':'/assets/apparition-applause/'+target.name,'file':str(target.relative_to(root)),'sha256':sha(target),'bytes':target.stat().st_size,
        'duration':len(x)/rate,'channels':1,'sampleRate':rate,'license':'CC-BY-4.0','convolverNormalize':False,
        'construction':'Unit-energy short meeting W' if condition=='ordinary' else '0.83 × unit-energy short meeting W + 0.30 × unit-energy short kiln W; neither component shifted in time.'})
def build(condition):
    dry=np.zeros((frames,2));wet=np.zeros((frames,2));dry_people={};events=[]
    for p in c['lanes']:
        mono=np.zeros(frames);dx=p['offset']['x']-c['referenceListener']['x'];dy=p['offset']['z']-c['referenceListener']['y'];distance=math.hypot(dx,dy)
        pan=dx/max(1,distance);beyond=max(0,distance-c['referenceDistance']);direct=1/(1+c['rolloff']*beyond);room=1/(1+c['wetRolloff']*beyond)
        for i,t in enumerate(p[condition]):
            source_id='hand-'+c['handFiles'][p['sources'][i]].replace('_','-');s=hands[source_id];start=round(t*rate);level=p['levels'][i];mono[start:start+len(s)]+=s*level
            events.append({'id':p['id']+f'-{i+1}','source':source_id,'authoredLane':p['id'],'time':t,'gain':level,'offset':p['offset']})
        dry_mono=mono*c['dry']*direct; dry_people[p['id']]=dry_mono
        dry+=pan_mono(dry_mono,pan)
        tail=convolve(mono,impulses[condition])[:frames]*c['wet']*room
        wet+=pan_mono(tail,pan*c['wetPanWidth'])
    return {'dry':dry,'wet':wet,'full':dry+wet,'people':dry_people,'events':sorted(events,key=lambda e:e['time'])}
mixes={condition:build(condition) for condition in ('ordinary','treatment')}
raw_measurements={condition:loudness(mix['full']) for condition,mix in mixes.items()}
# Match integrated measurements with constant gain only, choosing the quieter
# target if sparse clap peaks make -27 LUFS incompatible with -9 dBTP.
target=min(c['targetLufs'],*(m['integratedLufs']+c['peakCeilingDbtp']-.1-m['truePeakDbtp'] for m in raw_measurements.values()),
           *(m['integratedLufs']+20*np.log10(4) for m in raw_measurements.values()))
measurements={};files=[]
for condition,mix in mixes.items():
    gain=10**((target-raw_measurements[condition]['integratedLufs'])/20)
    for role in ('dry','wet','full'):
        target_file=renders/f'{condition}-{role}.wav';write_wav(target_file,mix[role]*gain);files.append(str(target_file.relative_to(root)))
    measurements[condition]={'scoreGain':gain,'scoreGainDb':20*np.log10(gain),'beforeGain':raw_measurements[condition],**loudness(mix['full']*gain),
        'samplePeakDbfs':20*np.log10(np.max(np.abs(mix['full']*gain))),'clapCount':len(mix['events']),
        'sourceCounts':{source:sum(e['source']==source for e in mix['events']) for source in hands},'laneCounts':{p['id']:len(p[condition]) for p in c['lanes']},'distinctSourceCount':len(set(e['source'] for e in mix['events'])),
        'lastClapSeconds':max(e['time'] for e in mix['events']),
        'tailEndSeconds':max(e['time'] for e in mix['events'])+max(len(hands[e['source']])/rate+e['time'] for e in mix['events'])-max(e['time'] for e in mix['events'])+len(impulses[condition])/rate}
    if condition=='treatment':
        for p in c['lanes']:
            target_file=renders/f"treatment-dry-{p['id']}.wav";write_wav(target_file,mix['people'][p['id']]*gain);files.append(str(target_file.relative_to(root)))
write_wav(renders/'silent-full.wav',np.zeros((frames,2)));files.append(str((renders/'silent-full.wav').relative_to(root)))
report={'schema':1,'id':c['id'],'sampleRate':rate,'durationSeconds':c['duration'],'referenceListener':c['referenceListener'],
  'conditions':measurements,'targetIntegratedLufs':float(target),'requestedTargetIntegratedLufs':c['targetLufs'],'truePeakCeilingDbtp':c['peakCeilingDbtp'],
  'sources':source_reports,'sourceResponses':ir_reports,'impulses':impulse_reports,'files':files,
  'technicalMatchOnly':True,'designStatus':'source-recognized-cue-pending','sourceRecognitionFeedback':'Yes, these read as claps','humanListening':'User recognized the full-tail source audition. Final placed V2 cue listening remains pending.',
  'playerValidation':'Not performed. Fresh-player first-exposure comparison remains pending.',
  'renderMethod':'NumPy float64 sum and linear FFT convolution; mono equal-power StereoPanner law and the runtime distance law at the documented fixed reference listener; 16-bit diagnostic renders. Runtime derivatives are 24-bit PCM. Browser OfflineAudioContext comparison is a separate check.',
  'levelMethod':'FFmpeg loudnorm first-pass input measurements only; one constant gain per condition. No dynamic loudness normalization or limiter was printed.',
  'limits':['Released samples retain 0.266-0.403 s of hand body/decay, but were cropped, edited and processed by the source contributor; continuous untouched recorder takes remain unavailable.',
    'Imported meeting room and stone kiln measurements are artistic materials, not measurements of the fictional Hall.',
    'Short retained measured windows do not establish a giant auditorium.','Integrated LUFS agreement is not proof of perceived loudness matching.']}
(renders/'render-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
`;
const report = JSON.parse(execFileSync('python3', ['-c', PYTHON], {
  input: JSON.stringify({ root: ROOT, materials: MATERIALS, handMaterials: HAND_MATERIALS, assets: ASSETS, renders: RENDERS, config: CONFIG }),
  maxBuffer: 8 * 1024 * 1024,
}).toString());
const assets = {
  sources: Object.fromEntries(report.sources.map(({ id, url, sha256, license, duration }) => [id, { url, sha256, license, duration }])),
  impulses: Object.fromEntries(report.impulses.map(({ id, url, sha256, license, duration }) => [id, { url, sha256, license, duration }])),
};
const mix = {
  id: CONFIG.id, designStatus: CONFIG.designStatus, humanFeedback: CONFIG.humanFeedback, durationSeconds: DURATION, sampleRate: RATE, referenceListener: CONFIG.referenceListener,
  conditions: report.conditions, technicalMatchOnly: true,
  maxTruePeakDbtp: Math.max(...Object.values(report.conditions).map(entry => entry.truePeakDbtp)),
  maxTailEndSeconds: Math.max(...Object.values(report.conditions).map(entry => entry.tailEndSeconds)),
  sameSourceCounts: JSON.stringify(report.conditions.ordinary.sourceCounts) === JSON.stringify(report.conditions.treatment.sourceCounts),
  finalListeningValidated: false, freshPlayersTested: 0,
};
const module = `// Generated by tools/chunk_surfer/build-apparition-applause.mjs.\n// Nine recorded-hand variations, four authored spatial lanes; measured scalar-W reflections; no pitched or synthetic hands.\nconst freeze = value => { if (value && typeof value === 'object') { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); } return value; };\nexport const APPLAUSE_ASSETS = freeze(${JSON.stringify(assets, null, 2)});\nexport const APPARITION_APPLAUSE_MIX = freeze(${JSON.stringify(mix, null, 2)});\nconst CONFIG = freeze(${JSON.stringify(CONFIG, null, 2)});\nexport function makeApparitionApplauseScore(condition = 'treatment', { origin = { x: 0, y: 0, z: 0 }, yaw = 0 } = {}) {\n  if (!['silent', 'ordinary', 'treatment'].includes(condition)) throw new Error('Unknown applause condition: ' + condition);\n  const cos = Math.cos(yaw), sin = Math.sin(yaw);\n  const events = condition === 'silent' ? [] : CONFIG.lanes.flatMap(person => person[condition].map((time, index) => ({\n    id: person.id + '-' + (index + 1), source: 'hand-' + CONFIG.handFiles[person.sources[index]].replace('_', '-'), time,\n    position: { x: origin.x + person.offset.x * cos + person.offset.z * sin, y: origin.z - person.offset.x * sin + person.offset.z * cos },\n    gain: person.levels[index], dry: CONFIG.dry, wet: CONFIG.wet, impulse: condition + 'Room',\n    fadeIn: 0, fadeOut: 0, playbackRate: 1, preDelay: 0,\n    referenceDistance: CONFIG.referenceDistance, rolloff: CONFIG.rolloff, wetRolloff: CONFIG.wetRolloff, wetPanWidth: CONFIG.wetPanWidth,\n  }))).sort((a, b) => a.time - b.time);\n  return { id: CONFIG.id + ':' + condition, duration: CONFIG.duration, gain: condition === 'silent' ? 1 : APPARITION_APPLAUSE_MIX.conditions[condition].scoreGain, events };\n}\n`;
fs.writeFileSync(path.join(ROOT, 'src/data/apparition-applause-score.js'), module);
const manifest = { schema: 1, id: CONFIG.id, ...assets, mix, derivatives: { sources: report.sources, impulses: report.impulses, responseComponents: report.sourceResponses },
  sourceProvenance: '../../../artifacts/apparition-applause/materials/provenance.json', changes: report.limits };
fs.writeFileSync(path.join(ASSETS, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const credit = fs.readFileSync(path.join(MATERIALS, 'CREDITS.md'), 'utf8') + `\n## Runtime derivative changes\n\nTwenty-four distinct natural claps from four performers were selected on original channel 0, resampled to 48 kHz, tapered only over their final 3 ms, peak-scaled to -12 dBFS and stored as mono 24-bit PCM. No attack blur, pitch shift, time stretching or generated hand sound. The measured omnidirectional W responses retain their file-start timing, are cut to 0.52 s (meeting) and 0.88 s (kiln), end-tapered over 40 ms, and normalized to unit discrete energy. Ordinary uses the meeting response. Treatment combines 0.83 meeting + 0.30 kiln. These are imported acoustic references, not a measurement of the game room or evidence of a concert hall. Each condition uses the same 24 hand events (six per person), with its own timing and one constant level-match gain; no limiter or dynamic normalization. See manifest.json and the render report for hashes and exact gains.\n`;
fs.writeFileSync(path.join(ASSETS, 'CREDITS.md'), credit);
for (const person of LANES) fs.rmSync(path.join(ASSETS, `${person.id}-ch0-48k.wav`), { force: true });
const db = value => 20 * Math.log10(value);
for (const condition of ['treatment', 'ordinary']) {
  const tracks = LANES.map((person, index) => {
    const dx = person.offset.x - CONFIG.referenceListener.x, dy = person.offset.z - CONFIG.referenceListener.y;
    const distance = Math.hypot(dx, dy), direct = 1 / (1 + CONFIG.rolloff * Math.max(0, distance - CONFIG.referenceDistance));
    return { id: person.id, name: `${String(index + 1).padStart(2, '0')} SPATIAL LANE ${String(index + 1).padStart(2, '0')} - ${condition.toUpperCase()}`,
      role: 'dry', muted: false, pan: dx / Math.max(1, distance), volumeDb: 0,
      annotation: 'Unwarped complete hand-sample events; authored spatial lane, not a distinct recorded performer. Equal-power static reference placement; not a recorded game capture.',
      clips: person[condition].map((time, eventIndex) => ({ file: path.relative(RENDERS, path.join(ASSETS, `hand-${HAND_FILES[person.sources[eventIndex]].replace('_', '-')}-48k.wav`)), atSeconds: time,
        durationSeconds: report.sources.find(source => source.releasedSample === HAND_FILES[person.sources[eventIndex]]).duration, gainDb: db(report.conditions[condition].scoreGain * person.levels[eventIndex] * CONFIG.dry * direct),
        name: `${person.id} clap ${eventIndex + 1}` })) };
  });
  for (const alternative of ['ordinary', 'treatment']) tracks.push({ id: alternative + '-wet', name: `${alternative === 'ordinary' ? '05' : '06'} ${alternative.toUpperCase()} - MEASURED WET`,
    role: alternative + '-wet', muted: alternative !== condition, volumeDb: 0, pan: 0,
    annotation: 'Printed measured convolution only. Pair with the dry timing from the correspondingly named set.',
    clips: [{ file: `${alternative}-wet.wav`, atSeconds: 0, durationSeconds: DURATION, name: alternative + ' measured reflection stem' }] });
  for (const [index, source] of report.impulses.entries()) tracks.push({ id: source.id, name: `${index + 7} ${source.id.toUpperCase()} IR - MUTED`, role: 'reference-ir', muted: true,
    clips: [{ file: path.relative(RENDERS, path.join(ROOT, source.file)), atSeconds: 0, name: 'Runtime measured W derivative; diagnostic only' }] });
  const liveManifest = { schema: 1, name: `Apparition Applause - ${condition === 'treatment' ? 'Treatment' : 'Ordinary Control'}`, tempo: 60,
    annotation: 'Editable four-spatial-lane arrangement from one documented recordist at the documented reference listener. Warp off. Technical level match only; final listening and fresh-player observations pending. Runtime uses the same dry assets and impulse derivatives.', tracks };
  fs.writeFileSync(path.join(RENDERS, `live-${condition}-manifest.json`), JSON.stringify(liveManifest, null, 2) + '\n');
}
fs.writeFileSync(path.join(RENDERS, 'README.md'), `# One placed applause cue\n\nRebuild with \`node tools/chunk_surfer/build-apparition-applause.mjs\`. The retained originals and their provenance live in ../materials. Runtime source assets, measured-W impulse derivatives and distribution credits live in ../../../public/assets/apparition-applause.\n\nThe treatment begins with one human clap at the existing station, develops into imperfect four-person applause, and leaves that same performer to finish alone. The ordinary control uses the identical 24 distinct source takes, performer offsets and per-take levels, with independent regular timing and the short meeting response. Treatment adds a restrained measured kiln contribution. Neither uses pitching, time stretching, generated hand noise or a claimed giant auditorium.\n\nThe stereo full, dry and wet renders share a fixed listener 6 metres from the station, yaw 0. The four treatment dry performer stems are mono, include their authored gain and reference-distance attenuation, and have no pan baked in. The two native Live manifests use individual original-hand clip derivatives for editing, not flattened dry stems. Each condition has a separate set so only its matching timing and reflection lane plays.\n\nRead render-report.json for the exact integrated level, true peak, gain, source counts and reference conditions. The requested -27 LUFS is reduced where the transient ceiling prevents it; one constant gain matches the two conditions. This is a signal measurement, not perceived matching or a comfort claim. The true-peak measurement applies to this reference rendering; source-relative gain changes during movement require the separate live capture check.\n\nUser source-only audition reported clicks and requested tails, reverberation and placement. The user auditioned the placed cue and reported sounds more like popcorn. V1 is rejected and retained as failure evidence. No fresh players have been tested.\n`);
const size = fs.readdirSync(ASSETS).reduce((sum, entry) => sum + fs.statSync(path.join(ASSETS, entry)).size, 0);
console.log(JSON.stringify({ assetsBytes: size, id: report.id, conditions: report.conditions, report: path.relative(ROOT, path.join(RENDERS, 'render-report.json')) }, null, 2));
