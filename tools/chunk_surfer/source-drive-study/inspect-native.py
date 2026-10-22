"""Inspect saved native artifacts; this is technical evidence, never a listening test."""
import json,hashlib,subprocess,statistics
from pathlib import Path
import numpy as np
base=Path('artifacts/source-drive-study/native')
def load(n):return json.loads((base/n).read_text())
def probe(p,args):return json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error',*args,'-of','json',str(p)]))
def quant(a):
 a=sorted(a);return {'n':len(a),'p50':statistics.median(a),'p95':a[min(len(a)-1,int(len(a)*.95))],'max':max(a)}
movie=load('ordinary-to-investigation.json');f=load('final-session.json');old=load('ordinary-session.json');control=load('capture-overhead-control.json')
packargs=['-show_packets','-show_data_hash','sha256','-show_entries','packet=stream_index,pts,dts,duration,size,data_hash']
a=probe(base/'ordinary-to-investigation.webm',packargs);b=probe(base/'ordinary-to-investigation-review.webm',packargs)
def packet_receipt(data):
 return {stream:[{k:p.get(k)for k in ['pts','dts','size','data_hash']}for p in data['packets']if p['stream_index']==stream]for stream in [0,1]}
packet_identity=packet_receipt(a)==packet_receipt(b)
gaps={}
for stream in ['video','audio']:
 values=[float(x.split(',')[0])for x in(base/(stream+'-pts.csv')).read_text().splitlines()if x.strip()]
 gaps[stream]={'packets':len(values),'firstPts':values[0],'lastPts':values[-1],'gapSeconds':quant([y-x for x,y in zip(values,values[1:])])}
heard=np.fromfile(base/'movie-audio.f32',dtype='<f4');tape=np.fromfile(base/'take-audio.f32',dtype='<f4')
# Same sound at output-gain difference: compare a 1-second steady road window.
x=tape[80000:88000];best=None
for lag in range(-800,801):
 y=heard[80000+lag:88000+lag];corr=float(np.dot(x,y)/np.sqrt(np.dot(x,x)*np.dot(y,y)))
 if best is None or corr>best['correlation']:best={'lagSamples':lag,'lagSeconds':lag/8000,'correlation':corr,'outputToTapeGain':float(np.dot(x,y)/np.dot(x,x))}
events=movie['final']['audio']['events'];forecast=next(e['audioTime']for e in events if e['type']=='broadcast-joint-fingerprint');physical=next(e['audioTime']for e in events if e['type']=='physical-joint-fingerprint')
before=load('unrecorded-control.json');after=load('recorded-control.json');arrival=load('arrival-no-record.json');later=load('arrival-clock-continues.json')
frameWindows={}
for label,start,end in [('unrecorded',control['start']-5900,control['start']-100),('captured',control['start']+100,control['start']+5900)]:
 fs=[x for x in control['frames']if start<x['wall']<end];frameWindows[label]={key:quant([x[key]for x in fs])for key in ['deltaMs','submissionMs']}
persist=[base/'persist-before.webm',base/'persist-after.webm'];hashes=[hashlib.sha256(p.read_bytes()).hexdigest()for p in persist]
ff=probe(persist[1],['-show_frames','-select_streams','a:0','-show_entries','frame=nb_samples']);decoded=sum(int(v.get('nb_samples',0))for v in ff['frames'])/48000
sealed=next(json.loads(line)['result']['take']for line in Path('artifacts/source-drive-study/native-final-run.log').read_text().splitlines()if 'persist-before.webm' in line)
sourceBefore={x['path']:x['sha256']for x in f['sourceBefore']};sourceAfter={x['path']:x['sha256']for x in f['sourceAfter']}
report={'kind':'source-drive-native-technical-inspection','scope':'One49second ordinary-input world-canvas capture plus final short native regressions. No finished voices, fixed-mic acoustics, full journey or human acceptance.',
'capture':{'canvas':[1100,690],'wallSeconds':(movie['end']-movie['start'])/1000,'decodedAudioSeconds':len(heard)/8000,'videoBytes':movie['bytes'],'packets':gaps,'reviewRemuxIdenticalPacketsAndTimestamps':packet_identity,'domHudInMovie':False,'audio':'actual monitored cabin bus; synthetic mechanical timing proxies'},
'bridge':{'broadcastAudioTime':forecast,'physicalAudioTime':physical,'leadSeconds':physical-forecast,'claim':'same constructed three-joint pattern is scheduled at two physical route crossings; perceptual recognition is pending'},
'savedTake':{'decodedSeconds':len(tape)/8000,'correlationWindow':best,'scope':'Correlation is a technical routing check, not proof of intelligibility or fixed-microphone realism.'},
'finalChecks':{'persistBeforeSha256':hashes[0],'persistAfterSha256':hashes[1],'byteIdenticalAfterPageReload':hashes[0]==hashes[1],'decodedSeconds':decoded,'tapeDurationSeconds':sealed['duration'],'durationIntegrity':sealed.get('durationIntegrity'),'tapeUsesDecodedSamples':abs(decoded-sealed['duration'])<1/48000,'gamePauseExcluded':decoded<2.3,'arrivalWithoutRecording':arrival['arrived']and not arrival['takes'],'radioRemainsOffAtArrival':not arrival['radioOn'],'arrivalProgrammeClockContinues':later['programTime']>arrival['programTime']and later['furthest']==arrival['furthest'],'sourceFiles':len(sourceBefore),'sourceDrift':[k for k,v in sourceBefore.items()if sourceAfter.get(k)!=v],'browserErrors':f['errors']},
'captureOverhead':{'method':'Sequential six-second straight-input control, once without movie capture and once with it. This is a short warm-cache observation; order is confounded. CPU submission time is not GPU render time.', 'windows':frameWindows},
'limits':['The49second movie predates only the later decoded-duration and telemetry fixes; final native regressions cover those fixes. Its source tree was live, not frozen.','Final short run checked140renderer/fixture source identities at entry/exit and found no drift. This does not freeze the entire production game.','Broad Source inspection lighting is inherited; declared point headlamps are not used by that compositor branch.','No physical hands, mirror reflections, fixed microphone response, performed dialogue, safe semantic edits or end-to-end Source insertion is demonstrated.','No blinded player, independent sound-design or narrative-continuity review has occurred.','Unexpected process death can lose unsealed audio; cross-machine save export is not implemented.']}
report['passed']=all([packet_identity,report['finalChecks']['byteIdenticalAfterPageReload'],report['finalChecks']['tapeUsesDecodedSamples'],report['finalChecks']['arrivalWithoutRecording'],report['finalChecks']['arrivalProgrammeClockContinues'],not report['finalChecks']['sourceDrift'],not f['errors']])
(base/'inspection.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k]for k in ['passed','bridge','savedTake','finalChecks','captureOverhead']},indent=2))
