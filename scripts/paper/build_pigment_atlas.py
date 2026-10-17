#!/usr/bin/env python3
"""One-page-at-a-time pigment masks; current world RGB is copied untouched."""
from __future__ import annotations
import hashlib,json,sys
from pathlib import Path
from PIL import Image
from rasterize_svg import render_pigment

def sha(data):return hashlib.sha256(data).hexdigest()

def build(manifest_path:Path):
    m=json.loads(manifest_path.read_text());cols,rows=int(m['columns']),int(m['rows'])
    tw,th=map(int,m['tile']);cw,ch=map(int,m['canonical'])
    with Image.open(m['rgbSource']) as im:rgb=im.convert('RGB')
    if rgb.size!=(cols*tw,rows*th):raise ValueError(f"World RGB dimensions {rgb.size} do not match catalog")
    alpha=Image.new('L',rgb.size,0);tiles=[]
    for page in m['pages']:
        coverage=render_pigment(Path(page['svg']),cw,ch).resize((tw,th),Image.Resampling.LANCZOS)
        index=int(page['index']);alpha.paste(coverage,((index%cols)*tw,(index//cols)*th))
        h=coverage.histogram();tiles.append({'index':index,'zero':h[0],'full':h[255],'nonzero':tw*th-h[0],
            'coverageSha256':sha(coverage.tobytes())})
        if (index+1)%25==0:print(f"[paper pigment] {index+1}/{len(m['pages'])}",flush=True)
    rgba=rgb.copy().convert('RGBA');rgba.putalpha(alpha)
    out=Path(m['output']);out.parent.mkdir(parents=True,exist_ok=True);rgba.save(out,'PNG',optimize=False)
    with Image.open(out) as check:
        if check.convert('RGB').tobytes()!=rgb.tobytes():raise ValueError('Pigment PNG changed decoded world RGB')
    report={'version':1,'size':list(rgb.size),'tile':[tw,th],'columns':cols,'rows':rows,'count':len(tiles),
        'canonical':list(m['canonical']),'decodedRgbSha256':sha(rgb.tobytes()),'pngSha256':sha(out.read_bytes()),
        'alphaSha256':sha(alpha.tobytes()),'includedLayers':['generic content','stationery','impact','toner','manual'],
        'excludedContainers':['paper-stock','process-handling','reproduction-defects'],
        'coverageSource':'authored SVG process-layer alpha; never inferred from image brightness',
        'rgbByteExact':True,'tiles':tiles}
    Path(m['report']).write_text(json.dumps(report,indent=2)+'\n')
    print(f"[paper pigment] {len(tiles)} tiles, RGB byte-exact, {out.stat().st_size} bytes",flush=True)

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('usage: build_pigment_atlas.py MANIFEST.json')
    build(Path(sys.argv[1]))
