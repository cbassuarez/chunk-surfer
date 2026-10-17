import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
const root=resolve(process.argv[2]||'artifacts/roof-floor-design/deep-composition');
const name=process.argv[3]||'quick-final-glass';
const report=JSON.parse(await readFile(join(root,`${name}.json`),'utf8'));
const output=join(root,name);await mkdir(output,{recursive:true});
const rawProps=[];
for(const shot of report.snapshots){
  const images={};
  for(const[stage,data]of Object.entries(shot.images)){
    const buffer=Buffer.from(data.slice(data.lastIndexOf(',')+1),'base64');
    const path=join(output,`${shot.name}-${stage}.png`);await writeFile(path,buffer);images[stage]={path};
    if(stage==='props'){
      const raw=await sharp(buffer).ensureAlpha().raw().toBuffer(),histogram={};
      for(let i=3;i<raw.length;i+=4)histogram[raw[i]]=(histogram[raw[i]]||0)+1;
      images[stage].alphaHistogram=histogram;rawProps.push(raw);
    }
  }
  shot.images=images;
}
let changedRGB=0,changedAlpha=0,aboveOne=0,maxChannelDifference=0;
for(let i=0;i<rawProps[0].length;i+=4){
  let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(rawProps[0][i+c]-rawProps[1][i+c]));
  if(d)changedRGB++;if(d>1)aboveOne++;maxChannelDifference=Math.max(maxChannelDifference,d);
  if(rawProps[0][i+3]!==rawProps[1][i+3])changedAlpha++;
}
report.ablationEncodedPropsComparison={changedRGBPixels:changedRGB,changedAlphaPixels:changedAlpha,pixels:rawProps[0].length/4,aboveOnePixelCount:aboveOne,maxChannelDifference,limitation:'PNG export can round RGB through Canvas alpha premultiplication; semantic alpha differs intentionally. Use direct GPU RGB fingerprints for exact invariance.'};
const [normal,disabled,restored]=report.snapshots;
report.checks=[
  {name:'All three rendered states have shader ready and GL0',pass:report.snapshots.every(s=>s.pose.pixelMesh.shaderReady&&s.pose.pixelMesh.lastGlError===0&&!s.pose.pixelMesh.lastError)},
  {name:'Actual East seat retains captured ordinary mouse look',pass:!!report.freeLookProof&&report.freeLookProof.before.phase==='seated'&&report.freeLookProof.after.phase==='seated'&&report.freeLookProof.before.pointer&&report.freeLookProof.after.pointer&&report.freeLookProof.after.look.pitch<report.freeLookProof.before.look.pitch-.8},
  {name:'Identity225 is present, removed only in ablation, and restored',pass:(normal.images.props.alphaHistogram[225]||0)>0&&!(disabled.images.props.alphaHistogram[225]||0)&&normal.images.props.alphaHistogram[225]===restored.images.props.alphaHistogram[225]},
  {name:'Uniform ablation actually ran',pass:disabled.glassBindingAblation.enabled&&disabled.glassBindingAblation.count>0&&!restored.glassBindingAblation.enabled},
];
report.pass=report.checks.every(c=>c.pass);
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output,checks:report.checks,pass:report.pass,freeLook:report.freeLookProof,propTargetKeys:report.propTargetKeys,encodedProps:report.ablationEncodedPropsComparison},null,2));
