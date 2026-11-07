import numpy as np, wave, json, os
d, rate = np.array([]), 0
w=wave.open("clean.wav",'rb'); rate=w.getframerate(); n=w.getnframes()
d=np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0

det=json.load(open("note_detections.json"))["notes"]  # [[t,f],...]

# For each detected note, score quality: RMS in the 60ms after onset vs local noise.
def rms(a,b):
    s=d[int(a*rate):int(b*rate)]; return np.sqrt((s**2).mean()) if len(s) else 0

# Group by rounded MIDI (preserve actual frequency in each sample)
bins={}
for t,f in det:
    m=round(69+12*np.log2(f/440))
    bins.setdefault(m,[]).append([t,f])

os.makedirs("../assets/music-box/samples", exist_ok=True)
manifest={"sampleRate":rate, "notes":{}}
for m in sorted(bins):
    occ=bins[m]
    # score each occurrence by onset energy
    best=None; best_score=-1
    for t,f in occ:
        onset=rms(t+0.005, t+0.07)
        # penalize if next onset is too close (<0.25s => bleed risk)
        if best is None or onset>best_score:
            best_score=onset; best=(t,f)
    t,f=best
    # slice 0.5s with a 50ms fade-out
    a=int(t*rate); L=int(0.5*rate)
    seg=d[a:a+L].copy()
    if len(seg)<L: seg=np.pad(seg,(0,L-len(seg)))
    # fade in 2ms (kill any click) and fade out last 60ms
    fi=int(0.002*rate); fo=int(0.06*rate)
    seg[:fi]*=np.linspace(0,1,fi)
    seg[-fo:]*=np.linspace(1,0,fo)
    # normalize to -1 dBFS
    peak=np.abs(seg).max()
    if peak>1e-4: seg*=0.89/peak
    cents=int(round(1200*np.log2(f/(440*2**((m-69)/12)))))
    fname=f"note_{m:03d}_{cents:+d}.wav"
    path=os.path.join("../assets/music-box/samples",fname)
    with wave.open(path,'wb') as fh:
        fh.setnchannels(1); fh.setsampwidth(2); fh.setframerate(rate)
        fh.writeframes((seg*32767).astype(np.int16).tobytes())
    manifest["notes"][str(m)]={"file":f"music-box/samples/{fname}","freq":round(f,2),"cents":cents,"occurrences":len(occ),"seconds":0.5}
    print(f"midi {m:3d}  {f:7.1f}Hz  {cents:+4d}c  n={len(occ):3d}  -> {fname}")

json.dump(manifest, open("../assets/music-box/note-bank.json","w"), indent=1)
print("\nwrote assets/music-box/note-bank.json +", len(manifest["notes"]), "samples")
