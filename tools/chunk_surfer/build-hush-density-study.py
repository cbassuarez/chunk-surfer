"""The Thick Part: regeneratable, nonhuman, skinned density study.

CPU geometry only. Default mode writes artifacts/hush-density-study/.
The historical --production flag reproduces the old in-game shape and scale
in artifacts/hush-density-study/legacy-build/ for comparison.
Coordinates: metres, glTF Y-up, forward -Z. Joints use explicit game axes.
"""
import bpy,bmesh,math,os,json,struct,hashlib,sys
import numpy as np
from mathutils import Vector
from math import sin,cos,pi
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
PRODUCTION='--production'in sys.argv
OUT=os.path.join(ROOT,'artifacts/hush-density-study/legacy-build'if PRODUCTION else'artifacts/hush-density-study');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def B(p):return Vector((p[0],-p[2],p[1]))
def G(p):return np.array((p[0],p[2],-p[1]),float)
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)

# Three unequal thick rolled volumes. Radii are measured cross-section axes,
# not the width of an alpha ribbon. The center lobe lies forward of the others.
PATHS={
 'A':[[-.45,.06,.04,.1,.12],[-.49,.30,.07,.1,.12],[-.52,.65,.09,.1,.12],[-.48,.98,.10,.1,.12],[-.36,1.18,.08,.1,.12],[-.27,1.30,.06,.1,.12]],
 'B':[[-.02,.07,-.15,.1,.12],[.10,.38,-.17,.1,.12],[.08,.79,-.20,.1,.12],[.03,1.20,-.24,.1,.12],[.19,1.62,-.31,.1,.12],[.43,1.93,-.39,.1,.12]],
 'C':[[.46,.06,.27,.1,.12],[.55,.25,.27,.1,.12],[.57,.53,.27,.1,.12],[.49,.79,.26,.1,.12],[.37,.98,.24,.1,.12],[.27,1.11,.20,.1,.12]],
}
def catmull(rows,t):
 n=len(rows);u=max(0,min(n-1,t*(n-1)));i=min(n-2,int(u));u-=i
 p0=np.array(rows[max(0,i-1)]);p1=np.array(rows[i]);p2=np.array(rows[i+1]);p3=np.array(rows[min(n-1,i+2)])
 return .5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)
def loft(name,rows,twist=0,rings=80,segments=64):
 verts=[];faces=[]
 for j in range(rings+1):
  t=j/rings;p=catmull(rows,t);a=catmull(rows,max(0,t-.002));b=catmull(rows,min(1,t+.002));tangent=b[:3]-a[:3];tangent/=np.linalg.norm(tangent)
  u=np.array([1.,0,0]);u-=tangent*np.dot(u,tangent)
  if np.linalg.norm(u)<.1:u=np.array([0.,0,1.]);u-=tangent*np.dot(u,tangent)
  u/=np.linalg.norm(u);v=np.cross(tangent,u);angle=twist*(.3+.7*t)+.07*sin(t*pi*1.3)
  U=u*cos(angle)+v*sin(angle);V=-u*sin(angle)+v*cos(angle)
  for k in range(segments):
   theta=2*pi*k/segments;c=cos(theta);s=sin(theta)
   # Rounded broad faces, deliberately not circular pipe or flat sheet.
   sx=math.copysign(abs(c)**.83,c);sz=math.copysign(abs(s)**.83,s)
   broad=1+.035*sin(theta*3+t*4.1)+.022*sin(theta*2-t*5.3)
   q=p[:3]+U*sx*p[3]*broad+V*sz*p[4]*broad;verts.append(B(q))
 for j in range(rings):
  for k in range(segments):q=(k+1)%segments;faces.append((j*segments+k,j*segments+q,(j+1)*segments+q,(j+1)*segments+k))
 faces.append(tuple(range(segments-1,-1,-1)));faces.append(tuple(rings*segments+k for k in range(segments)))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
def active(o):bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
def solid_fold(name,profile,depth,half_thickness,bevel):
 # A closed, bevelled, solid broad face, not a tube running around a hole.
 # Free crowns never join a shared upper arch; negative passages are open.
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='2D';curve.resolution_u=18;curve.fill_mode='BOTH';curve.extrude=half_thickness;curve.bevel_depth=bevel;curve.bevel_resolution=5
 spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(profile)-1);spline.use_cyclic_u=True
 for b,p in zip(spline.bezier_points,profile):b.co=(p[0],p[1],0);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);active(obj);bpy.ops.object.convert(target='MESH');obj=bpy.context.object
 for v in obj.data.vertices:
  x,y,z=v.co
  # Broad cupped surfaces and a leading cantilever, not three parallel fronds.
  # Both sides share the same coherent displacement: thickness stays solid.
  if name=='fold_B':
   forward=-.19*smooth((y-.90)/1.10)
   dish=.065*math.exp(-((x-.13)/.19)**2-((y-1.02)/.48)**2)
  elif name=='fold_A':
   forward=.040*sin(y/1.40*pi)
   dish=.035*math.exp(-((x+.46)/.15)**2-((y-.72)/.40)**2)
  else:
   forward=-.055*smooth((y-.45)/.70)
   dish=-.035*math.exp(-((x-.64)/.17)**2-((y-.62)/.34)**2)
  v.co=B((x,y,z+depth+forward+dish))
 return obj
profiles={
 'A':[[-.48,0],[-.64,.26],[-.65,.73],[-.58,1.08],[-.43,1.31],[-.26,1.38],[-.21,1.24],[-.35,1.12],[-.43,.81],[-.39,.44],[-.30,.18],[-.34,.035]],
 'B':[[-.08,0],[.18,.07],[.30,.34],[.32,.71],[.15,1.05],[.18,1.34],[.31,1.59],[.52,1.80],[.57,1.95],[.41,2.05],[.18,1.96],[.02,1.69],[-.12,1.38],[-.17,1.04],[-.05,.74],[-.14,.40],[-.18,.15]],
 'C':[[.44,.015],[.63,.18],[.68,.50],[.60,.83],[.43,1.08],[.25,1.16],[.19,1.05],[.35,.85],[.44,.58],[.39,.32],[.31,.10]],
}
for row in PATHS['C']:row[0]+=.14
for row in profiles['C']:row[0]+=.14
objects=[solid_fold('fold_A',profiles['A'],.06,.073,.048),solid_fold('fold_B',profiles['B'],-.17,.085,.052),solid_fold('fold_C',profiles['C'],.27,.055,.044)]
base=loft('Low posterior load bridge',[[-.46,.055,.18,.080,.075],[-.18,.055,.19,.090,.085],[.15,.055,.20,.085,.080],[.61,.055,.24,.080,.075]],.1,40,48);objects.append(base)
objects.append(loft('Low longitudinal root',[[-.025,.050,-.18,.075,.065],[.0,.050,-.045,.085,.065],[.02,.050,.12,.085,.065],[.035,.050,.21,.080,.065]],0,32,48))
active(objects[0])
for o in objects[1:]:o.select_set(True)
bpy.ops.object.join();obj=bpy.context.object
rem=obj.modifiers.new('Continuous thick density volume','REMESH');rem.mode='VOXEL';rem.voxel_size=.0065;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
relax=obj.modifiers.new('Rounded continuous fold surfaces','SMOOTH');relax.factor=.23;relax.iterations=3;bpy.ops.object.modifier_apply(modifier=relax.name)
obj.data.calc_loop_triangles();tri=len(obj.data.loop_triangles)
TRIANGLE_TARGET=44000 if PRODUCTION else 70000
if tri>TRIANGLE_TARGET:
 dec=obj.modifiers.new('Bounded density surface','DECIMATE');dec.ratio=TRIANGLE_TARGET/tri;bpy.ops.object.modifier_apply(modifier=dec.name)
bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free();obj.data.update()
for f in obj.data.polygons:f.use_smooth=True
P=np.array([G(v.co)for v in obj.data.vertices])
# Cupped faces and changing depth are authored into each solid fold before
# remeshing. No generic sinusoidal displacement decorates the final surface.
min0=P.min(0);max0=P.max(0)
transform=np.array([(.90 if PRODUCTION else 1.25)/(max0[0]-min0[0]),2.05/(max0[1]-min0[1]),.70/(max0[2]-min0[2])])
shift=np.array([(min0[0]+max0[0])*.5,min0[1],(min0[2]+max0[2])*.5]);P=(P-shift)*transform
for v,p in zip(obj.data.vertices,P):v.co=B(p)
obj.data.update();normals=np.array([G(v.normal)for v in obj.data.vertices]);normals/=np.maximum(1e-9,np.linalg.norm(normals,axis=1))[:,None]
indices=np.array([i for f in obj.data.polygons for i in f.vertices],dtype=np.uint32)
if len(P)>49000:raise RuntimeError('Density surface exceeds character vertex budget')

# Nineteen explicit spatial joints; all deformation is relative to one root.
# The floor strip is root-relative fixed. It drags with accepted root travel;
# this is not a claim of world-planted feet or a humanoid support solve.
joint_names=['density_root'];joint_positions=[np.zeros(3)]
for name,rows in PATHS.items():
 for k in range(6):joint_names.append('fold_'+name+'_'+str(k));joint_positions.append((catmull(rows,k/5)[:3]-shift)*transform)
JP=np.array(joint_positions)
SAMPLE_PATHS=[np.array([(catmull(rows,t)[:3]-shift)*transform for t in np.linspace(0,1,35)])for rows in PATHS.values()]if PRODUCTION else[]
W=np.zeros((len(P),19));
for i,p in enumerate(P):
 if p[1]<=.085:W[i,0]=1;continue
 if PRODUCTION:
  # One free folded appendage owns its own contractions. Spatially nearby
  # branches do not acquire each other's pose across an empty passage.
  distances=[]
  for samples in SAMPLE_PATHS:distances.append(float(((samples-p)**2).sum(1).min()))
  owner=int(np.argmin(distances));candidate=np.arange(1+owner*6,7+owner*6);d=((JP[candidate]-p)**2).sum(1)
  root_share=1-smooth((p[1]-.085)/.11);n=3 if root_share>0 else 4;near=candidate[np.argsort(d)[:n]]
  distance=((JP[near]-p)**2).sum(1);weights=np.exp(-(distance-distance.min())/(.19**2));weights=weights/weights.sum()*(1-root_share);W[i,0]=root_share
 else:
  d=((JP[1:]-p)**2).sum(1);near=np.argsort(d)[:4]+1;weights=np.exp(-(d[near-1]-d[near[0]-1])/(.125**2));weights/=weights.sum()
 for n,w in zip(near,weights):W[i,n]=w
if PRODUCTION:
 # A nearest-fold boundary can cross a physically joined crown. Diffuse its
 # influences on the actual surface graph, never through the empty passages.
 # This removes abrupt A/B ownership seams without changing geometry/curves.
 smooth_edges=set()
 for tri in indices.reshape(-1,3):
  for a,b in zip(tri,np.roll(tri,-1)):smooth_edges.add((min(int(a),int(b)),max(int(a),int(b))))
 smooth_edges=np.array(list(smooth_edges),dtype=int);ea=smooth_edges[:,0];eb=smooth_edges[:,1]
 degree=np.bincount(np.r_[ea,eb],minlength=len(P));fixed=P[:,1]<=.085
 for _ in range(160):
  average=np.empty_like(W)
  for k in range(19):average[:,k]=(np.bincount(ea,weights=W[eb,k],minlength=len(P))+np.bincount(eb,weights=W[ea,k],minlength=len(P)))/np.maximum(1,degree)
  W=.5*W+.5*average;W[fixed]=0;W[fixed,0]=1
 # The export contract admits four influences. Normalize the same compact
 # values used by both diagnostic deformation and the actual GLB skin.
 near4=np.argsort(-W,axis=1)[:,:4];keep=np.zeros_like(W,dtype=bool);np.put_along_axis(keep,near4,True,axis=1);W=np.where(keep,W,0);W/=W.sum(1)[:,None]
J=np.argsort(-W,axis=1)[:,:4].astype(np.uint8);weights=np.take_along_axis(W,J,axis=1);weights/=weights.sum(1)[:,None]

def state():return np.zeros((19,6),float)
N=state();R=state();L=state()
def put(S,name,xyz=(0,0,0),rot=(0,0,0)):S[joint_names.index(name)]=[*xyz,*rot]
for k,f in [(1,.20),(2,1),(3,1),(4,.55),(5,.45)]:
 put(R,'fold_B_'+str(k),(-.012*f,-.018*f,.035*f),(-.045*f,.035*f,.025*f))
 put(L,'fold_B_'+str(k),(-.020*f,-.045*f,.080*f),(-.10*f,.05*f,.070*f))
put(R,'fold_B_4',(-.018,-.025,.035),(-.045,.035,.025));put(R,'fold_B_5',(-.025,-.035,.050),(-.055,.045,.050))
put(L,'fold_B_4',(-.115,-.190,.140),(-.180,.10,.20));put(L,'fold_B_5',(-.145,-.230,.175),(-.22,.12,.25))
for k,f in[(1,.2),(2,1),(3,.85),(4,.6),(5,.3)]:
 put(R,'fold_A_'+str(k),(.012*f,.008*f,-.012*f),(.025*f,-.025*f,-.025*f))
 put(L,'fold_A_'+str(k),(.025*f,-.008*f,-.016*f),(.035*f,-.045*f,-.055*f))
 put(R,'fold_C_'+str(k),(-.010*f,-.014*f,.012*f),(-.015*f,.035*f,.025*f))
 put(L,'fold_C_'+str(k),(-.020*f,-.022*f,.025*f),(-.035*f,.055*f,.055*f))
def lerp(a,b,u):return a+(b-a)*u
def pulse(t):
 # Exact finite correction reference: abrupt capture, involuntary hold,
 # partial recoil, attempted correction, then arrested result. No sine bob.
 points=[(0,0),(.045,1.35),(.23,1.35),(.27,.40),(.34,.40),(.39,.90),(.49,.90),(.60,0)]
 if t<=0 or t>=.60:return 0
 for(a,x),(b,y)in zip(points,points[1:]):
  if a<=t<=b:return x+(y-x)*smooth((t-a)/(b-a))
 return 0
def correction(t,starts):return sum(pulse(t-s)for s in starts)
def packet(t,start,end):
 if t<=start or t>=end:return 0
 u=(t-start)/(end-start)
 # A travelling contraction with an extended catch, not an elastic sine bob.
 if u<.30:return smooth(u/.30)
 if u<.56:return 1
 return 1-smooth((u-.56)/.44)
def travelling_wave(u,idle=False):
 S=state();gain=.28 if idle else 1
 for fi,name in enumerate(['B','A','C']):
  # Distal capture travels toward the root; later the base rolls into it.
  phase=[0,.23,.51][fi]
  for k in range(1,6):
   station=k/5;arrival=.08+phase+(1-station)*.27
   contraction=packet(u,arrival,arrival+.35)
   recoil=packet(u,arrival+.32,arrival+.60)
   if idle:
    arrival=[.06,.35,.62][fi]+(1-station)*.08
    contraction=packet(u,arrival,arrival+.22);recoil=0
   curl=(contraction-.30*recoil)*gain*station
   trail=packet(u,arrival+.16,arrival+.54)*gain*station
   j=joint_names.index('fold_'+name+'_'+str(k));side=-1 if name=='A'else 1
   S[j,0]+=-side*.065*curl
   S[j,1]+=-.075*curl+.025*trail
   S[j,2]+=-.045*curl+.065*trail
   S[j,3]+=-.19*curl+.075*trail
   S[j,4]+=side*.080*trail
   S[j,5]+=side*.16*curl
 return S*smooth(u/.045)*(1-smooth((u-.90)/.10))
def chase_wave(u):
 # One forward-directed pressure phrase: the high leading fold commits first,
 # then a broad lower load carries its delayed rear material. It never moves
 # the root, invents a footstep, reaches through a collider or opens a mouth.
 S=state()
 for fi,name in enumerate(['B','A','C']):
  for k in range(1,6):
   f=k/5;j=joint_names.index('fold_'+name+'_'+str(k));delay=[0,.16,.34][fi]
   reach=packet(u,.025+delay+(1-f)*.10,.42+delay+(1-f)*.10)*f
   carry=packet(u,.23+delay*.35,.86+delay*.20)*f
   brace=packet(u,.12+delay*.25,.62+delay*.18)*(1-f*.65)
   if name=='B':
    S[j,1]-=.045*reach+.020*brace
    S[j,2]-=.075*reach-.020*carry
    S[j,3]-=.12*reach
   else:
    side=-1 if name=='A'else 1
    S[j,0]-=side*.036*brace
    S[j,1]-=.025*brace
    S[j,2]+=.025*brace-.025*carry
    S[j,5]+=side*.065*carry
 return S*smooth(u/.035)*(1-smooth((u-.91)/.09))
def motion(name,t):
 if name in ['pressure_hold','pressure_idle']:return N.copy()
 if name in ['pressure_arrest','density_retained']:return R.copy()
 if name=='pressure_load':return lerp(N,L,smooth(t/.5))
 if name=='density_reload':return lerp(R,L,smooth(t/.5))
 if name in ['pressure_advance','pressure_pivot']:
  S=lerp(L,R,smooth((t-.18)/.54))+(L-R)*.17*pulse((t-.04)*1.15)
  if PRODUCTION:S+=travelling_wave(t/.72)*.75
  if name=='pressure_pivot':
   u=t/.72;shear=sin(pi*u)**2
   for k in range(2,6):S[joint_names.index('fold_B_'+str(k)),5]+=.055*shear
  return S
 if name=='density_release':return lerp(R,N,smooth(t/1.5))
 if name in ['pressure_listen','density_listen','density_clamp']:
  base=R if name=='density_listen' else lerp(N,R,smooth(t/.16))
  starts=[.28,1.18]if name!='density_clamp' else[.20,1.08]
  return base+(L-R)*correction(t,starts)
 if name in ['pressure_approach','pressure_limp']:
  u=t/(2.4 if name=='pressure_approach' else 3.4)
  return R+travelling_wave(u) if PRODUCTION else R+(L-R)*.55*correction(u*2.4,[.15,1.12])
 if name=='density_chase':return R+travelling_wave(t/2.4)*.60+chase_wave(t/2.4)
 if name=='density_idle':return R+travelling_wave(t/6.4,True)
 if name=='density_turn':
  S=R.copy();u=t/1.2;v=sin(pi*u)**2
  for k in range(1,6):
   f=k/5;S[joint_names.index('fold_B_'+str(k)),3]+=.04*v*f;S[joint_names.index('fold_A_'+str(k)),2]-=.025*v*f;S[joint_names.index('fold_C_'+str(k)),2]+=.018*v*f
  return S+travelling_wave(u)*.45 if PRODUCTION else S
 raise RuntimeError(name)
def motion_scales(name,t):
 out=np.ones((19,3))
 if not PRODUCTION:return out
 if name in['pressure_approach','pressure_limp','density_chase']:u=t/(3.4 if name=='pressure_limp'else 2.4);gain=1.10 if name=='density_chase'else 1
 elif name in['pressure_advance','pressure_pivot']:u=t/.72;gain=.75
 elif name=='density_turn':u=t/1.2;gain=.45
 elif name=='density_idle':u=t/6.4;gain=.28
 else:return out
 envelope=smooth(u/.045)*(1-smooth((u-.90)/.10))
 for fi,fold in enumerate(['B','A','C']):
  for k in range(1,6):
   station=k/5;arrival=.08+[0,.23,.51][fi]+(1-station)*.27
   if name=='density_idle':arrival=[.06,.35,.62][fi]+(1-station)*.08
   bulge=packet(u,arrival,arrival+(.22 if name=='density_idle'else .35))*gain*envelope*station
   out[joint_names.index('fold_'+fold+'_'+str(k))]=[1+.12*bulge,1-.10*bulge,1+.16*bulge]
 return out
DUR={'pressure_hold':1,'pressure_idle':9.6,'pressure_approach':2.4,'pressure_limp':3.4,'pressure_listen':4.8,'pressure_load':.5,'pressure_advance':.72,'pressure_arrest':1,'pressure_pivot':.72,'density_clamp':2.2,'density_retained':1,'density_release':1.5,'density_turn':1.2,'density_reload':.5,'density_listen':4.8}
if PRODUCTION:
 DUR.pop('density_turn') # Unused study turn replaced within the existing16-clip limit.
 DUR.update({'density_idle':6.4,'density_chase':2.4})
def quat(e):
 x,y,z=e*.5;cx,sx=cos(x),sin(x);cy,sy=cos(y),sin(y);cz,sz=cos(z),sin(z)
 return np.array([sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz])
def rotate(q,p):
 xyz=q[:3];return p+2*np.cross(xyz,np.cross(xyz,p)+q[3]*p)
def deformed(S,scales=None):
 out=np.zeros_like(P)
 if scales is None:scales=np.ones((19,3))
 for k,pos in enumerate(JP):
  ids=np.where((J==k).any(1))[0]
  if not len(ids):continue
  w=W[ids,k,None];q=quat(S[k,3:]);out[ids]+=(rotate(q,(P[ids]-pos)*scales[k])+pos+S[k,:3])*w
 return out

# Topology and actual animated surface measurements are retained with the pack.
edges={}
for tri in indices.reshape(-1,3):
 for a,b in zip(tri,np.roll(tri,-1)):
  key=(min(int(a),int(b)),max(int(a),int(b)));edges[key]=edges.get(key,0)+1
E=np.array(list(edges),dtype=int);edge_lengths=np.linalg.norm(P[E[:,0]]-P[E[:,1]],axis=1);eligible=edge_lengths>.005
if any(n!=2 for n in edges.values()):raise RuntimeError('Density mesh is not closed manifold')
parent=list(range(len(P)))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for a,b in edges:
 a=find(a);b=find(b)
 if a!=b:parent[b]=a
component_count=len({find(i)for i in range(len(P))})
if component_count!=1:raise RuntimeError('Density branches must share one actual continuous root')
chi=len(P)-len(edges)+len(indices)//3;genus=(2-chi)//2
# Open-ended negative passages are intentional. Forcing genus2 made the
# earlier mass read as closed bicycle rims rather than three oppressive folds.
max_strain=0;max_floor_drift=0;max_radial=0;animated_min=np.array([math.inf]*3);animated_max=-animated_min;window_probes=[]
floor_ids=np.where(P[:,1]<=.085)[0]
for name,duration in DUR.items():
 for t in np.linspace(0,duration,25):
  Q=deformed(motion(name,float(t)),motion_scales(name,float(t)));animated_min=np.minimum(animated_min,Q.min(0));animated_max=np.maximum(animated_max,Q.max(0));max_radial=max(max_radial,float(np.hypot(Q[:,0],Q[:,2]).max()));max_floor_drift=max(max_floor_drift,float(np.linalg.norm(Q[floor_ids]-P[floor_ids],axis=1).max()))
  strain=np.linalg.norm(Q[E[:,0]]-Q[E[:,1]],axis=1)/np.maximum(edge_lengths,1e-8);max_strain=max(max_strain,float(strain[eligible].max()))
def depth_hits(Q,x,y):
 T=Q[indices.reshape(-1,3)];A=T[:,0];B0=T[:,1];C=T[:,2];d=(B0[:,1]-C[:,1])*(A[:,0]-C[:,0])+(C[:,0]-B0[:,0])*(A[:,1]-C[:,1]);ok=np.abs(d)>1e-10
 u=np.zeros(len(T));v=u.copy();u[ok]=((B0[ok,1]-C[ok,1])*(x-C[ok,0])+(C[ok,0]-B0[ok,0])*(y-C[ok,1]))/d[ok];v[ok]=((C[ok,1]-A[ok,1])*(x-C[ok,0])+(A[ok,0]-C[ok,0])*(y-C[ok,1]))/d[ok]
 return int(np.count_nonzero(ok&(u>=0)&(v>=0)&(u+v<=1)))
for label,S in [('neutral',N),('loaded',L),('retained',R),('peak-clamp',motion('density_clamp',.25))]:
 Q=deformed(S)
 for y in[.50,.78,1.04]:
  runs=[];start=None;xs=np.linspace(-.60,.60,161)
  for x in xs:
   clear=depth_hits(Q,float(x),y)==0
   if clear and start is None:start=float(x)
   if not clear and start is not None:runs.append([start,float(x)]);start=None
  if start is not None:runs.append([start,float(xs[-1])])
  inner=[r for r in runs if r[0]>-.59 and r[1]<.59];window_probes.append({'pose':label,'heightM':y,'clearRunsM':inner,'widthsM':[r[1]-r[0]for r in inner]})

# Compact GLB; no texture dependency or exporter extensions/sparse morphs.
chunks=[];views=[];access=[];length=0
def buffer(data):
 global length
 raw=data.tobytes();pad=(-length)%4
 if pad:chunks.append(b'\0'*pad);length+=pad
 n=len(views);views.append({'buffer':0,'byteOffset':length,'byteLength':len(raw)});chunks.append(raw);length+=len(raw);return n
def acc(data,kind,component=5126,count=None,**extra):
 widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};data=np.asarray(data,dtype={5126:'<f4',5121:'u1',5125:'<u4'}[component]);n=len(access);access.append({'bufferView':buffer(data),'componentType':component,'count':count if count is not None else data.size//widths[kind],'type':kind,**extra});return n
uv=np.column_stack((np.arctan2(P[:,2],P[:,0])/(2*pi)+.5,P[:,1]/2.05))
attrs={'POSITION':acc(P,'VEC3',min=P.min(0).tolist(),max=P.max(0).tolist()),'NORMAL':acc(normals,'VEC3'),'TEXCOORD_0':acc(uv,'VEC2'),'JOINTS_0':acc(J,'VEC4',5121),'WEIGHTS_0':acc(weights,'VEC4')}
primitive={'attributes':attrs,'indices':acc(indices,'SCALAR',5125),'material':0}
nodes=[{'name':'density_scene','children':[1,2]},{'name':'pressure_body','mesh':0,'skin':0},{'name':'density_root','children':list(range(3,21))}]
nodes.extend({'name':name,'translation':pos.tolist()}for name,pos in zip(joint_names[1:],JP[1:]))
IB=[]
for pos in JP:
 m=np.eye(4);m[:3,3]=-pos;IB.append(m.flatten(order='F'))
skin={'joints':list(range(2,21)),'skeleton':2,'inverseBindMatrices':acc(np.array(IB),'MAT4')}
animations=[]
for name,duration in DUR.items():
 times=np.array([0,duration])if name in['pressure_hold','pressure_idle','pressure_arrest','density_retained']else np.linspace(0,duration,round(duration*50)+1)
 values=np.array([motion(name,float(t))for t in times]);scale_values=np.array([motion_scales(name,float(t))for t in times]);input_acc=acc(times,'SCALAR',min=[0],max=[duration]);samplers=[];channels=[]
 for k in range(1,19):
  channel_data=[('translation',values[:,k,:3]+JP[k],'VEC3'),('rotation',np.array([quat(v)for v in values[:,k,3:]]),'VEC4')]
  if PRODUCTION:channel_data.append(('scale',scale_values[:,k],'VEC3'))
  for path,data,kind in channel_data:
   channels.append({'sampler':len(samplers),'target':{'node':k+2,'path':path}});samplers.append({'input':input_acc,'output':acc(data,kind),'interpolation':'LINEAR'})
 animations.append({'name':name,'samplers':samplers,'channels':channels})
doc={'asset':{'version':'2.0','generator':'The Thick Part / procedural continuous density sculpt'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'skins':[skin],'meshes':[{'name':'pressure_body','primitives':[primitive],'extras':{'targetNames':[],'studyOnly':True,'identity':'The Thick Part'}}],'materials':[{'name':'density_absence','pbrMetallicRoughness':{'baseColorFactor':[.018,.019,.020,1],'metallicFactor':0,'roughnessFactor':.87},'alphaMode':'OPAQUE','extras':{'characterRole':'pressure','studyOnly':True}}],'animations':animations,'accessors':access,'bufferViews':views,'buffers':[{'byteLength':length}],'extras':{'studyOnly':True,'globalReplacement':False,'plantedSupportClaim':False,'forward':'-Z','heightM':2.05}}
production_zones={}
if PRODUCTION:
 T=indices.reshape(-1,3);centres=P[T].mean(1);face_normals=normals[T].mean(1);inward=np.where(centres[:,0]>.04,-1,1)*face_normals[:,0]
 eligible_mask=(np.abs(face_normals[:,1])<.58)&(face_normals[:,2]<.28)&(centres[:,1]>.20)&(inward>.25)
 candidates=np.where(eligible_mask)[0];score=inward[candidates]-.10*np.abs(face_normals[candidates,1])-.05*face_normals[candidates,2]
 count=min(len(candidates),round(len(T)*.08345714285714285));selected=candidates[np.argsort(-score)[:count]];mask=np.zeros(len(T),bool);mask[selected]=True
 doc['materials']=[
  {'name':'hush_density_core','pbrMetallicRoughness':{'baseColorFactor':[.018,.019,.020,1],'metallicFactor':0,'roughnessFactor':.87},'alphaMode':'OPAQUE','extras':{'hushDensityZone':'core'}},
  {'name':'hush_density_return','pbrMetallicRoughness':{'baseColorFactor':[.28,.29,.28,1],'metallicFactor':0,'roughnessFactor':.93},'alphaMode':'OPAQUE','extras':{'hushDensityZone':'return'}},
  {'name':'hush_density_volume','pbrMetallicRoughness':{'baseColorFactor':[.018,.019,.020,1],'metallicFactor':0,'roughnessFactor':.87},'alphaMode':'OPAQUE','extras':{'hushDensityZone':'volume'}},
 ]
 meshes=[];entry_vertices=0
 for name,triangles,material in[('hush_density_core',T[~mask],0),('hush_density_return',T[mask],1),('hush_density_volume',T,2)]:
  used=np.unique(triangles);remapped=np.searchsorted(used,triangles).astype(np.uint32).ravel();entry_vertices+=len(used)
  if name=='hush_density_volume':pr={**primitive,'material':material}
  else:
   at={'POSITION':acc(P[used],'VEC3',min=P[used].min(0).tolist(),max=P[used].max(0).tolist()),'NORMAL':acc(normals[used],'VEC3'),'TEXCOORD_0':acc(uv[used],'VEC2'),'JOINTS_0':acc(J[used],'VEC4',5121),'WEIGHTS_0':acc(weights[used],'VEC4')}
   pr={'attributes':at,'indices':acc(remapped,'SCALAR',5125),'material':material}
  mi=len(meshes);meshes.append({'name':name,'primitives':[pr],'extras':{'targetNames':[],'identity':'The Thick Part','hushDensityZone':name.rsplit('_',1)[-1]}})
  if mi==0:nodes[1]={'name':name,'mesh':0,'skin':0}
  else:ni=len(nodes);nodes.append({'name':name,'mesh':mi,'skin':0});nodes[0]['children'].append(ni)
  production_zones[name]={'vertices':len(used),'triangles':len(triangles)}
 if entry_vertices>50000:raise RuntimeError('Combined three production meshes exceed50000 exported vertices')
 doc['meshes']=meshes;doc['buffers'][0]['byteLength']=length;doc['extras'].update({'studyOnly':False,'globalReplacement':True,'assetIdentity':'hush-density','rootContactPolicy':'Existing gameplay root only; no new reach','materialReturnTriangleFraction':float(mask.mean())})
 production_zones.update({'combinedExportedVertices':entry_vertices,'uniqueSculptVertices':len(P),'returnTriangleFraction':float(mask.mean()),'surfaceSelection':'Deterministic inward-face normal zones,~8.35% of original triangles. Complementary core/return partitions share exact geometric positions, normals and skin values. Fullvolume is a separate render route, not another creature.'})
raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary=b''.join(chunks);binary+=b'\0'*((-len(binary))%4);result=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
path=os.path.join(OUT,'hush-density.glb'if PRODUCTION else'density-study.glb');open(path,'wb').write(result)
seams=[]
for label,a,b in [('hold-load',('pressure_hold',1),('pressure_load',0)),('load-advance',('pressure_load',.5),('pressure_advance',0)),('advance-retained',('pressure_advance',.72),('density_retained',0)),('retained-reload',('density_retained',1),('density_reload',0)),('reload-advance',('density_reload',.5),('pressure_advance',0)),('retained-listen',('density_retained',1),('density_listen',0)),('approach-loop',('pressure_approach',0),('pressure_approach',2.4))]:
 A=deformed(motion(*a));C=deformed(motion(*b));seams.append({'id':label,'maximumVertexDifferenceM':float(np.linalg.norm(A-C,axis=1).max())})
stats={'kind':'hush-density-form-motion-study','identity':'The Thick Part','source':'tools/chunk_surfer/build-hush-density-study.py','concept':'artifacts/hush-mythology-directions/density.png','blender':bpy.app.version_string,'units':'metres','forward':'-Z','mesh':'pressure_body','globalReplacement':False,'bytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'vertices':len(P),'triangles':len(indices)//3,'joints':joint_names,'jointBindPositions':JP.tolist(),'jointAxes':'Every node has explicit game X=lateral,Y=up,Z=depth axes; star-parented to density_root. No humanoid joints.','morphs':0,'restBounds':{'min':P.min(0).tolist(),'max':P.max(0).tolist()},'sampledAnimatedBounds':{'min':animated_min.tolist(),'max':animated_max.tolist()},'topology':{'connectedComponents':component_count,'euler':int(chi),'genus':int(genus),'throughOpenings':int(genus),'openChannels':2,'negativeSpaceType':'Open-ended spaces between independent rounded fold crowns; no closed ring rhythm','boundaryEdges':sum(n==1 for n in edges.values()),'nonManifoldEdges':sum(n>2 for n in edges.values())},'maximumSampledEdgeExtensionRatio':max_strain,'baseContact':{'pinnedBelowHeightM':.085,'maximumRootRelativeBaseDriftM':max_floor_drift,'plantedSupportClaim':False,'meaning':'Base remains fixed relative to the accepted collider root and drags with it. No world-planted feet, no additional reach or contact rules.'},'clips':DUR,'poseStates':{'N':'Neutral fixed density','L':'Loaded inward stack','R':'Retained wrong correction'},'clipEndpoints':{'pressure_hold':'N→N','pressure_idle':'N→N','pressure_arrest':'R→R','density_retained':'R→R','pressure_load':'N→L','density_reload':'R→L','pressure_advance':'L→R','pressure_pivot':'L→R','pressure_listen':'N→R','density_listen':'R→R','density_clamp':'N→R','density_release':'R→N','pressure_approach':'R→R, exact finite correction repeated only while clock advances','pressure_limp':'Retimed approach, not an injury','density_turn':'R→R, local shear only; world heading remains upstream'},'exactCorrectionReference':{'pulseSeconds':.60,'pressureListenStarts':[.28,1.18],'densityClampStarts':[.20,1.08],'description':'Identical piecewise capture/hold/recoil/correction curves, not noise, generic sine breathing or perpetual idle.'},'transitionSeams':seams,'windowDepthProbes':window_probes,'renderContract':{'submit':'Direct props3d pressure instance, character.clip/time/loop only unless deliberate fold-joint override','omit':['legacy humanoid support descriptor','old chest/head/clavicle override map','cue-zero morph overrides'],'material':'Current pressure negative mass and radiance through actual acquisition and final dither. Grey material is diagnostic only.'},'limits':['Form/motion study only; no global replacement or gameplay-rule change.','No new AI knowledge: root-owned accepted sound/navigation state must trigger and orient the finite clips.','Clips contain no root displacement or world yaw. Root/heading/contact remain gameplay authorities.','Source travel is density traction, not physically planted human gait.','No self-collision, native performance, fear or human animation review implied by finite skin/topology checks.']}
if PRODUCTION:
 controls=[]
 for i,name in enumerate(joint_names):
  if i==0:continue
  group=(i-1)//6;k=(i-1)%6;lo=1+group*6;hi=lo+5;tangent=JP[min(hi,i+1)]-JP[max(lo,i-1)];tangent/=max(1e-9,np.linalg.norm(tangent));curl_axis=np.cross(tangent,[0,0,-1]);curl_axis/=max(1e-9,np.linalg.norm(curl_axis))
  controls.append({'name':name,'fold':['A','B','C'][group],'station':k,'normalizedStation':k/5,'pivotM':JP[i].tolist(),'tangentAxis':tangent.tolist(),'curlAxis':curl_axis.tolist(),'splayAxis':[0,0,1],'rootPin':k==0,'suggestedSecondaryAdditive':{'rotationRadians':.085*(k/5),'translationM':.04*(k/5)},'meaning':'Authored travelling curls already present. Secondary runtime wave should fade down against active clip, use captured travel/attention only, and omit root/station0.'})
 stats.update({'kind':'production-hush-density','globalReplacement':True,'asset':'public/assets/hush-density.glb','meshes':production_zones,'mesh':'hush_density_core / hush_density_return / hush_density_volume','geometryVertexBudgetMeaning':'Unique sculpt vertices and compact core/return/fullvolume exported entry vertices are both reported. Combined exported vertices<=50000.','rigControls':controls,'nativeWidthM':.90,'recommendedDefaultScale':[1,1,1],'runtimeWidthPolicy':'Do not reinterpret legacy actor.widthM=.68 as mandatory default squeeze. Door squeezing requires an observed clearance rule; ordinary default native width is .90m.','clips':DUR,'sourceHumanReferencePreserved':'public/assets/pressure-character.glb','idlePolicy':'density_idle is one finite6.4s asynchronous travelling packet,R→R. pressure_idle remains a static compatibility alias. Do not loop idle continuously or synchronize all folds.','locomotionPolicy':'pressure_approach/limp are closedR→R tip-capture→travellingcontraction→drag/release cycles, phase owned by accepted displacement and capped at2cycles/s. pressure_advance adds the same finite wave toL→R. No biped gait, foot IK or root translation.','productionCredit':'Entirely original procedural nonhuman geometry and authored spatial rig/curves. No MakeHuman geometry or human textures used.','limits':['Existing gameplay root/contact/hearing/audio contracts remain authoritative.','Global integration is authorized; native render, collision-clearance and human fear acceptance remain separate validation.','The base is root-relative traction, not world-planted feet.','Strong folds can intentionally overlap in depth; sampled strain is not proof of all-time self-collision absence.']})
 stats['clipEndpoints'].pop('density_turn',None)
 stats['clipEndpoints']['density_chase']='R→R, finite accepted-displacement launch/carry/reach phrase; no root travel'
 stats['modelRevision']='density-raked-load-2'
 stats['modelConstruction']='Three unequal solid cupped folds: low resisting brace, high forward-raked leading mass and shorter rear return; one continuous low load bridge and two open-ended channels. Same native rest envelope and root.'
 stats['chasePhrase']='density_chase: finite distal commitment, broad lower loading, delayed rear carry and retained return; no baked root travel or additional contact reach.'
 stats['maximumSampledRadialEnvelopeM']=max_radial
 stats['nativeDimensionsM']={'width':.90,'height':2.05,'depth':.70}
 stats['authoredScaleRange']=[.90,1.16]
 stats['clipEndpoints']['density_idle']='R→R, finite asynchronous curl packet; do not auto-loop'
 stats['poseJointDeltas']={'columns':['dx','dy','dz','eulerX','eulerY','eulerZ'],'N':N.tolist(),'L':L.tolist(),'R':R.tolist()}
 open(os.path.join(OUT,'CREDITS.json'),'w').write(json.dumps({'asset':'public/assets/hush-density.glb','identity':'The Thick Part','source':'tools/chunk_surfer/build-hush-density-study.py --production','anatomicalSources':[],'geometry':'Original procedural solid-fold sculpture, continuous remeshed geometry, authored19-control skin and finite tentacular/pressure deformation.','conceptReference':'artifacts/hush-mythology-directions/density.png; generated design reference, not projected onto geometry.','license':'Project-authored original assets; project licensing applies.','priorHumanAsset':'public/assets/pressure-character.glb remains unchanged for explicitly borrowed human references.'},indent=2)+'\n')
open(os.path.join(OUT,'stats.json'if PRODUCTION else'density-study.stats.json'),'w').write(json.dumps(stats,indent=2)+'\n')
if PRODUCTION:open(os.path.join(OUT,'hush-density.stats.json'),'w').write(json.dumps(stats,indent=2)+'\n')
print(json.dumps({k:stats[k]for k in['sha256','bytes','vertices','triangles','topology','restBounds','sampledAnimatedBounds','maximumSampledEdgeExtensionRatio','baseContact','transitionSeams','windowDepthProbes']},indent=2),flush=True)
