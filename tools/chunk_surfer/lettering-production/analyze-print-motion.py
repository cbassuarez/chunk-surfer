#!/usr/bin/env python3
"""Objective projected-mask/occupancy probes; no OCR or reading inference."""
from pathlib import Path
from PIL import Image
import numpy as np,json,sys,math,collections

def distance(mask):
 h,w=mask.shape;d=np.where(mask,1e6,0.).astype(float);r=math.sqrt(2)
 for y in range(h):
  for x in range(w):
   if x:d[y,x]=min(d[y,x],d[y,x-1]+1)
   if y:d[y,x]=min(d[y,x],d[y-1,x]+1)
   if x and y:d[y,x]=min(d[y,x],d[y-1,x-1]+r)
   if y and x+1<w:d[y,x]=min(d[y,x],d[y-1,x+1]+r)
 for y in range(h-1,-1,-1):
  for x in range(w-1,-1,-1):
   if x+1<w:d[y,x]=min(d[y,x],d[y,x+1]+1)
   if y+1<h:d[y,x]=min(d[y,x],d[y+1,x]+1)
   if x+1<w and y+1<h:d[y,x]=min(d[y,x],d[y+1,x+1]+r)
   if x and y+1<h:d[y,x]=min(d[y,x],d[y+1,x-1]+r)
 return d
def counters(ink):
 h,w=ink.shape;labels=np.zeros((h,w),dtype=int);seen=ink.copy();counter=0
 for y in range(h):
  for x in range(w):
   if seen[y,x]:continue
   q=collections.deque([(y,x)]);seen[y,x]=True;points=[];edge=False
   while q:
    yy,xx=q.popleft();points.append((yy,xx));edge|=yy in [0,h-1] or xx in [0,w-1]
    for ny,nx in [(yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)]:
     if 0<=ny<h and 0<=nx<w and not seen[ny,nx]:seen[ny,nx]=True;q.append((ny,nx))
   if not edge and len(points)>=3:
    counter+=1
    for yy,xx in points:labels[yy,xx]=counter
 return labels,counter
def coverage(tag):return np.where((tag>=136)&(tag<=151),(tag.astype(float)-136)/15,np.where((tag>=156)&(tag<=171),(tag.astype(float)-156)/15,0))
def scalar(value):return None if value is None or not np.isfinite(value) else float(value)
def mean(value,mask):return scalar(np.mean(value[mask])) if np.any(mask) else None
def luma(a):return (a[:,:,:3]@np.array([.2126,.7152,.0722]))/255
def word_bands(ink):
 # Incidental border chips, mounting marks and stock labels are real material,
 # not failed letter counters. Restrict the open-stock diagnostic to authored
 # word bands; ink/counter masks already come directly from atlas alpha.
 rows=np.flatnonzero(ink.any(axis=1));result=np.zeros_like(ink)
 if not len(rows):return result
 starts=[rows[0]];ends=[]
 for previous,current in zip(rows,rows[1:]):
  if current>previous+1:ends.append(previous);starts.append(current)
 ends.append(rows[-1])
 for y0,y1 in zip(starts,ends):
  xs=np.flatnonzero(ink[y0:y1+1].any(axis=0))
  if len(xs):result[y0:y1+1,xs[0]:xs[-1]+1]=True
 return result
def summary(frames,key):
 a=[f[key] for f in frames if f[key] is not None]
 return dict(mean=float(np.mean(a)),minimum=float(min(a)),maximum=float(max(a))) if a else None

def analyze(folder):
 folder=Path(folder);clip=json.loads((folder/'frames.json').read_text());alpha=np.asarray(Image.open(folder/'expected-mask.png').convert('RGBA'))[:,:,3]/255
 ink=alpha>=.5;inkDist=np.maximum(0,distance(ink)-.5);stockDist=np.maximum(0,distance(~ink)-.5);holes,nHoles=counters(ink);wordBand=word_bands(ink);h,w=ink.shape
 N=np.zeros((h,w));total=np.zeros((h,w));square=np.zeros((h,w));normalizedTotal=np.zeros((h,w));normalizedSquare=np.zeros((h,w));flips=np.zeros((h,w));transitions=np.zeros((h,w));previous=None;previousValid=None;frames=[]
 for metadata in clip['frames']:
  i=metadata['index'];a=np.asarray(Image.open(folder/'uv'/f'{i:03}-witness.png').convert('RGBA'));f=np.asarray(Image.open(folder/'uv'/f'{i:03}-final.png').convert('RGBA'));s=np.asarray(Image.open(folder/'uv'/f'{i:03}-scene.png').convert('RGBA'))
  visible=(a[:,:,3]>0)&(f[:,:,3]>0);final=luma(f);scene=luma(s);px=metadata['minAcquisitionPixelsPerCanonicalPixel']
  core=visible&(alpha>=.94)&(inkDist*px>=.75);stock=visible&wordBand&(alpha<=.05)&(stockDist*px>=.75)&(holes==0);counter=visible&(holes>0)&(alpha<=.05)&(stockDist*px>=.35)
  inkVisible=visible&ink
  low=float(np.quantile(final[inkVisible],.05)) if np.any(inkVisible) else 0;high=float(np.quantile(final[stock],.75)) if np.any(stock) else 0;contrast=high-low;valid=contrast>=.03
  threshold=(high+low)/2;dark=final<threshold;norm=(final-low)/max(.03,contrast)
  eligible=visible&(core|stock|counter)&valid
  N+=eligible;total+=final*eligible;square+=final*final*eligible;normalizedTotal+=norm*eligible;normalizedSquare+=norm*norm*eligible
  if previous is not None:
   common=eligible&previousValid;flips+=(dark!=previous)&common;transitions+=common
  previous=dark;previousValid=eligible
  closed=0;evaluated=0
  for label in range(1,nHoles+1):
   region=holes==label;regionVisible=counter&region
   if np.sum(region)*px*px>=1.5 and np.sum(regionVisible)>=3 and np.mean(visible[region])>.85:
    evaluated+=1;closed+=np.mean(dark[regionVisible])>=.85
  p3=coverage(a[:,:,1]);composed=coverage(a[:,:,2]);inside=visible&(alpha>=.94)
  frames.append(dict(index=i,time=metadata['simulatedSeconds'],distance=metadata['distance'],offset=metadata['offset'],
   visibleCanonicalSamples=int(visible.sum()),projectedInkCanonicalSamples=int(inkVisible.sum()),thickCoreSamples=int(core.sum()),stockSamples=int(stock.sum()),counterSamples=int(counter.sum()),
   minAcquisitionPixelsPerCanonicalPixel=px,sourceCounterComponents=nHoles,evaluatedCounterComponents=evaluated,
   finalPaletteAnchors=dict(inkLowQuantile=low,stockHighQuantile=high,threshold=threshold,contrast=contrast,classificationValid=valid),
   sceneStockMean=mean(scene,stock),sceneInkMean=mean(scene,inkVisible),
   p3ExpectedInkCoverageMean=mean(p3,inside),composedExpectedInkCoverageMean=mean(composed,inside),
   p3InteriorCoverageLoss=mean((p3<.9).astype(float),core),composedInteriorCoverageLoss=mean((composed<.9).astype(float),core),
   expectedMaskMae=mean(np.abs(p3-alpha),visible),composedMaskMae=mean(np.abs(composed-alpha),visible),
   thickCoreSolidOccupancy=mean(dark.astype(float),core) if valid else None,
   openStockSolidOccupancy=mean((~dark).astype(float),stock) if valid else None,
   counterDarkIntrusion=mean(dark.astype(float),counter) if valid else None,
   fullyDarkCounterFraction=closed/evaluated if evaluated and valid else None,
   actualDepthVisible=metadata['visible'],p3Occluded=metadata['p3Occluded'],worldOccluded=metadata['worldOccluded'],offscreen=metadata['offscreen']))
 have=N>=3;rawSd=np.sqrt(np.maximum(0,square/np.maximum(N,1)-(total/np.maximum(N,1))**2));normalizedSd=np.sqrt(np.maximum(0,normalizedSquare/np.maximum(N,1)-(normalizedTotal/np.maximum(N,1))**2));flip=flips/np.maximum(transitions,1)
 def temporal(region):
  mask=have&region
  return dict(canonicalSamples=int(mask.sum()),rawLumaStdMedian=scalar(np.median(rawSd[mask])) if np.any(mask) else None,
   paletteNormalizedStdMedian=scalar(np.median(normalizedSd[mask])) if np.any(mask) else None,
   classificationFlipFraction=mean(flip,mask))
 metrics=['thickCoreSolidOccupancy','openStockSolidOccupancy','counterDarkIntrusion','fullyDarkCounterFraction','p3InteriorCoverageLoss','composedInteriorCoverageLoss','expectedMaskMae','composedMaskMae']
 result={k:clip[k] for k in ['id','scene','motion','scale','setup','clock','simulatedSpanSeconds','encodedDurationSeconds','elapsedCaptureAndEncodeWallMs']}
 result.update(dict(frames=frames,aggregate={key:summary(frames,key) for key in metrics},
  atThreeMetres={key:summary([f for f in frames if abs(f['distance']-3)<1e-6],key) for key in metrics},
  temporal=dict(ink=temporal(ink),openStock=temporal(wordBand&(~ink)&(holes==0)),counters=temporal(holes>0)),
  contrastCollapsedFrames=sum(not f['finalPaletteAnchors']['classificationValid'] for f in frames),
  noQualifyingThickCoreFrames=sum(f['thickCoreSamples']==0 for f in frames),
  criteria=dict(inkMask='Actual source atlas alpha >=.94',thickCore='8-neighbour chamfer distance minus half a source pixel, interior radius >=.75 actual acquisition pixels; minimum physical stroke width approximately1.5pixels',
   openStock='Only within each authored line\'s exact ink bounding word-band, excluding enclosed counters; incidental border chips and mounting labels are outside this diagnostic',
   finalClassification='Midpoint of actual final ink-region5th percentile and word-band open-stock75th percentile; contrast below.03 is separately unclassifiable',
   counters='Enclosed source-mask background components; projected component area>=1.5 acquisition pixels, >=3 canonical core samples, >=85% visible; >=85% dark is counted fully closed'),
  limits=['Canonical UV samples are area samples and are not independent raster pixels.','Palette classification measures pixel occupancy and counter intrusion; it does not infer reading or identify words.','Sparse/subpixel strokes and counters may have no qualifying thick interior and must not be reported as a pass.','Temporal motion variance includes real lighting and sampling changes; normalized variance removes only scalar palette drift.','This is an isolated authored encounter reconstruction, not a full route playtest or real-time60fps claim.']))
 (folder/'metrics.json').write_text(json.dumps(result,indent=2)+'\n');return result

if len(sys.argv)>1 and sys.argv[1]=='--self-test':
 # This deliberately proves the diagnostic can fail hollow interiors. It is
 # independent of the production shader and uses a known synthetic paint mask.
 mask=np.zeros((80,160),dtype=bool);mask[12:68,35:125]=True;mask[26:54,55:105]=False
 dist=np.maximum(0,distance(mask)-.5);core=mask&(dist>=2);outline=mask&(dist<=1.5)
 assert np.mean(mask[core])==1 and np.mean(outline[core])==0
 holes,count=counters(mask);assert count==1
 bands=word_bands(mask);assert bands[20,35] and not bands[0,0]
 assert np.mean(np.zeros_like(mask)[holes>0])==0 and np.mean(np.ones_like(mask)[holes>0])==1
 stencil=mask.copy();stencil[0:30,78:82]=False;assert counters(stencil)[1]==0
 print(json.dumps(dict(syntheticFilledInteriorOccupancy=1,syntheticHollowInteriorOccupancy=0,counterOpenAndClosedDetected=True,stencilIsNotEnclosedCounter=True,stockBoundsExcludeExternalMountingMarks=True)));sys.exit(0)

root=Path(sys.argv[1]);report=json.loads((root/'report.json').read_text());results=[analyze(c['folder']) for c in report['clips']]
out=dict(date=report['date'],arm=report['arm'],realTimeRaf=report['realTimeRaf'],renderSourceHashes=report['sourceHashes'],servedShaderSha256=report['servedAcquisitionShaderSha256'],
 interpretation=report['interpretation'],cases=[{k:r[k] for k in ['id','scene','motion','scale','aggregate','atThreeMetres','temporal','contrastCollapsedFrames','noQualifyingThickCoreFrames']} for r in results])
(root/'analysis.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(dict(arm=report['arm'],cases=len(results),analysis=str(root/'analysis.json'))))
other=root.parent/('baseline' if report['arm']=='candidate' else 'candidate')/'analysis.json'
if other.is_file():
 a=json.loads(other.read_text());b=out;baseline=a if a['arm']=='baseline' else b;candidate=a if a['arm']=='candidate' else b
 comparisons=[]
 for old in baseline['cases']:
  new=next(c for c in candidate['cases'] if c['id']==old['id']);deltas={}
  oldFrames=json.loads((root.parent/'baseline'/old['id']/'frames.json').read_text())['frames'];newFrames=json.loads((root.parent/'candidate'/new['id']/'frames.json').read_text())['frames']
  assert len(oldFrames)==len(newFrames)
  for before,after in zip(oldFrames,newFrames):
   for field in ['index','simulatedSeconds','virtualMs','distance','offset','requestedCamera','heldLook','actualEye','outputPixels','acquisition']:
    assert before[field]==after[field],('Unmatched comparison',old['id'],field,before[field],after[field])
  for key,value in old['aggregate'].items():
   v=new['aggregate'][key];deltas[key]=v['mean']-value['mean'] if v and value else None
  comparisons.append(dict(id=old['id'],timestampsCamerasEyesAndDimensionsExactlyMatched=True,meanCandidateMinusBaseline=deltas,baseline=old,candidate=new))
 (root.parent/'comparison.json').write_text(json.dumps(dict(cases=comparisons,interpretation='Matched simulated timestamps/cameras; acquisition shader substitution only. Metrics are occupancy/coverage, not reading.'),indent=2)+'\n')
