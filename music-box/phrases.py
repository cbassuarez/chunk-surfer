import numpy as np, wave
def load(p):
    w=wave.open(p,'rb'); r=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0, r
d, rate = load("clean.wav")  # denoised mono
win=int(rate*0.05); hop=win//2
db=[]
for i in range(0,len(d)-win,hop):
    seg=d[i:i+win]; db.append(20*np.log10(max(np.sqrt((seg**2).mean()),1e-6)))
db=np.array(db); t=np.arange(len(db))*hop/rate
# music = above -45dB; phrase = contiguous music, merged across gaps <= 1.2s
music=db>-45
phrases=[]; start=None; last=None
for i,m in enumerate(music):
    if m:
        if start is None: start=t[i]
        last=t[i]
    elif start is not None:
        gap=t[i]-last
        if gap>1.2:
            phrases.append((start,last)); start=None; last=None
if start is not None: phrases.append((start,last))
print("candidate phrases (start-end, dur, peakdB):")
for s,e in phrases:
    seg=db[(t>=s)&(t<=e)]
    print(f"  {s:6.2f} - {e:6.2f}s  ({e-s:5.2f}s)  peak {seg.max():.1f}dB")
