#!/usr/bin/env python3
"""Build the memory fields' sky film from the developer's own Super 8.

    python3 scripts/build-field-sky-film.py [REELS_DIR]

REELS_DIR (default ~/letgo_ingest_footage) has the lab's 4K scan of reel 5072. Its frames
2664-3310 are a steady cumulus shot (it cuts to overcast at about 3313). The shot is cropped to
the picture, time-lapsed 2x (every other frame, played at the camera's 18 fps), looped by
dissolving its last second and a half into its first, and blended edge to edge so it tiles
in both directions: the sky scrolls it, and a mirrored tile would slide its two sides apart.
Writes public/assets/field-sky-cumulus.mp4. Needs ffmpeg and numpy; nothing runs at game time.
"""
import os, subprocess, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REEL = os.path.join(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/letgo_ingest_footage'), 'Suarez-Solis#149160#5072.mov')
FIRST, LAST = 2664, 3310                # the cumulus shot, source frames
CROP = 'crop=2800:2000:830:520'         # inside the picture: clear of the perforation and gate edge
W, H = 640, 456                         # decode size
EVERY, FPS = 2, 18                      # time-lapse, and the camera's own rate
DISSOLVE = 27                           # frames (1.5 s) of the end dissolved into the start
OVER_X, OVER_Y = 112, 80                # edge overlap that makes it tile
OUT = os.path.join(ROOT, 'public', 'assets', 'field-sky-cumulus.mp4')

def main():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', REEL, '-vf',
                          f"trim=start_frame={FIRST}:end_frame={LAST},setpts=PTS-STARTPTS,{CROP},scale={W}:{H}:flags=area",
                          '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, '<u2').reshape(-1, H, W, 3).astype(np.float32)[::EVERY] / 65535
    # Loop: the last frames dissolve into the first, so the end meets the start.
    n = len(frames) - DISSOLVE
    t = (np.arange(DISSOLVE, dtype=np.float32) / DISSOLVE)[:, None, None, None]
    looped = frames[:n].copy()
    looped[:DISSOLVE] = frames[n:n + DISSOLVE] * (1 - t) + frames[:DISSOLVE] * t
    # Tile: each edge band is blended with the band past the opposite edge.
    w = W - OVER_X
    ramp = np.linspace(0, 1, OVER_X, dtype=np.float32)[None, None, :, None]
    tiled = looped[:, :, :w].copy()
    tiled[:, :, :OVER_X] = looped[:, :, w:W] * (1 - ramp) + looped[:, :, :OVER_X] * ramp
    h = H - OVER_Y
    ramp = np.linspace(0, 1, OVER_Y, dtype=np.float32)[None, :, None, None]
    out = tiled[:, :h].copy()
    out[:, :OVER_Y] = tiled[:, h:H] * (1 - ramp) + tiled[:, :OVER_Y] * ramp
    data = (np.clip(out, 0, 1) * 255 + .5).astype(np.uint8)
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
                    '-c:v', 'libx264', '-crf', '21', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT, '-y'],
                   input=data.tobytes(), check=True)
    print(f'{len(data)} frames, {w}x{h}, {len(data) / FPS:.1f} s loop -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT)} bytes)')

if __name__ == '__main__':
    main()
