#!/usr/bin/env python3
"""Build whole performed heartbeat pairs from the two approved CC0 originals.

Requires numpy and ffmpeg. Ordinary build and --verify are offline. Sources are
retained beside this producer; neither artifacts/ nor a logged-in service is a
build dependency. Runtime applies the shared 10-bit/28kHz PCM processor once.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
INPUT = Path(__file__).resolve().parent / 'heartbeat-sources'
OUTPUT = ROOT / 'public/audio/heartbeat'
SR = 48000
GAIN_DB = -6.0
LICENCE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'
# Each window retains both independently performed contacts and their settling
# tail. Windows are not selected by a generic peak finder: the louder second
# contact must never be mistaken for the start of a new cardiac cycle.
FAMILIES = [
    {'id': 'slow', 'number': 1929, 'title': 'Heart Beat #4',
     'url': 'https://bigsoundbank.com/heart-beat-4-s1929.html',
     'sha256': '2ac30b170e6d34460b740f057f1a4e2ad35ca287550e0ecb38f5faa790691cac',
     'cuts': [(.055,.560,.111,.339),(.900,1.420,.952,1.180),
              (1.730,2.240,1.782,2.005),(3.380,3.920,3.432,3.670),
              (5.810,6.350,5.860,6.100),(7.435,7.985,7.488,7.738)]},
    {'id': 'fast', 'number': 1930, 'title': 'Heart Beat #5',
     'url': 'https://bigsoundbank.com/heart-beat-5-s1930.html',
     'sha256': 'f5361873c550ee108e7b338e45b444a6f1d985f14b5da79daf8c6bfba3c4aa56',
     'cuts': [(.610,1.090,.663,.884),(1.240,1.720,1.289,1.501),
              (2.480,2.960,2.532,2.740),(3.760,4.250,3.817,4.051),
              (5.700,6.190,5.749,5.973),(7.650,8.150,7.706,7.940)]},
]


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def db(value): return round(20 * math.log10(max(float(value), 1e-12)), 6)
def decode(path, highpass=False):
    command = ['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar',str(SR)]
    if highpass: command += ['-af','highpass=f=28']
    return np.frombuffer(subprocess.check_output(command+['-f','f32le','-']),dtype='<f4').astype(np.float64)
def rms_envelope(samples, seconds=.005):
    hop = round(SR * seconds)
    return np.array([math.sqrt(float(np.mean(samples[i:i+hop]**2)))
                     for i in range(0,len(samples),hop)], dtype=np.float64)
def stats(samples):
    return {'samplePeakDbfs':db(np.max(np.abs(samples))),
            'rmsDbfs':db(math.sqrt(float(np.mean(samples*samples)))),
            'clippedSamples':int(np.count_nonzero(np.abs(samples)>=1)),
            'sampleFrames':len(samples),'sampleRate':SR,'channels':1,'bitsPerSample':24}
def peak_in(samples, expected, radius=.045):
    envelope = rms_envelope(samples,.001)
    a=max(0,round((expected-radius)*1000)); b=min(len(envelope),round((expected+radius)*1000)+1)
    index=a+int(np.argmax(envelope[a:b]))
    return round((index+.5)/1000,6),float(envelope[index])
def source_record(family):
    path=INPUT/f"bigsoundbank-{family['number']}-original.wav"
    actual=digest(path)
    if actual!=family['sha256']: raise ValueError(f"Original source hash changed: {path.name}: {actual}")
    page=INPUT/f"bigsoundbank-{family['number']}-page.html"
    if 'CC0 (public domain): Free and royalty-free' not in page.read_text():
        raise ValueError('Missing retained per-item CC0 licence proof')
    return {'id':f"bigsoundbank-{family['number']}",'author':'Joseph SARDIN',
        'title':family['title'],'url':family['url'],'licence':'CC0 1.0','licenceUrl':LICENCE_URL,
        'deliveryKind':'original-bwf-pcm24','sourceFile':str(path.relative_to(ROOT)),
        'sourceFileSha256':actual,'sourcePage':str(page.relative_to(ROOT)),
        'sourcePageSha256':digest(page),'download':f"https://bigsoundbank.com/UPLOAD/bwf-en/{family['number']}.wav",
        'originalSpecification':{'sampleRate':SR,'bitsPerSample':24,'channels':1},
        'recordingIdentity':'Studio Foley, not a biological heart recording; Neumann KM184 into SoundDevices MixPre-3.',
        'changes':'Six independently performed whole paired contacts selected; 28 Hz high-pass for DC/subsonic headroom; common -6 dB gain across both families; 5 ms edge fades; no per-clip normalization, compression, pitch change or time stretching. Runtime applies shared 10-bit PCM quantization with separate 28 kHz sample holding once.'}


def build():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    sources=[]; clips=[]; envelopes=[]
    for family in FAMILIES:
        source=source_record(family); sources.append(source)
        samples=decode(ROOT/source['sourceFile'],highpass=True)
        for index,(start,end,first,second) in enumerate(family['cuts'],1):
            a=round(start*SR);b=round(end*SR);clip=samples[a:b].copy() * 10**(GAIN_DB/20)
            fade=min(round(.005*SR),len(clip)//2)
            clip[:fade]*=np.linspace(0,1,fade);clip[-fade:]*=np.linspace(1,0,fade)
            ident=f"heartbeat-{family['id']}-{index:02d}";target=OUTPUT/f'{ident}.wav'
            subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','-',
                            '-c:a','pcm_s24le','-map_metadata','-1',str(target)],input=clip.astype('<f4').tobytes(),check=True)
            # Landmarks are measured again from the actual exported PCM. The
            # source's authored windows only locate which two contacts matter.
            actual=decode(target)
            first_time,first_level=peak_in(actual,first-start)
            second_time,second_level=peak_in(actual,second-start)
            envelope=rms_envelope(actual)
            threshold=max(float(np.max(envelope))*.04,.0004)
            on=np.flatnonzero(envelope>=threshold)
            data={'id':ident,'family':family['id'],'url':f'audio/heartbeat/{ident}.wav',
              'durationSeconds':len(actual)/SR,'firstPeakSeconds':first_time,'secondPeakSeconds':second_time,
              'onsetSeconds':float(on[0]*.005) if len(on) else None,
              'lastContactSeconds':float(min(len(actual)/SR,(on[-1]+1)*.005)) if len(on) else None,
              'firstPeakRms':round(first_level,8),'secondPeakRms':round(second_level,8),
              'sourceId':source['id'],'sourceStartSeconds':start,'sourceEndSeconds':end,
              'processingGainDb':GAIN_DB,'edgeFadeSeconds':.005,'sampleRate':SR,
              'sha256':digest(target),'bytes':target.stat().st_size,**stats(actual)}
            if not .16 < second_time-first_time < .29: raise ValueError(f'Invalid paired landmarks: {ident}')
            if data['samplePeakDbfs']>-6 or data['clippedSamples']: raise ValueError(f'Headroom failure: {ident}')
            clips.append(data);envelopes.append(envelope)
    # One common visual scale preserves different performed contact strength.
    # It never modifies audio gain. The audio-clock transport interpolates this
    # measured paired envelope instead of inventing a separate visual rhythm.
    reference=max(float(np.max(envelope)) for envelope in envelopes)
    for clip,envelope in zip(clips,envelopes):
        clip['pulseEnvelopeStepSeconds']=.005
        clip['pulseEnvelope']=[round(float(value/reference),6) for value in envelope]
    manifest={'version':1,'generatedBy':'tools/chunk_surfer/prepare-heartbeat-audio.py',
      'date':'2026-10-31','sources':sources,'clips':clips,
      'families':{family['id']:[c['id'] for c in clips if c['family']==family['id']] for family in FAMILIES},
      'dsp':{'bitDepth':10,'effectiveSampleRate':28000},
      'processing':'Source PCM24 remains high resolution until the existing Standing Tear signed-PCM quantizer is applied to decoded buffers at runtime. No baked crushing and no lossy previews.',
      'pairedLandmarkMethod':'1 ms RMS maxima within inspected ±45 ms contact windows of actual exported PCM; paired event identity is authored from the continuous Foley source. Not clinical S1/S2 classification.',
      'pulseEnvelopeMethod':'5 ms RMS on actual exported PCM, divided by one bank-wide maximum. No per-variant audio gain change.',
      'minimumSuggestedPeriodSeconds':.54,'minimumTailMarginSeconds':.038,
      'totalBytes':sum(c['bytes'] for c in clips),'decodedFloat32BytesAt48k':sum(c['sampleFrames']*4 for c in clips)}
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    generated='''// GENERATED by tools/chunk_surfer/prepare-heartbeat-audio.py.
// Original CC0 PCM24, whole performed pairs; shared bitcrushing is runtime only.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
'''
    generated+='export const HEARTBEAT_AUDIO_ASSETS=freeze('+json.dumps({k:v for k,v in manifest.items() if k!='sources'},indent=2)+');\n'
    generated+='export const HEARTBEAT_AUDIO_SOURCES=freeze('+json.dumps(sources,indent=2)+');\n'
    (ROOT/'src/data/heartbeat-audio-assets.js').write_text(generated)
    return manifest


def verify():
    manifest=json.loads((OUTPUT/'manifest.json').read_text())
    if len(manifest['clips'])!=12: raise ValueError('Expected six independent performed pairs per family')
    for family in FAMILIES: source_record(family)
    for clip in manifest['clips']:
        path=ROOT/'public'/clip['url']
        if digest(path)!=clip['sha256']: raise ValueError(f"Changed production PCM: {path.name}")
        actual=decode(path)
        if len(actual)!=clip['sampleFrames']: raise ValueError('Unexpected decoded length')
        for name in ['firstPeakSeconds','secondPeakSeconds']:
            measured,_=peak_in(actual,clip[name])
            if abs(measured-clip[name])>.0011: raise ValueError(f'Stale measured landmark: {path.name}')
        if stats(actual)['clippedSamples']: raise ValueError('Clipped export')
    return manifest


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify',action='store_true',help='Verify retained originals and existing exported PCM without rewriting it')
    args=parser.parse_args()
    try:
        data=verify() if args.verify else build()
        print(json.dumps({'clips':len(data['clips']),'families':{k:len(v) for k,v in data['families'].items()},
          'bytes':data['totalBytes'],'decodedFloat32Bytes':data['decodedFloat32BytesAt48k'],
          'peakDbfs':max(c['samplePeakDbfs'] for c in data['clips']),
          'durationRangeSeconds':[min(c['durationSeconds'] for c in data['clips']),max(c['durationSeconds'] for c in data['clips'])]},indent=2))
    except (ValueError,FileNotFoundError) as error:
        print(str(error),file=sys.stderr);sys.exit(1)
