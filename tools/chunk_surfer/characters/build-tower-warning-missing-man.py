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
old_actions={a.name:a for a in bpy.data.actions}
def B(p):return Vector((p[0],-p[2],p[1]))
def G(p):return np.array((p[0],p[2],-p[1]),float)
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def frame(t):
 f=t*FPS;bpy.context.scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
def sample(action,t):
 arm.animation_data.action=action;frame(t)
 return {b.name:b.matrix.copy() for b in arm.pose.bones}
hold_source=sample(old_actions['idle'],0)
walk_source=[sample(old_actions['walk'],i/FPS) for i in range(round(1.1*FPS)+1)]
arm.animation_data.action=None
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
  if y<1.05:
   side='L'if x<0 else'R';leg=smooth((.91-y)/.5)*.18;rows.append({'pelvis':1-leg,'thigh_'+side:leg})
  else:rows.append(weights_at(p))
faces=[]
for j in range(len(ys)-1):
 for k in range(sides):q=j*(sides+1)+k;faces.append((q,q+1,q+sides+2,q+sides+1))
coat=mesh('tailored knee overcoat',verts,faces,'warning_coat_wool',rows,uv,.0042)
# Front-edge binding follows the actual open skirt and lapel, not a printed stripe.
for side in [-1,1]:
 pts=[]
 for y in np.linspace(.44,1.46,32):
  rx,rz,g=[profile_at(y,k)for k in [1,2,3]];pts.append([side*math.sin(g)*rx,y,-math.cos(g)*rz-.014])
 tube('bound front edge',pts,[.0022]*len(pts),'warning_lining',sides=8)

# Swept sleeves use actual anatomical shoulder/elbow/wrist points and envelope
# transfer, with several shaping rings and a physical cuff edge.
for side in ['L','R']:
 sh=G(rest['upperarm_'+side][0]);el=G(rest['forearm_'+side][0]);wr=G(rest['hand_'+side][0])
 pts=[];radii=[]
 for t in np.linspace(0,1,11):pts.append(sh*(1-t)+el*t);radii.append((.105*(1-t)+.080*t,.100*(1-t)+.077*t))
 for t in np.linspace(.1,1,11):pts.append(el*(1-t)+wr*t);radii.append((.080*(1-t)+.057*t,.077*(1-t)+.054*t))
 tube('fitted shaped sleeve '+side,pts,radii,'warning_coat_wool',sides=32,thickness=.0035)
 axis=(wr-el);axis/=np.linalg.norm(axis)
 tube('bound cuff '+side,[wr-axis*.022,wr+axis*.004],[(.059,.057),(.058,.056)],'warning_lining',sides=32,thickness=.003)

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
 # Collar rolls back around the side of the neck rather than a flat V sticker.
 pts=[]
 for a in np.linspace(-.1,math.pi*.94,28):pts.append([s*(.085+.025*math.sin(a)),1.51+.045*math.sin(a),-.015+.093*math.cos(a)])
 tube('rolled collar '+str(s),pts,[(.014,.023)]*len(pts),'warning_coat_wool',weight='chest',sides=12)
 # Welt pocket: actual folded narrow opening, fitted to each skirt surface.
 pp=[[s*.182,1.045,-.143],[s*.217,.995,-.146],[s*.249,.958,-.140]]
 tube('slanted welt pocket '+str(s),pp,[(.008,.005)]*3,'warning_lining',weight='pelvis',sides=10)

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

# Cigarette is fitted between the two actual anatomical finger chains in bind
# space. The whole prop is rigidly weighted to the hand, not world-followed.
idx0=rest['index_R'][0];idx1=rest['index_R'][1];mid0=rest['middle_R'][0];mid1=rest['middle_R'][1]
grip=((idx0.lerp(idx1,.52)+mid0.lerp(mid1,.52))*.5)
forward=(idx1-idx0).normalized();across=(idx0-mid0).normalized();normal=across.cross(forward).normalized()
if normal.y<0:normal=-normal
cig_axis=normal
cig_base=grip-cig_axis*.014;cig_tip=cig_base+cig_axis*.086
def cigpart(name,a,b,r,mat):return tube(name,[G(a),G(b)],[(r,r),(r,r)],mat,weight='hand_R',sides=20)
cigpart('cigarette ochre filter',cig_base,cig_base+cig_axis*.022,.0038,'warning_cigarette_filter')
cigpart('cigarette paper',cig_base+cig_axis*.022,cig_tip-cig_axis*.009,.0035,'warning_cigarette_paper')
cigpart('cigarette uneven ash',cig_tip-cig_axis*.009,cig_tip-cig_axis*.001,.0036,'warning_ash')
cigpart('finite ember',cig_tip-cig_axis*.0012,cig_tip,.0035,'warning_ember')

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

def scale_matrix(m):
 out=m.copy();out.translation*=fit;return out
def orient(pb,head,tail,rotation=None):
 if rotation is None:
  base=pb.bone.matrix_local.to_quaternion();old=(pb.bone.tail_local-pb.bone.head_local).normalized();new=(tail-head).normalized();rotation=old.rotation_difference(new)@base
 m=rotation.to_matrix().to_4x4();m.translation=head;pb.matrix=m
def solve(a,b,l1,l2,pole):
 v=b-a;d=min(v.length,l1+l2-.0005);u=v.normalized();w=pole-a-u*(pole-a).dot(u);w.normalize();c=(l1*l1+d*d-l2*l2)/(2*d);return a+u*c+w*math.sqrt(max(0,l1*l1-c*c))
def pose_arms(near):
 for side in ['L','R']:
  upper=arm.pose.bones['upperarm_'+side];fore=arm.pose.bones['forearm_'+side];hand=arm.pose.bones['hand_'+side]
  sh=upper.head.copy();l1=upper.bone.length;l2=fore.bone.length
  target=np.array([.30,1.23,-.29])*(1-near)+np.array([.245,1.53,-.265])*near if side=='R'else np.array([-.205,.985,-.12])
  wr=B(target)*fit;pole=B([.58,1.24,-.08]if side=='R'else[-.5,1.13,-.05])*fit;el=solve(sh,wr,l1,l2,pole)
  orient(upper,sh,el);bpy.context.view_layer.update();orient(fore,el,wr);bpy.context.view_layer.update()
  # The entire hand frame is solved from a forward vector and palm normal.
  old_hand=hand.matrix.copy();old_fingers={n:arm.pose.bones[n+'_'+side].matrix.copy()for n in ['thumb','index','middle','ring','little']}
  if side=='R':
   oldF=(rest['middle_R'][1]-rest['middle_R'][0]).normalized();oldS=(rest['index_R'][0]-rest['little_R'][0]).normalized();oldN=oldS.cross(oldF).normalized()
   newF=B([-.25,.93,-.28]).normalized();newN=B([0,0,1]);newN-=newF*newN.dot(newF);newN.normalize();newS=newF.cross(newN).normalized()
   oldS=oldF.cross(oldN).normalized();source=Matrix((oldS,oldF,oldN)).transposed();dest=Matrix((newS,newF,newN)).transposed();rot=(dest@source.inverted()).to_quaternion()
   orient(hand,wr,wr+rot@(hand.bone.tail_local-hand.bone.head_local),rot)
  else:orient(hand,wr,wr+B([.01,-.05,.025])*fit)
  bpy.context.view_layer.update();delta=hand.matrix@old_hand.inverted()
  for n,m in old_fingers.items():
   target=delta@m
   if side=='R'and n in ['ring','little']:
    # Relax only the unused fingers at their real MCP roots. Index, middle,
    # cigarette socket and palm frame remain exactly the validated grip.
    q=Quaternion(newS,math.radians(35));rot=q@target.to_quaternion();tm=rot.to_matrix().to_4x4();tm.translation=target.translation;target=tm
   arm.pose.bones[n+'_'+side].matrix=target
  bpy.context.view_layer.update()
def set_pose(source,near):
 desired={name:scale_matrix(m)for name,m in source.items()}
 # Compute each LOCAL basis against the SAME desired parent frame. Sequential
 # absolute matrix assignment would otherwise use a stale evaluated parent.
 for name,pb in arm.pose.bones.items():
  parent=pb.bone.parent;local_rest=pb.bone.matrix_local
  if parent:
   local_rest=parent.matrix_local.inverted()@local_rest
   pb.matrix_basis=local_rest.inverted()@desired[parent.name].inverted()@desired[name]
  else:pb.matrix_basis=local_rest.inverted()@desired[name]
 bpy.context.view_layer.update();pose_arms(near)
def create_action(name,seconds,source_fn,near_fn):
 action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
 count=round(seconds*FPS)
 for i in range(count+1):
  t=i/FPS;set_pose(source_fn(t),near_fn(t))
  for b in arm.pose.bones:
   b.rotation_mode='QUATERNION';b.keyframe_insert(data_path='location',frame=i,group=b.name);b.keyframe_insert(data_path='rotation_quaternion',frame=i,group=b.name);b.keyframe_insert(data_path='scale',frame=i,group=b.name)
 return action
hold=create_action('warning_hold',1.1,lambda t:hold_source,lambda t:0)
def near(t):
 if t<.9:return smooth((t-.25)/.65)
 if t<1.3:return 1
 return 1-smooth((t-1.3)/.8)
smoke=create_action('warning_smoke',2.8,lambda t:hold_source,near)
def upright_walk(t):
 original=walk_source[min(len(walk_source)-1,round(t*FPS))]
 out={name:m.copy()for name,m in hold_source.items()}
 # Keep the upright held torso. The source gait contributes only bounded
 # pelvis travel and its anatomically solved leg chains, never a folded shell.
 delta=original['pelvis'].translation-hold_source['pelvis'].translation
 delta.x=max(-.018,min(.018,delta.x));delta.y=max(-.02,min(.02,delta.y));delta.z=max(-.075,min(.012,delta.z))
 for name,m in out.items():m.translation+=delta
 for name in out:
  if name.startswith(('thigh_','shin_','foot_','toe_')):out[name]=original[name].copy()
 return out
def aim_source(name,h,t):
 old=(rest[name][1]-rest[name][0]).normalized();q=old.rotation_difference((t-h).normalized())@rest[name][2].to_quaternion();m=q.to_matrix().to_4x4();m.translation=h;return m
def departure_pose(t):
 u=smooth(t/1.05);target=upright_walk(0)
 if u<=0:return {n:m.copy()for n,m in hold_source.items()}
 if u>=1:return target
 out={}
 for name,hm in hold_source.items():
  tm=target[name];q=hm.to_quaternion().slerp(tm.to_quaternion(),u);m=q.to_matrix().to_4x4();m.translation=hm.translation.lerp(tm.translation,u);out[name]=m
 for side in ['L','R']:
  # During the existing departure hold, one support remains while the other
  # sets into the first stride. Actual ankle targets remain above the paving.
  p=smooth(u/.58) if side=='L'else smooth((u-.42)/.58)
  hip=out['thigh_'+side].translation;ankle=hold_source['foot_'+side].translation.lerp(target['foot_'+side].translation,p)
  ankle.z+=math.sin(math.pi*p)**2*(.045 if side=='L'else .033)
  pole=Vector((-.28 if side=='L'else .28,.55,.52))
  l1=(rest['thigh_'+side][1]-rest['thigh_'+side][0]).length;l2=(rest['shin_'+side][1]-rest['shin_'+side][0]).length
  knee=solve(hip,ankle,l1,l2,pole)
  out['thigh_'+side]=aim_source('thigh_'+side,hip,knee);out['shin_'+side]=aim_source('shin_'+side,knee,ankle)
  footq=hold_source['foot_'+side].to_quaternion().slerp(target['foot_'+side].to_quaternion(),p)
  fm=footq.to_matrix().to_4x4();fm.translation=ankle;out['foot_'+side]=fm
  out['toe_'+side]=fm@rest['foot_'+side][2].inverted()@rest['toe_'+side][2]
 return out
depart=create_action('warning_depart',1.05,departure_pose,lambda t:0)
walk=create_action('warning_walk',1.1,upright_walk,lambda t:0)
arm.animation_data.action=hold;frame(0)

# Mesh-coordinate anchors are for the existing world*inverseBind palette. A
# separate hand-local reference is supplied to avoid guessing a socket frame.
ember_game=G(cig_tip)*fit;base_game=G(cig_base)*fit
face_game=np.array([0,1.705,-.175])*fit
axes={}
for n in ['head','neck','chest']:
 q=arm.data.bones[n].matrix_local.to_quaternion();a=q.inverted()@B([0,1,0]);axes[n]=list(a.normalized())
contract={'version':1,'holdClip':'warning_hold','gestureClip':'warning_smoke','walkClip':'warning_walk','walkDurationSec':1.1,'strideM':1.2*fit,'gestureDurationSec':2.8,'departureClip':'warning_depart','departureDurationSec':1.05,
 'anchors':{'ember':{'joint':'hand_R','position':ember_game.tolist()},'cigaretteBase':{'joint':'hand_R','position':base_game.tolist()},'face':{'joint':'head','position':face_game.tolist()}},
 'gazeAxes':axes,'morphs':{'coatSettle':'coat_settle','collarSettle':'collar_settle'},'anchorSpace':'bind-mesh game coordinates; transform by sampled world*inverseBind bone palette',
 'heightM':max_h*fit,'heightFitBaked':fit,'rootTransform':'identity; scale baked in vertices/rest joints/animation translations'}
body.data['missingMan']=contract;body['missingMan']=contract
body['authoring']='Dedicated opaque Missing Man; retained CC0 anatomical human envelopes, bespoke knee coat, felt trilby and rigid hand-fitted cigarette.'
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
metrics={'source':str(Path(__file__).relative_to(ROOT)),'sourceAsset':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'blender':bpy.app.version_string,'units':'metres','forward':'-Z','heightM':contract['heightM'],'heightFitBaked':fit,'mesh':'tower_warning_missing_man','bones':[b.name for b in arm.data.bones],'materials':[m['name']for m in doc['materials']],'clips':{'hold':'warning_hold','smoke':'warning_smoke','walk':'warning_walk','depart':'warning_depart'},'durations':{'hold':1.1,'smoke':2.8,'walk':1.1,'depart':1.05},'gait':{'strideMetres':1.2*fit,'qualification':'Retained authored1.2m full-cycle source stride, uniformly height-fitted; actual planted-foot sampling must validate before visual acceptance.'},'rig':{n:{'bone':n,'yawAxis':a}for n,a in axes.items()},'cigarette':{'baseBindMeshGame':base_game.tolist(),'emberBindMeshGame':ember_game.tolist(),'axisBindMeshGame':G(cig_axis).tolist(),'gripBindMeshGame':(G(grip)*fit).tolist(),'handLocalBlender':list((rest['hand_R'][2].inverted()@cig_tip)),'joint':'hand_R','socketQualification':'Rigid hand-weighted prop fitted between actual source index/middle chains; arm motion baked, no runtime hand Euler override.'},'missingMan':contract,'meshes':{m['name']:{'vertices':sum(doc['accessors'][p['attributes']['POSITION']]['count']for p in m['primitives']),'triangles':sum(doc['accessors'][p['indices']]['count']//3 for p in m['primitives']),'primitives':len(m['primitives'])}for m in doc['meshes']},'qualityLimits':['No actor mocap; authored FK/IK performance from retained anatomical source.','Actual game final dither, costume clipping, cigarette contact, stride and negative-core validation pending.','Negative hull keeps original concealed outfit geometry black; only bespoke outercoat/hat/hand/boots/prop materials receive light.']}
META.write_text(json.dumps(metrics,indent=2)+'\n')
(OUT.parent/'tower-warning-missing-man.credits.json').write_text(json.dumps({'asset':OUT.name,'source':metrics['source'],'anatomicalSource':'MakeHuman hm08 CC0-1.0 via retained outskirts_overprint_body; see tools/chunk_surfer/character-sources/makehuman/{sources,weights-sources}.json and system/sources.json','retained':'Anatomical topology/envelopes, right-hand skin UV/texture, boot geometry/material and authored source walk leg motion. Shared source file unchanged.','bespoke':'Fitted thick knee overcoat, open front, rolled collar, notched lapels, welt pockets, physical cuffs, pinched felt trilby/brim/ribbon, cigarette/ash/ember geometry, diagnostic garment correctives and warning hold/smoke/walk performances.','conceptReference':'artifacts/outside-warning-ghost-study/concept-missing.png, generated design reference, not projected onto mesh.','license':'CC0 source components; Chunk Surfer-authored adaptation and geometry.'},indent=2)+'\n')
print('MISSING_MAN_BUILT',json.dumps({'bytes':len(data),'height':contract['heightM'],'fit':fit,'meshes':metrics['meshes'],'animations':[a['name']for a in doc.get('animations',[])]}))
