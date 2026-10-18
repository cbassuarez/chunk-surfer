"""Isolated municipal winter-gallery assets; Blender source is editable.
Runtime axes X/Y-up/Z are stored in Blender as (x,-z,y). Flat root meshes only.
No shared pack, roof, floorplan, narrative, socket or eye geometry is written.
"""
from __future__ import annotations
import argparse, hashlib, json, math, struct, sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
VOID=(-6.0,4.0,-7.0,6.0)  # world79..89,8..21 relative85,15
GUARD=.16
SIDE=512;COLS=4;ROWS=4
PALETTE={
 "mineral":((.53,.51,.45),.83,.0),
 "mineralCut":((.43,.425,.39),.96,.0),
 "stoneCap":((.60,.58,.51),.67,.0),
 "iron":((.065,.075,.070),.60,.42),
 "hardwood":((.175,.105,.052),.42,.0),
 "parquet":((.205,.140,.075),.72,.0),
 "dado":((.115,.155,.135),.76,.0),
 "plaster":((.49,.48,.43),.94,.0),
 "ceramic":((.205,.225,.205),.35,.0),
 "soil":((.065,.047,.030),.97,.0),
 "leaf":((.085,.145,.100),.77,.0),
 "deadLeaf":((.205,.145,.072),.94,.0),
 "felt":((.085,.105,.065),.91,.0),
 "waterTide":((.155,.106,.058),.92,.0),
 "shelteredWood":((.220,.150,.080),.78,.0),
 "oldBronze":((.160,.125,.070),.82,.62),
}
KEYS=list(PALETTE);MAT=None;INPUTS={}

def encode(v):return 12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055
def uv(role,p):
 i=KEYS.index(role);return((i%COLS+.025+.95*p[0])/COLS,(i//COLS+.025+.95*p[1])/ROWS)

class Mesh:
 def __init__(self,name):self.name=name;self.v=[];self.f=[];self.uv=[];self.s=[]
 def face(self,points,role='mineral',smooth=False,coords=None):
  start=len(self.v);self.v.extend((x,-z,y)for x,y,z in points);self.f.append(list(range(start,start+len(points))))
  if coords is None:coords=[(0,0),(1,0),(1,1),(0,1)] if len(points)==4 else[(.5+.46*math.cos(i*math.tau/len(points)),.5+.46*math.sin(i*math.tau/len(points)))for i in range(len(points))]
  self.uv.append([uv(role,p)for p in coords]);self.s.append(smooth)
 def box(self,c,size,role='mineral'):
  x,y,z=c;a,b,d=[v/2 for v in size];p=[(x-a,y-b,z-d),(x+a,y-b,z-d),(x+a,y+b,z-d),(x-a,y+b,z-d),(x-a,y-b,z+d),(x+a,y-b,z+d),(x+a,y+b,z+d),(x-a,y+b,z+d)]
  for f in[(0,1,2,3),(5,4,7,6),(4,0,3,7),(1,5,6,2),(3,2,6,7),(4,5,1,0)]:self.face([p[i]for i in reversed(f)],role)
 def rotate_y(self,angle):
  c=math.cos(angle);s=math.sin(angle)
  self.v=[(c*x+s*by,-s*x+c*by,y)for x,by,y in self.v]
 def append(self,other,offset=(0,0,0)):
  start=len(self.v);x,y,z=offset;self.v.extend((a+x,b-z,c+y)for a,b,c in other.v);self.f.extend([[i+start for i in f]for f in other.f]);self.uv.extend([list(v)for v in other.uv]);self.s.extend(other.s)
 def tube(self,path,radius,role='iron',sides=6):
  closed=len(path)>3 and(Vector(path[0])-Vector(path[-1])).length<1e-8
  if closed:path=path[:-1]
  rings=[];previous_a=None
  for i,p in enumerate(path):
   t=Vector(path[(i+1)%len(path)])-Vector(path[(i-1)%len(path)])if closed else Vector(path[min(i+1,len(path)-1)])-Vector(path[max(0,i-1)]);t.normalize()
   if previous_a is None:
    seed=Vector((0,0,1))if abs(t.z)<.9 else Vector((1,0,0));a=t.cross(seed).normalized()
   else:a=(previous_a-t*previous_a.dot(t)).normalized()
   b=t.cross(a).normalized();previous_a=a
   rings.append([tuple(Vector(p)+radius*(a*math.cos(j*math.tau/sides)+b*math.sin(j*math.tau/sides)))for j in range(sides)])
  if closed:rings.append(rings[0])
  for a,b in zip(rings,rings[1:]):
   for i in range(sides):j=(i+1)%sides;self.face([a[i],a[j],b[j],b[i]],role,True)
  if not closed:self.face(list(reversed(rings[0])),role);self.face(rings[-1],role)
 def finish(self,extras=None):
  d=bpy.data.meshes.new(self.name);d.from_pydata(self.v,[],self.f);d.materials.append(MAT);d.update();layer=d.uv_layers.new(name='UVMap')
  for f,us,smooth in zip(d.polygons,self.uv,self.s):
   f.use_smooth=smooth
   for k,p in zip(f.loop_indices,us):layer.data[k].uv=p
  bm=bmesh.new();bm.from_mesh(d);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
  bmesh.ops.triangulate(bm,faces=list(bm.faces))
  invalid=[f for f in bm.faces if f.calc_area()<1e-11]
  if invalid:bmesh.ops.delete(bm,geom=invalid,context='FACES_ONLY')
  bm.to_mesh(d);bm.free();d.update()
  o=bpy.data.objects.new(self.name,d);bpy.context.scene.collection.objects.link(o)
  if extras:o['galleryContract']=json.dumps(extras,sort_keys=True)
  return o

def material():
 images=[]
 for name in['albedo','orm','normal']:
  im=bpy.data.images.new('academic-gallery-'+name,width=SIDE,height=SIDE,alpha=True);im.colorspace_settings.name='sRGB'if name=='albedo'else'Non-Color';images.append(im)
 pixels=[[0.0]*(SIDE*SIDE*4)for _ in range(3)]
 tw=SIDE//COLS;th=SIDE//ROWS
 for y in range(SIDE):
  row=y//th;v=(y%th)/(th-1)
  for x in range(SIDE):
   col=x//tw;u=(x%tw)/(tw-1);key=KEYS[min(len(KEYS)-1,row*COLS+col)];rgb,rough,metal=PALETTE[key]
   variation=.985+.015*math.sin(u*5.1+v*2.0)
   if key in('hardwood','parquet','shelteredWood'):
    # Broad dry grain; joints are low contrast, not dark gutters or relief.
    variation*=.965+.035*math.sin(u*27+math.sin(v*4)*.35)
    if key=='parquet':
     seam=min((u*4)%1,1-(u*4)%1);variation*=.97 if seam<.016 else 1
   if key in('mineral','stoneCap'):
    vein=abs(math.sin((u*1.6+v*.95+.21*math.sin(v*5))*math.pi))
    if vein<.055:variation*=.72;rough=min(1,rough+.07)
   at=(y*SIDE+x)*4
   pixels[0][at:at+4]=[encode(max(0,min(1,c*variation)))for c in rgb]+[1]
   pixels[1][at:at+4]=[1,rough,metal,1]
   pixels[2][at:at+4]=[.5,.5,1,1]
 for im,p in zip(images,pixels):im.pixels.foreach_set(p);im.pack()
 m=bpy.data.materials.new('gallery.municipal-fabric');m.use_nodes=True;n=m.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface'])
 p.inputs['Metallic'].default_value=1;p.inputs['Roughness'].default_value=1
 tex=[]
 for im in images:t=n.new('ShaderNodeTexImage');t.image=im;t.interpolation='Linear';tex.append(t)
 m.node_tree.links.new(tex[0].outputs['Color'],p.inputs['Base Color']);sep=n.new('ShaderNodeSeparateColor');m.node_tree.links.new(tex[1].outputs['Color'],sep.inputs['Color']);m.node_tree.links.new(sep.outputs['Green'],p.inputs['Roughness']);m.node_tree.links.new(sep.outputs['Blue'],p.inputs['Metallic']);normal=n.new('ShaderNodeNormalMap');m.node_tree.links.new(tex[2].outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
 return m

def turned(m,x,z,profile,role='hardwood',sides=8):
 rings=[[(x+r*math.cos(i*math.tau/sides),y,z+r*math.sin(i*math.tau/sides))for i in range(sides)]for y,r in profile]
 for a,b in zip(rings,rings[1:]):
  for k in range(sides):j=(k+1)%sides;m.face([a[k],b[k],b[j],a[j]],role,True)
 m.face(rings[0],role);m.face(list(reversed(rings[-1])),role)

def bevel_block(m,c,size,bevel=.02,role='hardwood',smooth=False):
 x,y,z=c;w,h,d=[v/2 for v in size];b=min(bevel,w*.7,h*.7,d*.7);rings=[]
 for yy,inset in[(-h,b),(-h+b,0),(h-b,0),(h,b)]:
  a=w-inset;t=d-inset;r=min(b,a*.6,t*.6)
  rings.append([(x+u,y+yy,z+v)for u,v in[(-a+r,-t),(a-r,-t),(a,-t+r),(a,t-r),(a-r,t),(-a+r,t),(-a,t-r),(-a,-t+r)]])
 for a,b in zip(rings,rings[1:]):
  for k in range(8):j=(k+1)%8;m.face([a[k],b[k],b[j],a[j]],role,smooth)
 m.face(rings[0],role);m.face(list(reversed(rings[-1])),role,smooth)

def planar_ring(m,at,radius,rod=.011,role='iron',segments=8):
 m.tube([at(radius*math.cos(i*math.tau/segments),radius*math.sin(i*math.tau/segments),0)for i in range(segments+1)],rod,role,4)

def relief_leaf(m,at,length=.16,width=.055,role='iron',angle=0):
 # A broad folded strap leaf. Real front/back volume, no heraldic icon.
 c=math.cos(angle);s=math.sin(angle)
 def p(a,b,d):return at(a*c-b*s,a*s+b*c,d)
 edge=[p(-length*.5,0,0),p(0,width*.5,0),p(length*.5,0,0),p(0,-width*.5,0)];front=p(0,0,.015);back=p(0,0,-.007)
 for i in range(4):j=(i+1)%4;m.face([edge[i],front,edge[j]],role);m.face([edge[j],back,edge[i]],role)

def rosette(m,at,radius=.10,role='iron'):
 # Four folded leaves are tied to a central boss, not floating badges.
 for angle in[0,math.pi/2,math.pi,3*math.pi/2]:
  c=math.cos(angle);s=math.sin(angle)
  relief_leaf(m,lambda a,b,d,c=c,s=s:at(a*c-b*s+radius*.43*c,a*s+b*c+radius*.43*s,d),radius*.88,radius*.46,role)
 m.tube([at(0,0,-.018),at(0,0,.025)],radius*.25,'oldBronze'if role=='iron'else role,6)

def read_glb(file,name,material_name=None):
 raw=Path(file).read_bytes();INPUTS[str(Path(file).relative_to(ROOT))]=hashlib.sha256(raw).hexdigest();cursor=12;doc=None;binary=None
 while cursor<len(raw):
  size,kind=struct.unpack_from('<II',raw,cursor);data=raw[cursor+8:cursor+8+size]
  if kind==0x4e4f534a:doc=json.loads(data)
  elif kind==0x004e4942:binary=data
  cursor+=size+8
 def acc(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];n={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];unit=struct.calcsize(fmt);stride=v.get('byteStride',n*unit);start=v.get('byteOffset',0)+a.get('byteOffset',0)
  return[struct.unpack_from('<'+fmt*n,binary,start+k*stride)for k in range(a['count'])]
 target=next(m for m in doc['meshes']if m['name']==name);tris=[]
 for p in target['primitives']:
  if material_name and doc['materials'][p['material']]['name']!=material_name:continue
  positions=acc(p['attributes']['POSITION']);indices=[i[0]for i in acc(p['indices'])]
  tris.extend([[positions[indices[i+k]]for k in range(3)]for i in range(0,len(indices),3)])
 return tris

def split_polygon(poly,axis,bound,greater):
 inside=[];outside=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  ia=a[axis]>=bound-1e-10 if greater else a[axis]<=bound+1e-10
  ib=b[axis]>=bound-1e-10 if greater else b[axis]<=bound+1e-10
  (inside if ia else outside).append(a)
  if ia!=ib:
   t=(bound-a[axis])/(b[axis]-a[axis]);p=tuple(a[k]+(b[k]-a[k])*t for k in range(3));inside.append(p);outside.append(p)
 return inside,outside

def outside_void(triangle):
 current=list(triangle);pieces=[]
 for axis,bound,greater in[(0,VOID[0],True),(0,VOID[1],False),(2,VOID[2],True),(2,VOID[3],False)]:
  if not current:break
  current,outer=split_polygon(current,axis,bound,greater)
  if len(outer)>=3:pieces.append(outer)
 return pieces

def normalize_closed_source(triangles):
 # Face/vertex-normal agreement cannot reveal an entirely inward shell.
 # Normalize only independently closed imported components by signed volume.
 point_ids={};faces=[];point_faces={}
 for tri in triangles:
  face=[]
  for p in tri:
   key=tuple(round(v,7)for v in p)
   if key not in point_ids:point_ids[key]=len(point_ids)
   v=point_ids[key];face.append(v);point_faces.setdefault(v,[]).append(len(faces))
  faces.append(face)
 seen=set();out=[];review=[]
 for seed in range(len(faces)):
  if seed in seen:continue
  pending=[seed];component=[];seen.add(seed)
  while pending:
   f=pending.pop();component.append(f)
   for v in faces[f]:
    for other in point_faces[v]:
     if other not in seen:seen.add(other);pending.append(other)
  edges={};volume=0;points=[]
  for f in component:
   a,b,c=triangles[f];volume+=Vector(a).dot(Vector(b).cross(Vector(c)))/6;points.extend(triangles[f])
   face=faces[f]
   for u,v in zip(face,face[1:]+face[:1]):key=tuple(sorted((u,v)));edges[key]=edges.get(key,0)+1
  closed=all(n==2 for n in edges.values());reverse=closed and volume<-1e-8
  for f in component:out.append(list(reversed(triangles[f]))if reverse else triangles[f])
  review.append({'triangles':len(component),'closed':closed,'signedVolumeBeforeM3':volume,'reversed':reverse,'signedVolumeAfterM3':-volume if reverse else volume,'bounds':{'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)]}})
 return out,review

def crown(m,path,y):
 # Ellis3.5x3in section adapted to a broad crown/narrow mounting neck.
 profile=[(-.026,-.038),(.026,-.038),(.026,-.024),(.0445,-.012),(.0445,.007),(.035,.028),(.016,.038),(-.016,.038),(-.035,.028),(-.0445,.007),(-.0445,-.012),(-.026,-.024)]
 for i in range(len(path)):
  a=path[i];b=path[(i+1)%len(path)];prev=path[(i-1)%len(path)];nxt=path[(i+2)%len(path)]
  def ring(p,t):
   dx,dz=t;length=math.hypot(dx,dz);nx,nz=-dz/length,dx/length
   return[(p[0]+nx*w,y+h,p[1]+nz*w)for w,h in profile]
  r0=ring(a,(b[0]-prev[0],b[1]-prev[1]));r1=ring(b,(nxt[0]-a[0],nxt[1]-a[1]))
  for k in range(len(profile)):j=(k+1)%len(profile);m.face([r0[k],r1[k],r1[j],r0[j]],'hardwood',True)

def structure():
 m=Mesh('gallery_atrium_structure');original,component_review=normalize_closed_source(read_glb(ROOT/'public/assets/conservatory-props.glb','academic_atrium_structure','academic plaster'));retained=0
 for tri in original:
  for poly in outside_void(tri):m.face(poly,'mineral');retained+=max(0,len(poly)-2)
 xl,xr,zl,zr=VOID;guard=(xl-GUARD,xr+GUARD,zl-GUARD,zr+GUARD)
 # Supported mineral fascia lies entirely outside the compiled void.
 for x in[xr+.055]:m.box((x,-.16,(zl+zr)/2),(.11,.32,zr-zl),'mineralCut')
 for z in[zl-.055]:m.box(((xl+xr)/2,-.16,z),(xr-xl,.32,.11),'mineralCut')
 # Old retained west/south bands stopped0.5m short of compiled navigation.
 # Full-depth bearing ribbons connect the slab to the real guard edge;
 # replacing those two thin fascia boxes avoids coplanar duplicate skins.
 m.box((xl-.25,-.16,(zl+zr)/2),(.50,.32,zr-zl),'mineralCut')
 m.box(((xl+xr)/2,-.16,zr+.25),(xr-xl,.32,.50),'mineralCut')
 # Only these three column bases are exposed in actual floor0 air spans.
 # Other retained feet are embedded in the native walls and stay untouched.
 exposed_feet=[(-11.4,6.5),(11.4,-6.5),(11.4,6.5)]
 for x,z in exposed_feet:m.box((x,-9.85,z),(.42,.30,.42),'mineralCut')
 gx0,gx1,gz0,gz1=guard;path=[(gx0,gz0),(gx1,gz0),(gx1,gz1),(gx0,gz1)];crown(m,path,1.17)
 for a,b in zip(path,path[1:]+path[:1]):
  dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz);count=math.ceil(length/2.4);ux=dx/length;uz=dz/length;nx=-uz;nz=ux;bay=length/count
  def at(s,y,d=0):return(a[0]+ux*s+nx*d,y,a[1]+uz*s+nz*d)
  m.tube([at(0,.145),at(length,.145)],.020,'iron',6)
  m.tube([at(0,1.075),at(length,1.075)],.016,'iron',4)
  for j in range(count):
   s=j*bay;x,z=at(s,0)[0],at(s,0)[2]
   m.box((x,.018,z),(.18,.036,.18),'mineralCut')
   turned(m,x,z,[(.036,.060),(.075,.060),(.095,.043),(.17,.043),(.21,.028),(.96,.028),(1.005,.044),(1.055,.044),(1.085,.032),(1.135,.032)],'iron',6)
   for yy in[.15,1.025]:m.tube([at(s,yy-.012),at(s,yy+.012)],.046,'oldBronze',6)
   center=s+bay*.5;spread=bay*.43
   # Wide framed panels: paired structural S stems and four C returns.
   # Major22–26mm rods and central ties remain readable through dither.
   for mirror in[-1,1]:
    curve=[]
    for k in range(9):
     f=k/8;ss=center+mirror*(.12+spread*(.5+.5*math.cos(math.pi*f)))
     curve.append(at(ss,.16+.97*f))
    m.tube(curve,.013,'iron',4);stem=list(curve)
    for high in[False,True]:
     curve=[]
     for k in range(8):
      theta=(-.35+k/7*1.72)*math.pi
      ss=center+mirror*(spread*.55+math.cos(theta)*spread*.30)
      yy=(.83 if high else .41)+math.sin(theta)*.17
      curve.append(at(ss,yy))
     m.tube(curve,.010,'iron',4)
     nearest=min(stem,key=lambda p:(Vector(p)-Vector(curve[0])).length)
     m.tube([curve[0],nearest],.011,'iron',4)
   # The ring is carried by a central vertical tie, connected to both rails.
   m.tube([at(center,.145),at(center,1.135)],.010,'iron',4)
   planar_ring(m,lambda u,v,d:at(center-u,.635+v,-d),.145,.012,'iron',10)
   rosette(m,lambda u,v,d:at(center-u,.635+v,-d),.105,'iron')
   for mirror in[-1,1]:
    relief_leaf(m,lambda u,v,d,mirror=mirror:at(center+mirror*(spread*.71)-u,.98+v,-d),.18,.065,'iron',mirror*.7)
  # Paired underside corner scrolls spring into the shaped timber crown.
  for side in[0,1]:
   start=.18 if side==0 else length-.18;sign=1 if side==0 else-1
   m.tube([at(start+sign*.42,1.13),at(start+sign*.28,.99),at(start+sign*.05,.99),at(start,1.13)],.015,'iron',4)
 return m.finish({'anchorWorld':[85,10,15],'voidWorld':[79,89,8,21],'guardSetbackM':GUARD,'footplateM':.18,'handrailSectionM':[.089,.076],'ornament':'wide pairedC/S panels, attached ring/rosette ties, forged collars and corner underscrolls; no monogram','majorRodDiameterM':.026,'bearingRibbonsWorld':{'west':[78.5,79,8,21],'south':[79,89,21,21.5],'bottomTopY':[-.32,0]},'exposedColumnFeet':{'localXZ':exposed_feet,'bottomTopY':[-10,-9.7],'footprintM':[.42,.42],'otherFiveEmbedded':'unchanged'},'retainedOutsideVoidTriangles':retained,'sourceComponentWinding':component_review,'originalSource':'academic_atrium_structure academic plaster primitive; bronze removed; independently closed inward shells corrected','roofUntouched':True})

def floor():
 m=Mesh('gallery_floor');rects=[(-12,VOID[0],-13,13),(VOID[1],12,-13,13),(VOID[0],VOID[1],-13,VOID[2]),(VOID[0],VOID[1],VOID[3],13)]
 for x0,x1,z0,z1 in rects:
  nx=math.ceil((x1-x0)/.80);nz=math.ceil((z1-z0)/.80)
  for i in range(nx):
   for j in range(nz):
    a=x0+(x1-x0)*i/nx;b=x0+(x1-x0)*(i+1)/nx;c=z0+(z1-z0)*j/nz;d=z0+(z1-z0)*(j+1)/nz
    coords=[(0,0),(0,1),(1,1),(1,0)]
    if(i+j)%2:coords=[(v,1-u)for u,v in coords]
    m.face([(a,.004,c),(a,.004,d),(b,.004,d),(b,.004,c)],'parquet',coords=coords)
 # Darker fitted timber border follows the actual void, never across it.
 for x in[VOID[0]-.18,VOID[1]+.18]:m.box((x,.006,(VOID[2]+VOID[3])/2),(.20,.008,VOID[3]-VOID[2]+.56),'hardwood')
 for z in[VOID[2]-.18,VOID[3]+.18]:m.box(((VOID[0]+VOID[1])/2,.006,z),(VOID[1]-VOID[0]+.16,.008,.20),'hardwood')
 # A specific roof-seam trace at the inner west edge, not an all-over grunge.
 m.face([(-6.69,.0055,2.0),(-6.72,.0055,2.6),(-6.63,.0055,3.1),(-6.68,.0055,3.9),(-6.57,.0055,5.5),(-6.37,.0055,5.35),(-6.42,.0055,4.1),(-6.35,.0055,3.25),(-6.46,.0055,2.4),(-6.43,.0055,2.05)],'waterTide')
 # Drier timber beneath the existing proof bench footprint(world74,14).
 m.face([(-11.40,.0052,-2.20),(-11.40,.0052,.20),(-10.70,.0052,.20),(-10.70,.0052,-2.20)],'shelteredWood')
 # Small fallen broad leaves belong only to the proof's south planter.
 for dx,dz,angle in[(-.46,.26,.3),(.39,.24,1.1),(.22,-.49,2.0),(-.38,-.29,2.8),(.54,-.32,.6),(-.14,.54,1.8)]:
  x=-11+dx;z=4+dz;c=math.cos(angle);s=math.sin(angle);outline=[]
  for a,b in[(-.10,0),(-.04,.035),(.055,.043),(.125,0),(.055,-.043),(-.04,-.035)]:outline.append((x+a*c-b*s,.0065+(.004 if a>0 else 0),z+a*s+b*c))
  m.face(outline,'deadLeaf')
 return m.finish({'anchorWorld':[85,10,15],'voidWorld':[79,89,8,21],'maxWalkingOverlayM':.0105,'material':'restrained dry broad parquet; shallow low-contrast joints','causalWear':{'waterTideWorld':[78.28,78.65,17,20.5],'shelteredBenchWorld':[74,14],'fallenLeafPlanterWorld':[74,19],'noUniformGrunge':True},'collisionChange':False})

def wall():
 m=Mesh('gallery_wall_bay')
 # Quiet shallow backing covers the native high-frequency wall material.
 # Its front is only8mm off the existing plane, behind the bearing trim.
 m.box((.004,4.08,0),(.008,5.76,4),'plaster')
 m.box((.022,.60,0),(.044,1.20,4),'dado');m.box((.040,.085,0),(.080,.17,4),'hardwood')
 m.box((.045,6.425,0),(.09,.28,4),'mineral')
 for x,y,w,h in[(.061,1.16,.122,.08),(.080,1.23,.16,.055),(.060,6.58,.12,.09),(.09,6.70,.18,.12),(.13,6.81,.26,.10),(.16,6.91,.32,.15)]:m.box((x,y,0),(w,h,4),'stoneCap')
 # One leading pilaster per4m repeat; the next bay supplies the trailing one.
 for x,y,w,h,depth in[(.10,.16,.20,.32,.56),(.061,3.42,.122,6.20,.38),(.13,6.55,.26,.20,.58),(.16,6.73,.32,.16,.66),(.13,6.89,.26,.12,.62)]:m.box((x,y,-2),(w,h,depth),'mineral')
 for dz in[-.13,-.065,0,.065,.13]:m.tube([(.142,.40,-2+dz),(.142,6.35,-2+dz)],.018,'stoneCap',6)
 # Folded acanthus-like capital leaves share the scroll/rosette grammar.
 for dz,angle in[(-.19,-.6),(-.095,-.3),(0,0),(.095,.3),(.19,.6)]:
  relief_leaf(m,lambda a,b,d,dz=dz:(.18+d,6.40+b,-2+dz-a),.29,.095,'mineral',angle)
 for dz in[-.22,.22]:
  planar_ring(m,lambda a,b,d,dz=dz:(.19+d,6.58+b,-2+dz-a),.070,.016,'stoneCap',8)
 for z in[-1.28,0,1.28]:
  m.box((.060,.64,z),(.040,.77,1.02),'dado')
  for yy in[.23,1.04]:bevel_block(m,(.090,yy,z),(.07,.07,1.14),.012,'hardwood')
  for zz in[z-.54,z+.54]:bevel_block(m,(.090,.635,zz),(.07,.85,.07),.012,'hardwood')
  for yy in[.29,.98]:m.box((.103,yy,z),(.025,.022,.98),'oldBronze')
  rosette(m,lambda a,b,d,z=z:(.084+d,.64+b,z-a),.075,'dado')
  rosette(m,lambda a,b,d,z=z:(.09+d,6.43+b,z-a),.095,'stoneCap')
 m.rotate_y(math.pi/2)
 return m.finish({'origin':'wall planeZ0, floorY0, bay centreX0','faces':'+Z','repeatAlongX':4,'pilasterAtLocalX':2,'wallPlaneToFrontM':.32,'ornament':'raised paneldado, flutedpilaster, foldedleaf capital, rosettefrieze and steppedcornice; quiet upperfield','lore':'none; no plaque, face, text or inscription'})

def plinth():
 m=Mesh('gallery_bust_plinth');profile=[(0,.29),(.020,.31),(.065,.31),(.090,.295),(.115,.295),(.140,.27),(.17,.27),(.195,.245),(.23,.24),(.85,.235),(.885,.245),(.915,.245),(.94,.265),(.97,.265),(1.00,.28),(1.035,.28),(1.065,.29),(1.11,.29)]
 rings=[]
 for y,r in profile:
  bevel=.018;rings.append([(-r+bevel,y,-r),(r-bevel,y,-r),(r,y,-r+bevel),(r,y,r-bevel),(r-bevel,y,r),(-r+bevel,y,r),(-r,y,r-bevel),(-r,y,-r+bevel)])
 for i,(a,b)in enumerate(zip(rings,rings[1:])):
  for k in range(8):j=(k+1)%8;m.face([a[k],b[k],b[j],a[j]],'stoneCap'if i<3 or i>=11 else'mineral')
 m.face(rings[0],'mineralCut');m.face(list(reversed(rings[-1])),'stoneCap');m.box((0,1.109,0),(.345,.002,.345),'felt')
 # Recessed fixing plugs are construction detail; there is no display plaque.
 for x in[-.19,.19]:
  m.box((x,.145,-.284),(.045,.045,.008),'mineralCut')
  m.tube([(x,.145,-.289),(x,.145,-.294)],.015,'oldBronze',6)
 for z in[-.243,.243]:
  for x in[-.155,.155]:m.tube([(x,.27,z),(x,.82,z)],.013,'stoneCap',6)
 rosette(m,lambda a,b,d:(-a,.55+b,-.246-d),.09,'mineralCut')
 return m.finish({'seatTopM':1.11,'footprintM':[.62,.62],'existingBustElevationM':1.10,'baseContact':'Existing10mm seating overlap retained','fixings':'two restrained30mm old bronze base plugs; no repeated damage decal','noPlaque':True})

def bench():
 m=Mesh('gallery_bench')
 for z in[-1.07,1.07]:
  # Continuous rolled arm grows into its supported front leg.
  m.tube([(.25,.025,z),(.22,.15,z),(.20,.30,z),(.25,.44,z),(.28,.59,z),(.23,.70,z),(.09,.73,z),(-.11,.76,z),(-.29,.88,z)],.034,'hardwood',6)
  m.tube([(-.26,.025,z),(-.29,.17,z),(-.25,.35,z),(-.27,.48,z),(-.29,.83,z),(-.29,1.02,z)],.034,'hardwood',6)
  m.tube([(.23,.70,z),(.12,.62,z),(.20,.53,z),(.25,.44,z)],.022,'hardwood',4)
  m.tube([(-.15,.575,z*.88),(.20,.575,z*.88)],.088,'felt',10)
  rosette(m,lambda a,b,d,z=z:(.28+d,.44+b,z-a),.075,'hardwood')
 bevel_block(m,(0,.370,0),(.60,.105,2.25),.025,'hardwood')
 bevel_block(m,(.005,.4425,0),(.55,.105,2.035),.043,'felt',True)
 bevel_block(m,(-.232,.805,0),(.145,.49,2.015),.055,'felt',True)
 # Broad upholstered field; richness is at the carved perimeter, not dots.
 crest=[]
 for k in range(13):
  z=-1.095+k/12*2.19;y=1.075+.058*math.cos(z/1.095*math.pi);crest.append((-.29,y,z))
 m.tube(crest,.036,'hardwood',6)
 m.tube([(-.29,.535,-1.08),(-.29,.505,0),(-.29,.535,1.08)],.028,'hardwood',6)
 for z in[-.88,.88]:
  relief_leaf(m,lambda a,b,d,z=z:(-.25+d,1.055+b,z-a),.18,.07,'hardwood',.3 if z<0 else-.3)
 for z in[-.72,0,.72]:
  rosette(m,lambda a,b,d,z=z:(.298+d,.41+b,z-a),.065,'hardwood')
 m.rotate_y(math.pi/2)
 lowest=min(v[2]for v in m.v);m.v=[(x,z,y-lowest+.004)for x,z,y in m.v]
 return m.finish({'front':'+Z','longAxis':'X','widthAlongXM':2.30,'nominalDepthAlongZM':.68,'seatY':.495-lowest+.004,'footprintM':[2.30,.68],'minimumLocalY':.004,'upholstery':'broad moss woven velvet field and rolled bolsters, carved continuous timber perimeter','interactive':False})

def planter():
 m=Mesh('gallery_planter');profile=[(0,.19),(.025,.23),(.065,.23),(.09,.205),(.14,.235),(.50,.29),(.545,.315),(.575,.315),(.605,.34),(.64,.34),(.67,.305),(.645,.275),(.54,.25)]
 for(a,ra),(b,rb)in zip(profile,profile[1:]):
  for i in range(16):
   t=i*math.tau/16;u=(i+1)*math.tau/16;m.face([(ra*math.cos(t),a,ra*math.sin(t)),(rb*math.cos(t),b,rb*math.sin(t)),(rb*math.cos(u),b,rb*math.sin(u)),(ra*math.cos(u),a,ra*math.sin(u))],'ceramic',True)
 for i in range(16):
  a=i*math.tau/16;b=(i+1)*math.tau/16;m.face([(0,.565,0),(.25*math.cos(b),.565,.25*math.sin(b)),(.25*math.cos(a),.565,.25*math.sin(a))],'soil')
 for i in range(21):
  a=i*2.399;reach=.25+(i%3)*.040;height=1.00+(i%4)*.105;end=(math.cos(a)*reach,height,math.sin(a)*reach)
  m.tube([(0,.56,0),(end[0]*.38,height-.15,end[2]*.38),end],.008,'deadLeaf'if i%4==0 else'leaf',4)
  side=(-math.sin(a),math.cos(a));long=(math.cos(a),math.sin(a));width=.11+(i%2)*.025;pts=[];blade=.27+(i%2)*.025
  for t,w in[(0,0),(.2,.7),(.55,1),(.85,.55),(1,0)]:pts.append((end[0]+long[0]*t*blade+side[0]*w*width,height+.085*math.sin(t*math.pi)-t*.10,end[2]+long[1]*t*blade+side[1]*w*width))
  back=[(end[0]+long[0]*t*blade-side[0]*w*width,height+.085*math.sin(t*math.pi)-t*.10,end[2]+long[1]*t*blade-side[1]*w*width)for t,w in[(.85,.55),(.55,1),(.2,.7)]]
  outline=pts+back;centre=(end[0]+long[0]*blade*.5,height+.045,end[2]+long[1]*blade*.5)
  for j in range(len(outline)):
   m.face([centre,outline[j],outline[(j+1)%len(outline)]],'deadLeaf'if i%5==0 else'leaf',True)
   m.face([tuple(v-.002 if k==1 else v for k,v in enumerate(centre)),tuple(v-.002 if k==1 else v for k,v in enumerate(outline[(j+1)%len(outline)])),tuple(v-.002 if k==1 else v for k,v in enumerate(outline[j]))],'deadLeaf'if i%5==0 else'leaf',True)
 for i in range(8):
  a=i*math.tau/8;c=math.cos(a);s=math.sin(a)
  relief_leaf(m,lambda u,v,d,c=c,s=s:(c*(.29+d)+s*u,.47+v,s*(.29+d)-c*u),.20,.08,'ceramic',math.pi/2)
 return m.finish({'baseRadiusM':.34,'collisionProxy':'Conservative original.38mproxy plus circulation margin; foliage outsideproxy must be checked','foliage':'21 broad leaf stems; five dry, true backed leaf geometry, no imported photo','interactive':False})

def console_source():
 m=Mesh('authoring_console')
 for x in[-.73,.73]:
  for z in[-.165,.165]:
   turned(m,x,z,[(.004,.035),(.035,.049),(.085,.049),(.14,.033),(.56,.025),(.63,.046),(.73,.046),(.82,.033)],'hardwood',8)
   m.tube([(x,.115,z),(x,.16,z)],.038,'oldBronze',6)
 bevel_block(m,(0,.875,0),(1.80,.05,.50),.018,'hardwood')
 for z in[-.19,.19]:bevel_block(m,(0,.765,z),(1.59,.17,.075),.02,'hardwood')
 for x in[-.74,.74]:bevel_block(m,(x,.765,0),(.075,.17,.40),.018,'hardwood')
 m.tube([(-.73,.18,0),(0,.15,0),(.73,.18,0)],.026,'hardwood',6)
 for x in[-.73,.73]:m.tube([(x,.18,-.165),(x,.18,.165)],.022,'hardwood',6)
 for x in[-.48,0,.48]:rosette(m,lambda a,b,d,x=x:(x+a,.765+b,.234+d),.065,'hardwood')
 for x in[-.66,.66]:
  m.tube([(x,.83,.18),(x*.70,.70,.21),(x*.50,.75,.21)],.022,'hardwood',4)
 return m

def urn_source():
 m=Mesh('authoring_urn');turned(m,0,0,[(0,.10),(.025,.12),(.055,.12),(.08,.085),(.15,.07),(.20,.12),(.30,.16),(.40,.17),(.48,.15),(.56,.10),(.62,.10),(.65,.145),(.70,.145),(.69,.12),(.60,.08)],'ceramic',16)
 for y,r in[(.06,.114),(.62,.103)]:planar_ring(m,lambda a,b,d,y=y:(a,y+d,b),r,.012,'oldBronze',12)
 for side in[-1,1]:m.tube([(side*.13,.29,0),(side*.18,.34,0),(side*.185,.48,0),(side*.10,.55,0)],.015,'oldBronze',6)
 for i in range(6):
  a=i*math.tau/6;c=math.cos(a);s=math.sin(a)
  relief_leaf(m,lambda u,v,d,c=c,s=s:(c*(.159+d)+s*u,.39+v,s*(.159+d)-c*u),.15,.065,'ceramic',math.pi/2)
 return m

def accoutrement_source():
 m=Mesh('authoring_accoutrement')
 for i in range(3):
  x=-.35+i*.025;y=i*.057
  bevel_block(m,(x,y+.025,0),(.28,.05,.31),.009,'hardwood')
  m.box((x,y+.027,.002),(.258,.030,.287),'stoneCap')
 turned(m,.12,0,[(0,.08),(.025,.08),(.045,.035),(.30,.014),(.32,.025)],'oldBronze',8)
 turned(m,.12,0,[(.30,.14),(.43,.095),(.445,.095),(.44,.083),(.32,.127)],'felt',12)
 return m

def console_groups():
 c=console_source();u=urn_source();a=accoutrement_source()
 north=Mesh('gallery_console_north');north.append(c);north.append(u,(.52,.90,0));north.append(a,(-.03,.90,0))
 south=Mesh('gallery_console_south');south.append(c)
 bevel_block(south,(-.28,1.005,0),(.64,.21,.34),.026,'hardwood')
 for x in[-.48,-.08]:south.box((x,1.112,0),(.032,.012,.30),'oldBronze')
 south.box((-.28,1.005,.177),(.055,.06,.014),'oldBronze')
 small=urn_source();small.v=[(x*.58,z*.58,y*.58)for x,z,y in small.v];south.append(small,(.57,.90,0))
 # Originals remain separate editable meshes in the .blend, never exported.
 collection=bpy.data.collections.new('EDITABLE CONSTITUENTS - not exported');bpy.context.scene.collection.children.link(collection)
 for source in[c,u,a]:
  o=source.finish({'authoringOnly':True,'runtimeGroups':'gallery_console_north/gallery_console_south'})
  for old in list(o.users_collection):old.objects.unlink(o)
  collection.objects.link(o);o.hide_set(True);o.hide_render=True
 return[north.finish({'front':'+Z','widthDepthHeightM':[1.8,.5,1.60],'bearingTopY':.90,'contents':'handled ceramicurn, three closedboundvolumes, small unlitshadedlamp','interactive':False}),south.finish({'front':'+Z','widthDepthHeightM':[1.8,.5,1.31],'bearingTopY':.90,'contents':'closedcase and smallerhandledceramicvessel; no text','interactive':False})]

def fragment():
 m=Mesh('gallery_fragment')
 for tri in read_glb(ROOT/'public/assets/conservatory-acquisitions.glb','marble_bust_01'):m.face(tri,'mineral',True)
 o=m.finish();bm=bmesh.new();bm.from_mesh(o.data);uvlayer=bm.loops.layers.uv.active
 for co,no in[((0,0,.335),(.10,.13,1)),((.10,0,.28),(1,0,.22))]:
  cut=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=Vector(co),plane_no=Vector(no),clear_outer=True,clear_inner=False)
  edges=[e for e in cut['geom_cut']if isinstance(e,bmesh.types.BMEdge)and e.is_boundary]
  if edges:
   fill=bmesh.ops.holes_fill(bm,edges=edges,sides=0)
   for f in fill.get('faces',[]):
    f.smooth=False
    for j,l in enumerate(f.loops):l[uvlayer].uv=uv('mineralCut',(.5+.4*math.cos(j*math.tau/len(f.loops)),.5+.4*math.sin(j*math.tau/len(f.loops))))
 bm.to_mesh(o.data);bm.free();o.data.update()
 o.data.calc_loop_triangles();n=len(o.data.loop_triangles)
 if n>2900:
  bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('controlled-fragment-budget','DECIMATE');mod.ratio=2850/n;bpy.ops.object.modifier_apply(modifier=mod.name)
 # A displaced fragment rests unevenly but has a real lowest bearing surface.
 for v in o.data.vertices:
  x,z,y=v.co;a=.12;b=-.09;yy=y*math.cos(a)-x*math.sin(a);xx=x*math.cos(a)+y*math.sin(a);zz=z*math.cos(b)-yy*math.sin(b);yyy=yy*math.cos(b)+z*math.sin(b);v.co=(xx,zz,yyy)
 low=min(v.co.z for v in o.data.vertices)
 for v in o.data.vertices:v.co.z+=.025-low
 o.data.update();o['galleryContract']=json.dumps({'source':'CC0 PolyHaven marble_bust_01 from checked-in acquisition GLB','fractures':'two physical clipping/capped planes; upper face removed','minimumLocalY':.025,'existingInstanceElevationM':1.08,'anonymous':True})
 return o

def threshold():
 m=Mesh('gallery_roof_threshold')
 # Two-metre clear passage. Jambs sit outside x+-1; no floor or leaf.
 for x in[-1.12,1.12]:
  m.box((x,1.375,0),(.24,2.75,.44),'mineral')
  m.box((x,.085,.245),(.24,.17,.05),'hardwood')
  m.box((x,1.20,.245),(.24,.075,.05),'stoneCap')
 m.box((0,2.87,0),(2.60,.24,.44),'mineral')
 m.box((0,2.7675,.246),(2.02,.035,.035),'hardwood')
 # An open guarded transom, with spare curved ties rather than new glazing.
 for y in[3.03,3.55]:m.tube([(-1.10,y,.02),(1.10,y,.02)],.018,'iron',6)
 for x in[-1.10,1.10]:m.tube([(x,2.99,.02),(x,3.57,.02)],.020,'iron',6)
 for x in[-.72,0,.72]:
  m.tube([(x-.13,3.05,.02),(x-.07,3.18,.02),(x+.07,3.38,.02),(x+.13,3.53,.02)],.012,'iron',4)
 return m.finish({'anchorWorld':[94,10,2],'front':'+Z','clearOpeningM':[2,2.75],'openingLocalX':[-1,1],'revealDepthM':.44,'floorLeafCollisionAdded':False,'roofGeometry':'unchanged; open transom only'})

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--blend',required=True);parser.add_argument('--report',required=True);a=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 bpy.ops.wm.read_factory_settings(use_empty=True)
 global MAT;MAT=material()
 objects=[structure(),floor(),wall(),plinth(),bench(),planter(),fragment(),threshold(),*console_groups()]
 report={'version':2,'iteration':'ornate bourgeois winter gallery; previous restrained proof archived separately','anchor':[85,10,15],'voidWorld':[79,89,8,21],'inputGlbSha256':INPUTS,'materialEncoding':{'palette':'linear reflectance','albedo':'sRGB encoded bytes; local marblevein','ormNormal':'linear data'},'maps':{'count':3,'dimensions':[512,512],'estimatedMipBytes':4194300},'meshes':{},'limits':{'addedCatalogueTriangles':30000,'mipBytes':8388608,'packBytes':6291456},'validation':{'actualGameDither':'pending refreshed captures','playerValidation':'pending'}}
 for o in objects:
  o.data.calc_loop_triangles();verts=[(v.co.x,v.co.z,-v.co.y)for v in o.data.vertices];report['meshes'][o.name]={'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'bounds':{'min':[min(p[k]for p in verts)for k in range(3)],'max':[max(p[k]for p in verts)for k in range(3)]},'materials':len(o.data.materials),'contract':json.loads(o.get('galleryContract','{}'))}
 report['catalogueTriangles']=sum(m['triangles']for m in report['meshes'].values())
 report['addedCatalogueTriangles']=report['catalogueTriangles']-1920-136
 if report['addedCatalogueTriangles']>30000:raise RuntimeError(f"Added catalogue triangle limit exceeded: {report['addedCatalogueTriangles']}")
 for p in[a.output,a.blend,a.report]:Path(p).parent.mkdir(parents=True,exist_ok=True)
 bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene['galleryProofContract']=json.dumps(report,sort_keys=True);bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.blend).resolve()))
 for o in bpy.context.view_layer.objects:o.select_set(False)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(Path(a.output).resolve()),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=False,export_materials='EXPORT',export_image_format='AUTO',export_animations=False,export_skins=False,export_morph=False,export_lights=False,export_cameras=False,export_extras=True)
 Path(a.report).write_text(json.dumps(report,indent=2)+'\n');print('GALLERY',report['catalogueTriangles'],'catalogue triangles; added',report['addedCatalogueTriangles'])

if __name__=='__main__':main()
