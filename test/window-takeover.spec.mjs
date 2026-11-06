import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WINDOW_TAKEOVER as C,windowTakeoverMode,createWindowTakeoverState,createWindowTakeover} from '../src/game/window-takeover.js';
import {windowChoreographyPolicy,compileTakeoverPanePlan,createWindowChoreographyDirector} from '../src/platform/window-choreography.js';
import {validateWindowCompositionPlan} from '../src/platform/window-composition.js';

const run=(state,seconds,input={})=>{let v;for(let t=0;t<seconds&&!state.view().done;t+=.05)v=state.update(.05,input);return v||state.view();};

test('browser, withheld consent and reduced dread each get a way to run, and reduced dread wins',()=>{
  assert.equal(windowTakeoverMode({enabled:true,native:true,introduced:true}),'native');
  assert.equal(windowTakeoverMode({enabled:true,native:false,introduced:true}),'in-window','browser build');
  assert.equal(windowTakeoverMode({enabled:false,native:true,introduced:true}),'in-window','withheld consent');
  assert.equal(windowTakeoverMode({enabled:true,native:true,introduced:false}),'in-window','never introduced');
  assert.equal(windowTakeoverMode({enabled:true,native:true,introduced:true,reduceDread:true}),'calm');
});

test('left alone it opens, covers the whole picture, starts going wrong, and gives it back',()=>{
  let done=null;const s=createWindowTakeoverState({mediaId:'clouds',seed:0,onDone:r=>{done=r;}});
  assert.equal(s.view().phase,'pane');assert.equal(s.view().cover,0);
  assert.ok(s.view().rect.w<.3,'it starts as a pane');
  run(s,C.paneSeconds+C.growSeconds+.2);
  const covered=s.view();
  assert.equal(covered.phase,'held');assert.equal(covered.cover,1);assert.deepEqual(covered.rect,{x:0,y:0,w:1,h:1});
  run(s,C.heldSeconds[0]*.8);assert.ok(s.view().fault>.5,'it looks worse with time');
  run(s,C.heldSeconds[0]+C.restoreSeconds);
  assert.equal(done?.reason,'finished');assert.equal(s.view().done,true);assert.equal(s.view().cover,0);
});

test('a short press does nothing, and a long press always gives the picture back',()=>{
  let done=null;const s=createWindowTakeoverState({mediaId:'clouds',seed:.5,onDone:r=>{done=r;}});
  run(s,C.paneSeconds+C.growSeconds+1);
  for(let n=0;n<6;n++){run(s,C.longPressSeconds*.8,{held:true});run(s,.2);}
  assert.equal(s.view().phase,'held','tapping and short holds change nothing');
  run(s,C.longPressSeconds+.1,{held:true});
  assert.equal(s.view().phase,'restore');
  run(s,C.restoreSeconds+.1);
  assert.equal(done.reason,'long-press');
});

test('anything that matters more takes it back fast, at every stage',()=>{
  for(const seconds of [0,C.paneSeconds+1,C.paneSeconds+C.growSeconds+1]){
    let done=null;const s=createWindowTakeoverState({mediaId:'clouds',seed:.2,onDone:r=>{done=r;}});
    run(s,seconds);
    run(s,C.yieldSeconds+.1,{yieldNow:true});
    assert.equal(done?.reason,'yield',`at ${seconds}s`);
  }
});

test('the hard limit is under every other way out, and onDone fires once',()=>{
  let calls=0;const s=createWindowTakeoverState({mediaId:'clouds',seed:1,onDone:()=>{calls++;}});
  assert.ok(C.paneSeconds+C.growSeconds+C.heldSeconds[1]+C.restoreSeconds<=C.hardLimitSeconds);
  run(s,C.hardLimitSeconds+C.restoreSeconds+1);
  assert.equal(calls,1);assert.ok(s.view().elapsed<=C.hardLimitSeconds+C.restoreSeconds+.2);
  s.cancel('after');s.update(.1);s.restore('after');assert.equal(calls,1);
});

test('reduced dread sees the same picture and never loses the room',()=>{
  let done=null;const s=createWindowTakeoverState({mediaId:'clouds',mode:'calm',seed:.5,onDone:r=>{done=r;}});
  let biggest=0;for(let t=0;t<C.calmSeconds+C.restoreSeconds+1;t+=.05){const v=s.update(.05);biggest=Math.max(biggest,v.rect.w*v.rect.h,v.cover);assert.equal(v.prompt,false);assert.equal(v.fault,0);}
  assert.ok(biggest<.05,'it covers about 4% of the picture at most');
  assert.equal(done.reason,'finished');
});

test('reduced motion dissolves rather than travelling',()=>{
  const s=createWindowTakeoverState({mediaId:'clouds',reducedMotion:true,seed:.5});
  run(s,C.paneSeconds+.05);
  assert.equal(s.view().phase,'grow');assert.equal(s.view().cover,1,'no growth to watch');
  run(s,40);
  assert.equal(s.view().done,true);
});

function fakeDocument(){
  const element=()=>{const children=[];return{style:{},dataset:{},children,setAttribute(){},append(...c){children.push(...c);},remove(){this.removed=true;},querySelector(){return null;},set textContent(v){this.text=v;}};};
  const listeners=new Map(),root=element();
  return{root,listeners,createElement:element,querySelector:()=>root,addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
}
function host(options={}){
  const documentApi=fakeDocument(),frames=[];let clock=0;
  const takeover=createWindowTakeover({documentApi,frame:fn=>{frames.push(fn);return frames.length;},cancelFrame:()=>{},now:()=>clock,gamepads:()=>[],...options});
  const step=(seconds)=>{for(let t=0;t<seconds;t+=.05){clock+=50;const next=frames.splice(0);for(const fn of next)fn();}};
  return{takeover,documentApi,step};
}

test('the layer never takes the pointer or swallows a key',()=>{
  const{takeover,documentApi}=host();
  assert.equal(takeover.begin('clouds',{mode:'in-window'}),true);
  const layer=documentApi.root.children.at(-1);
  assert.match(layer.style.cssText,/pointer-events:none/);
  let stopped=false;
  documentApi.listeners.get('keydown')({key:'w',stopPropagation(){stopped=true;},preventDefault(){stopped=true;}});
  assert.equal(stopped,false);
});

test('begin reports false only when it truly cannot run, and tidies up on every way out',()=>{
  const{takeover,documentApi,step}=host();
  assert.equal(takeover.begin('not-a-real-asset'),false);
  let done=0;
  assert.equal(takeover.begin('clouds',{onDone:()=>{done++;}}),true);
  assert.equal(takeover.begin('clouds'),false,'one at a time');
  const layer=documentApi.root.children.at(-1);
  documentApi.listeners.get('keydown')({key:'e'});
  step(C.longPressSeconds+C.restoreSeconds+.3);
  assert.equal(done,1);assert.equal(layer.removed,true);assert.equal(takeover.active(),false);assert.equal(documentApi.listeners.size,0);
  assert.equal(takeover.begin('empty-field',{mode:'calm',onDone:()=>{done++;}}),true);
  takeover.cancel('test');assert.equal(done,2);assert.equal(takeover.active(),false);
});

test('a world that needs him takes the picture back',()=>{
  let urgent=false,done=null;
  const{takeover,step}=host({shouldYield:()=>urgent});
  takeover.begin('clouds',{onDone:r=>{done=r;}});
  step(C.paneSeconds+C.growSeconds+1);
  assert.equal(takeover.view().cover,1);
  urgent=true;step(C.yieldSeconds+.2);
  assert.equal(done.reason,'yield');
});

test('a native pane that refuses, or one that opens, leaves the same game behind it',async()=>{
  let hidden=0;
  const refused=host({showNativePane:async()=>false,hideNativePane:()=>{hidden++;}});
  refused.takeover.begin('clouds',{mode:'native'});await new Promise(r=>setTimeout(r,0));
  refused.step(C.paneSeconds+1);
  assert.equal(refused.takeover.active(),true);assert.equal(hidden,0,'nothing to take down');
  const opened=host({showNativePane:async()=>true,hideNativePane:()=>{hidden++;}});
  opened.takeover.begin('clouds',{mode:'native'});await new Promise(r=>setTimeout(r,0));
  opened.step(C.paneSeconds+.5);
  assert.equal(hidden,1,'the OS pane goes as the cover starts');
  opened.takeover.cancel('test');assert.equal(hidden,1);
});

test('the policy lets a pane show, never take input, never move the window',()=>{
  assert.equal(windowChoreographyPolicy(C.sceneId),'memory-takeover');
  const plan=compileTakeoverPanePlan({mediaId:'clouds'});
  assert.equal(plan.sceneId,C.sceneId);assert.equal(plan.surfaces.length,1);
  assert.equal(plan.surfaces[0].draggable,false,'it never takes the pointer');
  assert.ok(validateWindowCompositionPlan(plan).ok,JSON.stringify(validateWindowCompositionPlan(plan).errors));
  assert.equal(compileTakeoverPanePlan({mediaId:'not-real'}),null);
  assert.equal(compileTakeoverPanePlan({mediaId:'empty-field'}).surfaces[0].content.kind,'procedural');
});

test('no native pane without consent, in a browser, or over a fullscreen window',async()=>{
  const director=createWindowChoreographyDirector({documentApi:null,getEnabled:()=>false,getCompositionContext:()=>({introduced:true})});
  assert.equal(await director.showTakeoverPane('clouds'),false);
  const browser=createWindowChoreographyDirector({documentApi:null,getEnabled:()=>true,getCompositionContext:()=>({introduced:true})});
  assert.equal(await browser.showTakeoverPane('clouds'),false,'node has no Tauri runtime, like a browser build');
});

test('main only ever calls it through the one guarded entry, and nothing is gated on it',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.equal((main.match(/windowTakeover\.begin\(/g)||[]).length,1);
  assert.match(main,/function beginWindowTakeover\(mediaId,\{onDone=\(\)=>\{\}\}=\{\}\)/);
});
