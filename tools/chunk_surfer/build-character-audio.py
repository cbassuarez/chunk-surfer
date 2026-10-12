#!/usr/bin/env python3
"""Build deterministic, click-free encounter excerpts from the credited CC0 sources."""
import hashlib
import json
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/chunk_surfer/character-sources/audio'
DEST = ROOT / 'public/assets/audio/outskirts'
CLIPS = [
    ('fold-effort-a', 'unfa-medium-grunts.mp3', 1.04, 1.48, -4),
    ('fold-effort-b', 'unfa-medium-grunts.mp3', 4.80, 1.50, -4),
    ('fold-effort-c', 'unfa-medium-grunts.mp3', 7.07, 1.57, -5),
    ('fold-effort-d', 'unfa-medium-grunts.mp3', 12.60, 1.57, -5),
    ('fold-catch', 'unfa-pain-grunts.mp3', 13.32, .63, -5),
    ('fold-cloth-a', 'vrymaa-leather-creak.mp3', .24, 1.70, -2),
    ('fold-cloth-b', 'vrymaa-leather-creak.mp3', 4.53, 1.10, -2),
    ('fold-cloth-c', 'vrymaa-leather-creak.mp3', 9.50, 1.85, -3),
]

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    sources = json.loads((SOURCE / 'sources.json').read_text())
    clips = []
    for name, source, start, duration, gain in CLIPS:
        target = DEST / (name + '.wav')
        filters = f'highpass=f=85,lowpass=f=6200,volume={gain}dB,afade=t=in:d=0.018,afade=t=out:st={duration-.075}:d=0.075'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(SOURCE/source), '-t', str(duration), '-af', filters, '-ac', '1', '-ar', '32000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', str(target)], check=True)
        with wave.open(str(target)) as data:
            assert data.getnchannels() == 1 and data.getsampwidth() == 2
            seconds = data.getnframes()/data.getframerate()
        clips.append(dict(id=name, url='assets/audio/outskirts/'+target.name, source=source, start=start, duration=seconds, gainDb=gain, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (DEST/'fold-credits.json').write_text(json.dumps(dict(sources=sources, clips=clips, processing='Trimmed and filtered excerpts, 18ms onset / 75ms release, mono 32kHz PCM. No synthetic vocal layer.'), indent=2)+'\n')
    print(json.dumps(dict(clips=len(clips), bytes=sum((DEST/(name+'.wav')).stat().st_size for name,*_ in CLIPS))))

if __name__ == '__main__':
    main()
