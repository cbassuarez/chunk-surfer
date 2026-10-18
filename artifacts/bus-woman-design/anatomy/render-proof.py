import bpy,math
from mathutils import Vector,Matrix
from pathlib import Path
out=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(out/'bus-woman-study.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=960;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('study world');scene.world.color=(.11,.11,.11)
scene.view_settings.view_transform='AgX'
def look(obj,point):
 forward=(Vector(point)-obj.location).normalized();right=forward.cross(Vector((0,1,0))).normalized();up=right.cross(forward).normalized();obj.matrix_world=Matrix(((right.x,up.x,-forward.x,obj.location.x),(right.y,up.y,-forward.y,obj.location.y),(right.z,up.z,-forward.z,obj.location.z),(0,0,0,1)))
cam=bpy.data.cameras.new('study camera');co=bpy.data.objects.new('study camera',cam);scene.collection.objects.link(co);co.location=(2.3,1.55,-4.2);look(co,(0,.91,0));cam.type='ORTHO';cam.ortho_scale=2.02;scene.camera=co
for name,loc,power,size in [('key',(-2.5,3,-3),650,3),('fill',(3,2,-2),400,3),('rim',(0,3,2),500,2)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;look(ob,(0,1,0))
for i in [1,2,3]:
 for ob in bpy.data.objects:
  if ob.name.startswith('option'):ob.hide_render=not ob.name.startswith('option'+str(i))
 scene.render.filepath=str(out/('option-'+str(i)+'-rest-proof.png'));bpy.ops.render.render(write_still=True)
