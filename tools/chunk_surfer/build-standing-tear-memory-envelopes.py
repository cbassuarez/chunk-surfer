#!/usr/bin/env python3
"""Measure the exact shipped music files; no invented metronome drives their relief."""
import array, json, math, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
tracks = {
    'couperin': ROOT / 'public/audio/sheet-music/sheet-couperin-clavecin.mp3',
    'ensemble': ROOT / 'public/audio/standing-tear/bach-bwv1004-chaconne-recorders.mp3',
}
measured = {}
for key, path in tracks.items():
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '32000', '-f', 'f32le', '-'])
    pcm = array.array('f'); pcm.frombytes(raw)
    values = [math.sqrt(sum(v*v for v in pcm[i:i+1600]) / len(pcm[i:i+1600])) for i in range(0, len(pcm), 1600)]
    maximum = max(values, default=1) or 1
    measured[key] = {'duration': len(pcm)/32000, 'hz': 20, 'rmsPeak': round(maximum, 6), 'values': [round(min(1, v/maximum)*255) for v in values]}
text = '// Generated from the decoded shipped performances by build-standing-tear-memory-envelopes.py.\n'
text += '// 20 Hz RMS, quantized to 0..255 within each recording; this is amplitude, not a composed beat.\n'
text += 'export const STANDING_TEAR_RECORDING_ENVELOPES = Object.freeze(' + json.dumps(measured, separators=(',', ':')) + ');\n'
(ROOT / 'src/data/standing-tear-memory-envelopes.js').write_text(text)
print(json.dumps({k:{p:v[p] for p in ('duration','hz','rmsPeak')} for k,v in measured.items()}, indent=2))
