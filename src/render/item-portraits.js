import {itemPortrait,ITEM_PORTRAITS} from '../data/item-portraits.js';
import {assetUrl} from '../platform/paths.js';
import {uiDraw} from './ui.js';
import {drawBagIcon} from './bag-icons.js';
const images=new Map();
const numberedStock = /^recording-cassette:([1-9]\d*)$/;

function drawStockNumber(ctx, value, item, x, y, w, h) {
 if(item.id!=='recording-cassette'||typeof value!=='object')return;
 const id=String(value?.sourceId||value?.id||'');
 const number=Number(numberedStock.exec(id)?.[1]);
 if(!Number.isSafeInteger(number)||number<1||w<20||h<12)return;
 const size=Math.max(7,Math.min(h*.19,w*.1));
 const stamp=String(number).padStart(3,'0');
 ctx.font=`bold ${size}px monospace`;
 ctx.textAlign='left';ctx.textBaseline='middle';
 const padding=size*.31,width=ctx.measureText(stamp).width+padding*2;
 const left=x-w*.5+padding,top=y+h*.5-size-padding*2;
 ctx.fillStyle='#161c16';ctx.fillRect(left,top,width,size+padding*2);
 ctx.fillStyle='#eadbb4';ctx.fillText(stamp,left+padding,top+padding+size*.5);
}
export function portraitImage(value,{large=false}={}){
 const item=itemPortrait(value),path=large?(item?.large||item?.small):(item?.small||item?.large);
 if(!path||typeof Image==='undefined')return null;
 const src=assetUrl(path);
 if(!images.has(src)){const image=new Image();image.decoding='async';image.src=src;images.set(src,image);}
 return images.get(src);
}
export function preloadItemPortraits(){for(const item of Object.values(ITEM_PORTRAITS))portraitImage(item.id);}
export function drawItemPortrait(value,x,y,{w=12,h=7,alpha=1,empty=false,large=false,tilt=0,shadow=true}={}){
 const item=itemPortrait(value);if(!item)return false;
 const image=portraitImage(item.id,{large:large||w>18});
 if(!empty&&(!image?.complete||!image.naturalWidth)){
  drawBagIcon(typeof value==='object'?value?.icon||item.id:item.id,x,y,{w,h,alpha});return true;
 }
 uiDraw(({ctx,dpr,cellW,cellH})=>{
  const px=x*cellW*dpr,py=y*cellH*dpr,pw=w*cellW*dpr,ph=h*cellH*dpr;
  if(pw<=0||ph<=0)return;ctx.save();ctx.beginPath();ctx.rect(px,py,pw,ph);ctx.clip();
  if(shadow){const g=ctx.createRadialGradient(px+pw*.5,py+ph*.83,0,px+pw*.5,py+ph*.83,pw*.36);g.addColorStop(0,'#0008');g.addColorStop(1,'#0000');ctx.save();ctx.translate(0,py+ph*.83);ctx.scale(1,.17);ctx.translate(0,-py-ph*.83);ctx.fillStyle=g;ctx.fillRect(px,py-ph*3,pw,ph*6);ctx.restore();}
  if(!empty&&image?.complete&&image.naturalWidth){
   const fit=Math.min(pw/image.naturalWidth,ph/image.naturalHeight),iw=image.naturalWidth*fit,ih=image.naturalHeight*fit;
   ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));ctx.translate(px+pw*.5,py+ph*.5);ctx.rotate(tilt);ctx.imageSmoothingEnabled=true;ctx.drawImage(image,-iw/2,-ih/2,iw,ih);
   drawStockNumber(ctx,value,item,0,0,iw,ih);
  }
  ctx.restore();
 });return true;
}
export function itemPortraitMarkup(value,{large=false}={}){
 const item=itemPortrait(value),path=large?(item?.large||item?.small):(item?.small||item?.large);if(!path)return '';
 return `<img class="item-portrait" src="${assetUrl(path)}" alt="" draggable="false" decoding="async">`;
}
