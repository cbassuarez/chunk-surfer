import numpy as np, wave, json, os
def load(p):
    w=wave.open(p,'rb'); r=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0, r
def f0_fund(sig, rate):
    fr=sig[:2048]*np.hanning(min(2048,len(sig)))
    spec=np.fft.rfft(fr); mag=np.abs(spec); f=np.fft.rfftfreq(len(fr),1/rate)
    lo=np.searchsorted(f,500); hi=np.searchsorted(f,2600)
    m=mag[lo:hi]; peak=m.max()
    if peak<=0: return 0
    thresh=0.15*peak; cands=[]
    for k in range(1,len(m)-1):
        if m[k]>=m[k-1] and m[k]>=m[k+1] and m[k]>=thresh:
            cands.append(f[lo+k])
    cands=[c for c in cands if c>=500]
    return min(cands) if cands else 0
man=json.load(open("../assets/music-box/note-bank.json"))
print("midi  labelHz  -> fundamental Hz (midi)   delta-cents")
for m,info in sorted(man["notes"].items(), key=lambda kv:int(kv[0])):
    fname=info["file"].split("/")[-1]
    sig,rate=load(os.path.join("..","assets","music-box","samples",fname))
    fd=f0_fund(sig,rate); mm=69+12*np.log2(fd/440) if fd else 0
    dc=1200*np.log2(fd/info['freq']) if fd else 0
    ok="OK" if fd and abs(mm-float(m))<0.6 else ("??" if fd else "silent")
    print(f"  {m:>3s}   {info['freq']:7.1f}  -> {fd:7.1f} ({mm:5.1f})  {dc:+5.0f}c  {ok}")
