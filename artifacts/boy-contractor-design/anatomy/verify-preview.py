"""Small task-local material/normal proof for the anatomical design data."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
HERE=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.resolution_x=920;scene.render.resolution_y=780;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('study-world');scene.world.color=(.07,.07,.07)
colors=[(.48,.33,.25),(.045,.09,.13),(.07,.077,.08),(.022,.025,.027),(.06,.035,.026),(.36,.34,.30)]
for role,ox in [('boy',-.48),('contractor',.52)]:
    data=json.load(open(HERE/(role+'.json')))
    mats=[]
    for n,col in enumerate(colors):
        if role=='contractor' and n==1:col=(.20,.22,.20)
        m=bpy.data.materials.new(role+str(n));m.diffuse_color=(*col,1);m.use_nodes=True
        bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*col,1);bsdf.inputs['Roughness'].default_value=.82;mats.append(m)
    for piece in data['meshes']:
        p=piece['positions'];idx=piece['indices'];me=bpy.data.meshes.new(piece['name'])
        me.from_pydata([p[i:i+3] for i in range(0,len(p),3)],[],[idx[i:i+3] for i in range(0,len(idx),3)]);me.materials.append(mats[piece['material']]);me.update()
        for f in me.polygons:f.use_smooth=True
        ob=bpy.data.objects.new(piece['name'],me);bpy.context.collection.objects.link(ob);ob.location.x=ox
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,-.01,0),rotation=(math.pi/2,0,0));floor=bpy.context.object
m=bpy.data.materials.new('floor');m.diffuse_color=(.075,.08,.078,1);floor.data.materials.append(m)
def point(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
for pos,power,size in [((-3,4,-4),900,4),((2,2,-2),380,3),((0,3,2),1000,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos);ob=bpy.context.object;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size;point(ob,(0,.9,0))
bpy.ops.object.camera_add(location=(2.2,1.8,-6));cam=bpy.context.object
direction=(Vector((0,.91,0))-cam.location).normalized();right=direction.cross(Vector((0,1,0))).normalized();up=right.cross(direction)
cam.rotation_euler=Matrix((right,up,-direction)).transposed().to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.75;scene.camera=cam
scene.render.filepath=str(HERE/'rest-proof.png');bpy.ops.render.render(write_still=True)
