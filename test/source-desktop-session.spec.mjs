import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceDesktopSession } from '../src/game/source-desktop-session.js';
import { combatHudLayout } from '../src/render/combat-hud-layout.js';
import {createSourceDesktopPaintWitness} from '../src/game/source-desktop-focus.js';

function fixture(options={}) {
  const calls=[];
  const element={style:{},dataset:{},remove:()=>calls.push('remove')};
  const host={ownerDocument:{createElement:()=>element},appendChild:()=>calls.push('append')};
  let state={mode:'fallback',active:false};
  const view={ready:Promise.resolve(true),resize:(...args)=>calls.push(['resize',...args]),update:frame=>calls.push(['frame',frame]),dispose:()=>calls.push('dispose'),debug:()=>({ready:true})};
  const director={beginSourceDesktop:async frame=>{calls.push(['begin',frame]);state={mode:'native',active:true,token:'one'};return state;},
    updateSourceDesktop:async frame=>{calls.push(['native',frame]);return true;},
    endSourceDesktop:async()=>{calls.push('end');state={mode:'fallback',active:false};},
    sourceDesktopState:()=>state};
  return{calls,view,element,director,restore:()=>{state={mode:'fallback',active:false,reason:'emergency-restore'};},
    session:createSourceDesktopSession({host,director,createView:()=>view,pressurePresentation:{primary:{id:'borrowed'}},...options})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('an absent Source frame cannot create a stale overlay or crash ordinary preparation',()=>{
  const f=fixture();assert.deepEqual(f.session.frame(null),{mode:'fallback',ready:false,reason:'no-source-frame'});
  assert.deepEqual(f.calls,[]);assert.equal(f.session.debug().ready,false);
});
test('one presentation migrates to native and returns to the window after emergency restoration',async()=>{
  const f=fixture(),stage={x:20,y:40,w:800,h:240};
  const state={active:true,clock:12,phase:'contained',coherenceRatio:.43,cover:{count:2,capacity:3}};
  f.session.frame(state,stage);await tick();f.session.frame(state,stage);
  assert.equal(f.element.style.display,'block');
  assert.equal(f.calls.filter(x=>x[0]==='resize').length,1,'stable frames do not resize/reallocate the GPU surface');
  await f.session.begin({...state,phase:'dissolving'});
  f.session.frame({...state,phase:'desktop',paused:true},stage);
  assert.equal(f.element.style.display,'none');
  const sent=f.calls.filter(x=>x[0]==='native').at(-1)[1];
  assert.equal(sent.clock,12);assert.equal(sent.coherenceRatio,.43);assert.equal(sent.paused,true);
  assert.equal(sent.pressurePresentation.primary.id,'borrowed');
  f.restore();f.session.frame({...state,phase:'desktop'},stage);
  assert.equal(f.session.mode(),'fallback');assert.equal(f.element.style.display,'block');
  assert.equal(f.calls.filter(x=>x[0]==='begin').length,1,'restoration never silently reopens desktop effects');
  await f.session.end('win');await f.session.end('win');
  assert.equal(f.calls.filter(x=>x==='dispose').length,1);assert.equal(f.calls.filter(x=>x==='end').length,1);
});

test('exiting during prewarm cannot open a late desktop overlay',async()=>{
  const f=fixture();let ready;f.view.ready=new Promise(resolve=>{ready=resolve;});
  const opening=f.session.begin({active:true,clock:5});
  await f.session.end('abort');ready(true);await opening;
  assert.equal(f.calls.some(x=>x[0]==='begin'),false);assert.equal(f.session.debug().ended,true);
});

test('native command controls and dialogue stay within the preserved type-scale budget',()=>{
  for(const h of [16,18,24])for(const mode of ['command','reaction','dialogue']){
    const panel={x:5,y:5,w:110,h};
    const l=combatHudLayout({panel,mode,sourceActive:true,desktop:true});
    const inside=r=>{assert.ok(r.y>=panel.y);assert.ok(r.y+r.h<=panel.y+panel.h,JSON.stringify({h,mode,r}));};
    [l.header,l.stage,l.playerGauge,l.resources,l.body,l.detail].forEach(inside);
    if(mode==='command'){
      [l.channels,l.carousel].forEach(inside);
      assert.ok(l.channels.y+l.channels.h<l.carousel.y);
      assert.ok(l.carousel.y+l.carousel.h<l.detail.y);
      assert.ok(l.carousel.h>=2.8,'tool and action targets retain real height');
    }else assert.ok(l.body.h>=6.4,'timed parry and dialogue keep their full content region');
  }
});

function witnessedFixture({timeout=100,paint=Promise.resolve(),hasFocus=null}={}){
  let emit=null,unlistened=0,revision=1;
  const f=fixture({nativeListen:async(name,fn)=>{assert.equal(name,'source-desktop:presented');emit=fn;return()=>unlistened++;},
    afterPaint:()=>paint,presentationTimeoutMs:timeout,hasFocus});
  const nativeState=f.director.sourceDesktopState,nativeUpdate=f.director.updateSourceDesktop;
  f.director.sourceDesktopState=()=>({...nativeState(),revision});
  f.director.updateSourceDesktop=async value=>{revision++;return nativeUpdate(value);};
  return{...f,emit:value=>emit?.({payload:value}),revision:()=>revision,unlistened:()=>unlistened};
}

test('response opportunities wait for the exact native final frame and the contained command paint',async()=>{
  let painted;const paint=new Promise(resolve=>{painted=resolve;});
  const f=witnessedFixture({paint});
  const value={phase:'dissolving',transition:1,breach:{elapsed:2.4},clock:4,coherenceRatio:.43,cover:{count:1,capacity:2}};
  f.session.frame(value,{x:0,y:0,w:800,h:300});await tick();await f.session.begin(value);
  const done=f.session.completeBreach(value);await tick();
  assert.equal(f.session.debug().inputFrameReady,false);
  const sent=f.calls.filter(x=>x[0]==='native').length;
  for(let i=0;i<30;i++)f.session.frame(value,{x:0,y:0,w:800,h:300});
  assert.equal(f.calls.filter(x=>x[0]==='native').length,sent,'ordinary draw frames cannot starve the final witness');
  f.emit({token:'another-encounter',revision:999});f.emit({token:'one',revision:f.revision()-1});await tick();
  assert.equal(f.session.debug().inputFrameReady,false,'foreign and stale frames cannot release input');
  f.emit({token:'one',revision:f.revision()});await tick();
  assert.equal(f.session.debug().inputFrameReady,false,'native ink alone does not witness the command paint');
  painted();assert.equal(await done,true);assert.equal(f.session.debug().inputFrameReady,true);
  assert.equal(value.phase,'dissolving');assert.equal(value.breach.elapsed,2.4,'presentation never mutates authoritative input');
  assert.equal(f.calls.filter(x=>x[0]==='native').at(-1)[1].phase,'desktop');
  await f.session.end();assert.equal(f.unlistened(),1);
});

test('missing final-frame acknowledgement restores contained combat instead of spending time under stale ink',async()=>{
  const f=witnessedFixture({timeout:5});
  const value={phase:'dissolving',transition:1,clock:12,coherenceRatio:.2,cover:{count:0,capacity:1}};
  f.session.frame(value,{x:0,y:0,w:800,h:300});await tick();await f.session.begin(value);
  assert.equal(await f.session.completeBreach(value),true);
  assert.equal(f.session.mode(),'fallback');assert.equal(f.session.debug().reason,'final-frame-unavailable');
  assert.equal(f.element.style.display,'block');assert.equal(f.session.debug().inputFrameReady,true);
  const local=f.calls.filter(x=>x[0]==='frame').at(-1)[1];
  assert.equal(local.phase,'desktop');assert.equal(local.clock,12);assert.equal(local.coherenceRatio,.2);
  await f.session.end();
});

test('exit while final presentation is pending cancels its witness and cannot revive the surface',async()=>{
  const f=witnessedFixture();const value={phase:'dissolving',transition:1,clock:12};
  f.session.frame(value,{x:0,y:0,w:800,h:300});await tick();await f.session.begin(value);
  const done=f.session.completeBreach(value);await tick();
  await f.session.end('abort');f.emit({token:'one',revision:999});
  assert.equal(await done,false);assert.equal(f.session.debug().inputFrameReady,false);
  assert.equal(f.calls.filter(x=>x==='remove').length,1);assert.equal(f.unlistened(),1);
});

test('a blur during final-frame presentation needs a fresh visible acknowledgement after focus returns',async()=>{
  let focused=true,painted;const paint=new Promise(resolve=>{painted=resolve;});
  const f=witnessedFixture({paint,hasFocus:()=>focused});const value={phase:'dissolving',transition:1,clock:12};
  f.session.frame(value,{x:0,y:0,w:800,h:300});await tick();await f.session.begin(value);
  const done=f.session.completeBreach(value);await tick();
  focused=false;f.session.frame({...value,paused:true});f.emit({token:'one',revision:f.revision()});await tick();
  assert.equal(f.session.debug().inputFrameReady,false);
  focused=true;f.session.frame({...value,paused:false});painted();await tick();
  assert.equal(f.session.debug().inputFrameReady,false,'the earlier hidden-frame witness released the resumed controls');
  f.emit({token:'one',revision:f.revision()});assert.equal(await done,true);
  assert.equal(f.session.debug().inputFrameReady,true);await f.session.end();
});

test('the passive surface cannot acknowledge a superseded or retired frame before its own paint',async()=>{
  const pending=[],acks=[];
  const witness=createSourceDesktopPaintWitness({afterPaint:()=>new Promise(resolve=>pending.push(resolve)),emit:async value=>acks.push(value)});
  const first={token:'one',revision:1},paused={token:'one',revision:2,paused:true};
  witness.stage(first);const a=witness.present(first);assert.deepEqual(acks,[]);
  witness.stage(paused);const b=witness.present(paused);
  pending.shift()();assert.equal(await a,false,'older queued ink acknowledged after replacement');
  pending.shift()();assert.equal(await b,true);assert.deepEqual(acks,[{token:'one',revision:2}]);
  assert.equal(await witness.present(paused),false,'one frame cannot acknowledge twice');
  const next={token:'two',revision:1};witness.stage(next);const c=witness.present(next);
  witness.close();pending.shift()();assert.equal(await c,false);assert.equal(acks.length,1);
});
