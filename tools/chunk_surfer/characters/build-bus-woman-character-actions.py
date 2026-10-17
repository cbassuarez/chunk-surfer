"""Retain all production samples as editable Blender actions and NLA takes.
The saved rest geometry, weights and anatomical hierarchy remain editable.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'artifacts/bus-woman-production'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'bus-woman-character.blend'))
data=json.load(open(OUT/'anatomy.json'));clips=json.load(open(OUT/'clips.json'))
rig=bpy.data.objects['bus_woman_rig'];scene=bpy.context.scene;scene.render.fps=30
for ob in bpy.data.objects:ob.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
rest={b['name']:b for b in data['bones']}
accessories={kind:[bpy.data.objects[m['name']]for m in data[kind]['meshes']]for kind in ['bag','ticket']}
def transform(translation,rotation):return Matrix.Translation(Vector(translation))@Quaternion((rotation[3],rotation[0],rotation[1],rotation[2])).to_matrix().to_4x4()
def retain_action(ob,action,clip):
 for curve in action.fcurves:
  for point in curve.keyframe_points:point.interpolation='LINEAR'
 ob.animation_data.action=None;track=ob.animation_data.nla_tracks.new();track.name=clip['name'];strip=track.strips.new(clip['name'],1,action);track.mute=True
for clip in clips:
 rig.animation_data_create();action=bpy.data.actions.new(clip['name']);rig.animation_data.action=action
 for index,(time,pose)in enumerate(zip(clip['times'],clip['poses'])):
  frame=1+round(time*30);scene.frame_set(frame)
  for bone in data['bones']:
   name=bone['name'];pb=rig.pose.bones[name];pb.rotation_mode='QUATERNION';p=pose['joints'][name]
   pb.matrix=transform(p['translation'],p['rotation'])@Matrix.Translation(-Vector(bone['head']))@rig.data.bones[name].matrix_local
   bpy.context.view_layer.update()
   for prop in ['location','rotation_quaternion','scale']:pb.keyframe_insert(data_path=prop,frame=frame,group=name)
 retain_action(rig,action,clip)
 for kind,objects in accessories.items():
  for ob in objects:
   ob.animation_data_create();action=bpy.data.actions.new(clip['name']+'__'+ob.name);ob.animation_data.action=action;ob.rotation_mode='QUATERNION'
   for time,pose in zip(clip['times'],clip['poses']):
    frame=1+round(time*30);p=pose['attachments'][kind];q=p['rotation'];ob.location=p['translation'];ob.rotation_quaternion=(q[3],q[0],q[1],q[2]);ob.hide_render=not p['visible']
    ob.keyframe_insert(data_path='location',frame=frame);ob.keyframe_insert(data_path='rotation_quaternion',frame=frame);ob.keyframe_insert(data_path='hide_render',frame=frame)
   retain_action(ob,action,clip)
# Open in the canonical waiting pose, with every finite take available in NLA.
rig.animation_data.nla_tracks[0].mute=False
for objects in accessories.values():
 for ob in objects:ob.animation_data.nla_tracks[0].mute=False
scene.frame_start=1;scene.frame_end=181;scene.frame_set(1)
# Plain studio viewport, metrically labelled Y-up character. Rig stays visible.
rig.show_in_front=True;rig.data.display_type='STICK';scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'bus-woman-character.blend'))
print(json.dumps({'editable_actions':[clip['name']for clip in clips],'body_joints':len(data['bones']),'saved':str(OUT/'bus-woman-character.blend')}))
