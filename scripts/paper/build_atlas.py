#!/usr/bin/env python3
from __future__ import annotations
import json, sys
from pathlib import Path
from PIL import Image

def main(manifest_path:Path):
    m=json.loads(manifest_path.read_text()); cols=int(m['columns']); rows=int(m['rows']); tw,th=map(int,m['tile']); files=[Path(p) for p in m['files']]; out=Path(m['output'])
    atlas=Image.new('RGB',(cols*tw,rows*th),(236,235,230))
    for i,p in enumerate(files):
        with Image.open(p) as im:
            tile=im.convert('RGB').resize((tw,th),Image.Resampling.LANCZOS)
            atlas.paste(tile,((i%cols)*tw,(i//cols)*th))
    out.parent.mkdir(parents=True,exist_ok=True);atlas.save(out,'WEBP',quality=91,method=4)
if __name__=='__main__':
    if len(sys.argv)!=2: raise SystemExit('usage: build_atlas.py MANIFEST.json')
    main(Path(sys.argv[1]))
