"""Render selected production geometry with the same sampled skin transforms."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'artifacts/bus-woman-production'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'bus-woman-character.blend'))
source=json.load(open(OUT/'anatomy.json'));clips=json.load(open(OUT/'clips.json'))
args=sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[]
mode=args[0]if args else'wait';seconds=float(args[1])if len(args)>1 else 0
view=args[2]if len(args)>2 else'three-quarter'
clip=next(c for c in clips if c['mode']==mode);idx=min(range(len(clip['times'])),key=lambda i:abs(clip['times'][i]-seconds));pose=clip['poses'][idx]
bones={b['name']:b for b in source['bones']}
body_names={m['name']for m in source['meshes']};bag_names={m['name']for m in source['bag']['meshes']};ticket_names={m['name']for m in source['ticket']['meshes']}
for ob in list(bpy.data.objects):
 ob.animation_data_clear()
 if ob.type!='MESH':continue
 if ob.name in body_names:
  ob.modifiers.clear()
  for vertex in ob.data.vertices:
   point=Vector(vertex.co);result=Vector((0,0,0));total=0
   for group in vertex.groups:
    name=ob.vertex_groups[group.group].name;joint=pose['joints'][name];q=joint['rotation'];quat=Quaternion((q[3],q[0],q[1],q[2]));result+=(quat@(point-Vector(bones[name]['head']))+Vector(joint['translation']))*group.weight;total+=group.weight
   if total:vertex.co=result/total
 elif ob.name in bag_names or ob.name in ticket_names:
  p=pose['attachments']['bag'if ob.name in bag_names else'ticket'];ob.location=p['translation'];q=p['rotation'];ob.rotation_mode='QUATERNION';ob.rotation_quaternion=(q[3],q[0],q[1],q[2]);ob.hide_render=not p['visible']
 else:ob.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('production proof world');scene.world.color=(.095,.095,.095);scene.view_settings.view_transform='AgX'
def look(ob,p):
 forward=(Vector(p)-ob.location).normalized();right=forward.cross(Vector((0,1,0))).normalized();up=right.cross(forward).normalized();ob.matrix_world=Matrix(((right.x,up.x,-forward.x,ob.location.x),(right.y,up.y,-forward.y,ob.location.y),(right.z,up.z,-forward.z,ob.location.z),(0,0,0,1)))
cam=bpy.data.cameras.new('production proof camera');co=bpy.data.objects.new('production proof camera',cam);scene.collection.objects.link(co);co.location={'front':(0,1.25,-4.3),'front-close':(0,1.12,-4.3),'side':(4.3,1.45,-.25)}.get(view,(1.9,1.45,-4.3));look(co,(0,1.12 if view=='front-close' else .90,0));cam.type='ORTHO';cam.ortho_scale=1.12 if view=='front-close' else 1.95;scene.camera=co
for name,location,power,size in [('key',(-2.5,3,-3),650,3),('fill',(3,2,-2),400,3),('rim',(0,3,2),500,2)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=location;look(ob,(0,1,0))
scene.render.filepath=str(OUT/('proof-'+mode+'-'+str(seconds).replace('.','_')+(''if view=='three-quarter'else'-'+view)+'.png'));bpy.ops.render.render(write_still=True)
