"""Neutral source proof using the same absolute rest skin matrices as the game."""
from pathlib import Path
import bpy,json,math,sys,hashlib
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'artifacts/bus-woman-wrong-origin'
args=sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[]
stage=int(args[0])if args else 4;mode=args[1]if len(args)>1 else'wait';seconds=float(args[2])if len(args)>2 else 4;view=args[3]if len(args)>3 else'front-close'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'wrong-origin-anatomical-states.blend'))
source=json.load(open(OUT/'anatomy.json'));clips=json.load(open(ROOT/'artifacts/bus-woman-production/clips.json'))
clip=next(c for c in clips if c['mode']==mode);idx=min(range(len(clip['times'])),key=lambda i:abs(clip['times'][i]-seconds));pose=clip['poses'][idx]
production=OUT/'production-pose-snapshots.json';sample=None
if production.exists():
 samples=json.load(open(production))['samples'];sample=next((s for s in samples if s['stage']==stage and s['mode']==mode and abs(s['seconds']-seconds)<.0001),None)
 if sample:pose=sample['pose']
if stage>=3 and not sample:raise RuntimeError('Late source proof requires exact production fixed-wrist pose snapshot')
bones={b['name']:b for b in source['bones']}
for ob in list(bpy.data.objects):
 if ob.type!='MESH':ob.hide_render=True;continue
 visible=ob.get('wrong_origin_state')==stage;ob.hide_render=not visible;ob.hide_viewport=not visible
 if not visible:continue
 ob.parent=None;ob.modifiers.clear()
 for vertex in ob.data.vertices:
  point=Vector(vertex.co);result=Vector((0,0,0));total=0
  for group in vertex.groups:
   name=ob.vertex_groups[group.group].name;joint=pose['joints'][name];q=joint['rotation'];quat=Quaternion((q[3],q[0],q[1],q[2]));result+=(quat@(point-Vector(bones[name]['head']))+Vector(joint['translation']))*group.weight;total+=group.weight
  if total:vertex.co=result/total
 ob.data.update()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=1100;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('neutral anatomical proof world');scene.world.color=(.10,.10,.10);scene.view_settings.view_transform='AgX'
def look(ob,p):
 forward=(Vector(p)-ob.location).normalized();right=forward.cross(Vector((0,1,0))).normalized();up=right.cross(forward).normalized();ob.matrix_world=Matrix(((right.x,up.x,-forward.x,ob.location.x),(right.y,up.y,-forward.y,ob.location.y),(right.z,up.z,-forward.z,ob.location.z),(0,0,0,1)))
cam=bpy.data.cameras.new('anatomical proof camera');co=bpy.data.objects.new('anatomical proof camera',cam);scene.collection.objects.link(co)
co.location=(4.3,1.4,-.25)if view.startswith('side')else(2.8,1.4,-3.4)if view.startswith('three-quarter')else(0,1.4,-4.3)
look(co,(.03,1.17 if'close'in view else .90,-.04));cam.type='ORTHO';cam.ortho_scale=1.15 if'close'in view else 1.95;scene.camera=co
for name,location,power,size in [('key',(-2.5,3,-3),650,3),('fill',(3,2,-2),350,3),('rim',(0,3,2),500,2)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=location;look(ob,(0,1,0))
scene.render.filepath=str(OUT/f'proof-stage-{stage}-{mode}-{seconds:g}-{view}.png');bpy.ops.render.render(write_still=True)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
Path(scene.render.filepath+'.json').write_text(json.dumps(dict(stage=stage,mode=mode,seconds=seconds,view=view,poseSource='production Wrong origin fixed-wrist solver'if sample else'canonical clip',stretch=sample['stretch']if sample else None,assetSHA256=sha(ROOT/'public/assets/outskirts-bus-woman-wrong-origin.glb'),anatomySHA256=sha(OUT/'anatomy.json'),blendSHA256=sha(OUT/'wrong-origin-anatomical-states.blend'),productionPosesSHA256=sha(production)if sample else None,imageSHA256=sha(Path(scene.render.filepath))),indent=2)+'\n')
