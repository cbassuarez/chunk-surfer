"""Phase-1 analysis for the ear room (measure-ear-room.mjs writes the inputs).

  .paper-venv/bin/python tools/chunk_surfer/analyse-ear-room.py frames
  .paper-venv/bin/python tools/chunk_surfer/analyse-ear-room.py audio

FRAMES. The display is a dither, so a pixel-for-pixel difference is mostly
grain. Both frames are blurred to local ink density first (a 9 px box), and an
element counts as seen where the frame with it differs from the frame without
it by more than the lens's own frame-to-frame change: the 99th percentile of
|all - all-again| over the same view. The HUD rows are masked (top 8 %, bottom
8 %); the [E] prompt is read by OCR instead.

AUDIO. ffmpeg's EBU R128 meter for integrated loudness and true peak; a
second pass through two 200 Hz high-passes stands in for laptop speakers; the
spectrum split at 200 Hz is from the same 32k-point Welch average the source
analysis used.
"""
import json, os, re, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path('artifacts/ear-room/phase1')
ROOMS = ['the_tub', 'amplifications', 'soundnoisemusic']


def luma(path):
    im = Image.open(path).convert('L')
    return np.asarray(im.filter(ImageFilter.BoxBlur(4)), dtype=np.float32)


def mean_of(paths):
    return np.mean([luma(p) for p in paths], axis=0)


def mask_rows(a):
    h = a.shape[0]
    out = a.copy()
    out[: int(h * .08)] = 0
    out[int(h * .92):] = 0
    return out


def heat(diff, threshold, path):
    d = np.clip((diff - threshold) / max(1.0, 64 - threshold), 0, 1)
    rgb = np.zeros(diff.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = (d * 255).astype(np.uint8)
    rgb[..., 1] = (d * 120).astype(np.uint8)
    Image.fromarray(rgb).save(path)


def ocr(paths):
    if not paths:
        return {}
    out = subprocess.run(['swift', 'tools/chunk_surfer/ocr-vision.swift', *map(str, paths)], capture_output=True, text=True).stdout
    result = {}
    for line in out.splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        result[row['file']] = row.get('lines', [])
    return result


def wanted(lines):
    """What of STOP LISTENING TO ME a frame's OCR recovered, and from where."""
    hits = []
    for line in lines:
        t = line['text'].upper()
        if re.search(r'STOP|LISTEN|TO ME', t):
            hits.append({'text': line['text'], 'confidence': round(line['confidence'], 2), 'box': [round(v, 3) for v in line['box']]})
    return hits


def frames():
    report = {}
    for room in ROOMS:
        fdir = ROOT / room / 'frames'
        log = json.loads((fdir / 'log.json').read_text())
        groups = {}
        for s in log['shots']:
            if s['kind'] not in ('sweep', 'down'):
                continue
            key = (s['kind'], bool(s.get('torch', True)), s['off'])
            groups.setdefault(key, {}).setdefault(s['cond'], []).append(s['file'])
        views = []
        for (kind, torch, off), conds in sorted(groups.items(), key=lambda kv: (kv[0][0], not kv[0][1], kv[0][2])):
            if 'all' not in conds or 'all-again' not in conds:
                continue
            a = mean_of(conds['all'])
            boil = float(np.percentile(mask_rows(np.abs(a - mean_of(conds['all-again']))), 99))
            toggle = float(np.percentile(mask_rows(np.abs(a - mean_of(conds['null']))), 99)) if 'null' in conds else 0.0
            thr = max(boil, toggle)
            view = {'kind': kind, 'torch': torch, 'off': off, 'noiseP99': round(thr, 1), 'boilP99': round(boil, 1),
                    'toggleP99': round(toggle, 1), 'elements': {}}
            for cond, element in (('no-ears', 'ears'), ('no-writing', 'writing'), ('no-sheet', 'sheet')):
                if cond not in conds:
                    continue
                diff = mask_rows(np.abs(a - mean_of(conds[cond])))
                seen = diff > max(thr, 6.0)
                area = float(seen.mean())
                strength = float(diff[seen].mean()) if seen.any() else 0.0
                ys, xs = np.nonzero(seen)
                box = [round(float(xs.min()) / a.shape[1], 3), round(float(ys.min()) / a.shape[0], 3),
                       round(float(xs.max()) / a.shape[1], 3), round(float(ys.max()) / a.shape[0], 3)] if seen.any() else None
                view['elements'][element] = {'areaPct': round(100 * area, 2), 'meanDelta': round(strength, 1), 'box': box}
                if area > 0.002:
                    hp = fdir / f'heat-{kind}-{"on" if torch else "off"}-{off}-{element}.png'
                    heat(diff, max(thr, 6.0), hp)
                    view['elements'][element]['heat'] = str(hp)
            views.append(view)
        # OCR: the first ten seconds, every lit sweep view with everything in
        # it, the look down, and the torch-off doorway.
        firsts = sorted(fdir.glob('first10-*.png'))
        lit = (sorted(fdir.glob('sweep-on-*-all-0.png')) + sorted(fdir.glob('down-on-*-all-0.png'))
               + sorted(fdir.glob('sweep-off-*-all-0.png')) + sorted(fdir.glob('close-*-all.png')))
        read = ocr(firsts + lit)
        texts = {Path(f).name: {'all': [l['text'] for l in lines], 'stopListening': wanted(lines)} for f, lines in read.items()}
        report[room] = {'entered': log.get('entered'), 'views': views, 'ocr': texts,
                        'first10': [{'t': s['t'], 'speech': s.get('speech')} for s in log['shots'] if s['kind'] == 'first10']}
        print(f'\n{room}')
        for v in views:
            e = '  '.join(f"{k} {d['areaPct']:5.2f}%/{d['meanDelta']:4.1f}" for k, d in v['elements'].items())
            print(f"  {v['kind']:5} {'on ' if v['torch'] else 'off'} {v['off']:4}  boil {v['boilP99']:5.1f} toggle {v['toggleP99']:5.1f}  {e}")
        for name, t in texts.items():
            if t['stopListening']:
                print(f'  OCR {name}: {t["stopListening"]}')
        print('  OCR anywhere STOP/LISTEN:', sum(1 for t in texts.values() if t['stopListening']), 'of', len(texts))
    out = ROOT / 'frames.json'
    merged = json.loads(out.read_text()) if out.exists() else {}
    merged.update(report)
    out.write_text(json.dumps(merged, indent=1))


def ebur128(path, extra=''):
    af = (extra + ',' if extra else '') + 'ebur128=peak=true'
    err = subprocess.run(['ffmpeg', '-nostats', '-v', 'info', '-i', str(path), '-af', af, '-f', 'null', '-'], capture_output=True, text=True).stderr
    summ = err[err.rfind('Summary:'):]
    grab = lambda pat: (float(m.group(1)) if (m := re.search(pat, summ)) and m.group(1) != '-inf' else None)
    return {'lufs': grab(r'I:\s+(-?[\d.]+|-inf) LUFS'), 'truePeak': grab(r'Peak:\s+(-?[\d.]+|-inf) dBFS')}


def below200(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    if not len(x) or not np.any(x):
        return None, float(np.max(np.abs(x))) if len(x) else 0.0
    n = 1 << 15
    x = np.pad(x, (0, max(0, n - len(x))))
    f = np.fft.rfftfreq(n, 1 / 48000)
    lo = hi = 0.0
    for i in range(0, len(x) - n + 1, n // 2):
        p = np.abs(np.fft.rfft(x[i:i + n] * np.hanning(n))) ** 2
        lo += p[f < 200].sum()
        hi += p[f >= 200].sum()
    return (lo / (lo + hi) if lo + hi else None), float(np.max(np.abs(x)))


def audio():
    report = {}
    for room in ROOMS:
        adir = ROOT / room / 'audio'
        if not (adir / 'log.json').exists():
            continue
        rows = {}
        for wav in sorted(adir.glob('*.wav')):
            share, peak = below200(wav)
            m = ebur128(wav)
            rows[wav.name] = {**m, 'laptopLufs': ebur128(wav, 'highpass=f=200:poles=2,highpass=f=200:poles=2')['lufs'],
                              'below200': None if share is None else round(share, 3), 'samplePeak': round(peak, 4)}
            png = wav.with_suffix('.png')
            subprocess.run(['sox', str(wav), '-n', 'remix', '-', 'spectrogram', '-x', '900', '-y', '257', '-z', '90',
                            '-t', f'{room} {wav.stem}', '-o', str(png)], capture_output=True)
            rows[wav.name]['spectrogram'] = str(png) if png.exists() else None
        report[room] = {'log': json.loads((adir / 'log.json').read_text()), 'files': rows}
        print(f'\n{room}')
        for name, r in rows.items():
            print(f"  {name:26} I {r['lufs']!s:>6} LUFS  TP {r['truePeak']!s:>6}  laptop {r['laptopLufs']!s:>6}  <200Hz {r['below200']}  peak {r['samplePeak']}")
    out = ROOT / 'audio.json'
    merged = json.loads(out.read_text()) if out.exists() else {}
    merged.update(report)
    out.write_text(json.dumps(merged, indent=1, default=str))


if __name__ == '__main__':
    if len(sys.argv) > 2:
        ROOMS[:] = sys.argv[2:]
    {'frames': frames, 'audio': audio}[sys.argv[1] if len(sys.argv) > 1 else 'frames']()
