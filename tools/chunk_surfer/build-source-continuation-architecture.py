"""Author the Source II/III construction vocabulary in Blender, without shared-pack writes.

Runtime axes are X/Y-up/Z. Existing Ellery stonework is clipped from the original
GLB triangles, rather than approximated with a new rectangle facade. The new
bearings, partial catch framing, stair stringers and joinery are editable meshes.
Run with Blender --background --python this-file -- --output ... --blend ... .
"""
from __future__ import annotations
import argparse, hashlib, json, math, struct, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--output',default=str(ROOT/'public/assets/source-continuation-architecture.glb'));p.add_argument('--blend',default=str(ROOT/'artifacts/source-continuation-realignment/source-continuation-architecture.blend'))
args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
PALETTE={
 'source-cut limestone':((.50,.55,.49,1),.94,0),
 'source-cut joint stock':((.40,.48,.45,1),.96,0),
 'old iron':((.075,.09,.085,1),.62,.57),
 'worn bearing bronze':((.30,.22,.12,1),.50,.67),
 'soundboard spruce':((.34,.235,.12,1),.83,0),
 'case hardwood':((.16,.115,.075,1),.62,0),
 'case lining':((.105,.155,.13,1),.96,0),
 'dry bone ivory':((.60,.58,.48,1),.80,0),
}
MATERIALS={}
def material(name,rgba=None,rough=.8,metal=0):
 if name in MATERIALS:return MATERIALS[name]
 if rgba is None:rgba,rough,metal=PALETTE[name]
 m=bpy.data.materials.new('Source continuation '+name);m.diffuse_color=rgba;m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=rgba;n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
 MATERIALS[name]=m;return m

class Mesh:
 def __init__(self,name):self.name=name;self.v=[];self.f=[];self.material=[]
 def face(self,points,finish='old iron'):
  at=len(self.v);self.v.extend((x,-z,y)for x,y,z in points);self.f.append(tuple(range(at,at+len(points))));self.material.append(finish)
 def box(self,center,size,finish='old iron'):
  x,y,z=center;a,b,c=[v/2 for v in size];v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),(x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
  for f in[(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:self.face([v[k]for k in f],finish)
 def beam(self,a,b,width,depth=None,finish='old iron'):
  a,b=Vector(a),Vector(b);t=(b-a).normalized();seed=Vector((0,1,0))if abs(t.y)<.9 else Vector((1,0,0));u=t.cross(seed).normalized()*width/2;v=t.cross(u).normalized()*(depth or width)/2
  corners=[tuple(q+u*s+v*d)for q in[a,b]for s,d in[(-1,-1),(1,-1),(1,1),(-1,1)]]
  for f in[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:self.face([corners[k]for k in f],finish)
 def tube(self,path,radius,finish='old iron',sides=8):
  rings=[]
  for k,q in enumerate(path):
   t=(Vector(path[min(k+1,len(path)-1)])-Vector(path[max(0,k-1)])).normalized();seed=Vector((0,1,0))if abs(t.y)<.9 else Vector((1,0,0));u=t.cross(seed).normalized();v=t.cross(u).normalized()
   rings.append([tuple(Vector(q)+radius*(u*math.cos(a*math.tau/sides)+v*math.sin(a*math.tau/sides)))for a in range(sides)])
  for a,b in zip(rings,rings[1:]):
   for k in range(sides):j=(k+1)%sides;self.face([a[k],a[j],b[j],b[k]],finish)
  self.face(list(reversed(rings[0])),finish);self.face(rings[-1],finish)
 def ring(self,inner,outer,y,height,finish='old iron',start=0,end=math.tau,steps=48):
  for k in range(steps):
   a=start+(end-start)*k/steps;b=start+(end-start)*(k+1)/steps
   pts=[(r*math.cos(t),yy,r*math.sin(t))for yy in[y,y+height]for r,t in[(inner,a),(outer,a),(outer,b),(inner,b)]]
   for f in[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:self.face([pts[i]for i in f],finish)
 def finish(self,extras=None):
  d=bpy.data.meshes.new(self.name);d.from_pydata(self.v,[],self.f);names=list(dict.fromkeys(self.material))
  for n in names:d.materials.append(material(n))
  for f,n in zip(d.polygons,self.material):f.material_index=names.index(n)
  bm=bmesh.new();bm.from_mesh(d);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();d.update()
  layer=d.uv_layers.new(name='PhysicalMetres')
  for f in d.polygons:
   # Source print is anchored in actual construction metres, without an atlas.
   dominant=max(range(3),key=lambda a:abs(f.normal[a]));axes=[a for a in range(3)if a!=dominant]
   for li in f.loop_indices:
    q=d.vertices[d.loops[li].vertex_index].co;layer.data[li].uv=(q[axes[0]]/3,q[axes[1]]/3)
  o=bpy.data.objects.new(self.name,d);bpy.context.scene.collection.objects.link(o)
  o['sourceContinuationArchitecture']=True
  for k,v in(extras or{}).items():o[k]=v if isinstance(v,(str,int,float,bool))else json.dumps(v)
  return o

def load_glb(path):
 b=path.read_bytes();jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);return b,j,28+jl
def accessor(b,j,base,index):
 a=j['accessors'][index];view=j['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt,bs={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[a['componentType']];stride=view.get('byteStride',size*bs);at=base+view.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*size,b,at+k*stride)for k in range(a['count'])]
def clipped_original(name,source_mesh,bounds,keep_anchor=False):
 b,j,base=load_glb(ROOT/'public/assets/conservatory-props.glb');m=next(x for x in j['meshes']if x['name']==source_mesh);data=bpy.data.meshes.new(name);vertices=[];faces=[];mat_indices=[];mats=[]
 for prim in m['primitives']:
  points=accessor(b,j,base,prim['attributes']['POSITION']);indices=[v[0]for v in accessor(b,j,base,prim['indices'])];off=len(vertices);vertices.extend(points);faces.extend(tuple(off+v for v in indices[k:k+3])for k in range(0,len(indices),3));definition=j['materials'][prim['material']];pbr=definition.get('pbrMetallicRoughness',{});mn='retained '+definition['name'];mats.append(material(mn,tuple(pbr.get('baseColorFactor',[.45,.45,.4,1])),pbr.get('roughnessFactor',.9),pbr.get('metallicFactor',0)));mat_indices.extend([len(mats)-1]*(len(indices)//3))
 data.from_pydata(vertices,[],faces)
 for m in mats:data.materials.append(m)
 for f,mi in zip(data.polygons,mat_indices):f.material_index=mi
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
 for axis,(lo,hi) in enumerate(bounds):
  for coord,lower in[(lo,True),(hi,False)]:
   co=[0,0,0];co[axis]=coord;no=[0,0,0];no[axis]=1
   bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=co,plane_no=no,dist=1e-6,clear_inner=lower,clear_outer=not lower)
 # Preserve source construction with finite exposed cuts, rather than solid filler.
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 ox=0 if keep_anchor else(bounds[0][0]+bounds[0][1])/2;oz=0 if keep_anchor else(bounds[2][0]+bounds[2][1])/2;oy=0 if keep_anchor else bounds[1][0]
 for v in data.vertices:x,y,z=v.co;v.co=(x-ox,-(z-oz),y-oy)
 data.update();o=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(o);o['sourceContinuationArchitecture']=True;o['originalMesh']=source_mesh;o['originalBounds']=json.dumps(bounds)
 return o

# The original window/brick/column language survives the fold. Neither source
# building is imported wholesale and no original mesh or shared pack is changed.
clipped_original('source_ii_ellery_bay','conservatory_west_elevation',[(-3.8,1.1),(0,18.5),(4.4,22.5)])
clipped_original('source_ii_ellery_corner','conservatory_west_elevation',[(-3.8,1.1),(0,15.0),(43.0,56.5)])
clipped_original('source_ii_chapel_buttress','st_brendan_church',[(-8.35,-4.6),(0,13.5),(-7.0,7.0)])
clipped_original('source_ii_case_floor','open_instrument_case',[(-.65,.65),(.0,.2225),(-.29,.43)],True)
clipped_original('source_ii_case_lid','open_instrument_case',[(-.65,.65),(.24,.78),(-.29,.43)],True)
clipped_original('source_ii_piano_soundboard','grand_piano',[(-.82,1.0),(1.06,1.14),(-1.56,1.06)],True)
clipped_original('source_ii_tower_cap','tower_frame',[(-4.51,4.51),(2.5,2.78),(-2.53,2.53)],True)

# A continuous spindle and visible thrust bearings; these are not floating rods.
m=Mesh('source_iii_spindle');m.tube([(0,-25,0),(0,17,0)],.38,'old iron',32)
for y in[-24,-12.6,-4.8,2.4,8.4,16.6]:
 m.ring(.38,.67,y,.16,'worn bearing bronze',steps=32)
 for k in range(8):a=k*math.tau/8;m.tube([(.53*math.cos(a),y+.16,.53*math.sin(a)),(.53*math.cos(a),y+.22,.53*math.sin(a))],.045,'old iron',6)
m.finish({'loadPath':'continuous central spindle, visible bearings at every catch'})
m=Mesh('source_iii_bearing');m.ring(.43,1.08,-.44,.38,'old iron',steps=40);m.ring(.42,.88,-.08,.12,'worn bearing bronze',steps=40)
for k in range(6):a=k*math.tau/6;m.beam((.75*math.cos(a),-.4,.75*math.sin(a)),(1.65*math.cos(a),-.95,1.65*math.sin(a)),.15,.22)
m.finish({'junction':'spindle bearing, radial load collar and knee braces'})

# Four catches share the same fabrication grammar but have genuinely different
# outlines, radii, finishes and framing, matching the authored collision sectors.
stages=[(6.2,13,-1.35,1.35,'case hardwood'),(4.2,12.5,-math.pi/2,math.pi,'soundboard spruce'),(2.6,11.5,math.pi/2,3*math.pi/2,'source-cut joint stock'),(1.2,9.8,-math.pi/2,math.pi+.15,'dry bone ivory')]
for level,(inner,outer,a,b,finish)in enumerate(stages):
 m=Mesh('source_iii_catch_frame_'+str(level));segments=max(18,math.ceil((b-a)/.12))
 # The upper deck is supplied by the exact runtime physical sector. This frame
 # begins beneath it and cannot conceal a different, invisible collision floor.
 for radius in[inner+.16,(inner+outer)/2,outer-.18]:
  path=[(radius*math.cos(a+(b-a)*k/segments),-.36,radius*math.sin(a+(b-a)*k/segments))for k in range(segments+1)];m.tube(path,.15 if radius>inner+.2 else .19,finish,8)
 for k in range(max(5,math.ceil((b-a)/.34))+1):
  t=a+(b-a)*k/max(5,math.ceil((b-a)/.34));m.beam((inner*math.cos(t),-.34,inner*math.sin(t)),(outer*math.cos(t),-.34,outer*math.sin(t)),.16,.26,finish)
  # The tension ribs meet the inner bearing, not an imaginary full floor.
  m.beam(((inner+.3)*math.cos(t),-.40,(inner+.3)*math.sin(t)),((outer-.4)*math.cos(t),-1.55,(outer-.4)*math.sin(t)),.11,.16,'old iron')
 # Tangential end grain and stepped joint blocks make the cut section legible.
 for t in[a,b]:
  m.beam((inner*math.cos(t),-.32,inner*math.sin(t)),(outer*math.cos(t),-.32,outer*math.sin(t)),.22,.42,finish)
  for radius in[inner+.45,outer-.45]:
   x,z=radius*math.cos(t),radius*math.sin(t);m.box((x,-.36,z),(.34,.54,.34),'worn bearing bronze')
 m.finish({'catchLevel':level,'supportContract':'all dressing below the exact sector surface','sector':{'innerRadius':inner,'outerRadius':outer,'startAngle':a,'endAngle':b}})

# Reusable voussoirs and stair stringer. Arch opening remains fully empty.
m=Mesh('source_ii_arch_voussoirs');radius=2.8
for k in range(13):
 a=math.pi+k*math.pi/13;b=math.pi+(k+1)*math.pi/13;pts=[]
 for z in[-.34,.34]:
  pts.extend([(r*math.cos(t),2.9-r*math.sin(t),z)for r,t in[(radius,a),(radius+.43,a),(radius+.43,b),(radius,b)]])
 for f in[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:m.face([pts[i]for i in f],'source-cut limestone')
for x in[-3.02,3.02]:m.box((x,1.45,0),(.50,2.90,.72),'source-cut limestone');m.box((x,.18,0),(.85,.36,.96),'source-cut joint stock')
m.finish({'opening':'5.6m clear width, voussoir arch and supported piers'})
m=Mesh('source_ii_stringer')
for x in[-.5,.5]:
 m.beam((x,-.7,0),(x,3.5,-1),.10,.32,'source-cut joint stock')
 m.beam((x,3.5,-1),(x,3.5,-1.18),.16,.30,'worn bearing bronze')
 for k in range(7):t=k/6;m.beam((x,4.2*t-.7,-t),(x,4.2*t-.1,-t),.055,.07,'old iron')
m.finish({'use':'normalized stair width/run frame, never a support surface'})
m=Mesh('source_ii_case_hinge')
m.tube([(-.6,0,0),(.6,0,0)],.10,'worn bearing bronze',12)
for x in[-.45,0,.45]:
 m.box((x,-.03,.21),(.24,.075,.38),'old iron')
 for z in[.13,.30]:m.tube([(x,.01,z),(x,.06,z)],.032,'worn bearing bronze',6)
m.finish({'joint':'rolled continuous hinge with fixed straps and actual pins'})

out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);blend=Path(args.blend);blend.parent.mkdir(parents=True,exist_ok=True)
for o in bpy.context.scene.objects:o.select_set(o.type=='MESH')
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
stats=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 o.data.calc_loop_triangles();coords=[(v.co.x,v.co.z,-v.co.y)for v in o.data.vertices];lo=[min(q[k]for q in coords)for k in range(3)];hi=[max(q[k]for q in coords)for k in range(3)];stats.append({'mesh':o.name,'triangles':len(o.data.loop_triangles),'bounds':{'min':lo,'max':hi}})
result={'version':1,'asset':out.name,'editable':str(blend.relative_to(ROOT)),'meshes':stats,'triangles':sum(m['triangles']for m in stats),'bytes':out.stat().st_size,'originalAssetSha256':hashlib.sha256((ROOT/'public/assets/conservatory-props.glb').read_bytes()).hexdigest(),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'source':'Original Chunk Surfer authored models, selective geometry clipping and new Blender construction; no external downloads or shared-pack replacement.'}
out.with_suffix('.stats.json').write_text(json.dumps(result,indent=2)+'\n');out.with_suffix('.credits.json').write_text(json.dumps({'title':'Source II/III folded construction','sources':[{'path':'public/assets/conservatory-props.glb','meshes':['conservatory_west_elevation','st_brendan_church'],'use':'Retained original triangles clipped into finite architectural fragments','license':'Existing project authored material; original credits retained in source asset'}],'newWork':'Source continuation spindle, bearings, staggered catch frames, architectural joints and stair framing authored in Blender.'},indent=2)+'\n');print(json.dumps({'built':str(out),'editable':str(blend),'meshes':len(stats),'triangles':result['triangles'],'bytes':result['bytes']}))
