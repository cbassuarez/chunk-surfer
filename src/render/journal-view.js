// FL–3 FIELD LOG. Fixed printed controls, live VFD facts below glass and
// separate annunciator lenses. Selection and persistence belong to the bag.
import { uiDraw, uiText, uiWithClip } from './ui.js';
import { drawLampButton, drawVfdText } from './presentation.js';
import { drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass } from './instrument-material.js';
import { drawHardwarePrint } from './hardware-faceplate.js';
import { drawPrintedText } from './keycap.js';
import { hardwareMotionReduced } from './hardware-material.js';
import { fitLines, fitText } from './fit-text.js';
import { activeInputPromptDevice, inputPromptLabel } from '../game/bindings.js';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clip=(v,w)=>fitText(String(v??''),Math.max(0,Math.floor(w)));
const px=(r,m)=>({x:r.x*m.cellW*m.dpr,y:r.y*m.cellH*m.dpr,w:r.w*m.cellW*m.dpr,h:r.h*m.cellH*m.dpr,dpr:m.dpr});
const etch=(r,label)=>drawPrintedText(r.x,r.y,label,{w:r.w,h:r.h,ink:'#30372e',finish:'etched',darkPanel:false});
const well=r=>uiDraw(m=>drawInstrumentWell(m.ctx,{...px(r,m),depth:1}));
const glass=r=>uiDraw(m=>drawInstrumentGlass(m.ctx,{...px(r,m),depth:1,reflection:.35,grid:false,reducedMotion:hardwareMotionReduced()}));

export function journalGeometry(region={}) {
  const r={x:finite(region.x),y:finite(region.y),w:Math.max(0,finite(region.w)),h:Math.max(0,finite(region.h))};
  const candidate=(mode)=>{
  const wide=mode==='wide',tiny=mode==='tiny',ix=tiny?.35:.9,iy=tiny?.08:.6;
  const inner={x:r.x+ix,y:r.y+iy,w:Math.max(0,r.w-ix*2),h:Math.max(0,r.h-iy*2)};
  const headerH=tiny?0:1.2;
  if(!wide){
    const rowH=tiny?.85:1.25,gap=tiny?.1:.4,list={x:inner.x,y:inner.y+headerH,w:inner.w,h:rowH};
    return {region:r,mode,inner,headerH,list,rowH,capacity:r.h>0&&r.w>0?1:0,
      detail:{x:inner.x,y:list.y+rowH+gap,w:inner.w,h:Math.max(0,inner.h-headerH-rowH-gap)}};
  }
  const listW=Math.min(35,Math.max(26,Math.floor(inner.w*.35))),gap=2;
  const list={x:inner.x,y:inner.y+headerH,w:listW,h:Math.max(0,inner.h-headerH)};
  return {region:r,mode:'wide',inner,headerH,list,rowH:2.35,capacity:Math.max(1,Math.min(8,Math.floor((list.h-.9)/2.35))),
    detail:{x:inner.x+listW+gap,y:list.y,w:Math.max(0,inner.w-listW-gap),h:list.h}};
  };
  // Width alone cannot choose a two-column instrument: the actual case body
  // loses room to tabs/rails at large text sizes. Budget readable display
  // lines AFTER annunciators, title and physical transport keys.
  for(const mode of r.w>=68?['wide','compact']:['compact']){
    const g=candidate(mode),d=journalDetailLayout(null,g.detail,{compact:mode!=='wide'});
    if(d.body.h>=d.lineH*(mode==='wide'?6:4))return g;
  }
  return candidate('tiny');
}
export function journalListCapacity(region){return journalGeometry(region).capacity;}

const commitmentLabels={none:'NOT AGREED',assigned:'ASSIGNED',accepted:'ACCEPTED',fulfilled:'FULFILLED',declined:'DECLINED',withdrawn:'WITHDRAWN',consented:'CONSENT GIVEN'};
const stateLine=(commitment,stage)=>[commitment,stage].filter((value,index,all)=>value&&all.findIndex(other=>String(other).toUpperCase()===String(value).toUpperCase())===index).join(' · ');
export function journalPresentation(entry={}){
  const nature=entry.nature|| (entry.category==='assignment'?'undertaking':entry.category==='record'?'record':'lead');
  const classification=nature==='record'?'RECORD':nature==='undertaking'?'WORK':'LEAD';
  const commitment=entry.commitment?commitmentLabels[entry.commitment]||String(entry.commitment).toUpperCase():entry.status?.label||entry.state||'';
  const stage=entry.stage?.label||'';
  const followCommitment=entry.followUp && (commitmentLabels[entry.followUp.commitment]||entry.followUp.commitment||'');
  return {nature,classification,commitment,stage,
    header:[nature==='record'?'RECORD':commitment,entry.followUp?`FOLLOW-UP ${followCommitment}`:stage].filter(Boolean).join(' · '),
    updated:entry.updated===true,trackable:typeof entry.trackable==='boolean'?entry.trackable:entry.state==='active'};
}

function contentLines(entry,width,includeTitle=false,{includeHeader=false,compact=false}={}){
  const rows=[],seen=new Set(),presentation=journalPresentation(entry);
  let critical=true;
  const paragraph=(text,role='ui-primary')=>{
    const value=String(text||'').trim();if(!value||seen.has(value))return;seen.add(value);
    if(rows.length&&!(compact&&critical))rows.push({text:''});fitLines(value,width).forEach(line=>rows.push({text:line,role}));
  };
  const milestones=(value,showCurrent=true)=>{
    let started=false;
    for(const step of value||[])if(step?.label&&(step.state==='done'||showCurrent&&step.state==='current')){
      const text=`${step.state==='done'?'DONE':'NOW'}: ${step.label}`;
      if(seen.has(text))continue;seen.add(text);
      if(!started&&rows.length)rows.push({text:''});started=true;
      fitLines(text,width).forEach(line=>rows.push({text:line,role:step.state==='done'?'ui-secondary':'ui-amber'}));
    }
  };
  if(includeHeader&&presentation.header)paragraph(`${presentation.updated?'UPDATED · ':''}${presentation.header}`,'ui-secondary');
  const closure=entry.closure;
  if(closure?.text)paragraph(`${closure.label||'OUTCOME'}: ${closure.text}`,'ui-primary');
  else if(entry.state!=='active'&&entry.outcome)paragraph(`${presentation.nature==='record'?'RECORD':'OUTCOME'}: ${entry.outcome}`,'ui-secondary');
  const follow=entry.followUp;
  if(follow){
    paragraph(`FOLLOW-UP: ${follow.label||'Further request'}`,'ui-blue');
    paragraph(stateLine(commitmentLabels[follow.commitment]||follow.commitment,follow.stage?.label),'ui-secondary');
    if(follow.next&&follow.nextLabel)paragraph(`${follow.nextLabel}: ${follow.next}`,'ui-amber');
    if(follow.outcome)paragraph(`OUTCOME: ${follow.outcome}`,'ui-primary');
    critical=false;milestones(follow.milestones,!(follow.next&&follow.nextLabel==='NEXT'));
  }else if((entry.nextLabel==='CHOICE'||entry.nextLabel==='OPTIONAL')
    ||presentation.nature!=='record'&&!closure&&!['resolved','declined'].includes(entry.state)){
    const label=entry.nextLabel===undefined?'NEXT':entry.nextLabel;
    if(entry.next&&label)paragraph(`${label}: ${entry.next}`,'ui-amber');
    else if(!closure&&!entry.outcome&&!entry.stage?.label)paragraph(entry.state==='active'?'No next action is known.':entry.status?.label||'Resolved.','ui-secondary');
  }
  critical=false;
  if(includeTitle)paragraph(entry.title);
  // The next-action readout already carries the current step. Keep the
  // completed trail below it without printing a second instruction.
  milestones(entry.milestones,!(entry.next&&entry.nextLabel==='NEXT'));
  // A record already carries its facts; repeat neither its outcome as summary
  // nor matching legacy evidence beneath a structured factual record.
  if(entry.summary&&!closure&&entry.summary!==entry.outcome)paragraph(entry.summary);
  const records=(entry.records||[]).filter(record=>record?.text||record?.label);
  if(records.length){
    paragraph('RECORD','ui-blue');
    for(const record of records)paragraph([record.label,record.text].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(': '));
  }else{
    const evidence=(entry.evidence||[]).filter(Boolean);
    if(evidence.length){paragraph('EVIDENCE','ui-blue');for(const text of evidence)paragraph(text);}
  }
  return rows;
}

// Pure paging geometry shared with focused source contract tests.
export function journalDetailLayout(entry,rect,{compact=false,tiny=false,detailPage=0}={}){
  const bankH=tiny?.57:compact?1:1.3,gap=tiny?.08:.45,actionH=tiny?.73:compact?1.25:1.8;
  const actions={x:rect.x,y:Math.max(rect.y,rect.y+rect.h-actionH),w:rect.w,h:Math.min(actionH,rect.h)};
  const indicators={x:rect.x,y:rect.y,w:rect.w,h:bankH};
  const display={x:rect.x,y:rect.y+bankH+gap,w:rect.w,h:Math.max(0,actions.y-rect.y-bankH-gap-gap)};
  const titleRows=tiny?0:compact?1:2,headerH=tiny?0:compact?1.4:3.1,margin=tiny?.18:.65,lineH=tiny?.82:1.05;
  const title=fitLines(entry?.title||'',Math.max(1,Math.floor((display.w-margin*2)/(compact?1:1.22))),titleRows||1);
  const body={x:display.x+margin,y:display.y+headerH+(tiny?.08:.3),w:Math.max(1,display.w-margin*2),h:Math.max(0,display.h-headerH-(tiny?.10:.5))};
  const capacity=Math.max(1,Math.floor(body.h/lineH)),text={...body};
  const fullTitle=fitLines(entry?.title||'',Math.max(1,Math.floor(display.w/(compact?1:1.22))));
  const includeTitle=tiny?String(entry?.title||'').length>Math.max(1,rect.w-13):fullTitle.length>titleRows;
  const metadata=entry?`${entry.updated?'UPDATED · ':''}${journalPresentation(entry).header}`:'';
  const includeHeader=!!(entry?.commitment||entry?.stage||entry?.updated)&&(tiny||compact||metadata.length>Math.floor(display.w-1.3));
  const rows=entry?contentLines(entry,Math.max(1,Math.floor(text.w)),includeTitle,{includeHeader,compact:compact||tiny}):[];
  const pages=Math.max(1,Math.ceil(rows.length/capacity)),page=Math.max(0,Math.min(pages-1,Math.floor(finite(detailPage))));
  return {indicators,display,actions,title,titleRows,headerH,body,text,lineH,capacity,rows,pages,page,visible:rows.slice(page*capacity,(page+1)*capacity)};
}

// Like the SI–1's PLAN/TARGET lenses: fixed ink remains visible unlit.
function annunciator(rect,label,lit,color='amber'){
  uiDraw(m=>{
    const {ctx,dpr}=m,r=px(rect,m),p=Math.min(3*dpr,r.h*.13);
    const colors=color==='green'?['#9cbf88','#d6edbc','#6d9363']:color==='red'?['#ad6651','#edb499','#88533e']:['#bcaa75','#eee0ac','#a58a50'];
    ctx.fillStyle='#434a3d';ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.fillStyle='#11160e';ctx.fillRect(r.x+dpr,r.y+dpr,r.w-2*dpr,r.h-2*dpr);
    const lens=ctx.createLinearGradient(r.x,r.y,r.x,r.y+r.h);
    lens.addColorStop(0,lit?colors[0]:'#51584b');lens.addColorStop(.65,lit?colors[1]:'#8f9582');lens.addColorStop(1,lit?colors[2]:'#5c6656');
    ctx.fillStyle=lens;ctx.fillRect(r.x+p,r.y+p,r.w-p*2,r.h-p*2);
    ctx.strokeStyle=lit?'#f8f2d075':'#d0d5be36';ctx.lineWidth=.6*dpr;ctx.strokeRect(r.x+p,r.y+p,r.w-p*2,r.h-p*2);
    drawHardwarePrint(ctx,label,r.x+p*1.5,r.y+p*1.2,{width:r.w-p*3,height:r.h-p*2.4,color:'#162014',align:'center',finish:'screenprint',dpr,seed:`fl3:${label}`});
  });
}
function drawStateBank(entry,pinned,r){
  const gap=.25,groupGap=Math.min(1.6,r.w*.04),w=(r.w-gap*2-groupGap)/4;
  const classification=entry?journalPresentation(entry).classification:null;
  ['WORK','LEAD','RECORD'].forEach((label,i)=>annunciator({x:r.x+i*(w+gap),y:r.y,w,h:r.h},label,label===classification,label==='RECORD'?'green':'amber'));
  annunciator({x:r.x+w*3+gap*2+groupGap,y:r.y,w,h:r.h},'TRACKED',!!pinned,'amber');
}
function entryHit(entry,r,suffix=''){return {id:`bag:journal:entry:${entry.id}${suffix}`,kind:'journal-entry',...r,entryId:entry.id,enabled:true,label:entry.title};}
function selectorButton(hit,legend,on=false,hoveredId=null){
  drawLampButton(hit.x,hit.y,hit.w,hit.h,{legend,controlId:hit.id,color:'white',finish:'opaque',enabled:hit.enabled,lit:on,selected:on,focused:on||hit.id===hoveredId,latched:false});
}
function drawSelectors(entries,selected,g,scroll,hits,pageInfo,hoveredId){
  const r=g.list,at=Math.max(0,entries.findIndex(e=>e.id===selected?.id));
  if(g.mode!=='wide'){
    const bw=Math.min(3.2,r.w*.14),gap=.35,window={x:r.x+bw+gap,y:r.y,w:Math.max(1,r.w-bw*2-gap*2),h:r.h};
    well(window);uiWithClip(window,()=>{
      const count=`${entries.length?at+1:0}/${entries.length}${pageInfo?.pages>1?` P${pageInfo.page+1}/${pageInfo.pages}`:''}`;
      uiText(window.x+.25,window.y+.03,clip(selected?`${selected.updated?'UPDATED · ':''}${selected.title}`:'NO ENTRIES',Math.max(1,window.w-count.length-1)),'ui-primary',.96);
      if(window.w>15)uiText(window.x+window.w-count.length-.25,window.y+.03,count,'ui-secondary',.8);
    });glass(window);
    if(entries.length){
      const prev=entries[(at-1+entries.length)%entries.length],next=entries[(at+1)%entries.length];
      const a=entryHit(prev,{x:r.x,y:r.y,w:bw,h:r.h},':prev'),b=entryHit(next,{x:r.x+r.w-bw,y:r.y,w:bw,h:r.h},':next');
      a.id='bag:journal:jog-prev';b.id='bag:journal:jog-next';
      a.enabled=b.enabled=entries.length>1;selectorButton(a,'−',false,hoveredId);selectorButton(b,'+',false,hoveredId);hits.push(a,b);
    }
    return;
  }
  let offset=Math.max(0,Math.min(Math.floor(finite(scroll)),Math.max(0,entries.length-g.capacity)));
  if(at<offset)offset=at;if(at>=offset+g.capacity)offset=at-g.capacity+1;
  const visible=entries.slice(offset,offset+g.capacity);
  Array.from({length:g.capacity},(_,index)=>{
    const entry=visible[index],y=r.y+index*g.rowH,on=!!entry&&entry.id===selected?.id,key={x:r.x,y,w:4.4,h:1.8};
    const hit=entry?entryHit(entry,key):{id:`bag:journal:unused:${index}`,kind:'journal-entry',...key,enabled:false};
    selectorButton(hit,String(index+1).padStart(2,'0'),on,hoveredId);if(entry)hits.push(hit);
    const display={x:r.x+5.2,y,w:r.w-5.2,h:1.8};well(display);uiWithClip(display,()=>{
      if(!entry)return;
      const currentPurpose=entry.state==='active'||entry.hasOpenCommitment===true||entry.trackable===true;
      uiText(display.x+.45,display.y+.12,clip(entry.title,display.w-.9),on?'ui-amber':'ui-primary',currentPurpose?.98:.68);
      uiText(display.x+.45,display.y+.94,clip([entry.updated?'UPDATED':null,entry.stage?.label||entry.area||entry.status?.label].filter(Boolean).join(' · '),display.w-.9),'ui-secondary',on?.82:.57);
    });glass(display);
  });
  if(entries.length>g.capacity)etch({x:r.x,y:r.y+r.h-.7,w:r.w,h:.65},`INDEX ${offset+1}–${Math.min(entries.length,offset+g.capacity)} / ${entries.length}`);
}
function buttonHit(id,actionId,label,r,entryId,enabled,color='white',hoveredId=null){
  drawLampButton(r.x,r.y,r.w,r.h,{legend:label,controlId:id,color,finish:color==='white'?'opaque':'lens',enabled,lit:false,focused:id===hoveredId,latched:false});
  return {id,kind:'journal-action',...r,entryId,actionId,enabled,label};
}

export function drawJournalView({entries=[],selectedId=null,pinnedId=null,region,scroll=0,now=0,detailPage=0,hoveredId=null}={}){
  void now;
  const geometry=journalGeometry(region),hits=[],r=geometry.region;
  if(r.w<=0||r.h<=0)return {hits,capacity:geometry.capacity,actions:[],detailPage:0,detailPages:1,geometry};
  uiDraw(m=>drawInstrumentPlate(m.ctx,{...px(r,m),finish:'aluminum',seed:'AUDIOCORP:FL3:FIELDLOG'}));
  if(geometry.headerH){
    etch({x:geometry.inner.x,y:geometry.inner.y-.05,w:Math.min(29,geometry.inner.w*.55),h:.75},'AUDIOCORP FL–3');
    etch({x:geometry.inner.x+geometry.inner.w*.6,y:geometry.inner.y-.05,w:geometry.inner.w*.4,h:.75},'FIELD LOG');
  }
  const selected=entries.find(e=>e.id===selectedId)||entries[0]||null;
  const layout=journalDetailLayout(selected,geometry.detail,{compact:geometry.mode!=='wide',tiny:geometry.mode==='tiny',detailPage});
  const pinned=!!selected&&(selected.id===pinnedId||selected.pinned),canTrack=!!selected&&(journalPresentation(selected).trackable||pinned),canMap=!!selected&&selected.mapEnabled===true&&!!selected.location;
  drawSelectors(entries,selected,geometry,scroll,hits,layout,hoveredId);drawStateBank(selected,pinned,layout.indicators);well(layout.display);
  uiWithClip(layout.display,()=>{
    if(!selected){uiText(layout.display.x+.5,layout.display.y+.2,'NO ENTRIES','ui-secondary',.8);return;}
    if(layout.titleRows){
      const scale=geometry.mode==='wide'?1.22:1;
      layout.title.forEach((line,index)=>drawVfdText(layout.display.x+.65,layout.display.y+.25+index*1.02,line,{scale,max:layout.display.w-1.3,role:'ui-primary',alpha:.98}));
      if(geometry.mode==='wide')uiText(layout.display.x+.65,layout.display.y+2.1,clip([selected.updated?'UPDATED':null,journalPresentation(selected).header].filter(Boolean).join(' · '),layout.display.w-1.3),'ui-secondary',.86);
    }
    layout.visible.forEach((row,index)=>uiText(layout.text.x,layout.text.y+index*layout.lineH,row.text,row.role||'ui-primary',row.role==='ui-secondary'?.8:.98));
  });glass(layout.display);
  const a=layout.actions,gap=geometry.mode==='tiny'?.2:.45,pw=Math.min(3.2,a.w*.12),mw=Math.max(0,(a.w-pw*2-gap*3)/2);
  const prev={x:a.x,y:a.y,w:pw,h:a.h},track={x:a.x+pw+gap,y:a.y,w:mw,h:a.h},map={x:a.x+pw+gap+mw+gap,y:a.y,w:mw,h:a.h},next={x:a.x+a.w-pw,y:a.y,w:pw,h:a.h};
  hits.push(buttonHit('bag:journal:prev-page','journal-prev-page','<',prev,selected?.id,!!selected&&layout.page>0,'white',hoveredId),
    buttonHit('bag:journal:track','journal-track','TRACK',track,selected?.id,canTrack,'white',hoveredId),
    buttonHit('bag:journal:map','journal-map','MAP',map,selected?.id,canMap,'blue',hoveredId),
    buttonHit('bag:journal:next-page','journal-next-page','>',next,selected?.id,!!selected&&layout.page<layout.pages-1,'white',hoveredId));
  const actions=[],controller=activeInputPromptDevice()==='controller';
  if(canTrack)actions.push([controller?inputPromptLabel('confirm'):'ENTER',pinned?'UNTRACK':'TRACK']);
  if(canMap)actions.push([controller?inputPromptLabel('mapFile'):'SPACE','MAP']);
  if(layout.pages>1)actions.push([controller?`${inputPromptLabel('mapFloorPrev')}/${inputPromptLabel('mapFloorNext')}`:'PGUP/PGDN','PAGE']);
  actions.push([inputPromptLabel('bag'),'CLOSE']);
  return {hits,capacity:geometry.capacity,actions,detailPage:layout.page,detailPages:layout.pages,geometry};
}
