// Small, trusted rails shared by the ordinary-play field deck.

import { uiGlyph, uiText } from './ui.js';

export function takeSlotState(done=0,total=5){
  const count=Math.max(1,Math.floor(Number(total)||5));
  const filled=Math.max(0,Math.min(count,Math.floor(Number(done)||0)));
  return Array.from({length:count},(_,index)=>index<filled);
}

export function drawTakeRail({x=2,y=1,done=0,total=5,injuries=0}={}){
  uiText(x,y,'TAKES','ui-label',.68);
  const slots=takeSlotState(done,total);
  slots.forEach((filled,index)=>{
    // These are ROM-native VFD cells, so even an empty bay remains legible on
    // the dark field glass instead of relying on an unsupported outline glyph.
    uiGlyph(x+7+index*2,y,filled?'▮':'▯',filled?'ui-green':'ui-secondary',filled ? .96 : .58);
  });
  if(injuries>0)uiText(x+8+slots.length*2,y,`HURT ×${Math.floor(injuries)}`,'ui-danger',.88);
}
