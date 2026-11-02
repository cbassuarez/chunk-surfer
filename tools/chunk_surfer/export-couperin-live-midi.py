#!/usr/bin/env python3
"""Editable fixed-clock MIDI backups for the frozen Couperin V4 arrangement.

Data only: no synthesis/playback, render-code changes or production replacement.
MIDI preserves written pitches; its device must supply the explicit tuning map.
"""
from pathlib import Path
import argparse,collections,hashlib,importlib.util,inspect,json,math,struct,sys
EXPECTED='8754d99dce8dde168f0c0034b44fcab2dad1fb5a73fa6bac19d1d3c90d274507'
PPQ=9600;BPM=120;SAMPLE_RATE=32000;SAMPLE_COUNT=26981039;SECONDS=SAMPLE_COUNT/SAMPLE_RATE;END_TICK=round(SECONDS*PPQ*2)
LABELS=['01 Bass','02 Tenor','03 Alto','04 Soprano','05 Bass bed']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def vlq(value):
 assert 0<=value<2**28;out=[value&127];value>>=7
 while value:out.insert(0,128|(value&127));value>>=7
 return bytes(out)
def meta(kind,data):return bytes([255,kind])+vlq(len(data))+data
def chunk(events):
 events=sorted(events,key=lambda e:(e[0],e[1]));data=bytearray();last=0
 for tick,priority,payload in events:data+=vlq(tick-last)+payload;last=tick
 data+=vlq(END_TICK-last)+b'\xff\x2f\x00';return b'MTrk'+struct.pack('>I',len(data))+data

def channel_notes(notes,preferred):
 # Standard MIDI note-off has no per-note identifier. Disambiguate the55
 # overlapping equal pitches without deleting, merging or shortening a note.
 active=collections.defaultdict(dict);result=[];extra=0
 pool=[preferred]+[c for c in [5,6,7,8,10,11,12,13,14,15,0,1,2,3,4]if c!=preferred]
 for note in sorted(notes,key=lambda n:(n['onset'],n['midi'],n.get('scoreTrack',0))):
  start=round(note['onset']*PPQ*2);end=max(start+1,round((note['onset']+note['duration'])*PPQ*2));pitch=int(note['midi']);active[pitch]={c:t for c,t in active[pitch].items()if t>start};channel=next(c for c in pool if c not in active[pitch]);active[pitch][channel]=end
  velocity=int(note.get('scoreVelocity',round(note.get('velocity',.72)*127)));velocity=max(1,min(127,velocity));extra+=int(channel!=preferred)
  result.append({**note,'startTick':start,'endTick':end,'midiChannel':channel+1,'midiChannelZeroBased':channel,'midiVelocity':velocity,'startBeats':note['onset']*2,'durationBeats':note['duration']*2,'endBeats':(note['onset']+note['duration'])*2})
 return result,extra

def write_midi(path,tracks,markers):
 conductor=[(0,0,meta(3,b'Couperin absolute performance clock')),(0,1,meta(81,(500000).to_bytes(3,'big'))),(0,2,meta(88,bytes([4,2,24,8]))),(0,3,meta(1,b'120 BPM clock, not rhythmic quantization. Written score MIDI; exact Rameau/A416.75 tuning supplied separately.')),(0,4,meta(2,b'Couperin; transcription Nicolas Sceaux/Mutopia, CC BY2.5. Performed timing alignment and explicit P2 appoggiatura refinement.'))]
 for m in markers:conductor.append((m['tick'],5,meta(6,m['label'].encode('utf-8'))))
 conductor.append((END_TICK,6,meta(6,b'END 26981039 samples at32000Hz')));all_tracks=[chunk(conductor)]
 for name,notes in tracks:
  events=[(0,0,meta(3,name.encode('utf-8')))]
  for n in notes:
   channel=n['midiChannelZeroBased'];events.extend([(n['startTick'],2,bytes([0x90|channel,n['midi'],n['midiVelocity']])),(n['endTick'],1,bytes([0x80|channel,n['midi'],64]))])
  all_tracks.append(chunk(events))
 payload=b'MThd'+struct.pack('>IHHH',6,1,len(all_tracks),PPQ)+b''.join(all_tracks);path.write_bytes(payload)
 return {'file':str(path),'sha256':sha(path),'format':1,'tracksIncludingConductor':len(all_tracks),'noteCount':sum(len(notes)for _,notes in tracks),'bytes':len(payload)}

def read_midi(path):
 data=path.read_bytes();assert data[:4]==b'MThd';fmt,count,ppq=struct.unpack('>HHH',data[8:14]);pos=14;tracks=[]
 def read_var(data,pos):
  value=0
  while True:
   v=data[pos];pos+=1;value=(value<<7)|(v&127)
   if v<128:return value,pos
 for i in range(count):
  assert data[pos:pos+4]==b'MTrk';length=int.from_bytes(data[pos+4:pos+8],'big');d=data[pos+8:pos+8+length];pos+=length+8;at=0;tick=0;active={};notes=[];name='';markers=[];tempo=[]
  while at<len(d):
   delta,at=read_var(d,at);tick+=delta;status=d[at];at+=1
   if status==255:
    kind=d[at];at+=1;size,at=read_var(d,at);value=d[at:at+size];at+=size
    if kind==3:name=value.decode('utf-8')
    if kind==6:markers.append((tick,value.decode('utf-8')))
    if kind==81:tempo.append((tick,int.from_bytes(value,'big')))
    if kind==47:break
   else:
    pitch,velocity=d[at:at+2];at+=2;channel=status&15;key=(channel,pitch)
    if status>>4==9:assert key not in active;active[key]=(tick,velocity)
    else:
     assert status>>4==8;start,vel=active.pop(key);notes.append((pitch,start,tick,channel,vel))
  assert not active;assert tick==END_TICK;tracks.append({'name':name,'notes':notes,'markers':markers,'tempo':tempo})
 assert pos==len(data)and fmt==1 and ppq==PPQ;return tracks

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--score',type=Path,default=Path('artifacts/couperin-pressure/score/aligned-score-notes.json'));p.add_argument('--out',type=Path,default=Path('artifacts/couperin-live12/midi'));p.add_argument('--tuning',type=Path,default=Path('artifacts/couperin-pressure/v3/tuning-profile.json'));p.add_argument('--movement-map',type=Path,default=Path('artifacts/couperin-pressure/v3/full-movement-map.json'));args=p.parse_args();assert sha(args.score)==EXPECTED,'Frozen score hash mismatch';data=json.loads(args.score.read_text());notes=data['notes'];assert len(notes)==3202
 args.out.mkdir(parents=True,exist_ok=True);source=Path('tools/chunk_surfer/render-couperin-pressure.py');spec=importlib.util.spec_from_file_location('couperin_v4_midi_source',source);engine=importlib.util.module_from_spec(spec);sys.modules[spec.name]=engine;spec.loader.exec_module(engine);tuning=engine.load_tuning_profile(args.tuning);movements=engine.load_movement_map(args.movement_map);original_map_end=movements[-1]['end'];movements=[dict(m)for m in movements];movements[-1]['end']=SECONDS
 score_groups=[[]for _ in range(4)]
 for i,n in enumerate(notes):
  lane=0 if n['midi']<48 else 1 if n['midi']<60 else 2 if n['midi']<72 else 3;score_groups[lane].append({**n,'sourceNoteIndex':i,'registerLane':lane})
 bed=engine.derive_score_bed(notes,tuning,movements,bow_wall=True)
 bed_notes=[{'movement':next(m['name']for m in data['movements']if m['diagnostics']['performanceBoundary']['firstActive']<=s['start']<=m['diagnostics']['performanceBoundary']['lastSoundApproximate']+.2),'midi':s['midi'],'writtenMidi':s['midi'],'onset':s['start'],'duration':s['end']-s['start'],'offset':s['end'],'velocity':.30,'scoreVelocity':38,'derivedBassBed':True,'sourceNoteIndices':s['notes'],'registerLane':4,'staff':'derived-lowest-held-score-note'}for s in bed]
 all_groups=score_groups+[bed_notes];prepared=[]
 for lane,group in enumerate(all_groups):
  assigned,extra=channel_notes(group,lane);prepared.append({'name':LABELS[lane],'lane':lane,'isDerivedBassBed':lane==4,'notes':assigned,'overlappingEqualPitchChannelReassignments':extra,'channelsUsed':sorted(set(n['midiChannel']for n in assigned))})
 markers=[]
 for index,m in enumerate(data['movements']):
  boundary=m['diagnostics']['performanceBoundary'];label='00 Allemande'if index==0 else f'{index:02} Prelude{index}';markers.append({'id':m['name'],'label':label,'seconds':boundary['firstActive'],'beats':boundary['firstActive']*2,'tick':round(boundary['firstActive']*PPQ*2),'lastSoundSeconds':boundary['lastSoundApproximate'],'timbreChangeSeconds':movements[index]['start']})
 files=[];files.append(write_midi(args.out/'score-register-4tracks.mid',[(g['name'],g['notes'])for g in prepared[:4]],markers));files.append(write_midi(args.out/'score-plus-bassbed-5tracks.mid',[(g['name'],g['notes'])for g in prepared],markers))
 for group in prepared:files.append(write_midi(args.out/(group['name']+'.mid'),[(group['name'],group['notes'])],markers))
 all_assigned,_=channel_notes(notes,0);files.append(write_midi(args.out/'score-all-notes.mid',[('All3202 written notes',all_assigned)],markers))
 staves=[]
 for staff in [1,2]:staves.append((('Upper score staff'if staff==1 else'Lower score staff'),channel_notes([n for n in notes if n['scoreTrack']==staff],staff-1)[0]))
 assert sum(len(g)for _,g in staves)==3202;files.append(write_midi(args.out/'score-staves-2tracks.mid',staves,markers))
 checks=[]
 for file in files:
  parsed=read_midi(Path(file['file']));assert sum(len(t['notes'])for t in parsed)==file['noteCount'];assert len(parsed[0]['markers'])==10;assert parsed[0]['tempo']==[(0,500000)];checks.append({'file':file['file'],'noteCount':file['noteCount'],'validSMF':True,'nineMovementMarkersPlusEnd':True,'fixed120BPM':True})
 parsed=read_midi(args.out/'score-plus-bassbed-5tracks.mid')
 for group,track in zip(prepared,parsed[1:]):
  expected=collections.Counter((n['midi'],n['startTick'],n['endTick'],n['midiChannelZeroBased'],n['midiVelocity'])for n in group['notes']);assert expected==collections.Counter(track['notes'])
 max_error=max(abs(n['startTick']/(PPQ*2)-n['onset'])for g in prepared for n in g['notes']);max_end_error=max(abs(n['endTick']/(PPQ*2)-(n['onset']+n['duration']))for g in prepared for n in g['notes'])
 pitch_map=[]
 for midi in sorted(set(n['midi']for n in notes)):
  centre=engine.frequency(midi,tuning);four=engine.bow_detuned_frequencies(midi,tuning).tolist();pitch_map.append({'writtenMidi':midi,'scientificOctaveNote':next(n.get('noteNameMidiSpelling','')for n in notes if n['midi']==midi),'centreHz':centre,'centsFromA440EqualTemperament':1200*math.log2(centre/(440*2**((midi-69)/12))),'fourOverdubHz':four,'bassBedDoubletHz':engine.detuned_frequencies(midi,tuning).tolist(),'actualOverdubCentsFromCentre':[1200*math.log2(f/centre)for f in four]})
 tuning_contract={'profile':json.loads(args.tuning.read_text()),'profileSHA256':sha(args.tuning),'formula':tuning.receipt()['formula'],'nominalFourOverdubCents':[-3.6,-1.2,1.4,3.3],'nominalBassBedDoubletCents':[-2.8,3.1],'individualOffsetCapHz':.75,'midiMicrotuningEncoded':False,'instruction':'MIDI preserves written note numbers. Use the exact per-note tuned sample bank/device mapping; ordinary ET playback is not equivalent to V4. No old semitone correction or oldglobal+6.094c may be added.','pitches':pitch_map};(args.out/'frequency-map.json').write_text(json.dumps(tuning_contract,indent=2)+'\n')
 contract={'schema':1,'kind':'Editable V4 Couperin common-clock MIDI','sourceScore':str(args.score),'sourceScoreSHA256':EXPECTED,'scoreSourceLicense':data['scoreSourceLicense'],'tempoBPM':BPM,'ppq':PPQ,'secondsToBeats':2,'secondsToTicks':PPQ*2,'sampleRate':SAMPLE_RATE,'sampleCount':SAMPLE_COUNT,'durationSeconds':SECONDS,'durationBeats':SECONDS*2,'endTick':END_TICK,'tickSeconds':1/(PPQ*2),'maxOnsetTickErrorSeconds':max_error,'maxOffsetTickErrorSeconds':max_end_error,'originalScoreMaxOnsetTickErrorSeconds':max(abs(n['startTick']/(PPQ*2)-n['onset'])for g in prepared[:4]for n in g['notes']),'originalScoreMaxOffsetTickErrorSeconds':max(abs(n['endTick']/(PPQ*2)-(n['onset']+n['duration']))for g in prepared[:4]for n in g['notes']),'derivedBassBedMinimumOneTickEvents':sum(n['duration']<1/(PPQ*2)for n in prepared[4]['notes']),'rhythm':'Absolute performed times retained; no musical-grid quantization. Original3202score events round within26.05microseconds. Derived sub-tick bed slivers use at least one positive tick and can differ by up to80microseconds; exact source timings remain inJSON.','pitch':'Exact written MIDI31–86 retained. Scientific note names and Live display octave labels may differ; MIDI numbers are authoritative. Device/sample tuning is separate.','originalScoreNoteCount':3202,'derivedBassBedNoteCount':len(bed_notes),'tracks':prepared,'movementMarkers':markers,'movementChoreography':movements,'rangeCorrection':{'oldFinalMovementMapSeconds':original_map_end,'newFinalMovementMapSeconds':SECONDS,'framesDifference':(SECONDS-original_map_end)*SAMPLE_RATE,'notesChanged':False},'rendererSource':{'path':str(source),'sha256':sha(source),'derivedBedHelperSHA256':hashlib.sha256(inspect.getsource(engine.derive_score_bed).encode()).hexdigest(),'pureFunctionsOnly':['load_tuning_profile','load_movement_map','frequency','bow_detuned_frequencies','derive_score_bed'],'synthesisOrPlaybackCalled':False},'files':files,'verification':checks,'sourceScoreUnchanged':sha(args.score)==EXPECTED,'limitations':['Register tracks are polyphonic timbral ensembles, not falsely claimed independent monophonic counterpoint. Original score staff/channel remain attached to every note.','55 overlapping equal score pitches are retained, with spare MIDI channels where needed so note-offs remain unambiguous in standard MIDI. Live clip import behaviour still needs native confirmation; editable-tracks JSON retains individual identities.','Four V4 overdub frequencies are recorded per pitch; the MIDI file itself does not realize Rameau tuning or frequency-dependent detune.','Exact current sound remains in separately supplied common-clock audio stems; native Simpler equivalence requires device mapping/listening acceptance.']}
 (args.out/'editable-tracks.json').write_text(json.dumps(contract,indent=2)+'\n');summary={k:v for k,v in contract.items()if k!='tracks'};summary['tracks']=[{k:v for k,v in g.items()if k!='notes'}|{'noteCount':len(g['notes'])}for g in prepared];(args.out/'export-receipt.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'noteCount':3202,'bassBedCount':len(bed_notes),'tracks':summary['tracks'],'duration':SECONDS,'maxOnsetError':max_error,'maxOffsetError':max_end_error,'files':files},indent=2))
if __name__=='__main__':main()
