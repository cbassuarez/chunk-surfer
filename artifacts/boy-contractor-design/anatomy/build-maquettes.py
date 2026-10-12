"""Task-local clothed anatomical design meshes; does not write game assets.
Run with Blender -b --python this-file. Source anatomy/garments: MakeHuman CC0.
Y-up, forward -Z; no Blender axis export conversion is involved in JSON output.
"""
import bpy, bmesh, json, gzip, math, os, hashlib
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
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
    p=OUT/name if (OUT/name).exists() else MH/name
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

def build(kind,height):
    raw,g,s,low,rest=anatomy(kind,height);meshes=[]
    # Both use a neutral civilian garment proxy, not either production character's face or costume material.
    cv,cf,cw,hidden=proxy(kind,'clothes/male_casualsuit01','male_casualsuit01',raw,g,s)
    # Resolve separated garment components so pants keep a distinct material.
    adjacency=[set() for _ in cv]
    for f in cf:
        for a,b in zip(f,f[1:]+f[:1]):adjacency[a].add(b);adjacency[b].add(a)
    seen=set();components=[]
    for start in range(len(cv)):
        if start in seen:continue
        stack=[start];seen.add(start);comp=set()
        while stack:
            i=stack.pop();comp.add(i)
            for j in adjacency[i]:
                if j not in seen:seen.add(j);stack.append(j)
        components.append(comp)
    top=[];pants=[]
    waist=rest['pelvis'][0][1]+height*.025
    for f in cf:
        (pants if cv[f,1].mean()<waist else top).append(f)
    # Keep material layers as real independent garment surfaces, never painted body regions.
    meshes.append(create(kind+'-garment-top',cv,top,cw,1,.35))
    meshes.append(create(kind+'-garment-trousers',cv,pants,cw,2,.35))
    visible=[f for f in FACES['body'] if not all(i in hidden for i in f)]
    shoes=[f for f in visible if all(g[i,1]<height*.077 for i in f)]
    exposed=[NAMES.index(n) for n in NAMES if n in ['head','jaw','neck'] or n.startswith(('hand_','thumb_','index_','middle_','ring_','little_'))]
    skin=[f for f in visible if f not in shoes and (WEIGHTS[f][:,exposed].sum(axis=1).mean()>.35 or g[f,1].mean()>height*.79)]
    hair=[];skin2=[]
    # Continuous anatomical scalp surface: no opaque hair-card rectangles in the study.
    def hairline(p):
        front=1/(1+math.exp(max(-30,min(30,(p[2]-(rest['head'][0][2]-.010))/(height*.012)))))
        return height*(.925+.041*front)-height*.006*min(1,(abs(p[0])/(height*.073))**2)
    for f in skin:
        c=g[f].mean(axis=0)
        ishair=c[1]>hairline(c)
        (hair if ishair else skin2).append(f)
    # The original polygon boundary made a stair-step cap. Move shared boundary
    # vertices onto one continuous hairline in both material regions.
    hair_ids={i for f in hair for i in f};skin_ids={i for f in skin2 for i in f}
    for i in hair_ids & skin_ids:g[i,1]=hairline(g[i])
    meshes.append(create(kind+'-face-neck-hands',g,skin2,WEIGHTS,0,.48))
    meshes.append(create(kind+'-scalp-hair',g,hair,WEIGHTS,4,.70))
    # Concealed toes form a closed shoe shell from anatomical topology. The study's authored details may be added by its viewer.
    foot=g.copy()
    for side in ['L','R']:
        center=rest['foot_'+side][0]
        for i in set(v for f in shoes for v in f):
            if (foot[i,0]<0)==(center[0]<0):
                foot[i,0]=center[0]+(foot[i,0]-center[0])*1.10
                foot[i,1]=max(.008,foot[i,1]*1.02)
    meshes.extend(shoe_envelopes(kind,foot,shoes,rest))
    ev,ef,ew,_=proxy(kind,'eyes/low-poly','low-poly',raw,g,s)
    meshes.append(create(kind+'-eyes',ev,ef,ew,5,.7))
    bones=[dict(name=n,parent=PARENTS[n],head=[round(float(x),6) for x in rest[n][0]],tail=[round(float(x),6) for x in rest[n][1]]) for n in NAMES]
    result=dict(version=1,id=kind,height=height,forward='-Z',up='+Y',bones=bones,meshes=meshes,materials=['skin','top','pants','shoe','hair','eye'],
      source=dict(anatomy='MakeHuman hm08 CC0',macro='official child macro' if kind=='boy' else '72% young / 28% old neutral adult study',clothing='CC0 male_casualsuit01 proxy fitted to actual anatomy',purpose='Clothed design maquette only; no identity assertion or production replacement'),
      stats=dict(vertices=sum(len(m['positions'])//3 for m in meshes),triangles=sum(len(m['indices'])//3 for m in meshes)))
    (OUT/(kind+'.json')).write_text(json.dumps(result,separators=(',',':')))
    print(kind,result['stats'],flush=True)

for kind,height in [('boy',1.35),('contractor',1.78)]:build(kind,height)
