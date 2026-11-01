"""Dedicated Missing Man: retained anatomical envelopes; bespoke thick costume.
CPU-only Blender authoring/export. Never rebakes or overwrites shared characters.
Metres, glTF +Y up / -Z forward. Mesh and armature object transforms are identity.
"""
from pathlib import Path
import bpy, bmesh, math, json, struct, hashlib
import numpy as np
from mathutils import Vector, Matrix, Quaternion, kdtree

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/assets/tower-warning-missing-man.glb'
META=ROOT/'public/assets/tower-warning-missing-man.stats.json'
SOURCE=ROOT/'public/assets/outskirts-characters.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
FPS=60
bpy.context.scene.render.fps=FPS
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
body=next(o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('outskirts_overprint_body'))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
def B(p):return Vector((p[0],-p[2],p[1]))
def G(p):return np.array((p[0],p[2],-p[1]),float)
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def smoother(x):x=max(0,min(1,x));return x*x*x*(x*(x*6-15)+10)
if arm.animation_data:arm.animation_data.action=None
for p in arm.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
rest={b.name:(b.head_local.copy(),b.tail_local.copy(),b.matrix_local.copy())for b in arm.data.bones}
for o in list(bpy.data.objects):
 if o not in [body,arm]:bpy.data.objects.remove(o,do_unlink=True)
body.parent=arm;body.matrix_parent_inverse=Matrix.Identity(4);body.matrix_basis=Matrix.Identity(4)
if body.data.shape_keys:body.shape_key_clear()
for a in list(bpy.data.actions):bpy.data.actions.remove(a)

materials={}
def material(name,color,rough=.85):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=0
 m.diffuse_color=(*color,1);materials[name]=m;return m
core=material('warning_negative_core',(0,0,0),1)
core['characterRole']='warning-negative-core';core['opaqueNegativeVolume']=True
skin=next(m for m in body.data.materials if m.name.startswith('skin_player')).copy();skin.name='warning_hand_skin';materials[skin.name]=skin
boot=next(m for m in body.data.materials if m.name=='leather').copy();boot.name='warning_boot_leather';materials[boot.name]=boot
material('warning_coat_wool',(.15,.147,.135),.86)
material('warning_felt_trilby',(.105,.102,.092),.93)
material('warning_lining',(.045,.041,.034),.72)
material('warning_ribbon',(.038,.036,.031),.79)
material('warning_cigarette_paper',(.69,.63,.47),.85)
material('warning_cigarette_filter',(.34,.18,.066),.86)
material('warning_ash',(.13,.12,.10),1)
ember=material('warning_ember',(.42,.065,.008),.9)
ep=ember.node_tree.nodes.get('Principled BSDF');ep.inputs['Emission Color'].default_value=(1,.16,.015,1);ep.inputs['Emission Strength'].default_value=.8

# Real embedded material maps, with factor1: charcoal is not multiplied twice.
def texture_surface(name,base,rough,kind):
 m=materials[name];nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF')
 n=512;yy,xx=np.mgrid[0:n,0:n];rng=np.random.default_rng(8821 if kind=='wool' else 8822)
 grain=rng.normal(0,1,(n,n));broad=np.sin(xx*.034+yy*.017)*np.sin(yy*.049)
 weave=np.sin(xx*np.pi*.5+np.sign(np.sin(yy*.08))*yy*.54)*np.sin(yy*np.pi*.5)
 height=grain*.045+weave*(.075 if kind=='wool' else .018)
 variation=grain*.007+broad*.008+weave*.004
 al=np.ones((n,n,4),dtype=np.float32);linear=np.clip(np.array(base)+variation[:,:,None],.015,.4)
 # Packed generated PNG pixels are sRGB samples. Encode the intended physical
 # linear reflectance; storing .15 directly would decode to only .0196.
 al[:,:,:3]=np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055)
 dx=np.roll(height,-1,1)-np.roll(height,1,1);dy=np.roll(height,-1,0)-np.roll(height,1,0)
 nm=np.stack((-dx,-dy,np.ones_like(dx)),2);nm/=np.linalg.norm(nm,axis=2)[:,:,None]
 normal=np.ones_like(al);normal[:,:,:3]=nm*.5+.5
 orm=np.ones_like(al);orm[:,:,0]=.97;orm[:,:,1]=np.clip(rough+grain*.012,.6,1);orm[:,:,2]=0
 def image(suffix,pixels,noncolor=False):
  im=bpy.data.images.new(name+'_'+suffix,width=n,height=n,alpha=True);im.pixels.foreach_set(pixels.ravel());im.pack()
  if noncolor:im.colorspace_settings.name='Non-Color'
  tex=nodes.new('ShaderNodeTexImage');tex.image=im;return tex
 at=image('albedo',al);links.new(at.outputs['Color'],p.inputs['Base Color']);p.inputs['Base Color'].default_value=(1,1,1,1)
 nt=image('normal',normal,True);normal_node=nodes.new('ShaderNodeNormalMap');normal_node.inputs['Strength'].default_value=.38;links.new(nt.outputs['Color'],normal_node.inputs['Color']);links.new(normal_node.outputs['Normal'],p.inputs['Normal'])
 ot=image('orm',orm,True);sep=nodes.new('ShaderNodeSeparateColor');links.new(ot.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],p.inputs['Roughness'])
texture_surface('warning_coat_wool',(.15,.147,.135),.86,'wool')
texture_surface('warning_felt_trilby',(.105,.102,.092),.93,'felt')

# Preserve the actual anatomical hand and boot topology/envelopes. All internal
# anatomy/clothing is an opaque hull; no eyes, shirt or mouth can reflect light.
old_mats=list(body.data.materials);old_polygon_materials=[p.material_index for p in body.data.polygons];old_groups={g.index:g.name for g in body.vertex_groups}
right_names={'hand_R','thumb_R','index_R','middle_R','ring_R','little_R'}
new_slots=[core,skin,boot]
body.data.materials.clear()
for m in new_slots:body.data.materials.append(m)
hair_faces=[]
for p in body.data.polygons:
 old=old_mats[old_polygon_materials[p.index]].name
 if old=='short_hair':hair_faces.append(p.index);continue
 p.material_index=2 if old in ['leather','sole'] else 0
 if old.startswith('skin_player'):
  has=[sum(g.weight for g in body.data.vertices[v].groups if old_groups.get(g.group) in right_names) for v in p.vertices]
  if min(has)>.48:p.material_index=1
bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i]for i in hair_faces],context='FACES');bm.to_mesh(body.data);bm.free();body.data.update()
body.name='tower_warning_missing_man';body.data.name=body.name

# Source envelope transfer keeps source anatomical shoulder/elbow axes.
tree=kdtree.KDTree(len(body.data.vertices));weight_rows=[]
for v in body.data.vertices:
 tree.insert(v.co,v.index);weight_rows.append({old_groups[g.group]:g.weight for g in v.groups if g.group in old_groups})
tree.balance()
def weights_at(p):return weight_rows[tree.find(B(p))[1]].copy()
parts=[body]
def mesh(name,verts,faces,mat,weights=None,uv=None,thickness=0):
 me=bpy.data.meshes.new(name);me.from_pydata([B(v)for v in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(materials[mat])
 layer=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  poly.use_smooth=True
  for li,vi in zip(poly.loop_indices,poly.vertices):layer.data[li].uv=uv[vi] if uv else (verts[vi][0]*6,verts[vi][1]*6)
 rows=weights if weights else [weights_at(p)for p in verts]
 groups={n:o.vertex_groups.new(name=n)for n in {n for row in rows for n in row}}
 for i,row in enumerate(rows):
  total=sum(row.values())or 1
  for n,w in row.items():groups[n].add([i],w/total,'REPLACE')
 if mat.startswith('warning_coat')or mat=='warning_lining':
  marker=o.vertex_groups.new(name='_coat_surface');marker.add(list(range(len(verts))),1,'REPLACE')
 if 'lapel'in name or 'collar'in name:
  marker=o.vertex_groups.new(name='_collar_surface');marker.add(list(range(len(verts))),1,'REPLACE')
 if thickness:
  mod=o.modifiers.new('Bound cloth thickness','SOLIDIFY');mod.thickness=thickness;mod.offset=0;mod.use_even_offset=True
  bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
 parts.append(o);return o

def tube(name,points,radii,mat,weight=None,sides=24,thickness=0):
 verts=[];uv=[]
 for j,p0 in enumerate(points):
  p=np.array(p0,float);t=np.array(points[min(j+1,len(points)-1)])-np.array(points[max(0,j-1)])
  t/=np.linalg.norm(t)or 1;reference=np.array([0,0,1.])if abs(t[2])<.86 else np.array([1.,0,0]);u=np.cross(t,reference);u/=np.linalg.norm(u);v=np.cross(t,u)
  r=radii[j]if hasattr(radii,'__len__')else radii
  if not hasattr(r,'__len__'):r=(r,r)
  for k in range(sides):
   a=k/sides*2*math.pi;verts.append(p+u*math.cos(a)*r[0]+v*math.sin(a)*r[1]);uv.append((k/sides*5,j/max(1,len(points)-1)*6))
 faces=[]
 for j in range(len(points)-1):
  for k in range(sides):q=j*sides+k;qn=j*sides+(k+1)%sides;faces.append((q,qn,qn+sides,q+sides))
 if not thickness:faces+=[tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+k for k in range(sides))]
 ww=[{weight:1}for _ in verts]if isinstance(weight,str)else weight
 return mesh(name,verts,faces,mat,ww,uv,thickness)
# Open knee-length overcoat: tapered shoulder/waist and shaped skirts; broad
# front opening exposes the black interior instead of a shirt or tie plane.
profile=[(.43,.286,.174,.25),(.50,.278,.170,.23),(.65,.264,.162,.20),(.85,.242,.156,.18),(1.02,.231,.168,.17),(1.16,.252,.184,.32),(1.32,.273,.190,.50),(1.45,.272,.165,.64),(1.49,.238,.132,.80)]
ys=np.linspace(.43,1.49,38);verts=[];uv=[];rows=[];sides=56
def profile_at(y,col):return float(np.interp(y,[p[0]for p in profile],[p[col]for p in profile]))
# The skirt hangs from the hips and is carried a little by each thigh. The
# front panels, which the stride actually pushes, follow it more than the back.
def skirt_weights(x,y,a):
 side='L'if x<0 else'R';leg=smooth((.95-y)/.55)*(.15+.45*max(0,math.cos(a))**1.5)
 return{'pelvis':1-leg,'thigh_'+side:leg}
for j,y in enumerate(ys):
 rx,rz,gap=[profile_at(y,k)for k in [1,2,3]]
 for k in range(sides+1):
  a=gap+(2*math.pi-2*gap)*k/sides
  drape=(.0025*math.sin(a*7+y*9)+.0015*math.sin(a*13-y*6))*smooth((1.12-y)/.5)
  # Broad cloth valleys descend from the lapels/underarm toward the skirt.
  # They remove volume inside the validated outer envelope, never expand it.
  centers=[.55+.07*math.sin(y*2),1.31,2.72,3.56,4.97,2*math.pi-.55-.07*math.sin(y*2)]
  valley=sum(math.exp(-(math.atan2(math.sin(a-c),math.cos(a-c))/.105)**2)for c in centers)
  drape-=.009*smooth((1.31-y)/.70)*min(1,valley)
  x=math.sin(a)*(rx+drape);z=-math.cos(a)*(rz+drape)-.012
  hem=.006*math.sin(a*3)*smooth((.59-y)/.16)
  p=[x,y+hem,z];verts.append(p);uv.append((k/sides*4,(y-.43)*5))
  rows.append(skirt_weights(x,y,a)if y<1.05 else weights_at(p))
faces=[]
for j in range(len(ys)-1):
 for k in range(sides):q=j*(sides+1)+k;faces.append((q,q+1,q+sides+2,q+sides+1))
coat=mesh('tailored knee overcoat',verts,faces,'warning_coat_wool',rows,uv,.0042)
# Front-edge binding follows the actual open skirt and lapel, not a printed
# stripe. It carries the skirt's own weights: nearest-body transfer bound the
# lower edge to the thigh, and in the walk it peeled off the coat as a loose cord.
for side in [-1,1]:
 pts=[];ring=[]
 for y in np.linspace(.44,1.46,32):
  rx,rz,g=[profile_at(y,k)for k in [1,2,3]];p=[side*math.sin(g)*rx,y,-math.cos(g)*rz-.014];pts.append(p)
  ring.append(skirt_weights(p[0],y,g)if y<1.05 else weights_at(p))
 tube('bound front edge',pts,[.0022]*len(pts),'warning_lining',weight=[w for w in ring for _ in range(8)],sides=8)

# Sleeves follow the arm bones, not the nearest skin. Nearest-vertex transfer
# let the torso claim the upper sleeve, which ballooned as soon as the arm
# left its bind pose. Radii are a tailored coat sleeve, not a padded tube.
SLEEVE=(.080,.066,.054)
for side in ['L','R']:
 sh=G(rest['upperarm_'+side][0]);el=G(rest['forearm_'+side][0]);wr=G(rest['hand_'+side][0])
 pts=[];radii=[];ring=[];up,fo,ha='upperarm_'+side,'forearm_'+side,'hand_'+side
 for t in np.linspace(0,1,11):
  pts.append(sh*(1-t)+el*t);r=SLEEVE[0]*(1-t)+SLEEVE[1]*t;radii.append((r,r*.94))
  c=.45*(1-smooth(t/.28));e=.5*smooth((t-.72)/.28)
  ring.append({up:1-c-e,'clavicle_'+side:c*.6,'chest':c*.4,fo:e})
 for t in np.linspace(.1,1,11):
  pts.append(el*(1-t)+wr*t);r=SLEEVE[1]*(1-t)+SLEEVE[2]*t;radii.append((r,r*.94))
  u=.5*(1-smooth(t/.28));h=.22*smooth((t-.85)/.15)
  ring.append({fo:1-u-h,up:u,ha:h})
 tube('fitted shaped sleeve '+side,pts,radii,'warning_coat_wool',weight=[{k:v for k,v in w.items()if v>1e-4}for w in ring for _ in range(32)],sides=32,thickness=.0035)
 axis=(wr-el);axis/=np.linalg.norm(axis)
 tube('bound cuff '+side,[wr-axis*.022,wr+axis*.004],[(SLEEVE[2]+.002,SLEEVE[2]),(SLEEVE[2]+.001,SLEEVE[2]-.001)],'warning_lining',weight=[{fo:.78,ha:.22}]*64,sides=32,thickness=.003)

# Notched lapels have a surface-following curved fold with physical thickness.
for s in [-1,1]:
 border=[(s*.090,1.51,-.115),(s*.182,1.447,-.166),(s*.148,1.391,-.187),(s*.229,1.355,-.161),(s*.178,1.267,-.192),(s*.078,1.128,-.184)]
 center=np.mean(np.array(border),axis=0);vv=[center+np.array([0,0,-.012])]
 # Four shaping rings roll the lapel between its existing fold and unchanged
 # perimeter. The new surface stays inward of the old triangular fan.
 for u in [.25,.50,.75,1.0]:
  for p in border:
   q=center*(1-u)+np.array(p)*u;q[2]-=.012*(1-u)**1.8;vv.append(q)
 count=len(border);ff=[(0,1+k,1+(k+1)%count)for k in range(count)]
 for r in range(3):
  for k in range(count):a=1+r*count+k;b=1+r*count+(k+1)%count;ff.append((a,b,b+count,a+count))
 lap=mesh('notched lapel '+str(s),vv,ff,'warning_coat_wool',[{'chest':.72,'spine_upper':.28}for _ in vv],thickness=.005)
 # Welt pocket: actual folded narrow opening, fitted to each skirt surface.
 pp=[[s*.182,1.045,-.143],[s*.217,.995,-.146],[s*.249,.958,-.140]]
 tube('slanted welt pocket '+str(s),pp,[(.008,.005)]*3,'warning_lining',weight='pelvis',sides=10)

# The collar stands round the BACK of the neck and meets the lapels at the
# front; the old rolled collar was two vertical hoops over the shoulders. Both
# it and the yoke that closes the coat's open top are fitted to the measured
# neck and shoulder surface, so the black body cannot show through them.
anatomy=np.array([G(v.co)for v in body.data.vertices])
def shoulder_height(x,z,reach=.03):
 m=(np.abs(anatomy[:,0]-x)<reach)&(np.abs(anatomy[:,2]-z)<reach)&(anatomy[:,1]>1.30)&(anatomy[:,1]<1.575)
 return float(np.percentile(anatomy[m,1],92))if m.sum()>3 else None
def circular(values,width=4):
 v=np.array(values,float);n=len(v);return np.array([v[[(i+k)%n for k in range(-width,width+1)]].mean()for i in range(n)])
NECK={'z':-.012,'h':.056,'open':math.radians(36)}
band=anatomy[(anatomy[:,1]>1.49)&(anatomy[:,1]<1.57)]
band_r=np.hypot(band[:,0],band[:,2]-NECK['z']);band_a=np.arctan2(band[:,0],-(band[:,2]-NECK['z']))
def neck_radius(th):
 d=np.abs(np.arctan2(np.sin(band_a-th),np.cos(band_a-th)));m=(d<.14)&(band_r<.15)
 return float(np.percentile(band_r[m],95))+.014 if m.sum()>3 else .09
segs=44;angles=[NECK['open']+(2*math.pi-2*NECK['open'])*i/segs for i in range(segs+1)]
# Measured, then smoothed round the neck: a collar is a calm curve, and raw
# per-angle maxima crumpled it into a ruff.
radii=np.clip(circular([neck_radius(th)for th in angles]),.080,.104)
bases=[]
for th,r in zip(angles,radii):
 under=shoulder_height(math.sin(th)*r,-math.cos(th)*r+NECK['z']);bases.append(max(1.488,(under or 1.47)+.006))
bases=np.clip(circular(bases),1.488,1.53)
collar=list(zip(angles,radii,bases))
vv=[];ff=[];uvs=[]
for i,(th,r,base)in enumerate(collar):
 for row,(y,flare,back)in enumerate([(base,1.0,0),(base+NECK['h'],1.08,.008)]):
  vv.append([math.sin(th)*r*flare,y,-math.cos(th)*r*flare+NECK['z']+back]);uvs.append((i/segs*3,row))
for i in range(segs):a=i*2;ff.append((a,a+2,a+3,a+1))
mesh('stand collar',vv,ff,'warning_coat_wool',[{'chest':.8,'neck':.2}for _ in vv],uvs,.0055)
rx,rz,gap=[profile_at(1.49,k)for k in [1,2,3]];rings=6
grid=[]
for i,(th,r,base)in enumerate(collar):
 t=i/segs;outer=gap+(2*math.pi-2*gap)*t
 a=[math.sin(th)*r,base+.002,-math.cos(th)*r+NECK['z']];b=[math.sin(outer)*rx,1.49,-math.cos(outer)*rz-.012]
 grid.append([[a[0]+(b[0]-a[0])*k/rings,a[1]+(b[1]-a[1])*k/rings,a[2]+(b[2]-a[2])*k/rings]for k in range(rings+1)])
for k in range(1,rings):
 under=circular([shoulder_height(grid[i][k][0],grid[i][k][2])or 0. for i in range(segs+1)],3)
 for i in range(segs+1):grid[i][k][1]=max(grid[i][k][1],under[i]+.012)
vv=[];ff=[];uvs=[];ww=[]
for i in range(segs+1):
 for k in range(rings+1):p=grid[i][k];vv.append(p);uvs.append((i/segs*4,k/rings));ww.append({'chest':.8,'neck':.2}if k==0 else weights_at(p))
for i in range(segs):
 for k in range(rings):a=i*(rings+1)+k;b=a+rings+1;ff.append((a,b,b+1,a+1))
mesh('shoulder yoke',vv,ff,'warning_coat_wool',ww,uvs,.004)
# A small felt trilby: continuously modelled brim, band and pinched crown.
cy=1.753;segs=96
vv=[];uv=[]
for ring in range(7):
 t=ring/6
 for k in range(segs):
  a=k/segs*2*math.pi;rx=.111+(.170-.111)*t;rz=.143+(.207-.143)*t
  front=math.cos(a);y=cy-.020*t*max(0,front)+.014*t*max(0,-front)+.002*math.sin(a*2)*t
  vv.append([math.sin(a)*rx,y,-.030-math.cos(a)*rz]);uv.append((k/segs*3,t))
ff=[]
for r in range(6):
 for k in range(segs):a=r*segs+k;b=r*segs+(k+1)%segs;ff.append((a,b,b+segs,a+segs))
mesh('felt trilby bound brim',vv,ff,'warning_felt_trilby',[{'head':1}for _ in vv],uv,.004)
vv=[];uv=[]
for ring in range(10):
 t=ring/9
 for k in range(segs):
  a=k/segs*2*math.pi;wa=math.atan2(math.sin(a),math.cos(a));pinch=.020*math.exp(-((abs(wa)-.53)/.28)**2)*smooth(t)
  rx=.111*(1-.13*t)-pinch;rz=.143*(1-.14*t)
  y=cy+.125*t-.008*math.cos(a)*t-.025*math.exp(-(wa/.30)**2)*t**2.9
  vv.append([math.sin(a)*rx,y,-.030-math.cos(a)*rz]);uv.append((k/segs*3,t*2))
for ring in range(1,6):
 t=ring/6
 for k in range(segs):
  a=k/segs*2*math.pi;rr=1-t;wa=math.atan2(math.sin(a),math.cos(a));top=cy+.125-.028*(1-rr*rr)+(-.008*math.cos(a)-.025*math.exp(-(wa/.30)**2))*rr
  vv.append([math.sin(a)*.096*rr,top,-.030-math.cos(a)*.123*rr]);uv.append((k/segs*3,2+t))
ff=[]
for r in range(14):
 for k in range(segs):a=r*segs+k;b=r*segs+(k+1)%segs;ff.append((a,b,b+segs,a+segs))
center=len(vv);vv.append([0,cy+.097,-.03]);uv.append((.5,.5));ff.extend((14*segs+k,14*segs+(k+1)%segs,center)for k in range(segs))
mesh('pinched trilby crown',vv,ff,'warning_felt_trilby',[{'head':1}for _ in vv],uv,.003)
band=[]
for y in [cy+.009,cy+.032]:
 for k in range(segs):a=k/segs*2*math.pi;band.append([math.sin(a)*.1115,y,-.030-math.cos(a)*.1435])
mesh('grosgrain trilby band',band,[(k,(k+1)%segs,(k+1)%segs+segs,k+segs)for k in range(segs)],'warning_ribbon',[{'head':1}for _ in band],thickness=.0018)


# HANDS. The source rig has one rigid bone per finger, so no pose can curl a
# finger. The relaxed curl is baked into the bind mesh instead: each finger is
# bent at MCP, PIP and DIP about its own axis toward the palm, distal joint
# first, with a short blend across each joint. Fingers then ride their hand
# rigidly, so the shape survives every clip. A flat palm and straight splayed
# fingers read as a wave, not a man with a cigarette between two fingers.
groups={g.name:g.index for g in body.vertex_groups}
def palm_normal(side):
 F=(rest['middle_'+side][0]-rest['hand_'+side][0]).normalized()
 kidx,klit=rest['index_'+side][0],rest['little_'+side][0];S=(kidx-klit).normalized()
 v=rest['thumb_'+side][0]-(kidx+klit)*.5;v=v-F*v.dot(F);v=v-S*v.dot(S);return v.normalized()
def finger_vertices(name,threshold=0.):
 g=groups[name];out=[]
 for v in body.data.vertices:
  w=next((x.weight for x in v.groups if x.group==g),0)
  if w>threshold:out.append((v,w))
 return out
FINGERS={}
def curl_hand(side,spec):
 N=palm_normal(side)
 for finger,angles in spec.items():
  name=f'{finger}_{side}';owned=finger_vertices(name);mcp=rest[name][0].copy()
  core=[v.co.copy()for v,w in owned if w>.6];bone=(rest[name][1]-rest[name][0]).normalized()
  far=max((c-mcp).dot(bone)for c in core);tips=[c for c in core if (c-mcp).dot(bone)>far*.85]
  d=(sum(tips,Vector())/len(tips)-mcp).normalized();L=max((c-mcp).dot(d)for c in core)
  axis=d.cross(N).normalized()
  original={v.index:v.co.copy()for v,w in owned}
  for v,w in owned:
   p=v.co.copy();s=(p-mcp).dot(d)
   for at,degrees,blend in[(L*.72,angles[2],.005),(L*.45,angles[1],.006),(0.,angles[0],.010)]:
    k=smooth((s-at+blend)/(2*blend))
    if k>0:J=mcp+d*at;p=J+Quaternion(axis,math.radians(degrees)*k)@(p-J)
   v.co=v.co.lerp(p,min(1,w*1.6))
  FINGERS[name]={'mcp':mcp,'dir':d,'length':L,'original':original,'palm':N}
 return N
# Index and middle grip the cigarette, so they stay open; ring and little
# fold away under them. The pocketed left hand is simply relaxed.
curl_hand('R',{'index':(18,24,10),'middle':(20,27,12),'ring':(46,56,26),'little':(52,60,26),'thumb':(8,16,0)})
curl_hand('L',{f:(30,42,22)for f in['index','middle','ring','little']}|{'thumb':(10,16,0)})
body.data.update()

def section(name,fraction,offset=0.):
 f=FINGERS[name];at=f['length']*fraction+offset
 pts=[v.co for v in body.data.vertices if v.index in f['original']and abs((f['original'][v.index]-f['mcp']).dot(f['dir'])-at)<.004]
 return sum(pts,Vector())/len(pts)
# The cigarette sits in the gap between the curled index and middle fingers at
# their first phalanx, square to both and pointing out of the back of the
# hand. The filter end stands proud on the palm side, where the lips find it.
ci,cm=section('index_R',.40),section('middle_R',.40)
run=((section('index_R',.40,.008)-ci)+(section('middle_R',.40,.008)-cm)).normalized()
gap=(ci+cm)*.5;cig_axis=(ci-cm).normalized().cross(run).normalized()
if cig_axis.dot(FINGERS['index_R']['palm'])>0:cig_axis=-cig_axis
cig_base=gap-cig_axis*.020;cig_tip=cig_base+cig_axis*.086;grip=gap
def cigpart(name,a,b,r,mat):return tube(name,[G(a),G(b)],[(r,r),(r,r)],mat,weight='hand_R',sides=20)
cigpart('cigarette ochre filter',cig_base,cig_base+cig_axis*.022,.0038,'warning_cigarette_filter')
cigpart('cigarette paper',cig_base+cig_axis*.022,cig_tip-cig_axis*.009,.0035,'warning_cigarette_paper')
cigpart('cigarette uneven ash',cig_tip-cig_axis*.009,cig_tip-cig_axis*.001,.0036,'warning_ash')
cigpart('finite ember',cig_tip-cig_axis*.0012,cig_tip,.0035,'warning_ember')
# The lips, measured on the head so the smoke gesture lands on them.
# Blender +y is the figure's forward. The profile is printed for review.
jaw=rest['jaw'][0];midline=[v.co.copy()for v in body.data.vertices if abs(v.co.x)<.006 and jaw.z-.11<v.co.z<jaw.z+.06]
for z in np.arange(jaw.z-.11,jaw.z+.06,.01):
 row=[c for c in midline if z<=c.z<z+.01]
 if row:print('PROFILE',round(float(z),3),round(max(c.y for c in row),4))
lips=max([c for c in midline if jaw.z-.065<c.z<jaw.z-.03],key=lambda c:c.y)
print('LIPS',G(lips),'CIG',G(cig_base),G(cig_tip))
# Join all geometry before introducing two restricted garment-only correctives.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
body=bpy.context.view_layer.objects.active;body.name='tower_warning_missing_man';body.data.name=body.name
body.parent=arm;body.matrix_parent_inverse=Matrix.Identity(4);body.matrix_basis=Matrix.Identity(4)
for mod in list(body.modifiers):body.modifiers.remove(mod)
mod=body.modifiers.new('Anatomical skin and exact prop contact','ARMATURE');mod.object=arm
max_h=max(v.co.z for v in body.data.vertices);min_h=min(v.co.z for v in body.data.vertices)
# Keep the agreed contact/stride scale stable through bounded costume edits.
# Lowering a crown crease must not rescale the entire person and hand socket.
fit=.9737891028085051
for v in body.data.vertices:v.co*=fit
bpy.context.view_layer.objects.active=arm;body.select_set(False);arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for b in arm.data.edit_bones:b.head*=fit;b.tail*=fit
bpy.ops.object.mode_set(mode='OBJECT');arm.select_set(False)
body.shape_key_add(name='Basis')
markers={name:body.vertex_groups.get(name)for name in ['_coat_surface','_collar_surface']}
for name,marker in [('coat_settle','_coat_surface'),('collar_settle','_collar_surface')]:
 key=body.shape_key_add(name=name)
 for v in body.data.vertices:
  w=next((g.weight for g in v.groups if markers[marker]and g.group==markers[marker].index),0)
  if not w:continue
  p=G(v.co)/fit
  if name=='coat_settle':amount=smooth((1.12-p[1])/.5)*.005*w;key.data[v.index].co.y+=amount*math.sin(p[0]*10)*fit
  else:key.data[v.index].co.y+=.003*w*fit;key.data[v.index].co.z-=.002*w*fit

# ------------------------------------------------------------------------
# PERFORMANCE. Every clip is authored here on the fitted rest skeleton; no
# source clip is retargeted. The old walk kept a rigid, locked torso over the
# source's long scissor stride and clamped a 7.5cm pelvis bounce into it, with
# both arms locked in pose: the bouncing cartoon in the street. This one is a
# person: a short unhurried stride, ~3cm of rise and fall, hip sway, list and
# rotation the chest answers, a level head, a hand in his coat pocket and the
# cigarette hand swinging a little at his side.
#
# Space: everything below is armature (Blender) space after the fit. Points
# are authored in figure game coordinates (+x his right, +y up, -z forward)
# and converted with B(); B is a proper rotation, so angles keep their sense.
for pb in arm.pose.bones:pb.rotation_mode='QUATERNION'
BONES=arm.data.bones
RL={b.name:b.matrix_local.copy()for b in BONES}
HD={b.name:b.head_local.copy()for b in BONES}
TL={b.name:b.tail_local.copy()for b in BONES}
LN={b.name:b.length for b in BONES}
ORDER=[]
def visit(b):
 ORDER.append(b.name)
 for c in b.children:visit(c)
for b in BONES:
 if not b.parent:visit(b)
def gq(axis,radians):return Quaternion(B(axis),radians)
def game(v):return Vector(G(v))
YAW,PITCH,ROLL=(0,1,0),(1,0,0),(0,0,1)

def fk(root,rot,absolute):
 M={}
 for n in ORDER:
  b=BONES[n]
  base=Matrix.Translation(root)@RL[n]if b.parent is None else M[b.parent.name]@RL[b.parent.name].inverted()@RL[n]
  q=rot.get(n)
  if n in absolute:q=absolute[n]@(base@RL[n].inverted()).to_quaternion().inverted()
  if q is not None:
   h=base.translation.copy();base=Matrix.Translation(h)@q.to_matrix().to_4x4()@Matrix.Translation(-h)@base
  M[n]=base
 return M
def aim(n,h,t):
 q=(TL[n]-HD[n]).normalized().rotation_difference((t-h).normalized())@RL[n].to_quaternion()
 m=q.to_matrix().to_4x4();m.translation=h;return m
def solve(a,b,l1,l2,pole):
 v=b-a;d=min(v.length,l1+l2-.0005);u=v.normalized();w=pole-a-u*(pole-a).dot(u);w.normalize()
 c=(l1*l1+d*d-l2*l2)/(2*d);return a+u*c+w*math.sqrt(max(0,l1*l1-c*c))
def frame_of(F,N):
 F=F.normalized();N=(N-F*N.dot(F)).normalized();return Matrix((F.cross(N),F,N)).transposed()
def hand_rest(side):
 kidx,klit=HD['index_'+side],HD['little_'+side];S=(kidx-klit).normalized()
 v=HD['thumb_'+side]-(kidx+klit)*.5;return frame_of(HD['middle_'+side]-HD['hand_'+side],v-S*v.dot(S))
HAND_REST={s:hand_rest(s)for s in'LR'}
def hand_turn(side,F,N):return(frame_of(B(F),B(N))@HAND_REST[side].inverted()).to_quaternion()

def place_arm(M,side,wrist,turn,pole):
 up,fo,ha='upperarm_'+side,'forearm_'+side,'hand_'+side
 sh=M[up].translation.copy();l1,l2=LN[up],LN[fo]
 if (wrist-sh).length>l1+l2-.001:REPORT['reach'].append(('arm',side,round((wrist-sh).length-l1-l2,4)))
 el=solve(sh,wrist,l1,l2,pole);M[up]=aim(up,sh,el)
 H=turn@RL[ha].to_quaternion();Fq=aim(fo,el,wrist).to_quaternion()
 # Half the wrist's roll is carried by the forearm, as a real radius does;
 # the whole twist at the wrist would wring the skin into a candy wrapper.
 rel=Fq.inverted()@H;tw=Quaternion((rel.w,0,rel.y,0));tw.normalize()
 if tw.w<0:tw.negate()
 Fq=Fq@Quaternion().slerp(tw,.5)
 fm=Fq.to_matrix().to_4x4();fm.translation=el;M[fo]=fm
 hm=H.to_matrix().to_4x4();hm.translation=el+(wrist-el).normalized()*l2;M[ha]=hm
 for f in['thumb','index','middle','ring','little']:M[f'{f}_{side}']=hm@RL[ha].inverted()@RL[f'{f}_{side}']

def place_leg(M,side,foot):
 th,sh_,ft,to='thigh_'+side,'shin_'+side,'foot_'+side,'toe_'+side
 hip=M[th].translation.copy();l1,l2=LN[th],LN[sh_];ankle=B(foot['ankle'])
 if (ankle-hip).length>l1+l2-.001:REPORT['reach'].append(('leg',side,round((ankle-hip).length-l1-l2,4)))
 out=.06 if side=='R'else-.06
 kn=solve(hip,ankle,l1,l2,hip+B((out,-.3,-1.0)))
 M[th]=aim(th,hip,kn);M[sh_]=aim(sh_,kn,ankle)
 a=kn+(ankle-kn).normalized()*l2;q=gq(YAW,foot['yaw'])@gq(PITCH,foot['pitch'])
 fm=Matrix.Translation(a)@q.to_matrix().to_4x4()@Matrix.Translation(-HD[ft])@RL[ft];M[ft]=fm
 tm=fm@RL[ft].inverted()@RL[to];h=tm.translation.copy()
 M[to]=Matrix.Translation(h)@Quaternion(q@Vector((1,0,0)),foot['toe']).to_matrix().to_4x4()@Matrix.Translation(-h)@tm

# --- the skeleton's own measurements --------------------------------------
L_LEG=LN['thigh_R']+LN['shin_R']
PELVIS0=game(HD['pelvis']);HIP={s:game(HD['thigh_'+s])for s in'LR'}
ANKLE0=game(HD['foot_R']);BALL=game(HD['toe_R']);BALL[1]=0.
boot=[game(v.co)*fit for v in body.data.vertices if v.co.x*fit>.05 and v.co.z*fit<.06]
HEEL=np.array([ANKLE0[0],0.,max(p[2]for p in boot)-.012])
HVEC=HEEL-ANKLE0;BVEC=BALL-ANKLE0
TIP=game(TL['toe_R'])-ANKLE0;TIP[1]=-ANKLE0[1]
def rx(t,v):return np.array((v[0],v[1]*math.cos(t)-v[2]*math.sin(t),v[1]*math.sin(t)+v[2]*math.cos(t)))

# --- the walk cycle --------------------------------------------------------
# Distance-owned: the runtime advances clip time by travelled metres, so the
# stride is exactly walkSpeed x cycle and a planted foot never slides.
CYCLE=1.1;STRIDE=.82*CYCLE
HS,FF,HO,TO=-.04,0.,.44,.60     # right foot events as fractions of the cycle
MID=.22                         # flat foot passes under the hip here
TH_HS,TH_TO=math.radians(11),math.radians(36)
LIFT=.042;TOE_OUT=math.radians(5);WIDTH=.094;BOB=.030
PHASE0=.80                      # clip time zero: left mid-stance, right leg swinging past it
def flat_z(p):return ANKLE0[2]+(p-MID)*STRIDE
def contact(p,xf):
 # Heel strike rolls onto the heel, the flat foot rides the ground back, the
 # heel lifts and the foot rolls over the ball. Every contact point is fixed
 # in the world, i.e. moves back exactly with the root's travel.
 if HS<=p<FF:
  t=TH_HS*(1-smooth((p-HS)/(FF-HS)));h=np.array((xf,0.,flat_z(p)+HVEC[2]));return h-rx(t,HVEC),t,0.
 if FF<=p<HO:return np.array((xf,ANKLE0[1],flat_z(p))),0.,0.
 t=-TH_TO*smooth((p-HO)/(TO-HO))**1.3;b=np.array((xf,0.,flat_z(p)+BVEC[2]));return b-rx(t,BVEC),t,-t
def foot_at(p,side):
 xf=WIDTH if side=='R'else-WIDTH;p=p%1.
 if p>=1+HS:p-=1
 if p<TO:a,t,toe=contact(p,xf)
 else:
  u=(p-TO)/(1+HS-TO);a0,t0,toe0=contact(TO-1e-9,xf);a1,t1,_=contact(HS,xf)
  a=a0+(a1-a0)*np.array((0,u,smoother(u)));a[1]+=LIFT*math.sin(math.pi*u)**1.4
  t=t0+(t1-t0)*smooth(u);toe=toe0*(1-smooth(u/.35))
  # Toe clearance: lift the ankle by exactly the shortfall, easing to nothing
  # at toe-off and heel strike so both contacts stay exact.
  low=min(a[1]+rx(t,BVEC)[1],a[1]+rx(t,BVEC)[1]+rx(t+toe,TIP-BVEC)[1])
  want=.014*smooth(u/.15)*smooth((1-u)/.15);a[1]+=max(0.,want-low)
 return{'ankle':a,'pitch':t,'toe':toe,'yaw':-TOE_OUT if side=='R'else TOE_OUT}
def pelvis_rise(p):return BOB*.5*(1-math.cos(4*math.pi*(p+.02)))
def walk_shape(p):
 return{'px':.016*math.cos(2*math.pi*(p-MID)),'rise':pelvis_rise(p),
  'yaw':.07*math.cos(2*math.pi*(p-HS)),'roll':.045*math.cos(2*math.pi*(p-MID)),'lean':-.05,
  'feet':{'L':foot_at(p-.5,'L'),'R':foot_at(p,'R')},'swing':.11*math.cos(2*math.pi*(p-.46)),'near':0.,'nod':0.}

# Pelvis height: as high as both legs allow over the whole cycle, with the
# extended leg never quite locked. Then the mid-stance knee is soft, not deep.
def hip_world(shape,side,base):
 q=gq(YAW,shape['yaw'])@gq(ROLL,shape['roll'])
 off=q@B(HIP[side]-PELVIS0);return np.array(game(B(PELVIS0)+off))+np.array((shape['px'],base+shape['rise'],0.))
def highest(shapes,reach=.988):
 best=9.
 for shape in shapes:
  for side in'LR':
   a=shape['feet'][side]['ankle'];h=hip_world(shape,side,0.);dx,dz=h[0]-a[0],h[2]-a[2]
   best=min(best,a[1]+math.sqrt(max(0,(reach*L_LEG)**2-dx*dx-dz*dz))-h[1])
 return best
WALK_BASE=highest([walk_shape(i/120)for i in range(120)])

def stand_shape():
 xs=.106;feet={s:{'ankle':np.array((xs if s=='R'else-xs,ANKLE0[1],ANKLE0[2])),'pitch':0.,'toe':0.,'yaw':-TOE_OUT if s=='R'else TOE_OUT}for s in'LR'}
 shape={'px':-.010,'rise':0.,'yaw':0.,'roll':-.014,'lean':0.,'feet':feet,'swing':0.,'near':0.,'nod':0.}
 shape['rise']=highest([shape],.993);return shape
STAND=stand_shape()

# --- arms --------------------------------------------------------------------
# Right: the cigarette hand rests by his hip, forearm forward, the cigarette
# pointing out and up. Smoking brings the filter to his lips with the palm
# toward the face. Left: in the coat pocket, riding the hip.
REST_HAND={s:HD['hand_'+s].copy()for s in'LR'}
HOLD_R={'wrist':(.180,1.050,-.198),'F':(-.10,-.40,-.91),'N':(-1.,-.30,0.),'pole':(.72,1.12,.55)}
SMOKE_R={'F':(-.52,.80,-.30),'N':(-.18,-.05,1.),'pole':(.62,.95,-.05)}
POCKET_L={'wrist':(-.162,1.045,-.058),'F':(.06,-1.,-.16),'N':(1.,0.,.10),'pole':(-.70,1.18,.42)}
TURN={'hold':hand_turn('R',HOLD_R['F'],HOLD_R['N']),'smoke':hand_turn('R',SMOKE_R['F'],SMOKE_R['N']),'pocket':hand_turn('L',POCKET_L['F'],POCKET_L['N'])}
filter_offset=(cig_base*fit)-REST_HAND['R']
MOUTH=B(G(lips)*fit)+B((0,0,-.004))
SMOKE_WRIST=MOUTH-TURN['smoke']@filter_offset

def build(shape):
 rot={};absolute={}
 rot['pelvis']=gq(YAW,shape['yaw'])@gq(ROLL,shape['roll'])
 for n in['spine_lower','spine_mid','spine_upper','chest']:
  rot[n]=gq(YAW,-.16*shape['yaw'])@gq(ROLL,-.2*shape['roll'])@gq(PITCH,shape['lean']*.25)
 rot['neck']=gq(YAW,-.1*shape['yaw'])
 # The head is stabilised: level and square to his travel whatever the hips do.
 absolute['head']=gq(PITCH,shape['nod'])
 root=B((shape['px'],shape['rise'],0.))
 M=fk(root,rot,absolute)
 for s in'LR':place_leg(M,s,shape['feet'][s])
 chest=M['chest']@RL['chest'].inverted();hips=M['pelvis']@RL['pelvis'].inverted()
 # Cigarette hand: carried by the shoulders, swung a little about the shoulder.
 sh=M['upperarm_R'].translation.copy();swing=Quaternion(chest.to_quaternion()@Vector((1,0,0)),shape['swing'])
 k=smooth(shape['near'])
 hold_w=sh+swing@(chest@B(HOLD_R['wrist'])-sh);smoke_w=chest@SMOKE_WRIST
 wrist=hold_w.lerp(smoke_w,k)+chest.to_quaternion()@B((.035,0,-.03))*math.sin(math.pi*k)
 turn=swing@chest.to_quaternion()@TURN['hold'].slerp(TURN['smoke'],k)
 pole=(chest@B(HOLD_R['pole'])).lerp(chest@B(SMOKE_R['pole']),k)
 place_arm(M,'R',wrist,turn,pole)
 place_arm(M,'L',hips@B(POCKET_L['wrist']),hips.to_quaternion()@TURN['pocket'],chest@B(POCKET_L['pole']))
 return M
def blend(a,b,u,feet=None):
 out={k:a[k]+(b[k]-a[k])*u for k in['px','rise','yaw','roll','lean','swing','near','nod']}
 out['feet']=feet or{s:{k:a['feet'][s][k]+(b['feet'][s][k]-a['feet'][s][k])*u for k in['ankle','pitch','toe','yaw']}for s in'LR'}
 return out
def walk_shape_based(p):
 s=walk_shape(p);s['rise']+=WALK_BASE;return s
WALK0=walk_shape_based(PHASE0)

# Departure: weight onto the left foot, right heel peels up off the ball,
# then the right leg swings through into the first stride. The left foot's
# local path is exactly the published linear blend; the runtime turns the
# root about it, so it carries his weight without sliding.
DEPART=1.05
def depart_shape(t):
 u=smooth(t/DEPART);shape=blend(STAND,WALK0,u)
 L={k:STAND['feet']['L'][k]+(WALK0['feet']['L'][k]-STAND['feet']['L'][k])*u for k in['ankle','pitch','toe','yaw']}
 s0=STAND['feet']['R'];s1=WALK0['feet']['R'];ball=s0['ankle']+BVEC
 if u<.35:
  th=-.42*smooth(u/.35);R={'ankle':ball-rx(th,BVEC),'pitch':th,'toe':-th,'yaw':s0['yaw']}
 else:
  v=(u-.35)/.65;th0=-.42;a0=ball-rx(th0,BVEC)
  a=a0+(s1['ankle']-a0)*np.array((v,v,smoother(v)));a[1]+=.02*math.sin(math.pi*v)
  R={'ankle':a,'pitch':th0+(s1['pitch']-th0)*smooth(v),'toe':.42+(s1['toe']-.42)*smooth(v),'yaw':s0['yaw']+(s1['yaw']-s0['yaw'])*v}
 shape['feet']={'L':L,'R':R};return shape

def near(t):
 if t<.9:return smooth((t-.25)/.65)
 if t<1.3:return 1
 return 1-smooth((t-1.3)/.8)
def smoke_shape(t):
 s=dict(STAND);s['near']=near(t);s['nod']=-.06*near(t);return s

def apply(M):
 for name,pb in arm.pose.bones.items():
  parent=pb.bone.parent;local_rest=pb.bone.matrix_local
  if parent:pb.matrix_basis=(parent.matrix_local.inverted()@local_rest).inverted()@M[parent.name].inverted()@M[name]
  else:pb.matrix_basis=local_rest.inverted()@M[name]
 bpy.context.view_layer.update()
REPORT={'reach':[],'toeClearance':9.,'kneeFlex':[0,0]}
def create_action(name,seconds,shape_at):
 action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
 for i in range(round(seconds*FPS)+1):
  apply(build(shape_at(i/FPS)))
  for b in arm.pose.bones:
   for path in['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=path,frame=i,group=b.name)
 return action
hold=create_action('warning_hold',1.1,lambda t:STAND)
smoke=create_action('warning_smoke',2.8,smoke_shape)
depart=create_action('warning_depart',DEPART,depart_shape)
walk=create_action('warning_walk',CYCLE,lambda t:walk_shape_based(PHASE0+t/CYCLE))
arm.animation_data.action=hold;bpy.context.scene.frame_set(0)

# Review numbers: toe clearance through the swing and soft-knee range.
for i in range(120):
 p=i/120
 for side in'LR':
  f=foot_at(p-(.5 if side=='L'else 0),side);ph=(p-(.5 if side=='L'else 0))%1
  if TO+.02<ph<.94:REPORT['toeClearance']=min(REPORT['toeClearance'],float((f['ankle']+rx(f['pitch'],BVEC)+rx(f['pitch']+f['toe'],TIP-BVEC))[1]))
print('WALK',json.dumps({'base':WALK_BASE,'standRise':STAND['rise'],'reach':REPORT['reach'][:6],'toeClearance':REPORT['toeClearance'],
 'pivotStart':[STAND['feet']['L']['ankle'][0],STAND['feet']['L']['ankle'][2]],'pivotEnd':[WALK0['feet']['L']['ankle'][0],WALK0['feet']['L']['ankle'][2]]}))
# Planted windows in clip-cycle fractions for the review/test: flat feet only.
PLANTED={'foot_R':[(FF-PHASE0)%1,(FF-PHASE0)%1+(HO-FF)],'foot_L':[(FF+.5-PHASE0)%1,(FF+.5-PHASE0)%1+(HO-FF)]}
PIVOT={'joint':'foot_L','start':[float(STAND['feet']['L']['ankle'][0]),float(STAND['feet']['L']['ankle'][2])],
 'end':[float(WALK0['feet']['L']['ankle'][0]),float(WALK0['feet']['L']['ankle'][2])]}

# Mesh-coordinate anchors are for the existing world*inverseBind palette. A
# separate hand-local reference is supplied to avoid guessing a socket frame.
ember_game=G(cig_tip)*fit;base_game=G(cig_base)*fit
face_game=np.array([0,1.705,-.175])*fit;mouth_game=G(lips)*fit
axes={}
for n in ['head','neck','chest']:
 q=arm.data.bones[n].matrix_local.to_quaternion();a=q.inverted()@B([0,1,0]);axes[n]=list(a.normalized())
contract={'version':2,'holdClip':'warning_hold','gestureClip':'warning_smoke','walkClip':'warning_walk','walkDurationSec':CYCLE,'strideM':STRIDE,'gestureDurationSec':2.8,'departureClip':'warning_depart','departureDurationSec':DEPART,
 'anchors':{'ember':{'joint':'hand_R','position':ember_game.tolist()},'cigaretteBase':{'joint':'hand_R','position':base_game.tolist()},'face':{'joint':'head','position':face_game.tolist()},'mouth':{'joint':'head','position':mouth_game.tolist()}},
 'gazeAxes':axes,'morphs':{'coatSettle':'coat_settle','collarSettle':'collar_settle'},'anchorSpace':'bind-mesh game coordinates; transform by sampled world*inverseBind bone palette',
 'gait':{'strideMetres':STRIDE,'cycleSec':CYCLE,'phaseOffset':PHASE0,'plantedWindows':PLANTED},'departurePivot':PIVOT,
 'heightM':max_h*fit,'heightFitBaked':fit,'rootTransform':'identity; scale baked in vertices/rest joints/animation translations'}
body.data['missingMan']=contract;body['missingMan']=contract
body['authoring']='Dedicated opaque Missing Man; retained CC0 anatomical human envelopes, bespoke knee coat, stand collar, felt trilby, baked relaxed finger curl and a cigarette between index and middle fingers.'
arm.name='tower_warning_missing_man_rig'
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=body
bpy.context.scene.frame_end=round(2.8*FPS)
OUT.parent.mkdir(parents=True,exist_ok=True)
STAGED=OUT.with_name('tower-warning-missing-man.building.glb')
bpy.ops.export_scene.gltf(filepath=str(STAGED),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_morph=True,export_morph_normal=True,export_extras=True,export_yup=True)

# Dense accessor normalization matches the bounded production character parser.
raw=STAGED.read_bytes();n,k=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+n]);bn,bk=struct.unpack_from('<II',raw,20+n);binary=bytearray(raw[28+n:28+n+bn])
width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};size={5121:1,5123:2,5125:4,5126:4}
for a in doc.get('accessors',[]):
 if 'sparse'not in a:continue
 stride=width[a['type']]*size[a['componentType']];dense=bytearray(a['count']*stride)
 if 'bufferView'in a:
  v=doc['bufferViews'][a['bufferView']];off=v.get('byteOffset',0)+a.get('byteOffset',0);dense[:]=binary[off:off+len(dense)]
 s=a['sparse'];iv=doc['bufferViews'][s['indices']['bufferView']];vv=doc['bufferViews'][s['values']['bufferView']];io=iv.get('byteOffset',0)+s['indices'].get('byteOffset',0);vo=vv.get('byteOffset',0)+s['values'].get('byteOffset',0);ic=s['indices']['componentType']
 for i in range(s['count']):
  ix=struct.unpack_from('<'+{5121:'B',5123:'H',5125:'I'}[ic],binary,io+i*size[ic])[0];dense[ix*stride:(ix+1)*stride]=binary[vo+i*stride:vo+(i+1)*stride]
 binary.extend(b'\0'*(-len(binary)%4));off=len(binary);binary.extend(dense);a['bufferView']=len(doc['bufferViews']);a['byteOffset']=0;a.pop('sparse');doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(dense)})
for m in doc.get('materials',[]):
 m.pop('extensions',None);m['alphaMode']='OPAQUE'
 if m['name']=='warning_negative_core':m['pbrMetallicRoughness']={'baseColorFactor':[0,0,0,1],'metallicFactor':0,'roughnessFactor':1};m['emissiveFactor']=[0,0,0]
doc.pop('extensionsUsed',None);doc.pop('extensionsRequired',None)
for m in doc['meshes']:m.setdefault('extras',{})['missingMan']=contract
doc['animations']=[a for a in doc.get('animations',[])if a.get('name','').startswith('warning_')]
used={a['bufferView']for a in doc['accessors']if'bufferView'in a}|{im['bufferView']for im in doc.get('images',[])if'bufferView'in im};packed=bytearray();views=[];mapping={}
for i,v in enumerate(doc['bufferViews']):
 if i not in used:continue
 packed.extend(b'\0'*(-len(packed)%4));old=v.get('byteOffset',0);nv=dict(v);nv['byteOffset']=len(packed);packed.extend(binary[old:old+v['byteLength']]);mapping[i]=len(views);views.append(nv)
for a in doc['accessors']:
 if'bufferView'in a:a['bufferView']=mapping[a['bufferView']]
for im in doc.get('images',[]):
 if'bufferView'in im:im['bufferView']=mapping[im['bufferView']]
doc['bufferViews']=views;binary=packed;doc['buffers'][0]['byteLength']=len(binary)
text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*(-len(text)%4);binary+=b'\0'*(-len(binary)%4)
data=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary;STAGED.write_bytes(data);STAGED.replace(OUT)
metrics={'source':str(Path(__file__).relative_to(ROOT)),'sourceAsset':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'blender':bpy.app.version_string,'units':'metres','forward':'-Z','heightM':contract['heightM'],'heightFitBaked':fit,'mesh':'tower_warning_missing_man','bones':[b.name for b in arm.data.bones],'materials':[m['name']for m in doc['materials']],'clips':{'hold':'warning_hold','smoke':'warning_smoke','walk':'warning_walk','depart':'warning_depart'},'durations':{'hold':1.1,'smoke':2.8,'walk':CYCLE,'depart':DEPART},'gait':{'strideMetres':STRIDE,'cycleSec':CYCLE,'plantedWindows':PLANTED,'pelvisBase':WALK_BASE,'toeClearance':REPORT['toeClearance'],'reach':REPORT['reach'],'qualification':'Procedural distance-owned walk authored on the fitted rest skeleton: heel strike, flat stance, heel-off roll over the ball, ~3cm pelvic rise, sway, list and counter-rotated chest.'},'departurePivot':PIVOT,'rig':{n:{'bone':n,'yawAxis':a}for n,a in axes.items()},'cigarette':{'baseBindMeshGame':base_game.tolist(),'emberBindMeshGame':ember_game.tolist(),'axisBindMeshGame':G(cig_axis).tolist(),'gripBindMeshGame':(G(grip)*fit).tolist(),'handLocalBlender':list((rest['hand_R'][2].inverted()@cig_tip)),'joint':'hand_R','socketQualification':'Rigid hand-weighted prop wedged in the gap between the curled index and middle first phalanges, filter proud on the palm side; arm motion baked, no runtime hand override.'},'missingMan':contract,'meshes':{m['name']:{'vertices':sum(doc['accessors'][p['attributes']['POSITION']]['count']for p in m['primitives']),'triangles':sum(doc['accessors'][p['indices']]['count']//3 for p in m['primitives']),'primitives':len(m['primitives'])}for m in doc['meshes']},'qualityLimits':['No actor mocap; every clip is procedural FK/IK on the retained anatomical rig.','Fingers are single rigid bones in the source rig; the relaxed curl is baked into the bind mesh.','Negative hull keeps original concealed outfit geometry black; only bespoke outercoat/hat/hand/boots/prop materials receive light.']}
META.write_text(json.dumps(metrics,indent=2)+'\n')
(OUT.parent/'tower-warning-missing-man.credits.json').write_text(json.dumps({'asset':OUT.name,'source':metrics['source'],'anatomicalSource':'MakeHuman hm08 CC0-1.0 via retained outskirts_overprint_body; see tools/chunk_surfer/character-sources/makehuman/{sources,weights-sources}.json and system/sources.json','retained':'Anatomical topology/envelopes, right-hand skin UV/texture and boot geometry/material. Shared source file unchanged.','bespoke':'Fitted thick knee overcoat, open front, stand collar and shoulder yoke, notched lapels, welt pockets, physical cuffs, pinched felt trilby/brim/ribbon, baked finger curl, cigarette/ash/ember geometry, garment correctives and procedural standing/smoke/depart/walk performances.','conceptReference':'artifacts/outside-warning-ghost-study/concept-missing.png, generated design reference, not projected onto mesh.','license':'CC0 source components; Chunk Surfer-authored adaptation and geometry.'},indent=2)+'\n')
print('MISSING_MAN_BUILT',json.dumps({'bytes':len(data),'height':contract['heightM'],'fit':fit,'meshes':metrics['meshes'],'animations':[a['name']for a in doc.get('animations',[])]}))
