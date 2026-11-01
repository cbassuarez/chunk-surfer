// Optional failure of the existing VFD's scan banks. This clips its actual
// light-bearing electrodes; it invents no readings and touches no physical ink.
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const order=count=>Array.from({length:count},(_,i)=>i).sort((a,b)=>{
  const rank=n=>{let x=n,r=0;for(let i=0;i<5;i++){r=(r<<1)|(x&1);x>>=1;}return r;};
  return rank(a)-rank(b);
});
const columns=order(32),rows=order(16),columnCounts=[32,29,23,16,9,3,0,0],rowCounts=[16,15,12,9,6,2,0,0];
function subtractBands(start,end,bands){
  let pieces=[[start,end]];
  for(const[a,b]of bands)pieces=pieces.flatMap(([lo,hi])=>hi<=a||lo>=b?[[lo,hi]]:[[lo,Math.min(hi,a)],[Math.max(lo,b),hi]].filter(([x,y])=>y>x));
  return pieces;
}
export function sourceRestInstrumentDecay(presentation,{width=666,height=239}={}){
  const stage=Math.max(0,Math.min(7,Math.floor(finite(presentation?.stage)))),active=!!presentation&&stage>0;
  if(!active)return{active:false,stage:0,columns:[],rows:[],coverage:1};
  const w=Math.max(0,finite(width)),h=Math.max(0,finite(height)),
    bands=stage<3?[]:stage===3?[[16,35],[112,151],[153,180],[211,239]]:[[16,35],[112,239]],
    x=columns.slice(0,columnCounts[stage]).sort((a,b)=>a-b).map(i=>({x:i*w/32,w:w/32*.92})),
    y=rows.slice(0,rowCounts[stage]).sort((a,b)=>a-b).flatMap(i=>subtractBands(i*h/16,(i+.92)*h/16,bands.map(([a,b])=>[a*h/239,b*h/239]))
      .map(([lo,hi])=>({y:lo,h:hi-lo}))),
    coverage=w*h>0?x.reduce((n,p)=>n+p.w,0)*y.reduce((n,p)=>n+p.h,0)/(w*h):0;
  const voiceBanks=(presentation.voiceBanks||[]).filter(p=>[p.x,p.y,p.w,p.h].every(Number.isFinite)&&p.w>0&&p.h>0)
    .map(p=>({x:p.x*w/666,y:p.y*h/239,w:p.w*w/666,h:p.h*h/239}));
  return{active,stage,columns:x,rows:y,coverage,voiceBanks};
}
export function withSourceRestInstrumentDecay(ctx,rect,presentation,draw){
  const frame=sourceRestInstrumentDecay(presentation,{width:rect.w,height:rect.h});
  if(!frame.active){draw();return frame;}
  ctx.save();try{
    if(frame.voiceBanks?.length){
      ctx.beginPath();
      for(const x of frame.columns)for(const y of frame.rows)ctx.rect(rect.x+x.x,rect.y+y.y,x.w,y.h);
      for(const p of frame.voiceBanks)ctx.rect(rect.x+p.x,rect.y+p.y,p.w,p.h);
      ctx.clip();draw();return frame;
    }
    ctx.beginPath();for(const p of frame.columns)ctx.rect(rect.x+p.x,rect.y,p.w,rect.h);ctx.clip();
    ctx.beginPath();for(const p of frame.rows)ctx.rect(rect.x,rect.y+p.y,rect.w,p.h);ctx.clip();
    draw();
  }finally{ctx.restore();}
  return frame;
}
