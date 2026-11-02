#!/usr/bin/env python3
"""Dry, offline Couperin pressure revoicing. NumPy + ffmpeg; never plays audio.

Four persistent contrapuntal lanes, each a narrow, continuous-phase wavetable
DOUBLEt. Pitch remains the inferred Couperin note cache (+ its existing tuning
estimate). Transcription rejection/colour rules are heuristics, not score truth.
No source audio enters the synthesis. No reverb, percussion or new composition.
"""
from __future__ import annotations
import argparse, collections, hashlib, json, math, os, subprocess, time
from dataclasses import dataclass
import contextlib
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'public/audio/source-rest/couperin/couperin-revoicing.json'
PAIR=ROOT/'public/audio/source-rest/couperin/couperin-revoiced-pair.mp3'
SR=32000
TABLE_SIZE=4096
TABLE_FRAMES=4
LANES=4
BLOCK=4096
DETUNE_CENTS=(-2.8,3.1)
PAN=(-.58,-.18,.20,.57)
SEED=0x4C4F4144

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def smooth(x):
    x=np.clip(x,0,1)
    return x*x*(3-2*x)

@dataclass(frozen=True)
class TuningProfile:
    """Explicit reference-A tuning, with12 pitch-class deviations in C..B order.

    The table is normalized against its A entry, so A4 is reference_a_hz
    shifted by global_cents. This avoids accidentally applying an A offset
    twice. If reference A was directly measured from a recording, callers
    must deliberately choose global_cents=0 rather than reuse a fine-tuning
    estimate. No historical temperament is selected by this interface.
    """
    reference_a_hz: float
    pitch_class_cents: tuple[float,...]
    global_cents: float
    name: str='unselected custom tuning'

    def __post_init__(self):
        if not math.isfinite(self.reference_a_hz) or self.reference_a_hz<=0:
            raise ValueError('referenceAHz must be a finite positive frequency')
        if len(self.pitch_class_cents)!=12 or not all(math.isfinite(x) for x in self.pitch_class_cents):
            raise ValueError('pitchClassCents must contain exactly12 finite C..B offsets')
        if not math.isfinite(self.global_cents):raise ValueError('globalCents must be explicit and finite')

    def receipt(self):
        return {'name':self.name,'referenceAHz':self.reference_a_hz,'pitchClassCents':list(self.pitch_class_cents),'globalCents':self.global_cents,
                'order':['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'],
                'formula':'Aref * 2^((midi-69)/12 + (globalCents + table[midi%12] - table[A])/1200)',
                'scope':'Tuning only. It does not correct inferred MIDI pitches or validate score identity.'}

def load_tuning_profile(path):
    data=json.loads(Path(path).read_text())
    return TuningProfile(reference_a_hz=float(data['referenceAHz']),pitch_class_cents=tuple(float(x) for x in data['pitchClassCents']),
                         global_cents=float(data['globalCents']),name=str(data.get('name','unnamed explicit tuning')))

def frequency(midi,tuning=0):
    if isinstance(tuning,TuningProfile):
        cents=tuning.global_cents+tuning.pitch_class_cents[int(midi)%12]-tuning.pitch_class_cents[9]
        return tuning.reference_a_hz*2**((midi-69)/12+cents/1200)
    # Compatibility for already-rendered v2 studies. This remains the old
    # scalar estimate, not a newly chosen historical or equal temperament.
    return 440*2**((midi-69+tuning/100)/12)

def detuned_frequencies(midi,tuning):
    f=frequency(midi,tuning)
    # Stable beating, not vibrato: <= +/-4c and <=1.5Hz total separation.
    offsets=np.clip(f*(2**(np.asarray(DETUNE_CENTS)/1200)-1),-.75,.75)
    return f+offsets

def _partial_flags(notes):
    """Only lower-confidence near-simultaneous octave partners get flagged."""
    flags={}
    for i,n in enumerate(notes):
        if n['confidence']>=.62:continue
        j=i-1
        while j>=0 and n['onset']-notes[j]['onset']<=.024:
            p=notes[j]
            if n['midi']>p['midi'] and (n['midi']-p['midi'])%12==0 and p['confidence']>=n['confidence']+.06:
                flags[i]=j;break
            j-=1
        if i in flags:continue
        j=i+1
        while j<len(notes) and notes[j]['onset']-n['onset']<=.024:
            p=notes[j]
            if n['midi']>p['midi'] and (n['midi']-p['midi'])%12==0 and p['confidence']>=n['confidence']+.06:
                flags[i]=j;break
            j+=1
    return flags

def allocate_lanes(notes,tuning):
    """Return actual pitch spans, lane pressure-colour events and full decisions."""
    notes=sorted(notes,key=lambda n:(n['onset'],n['midi']))
    flags=_partial_flags(notes);current=[None]*LANES;last=[None]*LANES
    spans=[];colours=[[] for _ in range(LANES)];decisions=[]
    for i,n in enumerate(notes):
        start=float(n['onset']);midi=int(n['midi']);conf=float(n['confidence']);vel=float(n['velocity'])
        salience=conf**1.35*(.45+.55*vel)
        active=[s for s in current if s and s['end']>start]
        reason='low-confidence octave partner' if i in flags else 'confidence below .48' if conf<.48 else None
        if reason:
            # No extra pitch/oscillator. A faint, bounded pressure colour can
            # acknowledge uncertain ornaments without turning them into drones.
            choices=sorted(active,key=lambda s:abs(s['midi']-midi))
            if choices:
                lane=choices[0]['lane'];colours[lane].append((start,start+min(.65,n['duration']+.14),.035 if i in flags else .025))
            else:lane=None
            decisions.append(dict(index=i,onset=start,midi=midi,confidence=conf,decision='colour-only' if lane is not None else 'omit',reason=reason,lane=lane))
            continue
        same=next((s for s in current if s and s['midi']==midi and start<=s['end']+.12),None)
        hold=.28 if midi<57 else .19 if midi<77 else .12
        end=start+float(n['duration'])+hold
        amp=(.28+.72*vel)*(.62+.38*conf)
        if same:
            same['end']=max(same['end'],end);same['points'].append((start+.06,amp));same['notes'].append(i)
            same['salience']=max(same['salience']*.8,salience)
            decisions.append(dict(index=i,onset=start,midi=midi,confidence=conf,decision='tie',lane=same['lane']))
            continue
        free=[k for k,s in enumerate(current) if s is None or s['end']<=start]
        if free:
            lane=min(free,key=lambda k:abs((last[k] or {}).get('midi',midi)-midi))
            decision='new-held-pitch'
        else:
            lane=min(range(LANES),key=lambda k:current[k]['salience'])
            old=current[lane]
            if salience<old['salience']*.96 and conf<.72:
                colours[lane].append((start,start+min(.55,n['duration']+.1),.025))
                decisions.append(dict(index=i,onset=start,midi=midi,confidence=conf,decision='overflow-colour',reason='four stronger held lanes',lane=lane));continue
            old['end']=start;old['release']=.075
            decision='bounded-handoff'
        previous=last[lane]
        # Never reset phase at an inferred ornament/onset. A fingered pitch
        # change inherits the lane's existing phase at that exact time.
        phase0=np.array([.137+.173*lane,.613+.109*lane])%1
        if previous is not None:phase0=(previous['phase0']+previous['frequencies']*(start-previous['start']))%1
        # At most one old handoff tail per lane. Remove a superseded release
        # before another handoff; no invisible accumulation of pluck voices.
        for old in reversed(spans):
            if old['lane']==lane and old is not previous and old['end']+old['release']>start:
                old['release']=max(0,start-old['end'])
        s=dict(lane=lane,midi=midi,start=start,end=end,attack=.055 if previous is None or start>previous['end']+.3 else .035,
               release=.24 if midi<65 else .17,points=[(start,amp)],notes=[i],phase0=phase0,
               frequencies=detuned_frequencies(midi,tuning),salience=salience)
        spans.append(s);current[lane]=last[lane]=s
        decisions.append(dict(index=i,onset=start,midi=midi,confidence=conf,decision=decision,lane=lane))
    return spans,colours,decisions

def allocate_score_spans(notes,tuning,movements,overdubs=2,bow_wall=False):
    """All written score events survive. Four layers are timbral, not a cap.

    The score cache supplies performed onsets/durations and written registers.
    No key filter, model confidence filter or octave-partial heuristic runs.
    """
    spans=[];last_by_pitch={};colours=[[] for _ in range(5)];decisions=[]
    for i,n in enumerate(sorted(notes,key=lambda x:(x['onset'],x['midi']))):
        midi=int(n['midi']);start=float(n['onset']);duration=float(n['duration'])
        velocity=float(n.get('velocity',.72));velocity=velocity/127 if velocity>1 else velocity
        amp=.35+.65*float(np.clip(velocity,0,1));lane=0 if midi<48 else 1 if midi<60 else 2 if midi<72 else 3
        previous=last_by_pitch.get(midi)
        if previous and start<=previous['end']+.10:
            previous['end']=max(previous['end'],start+duration);previous['points'].append((start+.075,amp));previous['notes'].append(i);previous['onsets'].append(start)
            colours[lane].append((start,start+.28,.06));decision='score-repeat-tied'
        else:
            f0=frequency(midi,tuning);freqs=bow_detuned_frequencies(midi,tuning) if overdubs==4 else detuned_frequencies(midi,tuning)
            offsets=np.array([.137+.173*lane,.613+.109*lane,.317+.137*lane,.823+.097*lane])[:len(freqs)]
            span=dict(lane=lane,midi=midi,start=start,end=start+duration,attack=.012 if bow_wall else .10 if midi<60 else .065,release=.20 if bow_wall and midi<60 else .05 if bow_wall else .85 if midi<60 else .55,
                      points=[(start,amp)],notes=[i],onsets=[start],phase0=(offsets+freqs*start)%1,
                      fundamentalPhase0=(.113*lane+f0*start)%1,frequencies=freqs,salience=1.,score=True)
            spans.append(span);last_by_pitch[midi]=span;decision='score-pitch-preserved'
        decisions.append(dict(index=i,onset=start,midi=midi,decision=decision,lane=lane,reason='Published score pitch; no confidence/key/cap filtering'))
    return spans,colours,decisions

def derive_score_bed(notes,tuning,movements,bow_wall=False):
    """One bass pressure line, using only the lowest actually sounding score note.

    Changes occur at score onset/offset events. A bass can linger <=.9s after
    its written end, then decays; it cannot invent a tonic or persist forever.
    """
    result=[]
    for movement in movements:
        selected=[(i,n) for i,n in enumerate(notes) if movement['start']<=n['onset']<movement['end'] and n['midi']<=60]
        events=[]
        for i,n in selected:events.extend([(float(n['onset']),1,i,n),(float(n['onset']+n['duration']),0,i,n)])
        events.sort(key=lambda x:(x[0],x[1]));active={};current=None
        for t,kind,i,n in events:
            if kind:active[i]=n
            else:active.pop(i,None)
            bass=min(active.values(),key=lambda x:x['midi']) if active else None
            if bass is None:
                if current:current['end']=min(movement['end'],max(current['end'],t+(.20 if bow_wall else .9)))
                continue
            midi=int(bass['midi'])
            if current and current['midi']==midi and t<=current['end']:
                current['end']=max(current['end'],float(bass['onset']+bass['duration']));continue
            if current:current['end']=min(current['end'],t)
            f0=frequency(midi,tuning);freqs=detuned_frequencies(midi,tuning)
            current=dict(lane=4,midi=midi,start=t,end=float(bass['onset']+bass['duration']),attack=.035 if bow_wall else .25,release=.20 if bow_wall else .8,points=[(t,.30)],notes=[i],onsets=[t],
                         phase0=(np.array([.381,.717])+freqs*t)%1,fundamentalPhase0=(.271+f0*t)%1,frequencies=freqs,salience=1.,score=True,bed=True)
            result.append(current)
        if current:current['end']=min(current['end']+(.20 if bow_wall else .9),movement['end'])
    return [s for s in result if s['end']>s['start']]

def wavetable_bank(midi,tuning):
    """Register-specific, harmonically band-limited periodic tables (not samples)."""
    f=frequency(midi,tuning);highest=float(max(detuned_frequencies(midi,tuning)))
    hmax=min(TABLE_SIZE//2-1,int(.45*SR/highest))
    h=np.arange(1,hmax+1,dtype=np.float64);hz=h*f
    # Bow/bridge resonances shape harmonic energy; no added inharmonic notes.
    formants=.25+1.25*np.exp(-.5*(np.log(hz/750)/.48)**2)+.9*np.exp(-.5*(np.log(hz/2350)/.37)**2)+.55*np.exp(-.5*(np.log(hz/5300)/.30)**2)
    tables=[]
    for frame in range(TABLE_FRAMES):
        p=frame/(TABLE_FRAMES-1);tilt=1.24-.49*p
        amp=h**(-tilt)*((1-p)*(.58+.42*(h%2))+p)*formants
        phase=-math.pi/2+.12*np.sin(h*.754877666)*(1-.45*p)
        spectrum=np.zeros(TABLE_SIZE//2+1,dtype=np.complex128)
        spectrum[1:hmax+1]=amp*np.exp(1j*phase)
        table=np.fft.irfft(spectrum,n=TABLE_SIZE)
        table*=.42/max(1e-12,float(np.sqrt(np.mean(table*table))))
        tables.append(table.astype(np.float32))
    return np.stack(tables),hmax

def bow_detuned_frequencies(midi,tuning):
    f=frequency(midi,tuning)
    return f+np.clip(f*(2**(np.asarray([-3.6,-1.2,1.4,3.3])/1200)-1),-.75,.75)

def bow_wall_bank(midi,tuning):
    """V4: broad unbroken bowed spectra. No moving formants/comb holes."""
    f=frequency(midi,tuning);highest=float(max(bow_detuned_frequencies(midi,tuning)));hmax=min(TABLE_SIZE//2-1,int(.45*SR/highest))
    h=np.arange(1,hmax+1,dtype=np.float64);hz=h*f;tables=[]
    for position in range(16):
        tilt=.95-.20*position/15
        # Wide, fixed body shelf supports fundamentals/low mids. No narrow
        # Gaussian peaks, odd-only filtering, pulse comb or moving vowel tube.
        body=1+.55*np.exp(-.5*(np.log2(hz/900)/2.5)**2)
        amp=h**(-tilt)*body;amp[0]*=1.45;amp[1:min(5,len(amp))]*=1.18
        phase=-np.pi/2+(.045+.075*position/15)*np.sin(h*.754877666+position*.11)
        spectrum=np.zeros(TABLE_SIZE//2+1,dtype=np.complex128);spectrum[1:hmax+1]=amp*np.exp(1j*phase)
        table=np.fft.irfft(spectrum,n=TABLE_SIZE);table*=.45/max(1e-12,float(np.sqrt(np.mean(table*table))))
        tables.append(table.astype(np.float32))
    return np.stack(tables),hmax

_FRICTION=None
def friction_wave(times,offset):
    """Deterministic, band-limited bow-contact noise; not random pitch."""
    global _FRICTION
    if _FRICTION is None:
        size=32768;hz=np.fft.rfftfreq(size,1/128000);rng=np.random.default_rng(SEED+731)
        spectrum=np.zeros(size//2+1,dtype=np.complex128);mask=(hz>=350)&(hz<=9500)
        spectrum[mask]=np.exp(2j*np.pi*rng.random(np.count_nonzero(mask)))/(hz[mask]/350)**.24
        table=np.fft.irfft(spectrum,n=size);table/=max(1e-12,float(np.sqrt(np.mean(table*table))));_FRICTION=table.astype(np.float32)
    phase=(times*4+offset)%1;pos=phase*len(_FRICTION);idx=pos.astype(np.int32);frac=pos-idx
    return _FRICTION[idx]*(1-frac)+_FRICTION[(idx+1)%len(_FRICTION)]*frac

def bow_wall_voice(span,t,dt,bank,pressure,movements,tuning):
    lane=span['lane'];base=np.zeros_like(t);audible=np.zeros_like(t)
    for row in movements:
        mask=(t>=row['start'])&(t<row['end']);base[mask]=row['position'];audible[mask]=1
    # Only modest aperiodic bow drift around the movement base. No sine LFO,
    # formant travel or cyclic amplitude envelopes enter this path.
    scan=np.clip(base+.85*(pressure-.5),0,15)/15
    onsets=span.get('onsets',[span['start']]);voice=np.zeros_like(t);stagger=[0,.013,.029,.047]
    for k,freq in enumerate(span['frequencies']):
        phase=span['phase0'][k]+freq*dt;body=_lookup(bank,phase,scan);edge=np.zeros_like(t);friction=np.zeros_like(t)
        for onset in onsets:
            age=t-onset-stagger[k];mask=(age>=0)&(age<.25)
            if not np.any(mask):continue
            a=age[mask];bite=smooth(a/.008)*np.exp(-a/.070)*(1-smooth((a-.17)/.08))
            edge[mask]+=bite
            friction[mask]+=bite*friction_wave(t[mask],onset*.754877666+k*.173)
        contact=_lookup(bank,phase,np.clip(scan+.23,0,1))
        # Contact increases broadband tension and edge energy, then leaves a
        # substantial sustained tone. It never decays the entire note to zero.
        worked=body*(1+.22*edge)+.19*edge*contact+.040*friction
        drive=1.18+.24*pressure+.38*edge
        voice+=np.tanh(drive*worked)/np.tanh(drive)/len(span['frequencies'])
    f0=frequency(span['midi'],tuning);anchor=np.sin(2*np.pi*(span.get('fundamentalPhase0',0)+f0*dt))
    return (.86*voice+.14*anchor)*audible

def wide_wavetable_bank(midi,tuning):
    """V3:16 deliberately separated bow/reed/fold/formant positions.

    Spectral movement is the prominent gesture; the exact fundamental is
    supplied separately by the renderer. All tables remain harmonically
    band-limited before nonlinear tension. No sampled source audio is used.
    """
    f=frequency(midi,tuning);highest=float(max(detuned_frequencies(midi,tuning)))
    hmax=min(TABLE_SIZE//2-1,int(.45*SR/highest));h=np.arange(1,hmax+1,dtype=np.float64);hz=h*f
    tables=[];centres=np.geomspace(230,8200,16)
    for position,centre in enumerate(centres):
        family=position%4
        tilt=[1.12,.76,.89,.57][family]
        # Deliberately different harmonic topologies, not16 slight EQ tilts.
        if family==0:topology=.20+.80*(h%2)  # strained odd bridge
        elif family==1:topology=np.ones_like(h)  # dense full bow rasp
        elif family==2:topology=.12+np.abs(np.sin(np.pi*h*(.12+.012*position)))  # pulse/reed comb
        else:topology=.18+np.abs(np.sin(h*.91))*np.abs(np.cos(h*.37))  # folded harmonic lattice
        q=.20+.035*(position%3)
        resonance=.12+8*np.exp(-.5*(np.log(hz/centre)/q)**2)+2.3*np.exp(-.5*(np.log(hz/(centre*1.81))/.21)**2)
        amp=h**(-tilt)*topology*resonance
        # Keep a small measured first partial in the table, plus an exact
        # unmodulated reference fundamental in the final voice.
        amp[0]*=.32
        phase=-np.pi/2+.23*np.sin(h*.618033989+position*.31)
        spectrum=np.zeros(TABLE_SIZE//2+1,dtype=np.complex128);spectrum[1:hmax+1]=amp*np.exp(1j*phase)
        table=np.fft.irfft(spectrum,n=TABLE_SIZE);table*=.42/max(1e-12,float(np.sqrt(np.mean(table*table))))
        tables.append(table.astype(np.float32))
    return np.stack(tables),hmax

def load_movement_map(path):
    data=json.loads(Path(path).read_text());rows=data['movements'];previous=-math.inf
    for row in rows:
        for key in ['id','start','end','position','excursion','scanHz','drive','fundamentalGain']:
            if key not in row:raise ValueError('Missing movement parameter: '+key)
        if row['start']<previous or row['end']<=row['start']:raise ValueError('Movement intervals overlap or run backwards')
        if not 0<=row['position']<=15 or not 0<=row['excursion']<=15:raise ValueError('V3 positions/excursions must address the16-position bank')
        if not 0<=row['scanHz']<=2.5 or not 0<row['drive']<=6 or not 0<=row['fundamentalGain']<=1:raise ValueError('Unbounded movement motion/drive/reference gain')
        previous=row['end']
    return rows

def movement_fields(times,lane,pressure,movements):
    """Pronounced spectral wub only. No scan value changes pitch frequency."""
    scan=np.zeros_like(times);drive=np.ones_like(times);fundamental=np.zeros_like(times);audible=np.zeros_like(times)
    for row in movements:
        mask=(times>=row['start'])&(times<row['end'])
        if not np.any(mask):continue
        t=times[mask]-row['start'];p=pressure[mask]
        # Independent lane offset, asymmetric scan sweep and a phrase-pressure
        # push. This is explicitly audible spectral choreography, not vibrato.
        phase=2*np.pi*(row['scanHz']*t+lane*.173)+.8*(p-.5)
        sweep=np.sin(phase);sweep=np.sign(sweep)*np.abs(sweep)**.63
        position=row['position']+row['excursion']*(.78*sweep+.44*(p-.5))
        scan[mask]=np.clip(position,0,15)/15;drive[mask]=row['drive']*(.8+.4*p)
        fundamental[mask]=row['fundamentalGain'];audible[mask]=1
    return scan,drive,fundamental,audible

def _lookup(bank,phase,scan):
    pos=(phase%1)*TABLE_SIZE;idx=pos.astype(np.int32);frac=pos-idx;nextidx=(idx+1)%TABLE_SIZE
    frames=bank.shape[0]
    frame=np.minimum((scan*(frames-1)).astype(np.int32),frames-2);blend=scan*(frames-1)-frame
    a=bank[frame,idx]*(1-frac)+bank[frame,nextidx]*frac
    b=bank[frame+1,idx]*(1-frac)+bank[frame+1,nextidx]*frac
    return a*(1-blend)+b*blend

def pressure_knots(duration,lane):
    rng=np.random.default_rng(SEED+lane*3701);times=[0.];values=[.25+.09*lane]
    while times[-1]<duration+10:
        times.append(times[-1]+float(rng.uniform(2.7,7.3)))
        values.append(float(np.clip(values[-1]+rng.uniform(-.28,.32),.15,.86)))
    return np.asarray(times),np.asarray(values)

STEM_NAMES=['01-Bass','02-Tenor','03-Alto','04-Soprano','05-Bass-Pressure-Bed']
@contextlib.contextmanager
def stem_sinks(directory,rate,dc_block=False):
    if directory is None:
        yield None;return
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True);processes=[]
    filt='aresample=32000:filter_size=64:cutoff=0.92'+(',highpass=f=8:p=1' if dc_block else '')
    try:
        for name in STEM_NAMES:
            target=directory/(name+'.prefader-float.wav')
            proc=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-threads','1','-filter_threads','1','-f','f32le','-ar',str(rate),'-ac','2','-i','pipe:0','-af',filt,'-c:a','pcm_f32le',str(target)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
            processes.append((proc,target))
        yield processes
    finally:
        failures=[]
        for proc,target in processes:
            if proc.stdin and not proc.stdin.closed:proc.stdin.close()
        for proc,target in processes:
            err=proc.stderr.read().decode();code=proc.wait()
            if code:failures.append(str(target)+': '+err)
        if failures:raise RuntimeError('Stem export failed: '+str(failures))

def synthesize_raw(spans,colours,path,start,seconds,tuning,oversample=2,movements=None,bow_wall=False,stem_dir=None,dc_block=False):
    """Reusable deterministic block renderer. Writes interleaved stereo f32."""
    if oversample not in (2,4,8):raise ValueError('Oversampling must be2,4 or8 (8 is available for bounded validation)')
    rate=SR*oversample;count=round(seconds*rate);begin=time.perf_counter()
    relevant=[s for s in spans if s['start']<start+seconds and s['end']+s['release']>start]
    bank_builder=bow_wall_bank if bow_wall else wide_wavetable_bank if movements is not None else wavetable_bank
    banks={m:bank_builder(m,tuning) for m in sorted({s['midi'] for s in relevant})}
    knots=[pressure_knots(start+seconds,l) for l in range(LANES+1)]
    peak=0.;sum_sq=0.;active_peak=0;held_peak=0;score_pitch_peak=0;bed_peak=0
    master_context=contextlib.nullcontext(None) if stem_dir is not None else Path(path).open('wb')
    with stem_sinks(stem_dir,rate,dc_block) as sinks,master_context as output:
        for offset in range(0,count,BLOCK):
            n=min(BLOCK,count-offset);times=start+(offset+np.arange(n,dtype=np.float64))/rate;end=times[-1]+1/rate
            mix=np.zeros((n,2),dtype=np.float64);layer_mix=np.zeros((5,n,2),dtype=np.float64) if sinks is not None else None;active=[s for s in relevant if s['start']<end and s['end']+s['release']>times[0]]
            lane_held=np.zeros((LANES+1,n),dtype=np.int16);live=np.zeros(n,dtype=np.int16);score_held=np.zeros(n,dtype=np.int16);bed_held=np.zeros(n,dtype=np.int16)
            for s in active:
                mask=(times>=s['start'])&(times<s['end']+s['release']);ids=np.flatnonzero(mask)
                if not ids.size:continue
                t=times[ids];lane=s['lane'];dt=t-s['start'];live[ids]+=1;lane_held[lane,ids]+=(t<s['end'])
                if s.get('bed'):bed_held[ids]+=(t<s['end'])
                else:score_held[ids]+=(t<s['end'])
                envelope=smooth(dt/s['attack'])
                if s['release']>0:envelope*=1-smooth((t-s['end'])/s['release'])
                else:envelope*=t<s['end']
                points=sorted(s['points']);amplitude=np.interp(t,[p[0] for p in points],[p[1] for p in points])
                kt,kv=knots[lane];pressure=np.interp(t,kt,kv)
                for a,b,strength in colours[lane]:
                    if a<end and b>times[0]:pressure+=strength*np.sin(np.pi*np.clip((t-a)/(b-a),0,1))**2
                pressure=np.clip(pressure,.08,.93)
                scan=np.clip(.18+.70*pressure+.045*(s['midi']-65)/24,0,1)
                bank=banks[s['midi']][0];voice=np.zeros(ids.size)
                for k,freq in enumerate(s['frequencies']):voice+=.5*_lookup(bank,s['phase0'][k]+freq*dt,scan)
                if bow_wall:
                    voice=bow_wall_voice(s,t,dt,bank,pressure,movements,tuning)
                elif movements is not None:
                    scan,drive,fundamental_gain,audible=movement_fields(t,lane,pressure,movements)
                    voice=np.zeros(ids.size)
                    for k,freq in enumerate(s['frequencies']):voice+=.5*_lookup(bank,s['phase0'][k]+freq*dt,scan)
                    # Exact, temperament-aware fundamental survives the much
                    # denser detuned/formant wall. Scan never modulates pitch.
                    f0=frequency(s['midi'],tuning);reference=np.sin(2*np.pi*(s.get('fundamentalPhase0',s['phase0'][0])+f0*dt))
                    if s.get('bed'):fundamental_gain*=.55
                    voice=(1-fundamental_gain)*np.tanh(drive*(voice+.16*voice**3))/np.tanh(drive)+fundamental_gain*reference
                    voice*=audible
                else:
                    drive=.95+pressure*1.25
                    voice=np.tanh(drive*(voice+.045*voice**3))/np.tanh(drive)
                voice*=envelope*amplitude*(.85+.15*pressure)
                angle=((PAN[lane] if lane<LANES else 0)+1)*math.pi/4
                mix[ids,0]+=voice*math.cos(angle);mix[ids,1]+=voice*math.sin(angle)
                if layer_mix is not None:
                    layer_mix[lane,ids,0]+=voice*math.cos(angle);layer_mix[lane,ids,1]+=voice*math.sin(angle)
            held_peak=max(held_peak,int(np.max(np.sum(lane_held[:LANES]>0,axis=0),initial=0)))
            score_pitch_peak=max(score_pitch_peak,int(np.max(score_held,initial=0)));bed_peak=max(bed_peak,int(np.max(bed_held,initial=0)))
            active_peak=max(active_peak,int(np.max(live,initial=0)))
            peak=max(peak,float(np.max(np.abs(mix),initial=0)));sum_sq+=float(np.sum(mix*mix))
            if output is not None:output.write(mix.astype('<f4').tobytes())
            if sinks is not None:
                for layer,(proc,_) in zip(layer_mix,sinks):proc.stdin.write(layer.astype('<f4').tobytes())
    return {'seconds':seconds,'oversample':oversample,'internalSampleRate':rate,'wallSeconds':time.perf_counter()-begin,'rawPeak':peak,'rawRms':math.sqrt(sum_sq/(count*2)),
            'peakHeldLanes':held_peak,'peakActiveSpansIncludingHandoffs':active_peak,'peakHeldScorePitches':score_pitch_peak,'peakHeldBedPitches':bed_peak,'maxSustainedOscillators':score_pitch_peak*(5 if bow_wall else 3 if movements is not None else 2)+bed_peak*(3 if movements is not None else 2),'maxOscillatorsIncludingHandoffs':active_peak*(5 if bow_wall else 3 if movements is not None else 2),
            'tableHarmonicsByMidi':{str(m):banks[m][1] for m in banks},'prefaderStemPaths':[str((Path(stem_dir)/(name+'.prefader-float.wav')).resolve()) for name in STEM_NAMES] if stem_dir is not None else [],'dcBlockHz':8 if dc_block else None,'tableCutoffHz':.45*SR,'tableSize':TABLE_SIZE,'tableFrames':16 if movements is not None else TABLE_FRAMES,'engine':'pressure-v4-bow-wall' if bow_wall else 'pressure-v3' if movements is not None else 'pressure-v2'}

def ffmpeg(*args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y',*map(str,args)],check=True)

def decode_f32(path,seconds=None,right=False):
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-i',str(path)]
    if seconds is not None:cmd+=['-t',str(seconds)]
    if right:cmd+=['-af','pan=mono|c0=c1']
    return np.frombuffer(subprocess.check_output(cmd+['-f','f32le','-c:a','pcm_f32le','-']),dtype='<f4')

def metrics(a,channels=1):
    x=np.asarray(a,dtype=np.float64).reshape(-1,channels);mono=x.mean(axis=1);energy=np.zeros(6);edges=[0,160,700,2500,6000,12000,16000];N=8192
    window=np.hanning(N);freq=np.fft.rfftfreq(N,1/SR);windows=0
    for off in range(0,len(mono)-N+1,N):
        power=np.abs(np.fft.rfft(mono[off:off+N]*window))**2;windows+=1
        for i in range(6):energy[i]+=float(np.sum(power[(freq>=edges[i])&(freq<edges[i+1])]))
    rms=float(np.sqrt(np.mean(x*x)));peak=float(np.max(np.abs(x),initial=0))
    return {'samplesPerChannel':len(x),'rms':rms,'peak':peak,'peakDbFS':20*math.log10(peak) if peak else None,'crestDb':20*math.log10(peak/rms) if rms else None,
            'nonfiniteSamples':int(np.count_nonzero(~np.isfinite(x))),'samplesAtOrAboveFullScale':int(np.count_nonzero(np.abs(x)>=1)),'channelDcMeans':x.mean(axis=0).tolist(),
            'monoBandEnergyFractions':{f'{edges[i]}-{edges[i+1]}Hz':float(v/max(1e-30,energy.sum())) for i,v in enumerate(energy)},'_bandEnergy':energy.tolist()}

def metrics_file(path,channels=1,right=False,start=0,seconds=None):
    """Bounded-memory analysis; full14-minute render never decodes into RAM."""
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-i',str(path)]
    if start:cmd+=['-ss',str(start)]
    if seconds is not None:cmd+=['-t',str(seconds)]
    if right:cmd+=['-af','pan=mono|c0=c1']
    proc=subprocess.Popen(cmd+['-f','f32le','-c:a','pcm_f32le','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    count=0;energy=0.;peak=0.;nonfinite=clipped=0;dc=np.zeros(channels);bands=np.zeros(6)
    while True:
        data=proc.stdout.read(262144*channels*4)
        if not data:break
        a=np.frombuffer(data,dtype='<f4');m=metrics(a,channels);n=m['samplesPerChannel'];count+=n
        energy+=m['rms']**2*n;peak=max(peak,m['peak']);nonfinite+=m['nonfiniteSamples'];clipped+=m['samplesAtOrAboveFullScale']
        dc+=np.asarray(m['channelDcMeans'])*n;bands+=m['_bandEnergy']
    err=proc.stderr.read().decode();assert proc.wait()==0,err
    rms=math.sqrt(energy/max(1,count));edges=[0,160,700,2500,6000,12000,16000]
    return {'samplesPerChannel':count,'rms':rms,'peak':peak,'peakDbFS':20*math.log10(peak) if peak else None,'crestDb':20*math.log10(peak/rms) if rms else None,
            'nonfiniteSamples':nonfinite,'samplesAtOrAboveFullScale':clipped,'channelDcMeans':(dc/max(1,count)).tolist(),
            'monoBandEnergyFractions':{f'{edges[i]}-{edges[i+1]}Hz':float(v/max(1e-30,bands.sum())) for i,v in enumerate(bands)}}

def loudness(path):
    p=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-i',str(path),'-af','loudnorm=I=-23:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    text=p.stderr;begin=text.rfind('{');return json.JSONDecoder().raw_decode(text[begin:])[0]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds',type=float,default=90);parser.add_argument('--start',type=float,default=0);parser.add_argument('--oversample',type=int,choices=[2,4],default=2)
    parser.add_argument('--stem-dir',type=Path,help='Print four register ensembles and bass bed in the same synthesis pass')
    parser.add_argument('--dc-block',action='store_true',help='Apply one-pole8Hz DC blocker after downsample, before common gain')
    parser.add_argument('--bow-wall',action='store_true',help='V4 broad bowed ensemble/contact engine; no moving formants or periodic wub')
    parser.add_argument('--verified-score',action='store_true',help='All written note pitches survive; disable model heuristics and four-note cap')
    parser.add_argument('--movement-map',type=Path,help='Enables pressure-v3 with explicit16-position movement choreography; no automatic movement labels')
    parser.add_argument('--tuning-profile',type=Path,help='Explicit12-PC/reference-A JSON; no historical profile is selected automatically')
    parser.add_argument('--notes-cache',type=Path,default=CACHE,help='Verified note cache; corrected pitches must come from score/model audit, not tuning')
    parser.add_argument('--outdir',type=Path,default=ROOT/'artifacts/couperin-pressure/prototype');parser.add_argument('--alias-check',action='store_true')
    args=parser.parse_args();out=args.outdir.resolve();out.mkdir(parents=True,exist_ok=True)
    cache=args.notes_cache.resolve();meta=json.loads(cache.read_text());source_meta=json.loads(CACHE.read_text())
    expected_pair=meta.get('pairSha256',meta.get('source',{}).get('sha256',source_meta['pairSha256']))
    assert sha(PAIR)==expected_pair,'Production pair provenance changed'
    performance_duration=meta.get('duration',meta.get('source',{}).get('duration',source_meta['duration']))
    duration=min(args.seconds,performance_duration-args.start);tuning=load_tuning_profile(args.tuning_profile) if args.tuning_profile else meta.get('tuningEstimateCents',source_meta['tuningEstimateCents'])
    movements=load_movement_map(args.movement_map) if args.movement_map else None
    if movements is not None and not args.tuning_profile:raise ValueError('V3 requires an explicit reviewed tuning profile; do not silently reuse legacy ET.')
    if args.verified_score:
        if movements is None:raise ValueError('Score-led mode requires explicit movement choreography')
        spans,colours,decisions=allocate_score_spans(meta['notes'],tuning,movements,4 if args.bow_wall else 2,args.bow_wall);bed=derive_score_bed(meta['notes'],tuning,movements,args.bow_wall);spans+=bed
    else:spans,colours,decisions=allocate_lanes(meta['notes'],tuning);bed=[]
    raw=out/'pressure-internal.f32';internal=out/'pressure-downsampled-float.wav';wave=out/'couperin-pressure-dry.wav';mp3=out/'couperin-pressure-dry.mp3'
    render=synthesize_raw(spans,colours,raw,args.start,duration,tuning,args.oversample,movements,args.bow_wall,args.stem_dir,args.dc_block)
    (out/'render-profile.json').write_text(json.dumps(render,indent=2)+'\n')
    if args.stem_dir:
        inputs=[]
        for path in render['prefaderStemPaths']:inputs+=['-i',path]
        ffmpeg(*inputs,'-filter_complex','amix=inputs=5:normalize=0:dropout_transition=0','-c:a','pcm_f32le',internal)
    else:
        filt='aresample=32000:filter_size=64:cutoff=0.92'+(',highpass=f=8:p=1' if args.dc_block else '')
        ffmpeg('-f','f32le','-ar',SR*args.oversample,'-ac',2,'-i',raw,'-af',filt,'-c:a','pcm_f32le',internal)
    target=metrics_file(PAIR,right=True,start=args.start,seconds=duration);before=metrics_file(internal,2);gain=target['rms']/max(1e-20,before['rms'])
    assert before['peak']*gain<.95,'RMS match would exceed reserved headroom before PCM quantization'
    ffmpeg('-i',internal,'-af',f'volume={gain:.12g}','-c:a','pcm_s24le','-metadata','title=Couperin pressure B — dry four-lane wavetable',wave)
    ffmpeg('-i',wave,'-c:a','libmp3lame','-b:a','192k',mp3)
    reference=out/'reference-electronic-dry.wav';ffmpeg('-i',PAIR,'-ss',args.start,'-t',duration,'-af','pan=stereo|c0=c1|c1=c1','-c:a','pcm_s24le',reference)
    final=metrics_file(wave,2);assert final['nonfiniteSamples']==0 and final['samplesAtOrAboveFullScale']==0
    reference_loudness=loudness(reference);output_loudness=loudness(wave);auditions=[]
    for label,source,analysis in [('A-existing',reference,reference_loudness),('B-pressure',wave,output_loudness)]:
        gain_db=min(-23-float(analysis['input_i']),-2-float(analysis['input_tp']))
        listening=out/(label+'-23LUFS.wav');portable=out/(label+'-23LUFS.mp3')
        ffmpeg('-i',source,'-af',f'volume={gain_db:.9g}dB','-c:a','pcm_s24le',listening)
        ffmpeg('-i',listening,'-c:a','libmp3lame','-b:a','192k',portable)
        result=loudness(portable);decoded_metrics=metrics_file(portable,2);assert float(result['input_tp'])<=-2,'Listening-copy encoded true peak exceeds ceiling'
        assert abs(float(result['input_i'])+23)<=.3,'Listening copy missed the loudness target'
        auditions.append({'label':label,'wav':listening.name,'mp3':portable.name,'scalarGainDb':gain_db,'decodedLoudness':result,'decodedMetrics':decoded_metrics,'layout':'stereo; A is identical-channel dual mono, B four-lane stereo'})
    receipt={'title':'Couperin pressure v4 — broad bowed ensemble/contact wall' if args.bow_wall else 'Couperin pressure v3 — score-led spectral wall' if args.verified_score else 'Couperin pressure B — four persistent bow lanes','status':'Offline dry prototype; no audible playback or human acceptance. Not deployed.','generationScriptSha256':sha(Path(__file__)),'sourceCacheSha256':sha(cache),'productionPairSha256':sha(PAIR),'productionPairMatches':True,
             'startSeconds':args.start,'durationSeconds':duration,'sourceTuningEstimateCents':meta.get('tuningEstimateCents'),'appliedTuning':tuning.receipt() if isinstance(tuning,TuningProfile) else {'legacyGlobalCents':tuning,'referenceAHz':440,'pitchClassCents':[0]*12,'status':'Legacy compatibility only; not newly adjudicated.'},'render':render,
             'bowWallV4':args.bow_wall,'writtenScoreMode':args.verified_score,'bassBedSpans':len(bed),'movementChoreography':movements,'design':{'lanes':LANES,'oscillatorsPerLane':2,'detuneCents':DETUNE_CENTS,'maximumDoubletSeparationHz':1.5,'phase':'Lane phase inherited at exact onset; repeated close notes tied. No shared vibrato LFO.','pressure':'16-position formant/topology bank; explicit movement base/excursion/rate, prominent asymmetric spectral sweep, exact unequal-tempered fundamental and bounded nonlinear bow tension.' if movements is not None else 'Lane-local deterministic aperiodic2.7–7.3s knots, pressure-scanned register-bandlimited wavetable and bounded nonlinear bow tension.','bandlimit':'Harmonics <=floor(.45*32000/highest_detuned_frequency), before nonlinear stage.','downsample':'ffmpeg swresample32000Hz, filter_size64, cutoff0.92.2x nonlinear render unless alias comparison rejects it.','room':'No IR, reverb, convolution or adaptive human blend.','heuristics':'Disabled for verified score; all written pitches, chromatic inflections, chords and bass events survive. Four ensembles are timbral layers, not a note cap.' if args.verified_score else 'confidence<.48 and weaker near-simultaneous octave partners only colour existing pressure; not asserted to be score errors. Four-lane overflow logged; no quantization or invented pitches.'},
             'decisions':dict(collections.Counter(d['decision'] for d in decisions if args.start<=d['onset']<args.start+duration)),
             'decisionLog':'lane-decisions.json','referenceMetrics':target,'unmatchedMetrics':before,'linearRmsMatchGain':gain,'outputMetrics':final,
             'referenceLoudness':reference_loudness,'outputLoudness':output_loudness,'adjudicationCopies':auditions,'aliasingLimit':'2x nonlinear oversampling is not mathematical alias elimination; compare deterministic2x/4x high/dense excerpt before full production.',
             'files':[{'name':p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in [wave,mp3,reference]]}
    (out/'lane-decisions.json').write_text(json.dumps([d for d in decisions if args.start<=d['onset']<args.start+duration],indent=2)+'\n')
    if args.alias_check:
        # Choose the most demanding high/dense12s window INSIDE this prototype.
        check_seconds=4 if duration>90 else 12
        candidates=np.arange(args.start,max(args.start+.01,args.start+duration-check_seconds),1)
        chosen=max(candidates,key=lambda t:sum((s['midi']/65)**2 for s in spans if s['start']<t+check_seconds and s['end']>t))
        comparison=[]
        for osr in (2,4):
            r=out/f'alias-{osr}x.f32';w=out/f'alias-{osr}x-float.wav';synthesize_raw(spans,colours,r,float(chosen),check_seconds,tuning,osr,movements,args.bow_wall)
            ffmpeg('-f','f32le','-ar',SR*osr,'-ac',2,'-i',r,'-af','aresample=32000:filter_size=64:cutoff=0.92','-c:a','pcm_f32le',w)
            comparison.append(decode_f32(w).astype(np.float64));r.unlink();w.unlink()
        x,y=comparison;n=min(len(x),len(y));residual=x[:n]-y[:n]
        receipt['aliasComparison']={'startSeconds':float(chosen),'durationSeconds':check_seconds,'gainOrPhaseAlignmentApplied':False,'sameAbsolutePhasesAndPressure':True,'relativeResidualRmsDb':20*math.log10(float(np.sqrt(np.mean(residual*residual)))/max(1e-20,float(np.sqrt(np.mean(y[:n]*y[:n]))))),'twoX':metrics(x,2),'fourX':metrics(y,2)}
    if args.stem_dir:
        common_gain=gain*10**(next(a for a in auditions if a['label']=='B-pressure')['scalarGainDb']/20)
        receipt['stemCommonGain']=common_gain;receipt['printedStems']=[]
        for name,prefader in zip(STEM_NAMES,render['prefaderStemPaths']):
            target_path=args.stem_dir/(name+'.wav')
            ffmpeg('-i',prefader,'-af',f'volume={common_gain:.12g}','-c:a','pcm_s24le',target_path)
            receipt['printedStems'].append({'name':name,'path':str(target_path.resolve()),'sha256':sha(target_path),'frames':round(duration*SR),'gain':common_gain})
            Path(prefader).unlink()
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');raw.unlink(missing_ok=True);internal.unlink()
    print(json.dumps({'outdir':str(out),'renderWallSeconds':render['wallSeconds'],'duration':duration,'decisions':receipt['decisions'],'rmsMatchGain':gain,'rmsA':target['rms'],'rmsB':final['rms'],'lufsA':receipt['referenceLoudness']['input_i'],'lufsB':receipt['outputLoudness']['input_i'],'aliasComparison':receipt.get('aliasComparison',{}).get('relativeResidualRmsDb')},indent=2))

if __name__=='__main__':main()
