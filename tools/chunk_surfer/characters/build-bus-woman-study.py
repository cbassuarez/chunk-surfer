"""Bus woman study anatomy and three authored coat silhouettes. No production edits.
Run with Blender -b --python this-file. Source anatomy/garments: MakeHuman CC0.
Y-up, forward -Z; no Blender axis export conversion is involved in JSON output.
"""
import bpy, bmesh, json, gzip, math, os, hashlib
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "artifacts/bus-woman-design/anatomy"
GEOMETRY = OUT
CHILD_SOURCE = OUT / "sources"
for folder in [OUT]:folder.mkdir(parents=True,exist_ok=True)
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
    ages=[('young',.47),('old',.53)]
    for age,w in ages:
        for prefix in ['african-female-','universal-female-']:
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



MATERIALS=[
 dict(name='warm deep-brown skin',baseColor=[.12,.043,.022,1],role='skin',roughness=.79),
 dict(name='weathered navy wool',baseColor=[.041,.066,.095,1],role='coat',roughness=.96),
 dict(name='washed dark denim',baseColor=[.065,.075,.081,1],role='trousers',roughness=.94),
 dict(name='worn dark leather',baseColor=[.040,.033,.029,1],role='shoe',roughness=.75),
 dict(name='black and grey hair',baseColor=[.039,.033,.030,1],role='hair',roughness=.96),
 dict(name='muted eye whites',baseColor=[.34,.28,.225,1],role='eye',roughness=.48),
 dict(name='ochre mustard knit',baseColor=[.37,.23,.065,1],role='scarf',roughness=.97),
 dict(name='black wool cap',baseColor=[.022,.023,.026,1],role='hat',roughness=.98),
 dict(name='coat binding and seams',baseColor=[.025,.038,.052,1],role='seam',roughness=.95),
 dict(name='worn brown handbag',baseColor=[.105,.051,.028,1],role='bag',roughness=.81),
 dict(name='aged bag hardware',baseColor=[.21,.16,.095,1],role='hardware',roughness=.57,metallic=.55),
 dict(name='dark iris and pupil',baseColor=[.022,.014,.009,1],role='iris',roughness=.5),
 dict(name='grey temple strands',baseColor=[.12,.11,.096,1],role='grey hair',roughness=.98),
]
RESULT=[]
def weighted(n,count):
 w=np.zeros((count,len(NAMES)));w[:,NAMES.index(n)]=1;return w

def add(name,v,f,w,mat,ratio=1,source_winding=False):
 if not source_winding:f=[list(reversed(x)) for x in f]
 r=create(name,np.array(v),f,np.array(w),mat,ratio);RESULT.append(r);return r

def tube(name,points,radius,bones,material,segments=8):
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

def ellipsoid(name,c,r,bone,mat,seg=18,rings=10):
 vv=[];ff=[]
 for j in range(rings+1):
  a=math.pi*j/rings
  for i in range(seg):
   t=2*math.pi*i/seg;vv.append([c[0]+r[0]*math.sin(a)*math.cos(t),c[1]+r[1]*math.cos(a),c[2]+r[2]*math.sin(a)*math.sin(t)])
 for j in range(rings):
  for i in range(seg):ff.append([j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i])
 return add(name,vv,ff,weighted(bone,len(vv)),mat)

def core_weights(y,side=0):
 # Coat skirt deforms with the pelvis/legs when seated; chest does not stretch into lap.
 stages=[(.52,'thigh_L' if side<0 else'thigh_R'),(.91,'pelvis'),(1.04,'spine_lower'),(1.17,'spine_mid'),(1.32,'spine_upper'),(1.45,'chest')]
 w=np.zeros(len(NAMES))
 if y<=stages[0][0]:w[NAMES.index(stages[0][1])]=1;return w
 for (lo,a),(hi,b) in zip(stages,stages[1:]):
  if y<=hi:
   t=(y-lo)/(hi-lo);w[NAMES.index(a)]+=1-t;w[NAMES.index(b)]+=t;return w
 w[NAMES.index('chest')]=1;return w

raw,g,s,low,rest=anatomy('woman',1.70)
cv,cf,cw,hidden=proxy('woman','clothes/male_casualsuit01','male_casualsuit01',raw,g,s)
# Use fitted continuous surfaces for the trousers. The three coats are newly tailored.
waist=rest['pelvis'][0][1]+.045
pants=[f for f in cf if cv[f,1].mean()<waist]
add('woman-denim-trousers',cv,pants,cw,2,.30,True)
exposed=[NAMES.index(n) for n in NAMES if n in ['head','jaw','neck'] or n.startswith(('hand_','thumb_','index_','middle_','ring_','little_'))]
skin=[f for f in FACES['body'] if WEIGHTS[f][:,exposed].sum(axis=1).mean()>.42 or g[f,1].mean()>1.70*.81]
hair=[];face=[]
def hairline(p):
 front=1/(1+math.exp(max(-30,min(30,(p[2]-(rest['head'][0][2]-.01))/.016))))
 return 1.70*(.922+.041*front)-.014*min(1,(abs(p[0])/.1)**2)
for f in skin:
 c=g[f].mean(axis=0);(hair if c[1]>hairline(c) else face).append(f)
hid={i for f in hair for i in f};fid={i for f in face for i in f}
for i in hid&fid:g[i,1]=hairline(g[i])
add('woman-ordinary-face-neck-anatomical-hands',g,face,WEIGHTS,0,.56,True)
hg=g.copy()
for i in hid:
 d=hg[i]-rest['head'][0]-[0,.06,0];d/=np.linalg.norm(d)or 1;hg[i]+=d*.004
add('woman-greying-hair',hg,hair,WEIGHTS,4,.55,True)
ev,ef,ew,_=proxy('woman','eyes/low-poly','low-poly',raw,g,s);add('woman-eyes',ev,ef,ew,5,.8,True)
for sign in [-1,1]:
 ids=[i for i,p in enumerate(ev)if p[0]*sign>0];center=ev[ids].mean(axis=0);center[2]=ev[ids,2].min()-.0006
 ellipsoid('woman-iris-'+str(sign),center,[.0047,.0047,.0015],'head',11,14,8)
 # Grey strands gathered over the temples rather than a helmet of identical hair.
 for k in range(3):
  pts=[[sign*(.072+.004*k),1.625-j*.013,-.042+j*.004]for j in range(4)]
  tube('woman-temple-'+str(sign)+'-'+str(k),pts,.0014,'head',12,5)
# Familiar soft wool cap with a turned rim, following the real head oval.
hc=rest['head'][0];vv=[];ff=[];seg=40
for j in range(13):
 u=j/12;a=u*math.pi/2
 for k in range(seg):
  t=k*math.pi*2/seg;wave=1+.015*math.sin(t*13);vv.append([math.cos(t)*.105*math.cos(a)*wave,1.624+math.sin(a)*.112, hc[2]+.022+math.sin(t)*.126*math.cos(a)*wave])
 if j:
  for k in range(seg):ff.append([(j-1)*seg+k,(j-1)*seg+(k+1)%seg,j*seg+(k+1)%seg,j*seg+k])
add('woman-soft-wool-cap',vv,[list(reversed(f))for f in ff],weighted('head',len(vv)),7)
ring=[[math.cos(t)*.106,1.630,hc[2]+.022+math.sin(t)*.127]for t in np.linspace(0,2*math.pi,49)]
tube('woman-cap-turned-rim',ring,.010,'head',7,8)
# Shoes use closed lasts, soles and instep seams, never naked anatomical feet.
for side in ['L','R']:
 ankle=rest['foot_'+side][0];cx=ankle[0];cz=ankle[2]-.055;vv=[];ff=[];seg=28
 for j in range(9):
  u=j/8;yy=.018+math.sin(u*math.pi/2)*.089;factor=math.cos(u*math.pi/2)*.78+.22
  for k in range(seg):
   a=k*2*math.pi/seg;vv.append([cx+math.cos(a)*.055*factor,yy,cz+math.sin(a)*.122*factor+u*.035])
  if j:
   for k in range(seg):ff.append([(j-1)*seg+k,j*seg+k,j*seg+(k+1)%seg,(j-1)*seg+(k+1)%seg])
 ff.append(list(range(seg-1,-1,-1)));ff.append(list(range(8*seg,9*seg)))
 add('woman-closed-leather-shoe-'+side,vv,ff,weighted('foot_'+side,len(vv)),3)
 ring=[[cx+math.cos(t)*.057,.016,cz+math.sin(t)*.124]for t in np.linspace(0,2*math.pi,33)]
 tube('woman-shoe-sole-'+side,ring,.007,'foot_'+side,3,7)
 for k in range(3):
  z=ankle[2]-.052+k*.014;tube('woman-shoe-instapseam-'+side+str(k),[[cx-.024,.092,z],[cx,.099,z-.003],[cx+.024,.092,z]],.0015,'foot_'+side,8,5)
COMMON=RESULT;VARIANTS=[]

for option,name,hem,width,scarf_length in [(1,'The Familiar Wait',.61,1,.24),(2,'The Button Out of Place',.56,1.12,.105),(3,'The Last Passenger',.34,.96,.06)]:
 RESULT=[]
 # Folded coat body, fitted from a series of torso cross sections. Deliberate hem profiles
 # make the options structurally distinct without changing the woman beneath them.
 sections=[(hem,(.27 if option==3 else .245)*width,.27 if option==3 else .23),(hem+.10,(.27 if option==3 else .248)*width,.27 if option==3 else .23),(.88,.25*width,.238),(1.02,.225*width,.223),(1.14,.208*width,.219),(1.29,.217*width,.216),(1.38,.212*width,.161),(1.44,.151,.109),(1.478,.073,.073)]
 sections=sorted(sections);rows=[]
 for (ya,xa,za),(yb,xb,zb) in zip(sections,sections[1:]):
  for j in range(4):
   t=j/4;rows.append((ya+(yb-ya)*t,xa+(xb-xa)*t,za+(zb-za)*t))
 rows.append(sections[-1]);vv=[];ff=[];ww=[];seg=48
 for j,(y,rx,rz) in enumerate(rows):
  for k in range(seg):
   a=k*2*math.pi/seg;x=math.sin(a)*rx;front=math.cos(a);fold=.006*math.sin(a*9+(y-hem)*5)*max(0,min(1,(1.30-y)/.3))
   # Button2 cloth pulls diagonally from a misplaced closure and raises one front hem.
   skew=(.040*math.sin(a)*max(0,(1.42-y)/(.9)) + .11*math.exp(-((a-.5)/.55)**2)*max(0,(.98-y)/(.98-hem)))*(1 if option==2 else .25)
   xx=x+(.009*math.sin(y*19)if option==2 else 0);zz=.024-front*(rz+fold)
   vv.append([xx,y+skew,zz]);ww.append(core_weights(y,x))
  if j:
   for k in range(seg):ff.append([(j-1)*seg+k,(j-1)*seg+(k+1)%seg,j*seg+(k+1)%seg,j*seg+k])
 add('option'+str(option)+'-continuous-tailored-coat',vv,[list(reversed(f))for f in ff],ww,1)
 # Continuous tailored sleeves follow the anatomical shoulder, elbow and wrist, with no cut proxy boundaries.
 for side in ['L','R']:
  a,elbow=rest['upperarm_'+side];wrist=rest['forearm_'+side][1];vv=[];ff=[];ww=[];count=29;segs=24
  for j in range(count):
   u=max(0,(j-4)/24);t=min(1,u*2);q=max(0,u*2-1)
   center=a*(1-t)+elbow*t if u<=.5 else elbow*(1-q)+wrist*q
   if j<4:center=a+np.array([.06 if side=='L'else-.06,.058,.003])*(1-j/4)
   axis=elbow-a if u<.5 else wrist-elbow;axis/=np.linalg.norm(axis);cross=np.cross(axis,[0,0,1]);cross/=np.linalg.norm(cross);up=np.cross(axis,cross)
   radius=(.088*(1-t)+.066*t)if u<=.5 else(.066*(1-q)+.039*q)
   if j<4:radius=.04+.048*j/4
   radius*=1.13 if option==2 else 1
   row=weighted('upperarm_'+side,1)[0]*(1-min(1,max(0,(u-.42)/.16)))+weighted('forearm_'+side,1)[0]*min(1,max(0,(u-.42)/.16))
   if j<8:row=core_weights(center[1],center[0])*(1-j/8)+row*(j/8)
   for k in range(segs):
    ang=k*2*math.pi/segs;fold=1+.055*math.sin(u*34+ang*3)*math.exp(-((u-.53)/.25)**2);vv.append(center+(cross*math.cos(ang)+up*math.sin(ang))*radius*fold);ww.append(row)
   if j:
    for k in range(segs):ff.append([(j-1)*segs+k,(j-1)*segs+(k+1)%segs,j*segs+(k+1)%segs,j*segs+k])
  ff.append(list(range(segs-1,-1,-1)))
  add('option'+str(option)+'-continuous-sleeve-'+side,vv,ff,ww,1)
  axis=wrist-elbow;axis/=np.linalg.norm(axis);center=wrist-axis*.012;cross=np.cross(axis,[0,0,1]);cross/=np.linalg.norm(cross);up=np.cross(axis,cross)
  pts=[center+(cross*math.cos(t)+up*math.sin(t))*(.04 if option!=2 else .046)for t in np.linspace(0,2*math.pi,25)]
  tube('option'+str(option)+'-cuff-'+side,pts,.006,'forearm_'+side,8,7)
 # Broad lapels on 3; soft small collar on1; shallow storm yoke on2.
 for sign in [-1,1]:
  inner=.046;outer=.154 if option==3 else .105
  pts=[[sign*inner,1.455,-.062],[sign*outer,1.399,-.095],[sign*(.093 if option==3 else .063),1.31 if option==3 else 1.365,-.205],[sign*.036,1.413,-.137]]
  add('option'+str(option)+'-folded-collar-'+str(sign),pts,[[0,1,2,3]],np.array([core_weights(p[1],p[0])for p in pts]),1)
  tube('option'+str(option)+'-collar-binding-'+str(sign),pts+[pts[0]],.0025,[core_weights(p[1],p[0])for p in pts+[pts[0]]],8,6)
 # Collar scarf is a physically separate loop plus a hanging, softly ribbed panel.
 pts=[[math.sin(t)*.079,1.477+.006*math.cos(t),-.022-math.cos(t)*.086]for t in np.linspace(0,2*math.pi,33)]
 tube('option'+str(option)+'-mustard-neck-scarf',pts,.018,'chest',6,8)
 vv=[];ff=[];ww=[]
 for j in range(16):
  u=j/15;y=1.475-u*scarf_length
  zz=(-.12-(1.475-y)/.035*.045)if y>1.44 else(-.165-(1.44-y)/.06*.055)if y>1.38 else-.22
  for k in range(9):
   v=k/8;vv.append([.031+(v-.5)*.061+math.sin(u*3)*.013,y,zz-.004*math.cos(v*math.pi*10)]);ww.append(core_weights(y))
  if j:
   for k in range(8):ff.append([(j-1)*9+k,(j-1)*9+k+1,j*9+k+1,j*9+k])
 add('option'+str(option)+'-ribbed-scarf-end',vv,ff,ww,6)
 # Placket and four real buttons. The second proposal's offset is physically visible.
 placket=[]
 for j in range(15):
  y=hem+.07+(1.34-hem-.07)*j/14;x=.013+.014*(1.33-y)/.77 if option!=2 else .057*(1.33-y)/(.77)+.008
  z=-.210 if y<1.17 else-.195;placket.append([x,y,z-.009])
 tube('option'+str(option)+'-front-closure',placket,.004,[core_weights(p[1],p[0])for p in placket],8,6)
 for j in range(4):
  y=.89+j*.118;x=.019+.014*(1.33-y)/.77 if option!=2 else .057*(1.33-y)/.77+.008
  ellipsoid('option'+str(option)+'-coat-button-'+str(j),[x,y,-(.209 if y>1.17 else .221)],[.007,.007,.003], 'spine_lower'if y<1.12 else'spine_mid',8,10,6)
 # Pocket mouths, front-facing and angled for actual hand insertion in the performance.
 for sign in [-1,1]:
  pts=[[sign*(.123+k*.015),1.035-k*.018,-.193+k*.008]for k in range(5)]
  tube('option'+str(option)+'-pocket-welt-'+str(sign),pts,.005,[core_weights(p[1],p[0])for p in pts],8,7)
 # Yoke and skirt seam retain form in dither without decorative excess.
 hemline=vv # local reference deliberately not used as topological source
 pts=[]
 for k in range(49):
  a=k*2*math.pi/48;skew=(.040*math.sin(a)*max(0,(1.42-hem)/.9)+.11*math.exp(-((a-.5)/.55)**2))*(1 if option==2 else .25);pts.append([math.sin(a)*(.27 if option==3 else .245)*width,hem+.01+skew,.024-math.cos(a)*(.27 if option==3 else .23)])
 tube('option'+str(option)+'-hem-binding',pts,.003,[core_weights(p[1],p[0])for p in pts],8,6)
 VARIANTS.append(dict(id=option,name=name,meshes=RESULT))

# One persistent bag attachment, independent of actor deformation. Every scene reuses it.
RESULT=[];vv=[];ff=[];seg=32
for j in range(9):
 u=j/8;y=u*.29;rx=.147*(.93+.07*math.sin(u*math.pi));rz=.066*(.85+.15*math.sin(u*math.pi))
 for k in range(seg):
  a=k*math.pi*2/seg;vv.append([math.sin(a)*rx,y,math.cos(a)*rz+.004*math.sin(a*5)*math.sin(u*math.pi)])
 if j:
  for k in range(seg):ff.append([(j-1)*seg+k,(j-1)*seg+(k+1)%seg,j*seg+(k+1)%seg,j*seg+k])
ff.append(list(range(seg-1,-1,-1)));ff.append(list(range(8*seg,9*seg)))
add('woman-persistent-brown-handbag',vv,ff,weighted('pelvis',len(vv)),9)
for z in [-.04,.04]:
 pts=[[math.cos(t)*.085,.275+math.sin(t)*.125,z]for t in np.linspace(0,math.pi,21)]
 tube('woman-handbag-handle-'+str(z),pts,.009,'pelvis',9,8)
for x in [-.112,.112]:ellipsoid('woman-bag-hardware-'+str(x),[x,.278,-.056],[.012,.013,.005],'pelvis',10,12,8)
for z in [-.061,.061]:
 pts=[[-.142,.025,z],[-.143,.26,z],[0,.288,z],[.143,.26,z],[.142,.025,z]]
 tube('woman-bag-seam-'+str(z),pts,.0022,'pelvis',8,5)
BAG=RESULT
bones=[dict(name=n,parent=PARENTS[n],head=[round(float(x),6)for x in rest[n][0]],tail=[round(float(x),6)for x in rest[n][1]])for n in NAMES]
result=dict(version=1,id='bus-woman-study',height=1.70,bones=bones,materials=MATERIALS,meshes=COMMON,options=VARIANTS,bag=dict(meshes=BAG,grip=[0,.4,0],height=.4),source=dict(anatomy='MakeHuman hm08 CC0',macro='47% young / 53% old African female anatomical macro, same identity in every option',purpose='Design maquettes, not production selection',wardrobe='Authored coat, scarf, cap, closed leather footwear, handbag; fitted CC0 trouser/sleeve proxy'),stats=dict(commonVertices=sum(len(m['positions'])//3 for m in COMMON),options=[dict(id=v['id'],vertices=sum(len(m['positions'])//3 for m in v['meshes']))for v in VARIANTS]))
# Four-decimal study coordinates retain0.1mm precision while keeping a self-contained canvas small.
for m in COMMON+[m for v in VARIANTS for m in v['meshes']]+BAG:
 for field in ['positions','normals','skinWeight']:m[field]=[round(x,4)for x in m[field]]
blob=json.dumps(result,separators=(',',':')).encode();(OUT/'woman.json').write_bytes(blob);(OUT/'woman.json.gz').write_bytes(gzip.compress(blob,compresslevel=9))
print(result['stats'],len(blob),len(gzip.compress(blob,9)),flush=True)
# Inspectable source maquette: option1 visible by default, with named alternative collections.
for ob in bpy.data.objects:
 if ob.type!='MESH':continue
 found=next((m for m in COMMON+[m for v in VARIANTS for m in v['meshes']]+BAG if m['name']==ob.name),None)
 if not found:continue
 d=MATERIALS[found['material']];ma=bpy.data.materials.get(d['name'])or bpy.data.materials.new(d['name']);ma.diffuse_color=d['baseColor'];ma.use_nodes=True;p=ma.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=d['baseColor'];p.inputs['Roughness'].default_value=d['roughness'];ob.data.materials.append(ma)
 if ob.name.startswith(('option2','option3')):ob.hide_render=True;ob.hide_set(True)
 if ob.name.startswith('woman-')and ('bag-'in ob.name or'handbag'in ob.name):ob.location=[.42,.33,0]
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'bus-woman-study.blend'))
(OUT/'provenance.json').write_text(json.dumps(dict(license='CC0-1.0',anatomySources=json.load(open(MH/'sources.json')),femaleTargets=json.load(open(OUT/'sources/sources.json')),garmentSources=json.load(open(SYSTEM/'sources.json')),note='Authored three coat silhouettes, hand-held bag, wool cap, scarf, closed shoes. Same human and face in each study; no production assets replaced.'),indent=2))
