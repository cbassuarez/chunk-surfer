#!/usr/bin/env python3
"""Finish the frozen renderer evidence with decoded frames, never a new render."""
from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,subprocess,sys
import numpy as np

root=Path(sys.argv[1]).resolve();records=[];contact=Image.new('RGB',(1440,1950),'#171917');draw=ImageDraw.Draw(contact)
row=0
for case in ['dock-approach-s1','vigil-walkby-s1','dock-stationary-s1']:
 for arm in ['baseline','candidate']:
  folder=root/arm/case;video=folder/'offline60fps.webm';draw.text((10,row*325+5),f'{case} | {arm} | decoded native960x600; contact previews50%',fill='#eeeee5')
  for col,index in enumerate([0,30,60]):
   output=folder/'stills'/f'{index:03}-decoded.png'
   subprocess.run(['/opt/homebrew/bin/ffmpeg','-loglevel','error','-y','-i',str(video),'-vf',f'select=eq(n\\,{index})','-frames:v','1',str(output)],check=True)
   actual=np.asarray(Image.open(output).convert('RGB'));original=np.asarray(Image.open(folder/'stills'/f'{index:03}-native.png').convert('RGB'))
   error=int(np.abs(actual.astype(int)-original.astype(int)).max());assert error==0,(arm,case,index,error)
   records.append(dict(arm=arm,case=case,index=index,simulatedSeconds=index/60,decodedFile=str(output.relative_to(root)),sha256=hashlib.sha256(output.read_bytes()).hexdigest(),maxRgbError=error))
   contact.paste(Image.fromarray(actual).resize((480,300),Image.Resampling.NEAREST),(col*480,row*325+25))
  row+=1
contact.save(root/'decoded-contact.png')
videos=[]
for arm in ['baseline','candidate']:
 report=json.loads((root/arm/'report.json').read_text())
 for clip in report['clips']:
  video=Path(clip['video']);videos.append(dict(arm=arm,case=clip['id'],file=str(video.relative_to(root)),sha256=hashlib.sha256(video.read_bytes()).hexdigest(),frames=clip['samples'],frameRate='60/1',simulatedSpanSeconds=clip['simulatedSpanSeconds'],encodedDurationSeconds=clip['encodedDurationSeconds']))
result=dict(method='Decoded actual offline losslessRGBVP9 videos at frames0/30/60 and compared every native960x600RGB pixel with original renderer PNGs. Contact sheet is50%nearest-neighbour preview; native decoded files are acceptance views.',decodedFrames=records,videos=videos,allNativeDecodedFramesExactlyEqual=True,analysisScriptSha256=hashlib.sha256(Path('tools/chunk_surfer/lettering-production/analyze-print-motion.py').read_bytes()).hexdigest())
(root/'decoded-proof.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(decodedFrames=len(records),allMaxRgbError=0,contact=str(root/'decoded-contact.png'))))
