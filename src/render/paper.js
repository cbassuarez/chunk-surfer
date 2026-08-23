// Legacy Canvas-paper compatibility layer.
//
// Meaningful documents now use the offline paper-production pipeline and never
// call this file. These helpers remain for non-document decorative callers and
// old probes. Crucially, physical history is explicit: no page-number-driven
// coffee stains, mystery stamps, folds, or automatic "decay" are invented here.

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const cache=new Map();
export function hashString(value=''){let h=2166136261>>>0;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed=1){let s=seed>>>0;return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

export function paperProfile(doc,pageIndex=0,totalPages=1){
  const paper=doc?.paper||{},handling=paper.handling||{};
  return Object.freeze({
    seed:hashString(`${doc?.id||doc?.title||'paper'}:${pageIndex}`),
    profile:paper.profile||'physical-explicit',tone:paper.tone||'#E8E5DC',
    skew:Number(paper.skew)||0,grain:clamp(Number(paper.grain)||.025,0,.12),edge:clamp(Number(paper.edge)||.05,0,.2),fade:clamp(Number(paper.fade)||0,0,.2),
    folds:Array.isArray(handling.folds)?handling.folds:Array.isArray(paper.folds)?paper.folds.filter((x)=>x.page==='all'||x.page===pageIndex):[],
    stains:Array.isArray(handling.stains)?handling.stains:Array.isArray(paper.stains)?paper.stains.filter((x)=>x.page==='all'||x.page===pageIndex):[],
    stamps:Array.isArray(handling.stamps)?handling.stamps:Array.isArray(paper.stamps)?paper.stamps.filter((x)=>x.page==='all'||x.page===pageIndex):[],
    marks:Array.isArray(handling.marks)?handling.marks:Array.isArray(paper.marks)?paper.marks.filter((x)=>x.page==='all'||x.page===pageIndex):[],
    damage:Array.isArray(handling.damage)?handling.damage:Array.isArray(paper.damage)?paper.damage.filter((x)=>x.page==='all'||x.page===pageIndex):[],
    pageIndex,totalPages,
  });
}

function texture(ctx,w,h,profile){
  const key=`${Math.round(w)}x${Math.round(h)}:${profile.tone}:${profile.seed}`;if(cache.has(key))return cache.get(key);
  const c=document.createElement('canvas');c.width=Math.max(2,Math.round(w));c.height=Math.max(2,Math.round(h));const x=c.getContext('2d');x.fillStyle=profile.tone;x.fillRect(0,0,c.width,c.height);
  // Extremely low-amplitude stock variation only; this is not a "dirty paper"
  // generator. Production stock detail lives in the baked/captured assets.
  const r=rand(profile.seed),count=Math.min(180,Math.floor(c.width*c.height/9000));x.strokeStyle='rgba(86,78,65,.025)';x.lineWidth=1;
  for(let i=0;i<count;i++){const y=r()*c.height;x.beginPath();x.moveTo(r()*c.width*.08,y);x.bezierCurveTo(c.width*.3,y+(r()-.5)*1.2,c.width*.7,y+(r()-.5)*1.2,c.width*(.92+r()*.08),y);x.stroke();}
  if(cache.size>24)cache.clear();cache.set(key,c);return c;
}

export function applyPaperTransform(ctx,rect,profile){ctx.translate(rect.x+rect.w/2,rect.y+rect.h/2);ctx.rotate((profile.skew||0)*Math.PI/180);ctx.translate(-(rect.x+rect.w/2),-(rect.y+rect.h/2));}
export function drawPaperSheet(ctx,rect,profile){ctx.save();ctx.shadowColor='rgba(0,0,0,.42)';ctx.shadowBlur=Math.max(4,rect.dpr*10);ctx.shadowOffsetY=Math.max(2,rect.dpr*3);ctx.drawImage(texture(ctx,rect.w,rect.h,profile),rect.x,rect.y,rect.w,rect.h);ctx.restore();}
export function drawPaperOverlay(ctx,rect,profile){
  ctx.save();ctx.globalCompositeOperation='multiply';
  for(const fold of profile.folds||[]){ctx.strokeStyle=`rgba(91,79,59,${clamp(Number(fold.alpha??fold.strength)||.04,0,.18)})`;ctx.lineWidth=Math.max(1,rect.dpr);ctx.beginPath();if(fold.axis==='y'){const y=rect.y+rect.h*(Number(fold.at)||.5);ctx.moveTo(rect.x,y);ctx.lineTo(rect.x+rect.w,y);}else{const x=rect.x+rect.w*(Number(fold.at)||.5);ctx.moveTo(x,rect.y);ctx.lineTo(x,rect.y+rect.h);}ctx.stroke();}
  ctx.restore();
}
