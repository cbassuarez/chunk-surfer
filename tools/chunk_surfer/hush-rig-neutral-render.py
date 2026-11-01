"""CPU-only neutral material views of exact production-sampled deformation."""
import bpy,json,os,math,sys
from mathutils import Vector
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));folder=os.path.join(root,'artifacts/hush-motion-study/rig')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=3
scene.render.resolution_x=960;scene.render.resolution_y=960;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.world=bpy.data.worlds.new('neutral world');scene.world.color=(.16,.16,.16)
clay=bpy.data.materials.new('neutral grey inspection');clay.diffuse_color=(.24,.26,.27,1);clay.use_nodes=True;clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.24,.26,.27,1);clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.78
floor=bpy.data.materials.new('floor');floor.diffuse_color=(.12,.13,.14,1)
bpy.ops.mesh.primitive_plane_add(size=20);plane=bpy.context.object;plane.data.materials.append(floor)
for loc,power,size in[((-3,1.5,4.5),600,3),((3,2,3),240,2),((0,-3,3.4),400,2)]:
 light=bpy.data.lights.new('neutral softbox','AREA');light.energy=power;light.shape='DISK';light.size=size;o=bpy.data.objects.new(light.name,light);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
camd=bpy.data.cameras.new('matched inspection');cam=bpy.data.objects.new(camd.name,camd);scene.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO'
for name in (['neck-study'] if '--only-study' in sys.argv else ['baseline','neck-study']):
 data=json.load(open(os.path.join(folder,'neutral-'+name+'-geometry.json')));frames=data['frames']
 for number in[0,1]:
  frame=frames[number];verts=[(p[0],-p[2],p[1])for p in frame['points']];faces=[data['indices'][i:i+3]for i in range(0,len(data['indices']),3)]
  me=bpy.data.meshes.new('actual sampled surface');me.from_pydata(verts,[],faces);me.update();obj=bpy.data.objects.new(name,me);scene.collection.objects.link(obj);obj.data.materials.append(clay)
  for poly in me.polygons:poly.use_smooth=True
  for view in ['full','collar']if number==0 else['collar']:
   target=Vector((0,0,1.05 if view=='full' else 1.82));cam.location=(.48,4,1.25 if view=='full' else 2.0);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=2.35 if view=='full' else .63
   scene.render.filepath=os.path.join(folder,'neutral-'+name+'-'+frame['clip']+'-'+view+'.png');bpy.ops.render.render(write_still=True)
  bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(me)
print('CPU neutral rig comparison complete; no production files modified.')
