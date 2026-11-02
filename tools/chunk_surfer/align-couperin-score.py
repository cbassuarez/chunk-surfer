#!/usr/bin/env python3
"""Align primary-score notes to the preserved human LEFT channel, CPU only.

Writes research artifacts only. No playback, inferred-pitch snapping, audio
synthesis or production cache replacement. Needs NumPy and ffmpeg/ffprobe.
"""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('OMP_NUM_THREADS','1')
from pathlib import Path
import argparse,hashlib,json,math,subprocess,time
import numpy as np
BOUNDARIES=[('allemande',1.1766,52.81),('prelude-1',56.1965,116.36),('prelude-2',121.1563,191.4042),('prelude-3',197.2014,263.6353),('prelude-4',266.2886,338.1362),('prelude-5',344.4801,483.5622),('prelude-6',487.0623,597.2232),('prelude-7',600.2913,740.8698),('prelude-8',746.7765,839.4695)]
SCORE_CREDIT={'work': 'L’Art de toucher le clavecin — François Couperin', 'digitalTranscription': 'Nicolas Sceaux, Mutopia Project', 'license': 'CC BY2.5 Generic', 'licenseURL': 'https://creativecommons.org/licenses/by/2.5/', 'sourceURL': 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=907', 'changes': 'Extracted MIDI score notes; aligned score timing to an independent human performance; two explicitly annotated P2 appoggiatura timing adjustments.'}
P2_HOLDOUT=[{'scoreBeat':1.,'writtenMidi':62,'performanceSeconds':121.25165},{'scoreBeat':1.75,'writtenMidi':64,'performanceSeconds':121.85537},{'scoreBeat':2.,'writtenMidi':50,'performanceSeconds':122.02952},{'scoreBeat':29.75,'writtenMidi':63,'performanceSeconds':146.07758},{'scoreBeat':30.,'writtenMidi':62,'performanceSeconds':146.40266}]
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def decode_left(path):
 command=['ffmpeg','-v','error','-i',str(path),'-af','pan=mono|c0=c0','-ar','32000','-f','f32le','-']
 result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
 return np.frombuffer(result.stdout,dtype='<f4').copy(),command

def spectra(signal,nfft,hop=320):
 padded=np.pad(signal,(nfft//2,nfft//2));count=1+(len(padded)-nfft)//hop;window=np.hanning(nfft).astype(np.float32)
 for start in range(0,count,256):
  indexes=(np.arange(start,min(count,start+256))[:,None]*hop+np.arange(nfft)[None,:]);block=padded[indexes]*window
  yield start,np.abs(np.fft.rfft(block,axis=1)).astype(np.float32)

def acoustic_features(signal,sr,reference):
 hop=320;count=1+len(signal)//hop;freq=np.fft.rfftfreq(8192,1/sr);valid=(freq>=40)&(freq<=4000);midi=np.zeros_like(freq);midi[valid]=69+12*np.log2(freq[valid]/reference)
 weights=np.zeros((12,len(freq)),np.float32)
 for pc in range(12):
  delta=(midi-pc+6)%12-6;weights[pc,valid]=np.exp(-.5*(delta[valid]/.24)**2)/(np.maximum(freq[valid],65)**.35)
 chroma=np.zeros((count,12),np.float32)
 for start,mag in spectra(signal,8192,hop):
  data=np.maximum(mag,1e-10)**.65;chroma[start:start+len(mag)]=data@weights.T
 chroma/=np.maximum(np.linalg.norm(chroma,axis=1,keepdims=True),1e-8)
 flux=np.zeros(count,np.float32);previous=None
 for start,mag in spectra(signal,2048,hop):
  compressed=np.log1p(mag*20);last=np.vstack([previous[None,:],compressed[:-1]])if previous is not None else np.vstack([compressed[:1],compressed[:-1]])
  flux[start:start+len(mag)]=np.maximum(compressed-last,0).sum(axis=1);previous=compressed[-1]
 flux=np.clip(flux/max(float(np.percentile(flux,93)),1e-8),0,1)
 return np.arange(count)*hop/sr,chroma,flux

def score_features(notes,beats):
 chroma=np.zeros((len(beats),12),np.float32);onset=np.zeros(len(beats),np.float32);step=beats[1]-beats[0]
 for note in notes:
  start=note['startQuarterBeats'];end=start+note['durationQuarterBeats'];pc=note['pitch']%12
  active=(beats>=start-1e-7)&(beats<end-1e-7);age=np.maximum(0,beats-start)
  value=(.4+.6*np.exp(-age/.9))*active
  chroma[:,pc]+=value;chroma[:,(pc+7)%12]+=.13*value;chroma[:,(pc+4)%12]+=.035*value
  onset+=np.exp(-.5*((beats-start)/max(step*.85,.015))**2)
 chroma/=np.maximum(np.linalg.norm(chroma,axis=1,keepdims=True),1e-8);onset=np.clip(onset/max(float(np.percentile(onset,90)),1e-8),0,1)
 return chroma,onset

def dtw(score,score_onset,audio,audio_onset,band_fraction=.18):
 n=len(score);band=max(24,math.ceil(n*band_fraction));back=np.zeros((n,n),np.uint8);previous=np.full(n,np.inf);previous2=np.full(n,np.inf);previous_local=np.zeros(n);local_sum=0
 for i in range(n):
  lo=max(0,i-band);hi=min(n,i+band+1);current=np.full(n,np.inf);local=np.full(n,2.,np.float64)
  local[lo:hi]=.84*(1-np.clip(audio[lo:hi]@score[i],0,1))+.16*np.abs(audio_onset[lo:hi]-score_onset[i])
  for j in range(lo,hi):
   if i==0 and j==0:current[j]=local[j];continue
   best=np.inf;kind=0
   if i>=1 and j>=1:best=previous[j-1]+local[j];kind=1
   if i>=1 and j>=2:
    candidate=previous[j-2]+.75*(local[j-1]+local[j])+.025
    if candidate<best:best=candidate;kind=2
   if i>=2 and j>=1:
    candidate=previous2[j-1]+.75*(previous_local[j]+local[j])+.025
    if candidate<best:best=candidate;kind=3
   current[j]=best;back[i,j]=kind
  previous2=previous;previous=current;previous_local=local
 assert np.isfinite(previous[-1]),'DTW failed fixed endpoint'
 i=j=n-1;path=[(i,j)]
 while i or j:
  kind=back[i,j]
  if kind==1:i-=1;j-=1
  elif kind==2:i-=1;j-=2
  elif kind==3:i-=2;j-=1
  else:raise ValueError('No DTW predecessor')
  path.append((i,j))
 path.reverse();return np.array(path),float(previous[-1]/n),band

def performed_ornament(name,note,onset,offset):
 # One independently observed realization, not a key filter or whole-beat shift.
 # LilyPond prelude2.ly: \appoggiatura es'8 d'4 at beat30. The old MIDI
 # overlaps the grace and principal; the preserved human delays the resolution.
 if name!='prelude-2' or note['track']!=1:return onset,offset,None
 identity=(note['startQuarterBeats'],note['pitch'])
 if identity not in [(29.75,63),(30.0,62)]:return onset,offset,None
 original={'onset':round(onset,6),'offset':round(offset,6),'duration':round(offset-onset,6)}
 if identity==(30.0,62):onset=146.40
 else:offset=146.40
 adjustment={'kind':'explicit source-performed appoggiatura realization','scoreSource':'lilypond/prelude2.ly, appoggiatura es-prime8 to d-prime4','originalDTW':original,'reason':'Keep the independently aligned bass and Eb attack; delay only the upper D resolution to the measured human attack and release Eb at that resolution.','evidence':{'principalD4AttackSeconds':146.40,'measurementUncertaintySeconds':.06,'method':'Independent 128ms Hann-window acoustic fundamental band near278.1Hz, corroborated by candidate onset146.40266; precedingEb attack145.70–145.73 and bass145.96 retained.'},'wholeBeatOrBassShifted':False,'pitchChanged':False}
 return onset,offset,adjustment

def align(name,start,end,args,audio,source_proof):
 path=args.score_dir/(name+'-score-events.json');score=json.loads(path.read_text());notes=score['notes'];first=min(n['startQuarterBeats']for n in notes);last=max(n['startQuarterBeats']+n['durationQuarterBeats']for n in notes)
 beats=np.linspace(first,last,math.ceil((last-first)*24)+1);time_grid=np.linspace(start,end,len(beats));segment=audio[round(start*32000):round(end*32000)];times,chroma,onset=acoustic_features(segment,32000,args.reference)
 sampled=np.stack([np.interp(time_grid-start,times,chroma[:,pc])for pc in range(12)],axis=1);sampled/=np.maximum(np.linalg.norm(sampled,axis=1,keepdims=True),1e-8);sample_onset=np.interp(time_grid-start,times,onset);score_chroma,score_onset=score_features(notes,beats)
 warp,cost,band=dtw(score_chroma,score_onset,sampled,sample_onset,args.band);mapped_indices=np.interp(np.arange(len(beats)),warp[:,0],warp[:,1]);mapped_times=np.interp(mapped_indices,np.arange(len(beats)),time_grid);assert np.all(np.diff(mapped_times)>0),'nonmonotonic warp'
 lookup=lambda beat:float(np.interp(beat,beats,mapped_times));linear=lambda beat:start+(beat-first)/(last-first)*(end-start)
 result=[]
 for note in notes:
  onset_time=lookup(note['startQuarterBeats']);offset=lookup(note['startQuarterBeats']+note['durationQuarterBeats']);onset_time,offset,ornament=performed_ornament(name,note,onset_time,offset);assert offset>onset_time
  index=int(np.clip(round((note['startQuarterBeats']-first)/(last-first)*(len(beats)-1)),0,len(beats)-1));j=int(np.clip(round(mapped_indices[index]),0,len(beats)-1));similarity=float(np.clip(np.dot(score_chroma[index],sampled[j]),0,1));rms=float(np.sqrt(np.mean(segment[max(0,round((onset_time-start)*32000)):min(len(segment),round((onset_time-start+.09)*32000))]**2)))
  result.append({'movement':name,'midi':note['pitch'],'writtenMidi':note['pitch'],'noteNameMidiSpelling':note['noteName'],'scoreTrack':note['track'],'scoreChannel':note['channel'],'staff':'upper'if note['track']==1 else'lower'if note['track']==2 else'other','scoreBeat':note['startQuarterBeats'],'scoreDurationBeats':note['durationQuarterBeats'],'onset':round(onset_time,6),'duration':round(offset-onset_time,6),'offset':round(offset,6),'velocity':note['velocity']/127,'scoreVelocity':note['velocity'],'alignmentConfidence':round(similarity,5),'localAcousticRMS':round(rms,7),'linearOnset':round(linear(note['startQuarterBeats']),6),**({'performedOrnamentAdjustment':ornament}if ornament else{})})
 residuals=[]
 if name=='prelude-2':
  for held in P2_HOLDOUT:residuals.append({**held,'alignedSeconds':lookup(held['scoreBeat']),'errorSeconds':lookup(held['scoreBeat'])-held['performanceSeconds'],'linearSeconds':linear(held['scoreBeat']),'linearErrorSeconds':linear(held['scoreBeat'])-held['performanceSeconds']})
 diagnostics={'movement':name,'performanceBoundary':{'firstActive':start,'lastSoundApproximate':end},'scoreBoundaryBeats':{'firstActive':first,'lastEnd':last},'method':'fixed-boundary score-chroma/onset DTW; step set(1,1),(1,2),(2,1); strict increasing interpolated warp','bandFraction':args.band,'bandGridWidth':band,'scoreGridQuarterBeats':float(beats[1]-beats[0]),'meanPathCost':cost,'notes':len(result),'lowestWrittenMidi':min(n['midi']for n in result),'highestWrittenMidi':max(n['midi']for n in result),'heldOutOpeningAnchors':residuals,'medianAbsoluteDepartureFromLinearSeconds':float(np.median(np.abs(mapped_times-time_grid))),'maximumAbsoluteDepartureFromLinearSeconds':float(np.max(np.abs(mapped_times-time_grid))),'minLocalTempoRatioToLinear':float(np.min(np.diff(mapped_times)/np.diff(time_grid))),'maxLocalTempoRatioToLinear':float(np.max(np.diff(mapped_times)/np.diff(time_grid))),'warp':[{'scoreBeat':float(beats[i]),'performanceSeconds':float(time_grid[j])}for i,j in warp],'manualPerformedOrnamentAdjustments':[{'writtenMidi':n['midi'],'scoreBeat':n['scoreBeat'],'onset':n['onset'],'offset':n['offset'],**n['performedOrnamentAdjustment']}for n in result if 'performedOrnamentAdjustment'in n],'scoreSource':{'json':str(path),'jsonSHA256':sha(path),'midi':score['file'],'midiSHA256':score['sha256']}}
 report={'schema':1,'kind':'primary-score-led performance alignment study','movement':name,'pitchSpace':'written score MIDI; use referenceA frequency, NOT the old model-cache MIDI labels','referenceAHz':args.reference,'source':source_proof,'scoreSourceLicense':SCORE_CREDIT,'diagnostics':diagnostics,'notes':result,'limitations':['Not a facsimile-critical edition: source is the Nicolas Sceaux Mutopia transcription.','MIDI note spelling is chromatic display spelling; original enharmonic accidentals remain in LilyPond.','MIDI merges polyphonic voices within each staff track; staff is retained, inner voices are not invented.','Notated ornament symbols are not fully realized by these score MIDI events; this is an arrangement, not complete performance fidelity. Only the explicitly annotated P2 appoggiatura principal/grace timing has source-performed refinement.','Fixed boundaries are supplied independently; end boundary includes approximate final sound/tail, not a measured individual release.','Alignment confidence is local chroma similarity, not a calibrated probability or musician acceptance.','Velocity retains the source MIDI velocity, which is constant127; localAcousticRMS is a separate uncalibrated expression measurement.','No production files/audio have been replaced; no playback occurred.']}
 target=args.out_dir/('aligned-'+name+'.json');target.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in diagnostics.items()if k!='warp'}),flush=True);return report

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,default=Path('public/audio/source-rest/couperin/couperin-revoiced-pair.mp3'));p.add_argument('--score-dir',type=Path,default=Path('artifacts/couperin-pressure/score'));p.add_argument('--out-dir',type=Path,default=Path('artifacts/couperin-pressure/score'));p.add_argument('--movement',choices=[x[0]for x in BOUNDARIES],action='append');p.add_argument('--reference',type=float,default=416.75);p.add_argument('--band',type=float,default=.18);args=p.parse_args();args.out_dir.mkdir(parents=True,exist_ok=True)
 started=time.monotonic();source_hash=sha(args.source);audio,command=decode_left(args.source);proof={'path':str(args.source),'sha256':source_hash,'channel':0,'sampleRate':32000,'samples':len(audio),'duration':len(audio)/32000,'decodeCommand':command,'selection':'Preserved acoustic LEFT only; no synthesized channel analysis'};reports=[]
 for name,start,end in BOUNDARIES:
  if args.movement and name not in args.movement:continue
  reports.append(align(name,start,end,args,audio,proof))
 merged={'schema':1,'kind':'primary-score-led aligned notes; arrangement study','source':proof,'scoreSourceLicense':SCORE_CREDIT,'referenceAHz':args.reference,'pitchSpace':'written MIDI plus explicit reference; no pitch-class snapping','notes':sorted([n for r in reports for n in r['notes']],key=lambda n:(n['onset'],n['scoreTrack'],n['midi'])),'movements':[{'name':r['movement'],'diagnostics':{k:v for k,v in r['diagnostics'].items()if k!='warp'},'report':str(args.out_dir/('aligned-'+r['movement']+'.json'))}for r in reports],'sourceFilesUnchanged':sha(args.source)==source_hash,'runtimeSeconds':time.monotonic()-started,'limitations':reports[0]['limitations']if reports else[]};assert merged['sourceFilesUnchanged'];(args.out_dir/('aligned-score-notes.json'if not args.movement else'aligned-selected-score-notes.json')).write_text(json.dumps(merged,indent=2)+'\n')
if __name__=='__main__':main()
