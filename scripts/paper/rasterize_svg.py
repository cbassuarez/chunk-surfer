#!/usr/bin/env python3
"""Deterministic physical-paper rasterizer for Chunk Surfer.

This is deliberately *not* a general SVG engine. The paper compiler emits a
small vocabulary of A4 office-document primitives with explicit production
process tags. We preserve those tags through rasterization so offset stationery,
impact-printer entry, biro and photocopy toner acquire different morphology.

Meaning never changes here: strings were fixed before this program runs.
"""
from __future__ import annotations
import hashlib, json, math, os, random, re, subprocess, sys
from functools import lru_cache
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
try:
    import numpy as np
except Exception:
    np = None


def f(v, default=0.0):
    if v is None: return default
    m = re.match(r'\s*([-+0-9.eE]+)', str(v))
    return float(m.group(1)) if m else default


def color(value, opacity=1.0):
    s = str(value or '').strip()
    if not s or s == 'none' or s.startswith('url('): return None
    if s.startswith('#'):
        h=s[1:]
        if len(h)==3: h=''.join(c*2 for c in h)
        if len(h)>=6:
            try:
                return tuple(int(h[i:i+2],16) for i in (0,2,4))+(round(max(0,min(1,opacity))*255),)
            except ValueError: pass
    return (40,40,40,round(max(0,min(1,opacity))*255))


def family_name(raw):
    m=re.search(r"'([^']+)'",raw or '')
    if m:return m.group(1)
    return (raw or 'Nimbus Roman').split(',')[0].strip().strip('"')


@lru_cache(maxsize=128)
def font_file(family, weight, italic):
    styles=[]
    if weight>=650 and italic: styles=['Bold Italic','Bold Oblique','Bold']
    elif weight>=650: styles=['Bold','Demi Bold','Semibold']
    elif italic: styles=['Italic','Oblique','Regular']
    else: styles=['Regular','Book','Roman']
    for style in styles:
        try:
            out=subprocess.check_output(['fc-match','-f','%{file}',f'{family}:style={style}'],text=True).strip()
            if out and Path(out).exists(): return out
        except Exception: pass
    try:
        out=subprocess.check_output(['fc-match','-f','%{file}',family],text=True).strip()
        if out and Path(out).exists(): return out
    except Exception: pass
    return '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'


@lru_cache(maxsize=512)
def load_font(family, px, weight, italic):
    return ImageFont.truetype(font_file(family,weight,italic), max(1,int(round(px))))


def tracked_width(draw, txt, font, tracking):
    if not txt:return 0
    return sum(draw.textlength(ch,font=font) for ch in txt)+tracking*max(0,len(txt)-1)


def draw_tracked(draw, xy, txt, font, fill, tracking=0.0, anchor='start'):
    x,y=xy
    if abs(tracking) < 0.01:
        if anchor=='end': x-=draw.textlength(txt,font=font)
        elif anchor in ('middle','center'): x-=draw.textlength(txt,font=font)/2
        draw.text((x,y),txt,font=font,fill=fill,anchor='ls')
        return
    if anchor=='end': x-=tracked_width(draw,txt,font,tracking)
    elif anchor in ('middle','center'): x-=tracked_width(draw,txt,font,tracking)/2
    for ch in txt:
        draw.text((x,y),ch,font=font,fill=fill,anchor='ls')
        x+=draw.textlength(ch,font=font)+tracking


def rgba_layer(size): return Image.new('RGBA',size,(0,0,0,0))


def alpha_from(layer): return layer.getchannel('A')


def composite(base, layer):
    return Image.alpha_composite(base.convert('RGBA'),layer).convert('RGB')


def impact_text(layer, xy, txt, font, fill, tracking, anchor, process, seed):
    """Render an office impact-printer strike field, not eroded screen text.

    A shaped glyph is only the activation envelope. Inside it, a stable pin grid,
    longitudinal ribbon density and (for the worn profile) one weak pin row
    determine transfer. Adjacent characters therefore share defects instead of
    receiving independent random missing pixels.
    """
    draw=ImageDraw.Draw(layer,'RGBA'); x,y=xy
    width=tracked_width(draw,txt,font,tracking)
    if anchor=='end': x-=width
    elif anchor in ('middle','center'): x-=width/2
    pad=max(4,int(font.size*.18)); top=int(math.floor(y-font.size*1.15))-pad
    left=int(math.floor(x))-pad; right=int(math.ceil(x+width))+pad
    bottom=int(math.ceil(y+font.size*.38))+pad
    if right<=left or bottom<=top:return
    mask=Image.new('L',(right-left,bottom-top),0); md=ImageDraw.Draw(mask)
    draw_tracked(md,(x-left,y-top),txt,font,255,tracking,'start')
    if np is None:
        # Conservative fallback still preserves a correlated printer-grid cue.
        dots=Image.new('L',mask.size,0); dd=ImageDraw.Draw(dots)
        pitch=2 if process!='impact-9-draft' else 4
        for yy in range(0,mask.height,pitch):
            for xx in range(0,mask.width,pitch):dd.ellipse((xx,yy,xx+pitch,yy+pitch),fill=238)
        mask=ImageChops.multiply(mask,dots).filter(ImageFilter.GaussianBlur(.20))
    else:
        a=np.asarray(mask,dtype=np.float32)/255.0
        h,w=a.shape
        yy,xx=np.mgrid[0:h,0:w]
        gx=xx+left; gy=yy+top
        if process=='impact-9-draft':
            pitch_x,pitch_y=4.35,4.55; valley=.12; dot_power=7.4
        elif process=='impact-24-worn':
            pitch_x,pitch_y=2.90,3.05; valley=.32; dot_power=6.2
        else:
            pitch_x,pitch_y=2.72,2.88; valley=.42; dot_power=5.8
        fx=np.mod(gx,pitch_x)/pitch_x-.5; fy=np.mod(gy,pitch_y)/pitch_y-.5
        radial=np.sqrt(fx*fx+fy*fy)/.7071
        # Real discrete strikes survive the final page downsample. NLQ keeps a
        # small bridge between neighbouring dots; draft printing does not.
        dots=valley+(1.0-valley)*np.exp(-radial*radial*dot_power)
        phase=(seed%10007)/10007.0*math.tau
        ribbon=.925+.070*np.sin(gx/132.0+phase)+.030*np.sin(gx/41.0+phase*.37)
        row=np.floor(gy/pitch_y).astype(np.int32)
        pin_count=9 if process=='impact-9-draft' else 24
        weak=(seed>>8)%pin_count
        weak_level=.56 if process=='impact-9-draft' else (.68 if process=='impact-24-worn' else .84)
        pin=np.where((row%pin_count)==weak, weak_level, 1.0)
        if process=='impact-24-worn': ribbon-=.075*np.sin(gx/21.0+phase*.73)**8
        # A tiny bidirectional registration error is coherent by printer pass,
        # not independent per character.
        pass_band=np.floor(gy/(pitch_y*4)).astype(np.int32)
        register=np.where((pass_band&1)==0,1.0,.93 if process!='impact-9-draft' else .86)
        alpha=np.clip(a*dots*ribbon*pin*register*1.30,0,1)
        mask=Image.fromarray(np.uint8(alpha*255),'L').filter(ImageFilter.GaussianBlur(.075 if process!='impact-9-draft' else .045))
    ink=Image.new('RGBA',mask.size,(fill[0],fill[1],fill[2],0));ink.putalpha(ImageChops.multiply(mask,Image.new('L',mask.size,fill[3])))
    layer.alpha_composite(ink,(left,top))


def render(svg_path:Path,out_path:Path,width:int,height:int,material_path:Path|None=None):
    raw=svg_path.read_bytes(); seed=int.from_bytes(hashlib.sha256(raw).digest()[:8],'big')
    tree=ET.fromstring(raw); vb=[float(x) for x in (tree.get('viewBox') or '0 0 210 297').split()]
    sx=width/vb[2]; sy=height/vb[3]
    base=Image.new('RGB',(width,height),(244,243,238))
    layers={k:rgba_layer((width,height)) for k in ('generic','stationery','impact','toner','manual','handling','defects')}

    def process_layer(process):
        p=str(process or '')
        if p.startswith('impact-'): return 'impact'
        if p in ('preprinted-stationery','offset-1c'): return 'stationery'
        if p in ('laser-mono','photocopy-toner','job-toner'): return 'toner'
        if p in ('biro','manual'): return 'manual'
        if p=='handling': return 'handling'
        return 'generic'

    def walk(el,inherited='generic'):
        tag=el.tag.split('}')[-1]
        if tag=='defs': return
        process=el.get('data-process') or inherited
        if tag=='g':
            for c in el: walk(c,process)
            return
        target=layers[process_layer(process)]; draw=ImageDraw.Draw(target,'RGBA')
        if tag=='rect':
            fill=color(el.get('fill'),f(el.get('fill-opacity'),1));stroke=color(el.get('stroke'),f(el.get('stroke-opacity'),1))
            x=f(el.get('x'))*sx;y=f(el.get('y'))*sy;w=f(el.get('width'))*sx;h=f(el.get('height'))*sy
            if fill: draw.rectangle((x,y,x+w,y+h),fill=fill)
            if stroke:
                lw=max(1,round(f(el.get('stroke-width'),.2)*(sx+sy)/2));draw.rectangle((x,y,x+w,y+h),outline=stroke,width=lw)
            return
        if tag=='line':
            stroke=color(el.get('stroke'),f(el.get('stroke-opacity'),1))
            if stroke:
                lw=max(1,round(f(el.get('stroke-width'),.2)*(sx+sy)/2));draw.line((f(el.get('x1'))*sx,f(el.get('y1'))*sy,f(el.get('x2'))*sx,f(el.get('y2'))*sy),fill=stroke,width=lw)
            return
        if tag=='circle':
            fill=color(el.get('fill'),f(el.get('fill-opacity'),1));stroke=color(el.get('stroke'),f(el.get('stroke-opacity'),1))
            x=f(el.get('cx'))*sx;y=f(el.get('cy'))*sy;r=f(el.get('r'))*(sx+sy)/2
            if fill: draw.ellipse((x-r,y-r,x+r,y+r),fill=fill)
            if stroke:
                lw=max(1,round(f(el.get('stroke-width'),.2)*(sx+sy)/2));draw.ellipse((x-r,y-r,x+r,y+r),outline=stroke,width=lw)
            return
        if tag=='path':
            stroke=color(el.get('stroke'),f(el.get('stroke-opacity'),1))
            if not stroke or stroke[3]<8:return
            d=el.get('d') or '';nums=[float(x) for x in re.findall(r'[-+]?(?:\d*\.\d+|\d+)',d)]
            if len(nums)>=4:
                x0,y0=nums[0],nums[1]
                if ' q ' in f' {d} ' and len(nums)>=6:x1=x0+nums[-2];y1=y0+nums[-1]
                else:x1,y1=nums[-2],nums[-1]
                lw=max(1,round(f(el.get('stroke-width'),.35)*(sx+sy)/2));draw.line((x0*sx,y0*sy,x1*sx,y1*sy),fill=stroke,width=lw)
            return
        if tag=='text':
            txt=''.join(el.itertext())
            if not txt:return
            fill=color(el.get('fill'),f(el.get('fill-opacity'),1)) or (35,35,33,255)
            fam=family_name(el.get('font-family'));size_mm=f(el.get('font-size'),2.8);px=size_mm*sy
            weight=int(f(el.get('font-weight'),400));italic=(el.get('font-style')=='italic');font=load_font(fam,round(px),weight,italic)
            tracking=f(el.get('letter-spacing'),0)*sx;anchor=el.get('text-anchor') or 'start';xy=(f(el.get('x'))*sx,f(el.get('y'))*sy)
            if str(process).startswith('impact-'):
                impact_text(target,xy,txt,font,fill,tracking,anchor,str(process),seed)
            else: draw_tracked(draw,xy,txt,font,fill,tracking,anchor)
            return
        for c in el:walk(c,process)
    walk(tree)

    # The offset layer is crisp but not mathematically vector-perfect on stock.
    layers['stationery']=layers['stationery'].filter(ImageFilter.GaussianBlur(.13))
    # Toner is a surface deposit; a tiny optical spread distinguishes it from
    # ribbon impact and preprinted stationery without turning it into blur.
    layers['toner']=layers['toner'].filter(ImageFilter.GaussianBlur(.20))

    # Compose stock first, then production layers in causal order.
    for name in ('generic','stationery','impact','toner','manual','handling','defects'):
        base=composite(base,layers[name])

    # Sub-visible formation variation in broad blank areas.
    rng=random.Random(seed);gw=max(24,width//48);gh=max(34,height//48)
    coarse=Image.new('L',(gw,gh),128);cp=coarse.load()
    for yy in range(gh):
        for xx in range(gw):cp[xx,yy]=max(124,min(132,128+round(rng.gauss(0,1.15))))
    field=coarse.resize((width,height),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(radius=max(1.0,width/900.0)))
    base=ImageChops.add(base,Image.merge('RGB',(field,field,field)),scale=1.0,offset=-128)

    out_path.parent.mkdir(parents=True,exist_ok=True);base.save(out_path,'WEBP',quality=92,method=3)

    if material_path:
        # Packed inspect material: R roughness, G signed micro-height around 128,
        # B transmission. Fold geometry itself remains vertex-driven so this
        # map only carries print/paper micro-response.
        sw,sh=max(1,width//2),max(1,height//2)
        station=alpha_from(layers['stationery']).resize((sw,sh),Image.Resampling.LANCZOS)
        impact=alpha_from(layers['impact']).resize((sw,sh),Image.Resampling.LANCZOS)
        toner=alpha_from(layers['toner']).resize((sw,sh),Image.Resampling.LANCZOS)
        manual=alpha_from(layers['manual']).resize((sw,sh),Image.Resampling.LANCZOS)
        handling=alpha_from(layers['handling']).resize((sw,sh),Image.Resampling.LANCZOS)
        if np is not None:
            st=np.asarray(station,dtype=np.float32)/255;im=np.asarray(impact,dtype=np.float32)/255;to=np.asarray(toner,dtype=np.float32)/255;ma=np.asarray(manual,dtype=np.float32)/255;ha=np.asarray(handling,dtype=np.float32)/255
            rough=np.clip(222-st*7-im*8-to*42-ma*10-ha*9,146,230)
            # Impact marks are shallow depressions; toner sits slightly proud.
            # Handling contributes only a small micro-height because the main
            # fold/tear shape is represented by the 3-D mesh itself.
            heightv=np.clip(128-st*.5-im*14+to*4-ma*4+ha*3,108,142)
            trans=np.clip(25-st*2-im*5-to*10-ma*4+ha*7,6,38)
            packed=np.dstack([rough,heightv,trans]).astype(np.uint8)
            mat=Image.fromarray(packed,'RGB')
        else:
            mat=Image.new('RGB',(sw,sh),(222,128,25))
        material_path.parent.mkdir(parents=True,exist_ok=True);mat.save(material_path,'WEBP',lossless=True,method=4)


def jobs_batch(path:Path):
    jobs=json.loads(path.read_text());scratch_root=Path(os.environ.get('TMPDIR','/tmp'))/f'chunk-surfer-paper-{os.getpid()}';scratch_root.mkdir(parents=True,exist_ok=True)
    try:
        for i,job in enumerate(jobs):
            scratch=scratch_root/f'{i}.webp';material_scratch=scratch_root/f'{i}-material.webp' if job.get('materialOutput') else None
            render(Path(job['input']),scratch,int(job['width']),int(job['height']),material_scratch)
            output=Path(job['output']);output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(scratch.read_bytes())
            if material_scratch:
                material_output=Path(job['materialOutput']);material_output.parent.mkdir(parents=True,exist_ok=True);material_output.write_bytes(material_scratch.read_bytes())
    finally:
        import shutil;shutil.rmtree(scratch_root,ignore_errors=True)


if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--batch':jobs_batch(Path(sys.argv[2]));raise SystemExit(0)
    if len(sys.argv) not in (5,6):raise SystemExit('usage: rasterize_svg.py INPUT.svg OUTPUT.webp WIDTH HEIGHT [MATERIAL.webp] | --batch jobs.json')
    render(Path(sys.argv[1]),Path(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),Path(sys.argv[5]) if len(sys.argv)==6 else None)
