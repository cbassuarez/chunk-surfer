// Compare the same standing camera views using the final material identity mask.
// The mask is authored material provenance, not a hand-selected screen region.
import sharp from 'sharp';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const root=resolve(process.env.ROOF_QUIET_OUT||'artifacts/roof-floor-design/quiet-metal');
const baseline=JSON.parse(await readFile(join(root,'baseline/report.json'),'utf8'));
const final=JSON.parse(await readFile(join(root,'final/report.json'),'utf8'));
const load=async p=>sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const luma=(d,i)=>(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;
const describe=values=>{
  if(!values.length)return{pixels:0};
  values.sort((a,b)=>a-b);return{pixels:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,
    p95:values[Math.floor(values.length*.95)],max:values.at(-1),brightShare:values.filter(v=>v>.45).length/values.length};
};
const comparisons=[];
for(const capture of final.captures){
  const before=baseline.captures.find(c=>c.name===capture.name);if(!before)continue;
  const base=join(root,'baseline',capture.name),after=join(root,'final',capture.name);
  const old=await load(base+'-vfd.png'),now=await load(after+'-vfd.png');
  let mask,maskSource='main-composed-material';
  try{mask=await load(after+'-mark-alpha.png');}catch{mask=await load(after+'-prop-mark-alpha.png');maskSource='prop-material';}
  const{width,height}=mask.info;
  if(old.info.width!==width||old.info.height!==height||now.info.width!==width||now.info.height!==height)throw Error(`Capture dimensions disagree: ${capture.name}`);
  const selected=new Uint8Array(width*height),dilated=new Uint8Array(width*height);
  for(let i=0;i<selected.length;i++)selected[i]=mask.data[i*4]===237?1:0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(selected[y*width+x])for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height)dilated[yy*width+xx]=1;
  }
  const oldMetal=[],newMetal=[],oldEdge=[],newEdge=[];let backgroundAbsoluteDifference=0,backgroundPixels=0;
  const visual=Buffer.alloc(width*height*4);
  for(let i=0;i<selected.length;i++){
    if(selected[i]){oldMetal.push(luma(old.data,i*4));newMetal.push(luma(now.data,i*4));}
    else if(dilated[i]){oldEdge.push(luma(old.data,i*4));newEdge.push(luma(now.data,i*4));}
    else{backgroundAbsoluteDifference+=Math.abs(luma(old.data,i*4)-luma(now.data,i*4));backgroundPixels++;}
    visual.set(selected[i]?[255,255,255,255]:dilated[i]?[70,70,70,255]:[0,0,0,255],i*4);
  }
  await sharp(visual,{raw:{width,height,channels:4}}).png().toFile(after+'-quiet-metal-mask.png');
  const oldDisplay=await load(base+'.webp'),newDisplay=await load(after+'.webp');
  const displayMask=await sharp(mask.data,{raw:{width,height,channels:4}}).resize(oldDisplay.info.width,oldDisplay.info.height,{kernel:'nearest'}).raw().toBuffer();
  const oldDisplayMetal=[],newDisplayMetal=[];
  for(let i=0;i<oldDisplay.info.width*oldDisplay.info.height;i++)if(displayMask[i*4]===237){oldDisplayMetal.push(luma(oldDisplay.data,i*4));newDisplayMetal.push(luma(newDisplay.data,i*4));}
  comparisons.push({name:capture.name,maskSource,baselineDisplayMetal:describe(oldDisplayMetal),finalDisplayMetal:describe(newDisplayMetal),poseMatches:JSON.stringify(before.pos)===JSON.stringify(capture.pos)&&JSON.stringify(before.look)===JSON.stringify(capture.look),
    baselineMetal:describe(oldMetal),finalMetal:describe(newMetal),baselineAdjacentOutline:describe(oldEdge),finalAdjacentOutline:describe(newEdge),
    backgroundMeanAbsoluteLumaDifference:backgroundAbsoluteDifference/Math.max(1,backgroundPixels)});
}
const report={baselinePropPack:baseline.propPackHashStart,finalPropPack:final.propPackHashStart,
  note:'Exact same standing views; final marker byte237 identifies authored fire-escape iron. Background differences include time-varying world light and grain. Raw/native captures remain the visual acceptance surface.',comparisons};
await writeFile(join(root,'comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
