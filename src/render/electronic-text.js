// Text formed by a display, not a system font laid over dark glass. Both
// technologies use the same authored character ROM. VFD emits round phosphor
// dots; LCD gates a crisp rectangular pixel matrix and has no text bloom.
import {drawVfdGlyph,vfdGlyph,vfdGlowBleed,VFD_COLS,VFD_ROWS} from './vfd-font.js';

const tiles=new Map(),MAX_TILES=768,MAX_PIXELS=8*1024*1024;
let tilePixels=0;
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const TOFU=[31,17,17,17,17,17,31];
function metrics(options={}){
  const height=Math.max(1,number(options.fontSize,14));
  const cellWidth=Math.max(1,number(options.cellWidth,height*.72));
  return{height,cellWidth,tracking:Math.max(0,number(options.tracking,0))};
}
export function measureElectronicText(text,options={}){
  const {cellWidth,tracking}=metrics(options),length=[...String(text??'')].length;
  return length?length*cellWidth+(length-1)*tracking:0;
}
export function clearElectronicTextCache(){tiles.clear();tilePixels=0;}
export function electronicTextCacheStats(){return{entries:tiles.size,pixels:tilePixels,maxEntries:MAX_TILES,maxPixels:MAX_PIXELS};}

function paintLcdGlyph(ctx,ch,x,y,w,h,{color,dim,alpha=1}){
  if(ch===' ')return;
  const rows=vfdGlyph(ch)||TOFU,dx=w*.8/VFD_COLS,dy=h*.8/VFD_ROWS;
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  for(let row=0;row<VFD_ROWS;row++)for(let col=0;col<VFD_COLS;col++){
    const on=(rows[row]>>(VFD_COLS-1-col))&1;
    ctx.fillStyle=on?color:dim||color;
    ctx.globalAlpha=alpha*(on?1:.075);
    ctx.fillRect(x+w*.1+col*dx+dx*.08,y+h*.1+row*dy+dy*.08,dx*.84,dy*.84);
  }
  ctx.restore();
}
function paintGlyph(ctx,ch,x,y,w,h,options){
  if(options.mode==='vfd')drawVfdGlyph(ctx,ch,x,y,w,h,{color:options.color,dim:options.dim,
    alpha:options.alpha,blur:3.2,halation:.14,dpr:options.dpr});
  else paintLcdGlyph(ctx,ch,x,y,w,h,options);
}
function glyphTile(ctx,ch,w,h,options){
  const key=JSON.stringify([ch,w,h,options.mode,options.color,options.dim,options.dpr]);
  const hit=tiles.get(key);if(hit){tiles.delete(key);tiles.set(key,hit);return hit;}
  const owner=ctx.canvas?.ownerDocument||(typeof document==='undefined'?null:document);
  if(!owner?.createElement)return null;
  const bleed=options.mode==='vfd'?vfdGlowBleed(w,h):0;
  const width=Math.ceil(w+2*bleed),height=Math.ceil(h+2*bleed),pixels=width*height;
  if(pixels>MAX_PIXELS)return null;
  const canvas=owner.createElement('canvas');canvas.width=width;canvas.height=height;
  const target=canvas.getContext?.('2d');if(!target)return null;
  paintGlyph(target,ch,bleed,bleed,w,h,{...options,alpha:1});
  while(tiles.size&&(tiles.size>=MAX_TILES||tilePixels+pixels>MAX_PIXELS)){
    const oldest=tiles.keys().next().value;tilePixels-=tiles.get(oldest).pixels;tiles.delete(oldest);
  }
  const tile={canvas,bleed,pixels};tiles.set(key,tile);tilePixels+=pixels;return tile;
}

/** Raw Canvas/device-pixel API. Measurement and paint share a fixed advance;
 * callers must use measureElectronicText for wrapping/collision placement.
 * No browser font, fallback font, or measureText participates in this path.
 */
export function drawElectronicText(ctx,text,x,y,options={}){
  const chars=[...String(text??'')],m=metrics(options);
  let width=measureElectronicText(text,options),height=m.height;
  const fit=Number.isFinite(options.maxWidth)&&width>0?clamp(options.maxWidth/width,0,1):1;
  const cellWidth=m.cellWidth*fit,tracking=m.tracking*fit;
  width*=fit;height*=fit;
  if(!ctx||!chars.length||!fit||!Number.isFinite(x)||!Number.isFinite(y))return{width,height};
  const startX=x-(options.align==='center'?width/2:options.align==='right'?width:0);
  const startY=y-(options.baseline==='top'?0:options.baseline==='bottom'?height:height/2);
  const settings={mode:options.mode==='vfd'?'vfd':'lcd',color:options.color||'#bcd2b4',dim:options.dim||null,
    alpha:clamp(number(options.alpha,1),0,1),dpr:Math.max(.5,number(options.dpr,1))};
  const inherited=number(ctx.globalAlpha,1),alpha=inherited*settings.alpha;
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  ctx.globalAlpha=alpha;
  chars.forEach((ch,index)=>{
    if(ch===' ')return;
    const px=startX+index*(cellWidth+tracking),tile=glyphTile(ctx,ch,cellWidth,height,settings);
    if(tile)ctx.drawImage(tile.canvas,px-tile.bleed,startY-tile.bleed);
    else paintGlyph(ctx,ch,px,startY,cellWidth,height,{...settings,alpha});
  });
  ctx.restore();return{width,height};
}
