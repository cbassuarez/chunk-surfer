// A field notebook in the existing case. Pure geometry and read-only facts;
// selection, tracking, map commands and persistence belong to the bag scene.
import { uiDraw, uiFill, uiInk, uiLine, uiWithClip } from './ui.js';
import { drawLampButton, drawPaperPanel } from './presentation.js';
import { fitLines, fitText } from './fit-text.js';
import { activeInputPromptDevice, inputPromptLabel } from '../game/bindings.js';

const INK = '#30291e', MUTED = '#6d6251', ACCENT = '#7a3c25';
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clip = (value, width) => fitText(String(value ?? ''), Math.max(0, Math.floor(width)));

export function journalGeometry(region = {}) {
  const r = { x: finite(region.x), y: finite(region.y), w: Math.max(0, finite(region.w)), h: Math.max(0, finite(region.h)) };
  const wide = r.w >= 68 && r.h >= 10, tiny = r.h < 8;
  const inset = r.w < 35 ? .65 : 1.15;
  const insetY=tiny?.2:.6;
  const inner = { x: r.x + inset, y: r.y + insetY, w: Math.max(0, r.w - inset * 2), h: Math.max(0, r.h - insetY*2) };
  if (!wide) {
    const indexH = tiny ? 1 : 1.35, gap = tiny ? .25 : .55;
    return { region:r, mode:tiny?'tiny':'compact', inner,
      list:{x:inner.x,y:inner.y,w:inner.w,h:indexH},
      detail:{x:inner.x,y:inner.y+indexH+gap,w:inner.w,h:Math.max(0,inner.h-indexH-gap)},
      rowH:indexH, capacity:r.h>0&&r.w>0?1:0 };
  }
  const listW = Math.min(31, Math.max(23, Math.floor(inner.w * .33))), gap = 3;
  const list = { x:inner.x,y:inner.y+1.6,w:listW,h:Math.max(0,inner.h-1.6) };
  return { region:r,mode:'wide',inner,list,
    detail:{x:inner.x+listW+gap,y:inner.y,w:Math.max(0,inner.w-listW-gap),h:inner.h},
    rowH:2.25,capacity:Math.max(1,Math.floor((list.h-1)/2.25)) };
}

export function journalListCapacity(region) { return journalGeometry(region).capacity; }

function contentLines(entry, width, includeTitle = false) {
  const rows = [], wrap = (text, color = INK, weight = '') => {
    for (const line of fitLines(String(text || ''), width)) rows.push({text:line,color,weight});
  };
  if (entry.state !== 'active' && entry.outcome) wrap(`OUTCOME: ${entry.outcome}`, ACCENT);
  else if (entry.next) wrap(`NEXT: ${entry.next}`, ACCENT, 'bold');
  else wrap(entry.state === 'active' ? 'No next action is known.' : entry.status?.label || 'Resolved.', MUTED);
  if (includeTitle) { rows.push({text:''}); wrap(entry.title, INK, 'bold'); }
  if (entry.summary) { rows.push({text:''}); wrap(entry.summary); }
  const evidence = (entry.evidence || []).filter(Boolean);
  if (evidence.length) {
    rows.push({text:''}); wrap('WHAT I KNOW', MUTED, 'bold');
    evidence.forEach((text,index) => { if(index)rows.push({text:''});wrap(text); });
  }
  return rows;
}

// Exported so compact page reachability can be checked without a canvas.
export function journalDetailLayout(entry, rect, { compact = false, tiny = false, detailPage = 0 } = {}) {
  const actionH = tiny ? .85 : compact ? 1.25 : 1.7;
  const titleRows = tiny ? 0 : compact ? 1 : 2;
  const title = fitLines(entry?.title || '', Math.max(1, Math.floor(rect.w)), titleRows || 1);
  const headerH = tiny ? 0 : compact ? 1.8 : 3.3;
  const actions = {x:rect.x,y:Math.max(rect.y,rect.y+rect.h-actionH),w:rect.w,h:Math.min(actionH,rect.h)};
  const lineH = .95, bodyY = rect.y + headerH;
  const body = {x:rect.x,y:bodyY,w:rect.w,h:Math.max(0,actions.y-bodyY-.45)};
  // A narrow sheet gives the action first claim and uses one readable line
  // per page. Mandatory prose is paged, never ellipsised into a false task.
  const capacity = Math.max(1, Math.floor(body.h/lineH));
  const text = {x:body.x+2,y:body.y,w:Math.max(1,body.w-4),h:Math.max(lineH,body.h)};
  const fullTitle = fitLines(entry?.title || '',Math.max(1,Math.floor(rect.w)));
  const includeTitle=tiny?String(entry?.title||'').length>Math.max(1,rect.w-18):fullTitle.length>titleRows;
  const rows = entry ? contentLines(entry,Math.max(1,Math.floor(text.w)),includeTitle) : [];
  const pages = Math.max(1,Math.ceil(rows.length/capacity));
  const page = Math.max(0,Math.min(pages-1,Math.floor(finite(detailPage))));
  return {title,titleRows,headerH,actions,body,text,lineH,capacity,rows,pages,page,
    visible:rows.slice(page*capacity,(page+1)*capacity)};
}

function paperBinding(geometry) {
  if(geometry.mode!=='wide')return;
  const x=geometry.detail.x-1.5,r=geometry.region;
  uiDraw(({ctx,cellW,cellH,dpr})=>{
    const px=x*cellW*dpr,y=(r.y+.2)*cellH*dpr,h=(r.h-.4)*cellH*dpr;
    const shade=ctx.createLinearGradient(px-6*dpr,0,px+6*dpr,0);
    shade.addColorStop(0,'#7d6b4210');shade.addColorStop(.5,'#4b3e304f');shade.addColorStop(1,'#fff6d000');
    ctx.fillStyle=shade;ctx.fillRect(px-6*dpr,y,12*dpr,h);
    ctx.strokeStyle='#6a6259';ctx.lineWidth=1.1*dpr;
    for(let at=y+cellH*dpr*.6;at<y+h-cellH*dpr*.3;at+=cellH*dpr*2.4){
      ctx.beginPath();ctx.ellipse(px,at,5*dpr,3*dpr,0,0,Math.PI*2);ctx.stroke();
    }
  });
}

function indexHit(entry, rect, suffix = '') {
  return {id:`bag:journal:entry:${entry.id}${suffix}`,kind:'journal-entry',...rect,entryId:entry.id,enabled:true,label:entry.title};
}

function drawIndex(entries, selected, pinnedId, geometry, scroll, hits, pageInfo = null) {
  const r=geometry.list,at=Math.max(0,entries.findIndex(e=>e.id===selected?.id));
  if(geometry.mode!=='wide') {
    const arrowW=Math.min(2.5,r.w*.12),count=`${entries.length?at+1:0}/${entries.length}${pageInfo?.pages>1?` · P${pageInfo.page+1}/${pageInfo.pages}`:''}`;
    const labelW=Math.max(1,r.w-arrowW*2-count.length-2);
    uiFill(r.x,r.y,r.w,r.h,'#ad946527');
    uiInk(r.x+arrowW+.2,r.y+.1,clip(selected?.title||'NO OPEN TASKS',labelW),{color:INK,weight:'bold'});
    uiInk(r.x+r.w-arrowW-count.length-.4,r.y+.1,count,{color:MUTED});
    if(entries.length>1){
      const prev=entries[(at-1+entries.length)%entries.length],next=entries[(at+1)%entries.length];
      uiInk(r.x+.5,r.y+.1,'‹',{color:ACCENT,weight:'bold'});
      uiInk(r.x+r.w-arrowW+.5,r.y+.1,'›',{color:ACCENT,weight:'bold'});
      hits.push(indexHit(prev,{x:r.x,y:r.y,w:arrowW,h:r.h},':prev'),indexHit(next,{x:r.x+r.w-arrowW,y:r.y,w:arrowW,h:r.h},':next'));
    }
    if(selected)hits.push(indexHit(selected,{x:r.x+arrowW,y:r.y,w:r.w-arrowW*2,h:r.h}));
    return;
  }
  uiInk(r.x,r.y-1.55,'FIELD NOTES',{color:INK,weight:'bold'});
  uiInk(r.x+r.w-String(entries.length).length,r.y-1.55,String(entries.length),{color:MUTED});
  let offset=Math.max(0,Math.min(Math.floor(finite(scroll)),Math.max(0,entries.length-geometry.capacity)));
  if(at<offset)offset=at;if(at>=offset+geometry.capacity)offset=at-geometry.capacity+1;
  entries.slice(offset,offset+geometry.capacity).forEach((entry,index)=>{
    const y=r.y+index*geometry.rowH,on=entry.id===selected?.id,quiet=entry.state!=='active';
    if(on){uiFill(r.x-.25,y-.12,r.w+.5,geometry.rowH-.14,'#b3914b25');uiFill(r.x-.25,y-.12,.17,geometry.rowH-.14,ACCENT);}
    const mark=entry.id===pinnedId||entry.pinned?'◆':entry.state==='resolved'?'✓':entry.state==='declined'?'—':String(offset+index+1).padStart(2,'0');
    uiInk(r.x+.3,y+.05,mark,{color:on?ACCENT:MUTED});
    uiInk(r.x+3.1,y+.05,clip(entry.title,r.w-3.2),{color:on?ACCENT:quiet?MUTED:INK,weight:on?'bold':''});
    uiInk(r.x+3.1,y+1.0,clip(entry.status?.label||entry.area||'',r.w-3.2),{color:MUTED,alpha:quiet?.75:1});
    uiLine(r.x+3.1,y+geometry.rowH-.3,r.x+r.w,y+geometry.rowH-.3,'#75684f',.16);
    hits.push(indexHit(entry,{x:r.x,y:y-.12,w:r.w,h:geometry.rowH-.14}));
  });
  if(entries.length>geometry.capacity)uiInk(r.x,r.y+r.h-.65,`${offset+1}–${Math.min(entries.length,offset+geometry.capacity)} / ${entries.length}`,{color:MUTED});
}

export function drawJournalView({ entries = [], selectedId = null, pinnedId = null, region,
  scroll = 0, now = 0, detailPage = 0 } = {}) {
  void now;
  const geometry=journalGeometry(region),hits=[];
  if(geometry.region.w<=0||geometry.region.h<=0)return {hits,capacity:geometry.capacity,actions:[],detailPage:0,detailPages:1};
  const selected=entries.find(e=>e.id===selectedId)||entries[0]||null;
  // One paper raster per frame: two alternating sheet sizes would regenerate
  // the shared paper texture and make its fibres flicker.
  drawPaperPanel(geometry.region.x,geometry.region.y,geometry.region.w,geometry.region.h);
  paperBinding(geometry);
  const r=geometry.detail;
  const layout=selected?journalDetailLayout(selected,r,{compact:geometry.mode!=='wide',tiny:geometry.mode==='tiny',detailPage}):null;
  drawIndex(entries,selected,pinnedId,geometry,scroll,hits,layout);
  if(!selected){
    uiInk(r.x,r.y,'NOTHING TO FOLLOW YET.',{color:INK,weight:'bold'});
    return {hits,capacity:geometry.capacity,actions:[[inputPromptLabel('bag'),'CLOSE']],detailPage:0,detailPages:1};
  }
  const pinned=selected.id===pinnedId||selected.pinned,canTrack=selected.state==='active'||pinned;
  const canMap=selected.mapEnabled===true&&!!selected.location;
  uiWithClip(r,()=>{
    if(layout.titleRows){
      layout.title.forEach((line,index)=>uiInk(r.x,r.y+index*1.05,line,{color:INK,weight:'bold'}));
      const category=selected.category==='assignment'?'WORK ORDER':'PERSONAL LEAD';
      const metadata=[category,selected.area,selected.status?.label||selected.state,pinned?'TRACKED':null].filter(Boolean).join(' · ');
      uiInk(r.x,r.y+layout.headerH-1.05,clip(metadata,r.w),{color:pinned?ACCENT:MUTED});
      uiLine(r.x,r.y+layout.headerH-.35,r.x+r.w,r.y+layout.headerH-.35,'#79644b',.4);
    }
    layout.visible.forEach((row,index)=>uiInk(layout.text.x,layout.text.y+index*layout.lineH,row.text,{color:row.color||INK,weight:row.weight||''}));
    if(layout.pages>1){
      const cy=layout.body.y+Math.max(0,(layout.body.h-1)*.5);
      const prev={x:r.x,y:cy,w:1.6,h:1},next={x:r.x+r.w-1.6,y:cy,w:1.6,h:1};
      uiInk(prev.x+.3,prev.y,'‹',{color:layout.page?ACCENT:MUTED});
      uiInk(next.x+.3,next.y,'›',{color:layout.page<layout.pages-1?ACCENT:MUTED});
      hits.push({id:'bag:journal:prev-page',kind:'journal-action',...prev,entryId:selected.id,actionId:'journal-prev-page',enabled:layout.page>0,label:'Previous note page'},
        {id:'bag:journal:next-page',kind:'journal-action',...next,entryId:selected.id,actionId:'journal-next-page',enabled:layout.page<layout.pages-1,label:'Next note page'});
      // Page count stays outside the prose and uses no extra content row.
      if(geometry.mode==='wide')uiInk(r.x+r.w-8,r.y+1.35,clip(`${layout.page+1}/${layout.pages}`,8),{color:MUTED});
    }
  });
  const gap=.65,w=Math.max(0,(layout.actions.w-gap)/2),y=layout.actions.y;
  const controls=[{id:'bag:journal:track',actionId:'journal-track',label:pinned?'UNTRACK':'TRACK',x:r.x,w,enabled:canTrack,color:pinned?'amber':'white'},
    {id:'bag:journal:map',actionId:'journal-map',label:geometry.mode==='tiny'?'MAP':'SHOW ON MAP',x:r.x+w+gap,w,enabled:canMap,color:'blue'}];
  for(const control of controls){
    const rect={x:control.x,y,w:control.w,h:layout.actions.h};
    drawLampButton(rect.x,rect.y,rect.w,rect.h,{legend:control.label,controlId:control.id,color:control.color,enabled:control.enabled,lit:control.actionId==='journal-track'&&pinned});
    hits.push({id:control.id,kind:'journal-action',...rect,entryId:selected.id,actionId:control.actionId,enabled:control.enabled,label:control.label});
  }
  const actions=[];
  const controller=activeInputPromptDevice()==='controller';
  if(canTrack)actions.push([controller?inputPromptLabel('confirm'):'ENTER',pinned?'UNTRACK':'TRACK']);
  if(canMap)actions.push([controller?inputPromptLabel('mark'):'SPACE','MAP']);
  if(layout.pages>1)actions.push(['PGUP/PGDN','PAGE']);
  actions.push([inputPromptLabel('bag'),'CLOSE']);
  return {hits,capacity:geometry.capacity,actions,detailPage:layout.page,detailPages:layout.pages,geometry};
}
