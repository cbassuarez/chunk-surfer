"""Production recordist anatomy and authored garments. No GLB or runtime edits.
Run with Blender -b --python this-file. Source anatomy/garments: MakeHuman CC0.
Y-up, forward -Z; no Blender axis export conversion is involved in JSON output.
"""
import bpy, bmesh, json, gzip, math, os, hashlib
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "public/assets/recordist-characters"
GEOMETRY = ROOT / "artifacts/recordist-characters/geometry"
CHILD_SOURCE = ROOT / "artifacts/boy-contractor-design/anatomy"
for folder in [OUT, GEOMETRY, ROOT / "assets/source"]:folder.mkdir(parents=True,exist_ok=True)
MH = ROOT / 'tools/chunk_surfer/character-sources/makehuman'
SYSTEM = MH / 'system'
bpy.ops.wm.read_factory_settings(use_empty=True)

def read_obj(path):
    verts=[]; groups={}; name=''
    for row in open(path):
        t=row.split()
        if not t: continue
        if t[0]=='v': verts.append(list(map(float,t[1:4])))
        elif t[0]=='g': name=t[1]
        elif t[0]=='f': groups.setdefault(name,[]).append([int(v.split('/')[0])-1 for v in t[1:]])
    return np.array(verts),groups

BASE,FACES=read_obj(MH/'base.obj')
RAW_WEIGHTS=json.load(open(MH/'default_weights.mhw'))['weights']
SKEL=json.load(open(MH/'default.mhskel'))
PARENTS={'pelvis':None,'spine_lower':'pelvis','spine_mid':'spine_lower','spine_upper':'spine_mid','chest':'spine_upper','neck':'chest','head':'neck','jaw':'head'}
for side in ['L','R']:
    for n,p in [('clavicle','chest'),('upperarm','clavicle_'+side),('forearm','upperarm_'+side),('hand','forearm_'+side),('thigh','pelvis'),('shin','thigh_'+side),('foot','shin_'+side),('toe','foot_'+side)]:PARENTS[n+'_'+side]=p
    for n in ['thumb','index','middle','ring','little']:PARENTS[n+'_'+side]='hand_'+side
NAMES=list(PARENTS)
def compact(name):
    if name in ['root','spine05'] or name.startswith('pelvis.'):return 'pelvis'
    if name.startswith('spine'):return {'spine04':'spine_lower','spine03':'spine_mid','spine02':'spine_upper','spine01':'chest'}[name]
    if name.startswith('neck'):return 'neck'
    if name=='jaw' or name.startswith('tongue') or name in ['oris01','special04'] or name.startswith('oris07.'):return 'jaw'
    if name.startswith('breast.'):return 'chest'
    side='R' if name.endswith('.L') else 'L'; stem=name.split('.')[0]
    for prefix,target in [('clavicle','clavicle'),('shoulder','clavicle'),('upperarm','upperarm'),('lowerarm','forearm'),('upperleg','thigh'),('lowerleg','shin'),('wrist','hand'),('metacarpal','hand'),('foot','foot'),('toe','toe')]:
        if stem.startswith(prefix):return target+'_'+side
    if stem.startswith('finger'):return ['thumb','index','middle','ring','little'][int(stem[6])-1]+'_'+side
    return 'head'

WEIGHTS=np.zeros((len(BASE),len(NAMES)))
for name,rows in RAW_WEIGHTS.items():
    j=NAMES.index(compact(name))
    for i,w in rows:WEIGHTS[i,j]+=w
WEIGHTS/=WEIGHTS.sum(axis=1)[:,None]

def target(v,name,weight):
    p=CHILD_SOURCE/name if (CHILD_SOURCE/name).exists() else MH/name
    for row in gzip.open(p,'rt'):
        t=row.split()
        if len(t)==4 and t[0].isdigit():v[int(t[0])]+=np.array(list(map(float,t[1:])))*weight

def anatomy(kind,height):
    v=BASE.copy()
    ages=[('child',1)] if kind=='boy' else [('young',.72),('old',.28)]
    for age,w in ages:
        for prefix in ['caucasian-male-','universal-male-']:
            target(v,prefix+age+('-averagemuscle-averageweight' if prefix.startswith('universal') else '')+'.target.gz',w)
    ids=sorted(set(i for f in FACES['body'] for i in f));low=v[ids,1].min();s=height/(v[ids,1].max()-low)
    g=np.stack((v[:,0]*s,(v[:,1]-low)*s,-v[:,2]*s),axis=1)
    def j(name):return g[sorted(set(i for f in FACES[name] for i in f))].mean(axis=0)
    rest={}
    def bone(n,a,b):rest[n]=(j(a),j(b))
    for n,a,b in [('pelvis','pelvis','spine-4'),('spine_lower','spine-4','spine-3'),('spine_mid','spine-3','spine-2'),('spine_upper','spine-2','spine-1'),('chest','spine-1','neck'),('neck','neck','head'),('head','head','head-2')]:bone(n,'joint-'+a,'joint-'+b)
    jaw=SKEL['bones']['jaw'];rest['jaw']=tuple(g[SKEL['joints'][jaw[k]]].mean(axis=0) for k in ['head','tail'])
    for side,mh in [('R','l'),('L','r')]:
        for n,a,b in [('clavicle','spine-1',mh+'-shoulder'),('upperarm',mh+'-shoulder',mh+'-elbow'),('forearm',mh+'-elbow',mh+'-hand'),('hand',mh+'-hand',mh+'-hand-3'),('thigh',mh+'-upper-leg',mh+'-knee'),('shin',mh+'-knee',mh+'-ankle'),('foot',mh+'-ankle',mh+'-foot-1'),('toe',mh+'-foot-1',mh+'-foot-2')]:bone(n+'_'+side,'joint-'+a,'joint-'+b)
        for k,n in enumerate(['thumb','index','middle','ring','little']):bone(n+'_'+side,'joint-'+mh+f'-finger-{k+1}-1','joint-'+mh+f'-finger-{k+1}-4')
    return v,g,s,low,rest

def proxy(kind,folder,name,raw,game,scale):
    path=SYSTEM/folder/name;_,groups=read_obj(str(path)+'.obj');faces=[f for fs in groups.values() for f in fs]
    rows=[];reading=False;offsetscale=np.ones(3);hidden=set();hiding=False
    for row in open(str(path)+'.mhclo'):
        t=row.split()
        if not t or t[0].startswith('#'):continue
        if t[0] in ['x_scale','y_scale','z_scale']:
            axis='xyz'.index(t[0][0]);a,b=int(t[1]),int(t[2]);offsetscale[axis]=abs(raw[a,axis]-raw[b,axis])/float(t[3])
        if t[0]=='delete_verts':reading=False;hiding=True;continue
        if t[0]=='verts':reading=True;continue
        if reading:
            try:
                if len(t)==1:rows.append(([int(t[0])],[1.],[0,0,0]))
                elif len(t)==9:rows.append((list(map(int,t[:3])),list(map(float,t[3:6])),list(map(float,t[6:9]))))
                else:reading=False
            except ValueError:reading=False
        if hiding:
            i=0
            while i<len(t):
                if not t[i].isdigit():i+=1;continue
                a=int(t[i]);b=a
                if i+2<len(t) and t[i+1]=='-':b=int(t[i+2]);i+=2
                hidden.update(range(a,b+1));i+=1
    verts=[];weights=[]
    for ids,ww,delta in rows:
        w=np.maximum(0,np.array(ww)@WEIGHTS[ids]);w/=w.sum() or 1
        offset=np.array(delta)*offsetscale*scale*np.array([1,1,-1])
        verts.append(np.array(ww)@game[ids]+offset);weights.append(w)
    return np.array(verts),faces,np.array(weights),hidden

def create(name,verts,faces,weights,material,ratio=1):
    # Compact before Blender: every exported vertex belongs to a visible face.
    ids=sorted(set(i for f in faces for i in f));remap={a:i for i,a in enumerate(ids)}
    # Forward -Z reflects the MakeHuman source's Z axis, requiring reversed winding.
    me=bpy.data.meshes.new(name);me.from_pydata(verts[ids].tolist(),[],[[remap[i] for i in reversed(f)] for f in faces]);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
    groups=[ob.vertex_groups.new(name=n) for n in NAMES]
    for vi,original in enumerate(ids):
        row=weights[original];take=np.argsort(row)[-4:];total=row[take].sum()
        for j in take:
            if row[j]>1e-6:groups[j].add([vi],float(row[j]/total),'REPLACE')
    bpy.context.view_layer.objects.active=ob
    if ratio<1 and len(faces)>3:
        mod=ob.modifiers.new('design-only continuous-surface reduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    me=ob.data
    for p in me.polygons:p.use_smooth=True
    me.calc_loop_triangles()
    positions=[];normals=[];skinIndex=[];skinWeight=[]
    for vertex in me.vertices:
        positions.extend(round(float(x),6) for x in vertex.co);normals.extend(round(float(x),6) for x in vertex.normal)
        pairs=sorted([(g.group,g.weight) for g in vertex.groups],key=lambda q:q[1],reverse=True)[:4];total=sum(w for _,w in pairs) or 1
        pairs += [(0,0)]*(4-len(pairs));skinIndex.extend(j for j,w in pairs);skinWeight.extend(round(w/total,6) for j,w in pairs)
    result=dict(name=name,material=material,positions=positions,normals=normals,indices=[int(i) for t in me.loop_triangles for i in t.vertices],skinIndex=skinIndex,skinWeight=skinWeight)
    return result

def shoe_envelopes(kind,foot,faces,rest):
    result=[]
    for side in ['L','R']:
        center=rest['foot_'+side][0]
        ids=sorted(set(i for f in faces for i in f if (foot[i,0]<0)==(center[0]<0)))
        bm=bmesh.new()
        for i in ids:bm.verts.new(foot[i])
        bm.verts.ensure_lookup_table()
        hull=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
        dead=list({e for e in list(hull.get('geom_interior',[]))+list(hull.get('geom_unused',[])) if isinstance(e,bmesh.types.BMVert)})
        if dead:bmesh.ops.delete(bm,geom=dead,context='VERTS')
        bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();bm.verts.index_update()
        vertices=np.array([list(v.co) for v in bm.verts]);polygons=[[v.index for v in reversed(f.verts)] for f in bm.faces]
        # This task-local shell is the rounded outer envelope of anatomical feet;
        # it closes toe grooves and never ships bare toe geometry as footwear.
        weights=np.zeros((len(vertices),len(NAMES)));weights[:,NAMES.index('foot_'+side)]=1
        result.append(create(kind+'-shoe-shell-'+side,vertices,polygons,weights,3,1));bm.free()
    return result


# Production additions: physically separate tailored layers and actual facial absence.
MATERIALS=[
 dict(name='ordinary skin',baseColor=[.47,.32,.245,1],roughness=.76,metallic=0,role='skin'),
 dict(name='moss wool knit',baseColor=[.105,.145,.092,1],roughness=.96,metallic=0,role='knit',normalTexture='knit-normal.png'),
 dict(name='worn grey trousers',baseColor=[.105,.115,.111,1],roughness=.92,metallic=0,role='trousers',normalTexture='cloth-normal.png'),
 dict(name='scuffed brown leather',baseColor=[.075,.055,.04,1],roughness=.73,metallic=0,role='shoe',normalTexture='leather-normal.png'),
 dict(name='ordinary dark hair',baseColor=[.04,.027,.018,1],roughness=.96,metallic=0,role='hair',normalTexture='hair-normal.png'),
 dict(name='muted eye whites',baseColor=[.40,.37,.31,1],roughness=.42,metallic=0,role='eye'),
 dict(name='pale cotton collar and shirt',baseColor=[.53,.52,.43,1],roughness=.9,metallic=0,role='shirt',normalTexture='cloth-normal.png'),
 dict(name='charcoal waistcoat',baseColor=[.055,.062,.060,1],roughness=.94,metallic=0,role='waistcoat',normalTexture='cloth-normal.png'),
 dict(name='ribbed moss edging',baseColor=[.071,.104,.064,1],roughness=.98,metallic=0,role='knit-trim',normalTexture='knit-normal.png'),
 dict(name='seams and laces',baseColor=[.20,.185,.15,1],roughness=.92,metallic=0,role='seam'),
 dict(name='aged headphone metal',baseColor=[.21,.22,.20,1],roughness=.58,metallic=.65,role='hardware'),
 dict(name='rubber and headphone cushions',baseColor=[.022,.025,.023,1],roughness=.91,metallic=0,role='rubber'),
 dict(name='absent facial interior',baseColor=[0,0,0,1],roughness=1,metallic=1,role='facial-absence'),
 dict(name='receding facial rim',baseColor=[.075,.058,.043,1],roughness=.99,metallic=0,role='facial-rim'),
 dict(name='grey knitted socks',baseColor=[.28,.30,.27,1],roughness=.98,metallic=0,role='sock',normalTexture='knit-normal.png'),
 dict(name='iris and pupil',baseColor=[.045,.036,.023,1],roughness=.53,metallic=0,role='iris'),
]
RESULT=[]

def weighted(n,count):
 w=np.zeros((count,len(NAMES)));w[:,NAMES.index(n)]=1;return w

def add(name,v,f,w,mat,ratio=1,source_winding=False):
 # New authored surfaces already have game-space winding; inherited OBJ surfaces do not.
 if not source_winding:f=[list(reversed(x)) for x in f]
 r=create(name,np.array(v),f,np.array(w),mat,ratio)
 p=np.array(r['positions']).reshape(-1,3)
 # Physical-scale tiling for microstructure, no photographic face identity.
 r['uv']=[round(float(a),6) for row in p for a in (row[0]*5+row[2]*3,row[1]*5)]
 r['materialRole']=MATERIALS[mat]['role'];RESULT.append(r);return r

def tube(name,points,radius,bones,material,segments=10):
 pts=np.array(points);vv=[];ff=[];ww=[]
 for k,p in enumerate(pts):
  axis=pts[min(k+1,len(pts)-1)]-pts[max(0,k-1)];axis/=np.linalg.norm(axis) or 1
  cross=np.cross(axis,[0,1,0] if abs(axis[1])<.9 else [1,0,0]);cross/=np.linalg.norm(cross)or 1;up=np.cross(axis,cross)
  for i in range(segments):
   a=2*math.pi*i/segments;vv.append(p+(cross*math.cos(a)+up*math.sin(a))*(radius[k] if hasattr(radius,'__len__') else radius));ww.append(bones[k] if hasattr(bones,'__len__') and not isinstance(bones,str) else weighted(bones,1)[0])
  if k:
   for i in range(segments):ff.append([(k-1)*segments+i,(k-1)*segments+(i+1)%segments,k*segments+(i+1)%segments,k*segments+i])
 ff.append(list(range(segments-1,-1,-1)));ff.append(list(range((len(pts)-1)*segments,len(pts)*segments)))
 return add(name,vv,ff,ww,material)

def ellipsoid(name,c,r,bone,mat,seg=24,rings=14):
 vv=[];ff=[]
 for j in range(rings+1):
  a=math.pi*j/rings
  for i in range(seg):
   t=2*math.pi*i/seg;vv.append([c[0]+r[0]*math.sin(a)*math.cos(t),c[1]+r[1]*math.cos(a),c[2]+r[2]*math.sin(a)*math.sin(t)])
 for j in range(rings):
  for i in range(seg):ff.append([j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i])
 return add(name,vv,ff,weighted(bone,len(vv)),mat)

def arm_parameter(p,side,rest):
 a,b=rest['forearm_'+side];d=b-a;return float(np.dot(p-a,d)/(np.dot(d,d)or 1))

def boundary_edges(faces):
 edges={}
 for f in faces:
  for a,b in zip(f,f[1:]+f[:1]):
   key=tuple(sorted((a,b)));edges.setdefault(key,[]).append((a,b))
 return [v[0] for v in edges.values() if len(v)==1]

def smooth_boundary(vertices,faces,iterations=6):
 adjacency={}
 for a,b in boundary_edges(faces):adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
 for _ in range(iterations):
  previous=vertices.copy()
  for i,near in adjacency.items():
   if len(near)==2:vertices[i]=previous[i]*.25+previous[list(near)].mean(axis=0)*.75

def cavity(g,allfaces,rest):
 center=np.array([0,1.235,-.059]);rx=.078;ry=.088
 def removed(f):
  c=g[f].mean(axis=0)
  return c[2]<.020 and (c[0]/rx)**2+((c[1]-center[1])/ry)**2<1.12
 cut=[f for f in allfaces if removed(f)];kept=[f for f in allfaces if not removed(f)]
 # One regular, closed bowl spans the complete absence. Interior loops in the
 # source lips/eyelids cannot introduce a rear-skin triangle or an open gap.
 count=80;vv=[];ww=[]
 for layer,shrink in enumerate([1.07,1.015,.88,.66]):
  for k in range(count):
   angle=k*2*math.pi/count;x=rx*math.cos(angle)*shrink;y=center[1]+ry*math.sin(angle)*shrink
   outerz=-.079+.024*abs(math.cos(angle))
   z=outerz if layer==0 else outerz+.007 if layer==1 else -.043 if layer==2 else -.035
   vv.append([x,y,z]);ww.append(weighted('head',1)[0])
 near=[];deep=[]
 for layer in range(3):
  for k in range(count):
   f=[layer*count+k,layer*count+(k+1)%count,(layer+1)*count+(k+1)%count,(layer+1)*count+k]
   p=np.array([vv[i]for i in f]);normal=np.cross(p[1]-p[0],p[2]-p[0]);toward=np.array([0,center[1],-.12])-p.mean(axis=0)
   if np.dot(normal,toward)<0:f.reverse()
   (near if layer==0 else deep).append(f)
 cap=len(vv);vv.append([0,center[1],-.035]);ww.append(weighted('head',1)[0])
 for k in range(count):
  f=[3*count+k,3*count+(k+1)%count,cap];p=np.array([vv[i]for i in f])
  if np.cross(p[1]-p[0],p[2]-p[0])[2]>0:f.reverse()
  deep.append(f)
 add('boy-receding-aperture-rim',vv,near,ww,13)
 add('boy-closed-facial-absence',vv,deep,ww,12)
 return kept,dict(removedFaces=len(cut),boundaryVertices=count,closedRear=True,eyesPresent=False,nosePresent=False,mouthPresent=False,rearZ=-.035,recessionMetres=.044,closedBowl=True)

def textures():
 size=256;y,x=np.mgrid[0:size,0:size];rng=np.random.default_rng(1989)
 for name in ['knit','cloth','leather','hair']:
  noise=rng.normal(0,.02,(size,size))
  h=(np.cos(x*.43+y*.12)*np.cos(y*.65)*.24 if name=='knit' else np.sin(x*1.6)*np.sin(y*1.6)*.11 if name=='cloth' else np.sin(x*.32+np.sin(y*.027))* .10 if name=='hair' else np.sin(x*.22+y*.11)*np.sin(y*.38)*.04)+noise
  dx=(np.roll(h,-1,1)-np.roll(h,1,1))*.65;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*.65
  n=np.stack((-dx,-dy,np.ones_like(dx)),2);n/=np.linalg.norm(n,axis=2)[:,:,None];pix=np.ones((size,size,4));pix[:,:,:3]=n*.5+.5
  im=bpy.data.images.new(name+'-normal',width=size,height=size,alpha=True);im.pixels.foreach_set(pix.astype(np.float32).ravel());im.filepath_raw=str(OUT/(name+'-normal.png'));im.file_format='PNG';im.save()

def build_production(kind,height):
 global RESULT;RESULT=[]
 raw,g,s,low,rest=anatomy(kind,height)
 # Bone positions stay exactly compatible with the approved anatomical study.
 reference=json.load(open(CHILD_SOURCE/(kind+'.json')))
 rest={b['name']:(np.array(b['head']),np.array(b['tail'])) for b in reference['bones']}
 cv,cf,cw,hidden=proxy(kind,'clothes/male_casualsuit01','male_casualsuit01',raw,g,s)
 waist=rest['pelvis'][0][1]+height*.025;top=[];pants=[];collar=[]
 for f in cf:
  c=cv[f].mean(axis=0)
  if c[1]<waist:pants.append(f);continue
  if kind=='contractor':
   side='L'if c[0]<0 else'R'
   if cw[f][:,NAMES.index('forearm_'+side)].mean()>.35 and arm_parameter(c,side,rest)>.35:continue
  iscollar=abs(c[0])<height*.059 and c[1]>rest['chest'][1][1]-height*.045 and c[2]<.008
  (collar if iscollar else top).append(f)
 # Cloth thickness, knit drape and knee/elbow wear are geometric rather than a tint.
 for i,p in enumerate(cv):
  radial=np.array([p[0],0,p[2]-.018]);radial/=np.linalg.norm(radial)or 1
  drape=.0025*math.sin(p[1]*90+p[0]*20)*math.exp(-((p[1]-waist)/(.055*height))**2)
  cv[i]+=radial*(drape+(.0025 if kind=='boy' else 0))
 smooth_boundary(cv,collar,5)
 add(kind+'-continuous-top',cv,top,cw,1 if kind=='boy' else 6,.83,True)
 add(kind+'-folded-pale-collar',cv,collar,cw,6,.95,True)
 add(kind+'-tailored-trousers',cv,pants,cw,2,.83,True)
 # Adult's separately fitted waistcoat, with physical armholes and an open V.
 if kind=='contractor':
  vest=[]
  for f in top:
   c=cv[f].mean(axis=0);arm=sum(cw[f][:,NAMES.index(n)].mean() for n in ['upperarm_L','upperarm_R','forearm_L','forearm_R'])
   if arm>.13 or abs(c[0])>.22 or not waist-.015<c[1]<rest['chest'][1][1]-.025:continue
   opening=max(0,(c[1]-(waist+.23))*.47+.018)
   if c[2]<-.045 and abs(c[0])<opening:continue
   vest.append(f)
  vv=cv.copy()
  for i,p in enumerate(vv):
   rad=np.array([p[0],0,p[2]-.018]);rad/=np.linalg.norm(rad)or 1;vv[i]+=rad*.007
  smooth_boundary(vv,vest,8)
  add('contractor-tailored-waistcoat',vv,vest,cw,7,.95,True)
  # Fine raised edge binding follows the real garment boundary.
  for k,(a,b) in enumerate(boundary_edges(vest)):
   if k%2==0:tube('waistcoat-bound-edge-'+str(k),[vv[a],vv[b]],.0017,[cw[a],cw[b]],9,6)
  for j in range(4):
   y=waist+.035+j*.065;near=min(range(len(vv)),key=lambda i:(vv[i,0]-.014)**2+(vv[i,1]-y)**2+(vv[i,2]+.14)**2)
   p=vv[near]+[0,0,-.003];ellipsoid('waistcoat-button-'+str(j),p,[.0045,.0045,.002], 'spine_lower'if j<2 else'spine_mid',10,12,8)
 # Actual skin including revealed rolled forearms; no hidden anatomical torso exports.
 exposed=[NAMES.index(n) for n in NAMES if n in ['head','jaw','neck'] or n.startswith(('hand_','thumb_','index_','middle_','ring_','little_'))]
 skin=[]
 for f in FACES['body']:
  c=g[f].mean(axis=0);show=WEIGHTS[f][:,exposed].sum(axis=1).mean()>.38 or c[1]>height*.80
  if kind=='contractor':
   side='L'if c[0]<0 else'R'
   show|=WEIGHTS[f][:,NAMES.index('forearm_'+side)].mean()>.35 and arm_parameter(c,side,rest)>.23
  if show:skin.append(f)
 hair=[];face=[]
 def hairline(p):
  front=1/(1+math.exp(max(-30,min(30,(p[2]-(rest['head'][0][2]-.010))/(height*.012)))))
  return height*(.925+.041*front)-height*.006*min(1,(abs(p[0])/(height*.073))**2)-(.006*math.exp(-((p[0]+.025)/.03)**2)*front if kind=='boy'else 0)
 for f in skin:
  c=g[f].mean(axis=0);(hair if c[1]>hairline(c) else face).append(f)
 hid={i for f in hair for i in f};fid={i for f in face for i in f}
 for i in hid&fid:g[i,1]=hairline(g[i])
 absence=None
 if kind=='boy':face,absence=cavity(g,face,rest)
 add(kind+'-anatomical-skin',g,face,WEIGHTS,0,.85,True)
 hg=g.copy();hc=rest['head'][0]+[0,.045,0]
 for i in hid:
  d=hg[i]-hc;d/=np.linalg.norm(d)or 1;hg[i]+=d*(.003+.001*math.sin(hg[i,0]*100+hg[i,2]*48))
 add(kind+'-sculpted-hair',hg,hair,WEIGHTS,4,1,True)
 if kind=='contractor':
  ev,ef,ew,_=proxy(kind,'eyes/low-poly','low-poly',raw,g,s);add('contractor-anatomical-eyes',ev,ef,ew,5,1,True)
  for sign in [-1,1]:
   ids=[i for i,p in enumerate(ev)if p[0]*sign>0];center=ev[ids].mean(axis=0);center[2]=ev[ids,2].min()-.0006
   ellipsoid('contractor-iris-'+str(sign),center,[.005,.005,.0018],'head',15,16,10)
 # Rolled cuffs and exposed forearms, or the child's narrow knitted wrists.
 for side in ['L','R']:
  a,b=rest['forearm_'+side];axis=(b-a);axis/=np.linalg.norm(axis);t=.34 if kind=='contractor'else.92;center=a+(b-a)*t
  ref=np.cross(axis,[0,0,1]);ref/=np.linalg.norm(ref);up=np.cross(axis,ref);radius=.038 if kind=='contractor'else.028;length=.055 if kind=='contractor'else.033
  vv=[];ff=[]
  for j in range(9):
   u=j/8;ridge=1+(.10*math.sin(u*math.pi*4) if kind=='contractor'else .035*math.sin(u*math.pi*8))
   for k in range(32):
    angle=k*2*math.pi/32;vv.append(center+axis*(u-.5)*length+(ref*math.cos(angle)+up*math.sin(angle))*radius*ridge)
   if j:
    for k in range(32):ff.append([(j-1)*32+k,(j-1)*32+(k+1)%32,j*32+(k+1)%32,j*32+k])
  add(kind+'-rolled-cuff-'+side,vv,ff,weighted('forearm_'+side,len(vv)),6 if kind=='contractor'else 8)
 # Shoes: authored closed last, sole, welt and tied laces; independent of toe skin.
 for side in ['L','R']:
  ankle=rest['foot_'+side][0];sc=height/1.78;cx=ankle[0];cz=ankle[2]-.07*sc
  vv=[];ff=[];segments=40
  for j in range(13):
   u=j/12;yy=.022*sc+math.sin(u*math.pi/2)*.092*sc;factor=(math.cos(u*math.pi/2)*.78+.22)
   for k in range(segments):
    a=k*2*math.pi/segments;z=math.sin(a);width=(.055+.005*max(0,-z))*sc
    vv.append([cx+math.cos(a)*width*factor,yy,cz+z*.133*sc*factor+u*.042*sc])
   if j:
    for k in range(segments):ff.append([(j-1)*segments+k,j*segments+k,j*segments+(k+1)%segments,(j-1)*segments+(k+1)%segments])
  ff.append(list(range(segments-1,-1,-1)));ff.append(list(range(12*segments,13*segments)))
  add(kind+'-leather-shoe-'+side,vv,ff,weighted('foot_'+side,len(vv)),3)
  ring=[[cx+math.cos(t)*.057*sc,.023*sc,cz+math.sin(t)*.136*sc]for t in np.linspace(0,2*math.pi,65)]
  tube(kind+'-shoe-welt-'+side,ring,.003*sc,'foot_'+side,9,8)
  tube(kind+'-shoe-sole-'+side,[[p[0],.011*sc,p[2]]for p in ring],.009*sc,'foot_'+side,11,10)
  for k in range(5):
   z=ankle[2]-.068*sc+k*.012*sc;y=.098*sc-k*.003*sc
   tube(kind+'-lace-'+side+str(k),[[cx-.020*sc,y,z],[cx,y+.004*sc,z-.006*sc],[cx+.020*sc,y,z]],.0014*sc,'foot_'+side,9,6)
  # Socks bridge the shoe opening and trouser hem, following the actual ankle.
  vv=[];ff=[]
  for j in range(2):
   for k in range(32):
    a=2*math.pi*k/32;vv.append([ankle[0]+math.cos(a)*.038*sc,(.082+j*.105)*sc,ankle[2]+math.sin(a)*.039*sc])
  for k in range(32):ff.append([k,32+k,32+(k+1)%32,(k+1)%32])
  add(kind+'-sock-'+side,vv,ff,weighted('shin_'+side,len(vv)),14)
 if kind=='contractor':
  hc=rest['head'][0]
  for side,sign in [('L',-1),('R',1)]:
   c=[sign*.091,hc[1]+.016,hc[2]+.018]
   ellipsoid('headphone-pad-'+side,c,[.020,.041,.030],'head',11)
   ellipsoid('headphone-shell-'+side,[c[0]+sign*.015,c[1],c[2]],[.010,.034,.027],'head',10)
  points=[[math.cos(t)*.110,hc[1]+.017+math.sin(t)*.168,hc[2]+.018]for t in np.linspace(0,math.pi,41)]
  tube('headphone-padded-headband',points,.011,'head',11,10)
  tube('headphone-metal-band',[[p[0],p[1]+.008,p[2]]for p in points],.003,'head',10,8)
  # Permanent upper lead: the workstation/return scene owns its lower cable.
  lead=[[-.101,hc[1]-.026,hc[2]+.022],[-.095,hc[1]-.054,hc[2]+.033],[-.080,hc[1]-.087,hc[2]+.047],[-.061,hc[1]-.108,hc[2]+.060],[-.043,rest['neck'][0][1]+.020,hc[2]+.068]]
  head=weighted('head',1)[0];neck=weighted('neck',1)[0];chest=weighted('chest',1)[0]
  tube('headphone-permanent-collar-lead',lead,.0020,[head,head*.8+neck*.2,head*.35+neck*.65,neck*.8+chest*.2,neck*.55+chest*.45],11,8)
 # Store materials and source blend alongside the exporter-neutral rest mesh contract.
 result=dict(version=2,id=kind,height=height,forward='-Z',up='+Y',bones=reference['bones'],meshes=RESULT,materials=MATERIALS,
  attachments=({'headphoneCollar':{'position':lead[-1],'weights':{'neck':.55,'chest':.45}}}if kind=='contractor'else{}),
  source=dict(anatomy='MakeHuman hm08 CC0; official child macro / neutral adult blend',clothing='Fitted and sculpted CC0 anatomical garment proxy with authored knit trim, waistcoat, cuffs, footwear, headphones',identity='unresolved ordinary adult' if kind=='contractor' else'faceless child age9-10',facialAbsence=absence),
  stats=dict(vertices=sum(len(m['positions'])//3 for m in RESULT),triangles=sum(len(m['indices'])//3 for m in RESULT),materialGroups=len({m['material']for m in RESULT})))
 if result['stats']['vertices']>=50000:raise RuntimeError('Character vertex budget exceeded')
 (OUT/(kind+'.json')).write_text(json.dumps(result,separators=(',',':')));print(kind,result['stats'],flush=True)
 return result

textures()
REPORT=[build_production('boy',1.35),build_production('contractor',1.78)]
# Retain an editable rest rig in the source file. The runtime GLB and its clips
# are authored separately from this geometry/material pass.
for actor in REPORT:
 armdata=bpy.data.armatures.new(actor['id']+'-anatomy');arm=bpy.data.objects.new(actor['id']+'-anatomy',armdata);bpy.context.collection.objects.link(arm)
 bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for bone in actor['bones']:
  b=armdata.edit_bones.new(bone['name']);b.head=bone['head'];b.tail=bone['tail']
  if bone['parent']:b.parent=armdata.edit_bones[bone['parent']]
 bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
 for source in actor['meshes']:
  ob=bpy.data.objects.get(source['name'])
  if ob:
   ob.parent=arm;modifier=ob.modifiers.new('anatomical rest rig','ARMATURE');modifier.object=arm
# Supply useful Blender materials on all authored source objects for direct inspection.
for ob in bpy.data.objects:
 if ob.type!='MESH':continue
 found=next((m for actor in REPORT for m in actor['meshes'] if m['name']==ob.name),None)
 if not found:continue
 d=MATERIALS[found['material']];ma=bpy.data.materials.get(d['name'])or bpy.data.materials.new(d['name']);ma.use_nodes=True;p=ma.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=d['baseColor'];p.inputs['Roughness'].default_value=d['roughness'];p.inputs['Metallic'].default_value=d['metallic'];ob.data.materials.append(ma)
 uv=ob.data.uv_layers.new(name='physical-weave')
 for loop in ob.data.loops:uv.data[loop.index].uv=found['uv'][loop.vertex_index*2:loop.vertex_index*2+2]
 if d.get('normalTexture') and not ma.node_tree.nodes.get('microstructure'):
  tex=ma.node_tree.nodes.new('ShaderNodeTexImage');tex.name='microstructure';tex.image=bpy.data.images.load(str(OUT/d['normalTexture']),check_existing=True);tex.image.colorspace_settings.name='Non-Color'
  normal=ma.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45;ma.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);ma.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/recordist-characters.blend'))
(OUT/'provenance.json').write_text(json.dumps(dict(license='CC0-1.0',anatomySources=json.load(open(MH/'sources.json')),childSources=json.load(open(CHILD_SOURCE/'downloaded-sources.json')),garments=json.load(open(SYSTEM/'sources.json')),reference='https://squallsdead.com/img/endshot8.jpg',note='Visual reference only; no image pixels or named character likeness copied. Authored recessed facial absence, garments, footwear and accessories.'),indent=2))
