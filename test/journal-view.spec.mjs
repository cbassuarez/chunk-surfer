import test from 'node:test';
import assert from 'node:assert/strict';
import { journalGeometry, journalListCapacity, journalDetailLayout, journalPresentation, drawJournalView } from '../src/render/journal-view.js';
import { uiInit } from '../src/render/ui.js';
import { bagPanelBounds, bagLayout } from '../src/render/bag-layout.js';
import { cancelControlScope, pressControl, releaseControl, sampleControl } from '../src/game/control-mechanics.js';
import { buildQuestJournal } from '../src/game/quest-journal.js';

const entry={id:'ren',title:'Ren / roof',area:'ROOF',category:'lead',state:'active',status:{label:'OPEN'},
  next:'Find the HOME cassette in the stripped office, then return to Ren without handing it over accidentally.',
  summary:'A request with a decision still to make.',evidence:['The refusal belongs to Ren. Keep the cassette separate until you understand what is being asked.'],
  outcome:null,location:{roomId:'office',label:'Stripped office'},mapEnabled:true,pinned:false};
const entries=Array.from({length:8},(_,i)=>({...entry,id:`lead-${i}`,title:`Discovered lead ${i+1}`,area:`FLOOR ${i+1}`}));
const box={x:2,y:3,w:104,h:25};
function contentRegion(cols,rows){
  const outer=bagPanelBounds({cols,rows,sectionId:'journal'}),body={x:outer.x+3,y:outer.y+2.6,w:outer.w-6,h:outer.h-3.6};
  const b=bagLayout({body,sectionId:'journal'}),x=Math.min(b.list.x,b.detail.x),y=Math.min(b.list.y,b.detail.y);
  return {x,y,w:Math.max(b.list.x+b.list.w,b.detail.x+b.detail.w)-x,h:Math.max(b.list.y+b.list.h,b.detail.y+b.detail.h)-y};
}
const inside=(a,b)=>a.x>=b.x-1e-8&&a.y>=b.y-1e-8&&a.x+a.w<=b.x+b.w+1e-8&&a.y+a.h<=b.y+b.h+1e-8;
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-8&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-8;

// CPU command recorder: real presentation primitives, no browser, GPU, pixels
// or source-text matching. Only the visible UI canvas records its commands.
function renderProbe(args,{clock=1000}={}){
  const commands=[],saved=new Map(['document','window','getComputedStyle','performance'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let surfaceCount=0;
  const owner={fonts:{check:()=>true,load:()=>Promise.resolve([])},createElement(kind){assert.equal(kind,'canvas');return canvas(surfaceCount++===0);}};
  function canvas(record){
    const c={style:{},width:0,height:0,ownerDocument:owner},stack=[];
    const state={globalAlpha:1,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,font:'12px sans-serif',fillStyle:'#000',strokeStyle:'#000'};
    const gradient=(type,args)=>({type,args,stops:[],addColorStop(at,color){this.stops.push([at,color]);}});
    const methods={save(){stack.push({...state});},restore(){const prior=stack.pop();for(const k of Object.keys(state))delete state[k];Object.assign(state,prior);},
      measureText(value){const n=Number(/([\d.]+)px/.exec(state.font)?.[1]||12);return {width:String(value).length*n*.55,actualBoundingBoxAscent:n*.72,actualBoundingBoxDescent:n*.12};},
      createLinearGradient:(...a)=>gradient('linear',a),createRadialGradient:(...a)=>gradient('radial',a),
      createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
      getImageData(){throw Error('Field log must not read canvas pixels');}};
    const ctx=new Proxy(state,{get(target,key){if(key==='canvas')return c;if(key in methods)return methods[key];if(key in target)return target[key];return(...a)=>{if(record)commands.push({method:key,args:a,state:{...state}});};},set(t,k,v){t[k]=v;return true;}});
    c.getContext=()=>ctx;return c;
  }
  try{
    Object.defineProperty(globalThis,'document',{configurable:true,value:owner});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener(){}}});
    Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({position:'relative'})});
    Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
    uiInit({clientWidth:1600,clientHeight:1000,appendChild(){}});
    return {view:drawJournalView(args),commands};
  }finally{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}

const present=args=>renderProbe(args).view;

test.beforeEach(()=>cancelControlScope('bag:journal:'));
test.after(()=>cancelControlScope('bag:journal:'));

test('the status header names a follow-up answer without implying the fulfilled parent is still underway',()=>{
  const value={...entry,nature:'undertaking',commitment:'fulfilled',state:'resolved',
    stage:{id:'opener',label:'Find the borrowed item'},followUp:{commitment:'accepted'}};
  assert.equal(journalPresentation(value).header,'FULFILLED · FOLLOW-UP ACCEPTED');
  assert.equal(journalPresentation({...value,followUp:{commitment:'declined'}}).header,'FULFILLED · FOLLOW-UP DECLINED');
});

test('revocable permission and completed investigation can show an explicit optional response without becoming work',()=>{
  for(const e of [
    {...entry,nature:'record',commitment:'consented',stage:{id:'lent',label:'Revocable permission'},nextLabel:'CHOICE',next:'Ask Emile or Lucien for your voice back.',trackable:false},
    {...entry,nature:'undertaking',state:'resolved',commitment:'fulfilled',closure:{label:'Investigation fulfilled',text:'You read the warning and left the cassette.'},nextLabel:'OPTIONAL',next:'Tell Ren, or reconsider taking it.'},
  ]){
    const g=journalGeometry(box),layout=journalDetailLayout(e,g.detail);
    assert.ok(layout.rows.map(row=>row.text).join(' ').includes(`${e.nextLabel}: ${e.next}`));
    assert.equal(journalPresentation(e).classification,e.nature==='record'?'RECORD':'WORK');
  }
});

test('field-log geometry offers eight physical selectors wide and jog selection in shallow windows',()=>{
  assert.equal(journalGeometry(box).mode,'wide');assert.equal(journalListCapacity(box),8);
  for(const [cols,rows,mode] of [[40,16,'tiny'],[75,20,'tiny'],[75,30,'compact']]){
    const region=contentRegion(cols,rows),g=journalGeometry(region);
    assert.equal(g.mode,mode);assert.equal(journalListCapacity(region),1);
    assert.ok(inside(g.list,region)&&inside(g.detail,region));
  }
});

test('actual control targets stay inside their panel and do not overlap at supported sizes',()=>{
  for(const region of [box,contentRegion(40,16),contentRegion(75,20),contentRegion(75,30)]){
    const view=present({entries,selectedId:entries[3].id,region});
    for(const h of view.hits){assert.ok(h.w>0&&h.h>0);assert.ok(inside(h,region),h.id);}
    for(let i=0;i<view.hits.length;i++)for(let j=i+1;j<view.hits.length;j++)assert.equal(overlap(view.hits[i],view.hits[j]),false,`${view.hits[i].id} overlaps ${view.hits[j].id}`);
  }
});

test('NEXT and full evidence remain reachable by paging and cannot fall behind glass or buttons',()=>{
  const long={...entry,evidence:[`${entry.evidence[0]} `.repeat(8),'FINAL EVIDENCE MUST REMAIN REACHABLE.']};
  for(const region of [box,contentRegion(40,16),contentRegion(75,20)]){
    const g=journalGeometry(region),options={compact:g.mode!=='wide',tiny:g.mode==='tiny'};
    const first=journalDetailLayout(long,g.detail,options),all=[];
    assert.ok(first.visible[0].text.startsWith('NEXT:'));
    for(let page=0;page<first.pages;page++){
      const d=journalDetailLayout(long,g.detail,{...options,detailPage:page});all.push(...d.visible.map(v=>v.text));
      assert.ok(d.text.y+d.visible.length*d.lineH<=d.display.y+d.display.h+1e-8);
      assert.ok(d.text.y+d.visible.length*d.lineH<=d.actions.y+1e-8);
      assert.ok(d.visible.every(v=>v.text.length<=Math.floor(d.text.w)));
    }
    const prose=all.join(' ').replace(/\s+/g,' ');
    assert.ok(prose.includes(long.next));assert.ok(prose.includes(entry.evidence[0]));assert.ok(prose.includes('FINAL EVIDENCE MUST REMAIN REACHABLE.'));
    assert.ok(!all.some(line=>line.includes('…')),'required prose is paged rather than ellipsised');
  }
});

test('outcomes have first claim on settled or declined display pages',()=>{
  for(const state of ['resolved','declined']){
    const e={...entry,state,outcome:'I kept the cassette and Ren accepted that decision.'};
    const g=journalGeometry(contentRegion(40,16)),d=journalDetailLayout(e,g.detail,{tiny:true,compact:true});
    assert.ok(d.visible[0].text.startsWith('OUTCOME:'));assert.ok(!d.rows.some(r=>r.text.startsWith('NEXT:')));
    const end=journalDetailLayout(e,g.detail,{tiny:true,compact:true,detailPage:999});assert.equal(end.page,end.pages-1);
  }
});

test('TRACK and MAP have stable fixed legends while enablement and footer reflect real availability',()=>{
  for(const state of ['active','resolved','declined'])for(const pinned of [false,true]){
    const e={...entry,state,pinned},view=present({entries:[e],selectedId:e.id,pinnedId:pinned?e.id:null,region:box});
    const track=view.hits.find(h=>h.actionId==='journal-track'),map=view.hits.find(h=>h.actionId==='journal-map');
    assert.equal(track.id,'bag:journal:track');assert.equal(track.label,'TRACK');assert.equal(track.enabled,state==='active'||pinned);
    assert.equal(map.id,'bag:journal:map');assert.equal(map.label,'MAP');assert.equal(map.enabled,true);
    if(pinned)assert.ok(view.actions.some(([,label])=>label==='UNTRACK'));
  }
  for(const change of [{mapEnabled:false},{location:null}])assert.equal(present({entries:[{...entry,...change}],region:box}).hits.find(h=>h.actionId==='journal-map').enabled,false);
});

test('only discovered entries receive selector hits and paging boundaries disable their fixed keys',()=>{
  const view=present({entries:entries.slice(0,3),region:box}),selectors=view.hits.filter(h=>h.kind==='journal-entry');
  assert.deepEqual(selectors.map(h=>h.id),entries.slice(0,3).map(e=>`bag:journal:entry:${e.id}`));
  assert.equal(view.hits.find(h=>h.actionId==='journal-prev-page').enabled,false);
  const small=contentRegion(40,16),initial=present({entries,region:small}),last=present({entries,region:small,detailPage:999});
  assert.equal(last.detailPage,last.detailPages-1);assert.equal(last.hits.find(h=>h.actionId==='journal-next-page').enabled,false);
  assert.ok(initial.hits.some(h=>h.id==='bag:journal:jog-prev')&&initial.hits.some(h=>h.id==='bag:journal:jog-next'));
});

test('the complete manufactured selector bank stays present when only three entries are known',()=>{
  const p=renderProbe({entries:entries.slice(0,3),selectedId:entries[0].id,region:box});
  const caps=p.commands.filter(c=>c.method==='fillText'&&c.state.fillStyle==='#12150d').map(c=>c.args[0]).join('');
  assert.equal(caps,'0102030405060708<TRACKMAP>','unused numbered caps remain manufactured ink');
  assert.equal(p.view.hits.filter(h=>h.kind==='journal-entry').length,3);
  assert.ok(!p.view.hits.some(h=>h.id.startsWith('bag:journal:unused:')),'empty slots cannot receive input');
  for(let i=3;i<8;i++){
    const state=sampleControl(`bag:journal:unused:${i}`,{now:1000});
    assert.equal(state.travel,0);assert.equal(state.lampHeat,0);
  }
});

test('real printed ink contains fixed selector/action legends, never changing quest titles',()=>{
  const p=renderProbe({entries,selectedId:entries[0].id,pinnedId:entries[0].id,region:box});
  const ink=p.commands.filter(c=>c.method==='fillText'&&c.state.fillStyle==='#12150d').map(c=>c.args[0]).join('');
  assert.equal(ink,'0102030405060708<TRACKMAP>');
  const allPrint=p.commands.filter(c=>c.method==='fillText').map(c=>c.args[0]).join('');
  assert.ok(!allPrint.includes(entries[0].title));assert.ok(!allPrint.includes('UNTRACK'));
});

test('classification and following have separate fixed annunciators, independent of quest outcomes',()=>{
  function bank(nature,pinned=false,state='active'){
    const e={...entry,nature,state,pinned},p=renderProbe({entries:nature?[e]:[],pinnedId:pinned?e.id:null,region:box});
    const labels=p.commands.filter(c=>c.method==='fillText'&&c.state.fillStyle==='#162014').map(c=>c.args[0]).join('');
    assert.equal(labels,'WORKLEADRECORDTRACKED');
    const g=journalGeometry(box),d=journalDetailLayout(e,g.detail),r=d.indicators;
    const gradients=p.commands.filter(c=>c.method==='fillRect'&&c.state.fillStyle?.type==='linear'&&c.args[0]>=r.x*8.45&&c.args[0]<(r.x+r.w)*8.45&&c.args[1]>=r.y*20&&c.args[1]<(r.y+r.h)*20);
    assert.equal(gradients.length,4);return gradients.map(c=>c.state.fillStyle.stops);
  }
  const dormant=bank(null);
  for(const [nature,index] of [['undertaking',0],['lead',1],['record',2]]){
    const lit=bank(nature);for(let i=0;i<4;i++)if(i===index)assert.notDeepEqual(lit[i],dormant[i]);else assert.deepEqual(lit[i],dormant[i]);
    assert.deepEqual(bank(nature,false,'resolved'),lit);assert.deepEqual(bank(nature,false,'declined'),lit);
  }
  const tracked=bank('lead',true);assert.notDeepEqual(tracked[3],dormant[3]);
  assert.ok(tracked.length===4);
});

test('hover adds no mechanical travel or lamp heat, while real press moves the printed cap and release restores it',()=>{
  const id='bag:journal:track',args={entries:[entry],region:box,hoveredId:id};
  const up=renderProbe(args,{clock:1000});
  assert.equal(sampleControl(id,{now:1000}).travel,0);assert.equal(sampleControl(id,{now:1000}).lampHeat,0);
  const track=up.view.hits.find(h=>h.id===id),baseline=p=>p.commands.find(c=>c.method==='fillText'&&c.state.fillStyle==='#12150d'&&c.args[0]==='T'&&c.args[1]>track.x*8.45&&c.args[1]<(track.x+track.w)*8.45&&c.args[2]>=track.y*20).args[2];
  pressControl(id,{now:1000});const down=renderProbe(args,{clock:1071});assert.ok(baseline(down)>baseline(up)+.5);
  releaseControl(id,{now:1091});const released=renderProbe(args,{clock:1220});assert.ok(Math.abs(baseline(released)-baseline(up))<1e-8);
});

function pagedRows(value,region=box){
  const g=journalGeometry(region),opts={compact:g.mode!=='wide',tiny:g.mode==='tiny'};
  const first=journalDetailLayout(value,g.detail,opts),rows=[];
  for(let detailPage=0;detailPage<first.pages;detailPage++)rows.push(...journalDetailLayout(value,g.detail,{...opts,detailPage}).visible);
  return rows;
}
const prose=(value,region)=>pagedRows(value,region).map(r=>r.text).join(' ').replace(/\s+/g,' ');
const closedParent={...entry,nature:'undertaking',commitment:'fulfilled',state:'resolved',trackable:false,
  stage:{id:'returned',label:'The tray was returned'},nextLabel:null,next:null,
  closure:{label:'HELP GIVEN',text:'The waters and empty glasses are dealt with.'},
  milestones:[{id:'waters',label:'Waters served',state:'done'},{id:'tray',label:'Tray returned',state:'done'}],
  records:[{id:'accepted',label:'Agreement',text:'You agreed to help Iona.'},{id:'returned',label:'Return',text:'Iona took back the tray.'}]};

test('nature is a factual classification and never inferred from acceptance or completion',()=>{
  for(const [nature,label] of [['undertaking','WORK'],['lead','LEAD'],['record','RECORD']])for(const commitment of ['none','accepted','fulfilled','declined']){
    const value={...entry,nature,commitment};assert.equal(journalPresentation(value).classification,label);
  }
  assert.equal(journalPresentation({...entry,category:'assignment'}).classification,'WORK','legacy assignment remains supported');
});

test('commitment and current stage are reported distinctly without converting discovery into agreement',()=>{
  const labels={none:'NOT AGREED',assigned:'ASSIGNED',accepted:'ACCEPTED',fulfilled:'FULFILLED',declined:'DECLINED',withdrawn:'WITHDRAWN',consented:'CONSENT GIVEN'};
  for(const [commitment,label] of Object.entries(labels)){
    const value={...entry,nature:'lead',commitment,stage:{id:'explained',label:'The offer was explained'}};
    const p=journalPresentation(value);assert.equal(p.commitment,label);assert.equal(p.stage,'The offer was explained');
    const text=prose(value,contentRegion(40,16));assert.ok(text.includes(label));assert.ok(text.includes(value.stage.label));
  }
});

test('a fulfilled parent stays closed while an accepted follow-up supplies its own next action',()=>{
  const value={...closedParent,trackable:true,followUp:{id:'opener',label:'Bottle opener',commitment:'accepted',
    stage:{id:'find-opener',label:'Iona asked for the opener'},nextLabel:'NEXT',next:'Find the opener in the staff kitchen.'}};
  const text=prose(value,contentRegion(40,16));
  assert.ok(text.includes('FULFILLED'));assert.ok(text.includes('HELP GIVEN: The waters and empty glasses are dealt with.'));
  assert.ok(text.indexOf('HELP GIVEN:')<text.indexOf('FOLLOW-UP: Bottle opener'));
  assert.ok(text.indexOf('FOLLOW-UP: Bottle opener')<text.indexOf('NEXT: Find the opener'));
  assert.equal(value.state,'resolved');assert.equal(value.commitment,'fulfilled');
  assert.equal(present({entries:[value],region:box}).hits.find(h=>h.actionId==='journal-track').enabled,true);
});

test('a closed parent with current follow-up purpose keeps the selector as bright as active work',()=>{
  const glyphAlphas=value=>{
    const {commands}=renderProbe({entries:[{...value,title:'Original service'}],region:box});
    return commands.filter(c=>c.method==='drawImage').map(c=>c.state.globalAlpha);
  };
  const active=glyphAlphas({...closedParent,state:'active'}),archived=glyphAlphas(closedParent);
  assert.equal(active.length,archived.length);assert.ok(active.some((a,i)=>a>archived[i]),'closed work with no current purpose remains quieter');
  for(const current of [{hasOpenCommitment:true},{trackable:true}]){
    const value={...closedParent,...current};
    assert.deepEqual(glyphAlphas(value),glyphAlphas({...value,state:'active'}));
    assert.equal(value.state,'resolved');assert.equal(value.commitment,'fulfilled');
  }
});

test('an offered follow-up remains an optional choice rather than a new promise',()=>{
  const value={...closedParent,followUp:{id:'seal',label:'A further agreement',commitment:'none',stage:{id:'offered',label:'Ren made an offer'},nextLabel:'OPTIONAL',next:'Ask what the agreement means.'}};
  const text=prose(value);assert.ok(text.includes('FOLLOW-UP: A further agreement'));assert.ok(text.includes('NOT AGREED'));
  assert.ok(text.includes('OPTIONAL: Ask what the agreement means.'));assert.ok(!text.includes('NEXT: Ask what'));
});

test('a declined or completed follow-up preserves the original closure and its separate outcome',()=>{
  for(const commitment of ['declined','fulfilled']){
    const value={...closedParent,followUp:{id:'seal',label:'Further request',commitment,stage:{id:'answered',label:'Your answer was heard'},nextLabel:null,next:null,outcome:commitment==='declined'?'You kept your answer.':'The further agreement is finished.'}};
    const text=prose(value);assert.ok(text.includes(closedParent.closure.text));assert.ok(text.includes(value.followUp.outcome));
    assert.ok(!text.includes('NEXT:'));assert.equal(present({entries:[value],region:box}).hits.find(h=>h.actionId==='journal-track').enabled,false);
  }
});

test('telephone records remain facts rather than commands or completed-quest claims',()=>{
  const value={...entry,nature:'record',state:'resolved',commitment:'none',trackable:false,stage:{id:'call-ended',label:'Call ended'},
    nextLabel:null,next:'Dial another number.',outcome:'The call has ended.',summary:'A call was made.',records:[{id:'key',label:'Received',text:'A chapel key arrived.'}]};
  const text=prose(value,contentRegion(40,16));assert.ok(text.includes('RECORD'));assert.ok(text.includes('Call ended'));
  assert.ok(text.includes('Received: A chapel key arrived.'));assert.ok(!text.includes('Dial another number'));
  assert.ok(!text.includes('OUTCOME:'));assert.ok(!text.includes('FULFILLED'));
  assert.equal(present({entries:[value],region:box}).hits.find(h=>h.actionId==='journal-track').enabled,false);
});

test('known milestones show completed and current work while excluding unsupported future stages',()=>{
  const value={...entry,milestones:[{id:'done',label:'Index read',state:'done'},{id:'now',label:'Find the drawer',state:'current'},
    {id:'future',label:'UNREVEALED FUTURE REWARD',state:'future'}]};
  const text=prose(value);assert.ok(text.includes('DONE: Index read'));assert.ok(text.includes('NOW: Find the drawer'));
  assert.ok(!text.includes('UNREVEALED'));
});

test('an explicit next action appears once while completed milestones remain visible',()=>{
  const value={...entry,nextLabel:'NEXT',next:'Take the two waters from the counter.',milestones:[
    {id:'agreed',label:'Agreed to help Iona',state:'done'},
    {id:'tray',label:'Take the two waters from the counter.',state:'current'}]};
  const text=prose(value);
  assert.equal(text.split(value.next).length-1,1);
  assert.ok(text.includes('DONE: Agreed to help Iona'));
  const follow={...closedParent,followUp:{id:'opener',label:'Bottle opener',commitment:'accepted',nextLabel:'NEXT',next:'Return it to Iona.',
    milestones:[{id:'found',label:'Opener found',state:'done'},{id:'return',label:'Return it to Iona.',state:'current'}]}};
  const followText=prose(follow);
  assert.equal(followText.split(follow.followUp.next).length-1,1);
  assert.ok(followText.includes('DONE: Opener found'));
});

test('causally ordered records retain authored order without inventing timestamps or a timeline',()=>{
  const value={...entry,records:[{id:'one',label:'Asked',text:'Iona explained the task.'},{id:'two',label:'Answer',text:'You agreed to help.'},
    {id:'three',label:'Return',text:'The tray went back.'}],evidence:['OBSOLETE DUPLICATE EVIDENCE']};
  const text=prose(value);assert.ok(text.indexOf('Asked:')<text.indexOf('Answer:'));assert.ok(text.indexOf('Answer:')<text.indexOf('Return:'));
  assert.ok(!text.includes('OBSOLETE DUPLICATE'));assert.ok(!/TIMELINE|\d\d:\d\d/.test(text));
});

test('an explicit null next label suppresses stale instructions and explicit trackability overrides parent state',()=>{
  const value={...entry,nature:'lead',commitment:'none',stage:{id:'heard',label:'You heard a request'},nextLabel:null,trackable:false};
  assert.ok(!prose(value).includes(entry.next));
  assert.equal(present({entries:[value],region:box}).hits.find(h=>h.actionId==='journal-track').enabled,false);
  assert.equal(present({entries:[value],pinnedId:value.id,region:box}).hits.find(h=>h.actionId==='journal-track').enabled,true,'a stale pin can still be deliberately removed');
});

test('UPDATED is steady display information and never changes manufactured cap legends or input targets',()=>{
  const value={...entry,nature:'lead',commitment:'none',stage:{id:'heard',label:'Request explained'},updated:true};
  const a=renderProbe({entries:[value],region:box}),b=renderProbe({entries:[{...value,updated:false}],region:box});
  const caps=p=>p.commands.filter(c=>c.method==='fillText'&&c.state.fillStyle==='#12150d').map(c=>c.args[0]).join('');
  assert.equal(caps(a),caps(b));assert.ok(!a.commands.filter(c=>c.method==='fillText').map(c=>c.args[0]).join('').includes('UPDATED'));
  assert.deepEqual(a.view.hits,b.view.hits);assert.ok(prose(value,contentRegion(40,16)).includes('UPDATED'));
});

test('rich closure, child, milestones and records all survive compact pagination without mutation or lost final facts',()=>{
  const value={...closedParent,updated:true,trackable:true,followUp:{id:'opener',label:'The bottle opener',commitment:'accepted',stage:{id:'return',label:'Found in the kitchen'},nextLabel:'NEXT',next:'Return the opener to Iona.',milestones:[{id:'found',label:'Opener collected',state:'done'}]},
    records:[...closedParent.records,{id:'last',label:'Last fact',text:'FINAL KNOWN FACT REMAINS ACCESSIBLE.'}]};
  const before=JSON.stringify(value);
  for(const region of [box,contentRegion(40,16),contentRegion(75,20)]){
    const text=prose(value,region);for(const phrase of [value.closure.text,'FOLLOW-UP: The bottle opener','NEXT: Return the opener','DONE: Opener collected','FINAL KNOWN FACT REMAINS ACCESSIBLE.'])assert.ok(text.includes(phrase),phrase);
    const g=journalGeometry(region),d=journalDetailLayout(value,g.detail,{compact:g.mode!=='wide',tiny:g.mode==='tiny'});
    assert.ok(d.text.y+d.lineH*d.capacity<=d.display.y+d.display.h+1e-8);
    present({entries:[value],region,detailPage:d.pages-1});
  }
  assert.equal(JSON.stringify(value),before,'viewing, paging and acknowledging appearance do not alter authoritative data');
});

test('production custom case geometry keeps a real text line inside the glass across window and large-text cell budgets',()=>{
  for(const cols of [40,60,75,100,151,303])for(const rows of [16,20,25,30,40,80]){
    const r=contentRegion(cols,rows),g=journalGeometry(r),d=journalDetailLayout(entry,g.detail,{compact:g.mode!=='wide',tiny:g.mode==='tiny'});
    assert.ok(d.body.h>=d.lineH,`${cols}x${rows}: forced capacity without room for a text line`);
    assert.ok(d.text.y+d.lineH*d.capacity<=d.display.y+d.display.h+1e-8,`${cols}x${rows}: text behind glass border`);
    assert.ok(d.text.y+d.lineH*d.capacity<=d.actions.y+1e-8,`${cols}x${rows}: text behind keys`);
  }
  assert.equal(journalGeometry(contentRegion(100,25)).mode,'tiny');
  assert.equal(journalGeometry(contentRegion(75,20)).mode,'tiny');
});

test('real fulfilled Lyric service and accepted or offered follow-up remain intelligible on the first large-text page',()=>{
  for(const [flag,label] of [['pub.help.opener.accepted','NEXT'],['pub.help.opener.offered','CHOICE']]){
    const e=buildQuestJournal({save:{flags:{'pub.help.complete':true,[flag]:true}}}).find(e=>e.id==='quest:lyric');
    const r=contentRegion(100,25),g=journalGeometry(r),d=journalDetailLayout(e,g.detail,{compact:g.mode!=='wide',tiny:g.mode==='tiny'});
    const first=d.visible.map(row=>row.text).join(' ').replace(/\s+/g,' ');
    assert.ok(first.includes('FULFILLED'));assert.ok(first.includes(e.closure.text));
    assert.ok(first.includes('FOLLOW-UP: Iona’s bottle opener'));assert.ok(first.includes(`${label}: ${e.followUp.next}`));
    assert.equal(e.state,'resolved');assert.equal(e.commitment,'fulfilled');
  }
});
