"""Blender background preview gate for accepted conservatory GLB meshes.

Usage: blender -b --python tools/chunk_surfer/render-prop-previews.py -- PACK OUT
"""
import bpy, math, os, sys
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
pack,out=args[0],args[1];os.makedirs(out,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=pack)
targets=['school_desk','grand_piano','cello','violin','pew','marimba','portrait_frame','hall_seating','hall_structure','chapel_vault']

world=bpy.data.worlds.new('preview');bpy.context.scene.world=world
world.color=(.018,.018,.02)
for at,power,size in [((4,-3,6),1000,4),((-3,2,3),500,3)]:
  data=bpy.data.lights.new('soft','AREA');data.energy=power;data.shape='DISK';data.size=size
  obj=bpy.data.objects.new('soft',data);obj.location=at;bpy.context.collection.objects.link(obj)
cam_data=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cam_data);bpy.context.collection.objects.link(cam);bpy.context.scene.camera=cam;cam_data.type='ORTHO'
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False

def look(obj,point):
  obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()

meshes=[o for o in scene.objects if o.type=='MESH']
for target in targets:
  visible=[o for o in meshes if o.name==target or o.name.startswith(target+'.')]
  if not visible: continue
  for o in meshes:o.hide_render=o not in visible
  pts=[]
  for o in visible:
    pts.extend(o.matrix_world@Vector(c) for c in o.bound_box)
  lo=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))
  hi=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
  center=(lo+hi)/2;extent=max(hi.x-lo.x,hi.y-lo.y,hi.z-lo.z)
  cam.location=center+Vector((extent*1.65,-extent*2.1,extent*1.25));cam_data.ortho_scale=extent*1.45;look(cam,center)
  scene.render.filepath=os.path.join(out,target+'.png');bpy.ops.render.render(write_still=True)
