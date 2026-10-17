"""Annotate frozen material controls without changing RGB, type or geometry."""
from pathlib import Path
from PIL import Image
import hashlib,io,json,struct

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'public/assets/lettering-production';OUT.mkdir(parents=True,exist_ok=True)
records=[]
for filename in ['signs','polarity']:
    data=(ROOT/f'public/assets/lettering-study/{filename}.glb').read_bytes()
    length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);start=20+length
    size=struct.unpack_from('<I',data,start)[0]
    binary=bytearray(data[start+8:start+8+size][:doc['buffers'][0]['byteLength']])
    for material in doc['materials']:
        name=material.get('name','')
        if 'physical print' not in name:continue
        kind='placard' if name.startswith('placard') else 'services'
        variant='type-flat' if 'type-flat' in name else 'fabricated'
        maskpath=ROOT/f'public/assets/lettering-study/{kind}-{variant}-mask.png'
        texture=doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
        image=doc['images'][texture['source']];view=doc['bufferViews'][image['bufferView']]
        raw=bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
        rgb=Image.open(io.BytesIO(raw)).convert('RGB');mask=Image.open(maskpath).convert('L')
        assert rgb.size==mask.size
        rgba=rgb.convert('RGBA');rgba.putalpha(mask)
        assert rgba.convert('RGB').tobytes()==rgb.tobytes()
        output=io.BytesIO();rgba.save(output,format='PNG');png=output.getvalue()
        while len(binary)%4:binary.append(0)
        image['bufferView']=len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(png)})
        binary.extend(png)
        polarity='light-on-dark' if kind=='services' and filename=='signs' else 'dark-on-light'
        material.setdefault('extras',{})['printedSurface']={'version':1,'coverage':'baseColorAlpha',
            'polarity':polarity,'process':'controlled frozen study face','emission':'none'}
        records.append({'pack':filename,'material':name,'rgbIdentical':True,'polarity':polarity,
            'maskSha256':hashlib.sha256(maskpath.read_bytes()).hexdigest()})
    doc['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(doc,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    (OUT/f'{filename}-printed.glb').write_bytes(result)
(OUT/'probe-manifest.json').write_text(json.dumps({'purpose':'Renderer operator ablation, not production replacement','faces':records},indent=2)+'\n')
print(json.dumps({'annotatedFaces':len(records),'rgbPreserved':True}))
