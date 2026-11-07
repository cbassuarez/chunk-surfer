import numpy as np, wave
import aubio

def load_wav(path):
    w = wave.open(path, 'rb')
    rate = w.getframerate()
    n = w.getnframes()
    data = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768.0
    return data, rate

def detect_pitch(path, out_path):
    data, rate = load_wav(path)
    hop = 512
    win = 2048
    p = aubio.pitch("yinfft", win, hop, rate)
    p.set_unit("midi")
    p.set_silence(-40)
    p.set_tolerance(0.7)
    nframes = (len(data) - win) // hop
    notes = []
    for i in range(nframes):
        start = i * hop
        frame = data[start:start+hop].astype(np.float32)
        m = p(frame)[0]
        notes.append((start/rate, round(m,2)))
    with open(out_path, 'w') as f:
        for t, m in notes:
            f.write(f"{t:.3f}\t{m}\n")
    print("wrote", out_path, "frames", len(notes))

detect_pitch("main.wav", "main.pitch.txt")
detect_pitch("short.wav", "short.pitch.txt")
