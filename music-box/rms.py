import numpy as np, wave

def load(path):
    w = wave.open(path,'rb'); rate=w.getframerate(); n=w.getnframes()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64)/32768.0
    return d, rate

for name in ["main.wav","short.wav"]:
    d, rate = load(name)
    win = int(rate*0.05)  # 50ms
    hop = win//2
    rms = []
    for i in range(0, len(d)-win, hop):
        seg = d[i:i+win]
        rms.append((i/rate, np.sqrt(np.mean(seg**2))))
    rms = np.array(rms)
    db = 20*np.log10(np.maximum(rms[:,1], 1e-6))
    # print loud regions (db > -45)
    print(f"=== {name} rate={rate} dur={len(d)/rate:.1f}s peak_db={db.max():.1f} ===")
    # find contiguous loud regions
    loud = db > -42
    regions = []
    in_r = False
    for t, l in zip(rms[:,0], loud):
        if l and not in_r:
            start=t; in_r=True
        elif not l and in_r:
            regions.append((start, t)); in_r=False
    if in_r: regions.append((start, rms[-1,0]))
    for s,e in regions:
        if e-s > 0.3:
            print(f"  loud {s:6.2f} - {e:6.2f}s  ({e-s:.2f}s)  peak={db[(rms[:,0]>=s)&(rms[:,0]<=e)].max():.1f}dB")
