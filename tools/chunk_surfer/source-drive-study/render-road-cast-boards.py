"""Paints the services adverts for the road cast. Called by build-road-cast.mjs.

  python render-road-cast-boards.py <copy.json> <out-dir>

Uses the project's own pinned fonts, like the institution posters. No system fonts,
so a rebuild on another machine draws the same letters.
"""
import json, math, random, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / 'assets' / 'fonts'
# Headlamps bleach anything pale, so the ground is dark and only the letters are light.
CREAM, BROWN, ORANGE, RED = (242, 224, 176), (74, 34, 18), (150, 66, 18), (196, 96, 30)
W, H = 1024, 512


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def fit(draw, text, name, width, largest):
    size = largest
    while size > 18 and draw.textlength(text, font=font(name, size)) > width:
        size -= 2
    return font(name, size), size


def sun(draw, x, y, r, ink=ORANGE):
    """A sun coming up behind nothing in particular. It could be going down."""
    for n in range(9):
        a = math.pi * (n / 8)
        draw.line((x + math.cos(a) * r * 1.2, y - math.sin(a) * r * 1.2, x + math.cos(a) * r * 1.75, y - math.sin(a) * r * 1.75), fill=ink, width=max(3, r // 7))
    draw.pieslice((x - r, y - r, x + r, y + r), 180, 360, fill=ink)


def weather(image, seed):
    rng = random.Random(seed)
    pixels = image.load()
    for _ in range(9000):
        x, y = rng.randrange(W), rng.randrange(H)
        shade = rng.randrange(-16, 8)
        r, g, b = pixels[x, y][:3]
        pixels[x, y] = (min(255, max(0, r + shade)), min(255, max(0, g + shade)), min(255, max(0, b + shade)))
    draw = ImageDraw.Draw(image)
    for _ in range(7):
        x = rng.randrange(W)
        top = rng.randrange(0, H // 3)
        draw.line((x, top, x + rng.randrange(-5, 5), top + rng.randrange(40, 150)), fill=(112, 86, 62), width=rng.randrange(1, 3))


def board(row, out):
    inverse = row.get('inverse', False)
    paper, ink = ((34, 26, 20), (246, 196, 96)) if inverse else (BROWN, CREAM)
    image = Image.new('RGB', (W, H), paper)
    draw = ImageDraw.Draw(image)
    draw.rectangle((12, 12, W - 13, H - 13), outline=RED, width=10)
    lines = row['lines']
    band = 92 if row.get('foot') else 0
    room = H - 60 - band
    each = room // len(lines)
    for index, line in enumerate(lines):
        face, size = fit(draw, line, row.get('font', 'NimbusSans-Bold.otf'), W - 110, min(each - 4, 170))
        box = draw.textbbox((0, 0), line, font=face)
        draw.text(((W - (box[2] - box[0])) / 2 - box[0], 30 + index * each + (each - (box[3] - box[1])) / 2 - box[1]), line, font=face, fill=ink)
    if band:
        draw.rectangle((22, H - 22 - band, W - 23, H - 23), fill=ORANGE)
        sun(draw, 98, H - 34, 32, CREAM)
        face, _ = fit(draw, row['foot'], 'NimbusSans-Bold.otf', W - 230, 58)
        box = draw.textbbox((0, 0), row['foot'], font=face)
        draw.text((172, H - 22 - band + (band - (box[3] - box[1])) / 2 - box[1]), row['foot'], font=face, fill=CREAM)
    weather(image, row['id'])
    image.save(out / f"board-{row['id']}.png")


def letters(row, out):
    """Dark letters with a clear ground, to stand in front of a lit panel."""
    width, height = row.get('size', [1024, 512])
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ink = (120, 30, 16, 255)
    lines = row['lines']
    each = height // len(lines)
    for index, line in enumerate(lines):
        face, size = fit(draw, line, row.get('font', 'NimbusRoman-Bold.otf'), width - 70, each - 18)
        box = draw.textbbox((0, 0), line, font=face)
        draw.text(((width - (box[2] - box[0])) / 2 - box[0], index * each + (each - (box[3] - box[1])) / 2 - box[1]), line, font=face, fill=ink)
    image.save(out / f"letters-{row['id']}.png")


def main():
    copy = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for row in copy['boards']:
        board(row, out)
    for row in copy['lit']:
        letters(row, out)


if __name__ == '__main__':
    main()
