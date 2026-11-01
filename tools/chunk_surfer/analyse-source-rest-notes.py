#!/usr/bin/env python3
"""Full prepared-recording polyphonic note inference; CPU only, reproducible.

Uses Spotify Basic Pitch's Apache-2.0 ONNX model and official postprocessor.
This is an inferred performance map, not an authoritative transcription.
"""
from pathlib import Path
import argparse, collections, hashlib, json, subprocess, time
import numpy as np
import onnxruntime as ort
from basic_pitch.note_creation import output_to_notes_polyphonic, model_frames_to_time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work-dir',type=Path,default=Path(__file__).resolve().parent)
parser.add_argument('--source',type=Path,default=Path('/Users/seb/chunk-surfer/public/audio/source-rest/seb-bach-chaconne-105.mp3'))
parser.add_argument('--output',type=Path)
args=parser.parse_args();HERE=args.work_dir.resolve();HERE.mkdir(parents=True,exist_ok=True)
SOURCE=args.source.resolve();TARGET=args.output or HERE/'seb-bach-chaconne-notes.json'
SR=22050; AUDIO_N=43844; OVERLAP=30; FFT_HOP=256; HOP=AUDIO_N-OVERLAP*FFT_HOP
ONSET=.45; FRAME=.25; MIN_FRAMES=5
started=time.monotonic()
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(SOURCE),'-ac','1','-ar',str(SR),'-f','f32le','-'])
audio=np.frombuffer(raw,dtype='<f4'); duration=len(audio)/SR
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
session=ort.InferenceSession(str(HERE/'nmp.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
print('session',session.get_providers(),[(i.name,i.shape)for i in session.get_inputs()],flush=True)
padded=np.concatenate([np.zeros(OVERLAP*FFT_HOP//2,dtype=np.float32),audio])
outputs={k:[] for k in ['note','onset','contour']}
names=['StatefulPartitionedCall:1','StatefulPartitionedCall:2','StatefulPartitionedCall:0']
for count,start in enumerate(range(0,len(padded),HOP)):
    block=padded[start:start+AUDIO_N]
    if len(block)<AUDIO_N:block=np.pad(block,(0,AUDIO_N-len(block)))
    values=session.run(names,{'serving_default_input_2:0':block.reshape(1,AUDIO_N,1)})
    for key,value in zip(outputs,values):outputs[key].append(value)
    if count%30==0:print(f'inferred {start/SR:.1f}/{duration:.1f}s in {time.monotonic()-started:.1f}s',flush=True)

for key,values in outputs.items():
    out=np.concatenate(values)
    out=out[:,OVERLAP//2:-OVERLAP//2,:]
    out=out.reshape(out.shape[0]*out.shape[1],out.shape[2])
    expected=int((len(audio)/HOP)*(172-OVERLAP))
    outputs[key]=out[:expected]
np.savez_compressed(HERE/'raw-model-output.npz',**outputs)
events=output_to_notes_polyphonic(outputs['note'],outputs['onset'],onset_thresh=ONSET,frame_thresh=FRAME,
    min_note_len=MIN_FRAMES,infer_onsets=True,min_freq=32.70,max_freq=4186.1,melodia_trick=True)
times=model_frames_to_time(len(outputs['note']))
notes=[]
for begin,end,midi,amplitude in events:
    onset=max(0,float(times[begin]));offset=min(duration,float(times[end]));length=offset-onset
    if length<.058 or onset>=duration:continue
    activation=outputs['note'][begin:end,midi-21]
    onset_conf=float(outputs['onset'][max(0,begin-2):min(len(times),begin+3),midi-21].max())
    confidence=float(np.clip(.65*float(activation.mean())+.35*onset_conf,0,1))
    # Retain explicit low-confidence candidates in the audit, not the game map.
    if confidence<.27:continue
    sample=audio[int(onset*SR):min(len(audio),int((onset+.08)*SR))]
    rms=float(np.sqrt(np.mean(sample**2)))if len(sample)else 0
    if rms<10**(-58/20):continue
    notes.append({'midi':int(midi),'onset':round(onset,4),'duration':round(length,4),
        'velocity':round(float(np.clip(amplitude,0,1)),4),'confidence':round(confidence,4),
        'energyDbFS':round(20*np.log10(max(1e-8,rms)),2)})
notes.sort(key=lambda n:(n['onset'],n['midi']))
method={'name':'Spotify Basic Pitch ICASSP2022 ONNX + official polyphonic note decoder',
    'modelSha256':hashlib.sha256((HERE/'nmp.onnx').read_bytes()).hexdigest(),
    'modelUrl':'https://github.com/spotify/basic-pitch/blob/main/basic_pitch/saved_models/icassp_2022/nmp.onnx',
    'sourceUrl':'https://github.com/spotify/basic-pitch',
    'licence':'Apache-2.0; model and upstream code are analysis dependencies, not shipped runtime code',
    'runtime':'onnxruntime CPUExecutionProvider; 2 intra-operation threads, 1 inter-operation thread; no GPU',
    'sampleRate':SR,'windowSamples':AUDIO_N,'windowHopSamples':HOP,'overlapFrames':OVERLAP,'fftHop':FFT_HOP,
    'onsetThreshold':ONSET,'frameThreshold':FRAME,'minimumFrames':MIN_FRAMES,'minimumDurationSeconds':.058,
    'minimumConfidence':.27,'minimumOnsetRmsDbFS':-58,'inferOnsets':True,'melodiaTrick':True,'frequencyRangeHz':[32.70,4186.1],
    'confidence':'0.65 * mean note-frame activation + 0.35 * nearby model onset activation; not a calibrated probability',
    'velocity':'mean model note activation, the official decoder amplitude; not a calibrated MIDI loudness',
    'energyDbFS':'actual 80 ms mono PCM RMS at detected onset; shared polyphonic energy, not an isolated note amplitude',
    'timing':'official Basic Pitch model_frames_to_time correction; coordinates are prepared-audio seconds, no tempo quantization or score snapping',
    'limitations':['Unvalidated automatic transcription: omissions, octave errors, split or merged repeated notes and overtone detections remain possible.',
      'Marimba resonance and room reflections can blur duration; inferred offsets describe detected energy rather than mallet contact or score duration.',
      'No manual correction, musician review or score alignment has been performed. Each event is a candidate, not certified every-note truth.']}
result={'version':1,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceFile':SOURCE.name,
    'duration':round(duration,6),'timebase':'seconds in prepared 1.05x, pitch-preserved playback; zero at first decoded sample',
    'method':method,'notes':notes}
TARGET.write_text(json.dumps(result,separators=(',',':'))+'\n')

poly=[]
for second in np.arange(0,duration,.05):poly.append(sum(n['onset']<=second<n['onset']+n['duration']for n in notes))
summary={'noteCount':len(notes),'duration':duration,'pitchRangeMidi':[min(n['midi']for n in notes),max(n['midi']for n in notes)],
    'pitchHistogram':dict(sorted(collections.Counter(n['midi']for n in notes).items())),
    'durationMedianSeconds':float(np.median([n['duration']for n in notes])),
    'confidenceMedian':float(np.median([n['confidence']for n in notes])),
    'simultaneousDetectedNotes':{'median':float(np.median(poly)),'maximum':int(max(poly)),'p95':float(np.percentile(poly,95))},
    'firstOnset':notes[0]['onset'],'lastOffset':max(n['onset']+n['duration']for n in notes),'runtimeSeconds':time.monotonic()-started}
(HERE/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2),flush=True)

W=1600;H=650;left=64;top=58;right=25;bottom=48;pw=W-left-right;ph=H-top-bottom
lo=24;hi=108
def xp(t):return left+t/duration*pw
def yp(m):return top+(hi-m)/(hi-lo)*ph
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
 '<rect width="100%" height="100%" fill="#101c25"/>','<style>text{font:14px monospace;fill:#cfdee4}</style>',
 '<text x="64" y="24">Prepared Chaconne: full polyphonic note-recognition pass</text>',
 f'<text x="64" y="44">{len(notes)} inferred notes · confidence is model evidence, not human validation</text>']
for m in range(lo,hi+1,12):svg.extend([f'<path d="M{left},{yp(m)}H{W-right}" stroke="#28414e"/>',f'<text x="10" y="{yp(m)+4}">M{m}</text>'])
for sec in range(0,int(duration)+1,60):svg.extend([f'<path d="M{xp(sec)},{top}V{H-bottom}" stroke="#28414e"/>',f'<text x="{xp(sec)}" y="{H-bottom+24}" text-anchor="middle">{sec//60}:{sec%60:02}</text>'])
for n in notes:
    if not lo<=n['midi']<=hi:continue
    svg.append(f'<rect x="{xp(n["onset"]):.2f}" y="{yp(n["midi"]):.2f}" width="{max(.9,pw*n["duration"]/duration):.2f}" height="4.5" fill="#a3d8da" opacity="{.25+.75*n["confidence"]:.3f}"/>')
svg.extend(['<text x="800" y="643" text-anchor="middle">Exact prepared-recording time; no beat grid or score snapping</text>','</svg>'])
(HERE/'piano-roll.svg').write_text('\n'.join(svg))

# Primary raw FFT checks at onsets from different parts of the performance.
checks=[]
for target in [2,35,90,180,280,370,450,510,600,700]:
    selected=min(notes,key=lambda n:abs(n['onset']-target));at=selected['onset']
    start=int(max(0,at-.015)*SR);block=audio[start:start+8192]
    block=np.pad(block,(0,max(0,8192-len(block))))
    power=np.abs(np.fft.rfft(block*np.hanning(len(block))))
    hz=np.fft.rfftfreq(len(block),1/SR)
    peaks=np.flatnonzero((power[1:-1]>power[:-2])&(power[1:-1]>=power[2:]))+1
    peaks=peaks[(hz[peaks]>=45)&(hz[peaks]<4500)]
    peaks=sorted(peaks,key=lambda i:power[i],reverse=True)[:12]
    checks.append({'target':target,'selectedEvent':selected,'fftWindowSeconds':8192/SR,
        'strongestSpectralPeaksHz':[round(float(hz[i]),2)for i in peaks],
        'peakMidiApprox':[round(float(69+12*np.log2(hz[i]/440)),2)for i in peaks],
        'status':'Raw evidence only: partials and overlapping notes mean the strongest peak need not equal the detected fundamental.'})
(HERE/'raw-spectral-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
