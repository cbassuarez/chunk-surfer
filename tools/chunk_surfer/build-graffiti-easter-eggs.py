#!/usr/bin/env python3
"""Letter two original game messages with the OFL Sedgwick Ave Display font."""
from pathlib import Path
import json, hashlib, random
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
fonts = {
    "tagger": root / "assets/source-graffiti/tagger/Tagger-Regular.ttf",
    "marker": root / "assets/source-graffiti/permanent-marker/PermanentMarker-Regular.ttf",
}
out = root / 'assets/source-graffiti/easter-eggs'
out.mkdir(parents=True, exist_ok=True)
entries = [('ellery-listening.png', ('ellery keeps', 'the echo'), 1729, 'tagger'),
           ('surfer-hear-you.png', ('SURFER', "YOU'RE THE ROOM TONE"), 5471, 'marker')]
for name, lines, seed, face in entries:
    font = ImageFont.truetype(str(fonts[face]), 108 if face == 'marker' else 150)
    rng = random.Random(seed)
    image = Image.new('RGBA', (2048, 768), (255,255,255,0))
    for row, line in enumerate(lines):
        if face == 'tagger':
            draw = ImageDraw.Draw(image)
            width = draw.textlength(line, font=font)
            draw.text(((image.width-width)//2, 120+row*205), line, font=font, fill=(255,255,255,255), stroke_width=2)
            continue
        chars = []
        for ch in line:
            if ch == ' ':
                chars.append((None, 46)); continue
            bbox = font.getbbox(ch, stroke_width=1)
            tile = Image.new('RGBA', (bbox[2]-bbox[0]+32, bbox[3]-bbox[1]+32), (255,255,255,0))
            ImageDraw.Draw(tile).text((16-bbox[0],16-bbox[1]), ch, font=font, fill=(255,255,255,255), stroke_width=1)
            tile = tile.rotate(rng.uniform(-5,5), resample=Image.Resampling.BICUBIC, expand=True)
            chars.append((tile, tile.width-15))
        linew = sum(width for _, width in chars)
        x = (image.width-linew)//2
        for tile, advance in chars:
            if tile:
                image.alpha_composite(tile, (x, 155+row*205+rng.randrange(-9,10)))
            x += advance
    alpha=image.getchannel('A'); bounds=alpha.getbbox()
    image=image.crop((max(0,bounds[0]-34),max(0,bounds[1]-34),min(image.width,bounds[2]+34),min(image.height,bounds[3]+34)))
    image.save(out / name, optimize=True)
    print(name, image.size, hashlib.sha256((out/name).read_bytes()).hexdigest())
receipt={
 'artwork':'Original Chunk Surfer environmental messages, typeset from two open graffiti-inspired fonts',
 'fonts': [
   {'name':'Tagger Regular','author':'Zuzanna Rogatty; Stowarzyszenie Kulturotwórcze Miastodwa','source':'https://github.com/warszawskie-kroje/tagger','license':'SIL Open Font License 1.1','license_file':'../tagger/OFL.txt'},
   {'name':'Permanent Marker','author':'Copyright 2010 Font Diner, Inc.','source':'https://github.com/google/fonts/tree/main/apache/permanentmarker','license':'Apache License 2.0','license_file':'../permanent-marker/LICENSE.txt'}],
 'outputs':[{'file':name,'text':' / '.join(lines),'font':face,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name,lines,_,face in entries]
}
(out/'manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
