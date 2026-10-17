#!/usr/bin/env python3
"""Bake two unchanged inscriptions into ordinary P3 materials.

Requires Pillow and NumPy. Fonts are resolved by exact vendored path, never by
fontconfig. The original pack is read, never rewritten. No runtime canvas font
or separate text shader is involved in these opaque physical sign faces.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import hashlib, json, math, struct, sys

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'public/assets/lettering-study'
CASES = {
    'services': dict(mesh='scene_dock_sign_services', copy='STUDIOS / PLANT',
        width=2.62, height=.78, centerY=0., z=-.0475, cap=.245,
        size=(1024, 304), process='screen-printed vitreous enamel', seed=2186),
    'placard': dict(mesh='vigil_part_sign_save', copy='SAVE ELLERY',
        width=1.32, height=.84, centerY=1.78, z=-.248, cap=.142,
        size=(512, 326), process='brush-painted reused board', seed=3108),
}

def sha(data): return hashlib.sha256(data).hexdigest()

def png(image):
    import io
    out = io.BytesIO(); image.save(out, format='PNG', optimize=False)
    return out.getvalue()

def noise(rng, size, grid, amplitude):
    w, h = size
    small = Image.fromarray(np.uint8(rng.random((grid[1], grid[0])) * 255))
    return (np.array(small.resize((w,h), Image.Resampling.BICUBIC), dtype=float) / 255 - .5) * amplitude

BRUSH = {
    'S': (.66, [[(.61,.12),(.42,-.025),(.09,.015),(.075,.25),(.045,.47),(.54,.47),(.59,.69),(.69,.97),(.22,1.08),(.055,.87)]]),
    'A': (.72, [[(.04,.99),(.35,.025),(.68,1.)],[(.18,.65),(.54,.65)]]),
    'V': (.70, [[(.04,.02),(.34,1.),(.66,.01)]]),
    'E': (.61, [[(.09,.025),(.085,.99)],[(.095,.035),(.565,.035)],[(.10,.49),(.51,.49)],[(.09,.98),(.575,.98)]]),
    'L': (.59, [[(.08,.025),(.075,.985),(.55,.985)]]),
    'R': (.69, [[(.09,.99),(.09,.025)],[(.095,.035),(.71,-.045),(.75,.56),(.095,.52)],[(.37,.53),(.64,.99)]]),
    'Y': (.70, [[(.045,.02),(.35,.50),(.65,.015)],[(.35,.49),(.35,1.0)]]),
}

def brush_mask(case):
    """Hand-shaped letter trajectories, pressure and spacing; no distressed font.

    This is a deliberately restrained volunteer's brush sign. Each stroke is
    swept by a fixed broad nib. Slightly different pressure and baseline are
    part of the layout and are IDENTICAL in both improved comparison variants.
    """
    w,h=case['size'];ss=3;cap=case['cap']*w/case['width']
    chars=case['copy'];tracking=.075;space=.43
    total=sum(space if c==' ' else BRUSH[c][0]+tracking for c in chars)-tracking
    cap=min(cap,w*.90/(total+.14));x=(w-total*cap)/2;top=(h-cap)/2
    image=Image.new('L',(w*ss,h*ss));draw=ImageDraw.Draw(image);rng=np.random.default_rng(case['seed']+31)
    glyphs=[]
    for ci,char in enumerate(chars):
        if char==' ':glyphs.append(dict(character=char,xPx=x,advancePx=space*cap));x+=space*cap;continue
        if char not in BRUSH:raise ValueError('No authored brush trajectory for '+repr(char))
        width,paths=BRUSH[char];jitter=float(rng.uniform(-.009,.009));lean=float(rng.uniform(-.018,.018))
        for pi,path in enumerate(paths):
            if len(path)>3 and (len(path)-1)%3==0:
                points=[]
                for b in range(0,len(path)-1,3):
                    a,c,d,e=[np.array(v) for v in path[b:b+4]]
                    points.extend([(1-t)**3*a+3*(1-t)**2*t*c+3*(1-t)*t*t*d+t**3*e for t in np.linspace(0,1,40)])
            else:
                points=[]
                for a,b in zip(path,path[1:]):
                    points.extend([np.array(a)*(1-t)+np.array(b)*t for t in np.linspace(0,1,35)])
            pressure=float(rng.uniform(.95,1.035))
            for i,p in enumerate(points):
                t=i/max(1,len(points)-1);taper=.78+.22*math.sin(math.pi*min(1,t/.12))*math.sin(math.pi*min(1,(1-t)/.12)) if t<.12 or t>.88 else 1.
                # The broad nib is slightly diagonal; vertical/horizontal passes
                # consequently have distinct stroke weights without a bevel.
                px=(x+(p[0]+lean*(1-p[1]))*cap)*ss;py=(top+(p[1]+jitter)*cap)*ss
                r=cap*.082*pressure*(.97+.03*math.sin(t*math.pi*3+pi))*taper*ss
                draw.polygon([(px-r,py-r*.85),(px+r*.85,py-r*.95),(px+r,py+r*.85),(px-r*.85,py+r*.95)],fill=255)
        glyphs.append(dict(character=char,xPx=x,advancePx=(width+tracking)*cap));x+=(width+tracking)*cap
    image=image.resize((w,h),Image.Resampling.LANCZOS)
    arr=np.array(image,dtype=float)/255;ys,xs=np.where(arr>.5)
    def runs(line):
        starts=np.where(np.diff(np.r_[False,line,False].astype(int))==1)[0]
        ends=np.where(np.diff(np.r_[False,line,False].astype(int))==-1)[0]
        return (ends-starts).tolist()
    e=next(g for g in glyphs if g['character']=='E');l=next(g for g in glyphs if g['character']=='L')
    # Sample the middle of a real vertical L stroke and the interior of an E's
    # three horizontal strokes. End tapers and anti-alias fringe are excluded.
    vertical=[v for v in runs(arr[round(top+cap*.55)]>.5) if v>2]
    horizontal=[v for v in runs(arr[:,round(e['xPx']+cap*.35)]>.5) if v>2]
    stroke=min(vertical+horizontal)
    return arr,dict(font='authored brush trajectories',fontSha256=None,fontSizePx=None,capHeightPx=float(ys.max()-ys.min()+1),
        capHeightM=float(ys.max()-ys.min()+1)*case['width']/w,stemWidthPx=stroke,stemWidthM=stroke*case['width']/w,
        boundsPx=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],glyphs=glyphs,trackingPx=tracking*cap,
        construction='broad-nib sweeps of independent S A V E L R Y trajectories; identical layout in both variants')

def label_mask(case):
    if case['process']=='brush-painted reused board':return brush_mask(case)
    w,h = case['size']; pxm=w/case['width']
    fontfile=Path(__file__).resolve().parent/'fonts/NimbusSansNarrow-Bold.otf'
    registry=json.loads((fontfile.parent/'manifest.json').read_text())
    if sha(fontfile.read_bytes())!=registry['sha256']:raise ValueError('Study font differs from its licensed provenance manifest')
    size=round(case['cap']*pxm/.73)
    while True:
        font=ImageFont.truetype(str(fontfile), size)
        cap=font.getbbox('H', anchor='ls'); cap_px=-cap[1]
        tracking=.010*cap_px
        advances=[font.getlength(char)+tracking for char in case['copy']]
        width=sum(advances)-tracking
        if width <= w*.94: break
        size-=1
    # Enforce actual glyph coverage, not merely a measured fallback box.
    missing=np.array(font.getmask('\uffff'))
    for char in set(case['copy'])-{' '}:
        glyph=np.array(font.getmask(char))
        if glyph.size==0 or (glyph.shape==missing.shape and np.array_equal(glyph,missing)):
            raise ValueError('Font does not cover '+repr(char))
    mask=Image.new('L',(w,h)); draw=ImageDraw.Draw(mask)
    x=(w-width)/2; baseline=h/2+cap_px/2
    glyphs=[]
    for char,advance in zip(case['copy'],advances):
        x0=x
        draw.text((x,baseline),char,font=font,fill=255,anchor='ls')
        glyphs.append(dict(character=char, xPx=x0, advancePx=advance))
        x+=advance
    arr=np.array(mask,dtype=float)/255
    ys,xs=np.where(arr>.5)
    bounds=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
    # A central I stem gives an actual rasterised thickness instead of a
    # guessed percentage of cap height. I has no mid-height horizontal bar.
    stem=Image.new('L',(size*2,size*2)); ImageDraw.Draw(stem).text((size*.2,size*1.2),'I',font=font,fill=255,anchor='ls')
    row=np.array(stem)[round(size*1.2-cap_px*.55)]>127
    runs=[]; start=None
    for i,lit in enumerate(list(row)+[False]):
        if lit and start is None:start=i
        if not lit and start is not None:runs.append(i-start);start=None
    stroke=min(runs) if runs else 0
    return arr,dict(font=fontfile.name,fontSha256=sha(fontfile.read_bytes()),fontSizePx=size,
        capHeightPx=cap_px,capHeightM=cap_px/pxm,stemWidthPx=stroke,stemWidthM=stroke/pxm,
        boundsPx=bounds,glyphs=glyphs,trackingPx=tracking)

def texture_set(cid,case,fabricated):
    w,h=case['size']; rng=np.random.default_rng(case['seed'])
    lettering,metrics=label_mask(case)
    yy,xx=np.mgrid[0:h,0:w]; edge=np.minimum.reduce([xx,w-1-xx,yy,h-1-yy])
    if cid=='services':
        substrate=np.array([37,49,43.]); ink=np.array([221,218,192.]); base_rough=.36; ink_rough=.45
    else:
        substrate=np.array([190,183,161.]); ink=np.array([24,26,24.]);base_rough=.86; ink_rough=.79
    if not fabricated:
        # Exact baseline PBR constants, encoded to sRGB for the production
        # base-color texture loader. Only typography changes in this control.
        def srgb(linear):return np.array([12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055 for v in linear])*255
        if cid=='services':
            substrate=srgb([.16,.095,.052]);ink=srgb([.69,.72,.66]);base_rough=.72;ink_rough=.68
        else:
            substrate=srgb([.69,.72,.66]);ink=srgb([.025,.028,.03]);base_rough=.68;ink_rough=.28
    color=np.broadcast_to(substrate,(h,w,3)).copy()
    rough=np.full((h,w),base_rough);height=np.zeros((h,w));wear=np.zeros((h,w))
    if fabricated:
        broad=noise(rng,(w,h),(12,7),1); fine=noise(rng,(w,h),(w//3,h//3),1)
        # Manufacture leaves restrained texture; age starts at unsupported edges
        # and fixings. Required lettering is not randomly erased for atmosphere.
        color+=broad[...,None]*(5 if cid=='services' else 11)+fine[...,None]*2.5
        rough+=broad*.04+fine*.025
        if cid=='services':
            height+=noise(rng,(w,h),(30,12),.00012)
            chips=(edge<rng.uniform(2,8))&(noise(rng,(w,h),(120,40),1)>.18)
            wear=np.where(chips,1.,0.)
            color[wear>.5]=[89,77,56]
            rough[wear>.5]=.88; height[wear>.5]-=.0003
            # A short corrosion trace beneath each retained-frame fixing zone.
            for cx in [w*.035,w*.965]:
                trail=np.exp(-((xx-cx)/(w*.006))**2)*np.clip((yy-h*.68)/(h*.24),0,1)*.19
                color=color*(1-trail[...,None])+np.array([100,78,45])*trail[...,None]
        else:
            fibres=noise(rng,(w,h),(w//2,11),1)
            color+=fibres[...,None]*4
            height+=noise(rng,(w,h),(w//3,30),.00010)
            rough+=fibres*.025
            # A reused board's handling is concentrated along the lower corners.
            rub=(np.exp(-((xx-w*.07)/(w*.07))**2)+np.exp(-((xx-w*.93)/(w*.06))**2))*np.exp(-((yy-h*.90)/(h*.10))**2)
            color-=rub[...,None]*12;rough-=rub*.045
            score=(np.sin(yy*.63+xx*.004)> .996)&(edge<16)
            wear=np.where(score,1.,0.);color[score]-=18
    color=color*(1-lettering[...,None])+ink*lettering[...,None]
    if fabricated and cid=='placard':
        # Pigment follows the vertical brush drag. It never deletes counters or
        # substitutes glyphs; the recorded coverage mask remains the same.
        drag=noise(rng,(w,h),(w//2,9),.11)
        color+=drag[...,None]*lettering[...,None]*12
    rough=rough*(1-lettering)+ink_rough*lettering
    # Ink is microns of pigment; this is not a bevel/embossed type trick.
    if fabricated:height+=lettering*(.000012 if cid=='services' else .000005)
    dx=case['width']/w;dy=case['height']/h
    # Image +Y runs downward; tangent +V follows that same authored glTF UV.
    gx=np.gradient(height,axis=1)/dx;gy=np.gradient(height,axis=0)/dy
    normal=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1)[...,None]
    normal=np.uint8(np.clip(normal*.5+.5,0,1)*255)
    metal=np.zeros_like(rough) if fabricated else (.03*lettering if cid=='services' else .03*(1-lettering)+.15*lettering)
    orm=np.stack([np.ones_like(rough),np.clip(rough,.08,1),metal],axis=-1)
    albedo=Image.fromarray(np.uint8(np.clip(color,0,255)),mode='RGB')
    normal=Image.fromarray(normal,mode='RGB').resize((w//4,h//4),Image.Resampling.LANCZOS)
    orm=Image.fromarray(np.uint8(orm*255),mode='RGB').resize((w//2,h//2),Image.Resampling.LANCZOS)
    result=dict(albedo=png(albedo),orm=png(orm))
    if fabricated:result['normal']=png(normal)
    result['mask']=png(Image.fromarray(np.uint8(lettering*255),mode='L'))
    metrics.update(inkCoverage=float(np.mean(lettering>.5)),surfaceWearCoverage=float(np.mean(wear>.5)),
        textureSize=[w,h],maxPigmentHeightM=(.000012 if cid=='services' else .000005) if fabricated else 0,
        textureSizes={'albedo':[w,h],'orm':[w//2,h//2],**({'normal':[w//4,h//4]} if fabricated else {})})
    return result,metrics

class Writer:
    def __init__(self):
        self.json=dict(asset=dict(version='2.0',generator='Chunk Surfer isolated physical lettering study'),scene=0,
            scenes=[dict(nodes=[])],nodes=[],meshes=[],materials=[],accessors=[],bufferViews=[],buffers=[],
            images=[],textures=[],samplers=[dict(magFilter=9729,minFilter=9987,wrapS=33071,wrapT=33071)])
        self.bin=bytearray()
    def binary(self,blob,target=None):
        self.bin+=b'\0'*((-len(self.bin))%4);view=dict(buffer=0,byteOffset=len(self.bin),byteLength=len(blob))
        if target:view['target']=target
        i=len(self.json['bufferViews']);self.json['bufferViews'].append(view);self.bin+=blob;return i
    def accessor(self,values,kind,component=5126,target=None):
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[component];array=np.asarray(values,dtype=dtype)
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind];a=dict(bufferView=self.binary(array.tobytes(),target),componentType=component,count=array.size//width,type=kind)
        if kind=='VEC3':a.update(min=array.reshape(-1,3).min(axis=0).tolist(),max=array.reshape(-1,3).max(axis=0).tolist())
        i=len(self.json['accessors']);self.json['accessors'].append(a);return i
    def image(self,blob,name):
        i=len(self.json['images']);self.json['images'].append(dict(name=name,mimeType='image/png',bufferView=self.binary(blob)))
        tex=len(self.json['textures']);self.json['textures'].append(dict(sampler=0,source=i));return tex
    def material(self,material):
        i=len(self.json['materials']);self.json['materials'].append(material);return i
    def mesh(self,name,primitives,extras):
        i=len(self.json['meshes']);self.json['meshes'].append(dict(name=name,primitives=primitives,extras=extras))
        self.json['scenes'][0]['nodes'].append(len(self.json['nodes']));self.json['nodes'].append(dict(name=name,mesh=i))
    def save(self,file):
        self.bin+=b'\0'*((-len(self.bin))%4);self.json['buffers']=[dict(byteLength=len(self.bin))]
        data=json.dumps(self.json,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
        blob=struct.pack('<III',0x46546c67,2,12+8+len(data)+8+len(self.bin))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(self.bin),0x004e4942)+self.bin
        file.write_bytes(blob);return blob

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    baseline=(ROOT/'public/assets/conservatory-props.glb').read_bytes();jsonlen=struct.unpack_from('<I',baseline,12)[0]
    source=json.loads(baseline[20:20+jsonlen]);sourcebin=baseline[28+jsonlen:]
    writer=Writer();materialMap={};accessorMap={}
    def readacc(i):
        acc=source['accessors'][i];view=source['bufferViews'][acc['bufferView']];kind=acc['type'];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind]
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[acc['componentType']];offset=view.get('byteOffset',0)+acc.get('byteOffset',0)
        # Current pack has tightly packed arrays; reject drift rather than clone incorrectly.
        itemsize=np.dtype(dtype).itemsize
        if view.get('byteStride',width*itemsize)!=width*itemsize:raise ValueError('Interleaved baseline needs explicit clone support')
        return np.frombuffer(sourcebin,dtype=dtype,count=acc['count']*width,offset=offset)
    def copyacc(i):
        if i not in accessorMap:
            acc=source['accessors'][i];view=source['bufferViews'][acc['bufferView']]
            accessorMap[i]=writer.accessor(readacc(i),acc['type'],acc['componentType'],view.get('target'))
        return accessorMap[i]
    def copymat(i):
        if i not in materialMap:
            mat=source['materials'][i]
            if any('Texture' in key for key in mat.get('pbrMetallicRoughness',{})):raise ValueError('Baseline sign material unexpectedly textured')
            materialMap[i]=writer.material(mat)
        return materialMap[i]
    report=dict(version=1,sourcePackSha256=sha(baseline),generatorSha256=sha(Path(__file__).read_bytes()),sourceModuleSha256=sha((ROOT/'src/render/lettering-study.js').read_bytes()),
        fontsLicense='tools/chunk_surfer/lettering-study/fonts/LICENSE; AGPL-3.0 with the stated PostScript/PDF exception',cases={}, limitations=[
        'Pixel sampling criteria are planning thresholds, not unbriefed human reading results.',
        'Nimbus Sans is a deterministic institutional prototype stock; the placard uses authored brush sweeps. Historical authenticity requires the selected owner/process reference.',
        'No production placement or content is replaced. Only two representative cases are prototyped.'])
    for cid,case in CASES.items():
        original=next(m for m in source['meshes'] if m['name']==case['mesh'])
        sourceprims=[];withoutInk=[];inkTriangles=0
        for p in original['primitives']:
            cloned=dict(attributes={k:copyacc(v) for k,v in p['attributes'].items()},indices=copyacc(p['indices']),material=copymat(p.get('material',0)))
            sourceprims.append(cloned);pos=readacc(p['attributes']['POSITION']).reshape(-1,3)
            isInk=len(pos)>40 and len(pos)%4==0 and np.max(abs(pos[:,2]-pos[0,2]))<1e-5
            if isInk:inkTriangles+=len(readacc(p['indices']))//3
            else:withoutInk.append(cloned)
        if inkTriangles==0:raise ValueError('Cannot identify original raster ink '+cid)
        common=dict(studyCase=cid,sourceMesh=case['mesh'],copy=case['copy'],noProductionOverride=True)
        writer.mesh('lettering_study_'+cid+'_baseline',sourceprims,{**common,'variant':'baseline'})
        variants={}
        for variant,fabricated in [('type-flat',False),('fabricated',True)]:
            textures,metrics=texture_set(cid,case,fabricated)
            for role,blob in textures.items():(OUT/(cid+'-'+variant+'-'+role+'.png')).write_bytes(blob)
            indices={role:writer.image(textures[role],cid+' '+variant+' '+role) for role in ['albedo','normal','orm'] if role in textures}
            mat=writer.material(dict(name=cid+' '+variant+' physical print',pbrMetallicRoughness=dict(baseColorFactor=[1,1,1,1],metallicFactor=1,roughnessFactor=1,baseColorTexture=dict(index=indices['albedo']),metallicRoughnessTexture=dict(index=indices['orm'])),
                **(dict(normalTexture=dict(index=indices['normal'],scale=1)) if 'normal' in indices else {}),alphaMode='OPAQUE',extras=dict(letteringProcess=case['process'],inkHeightM=metrics['maxPigmentHeightM'] if fabricated else 0,textIsMaterial=True)))
            w=case['width']/2;h=case['height']/2;y=case['centerY'];z=case['z']
            # Front is -Z. The reader's right is local -X. UV origin is the
            # image's upper-left, so both the word order and letterforms survive.
            pos=[w,y+h,z,-w,y+h,z,-w,y-h,z,w,y-h,z]
            p=dict(attributes=dict(POSITION=writer.accessor(pos,'VEC3',target=34962),NORMAL=writer.accessor([0,0,-1]*4,'VEC3',target=34962),TEXCOORD_0=writer.accessor([0,0,1,0,1,1,0,1],'VEC2',target=34962)),indices=writer.accessor([0,2,1,0,3,2],'SCALAR',5123,34963),material=mat)
            writer.mesh('lettering_study_'+cid+'_'+variant.replace('-','_'),withoutInk+[p],{**common,'variant':variant,'metrics':metrics})
            gpu=sum(width*height*4 for width,height in metrics['textureSizes'].values())
            variants[variant]=dict(**metrics,triangleDelta=2-inkTriangles,faceTriangles=2,drawCallDelta=0,textureBytes=sum(len(textures[role]) for role in ['albedo','normal','orm'] if role in textures),baseLevelGpuBytes=gpu,mipGpuBytes=round(gpu*4/3))
        report['cases'][cid]=dict(copy=case['copy'],baselineInkTriangles=inkTriangles,boardDimensionsM=[case['width'],case['height']],variants=variants)
    blob=writer.save(OUT/'signs.glb');report.update(glbBytes=len(blob),glbSha256=sha(blob),totalMeshes=len(writer.json['meshes']),totalTextures=len(writer.json['textures']))
    (OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(bytes=len(blob),sha256=sha(blob),cases={cid:dict(inkTriangles=c['baselineInkTriangles'],variants={k:dict(capHeightM=v['capHeightM'],stemWidthM=v['stemWidthM'],textureBytes=v['textureBytes']) for k,v in c['variants'].items()}) for cid,c in report['cases'].items()})))

if __name__=='__main__':main()
