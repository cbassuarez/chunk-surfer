"""Paints the printed face of the cab radio. Called by build-cab-radio.mjs.

  python render-cab-radio-face.py <layout.json> <out.png>

The whole face is one image. The keys and rockers map the same image at their own place,
so a numeral printed here is on its key. Pinned fonts only, so a rebuild draws the same
letters. No maker's name anywhere on it.
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / 'assets' / 'fonts'
layout = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])

PX = 11  # pixels per millimetre
face = layout['face']
W, H = round(face['w'] * 1000 * PX), round(face['h'] * 1000 * PX)
PLASTIC, KEY, PRINT, DIM = (24, 25, 27), (112, 114, 116), (238, 240, 232), (168, 170, 164)
image = Image.new('RGB', (W, H), PLASTIC)
draw = ImageDraw.Draw(image)
sans = lambda size: ImageFont.truetype(str(FONTS / 'NimbusSans-Bold.otf'), size)
reg = lambda size: ImageFont.truetype(str(FONTS / 'NimbusSans-Regular.otf'), size)

def at(x, y):
    """Face metres from centre to image pixels."""
    return (W / 2 + x * 1000 * PX, H / 2 - y * 1000 * PX)

def text(x, y, value, font, fill=PRINT, spacing=0):
    cx, cy = at(x, y)
    if not spacing:
        draw.text((cx, cy), value, font=font, fill=fill, anchor='mm')
        return
    widths = [draw.textlength(ch, font=font) for ch in value]
    total = sum(widths) + spacing * (len(value) - 1)
    pen = cx - total / 2
    for ch, width in zip(value, widths):
        draw.text((pen, cy), ch, font=font, fill=fill, anchor='lm')
        pen += width + spacing

def plate(x, y, w, h):
    x0, y0 = at(x - w / 2, y + h / 2)
    x1, y1 = at(x + w / 2, y - h / 2)
    draw.rectangle((x0, y0, x1, y1), fill=KEY)

# The keys and rockers are a lighter grey than the face, so they catch the light as keys.
for key in layout['keys']:
    plate(key['x'], layout['keyRow']['y'], layout['keyRow']['w'], layout['keyRow']['h'])
for key in layout['band']:
    plate(key['x'], key['y'], key['w'], key['h'])
for seek in layout['seek']:
    plate(seek['x'], seek['y'], seek['w'], seek['h'])
plate(layout['noise']['x'], layout['noise']['y'], layout['noise']['w'], layout['noise']['h'])
plate(layout['tune']['x'], layout['tune']['y'], layout['tune']['w'], layout['tune']['h'])

LEGEND_Y = -.0006
text(layout['tune']['x'], LEGEND_Y, '−  TUNE  +', sans(36), spacing=1)
text((layout['keys'][0]['x'] + layout['keys'][3]['x']) / 2, LEGEND_Y, 'STATION', sans(36), spacing=4)
text((layout['band'][0]['x'] + layout['band'][2]['x']) / 2, LEGEND_Y, 'BAND', sans(36), spacing=2)
text((layout['tone']['x'] + layout['volume']['x']) / 2, LEGEND_Y, 'AUDIO CONTROLS', sans(31), spacing=1)
text(layout['noise']['x'], LEGEND_Y, 'NR', sans(36), spacing=2)

# Station keys, band keys and the small key.
for key in layout['keys']:
    text(key['x'], layout['keyRow']['y'] - .001, key['id'], sans(84))
for key, label in zip(layout['band'], ('M L', 'FM', 'LO', 'LD')):
    text(key['x'], key['y'], label, sans(36))
text(layout['noise']['x'], layout['noise']['y'], '●', reg(22), fill=DIM)

# Ribs on the tune rocker, printed in the plastic's own shadow.
tune = layout['tune']
for i in range(11):
    x = tune['x'] - tune['w'] / 2 + .002 + i * (tune['w'] - .004) / 10
    x0, y0 = at(x, tune['y'] + tune['h'] / 2 - .002)
    x1, y1 = at(x, tune['y'] - tune['h'] / 2 + .002)
    draw.line((x0, y0, x1, y1), fill=(12, 12, 13), width=9)
    draw.line((x0 + 10, y0, x1 + 10, y1), fill=(176, 178, 180), width=3)

# Seek rockers.
for seek, label in zip(layout['seek'], ('<<', '>>')):
    text(seek['x'], seek['y'], label, sans(42))

# A cassette, as the small icon on the door, and an unmarked badge plate beside it.
door, eject = layout['door'], layout['eject']
ix, iy = door['x'] - door['w'] / 2 + .0085, door['y'] + door['h'] / 2 - .0052
x0, y0 = at(ix - .0045, iy + .0024)
x1, y1 = at(ix + .0045, iy - .0024)
draw.rounded_rectangle((x0, y0, x1, y1), radius=5, outline=DIM, width=3)
for dx in (-.002, .002):
    cx, cy = at(ix + dx, iy)
    draw.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), outline=DIM, width=3)
text(eject['x'] - eject['w'] / 2 - .009, eject['y'], 'EJECT', reg(21), fill=DIM, spacing=1)

out.parent.mkdir(parents=True, exist_ok=True)
image.filter(ImageFilter.GaussianBlur(.4)).save(out)
