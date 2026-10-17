#!/usr/bin/env python3
from PIL import Image,ImageDraw
from pathlib import Path
import json,sys
import numpy as np
root=Path(sys.argv[1]);out=Path(sys.argv[2]);contact=Path(sys.argv[3]);manifest=json.loads((root/'conservatory-props.lettering.json').read_text())
jobs={j['id']:j for j in json.loads((root/'lettering/lettering-jobs.json').read_text())['jobs']};proofs=[];views={}
def installed(file):
 p=Path(file)
 return p if p.is_file() else root/'lettering/substrates'/p.name
for entry in manifest['entries']:
 job=jobs[entry['id']]
 if not job.get('substrate'):continue
 page=manifest['pages'][entry['page']];image=Image.open(root/'lettering'/page['albedo']).convert('RGBA');w,h=image.size
 box=tuple(round(v*(w if k%2==0 else h)) for k,v in enumerate(entry['uvRect']));tile=image.crop(box);a=np.asarray(tile)
 stock=Image.open(installed(job['substrate']['albedoPath'])).convert('RGB').resize(tile.size,Image.Resampling.LANCZOS);s=np.asarray(stock);clear=a[:,:,3]==0
 difference=np.abs(a[:,:,:3].astype(int)-s.astype(int));maxdiff=int(difference[clear].max()) if np.any(clear) else -1
 if maxdiff!=0:raise ValueError(f"{entry['id']}: clear stock RGB changed by {maxdiff}/255")
 edges=np.zeros(clear.shape,dtype=bool);edges[[0,-1],:]=True;edges[:,[0,-1]]=True;clearEdges=clear&edges
 if not np.any(clearEdges):raise ValueError(f"{entry['id']}: no clear edge pixels to inspect")
 projection=json.loads(installed(job['substrate']['projectionReport']).read_text())
 proofs.append(dict(id=entry['id'],clearRgbSamples=int(clear.sum()),clearEdgeSamples=int(clearEdges.sum()),
  maximumClearRgbError=maxdiff,maximumClearEdgeError=int(difference[clearEdges].max()),projection=projection))
 key=job['substrate']['albedoPath']
 if key not in views:views[key]=(entry['id'],stock,tile.convert('RGB'))
rows=[]
for label,stock,printed in views.values():
 row=Image.new('RGB',(1120,260),(24,25,23));d=ImageDraw.Draw(row);d.text((16,8),label+' | original UV stock / printed atlas crop',fill=(225,221,203))
 for image,x in [(stock,16),(printed,568)]:
  scale=min(536/image.width,220/image.height);size=(round(image.width*scale),round(image.height*scale));row.paste(image.resize(size,Image.Resampling.NEAREST),(x,32))
 rows.append(row)
sheet=Image.new('RGB',(1120,max(1,len(rows))*260));
for index,row in enumerate(rows):sheet.paste(row,(0,index*260))
out.parent.mkdir(parents=True,exist_ok=True);sheet.save(contact)
out.write_text(json.dumps(dict(sampledJobs=len(proofs),uniqueStockProjections=len(views),allClearRgbExact=True,allClearEdgesExact=True,
 method='Independent atlas UV crop versus exact projected original-host RGB, evaluated only where authored pigment A is zero. Separate raw nearest-neighbor contact shows original stock and printed atlas crop at matched dimensions.',proofs=proofs),indent=2)+'\n')
print(json.dumps(dict(sampledJobs=len(proofs),uniqueStockProjections=len(views),allClearRgbExact=True,contact=str(contact))))
