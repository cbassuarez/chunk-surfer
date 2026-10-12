"""Authored continuous-surface Pressure manifestation source. Blender 4.5 LTS.
Regenerate: /Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python tools/chunk_surfer/characters/build-pressure-character.py
Uses retained MakeHuman hm08 CC0 anatomical base; provenance in character-sources/makehuman/sources.json. Licensed anatomical geometry, UV maps and envelopes retained; compact rig, fitting, corrective shapes and performance adapted/authored here.
Coordinate contract: glTF metres, Y-up, forward -Z; Pressure root at floor between feet. Separate from frozen Fold and Overprint.
"""
import bpy, math, os, json, struct, random, sys, hashlib
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from math import sin,cos,pi,exp,sqrt
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
def option(name,default):
 return sys.argv[sys.argv.index(name)+1]if name in sys.argv else default
ANIMATION_ONLY='--animation-only'in sys.argv
DEFAULT_OUT=os.path.join(ROOT,'public/assets/pressure-character.glb')
DEFAULT_SOURCE=os.path.join(ROOT,'assets/source/pressure-character.blend')
BASELINE=option('--baseline',DEFAULT_OUT)
INPUT_SOURCE=option('--input',DEFAULT_SOURCE)
OUT=option('--output',DEFAULT_OUT)
SOURCE=option('--source-output',DEFAULT_SOURCE)
TEX=option('--metadata',os.path.join(ROOT,'public/assets/pressure-character'))
PRE=option('--previews','/tmp/pressure-character-preview')
for p in [TEX,PRE,os.path.dirname(SOURCE),os.path.dirname(OUT)]:os.makedirs(p,exist_ok=True)
BASE_BYTES=open(BASELINE,'rb').read()if ANIMATION_ONLY else None
if ANIMATION_ONLY:bpy.ops.wm.open_mainfile(filepath=INPUT_SOURCE)
else:bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(1988)
# Model in game coordinates and convert to Blender's Z-up, front +Y.
def B(p):return Vector((p[0],-p[2],p[1]))
def G(p):return np.array((p[0],p[2],-p[1]))
def smooth(v):v=max(0,min(1,v));return v*v*(3-2*v)
def gauss(x,c,w):return exp(-((x-c)/w)**2)
if not ANIMATION_ONLY:
 materials={}
 def image(name,pixels):
  h,w,_=pixels.shape; im=bpy.data.images.new(name,width=w,height=h,alpha=True);im.pixels.foreach_set(pixels.astype(np.float32).ravel());im.filepath_raw=os.path.join(TEX,name+'.png');im.file_format='PNG';im.save();return im
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
 def join(obs,name):
  global objects
  objects=[q for q in objects if q not in obs]+[obs[0]]
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();o=obs[0];o.name=name;o.data.name=name;return o

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

 # A new pressure surface, not an outfit or another character wearing the suit.
 # The CC0 anatomy supplies continuous hands/limbs. Every visible point is fitted
 # into a bespoke compressed volume; no human skin, eyes, hair or suit is used.
 from mathutils import Quaternion
 def unit(v):
  v=np.array(v,float);return v/(np.linalg.norm(v)or 1)
 def sculpt(p,skeletal=False):
  x,y,z=np.array(p,float);head=smooth((y-1.51)/.13)
  front=smooth((.09-z)/.20);center=gauss(x,0,.115)*gauss(y,1.405,.145)
  # Real concavity: the sternum is pressed almost to the posterior wall while
  # the lateral ribs and collar retain their full anterior/posterior thickness.
  xx=x*1.02+np.sign(x)*.032*gauss(abs(x),.17,.085)*gauss(y,1.35,.25)
  zz=z+front*.265*center+.020*(1-front)*gauss(y,1.36,.24)
  # Crooked upper thorax and anterior rib rims wrap around the collapsed web.
  crook=smooth((y-1.21)/.34);zz-=.105*crook*(1-head)
  zz-=.062*gauss(abs(x),.17,.065)*gauss(y,1.43,.15)
  yy=y+.145*gauss(x,-.16,.13)*gauss(y,1.47,.18)+.035*gauss(x,.19,.12)*gauss(y,1.46,.16)
  # A broad drawn collar replaces the narrow anatomical neck. Its membrane
  # rises around the sealed head instead of presenting a separate round skull.
  collar=gauss(y,1.555,.075)*gauss(x,0,.10)
  xx*=1+1.45*collar;yy-=.045*collar;zz+=.045*collar*front
  arm=smooth((abs(x)-.20)/.30)*smooth((y-.67)/.18);draw=smooth((1.50-y)/.35)
  xx-=np.sign(x)*.205*arm*draw;yy-=.19*arm;zz+=.205*arm*draw
  # Curl the anatomical fingers back into the loaded palm, no open stock hands.
  curl=arm*smooth((-z-.245)/.10);zz+=.115*curl;yy+=.038*curl;xx-=np.sign(x)*.012*curl
  # Draw the whole small cranium into the collar. The projected head has no
  # facial landmarks: it is a smooth, creased continuation of the same surface.
  h=np.array([x/.105,(y-1.70)/.145,(z+.045)/.145])
  if not skeletal:h=unit(h)
  hp=np.array([.025,1.475,-.005])+h*np.array([.070,.100,.030])
  q=np.array([xx,yy,zz])*(1-head)+hp*head
  if y<.75:q[0]*=.90
  # One taut membrane conceals groin and buttock definition; one hip is raised.
  pelvis=gauss(y,.99,.13)*smooth((.21-abs(x))/.13);targetZ=-.095 if z<0 else .105
  q[2]=q[2]*(1-pelvis*.87)+targetZ*pelvis*.87
  q[1]+=.032*gauss(x,.115,.10)*gauss(y,1.03,.14)
  # Broad torso folds and longitudinal pull through the arms/legs are geometry.
  torso=gauss(y,1.36,.20)*(1-head);r=sqrt((x/.9)**2+(y-1.43)**2);theta=math.atan2(y-1.43,x)
  if not skeletal:
   ridge=(.0045*sin(theta*22+r*72)+.0025*sin(theta*39-r*113))*torso
   # Four broad diagonal load folds catch light around the real sternum cavity.
   ridge+=.016*(gauss(y-1.43-.85*x,0,.014)+gauss(y-1.43+1.20*x,0,.015))*gauss(r,.13,.11)*torso
   ridge+=.010*(gauss(y-1.37-1.65*x,0,.013)+gauss(y-1.37+1.90*x,0,.014))*gauss(r,.13,.12)*torso
   q[2]-=ridge*front;q[0]+=np.sign(x)*ridge*.28
   limb=gauss(abs(x),.39,.20)*gauss(y,1.10,.36)+gauss(abs(x),.14,.12)*gauss(y,.52,.35)
   q[2]+=.0035*sin(y*102+x*24)*limb
  # Sealed foot sheaths suppress the ordinary individual toe silhouette.
  foot=smooth((.135-y)/.07)
  if foot:
   side=-1 if x<0 else 1;c=np.array([side*.174,.027,-.075]);v=np.array([(x*.9-c[0])/.060,(y-.055)/.060,(z+.075)/.170])
   if not skeletal:v=unit(v)
   fp=c+v*np.array([.045,.026,.135]);q=q*(1-foot)+fp*foot
  q[1]*=1.28
  if y<.095:q[1]=max(.005,q[1])
  return q

 fitted,weights,_,_,_,_=mh_role('guard')
 # The mouth/face's folded internal sheets are not part of this manifestation.
 # Keep continuous anatomical shoulders/limbs, and author a new sealed hood below.
 bodyfaces=[f for f in MH_FACES['body']if all(fitted[i][1]<=1.535 for i in f)];ids=sorted(set(i for f in bodyfaces for i in f));remap={old:i for i,old in enumerate(ids)}
 surface=np.array([sculpt(fitted[i])for i in ids]);heightScale=2.18/(surface[:,1].max()-surface[:,1].min());floorShift=surface[:,1].min()
 def final(p,skeletal=False):
  q=sculpt(p,skeletal);q[1]=(q[1]-floorShift)*heightScale;return q
 for name,(h,t,parent)in list(REST.items()):REST[name]=(final(h,True),final(t,True),parent)

 # A small bounded map set. The folds above provide actual relief; the normal
 # map supplies fine felt grain and pressure-oriented microcreases, not anatomy.
 N=1024;yy,xx=np.mgrid[0:N,0:N];rng=np.random.default_rng(4417);grain=rng.normal(0,1,(N,N))
 height=.24*np.sin(xx*.018+6*np.sin(yy*.003))+.15*np.sin(xx*.065+3*np.sin(yy*.007))+.05*np.sin(xx*.29+yy*.012)+grain*.025
 dx=np.roll(height,-1,1)-np.roll(height,1,1);dy=np.roll(height,-1,0)-np.roll(height,1,0);normal=np.stack((-dx*1.5,-dy*1.5,np.ones_like(dx)),2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
 albedo=np.ones((N,N,4));variation=grain*.005+.009*np.sin(xx*.009)*np.sin(yy*.013);albedo[:,:,:3]=np.clip(np.array([.035,.044,.046])[None,None,:]+variation[:,:,None],.012,.09)
 al=image('pressure-surface-albedo',albedo);nm=np.ones((N,N,4));nm[:,:,:3]=normal*.5+.5;nt=image('pressure-surface-normal',nm);nt.colorspace_settings.name='Non-Color'
 orm=np.ones((512,512,4));orm[:,:,0]=.96;orm[:,:,1]=.88+np.random.default_rng(4418).normal(0,.015,(512,512));orm[:,:,2]=0;ot=image('pressure-surface-orm',orm);ot.colorspace_settings.name='Non-Color'
 mat=bpy.data.materials.new('pressure_continuous_surface');mat.use_nodes=True;mat['characterRole']='pressure';nodes=mat.node_tree.nodes;bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.89;bs.inputs['Metallic'].default_value=0
 at=nodes.new('ShaderNodeTexImage');at.image=al;mat.node_tree.links.new(at.outputs['Color'],bs.inputs['Base Color'])
 ntex=nodes.new('ShaderNodeTexImage');ntex.image=nt;normalmap=nodes.new('ShaderNodeNormalMap');normalmap.inputs['Strength'].default_value=.72;mat.node_tree.links.new(ntex.outputs['Color'],normalmap.inputs['Color']);mat.node_tree.links.new(normalmap.outputs['Normal'],bs.inputs['Normal'])
 ore=nodes.new('ShaderNodeTexImage');ore.image=ot;sep=nodes.new('ShaderNodeSeparateColor');mat.node_tree.links.new(ore.outputs['Color'],sep.inputs['Color']);mat.node_tree.links.new(sep.outputs['Green'],bs.inputs['Roughness']);materials['pressure']=mat
 verts=[final(fitted[i])for i in ids];outweights=[]
 for i in ids:
  w=dict(sorted(weights[i].items(),key=lambda v:v[1],reverse=True)[:4]);total=sum(w.values());outweights.append({n:v/total for n,v in w.items()})
 body=mesh('pressure_body',verts,[tuple(remap[i]for i in f)for f in bodyfaces],'pressure',outweights)
 import bmesh
 bm=bmesh.new();bm.from_mesh(body.data)
 # Fill eye/mouth openings. There is no exposed ordinary face behind the form.
 boundary=[e for e in bm.edges if e.is_boundary]
 if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
 edges=[e for e in bm.edges if all(1.20<G(v.co)[1]<2.20 and abs(G(v.co)[0])<.40 and not(1.70<G(v.co)[1]<2.10 and abs(G(v.co)[0])<.13) for v in e.verts)]
 bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
 # Remove the old facial topology's chin/lip seam inside the sealed collar.
 headpatch=[v for v in bm.verts if 1.76<G(v.co)[1]<2.05 and abs(G(v.co)[0])<.14]
 for _ in range(12):bmesh.ops.smooth_vert(bm,verts=headpatch,factor=.48,use_axis_x=True,use_axis_y=True,use_axis_z=True)
 bm.normal_update()
 # Actual centimetre-scale load striations remain legible without a normal map.
 for v in bm.verts:
  p=G(v.co);x,y,z=p
  if 1.48<y<1.90 and abs(x)<.28 and G(v.normal)[2]<-.15:
   r=sqrt(x*x+(y-1.79)**2);envelope=gauss(r,.14,.11)
   fold=.020*(gauss(y-1.79-.75*x,0,.017)+gauss(y-1.79+1.05*x,0,.018))*envelope
   fold+=.012*(gauss(y-1.70-1.6*x,0,.016)+gauss(y-1.70+1.7*x,0,.017))*envelope
   p[2]-=fold;v.co=B(p)
 bm.to_mesh(body.data);bm.free();body.data.update()
 hoodverts=[];hoodfaces=[];seg=48;rings=36
 for jh in range(rings+1):
  a=pi*jh/rings
  for ih in range(seg):
   t=2*pi*ih/seg;p=np.array([.025+.090*sin(a)*cos(t),1.935+.135*cos(a),.012+.070*sin(a)*sin(t)])
   p[0]+=.018*cos(a);p[2]+=.030*gauss(p[0],.025,.060)*gauss(p[1],1.925,.095)*smooth((.025-p[2])/.06)
   p[2]+=.0025*sin(a*17+t*3)*sin(a)**2;hoodverts.append(p)
 for jh in range(rings):
  for ih in range(seg):ni=(ih+1)%seg;hoodfaces.append((jh*seg+ih,jh*seg+ni,(jh+1)*seg+ni,(jh+1)*seg+ih))
 hood=mesh('pressure_embedded_hood',hoodverts,hoodfaces,'pressure',[{'head':.55,'neck':.45}for _ in hoodverts]);body=join([body,hood],'pressure_body')
 # A small clay bridge closes the collar's last narrow notch. It becomes part
 # of the same remeshed membrane rather than remaining a detached component.
 bridgeverts=[];bridgefaces=[];bseg=32;brings=20
 for jh in range(brings+1):
  a=pi*jh/brings
  for ih in range(bseg):
   t=2*pi*ih/bseg;xx=.105*sin(a)*cos(t);yy=.047*cos(a)
   bridgeverts.append([-.13+xx*cos(-.35)-yy*sin(-.35),2.035+xx*sin(-.35)+yy*cos(-.35),.02+.075*sin(a)*sin(t)])
 for jh in range(brings):
  for ih in range(bseg):ni=(ih+1)%bseg;bridgefaces.append((jh*bseg+ih,jh*bseg+ni,(jh+1)*bseg+ni,(jh+1)*bseg+ih))
 bridge=mesh('pressure_collar_clay_bridge',bridgeverts,bridgefaces,'pressure',[{'neck':.5,'chest':.5}for _ in bridgeverts]);body=join([body,bridge],'pressure_body')
 # Retained facial folds can intersect after a large pressure collapse. Make a
 # genuine unified sculpt volume, preserving the authored skin envelopes on an
 # inspection-only reference and transferring by source-triangle interpolation.
 # This is not a collection of head/limb primitives or an alpha silhouette.
 weight_source=body.copy();weight_source.data=body.data.copy();weight_source.name='pressure_authored_envelope_reference';bpy.context.collection.objects.link(weight_source)
 bpy.context.view_layer.objects.active=body
 rem=body.modifiers.new('unified pressure sculpt','REMESH');rem.mode='VOXEL';rem.voxel_size=.006;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
 relax=body.modifiers.new('relax pressure membrane','SMOOTH');relax.factor=.35;relax.iterations=3;bpy.ops.object.modifier_apply(modifier=relax.name)
 collarbm=bmesh.new();collarbm.from_mesh(body.data);collarverts=[v for v in collarbm.verts if G(v.co)[1]>1.84 and abs(G(v.co)[0])<.21]
 for _ in range(10):bmesh.ops.smooth_vert(collarbm,verts=collarverts,factor=.45,use_axis_x=True,use_axis_y=True,use_axis_z=True)
 collarbm.to_mesh(body.data);collarbm.free();body.data.update()
 dec=body.modifiers.new('bounded pressure topology','DECIMATE');dec.ratio=min(1,47000/max(1,len(body.data.polygons)*2));bpy.ops.object.modifier_apply(modifier=dec.name)
 transfer=body.modifiers.new('authored triangle skin transfer','DATA_TRANSFER');transfer.object=weight_source;transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'};transfer.vert_mapping='POLYINTERP_NEAREST';transfer.layers_vgroup_select_src='ALL';transfer.layers_vgroup_select_dst='NAME';bpy.ops.object.modifier_apply(modifier=transfer.name)
 bpy.data.objects.remove(weight_source,do_unlink=True)
 # The sculpt union can join formerly separated source triangles. Relax their
 # transferred envelopes over actual adjacency, keeping one coherent surface.
 skin=np.zeros((len(body.data.vertices),len(body.vertex_groups)))
 for v in body.data.vertices:
  for g in v.groups:skin[v.index,g.group]=g.weight
 edges=np.array([e.vertices[:]for e in body.data.edges],dtype=int);degree=np.bincount(edges.ravel(),minlength=len(skin))
 for _ in range(6):
  accum=np.zeros_like(skin);np.add.at(accum,edges[:,0],skin[edges[:,1]]);np.add.at(accum,edges[:,1],skin[edges[:,0]]);skin=skin*.6+accum/np.maximum(1,degree)[:,None]*.4
 for v in body.data.vertices:
  for group in [g.group for g in v.groups]:body.vertex_groups[group].remove([v.index])
  for group in np.flatnonzero(skin[v.index]>.00001):body.vertex_groups[int(group)].add([v.index],float(skin[v.index,group]),'REPLACE')
 # Relax only the newly fitted pressure surface, preserving hands and its deep
 # cavity. Topology and weight interpolation remain continuous across the body.
 for poly in body.data.polygons:poly.use_smooth=True
 for v in body.data.vertices:
  w=sorted([(g.group,g.weight)for g in v.groups],key=lambda z:z[1],reverse=True)[:4];total=sum(a for _,a in w)or 1
  for group in [g.group for g in v.groups]:body.vertex_groups[group].remove([v.index])
  for group,value in w:body.vertex_groups[group].add([v.index],value/total,'REPLACE')
 bpy.context.view_layer.objects.active=body;bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.003);bpy.ops.object.mode_set(mode='OBJECT')
 body['characterBounds']={'min':[-.9,-.03,-.65],'max':[.9,2.30,.65]};body['authoring']='Bespoke sculpted pressure surface over retained CC0 continuous anatomy; authored rig and unequal resisted motion'
 body.shape_key_add(name='Basis')
 MORPHS=['sternum_sink','collar_draw','scapula_lock','longitudinal_tension']
 for name in MORPHS:
  key=body.shape_key_add(name=name)
  for v in key.data:
   p=G(v.co);x,y,z=p
   if name=='sternum_sink'and 1.35<y<1.94:
    g=gauss(y,1.67,.18)*gauss(x,0,.14)*smooth((.12-z)/.24);p[2]+=.035*g;p[0]*=1-.035*g
   elif name=='collar_draw'and y>1.72:
    g=gauss(y,1.98,.18);p[1]-=.025*g;p[2]+=.018*g;p[0]*=1-.035*g
   elif name=='scapula_lock'and 1.58<y<1.99:
    g=gauss(y,1.79,.15)*gauss(abs(x),.19,.11);p[0]-=np.sign(x)*.016*g;p[1]+=.012*g;p[2]+=.012*g
   elif name=='longitudinal_tension':
    g=gauss(abs(x),.36,.18)*gauss(y,1.23,.37);p[1]-=.018*g;p[0]*=1-.025*g
   v.co=B(p)

 armdata=bpy.data.armatures.new('pressure_anatomy');arm=bpy.data.objects.new('pressure_anatomy',armdata);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for n,(h,t,parent)in REST.items():
  b=armdata.edit_bones.new(n);b.head=B(h);b.tail=B(t)
  if parent:b.parent=armdata.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT');mod=body.modifiers.new('continuous pressure skin','ARMATURE');mod.object=arm;body.parent=arm

else:
 arm=bpy.data.objects['pressure_anatomy'];body=bpy.data.objects['pressure_body']
 # Loading a moved baseline source must not silently produce magenta inspection
 # frames. Retain the same authored maps and pack them for a portable source.
 for im in bpy.data.images:
  if im.name.startswith('pressure-surface-'):
   im.filepath=os.path.join(ROOT,'public/assets/pressure-character',im.name+'.png');im.reload();im.pack()
 REST={b.name:(G(b.head_local),G(b.tail_local),b.parent.name if b.parent else None)for b in arm.data.bones}
 MORPHS=[k.name for k in list(body.data.shape_keys.key_blocks)[1:]]
 # Retain the accepted sculpt, UVs, weights, correctives and source materials.
 for ad in [arm.animation_data,body.data.shape_keys.animation_data]:
  if ad:
   ad.action=None
   for tr in ad.nla_tracks:tr.mute=True

def solve_elbow(a,b,l1,l2,pole):
 a=np.array(a);b=np.array(b);v=b-a;d=np.linalg.norm(v);u=v/(d or 1);dist=min(d,l1+l2-.001);q=np.dot(np.array(pole)-a,u);w=np.array(pole)-a-u*q;w/=np.linalg.norm(w)or 1;c=(l1*l1+dist*dist-l2*l2)/(2*dist);height=sqrt(max(0,l1*l1-c*c));return a+u*c+w*height
def pressure_pose(kind,t):
 if kind in ['pressure_load','pressure_advance','pressure_pivot','pressure_arrest']:return arrested_pose(kind,t)
 heads={n:h.copy()for n,(h,tail,p)in REST.items()};tails={n:z.copy()for n,(h,z,p)in REST.items()};extra={};morph={n:0 for n in MORPHS}
 # Authored unequal efforts, with a zero-valued seamless boundary. No noise,
 # reset or generic sine wobble: chest, shoulders and head resist at a delay.
 if kind=='pressure_idle':
  effort=gauss(t,2.25,.63)-.45*gauss(t,4.8,.85)+.72*gauss(t,7.1,.47);edge=sin(pi*t/9.6)**2;effort*=edge;shoulder=(gauss(t,2.65,.5)+.8*gauss(t,7.55,.5))*edge;head=(gauss(t,3.0,.6)-.7*gauss(t,5.7,.7))*edge
 elif kind=='pressure_listen':
  edge=sin(pi*t/4.8)**2;effort=.55*edge;shoulder=.35*edge;head=.7*edge;extra['head']=Quaternion(B([0,1,0]),-.22*edge)
 else:effort=shoulder=head=0
 for n,amount in [('spine_mid',.004),('spine_upper',.009),('chest',.014)]:heads[n]+=np.array([effort*.002,-effort*amount,effort*amount*.7]);tails[n]+=np.array([effort*.002,-effort*amount,effort*amount*.7])
 for side,s in [('L',-1),('R',1)]:
  for n in ['clavicle_'+side,'upperarm_'+side]:heads[n]+=np.array([-s*shoulder*.005,shoulder*.008,effort*.009]);tails[n]+=np.array([-s*shoulder*.005,shoulder*.008,effort*.009])
 heads['neck']+=np.array([head*.005,-effort*.012,head*.012]);tails['neck']+=np.array([head*.005,-effort*.012,head*.012]);heads['head']+=np.array([head*.008,-effort*.016,head*.013]);tails['head']+=np.array([head*.008,-effort*.016,head*.013]);extra['head']=extra.get('head',Quaternion())@Quaternion(B([0,0,1]),head*.045)
 morph.update(sternum_sink=max(0,effort)*.72,collar_draw=max(0,effort)*.65,scapula_lock=max(0,shoulder)*.7,longitudinal_tension=max(0,effort)*.60)
 if kind in ['pressure_approach','pressure_limp']:
  duration=2.4 if kind=='pressure_approach'else 3.4;distance=.50 if kind=='pressure_approach'else .375;stride=distance*.66;phase=(t/duration)%1;lower=np.array([.012*sin(2*pi*phase),-.045-.012*cos(4*pi*phase),0])
  for n in heads:
   if not n.startswith(('thigh_','shin_','foot_','toe_')):heads[n]+=lower;tails[n]+=lower
  for side,s,offset in [('L',-1,0),('R',1,.56)]:
   q=(phase+offset)%1
   # Most of the step receives weight late; the forward foot scrapes close to
   # the floor, then the body has to pull the other foot into its new position.
   if q<.34:u=q/.34;z=stride*.5-stride*smooth(u);lift=.017*sin(pi*u)**2
   else:u=(q-.34)/.66;z=-stride*.5+stride*u;lift=0
   ankle=REST['shin_'+side][1]+np.array([0,lift,z]);hip=REST['thigh_'+side][0]+lower;knee=solve_elbow(hip,ankle,np.linalg.norm(REST['thigh_'+side][1]-REST['thigh_'+side][0]),np.linalg.norm(REST['shin_'+side][1]-REST['shin_'+side][0]),[hip[0],.62,-.65]);heads['thigh_'+side]=hip;tails['thigh_'+side]=knee;heads['shin_'+side]=knee;tails['shin_'+side]=ankle;heads['foot_'+side]=ankle;tails['foot_'+side]=ankle+(REST['foot_'+side][1]-REST['foot_'+side][0]);heads['toe_'+side]=tails['foot_'+side];tails['toe_'+side]=heads['toe_'+side]+(REST['toe_'+side][1]-REST['toe_'+side][0])
   # Longitudinal tension inhibits a normal arm swing; forearm lags the shoulder.
   delay=sin(2*pi*(phase+offset-.16));heads['forearm_'+side]+=np.array([0,-.005,.010*delay]);tails['forearm_'+side]+=np.array([0,-.005,.010*delay]);heads['hand_'+side]+=np.array([0,-.008,.014*delay]);tails['hand_'+side]+=np.array([0,-.008,.014*delay])
  morph.update(sternum_sink=.35+.10*sin(2*pi*phase)**2,collar_draw=.25,scapula_lock=.4,longitudinal_tension=.65)
 for side in ['L','R']:
  delta=heads['hand_'+side]-REST['hand_'+side][0]
  for fn in ['thumb','index','middle','ring','little']:heads[fn+'_'+side]=REST[fn+'_'+side][0]+delta;tails[fn+'_'+side]=REST[fn+'_'+side][1]+delta
 return heads,tails,morph,extra

def arrested_pose(kind,t):
 """Distance-authored single scrape. The GLB contains no world root lunge.

 A full advance accompanies exactly 0.42m of linear world translation. Both
 local foot anchors return to the same stagger, so arrest/load can genuinely
 stop and the next cycle starts without a planted-foot reset.
 """
 heads={n:h.copy()for n,(h,tail,p)in REST.items()};tails={n:z.copy()for n,(h,z,p)in REST.items()};extra={}
 stepping=kind in ['pressure_advance','pressure_pivot'];stride=.42 if kind=='pressure_advance'else 0
 u=max(0,min(1,t/.72))if stepping else 0
 if kind=='pressure_load':
  q=max(0,min(1,t/.50));chest=smooth((q-.05)/.82);shoulder=smooth((q-.17)/.80);head=smooth((q-.32)/.68);hand=smooth((q-.58)/.42)
 elif stepping:
  chest=1-smooth((u-.18)/.62);shoulder=1-smooth((u-.62)/.38);head=1-smooth((u-.73)/.27);hand=1-smooth((u-.84)/.16)
 else:chest=shoulder=head=hand=0
 # Arrest is an unresolved lower, off-axis weight-bearing position, absolutely
 # fixed. Only the explicitly authored advance has a small failed transfer.
 lower=np.array([.012,-.085,.010])
 if stepping:lower+=np.array([-.014*sin(pi*u)**2,-.012*sin(pi*u)**2,0])
 for n in heads:
  if not n.startswith(('thigh_','shin_','foot_','toe_')):heads[n]+=lower;tails[n]+=lower
 offsets={'spine_lower':[0,-.002-.002*chest,.006+.003*chest],
  'spine_mid':[.004,-.006-.007*chest,.012+.007*chest],
  'spine_upper':[.008,-.014-.015*chest,.021+.013*chest],
  'chest':[.012,-.021-.023*chest,.030+.019*chest],
  'neck':[.016,-.037-.027*head,.040+.025*head],
  'head':[.019,-.042-.027*head,.043+.028*head]}
 for n,offset in offsets.items():heads[n]+=np.array(offset);tails[n]+=np.array(offset)
 # Join each thoracic segment to its actual next head. The head is retracted
 # within the drawn collar instead of translating independently through it.
 chain=['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','head']
 for a,b in zip(chain,chain[1:]):tails[a]=heads[b].copy()
 extra['head']=Quaternion(B([0,0,1]),-.025-.035*head)
 jawdelta=heads['head']-REST['head'][0];heads['jaw']=REST['jaw'][0]+jawdelta;tails['jaw']=REST['jaw'][1]+jawdelta
 for side,s in [('L',-1),('R',1)]:
  # The leading high shoulder binds first. The forearms do not pendulum; the
  # hands resist their release until the final 16% of the actual step.
  shoulderShift=np.array([-s*(.005+.008*shoulder),(.015+.024*shoulder)if side=='L'else(-.007+.007*shoulder),.010+.014*shoulder])
  shoulderPoint=REST['upperarm_'+side][0]+lower+shoulderShift
  wrist=REST['hand_'+side][0]+lower+np.array([-s*(.003+.007*hand),.010+.008*hand,.012+.020*hand])
  upper=np.linalg.norm(REST['upperarm_'+side][1]-REST['upperarm_'+side][0]);fore=np.linalg.norm(REST['forearm_'+side][1]-REST['forearm_'+side][0])
  if np.linalg.norm(wrist-shoulderPoint)>upper+fore-.001:raise RuntimeError('Unreachable arrested arm '+side)
  elbow=solve_elbow(shoulderPoint,wrist,upper,fore,[s*.44,1.46,-.26])
  heads['clavicle_'+side]=heads['chest'].copy();tails['clavicle_'+side]=shoulderPoint
  heads['upperarm_'+side]=shoulderPoint;tails['upperarm_'+side]=elbow
  heads['forearm_'+side]=elbow;tails['forearm_'+side]=wrist
  heads['hand_'+side]=wrist;tails['hand_'+side]=wrist+(REST['hand_'+side][1]-REST['hand_'+side][0])
  # Foot positions cancel the authoritative root, not a second mesh movement.
  # L scrapes first, R refuses until after the new L contact has taken weight.
  stagger=-.08 if side=='L'else .08;progress=0;lift=0
  if stepping:
   if side=='L':
    q=max(0,min(1,u/.38));progress=smooth(q);lift=.022*sin(pi*q)**2 if u<.38 else 0
   else:
    q=max(0,min(1,(u-.58)/.42));progress=smooth(q);lift=.007*sin(pi*q)**2 if u>.58 else 0
  delta=np.array([0,lift,stagger+stride*(u-progress)])
  ankle=REST['shin_'+side][1]+delta;hip=REST['thigh_'+side][0]+lower
  thigh=np.linalg.norm(REST['thigh_'+side][1]-REST['thigh_'+side][0]);shin=np.linalg.norm(REST['shin_'+side][1]-REST['shin_'+side][0])
  if np.linalg.norm(ankle-hip)>thigh+shin-.001:raise RuntimeError('Unreachable arrested leg '+side)
  knee=solve_elbow(hip,ankle,thigh,shin,[hip[0],.65,-.70])
  heads['thigh_'+side]=hip;tails['thigh_'+side]=knee;heads['shin_'+side]=knee;tails['shin_'+side]=ankle
  heads['foot_'+side]=ankle;tails['foot_'+side]=ankle+(REST['foot_'+side][1]-REST['foot_'+side][0])
  heads['toe_'+side]=tails['foot_'+side];tails['toe_'+side]=heads['toe_'+side]+(REST['toe_'+side][1]-REST['toe_'+side][0])
  fingershift=wrist-REST['hand_'+side][0]
  for fn in ['thumb','index','middle','ring','little']:heads[fn+'_'+side]=REST[fn+'_'+side][0]+fingershift;tails[fn+'_'+side]=REST[fn+'_'+side][1]+fingershift
 morph={'sternum_sink':.34+.54*chest,'collar_draw':.32+.53*head,'scapula_lock':.40+.50*shoulder,'longitudinal_tension':.54+.36*hand}
 return heads,tails,morph,extra

def apply_pose(kind,t):
 heads,tails,morph,extra=pressure_pose(kind,t);desired={}
 for n,pb in arm.pose.bones.items():
  delta=B(REST[n][1]-REST[n][0]).rotation_difference(B(tails[n]-heads[n]));rot=delta.to_matrix().to_4x4()@arm.data.bones[n].matrix_local.to_quaternion().to_matrix().to_4x4();mat=Matrix.Translation(B(heads[n]))@rot
  if n in extra:mat=mat@extra[n].to_matrix().to_4x4()
  desired[n]=mat
 for n,pb in arm.pose.bones.items():
  rest=arm.data.bones[n].matrix_local;parent=arm.data.bones[n].parent
  pb.matrix_basis=(parent.matrix_local.inverted()@rest).inverted()@desired[parent.name].inverted()@desired[n]if parent else rest.inverted()@desired[n]
 for n,v in morph.items():body.data.shape_keys.key_blocks[n].value=v
 bpy.context.view_layer.update()

LEGACY_CLIPS={'pressure_hold':1,'pressure_idle':9.6,'pressure_approach':2.4,'pressure_limp':3.4,'pressure_listen':4.8}
ARRESTED_CLIPS={'pressure_load':.50,'pressure_advance':.72,'pressure_arrest':1.0,'pressure_pivot':.72};CLIPS={**LEGACY_CLIPS,**ARRESTED_CLIPS};scene=bpy.context.scene
# Fifty samples/second represents both .50 and .72 exactly. Retiming retained
# source actions keeps their seconds unchanged; delivered legacy streams below
# are copied byte-for-byte from the accepted GLB, never re-exported.
oldfps=scene.render.fps;fps=50
if ANIMATION_ONLY:
 for ad in [arm.animation_data,body.data.shape_keys.animation_data]:
  for tr in list(ad.nla_tracks):
   if tr.name in ARRESTED_CLIPS:ad.nla_tracks.remove(tr)
 for action in list(bpy.data.actions):
  if action.name.split('_MORPHS')[0]in ARRESTED_CLIPS:bpy.data.actions.remove(action)
 ratio=fps/oldfps
 for action in bpy.data.actions:
  for curve in action.fcurves:
   for key in curve.keyframe_points:key.co.x*=ratio;key.handle_left.x*=ratio;key.handle_right.x*=ratio
 for ad in [arm.animation_data,body.data.shape_keys.animation_data]:
  for tr in ad.nla_tracks:
   for strip in tr.strips:
    strip.action_frame_start=0;strip.action_frame_end=strip.action.frame_range[1];strip.frame_start=0;strip.frame_end=strip.action.frame_range[1]
scene.render.fps=fps
for kind,duration in (ARRESTED_CLIPS if ANIMATION_ONLY else CLIPS).items():
 print('BAKING',kind,flush=True);arm.animation_data_create();action=bpy.data.actions.new(kind);arm.animation_data.action=action;body.data.shape_keys.animation_data_create();ma=bpy.data.actions.new(kind+'_MORPHS');body.data.shape_keys.animation_data.action=ma
 for frame in range(round(duration*fps)+1):
  scene.frame_set(frame);apply_pose(kind,frame/fps)
  for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
  for key in list(body.data.shape_keys.key_blocks)[1:]:key.keyframe_insert('value',frame=frame)
 for baked in [action,ma]:
  for curve in baked.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
 tr=arm.animation_data.nla_tracks.new();tr.name=kind;tr.strips.new(kind,0,action);arm.animation_data.action=None;tr=body.data.shape_keys.animation_data.nla_tracks.new();tr.name=kind;tr.strips.new(kind,0,ma);body.data.shape_keys.animation_data.action=None
for ad in [arm.animation_data,body.data.shape_keys.animation_data]:
 for tr in ad.nla_tracks:tr.mute=True
scene.frame_start=0;scene.frame_end=round(9.6*fps);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
for ad in [arm.animation_data,body.data.shape_keys.animation_data]:
 for tr in ad.nla_tracks:tr.mute=ANIMATION_ONLY and tr.name not in ARRESTED_CLIPS
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=arm
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
 meshdef.setdefault('extras',{})['characterBounds']={'min':[-.9,-.03,-.65],'max':[.9,2.30,.65]}
# Blend export can emit duplicate NLA named animations; consolidate matching track names.
merged={}
for anim in j.get('animations',[]):
 name=anim.get('name','');base=name.split('_MORPHS')[0];base=base.split('.')[0]
 if base not in list(CLIPS):
  base=next((n for n in list(CLIPS)if n in name),name)
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
if ANIMATION_ONLY:
 # Export only animation streams into the accepted container. This preserves
 # every retained sculpt/skin/UV/corrective/texture/inverse-bind byte and all
 # five legacy performances, independently of Blender exporter ordering.
 sourcej,sourcebin=j,binary;jl=struct.unpack_from('<I',BASE_BYTES,12)[0]
 j=json.loads(BASE_BYTES[20:20+jl]);binary=bytearray(BASE_BYTES[28+jl:])
 targetnodes={n.get('name'):i for i,n in enumerate(j['nodes'])};viewmap={};accessormap={}
 def retain_accessor(index):
  if index in accessormap:return accessormap[index]
  a=dict(sourcej['accessors'][index]);viewindex=a['bufferView']
  if viewindex not in viewmap:
   v=dict(sourcej['bufferViews'][viewindex]);offset=v.get('byteOffset',0);binary.extend(b'\0'*((-len(binary))%4));v['byteOffset']=len(binary)
   binary.extend(sourcebin[offset:offset+v['byteLength']]);viewmap[viewindex]=len(j['bufferViews']);j['bufferViews'].append(v)
  a['bufferView']=viewmap[viewindex];accessormap[index]=len(j['accessors']);j['accessors'].append(a);return accessormap[index]
 j['animations']=[a for a in j.get('animations',[])if a['name']not in ARRESTED_CLIPS]
 for name in ARRESTED_CLIPS:
  original=next((a for a in sourcej['animations']if a['name']==name),None)
  if not original:raise RuntimeError('Exporter omitted '+name)
  animation={'name':name,'samplers':[],'channels':[]}
  for sampler in original['samplers']:animation['samplers'].append({**sampler,'input':retain_accessor(sampler['input']),'output':retain_accessor(sampler['output'])})
  for channel in original['channels']:
   target=dict(channel['target']);nodename=sourcej['nodes'][target['node']].get('name')
   if nodename not in targetnodes:raise RuntimeError('Animation node missing from accepted asset '+str(nodename))
   target['node']=targetnodes[nodename];animation['channels'].append({**channel,'target':target})
  j['animations'].append(animation)
 j['buffers'][0]['byteLength']=len(binary)
raw=json.dumps(j,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary+=b'\0'*((-len(binary))%4);out=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary;open(OUT,'wb').write(out)

# Geometry/performance provenance remains independently inspectable.
stats={'source':'tools/chunk_surfer/characters/build-pressure-character.py','blender':bpy.app.version_string,'units':'metres','forward':'-Z','height':2.18,'clips':CLIPS,'joints':list(REST),'morphs':MORPHS,'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'motion':{'pressure_approach':{'cycleSeconds':2.4,'distanceMetres':.50,'planted':{'L':[.34,1.0],'R':[[0,.44],[.78,1.0]]}},'pressure_limp':{'cycleSeconds':3.4,'distanceMetres':.375,'planted':{'L':[.34,1.0],'R':[[0,.44],[.78,1.0]]}}},'meshes':{m['name']:{'primitives':len(m['primitives']),'vertices':sum(j['accessors'][p['attributes']['POSITION']]['count']for p in m['primitives']),'triangles':sum(j['accessors'][p['indices']]['count']//3 for p in m['primitives'])}for m in j['meshes']},'surface':'continuous anatomically based sculpt, sealed featureless cranium, concave sternum, unequal shoulder/collar displacement and tension-oriented geometry relief','textureResidencyMiB':12.0,'qualityLimit':'Authored procedural anatomical sculpt, compact rig and corrective performance, using CC0 MakeHuman topology and envelopes. Not photogrammetry or actor mocap.'}
open(os.path.join(TEX,'stats.json'),'w').write(json.dumps(stats,indent=2))
stats['motion']['arrested']={'loadSeconds':.50,'advanceSeconds':.72,'arrestSeconds':1.0,'pivotSeconds':.72,'distanceMetres':.42,'pivotDistanceMetres':0,'rootCurve':'linear forward -Z; supplied by authoritative runtime, not mesh root','staggerMetres':{'L':-.08,'R':.08},'planted':{'load':'both','arrest':'both','advance':{'L':[.38,1.0],'R':[0,.58]},'pivot':{'L':[.38,1.0],'R':[0,.58]}},'release':{'chest':.18,'shoulder':.62,'head':.73,'hand':.84},'seams':['pressure_arrest = pressure_load start = pressure_advance end = pressure_pivot end','pressure_load end = pressure_advance start = pressure_pivot start'],'retainedAppearanceBaselineSha256':hashlib.sha256(BASE_BYTES).hexdigest()if ANIMATION_ONLY else None}
open(os.path.join(TEX,'stats.json'),'w').write(json.dumps(stats,indent=2))
open(os.path.join(TEX,'CREDITS.md'),'w').write('# Pressure manifestation\n\nA separate sculpted pressure surface and authored movement; no textures or geometry from the frozen outskirts character pack are modified. Continuous anatomical topology and original authored weight envelopes derive from MakeHuman hm08 (CC0-1.0), MakeHuman Community / Data Collection AB / Joel Palmius / Jonas Hauquier. Base source: https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/3dobjs/base.obj (SHA256 8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c). Male macro targets and compact weight mapping provenance: tools/chunk_surfer/character-sources/makehuman/sources.json and weights-sources.json, with licence in LICENSE.ASSETS.md. Geometry fitting, feature sealing, pressure folds, materials, corrective morphs, rig adaptation and performance authored for Chunk Surfer in Blender 4.5 LTS. No human skin/face texture, outfit texture, billboard or projected concept image is used. Rebuild source: tools/chunk_surfer/characters/build-pressure-character.py.\n')
print('EXPORTED',json.dumps(stats),flush=True)

# Unmasked neutral-studio views expose the actual front, side and rear volume.
for ad in [arm.animation_data,body.data.shape_keys.animation_data]:
 for tr in ad.nla_tracks:tr.mute=True
world=bpy.data.worlds.new('pressure inspection studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.14,.15,.16,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
for location,power,size in [((3,4,4),850,4),((-3,1,2),500,3),((0,-3,3),700,3)]:
 d=bpy.data.lights.new('pressure inspection softbox','AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(d.name,d);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,1.1))-o.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('pressure inspection');cam=bpy.data.objects.new('pressure inspection',camd);bpy.context.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO';camd.ortho_scale=2.52
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=768;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
previewlist=[('front','pressure_hold',0,(.15,4.5,1.15)),('side','pressure_hold',0,(4.5,.15,1.15)),('rear','pressure_hold',0,(.15,-4.5,1.15)),('compression','pressure_idle',2.25,(1.2,4.5,1.25)),('drag','pressure_approach',.55,(1.8,4.5,1.3)),('listen','pressure_listen',2.7,(-1.5,4.5,1.3))]
if ANIMATION_ONLY:
 # A fixed studio camera and a real floor expose support and the absence of
 # idle motion. Advance previews include the exact canonical world translation.
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.007));floor=bpy.context.object;floor.name='inspection floor';fm=bpy.data.materials.new('inspection floor');fm.diffuse_color=(.19,.20,.21,1);floor.data.materials.append(fm)
 scene.render.resolution_x=600;scene.render.resolution_y=800;camd.ortho_scale=2.70
 previewlist=[]
 for label,kind,t in [('arrest','pressure_arrest',1),('load-half','pressure_load',.25),('load-end','pressure_load',.50),('step-leading','pressure_advance',.20),('step-contact','pressure_advance',.40),('step-drag','pressure_advance',.60),('step-end','pressure_advance',.72)]:
  for view,pos in [('front',(.20,4.5,1.15)),('side',(4.5,.15,1.15))]:previewlist.append((label+'-'+view,kind,t,pos))
for name,kind,t,pos in previewlist:
 arm.location=B([0,0,-.42*t/.72])if kind=='pressure_advance'else B([0,0,0])
 apply_pose(kind,t);cam.location=pos;cam.rotation_euler=(Vector((0,0,1.1))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(PRE,name+'.png');bpy.ops.render.render(write_still=True)
print('PREVIEWS',PRE,flush=True)
arm.location=B([0,0,0]);camd.ortho_scale=.86;apply_pose('pressure_load',.50)if ANIMATION_ONLY else apply_pose('pressure_hold',0);target=Vector((0,0,1.82));cam.location=Vector((.35,4.5,1.84));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(PRE,'load-chest-close.png'if ANIMATION_ONLY else'chest-close.png');bpy.ops.render.render(write_still=True)
