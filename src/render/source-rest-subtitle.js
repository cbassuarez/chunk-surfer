import {uiWrap} from './ui.js';

// This long listening scene holds one complete utterance at a time. Full-width
// wrapping avoids dropping the opening words into the old narrow RX/TX lanes.
export function sourceRestSubtitleLayout(view,{cols=80,rows=30,choiceRows=0}={}){
  const width=Math.max(18,Math.min(86,cols-8)),x=Math.max(2,Math.floor((cols-width)/2));
  const pending=view?.pending?.kind==='branch',entry=pending?view.history?.at(-1):view?.line;
  const full=String(entry?.text||''),shown=pending?full:full.slice(0,Math.max(0,view?.typed||0));
  if(!full.trim()&&!view?.pending?.options?.length)return{x,width,y:rows-2,height:0,body:[],label:'',bodyHeight:0,empty:true};
  const body=uiWrap(shown,width-4),fullRows=uiWrap(full,width-4).length;
  const label=view?.restBlack?'':String(entry?.sourceLabel||((pending?entry?.who:view?.who)==='me'?'YOU':'HERE'));
  const bodyHeight=Math.max(body.length,fullRows,1),height=bodyHeight+(label?1:0)+choiceRows+2;
  return {x,width,y:Math.max(1,rows-height-2),height,body,label,bodyHeight,empty:false};
}
