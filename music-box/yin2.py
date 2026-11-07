import numpy as np, wave
import aubio
def load(path):
    w=wave.open(path,'rb'); rate=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0, rate
def yin(path, label, thresh=-48, hop=256):
    d, rate = load(path)
    win=1024
    p = aubio.pitch("yin", win, hop, rate)
    p.set_unit("midi"); p.set_silence(thresh); p.set_tolerance(0.55)
    out=[]
    for i in range((len(d)-win)//hop):
        frame = d[i*hop:i*hop+hop].astype(np.float32)
        m = p(frame)[0]
        if m > 0: out.append((i*hop/rate, m))
    # dedupe consecutive
    print(f"--- {label} ({len(out)} voiced frames) ---")
    seq=[]
    for t,m in out:
        seq.append((round(t,2), round(m,1)))
    # print compact
    prev=None
    for t,m in seq:
        print(f"{t:7.2f}  {m:6.1f}")
yin("main_filtered.wav","main filtered")
yin("short_filtered.wav","short filtered")
