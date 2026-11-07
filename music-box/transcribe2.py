import numpy as np, wave
import aubio

def load(path):
    w = wave.open(path,'rb'); rate=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64)/32768.0, rate

d, rate = load("main.wav")
hop = 256
win = 1024
def midi_name(m):
    names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    n = int(round(m)); return f"{names[n%12]}{n//12-1}({n})"

# analyze a window [t0,t1)
def analyze(t0, t1, label, thresh=-45):
    a = int(t0*rate); b = int(t1*rate)
    seg = d[a:b]
    print(f"\n### {label}: {t0}-{t1}s, {len(seg)/rate:.2f}s, peak={20*np.log10(max(abs(seg))):.1f}dB")
    onset = aubio.onset("specflux", win, hop, rate)
    onset.set_threshold(0.55)
    onsets = []
    for i in range(0, len(seg)-win, hop):
        frame = seg[i:i+hop].astype(np.float32)
        if len(frame) < hop: break
        if onset(frame):
            onsets.append(i/rate)
    # merge close onsets
    merged = []
    for o in onsets:
        if merged and o - merged[-1] < 0.08: continue
        merged.append(o)
    print(f"onsets ({len(merged)}):", " ".join(f"{o:.2f}" for o in merged))
    # pitch at each onset via FFT peak
    pitches = []
    for o in merged:
        i0 = int(o*rate)
        if i0 >= len(seg)-win: continue
        frame = seg[i0:i0+win] * np.hanning(win)
        spec = np.fft.rfft(frame)
        mag = np.abs(spec)
        f = np.fft.rfftfreq(win, 1/rate)
        # search 1000-9000 Hz for music box fundamental-ish
        lo = np.searchsorted(f, 800); hi = np.searchsorted(f, 9000)
        if hi <= lo: continue
        m = mag[lo:hi]; k = np.argmax(m) + lo
        # parabolic interpolation
        if 0 < k < len(mag)-1:
            a0,a1,a2 = mag[k-1],mag[k],mag[k+1]
            denom = a0-2*a1+a2
            delta = 0 if denom==0 else 0.5*(a0-a2)/denom
            fpeak = f[k] + delta*(f[1]-f[0])
        else:
            fpeak = f[k]
        midi = 69 + 12*np.log2(fpeak/440.0)
        pitches.append((o, fpeak, midi, midi_name(midi)))
    for o,fp,m,nm in pitches:
        print(f"  {o:6.2f}s  {fp:7.1f}Hz  midi={m:6.2f}  {nm}")

analyze(58, 76, "section A 58-76")
analyze(95, 112, "section B 95-112")
analyze(101, 111, "section B2 101-111", -40)
