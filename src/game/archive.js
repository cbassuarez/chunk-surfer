import * as scenes from './scenes.js';
import {uiFill,uiLine,uiSize,uiText,uiWrap,uiCellMetrics,uiWithClip} from '../render/ui.js';
import {drawVfdText} from '../render/presentation.js';
import {UI_COLOR} from '../render/palette.js';
import {fitText,fitLines} from '../render/fit-text.js';
import {drawAchievementIcon} from '../render/achievement-icons.js';
import {createHitRegions} from '../render/hit-regions.js';
import {achievementEntries,achievementCompletion} from '../progression/achievements.js';
import {completionCollections} from '../progression/completion.js';
import * as AUDIO from '../audio/story-audio.js';
import {returnFileEntries} from './second-shift.js';
import {returnDefinition} from '../progression/report.js';
import {endingHintForEnding} from './post-run-copy.js';
import {getSave,getMeta} from './save.js';
import {playDurationLine} from './play-duration.js';
import * as PB from './playback.js';
import {archivedRecordingRows,archivedRecordingStatus} from './night-failure-archive.js';
import {takeStamp} from './clock.js';
import {inputPrompt,activeInputPromptDevice} from './bindings.js';
import {ARCHIVE_TABS,ARCHIVE_CATEGORIES,ARCHIVE_CATEGORY_LABEL,ARCHIVE_FILTERS,archiveFilteredEntries,archivePercent,archiveAchievementCopy,archiveContentLayout,archiveProgressLine} from './archive-model.js';
import {withAchievementDeck,drawAchievementVfd,drawAchievementRule,drawAchievementDeckControl,drawAchievementCell,achievementGridLayout,achievementTextLines,ACHIEVEMENT_DECK_COLORS,ACHIEVEMENT_DECK_TONES} from '../render/achievement-deck.js';

const TAB_LABEL={achievements:'ACHIEVEMENTS',discoveries:'DISCOVERIES',history:'RUN HISTORY'};
const readableScope=value=>String(value||'ACROSS RUNS').replaceAll('-',' ').replaceAll('_',' ').toUpperCase();
const dateLabel=value=>Number.isFinite(Number(value))&&Number(value)>0?new Date(Number(value)).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';

export function makeArchiveScene({meta,onClose=()=>{},summaryId=null,recordings=false,initialTab='achievements',getProfile=()=>meta||getMeta(),getRun=()=>getSave()?.run}={}){
 let tab=ARCHIVE_TABS.includes(initialTab)?initialTab:'achievements',category='all',filter='all',sel=0,scroll=0,detailOpen=false;
 let docPage=0,renderedPages=1,recordingMode=false,recordingSel=0,recordingMessage='',revealArmed=false,a11y=null,lastAnnouncement='',detailScroll=0,maxDetailScroll=0,listFocus='entries',detailAction='hint',achievementLayout=null,gridStartRow=0,pressedId=null,pressedKey=null;
 const revealed=new Set(),hinted=new Set(),hits=createHitRegions();
 const clearPressed=()=>{pressedId=null;pressedKey=null;};
 const keyToken=e=>String(e.controllerAction||e.code||e.key||'').toLowerCase();
 const pressKey=(id,e)=>{pressedId=id;pressedKey=keyToken(e);};
 const data=()=>{const profile=getProfile()||{},run=getRun();return{profile,run,entries:achievementEntries(profile,{run}),completion:achievementCompletion(profile,run),files:returnFileEntries(profile),collections:completionCollections(profile)};};
 const listFor=d=>tab==='history'?d.files:tab==='discoveries'?d.collections:archiveFilteredEntries(d.entries,{category,filter});
 const selectedRecordings=()=>archivedRecordingRows(data().files[sel]?.summary);
 const close=()=>{AUDIO.menuBack?.();scenes.pop();};
 const resetCursor=()=>{sel=0;scroll=0;gridStartRow=0;docPage=0;detailOpen=false;revealArmed=false;detailScroll=0;listFocus='entries';detailAction='hint';};
 const clamp=d=>{sel=Math.max(0,Math.min(sel,Math.max(0,listFor(d).length-1)));};
 const select=i=>{sel=Math.max(0,i);clamp(data());docPage=0;revealArmed=false;detailScroll=0;listFocus='entries';detailAction='hint';AUDIO.menuMove?.();};
 const setTab=value=>{if(!ARCHIVE_TABS.includes(value))return;if(recordingMode){if(PB.archivedPlaybackActive())PB.stopPlayback();recordingMode=false;}tab=value;resetCursor();AUDIO.menuPage?.();};
 const setCategory=value=>{category=value;resetCursor();AUDIO.menuPage?.();};
 const changeFilter=()=>{filter=ARCHIVE_FILTERS[(ARCHIVE_FILTERS.indexOf(filter)+1)%ARCHIVE_FILTERS.length];resetCursor();AUDIO.menuPage?.();};
 const hint=()=>{const d=data(),e=listFor(d)[sel];if(tab==='achievements'&&e?.hidden&&!e.unlocked&&e.hint){hinted.add(e.id);detailOpen=true;detailScroll=0;detailAction='hint';AUDIO.menuConfirm?.();}};
 const askReveal=()=>{const e=listFor(data())[sel];if(tab==='achievements'&&e?.hidden&&!e.unlocked&&!revealed.has(e.id)){detailOpen=true;revealArmed=true;detailAction='reveal';AUDIO.menuMove?.();}};
 function ensureA11y(){
  if(typeof document==='undefined')return;
  a11y=document.getElementById('archive-a11y-status');
  if(!a11y){a11y=document.createElement('div');a11y.id='archive-a11y-status';a11y.setAttribute('role','status');a11y.setAttribute('aria-live','polite');Object.assign(a11y.style,{position:'fixed',width:'1px',height:'1px',overflow:'hidden',clipPath:'inset(50%)',whiteSpace:'nowrap'});document.body.appendChild(a11y);}
 }
 function announce(d){
  if(!a11y)return;const e=listFor(d)[sel],copy=tab==='achievements'?archiveAchievementCopy(e,{reveal:revealed.has(e?.id),hint:hinted.has(e?.id)}):null;
  const text=[`${archivePercent(d.completion)} complete. ${d.completion.completed} of ${d.completion.total} achievements.`,TAB_LABEL[tab],listFocus==='filter'?`Filter ${filter}. Confirm changes the filter.`:listFocus==='categories'?`Category ${ARCHIVE_CATEGORY_LABEL[category]}. Left or right changes category. Confirm returns to the matrix.`:copy?`${copy.name}. ${copy.description}`:e?.label||returnDefinition(e?.summary?.endingId)?.title||'No entries.',detailOpen&&copy?.concealed?`Selected action: ${detailAction}. Left or right changes action. Confirm activates.`:'',revealArmed?'Reveal the full requirement? Enter confirms. Escape cancels.':''].filter(Boolean).join(' ');
  if(text!==lastAnnouncement){lastAnnouncement=text;a11y.textContent=text;}
 }
 const first=data();if(summaryId){const index=first.files.findIndex(f=>f.summary?.id===summaryId);if(index>=0){tab='history';sel=index;recordingMode=!!recordings;}}
 const scene={
  id:'archive',blocksInput:true,blocksWorld:true,handlesEscape:true,lensPreset:'calm',
  enter(){AUDIO.startMenuHiss?.();ensureA11y();},
  exit(){clearPressed();if(PB.archivedPlaybackActive())PB.stopPlayback();AUDIO.stopMenuHiss?.();a11y?.remove();a11y=null;onClose();},
  resume(){clearPressed();},
  update(){if(typeof document!=='undefined'&&(document.hidden||document.hasFocus&&!document.hasFocus()))clearPressed();if(PB.archivedPlaybackActive())PB.tickPlayback();},
  pointer(e){
   const filter=r=>!revealArmed||['confirm-reveal','cancel-reveal','back'].includes(r.id);
   if(e.type==='pointerup'||e.type==='pointercancel'){clearPressed();hits.handle(e,{filter,press:false,click:false});return true;}
   if(e.type==='pointerdown'){const hit=hits.hit(e.cellX,e.cellY,filter);pressedId=hit&&!hit.disabled?hit.id:null;pressedKey=null;}
   hits.handle(e,{filter});return true;
  },
  keyup(e){if(pressedKey&&pressedKey===keyToken(e))clearPressed();return true;},
  key(e){
   const k=String(e.key||'').toLowerCase(),d=data();clamp(d);
   if(recordingMode){
    const rows=selectedRecordings();
    if(e.key==='Escape'||k==='b'||k==='r'){if(PB.archivedPlaybackActive())PB.stopPlayback();recordingMode=false;return true;}
    if(e.key==='ArrowUp'||k==='w'){recordingSel=Math.max(0,recordingSel-1);recordingMessage='';return true;}
    if(e.key==='ArrowDown'||k==='s'){recordingSel=Math.max(0,Math.min(rows.length-1,recordingSel+1));recordingMessage='';return true;}
    if(e.key==='Enter'||e.key===' '){
     if(e.repeat)return true;if(PB.archivedPlaybackActive()){PB.stopPlayback();recordingMessage='STOPPED';return true;}
     const row=rows[recordingSel];if(!row||archivedRecordingStatus(row)==='UNAVAILABLE'){recordingMessage='RECORDING UNAVAILABLE';return true;}
     const playing=PB.playArchivedTake(row);recordingMessage=playing?'PLAYING':PB.playbackError()?.message||'AUDIO UNAVAILABLE';
     if(playing?.readyPromise)void playing.readyPromise.then(result=>{if(!result)recordingMessage=PB.playbackError()?.message||'RECORDING UNAVAILABLE';});return true;
    }return true;
   }
   if(revealArmed){if((e.key==='Enter'||e.key===' ')&&!e.repeat){pressKey('confirm-reveal',e);const entry=listFor(d)[sel];if(entry)revealed.add(entry.id);revealArmed=false;detailScroll=0;AUDIO.menuConfirm?.();}else if(e.key==='Escape'||k==='b'||k==='r'){pressKey('cancel-reveal',e);revealArmed=false;}return true;}
   if(e.key==='Escape'||k==='b'){pressKey('back',e);if(detailOpen){detailOpen=false;return true;}close();return true;}
   if(e.key==='Tab'||e.controllerAction==='tabPrev'||k==='q'||k==='e'&&!e.controller){const sign=e.shiftKey||e.controllerAction==='tabPrev'||k==='q'?-1:1;setTab(ARCHIVE_TABS[(ARCHIVE_TABS.indexOf(tab)+sign+ARCHIVE_TABS.length)%ARCHIVE_TABS.length]);pressKey('tab:'+tab,e);return true;}
   if(tab==='achievements'&&k==='f'){changeFilter();pressKey('filter',e);return true;}
   if(tab==='achievements'&&k==='h'){hint();pressKey('hint',e);return true;}
   if(tab==='achievements'&&k==='r'){askReveal();pressKey('reveal',e);return true;}
   if(tab==='history'&&k==='r'&&selectedRecordings().length){recordingMode=true;recordingSel=0;recordingMessage='';return true;}
   if(e.key==='Enter'||e.key===' '){
    if(e.repeat)return true;if(listFocus==='filter'&&!detailOpen){changeFilter();pressKey('filter',e);listFocus='filter';return true;}
    if(listFocus==='categories'&&!detailOpen){pressKey('category:'+category,e);listFocus='entries';return true;}
    if(detailOpen&&tab==='history'&&selectedRecordings().length){recordingMode=true;recordingSel=0;recordingMessage='';return true;}
    const entry=listFor(d)[sel],copy=tab==='achievements'?archiveAchievementCopy(entry,{reveal:revealed.has(entry?.id)}):null;
    if(detailOpen&&copy?.concealed){if(detailAction==='hint'&&entry.hint){hint();pressKey('hint',e);}else{askReveal();pressKey('reveal',e);}return true;}
    if(tab==='achievements')pressKey('entry:'+sel,e);
    detailOpen=!detailOpen;detailScroll=0;if(copy?.concealed)detailAction=entry.hint?'hint':'reveal';AUDIO.menuConfirm?.();return true;
   }
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    const sign=e.key==='ArrowLeft'?-1:1;
    if(tab==='achievements'){
     const entry=listFor(d)[sel],copy=archiveAchievementCopy(entry,{reveal:revealed.has(entry?.id)});
     if(detailOpen&&copy?.concealed){detailAction=entry.hint?(detailAction==='hint'?'reveal':'hint'):'reveal';AUDIO.menuMove?.();}
     else if(detailOpen)select(sel+sign);
     else if(listFocus==='filter'){changeFilter();listFocus='filter';}
     else if(listFocus==='categories'){setCategory(ARCHIVE_CATEGORIES[(ARCHIVE_CATEGORIES.indexOf(category)+sign+ARCHIVE_CATEGORIES.length)%ARCHIVE_CATEGORIES.length]);pressKey('category:'+category,e);listFocus='categories';}
     else select(sel+sign);
    }
    else if(tab==='history'){docPage=Math.max(0,Math.min(renderedPages-1,docPage+sign));AUDIO.menuPage?.();}
    else select(sel+sign);return true;
   }
   if(e.key==='ArrowUp'||k==='w'){if(detailOpen&&tab!=='history')detailScroll=Math.max(0,detailScroll-1);else if(tab==='achievements'&&listFocus==='filter')listFocus='categories';else if(tab==='achievements'&&listFocus==='categories')listFocus='filter';else if(tab==='achievements'&&sel<(achievementLayout?.columns||6))listFocus='filter';else select(sel-(tab==='achievements'?(achievementLayout?.columns||6):1));return true;}
   if(e.key==='ArrowDown'||k==='s'){if(detailOpen&&tab!=='history')detailScroll=Math.min(maxDetailScroll,detailScroll+1);else if(listFocus==='filter')listFocus='entries';else if(listFocus==='categories')listFocus='filter';else select(sel+(tab==='achievements'?(achievementLayout?.columns||6):1));return true;}
   if(e.key==='PageUp'){select(sel-8);return true;}if(e.key==='PageDown'){select(sel+8);return true;}
   if(e.key==='Home'){select(0);return true;}if(e.key==='End'){select(listFor(d).length-1);return true;}
   return true;
  },
  view(){const d=data();clamp(d);const e=listFor(d)[sel],copy=tab==='achievements'?archiveAchievementCopy(e,{reveal:revealed.has(e?.id),hint:hinted.has(e?.id)}):null;return{tab,category,filter,selectedIndex:sel,selectedId:e?.id||e?.summary?.id||null,detailOpen,detailScroll,maxDetailScroll,listFocus,detailAction,recordingMode,revealArmed,pressedId,gridColumns:achievementLayout?.columns||0,gridStartRow,completion:d.completion,percent:archivePercent(d.completion),count:listFor(d).length,selected:copy?{...copy,unlocked:!!e.unlocked}:e?{label:e.label,current:e.current,target:e.target}:null};},
  render(){
   const d=data();clamp(d);hits.reset();announce(d);const{cols,rows}=uiSize();uiFill(0,0,cols,rows,UI_COLOR.glass);
   const w=Math.min(112,cols-4),h=Math.max(12,rows-4),x=Math.floor((cols-w)/2),y=Math.floor((rows-h)/2);
   if(tab==='achievements'&&!recordingMode){drawAchievementMatrix(d,{x,y,w,h});return;}
   const frame={x,y,w,h};
   withAchievementDeck(frame,{label:recordingMode?'RETAINED TAPE':'MASTER INDEX',completion:d.completion,footer:'PROFILE / ALL RETURNS + MASTERY'},body=>{
    drawArchiveDeckTabs(d,frame);
    if(recordingMode){drawRecordings(body,d);return;}
    const percent=archivePercent(d.completion),right=body.x+body.w,layout=archiveContentLayout(body,{tab,detail:detailOpen}),list=listFor(d),entry=list[sel],tabsY=body.y+(layout.compact?2:4),headingScale=layout.compact?1:2,percentWidth=percent.length*headingScale;
    drawVfdText(body.x,body.y,layout.compact?`${d.completion.completed}/${d.completion.total} ALL RUNS`:'COMPLETION',{scale:headingScale,color:UI_COLOR.amber,max:Math.max(1,body.w-percentWidth-2)});
    drawVfdText(right-percentWidth,body.y,percent,{scale:headingScale,color:d.completion.complete?UI_COLOR.green:UI_COLOR.amber,max:percentWidth});
    if(!layout.compact)uiText(body.x,body.y+2,fitText(`${d.completion.completed} / ${d.completion.total} ACHIEVEMENTS · ALL RUNS · MASTERY INCLUDED`,body.w),'ui-label',.8);
    const time=playDurationLine(getSave(),body.w);uiText(body.x,body.y+(layout.compact?1:3),fitText(time,body.w),'ui-secondary',.65);
    if(tab==='achievements'&&!layout.detail){
     if(layout.compact){
      const group=category==='all'?d.completion:d.completion.categories.find(c=>c.id===category)||{completed:0,total:0},label=`[◂] ${ARCHIVE_CATEGORY_LABEL[category]} ${group.completed}/${group.total} [▸]`,yy=body.y+3;
      uiText(body.x,yy,fitText(label,Math.max(1,body.w-14)),'ui-amber');
      hits.add({id:'category-prev',x:body.x,y:yy,w:3,h:1,onClick:()=>setCategory(ARCHIVE_CATEGORIES[(ARCHIVE_CATEGORIES.indexOf(category)-1+ARCHIVE_CATEGORIES.length)%ARCHIVE_CATEGORIES.length])});
      hits.add({id:'category-next',x:body.x+Math.min(label.length-3,body.w-17),y:yy,w:3,h:1,onClick:()=>setCategory(ARCHIVE_CATEGORIES[(ARCHIVE_CATEGORIES.indexOf(category)+1)%ARCHIVE_CATEGORIES.length])});
      const f=`${listFocus==='filter'?inputPrompt('confirm'):'[F]'} ${filter.toUpperCase()}`;uiText(right-f.length,yy,f,listFocus==='filter'?'ui-amber':'ui-label');hits.add({id:'filter',x:right-f.length,y:yy,w:f.length,h:1,onClick:changeFilter});
     }else{
     let cx=body.x;const short=body.w<90;
     for(const id of ARCHIVE_CATEGORIES){const group=id==='all'?d.completion:d.completion.categories.find(c=>c.id===id)||{completed:0,total:0},label=`${category===id?'[':''}${short?({all:'ALL',work:'WORK',disclosures:'FINDS',returns:'ENDS',method:'MASTERY'})[id]:ARCHIVE_CATEGORY_LABEL[id]} ${group.completed}/${group.total}${category===id?']':''}`;
      uiText(cx,body.y+5,label,category===id?'ui-amber':'ui-secondary');hits.add({id:'category:'+id,x:cx,y:body.y+5,w:label.length,h:1,onClick:()=>setCategory(id)});cx+=label.length+2;
     }
     const label=`${listFocus==='filter'?'▸ ':''}FILTER  ${filter.toUpperCase()}  ${listFocus==='filter'?inputPrompt('confirm'):'[F]'}`;uiText(body.x,body.y+6,label,listFocus==='filter'?'ui-amber':'ui-label');hits.add({id:'filter',x:body.x,y:body.y+6,w:label.length,h:1,onClick:changeFilter});
     }
    }
    if(!layout.compact)uiLine(layout.divider,layout.contentY,layout.divider,body.y+body.h-2,UI_COLOR.frame,.55);
    if(!layout.detail){
     if(sel<scroll)scroll=sel;if(sel>=scroll+layout.capacity)scroll=sel-layout.capacity+1;
     list.slice(scroll,scroll+layout.capacity).forEach((e,j)=>{
      const i=scroll+j,yy=layout.contentY+j*layout.rowHeight,on=i===sel&&listFocus==='entries',hidden=tab==='achievements'&&e.hidden&&!e.unlocked&&!revealed.has(e.id),status=tab==='achievements'?(e.unlocked?'DONE':hidden?'SEALED':'OPEN'):tab==='discoveries'?`${e.current}/${e.target}`:e.summary?.classification==='failed-night'?'FAILED':'FILED';
      const title=tab==='achievements'?(hidden?'UNDISCOVERED '+String(d.entries.indexOf(e)+1).padStart(2,'0'):e.name):tab==='discoveries'?e.label:returnDefinition(e.summary?.endingId)?.title||String(e.summary?.endingId||'RETURN');
      const iconW=tab==='achievements'&&layout.rowHeight===2?5:0;
      if(iconW)drawAchievementIcon(e.icon||e.id,body.x+.5,yy,{w:4,h:1.7,unlocked:e.unlocked,concealed:hidden});
      const nameX=body.x+iconW,statusX=body.x+layout.listW-status.length;
      uiText(nameX,yy,fitText(`${on?'▸':' '} ${title.toUpperCase()}`,Math.max(4,statusX-nameX-1)),on?'ui-amber':tab==='achievements'&&!e.unlocked?'ui-secondary':'ui-primary');
      uiText(statusX,yy,status,e.unlocked||tab==='discoveries'&&e.current===e.target?'ui-green':'ui-secondary');
      if(layout.rowHeight===2){const line=tab==='achievements'&&!hidden?archiveProgressLine(e.progress):tab==='history'?String(e.summary?.completedAt?dateLabel(e.summary.completedAt):''):'';if(line)uiText(nameX+2,yy+1,fitText(line,Math.max(1,layout.listW-iconW-3)),'ui-label',.65);}
      hits.add({id:'entry:'+i,x:body.x,y:yy,w:layout.listW,h:layout.rowHeight,onHover:()=>{},onClick:()=>{if(sel===i&&layout.compact)detailOpen=true;else select(i);}});
     });
     if(!list.length){const empty=tab==='history'?'NO FILED RUNS':tab==='achievements'?'NO ENTRIES IN THIS CATEGORY':'NO DISCOVERIES INDEXED';uiText(body.x,layout.contentY+1,empty,'ui-secondary');uiWrap(tab==='achievements'?'Change the category or filter to see other achievements.':'Existing discoveries and filed runs appear here as you play.',layout.listW).slice(0,Math.max(1,layout.contentH-3)).forEach((s,i)=>uiText(body.x,layout.contentY+3+i,s,'ui-secondary'));}
    }
    if(entry&&(!layout.compact||layout.detail)){
     if(tab==='achievements')drawAchievementDetail(entry,body,layout);
     else if(tab==='discoveries')drawCollection(entry,body,layout);
     else drawHistory(entry,body,layout);
    }
    const concealed=tab==='achievements'&&entry?.hidden&&!entry.unlocked&&!revealed.has(entry.id),confirm=inputPrompt('confirm'),hasRecordings=tab==='history'&&selectedRecordings().length>0;
    const recordingAction=hasRecordings?`${detailOpen?confirm:'[R]'} RECORDINGS`:'';
    const bottom=recordingAction?`${recordingAction} · ◂ ▸ DOCUMENT`:detailOpen&&concealed?`← → ACTION · ${confirm}`:'';
    if(bottom)uiText(body.x,layout.actionY,fitText(bottom,Math.max(1,body.w-9)),'ui-label',.9);
    if(hasRecordings)hits.add({id:'history-recordings',x:body.x,y:layout.actionY,w:Math.min(recordingAction.length,body.w-9),h:1,onClick:()=>scene.key({key:'r'})});
   });
   drawArchiveDeckControl('back',{x:frame.x+frame.w-11,y:frame.y+frame.h-1.6,w:8.5,h:1.1},'BACK',()=>{if(recordingMode)scene.key({key:'Escape'});else if(detailOpen)detailOpen=false;else close();});
  },
 };
 function drawArchiveDeckControl(id,rect,label,onClick,options={}){
  drawAchievementDeckControl(rect,label,{...options,pressed:pressedId===id});hits.add({id,...rect,onClick});
 }
 function drawArchiveDeckTabs(d,frame){
  const metrics=uiCellMetrics(),tabW=(frame.w-4-1.2)/3;
  ARCHIVE_TABS.forEach((id,i)=>{
   const count=id==='achievements'?d.entries.length:id==='discoveries'?`${d.collections.reduce((n,row)=>n+row.current,0)}/${d.collections.reduce((n,row)=>n+row.target,0)}`:d.files.length;
   const label=`${id==='achievements'?'ACHIEVEMENTS':id==='discoveries'?'DISCOVERIES':'RUNS'} ${count}`;
   drawArchiveDeckControl('tab:'+id,{x:frame.x+2+i*(tabW+.6),y:frame.y+Math.max(2.95,59/metrics.cellH),w:tabW,h:1.55},label,()=>setTab(id),{selected:tab===id,category:{achievements:'work',discoveries:'disclosures',history:'returns'}[id]});
  });
 }
 function drawAchievementMatrix(d,frame){
  const C=ACHIEVEMENT_DECK_COLORS,metrics=uiCellMetrics(),list=listFor(d),entry=list[sel];
  const control=drawArchiveDeckControl;
  withAchievementDeck(frame,{label:'MASTER INDEX',completion:d.completion,footer:'PROFILE / ALL RETURNS + MASTERY'},body=>{
   drawArchiveDeckTabs(d,frame);
   achievementLayout=achievementGridLayout(body,list.length,{detailOpen,...metrics});
   const l=achievementLayout,filterW=Math.min(15,body.w*.22),categoryW=(body.w-filterW-2)/ARCHIVE_CATEGORIES.length;
   // Retain measured current-run time in the matrix's existing header band.
   // It must not inherit the fictional night clock or disappear in details.
   drawAchievementVfd(playDurationLine(getSave(),body.w),body.x,body.y+.05,{fontPx:11,width:body.w,color:C.muted});
   if(l.detailOnly)l.detail={...l.detail,y:l.detail.y+.7,h:Math.max(1,l.detail.h-.7)};
   if(!l.detailOnly){ARCHIVE_CATEGORIES.forEach((id,i)=>{
    const group=id==='all'?d.completion:d.completion.categories.find(c=>c.id===id)||{completed:0,total:0};
    const short={all:'ALL',work:'WORK',disclosures:'SECRETS',returns:'ENDS',method:'MASTERY'};
    control('category:'+id,{x:body.x+i*categoryW,y:body.y+.9,w:categoryW-.45,h:1.45},`${short[id]} ${group.completed}/${group.total}`,()=>setCategory(id),{selected:category===id,focused:listFocus==='categories'&&category===id,category:id});
   });
   control('filter',{x:body.x+body.w-filterW,y:body.y+.9,w:filterW,h:1.45},filter.toUpperCase(),()=>{changeFilter();listFocus='filter';},{focused:listFocus==='filter',category});}
   if(!l.detailOnly){
    const selectedRow=Math.floor(sel/l.columns);
    if(selectedRow<gridStartRow)gridStartRow=selectedRow;
    if(selectedRow>=gridStartRow+l.visibleRows)gridStartRow=selectedRow-l.visibleRows+1;
    gridStartRow=Math.max(0,Math.min(gridStartRow,Math.max(0,l.totalRows-l.visibleRows)));
    list.forEach((e,i)=>{
     const row=Math.floor(i/l.columns);if(row<gridStartRow||row>=gridStartRow+l.visibleRows)return;
     const rect=l.cell(i,gridStartRow),concealed=e.hidden&&!e.unlocked&&!revealed.has(e.id);
     drawAchievementCell(e.icon||e.id,rect,{unlocked:e.unlocked,concealed,selected:i===sel&&listFocus==='entries',pressed:pressedId==='entry:'+i,category:e.category});
     hits.add({id:'entry:'+i,...rect,label:concealed?'SEALED ENTRY':e.name,onClick:()=>{if(sel===i&&l.compact)detailOpen=true;else select(i);}});
    });
    if(!list.length){drawAchievementVfd('NO MATCHING ENTRIES',l.grid.x,l.grid.y+1,{fontPx:14,width:l.grid.w,color:C.muted});}
    if(l.totalRows>l.visibleRows){
     const fy=body.y+body.h-1.8,first=gridStartRow*l.columns+1,last=Math.min(list.length,(gridStartRow+l.visibleRows)*l.columns);
     drawAchievementVfd(`${first}–${last} / ${list.length}`,l.grid.x,fy,{fontPx:11,width:l.grid.w,color:C.muted});
    }
   }
   if(entry&&(!l.compact||l.detailOnly))drawDeckAchievementDetail(entry,l.detail);
   else if(l.compact&&entry){
    const copy=archiveAchievementCopy(entry,{reveal:revealed.has(entry.id)});
    drawAchievementVfd('CONFIRM TO INSPECT',body.x+body.w,body.y+body.h-1.8,{fontPx:11,align:'right',color:C.muted});
   }
   if(!l.compact){drawAchievementRule(l.detail.x-1, l.detail.y,l.detail.w+1,{alpha:.2});}
   drawAchievementVfd(`${archivePercent(d.completion)} · ${d.completion.completed}/${d.completion.total} · ALL RUNS`,body.x,body.y+body.h-.65,{fontPx:11,width:body.w,color:d.completion.complete?C.green:C.muted});
  });
  control('back',{x:frame.x+frame.w-11,y:frame.y+frame.h-1.6,w:8.5,h:1.1},'BACK',()=>{if(detailOpen)detailOpen=false;else close();});
 }
 function drawDeckAchievementDetail(entry,r){
  const C=ACHIEVEMENT_DECK_COLORS,tone=ACHIEVEMENT_DECK_TONES[entry.category]||ACHIEVEMENT_DECK_TONES.all,m=uiCellMetrics(),copy=archiveAchievementCopy(entry,{reveal:revealed.has(entry.id),hint:hinted.has(entry.id)});
  const text=(s,y,{fontPx=14,color=C.text,width=r.w,align='left'}={})=>drawAchievementVfd(s,r.x,y,{fontPx,color,width,align});
  const lines=(s,fontPx=14)=>achievementTextLines(s,r.w*m.cellW,{fontPx});
  const renderRows=(rows,y,{fontPx=14,color=C.text,lineH=1}={})=>{rows.forEach((line,i)=>text(line,y+i*lineH,{fontPx,color}));return y+rows.length*lineH;};
  const end=r.y+r.h;
  if(revealArmed){
   let y=renderRows(lines('REVEAL REQUIREMENT?',17),r.y,{fontPx:17,color:tone.signal,lineH:1.15});
   y=renderRows(lines('This shows the name and exact unlock condition. It may reveal story events.'),y+.6);
   const by=Math.max(y+.5,end-2.8),yes={x:r.x,y:by,w:r.w,h:1.2},no={x:r.x,y:by+1.4,w:r.w,h:1.2};
   drawAchievementDeckControl(yes,'REVEAL',{selected:true,category:entry.category,pressed:pressedId==='confirm-reveal'});drawAchievementDeckControl(no,'KEEP SEALED',{pressed:pressedId==='cancel-reveal'});
   hits.add({id:'confirm-reveal',...yes,onClick:()=>scene.key({key:'Enter'})});hits.add({id:'cancel-reveal',...no,onClick:()=>{revealArmed=false;}});return;
  }
  let y=r.y;
  if(r.h*m.cellH>=315){const size=68;drawAchievementCell(copy.icon,{x:r.x+(r.w-size/m.cellW)/2,y,w:size/m.cellW,h:size/m.cellH},{unlocked:entry.unlocked,concealed:copy.concealed,category:entry.category});y+=size/m.cellH+.65;}
  const title=lines(copy.name,18);y=renderRows(title,y,{fontPx:18,color:entry.unlocked?tone.signal:C.text,lineH:1.17});
  y+=.5;
  const status=entry.unlocked?`FILED${entry.unlockedAt?' · '+dateLabel(entry.unlockedAt):''}`:copy.concealed?'SEALED ENTRY':readableScope(copy.scope);
  y=renderRows(lines(status,11),y,{fontPx:11,color:tone.signal,lineH:.8});
  if(copy.progress){
   y+=.35;y=renderRows(lines(`${copy.progress.current} / ${copy.progress.target} · ${copy.progress.label||'FILED'}`,12),y,{fontPx:12,color:tone.signal,lineH:.85});
  }
  y+=.65;drawAchievementRule(r.x,y-.25,r.w);
  const actionH=copy.concealed?2.9:0,capacity=Math.max(1,Math.floor(end-y-actionH)),description=lines(copy.description,14);
  maxDetailScroll=Math.max(0,description.length-capacity);detailScroll=Math.min(detailScroll,maxDetailScroll);
  const viewport={x:r.x,y,w:r.w,h:Math.max(.9,end-y-actionH)};
  uiWithClip(viewport,()=>renderRows(description.slice(detailScroll,detailScroll+capacity),y,{color:copy.hintVisible?'#bad2b6':C.text}));
  if(maxDetailScroll>0)drawAchievementVfd(`${detailScroll+1}/${maxDetailScroll+1} DOWN`,r.x+r.w,end-actionH-.1,{fontPx:10,align:'right',color:C.muted});
  if(copy.concealed){
   const yy=end-2.65,gap=.6,w=(r.w-gap)/2;
   const controls=[{id:'hint',x:r.x,y:yy,w,h:1.7,label:copy.hintVisible?'HINT SHOWN':'A HINT',action:hint,enabled:!!entry.hint},
    {id:'reveal',x:r.x+w+gap,y:yy,w,h:1.7,label:'REVEAL',action:askReveal,enabled:true}];
   for(const c of controls){drawAchievementDeckControl(c,c.label,{selected:detailOpen&&detailAction===c.id,enabled:c.enabled,category:entry.category,pressed:pressedId===c.id});if(c.enabled)hits.add({...c,onClick:c.action});}
  }
 }
 function drawRecordings(body,d){
  const tapes=selectedRecordings(),cap=Math.max(1,body.h-8),start=Math.max(0,recordingSel-cap+1);
  uiText(body.x,body.y,'RETAINED TAPE · READ ONLY','ui-amber');uiText(body.x,body.y+1,'ENTER PLAY / STOP · R / ESC BACK','ui-label');
  if(!tapes.length)uiText(body.x,body.y+3,'NO RECORDINGS RETAINED','ui-secondary');
  tapes.slice(start,start+cap).forEach((tape,j)=>{const i=start+j,status=archivedRecordingStatus(tape),label=tape.place||tape.roomId;
   uiText(body.x,body.y+3+j,fitText(`${i===recordingSel?'▸':' '} ${i+1}. ${label}`,Math.max(8,body.w-19)),i===recordingSel?'ui-amber':'ui-primary');
   uiText(body.x+Math.max(0,body.w-17),body.y+3+j,status,'ui-secondary');
   hits.add({id:'recording:'+i,x:body.x,y:body.y+3+j,w:body.w,h:1,onClick:()=>{if(recordingSel===i)scene.key({key:'Enter'});else recordingSel=i;}});
  });
  const tape=tapes[recordingSel];if(tape)uiText(body.x,body.y+body.h-3,fitText(`${takeStamp(tape.ordinal?Math.max(0,tape.ordinal-1):recordingSel,{captured:tape.nightStamp})}   ${Math.max(0,Number(tape.durationSeconds)||0).toFixed(1)} s`,body.w),'ui-label');
  uiText(body.x,body.y+body.h-1,fitText(recordingMessage||(PB.archivedPlaybackActive()?'PLAYING':'No recording starts automatically.'),Math.max(1,body.w-8)),'ui-secondary');
 }
 function drawAchievementDetail(entry,body,l){
  const copy=archiveAchievementCopy(entry,{reveal:revealed.has(entry.id),hint:hinted.has(entry.id)}),dx=l.detailX,dw=l.detailW,yy=l.contentY,end=l.actionY-2;
  if(revealArmed){
   drawVfdText(dx,yy,'REVEAL REQUIREMENT?',{scale:l.contentH<10?1:2,color:UI_COLOR.amber,max:dw});
   const messageY=yy+(l.contentH<10?1:3),by=end-1;
   fitLines('This shows the name and exact unlock condition. It may reveal story events.',dw,Math.max(1,by-messageY)).forEach((s,i)=>uiText(dx,messageY+i,s,'ui-primary'));
   const yes=`${inputPrompt('confirm')} REVEAL`,no=`${inputPrompt('back')} KEEP SEALED`;
   uiText(dx,by,yes,'ui-amber');uiText(dx,by+1,no,'ui-secondary');
   hits.add({id:'confirm-reveal',x:dx,y:by,w:yes.length,h:1,onClick:()=>scene.key({key:'Enter'})});hits.add({id:'cancel-reveal',x:dx,y:by+1,w:no.length,h:1,onClick:()=>{revealArmed=false;}});return;
  }
  const showIcon=l.contentH>=12&&dw>=30,titleRows=l.contentH<12?1:3;
  if(showIcon)drawAchievementIcon(copy.icon,dx+dw-7,yy,{w:7,h:3.5,unlocked:entry.unlocked,concealed:copy.concealed});
  const tiny=l.contentH<6;
  fitLines(String(copy.name||'ACHIEVEMENT').toUpperCase(),Math.max(12,dw-(showIcon?9:tiny?8:0)),titleRows).forEach((s,i)=>uiText(dx,yy+i,s,entry.unlocked?'ui-amber':'ui-primary'));
  let y=yy+(l.contentH<12?1:4);const metadata=[];
  if(!(tiny&&copy.concealed))metadata.push({text:entry.unlocked?`UNLOCKED${entry.unlockedAt?' · '+dateLabel(entry.unlockedAt):''}`:readableScope(copy.scope),role:entry.unlocked?'ui-green':'ui-label'});
  if(copy.progress){
   const line=archiveProgressLine(copy.progress);if(line)metadata.push({text:line,role:'ui-primary'});
  }
  if(!tiny)for(const row of metadata)uiText(dx,y++,fitText(row.text,dw),row.role);
  const actionRows=copy.concealed?2:0,descriptionLines=Math.max(1,end-y-actionRows+1),lines=[...(tiny?metadata.flatMap(row=>fitLines(row.text,dw)):[]),...fitLines(copy.description,dw)];
  maxDetailScroll=Math.max(0,lines.length-descriptionLines);detailScroll=Math.min(detailScroll,maxDetailScroll);
  lines.slice(detailScroll,detailScroll+descriptionLines).forEach((s,i)=>uiText(dx,y+i,s,copy.hintVisible?'ui-blue':'ui-primary',copy.concealed&&!copy.hintVisible?.75:1));
  if(maxDetailScroll>0)uiText(dx+Math.max(0,dw-7),yy+(tiny?0:titleRows),`${detailScroll+1}/${maxDetailScroll+1} ↓`,'ui-label',.7);
  if(copy.concealed){
   const gamepad=activeInputPromptDevice()==='controller',hy=end-1,htext=entry.hint?`${detailAction==='hint'?'▸ ':''}${gamepad?(detailAction==='hint'?inputPrompt('confirm')+' ':''):'[H] '}${copy.hintVisible?'HINT SHOWN':'A HINT'}`:'HINT UNAVAILABLE',rtext=`${detailAction==='reveal'?'▸ ':''}${gamepad?(detailAction==='reveal'?inputPrompt('confirm')+' ':''):'[R] '}REVEAL REQUIREMENT`;
   uiText(dx,hy,fitText(htext,dw),entry.hint?(detailOpen&&detailAction==='hint'?'ui-amber':'ui-blue'):'ui-secondary');uiText(dx,hy+1,fitText(rtext,dw),detailOpen&&detailAction==='reveal'?'ui-amber':'ui-label');
   if(entry.hint)hits.add({id:'hint',x:dx,y:hy,w:Math.min(dw,htext.length),h:1,onClick:hint});hits.add({id:'reveal',x:dx,y:hy+1,w:Math.min(dw,rtext.length),h:1,onClick:askReveal});
  }
 }
 function drawCollection(entry,body,l){
  const dx=l.detailX,dw=l.detailW,yy=l.contentY;
  const dense=l.contentH<10,start=yy+(dense?3:5),end=l.actionY-2;
  fitLines(String(entry.label).toUpperCase(),dw,dense?1:2).forEach((s,i)=>uiText(dx,yy+i,s,'ui-amber'));
  uiText(dx,yy+(dense?1:3),fitText(`${entry.current} / ${entry.target} DISCOVERED · ALL RUNS`,dw),entry.current===entry.target?'ui-green':'ui-label');
  const cap=Math.max(1,end-start+1),items=entry.entries||[],complete=items.filter(e=>e.done),pending=items.filter(e=>!e.done),ordered=[...complete,...pending];
  maxDetailScroll=Math.max(0,ordered.length-cap);detailScroll=Math.min(detailScroll,maxDetailScroll);
  ordered.slice(detailScroll,detailScroll+cap).forEach((e,i)=>{const label=e.done?e.name:`UNDISCOVERED ${String(items.indexOf(e)+1).padStart(2,'0')}`;uiText(dx,start+i,fitText(`${e.done?'✓':'·'} ${label}`,dw),e.done?'ui-primary':'ui-secondary');});
  if(maxDetailScroll>0)uiText(dx,start-1,fitText(`${detailScroll+1}–${Math.min(ordered.length,detailScroll+cap)} / ${ordered.length} · ENTER / ↑ ↓`,dw),'ui-secondary',.6);
 }
 function drawHistory(entry,body,l){
  const dx=l.detailX,dw=l.detailW,yy=l.contentY,summary=entry.summary,failed=summary?.classification==='failed-night';
  const dense=l.contentH<10;
  fitLines(returnDefinition(summary?.endingId)?.title||String(summary?.endingId||'RETURN').toUpperCase(),dw,dense?1:2).forEach((s,i)=>uiText(dx,yy+i,s,'ui-amber'));
  uiText(dx,yy+(dense?1:3),failed?'FAILED NIGHT':'COMPLETED',failed?'ui-danger':'ui-green');
  const doc=entry.document;
  if(!doc){fitLines(failed?'R opens the retained recordings from this night.':endingHintForEnding(summary?.endingId)||'A filed return from a completed night.',dw,Math.max(1,l.contentH-(dense?2:5))).forEach((s,i)=>uiText(dx,yy+(dense?2:5)+i,s,'ui-primary'));renderedPages=1;return;}
  const start=yy+(dense?3:8),room=Math.max(1,l.actionY-2-start+1),paragraphs=doc.body||[],lines=paragraphs.flatMap(p=>[...fitLines(p,dw), '']),pages=[];
  for(let at=0;at<lines.length;at+=room)pages.push(lines.slice(at,at+room));
  renderedPages=Math.max(1,pages.length);docPage=Math.min(docPage,renderedPages-1);
  uiText(dx,yy+(dense?2:5),fitText(doc.title,Math.max(1,dw-(dense?10:0))),'ui-amber');
  if(!dense)uiText(dx,yy+6,fitText(`${doc.classification} · ${doc.filedBy}`,Math.max(1,dw-10)),'ui-label');
  if(renderedPages>1)uiText(dx+Math.max(0,dw-9),yy+(dense?2:6),`${docPage+1}/${renderedPages} ◂ ▸`,'ui-blue');
  (pages[docPage]||[]).forEach((s,i)=>uiText(dx,start+i,s,'ui-primary',.86));
 }
 return scene;
}
