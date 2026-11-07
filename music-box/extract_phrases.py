import numpy as np, wave, json, os
def load(p):
    w=wave.open(p,'rb'); r=w.getframerate(); n=w.getnframes()
    return np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float64)/32768.0, r
d, rate = load("clean.wav")
# Music-portions of each full playthrough (wind lead-in and stall tails trimmed).
phrases=[
    ("phrase_1", 2.4, 18.1),
    ("phrase_2", 19.3, 33.7),
    ("phrase_3", 42.5, 58.4),
    ("phrase_4", 59.4, 76.4),
    ("phrase_5", 95.4, 111.8),
]
manifest={"sampleRate":rate,"phrases":[]}
for name,a,b in phrases:
    seg=d[int(a*rate):int(b*rate)].copy()
    # 15ms fade in/out to kill clicks at the edit points
    fi=int(0.015*rate); fo=int(0.04*rate)
    seg[:fi]*=np.linspace(0,1,fi); seg[-fo:]*=np.linspace(1,0,fo)
    peak=np.abs(seg).max()
    if peak>1e-4: seg*=0.9/peak
    fname=f"{name}.wav"
    path=os.path.join("..","assets","music-box","phrases",fname)
    with wave.open(path,'wb') as fh:
        fh.setnchannels(1); fh.setsampwidth(2); fh.setframerate(rate)
        fh.writeframes((seg*32767).astype(np.int16).tobytes())
    manifest["phrases"].append({"id":name,"file":f"music-box/phrases/{fname}","start":a,"end":b,"seconds":round(b-a,3)})
    print(f"{name}: {a:.1f}-{b:.1f}s ({b-a:.2f}s) -> {fname}")
json.dump(manifest, open("../assets/music-box/phrase-bank.json","w"), indent=1)
print("\nwrote assets/music-box/phrase-bank.json +", len(manifest["phrases"]), "phrases")
