#!/usr/bin/env python3
"""Build editable Live Intro sample approximations and user-wavetable sources.
Exact baseline audio remains the separately printed V4 master/stems. Never plays.
"""
from pathlib import Path
import importlib.util,sys,json,subprocess,hashlib,math,time,argparse
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('couperin_pressure_engine',ROOT/'tools/chunk_surfer/render-couperin-pressure.py')
synth=importlib.util.module_from_spec(spec);sys.modules[spec.name]=synth;spec.loader.exec_module(synth)
OUT=ROOT/'artifacts/couperin-live12';SCORE=ROOT/'artifacts/couperin-pressure/score/aligned-score-notes.json'
TUNING=ROOT/'artifacts/couperin-pressure/v3/tuning-profile.json'
CREDIT='Composition: Francois Couperin. Score: Nicolas Sceaux / Mutopia907 CC BY2.5 https://creativecommons.org/licenses/by/2.5/ . Performance timing: David Joseph Stith CC0. Electronic V4 bowed-wavetable arrangement. Editable samples are an approximation of the frozen printed baseline.'

def write_audio(samples,path,codec='pcm_s24le'):
    path.parent.mkdir(parents=True,exist_ok=True);a=np.asarray(samples,dtype='<f4');channels=1 if a.ndim==1 else a.shape[1]
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-f','f32le','-ar','32000','-ac',str(channels),'-i','pipe:0','-c:a',codec,'-metadata','comment='+CREDIT,str(path)],input=a.tobytes(),check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--only',nargs='+',type=int);args=parser.parse_args()
    started=time.perf_counter();data=json.loads(SCORE.read_text());assert synth.sha(SCORE)=='8754d99dce8dde168f0c0034b44fcab2dad1fb5a73fa6bac19d1d3c90d274507'
    tuning=synth.load_tuning_profile(TUNING);score_keys={int(n['midi']) for n in data['notes']};keys=sorted(set(args.only) if args.only else score_keys|{32,34});rows=[];wave_rows=[]
    if args.only and (OUT/'voice-bank-map.json').exists():
        rows=[r for r in json.loads((OUT/'voice-bank-map.json').read_text())['samples'] if r['midi'] not in keys]
        wave_rows=[r for r in json.loads((OUT/'wavetable-assets.json').read_text())['tables'] if r['midi'] not in keys]
    tmp=OUT/'voice-banks/.temporary';tmp.mkdir(parents=True,exist_ok=True)
    movement=[{'id':'Representative accepted V4 body','start':0,'end':8,'position':9.1,'excursion':0,'scanHz':0,'drive':1.4,'fundamentalGain':.14}]
    for index,midi in enumerate(keys):
        group='Bass' if midi<48 else 'Tenor' if midi<60 else 'Alto' if midi<72 else 'Soprano'
        note={'midi':midi,'onset':0,'duration':8,'velocity':.72}
        spans,colours,_=synth.allocate_score_spans([note],tuning,movement,overdubs=4,bow_wall=True)
        raw=tmp/f'{midi}.f32';decoded=tmp/f'{midi}.wav'
        synth.synthesize_raw(spans,colours,raw,0,8,tuning,4,movement,True)
        synth.ffmpeg('-f','f32le','-ar','128000','-ac',2,'-i',raw,'-af','aresample=32000:filter_size=64:cutoff=0.92,highpass=f=8:p=1','-c:a','pcm_f32le',decoded)
        audio=synth.decode_f32(decoded).reshape(-1,2).astype(np.float64);raw.unlink();decoded.unlink()
        loop_a,loop_b,crossfade=32000,224000,3840
        original=audio.copy();w=synth.smooth(np.linspace(0,1,crossfade))[:,None]
        audio[loop_b-crossfade:loop_b]=(1-w)*audio[loop_b-crossfade:loop_b]+w*original[loop_a-crossfade:loop_a]
        # The loop's next-sample jump now equals the original waveform's local
        # first derivative at its start, rather than an unrelated phase jump.
        seam_error=float(np.max(np.abs((audio[loop_a]-audio[loop_b-1])-(original[loop_a]-original[loop_a-1]))))
        audio[-960:]*=(1-synth.smooth(np.linspace(0,1,960)))[:,None]
        body_rms=float(np.sqrt(np.mean(audio[loop_a:loop_b]**2)));peak=float(np.max(np.abs(audio)));gain=min(.10/max(body_rms,1e-12),.5/max(peak,1e-12));audio*=gain
        target=OUT/f'voice-banks/{group}/MIDI-{midi:03d}.wav';write_audio(audio,target)
        relative=f'Samples/Couperin Voices/{group}/MIDI-{midi:03d}.wav'
        rows.append({'group':group,'midi':midi,'scoreUse':midi in score_keys,'file':str(target.relative_to(OUT)),'sampleAbsoluteOrProjectRelativePath':str(target),'sampleAbsolutePath':str(target),'sampleProjectRelativePath':relative,
                     'sampleNominalWrittenMidi':midi,'rootMidi':60,'transposeSemitones':60-midi,'bakedTuning':True,'tunedFundamentalHz':synth.frequency(midi,tuning),
                     'sampleRate':32000,'channels':2,'frames':len(audio),'startSample':0,'loopStartSample':loop_a,'loopEndSample':loop_b,'loopCrossfadeSamples':0,'bakedLoopCrossfadeSamples':crossfade,
                     'loopSeamConstructionError':seam_error,'recommendedInstrumentGainDb':-15,'recommendedAttackSeconds':.002,'recommendedReleaseSeconds':.20 if midi<60 else .05,
                     'stereoPanBaked':True,'peak':float(np.max(np.abs(audio))),'bodyRms':float(np.sqrt(np.mean(audio[loop_a:loop_b]**2))),'linearSampleGain':gain,'sha256':synth.sha(target),
                     'approximation':'Representative V4 bank position9.1, four bowed overdubs; not the movement-varying fully printed baseline. Individual sample/ADSR/filter/MIDI notes are editable.'})
        bank,harmonics=synth.bow_wall_bank(midi,tuning);bank=bank[:,::2].astype(np.float64);scale=.98/float(np.max(np.abs(bank)));bank*=scale
        table=OUT/f'wavetables/{group}/MIDI-{midi:03d}-16x2048.wav';write_audio(bank.reshape(-1),table,'pcm_f32le')
        wave_rows.append({'group':group,'midi':midi,'scoreUse':midi in score_keys,'file':str(table.relative_to(OUT)),'sampleRate':32000,'channels':1,'frameCount':16,'frameLengthSamples':2048,'frames':32768,'sourceEngineResolution':4096,
                          'harmonicCeiling':harmonics,'oneSharedWaveformGain':scale,'bakedTuning':False,'tuningNote':'These are periodic oscillator frames, not pitched instrument samples. Use the supplied Rameau tuning when loading into a capable wavetable instrument. Live Intro does not include Wavetable.','sha256':synth.sha(table)})
        print(json.dumps({'key':midi,'group':group,'done':index+1,'total':len(keys)}),flush=True)
    tmp.rmdir()
    rows.sort(key=lambda r:r['midi']);wave_rows.sort(key=lambda r:r['midi'])
    result={'schema':1,'extraChromaticEditKeys':[32,34],'status':'Native-editable approximation; exact common-clock baseline/stems remain separate. No playback performed.','sourceScoreSha256':synth.sha(SCORE),'synthesisToolSha256':synth.sha(ROOT/'tools/chunk_surfer/render-couperin-pressure.py'),'tuning':tuning.receipt(),
            'nativeRecipe':'One Instrument Rack chain per used written MIDI key. Key zone=min=max=midi; Simpler root60 with transpose60-midi. Baked temperament/frequency: do not apply a second global tuning. Classic loop on; loop crossfade already baked. Four register racks; bass-bed edit track reuses Bass rack.',
            'notes':'All audio stereo32kHz/PCM24.56 sample chains avoid thousands of per-movement devices. Sample controls/MIDI are editable approximations; frozen five audio layers reproduce the accepted rendered arrangement.',
            'recommendedInstrumentGainDb':-15,'samples':rows,'wallSeconds':time.perf_counter()-started,'credits':CREDIT}
    (OUT/'voice-bank-map.json').write_text(json.dumps(result,indent=2)+'\n');(OUT/'wavetable-assets.json').write_text(json.dumps({'schema':1,'status':'Source waveform assets for capable wavetable instruments; not a native Live Intro device.','tables':wave_rows,'credits':CREDIT},indent=2)+'\n')
    print(json.dumps({'sampleCount':len(rows),'tableCount':len(wave_rows),'wallSeconds':result['wallSeconds'],'map':str(OUT/'voice-bank-map.json')},indent=2))

if __name__=='__main__':main()
