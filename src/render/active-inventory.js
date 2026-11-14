import {uiFill,uiStrokeRect,uiText} from './ui.js';
import {drawItemPortrait} from './item-portraits.js';
import {UI_COLOR} from './palette.js';

export function activeInventoryLayout({cols=80,rows=40}={}){
  const width=Math.min(51,Math.max(25,cols-4)),gap=.6,slotW=(width-gap*3)/4;
  const height=rows<32?3.8:4.8;
  return {x:2,y:2,w:width,h:height+1.2,slots:Array.from({length:4},(_,index)=>({
    index,x:2+index*(slotW+gap),y:3.2,w:slotW,h:height,
  }))};
}

export function drawActiveInventory(frame,size,{cycleLabel='Q'}={}){
  const layout=activeInventoryLayout(size);
  uiText(layout.x,layout.y,'WITHIN REACH','ui-label',.62);
  uiText(layout.x+layout.w-String(cycleLabel).length-8,layout.y,`[${cycleLabel}] HOLD`,'ui-secondary',.62);
  for(const rect of layout.slots){
    const slot=frame.slots[rect.index];
    uiFill(rect.x,rect.y,rect.w,rect.h,slot.selected?'rgba(216,138,59,.12)':'rgba(5,9,7,.54)');
    uiStrokeRect(rect.x,rect.y,rect.w,rect.h,slot.selected?UI_COLOR.amber:UI_COLOR.frame,slot.selected?.80:.32,1);
    uiText(rect.x+.4,rect.y,`${slot.number}`,slot.selected?'ui-amber':'ui-label',.8);
    if(slot.id)drawItemPortrait(slot.item||slot.id,rect.x+1.8,rect.y+.2,{w:rect.w-2.2,h:rect.h-1.1,alpha:slot.present?.9:.25});
    const label=slot.status==='ready'?slot.selected?'IN HAND':'READY':slot.status==='empty'?'EMPTY':slot.status==='deployed'?'DEPLOYED':slot.status==='missing'?'MISSING':'NOT OWNED';
    uiText(rect.x+.4,rect.y+rect.h-1,label.slice(0,Math.floor(rect.w-.8)),slot.selected?'ui-amber':'ui-secondary',.65);
  }
  return layout;
}
