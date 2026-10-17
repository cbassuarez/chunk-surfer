#!/usr/bin/env python3
"""Physical opaque printing: pinned outlines, hand sweeps and process atlases.

RGBA alpha carries pigment coverage. RGB is never premultiplied by that alpha:
bare substrate must keep its color at A=0. All resizing happens independently
on RGB process maps and the grayscale coverage before final RGBA assembly.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import numpy as np
import hashlib,json,math,sys
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
def srgb(v):return 12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055
def rgb(values):return np.array([srgb(max(0,min(1,float(v))))*255 for v in values],dtype=float)
def seeded(value):return int.from_bytes(hashlib.sha256(str(value).encode()).digest()[:8],'little')
def noise(rng,size,grid,amplitude=1):
 w,h=size;small=Image.fromarray(np.uint8(rng.random((max(2,grid[1]),max(2,grid[0])))*255))
 return (np.asarray(small.resize((w,h),Image.Resampling.BICUBIC),dtype=float)/255-.5)*amplitude

# Broad-nib centreline alphabets, not a distressed font. Cubic strokes have
# 1+3n controls; two/three-point strokes are deliberately hand-drawn polylines.
BRUSH={
 'A':(.72,[[(.04,.99),(.35,.025),(.68,1.)],[(.18,.65),(.54,.65)]]),
 'B':(.68,[[(.09,.99),(.09,.025)],[(.10,.035),(.72,-.02),(.76,.50),(.10,.49)],[(.10,.49),(.81,.43),(.78,1.05),(.10,.98)]]),
 'C':(.70,[[(.64,.11),(.20,-.20),(-.09,.25),(.08,.74),(.20,1.15),(.54,1.02),(.66,.88)]]),
 'D':(.74,[[(.09,.99),(.09,.025)],[(.10,.035),(.98,-.10),(.96,1.11),(.10,.98)]]),
 'E':(.61,[[(.09,.025),(.085,.99)],[(.095,.035),(.565,.035)],[(.10,.49),(.51,.49)],[(.09,.98),(.575,.98)]]),
 'F':(.61,[[(.09,.99),(.09,.025),(.57,.035)],[(.10,.49),(.51,.49)]]),
 'G':(.74,[[(.66,.12),(.22,-.18),(-.08,.25),(.08,.74),(.22,1.15),(.65,1.04),(.66,.59)],[(.44,.59),(.68,.59)]]),
 'H':(.73,[[(.09,.02),(.085,.99)],[(.64,.025),(.64,.99)],[(.09,.49),(.64,.49)]]),
 'I':(.30,[[(.15,.025),(.15,.99)]]),
 'J':(.59,[[(.51,.025),(.52,.78),(.48,1.11),(.12,1.02),(.04,.90),(.055,.77),(.06,.75)]]),
 'K':(.71,[[(.09,.025),(.09,.99)],[(.64,.025),(.10,.55),(.66,.99)]]),
 'L':(.59,[[(.08,.025),(.075,.985),(.55,.985)]]),
 'M':(.88,[[(.08,.99),(.08,.025),(.44,.59)],[(.44,.59),(.79,.025),(.79,.99)]]),
 'N':(.76,[[(.09,.99),(.09,.025),(.67,.99)],[(.67,.99),(.67,.025)]]),
 'O':(.74,[[(.37,.02),(-.06,.01),(-.06,.99),(.37,.99),(.83,.99),(.83,.01),(.37,.02)]]),
 'P':(.68,[[(.09,.99),(.09,.025)],[(.10,.035),(.82,-.02),(.83,.57),(.10,.54)]]),
 'Q':(.76,[[(.37,.02),(-.06,.01),(-.06,.99),(.37,.99),(.83,.99),(.83,.01),(.37,.02)],[(.43,.76),(.75,1.08)]]),
 'R':(.69,[[(.09,.99),(.09,.025)],[(.095,.035),(.71,-.045),(.75,.56),(.095,.52)],[(.37,.53),(.64,.99)]]),
 'S':(.66,[[(.61,.12),(.42,-.025),(.09,.015),(.075,.25),(.045,.47),(.54,.47),(.59,.69),(.69,.97),(.22,1.08),(.055,.87)]]),
 'T':(.68,[[(.03,.035),(.65,.035)],[(.34,.04),(.34,.99)]]),
 'U':(.73,[[(.085,.025),(.08,.76),(.08,1.08),(.38,1.02),(.66,1.03),(.65,.74),(.65,.025)]]),
 'V':(.70,[[(.04,.02),(.34,1.),(.66,.01)]]),
 'W':(.99,[[(.04,.025),(.26,.99),(.50,.32)],[(.50,.32),(.73,.99),(.95,.025)]]),
 'X':(.70,[[(.055,.025),(.65,.99)],[(.64,.025),(.05,.99)]]),
 'Y':(.70,[[(.045,.02),(.35,.50),(.65,.015)],[(.35,.49),(.35,1.0)]]),
 'Z':(.68,[[(.045,.035),(.63,.035),(.055,.985),(.65,.985)]]),
 '0':(.66,[[(.33,.02),(-.04,.01),(-.04,.99),(.33,.99),(.73,.99),(.73,.01),(.33,.02)]]),
 '1':(.43,[[(.08,.22),(.25,.025),(.25,.99)],[(.08,.99),(.41,.99)]]),
 '2':(.64,[[(.06,.18),(.13,-.10),(.63,-.02),(.58,.25),(.55,.43),(.10,.74),(.06,.98)],[(.06,.98),(.60,.98)]]),
 '3':(.63,[[(.07,.06),(.62,-.09),(.81,.47),(.23,.48),(.85,.41),(.75,1.12),(.06,.92)]]),
 '4':(.68,[[(.48,.025),(.06,.66),(.64,.66)],[(.49,.035),(.49,.99)]]),
 '5':(.63,[[(.59,.035),(.11,.035),(.09,.48)],[(.09,.48),(.83,.22),(.78,1.14),(.06,.94)]]),
 '6':(.65,[[(.55,.05),(.18,-.08),(-.05,.73),(.12,.90),(.40,1.18),(.78,.93),(.57,.61),(.36,.35),(.04,.61),(.09,.75)]]),
 '7':(.63,[[(.04,.035),(.60,.035),(.20,.99)]]),
 '8':(.65,[[(.33,.02),(-.04,.02),(-.01,.51),(.33,.49),(.75,.48),(.72,1.02),(.33,1.0),(-.07,1.0),(-.04,.51),(.33,.49),(.70,.49),(.69,.02),(.33,.02)]]),
 '9':(.65,[[(.12,.95),(.47,1.08),(.70,.27),(.53,.10),(.25,-.18),(-.13,.07),(.08,.39),(.29,.65),(.61,.39),(.56,.25)]]),
 ':':(.30,[[(.15,.31),(.15,.31)],[(.15,.77),(.15,.77)]]),
 '.':(.28,[[(.14,.96),(.14,.96)]]),
 '?':(.60,[[(.05,.17),(.17,-.12),(.69,-.02),(.53,.30),(.41,.48),(.28,.46),(.28,.64)],[(.28,.96),(.28,.96)]]),
 '/':(.48,[[(.03,1.),(.46,.025)]]),
 '-':(.50,[[(.05,.51),(.45,.51)]]),
 "'":(.25,[[(.19,.025),(.11,.22)]]),
}

def font_for(job):
 category=job.get('category','institution')
 name=job.get('font') or ('NimbusMonoPS-Bold.otf' if category=='maintenance' else 'NimbusRoman-Regular.otf' if category=='record' else 'NimbusSansNarrow-Bold.otf')
 if name=='NimbusSansNarrow-Bold.otf':
  file=HERE/'fonts'/name;registry=json.loads((HERE/'fonts/manifest.json').read_text());expected=registry['sha256']
 else:
  file=ROOT/'assets/fonts'/name;registry=json.loads((ROOT/'assets/fonts/manifest.json').read_text());expected=next(face['sha256'] for family in registry['families'].values() for face in family['faces'].values() if face['file']==name)
 if not file.is_file() or sha(file.read_bytes())!=expected:raise ValueError('Pinned lettering font mismatch '+name)
 return file,expected

def sampled_path(path):
 if len(path)>3 and (len(path)-1)%3==0:
  out=[]
  for n in range(0,len(path)-1,3):
   a,b,c,d=[np.asarray(v,dtype=float) for v in path[n:n+4]]
   out.extend([(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in np.linspace(0,1,45)])
  return out
 return [np.asarray(a)*(1-t)+np.asarray(b)*t for a,b in zip(path,path[1:]) for t in np.linspace(0,1,35)]

def brush_line(text,cap,seed):
 for ch in text:
  if ch!=' ' and ch not in BRUSH:raise ValueError('No authored brush trajectory for '+repr(ch))
 tracking=.075;space=.43;advance=[space if c==' ' else BRUSH[c][0]+tracking for c in text]
 width=(sum(advance)-tracking)*cap;ss=3;pad=math.ceil(cap*.18)
 mask=Image.new('L',(max(1,math.ceil(width)+pad*2)*ss,math.ceil(cap*1.35+pad*2)*ss));draw=ImageDraw.Draw(mask);rng=np.random.default_rng(seed);x=pad
 for ci,(char,adv) in enumerate(zip(text,advance)):
  if char==' ':x+=adv*cap;continue
  lean=float(rng.uniform(-.018,.018));dy=float(rng.uniform(-.009,.009))
  for pi,path in enumerate(BRUSH[char][1]):
   points=sampled_path(path);pressure=float(rng.uniform(.95,1.035))
   for i,p in enumerate(points):
    t=i/max(1,len(points)-1);taper=.80+.20*min(1,t/.10,(1-t)/.10)
    px=(x+(p[0]+lean*(1-p[1]))*cap)*ss;py=(pad+(p[1]+dy)*cap)*ss
    r=cap*.082*pressure*(.97+.03*math.sin(t*math.pi*3+pi))*taper*ss
    draw.polygon([(px-r,py-r*.85),(px+r*.85,py-r*.95),(px+r,py+r*.85),(px-r*.85,py+r*.95)],fill=255)
  x+=adv*cap
 mask=mask.resize((mask.width//ss,mask.height//ss),Image.Resampling.LANCZOS)
 return mask,advance

def coverage(job,w,h):
 lines=job.get('lines') or str(job.get('copy','')).split('\n');text='\n'.join(lines)
 if not any(lines) and not job.get('marks'):raise ValueError('Empty authored lettering '+job['id'])
 for key in ['lineScale','lineCentres']:
  if job.get(key) is not None and len(job[key])!=len(lines):raise ValueError(key+' length does not match authored lines on '+job['id'])
 category=job.get('category','institution');pad=max(3,round(min(w,h)*.055));out=Image.new('L',(w,h));draw=ImageDraw.Draw(out)
 desired=job.get('capHeightM') or min(job['heightM']/(len(lines)*1.65),job['widthM']/max(1,max(map(len,lines))*.66))
 desiredPx=max(8,desired*w/job['widthM']);glyphs=[]
 if not any(lines):
  cap=desiredPx;stemPx=max(1,job.get('marks',[{}])[0].get('width',.015)*w)
  fontName='authored nonliteral pen trajectories';fontSha=None
 elif category=='personal':
  cap=min(desiredPx,(h-pad*2)/(len(lines)*1.35))
  for line in lines:
   width=(sum(.43 if c==' ' else BRUSH.get(c,(0,))[0]+.075 for c in line)-.075)*cap
   cap=min(cap,(w-pad*2)*cap/max(1,width+cap*.36))
  centres=job.get('lineCentres') or [(i+.5)/len(lines) for i in range(len(lines))]
  for li,(line,centre) in enumerate(zip(lines,centres)):
   lineMask,adv=brush_line(line,cap,seeded(str(job.get('seed',job['id']))+':'+str(li)))
   box=lineMask.getbbox();lineMask=lineMask.crop(box);x=(w-lineMask.width)//2;y=round(centre*h-lineMask.height/2)
   out.paste(Image.fromarray(np.maximum(np.asarray(out.crop((x,y,x+lineMask.width,y+lineMask.height))),np.asarray(lineMask))), (x,y))
   glyphs.extend([dict(character=c,line=li) for c in line if c!=' '])
  fontName='authored broad-nib trajectories';fontSha=None;stemPx=cap*.14
 else:
  file,fontSha=font_for(job);fontName=file.name;size=max(8,round(desiredPx/.72))
  widthScale=float(job.get('typeWidthScale',1));stroke=max(0,round(float(job.get('opticalWeightM',0))*w/job['widthM']/widthScale))
  if not .5<=widthScale<=1:raise ValueError('Invalid optical width on '+job['id'])
  workWidth=round(w/widthScale);actualWidthScale=w/workWidth
  if widthScale!=1:out=Image.new('L',(workWidth,h));draw=ImageDraw.Draw(out)
  while True:
   font=ImageFont.truetype(str(file),size);cap=-font.getbbox('H',anchor='ls')[1];tracking=cap*(.012 if category!='record' else 0)
   lineFonts=[ImageFont.truetype(str(file),max(5,round(size*scale))) for scale in job.get('lineScale',[1]*len(lines))]
   widths=[lf.getlength(line)+tracking*(len(line)-1) if job.get('kerned') else sum(lf.getlength(c)+tracking for c in line)-tracking for line,lf in zip(lines,lineFonts)]
   if (max(widths)+stroke*2)*actualWidthScale<=w-pad*2 and (cap+stroke*2)*len(lines)*1.4<=h-pad*2:break
   size-=1
   if size<5:raise ValueError('Physical lettering cannot fit '+job['id'])
  notdef=np.asarray(font.getmask('\uffff'))
  for c in set(text)-{'\n',' '}:
   glyph=np.asarray(font.getmask(c))
   if glyph.size==0 or glyph.shape==notdef.shape and np.array_equal(glyph,notdef):raise ValueError('Font lacks '+repr(c)+' on '+job['id'])
  centres=job.get('lineCentres') or [(i+.5)/len(lines) for i in range(len(lines))]
  lineMetrics=[]
  for li,(line,width,centre,lf) in enumerate(zip(lines,widths,centres,lineFonts)):
   lineCap=-lf.getbbox('H',anchor='ls')[1];start=(workWidth-width)/2;x=start;baseline=centre*h+lineCap/2
   for ci,c in enumerate(line):
    if job.get('kerned'):x=start+lf.getlength(line[:ci+1])-lf.getlength(c)+tracking*ci
    draw.text((x,baseline),c,font=lf,fill=255,anchor='ls',stroke_width=stroke,stroke_fill=255)
    if category=='maintenance' and c in 'ABDOPQR0689':
     # Real stencil islands retain a narrow unpainted bridge at the crown.
     gw=lf.getlength(c);bridge=max(1,round(lineCap*.040));draw.rectangle((x+gw*.49-bridge/2,baseline-lineCap-1,x+gw*.49+bridge/2,baseline-lineCap*.56),fill=0)
    if c!=' ':
     glyph=dict(character=c,line=li,xPx=x*actualWidthScale,advancePx=(lf.getlength(c)+tracking)*actualWidthScale)
     if widthScale!=1 or stroke:
      box=lf.getbbox(c,anchor='ls',stroke_width=stroke)
      glyph.update(baselinePx=baseline,boundsPx=[(x+box[0])*actualWidthScale,baseline+box[1],(x+box[2])*actualWidthScale,baseline+box[3]])
     glyphs.append(glyph)
    x+=lf.getlength(c)+tracking
   if widthScale!=1 or stroke:
    probe=Image.new('L',(size*2,size*2));ImageDraw.Draw(probe).text((size*.2,size*1.2),'I',font=lf,fill=255,anchor='ls',stroke_width=stroke,stroke_fill=255);row=np.asarray(probe)[round(size*1.2-lineCap*.55)]>127
    changes=np.diff(np.r_[False,row,False].astype(int));runs=np.where(changes==-1)[0]-np.where(changes==1)[0]
    lineMetrics.append(dict(line=li,fontSize=lf.size,capHeightM=(lineCap+stroke*2)*job['widthM']/w,stemWidthM=(float(min(runs)) if len(runs) else lineCap*.12)*actualWidthScale*job['widthM']/w,typeWidthScale=actualWidthScale,opticalStrokePx=stroke))
  if widthScale!=1:out=out.resize((w,h),Image.Resampling.LANCZOS);draw=ImageDraw.Draw(out)
  probe=Image.new('L',(size*2,size*2));ImageDraw.Draw(probe).text((size*.2,size*1.2),'I',font=font,fill=255,anchor='ls',stroke_width=stroke,stroke_fill=255);row=np.asarray(probe)[round(size*1.2-cap*.55)]>127
  changes=np.diff(np.r_[False,row,False].astype(int));runs=np.where(changes==-1)[0]-np.where(changes==1)[0];stemPx=float(min(runs)) if len(runs) else cap*.12
  stemPx*=actualWidthScale;cap+=stroke*2
 if job.get('marks'):
  for mark in job['marks']:
   pts=[(p[0]*w,p[1]*h) for p in mark['points']];draw.line(pts,fill=255,width=max(1,round(mark.get('width',.015)*w)),joint='curve')
 arr=np.asarray(out,dtype=float)/255
 if not np.any(arr>.5):raise ValueError('No pigment coverage on '+job['id'])
 ys,xs=np.where(arr>.5)
 metrics=dict(font=fontName,fontSha256=fontSha,capHeightM=float(cap)*job['widthM']/w,stemWidthM=float(stemPx)*job['widthM']/w,
  coverage=float(np.mean(arr>.5)),boundsPx=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],glyphs=glyphs,
  strokeMeasurement='Pinned I straight stem; brush uses a conservative broad-nib design reference, not a claim about every taper.')
 if category!='personal' and any(lines) and lineMetrics:metrics['lineMetrics']=lineMetrics
 return out,metrics

def tile(job):
 lines=job.get('lines') or str(job.get('copy','')).split('\n');category=job.get('category','institution')
 maxWidth=480 if category=='personal' and job['widthM']<2 else 512 if category=='record' else 960 if job['widthM']>3 else 768
 desired=job.get('capHeightM') or min(job['heightM']/(len(lines)*1.65),job['widthM']/max(1,max(map(len,lines))*.66))
 # Brush edges are the hero close view; factory lettering keeps at least 48
 # texels per requested cap, already above its acquisition sampling target.
 capTexels=job.get('texelCapPx',64 if category=='personal' else 32 if category=='record' else 48)
 ppm=min(maxWidth/job['widthM'],capTexels/max(.001,desired));w=max(40,round(job['widthM']*ppm));h=max(32,round(job['heightM']*ppm));h=min(960,h)
 w=int(job.get('rasterWidthPx',w));h=int(job.get('rasterHeightPx',h))
 if job.get('glyphLayout'):
  layout=job['glyphLayout'];gw=round(layout['widthM']*w/job['widthM']);gh=round(layout['heightM']*h/job['heightM'])
  inner,metrics=coverage({**job,**layout,'glyphLayout':None},gw,gh);mask=Image.new('L',(w,h));ox=(w-gw)//2;oy=(h-gh)//2;mask.paste(inner,(ox,oy))
  actualScale=(job['widthM']/w)/(layout['widthM']/gw)
  metrics['capHeightM']*=actualScale;metrics['stemWidthM']*=actualScale
  metrics['boundsPx']=[metrics['boundsPx'][0]+ox,metrics['boundsPx'][1]+oy,metrics['boundsPx'][2]+ox,metrics['boundsPx'][3]+oy]
  for g in metrics['glyphs']:
   if 'xPx' in g:g['xPx']+=ox
  metrics['glyphLayoutM']=layout
 else:mask,metrics=coverage(job,w,h)
 a=np.asarray(mask,dtype=float)/255;metrics['coverage']=float(np.mean(a>.5));rng=np.random.default_rng(seeded(job.get('seed',job['id'])))
 ground=rgb(job['palette']['ground']);ink=rgb(job['palette']['ink']);process=job.get('process') or {'institution':'vitreous-enamel screen print','maintenance':'bridged maintenance stencil','personal':'broad-nib volunteer brush paint','vehicle':'transport sign print','phone':'telephone instruction print','record':'paper ink'}[category]
 broad=noise(rng,(w,h),(max(3,w//50),max(3,h//35)));fine=noise(rng,(w,h),(max(3,w//3),max(3,h//3)))
 substrate=job.get('substrate') or {};sampled=bool(substrate.get('albedoPath'))
 load=lambda key:np.asarray(Image.open(substrate[key]).convert('RGB').resize((w,h),Image.Resampling.BICUBIC),dtype=float)
 colors=load('albedoPath') if sampled else np.broadcast_to(ground,(h,w,3)).copy()
 rough=np.full((h,w),substrate.get('roughnessFactor',.86 if category in ['personal','record','maintenance'] else .40),dtype=float);metal=np.full((h,w),substrate.get('metallicFactor',0),dtype=float);ao=np.ones((h,w));height=np.zeros((h,w));baseNormal=None
 if sampled:
  if substrate.get('ormPath'):
   hostOrm=load('ormPath')/255;ao=hostOrm[...,0];rough=hostOrm[...,1];metal=hostOrm[...,2]
  if substrate.get('normalPath'):baseNormal=load('normalPath')/127.5-1
 else:
  colors+=broad[...,None]*(7 if category in ['personal','record'] else 3)+fine[...,None]*1.2
  rough+=broad*.025;height+=noise(rng,(w,h),(max(3,w//15),max(3,h//20)),.00008)
  if category=='personal':
   drag=noise(rng,(w,h),(max(4,w//2),8));colors+=drag[...,None]*3;rough+=drag*.02
  if category=='maintenance':colors+=noise(rng,(w,h),(18,6))[...,None]*3
 yy,xx=np.mgrid[0:h,0:w];edge=np.minimum.reduce([xx,w-1-xx,yy,h-1-yy])
 # Only actual board/paper perimeters wear. A word-sized patch on a ledger or
 # an apparatus must never acquire a fictitious distressed rectangular border.
 edgeWear=job.get('edgeWear',category in ['institution','personal','vehicle'])
 chips=(edge<max(.5,min(w/job['widthM'],h/job['heightM'])*.0007))&(noise(rng,(w,h),(max(3,w//7),max(3,h//7)))>.20)&edgeWear&(not sampled)
 colors[chips]=ground*.72;rough[chips]=.9
 colors=colors*(1-a[...,None])+ink*a[...,None];rough=rough*(1-a)+job.get('inkRoughness',.80 if category in ['personal','record','maintenance'] else .48)*a;metal=metal*(1-a)+job.get('inkMetallic',0)*a
 height+=a*job.get('reliefM',.000007);dx=job['widthM']/w;dy=job['heightM']/h;gx=np.gradient(height,axis=1)/dx;gy=np.gradient(height,axis=0)/dy
 normal=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1) if baseNormal is None else baseNormal+np.stack([-gx,-gy,np.zeros_like(gx)],axis=-1);normal/=np.maximum(1e-8,np.linalg.norm(normal,axis=-1)[...,None])
 color=Image.fromarray(np.uint8(np.clip(colors,0,255)),mode='RGB');normalBytes=np.uint8(np.clip(normal*.5+.5,0,1)*255)
 if sampled and substrate.get('normalPath'):
  # Preserve decoded source stock at clear pigment texels, including its exact
  # encoded normal. Normalizing the decoded 8-bit vector causes needless drift.
  clear=a==0;normalBytes[clear]=np.uint8(load('normalPath'))[clear]
 normal=Image.fromarray(normalBytes,mode='RGB')
 orm=Image.fromarray(np.uint8(np.stack([ao,np.clip(rough,.08,1),np.clip(metal,0,1)],axis=-1)*255),mode='RGB')
 luminance=lambda c:float(np.dot(c,[.2126,.7152,.0722]))
 polarity='dark-on-light' if luminance(ink)<luminance(ground) else 'light-on-dark'
 return dict(job=job,width=w,height=h,color=color,mask=mask,normal=normal,orm=orm,metrics=metrics,process=process,polarity=polarity,emission=job.get('emission','none'))

def main():
 source=Path(sys.argv[1]);out=Path(sys.argv[2]);data=json.loads(source.read_text());size=data.get('pageSize',1024);out.mkdir(parents=True,exist_ok=True)
 jobs=data['jobs'];tiles=[];shared={};groups={}
 for job in jobs:
  # Identical factory print shares a tile; volunteer hands retain per-object variation.
  fingerprint=sha(json.dumps({k:v for k,v in job.items() if k not in ['id','seed','source','orientation','bounds']},sort_keys=True).encode())
  if job.get('category')!='personal' and fingerprint in shared:
   shared[fingerprint]['jobs'].append(job);continue
  t=tile(job);t['jobs']=[job];tiles.append(t);shared[fingerprint]=t
 for t in tiles:groups.setdefault((t['polarity'],t['emission'],tuple(t['job'].get('emissiveFactor',[0,0,0]))),[]).append(t)
 pages=[];entries=[];gutter=16
 for key,group in sorted(groups.items()):
  shelves=[];pageTiles=[];x=y=rowH=0
  def finish():
   nonlocal pageTiles,x,y,rowH
   if not pageTiles:return
   usedW=max(t['x']+t['width']+gutter for t in pageTiles);usedH=max(t['y']+t['height']+gutter for t in pageTiles)
   pw=min(size,2**math.ceil(math.log2(max(64,usedW))));ph=min(size,2**math.ceil(math.log2(max(64,usedH))))
   rgbPage=Image.new('RGB',(pw,ph));maskPage=Image.new('L',(pw,ph));normalPage=Image.new('RGB',(pw,ph),(128,128,255));ormPage=Image.new('RGB',(pw,ph),(255,220,0))
   pageIndex=len(pages);name='lettering-'+str(pageIndex).zfill(2)
   for t in pageTiles:
    for target,role in [(rgbPage,'color'),(maskPage,'mask'),(normalPage,'normal'),(ormPage,'orm')]:
     image=t[role];expanded=Image.new(image.mode,(image.width+gutter*2,image.height+gutter*2));expanded.paste(image,(gutter,gutter))
     expanded.paste(image.crop((0,0,1,image.height)).resize((gutter,image.height)),(0,gutter));expanded.paste(image.crop((image.width-1,0,image.width,image.height)).resize((gutter,image.height)),(gutter+image.width,gutter))
     expanded.paste(expanded.crop((0,gutter,expanded.width,gutter+1)).resize((expanded.width,gutter)),(0,0));expanded.paste(expanded.crop((0,gutter+image.height-1,expanded.width,gutter+image.height)).resize((expanded.width,gutter)),(0,gutter+image.height));target.paste(expanded,(t['x']-gutter,t['y']-gutter))
    for job in t['jobs']:
     entries.append(dict(id=job['id'],page=pageIndex,uvRect=[t['x']/pw,t['y']/ph,(t['x']+t['width'])/pw,(t['y']+t['height'])/ph],copy=job.get('copy','\n'.join(job.get('lines',[]))),lines=job.get('lines') or str(job.get('copy','')).split('\n'),widthM=job['widthM'],heightM=job['heightM'],metrics=t['metrics'],category=job.get('category'),process=t['process'],polarity=t['polarity'],emission=t['emission'],reliefM=job.get('reliefM',.000007),source=job.get('source'),orientation=job.get('orientation'),bounds=job.get('bounds'),substrate={k:v for k,v in (job.get('substrate') or {}).items() if k in ['asset','mesh','sourceAssetSha256','roughnessFactor','metallicFactor','normalScale']} or None))
   rgba=rgbPage.copy();rgba.putalpha(maskPage);rgba.save(out/(name+'-albedo.png'))
   normalPage.resize((max(16,pw//4),max(16,ph//4)),Image.Resampling.LANCZOS).save(out/(name+'-normal.png'))
   ormPage.resize((max(16,pw//2),max(16,ph//2)),Image.Resampling.LANCZOS).save(out/(name+'-orm.png'))
   pages.append(dict(name=name,width=pw,height=ph,albedo=name+'-albedo.png',normal=name+'-normal.png',orm=name+'-orm.png',category='shared compatible print',process='per-material fabrication; see entries',polarity=key[0],emission=key[1],emissiveFactor=list(key[2]),sharedTiles=len(pageTiles),rgbaBaseLevelBytes=pw*ph*4+max(16,pw//2)*max(16,ph//2)*4+max(16,pw//4)*max(16,ph//4)*4))
   pageTiles=[];x=y=rowH=0
  bins=[]
  for t in sorted(group,key=lambda t:(-t['width']*t['height'],-max(t['width'],t['height']),t['job']['id'])):
   tw=t['width']+gutter*2;th=t['height']+gutter*2
   if tw>size or th>size:raise ValueError('Atlas tile exceeds page '+t['job']['id'])
   candidates=[]
   for bi,bin in enumerate(bins):
    for fi,(fx,fy,fw,fh) in enumerate(bin['free']):
     if tw<=fw and th<=fh:candidates.append((min(fw-tw,fh-th),fw*fh-tw*th,bi,fi))
   if not candidates:
    bins.append(dict(free=[(0,0,size,size)],tiles=[]));candidates=[(0,0,len(bins)-1,0)]
   _,_,bi,fi=min(candidates);bin=bins[bi];fx,fy,fw,fh=bin['free'].pop(fi)
   if fw-tw>fh-th:
    remaining=[(fx+tw,fy,fw-tw,fh),(fx,fy+th,tw,fh-th)]
   else:
    remaining=[(fx+tw,fy,fw-tw,th),(fx,fy+th,fw,fh-th)]
   bin['free'].extend(r for r in remaining if r[2]>0 and r[3]>0)
   t['x']=fx+gutter;t['y']=fy+gutter;bin['tiles'].append(t)
  for bin in bins:pageTiles=bin['tiles'];finish()

 manifest=dict(version=1,inputSha256=sha(source.read_bytes()),generatorSha256=sha(Path(__file__).read_bytes()),pages=pages,entries=entries,coverageChannel='baseColorAlpha',alphaMode='OPAQUE',rgbPremultiplied=False,gutterPx=gutter,
  note='Atlas RGB remains authored substrate color when alpha pigment coverage is zero. Normal and ORM are filtered independently. Empty or missing authored glyphs fail the bake.')
 (out/'atlas-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(dict(jobs=len(jobs),pages=len(pages),baseLevelBytes=sum(p['rgbaBaseLevelBytes'] for p in pages))))
if __name__=='__main__':main()
