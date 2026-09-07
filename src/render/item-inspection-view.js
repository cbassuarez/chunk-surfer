import {uiText,uiWrap,uiFill,uiStrokeRect} from './ui.js';
import {activeInputPromptDevice,promptLine} from '../game/bindings.js';

export function itemInspectionLayout(rect){
 const x=rect.x+2,y=rect.y+1,w=Math.max(1,rect.w-4),h=Math.max(1,rect.h-2);
 const wide=w>=62;
 const portrait=wide?{x,y:y+2,w:Math.floor(w*.53),h:Math.max(2,h-5)}
  :{x,y:y+2,w,h:Math.max(2,Math.min(11,(h-4)*.55))};
 const text=wide?{x:portrait.x+portrait.w+2,y:y+2,w:w-portrait.w-2,h:h-5}
  :{x,y:portrait.y+portrait.h+.5,w,h:Math.max(0,y+h-2-(portrait.y+portrait.h+.5))};
 return{title:{x,y,w},portrait,text,back:{x,y:y+h-1,w:14,h:1.5},reset:{x:x+w-18,y:y+h-1,w:18,h:1.5}};
}
export function drawItemInspectionView({entry,inspection,lines=[],rect,active=true}){
 const layout=itemInspectionLayout(rect),{title,portrait,text,back,reset}=layout;
 uiText(title.x,title.y,String(entry?.title||entry?.label||'ITEM').toUpperCase(),'ui-amber',1);
 uiFill(portrait.x,portrait.y,portrait.w,portrait.h,'rgba(0,0,0,.12)');
 uiStrokeRect(portrait.x,portrait.y,portrait.w,portrait.h,'#718069',.25,1);
 inspection?.draw(portrait,{active});
 let y=text.y;
 const write=(value,role='ui-secondary',max=3)=>{
  const rows=uiWrap(String(value||''),text.w).slice(0,Math.max(0,Math.min(max,Math.floor(text.y+text.h-y))));
  rows.forEach(line=>uiText(text.x,y++,line,role,.85));return rows.length;
 };
 if(write(entry?.description,'ui-primary'))y++;
 for(const line of lines){if(write(line?.text||line,line?.who==='you'?'ui-amber':'ui-secondary',4))y++;}
 if(!lines.length)for(const fact of entry?.facts||[])write(Array.isArray(fact)?fact.join(' · '):fact,'ui-secondary',2);
 const controller=activeInputPromptDevice()==='controller';
 const controls=inspection?.view().failed?'3D view unavailable.':controller?promptLine([{action:'select',label:'ROTATE'}]):'DRAG / ARROWS  ROTATE';
 if(portrait.h>=5)uiText(portrait.x+.8,portrait.y+portrait.h-1,controls,'ui-label',.65);
 uiText(back.x,back.y,controller?promptLine([{action:'back',label:'BACK'}]):'[ESC] BACK','ui-label',.82);
 uiText(reset.x,reset.y,controller?promptLine([{action:'tabPrev',label:'RESET VIEW'}]):'[R] RESET VIEW','ui-label',.82);
 return layout;
}
