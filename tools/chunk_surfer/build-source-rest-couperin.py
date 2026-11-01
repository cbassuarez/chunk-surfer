#!/usr/bin/env python3
"""CPU-only Couperin performance -> aligned acoustic/electronic stereo carrier.

Left channel is the mono performance; right is new additive/FM note synthesis.
This is an explicitly unvalidated automatic revoicing, not source separation,
score-truth, or a substitute for the credited human performance.
Requires the existing isolated Basic Pitch ONNX Python environment; no GPU.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess, time
import numpy as np
import onnxruntime as ort
from basic_pitch.note_creation import output_to_notes_polyphonic, model_frames_to_time
from scipy.signal import find_peaks

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def decode(path, sr):
    return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar',str(sr),'-f','f32le','-']),dtype='<f4').copy()

def infer(audio,model):
    sr=22050; n=43844; overlap=30; hop=n-overlap*256
    options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
    session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
    padded=np.pad(audio,(overlap*256//2,0));parts={k:[] for k in ['note','onset']}
    for count,start in enumerate(range(0,len(padded),hop)):
        block=padded[start:start+n];block=np.pad(block,(0,max(0,n-len(block))))
        result=session.run(['StatefulPartitionedCall:1','StatefulPartitionedCall:2'],{'serving_default_input_2:0':block.reshape(1,n,1)})
        for key,value in zip(parts,result):parts[key].append(value[:,overlap//2:-overlap//2,:])
        if count%60==0:print(f'inferred {start/sr:.1f}/{len(audio)/sr:.1f}s',flush=True)
    expected=int((len(audio)/hop)*(172-overlap));out={k:np.concatenate(v).reshape(-1,88)[:expected]for k,v in parts.items()}
    events=output_to_notes_polyphonic(out['note'],out['onset'],onset_thresh=.45,frame_thresh=.25,min_note_len=5,
        infer_onsets=True,min_freq=65.4,max_freq=4186.1,melodia_trick=True)
    times=model_frames_to_time(len(out['note']));notes=[]
    for begin,end,midi,amp in events:
        onset=max(0,float(times[begin]));offset=min(len(audio)/sr,float(times[end]));duration=offset-onset
        confidence=.65*float(out['note'][begin:end,midi-21].mean())+.35*float(out['onset'][max(0,begin-2):min(len(times),begin+3),midi-21].max())
        if onset>=len(audio)/sr or duration<.058 or confidence<.34:continue
        notes.append({'midi':int(midi),'onset':round(onset,5),'duration':round(duration,5),
            'velocity':round(float(amp),5),'confidence':round(confidence,5)})
    return sorted(notes,key=lambda n:(n['onset'],n['midi']))

def tuning(audio,sr):
    # Strong partials vote for a fine tuning offset only; nearest semitone and
    # register remain those of the independent polyphonic model candidates.
    votes=[];weights=[]
    for start in np.linspace(0,max(0,len(audio)-8192),min(180,max(1,len(audio)//8192)),dtype=int):
        block=audio[start:start+8192]
        if len(block)<8192:continue
        spec=np.abs(np.fft.rfft(block*np.hanning(8192)));hz=np.fft.rfftfreq(8192,1/sr)
        peaks,_=find_peaks(spec);peaks=[i for i in peaks if 130<hz[i]<2400]
        for i in sorted(peaks,key=lambda i:spec[i],reverse=True)[:8]:
            # Quadratic interpolation reduces the coarse FFT-bin tuning bias.
            a,b,c=np.log(np.maximum(spec[i-1:i+2],1e-12));den=a-2*b+c
            delta=.5*(a-c)/den if abs(den)>1e-12 else 0
            pitch=69+12*np.log2(((i+delta)*sr/8192)/440);cents=(pitch-round(pitch))*100
            votes.append(cents);weights.append(spec[i])
    if not votes:return 0
    order=np.argsort(votes);v=np.array(votes)[order];w=np.array(weights)[order]
    return float(np.clip(v[np.searchsorted(np.cumsum(w),sum(w)/2)],-35,35))

def synthesize(notes,length,sr,cents):
    out=np.zeros(length,dtype=np.float32)
    for index,note in enumerate(notes):
        start=round(note['onset']*sr);key=note['midi'];held=note['duration'];release=.26 if key<60 else .19
        size=min(length-start,round((held+release)*sr))
        if size<=0:continue
        t=np.arange(size,dtype=np.float64)/sr;freq=440*2**((key-69+cents/100)/12)
        # Distinct electronic voices: sustained bass, bright struck midvoice,
        # and glass upper voice, all retaining detected onsets and note lengths.
        ratio=2 if key<60 else 3 if key<77 else 1.5
        index_depth=(.48 if key<60 else 1.1 if key<77 else .7)*np.exp(-t/.22)
        phase=2*np.pi*freq*t;voice=np.sin(phase+index_depth*np.sin(phase*ratio))
        if key<60:voice=.82*voice+.18*np.sin(phase*2)
        else:voice=.79*voice+.15*np.sin(phase*2)+.06*np.sin(phase*3)
        attack=np.minimum(1,t/.007);sustain=.64+.36*np.exp(-t/.11)
        tail=np.exp(-np.maximum(0,t-held)/(release/6.9));env=attack*sustain*tail
        # A finite release and zero-valued endpoints prevent accidental clicks.
        if size>2:env[-min(64,size):]*=np.linspace(1,0,min(64,size))
        velocity=np.clip(note['velocity'],.12,1)**.7
        out[start:start+size]+=(voice*env*velocity*.16).astype(np.float32)
    return out

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True);parser.add_argument('--model',type=Path,required=True)
    parser.add_argument('--out-dir',type=Path,required=True);parser.add_argument('--sample-rate',type=int,default=32000)
    parser.add_argument('--notes-cache',type=Path);args=parser.parse_args();args.out_dir.mkdir(parents=True,exist_ok=True)
    source=args.source.resolve();sr=args.sample_rate;started=time.monotonic();acoustic=decode(source,sr)
    if args.notes_cache:
        report=json.loads(args.notes_cache.read_text())
        if report['sourceSha256']!=sha(source):raise ValueError('Cached notes do not match source SHA')
        notes=report['notes']
    else:notes=infer(decode(source,22050),args.model)
    cents=tuning(acoustic,sr);electronic=synthesize(notes,len(acoustic),sr,cents)
    a_rms=float(np.sqrt(np.mean(acoustic**2)));e_rms=float(np.sqrt(np.mean(electronic**2)))
    # Match comparable programme energy, then apply ONE shared attenuation so
    # equal-power superposition remains bounded even with correlated notes.
    electronic*=min(3,a_rms/max(e_rms,1e-12))
    combined_bound=float(np.max(np.sqrt(acoustic**2+electronic**2)));gain=min(1,.32/max(combined_bound,1e-12))
    acoustic*=gain;electronic*=gain
    # Both channels use the same encoded frames and one decoder delay.
    target=args.out_dir/'couperin-revoiced-pair.mp3'
    pair=np.column_stack((acoustic,electronic)).astype('<f4')
    subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(sr),'-ac','2','-i','-',
        '-c:a','libmp3lame','-b:a','192k','-joint_stereo','0',str(target)],input=pair.tobytes(),check=True)
    measured=subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','f32le','-ac','2','-ar',str(sr),'-'])
    encoded=np.frombuffer(measured,dtype='<f4').reshape(-1,2)
    # The decoded combined bound is a worst-case bound over ALL equal-power
    # mixes, not just three hand-picked settings. Room/bus levels need native QA.
    report={'schema':1,'sourceFile':source.name,'sourceSha256':sha(source),'pairFile':target.name,'pairSha256':sha(target),
      'duration':len(acoustic)/sr,'sampleRate':sr,'sampleCount':len(acoustic),'channels':{'0':'human mono downmix','1':'new note synthesis'},
      'sourceUrl':'https://commons.wikimedia.org/wiki/File:Fran%C3%A7ois_Couperin_%22L%27Art_de_toucher_le_Clavecin%22.wav',
      'performer':'David Joseph Stith','work':"François Couperin — L’Art de toucher le clavecin (complete)",
      'licence':'CC0 1.0','licenceUrl':'https://creativecommons.org/publicdomain/zero/1.0/',
      'modelSha256':sha(args.model),'method':'Spotify Basic Pitch ONNX CPU, onset .45/frame .25, 5-frame minimum, confidence feature >=.34; no tempo quantization',
      'confidence':'Weighted model activation; not a calibrated probability. Polyphony may contain omissions, octave/partial errors and duration errors.',
      'electronic':'Additive/FM bass, struck midvoice and glass upper voice at inferred actual onsets, note lengths and register; no source audio in this stem.',
      'tuningEstimateCents':cents,'sharedAttenuation':gain,'noteCount':len(notes),'notes':notes,
      'measurements':{'dryDecodedWorstEqualPowerPeak':float(np.max(np.sqrt(np.sum(encoded**2,axis=1)))),
        'nonfiniteSamples':int((~np.isfinite(encoded)).sum()),'clippedSamples':int((np.abs(encoded)>=1).sum()),
        'acousticRms':float(np.sqrt(np.mean(encoded[:,0]**2))),'electronicRms':float(np.sqrt(np.mean(encoded[:,1]**2))),
        'encodedBytes':target.stat().st_size,'runtimeSeconds':round(time.monotonic()-started,2)},
      'unvalidated':['Pitch/ornament correctness and by-ear alignment require musician review.','Fine tuning estimate includes partials and is not a historical tuning reconstruction.',
        'Native dry/wet mix, focus recovery and perceived revoicing require actual production capture.']}
    (args.out_dir/'couperin-revoicing.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    print(json.dumps({k:v for k,v in report.items()if k!='notes'},indent=2),flush=True)

if __name__=='__main__':main()
