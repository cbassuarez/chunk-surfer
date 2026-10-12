"""Authored continuous-surface outskirts character source. Blender 4.5 LTS.
Regenerate: /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/chunk_surfer/characters/build-outskirts-characters.py
Uses retained MakeHuman hm08 CC0 anatomical base; provenance in character-sources/makehuman/sources.json. Licensed anatomical geometry, UV maps and envelopes retained; compact rig, fitting, corrective shapes and performance adapted/authored here.
Coordinate contract: glTF metres, Y-up, forward -Z; Fold root at chair-floor center; left palm contacts [-.55,.82,-.14], seated contact [0,.47,.04].
"""
import bpy, math, os, json, struct, random, sys, hashlib
import numpy as np
from mathutils import Vector, Matrix
from math import sin,cos,pi,exp,sqrt
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
OUT=os.environ.get('CHUNK_CHARACTER_OUT',os.path.join(ROOT,'public/assets/outskirts-characters.glb'))
SOURCE=os.environ.get('CHUNK_CHARACTER_SOURCE',os.path.join(ROOT,'assets/source/outskirts-characters.blend'))
TEX=os.environ.get('CHUNK_CHARACTER_TEXTURES',os.path.join(ROOT,'public/assets/outskirts-characters'))
PRE=os.environ.get('CHUNK_CHARACTER_PREVIEW','/tmp/outskirts-character-preview')
for p in [TEX,PRE,os.path.dirname(SOURCE)]:os.makedirs(p,exist_ok=True)
RESUME='--resume' in sys.argv or '--rebake' in sys.argv
REBAKE='--rebake' in sys.argv
if RESUME:bpy.ops.wm.open_mainfile(filepath=os.environ.get('CHUNK_CHARACTER_SOURCE_INPUT',SOURCE))
else:bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(1988)
# Model in game coordinates and convert to Blender's Z-up, front +Y.
def B(p):return Vector((p[0],-p[2],p[1]))
def G(p):return np.array((p[0],p[2],-p[1]))
def smooth(v):v=max(0,min(1,v));return v*v*(3-2*v)
def gauss(x,c,w):return exp(-((x-c)/w)**2)
materials={}
def image(name,pixels):
 h,w,_=pixels.shape; im=bpy.data.images.new(name,width=w,height=h,alpha=True);im.pixels.foreach_set(pixels.astype(np.float32).ravel());im.filepath_raw=os.path.join(TEX,name+'.png');im.file_format='PNG';im.save();return im
N=512;y,x=np.mgrid[0:N,0:N];rng=np.random.default_rng(1988)
for kind,base,rough in [('wool',(0.078,0.091,0.085),.87),('playercloth',(0.12,.115,.097),.9),('skin',(.44,.29,.215),.69),('leather',(.047,.039,.031),.64)]:
 noise=rng.normal(0,1,(N,N));weave=(np.sin(x*pi)+np.sin(y*pi))*.5
 broad=np.sin(x*.027+y*.017)*np.sin(y*.043)*.03
 delta=noise*.009+(broad*.25 if kind=='skin' else broad*.5)+(weave*.018 if 'cloth' in kind or kind=='wool' else .003*np.sin(x*.31+y*.29))
 color=np.ones((N,N,4));color[:,:,:3]=np.clip(np.array(base)[None,None,:]+delta[:,:,None],.005,.95)
 if kind=='skin':
  mottled=np.sin(x*.051)*np.sin(y*.033)*.014;color[:,:,0]+=mottled;color[:,:,1]-=mottled*.3
 al=image(kind+'-albedo',color)
 height=noise*.1+(np.sin(x*pi*.5)*np.sin(y*pi*.5)*.21 if kind in ['wool','playercloth'] else np.sin(x*.7+y*.23)*.07)
 dx=np.roll(height,-1,1)-np.roll(height,1,1);dy=np.roll(height,-1,0)-np.roll(height,1,0)
 norm=np.stack((-dx,-dy,np.ones_like(dx)),2);norm/=np.linalg.norm(norm,axis=2)[:,:,None];nm=np.ones((N,N,4));nm[:,:,:3]=norm*.5+.5;normal=image(kind+'-normal',nm);normal.colorspace_settings.name='Non-Color'
 orm=np.ones((N,N,4));orm[:,:,0]=.96;orm[:,:,1]=np.clip(rough+noise*.025+np.sin(x*.021)*.03,.3,1);orm[:,:,2]=0;om=image(kind+'-orm',orm);om.colorspace_settings.name='Non-Color'
 m=bpy.data.materials.new(kind);m.use_nodes=True;n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=0
 tex=n.new('ShaderNodeTexImage');tex.image=al;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
 nt=n.new('ShaderNodeTexImage');nt.image=normal;nn=n.new('ShaderNodeNormalMap');nn.inputs['Strength'].default_value=.38;m.node_tree.links.new(nt.outputs['Color'],nn.inputs['Color']);m.node_tree.links.new(nn.outputs['Normal'],p.inputs['Normal'])
 ot=n.new('ShaderNodeTexImage');ot.image=om;sep=n.new('ShaderNodeSeparateColor');m.node_tree.links.new(ot.outputs['Color'],sep.inputs['Color']);m.node_tree.links.new(sep.outputs['Green'],p.inputs['Roughness']);materials[kind]=m
for name,col,rough,metal in [('seam',(.045,.052,.046),.9,0),('hair',(.027,.024,.020),.9,0),('sclera',(.39,.36,.31),.48,0),('iris',(.052,.047,.033),.5,0),('pupil',(.005,.006,.005),.4,0),('mouth',(.045,.011,.011),.8,0),('lip',(.30,.16,.125),.7,0),('teeth',(.52,.46,.35),.65,0),('brass',(.25,.18,.07),.5,.55),('sole',(.018,.019,.017),.94,0),('patch',(.12,.13,.1),.95,0),('nail',(.39,.28,.205),.62,0)]:
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;materials[name]=m
objects=[]
def mesh(name,verts,faces,mat,weights=None):
 me=bpy.data.meshes.new(name);me.from_pydata([B(v) for v in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(materials[mat]);
 for p in me.polygons:p.use_smooth=True
 if weights:
  gs={n:o.vertex_groups.new(name=n) for n in set(k for w in weights for k in w)}
  for i,w in enumerate(weights):
   total=sum(w.values()) or 1
   for k,v in w.items():gs[k].add([i],v/total,'REPLACE')
 objects.append(o);return o
# Axis independent ellipsoid with a hand-sculpted UV face option.
def ellipsoid(name,c,r,mat,bone,seg=32,rings=20,sculpt=None):
 verts=[];faces=[]
 for j in range(rings+1):
  a=pi*j/rings
  for i in range(seg):
   t=2*pi*i/seg;v=np.array((c[0]+r[0]*sin(a)*cos(t),c[1]+r[1]*cos(a),c[2]+r[2]*sin(a)*sin(t)))
   if sculpt:v=sculpt(v)
   verts.append(v)
 for j in range(rings):
  for i in range(seg):
   ni=(i+1)%seg;faces.append((j*seg+i,j*seg+ni,(j+1)*seg+ni,(j+1)*seg+i))
 return mesh(name,verts,faces,mat,[{bone:1} for _ in verts])
def path_surface(name,points,radii,mat,bones,seg=32,fold=0):
 pts=[np.array(p) for p in points];verts=[];faces=[];weights=[]
 for j,(p,rs) in enumerate(zip(pts,radii)):
  t=pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)];t=t/(np.linalg.norm(t) or 1);ref=np.array([0,0,1.]) if abs(t[2])<.85 else np.array([1.,0,0]);u=np.cross(t,ref);u/=np.linalg.norm(u);v=np.cross(t,u)
  for i in range(seg):
   a=2*pi*i/seg;wr=1+fold*(sin(j*1.65+i*.12)*.6+sin(j*.51-i*.26)*.4);verts.append(p+u*cos(a)*rs[0]*wr+v*sin(a)*rs[1]*wr);weights.append(bones[j] if isinstance(bones[j],dict) else {bones[j]:1})
 for j in range(len(pts)-1):
  for i in range(seg):ni=(i+1)%seg;faces.append((j*seg+i,j*seg+ni,(j+1)*seg+ni,(j+1)*seg+i))
 faces.append(tuple(range(seg-1,-1,-1)));faces.append(tuple((len(pts)-1)*seg+i for i in range(seg)))
 return mesh(name,verts,faces,mat,weights)
def line(name,points,radius,mat,bone,seg=8):
 weights=[bone]*len(points)
 if bone=='spine_mid' and max(p[1]for p in points)-min(p[1]for p in points)>.25:
  weights=[]
  for p in points:
   y=p[1];names=['pelvis','spine_lower','spine_mid','spine_upper','chest'];dist=[(abs(y-(REST[n][0][1]+REST[n][1][1])*.5),n)for n in names];dist.sort();v={n:exp(-(d/.09)**2) for d,n in dist[:2]};weights.append(v)
 return path_surface(name,points,[(radius,radius)]*len(points),mat,weights,seg)
def join(obs,name):
 global objects
 objects=[q for q in objects if q not in obs]+[obs[0]]
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name=name;o.data.name=name;return o

def remesh(obs,name,voxel,bones):
 o=join(obs,name);mod=o.modifiers.new('continuous sculpt union','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel;mod.use_smooth_shade=True;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 sm=o.modifiers.new('relax anatomical junctions','SMOOTH');sm.factor=.65;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
 # Reweight remeshed surface to the true anatomical chains, bounded to relevant bones.
 for vg in list(o.vertex_groups):o.vertex_groups.remove(vg)
 groups={b:o.vertex_groups.new(name=b) for b in bones}
 for v in o.data.vertices:
  p=G(v.co);d=[]
  for b in bones:
   a,z,_=REST[b];ab=np.array(z)-a;t=np.clip(np.dot(p-a,ab)/(np.dot(ab,ab) or 1),0,1);d.append((np.linalg.norm(p-(np.array(a)+ab*t)),b))
  d.sort();near=d[:3];val=[exp(-((dd-near[0][0])/.055)**2)*exp(-dd*2) for dd,b in near];total=sum(val)
  for (dd,b),w in zip(near,val):groups[b].add([v.index],w/total,'REPLACE')
 return o
# Rig: no scales, 34 joints; local additive head/jaw overrides remain available.
REST={}
def bone(n,h,t,parent=None):REST[n]=(np.array(h,float),np.array(t,float),parent)
bone('pelvis',[0,.96,0],[0,1.06,-.03]);bone('spine_lower',[0,1.06,-.03],[0,1.17,-.065],'pelvis');bone('spine_mid',[0,1.17,-.065],[0,1.29,-.10],'spine_lower');bone('spine_upper',[0,1.29,-.10],[0,1.40,-.12],'spine_mid');bone('chest',[0,1.40,-.12],[0,1.51,-.12],'spine_upper');bone('neck',[0,1.51,-.12],[0,1.654,-.12],'chest');bone('head',[0,1.654,-.12],[0,1.81,-.12],'neck');bone('jaw',[0,1.625,-.17],[0,1.57,-.23],'head')
for side,s in [('L',-1),('R',1)]:
 bone('clavicle_'+side,[0,1.46,-.12],[s*.225,1.47,-.12],'chest');bone('upperarm_'+side,[s*.225,1.47,-.12],[s*.42,1.19,-.08],'clavicle_'+side);bone('forearm_'+side,[s*.42,1.19,-.08],[s*.47,.88,-.08],'upperarm_'+side);bone('hand_'+side,[s*.47,.88,-.08],[s*.47,.73,-.08],'forearm_'+side)
 for fi,fn in enumerate(['thumb','index','middle','ring','little']):
  fx=s*(.435+fi*.019);fy=.80 if fi==0 else .777;bone(fn+'_'+side,[fx,fy,-.08],[fx-s*.012,.70+(abs(2-fi))*.012,-.092],'hand_'+side)
 bone('thigh_'+side,[s*.105,.96,0],[s*.12,.53,-.025],'pelvis');bone('shin_'+side,[s*.12,.53,-.025],[s*.12,.11,0],'thigh_'+side);bone('foot_'+side,[s*.12,.11,0],[s*.12,.055,-.18],'shin_'+side);bone('toe_'+side,[s*.12,.055,-.18],[s*.12,.045,-.27],'foot_'+side)
# Anatomical human source: MakeHuman hm08 CC0 mesh and male macro targets.
# All proxy/joint/helper groups are excluded from visible body geometry.
MH_DIR=os.path.join(ROOT,'tools/chunk_surfer/character-sources/makehuman')
MH_VERT=[];MH_FACES={};group='';MH_UV=[]
for lineobj in open(os.path.join(MH_DIR,'base.obj')):
 tok=lineobj.split()
 if not tok:continue
 if tok[0]=='v':MH_VERT.append(list(map(float,tok[1:4])))
 elif tok[0]=='vt':MH_UV.append(list(map(float,tok[1:3])))
 elif tok[0]=='g':group=tok[1]
 elif tok[0]=='f':MH_FACES.setdefault(group,[]).append([int(v.split('/')[0])-1 for v in tok[1:]])
MH_VERT=np.array(MH_VERT)
# Preserve original hm08 indices. Authored MakeHuman envelopes cover body and proxy helper surfaces.
SOURCE_WEIGHTS=json.load(open(os.path.join(MH_DIR,'default_weights.mhw')))['weights']
SOURCE_SKELETON=json.load(open(os.path.join(MH_DIR,'default.mhskel')))
def compact_bone(name):
 if name in ['root','spine05']or name.startswith('pelvis.'):return 'pelvis'
 if name.startswith('spine'):return {'spine04':'spine_lower','spine03':'spine_mid','spine02':'spine_upper','spine01':'chest'}[name]
 if name.startswith('neck'):return 'neck'
 if name=='jaw'or name.startswith('tongue')or name in ['oris01','special04']or name.startswith('oris07.'):return 'jaw'
 if name.startswith('breast.'):return 'chest'
 side='R'if name.endswith('.L')else'L'
 stem=name.split('.')[0]
 for prefix,target in [('clavicle','clavicle'),('shoulder','clavicle'),('upperarm','upperarm'),('lowerarm','forearm'),('upperleg','thigh'),('lowerleg','shin'),('wrist','hand'),('metacarpal','hand'),('foot','foot'),('toe','toe')]:
  if stem.startswith(prefix):return target+'_'+side
 if stem.startswith('finger'):return ['thumb','index','middle','ring','little'][int(stem[6])-1]+'_'+side
 # Facial muscles, eyes and helper envelopes remain attached to the cranium.
 return 'head'
AUTHORED_WEIGHTS=[{}for _ in MH_VERT]
for name,rows in SOURCE_WEIGHTS.items():
 target=compact_bone(name)
 for index,w in rows:AUTHORED_WEIGHTS[index][target]=AUTHORED_WEIGHTS[index].get(target,0)+w
for index,w in enumerate(AUTHORED_WEIGHTS):
 if not w:raise RuntimeError('Missing authored envelope for hm08 vertex '+str(index))
 total=sum(w.values());AUTHORED_WEIGHTS[index]={n:a/total for n,a in w.items()if a>1e-7}
def mh_role(role):
 import gzip
 v=MH_VERT.copy();old=.52 if role=='guard'else .16
 for age,weight in [('old',old),('young',1-old)]:
  for prefix in ['caucasian-male-','universal-male-']:
   filename=prefix+age+('-averagemuscle-averageweight'if prefix.startswith('universal')else'')+'.target.gz'
   for row in gzip.open(os.path.join(MH_DIR,filename),'rt'):
    a=row.split()
    if len(a)==4:v[int(a[0])]+=np.array(list(map(float,a[1:])))*weight
 bodyids=list(set(i for f in MH_FACES['body']for i in f));low=v[bodyids,1].min();scale=1.82/(v[bodyids,1].max()-low)
 v=np.stack((v[:,0]*scale,(v[:,1]-low)*scale,-v[:,2]*scale),1)
 def joint(name):return v[list(set(i for f in MH_FACES[name]for i in f))].mean(0)
 source={}
 def sb(n,a,b):source[n]=(joint(a),joint(b))
 sb('pelvis','joint-pelvis','joint-spine-4');sb('spine_lower','joint-spine-4','joint-spine-3');sb('spine_mid','joint-spine-3','joint-spine-2');sb('spine_upper','joint-spine-2','joint-spine-1');sb('chest','joint-spine-1','joint-neck');sb('neck','joint-neck','joint-head');sb('head','joint-head','joint-head-2');sb('jaw','joint-jaw','joint-mouth')
 jaw_source=SOURCE_SKELETON['bones']['jaw'];source['jaw']=tuple(v[SOURCE_SKELETON['joints'][jaw_source[k]]].mean(0)for k in ['head','tail'])
 for side,mh in [('R','l'),('L','r')]:
  sb('clavicle_'+side,'joint-spine-1','joint-'+mh+'-shoulder');sb('upperarm_'+side,'joint-'+mh+'-shoulder','joint-'+mh+'-elbow');sb('forearm_'+side,'joint-'+mh+'-elbow','joint-'+mh+'-hand');sb('hand_'+side,'joint-'+mh+'-hand','joint-'+mh+'-hand-3')
  for fi,fn in enumerate(['thumb','index','middle','ring','little']):sb(fn+'_'+side,'joint-'+mh+f'-finger-{fi+1}-1','joint-'+mh+f'-finger-{fi+1}-4')
  sb('thigh_'+side,'joint-'+mh+'-upper-leg','joint-'+mh+'-knee');sb('shin_'+side,'joint-'+mh+'-knee','joint-'+mh+'-ankle');sb('foot_'+side,'joint-'+mh+'-ankle','joint-'+mh+'-foot-1');sb('toe_'+side,'joint-'+mh+'-foot-1','joint-'+mh+'-foot-2')
 # Retarget anatomical A-pose geometry into our actual bind pose. Skin weights use anatomical chains.
 mats={}
 for n,(a,b)in source.items():
  th,tt,_=REST[n];delta=B(b-a).rotation_difference(B(tt-th));mats[n]=(delta,a,th,np.linalg.norm(tt-th)/(np.linalg.norm(b-a)or 1))
 result=[];weights=[]
 for index,p in enumerate(v):
  w=AUTHORED_WEIGHTS[index];out=np.zeros(3)
  for n,weight in w.items():
   rot,a,b,ratio=mats[n]
   out+=(G(rot@B(p-a))*min(1.12,max(.80,ratio))+b)*weight
  result.append(out);weights.append(w.copy())
 return np.array(result),weights,v,source,scale,mats

# Adopt source anatomical bind dimensions; source geometry is never forced into old placeholder proportions.
_,_,_,ANATOMICAL_BIND,_,_=mh_role('guard')
for name,(head,tail)in ANATOMICAL_BIND.items():REST[name]=(head.copy(),tail.copy(),REST[name][2])
SYSTEM=os.path.join(MH_DIR,'system')
def source_material(name,albedo,normal=None,rough=.86,mask=False,tint=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=0
 im=bpy.data.images.load(os.path.join(SYSTEM,albedo),check_existing=True).copy();cap=256 if name=='anatomical_eyes'else 512 if name=='short_hair'else 1024
 if max(im.size)>cap:im.scale(round(im.size[0]*cap/max(im.size)),round(im.size[1]*cap/max(im.size)))
 if tint:
  im=im.copy();pix=np.array(im.pixels[:]).reshape(-1,4);pix[:,:3]*=np.array(tint);im.pixels.foreach_set(pix.astype(np.float32).ravel());im.filepath_raw=os.path.join(TEX,name+'-albedo.png');im.file_format='PNG';im.save()
 extension='png'if mask else'jpg';im.filepath_raw=os.path.join(TEX,name+'-albedo.'+extension);im.file_format='PNG'if mask else'JPEG';im.save()
 tex=n.new('ShaderNodeTexImage');tex.image=im;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
 if mask:m.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha']);m['alphaClip']=.45
 if normal:
  imn=bpy.data.images.load(os.path.join(SYSTEM,normal),check_existing=True).copy()
  if max(imn.size)>512:imn.scale(round(imn.size[0]*512/max(imn.size)),round(imn.size[1]*512/max(imn.size)))
  imn.filepath_raw=os.path.join(TEX,name+'-normal.png');imn.file_format='PNG';imn.save();imn.colorspace_settings.name='Non-Color';nt=n.new('ShaderNodeTexImage');nt.image=imn;nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.65;m.node_tree.links.new(nt.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs['Normal'],p.inputs['Normal'])
 materials[name]=m;return m
source_material('skin_guard','skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png',rough=.68)
source_material('skin_player','skins/young_caucasian_male/young_lightskinned_male_diffuse.png',rough=.7)
source_material('workcoat_guard','clothes/male_elegantsuit01/male_elegantsuit01_diffuse.png',rough=.88)
source_material('workcoat_player','clothes/male_casualsuit01/male_casualsuit01_diffuse.png','clothes/male_casualsuit01/male_casualsuit01_normal.png',.90)
source_material('anatomical_eyes','eyes/materials/brown_eye.png',rough=.4)
source_material('short_hair','hair/short02/short02_diffuse.png','hair/short02/short02_normal.png',.87,True)
def read_source_obj(path):
 verts=[];uv=[];faces=[];uvfaces=[]
 for row in open(path):
  t=row.split()
  if not t:continue
  if t[0]=='v':verts.append(list(map(float,t[1:4])))
  elif t[0]=='vt':uv.append(list(map(float,t[1:3])))
  elif t[0]=='f':faces.append([int(x.split('/')[0])-1 for x in t[1:]]);uvfaces.append([int(x.split('/')[1])-1 if len(x.split('/'))>1 and x.split('/')[1]else 0 for x in t[1:]])
 return np.array(verts),uv,faces,uvfaces
MH_ALLUV=read_source_obj(os.path.join(MH_DIR,'base.obj'))[3];MH_UVGROUP={};cursor=0
for name,faces in MH_FACES.items():MH_UVGROUP[name]=MH_ALLUV[cursor:cursor+len(faces)];cursor+=len(faces)
# OBJ group names can recur; get body UV loops directly to preserve exact atlas coordinates.
MH_BODYUV=[];gr=''
for row in open(os.path.join(MH_DIR,'base.obj')):
 t=row.split()
 if not t:continue
 if t[0]=='g':gr=t[1]
 elif t[0]=='f'and gr=='body':MH_BODYUV.append([int(q.split('/')[1])-1 for q in t[1:]])
def uv_assign(o,uv,uvfaces):
 layer=o.data.uv_layers.new(name='UVMap')
 for p,face in zip(o.data.polygons,uvfaces):
  for li,ti in zip(p.loop_indices,face):layer.data[li].uv=uv[ti]
 o['preserveUV']=True

def mapped_asset(role,fitted,weights,scale,mats,folder,name,material):
 path=os.path.join(SYSTEM,folder,name);src,uv,faces,uvfaces=read_source_obj(path+'.obj');rows=[];reading=False
 for lineclo in open(path+'.mhclo'):
  a=lineclo.split()
  if not a or a[0].startswith('#'):continue
  if a[0]=='verts':reading=True;continue
  if reading:
   try:
    if len(a)==1:rows.append(([int(a[0])],[1.],[0,0,0]))
    elif len(a)==9:rows.append((list(map(int,a[:3])),list(map(float,a[3:6])),list(map(float,a[6:9]))))
    else:break
   except ValueError:break
 verts=[];outweights=[]
 for i,p in enumerate(src):
  if i>=len(rows):raise RuntimeError('incomplete MakeHuman proxy mapping '+name)
  ind,ww,offset=rows[i];point=sum((fitted[k]*w for k,w in zip(ind,ww)),np.zeros(3));weight={}
  for k,w in zip(ind,ww):
   for bn,bw in weights[k].items():weight[bn]=weight.get(bn,0)+w*bw
  total=sum(max(0,w)for w in weight.values())or 1;weight={bn:max(0,w)/total for bn,w in weight.items()};weight=dict(sorted(weight.items(),key=lambda z:z[1],reverse=True)[:4]);total=sum(weight.values());weight={bn:w/total for bn,w in weight.items()}
  delta=np.array([offset[0],offset[1],-offset[2]])*scale;rotated=np.zeros(3)
  for bn,w in weight.items():rotated+=G(mats[bn][0]@B(delta))*w
  verts.append(point+rotated);outweights.append(weight)
 # Original helper envelopes may meet abruptly across proxy triangles. Relax only
 # the transferred garment weights over its continuous indexed cloth topology.
 # This does not invent anatomy or use distance-to-bone weighting.
 if folder.startswith('clothes/'):
  names=list(REST);table=np.zeros((len(verts),len(names)));adj=[set()for _ in verts]
  for i,w in enumerate(outweights):
   for bn,bw in w.items():table[i,names.index(bn)]=bw
  for face in faces:
   for k,a in enumerate(face):b=face[(k+1)%len(face)];adj[a].add(b);adj[b].add(a)
  if role=='guard':
   # The closed jacket conceals the upper trouser waistband. Under the extreme
   # fold, independently skinned trouser seat triangles formerly pierced it.
   # Tuck this existing inner layer only; never alter the jacket or performance.
   seen=set();pants=[]
   for start in range(len(verts)):
    if start in seen:continue
    stack=[start];seen.add(start);component=[]
    while stack:
     i=stack.pop();component.append(i)
     for other in adj[i]:
      if other not in seen:seen.add(other);stack.append(other)
    lo=min(verts[i][1]for i in component);hi=max(verts[i][1]for i in component)
    if lo<.30 and .95<hi<1.20:pants.extend(component)
   if not pants:raise RuntimeError('Guard trouser component not found; refuse an unscoped fitting correction')
   count=0
   for i in pants:
    p=np.array(verts[i]);falloff=smooth((p[1]-.94)/.08)
    if not falloff:continue
    radial=np.array([p[0],0,p[2]-.02]);radial/=np.linalg.norm(radial)or 1;verts[i]=p-radial*.012*falloff;count+=1
   print('FIT guard concealed upper trousers',count,'vertices, max12mm inward',flush=True)
  for iteration in range(64):
   previous=table.copy()
   for i,near in enumerate(adj):
    if near:table[i]=previous[i]*.45+previous[list(near)].mean(0)*.55
  outweights=[]
  for row in table:
   take=np.argsort(row)[-4:];total=sum(row[take])or 1;outweights.append({names[k]:float(row[k]/total)for k in take if row[k]>1e-6})
 o=mesh(name+' '+role,verts,faces,material,outweights);uv_assign(o,uv,uvfaces);return o

def makehuman_body(role,cloth):
 fitted,weights,original,source,scale,mats=mh_role(role)
 bodyfaces=MH_FACES['body']
 ids=sorted(set(i for f in bodyfaces for i in f));remap={old:i for i,old in enumerate(ids)};verts=fitted[ids].copy()
 o=mesh('CC0 anatomical head neck and hands',verts,[tuple(remap[i]for i in f)for f in bodyfaces],'skin_'+role,[weights[i]for i in ids])
 uv_assign(o,MH_UV,MH_BODYUV)
 # Original authored envelopes transfer to garments through their own reference triangles.
 # Official clothing masks remove the underlying skin only where the full face is concealed.
 outfit='male_elegantsuit01'if role=='guard'else'male_casualsuit01';hidden=set();reading=False
 for row in open(os.path.join(SYSTEM,'clothes',outfit,outfit+'.mhclo')):
  tok=row.split()
  if not tok:continue
  if tok[0]=='delete_verts':reading=True;continue
  if reading:
   i=0
   while i<len(tok):
    if not tok[i].isdigit():i+=1;continue
    start=int(tok[i]);end=start
    if i+2<len(tok)and tok[i+1]=='-':end=int(tok[i+2]);i+=2
    hidden.update(range(start,end+1));i+=1
 import bmesh
 bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table();dead=[bm.faces[i]for i,f in enumerate(bodyfaces)if all(k in hidden for k in f)or all(fitted[k][1]<.14 for k in f)];bmesh.ops.delete(bm,geom=dead,context='FACES');bm.to_mesh(o.data);bm.free()
 mapped_asset(role,fitted,weights,scale,mats,'eyes/low-poly','low-poly','anatomical_eyes')
 mapped_asset(role,fitted,weights,scale,mats,'hair/short02','short02','short_hair')
 outfit='male_elegantsuit01'if role=='guard'else'male_casualsuit01';mapped_asset(role,fitted,weights,scale,mats,'clothes/'+outfit,outfit,'workcoat_'+role)
 # Fine aging lines are surface-following creases, and remain below the expression scale.
 return o

# Main anatomy and garment authoring. Separate cloth/skin/eyes remain one logical glTF mesh.
def character(role):
 global objects;objects=[];guard=role=='guard';cloth='wool' if guard else 'playercloth'
 anatomical=makehuman_body(role,cloth)
 # Leather lace-up boots: sculpted toe, heel, welt and ankle, muted polished creases.
 for side,s in [('L',-1),('R',1)]:
  foot='foot_'+side;ankle=REST[foot][0];fx=ankle[0];fz=ankle[2]-.075
  ellipsoid('shoe vamp',[fx,.049,fz],[.055,.045,.132],'leather',foot,48,26);ellipsoid('shoe heel',[fx,.065,ankle[2]+.012],[.052,.064,.057],'leather',foot,36,26)
  ellipsoid('shoe sole',[fx,.017,fz],[.057,.016,.136],'sole',foot,48,16)
  for k in range(6):
   yy=.085+k*.004;zz=ankle[2]-.068+k*.009;line('shoe lace',[[fx-.025,yy,zz],[fx,yy+.004,zz-.008],[fx+.025,yy,zz]],.0013,'sole',foot,6)
  pts=[[fx+.056*cos(t),.031,fz+.134*sin(t)]for t in np.linspace(0,2*pi,65)];line('boot welt',pts,.002,'leather',foot)
 for q in list(objects):
  if q.get('preserveUV'):continue
  bpy.context.view_layer.objects.active=q;bpy.ops.object.select_all(action='DESELECT');q.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
 o=join([q for q in objects if q.name in bpy.data.objects], 'outskirts_fold_guard' if guard else 'outskirts_overprint_body')
 # UV topology is retained at export. High frequency weave/skin supplied through actual maps.
 bpy.context.view_layer.objects.active=o
 for poly in o.data.polygons:
  mn=o.data.materials[poly.material_index].name
  if mn in ['wool','playercloth','skin','leather']:
   repeat=10 if mn in ['wool','playercloth'] else 3 if mn=='skin' else 4
   for li in poly.loop_indices:o.data.uv_layers.active.data[li].uv*=repeat
 o['characterBounds']={'min':[-.95,-.02,-1.15],'max':[.95,1.86,.8]};o['authoring']='CC0 anatomical topology and garments, authored compact envelope transfer, corrective shapes and performance'
 o.shape_key_add(name='Basis')
 for name in ['rib_compression','shoulder_tension','throat_strain','mouth_pain']:
  key=o.shape_key_add(name=name)
  for v in key.data:
   p=G(v.co);xx,yy,zz=p
   if name=='rib_compression' and 1.13<yy<1.43 and abs(xx)<.24:
    gain=gauss(yy,1.29,.10);p[0]+=np.sign(xx)*.013*gain;p[2]+=.013*sin((yy-1.13)*45)*gain
   elif name=='shoulder_tension' and 1.36<yy<1.52:
    p[1]+=.012*gauss(abs(xx),.19,.09);p[2]-=.007*gauss(abs(xx),.19,.09)
   elif name=='throat_strain' and 1.48<yy<1.64 and abs(xx)<.08:
    p[0]*=1-.06*gauss(yy,1.55,.06);p[2]-=.007*gauss(yy,1.55,.035)
   elif name=='mouth_pain' and 1.60<yy<1.68 and zz<-.18:
    p[0]*=1+.12*gauss(yy,1.64,.025);p[1]-=.007*gauss(yy,1.625,.018)
   v.co=B(p)
 return o
if not RESUME:
 # Shared rig with proper inverse bind export.
 armdata=bpy.data.armatures.new('outskirts_anatomy');arm=bpy.data.objects.new('outskirts_anatomy',armdata);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for n,(h,t,parent)in REST.items():
  b=armdata.edit_bones.new(n);b.head=B(h);b.tail=B(t)
  if parent:b.parent=armdata.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 print('AUTHORING guard',flush=True);guard=character('guard');print('AUTHORING overprint',flush=True);player=character('player')
 for o in [guard,player]:
  mod=o.modifiers.new('authored anatomical skin','ARMATURE');mod.object=arm;o.parent=arm
else:
 guard=bpy.data.objects['outskirts_fold_guard'];player=bpy.data.objects['outskirts_overprint_body'];arm=bpy.data.objects['outskirts_anatomy']
# Analytic authored performance, baked 30Hz local matrices. No time noise.
CH={'pelvis':[(0,0),(1.1,.35),(2.7,-.4),(3.2,.65),(4.1,.4),(5.6,-.8),(6.6,-.2),(7.7,.6),(8.4,-.6),(9.3,1.1),(10.1,.55),(11.4,.8),(12,.65)],'ribs':[(0,0),(.8,.1),(1.6,.65),(2.5,1),(2.82,.7),(3.05,1.3),(3.6,1.05),(4.9,.4),(5.5,.7),(6.65,1.2),(7.4,.65),(8.2,1.5),(8.9,.8),(9.9,1.4),(11,1.1),(12,1.2)],'shoulder':[(0,0),(1.5,.45),(3.2,0),(3.7,.7),(4.65,1.4),(5.15,1),(6.3,.65),(7.1,.9),(8.4,1.6),(9.2,1.1),(10.8,1.7),(12,1.5)],'head':[(0,0),(1.3,-.2),(2.6,-.4),(3.2,.6),(4.4,.4),(5.15,-.4),(5.8,-.95),(6.6,-.5),(7.2,-.7),(8.5,.3),(10,-.8),(11.5,-.6),(12,-.5)],'jaw':[(0,.05),(2.4,.12),(3.1,.6),(3.4,.22),(5.1,.2),(6.2,.7),(7,.35),(8.5,.8),(10.1,.4),(10.5,.65),(12,.5)]}
def sample(keys,t):
 for (a,v),(b,w)in zip(keys,keys[1:]):
  if t<=b:return v+(w-v)*smooth((t-a)/(b-a))
 return keys[-1][1]
def solve_elbow(a,b,l1,l2,pole):
 a=np.array(a);b=np.array(b);v=b-a;d=np.linalg.norm(v);u=v/(d or 1);dist=min(d,l1+l2-.001);q=np.dot(np.array(pole)-a,u);w=np.array(pole)-a-u*q;w/=np.linalg.norm(w)or 1;c=(l1*l1+dist*dist-l2*l2)/(2*dist);height=sqrt(max(0,l1*l1-c*c));return a+u*c+w*height
# Pose world positions permit independently resisted anatomical regions. Fixed contact is solved, not guessed.
def pose(kind,t):
 heads={n:h.copy()for n,(h,tail,p)in REST.items()};tails={n:z.copy()for n,(h,z,p)in REST.items()};morph={n:0 for n in ['rib_compression','shoulder_tension','throat_strain','mouth_pain']};extra={}
 if kind in ['fold','writhe']:
  a=smooth((t-1.1)/1.45)if kind=='fold'else 1
  if kind=='fold':u=max(0,min(12,(t-2.55)*12/9.45));k=smooth((t-2.55)/.45);ch={n:sample(v,u)*k for n,v in CH.items()}
  else:
   # Three unequal contractions return to the exact fold-end state; not a refold/reset.
   envelope=sin(pi*t/24)**2;ch={n:sample(v,12)for n,v in CH.items()};
   for n,amp,shift in [('pelvis',.9,.6),('ribs',1.1,0),('shoulder',1,.9),('head',.8,1.4),('jaw',.55,.4)]:
    ch[n]+=envelope*amp*(gauss(t,3.8+shift,1.0)-.5*gauss(t,7.9+shift,1.5)+.85*gauss(t,13.1+shift,.8)-.6*gauss(t,17.7+shift,1.9)+.55*gauss(t,21+shift,.7))
  pc,rc,sc,hc,jc=[ch[n]for n in ['pelvis','ribs','shoulder','head','jaw']]
  seated_pelvis=np.array([0,.565,.05])
  chain=['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','head']
  # The force folds diagonally across the ribs, past the right thigh. The head
  # never returns to the lap centreline: the face reads as lateral neck strain,
  # with an open gap to the pelvis, rather than an inverted face in the crotch.
  end={'pelvis':seated_pelvis,'spine_lower':seated_pelvis+(REST['pelvis'][1]-REST['pelvis'][0]),'spine_mid':[.02,.721,.06],'spine_upper':[.05,.773,.03],'chest':[.13,.875,-.03],'neck':[.31,.82,-.23],'head':[.39,.77,-.26]}
  for n,p in end.items():
   base=seated_pelvis+(REST[n][0]-REST['pelvis'][0]);heads[n]=base*(1-a)+np.array(p)*a
  # The seated pelvis, hips and soles are fixed. Resisted effort travels through
  # the ribs/scapulae/head instead of translating the body off its chair.
  heads['spine_mid']+=np.array([pc*.009,rc*.003,-pc*.006]);heads['spine_upper']+=np.array([rc*.013,sc*.006,-rc*.012]);heads['chest']+=np.array([rc*.010,-sc*.008,-sc*.007]);heads['neck']+=np.array([rc*.007-hc*.008,rc*.006,hc*.008]);heads['head']+=np.array([hc*.016,rc*.007-hc*.007,hc*.010])
  heads['spine_lower']=seated_pelvis+(REST['pelvis'][1]-REST['pelvis'][0])
  for x,y in zip(chain,chain[1:]):
   direction=heads[y]-heads[x];length=np.linalg.norm(REST[x][1]-REST[x][0]);heads[y]=heads[x]+direction/(np.linalg.norm(direction)or 1)*length;tails[x]=heads[y]
  # A sideways cranium under neck tension, with its face outward and away from
  # the lap. Solve the complete frame so the crown does not point at the pelvis.
  from mathutils import Quaternion
  crown=np.array([.70,-.71,-.10]);crown/=np.linalg.norm(crown)
  outward=np.array([.32,.16,-1.]);outward-=crown*np.dot(crown,outward);outward/=np.linalg.norm(outward)
  lateral=np.cross(crown,-outward);lateral/=np.linalg.norm(lateral)
  frame=np.column_stack((lateral,crown,-outward));change=np.array([[1,0,0],[0,0,-1],[0,1,0]])
  sideq=Matrix(change@frame@change.T).to_quaternion()
  headq=Quaternion((1,0,0,0)).slerp(sideq,a)@Quaternion(B([0,1,0]),hc*.10)@Quaternion(B([0,0,1]),hc*.08)
  extra['head_rotation']=headq;tails['head']=heads['head']+G(headq@B(REST['head'][1]-REST['head'][0]));extra['jaw']=-max(0,jc)*.45
  heads['jaw']=G(B(heads['head'])+headq@B(REST['jaw'][0]-REST['head'][0]));tails['jaw']=heads['jaw']+G(headq@B(REST['jaw'][1]-REST['jaw'][0]))
  for side,sign in [('L',-1),('R',1)]:
   # Keep the shoulder span anatomical as it comes forward over the lap.
   neutral=seated_pelvis+(REST['upperarm_'+side][0]-REST['pelvis'][0]);folded=heads['chest']+np.array([sign*.215,.045,-.025]);shoulder=neutral*(1-a)+folded*a
   shoulder+=np.array([sign*sc*.008,sc*.006,-rc*.004]);heads['clavicle_'+side]=heads['chest'];clavlen=np.linalg.norm(REST['clavicle_'+side][1]-REST['clavicle_'+side][0]);cv=shoulder-heads['chest'];shoulder=heads['chest']+cv/(np.linalg.norm(cv)or 1)*clavlen
   if side=='L':
    # Left palm lies flat on the low lateral ledge, fingers pointing outward.
    wrist=np.array([-.48,.84,-.14]);tip=wrist+np.array([-.20,0,0]);pole=np.array([-.43,.67,-.015])
   else:
    # The free hand catches the top of the folding back and continues to grip it.
    wrist=np.array([.22,.68,-.22])*(1-a)+(heads['chest']+np.array([.061,.119,-.071]))*a
    wrist+=np.array([sc*.006,rc*.006,-sc*.005]);tip=wrist+np.array([-.13,-.025,-.025])*a+np.array([0,-.07,-.015])*(1-a);pole=np.array([.47,.79,-.08])
    # Preserve the complete palmar frame, not merely the wrist-to-tip direction.
    # The palm faces down against the upper back and the fingers cross its arch.
    restforward=REST['middle_R'][0]-REST['hand_R'][0];restforward/=np.linalg.norm(restforward)
    restnormal=np.cross(REST['index_R'][0]-REST['little_R'][0],restforward);restnormal/=np.linalg.norm(restnormal)
    if restnormal[2]>0:restnormal=-restnormal
    gripforward=np.array([-1.,-.06,.04]);gripforward/=np.linalg.norm(gripforward)
    gripnormal=np.array([0.,-1.,0.]);gripnormal-=gripforward*np.dot(gripnormal,gripforward);gripnormal/=np.linalg.norm(gripnormal)
    sourceframe=np.column_stack((restforward,restnormal,np.cross(restforward,restnormal)));destframe=np.column_stack((gripforward,gripnormal,np.cross(gripforward,gripnormal)))
    change=np.array([[1,0,0],[0,0,-1],[0,1,0]]);gripq=Matrix(change@(destframe@sourceframe.T)@change.T).to_quaternion()
    ordinaryq=B(REST['hand_R'][1]-REST['hand_R'][0]).rotation_difference(B(tip-wrist));handq=ordinaryq.slerp(gripq,a);extra['hand_rotation_R']=handq;extra['grip']=a
    tip=wrist+G(handq@B(REST['hand_R'][1]-REST['hand_R'][0]))
   l1=np.linalg.norm(REST['upperarm_'+side][1]-REST['upperarm_'+side][0]);l2=np.linalg.norm(REST['forearm_'+side][1]-REST['forearm_'+side][0])
   if side=='L'and np.linalg.norm(wrist-shoulder)>l1+l2-.002:shoulder=solve_elbow(heads['chest'],wrist,clavlen,l1+l2-.002,shoulder)
   tails['clavicle_'+side]=shoulder;heads['upperarm_'+side]=shoulder;elbow=solve_elbow(shoulder,wrist,l1,l2,pole);tails['upperarm_'+side]=elbow;heads['forearm_'+side]=elbow;tails['forearm_'+side]=wrist;heads['hand_'+side]=wrist;tails['hand_'+side]=tip
  # Seated thighs travel forward to the knees; both shins end at planted feet.
  for side,sign in [('L',-1),('R',1)]:
   hip=seated_pelvis+(REST['thigh_'+side][0]-REST['pelvis'][0]);ankle=np.array([sign*.20,REST['shin_'+side][1][1],-.43]);knee=solve_elbow(hip,ankle,np.linalg.norm(REST['thigh_'+side][1]-REST['thigh_'+side][0]),np.linalg.norm(REST['shin_'+side][1]-REST['shin_'+side][0]),[sign*.24,.48,-.60]);heads['thigh_'+side]=hip;tails['thigh_'+side]=knee;heads['shin_'+side]=knee;tails['shin_'+side]=ankle;heads['foot_'+side]=ankle;tails['foot_'+side]=ankle+(REST['foot_'+side][1]-REST['foot_'+side][0]);heads['toe_'+side]=tails['foot_'+side];tails['toe_'+side]=heads['toe_'+side]+(REST['toe_'+side][1]-REST['toe_'+side][0])
  morph.update(rib_compression=min(1,max(0,rc*.65)),shoulder_tension=min(1,max(0,sc*.55)),throat_strain=min(1,max(0,abs(hc)*.8)),mouth_pain=min(1,max(0,jc)))
 elif kind in ['walk','turn','idle']:
  phase=2*pi*t/1.1
  if kind=='idle':sway=.004*sin(2*pi*t/4);heads['pelvis'][0]+=sway;heads['chest'][2]+=.003*sin(2*pi*t/4)
  if kind=='walk':
   # Lower the anatomical hips through double support so the true leg links
   # can reach the 1.2m stride without separating at the knee or ankle.
   body_shift=np.array([.012*sin(phase),-(.045+.015*cos(phase*2)),0])
   for n in heads:
    if not n.startswith(('thigh_','shin_','foot_','toe_')):heads[n]+=body_shift;tails[n]+=body_shift
   # Two contact phases: foot travels rearward on ground, then clears and swings forward.
   for side,s,off in [('L',-1,0),('R',1,pi)]:
    q=(phase+off)%(2*pi);u=q/pi;z=(.30*(2*u**3-3*u*u+1)+.60*(u**3-2*u*u+u)-.30*(-2*u**3+3*u*u)+.60*(u**3-u*u))if q<pi else-.30+.60*(q-pi)/pi;lift=.065*sin(q)**2 if q<pi else 0;ankle=REST['shin_'+side][1]+np.array([0,lift,z]);hip=REST['thigh_'+side][0]+body_shift;knee=solve_elbow(hip,ankle,np.linalg.norm(REST['thigh_'+side][1]-REST['thigh_'+side][0]),np.linalg.norm(REST['shin_'+side][1]-REST['shin_'+side][0]),[REST['shin_'+side][1][0],.5,-.55]);heads['thigh_'+side]=hip;tails['thigh_'+side]=knee;heads['shin_'+side]=knee;tails['shin_'+side]=ankle;heads['foot_'+side]=ankle;tails['foot_'+side]=ankle+(REST['foot_'+side][1]-REST['foot_'+side][0]);heads['toe_'+side]=tails['foot_'+side];tails['toe_'+side]=heads['toe_'+side]+(REST['toe_'+side][1]-REST['toe_'+side][0]);
  if kind=='turn':
   q=smooth(t/1.2);extra['head']=q*.42;extra['neck']=q*.18;extra['chest']=q*.10
 # Ordinary recorded body: arms hang at the sides, with a small opposite gait swing.
 if kind in ['idle','walk','turn']:
  for side,s,off in [('L',-1,0),('R',1,pi)]:
   shoulder=REST['upperarm_'+side][0]+(body_shift if kind=='walk'else np.zeros(3));swing=-.085*cos(phase+off)if kind=='walk'else 0
   wrist=shoulder+np.array([s*.035,-.50,.02+swing]);elbow=solve_elbow(shoulder,wrist,np.linalg.norm(REST['upperarm_'+side][1]-shoulder),np.linalg.norm(REST['forearm_'+side][1]-REST['forearm_'+side][0]),shoulder+np.array([s*.09,-.23,-.08]))
   heads['upperarm_'+side]=shoulder;tails['upperarm_'+side]=elbow;heads['forearm_'+side]=elbow;tails['forearm_'+side]=wrist;heads['hand_'+side]=wrist;tails['hand_'+side]=wrist+np.array([s*.003,-.05,-.008])
 # Reorient finger chains with the actual hand, retaining small painful curls.
 for side in ['L','R']:
  rot=extra.get('hand_rotation_'+side,B(REST['hand_'+side][1]-REST['hand_'+side][0]).rotation_difference(B(tails['hand_'+side]-heads['hand_'+side])))
  for fn in ['thumb','index','middle','ring','little']:
   n=fn+'_'+side;heads[n]=G(B(heads['hand_'+side])+rot@B(REST[n][0]-REST['hand_'+side][0]));tails[n]=G(B(heads['hand_'+side])+rot@B(REST[n][1]-REST['hand_'+side][0]))
   if side=='R'and extra.get('grip',0):
    curl=Quaternion(B([0,0,1]),extra['grip']*(-.10 if fn=='thumb'else -.24+max(0,sc)*.035));tails[n]=heads[n]+G(curl@B(tails[n]-heads[n]));extra['finger_rotation_'+n]=curl@rot
 return heads,tails,morph,extra

def apply_pose(kind,t):
 heads,tails,morph,extra=pose(kind,t)
 desired={}
 from mathutils import Quaternion
 for n,pb in arm.pose.bones.items():
  delta=B(REST[n][1]-REST[n][0]).rotation_difference(B(tails[n]-heads[n]))
  rot=delta.to_matrix().to_4x4()@arm.data.bones[n].matrix_local.to_quaternion().to_matrix().to_4x4()
  mat=Matrix.Translation(B(heads[n]))@rot
  if n in extra:mat=mat@Quaternion((1,0,0)if n=='jaw'else(0,1,0),extra[n]).to_matrix().to_4x4()
  desired[n]=mat
 if 'head_rotation'in extra:desired['head']=Matrix.Translation(B(heads['head']))@extra['head_rotation'].to_matrix().to_4x4()@arm.data.bones['head'].matrix_local.to_quaternion().to_matrix().to_4x4()
 if 'hand_rotation_R'in extra:desired['hand_R']=Matrix.Translation(B(heads['hand_R']))@extra['hand_rotation_R'].to_matrix().to_4x4()@arm.data.bones['hand_R'].matrix_local.to_quaternion().to_matrix().to_4x4()
 for n in ['thumb_R','index_R','middle_R','ring_R','little_R']:
  if 'finger_rotation_'+n in extra:desired[n]=Matrix.Translation(B(heads[n]))@extra['finger_rotation_'+n].to_matrix().to_4x4()@arm.data.bones[n].matrix_local.to_quaternion().to_matrix().to_4x4()
 # Jaw inherits the complete cranium orientation, including its inverted roll.
 # A shortest-arc direction solve loses that roll and tears the mouth corners.
 desired['jaw']=desired['head']@arm.data.bones['head'].matrix_local.inverted()@arm.data.bones['jaw'].matrix_local@Quaternion((1,0,0),extra.get('jaw',0)).to_matrix().to_4x4()
 for n,pb in arm.pose.bones.items():
  rest=arm.data.bones[n].matrix_local
  parent=arm.data.bones[n].parent
  if parent:
   local_rest=parent.matrix_local.inverted()@rest
   pb.matrix_basis=local_rest.inverted()@desired[parent.name].inverted()@desired[n]
  else:pb.matrix_basis=rest.inverted()@desired[n]
 for o in [guard,player]:
  for n,v in morph.items():o.data.shape_keys.key_blocks[n].value=v
 bpy.context.view_layer.update()
# Bake constrained world poses to local animation curves. Joined geometry retains 4 influences maximum at export.
bpy.context.scene.render.fps=30
if not RESUME or REBAKE:
 arm.animation_data_clear()
 for o in [guard,player]:o.data.shape_keys.animation_data_clear()
 for kind,duration in [('fold',12),('writhe',24),('idle',4),('walk',1.1),('turn',1.2)]:
  print('BAKING',kind,flush=True);arm.animation_data_create();action=bpy.data.actions.new(kind);arm.animation_data.action=action
  for o in [guard,player]:o.data.shape_keys.animation_data_create();o.data.shape_keys.animation_data.action=bpy.data.actions.new(kind+'_MORPHS_'+o.name)
  for frame in range(round(duration*30)+1):
   t=frame/30;bpy.context.scene.frame_set(frame);apply_pose(kind,t)
   for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
   for o in [guard,player]:
    for key in list(o.data.shape_keys.key_blocks)[1:]:key.keyframe_insert('value',frame=frame)
  # Push tracks with matching names for merged glTF clip semantics.
  track=arm.animation_data.nla_tracks.new();track.name=kind;track.strips.new(kind,0,action);arm.animation_data.action=None
  for o in [guard,player]:
   ad=o.data.shape_keys.animation_data;ma=ad.action;track=ad.nla_tracks.new();track.name=kind;track.strips.new(kind,0,ma);ad.action=None
# All tracks muted during preview; export NLA tracks individually.
for ad in [arm.animation_data,guard.data.shape_keys.animation_data,player.data.shape_keys.animation_data]:
 for tr in ad.nla_tracks:tr.mute=True
scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=720
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
# Export tracks; exporter handles embedded textures and inverse binds.
for ad in [arm.animation_data,guard.data.shape_keys.animation_data,player.data.shape_keys.animation_data]:
 for tr in ad.nla_tracks:tr.mute=False
bpy.ops.object.select_all(action='DESELECT')
for o in [arm,guard,player]:o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',use_selection=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_image_format='AUTO',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_frame_range=False,export_skins=True,export_morph=True,export_morph_normal=True,export_extras=True,export_def_bones=True)
# Remove default optional material extensions. No extension/compression requirements are allowed in production.
b=open(OUT,'rb').read();jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);binary=bytearray(b[28+jl:])
# Blender optimizes mostly-zero corrective deltas as sparse accessors; production uses dense float buffers.
C={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};S={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
for acc in j.get('accessors',[]):
 if 'sparse' not in acc:continue
 stride=C[acc['type']]*S[acc['componentType']];dense=bytearray(acc['count']*stride)
 if 'bufferView'in acc:
  bv=j['bufferViews'][acc['bufferView']];off=bv.get('byteOffset',0)+acc.get('byteOffset',0);dense[:]=binary[off:off+len(dense)]
 sp=acc['sparse'];iv=j['bufferViews'][sp['indices']['bufferView']];vv=j['bufferViews'][sp['values']['bufferView']];io=iv.get('byteOffset',0)+sp['indices'].get('byteOffset',0);vo=vv.get('byteOffset',0)+sp['values'].get('byteOffset',0);ic=sp['indices']['componentType'];fmt={5121:'B',5123:'H',5125:'I'}[ic]
 for k in range(sp['count']):
  index=struct.unpack_from('<'+fmt,binary,io+k*S[ic])[0];dense[index*stride:(index+1)*stride]=binary[vo+k*stride:vo+(k+1)*stride]
 binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(dense);acc['bufferView']=len(j['bufferViews']);acc['byteOffset']=0;acc.pop('sparse');j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(dense)})
j['buffers'][0]['byteLength']=len(binary)
for m in j.get('materials',[]):
 m.pop('extensions',None)
 if m.get('name')=='short_hair':m['alphaMode']='MASK';m['alphaCutoff']=.45;m['doubleSided']=True
j.pop('extensionsUsed',None);j.pop('extensionsRequired',None)
for meshdef in j.get('meshes',[]):
 meshdef.setdefault('extras',{})['characterBounds']={'min':[-.95,-.02,-1.15],'max':[.95,1.86,.8]}
# Blend export can emit duplicate NLA named animations; consolidate matching track names.
merged={}
for anim in j.get('animations',[]):
 name=anim.get('name','');base=name.split('_MORPHS_')[0];base=base.split('.')[0]
 if base not in ['fold','writhe','idle','walk','turn']:
  base=next((n for n in ['fold','writhe','idle','walk','turn']if n in name),name)
 dst=merged.setdefault(base,{'name':base,'samplers':[],'channels':[]});offset=len(dst['samplers']);dst['samplers'].extend(anim['samplers']);dst['channels'].extend([{**c,'sampler':c['sampler']+offset}for c in anim['channels']])
j['animations']=list(merged.values())
# Dense morph conversion leaves obsolete sparse views. Repack only live views;
# vertex, texture and animation values are unchanged.
used={a['bufferView']for a in j['accessors']if 'bufferView'in a}|{im['bufferView']for im in j.get('images',[])if'bufferView'in im};packed=bytearray();views=[];remap={}
for index,v in enumerate(j['bufferViews']):
 if index not in used:continue
 packed.extend(b'\0'*((-len(packed))%4));old=v.get('byteOffset',0);new=dict(v);new['byteOffset']=len(packed);packed.extend(binary[old:old+v['byteLength']]);remap[index]=len(views);views.append(new)
for a in j['accessors']:
 if'bufferView'in a:a['bufferView']=remap[a['bufferView']]
for im in j.get('images',[]):
 if'bufferView'in im:im['bufferView']=remap[im['bufferView']]
j['bufferViews']=views;binary=packed;j['buffers'][0]['byteLength']=len(binary)
raw=json.dumps(j,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary+=b'\0'*((-len(binary))%4);out=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary;open(OUT,'wb').write(out)
# Inspectable contact/performance metadata, source provenance and exact budget.
stats={'source':'tools/chunk_surfer/characters/build-outskirts-characters.py','blender':bpy.app.version_string,'units':'metres','forward':'-Z','height':1.82,'clips':{n:d for n,d in [('fold',12),('writhe',24),('idle',4),('walk',1.1),('turn',1.2)]},'initialForce':{'start':1.1,'end':2.55,'curve':'smoothstep'},'palmContact':[-.55,.82,-.14],'palmSide':'L','seatContact':[0,.47,.04],'soleContacts':[[-.20,.001,-.51],[.20,.001,-.51]],'foldPosture':'seated diagonal forward fold beyond right thigh, sideways face outward and separated from lap','joints':list(REST),'morphs':['rib_compression','shoulder_tension','throat_strain','mouth_pain'],'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'walk':{'cycleSeconds':1.1,'distanceMetres':1.2,'planted':{'R':[0,.5],'L':[.5,1]}},'effortMarkers':{'fold':[3.15,4.95,7.8,9,10.35],'writhe':[3.8,7.9,13.1,17.7,21]},'textureResidencyMiB':29.667,'guardFitting':{'concealedUpperTrouserTuckMetres':.012,'jacketAndMotionUnchanged':True},'meshes':{m['name']:{'primitives':len(m['primitives']),'vertices':sum(j['accessors'][p['attributes']['POSITION']]['count']for p in m['primitives']),'triangles':sum(j['accessors'][p['indices']]['count']//3 for p in m['primitives'])}for m in j['meshes']},'animations':[{'name':a['name'],'channels':len(a['channels'])}for a in j['animations']],'qualityLimit':'CC0 MakeHuman anatomical source with authored tailored garment surfaces, hand-directed rig/correctives/performance; not photogrammetry or actor mocap.'}
stats['guardFitting']['jacketAndMotionUnchanged']=False
stats['guardFitting']['bindGeometryAndCostumeUnchanged']=True
stats['rightHandClutch']={'bindSurfacePosition':[.5087558627,1.0941674709,-.2902439237],'exportedPrimitive':0,'exportedVertex':7084,'contact':'right palm against moving posterior jacket surface','foldEndpointSurfacePosition':[.0963487,.9613402,-.0798601]}
stats['headAxes']={'upright':[0,1,0],'face':[0,0,-1],'folded':'crown diagonally right/down; face outward and away from pelvis'}
stats['mouthSeparation']={'bindSurfacePosition':[0,1.5850901604,-.1316766888],'exportedPrimitive':0,'exportedVertex':783,'weights':{'jaw':.884,'head':.090,'neck':.026},'contact':'mouth remains above and laterally outside the lap throughout the completed fold and pain loop'}
open(os.path.join(TEX,'stats.json'),'w').write(json.dumps(stats,indent=2));open(os.path.join(TEX,'CREDITS.md'),'w').write('# Outskirts character assets\n\nAnatomical base: MakeHuman hm08 and male macro targets, CC0-1.0. MakeHuman/Data Collection AB, Joel Palmius and Jonas Hauquier. Exact source URLs and SHA256 digests are retained in tools/chunk_surfer/character-sources/makehuman/sources.json; licence in LICENSE.ASSETS.md. Base source https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/3dobjs/base.obj (SHA256 8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c). Original CC0 skin, eyes, hair, clothing and authored skin envelopes are retained with their source UVs. Garment fitting, compact weight mapping, skeleton, corrective shapes and animation adapted/authored for Chunk Surfer in Blender 4.5.3 LTS; no actor mocap. Further source manifest: tools/chunk_surfer/character-sources/makehuman/system/sources.json and tools/chunk_surfer/character-sources/makehuman/weights-sources.json. Regeneration source: tools/chunk_surfer/characters/build-outskirts-characters.py.\n\nThe approved Wrong Fold and Overprint concept sheets informed the pose and costume; those images are not projected onto the model.\n')
print('EXPORTED',json.dumps(stats),flush=True)
# Offline neutral-light multiangle validation frames. Explicitly poses authoring rig, no material/post disguise.
for ad in [arm.animation_data,guard.data.shape_keys.animation_data,player.data.shape_keys.animation_data]:
 for tr in ad.nla_tracks:tr.mute=True
world=bpy.data.worlds.new('neutral studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.17,.18,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
for location,power,size in [((3,4,4),700,4),((-3,1,2),400,3),((0,-3,3),550,3)]:
 d=bpy.data.lights.new('inspection softbox','AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(d.name,d);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('inspection');cam=bpy.data.objects.new('inspection',camd);bpy.context.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO';camd.ortho_scale=1.72
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=768;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
player.hide_render=True
# Inspection-only chair and lateral support, added after GLB export.
def inspection_box(name,center,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=B(center));o=bpy.context.object;o.name=name;o.scale=(size[0],size[2],size[1]);o.data.materials.append(materials['sole']);return o
inspection_box('inspection seat',[0,.445,.04],[.46,.05,.44]);inspection_box('inspection chair back',[0,.74,.27],[.46,.50,.035])
for xx in [-.20,.20]:
 for zz in [-.15,.23]:inspection_box('inspection chair leg',[xx,.22,zz],[.025,.44,.025])
inspection_box('inspection lateral ledge',[-.61,.795,-.14],[.25,.05,.34]);inspection_box('inspection ledge support',[-.67,.395,-.14],[.10,.79,.22])
for name,t,pos in [('neutral-front',0,(1.5,3.8,1.15)),('fold-start-front',0,(.7,4.2,1.08)),('fold-end-front',2.55,(.3,4.2,1.0)),('fold-end-side',2.55,(4.2,.15,1.0)),('fold-end-roadside',2.55,(-.65,4.2,1.02)),('pain-head',9,(.7,4,1.0)),('writhe-mid',12,(.7,4,1.0))]:
 apply_pose('writhe'if name=='writhe-mid'else'fold',t);cam.location=pos;cam.rotation_euler=(Vector((0,0,.72))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(PRE,name+'.png');bpy.ops.render.render(write_still=True)
print('PREVIEWS',PRE,flush=True)

# The second role is inspected with its own real ordinary gait and turn clips.
guard.hide_render=True;player.hide_render=False
camd.ortho_scale=2.17
for o in bpy.data.objects:
 if o.name.startswith('inspection ')and o.type=='MESH':o.hide_render=True
for name,kind,t,pos in [('overprint-neutral','idle',0,(2.1,4.2,1.65)),('overprint-walk','walk',.23,(1.7,4.2,1.4)),('overprint-back','walk',.78,(-1.6,-4.2,1.4))]:
 apply_pose(kind,t);cam.location=pos;cam.rotation_euler=(Vector((0,0,1.0))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(PRE,name+'.png');bpy.ops.render.render(write_still=True)
guard.hide_render=False;player.hide_render=True;camd.ortho_scale=.56
for name,kind,t in [('face-force','fold',2.55),('face-effort','fold',9),('face-writhe','writhe',7.9)]:
 heads,_,_,_=pose(kind,t);apply_pose(kind,t);target=B(heads['head'])+Vector((0,-.035,-.06));cam.location=target+Vector((.15,1.5,.05));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(PRE,name+'.png');bpy.ops.render.render(write_still=True)

# Keep the distributable texture directory limited to maps embedded in the final pack.
keep={'CREDITS.md','stats.json'}|{im['name']+('.jpg'if im['mimeType']=='image/jpeg'else'.png')for im in j.get('images',[])}
for filename in os.listdir(TEX):
 if filename not in keep and filename.endswith(('.png','.jpg')):os.remove(os.path.join(TEX,filename))
