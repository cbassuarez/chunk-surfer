// THE DIAL, SEEN. While a time skip turns the cab radio through the band
// (src/game/source-drive/time-skips.js), the picture goes to static with it.
// The snow is value noise rather than per-pixel random: it clumps and rolls
// the way broadcast noise does, with a smeared sync bar and torn rows, and it
// peaks at the middle of the turn when the van is moved. Reduce Flash keeps
// it softer and drops the bright bars.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
let surface=null,pen=null,pixels=null;
const W=320,H=180;
function hash2(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);}
// Cheap smooth value noise, so the grain reads as a field rather than confetti.
function valueNoise(x,y,seed){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,s=seed*12.9898;
  const a=hash2(xi+s,yi+s),b=hash2(xi+1+s,yi+s),c=hash2(xi+s,yi+1+s),d=hash2(xi+1+s,yi+1+s);
  const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
export function radioDialStaticAlpha(fraction,{reducedFlash=false}={}){
  return(reducedFlash?.42:.82)*Math.pow(Math.sin(Math.PI*clamp(fraction)),.7);
}
export function paintRadioDialStatic(ctx,{width,height,fraction=0,time=0,reducedFlash=false,random=Math.random}={}){
  void random; // retained for callers that pass a seeded source; the field is deterministic.
  const alpha=radioDialStaticAlpha(fraction,{reducedFlash});
  if(!ctx||alpha<.01||typeof document==='undefined')return false;
  if(!surface){surface=document.createElement('canvas');surface.width=W;surface.height=H;pen=surface.getContext('2d');pixels=pen.createImageData(W,H);}
  const data=pixels.data;
  const seed=fraction*7.3+time*2.1,frame=Math.floor(time*30),roll=(time*3.1+fraction*2)%1,bar=Math.floor(roll*H);
  for(let y=0;y<H;y++){
    // A band of the field brighter and torn sideways, rolling down the frame
    // like a slipping vertical hold, with a fainter ghost half a frame down.
    const inBar=Math.abs(y-bar)<3||Math.abs(y-(bar+H/2)%H)<1.5;
    const tear=inBar?Math.floor(valueNoise(y*.13,seed*.7,seed)*12):0;
    for(let x=0;x<W;x++){
      const n=valueNoise(x*.19+frame*.07,y*.19-frame*.03,seed);
      const fine=(Math.sin(x*12.9898+y*78.233+seed*17.7)*43758.5453)%1;
      const v=Math.min(255,Math.floor(n*n*230+fine*25)+(inBar?(reducedFlash?25:80):0));
      const k=(y*W+((x+tear)%W))*4;
      data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;
    }
  }
  pen.putImageData(pixels,0,0);
  ctx.save();ctx.setTransform?.(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=alpha;ctx.drawImage(surface,0,0,width,height);
  if(!reducedFlash){
    // The sync bar, smeared rather than a hard stripe, with its faint echo.
    const y=roll*height;
    ctx.globalAlpha=alpha*.5;ctx.fillStyle='#f4f1e6';ctx.fillRect(0,y,width,Math.max(2,height*.01));
    ctx.globalAlpha=alpha*.18;ctx.fillRect(0,y+height*.05,width,Math.max(1,height*.02));
    ctx.fillRect(0,(y+height*.37)%height,width,Math.max(1,height*.006));
  }
  ctx.restore();return true;
}
