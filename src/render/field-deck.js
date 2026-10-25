// Small, trusted rails shared by the ordinary-play field deck.

import { uiGlyph, uiText } from './ui.js';

export function takeSlotState(done=0,total=5){
  const count=Math.max(1,Math.floor(Number(total)||5));
  const filled=Math.max(0,Math.min(count,Math.floor(Number(done)||0)));
  return Array.from({length:count},(_,index)=>index<filled);
}

export function drawTakeRail({x=2,y=1,done=0,total=5,injuries=0,width=Infinity,labelClass='ui-label',labelAlpha=.68}={}){
  uiText(x,y,'TAKES',labelClass,labelAlpha);
  const slots=takeSlotState(done,total);
  const hurt=injuries>0?`HURT ×${Math.floor(injuries)}`:'';
  const step=Number.isFinite(width)?Math.max(1,Math.min(2,(width-8-hurt.length)/(Math.max(1,slots.length-1)))):2;
  slots.forEach((filled,index)=>{
    // These are ROM-native VFD cells, so even an empty bay remains legible on
    // the dark field glass instead of relying on an unsupported outline glyph.
    uiGlyph(x+7+index*step,y,filled?'▮':'▯',filled?'ui-green':'ui-secondary',filled ? .96 : .58);
  });
  if(hurt)uiText(Number.isFinite(width)?x+width-hurt.length:x+8+slots.length*2,y,hurt,'ui-danger',.88);
}
