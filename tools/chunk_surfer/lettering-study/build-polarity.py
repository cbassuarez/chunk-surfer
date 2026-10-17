#!/usr/bin/env python3
"""Controlled material-polarity experiment; never writes the frozen study pack.

The designed narrow lettering, physical board, manufacture noise, wear, normal
and roughness are identical. Only the enamel-ground and pigment albedo change.
"""
import copy, hashlib, importlib.util, json, struct
from pathlib import Path
import numpy as np

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('frozen_lettering_build',HERE/'build.py')
build=importlib.util.module_from_spec(spec);spec.loader.exec_module(build)
ROOT=build.ROOT;OUT=ROOT/'public/assets/lettering-study'
def sha(data):return hashlib.sha256(data).hexdigest()
frozenPaths=['src/render/lettering-study.js','tools/chunk_surfer/lettering-study/build.py',
 'public/assets/lettering-study/signs.glb','public/assets/lettering-study/manifest.json']
before={p:sha((ROOT/p).read_bytes()) for p in frozenPaths}

# Palette interception is deliberately local to the two explicit color vectors.
# All geometry, random draws and fabrication/process masks use the frozen code.
originalArray=build.np.array
def recoloredArray(value,*args,**kwargs):
    if isinstance(value,list) and value==[37,49,43.]:value=[219,217,193.]
    elif isinstance(value,list) and value==[221,218,192.]:value=[24,31,27.]
    return originalArray(value,*args,**kwargs)
build.np.array=recoloredArray
try:textures,metrics=build.texture_set('services',build.CASES['services'],True)
finally:build.np.array=originalArray
for role in ['normal','orm','mask']:
    existing=(OUT/('services-fabricated-'+role+'.png')).read_bytes()
    if textures[role]!=existing:raise ValueError('Polarity control changed frozen '+role)
(OUT/'services-light-enamel-albedo.png').write_bytes(textures['albedo'])

blob=(OUT/'signs.glb').read_bytes();jsonlen=struct.unpack_from('<I',blob,12)[0]
source=json.loads(blob[20:20+jsonlen]);binary=blob[28+jsonlen:]
mesh=next(m for m in source['meshes'] if m['name']=='lettering_study_services_fabricated')
writer=build.Writer();accessorMap={};materialMap={};textureMap={}
def cloneAccessor(index):
    if index in accessorMap:return accessorMap[index]
    a=source['accessors'][index];v=source['bufferViews'][a['bufferView']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    if v.get('byteStride',width*np.dtype(dtype).itemsize)!=width*np.dtype(dtype).itemsize:raise ValueError('Unexpected interleaved source accessor')
    values=np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=v.get('byteOffset',0)+a.get('byteOffset',0))
    result=writer.accessor(values,a['type'],a['componentType'],v.get('target'));accessorMap[index]=result;return result
def cloneTexture(index,role):
    key=(index,role)
    if key in textureMap:return textureMap[key]
    if role=='albedo':data=textures['albedo']
    else:
        image=source['images'][source['textures'][index]['source']];v=source['bufferViews'][image['bufferView']]
        data=binary[v['byteOffset']:v['byteOffset']+v['byteLength']]
        if data!=textures[role]:raise ValueError('Frozen embedded '+role+' differs from source process PNG')
    result=writer.image(data,'services light enamel '+role);textureMap[key]=result;return result
def cloneMaterial(index):
    if index in materialMap:return materialMap[index]
    material=copy.deepcopy(source['materials'][index]);pbr=material.get('pbrMetallicRoughness',{})
    if 'baseColorTexture' in pbr:
        pbr['baseColorTexture']['index']=cloneTexture(pbr['baseColorTexture']['index'],'albedo')
        pbr['metallicRoughnessTexture']['index']=cloneTexture(pbr['metallicRoughnessTexture']['index'],'orm')
        material['normalTexture']['index']=cloneTexture(material['normalTexture']['index'],'normal')
        material['name']='services light enamel physical print'
        material['extras']['polarityExperiment']='Albedo palette only; substrate process, wear, normal and ORM unchanged'
    result=writer.material(material);materialMap[index]=result;return result
primitives=[]
for p in mesh['primitives']:
    primitives.append(dict(attributes={k:cloneAccessor(v) for k,v in p['attributes'].items()},
        indices=cloneAccessor(p['indices']),material=cloneMaterial(p['material'])))
extras=copy.deepcopy(mesh['extras']);extras['variant']='light-enamel';extras['polarityControl']='cream enamel ground / dark pigment; albedo only'
writer.mesh('lettering_study_services_light_enamel',primitives,extras)
new=writer.save(OUT/'polarity.glb')
after={p:sha((ROOT/p).read_bytes()) for p in frozenPaths}
if before!=after:raise ValueError('Polarity experiment changed frozen study inputs')
manifest=dict(version=1,mesh='lettering_study_services_light_enamel',sourceMesh='lettering_study_services_fabricated',
 copy='STUDIOS / PLANT',variant='light-enamel',process='screen-printed vitreous enamel',
 control='Only substrate/pigment albedo constants change; exactly the same condensed outlines, spacing, geometry, mounting, normal, ORM and wear field.',
 paletteSRGB=dict(substrate=[219,217,193],ink=[24,31,27]),metrics=metrics,
 unchangedMasks={role:sha(textures[role]) for role in ['normal','orm','mask']},
 albedoSha256=sha(textures['albedo']),glbSha256=sha(new),glbBytes=len(new),
 sourceHashes=before,frozenInputsUnchanged=True,textureSizes=metrics['textureSizes'],
 limitations=['This is a controlled plausible polarity study, not a historical facsimile or a new human-reading result.'])
(OUT/'polarity-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(mesh=manifest['mesh'],bytes=len(new),sha256=sha(new),frozenInputsUnchanged=True,unchangedMasks=list(manifest['unchangedMasks']))))
