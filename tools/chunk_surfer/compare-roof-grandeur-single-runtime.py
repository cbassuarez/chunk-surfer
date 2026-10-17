"""Compare native PNG RGB and poses from one-document A/B/A diagnostics.
No exposure matching, resampling, repainting, or subjective beauty score.
"""
import json,sys
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
root=Path(sys.argv[1] if len(sys.argv)>1 else 'artifacts/roof-floor-design/grandeur/single-runtime')
study=json.loads((root/'report.json').read_text())
conditions={c['condition']:c for c in study['conditions']}
a,b,restored=(conditions[k] for k in ['before','after','restored-old'])
def compare(before,after):
    first=Image.open(before).convert('RGB');second=Image.open(after).convert('RGB')
    if first.size!=second.size:return {'matchedDimensions':False,'before':first.size,'after':second.size}
    diff=ImageChops.difference(first,second);channels=diff.split();mask=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]);hist=mask.histogram();total=first.width*first.height
    return {'matchedDimensions':True,'width':first.width,'height':first.height,'pixels':total,'differingPixels':total-hist[0],'differingFraction':(total-hist[0])/total,'maxChannelDifference':max(i for i,n in enumerate(hist) if n),'meanAbsoluteChannelDifference':sum(ImageStat.Stat(diff).mean)/3,'differenceBounds':diff.getbbox()}
def controls(capture):
    return {'pos':capture['pos'],'eye':capture['eye'],'look':capture['look'],'seed':capture['seed'],'exposure':capture['lighting']['captureExposure'],'torch':capture['lighting']['torch'],'identity':capture['runtimeIdentity']}
comparisons=[]
for before in a['captures']:
    final=next(c for c in b['captures'] if c['name']==before['name']);back=next(c for c in restored['captures'] if c['name']==before['name'])
    comparisons.append({'name':before['name'],'before':before['files'],'after':final['files'],'restoredOld':back['files'],'controls':{'before':controls(before),'after':controls(final),'restoredOld':controls(back)},'beforeVsAfter':{layer:compare(before['files'][layer],final['files'][layer]) for layer in ['scene','vfd']},'beforeVsRestoredOld':{layer:compare(before['files'][layer],back['files'][layer]) for layer in ['scene','vfd']}})
result={'method':'Pillow ImageChops and channel histograms on unchanged native PNG RGB; no resize/exposure adjustment. A/B/A in one document. Camera eye easing and live CPU/audio/game clocks can cause differences even when shader time is pinned; controls retained. This is a geometry diagnostic, not continuous route or human acceptance.','sameDocument':study['sameDocument'],'noShaderRelink':study['noShaderRelink'],'contextHealthy':study['contextHealthy'],'assetsStable':study['assetsStable'],'patchOwners':study['patchOwners'],'catalogIsolation':[{'condition':c['condition'],'checks':c.get('catalogCheck')} for c in study['conditions']],'assetIdentity':{k:study[k] for k in ['baselineSha','finalSha','oldDeltaSha','finalDeltaSha']},'comparisons':comparisons,'pairedTiming':[{k:c.get(k) for k in ['condition','assetHashBefore','performance']} for c in [a,b,restored]],'limitations':['Three sequential samples without extra repetitions. Host workload, thermal state, order and asset-reload cache state are not independently controlled.','Native returned PNG RGB can differ by antialias/eye easing/live CPU effects. Exact restored-A agreement is reported per image rather than assumed.','No unfamiliar human participant.']}
(root/'comparison.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'sameDocument':study['sameDocument'],'noShaderRelink':study['noShaderRelink'],'restoredA':[{'name':c['name'],'scene':c['beforeVsRestoredOld']['scene'],'vfd':c['beforeVsRestoredOld']['vfd']} for c in comparisons],'timings':[{k:c.get(k) for k in ['condition']}|{k:c['performance'][k] for k in ['samples','medianMs','p95Ms','p99Ms']} for c in [a,b,restored]]},indent=2))
