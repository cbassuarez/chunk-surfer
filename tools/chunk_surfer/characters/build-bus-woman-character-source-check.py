"""Check the retained editable workfile against the exact production samples."""
import bpy,json,math,hashlib,shutil
from pathlib import Path
from mathutils import Vector,Quaternion
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'artifacts/bus-woman-production'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'bus-woman-character.blend'))
data=json.load(open(OUT/'anatomy.json'));clips=json.load(open(OUT/'clips.json'));rig=bpy.data.objects['bus_woman_rig'];scene=bpy.context.scene
actual_tracks=[track.name for track in rig.animation_data.nla_tracks]
assert actual_tracks==[clip['name']for clip in clips],('Editable takes missing or reordered',actual_tracks)
max_error=0;checks=0
for clip in clips:
 for ob in bpy.data.objects:
  if ob.animation_data:
   for track in ob.animation_data.nla_tracks:track.mute=track.name!=clip['name']
 for index in [0,len(clip['times'])//2,len(clip['times'])-1]:
  scene.frame_set(1+round(clip['times'][index]*30));bpy.context.view_layer.update();pose=clip['poses'][index]
  for bone in data['bones']:
   name=bone['name'];pb=rig.pose.bones[name];skin=pb.matrix@rig.data.bones[name].matrix_local.inverted();p=pose['joints'][name];q=p['rotation'];rotation=Quaternion((q[3],q[0],q[1],q[2]));head=Vector(bone['head'])
   for offset in [(0,0,0),(.1,0,0),(0,.1,0),(0,0,.1)]:
    point=head+Vector(offset);expected=Vector(p['translation'])+rotation@Vector(offset);error=(skin@point-expected).length;max_error=max(max_error,error);checks+=1
  for kind in ['bag','ticket']:
   for mesh in data[kind]['meshes']:
    ob=bpy.data.objects[mesh['name']];p=pose['attachments'][kind];max_error=max(max_error,(ob.location-Vector(p['translation'])).length);checks+=1
assert max_error<.00001,('Editable source pose differs from production sampler',max_error)
blend=OUT/'bus-woman-character.blend';glb=ROOT/'public/assets/bus-woman-character.glb'
report=dict(passed=True,blender=bpy.app.version_string,bodyActions=actual_tracks,bodyJoints=len(data['bones']),sampledTransformChecks=checks,maxEditableTransformErrorMetres=max_error,editableSourceBytes=blend.stat().st_size,editableSourceSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),shippedAssetSha256=hashlib.sha256(glb.read_bytes()).hexdigest())
(OUT/'editable-source-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
provenance=json.load(open(OUT/'provenance.json'));provenance['production']=dict(design=data['design'],asset='public/assets/bus-woman-character.glb',assetSha256=report['shippedAssetSha256'],editableSource='artifacts/bus-woman-production/bus-woman-character.blend',editableSourceSha256=report['editableSourceSha256'],clips=actual_tracks,bodyJoints=len(data['bones']),note='Nine finite sampled takes; same canonical body in both existing appearance aliases. Overlapping misfastened placket, physical pocket cavities and exposed lower-chest ready ticket verified. No scene placements authored.')
(OUT/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n');shutil.copyfile(OUT/'provenance.json',ROOT/'public/assets/bus-woman-character/provenance.json')
