"""Index real production captures; resized thumbnails are not reading tests."""
import json, math
from pathlib import Path
import hashlib
from PIL import Image, ImageDraw
folder=Path('artifacts/lettering-production/evidence')
report=json.loads((folder/'capture-index.json').read_text())
frames=[f for f in report['frames'] if f.get('asset',f.get('evidence',{}).get('asset'))=='production' and f.get('mode',f.get('evidence',{}).get('mode'))==3 and f.get('evidence',{}).get('stage')=='final']
for frame in frames:frame['_folder']=str(folder)
updates={}
correction=folder/'fixture-corrections'/'capture-index.json'
if correction.exists():
 for frame in json.loads(correction.read_text())['frames']:
  if frame.get('asset')=='production' and frame.get('mode')==3 and frame.get('evidence',{}).get('stage')=='final':
   frame['_folder']=str(correction.parent);updates[frame.get('faceId') or frame['id']]=frame
qa=folder/'final-ui'/'report.json'
if qa.exists():
 data=json.loads(qa.read_text())
 for frame in data.get('contexts',[]):
  updates[frame['id']]={**frame,'_folder':str(qa.parent),'distance':3}
 for frame in data.get('undersides',[]):
  updates[frame['faceId']]={**frame,'file':frame['final'],'_folder':str(qa.parent),'distance':.35}
frames=[updates.get(frame.get('faceId') or frame['id'],frame) for frame in frames]
width,height,cols=240,196,6
sheet=Image.new('RGB',(width*cols,height*math.ceil(len(frames)/cols)+48),(18,24,19));draw=ImageDraw.Draw(sheet)
draw.text((10,10),'Actual final output / documented mixed capture versions / thumbnails are not reading tests',fill=(223,229,210))
for i,frame in enumerate(frames):
 x=(i%cols)*width;y=48+(i//cols)*height
 image=Image.open(Path(frame['_folder'])/frame['file']).convert('RGB');image.thumbnail((232,145),Image.Resampling.LANCZOS)
 sheet.paste(image,(x+4,y));label=frame.get('faceId') or frame['id']
 draw.text((x+4,y+148),label[:34],fill=(223,229,210))
 draw.text((x+4,y+164),f"{frame['distance']:.2f}m / native {frame['evidence']['acquisition'].get('sceneWidth','?')}px",fill=(164,183,154))
sheet.save(folder/'inspection-index.jpg',quality=90)
(folder/'inspection-index-sources.json').write_text(json.dumps([dict(id=f.get('faceId') or f['id'],file=str(Path(f['_folder'])/f['file']),sha256=hashlib.sha256((Path(f['_folder'])/f['file']).read_bytes()).hexdigest(),pack=f['evidence']['packSha256'],distance=f['distance']) for f in frames],indent=2)+'\n')
print(f'{len(frames)} native production frames indexed (thumbnails only)')
