import {uiText,uiWrap,uiFill,uiStrokeRect} from './ui.js';
import {activeInputPromptDevice,promptLine} from '../game/bindings.js';
import {inventoryPrint} from './bag-view.js';
import {drawItemPortrait} from './item-portraits.js';
import {drawBagIcon} from './bag-icons.js';

const bound=(n,min,max)=>Math.max(min,Math.min(max,n));

// Every control and text page is laid out here, shared by drawing and hits.
// An object's facets never consume the space reserved for Back and Reset.
export function itemInspectionLayout(rect,{actions=[],focusIndex=0}={}){
 const x=rect.x+1.25,y=rect.y+.35,w=Math.max(1,rect.w-2.5),h=Math.max(1,rect.h-.7);
 const hasFacets=actions.length>0,facetY=y+1.4,facetH=1.35;
 const overflow=actions.length>Math.max(1,Math.floor(w/18));
 const facetW=Math.max(1,w-(overflow?8:0)),count=hasFacets?Math.min(actions.length,Math.max(1,Math.floor(facetW/18))):0;
 const focus=bound(focusIndex,0,Math.max(0,actions.length-1));
 const start=count?bound(focus-Math.floor(count/2),0,Math.max(0,actions.length-count)):0;
 const facets=Array.from({length:count},(_,i)=>({index:start+i,x:x+(overflow?4:0)+i*facetW/count,y:facetY,w:facetW/count-.35,h:facetH}));
 const contentY=y+(hasFacets?3.15:1.65),contentH=Math.max(1,y+h-1.6-contentY),wide=w>=42;
 const portrait=wide?{x,y:contentY,w:Math.floor(w*.49),h:contentH}
  :{x,y:contentY,w,h:Math.max(1,Math.min(7,contentH*.43))};
 const legendHeight=portrait.h>=4?1:0;
 const objectView={...portrait,h:portrait.h-legendHeight};
 const text=wide?{x:portrait.x+portrait.w+1.5,y:contentY,w:Math.max(1,w-portrait.w-1.5),h:contentH}
  :{x,y:portrait.y+portrait.h+.4,w,h:Math.max(.8,contentH-portrait.h-.4)};
 const rows=Math.max(1,Math.floor(text.h-1));
 return{title:{x,y,w},portrait,objectView,legendHeight,text,rows,facets,
  facetPrev:overflow?{x,y:facetY,w:3.5,h:facetH}:null,
  facetNext:overflow?{x:x+w-3.5,y:facetY,w:3.5,h:facetH}:null,
  back:{x,y:y+h-1.2,w:Math.min(16,w*.42),h:1.2},reset:{x:x+w-Math.min(18,w*.48),y:y+h-1.2,w:Math.min(18,w*.48),h:1.2},
  scrollUp:{x:text.x+text.w-7,y:text.y+text.h-.9,w:3,h:.9},
  scrollDown:{x:text.x+text.w-3,y:text.y+text.h-.9,w:3,h:.9}};
}

export function itemInspectionText({entry,lines=[],actions=[],activeIndex=0,width=30}={}){
 const active=actions[activeIndex],source=active
  ?[{text:active.label,who:'heading'},...(active.lines||[]),...(active.enabled===false&&active.reason?[{text:active.reason,who:'direction'}]:[])]
  :[{text:entry?.description,who:'direction'},...lines,...(!lines.length?(entry?.facts||[]).map(fact=>({text:Array.isArray(fact)?fact.join(' · '):fact,who:'direction'})):[])];
 const rows=[];
 for(const line of source){
  const text=String(typeof line==='string'?line:line?.text||'');if(!text)continue;
  if(rows.length)rows.push({text:'',who:'space'});
  for(const wrapped of uiWrap(text,Math.max(4,width)))rows.push({text:wrapped,who:line?.who||'direction'});
 }
 return rows;
}

export function drawItemInspectionView({entry,inspection,lines=[],rect,active=true,actions=entry?.inspectionActions||[],focusIndex=0,activeIndex=0,scroll=0}){
 const layout=itemInspectionLayout(rect,{actions,focusIndex}),{title,portrait,objectView,legendHeight,text,back,reset}=layout;
 uiFill(rect.x,rect.y,rect.w,rect.h,'#141c17');
 inventoryPrint(title.x,title.y,entry?.title||entry?.label||'Item',{w:title.w,h:1.05,ink:'#f0ecdc',finish:'screenprint'});
 uiFill(portrait.x,portrait.y,portrait.w,portrait.h,'rgba(0,0,0,.16)');
 uiStrokeRect(portrait.x,portrait.y,portrait.w,portrait.h,'#718069',.25,1);
 if(inspection)inspection.draw(objectView,{active});
 else if(!drawItemPortrait(entry,objectView.x,objectView.y,{...objectView,large:true,empty:entry?.present===false}))drawBagIcon(entry?.icon||entry?.sourceId||'item',objectView.x,objectView.y,{...objectView,empty:entry?.present===false});
 for(const button of layout.facets){
  const facet=actions[button.index],focused=button.index===focusIndex,chosen=button.index===activeIndex;
  uiFill(button.x,button.y,button.w,button.h,chosen?'#2a392a':'#1b261e');
  uiStrokeRect(button.x,button.y,button.w,button.h,focused?'#c6ab72':'#718069',focused?.9:.3,1);
  inventoryPrint(button.x+.45,button.y+.18,facet.label,{w:button.w-.9,h:.9,ink:facet.enabled===false?'#788476':chosen?'#f0ecdc':'#c9d0c2',finish:focused?'screenprint':'faceplate'});
 }
 for(const [box,label]of[[layout.facetPrev,'‹'],[layout.facetNext,'›']])if(box)inventoryPrint(box.x,box.y+.18,label,{w:box.w,h:.9,align:'center'});
 const allRows=itemInspectionText({entry,lines,actions,activeIndex,width:text.w}),maxScroll=Math.max(0,allRows.length-layout.rows),offset=bound(Math.floor(scroll)||0,0,maxScroll);
 allRows.slice(offset,offset+layout.rows).forEach((line,i)=>inventoryPrint(text.x,text.y+i,line.text,{w:text.w,h:.88,
  ink:line.who==='heading'?'#f0ecdc':line.who==='you'?'#cbb98e':'#c9d0c2',finish:line.who==='heading'?'screenprint':'faceplate'}));
 if(maxScroll){
  uiText(text.x,text.y+text.h-.9,`${offset+1}–${Math.min(offset+layout.rows,allRows.length)} / ${allRows.length}`,'ui-label',.65);
  for(const[box,label]of[[layout.scrollUp,'↑'],[layout.scrollDown,'↓']])uiText(box.x,box.y,label,'ui-label',.85);
 }
 const controller=activeInputPromptDevice()==='controller',view=inspection?.view?.();
 const controls=entry?.present===false?'ITEM NOT CARRIED':!inspection?'Object reference':view?.failed?'3D view unavailable':view?.loading?'Loading object':controller?promptLine([{action:'set',label:'ROTATE'}]):'DRAG / ← → ROTATE';
 if(legendHeight)inventoryPrint(portrait.x+.6,objectView.y+objectView.h+.04,controls,{w:portrait.w-1.2,ink:'#9eab98',alpha:.85});
 inventoryPrint(back.x,back.y,controller?promptLine([{action:'back',label:'Back'}]):'[ESC] Back',{w:back.w,h:.86});
 inventoryPrint(reset.x,reset.y,controller?promptLine([{action:'mapLocate',label:'Reset view'}]):'[R] Reset view',{w:reset.w,h:.86,alpha:inspection?.7:.35});
 return{...layout,scroll:offset,maxScroll,totalRows:allRows.length,visibleText:allRows.slice(offset,offset+layout.rows)};
}
