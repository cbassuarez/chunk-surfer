import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLocalTextReview,localTextReviewLocation,reviewKey,TEXT_REVIEW_STORAGE_KEY,TEXT_REVIEW_REASONS} from '../src/game/local-text-review.js';
const target={id:'guard.start.1',sceneId:'coldopen',nodeId:'guard.start',sourceId:'guard.line.1',speaker:'me',fields:[
  {key:'guard.short',label:'Choice label',original:'Ask about the job'},
  {key:'guard.long',label:'Spoken line',original:'What can you tell me about the job?'}]};
function fixture(saved=null,options={}){
  let value=saved, writes=0;
  const storage={getItem(key){assert.equal(key,TEXT_REVIEW_STORAGE_KEY);return value;},setItem(key,next){assert.equal(key,TEXT_REVIEW_STORAGE_KEY);writes++;value=next;}};
  const session=createLocalTextReview({buildAllowed:true,local:true,storage,now:()=> '2026-10-26T00:00:00Z',...options});
  session.setEnabled(true);return {session,storage,get value(){return value;},get writes(){return writes;}};
}
test('production and remote builds cannot enable edits or read local review storage',()=>{
  for(const gate of [{buildAllowed:false,local:true},{buildAllowed:true,local:false}]){
    const session=createLocalTextReview({...gate,storage:{getItem(){throw Error('must not read');}}});
    assert.equal(session.setEnabled(true),false);assert.equal(session.error,'');
    assert.equal(session.text('guard.short','Original'),'Original');
    assert.throws(()=>session.saveFields(target,{'guard.short':'Changed'}),/off/);
    session.register(target,{x:1,y:1,w:10,h:1});assert.deepEqual(session.regions(),[]);
  }
});
test('local development origin gate accepts only loopback and native local origins',()=>{
  for(const value of ['http://localhost:5173','https://127.0.0.1:5173','http://[::1]:5173','tauri://localhost','http://tauri.localhost'])assert.equal(localTextReviewLocation(new URL(value)),true,value);
  for(const value of ['https://example.org','http://192.168.0.2','file:///tmp/game/index.html','data:text/plain,hi'])assert.equal(localTextReviewLocation(new URL(value)),false,value);
});
test('short choice and full spoken strings are independent, persistent and reversible',()=>{
  const f=fixture();f.session.saveFields(target,{'guard.short':'The job?', 'guard.long':'Who is paying us?\nAnd why tonight?'});
  assert.equal(f.session.text('guard.short',target.fields[0].original),'The job?');
  assert.equal(f.session.text('guard.long',target.fields[1].original),'Who is paying us?\nAnd why tonight?');
  const reload=fixture(f.value);assert.equal(reload.session.text('guard.long',target.fields[1].original),'Who is paying us?\nAnd why tonight?');
  reload.session.setEnabled(false);assert.equal(reload.session.text('guard.short',target.fields[0].original),target.fields[0].original);
  reload.session.setEnabled(true);reload.session.resetTarget(target);assert.equal(reload.session.text('guard.short',target.fields[0].original),target.fields[0].original);
  assert.equal(JSON.stringify(target).includes('The job?'),false,'authored descriptor not mutated');
});
test('changed authored originals do not silently inherit an old override',()=>{
  const f=fixture();f.session.saveFields(target,{'guard.short':'Changed'});
  assert.equal(f.session.text('guard.short','New authored original'),'New authored original');
  assert.equal(f.session.snapshot().overrides['guard.short'].text,'Changed','conflicting edit remains available for review/export');
});
test('quota failure reports failure and retains the last durable state atomically',()=>{
  const f=fixture();f.session.saveFields(target,{'guard.short':'Saved'});
  f.storage.setItem=()=>{throw Error('quota exceeded');};
  assert.throws(()=>f.session.saveFields(target,{'guard.short':'Lost'}),/not saved: quota exceeded/);
  assert.equal(f.session.text('guard.short',target.fields[0].original),'Saved');
  assert.match(f.session.error,/not saved/);
});
test('malformed stored data neither crashes play nor enables review',()=>{
  const f=fixture('{broken');assert.match(f.session.error,/could not be loaded/);
  assert.equal(f.session.text('guard.short','Original'),'Original');
  const reload=createLocalTextReview({buildAllowed:true,local:true,storage:f.storage});assert.equal(reload.enabled,false);
});
test('flags retain context and notes separately from actual edits and game state',()=>{
  const f=fixture();f.session.flag(target,'remove','Repeated after returning to the corridor.');f.session.flag(target,'rearrange','Try before the warning.');
  const exported=JSON.parse(f.session.export());assert.equal(exported.flags.length,2);assert.deepEqual(exported.overrides,{});
  assert.equal(exported.flags[0].target.sourceId,'guard.line.1');assert.equal(exported.flags[0].target.fields[1].original,target.fields[1].original);
  const reloaded=fixture(f.value);assert.equal(reloaded.session.snapshot().flags.length,2);
  reloaded.session.removeFlag(exported.flags[0].id);assert.equal(reloaded.session.snapshot().flags.length,1);
  assert.throws(()=>f.session.flag(target,'goto','invalid'),/Unknown/);
});
test('picking is frame-scoped, exact, topmost and independent of CSS pixel scaling',()=>{
  const f=fixture();f.session.register(target,{x:11.5,y:7.25,w:8,h:1});
  assert.equal(f.session.hit(11.49,7.5),null);assert.equal(f.session.hit(19.5,7.5),null);assert.equal(f.session.hit(12,8.25),null);
  assert.equal(f.session.hit(12,7.5),target);
  const other={...target,id:'top'};f.session.register(other,{x:12,y:7.25,w:3,h:1});assert.equal(f.session.hit(12,7.5),other);
  f.session.beginFrame();assert.equal(f.session.hit(12,7.5),null,'stale scene text cannot be edited');
});
test('keys preserve author identity, raw indices and separate short/long fields',()=>{
  assert.notEqual(reviewKey({sceneId:'a',sourceId:'x',field:'prompt'}),reviewKey({sceneId:'a',sourceId:'x',field:'text'}));
  assert.notEqual(reviewKey({sceneId:'a',index:1}),reviewKey({sceneId:'a',index:2}));
  assert.notEqual(reviewKey({sceneId:'a',index:1}),reviewKey({sceneId:'b',index:1}));
  assert.notEqual(reviewKey({sceneId:'a'},'Repeated?'),reviewKey({sceneId:'a'},'Different?'));
});
test('Vite enables the editor only for serve or explicit native debug builds',async()=>{
  const config=(await import('../vite.config.js')).default, before=process.env.TAURI_ENV_DEBUG;
  try{
    delete process.env.TAURI_ENV_DEBUG;assert.equal(config({command:'serve'}).define.__LOCAL_TEXT_REVIEW__,true);assert.equal(config({command:'build'}).define.__LOCAL_TEXT_REVIEW__,false);
    process.env.TAURI_ENV_DEBUG='false';assert.equal(config({command:'build'}).define.__LOCAL_TEXT_REVIEW__,false);
    process.env.TAURI_ENV_DEBUG='true';assert.equal(config({command:'build'}).define.__LOCAL_TEXT_REVIEW__,true);
  }finally{if(before===undefined)delete process.env.TAURI_ENV_DEBUG;else process.env.TAURI_ENV_DEBUG=before;}
});

// Run the complete production UI with an actual isolated core session. Only
// its ESM singleton import is replaced; its DOM lifecycle and input/save code
// execute unchanged. This avoids relying on Node's cached build-gated singleton.
function documentFixture(){
  const doc={activeElement:null};
  doc.createElement=tag=>{
    const listeners=new Map(),node={tagName:tag.toUpperCase(),children:[],style:{},dataset:{},attributes:{},textContent:'',id:'',className:'',parentNode:null,hidden:false,open:false,shows:0,closes:0,
      append(...children){for(const child of children){child.parentNode?.removeChild(child);child.parentNode=this;this.children.push(child);}},
      appendChild(child){this.append(child);return child;},
      removeChild(child){const index=this.children.indexOf(child);if(index>=0)this.children.splice(index,1);child.parentNode=null;},
      replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);},
      remove(){this.parentNode?.removeChild(this);},setAttribute(key,value){this.attributes[key]=String(value);},
      addEventListener(type,listener){const list=listeners.get(type)||[];list.push(listener);listeners.set(type,list);},
      dispatch(type,event={}){event.target??=this;for(const listener of listeners.get(type)||[])listener(event);},
      click(){this.dispatch('click',input({type:'click',target:this}));},focus(){doc.activeElement=this;},
      showModal(){if(this.open)throw Error('dialog already open');this.open=true;this.shows++;},
      close(){this.open=false;this.closes++;},
      closest(selector){let at=this;while(at){if(selector===`#${at.id}`)return at;at=at.parentNode;}return null;},
    };
    let value;
    Object.defineProperty(node,'value',{get(){return value??(this.tagName==='SELECT'?this.children[0]?.value:'')??'';},set(next){value=String(next);}});
    return node;
  };
  doc.head=doc.createElement('head');doc.body=doc.createElement('body');
  return doc;
}
function descendants(node){return [node,...node.children.flatMap(descendants)];}
function input(extra={}){return{type:'keydown',key:'',repeat:false,prevented:0,stopped:0,
  preventDefault(){this.prevented++;},stopPropagation(){this.stopped++;},...extra};}
function uiFixture(saved=null){
  const f=fixture(saved),doc=documentFixture(),lease=[],points=[];
  // The same client-rectangle mapping used by the actual UI surface. Its
  // backing pixels differ from CSS pixels, so a guessed cell divisor fails.
  const uiSource=readFileSync(new URL('../src/render/ui.js',import.meta.url),'utf8');
  const start=uiSource.indexOf('export function uiPointFromClient('),end=uiSource.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start);
  const canvas={width:2400,height:1000,getBoundingClientRect:()=>({left:37,top:53,width:1200,height:500})};
  const convert=new Function('canvas','host','cols','rows',`${uiSource.slice(start,end).replace(/^export /,'')}\nreturn uiPointFromClient;`)(canvas,null,100,50);
  const source=readFileSync(new URL('../src/dev/local-text-review-ui.js',import.meta.url),'utf8')
    .replace(/^import\s[\s\S]*?;\n/,'').replace(/^export /gm,'');
  const install=vm.runInNewContext(`${source}\ninstallLocalTextReviewUi`,{session:f.session,TEXT_REVIEW_REASONS,Blob,URL,setTimeout});
  const ui=install({document:doc,pointFromClient:(x,y)=>{points.push([x,y]);return convert(x,y);},
    onOpen:()=>lease.push('open'),onClose:()=>lease.push('close'),onSelect:()=>lease.push('select')});
  const find=predicate=>descendants(doc.body).find(predicate);
  return{...f,session:f.session,storage:f.storage,doc,ui,lease,points,
    modal:find(node=>node.id==='local-text-review'),badge:find(node=>node.id==='local-text-review-badge'),
    field:id=>find(node=>node.id===id),button:text=>find(node=>node.tagName==='BUTTON'&&node.textContent===text),
    statuses:()=>descendants(doc.body).filter(node=>node.attributes.role==='status').map(node=>node.textContent)};
}

test('malformed persisted context arrays and empty fields surface a controlled load error before the desk renders',()=>{
  const invalid=[
    {version:1,overrides:[],flags:[]},
    {version:1,overrides:{'guard.short':{original:'Ask',text:'Edit',context:[]}},flags:[]},
    {version:1,overrides:{'guard.short':{original:'Ask',text:'Edit',context:{id:'bad',fields:[]}}},flags:[]},
    {version:1,overrides:{},flags:[{id:'bad',reason:'change',target:[]}]},
    {version:1,overrides:{},flags:[{id:'bad',reason:'change',target:{id:'bad',fields:[]}}]},
    {version:1,overrides:{},flags:[{id:'bad',reason:'change',target:{id:'bad',fields:[null]}}]},
  ];
  for(const saved of invalid){
    const h=uiFixture(JSON.stringify(saved));
    try{
      assert.match(h.session.error,/could not be loaded/);
      assert.deepEqual(h.session.snapshot().overrides,{});assert.deepEqual(h.session.snapshot().flags,[]);
      assert.doesNotThrow(()=>h.ui.open());
      assert.ok(h.statuses().some(status=>status.includes('could not be loaded')));
      assert.equal(descendants(h.modal).filter(node=>node.className==='review-item').length,0,'malformed targets never reach desk edit buttons');
    }finally{h.ui.dispose();}
  }
});

test('quick review prioritizes a selected visible choice, then active player, active speaker, and player history',()=>{
  const {session}=fixture(),selected={...target,id:'selected'},activePlayer={...target,id:'active-player'},
    activeOther={...target,id:'active-guard',speaker:'guard'},history={...target,id:'history'},last={...target,id:'last',speaker:'direction'};
  const check=(entries,wanted)=>{session.beginFrame();for(const [item,extra]of entries)session.register(item,{x:2,y:3,w:8,h:1,...extra});assert.equal(session.latestPlayerTarget(),wanted);};
  check([[selected,{selected:true}],[activePlayer,{active:true}],[activeOther,{active:true}],[history,{}],[last,{}]],selected);
  check([[activePlayer,{active:true}],[activeOther,{active:true}],[history,{}],[last,{}]],activePlayer);
  check([[activeOther,{active:true}],[history,{}],[last,{}]],activeOther);
  check([[history,{}],[last,{}]],history);
  check([[activeOther,{}],[last,{}]],last);
  session.beginFrame();assert.equal(session.latestPlayerTarget(),null);
});

test('desk to edit holds one UI lease and closing or disposing releases it exactly once',()=>{
  const h=uiFixture();
  h.session.saveFields(target,{'guard.short':'Saved locally'});
  try{
    h.ui.open();assert.equal(h.modal.shows,1);assert.equal(h.ui.isOpen,true);
    h.button(`Edit: ${target.fields[0].original}`).click();
    assert.deepEqual(h.lease,['open']);assert.equal(h.modal.shows,1);
    assert.equal(h.field('local-text-field-0').value,'Saved locally');
    assert.equal(h.doc.activeElement,h.field('local-text-field-0'));
    h.ui.open();assert.deepEqual(h.lease,['open'],'moving back to the desk cannot acquire another lease');
    h.ui.close();h.ui.close();h.modal.dispatch('cancel',input({type:'cancel'}));
    assert.equal(h.modal.closes,1);assert.deepEqual(h.lease,['open','close']);
  }finally{h.ui.dispose();}
  assert.deepEqual(h.lease,['open','close']);
});

test('the actual main key gates keep textarea, navigation and key releases inside the open editor',()=>{
  const h=uiFixture(),reached=[];h.ui.edit(target);
  try{
    const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    const gates=['onKey','onKeyUp'].map(name=>{
      const header=`function ${name}(e){`,start=main.indexOf(header),body=start+header.length;
      const guard=main.indexOf("  if(typeof localTextReviewUi",body),end=main.indexOf('\n',guard);
      assert.ok(start>=0&&guard>=body&&end>guard);
      return new Function('localTextReviewUi','game',`return function(e){${main.slice(body,end)}\ngame(e);};`)(h.ui,e=>reached.push(e.key));
    });
    const textarea=h.field('local-text-field-0');
    for(const key of ['a',' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Tab','Backspace','Delete','r','b','F8']){
      for(const [index,gate]of gates.entries()){
        const event=input({key,type:index?'keyup':'keydown',target:textarea});gate(event);
        assert.equal(event.prevented,0,'native typing and navigation retain browser defaults');
      }
    }
    for(const target of [h.button('Save locally'),h.field('local-text-flag-reason')])for(const key of ['ArrowUp','ArrowDown','Home','Enter','Tab']){
      const event=input({key,target});gates[0](event);assert.equal(event.prevented,0,'button and select navigation keep native defaults too');
    }
    assert.deepEqual(reached,[]);
    const escape=input({key:'Escape',target:textarea});gates[0](escape);
    assert.equal(escape.prevented,1);assert.equal(escape.stopped,1);assert.deepEqual(h.lease,['open','close']);
    gates[0](input({key:'q'}));assert.deepEqual(reached,['q'],'a closed inactive editor releases the normal main dispatch');
  }finally{h.ui.dispose();}
});

test('F7 edits the selected visible text without a pointer gesture and consumes repeats and release',()=>{
  const h=uiFixture();h.session.register(target,{x:20,y:10,w:8,h:1,selected:true});
  try{
    const shift=input({key:'Shift'});assert.equal(h.ui.key(shift),false,'ordinary Shift never releases look focus');
    const click=input({type:'pointerdown',clientX:283,clientY:158,shiftKey:true,button:0});
    assert.equal(h.ui.pointer(click),false);assert.equal(h.ui.isOpen,false);assert.deepEqual(h.points,[]);
    const key=input({key:'F7',code:'F7'});assert.equal(h.ui.key(key),true);
    assert.equal(key.prevented,1);assert.equal(key.stopped,1);
    assert.equal(h.ui.isOpen,true);assert.equal(h.doc.activeElement,h.field('local-text-field-0'));
    assert.equal(h.field('local-text-field-0').value,target.fields[0].original);
    assert.deepEqual(h.lease,['open']);
    const repeat=input({key:'F7',repeat:true});assert.equal(h.ui.key(repeat),true);
    assert.equal(repeat.prevented,1,'holding F7 cannot open the browser caret-browsing prompt');
    assert.equal(h.ui.key(input({key:'F7',type:'keyup'})),true);
    assert.equal(h.modal.shows,1);assert.deepEqual(h.lease,['open']);
    assert.equal(h.ui.pointer(input({type:'pointermove'})),true,'the open dialog owns pointer routing');
    h.ui.close();assert.equal(h.ui.key(input({key:'',code:'F7',type:'keyup'})),true);
    assert.equal(h.ui.isOpen,false,'a release never reopens the editor');
  }finally{h.ui.dispose();}
});

test('Shift+F7 lists actual visible targets and keeps the opening snapshot while play is paused',()=>{
  const h=uiFixture(),other={...target,id:'other',speaker:'guard',fields:[{key:'guard.other',label:'Text',original:'Do not go in.'}]};
  h.session.register(target,{x:1,y:1,w:8,h:1,selected:true});
  h.session.register(other,{x:1,y:2,w:8,h:1});h.session.register(other,{x:1,y:3,w:8,h:1});
  try{
    assert.equal(h.ui.key(input({key:'F7',shiftKey:true})),true);
    const visible=()=>descendants(h.modal).filter(n=>n.tagName==='BUTTON'&&n.textContent.startsWith('Edit visible:'));
    assert.equal(visible().length,2,'wrapped text registers only one edit button per source');
    assert.deepEqual(h.lease,['open']);h.session.beginFrame();
    h.button('Edit visible: guard · Do not go in.').click();
    assert.equal(h.field('local-text-field-0').value,'Do not go in.');
    h.button('Visible text, edits and flags').click();assert.equal(visible().length,2,'pause cannot erase visible source choices');
    assert.deepEqual(h.lease,['open'],'switching desk/editor never reacquires a pause lease');
  }finally{h.ui.dispose();}
});

test('edit hotkey opens the desk when no text is painted and respects mode and platform modifiers',()=>{
  const h=uiFixture();
  try{
    for(const modifier of['ctrlKey','metaKey','altKey'])assert.equal(h.ui.key(input({key:'F7',[modifier]:true})),false);
    assert.equal(h.ui.key(input({key:'',code:'F7'})),true);assert.equal(h.ui.isOpen,true);
    assert.equal(h.badge.tagName,'DIV','the hint cannot steal locked-look clicks');
    assert.ok(descendants(h.modal).some(n=>n.tagName==='H2'&&n.textContent==='Local text review'));
    h.ui.close();h.session.setEnabled(false);assert.equal(h.ui.key(input({key:'F7'})),false);
    const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    assert.match(main,/pointerMode\.release\('local-text-editor'\)/);
    assert.doesNotMatch(main,/onSelect:\(\)=>\{pointerMode\.release\('local-text-select'/);
  }finally{h.ui.dispose();}
});

test('F8 storage failure stays visible on the badge and never escapes the input handler',()=>{
  const h=uiFixture();h.session.register(target,{x:1,y:1,w:8,h:1,selected:true});
  h.storage.setItem=()=>{throw Error('quota exceeded');};
  try{
    const event=input({key:'F8'});let handled;
    assert.doesNotThrow(()=>{handled=h.ui.key(event);});
    assert.equal(handled,true);assert.equal(event.prevented,1);
    assert.match(h.badge.textContent,/not saved: quota exceeded/);assert.equal(h.badge.hidden,false);
    assert.deepEqual(h.session.snapshot().flags,[]);assert.equal(h.ui.isOpen,false);
  }finally{h.ui.dispose();}
});

test('Ctrl or Cmd S reads the current native textarea values for both editable fields',()=>{
  const h=uiFixture();h.ui.edit(target);
  try{
    for(const modifier of ['ctrlKey','metaKey']){
      const short=`Changed via ${modifier}`,long=`Full line via ${modifier}.\nWith a second paragraph.`;
      h.field('local-text-field-0').value=short;h.field('local-text-field-1').value=long;
      const event=input({key:'S',[modifier]:true,target:h.field('local-text-field-1')});
      assert.equal(h.ui.key(event),true);assert.equal(event.prevented,1);
      assert.equal(h.session.text('guard.short',target.fields[0].original),short);
      assert.equal(h.session.text('guard.long',target.fields[1].original),long);
      assert.match(h.ui.lastStatus,/Applied locally/);assert.equal(h.ui.isOpen,true);
    }
    assert.deepEqual(h.lease,['open']);assert.equal(target.fields[0].original,'Ask about the job');
  }finally{h.ui.dispose();}
});

test('Ctrl S storage failure reports in the editor without throwing, closing or losing unsaved textarea text',()=>{
  const h=uiFixture();h.ui.edit(target);h.field('local-text-field-0').value='Still unsaved';
  h.storage.setItem=()=>{throw Error('quota exceeded');};
  try{
    const event=input({key:'s',ctrlKey:true,target:h.field('local-text-field-0')});
    assert.doesNotThrow(()=>h.ui.key(event));
    assert.match(h.ui.lastStatus,/not saved: quota exceeded/);
    assert.ok(h.statuses().some(status=>status.includes('not saved: quota exceeded')));
    assert.equal(h.field('local-text-field-0').value,'Still unsaved');assert.equal(h.ui.isOpen,true);
    assert.equal(h.session.text('guard.short',target.fields[0].original),target.fields[0].original);
    assert.deepEqual(h.lease,['open']);
  }finally{h.ui.dispose();}
});

test('turning review off while the desk is open closes one lease and hides its badge',()=>{
  const h=uiFixture();h.ui.open();h.session.setEnabled(false);
  assert.equal(h.ui.isOpen,false);assert.equal(h.badge.hidden,true);assert.deepEqual(h.lease,['open','close']);
  assert.equal(h.ui.key(input({key:'F8'})),false);
  h.ui.dispose();assert.deepEqual(h.lease,['open','close']);
});
