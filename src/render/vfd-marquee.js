// A finite hardware text window: read the beginning, move addressed dot
// columns, read the ending, then return to the beginning. Never a web ticker.
// Sony CDX-C810DSP instructions document auto-scroll for names exceeding the
// display, not perpetual movement of short names:
// https://pro.sony/s3/cms-static-content/operation-manual/3856118412.pdf
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function vfdMarqueeFrame(text,{width=28,scale=1,time=0,reducedMotion=false,
  startHold=2.6,endHold=2.0,speed=3.2,repeat=false}={}){
  const value=String(text??''),s=Math.max(.25,finite(scale,1)),windowWidth=Math.max(1,finite(width,28)),
    contentWidth=[...value].length*s,dotPitch=s*.8/5,
    overflow=Math.max(0,contentWidth-windowWidth),maxOffset=Math.ceil((overflow-1e-9)/dotPitch)*dotPitch;
  const fixed={text:value,windowWidth,contentWidth,dotPitch,maxOffset:Math.max(0,maxOffset),overflow:overflow>0};
  if(overflow<=0||reducedMotion)return{...fixed,offset:0,phase:reducedMotion&&overflow>0?'reduced':'static',cycle:0};
  const first=Math.max(0,finite(startHold,2.6)),last=Math.max(0,finite(endHold,2)),velocity=Math.max(.25,finite(speed,3.2)),
    travel=maxOffset/velocity,cycle=first+travel+last,elapsed=Math.max(0,finite(time,0)),t=repeat?elapsed%cycle:Math.min(elapsed,cycle);
  if(t<first)return{...fixed,offset:0,phase:'hold-start',cycle};
  if(t>=first+travel)return{...fixed,offset:maxOffset,phase:'hold-end',cycle};
  return{...fixed,offset:Math.min(maxOffset,Math.floor((t-first)*velocity/dotPitch)*dotPitch),phase:'travel',cycle};
}
