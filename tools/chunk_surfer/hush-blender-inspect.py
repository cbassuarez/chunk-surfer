"""Read-only CPU inspection of the retained authoring scene. No render/save."""
import bpy,json,os,hashlib
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
path=os.path.join(root,'assets/source/pressure-character.blend')
bpy.ops.wm.open_mainfile(filepath=path)
arms=[o for o in bpy.data.objects if o.type=='ARMATURE']
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('pressure_body')]
def vec(v):return [float(x) for x in v]
out={'kind':'hush-blender-authoring-audit','blender':bpy.app.version_string,'sourceSha256':hashlib.sha256(open(path,'rb').read()).hexdigest(),'sceneFPS':bpy.context.scene.render.fps,'armatures':[],'meshes':[],'actions':[]}
for a in arms:
 out['armatures'].append({'name':a.name,'matrixWorld':[vec(row)for row in a.matrix_world],'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'headLocal':vec(b.head_local),'tailLocal':vec(b.tail_local),'length':b.length,'useDeform':b.use_deform,'useConnect':b.use_connect,'matrixLocal':[vec(row)for row in b.matrix_local],'constraints':[{'type':c.type,'name':c.name,'mute':c.mute}for c in a.pose.bones[b.name].constraints]}for b in a.data.bones],'nla':[{'name':t.name,'mute':t.mute,'strips':[{'name':s.name,'action':s.action.name if s.action else None,'frameStart':s.frame_start,'frameEnd':s.frame_end}for s in t.strips]}for t in a.animation_data.nla_tracks]if a.animation_data else[]})
for o in meshes:
 out['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'groups':len(o.vertex_groups),'modifiers':[{'name':m.name,'type':m.type,'use_deform_preserve_volume':getattr(m,'use_deform_preserve_volume',None)}for m in o.modifiers],'shapeKeys':[{'name':k.name,'sliderMin':k.slider_min,'sliderMax':k.slider_max,'muted':k.mute}for k in o.data.shape_keys.key_blocks]if o.data.shape_keys else[],'constraints':[c.type for c in o.constraints],'drivers':[d.data_path for d in o.data.shape_keys.animation_data.drivers]if o.data.shape_keys and o.data.shape_keys.animation_data else[]})
for a in bpy.data.actions:
 curves=[]
 try:curves=list(a.fcurves)
 except:pass
 out['actions'].append({'name':a.name,'frameRange':vec(a.frame_range),'curves':len(curves),'curveProperties':sorted(set(c.data_path for c in curves)),'interpolations':sorted(set(k.interpolation for c in curves for k in c.keyframe_points))})
dest=os.path.join(root,'artifacts/hush-motion-study/rig');os.makedirs(dest,exist_ok=True)
open(os.path.join(dest,'blender-authoring-audit.json'),'w').write(json.dumps(out,indent=2)+'\n')
print(json.dumps({'armatures':[{'name':a['name'],'bones':len(a['bones']),'tracks':len(a['nla'])}for a in out['armatures']],'meshes':out['meshes'],'actions':[{k:v for k,v in a.items()if k!='curveProperties'}for a in out['actions']]},indent=2))
