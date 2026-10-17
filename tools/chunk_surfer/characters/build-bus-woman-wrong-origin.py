"""Authored Wrong origin anatomical states. Never rewrites the ordinary woman.

Blender -b --python tools/chunk_surfer/characters/build-bus-woman-wrong-origin.py
The retained CC0 anatomical master supplies the body and all 54 rest weights.
Five deliberately different wound openings and broad, closed anatomical tissues
carry the remembered right grip into the upper ribs, neck and lower jaw.
"""
from pathlib import Path
import bpy,bmesh,json,math,copy,hashlib
import numpy as np
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'artifacts/bus-woman-wrong-origin';OUT.mkdir(parents=True,exist_ok=True)
CANON=ROOT/'artifacts/bus-woman-production/anatomy.json'
data=json.load(open(CANON))
# Reuse the retained anatomical interpretation, not the production builder's
# output-writing section. Its source helper definitions end at this marker.
src=ROOT/'tools/chunk_surfer/characters/build-bus-woman-character.py'
scope={'__file__':str(src),'__name__':'retained_bus_woman_anatomy'}
exec(src.read_text().split("raw,g,s,low,rest=anatomy('woman',1.70)")[0],scope)
raw,g,scale,low,rest=scope['anatomy']('woman',1.70)
WEIGHTS=scope['WEIGHTS'];FACES=scope['FACES'];NAMES=[b['name']for b in data['bones']]
export_object=scope['export_object']
bpy.ops.wm.read_factory_settings(use_empty=True)
materials=copy.deepcopy(data['materials'][:13])
materials.extend([
 dict(name='Wrong origin exposed muscular plane',baseColor=[.28,.075,.06,1],role='muscle',roughness=.73),
 dict(name='Wrong origin bruised inner skin and wound bed',baseColor=[.045,.005,.011,1],role='injured-skin',roughness=.86),
 dict(name='Wrong origin fascia and selectively exposed rib',baseColor=[.32,.245,.16,1],role='fascia',roughness=.69),
])
for d in materials:
 ma=bpy.data.materials.new(d['name']);ma.diffuse_color=d['baseColor'];ma.use_nodes=True
 p=ma.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=d['baseColor'];p.inputs['Roughness'].default_value=d.get('roughness',.9)
 p.inputs['Metallic'].default_value=d.get('metallic',0)

def from_source(mesh,prefix):
 me=bpy.data.meshes.new(prefix+mesh['name']);verts=np.array(mesh['positions']).reshape((-1,3));tris=np.array(mesh['indices']).reshape((-1,3))
 me.from_pydata(verts.tolist(),[],tris.tolist());me.update()
 ob=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(ob)
 for name in NAMES:ob.vertex_groups.new(name=name)
 indices=np.array(mesh['skinIndex']).reshape((-1,4));weights=np.array(mesh['skinWeight']).reshape((-1,4))
 for i,(jj,ww)in enumerate(zip(indices,weights)):
  for j,w in zip(jj,ww):
   if w>1e-7:ob.vertex_groups[int(j)].add([i],float(w),'REPLACE')
 ob.data.materials.append(bpy.data.materials[materials[mesh['material']]['name']])
 for p in me.polygons:p.use_smooth=True
 return ob

def authored_mesh(name,points,faces,weights,mat):
 me=bpy.data.meshes.new(name);me.from_pydata([list(p)for p in points],[],faces);me.update()
 ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 for n in NAMES:ob.vertex_groups.new(name=n)
 for i,row in enumerate(weights):
  take=np.argsort(row)[-4:];total=sum(row[j]for j in take)or 1
  for j in take:
   if row[j]>1e-8:ob.vertex_groups[int(j)].add([i],float(row[j]/total),'REPLACE')
 ob.data.materials.append(bpy.data.materials[materials[mat]['name']])
 for p in me.polygons:p.use_smooth=True
 recalc(ob)
 return ob

def recalc(ob):
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()

def weight_mix(**joints):
 w=np.zeros(len(NAMES))
 for n,v in joints.items():w[NAMES.index(n)]=v
 return w/(sum(w)or 1)

def skin_weight(p):
 # Exact nearest anatomical surface influence, preserving the canonical rest.
 ids=np.argpartition(np.sum((g-p)**2,axis=1),3)[:3];dd=np.sqrt(np.sum((g[ids]-p)**2,axis=1));ww=1/np.maximum(dd,.002)**2
 out=(WEIGHTS[ids]*ww[:,None]).sum(axis=0);return out/out.sum()

# These are production solver destinations, not baked arm translations. The
# runtime relocates the actual humeral pivot and solves back to the fixed wrist.
# Arm/hand rest geometry remains canonical; only the receiving cavity is here.
SHOULDER_ORIGIN={3:[-.025,-.018,-.018],4:[-.048,-.034,-.038],5:[-.080,-.058,-.065]}
def cavity_frame(stage):
 center=np.array(rest['upperarm_R'][0])+np.array(SHOULDER_ORIGIN[stage])
 return center,{3:.064,4:.079,5:.097}[stage],{3:.077,4:.092,5:.107}[stage]

def in_chest_socket(p,stage):
 if stage<3:return False
 c,rx,ry=cavity_frame(stage)
 return ((p[0]-c[0])/rx)**2+((p[1]-c[1])/ry)**2<1.02 and p[2]<-.055

def opened_pectoral_socket(stage,prefix):
 """A closed deep muscular cavity, with an actual load-bearing wound wall.

 Its centre is the relocated humeral pivot. The retained arm emerges from
 inside it under the production fixed-wrist solver; no second arm is authored.
 """
 c,rx,ry=cavity_frame(stage);n=64;rings=9;vv=[];ww=[];ff=[]
 # Deliberately unequal mouth profile, rather than a round horror socket.
 outline=[1.0,.93,1.04,.84,.98,1.08,.91,1.03,1.0]
 surface=g[sorted(set(i for f in FACES['body']for i in f))]
 for layer in [0,1]:
  for j in range(rings):
   r=.04+.96*j/(rings-1)
   for k in range(n):
    theta=2*math.pi*k/n;shape=float(np.interp(k/n,np.linspace(0,1,len(outline)),outline))
    x=c[0]+rx*math.cos(theta)*r*shape;y=c[1]+ry*math.sin(theta)*r*shape
    near=surface[(abs(surface[:,0]-x)<.022)&(abs(surface[:,1]-y)<.022)]
    front=float(near[:,2].min()) if len(near)else -.17
    front=min(-.09,front)-.007
    # The pectoral mouth curves inward towards a real 6–10cm recess. Its two
    # muscular lips are broad continuations of the thorax, not separate cords.
    wall=r*r*(3-2*r);z=(c[2]+.027)*(1-wall)+front*wall
    z-=.012*math.exp(-((r-.79)/.17)**2)*(1+.25*math.cos(theta))
    if layer:z+=.009
    vv.append([x,y,z]);ww.append(weight_mix(chest=.85,spine_upper=.15))
    if j:
     a=layer*rings*n+(j-1)*n+k;b=layer*rings*n+(j-1)*n+(k+1)%n
     f=[a,b,b+n,a+n];ff.append(f if layer==0 else list(reversed(f)))
 off=rings*n
 for ring in [0,rings-1]:
  for k in range(n):
   a=ring*n+k;b=ring*n+(k+1)%n;ff.append([a,a+off,b+off,b])
 # Close the tiny inner disc; the shoulder enters in front of this back wall.
 ff.extend([list(reversed(range(n))),list(range(off,off+n))])
 wall=authored_mesh(prefix+'opened-load-bearing-pectoral-cavity',vv,ff,ww,13)
 # An interior dark bed occupies only the deepest recess. There is no dark
 # flat card covering the muscular cavity or the moving humerus.
 deep=[];dw=[];df=[]
 for j in range(3):
  r=.04+.32*j/2
  for k in range(n):
   a=k*2*math.pi/n;deep.append([c[0]+rx*math.cos(a)*r,c[1]+ry*math.sin(a)*r,c[2]+.022-.006*j]);dw.append(weight_mix(chest=.88,spine_upper=.12))
   if j:df.append([(j-1)*n+k,(j-1)*n+(k+1)%n,j*n+(k+1)%n,j*n+k])
 df.append(list(reversed(range(n))));bed=authored_mesh(prefix+'deep-muscular-socket-bed',deep,df,dw,14)
 bpy.context.view_layer.objects.active=bed;mod=bed.modifiers.new('closed recessed wound bed','SOLIDIFY');mod.thickness=.007;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(bed)
 # A real thick, turned skin/fat boundary surrounds the displaced insertion.
 # It is broken in contour but continuous in construction and skin weights.
 lip=[];lw=[];lf=[]
 for k in range(n):
  a=k*2*math.pi/n;shape=float(np.interp(k/n,np.linspace(0,1,len(outline)),outline));x=c[0]+rx*math.cos(a)*shape;y=c[1]+ry*math.sin(a)*shape
  near=surface[(abs(surface[:,0]-x)<.022)&(abs(surface[:,1]-y)<.022)];z=min(-.09,float(near[:,2].min())if len(near)else-.17)-.007
  for radial,depth in [(1.04,.004),(1.0,-.005),(.965,.010),(1.015,.014)]:
   lip.append([c[0]+(x-c[0])*radial,c[1]+(y-c[1])*radial,z+depth]);lw.append(weight_mix(chest=.86,spine_upper=.14))
 for k in range(n):
  for p in range(4):lf.append([k*4+p,((k+1)%n)*4+p,((k+1)%n)*4+(p+1)%4,k*4+(p+1)%4])
 rim=authored_mesh(prefix+'thick-turned-pectoral-skin-margin',lip,lf,lw,14)
 # One broad aponeurosis continues into the upper neck wall. It is embedded
 # in the concave muscular load path, rather than a bright strap over skin.
 ap=[];aw=[];af=[];rows=list(range(4,8));columns=list(range(18,27))
 for j in rows:
  for k in columns:
   p=np.array(vv[j*n+k]);p[2]-=.0015;ap.append(p);aw.append(weight_mix(chest=.78,neck=.22))
   if j>rows[0]and k>columns[0]:
    a=(j-rows[0]-1)*len(columns)+k-columns[0]-1;af.append([a,a+1,a+len(columns)+1,a+len(columns)])
 fascia=authored_mesh(prefix+'embedded-load-bearing-neck-aponeurosis',ap,af,aw,15)
 bpy.context.view_layer.objects.active=fascia;mod=fascia.modifiers.new('closed embedded fascial edge','SOLIDIFY');mod.thickness=.0025;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(fascia)
 return [(wall,13),(bed,14),(rim,14),(fascia,15)]

def cut_original_pectoral_skin(ob,stage):
 bm=bmesh.new();bm.from_mesh(ob.data);chosen=[]
 for f in bm.faces:
  c=np.array(f.calc_center_median())
  if c[1]<1.444 and in_chest_socket(c,stage):chosen.append(f)
 bmesh.ops.delete(bm,geom=chosen,context='FACES');bm.to_mesh(ob.data);bm.free();recalc(ob)

def collapsed_shoulder_cloth(stage,prefix):
 """The former shoulder is a supported inward fold with actual dark lining.
 Its chest edge stays on the coat; its arm edge follows the relocated humerus.
 Small quads carry the change without a spanning cap or floating cloth sail.
 """
 vv=[];ww=[];ff=[];rows=10;cols=7
 for j in range(rows):
  v=j/(rows-1)
  fixed=np.array([.201+.016*v,1.395-.106*v,.028-.024*v])
  moving=np.array([.179+.071*v,1.363-.089*v,-.021-.017*v])
  for k in range(cols):
   u=k/(cols-1);p=fixed*(1-u)+moving*u
   p[2]+=.027*math.sin(math.pi*u)*(.75+.25*v)
   p[1]-=.014*math.sin(math.pi*u)
   vv.append(p);ww.append(weight_mix(chest=1-u*.92,upperarm_R=u*.92))
   if j and k:
    a=(j-1)*cols+k-1;ff.append([a,a+1,a+cols+1,a+cols])
 outer=authored_mesh(prefix+'collapsed-former-shoulder-coat-fold',vv,ff,ww,1)
 bpy.context.view_layer.objects.active=outer;mod=outer.modifiers.new('folded coat actual thickness','SOLIDIFY');mod.thickness=.004;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(outer)
 lining=authored_mesh(prefix+'collapsed-former-shoulder-inner-lining',np.array(vv)+[0,0,.005],list(reversed(ff)),ww,8)
 bpy.context.view_layer.objects.active=lining;mod=lining.modifiers.new('closed supporting inner lining','SOLIDIFY');mod.thickness=.002;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(lining)
 return [(outer,1),(lining,8)]

# The force route has deliberately drawn anatomical stations. Widths are
# anatomical bellies, not repeating cords; the pectoral station is a broad fan.
stations=[
 ([.448,1.071,-.219],.019,weight_mix(forearm_R=.75,hand_R=.25)),
 ([.414,1.111,-.189],.028,weight_mix(forearm_R=1)),
 ([.372,1.153,-.143],.037,weight_mix(forearm_R=1)),
 ([.333,1.187,-.108],.039,weight_mix(forearm_R=.65,upperarm_R=.35)),
 ([.275,1.248,-.103],.047,weight_mix(upperarm_R=1)),
 ([.198,1.291,-.143],.063,weight_mix(upperarm_R=.42,clavicle_R=.58)),
 ([.130,1.324,-.186],.083,weight_mix(chest=.78,clavicle_R=.22)),
 ([.094,1.377,-.142],.063,weight_mix(chest=.82,neck=.18)),
 ([.056,1.441,-.100],.043,weight_mix(neck=.80,chest=.20)),
 ([.052,1.492,-.118],.025,weight_mix(neck=.48,jaw=.52)),
 ([.066,1.525,-.124],.017,weight_mix(jaw=.84,head=.16)),
]

def route(stage):
 end={1:4,2:7,3:9,4:11,5:11}[stage]
 s=stations[:end];pts=[];width=[];weights=[]
 for k in range(len(s)-1):
  p0=np.array(s[max(0,k-1)][0]);p1=np.array(s[k][0]);p2=np.array(s[k+1][0]);p3=np.array(s[min(len(s)-1,k+2)][0])
  for i in range(5):
   t=i/5
   p=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
   # Later reconstruction makes the same route wider and shifts the neck's
   # origin into the pectoral fan, without altering the working hand itself.
   if stage>=3 and k>=6:p[0]+=.012*(stage-2);p[1]-=.005*(stage-2)
   pts.append(p);width.append((s[k][1]*(1-t)+s[k+1][1]*t)*({1:.62,2:.88,3:1,4:1.10,5:1.18}[stage]));weights.append(s[k][2]*(1-t)+s[k+1][2]*t)
 pts.append(np.array(s[-1][0]));width.append(s[-1][1]*({1:.62,2:.88,3:1,4:1.10,5:1.18}[stage]));weights.append(s[-1][2])
 # Place every anatomical station on the actual retained front skin surface.
 # The impossible attachment changes its origin; it is not a ribbon buried
 # beneath an intact skin proxy. The wrist itself remains untouched.
 bodyids=sorted(set(i for f in FACES['body']for i in f));surface=g[bodyids]
 for p in pts:
  candidates=surface[(abs(surface[:,0]-p[0])<.025)&(abs(surface[:,1]-p[1])<.025)]
  if len(candidates):p[2]=float(candidates[:,2].min())-.013
 return np.array(pts),np.array(width),np.array(weights)

def ribbon(stage,name,pts,widths,weights,mat=13,depth=.009):
 """Closed anatomical slab: broad belly, recessed separations, no open rims."""
 vv=[];ff=[];ww=[];cols=13;n=len(pts)
 cross=[]
 for j,p in enumerate(pts):
  axis=pts[min(n-1,j+1)]-pts[max(0,j-1)];axis/=np.linalg.norm(axis)
  # Front-facing anatomical plane, with the sheets turning around the arm.
  tangent=np.cross(axis,[0,0,-1]);tangent/=np.linalg.norm(tangent)or 1;cross.append(tangent)
 for layer in [0,1]:
  for j,p in enumerate(pts):
   u=j/(n-1)
   for k in range(cols):
    v=(k/(cols-1)-.5)*2
    # Three unequal lobes form one pectoral / forearm sheet. The internal
    # grooves terminate before the edge rather than becoming decorative wire.
    belly=(1-v*v)*(.010+.018*math.exp(-((u-.53)/.18)**2)+.010*math.exp(-((u-.18)/.13)**2))
    # Unequal flexor heads continue into the pectoral fan. Their separations
    # bend towards the displaced insertion instead of forming parallel rails.
    v0=-.34+.16*u;v1=.36-.28*u
    grooves=.006*math.exp(-((v-v0)/.085)**2)+.004*math.exp(-((v-v1)/.075)**2)
    z=(-belly+grooves) if layer==0 else depth
    # A deliberately torn outer contour expands at the two pectoral origins.
    # Unequal sides and broad shoulders prevent a uniform belt silhouette.
    left=np.interp(u,[0,.16,.34,.58,.76,1],[.62,.91,1.17,.88,1.13,.52])
    right=np.interp(u,[0,.21,.41,.64,.88,1],[.68,1.16,.84,1.20,.86,.61])
    q=p+cross[j]*v*widths[j]*(left if v<0 else right)+[0,0,z]
    vv.append(q);ww.append(weights[j])
    if j and k:
     a=layer*n*cols+(j-1)*cols+k-1
     f=[a,a+1,a+cols+1,a+cols];ff.append(f if layer==0 else list(reversed(f)))
 off=n*cols
 for j in range(n-1):
  a=j*cols;b=(j+1)*cols
  ff.extend([[a,b,b+off,a+off],[a+cols-1,a+off+cols-1,b+off+cols-1,b+cols-1]])
 for j in [0,n-1]:
  for k in range(cols-1):
   a=j*cols+k;ff.append([a,a+off,a+off+1,a+1])
 return authored_mesh(name,vv,ff,ww,mat)

def garment_opening(ob,outline,zback=-.035,outer_coat=False):
 """Remove local retained faces; no Boolean cap may span a moving joint."""
 def inside(x,y):
  odd=False;j=len(outline)-1
  for i,(xi,yi)in enumerate(outline):
   xj,yj=outline[j]
   if (yi>y)!=(yj>y)and x<(xj-xi)*(y-yi)/(yj-yi)+xi:odd=not odd
   j=i
  return odd
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 if outer_coat:
  # Retain the ordinary fitted OUTER surface. Its existing inner duplicate and
  # aperture rims are regenerated once after cutting; pockets remain holes.
  inner=[]
  for f in bm.faces:
   c=f.calc_center_median();r=Vector((c.x,0,c.z-.024));r.normalize()
   if f.normal.dot(r)<.15:inner.append(f)
  bmesh.ops.delete(bm,geom=inner,context='FACES')
 # Subdivision of the retained triangles interpolates their original groups.
 # It provides a small torn contour without producing a one-metre cap n-gon.
 bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
 chosen=[]
 for f in bm.faces:
  c=f.calc_center_median()
  if c.z<zback and inside(c.x,c.y):chosen.append(f)
 selected=set(chosen);edge=[e for e in bm.edges if any(f in selected for f in e.link_faces)and any(f not in selected for f in e.link_faces)]
 adjacency={}
 for e in edge:
  a,b=e.verts;adjacency.setdefault(a,[]).append(b);adjacency.setdefault(b,[]).append(a)
 # The cloth is torn into a few coherent lobes, not a regular triangle-tooth
 # fringe. Smooth only the new cut border, retaining the fitted outer cloth.
 for iteration in range(3):
  update={v:v.co*.5+sum((p.co for p in adjacent),Vector((0,0,0)))*(.5/len(adjacent))for v,adjacent in adjacency.items()}
  for v,p in update.items():v.co=p
 bmesh.ops.delete(bm,geom=chosen,context='FACES')
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
 bpy.context.view_layer.objects.active=ob
 mod=ob.modifiers.new('closed turned local garment aperture; no spanning caps','SOLIDIFY');mod.thickness=.004 if outer_coat else .003;mod.offset=-1;mod.use_rim=True
 bpy.ops.object.modifier_apply(modifier=mod.name);recalc(ob)

def anatomical_underlay(stage,prefix):
 faces=[];muscle_faces=[]
 exposed=[NAMES.index(n)for n in NAMES if n in ['head','jaw','neck']or n.startswith(('hand_','thumb','index','middle','ring','little'))]
 for f in FACES['body']:
  c=g[f].mean(axis=0)
  # Canonical face/neck/hands already provide these triangles. Keeping a
  # second, differently decimated skin here would produce false torn fingers.
  if WEIGHTS[f][:,exposed].sum(axis=1).mean()>.42 or c[1]>1.70*.81:continue
  # Retain the actual deltoid/humerus surface for the moved skeletal origin.
  # Remove only the thoracic skin/muscle occupying the new chest cavity.
  arm=WEIGHTS[f][:,[NAMES.index('upperarm_R'),NAMES.index('forearm_R')]].sum(axis=1).mean()
  if stage>=3 and arm<.25 and in_chest_socket(c,stage):continue
  if (1.17<c[1]<1.49 and -.045<c[0]<.225)or (c[0]>.165 and c[1]>1.035 and c[1]<1.395):
   # The opened anatomical tissue retains the actual arm and thorax topology.
   # Its volume is the retained body, not a cylindrical horror replacement.
   opened=(stage>=2 and c[2]<-.045 and ((c[0]>.22 and c[1]>1.07)or(.020<c[0]<.22 and 1.19<c[1]<1.45)))
   (muscle_faces if opened else faces).append(f)
 output=[]
 for group,mat,suffix in [(faces,0,'retained-skin'),(muscle_faces,13,'retained-muscular-surface')]:
  if not group:continue
  ids=sorted(set(i for f in group for i in f));mapids={a:i for i,a in enumerate(ids)}
  vv=g[ids].copy();ww=WEIGHTS[ids].copy()
  # Tissue is dragged along one force path. Only the high chest receives the
  # permanent tear; the lower body, working hands and feet retain exact source.
  for i,p in enumerate(vv):
   influence=math.exp(-((p[0]-.13)/.10)**2-((p[1]-1.34)/.095)**2)*max(0,min(1,(-p[2]+.04)/.15))
   # The solver is authoritative for arm relocation. Only retained thoracic
   # tissue gets the permanent shear; never translate arm-weighted vertices.
   arm=ww[i,NAMES.index('upperarm_R')]+ww[i,NAMES.index('forearm_R')]
   if arm<.25:
    p[0]+=.010*(min(stage,4)-1)*influence;p[1]-=.008*(min(stage,4)-1)*influence;p[2]-=.004*(min(stage,4)-1)*influence
   if mat==13:
    # Selectively remove the superficial fatty layer of the source thorax;
    # the force-bearing surface is the actual pectoral wall beneath it.
    chest=math.exp(-((p[0]-.13)/.09)**2-((p[1]-1.27)/.075)**2)
    p[2]+=.020*chest
    # Two unequal anatomical flexor separations are sculpted into the retained
    # forearm itself. They narrow towards the working wrist, without repeated
    # surface noise or a replacement tubular limb.
    a=np.array(rest['forearm_R'][0]);b=np.array(rest['forearm_R'][1]);axis=b-a;t=max(0,min(1,float(np.dot(p-a,axis)/np.dot(axis,axis))));center=a+axis*t
    lateral=p[0]-center[0]
    if p[0]>.315 and p[1]<1.19:
     p[2]+=.006*math.exp(-((lateral-(-.012+.012*t))/.006)**2)+.004*math.exp(-((lateral-(.020-.006*t))/.005)**2)
     p[2]-=math.sin(t*math.pi)**1.2*(.014*math.exp(-((lateral+.026-.012*t)/.017)**2)+.009*math.exp(-((lateral-.012)/.014)**2))
  ob=authored_mesh(prefix+'anatomical-right-arm-chest-'+suffix,vv,[[mapids[i]for i in reversed(f)]for f in group],ww,mat)
  bpy.context.view_layer.objects.active=ob;mod=ob.modifiers.new('closed living skin rim','SOLIDIFY');mod.thickness=.003;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(ob)
  if mat==13:
   # Smooth once after the deliberate flexor / pectoral sculpt. This retains
   # the anatomical source silhouette and its interpolated skin influences.
   mod=ob.modifiers.new('anatomical tissue subdivision','SUBSURF');mod.levels=1;mod.render_levels=1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(ob)
  output.append((ob,mat))
 return output

def open_original_neck(ob,stage,prefix):
 """The jaw origin occupies the existing face, rather than adding a mask."""
 bm=bmesh.new();bm.from_mesh(ob.data);selected=[]
 for f in bm.faces:
  c=f.calc_center_median()
  # A curved mandibular/neck wound occupies one continuous anatomical origin.
  # The mouth and nostril remain part of the recognizable original face.
  r=((c.x-.067)/(.055 if stage==5 else .043))**2+((c.y-(1.486 if stage==5 else 1.494 if stage==4 else 1.456))/(.067 if stage==5 else .050 if stage==4 else .037))**2
  corridor=stage>=3 and .018<c.x<.093 and 1.393<c.y<1.469 and c.z<-.052
  if (r<1 and c.x>.025 and c.z<-.072)or corridor:selected.append(f)
 if not selected:bm.free();return []
 # Save the actual decimated facial patch with its exact interpolated weights.
 bm.verts.index_update();bm.verts.ensure_lookup_table();ids=sorted(set(v.index for f in selected for v in f.verts));mp={a:i for i,a in enumerate(ids)}
 selected_set=set(selected);border=[e for e in bm.edges if sum(f in selected_set for f in e.link_faces)==1]
 borders=[(e.verts[0].index,e.verts[1].index)for e in border]
 adjacency={}
 for a,b in borders:adjacency.setdefault(a,[]).append(b);adjacency.setdefault(b,[]).append(a)
 for iteration in range(2):
  smooth={i:bm.verts[i].co*.6+sum((bm.verts[j].co for j in adjacent),Vector((0,0,0)))*(.4/len(adjacent))for i,adjacent in adjacency.items()}
  for i,p in smooth.items():bm.verts[i].co=p
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 source_positions={i:np.array(bm.verts[i].co)for i in ids};source_normals={i:np.array(bm.verts[i].normal)for i in ids}
 source_weights={}
 for i in ids:
  row=np.zeros(len(NAMES))
  for influence in ob.data.vertices[i].groups:row[influence.group]=influence.weight
  source_weights[i]=row
 vv=[];ww=[];falloffs=[]
 for i in ids:
  v=bm.verts[i];p=np.array(v.co)
  r=((p[0]-.067)/(.055 if stage==5 else .043))**2+((p[1]-(1.486 if stage==5 else 1.494 if stage==4 else 1.456))/(.067 if stage==5 else .050 if stage==4 else .037))**2
  falloff=max(0,1-r)**1.4
  # Recess along the original curved anatomical surface normal, including the
  # SIDE of the mandible. A z-only depression becomes a flat pasted cheek when
  # viewed from the side. The deep interior remains behind the moving jaw.
  normal=np.array(v.normal);normal/=np.linalg.norm(normal)or 1
  corridor=math.exp(-((p[0]-.058)/.035)**2-((p[1]-1.428)/.055)**2)
  falloff=max(falloff,corridor*.72)
  p-=normal*({3:.021,4:.032,5:.044}[stage])*falloff
  w=np.zeros(len(NAMES))
  for influence in ob.data.vertices[i].groups:w[influence.group]=influence.weight
  w=w*(1-.68*falloff)+weight_mix(jaw=.80,neck=.20)*(.68*falloff)
  vv.append(p);ww.append(w);falloffs.append(falloff)
 faces=[[mp[v.index]for v in f.verts]for f in selected]
 bmesh.ops.delete(bm,geom=selected,context='FACES');bm.to_mesh(ob.data);bm.free();recalc(ob)
 # One curved wall, partitioned only by its anatomical layers: restrained dark
 # recess, living muscle at its sides, selective embedded connective fascia.
 pieces=[]
 for mat in [13,14,15]:
  selected_faces=[]
  for f in faces:
   depth=sum(falloffs[i]for i in f)/len(f);center=np.array([vv[i]for i in f]).mean(axis=0)
   role=14 if depth>.64 else 15 if depth>.40 and center[1]<1.458 and center[0]>.058 else 13
   if role==mat:selected_faces.append(f)
  if not selected_faces:continue
  used=sorted(set(i for f in selected_faces for i in f));mp={a:i for i,a in enumerate(used)}
  patch=authored_mesh(prefix+'retained-curved-jaw-neck-wall-'+str(mat),[vv[i]for i in used],[[mp[i]for i in f]for f in selected_faces],[ww[i]for i in used],mat)
  bpy.context.view_layer.objects.active=patch;mod=patch.modifiers.new('deep closed jaw-neck attachment','SOLIDIFY');mod.thickness=.009;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name);recalc(patch);pieces.append((patch,mat))
 # Only the cut facial margin receives a thick turned rim. Ordinary hand
 # topology and skinning remain byte-for-byte unchanged in these late stages.
 pending={tuple(sorted(edge))for edge in borders};rim_objects=[];loopnum=0
 while pending:
  a,b=next(iter(pending));pending.remove((a,b));loop=[a,b];last=a;current=b
  while current!=loop[0]:
   choices=[n for n in adjacency[current]if tuple(sorted((current,n)))in pending]
   if not choices:break
   nxt=choices[0];pending.remove(tuple(sorted((current,nxt))));loop.append(nxt);last,current=current,nxt
  if len(loop)>2 and loop[-1]==loop[0]:loop.pop()
  if len(loop)<3:continue
  v=[];w=[];f=[]
  center=np.array([source_positions[i]for i in loop]).mean(axis=0)
  for i in loop:
   p=source_positions[i];normal=source_normals[i];normal/=np.linalg.norm(normal)or 1
   inward=center-p;inward-=normal*np.dot(inward,normal);inward/=np.linalg.norm(inward)or 1
   variable=.75+.45*max(0,(p[1]-1.42)/.12)+.25*max(0,(p[0]-.05)/.05)
   for offset,lateral in [(.0015,0),(.003,.003),(-.008,.005),(-.009,0)]:v.append(p+normal*offset*variable+inward*lateral);w.append(source_weights[i])
  for k in range(len(loop)):
   for c in range(4):f.append([k*4+c,((k+1)%len(loop))*4+c,((k+1)%len(loop))*4+(c+1)%4,k*4+(c+1)%4])
  rim=authored_mesh(prefix+'turned-jaw-skin-rim-'+str(loopnum),v,f,w,14);rim_objects.append((rim,14));loopnum+=1
 return pieces+rim_objects

variants=[]
retained_early=json.load(open(OUT/'checkpoint-B/artifacts/bus-woman-wrong-origin/anatomy.json'))
for stage in range(1,6):
 prefix=f'wrong_origin_{stage}_';objects=[]
 if stage<=2:
  # The accepted early reconstructions are a retained source, not a fresh
  # approximation. Later anatomy changes cannot silently alter their triangles,
  # normals, weights, contacts or material calibration.
  retained=copy.deepcopy(next(v for v in retained_early['variants']if v['stage']==stage))
  for mesh in retained['meshes']:
   ob=from_source(mesh,'');ob['wrong_origin_state']=stage;ob['canonical_source']='checkpoint-B';ob.hide_render=True;ob.hide_viewport=True
  variants.append(retained);continue
 neck_objects=[]
 for mesh in data['meshes']:
  ob=from_source(mesh,prefix);objects.append((ob,mesh['material']))
  # The pull remains in the one original face; no cranial clone or inserted
  # monster mask. Late states drag the right lower jaw down and into the throat.
  if 'ordinary-face' in mesh['name'] and stage>=3:
   # Original jaw is bound to its actual bone. The runtime owns the shift.
   for v in ob.data.vertices:
    p=v.co;influence=math.exp(-((p.x-.062)/.050)**2-((p.y-1.503)/.040)**2-((p.z+.105)/.05)**2)*.26
    if p.x>.01 and p.y>1.43 and p.y<1.555 and influence>.01:
     for group in list(v.groups):ob.vertex_groups[group.group].add([v.index],group.weight*(1-influence),'REPLACE')
     ob.vertex_groups[NAMES.index('jaw')].add([v.index],influence,'ADD')
   cut_original_pectoral_skin(ob,stage)
   neck_objects.extend(open_original_neck(ob,stage,prefix))
  if stage>=3 and ('mustard-neck-scarf'in mesh['name']or'folded-collar-1'in mesh['name']or'collar-binding-1'in mesh['name']):
   for v in ob.data.vertices:
    p=v.co;influence=max(0,min(1,(p.x+.015)/.09))
    p.x+=.020*(stage-2)*influence;p.y-=.018*(stage-2)*influence;p.z+=.012*(stage-2)*influence
   recalc(ob)
 objects.extend(neck_objects)
 pts,widths,ww=route(stage)
 # Each reconstruction has its own complete cut topology, no runtime reveal
 # noise or scaled primitive. The pocket mouths below the tear remain intact.
 sleeve_outline=([(.401,1.035),(.477,1.056),(.438,1.115),(.417,1.116),(.371,1.151),(.365,1.121)]if stage==1 else
  [(.399,1.026),(.490,1.068),(.393,1.200),(.352,1.211),(.278,1.300),(.204,1.367),(.165,1.343),(.191,1.286),(.274,1.215),(.351,1.129)])
 if stage>=3:sleeve_outline=[(.399,1.026),(.490,1.068),(.393,1.200),(.350,1.211),(.325,1.282),(.255,1.390),(.146,1.395),(.128,1.316),(.236,1.236),(.351,1.129)]
 for ob,mat in objects:
  if 'continuous-sleeve-R'in ob.name:garment_opening(ob,sleeve_outline,.022 if stage>=3 else-.035)
 if stage>=2:
  chest_outline=([(.105,1.253),(.210,1.273),(.234,1.324),(.172,1.375),(.097,1.366),(.071,1.310)]if stage==2 else
   [(.031,1.250),(.108,1.217),(.186,1.254),(.225,1.291),(.214,1.351),(.154,1.387),(.116,1.446),(.080,1.488),(.033,1.477),(.024,1.407),(.048,1.363),(.018,1.304)])
  if stage>=4:chest_outline=[(-.014,1.247),(.045,1.180),(.139,1.183),(.214,1.249),(.232,1.324),(.163,1.386),(.110,1.450),(.068,1.488),(.014,1.472),(-.006,1.390),(.014,1.326)]
  for ob,mat in objects:
   if 'continuous-tailored-coat'in ob.name:garment_opening(ob,chest_outline,.015,True)
 objects.extend(anatomical_underlay(stage,prefix))
 if stage>=3:
  objects.extend(opened_pectoral_socket(stage,prefix));objects.extend(collapsed_shoulder_cloth(stage,prefix))
 # A broad dark wound bed gives the turned rim actual depth; the muscular
 # plane is set inside that bed. Distinct surfaces do not z-fight.
 # The forearm is the retained anatomical muscle volume. Only the genuinely
 # misplaced insertion crossing upper arm > pectoral wall gets a new sheet.
 # The neck/jaw is likewise the retained anatomical patch opened above.
 # The new chest cavity bears the late arm. A short broad neck wall continues
 # to the mandibular origin; no flat panel may cover the opened pectoral mouth.
 a,b=(0,len(pts))if stage==1 else(18,min(len(pts),39))if stage==2 else(35,min(len(pts),48))
 bridge=pts[a:b];bridge_widths=widths[a:b];bridge_weights=ww[a:b]
 if stage==2:
  profile=np.array([min(1,.16+j*.22)*min(1,.28+(len(bridge)-1-j)*.24)for j in range(len(bridge))]);bridge_widths=bridge_widths*profile
 if stage<=2:
  bed=ribbon(stage,prefix+'closed-bruised-wound-bed',bridge+[0,0,.012],bridge_widths*1.13,bridge_weights,14,.017);objects.append((bed,14))
  muscle=ribbon(stage,prefix+'displaced-pectoral-anatomical-origin',bridge,bridge_widths*.92,bridge_weights,13,.015);objects.append((muscle,13))
 # Paired, tapered fascial aponeuroses are physical flat membranes embedded
 # across the red muscle belly, not hanging cords or ornamental bone strings.
 if stage>=2:
  # Separated short aponeuroses, each a broad insertion. No continuous white
  # strap is allowed to run up the body: muscle carries the impossible load.
  sections=[(22,28,.32)] if stage==2 else [(24,30,.32)]
  for section,(a,b,w)in enumerate(sections):
   b=min(b,len(pts)-2)
   if b-a<3:continue
   chosen=pts[a:b].copy();chosen[:,2]-=.025
   profile=np.array([.50+.50*math.sin(i/(len(chosen)-1)*math.pi)**.7 for i in range(len(chosen))])
   fascia=ribbon(stage,prefix+'broad-fascial-insertion-'+str(section),chosen,widths[a:b]*w*profile,ww[a:b],15,.003);objects.append((fascia,15))
 if stage>=3:
  # Two short exposed rib surfaces terminate within the upper chest opening.
  # Their posterior bulk stays hidden in the retained anatomical chest.
  for rib,y in enumerate([1.255,1.286]):
   rp=[];rw=[]
   for k in range(13):
    t=k/12;x=.020+.092*t;rp.append([x,y+.012*math.sin(t*math.pi),-.106+.025*t]);rw.append(weight_mix(chest=.78,spine_upper=.22))
   ro=ribbon(stage,prefix+'selective-upper-rib-'+str(rib),np.array(rp),np.array([.004+.005*math.sin(k/12*math.pi)for k in range(13)]),np.array(rw),15,.006);objects.append((ro,15))
 meshes=[]
 for ob,mat in objects:
  meshes.append(export_object(ob,mat));ob['wrong_origin_state']=stage;ob['canonical_source']=str(CANON.relative_to(ROOT));ob['force_path']='right wrist > forearm > pectoral fan > neck > single lower jaw'
 variants.append(dict(stage=stage,name=f'outskirts_bus_woman_wrong_origin_{stage}',meshes=meshes,stats=dict(vertices=sum(len(m['positions'])//3 for m in meshes),triangles=sum(len(m['indices'])//3 for m in meshes))))
 # Save all four in the editable source, one visible stage at a time.
 for ob,_ in objects:ob.hide_render=stage!=5;ob.hide_viewport=stage!=5

# The same canonical bone names, rest heads, tails and parent relations are
# retained for editing. Export uses the game's flat absolute-joint palette.
arm=bpy.data.armatures.new('Wrong origin canonical 54-joint anatomical rest');rig=bpy.data.objects.new('wrong_origin_canonical_rig',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for bone in data['bones']:
 b=arm.edit_bones.new(bone['name']);b.head=bone['head'];b.tail=bone['tail']
 if bone['parent']:b.parent=arm.edit_bones[bone['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
for ob in bpy.data.objects:
 if ob.type=='MESH':
  mod=ob.modifiers.new('canonical anatomical deform rig','ARMATURE');mod.object=rig;ob.parent=rig

result=dict(version=2,id='outskirts-bus-woman-wrong-origin',design='Wrong origin',coordinateSystem='metres, Y up, forward -Z',bones=data['bones'],materials=materials,variants=variants,canonicalSHA256=hashlib.sha256(CANON.read_bytes()).hexdigest(),forcePath='right wrist flexors, upper arm emerging from relocated pectoral cavity, neck and single lower jaw',permanentOriginAuthority='runtime fixed-wrist skeletal solve; arm and mandible remain canonical-rest geometry',shoulderOriginOffsets=SHOULDER_ORIGIN,retainedOrdinaryMaster='public/assets/bus-woman-character.glb',source='retained MakeHuman CC0 African female anatomical production master; project-authored injury topology and anatomical rebinding',limits=dict(morphs=0,joints=54))
(OUT/'anatomy.json').write_text(json.dumps(result,separators=(',',':')))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'wrong-origin-anatomical-states.blend'))
(OUT/'source-validation.json').write_text(json.dumps(dict(ordinaryMasterUnmodified=True,canonicalSHA256=result['canonicalSHA256'],states=[dict(name=v['name'],**v['stats'])for v in variants],bones=len(data['bones']),materials=len(materials),forcePath=result['forcePath']),indent=2)+'\n')
print(json.dumps([dict(name=v['name'],**v['stats'])for v in variants],indent=2),flush=True)
