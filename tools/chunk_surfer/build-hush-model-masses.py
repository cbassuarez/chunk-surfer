"""CPU-only anatomical mass studies. Never writes production assets.

These are static silhouettes for the actual pressure/VFD renderer, not finished
creature rigs, animation, contacts, navigation clearance or gameplay evidence.
"""
import bpy,bmesh,os,json,math,hashlib,sys
from mathutils import Vector,Matrix,Quaternion
from mathutils.kdtree import KDTree
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'artifacts/hush-model-directions');os.makedirs(OUT,exist_ok=True)
SOURCE=os.path.join(ROOT,'assets/source/pressure-character.blend')
POSED={}
def B(p):return Vector((p[0],-p[2],p[1]))
def G(p):return Vector((p[0],p[2],-p[1]))
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def gauss(x,c,w):return math.exp(-((x-c)/w)**2)

def source():
 bpy.ops.wm.open_mainfile(filepath=SOURCE)
 body=bpy.data.objects['pressure_body'];arm=bpy.data.objects['pressure_anatomy']
 arm.animation_data_clear()
 if body.data.shape_keys:
  body.data.shape_keys.animation_data_clear()
  for k in body.data.shape_keys.key_blocks:k.value=0
 rest={b.name:(G(b.head_local),G(b.tail_local),b.parent.name if b.parent else None)for b in arm.data.bones}
 return body,arm,rest

def pose(body,arm,rest,kind):
 desired={};heads={n:h.copy()for n,(h,t,p)in rest.items()};tails={n:t.copy()for n,(h,t,p)in rest.items()}
 if kind in ['brace','carried','carrier']:
  pelvis=rest['pelvis'][0]
  if kind=='brace':anchor=Vector((0,.65,.20));axis=Vector((0,.16,-1)).normalized()
  elif kind=='carried':anchor=Vector((.33,1.71,.02));axis=Vector((-1,-.10,0)).normalized()
  else:anchor=Vector((0,1.08,.08));axis=Vector((0,1,-.08)).normalized()
  rotation=Vector((0,1,0)).rotation_difference(axis)
  def mapped(p):return anchor+rotation@(p-pelvis)
  for n in rest:heads[n]=mapped(rest[n][0]);tails[n]=mapped(rest[n][1])
  for side,s in [('L',-1),('R',1)]:
   if kind=='brace':
    shoulder=heads['upperarm_'+side];elbow=Vector((s*.235,1.45,.19));wrist=Vector((s*.275,.115,-.68));handtail=Vector((s*.275,.085,-.855))
    hip=heads['thigh_'+side];knee=Vector((s*.14,.38,.49));ankle=Vector((s*.14,.14,.71));toetail=Vector((s*.14,.075,.87))
   elif kind=='carried':
    shoulder=heads['upperarm_'+side];elbow=Vector((-.30+s*.07,1.33,-.19+s*.08));wrist=Vector((-.24+s*.10,1.00,-.24+s*.04));handtail=wrist+Vector((.015,-.17,.015))
    hip=heads['thigh_'+side];knee=Vector((.72,1.65+s*.09,.10));ankle=Vector((.60,1.17+s*.04,.19));toetail=ankle+Vector((-.02,-.08,-.13))
   else:
    shoulder=heads['upperarm_'+side];elbow=Vector((s*.36,1.35,-.16));wrist=Vector((s*.30,1.63,-.05));handtail=wrist+Vector((-s*.13,.025,.045))
    hip=heads['thigh_'+side];knee=Vector((s*.16,.62,-.12));ankle=Vector((s*.18,.11,.06));toetail=Vector((s*.18,.055,-.14))
   heads['clavicle_'+side]=heads['chest'].copy();tails['clavicle_'+side]=shoulder
   heads['upperarm_'+side]=shoulder;tails['upperarm_'+side]=elbow
   heads['forearm_'+side]=elbow;tails['forearm_'+side]=wrist
   heads['hand_'+side]=wrist;tails['hand_'+side]=handtail
   # Keep the original adult hand anatomy, with an explicit common wrist
   # rotation rather than independently guessed finger axes.
   handrot=(rest['hand_'+side][1]-rest['hand_'+side][0]).rotation_difference(handtail-wrist)
   if kind=='brace':handrot=Quaternion((handtail-wrist).normalized(),s*math.pi*.40)@handrot
   for finger in ['thumb','index','middle','ring','little']:
    n=finger+'_'+side;heads[n]=wrist+handrot@(rest[n][0]-rest['hand_'+side][0]);tails[n]=wrist+handrot@(rest[n][1]-rest['hand_'+side][0])
   heads['thigh_'+side]=hip;tails['thigh_'+side]=knee
   heads['shin_'+side]=knee;tails['shin_'+side]=ankle
   heads['foot_'+side]=ankle;tails['foot_'+side]=toetail
   heads['toe_'+side]=toetail;tails['toe_'+side]=toetail+(toetail-ankle).normalized()*.085
  if kind=='carrier':
   # The standing adult's head protrudes forward below the carried body.
   for n in ['neck','head','jaw']:heads[n].z-=.18;tails[n].z-=.18
 for n,pb in arm.pose.bones.items():
  h,t,_=rest[n];delta=B(t-h).rotation_difference(B(tails[n]-heads[n]));rot=delta.to_matrix().to_4x4()@arm.data.bones[n].matrix_local.to_quaternion().to_matrix().to_4x4()
  length=(tails[n]-heads[n]).length/max(.0001,(t-h).length)
  scale=Matrix.Diagonal((1,length,1,1));desired[n]=Matrix.Translation(B(heads[n]))@rot@scale
 if kind=='carried':
  # The carried adult's sealed head turns away from the standing adult's
  # bearing. This is a physical neck/head volume twist, not a face decal.
  pivot=B(heads['neck']);turn=Matrix.Translation(pivot)@Quaternion(B(axis),1.95).to_matrix().to_4x4()@Matrix.Translation(-pivot)
  for n in ['neck','head','jaw']:desired[n]=turn@desired[n]
 # Bake explicit world-space deformation matrices. Independent desired bone
 # frames avoid Blender's TRS decomposition of inherited nonuniform limb
 # scales introducing accidental shear into these static proportions.
 deforms={n:m@arm.data.bones[n].matrix_local.inverted()for n,m in desired.items()}
 verts=[]
 for v in body.data.vertices:
  q=Vector((0,0,0));total=0
  for group in v.groups:
   name=body.vertex_groups[group.group].name
   if name in deforms:q+=(deforms[name]@v.co)*group.weight;total+=group.weight
  verts.append(q/max(total,.000001))
 mesh=bpy.data.meshes.new(kind+' baked anatomical skin');mesh.from_pydata(verts,[],[tuple(p.vertices)for p in body.data.polygons]);mesh.update()
 obj=bpy.data.objects.new(kind+' anatomical mass',mesh);bpy.context.collection.objects.link(obj)
 POSED[kind]=(heads,tails)
 return obj

def active(obj):
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
def apply(obj,modifier):active(obj);bpy.ops.object.modifier_apply(modifier=modifier.name)
def components(obj):
 me=obj.data;adj=[[]for _ in me.vertices]
 for e in me.edges:a,b=e.vertices;adj[a].append(b);adj[b].append(a)
 seen=set();out=[]
 for i in range(len(adj)):
  if i in seen:continue
  stack=[i];seen.add(i);group=[]
  while stack:
   v=stack.pop();group.append(v)
   for n in adj[v]:
    if n not in seen:seen.add(n);stack.append(n)
  out.append(group)
 return sorted(out,key=len,reverse=True)
def clean_chips(obj):
 groups=components(obj);dead=set(v for group in groups if len(group)<100 for v in group)
 if not dead:return
 bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[v]for v in dead],context='VERTS');bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
def remesh(obj,size=.0085,target=68000):
 m=obj.modifiers.new('Unified anatomical mass','REMESH');m.mode='VOXEL';m.voxel_size=size;m.use_smooth_shade=True;apply(obj,m)
 m=obj.modifiers.new('Relax cut membranes','SMOOTH');m.factor=.23;m.iterations=2;apply(obj,m)
 obj.data.calc_loop_triangles();tri=len(obj.data.loop_triangles)
 if tri>target:
  m=obj.modifiers.new('Bounded study topology','DECIMATE');m.ratio=target/tri;apply(obj,m)
 for p in obj.data.polygons:p.use_smooth=True
 obj.data.update();clean_chips(obj)

def compression(obj):
 for v in obj.data.vertices:
  p=G(v.co);x,y,z=p;oldy=y;ax=abs(x)
  y-=.46*smooth((y-.65)/1.50)
  head=smooth((oldy-1.76)/.12)*smooth((.17-ax)/.055)
  y-=.19*head;z-=.145*head;x*=1-.25*head
  shoulder=smooth((oldy-1.83)/.18)*smooth((ax-.12)/.12)
  y-=.20*shoulder
  if oldy>.78 and ax>.26:
   tuck=smooth((oldy-.78)/.22)*smooth((1.83-oldy)/.18)
   x=x*(1-tuck)+(math.copysign(.285+(ax-.285)*.25,x))*tuck
   z+=.095*tuck
  core=smooth((oldy-.94)/.30)*smooth((1.97-oldy)/.20)
  z*=1+.35*core
  front=smooth((-.015-z)/.12)
  z+=front*core*(.075*gauss(y-.19*x,1.18,.042)+.055*gauss(y+.13*x,1.40,.040))
  v.co=B((x,y,z))
 remesh(obj,.0075,66000)

def cutter(profile):
 verts=[B((x,y,z))for z in[-1.1,1.1]for x,y in profile];n=len(profile)
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
 me=bpy.data.meshes.new('Actual oblique missing tissue');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free();return o
def bridge(points,radius):
 curve=bpy.data.curves.new('Tension fascia','CURVE');curve.dimensions='3D';curve.resolution_u=12;curve.bevel_depth=radius;curve.bevel_resolution=3;curve.use_fill_caps=True
 s=curve.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for b,p in zip(s.bezier_points,points):b.co=B(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new('Tension fascia',curve);bpy.context.collection.objects.link(o);active(o);bpy.ops.object.convert(target='MESH');return bpy.context.object
def cleft(obj):
 for v in obj.data.vertices:
  p=G(v.co);x,y,z=p;head=smooth((y-1.77)/.14)*smooth((.18-abs(x))/.06)
  x+=.26*head
  if abs(x)>.25 and .75<y<1.85:x=math.copysign(.26+(abs(x)-.26)*.43,x)
  x+=math.copysign(.105*smooth((y-.85)/.45),x if abs(x)>.01 else-1)
  if y>1.85:y-=.14*smooth((y-1.85)/.22)*(1-head)
  v.co=B((x,y,z))
 remesh(obj,.008,74000)
 cut=cutter([(-.38,1.00),(-.20,1.10),(-.075,1.30),(-.065,1.71),(-.035,2.45),(.205,2.45),(.19,1.75),(.13,1.43),(.035,1.17),(-.17,1.00)])
 m=obj.modifiers.new('Real through-thorax absence','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=cut;apply(obj,m);bpy.data.objects.remove(cut,do_unlink=True)
 strips=[bridge([(-.22,1.37,.15),(-.03,1.34,.19),(.25,1.46,.12)],.019),bridge([(-.19,1.80,.15),(.01,1.76,.19),(.30,1.81,.12)],.014)]
 active(obj)
 for o in strips:o.select_set(True)
 bpy.ops.object.join();remesh(obj,.0075,70000)
 # Anchor additional posterior load bridges to the ACTUAL cut surface rather
 # than guessed coordinates. The void stays open around narrow fascia bands.
 for _ in range(3):
  groups=[group for group in components(obj)if len(group)>=100]
  if len(groups)<=1:break
  primary=groups[0];others=groups[1:];strips=[]
  primary_points=[i for i in primary if .82<G(obj.data.vertices[i].co).y<1.97 and G(obj.data.vertices[i].co).z>-.04]
  if not primary_points:primary_points=primary
  tree=KDTree(len(primary_points))
  for k,i in enumerate(primary_points):tree.insert(G(obj.data.vertices[i].co),i)
  tree.balance()
  for group in others:
   candidates=[i for i in group if .82<G(obj.data.vertices[i].co).y<1.97 and G(obj.data.vertices[i].co).z>-.04]or group
   best=None
   for i in candidates:
    p=G(obj.data.vertices[i].co);q,index,d=tree.find(p)
    if best is None or d<best[0]:best=(d,p.copy(),q.copy())
   _,p,q=best;mid=(p+q)*.5;mid.z+=.045;mid.y+=.015
   strips.append(bridge([p,mid,q],.035))
  active(obj)
  for o in strips:o.select_set(True)
  bpy.ops.object.join();remesh(obj,.0075,70000)
 if len([g for g in components(obj)if len(g)>=100])>1:raise RuntimeError('Cleft fascia has not joined its anatomical columns')

def bulk_brace(obj,body):
 heads,tails=POSED['brace']
 def nearest(p,a,b):
  d=b-a;u=max(0,min(1,(p-a).dot(d)/max(.00001,d.length_squared)));return a+d*u
 axisA=heads['pelvis'];axisB=tails['head']
 for i,v in enumerate(obj.data.vertices):
  p=G(v.co);weights={body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[i].groups}
  hand=sum(w for n,w in weights.items()if n.startswith(('hand_','thumb_','index_','middle_','ring_','little_')))
  arms=[(n,w)for n,w in weights.items()if n.startswith(('upperarm_','forearm_'))]
  if arms:
   n,w=max(arms,key=lambda x:x[1]);q=nearest(p,heads[n],tails[n]);amount=min(1,sum(w for _,w in arms))*max(0,1-hand*1.5)
   elbow=heads['forearm_'+n[-1]];rounding=.18*gauss((p-elbow).length,0,.16)
   p+=(p-q)*(.60+rounding)*amount
  torso=sum(w for n,w in weights.items()if n in ['pelvis','spine_lower','spine_mid','spine_upper','chest','neck','head','jaw'])
  if torso>.05:
   q=nearest(p,axisA,axisB);p+=(p-q)*(.22*min(1,torso))
  v.co=B(p)
 # Rounded anatomical elbow volumes are fused into the actual elongated arm
 # surface, avoiding needle-like joint silhouettes after voxel reconstruction.
 pieces=[]
 for side in ['L','R']:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=B(heads['forearm_'+side]));cap=bpy.context.object;cap.scale=(.085,.09,.075);active(cap);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);pieces.append(cap)
 active(obj)
 for o in pieces:o.select_set(True)
 bpy.ops.object.join()

def export(obj,name,description):
 obj.data.calc_loop_triangles();coords=[G(v.co)for v in obj.data.vertices]
 lo=[min(v[k]for v in coords)for k in range(3)];hi=[max(v[k]for v in coords)for k in range(3)]
 offset=Vector(((lo[0]+hi[0])*.5,lo[1],(lo[2]+hi[2])*.5));coords=[v-offset for v in coords]
 indices=[int(v)for t in obj.data.loop_triangles for v in t.vertices]
 data={'kind':'hush-static-anatomical-mass-study','id':name,'description':description,'source':'assets/source/pressure-character.blend','sourceSha256':hashlib.sha256(open(SOURCE,'rb').read()).hexdigest(),'units':'metres','up':'Y','forward':'-Z','animationProof':False,'rigProof':False,'positions':[list(v)for v in coords],'normals':[list(G(v.normal).normalized())for v in obj.data.vertices],'indices':indices,'bounds':{'min':[min(v[k]for v in coords)for k in range(3)],'max':[max(v[k]for v in coords)for k in range(3)]},'vertices':len(coords),'triangles':len(indices)//3}
 path=os.path.join(OUT,name+'-geometry.json');open(path,'w').write(json.dumps(data,separators=(',',':'))+'\n')
 print('HUSH_MASS_READY '+json.dumps({k:data[k]for k in['id','vertices','triangles','bounds']}),flush=True)

def requested(name):return '--only'not in sys.argv or sys.argv[sys.argv.index('--only')+1]==name
if requested('compression'):
 body,arm,rest=source();obj=pose(body,arm,rest,'compression');compression(obj);export(obj,'compression','Dense adult anatomy compressed and fused into a headless folded load; limbs embedded along the flanks. Actual remeshed volume, not a fat clothed person or face texture.')
if requested('cleft'):
 body,arm,rest=source();obj=pose(body,arm,rest,'cleft');cleft(obj);export(obj,'cleft','Asymmetric anatomical columns around a real oblique through-thorax absence, with measured posterior fascia bridges. Cap geometry and background-visible gaps.')
if requested('brace'):
 body,arm,rest=source();obj=pose(body,arm,rest,'brace');bulk_brace(obj,body);remesh(obj,.0075,70000);export(obj,'brace','Heavy low adult thorax suspended between two substantial front-to-back elongated anatomical arm braces; rounded loaded elbows, original adult hands and atrophied posterior legs. Static support mass, not a crawler animation.')
if requested('carrier'):
 body,arm,rest=source();standing=pose(body,arm,rest,'carrier');carried=pose(body,arm,rest,'carried');active(standing);carried.select_set(True);bpy.ops.object.join();remesh(standing,.0085,76000);export(standing,'carrier','A single fused entity: bent standing adult carrying another adult heavily across the shoulders. Two sealed heads face different bearings; four arms hang or brace the load. Static anatomical mass study.')
print('All anatomical mass geometries exported. No production assets modified.',flush=True)
