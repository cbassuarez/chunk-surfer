#!/usr/bin/env python3
"""Build the field-transition light leaks from the developer's own Super 8 scans.

    python3 scripts/build-film-leak-atlas.py [REELS_DIR]

REELS_DIR (default ~/letgo_ingest_footage) holds the lab's full-gate 4K ProRes scans:
  Suarez-Solis#149160#5072.mov  reversal with picture; frames 38-60 are a real roll-head
                                fog sequence (red on black, a cyan-white bloom, burned white)
  Suarez-Solis#149145#5068.mov  a blank negative, scanned inverted; frames 30-125 are fog

Each frame is cropped to the picture (plus the perforation-side margin, where the red band
runs), the perforation is painted out, and the scan is levelled per reel so unexposed film
is 0 and burned-through film is 1. Writes:
  public/assets/film-leak-atlas.jpg  8x5 cells of 512x320, in play order
  src/data/film-leak-atlas.js        the cells, each with its mean exposure, and each reel's
                                     fog run and burn run
Needs ffmpeg and numpy. Nothing here runs at game time.
"""
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REELS = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/letgo_ingest_footage')
FILES = {'5072': 'Suarez-Solis#149160#5072.mov', '5068': 'Suarez-Solis#149145#5068.mov'}
W, H = 1024, 778                       # decode size; the scan is 4096x3112
X0, X1, Y0, Y1 = 100, 916, 118, 628    # 816x510 (1.6:1): picture plus the perf-side margin
PX0, PX1, PY0, PY1 = 76, 204, 290, 457 # the perforation, painted out
CELL_W, CELL_H, COLS, ROWS = 512, 320, 8, 5

# Each reel's red stage in play order, and its burn. Two frames are left out of the red
# stage (5072:38, 5068:38): each darkens a quarter of the frame in the middle of the
# build-up, which reads as a flash when played.
FOG = {'5072': [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51], '5068': [32, 33, 34, 35, 36, 37, 39]}
BURN = {'5072': [58, 52, 54, 56], '5068': [40] + list(range(46, 121, 5))}
BLACK = {'5072': ('frames', [43]), '5068': ('seconds', [8.0, 40.0, 80.0])}   # unexposed film
WHITE = {'5072': ('median', [52]), '5068': ('p99', list(range(46, 121, 5)))}  # burned through

def decode(reel, frames=None, seconds=None):
    src = os.path.join(REELS, FILES[reel]); scale = f'scale={W}:{H}:flags=area'
    if seconds is not None:  # one frame, by time: the unexposed body of the reel
        cmd = ['ffmpeg', '-v', 'error', '-ss', str(seconds), '-i', src, '-frames:v', '1', '-vf', scale]
    else:                    # these frames, in frame-number order
        expr = '+'.join(f'eq(n\\,{n})' for n in frames)
        cmd = ['ffmpeg', '-v', 'error', '-i', src, '-vf', f"select='{expr}',{scale}", '-fps_mode', 'passthrough']
    out = subprocess.run(cmd + ['-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(out, '<u2').reshape(-1, H, W, 3).astype(np.float32) / 65535
    return a if seconds is None else a[0]

def unperf(f):
    f = f.copy(); top = f[PY0 - 2:PY0, PX0:PX1].mean(0); bot = f[PY1:PY1 + 2, PX0:PX1].mean(0)
    t = np.linspace(0, 1, PY1 - PY0)[:, None, None]; f[PY0:PY1, PX0:PX1] = top * (1 - t) + bot * t
    return f

def centre(f): return f[200:600, 300:900].reshape(-1, 3)

def main():
    cells, plates = [], []
    for reel in ('5072', '5068'):
        wanted = sorted(set(FOG[reel] + BURN[reel] + BLACK[reel][1] * (BLACK[reel][0] == 'frames') + WHITE[reel][1]))
        got = dict(zip(wanted, decode(reel, frames=wanted)))
        kind, refs = BLACK[reel]
        black = np.median(np.concatenate([centre(got[n]) for n in refs]) if kind == 'frames'
                          else np.concatenate([centre(decode(reel, seconds=s)) for s in refs]), 0)
        kind, refs = WHITE[reel]
        pool = np.concatenate([centre(got[n]) for n in refs])
        white = np.median(pool, 0) if kind == 'median' else np.percentile(pool, 99.0, axis=0)
        def plate(n): return np.clip((unperf(got[n]) - black) / (white - black), 0, 1)[Y0:Y1, X0:X1]
        def exposure(p): return float((-np.log(1 - .995 * p ** 2.2) @ np.array([.2126, .7152, .0722])).mean())
        burn = sorted(BURN[reel], key=lambda n: exposure(plate(n)))  # the burn keeps rising
        for run, frames in (('fog', FOG[reel]), ('burn', burn)):
            for n in frames:
                p = plate(n); plates.append(p)
                cells.append({'reel': reel, 'frame': n, 'run': run, 'exposure': round(exposure(p), 4)})
    assert len(cells) == COLS * ROWS, len(cells)
    raw = b''.join((p * 65535 + .5).astype('<u2').tobytes() for p in plates)
    jpg = os.path.join(ROOT, 'public', 'assets', 'film-leak-atlas.jpg')
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{X1 - X0}x{Y1 - Y0}', '-i', '-',
                    '-vf', f'scale={CELL_W}:{CELL_H}:flags=area,tile={COLS}x{ROWS}', '-frames:v', '1',
                    '-pix_fmt', 'yuvj444p', '-q:v', '2', jpg, '-y'], input=raw, check=True)
    reels = {r: {k: [i for i, c in enumerate(cells) if c['reel'] == r and c['run'] == k] for k in ('fog', 'burn')} for r in FILES}
    js = ('// Generated by scripts/build-film-leak-atlas.py from the developer\'s own Super 8 scans.\n'
          '// Each cell is one scanned frame of fogged film; `exposure` is its mean -log(1-x) over the frame.\n'
          f'export const FILM_LEAK_ATLAS=Object.freeze({{url:\'assets/film-leak-atlas.jpg\',cols:{COLS},rows:{ROWS},cellWidth:{CELL_W},cellHeight:{CELL_H},\n'
          f'  cells:Object.freeze({json.dumps(cells)}.map(Object.freeze)),\n'
          f'  reels:Object.freeze({json.dumps(reels)})}});\n')
    with open(os.path.join(ROOT, 'src', 'data', 'film-leak-atlas.js'), 'w') as f: f.write(js)
    print(f'{len(cells)} cells -> {os.path.relpath(jpg, ROOT)} ({os.path.getsize(jpg)} bytes)')

if __name__ == '__main__':
    main()
