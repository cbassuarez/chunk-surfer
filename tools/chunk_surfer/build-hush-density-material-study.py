"""Material-zone study from the selected density's exact exported geometry.
Original asset stays untouched. No final shader expression is modified.
"""
from pathlib import Path
import json,struct,math,hashlib,array,sys
out=Path(__file__).resolve().parents[2]/'artifacts/hush-density-study'
source=out/'density-study.glb';raw=source.read_bytes()
n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);at=20+n
size=struct.unpack_from('<I',raw,at)[0];original_bin=raw[at+8:at+8+size];blob=bytearray(original_bin)
primitive=doc['meshes'][0]['primitives'][0]
def values(index,kind):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 if v.get('byteStride'):raise ValueError('unexpected interleaved source')
 width={'VEC3':3,'SCALAR':1}[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0)
 z=array.array(kind);z.frombytes(original_bin[start:start+a['count']*width*z.itemsize])
 if sys.byteorder!='little':z.byteswap()
 return z
p=values(primitive['attributes']['POSITION'],'f');norm=values(primitive['attributes']['NORMAL'],'f')
indices=values(primitive['indices'],'I');returned=[];core=[]
for offset in range(0,len(indices),3):
 tri=indices[offset:offset+3];cx=sum(p[i*3]for i in tri)/3;cy=sum(p[i*3+1]for i in tri)/3
 nx=sum(norm[i*3]for i in tri)/3;ny=sum(norm[i*3+1]for i in tri)/3;nz=sum(norm[i*3+2]for i in tri)/3
 inward=(-1 if cx>.04 else 1)*nx
 target=returned if inward>.43 and abs(ny)<.58 and nz<.28 and cy>.20 else core
 target.extend(tri)
def add_indices(indices):
 while len(blob)%4:blob.append(0)
 start=len(blob);packed=struct.pack('<'+'I'*len(indices),*indices);blob.extend(packed)
 vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(packed),'target':34963})
 ai=len(doc['accessors']);doc['accessors'].append({'bufferView':vi,'componentType':5125,'count':len(indices),'type':'SCALAR','min':[min(indices)],'max':[max(indices)]});return ai
def material(name,color):
 i=len(doc['materials']);doc['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':0,'roughnessFactor':.93},'alphaMode':'OPAQUE','extras':{'studyOnly':True}});return i
mi=material('density sparse inner return',[.28,.29,.28]);di=material('density neutral construction',[.32,.325,.32])
original_node=next(i for i,n in enumerate(doc['nodes'])if n.get('mesh')==0)
parent=next(i for i,n in enumerate(doc['nodes'])if original_node in n.get('children',[]))
def mesh(name,selected,mat):
 pr=json.loads(json.dumps(primitive));pr['indices']=add_indices(selected);pr['material']=mat
 idx=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':[pr]})
 node=json.loads(json.dumps(doc['nodes'][original_node]));node.update(name=name,mesh=idx)
 ni=len(doc['nodes']);doc['nodes'].append(node);doc['nodes'][parent].setdefault('children',[]).append(ni)
mesh('density_core',core,primitive.get('material',0));mesh('density_return',returned,mi);mesh('density_neutral_shell',list(indices),di)
doc['buffers'][0]['byteLength']=len(blob)
doc['asset'].setdefault('extras',{})['materialStudy']={'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceUnchanged':True,'proposal':'Paired real surface zones. Sparse inward faces return light, complementary faces retain the current unlit negative material. Original full pressure_body remains for comparison.','returnTriangles':len(returned)//3,'coreTriangles':len(core)//3}
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4)
result=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
target=out/'density-material-study.glb';target.write_bytes(result)
receipt={'kind':'density-material-zones','source':str(source),'sourceSha256':hashlib.sha256(raw).hexdigest(),'output':str(target),'outputSha256':hashlib.sha256(result).hexdigest(),'originalBinaryPrefixUnchanged':bytes(blob[:len(original_bin)])==original_bin,'originalGeometryChannelsUnchanged':True,'returnedTriangleFraction':len(returned)/len(indices),'returnedTriangles':len(returned)//3,'coreTriangles':len(core)//3,'totalTriangles':len(indices)//3,'surfaceMaterials':doc['materials'],'finalShadersChanged':False,'status':'Material rule proposal only; not the production HUSH finish.'}
(out/'material-study.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:receipt[k]for k in ['returnedTriangleFraction','returnedTriangles','coreTriangles','outputSha256']}))
