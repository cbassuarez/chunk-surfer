"""Paints the printed faces of the van's dash. Called by build-cab-dash.mjs.

  python render-cab-dash-faces.py <layout.json> <out-dir>

Writes cluster.png, fascia.png and top.png. The print look eats anything fine, so what's here
is broad and high in contrast: white on black on the dials, dark breaks and pale scuffs on the
mouldings. Pinned fonts and a fixed seed, so a rebuild draws the same dash. No maker's name.
"""
import json, math, random, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / 'assets' / 'fonts'
L = json.loads(Path(sys.argv[1]).read_text())
OUT = Path(sys.argv[2])
bold = lambda s: ImageFont.truetype(str(FONTS / 'NimbusSans-Bold.otf'), s)
reg = lambda s: ImageFont.truetype(str(FONTS / 'NimbusSans-Regular.otf'), s)
TINT = {'red': (214, 52, 40), 'green': (66, 196, 92), 'blue': (70, 120, 228), 'amber': (232, 160, 48)}


def mapper(box, w, h):
    """Cab metres to pixels on an image covering this box."""
    return lambda x, y: ((x - box['x0']) / (box['x1'] - box['x0']) * w, (box['y1'] - y) / (box['y1'] - box['y0']) * h)


def grain(image, rng, amount, size=2):
    """Moulded texture: broad and soft, so it survives the print as a tone and not as noise."""
    w, h = image.size
    noise = Image.new('L', (w // size + 1, h // size + 1))
    noise.putdata([128 + rng.randint(-amount, amount) for _ in range(noise.width * noise.height)])
    noise = noise.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(.8))
    px, nx = image.load(), noise.load()
    for y in range(h):
        for x in range(w):
            d = nx[x, y] - 128
            r, g, b = px[x, y]
            px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))


# ── The cluster ───────────────────────────────────────────────────────────────────────────
def cluster():
    box = L['cluster']
    W, H = 1400, round(1400 * (box['y1'] - box['y0']) / (box['x1'] - box['x0']))
    image = Image.new('RGB', (W, H), (17, 18, 18))
    draw = ImageDraw.Draw(image)
    at = mapper(box, W, H)
    px_per_m = W / (box['x1'] - box['x0'])

    def dial(g, ticks, big_every=None, faceplate=(26, 27, 27)):
        cx, cy = at(g['x'], g['y'])
        r = g['r'] * px_per_m
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=faceplate, outline=(70, 70, 66), width=3)
        for k, (a, major) in enumerate(ticks):
            inner = r * (.80 if major else .87)
            outer = r * .95
            s, c = math.sin(a), math.cos(a)
            draw.line([cx + s * inner, cy - c * inner, cx + s * outer, cy - c * outer], fill=(244, 244, 234), width=7 if major else 3)
        return cx, cy, r

    # Speed: the same sweep the needle already has.
    s = L['speed']
    ticks = [(-s['sweep'] + m / s['maxMph'] * 2 * s['sweep'], m % 10 == 0) for m in range(0, s['maxMph'] + 1, 5)]
    cx, cy, r = dial(s, ticks)
    for mph in range(0, s['maxMph'] + 1, 10):
        a = -s['sweep'] + mph / s['maxMph'] * 2 * s['sweep']
        rr = r * (.62 if mph % 20 == 0 else .66)
        text = str(mph)
        if mph % 20 == 0:
            draw.text((cx + math.sin(a) * rr, cy - math.cos(a) * rr), text, font=bold(32), fill=(248, 248, 238), anchor='mm')
    draw.text((cx, cy + r * .30), 'MPH', font=bold(20), fill=(206, 206, 196), anchor='mm')
    # The odometer window, with a mile he hasn't finished.
    ow, oh, ox, oy = r * .92, r * .20, cx, cy + r * .56
    draw.rectangle([ox - ow / 2, oy - oh / 2, ox + ow / 2, oy + oh / 2], fill=(6, 6, 6), outline=(92, 92, 88), width=2)
    digits = '086417'
    for i, d in enumerate(digits):
        dx = ox - ow / 2 + (i + .5) * ow / len(digits)
        fill = (236, 236, 226) if i < 5 else (30, 30, 30)
        if i == 5:
            draw.rectangle([dx - ow / 12, oy - oh / 2 + 2, dx + ow / 12, oy + oh / 2 - 2], fill=(226, 226, 216))
        draw.text((dx, oy), d, font=bold(21), fill=fill, anchor='mm')

    # Fuel below, temperature above, on the one small dial.
    f = L['fuel']
    ticks = [(-f['sweep'] + i / 8 * 2 * f['sweep'], i % 4 == 0) for i in range(9)]
    cx, cy, r = dial(f, ticks)
    for a, label in ((-f['sweep'], 'E'), (f['sweep'], 'F')):
        draw.text((cx + math.sin(a) * r * .60, cy - math.cos(a) * r * .60), label, font=bold(28), fill=(248, 248, 238), anchor='mm')
    a = 0
    draw.text((cx, cy - r * .50), '1/2', font=reg(19), fill=(206, 206, 196), anchor='mm')
    draw.text((cx, cy + r * .46), 'FUEL', font=bold(19), fill=(206, 206, 196), anchor='mm')

    # The lamps between the dials, unlit until they aren't.
    for lamp in L['lamps']:
        x, y = at(lamp['x'], lamp['y'])
        tint = TINT[lamp['tint']]
        rr = 21
        draw.rounded_rectangle([x - rr * 1.25, y - rr * .78, x + rr * 1.25, y + rr * .78], 5, fill=tuple(int(c * .46) for c in tint), outline=(92, 92, 88), width=2)
        ink = (232, 232, 222)
        if lamp['id'] == 'oil':
            draw.polygon([(x - 13, y + 7), (x + 12, y + 7), (x + 6, y - 4), (x - 7, y - 4)], outline=ink, width=3)
        elif lamp['id'] == 'battery':
            draw.rectangle([x - 13, y - 6, x + 13, y + 8], outline=ink, width=3)
            draw.line([x - 8, y - 9, x - 3, y - 9], fill=ink, width=3)
            draw.line([x + 3, y - 9, x + 8, y - 9], fill=ink, width=3)
        elif lamp['id'] == 'brake':
            draw.ellipse([x - 10, y - 10, x + 10, y + 10], outline=ink, width=3)
            draw.text((x, y), '!', font=bold(18), fill=ink, anchor='mm')
        elif lamp['id'] == 'indicator':
            draw.polygon([(x - 15, y), (x - 4, y - 8), (x - 4, y + 8)], fill=ink)
            draw.polygon([(x + 15, y), (x + 4, y - 8), (x + 4, y + 8)], fill=ink)
        else:
            draw.pieslice([x - 13, y - 10, x + 7, y + 10], 90, 270, fill=ink)
            for k in range(3):
                draw.line([x + 3, y - 7 + k * 7, x + 14, y - 7 + k * 7], fill=ink, width=3)
    return image


# ── The fascia ────────────────────────────────────────────────────────────────────────────
def fascia():
    box = L['fascia']
    W, H = 2048, round(2048 * (box['y1'] - box['y0']) / (box['x1'] - box['x0']))
    rng = random.Random(0x7A5C)
    base = (112, 110, 102)
    image = Image.new('RGB', (W, H), base)
    grain(image, rng, 9, 3)
    draw = ImageDraw.Draw(image, 'RGBA')
    at = mapper(box, W, H)
    px_per_m = W / (box['x1'] - box['x0'])
    # A moulded rib along the top and bottom of the whole run.
    for y, tone in ((1.138, 58), (1.128, 150), (.946, 58)):
        _, py = at(0, y)
        draw.line([0, py, W, py], fill=(tone, tone, tone - 6, 255), width=3)
    # Panel breaks: a dark gap with a lit lip below it, which is all a moulding is in this print.
    for x0, x1, y0, y1 in L['panels']:
        a, b = at(x0, y1), at(x1, y0)
        draw.rounded_rectangle([a[0], a[1], b[0], b[1]], 6, outline=(20, 20, 18, 255), width=4)
        draw.line([a[0] + 6, b[1] + 3, b[0] - 6, b[1] + 3], fill=(176, 172, 160, 255), width=2)
        for sx in (a[0] + 11, b[0] - 11):
            for sy in (a[1] + 11, b[1] - 11):
                draw.ellipse([sx - 3, sy - 3, sx + 3, sy + 3], fill=(30, 30, 28, 255))
    # Blanks where the options weren't ordered.
    for blank in L['blanks']:
        a, b = at(blank['x'] - blank['w'] / 2, blank['y'] + blank['h'] / 2), at(blank['x'] + blank['w'] / 2, blank['y'] - blank['h'] / 2)
        draw.rectangle([a[0], a[1], b[0], b[1]], fill=(70, 69, 64, 255), outline=(24, 24, 22, 255), width=2)
    # What the switches do, in the white paint these were sold with.
    ink = (232, 230, 216, 255)
    lamp = L['lampSwitch']
    x, y = at(lamp['x'], lamp['y'])
    r = lamp['r'] * px_per_m
    draw.text((x - r * 1.5, y - r * .9), 'O', font=bold(15), fill=ink, anchor='mm')
    draw.text((x + r * 1.55, y - r * .9), 'I', font=bold(15), fill=ink, anchor='mm')
    draw.text((x + r * 1.65, y + r * .4), 'II', font=bold(15), fill=ink, anchor='mm')
    d = L['dimmer']
    x, y = at(d['x'], d['y'] + d['h'] / 2)
    draw.text((x, y - 12), 'PANEL', font=bold(13), fill=ink, anchor='mm')
    # Where a hand has been for ten years: paler round the switches and along the lip.
    wear = Image.new('L', (W, H), 0)
    wd = ImageDraw.Draw(wear)
    for rocker in L['rockers']:
        cx, cy = at(rocker['x'], rocker['y'])
        wd.ellipse([cx - 44, cy - 34, cx + 44, cy + 34], fill=70)
    cx, cy = at(lamp['x'], lamp['y'])
    wd.ellipse([cx - 56, cy - 46, cx + 56, cy + 46], fill=80)
    wear = wear.filter(ImageFilter.GaussianBlur(11))
    image.paste(Image.new('RGB', (W, H), (162, 158, 146)), (0, 0), wear)
    # Scuffs. Few, and long enough to survive.
    for _ in range(26):
        x, y = rng.uniform(0, W), rng.uniform(H * .12, H * .95)
        draw = ImageDraw.Draw(image, 'RGBA')
        draw.line([x, y, x + rng.uniform(12, 70), y + rng.uniform(-6, 6)], fill=(182, 178, 164, rng.randint(40, 90)), width=rng.randint(1, 2))
    return image


# ── The top of the moulding ───────────────────────────────────────────────────────────────
def top():
    W, H = 1024, 340
    rng = random.Random(0x51DE)
    image = Image.new('RGB', (W, H), (92, 90, 84))
    grain(image, rng, 12, 4)
    draw = ImageDraw.Draw(image, 'RGBA')
    # Ten summers' sun, in a band under the glass, and dust where nothing wipes it.
    fade = Image.new('L', (W, H), 0)
    fd = ImageDraw.Draw(fade)
    fd.rectangle([0, int(H * .10), W, int(H * .56)], fill=86)
    fade = fade.filter(ImageFilter.GaussianBlur(26))
    image.paste(Image.new('RGB', (W, H), (168, 162, 146)), (0, 0), fade)
    draw = ImageDraw.Draw(image, 'RGBA')
    # The crack everyone's dash has, wandering in from the demister.
    for start in (.18, .62):
        x, y = W * start, H * .14
        points = [(x, y)]
        for _ in range(16):
            x += rng.uniform(-14, 22)
            y += rng.uniform(7, 19)
            points.append((x, y))
        draw.line(points, fill=(18, 18, 16, 235), width=3)
        for p in points[3:13:3]:
            draw.line([p, (p[0] + rng.uniform(-30, 30), p[1] + rng.uniform(4, 22))], fill=(26, 26, 24, 190), width=2)
    # A seam down the moulding toward the lip.
    draw.line([0, H * .86, W, H * .86], fill=(26, 26, 24, 255), width=4)
    draw.line([0, H * .88, W, H * .88], fill=(156, 152, 138, 255), width=2)
    return image


for name, paint in (('cluster', cluster), ('fascia', fascia), ('top', top)):
    paint().save(OUT / f'{name}.png', optimize=True)
