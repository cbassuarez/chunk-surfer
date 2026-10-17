// Preserve diagnostic provenance while making the returned native buffers easy
// to inspect. Pixel differences are repeatability checks, not aesthetic scores.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=resolve('artifacts/roof-floor-design/deep-composition');
const report=JSON.parse(await readFile(join(root,'controlled-matrix.json'),'utf8'));
const output=join(root,'controlled-matrix');await mkdir(output,{recursive:true});
for(const shot of report.snapshots){
  const images={};
  for(const[stage,data]of Object.entries(shot.images)){
    if(!data?.startsWith('data:'))continue;
    const buffer=Buffer.from(data.slice(data.lastIndexOf(',')+1),'base64');
    const path=join(output,`${shot.name}-${stage}.png`);await writeFile(path,buffer);
    const {width,height}=await sharp(buffer).metadata();
    images[stage]={path,width,height,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};
    if(stage==='props'){
      const raw=await sharp(buffer).ensureAlpha().raw().toBuffer();
      const histogram={};for(let i=3;i<raw.length;i+=4)histogram[raw[i]]=(histogram[raw[i]]||0)+1;
      images[stage].semanticAlphaHistogram=histogram;
    }
  }
  shot.images=images;
}
const first=report.snapshots.find(s=>s.name==='east-northwest');
const repeat=report.snapshots.find(s=>s.name==='east-northwest-repeat-clock-control');
report.repeatability={method:'Per-channel absolute byte difference for same pose, fixed shader time, same nominal settings; camera/lighting values retained to expose residual live-clock drift',stages:{}};
for(const stage of ['props','scene','mark-alpha','vfd']){
  const a=await sharp(first.images[stage].path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=await sharp(repeat.images[stage].path).ensureAlpha().raw().toBuffer();
  let total=0,changed=0,aboveOne=0,max=0;
  for(let i=0;i<a.data.length;i+=4){let d=0;for(let c=0;c<3;c++){const e=Math.abs(a.data[i+c]-b[i+c]);total+=e;d=Math.max(d,e);max=Math.max(max,e);}if(d)changed++;if(d>1)aboveOne++;}
  const pixels=a.info.width*a.info.height;
  report.repeatability.stages[stage]={pixels,changedPixels:changed,changedPixelFraction:changed/pixels,aboveOnePixelFraction:aboveOne/pixels,meanAbsoluteChannelDifference:total/(pixels*3),maxChannelDifference:max,exactFileHash:first.images[stage].sha256===repeat.images[stage].sha256};
}
report.sourceFile=join(root,'controlled-matrix.json');
report.runtimeCondition='Frozen revised source; both baseline East heading and revised East heading rendered as explicit counterfactual poses with unchanged geometry and shaders';
const glassNormal=report.snapshots.find(s=>s.name==='east-northwest-supported-depth');
const glassDisabled=report.snapshots.find(s=>s.name==='east-northwest-supported-depth-without-glass-identity');
const glassRestored=report.snapshots.find(s=>s.name==='east-northwest-supported-depth-restored-glass-identity');
if(glassNormal?.rawPropFingerprint&&glassDisabled?.rawPropFingerprint&&glassRestored?.rawPropFingerprint){
  report.glassBindingAblation={
    method:'Same camera/shader clock; only uRoofGlass forced0; direct GPU readback hashes RGB separately from categorical alpha, avoiding Canvas premultiply rounding. Depth is not read in this check.',
    normalRgb:glassNormal.rawPropFingerprint.rgbSha256,disabledRgb:glassDisabled.rawPropFingerprint.rgbSha256,restoredRgb:glassRestored.rawPropFingerprint.rgbSha256,
    rgbUnchanged:glassNormal.rawPropFingerprint.rgbSha256===glassDisabled.rawPropFingerprint.rgbSha256&&glassNormal.rawPropFingerprint.rgbSha256===glassRestored.rawPropFingerprint.rgbSha256,
    normal225Pixels:glassNormal.rawPropFingerprint.alphaHistogram[225]||0,disabled225Pixels:glassDisabled.rawPropFingerprint.alphaHistogram[225]||0,restored225Pixels:glassRestored.rawPropFingerprint.alphaHistogram[225]||0,
    alphaRestored:glassNormal.rawPropFingerprint.alphaSha256===glassRestored.rawPropFingerprint.alphaSha256,
    glErrors:[glassNormal,glassDisabled,glassRestored].map(s=>s.rawPropFingerprint.glError),
  };
}
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output,snapshots:report.snapshots.map(s=>({name:s.name,look:s.pose.look,eye:s.pose.eye,clock:s.fixedShaderTimeSec})),clockCounts:report.clockCounts,clockContexts:report.clockContexts,repeatability:report.repeatability,glassBindingAblation:report.glassBindingAblation,restored:report.restored},null,2));
