import numpy as np, wave, json, os
import aubio

def load(path):
    w=wave.open(path,'rb'); r=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0, r

d, rate = load("clean.wav")  # denoised mono source
hop=256; win=1024
names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m):
    n=int(round(m)); return f"{names[n%12]}{n//12-1}({n})"

def f0(frame):
    w=frame*np.hanning(len(frame)); spec=np.fft.rfft(w); mag=np.abs(spec); f=np.fft.rfftfreq(len(frame),1/rate)
    lo=np.searchsorted(f,500); hi=np.searchsorted(f,2600)
    m=mag[lo:hi]; peak=m.max()
    if peak<=0: return 0
    thresh=0.18*peak; cands=[]
    for k in range(1,len(m)-1):
        if m[k]>=m[k-1] and m[k]>=m[k+1] and m[k]>=thresh:
            a0,a1,a2=m[k-1],m[k],m[k+1]; den=a0-2*a1+a2
            dlt=0 if den==0 else 0.5*(a0-a2)/den
            cands.append(f[lo+k]+dlt*(f[1]-f[0]))
    cands=[c for c in cands if c>=500]
    return min(cands) if cands else 0

# Scan the two full plays + loud fragments
regions=[(57.5,76.5),(94.5,112.5)]
det=[]  # (t_abs, freq)
for (a,b) in regions:
    seg=d[int(a*rate):int(b*rate)]
    o=aubio.onset("specflux",win,hop,rate); o.set_threshold(0.5)
    for i in range(0,len(seg)-win,hop):
        fr=seg[i:i+hop].astype(np.float32)
        if o(fr):
            t=i/rate
            i0=i+int(0.004*rate)
            if i0+win<len(seg):
                f=f0(seg[i0:i0+win])
                if f>0: det.append((a+t,f))

# Merge detections within 90ms into single notes (keep the longest sustain by continuity)
det.sort()
notes=[]
for t,f in det:
    if notes and t-notes[-1][0]<0.09 and abs(f-notes[-1][1])/notes[-1][1]<0.04:
        notes[-1]=((notes[-1][0]+t)/2, (notes[-1][1]+f)/2)  # average
    else:
        notes.append([t,f])

print(f"detected {len(notes)} notes")
# Histogram by nearest MIDI
hist={}
for t,f in notes:
    m=round(69+12*np.log2(f/440))
    hist.setdefault(m,[]).append(f)
print("\nNote histogram (MIDI: count, median Hz, median cents-off from ET):")
for m in sorted(hist):
    fs=hist[m]
    med=np.median(fs); cents=1200*np.log2(med/(440*2**((m-69)/12)))
    print(f"  {m:3d} {nm(m):>6s}  n={len(fs):3d}  {med:7.1f}Hz  {cents:+5.0f}c")

# Save raw detection list for the next step
with open("note_detections.json","w") as fh:
    json.dump({"rate":rate,"notes":[[round(t,3),round(f,2)] for t,f in notes]}, fh, indent=0)
print("\nwrote note_detections.json")
