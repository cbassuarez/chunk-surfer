// Pure presentation rules. Completion and eligibility are supplied by the
// progression owner; opening or revealing this index never awards anything.
export const ARCHIVE_TABS=Object.freeze(['achievements','discoveries','history']);
export const ARCHIVE_CATEGORIES=Object.freeze(['all','work','disclosures','returns','method']);
export const ARCHIVE_CATEGORY_LABEL=Object.freeze({all:'ALL',work:'STORY',disclosures:'SECRETS',returns:'ENDINGS',method:'MASTERY'});
export const ARCHIVE_FILTERS=Object.freeze(['all','locked','unlocked']);
export function archiveFilteredEntries(entries,{category='all',filter='all'}={}){
 return entries.filter(e=>(category==='all'||e.category===category)&&(filter==='all'||(filter==='unlocked')===!!e.unlocked));
}
export function archivePercent({completed=0,total=0,complete=false}={}){
 if(complete&&total>0&&completed>=total)return'100%';
 const percent=total>0?Math.min(99.9,Math.floor(Math.max(0,completed)/total*1000)/10):0;
 return`${Number.isInteger(percent)?percent:percent.toFixed(1)}%`;
}
export function archiveAchievementCopy(entry,{reveal=false,hint=false}={}){
 if(!entry)return null;
 const concealed=!!entry.hidden&&!entry.unlocked&&!reveal;
 return{concealed,name:concealed?'UNDISCOVERED ACHIEVEMENT':entry.name,
  description:concealed?(hint&&entry.hint?entry.hint:'Its name and requirement remain sealed. A hint or full reveal is your choice.'):entry.description,
  hintVisible:concealed&&hint&&!!entry.hint,icon:concealed?'unknown':entry.icon||entry.id,
  progress:concealed?null:entry.progress||null,scope:concealed?'HIDDEN':entry.scope||entry.progress?.scope||'ACROSS RUNS'};
}
export function archiveContentLayout(body,{tab='achievements',detail=false}={}){
 const compact=body.w<72||body.h<21,top=compact?(detail?3:4):tab==='achievements'?7:5,contentY=body.y+top,contentH=Math.max(1,body.h-top-3),
  listW=compact?body.w:Math.max(30,Math.floor(body.w*.43)),
  rowHeight=contentH>=12?2:1;
 return{compact,detail:compact&&detail,contentY,contentH,listW,rowHeight,
  capacity:Math.max(1,Math.floor(contentH/rowHeight)),divider:body.x+listW+1,
  detailX:compact?body.x:body.x+listW+4,detailW:compact?body.w:Math.max(1,body.w-listW-4),
  actionY:body.y+body.h-2};
}
export function archiveProgressLine(progress){
 if(!progress)return'';
 const current=Math.max(0,Number(progress.current)||0),target=Math.max(0,Number(progress.target)||0);
 return target>0?`${Math.min(current,target)} / ${target}${progress.label?' · '+progress.label:''}`:'';
}
