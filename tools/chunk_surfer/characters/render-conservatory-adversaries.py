"""Contact-sheet proof for the editable adversary sources (Blender 4.5)."""
import bpy
import math
import os
import sys
from mathutils import Vector, Quaternion

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
kind=args[args.index('--kind')+1] if '--kind' in args else 'costume'
head_detail='--head-detail' in args and kind=='costume'
slug='costume-exchange' if kind=='costume' else 'held-note'
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'assets/source',slug+'.blend'))
if head_detail:
    for name,angle in (('crown_left',.92),('crown_right',-.92)):
        crown=bpy.data.objects['costume_exchange_anatomy'].pose.bones[name]
        crown.rotation_mode='QUATERNION'
        crown.rotation_quaternion=Quaternion((0,0,1),angle)
for obj in bpy.data.objects:
    obj.hide_render=obj.type=='MESH' and (
        not obj.name.startswith(slug.replace('-','_')) or
        (head_detail and obj.name in ('costume_exchange_cover','costume_exchange_attachments')))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=12 if head_detail else 24
scene.render.resolution_x=1000 if head_detail else 850
scene.render.resolution_y=1000 if head_detail else 850
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('proof studio');world.color=(.045,.042,.041);scene.world=world
def point_at(obj,p):
    direction=Vector(p)-obj.location
    obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
cam_data=bpy.data.cameras.new('proof camera')
cam=bpy.data.objects.new('proof camera',cam_data);scene.collection.objects.link(cam)
cam.location=(.38,2.20,2.48) if head_detail else ((3.5,5,2.25) if kind=='costume' else (4.2,6.8,2.55))
point_at(cam,(0,0,1.70) if head_detail else ((0,0,1.05) if kind=='costume' else (0,0,1.50)))
cam_data.type='ORTHO';cam_data.ortho_scale=.72 if head_detail else (3.0 if kind=='costume' else 5.2);scene.camera=cam
for name,location,power,size in [('key',(-3,-4,4),600,3),('fill',(4,-1,3),320,3),('rim',(0,2,3.5),700,2)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;point_at(obj,(0,0,1.3))
floor=bpy.data.meshes.new('proof floor');floor.from_pydata([(-6,-6,-.02),(6,-6,-.02),(6,6,-.02),(-6,6,-.02)],[],[(0,1,2,3)])
floor_obj=bpy.data.objects.new('proof floor',floor);scene.collection.objects.link(floor_obj)
mat=bpy.data.materials.new('proof slate');mat.diffuse_color=(.08,.073,.068,1);floor.materials.append(mat)
out=os.path.join(ROOT,'artifacts/conservatory-adversaries',slug+('-crown-source-proof.png' if head_detail else '-source-proof.png'))
os.makedirs(os.path.dirname(out),exist_ok=True)
scene.render.filepath=out;bpy.ops.render.render(write_still=True)
print('RENDERED',out)
