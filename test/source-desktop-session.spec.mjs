import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceDesktopSession } from '../src/game/source-desktop-session.js';
import { combatHudLayout } from '../src/render/combat-hud-layout.js';

function fixture() {
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
    session:createSourceDesktopSession({host,director,createView:()=>view,pressurePresentation:{primary:{id:'borrowed'}}})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
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
