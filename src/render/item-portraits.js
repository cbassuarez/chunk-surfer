import {itemPortrait,ITEM_PORTRAITS} from '../data/item-portraits.js';
import {assetUrl} from '../platform/paths.js';
import {uiDraw} from './ui.js';
const images=new Map();
export function portraitImage(value,{large=false}={}){
 const item=itemPortrait(value);if(!item||typeof Image==='undefined')return null;
 const src=assetUrl(large?item.large:item.small);
 if(!images.has(src)){const image=new Image();image.decoding='async';image.src=src;images.set(src,image);}
 return images.get(src);
}
export function preloadItemPortraits(){for(const item of Object.values(ITEM_PORTRAITS))portraitImage(item.id);}
export function drawItemPortrait(value,x,y,{w=12,h=7,alpha=1,empty=false,large=false,tilt=0,shadow=true}={}){
 const item=itemPortrait(value);if(!item)return false;
 const image=portraitImage(item.id,{large:large||w>18});
 uiDraw(({ctx,dpr,cellW,cellH})=>{
  const px=x*cellW*dpr,py=y*cellH*dpr,pw=w*cellW*dpr,ph=h*cellH*dpr;
  if(pw<=0||ph<=0)return;ctx.save();ctx.beginPath();ctx.rect(px,py,pw,ph);ctx.clip();
  if(shadow){const g=ctx.createRadialGradient(px+pw*.5,py+ph*.83,0,px+pw*.5,py+ph*.83,pw*.36);g.addColorStop(0,'#0008');g.addColorStop(1,'#0000');ctx.save();ctx.translate(0,py+ph*.83);ctx.scale(1,.17);ctx.translate(0,-py-ph*.83);ctx.fillStyle=g;ctx.fillRect(px,py-ph*3,pw,ph*6);ctx.restore();}
  if(!empty&&image?.complete&&image.naturalWidth){
   const fit=Math.min(pw/image.naturalWidth,ph/image.naturalHeight),iw=image.naturalWidth*fit,ih=image.naturalHeight*fit;
   ctx.globalAlpha=Math.max(0,Math.min(1,alpha));ctx.translate(px+pw*.5,py+ph*.5);ctx.rotate(tilt);ctx.imageSmoothingEnabled=true;ctx.drawImage(image,-iw/2,-ih/2,iw,ih);
  }
  ctx.restore();
 });return true;
}
export function itemPortraitMarkup(value,{large=false}={}){
 const item=itemPortrait(value);if(!item)return '';
 return `<img class="item-portrait" src="${assetUrl(large?item.large:item.small)}" alt="" draggable="false" decoding="async">`;
}
