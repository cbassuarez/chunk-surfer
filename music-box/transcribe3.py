import numpy as np, wave
import aubio
def load(path):
    w=wave.open(path,'rb'); rate=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0, rate
d, rate = load("main.wav")
hop=256; win=1024
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): n=int(round(m)); return f"{names[n%12]}{n//12-1}"

def f0_estimate(frame, rate):
    # frame: 1D samples; return fundamental Hz via FFT lowest strong peak in 400-2600
    w = frame * np.hanning(len(frame))
    spec = np.fft.rfft(w); mag = np.abs(spec); f = np.fft.rfftfreq(len(frame), 1/rate)
    lo = np.searchsorted(f, 400); hi = np.searchsorted(f, 2600)
    if hi <= lo: return 0
    m = mag[lo:hi]; peak = m.max()
    if peak <= 0: return 0
    thresh = 0.2 * peak
    # find peaks
    cands = []
    for k in range(1, len(m)-1):
        if m[k] >= m[k-1] and m[k] >= m[k+1] and m[k] >= thresh:
            # parabolic refine
            a0,a1,a2 = m[k-1],m[k],m[k+1]; den=a0-2*a1+a2
            delta = 0 if den==0 else 0.5*(a0-a2)/den
            cands.append(f[lo+k] + delta*(f[1]-f[0]))
    if not cands: return 0
    # fundamental = lowest peak that's a plausible base (music box 500-2500)
    cands = [c for c in cands if c >= 500]
    return min(cands) if cands else 0

def analyze(t0,t1,label):
    a=int(t0*rate); b=int(t1*rate); seg=d[a:b]
    onset = aubio.onset("specflux", win, hop, rate); onset.set_threshold(0.6)
    ons=[]
    for i in range(0,len(seg)-win,hop):
        fr=seg[i:i+hop].astype(np.float32)
        if len(fr)<hop: break
        if onset(fr): ons.append(i/rate)
    merged=[]
    for o in ons:
        if merged and o-merged[-1]<0.07: continue
        merged.append(o)
    print(f"\n### {label} ({t0}-{t1}s) {len(merged)} onsets")
    for o in merged:
        i0=int(o*rate)+int(0.005*rate)
        if i0+win>=len(seg): continue
        fr=seg[i0:i0+win]
        f0=f0_estimate(fr,rate)
        if f0>0:
            m=69+12*np.log2(f0/440)
            print(f"  {t0+o:7.2f}s  {f0:7.1f}Hz  {m:6.2f}  {nm(m)}")
        else:
            print(f"  {t0+o:7.2f}s  (unvoiced)")
analyze(95,112,"B clean")
analyze(58,76,"A clean")
