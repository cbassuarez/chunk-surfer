#!/usr/bin/env python3
"""Bounded official BodyParts3D OBJ acquisition using ZIP byte ranges.
Only selected parenchyma / cardiac-wall members are fetched, never the archive.
"""
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
import struct
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parent
BASE = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
ARCHIVE = BASE+'partof_BP3D_4.0_obj_99.zip'
LICENSE = 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html'
BUDGET = 6*1024*1024


def get(url, limit, byte_range=None):
    headers={'User-Agent':'Mozilla/5.0','Accept-Encoding':'identity'}
    if byte_range:headers['Range']='bytes='+byte_range
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as r:
        if byte_range and r.status!=206:raise RuntimeError('Server did not honour bounded Range')
        data=r.read(limit+1)
        if len(data)>limit:raise RuntimeError('Response exceeded bounded request')
        return data,dict(r.headers)


def sha(data):return hashlib.sha256(data).hexdigest()


def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    metadata={}
    for name,url,limit in [
        ('official-license.html',LICENSE,200000),
        ('partof_element_parts.txt',BASE+'partof_element_parts.txt',800000),
        ('partof_parts_list_e.txt',BASE+'partof_parts_list_e.txt',150000),
    ]:
        data,headers=get(url,limit)
        (ROOT/name).write_bytes(data)
        metadata[name]={'url':url,'sha256':sha(data),'bytes':len(data),'lastModified':headers.get('Last-Modified')}
    licence=(ROOT/'official-license.html').read_text()
    if 'Attribution 4.0 International' not in licence:raise RuntimeError('Current primary CC BY 4.0 evidence missing')
    rows=[line.split('\t') for line in (ROOT/'partof_element_parts.txt').read_text().splitlines()[1:]]
    by_id={}
    for fma,name,element in rows:by_id.setdefault(element,[]).append({'fma':fma,'name':name})
    group_fma={'left-lung':'FMA7310','right-lung':'FMA7309','heart':'FMA7088',
       'axis-sternum':'FMA7485','axis-vertebra':'FMA9945','axis-left-rib':'FMA8256',
       'axis-right-rib':'FMA8229','axis-upper':'FMA9165','axis-lower':'FMA10081'}
    # Broad systemic arterial/venous ancestors also contain the ventricular
    # walls. Exclude concrete vessel/airway and intracardiac-content parts,
    # rather than those parent systems.
    unwanted=re.compile(r'\bartery\b|\bvein\b|arterial tree|venous tree|bronchial|tracheobronchial|bronchus|valve',re.I)
    groups={}
    for group,fma in group_fma.items():
        candidates=[e for e,names in by_id.items() if any(n['fma']==fma for n in names)]
        if group.startswith('axis-'):
            chosen=candidates[:1]
        elif group=='heart':
            chosen=[e for e in candidates
               if any(re.search(r'myocardium|wall of |auricle|epicardium',n['name'],re.I) for n in by_id[e])
               and not any(n['name'].startswith('cavity of ') for n in by_id[e])]
        else:
            chosen=[e for e in candidates if not any(unwanted.search(n['name']) for n in by_id[e])]
        if not chosen and not group.endswith('lung'):raise RuntimeError('No anatomy elements selected for '+group)
        groups[group]=chosen
    tail,headers=get(ARCHIVE,65536,'-65536')
    end=tail.rfind(b'PK\x05\x06')
    if end<0:raise RuntimeError('ZIP end directory missing')
    eocd=struct.unpack_from('<4s4H2IH',tail,end)
    cd_size,cd_offset=eocd[5],eocd[6]
    if cd_size>256000:raise RuntimeError('Directory too large for bounded acquisition')
    directory,_=get(ARCHIVE,cd_size,f'{cd_offset}-{cd_offset+cd_size-1}')
    catalog={};cursor=0
    while cursor<len(directory):
        row=struct.unpack_from('<4s6H3I5H2I',directory,cursor)
        if row[0]!=b'PK\x01\x02':raise RuntimeError('Bad ZIP directory entry')
        nlen,xlen,clen=row[10:13]
        name=directory[cursor+46:cursor+46+nlen].decode('utf8')
        catalog[Path(name).stem]={'member':name,'method':row[4],'crc32':row[7],
           'compressedBytes':row[8],'uncompressedBytes':row[9],'localHeaderOffset':row[16]}
        cursor+=46+nlen+xlen+clen
    ids=sorted({e for group in groups.values() for e in group})
    expected=sum(catalog[e]['compressedBytes'] for e in ids)
    if expected>BUDGET:raise RuntimeError(f'Selected members exceed 6 MiB compressed budget: {expected}')
    print(json.dumps({'groups':groups,'members':len(ids),'compressedBytes':expected,'archiveDownloaded':False}),flush=True)
    (ROOT/'bodyparts3d-obj').mkdir(exist_ok=True)

    def download(element):
        item=catalog[element];offset=item['localHeaderOffset']
        h,_=get(ARCHIVE,30,f'{offset}-{offset+29}')
        header=struct.unpack('<4s5H3I2H',h)
        if header[0]!=b'PK\x03\x04':raise RuntimeError('Bad member header')
        begin=offset+30+header[9]+header[10];size=item['compressedBytes']
        compressed,_=get(ARCHIVE,size,f'{begin}-{begin+size-1}')
        data=zlib.decompress(compressed,-15) if item['method']==8 else compressed
        if len(data)!=item['uncompressedBytes'] or zlib.crc32(data)!=item['crc32']:raise RuntimeError('Member integrity failed '+element)
        path=ROOT/'bodyparts3d-obj'/(element+'.obj');path.write_bytes(data)
        return {'element':element,**item,'localPath':str(path.relative_to(ROOT)),
           'sha256':sha(data),'groups':[g for g,els in groups.items() if element in els],
           'officialNames':by_id[element],
           'acquisition':{'url':ARCHIVE,'range':[begin,begin+size-1],'crc32Verified':True}}
    with ThreadPoolExecutor(max_workers=4) as pool:members=list(pool.map(download,ids))
    manifest={'schemaVersion':1,'recordedAtUtc':datetime.now(timezone.utc).isoformat(),
      'source':'BodyParts3D 4.0 original archive / Database Center for Life Science',
      'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/',
      'officialLicenseUrl':LICENSE,'officialLicenseUpdated':'2025-02-27',
      'requiredCredit':'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
      'originalArchiveUrl':ARCHIVE,'metadata':metadata,'groups':groups,'members':members,
      'boundedAcquisition':{'archiveDownloaded':False,'archiveDirectoryBytes':cd_size,'tailBytes':len(tail),
        'selectedCompressedBytes':expected,'compressedBudgetBytes':BUDGET,'http206Required':True,
        'uncompressedBytes':sum(m['uncompressedBytes'] for m in members)},
      'adaptations':'Original OBJ members retained unchanged. Selection excludes internal airway/vascular trees, valves and chamber contents; conversion is separate.',
      'unavailableLungParenchyma':'The official PART-OF lung compounds map to airway/vascular elements, not outer pleural lobe surfaces. Empty lung groups are deliberate; no synthetic lung is claimed as a source mesh.',
      'notClaimed':['raw scan acquisition','clinical accuracy','physical physiology simulation','CC0 status']}
    (ROOT/'bodyparts3d-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    (ROOT/'LICENSE.BODYPARTS3D.md').write_text('# BodyParts3D original anatomy meshes\n\n'+manifest['requiredCredit']+'\n\nSource: '+ARCHIVE+'\n\nCurrent primary archive licence: '+LICENSE+' (updated 2025-02-27). Creative Commons Attribution 4.0 International: https://creativecommons.org/licenses/by/4.0/ .\n\nOnly selected original OBJ members were acquired by HTTP byte ranges; the archive was not downloaded. Exact element names, ranges, hashes and unchanged-original status are in bodyparts3d-manifest.json. Any game adaptation must retain attribution and identify its changes. No maker endorsement is implied.\n')
    print(json.dumps({'acquiredMembers':len(members),'compressedBytes':expected,'output':str(ROOT/'bodyparts3d-manifest.json')}))


if __name__=='__main__':main()
