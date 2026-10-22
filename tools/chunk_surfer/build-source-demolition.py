"""Selective baked failure of the existing Source conservatoire echo.

Blender CPU authoring, no simulation lottery. Each selected source component is
an original closed wall/lining/string/roof assembly; orthogonal construction
seams create finite capped pieces. The original loading opening/flytower and
all unselected triangles remain in the read-only retained mesh.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector,Euler

p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);p.add_argument('--blend',required=True);p.add_argument('--motion',required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
source=json.loads(Path(args.input).read_text());bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=289
extra=[{'name':'Source demolition exposed cut core','pbrMetallicRoughness':{'baseColorFactor':[.31,.29,.25,1],'roughnessFactor':.97,'metallicFactor':0},'extras':{'studyLocalFinish':True,'materialFactors':'gltf'}},{'name':'Source demolition bounded dark volume','pbrMetallicRoughness':{'baseColorFactor':[0,0,0,1],'roughnessFactor':1,'metallicFactor':0},'extras':{'studyLocalFinish':True,'materialFactors':'gltf'}}]
materials=[]
for definition in source['materials']+extra:
 m=bpy.data.materials.new(definition['name']);m.diffuse_color=definition['pbrMetallicRoughness']['baseColorFactor'];m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=m.diffuse_color;n.inputs['Roughness'].default_value=definition['pbrMetallicRoughness'].get('roughnessFactor',.9);n.inputs['Metallic'].default_value=definition['pbrMetallicRoughness'].get('metallicFactor',0);materials.append(m)
cap=len(source['materials'])

def near(a,b,eps=.025):return abs(a-b)<eps
def selection(c):
 lo,hi=c['bounds']['min'],c['bounds']['max'];size=[hi[k]-lo[k]for k in range(3)];mid=[(lo[k]+hi[k])/2 for k in range(3)];name=c['name']
 if name=='painted steel' and near(lo[0],.275) and near(hi[0],9.725) and near(hi[2],-4.02):
  return {'role':'service-front-substrate','phase':'restraint-infill','start':1.25,'retainAfterX':1.8,'cuts':{1:[5.4],2:[-6.42]}}
 if name=='painted steel' and hi[0]<.75 and hi[2]<-3.99 and size[1]>5 and lo[2]>-7.6:
  return {'role':'service-infill','phase':'restraint-infill','start':1.0,'cuts':{1:[(lo[1]+hi[1])/2],2:[mid[2]]} if size[2]>1 else {1:[mid[1]]}}
 if name=='board marked concrete' and near(lo[0],0) and near(hi[0],.4) and size[2]>17 and lo[1]>6:
  return {'role':'upper-fabric','phase':'upper-bay','start':6.8,'cuts':{2:[10.5,16.5]}}
 if name=='board marked concrete' and near(lo[0],-.74) and size[1]>13 and size[2]>17:
  return {'role':'academic-backing','phase':'restraint-infill','start':3.0,'cuts':{1:[5.9,9.55],2:[10.5,16.5]}}
 if name=='chapel stone' and hi[0]<1.1 and lo[0]>-.1 and size[2]>17 and lo[2]>4.4 and hi[2]<22.6 and lo[1]>5:
  return {'role':'string-and-coping','phase':'string-release','start':3.2 if hi[1]<10 else 7.7,'cuts':{2:[10.5,16.5]}}
 if name=='board marked concrete' and near(lo[0],-2.9) and near(hi[0],0) and near(lo[2],5.3) and size[1]>11:
  return {'role':'projected-academic-bay','phase':'upper-bay','start':7.4,'cuts':{1:[6.0],2:[8.4]}}
 if name=='ellery red brick' and near(lo[0],0) and near(hi[0],.4) and size[2]>19 and lo[1]>6:
  return {'role':'old-brick-upper-course','phase':'upper-bay','start':7.9,'cuts':{2:[51.2,57.8]}}
 if name=='ellery red brick' and near(lo[0],-3.4) and near(hi[0],0) and near(lo[2],45.5) and size[1]>9:
  return {'role':'old-brick-projection','phase':'upper-bay','start':8.15,'cuts':{1:[4.7],2:[49.2]}}
 if name=='wet slate' and lo[0]<-3.6 and hi[0]<.4 and 48<mid[2]<50 and lo[1]>9:
  return {'role':'old-roof','phase':'roof-loss','start':8.6,'cuts':{2:[49.2]}}
 if name=='black lacquer' and hi[0]<.6 and -3.3<lo[0] and 6<mid[2]<10 and 6<mid[1]<10 and size[1]>1 and size[2]>.8:
  return {'role':'window-infill','phase':'restraint-infill','start':1.45,'cuts':{}}
 return None

def original_mesh(c):
 vertices=[tuple(c['vertices'][i:i+3])for i in range(0,len(c['vertices']),3)];faces=[tuple(c['indices'][i:i+3])for i in range(0,len(c['indices']),3)];data=bpy.data.meshes.new('original-'+c['id']);data.from_pydata(vertices,[],faces);data.update();bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
 for face in bm.faces:face.material_index=c['material']
 return bm

def clip(bm,axis,coord,lower):
 point=[0,0,0];point[axis]=coord;normal=[0,0,0];normal[axis]=1
 result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=point,plane_no=normal,clear_inner=lower,clear_outer=not lower)
 edges=[e for e in result['geom_cut']if isinstance(e,bmesh.types.BMEdge)and len(e.link_faces)==1]
 if edges:
  for face in bmesh.ops.holes_fill(bm,edges=edges,sides=0)['faces']:face.material_index=cap

def export_data(data):
 data.calc_loop_triangles();groups={}
 for tri in data.loop_triangles:
  material=tri.material_index;g=groups.setdefault(material,{'material':material,'vertices':[],'normals':[],'uvs':[],'indices':[]});base=len(g['vertices'])//3;normal=list(tri.normal)
  for vi in tri.vertices:g['vertices']+=list(data.vertices[vi].co);g['normals']+=normal;g['uvs']+=[0,0]
  g['indices'] +=[base,base+1,base+2]
 return list(groups.values())

parts=[];selected=[];counts={};retained_extra=[];retained_collection=bpy.data.collections.new('RETAINED ORIGINAL - loading bay and flytower');scene.collection.children.link(retained_collection);moving_collection=bpy.data.collections.new('SELECTIVE FAILURE - baked rigid fragments');scene.collection.children.link(moving_collection)
for c in source['components']:
 rule=selection(c)
 if not rule:
  bm=original_mesh(c);data=bpy.data.meshes.new('retained-'+c['id']);bm.to_mesh(data);bm.free();o=bpy.data.objects.new('retained '+c['id']+' '+c['name'],data);retained_collection.objects.link(o);[data.materials.append(m)for m in materials];continue
 selected.append(c['id']);bm_source=original_mesh(c);ranges={}
 if 'retainAfterX' in rule:
  back=bm_source.copy();clip(back,0,rule['retainAfterX'],True);bmesh.ops.recalc_face_normals(back,faces=list(back.faces));data=bpy.data.meshes.new('retained deep service substrate');back.to_mesh(data);back.free();data.update();[data.materials.append(m)for m in materials];obj=bpy.data.objects.new('RETAINED opaque back of bounded service recess',data);retained_collection.objects.link(obj);retained_extra+=export_data(data);clip(bm_source,0,rule['retainAfterX'],False)
 for axis,cuts in rule['cuts'].items():
  lo,hi=c['bounds']['min'][axis],c['bounds']['max'][axis];points=[lo]+[v for v in cuts if lo+1e-5<v<hi-1e-5]+[hi];ranges[axis]=list(zip(points[:-1],points[1:]))
 import itertools
 combinations=list(itertools.product(*[[(axis,lo,hi)for lo,hi in ranges[axis]]for axis in ranges]))if ranges else [()]
 for cuts in combinations:
  bm=bm_source.copy()
  for axis,lo,hi in cuts:
   if lo>c['bounds']['min'][axis]+1e-5:clip(bm,axis,lo,True)
   if hi<c['bounds']['max'][axis]-1e-5:clip(bm,axis,hi,False)
  if not bm.faces:bm.free();continue
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));points=[v.co.copy()for v in bm.verts];lo=[min(v[k]for v in points)for k in range(3)];hi=[max(v[k]for v in points)for k in range(3)]
  # Bottom-edge pivot makes the first peel an actual hinged release. All meshes
  # retain exact original positions at t0 when translated by this pivot.
  pivot=Vector(((lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2));index=len(parts);mesh=f'source_demolition_chunk_{index:02d}'
  for v in bm.verts:v.co-=pivot
  data=bpy.data.meshes.new(mesh);bm.to_mesh(data);bm.free();data.update();[data.materials.append(m)for m in materials];o=bpy.data.objects.new(mesh,data);moving_collection.objects.link(o);o.location=pivot;o.rotation_mode='QUATERNION'
  count=counts.get(rule['role'],0);counts[rule['role']]=count+1;start=rule['start']+(count%5)*.12
  o['source_component']=c['id'];o['construction_role']=rule['role'];o['phase']=rule['phase'];o['release_time']=start
  parts.append({'id':mesh,'mesh':mesh,'sourceComponent':c['id'],'role':rule['role'],'phase':rule['phase'],'startTime':round(start,4),'pivot':list(pivot),'restBounds':{'min':lo,'max':hi},'localBounds':{'min':[lo[k]-pivot[k]for k in range(3)],'max':[hi[k]-pivot[k]for k in range(3)]},'object':o})
 bm_source.free()

if len(parts)>60:raise RuntimeError(f'Too many semantic fragments: {len(parts)}')
times=[round(i/12,8)for i in range(145)];tracks={};debris_min_x=1e9
def smooth(t):return t*t*(3-2*t)
for index,part in enumerate(parts):
 o=part.pop('object');pivot=Vector(part['pivot']);local=[v.co.copy()for v in o.data.vertices];start=part['startTime'];release=start+.45
 roll=-math.pi/2+(.10 if index%3==0 else -.08 if index%3==1 else .025);yaw=(index%5-2)*.035;pitch=(index%3-1)*.035;final=Euler((pitch,yaw,roll),'XYZ').to_quaternion();rotated=[final@v for v in local];target=Vector((max(2.2-min(v.x for v in rotated),pivot.x+3.2+(index%4)*.5),.035-min(v.y for v in rotated),pivot.z+(index%3-1)*.18));fall=math.sqrt(max(.08,2*(pivot.y-target.y)/9.81));fall=max(.48,min(1.8,fall));translations=[];rotations=[]
 # A panel that starts on the ground tips against that ground. Its pivot may
 # rise as the CURRENT rotated thickness demands, never jump to the resting
 # height needed by its future flat pose. Heavy floor-origin pieces take a
 # perceptible levered turn rather than the short flight of a falling sheet.
 if pivot.y<.05:
  height=part['restBounds']['max'][1]-part['restBounds']['min'][1]
  fall=max(fall,.92+min(.45,height*.055))
 release_q=Euler((0,0,-.065)).to_quaternion()
 release_y=max(pivot.y,.035-min((release_q@v).y for v in local))
 for t in times:
  if t<=start:loc=pivot.copy();q=Euler((0,0,0)).to_quaternion()
  elif t<release:
   u=smooth((t-start)/(release-start));q=Euler((0,0,-.065*u)).to_quaternion();loc=pivot+Vector((.015*u,0,0));loc.y=max(pivot.y,.035*u-min((q@v).y for v in local))
  else:
   dt=t-release;u=max(0,min(1,dt/fall));turn=smooth(u);q=Euler((pitch*turn,yaw*turn,-.065+(roll+.065)*turn),'XYZ').to_quaternion();loc=pivot.lerp(target,turn);loc.y=max(.035-min((q@v).y for v in local),release_y-.5*9.81*dt*dt)
   if dt>=fall:loc=target.copy();q=final;settle=dt-fall;loc.y+=.025*abs(math.sin(settle*18))*math.exp(-settle*8)
  translations.append([round(v,7)for v in loc]);rotations.append([round(q.x,8),round(q.y,8),round(q.z,8),round(q.w,8)]);o.location=loc;o.rotation_quaternion=q;o.keyframe_insert(data_path='location',frame=1+t*24);o.keyframe_insert(data_path='rotation_quaternion',frame=1+t*24)
 part['settledTime']=round(release+fall+.6,4);part['finalTranslation']=list(target);part['finalRotation']=[final.x,final.y,final.z,final.w];debris_min_x=min(debris_min_x,min((target+v).x for v in rotated));tracks[part['mesh']]={'translations':translations,'rotations':rotations}
 # Local vertices are static; Blender action is editable and corresponds to the
 # exact sampled runtime pose tracks. Export hard construction normals.
 part['groups']=export_data(o.data)
scene.frame_set(1)
# A neutral CPU inspection camera is an editable aid only; no Blender render is
# claimed as acceptance of the game's camera or final dither.
bpy.ops.object.camera_add(location=(-45,18,2));camera=bpy.context.object;camera.name='AUTHORING overview - original loading mouth';direction=Vector((0,7,15))-camera.location;camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();scene.camera=camera
bpy.ops.wm.save_as_mainfile(filepath=args.blend)
motion={'version':1,'duration':12,'sampleHz':12,'coordinateSpace':'original conservatory_west_elevation local metres; Y-up; rotation quaternion XYZW','times':times,'tracks':tracks};Path(args.motion).write_text(json.dumps(motion,separators=(',',':')))
audit={'originalMouth':{'minZ':-4,'maxZ':3.6},'debrisSettledMinX':debris_min_x,'selectionByConstructionRole':counts,'authoredIn':'Blender CPU,1thread; selective bmesh plane cuts with capped core; editable sampled rigid-object actions','preserved':'Unselected source triangles including loading aperture and flytower retain exact originals in the runtime retained mesh. No independent building or route introduced.'}
Path(args.output).write_text(json.dumps({'selectedComponentIds':selected,'extraMaterials':extra,'parts':parts,'retainedExtra':retained_extra,'audit':audit},separators=(',',':')))
print(json.dumps({'movingParts':len(parts),'roles':counts,'settledDebrisMinX':debris_min_x,'blend':args.blend}))
