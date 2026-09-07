// Satin metal and the three physical planes of an instrument aperture. Ported
// from the approved faceplate/VFD study; this module owns no numbers, labels,
// meter readings, input, or clocks. All public rectangles are device pixels.
import { drawHardwareScrew } from './hardware-faceplate.js';

const DEFAULT_VIEW_X=-.36, DEFAULT_VIEW_Y=-.18;
const CACHE_ENTRIES=24, CACHE_PIXELS=10*1024*1024;
const rasters=new Map();
let rasterPixels=0;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(value))?Number(value):lo));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
function seedNumber(value,fallback=59072){
  if(value==null)return fallback;
  if(typeof value==='number')return value|0;
  let n=2166136261;for(const char of String(value))n=Math.imul(n^char.charCodeAt(0),16777619);return n>>>0;
}
function region(options={}){
  const {x=0,y=0,w,h}=options;
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
  return{x,y,w,h,dpr:clamp(finite(options.dpr,1),.5,4)};
}
function path(ctx,x,y,w,h,r=0){
  r=Math.max(0,Math.min(r,w/2,h/2));
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function fill(ctx,x,y,w,h,color,r=0){
  if(w<=0||h<=0)return;
  ctx.fillStyle=color;if(r){path(ctx,x,y,w,h,r);ctx.fill();}else ctx.fillRect(x,y,w,h);
}
function line(ctx,x1,y1,x2,y2,color,width=1){
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function gradient(ctx,x,y,w,h,stops){
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  for(const[at,color]of stops)g.addColorStop(at,color);return g;
}
function ownerOf(ctx){return ctx.canvas?.ownerDocument||(typeof document==='undefined'?null:document);}

export function clearInstrumentMaterialCache(){rasters.clear();rasterPixels=0;}
export function instrumentMaterialCacheStats(){return{entries:rasters.size,pixels:rasterPixels,maxEntries:CACHE_ENTRIES,maxPixels:CACHE_PIXELS};}
function cached(ctx,key,width,height,paint){
  const hit=rasters.get(key);
  if(hit){rasters.delete(key);rasters.set(key,hit);return hit.canvas;}
  const w=Math.max(1,Math.ceil(width)),h=Math.max(1,Math.ceil(height)),pixels=w*h;
  const owner=ownerOf(ctx);
  if(!owner?.createElement||pixels>CACHE_PIXELS)return null;
  const canvas=owner.createElement('canvas');canvas.width=w;canvas.height=h;
  const target=canvas.getContext?.('2d');if(!target)return null;
  paint(target);
  while(rasters.size&&(rasters.size>=CACHE_ENTRIES||rasterPixels+pixels>CACHE_PIXELS)){
    const old=rasters.keys().next().value;rasterPixels-=rasters.get(old).pixels;rasters.delete(old);
  }
  rasters.set(key,{canvas,pixels});rasterPixels+=pixels;return canvas;
}
// Small tiles avoid a hundred thousand first-reveal strokes on large panels.
// The finish is stationary, horizontal machining, not frame-random film grain.
function grain(ctx,seed){
  const w=512,h=128,scale=2;
  return cached(ctx,`grain:${seed}`,w*scale,h*scale,target=>{
    target.scale(scale,scale);const random=seeded(seed);
    for(let i=0;i<w*h*.18;i++){
      const x=random()*w,y=random()*h,len=2+random()*52;
      const color=random()>.48?`rgba(237,233,208,${.025+random()*.065})`:`rgba(17,26,22,${.02+random()*.042})`;
      const width=.16+random()*.26;
      line(target,x,y,x+len,y,color,width);
      if(x+len>w)line(target,x-w,y,x+len-w,y,color,width);
    }
  });
}
function paintGrain(ctx,x,y,w,h,alpha,seed){
  const texture=grain(ctx,seed);if(!texture)return;
  ctx.save();ctx.globalAlpha*=alpha;path(ctx,x,y,w,h,3);ctx.clip();
  for(let yy=y;yy<y+h;yy+=128)for(let xx=x;xx<x+w;xx+=512)ctx.drawImage(texture,xx,yy,512,128);
  const random=seeded(seed);
  for(let i=0;i<17;i++){
    const xx=x+random()*w,yy=y+random()*h;
    line(ctx,xx,yy,xx+12+random()*60,yy-.3,'rgba(239,240,218,.065)',.38);
  }
  ctx.restore();
}
function local(ctx,bounds,paint){
  ctx.save();ctx.translate(bounds.x,bounds.y);ctx.scale(bounds.dpr,bounds.dpr);
  ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  try{paint(ctx,bounds.w/bounds.dpr,bounds.h/bounds.dpr);}finally{ctx.restore();}
}
function layer(ctx,bounds,kind,key,pad,paint){
  const {w,h,dpr}=bounds;
  const canvas=cached(ctx,[kind,w,h,dpr,...key].join(':'),w+pad*2,h+pad*2,target=>{
    local(target,{x:pad,y:pad,w,h,dpr},paint);
  });
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  try{
    if(canvas)ctx.drawImage(canvas,bounds.x-pad,bounds.y-pad);
    else local(ctx,bounds,paint);
  }finally{ctx.restore();}
}

/** Neutral satin aluminum; fasteners remain outside the display aperture.
 * screwRadius/screwInset, when supplied, are device pixels like the rectangle.
 * The small default fasteners fit existing one-cell game header bands.
 */
export function drawInstrumentPlate(ctx,options={}){
  const bounds=region(options);if(!ctx||!bounds)return null;
  const {dpr}=bounds,black=['black','anodized','Black anodized'].includes(options.finish);
  const seed=seedNumber(options.seed),fasteners=options.fasteners!==false;
  const radius=clamp(finite(options.screwRadius,3.3*dpr)/dpr,0,7);
  const inset=Math.max(radius,finite(options.screwInset,6.3*dpr)/dpr);
  const paint=(c,w,h)=>{
    const u=Math.min(1,w/50,h/30),r=5*u;
    c.save();c.shadowColor='#03060480';c.shadowBlur=14;c.shadowOffsetY=8;
    fill(c,0,5*u,w,h,'#111713',r);c.restore();
    fill(c,0,0,w,h,gradient(c,0,0,w*.15,h,black
      ?[[0,'#515951'],[.035,'#252e2b'],[.975,'#0d1310'],[1,'#6e7465']]
      :[[0,'#e9e8d6'],[.02,'#686f65'],[.08,'#aab0a2'],[.975,'#505a50'],[1,'#acb09e']]),r);
    const off=(.35-.5)*w*.55;
    const shine=gradient(c,off-w*.18,0,w*1.45,h*.14,black
      ?[[0,'#202825'],[.24,'#323c36'],[.43,'#454e45'],[.55,'#343d36'],[.76,'#1d2823'],[1,'#313b32']]
      :[[0,'#7d807d'],[.19,'#a9aba5'],[.38,'#d3d3c8'],[.48,'#e4e2d5'],[.64,'#b8b9af'],[.88,'#8e928a'],[1,'#b4b6aa']]);
    fill(c,2*u,2*u,w-4*u,h-5*u,shine,3*u);
    paintGrain(c,2*u,2*u,w-4*u,h-5*u,black?.28:.65,seed);
    line(c,5*u,1.3*u,w-5*u,1.3*u,black?'#b7bd9b55':'#fffce5aa',.65*u);
    line(c,4*u,h-1.6*u,w-4*u,h-1.6*u,'#080f0b88',u);
    if(fasteners&&radius>0){
      const r=Math.min(radius,w*.06,h*.12),i=Math.min(Math.max(inset,r),w/2,h/2);
      for(const[index,[x,y]]of [[i,i],[w-i,i],[i,h-i],[w-i,h-i]].entries()){
        drawHardwareScrew(c,x,y,r,{seed:`instrument:${seed}:${index}`,dpr:1,darkPanel:black});
      }
    }
  };
  ctx.save();try{layer(ctx,bounds,'plate',[black,seed,fasteners,radius,inset],Math.ceil(24*dpr),paint);}finally{ctx.restore();}
  return bounds;
}

/** Cut metal -> gasket -> dark side wall -> copper/graphite substrate.
 * Returns the fixed aperture plus its optional rear-plane display offset.
 */
export function drawInstrumentWell(ctx,options={}){
  const bounds=region(options);if(!ctx||!bounds)return null;
  const depth=clamp(finite(options.depth,1),0,1.5),{dpr}=bounds;
  const u=Math.min(1,bounds.w/dpr/60,bounds.h/dpr/45),outset=7*u*dpr;
  const contentOffset={x:-DEFAULT_VIEW_X*7*depth*u*dpr,y:-DEFAULT_VIEW_Y*6*depth*u*dpr};
  const paint=(c,w,h)=>{
    fill(c,-7*u,-7*u,w+14*u,h+14*u,gradient(c,0,0,5*u,h,[[0,'#424b3e'],[.35,'#75806a'],[.6,'#646e59'],[1,'#eef2cc']]),3*u);
    fill(c,-5*u,-5*u,w+10*u,h+10*u,gradient(c,0,0,w*.25,h,[[0,'#090f0c'],[.45,'#283223'],[1,'#687258']]),2*u);
    fill(c,-2*u,-2*u,w+4*u,h+4*u,'#080e0a',2*u);
    c.save();path(c,0,0,w,h,u);c.clip();
    fill(c,0,0,w,h,gradient(c,0,0,w*.6,h,[[0,'#101c14'],[.4,'#06100b'],[1,'#111d11']]));
    c.translate(contentOffset.x/dpr,contentOffset.y/dpr);
    fill(c,8*u,8*u,w-16*u,h-16*u,gradient(c,0,0,w,0,[[0,'#1d2617'],[.045,'#08130c'],[.91,'#0b140e'],[1,'#252a18']]),2*u);
    line(c,12*u,8*u,w-12*u,8*u,'#b4a36628',.65*u);
    const random=seeded(7492);
    for(let i=0;i<28;i++){
      const yy=12*u+i*(h-24*u)/27;
      line(c,w-12*u,yy,w-5*u,yy+2*u,'#a7a5782b',.7*u);
      fill(c,13*u+random()*(w-26*u),10*u+random()*(h-20*u),.6*u,.6*u,'#a7ba9833');
    }
    c.restore();
  };
  ctx.save();try{layer(ctx,bounds,'well',[depth],Math.ceil(outset),paint);}finally{ctx.restore();}
  return{...bounds,outset,contentOffset};
}

/** Optional real digit-region mesh. No digits, divisions, scales or values are
 * invented here. Call between display content and its cover glass, never as an
 * indiscriminate overlay on prose. Tiny UI glyphs should omit this detail.
 */
export function drawVfdGrid(ctx,options={}){
  const bounds=region(options);if(!ctx||!bounds)return null;
  const depth=clamp(finite(options.depth,1),0,1.5),a=options.reducedMotion?DEFAULT_VIEW_X:clamp(finite(options.viewX,DEFAULT_VIEW_X),-.9,.9);
  const dy=options.reducedMotion?DEFAULT_VIEW_Y:clamp(finite(options.viewY,DEFAULT_VIEW_Y),-.45,.45);
  const paint=(c,w,h)=>{
    const step=3.2;c.save();path(c,0,0,w,h,0);c.clip();
    for(let row=0;row<h/step+1;row++)for(let col=0;col<w/(step*1.7)+1;col++){
      const x=col*step*1.7+(row%2)*step*.85,y=row*step;
      c.beginPath();for(let n=0;n<6;n++){const t=n*Math.PI/3,xx=x+Math.cos(t)*1.9,yy=y+Math.sin(t)*1.9;n?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.closePath();
      c.strokeStyle='rgba(11,32,22,.25)';c.lineWidth=.36;c.stroke();
    }
    for(const y of [h*.31,h*.69]){
      line(c,0,y,w,y,'#050c0899',.8);line(c,0,y+.55,w,y+.55,'#aa9d6740',.35);
    }
    c.restore();
  };
  ctx.save();try{
    path(ctx,bounds.x,bounds.y,bounds.w,bounds.h,0);ctx.clip();
    const moved={...bounds,x:bounds.x-a*3*depth*bounds.dpr,y:bounds.y-dy*2.7*depth*bounds.dpr};
    layer(ctx,moved,'grid',[],0,paint);
  }finally{ctx.restore();}
  return bounds;
}

/** Smoked transmission, broad front-surface reflection and two cover returns.
 * This pass must follow the actual display content. Optional grid may be an
 * explicitly authored digit-region rectangle; false keeps prose unobscured.
 * viewX/viewY are supplied positions, not clocks. Reduced motion fixes the view.
 */
export function drawInstrumentGlass(ctx,options={}){
  const bounds=region(options);if(!ctx||!bounds)return null;
  const {dpr}=bounds,depth=clamp(finite(options.depth,1),0,1.5);
  const reflection=clamp(finite(options.reflection,.7),0,1);
  const a=options.reducedMotion?DEFAULT_VIEW_X:clamp(finite(options.viewX,DEFAULT_VIEW_X),-.9,.9);
  const dy=options.reducedMotion?DEFAULT_VIEW_Y:clamp(finite(options.viewY,DEFAULT_VIEW_Y),-.45,.45);
  if(options.grid&&typeof options.grid==='object')drawVfdGrid(ctx,{...options.grid,dpr,depth,viewX:a,viewY:dy,reducedMotion:options.reducedMotion});
  const u=Math.min(1,bounds.w/dpr/60,bounds.h/dpr/45);
  ctx.save();try{
    local(ctx,bounds,(c,w,h)=>{
      path(c,0,0,w,h,u);c.clip();fill(c,0,0,w,h,'rgba(20,33,20,.08)');
      if(reflection>0){
        c.save();c.globalAlpha*=reflection;
        const lightX=w*(.35*.7+.06)+a*20*u;
        fill(c,0,0,w,h,gradient(c,lightX-w*.3,0,w*.58,h*.5,[[0,'#d9e4ba00'],[.33,'#d9e4ba00'],[.38,'#d9e4ba14'],[.53,'#d9e4ba21'],[.57,'#d9e4ba05'],[1,'#d9e4ba00']]));
        c.beginPath();c.moveTo(-30*u+a*24*u,0);c.lineTo(w*.36+a*24*u,0);c.lineTo(w*.15+a*10*u,h*.36);c.lineTo(-30*u,h*.44);c.closePath();c.fillStyle='#c7d8b70a';c.fill();
        c.restore();
      }
    });
    if(reflection>0){
      ctx.save();ctx.globalAlpha*=reflection;
      layer(ctx,bounds,'glass-return',[],0,(c,w,h)=>{
        path(c,0,0,w,h,u);c.clip();
        line(c,9*u,6*u,w-9*u,6*u,'#e3d9b54a',.7*u);
        line(c,12*u,9*u,w-13*u,9*u,'#c3d2a118',.6*u);
        const random=seeded(81);for(let i=0;i<31;i++)fill(c,random()*w,random()*h,.5*u,.5*u,'#e3e6ca28');
      });ctx.restore();
    }
    layer(ctx,bounds,'glass-edge',[],Math.ceil(5*u*dpr),(c,w,h)=>{
      c.save();path(c,0,0,w,h,u);c.clip();
      const sx=Math.min(17*u,w/4),sy=Math.min(17*u,h/4);
      fill(c,0,0,w,sy,gradient(c,0,0,0,sy,[[0,'#000b'],[1,'#0000']]));
      fill(c,0,0,sx*.824,h,gradient(c,0,0,sx*.824,0,[[0,'#0008'],[1,'#0000']]));
      fill(c,w-sx*.882,0,sx*.882,h,gradient(c,w-sx*.882,0,sx*.882,0,[[0,'#0000'],[1,'#000b']]));
      fill(c,0,h-sy,w,sy,gradient(c,0,h-sy,0,sy,[[0,'#0000'],[1,'#000b']]));
      line(c,2*u,h-2*u,w-3*u,h-2*u,'#b3b58545',u);
      line(c,w-2*u,2*u,w-2*u,h-2*u,'#a3bb8352',.8*u);c.restore();
      line(c,-4*u,h+4*u,w+3*u,h+4*u,'#040805aa',.8*u);
    });
  }finally{ctx.restore();}
  return bounds;
}
