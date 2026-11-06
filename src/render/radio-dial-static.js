// THE DIAL, SEEN. While a time skip turns the cab radio through the band
// (src/game/source-drive/time-skips.js), the picture goes to static with it:
// coarse snow, a band of it rolling down like a frame slipping, peaking at the
// middle of the turn when the van is moved. Reduce Flash keeps it softer and
// drops the bright bars.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
let surface=null,pen=null,pixels=null;
const W=160,H=90;
export function radioDialStaticAlpha(fraction,{reducedFlash=false}={}){
  return(reducedFlash?.42:.82)*Math.pow(Math.sin(Math.PI*clamp(fraction)),.7);
}
export function paintRadioDialStatic(ctx,{width,height,fraction=0,time=0,reducedFlash=false,random=Math.random}={}){
  const alpha=radioDialStaticAlpha(fraction,{reducedFlash});
  if(!ctx||alpha<.01||typeof document==='undefined')return false;
  if(!surface){surface=document.createElement('canvas');surface.width=W;surface.height=H;pen=surface.getContext('2d');pixels=pen.createImageData(W,H);}
  const data=pixels.data,roll=(time*3.1+fraction*2)%1,bar=Math.floor(roll*H);
  for(let y=0;y<H;y++){
    // A band of the snow brighter and torn sideways, rolling down the frame.
    const inBar=Math.abs(y-bar)<4,lift=inBar?(reducedFlash?20:70):0,shift=inBar?Math.floor(random()*18):0;
    for(let x=0;x<W;x++){const v=Math.min(255,Math.floor(random()*190)+lift),k=(y*W+((x+shift)%W))*4;data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;}
  }
  pen.putImageData(pixels,0,0);
  ctx.save();ctx.setTransform?.(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=alpha;ctx.drawImage(surface,0,0,width,height);
  if(!reducedFlash){ctx.globalAlpha=alpha*.55;ctx.fillStyle='#f4f1e6';const y=roll*height;ctx.fillRect(0,y,width,Math.max(2,height*.012));ctx.fillRect(0,(y+height*.37)%height,width,Math.max(1,height*.005));}
  ctx.restore();return true;
}
