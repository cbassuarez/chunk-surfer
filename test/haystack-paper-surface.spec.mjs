import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {HAYSTACK_PAPER,HAYSTACK_PAPER_FRAGMENT,HAYSTACK_PAPER_SAMPLE_GLSL,haystackPaperAddress,paintHaystackPaper,haystackPaperFallbackPixels,createHaystackPaperSurface} from '../src/render/haystack-paper.js';
import {WINDOW_SURFACE_LOOK_GLSL} from '../src/render/window-surface-look.js';
import {createWindowTakeover} from '../src/game/window-takeover.js';
import {compileTakeoverPanePlan} from '../src/platform/window-choreography.js';
import {validateWindowCompositionPlan} from '../src/platform/window-composition.js';

const settled=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function bitmap(width=16,height=16){const pixels=new Uint8ClampedArray(width*height*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=pixels[i+1]=pixels[i+2]=128;pixels[i+3]=255;}pixels[0]=pixels[1]=pixels[2]=8;return{width,height,pixels};}
function drawingContext(){return{font:'',calls:[],measureText(text){const size=parseFloat(this.font),w=Array.from(text).length*size*.9;return{width:w,actualBoundingBoxLeft:1,actualBoundingBoxRight:w,actualBoundingBoxAscent:size*.8,actualBoundingBoxDescent:size*.2};},fillText(text,x,y){this.calls.push({text,x,y,font:this.font,width:this.measureText(text).width});},fillRect(){}};}
function fakeDocument(){
 const listeners=new Map(),contexts=[];
 const element=tag=>{const children=[];const node={tagName:tag,style:{},dataset:{},children,setAttribute(){},append(...c){children.push(...c);},remove(){this.removed=true;},querySelector(){return null;},getBoundingClientRect(){return{left:0,top:0,width:512,height:512};},set textContent(value){this.text=value;}};
  if(tag==='canvas'){const c={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(data,x,y){this.output={data,x,y};}};contexts.push(c);node.getContext=kind=>kind==='2d'?c:null;}
  return node;};
 const root=element('div');return{root,listeners,contexts,defaultView:{devicePixelRatio:1},createElement:element,querySelector:()=>root,addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}};
}
function host(options={}){
 const documentApi=fakeDocument(),frames=new Map();let clock=0,serial=0;
 const takeover=createWindowTakeover({documentApi,frame:fn=>{frames.set(++serial,fn);return serial;},cancelFrame:id=>frames.delete(id),now:()=>clock,gamepads:()=>[],...options});
 const step=seconds=>{for(let t=0;t<seconds;t+=.05){clock+=50;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn();}};
 return{takeover,documentApi,step};
}
function paperFactory(preparation){const instances=[];return{instances,create:({documentApi,name})=>{const value={element:documentApi.createElement('canvas'),name,ready:preparation.promise,paintCount:0,disposeCount:0,paint(){this.paintCount++;},dispose(){this.disposeCount++;this.element.remove();}};instances.push(value);return value;}};}

test('the private address is bounded and cannot add hidden controls or persistent metadata',()=>{
 assert.equal(haystackPaperAddress(' \u202eA\u0000da\n\t Lovelace\u2069 '),'A da Lovelace');
 assert.equal(haystackPaperAddress(''),'you');
 const value=haystackPaperAddress('𐐀'.repeat(50));assert.equal([...value].length,32);assert.equal(value.includes('\ufffd'),false);
});

test('native and in-game paper have one authored physical print, with an individually fitted header',()=>{
 const colour=drawingContext(),mask=drawingContext();paintHaystackPaper(colour,mask,'W'.repeat(32));
 assert.deepEqual(colour.calls.map(c=>c.text),['W'.repeat(32)+'\u2009—',...HAYSTACK_PAPER.lines]);
 assert.deepEqual(mask.calls,colour.calls,'coverage and colour use identical physical lettering');
 assert.ok(colour.calls[0].width<=432);assert.ok(parseFloat(colour.calls[0].font)<27,'wide names fit uniformly instead of clipping');
 assert.ok(colour.calls.every(c=>c.font.includes('World Lettering Roman')),'no UI/font fallback becomes permanent ink');
 assert.ok(HAYSTACK_PAPER_FRAGMENT.includes(WINDOW_SURFACE_LOOK_GLSL));
 assert.ok(HAYSTACK_PAPER_FRAGMENT.includes(HAYSTACK_PAPER_SAMPLE_GLSL));
 const native=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
 assert.match(native,/import \{bakeHaystackPaper,HAYSTACK_PAPER_SAMPLE_GLSL\}/);
 assert.match(native,/paperEnabled>\.5\?haystackPaperAt\(paperTexture,q\)/);
 assert.match(native,/if\(!prepared\|\|!await prepared/,'native acceptance requires the actual paper upload, not its placeholder');
 const plan=compileTakeoverPanePlan({mediaId:HAYSTACK_PAPER.id,name:'Fixture'});
 assert.equal(plan.surfaces[0].content.kind,'procedural');assert.equal(plan.surfaces[0].content.preset,HAYSTACK_PAPER.id);
 assert.equal(validateWindowCompositionPlan(plan).ok,true);
});

test('last-resort raster output keeps the actual pigment and stable dither rather than a generic field',()=>{
 const source=bitmap(),first=haystackPaperFallbackPixels(source),second=haystackPaperFallbackPixels(source);
 assert.deepEqual(first,second);assert.equal(first.length,source.pixels.length);
 const colours=new Set();for(let i=4;i<first.length;i+=4){assert.equal(first[i+3],255);colours.add([...first.slice(i,i+3)].join(','));}
 assert.ok(colours.size>1,'stationary midtones still carry quantization dither');
 assert.ok(first[0]<first[8]&&first[1]<first[9]&&first[2]<first[10],'the actual dark lettering survives the fallback grade');
 assert.notDeepEqual([...first.slice(4,7)],[124,138,84],'the original generic green horizon is not substituted');
});

test('browser canvas waits for authored pixels; disposal prevents a late private bake from painting',async()=>{
 const documentApi=fakeDocument(),preparation=deferred();
 const surface=createHaystackPaperSurface({documentApi,name:'Fixture',bake:()=>preparation.promise});
 assert.equal(surface.paint(),false);assert.equal(surface.element.dataset.paperReady,undefined);
 preparation.resolve(bitmap());assert.equal(await surface.ready,true);
 assert.ok(documentApi.contexts[0].output);assert.equal(surface.element.dataset.contentId,'paper-close');
 assert.equal(surface.element.dataset.paperReady,'true');assert.equal(surface.paint(),true);
 assert.deepEqual(documentApi.contexts[0].output.data.data,haystackPaperFallbackPixels(bitmap()));
 assert.equal(JSON.stringify(surface.element.dataset).includes('Fixture'),false);
 surface.dispose();assert.equal(surface.paint(),false);
 const late=deferred(),stale=createHaystackPaperSurface({documentApi,name:'Fixture',bake:()=>late.promise});
 stale.dispose();late.resolve(bitmap());assert.equal(await stale.ready,false);assert.equal(documentApi.contexts.at(-1).output,undefined);
});

test('paper-close is recognized without a catalogue asset and consumes exposure only after preparation',async()=>{
 const preparation=deferred(),factory=paperFactory(preparation);let shown=0,result=null;
 const h=host({createPaperSurface:factory.create});
 assert.equal(h.takeover.begin('paper-close',{name:'Fixture',onShown:()=>shown++,onDone:value=>result=value}),true);
 assert.equal(h.takeover.view().preparing,true);h.step(2);assert.equal(shown,0);assert.equal(h.takeover.view().elapsed,0);
 assert.equal(h.documentApi.root.children.at(-1).children[0].style.opacity,'0');
 preparation.resolve(true);await settled();assert.equal(shown,1);assert.equal(h.takeover.view().preparing,false);
 h.step(1);assert.equal(shown,1);assert.equal(JSON.stringify(h.takeover.view()).includes('Fixture'),false);
 h.takeover.cancel('fixture');assert.equal(result.shown,true);assert.equal(factory.instances[0].disposeCount,1);
});

test('record/listen/playback or any protection can cancel unshown preparation without consuming it',async()=>{
 for(const protection of ['recording','listening','playback','pause','focus-loss']){
  const preparation=deferred(),factory=paperFactory(preparation);let blocked=false,shown=0,result=null;
  const h=host({shouldYield:()=>blocked,createPaperSurface:factory.create});
  blocked=true;assert.equal(h.takeover.begin('paper-close'),false);assert.equal(factory.instances.length,0);
  blocked=false;assert.equal(h.takeover.begin('paper-close',{onShown:()=>shown++,onDone:r=>result=r}),true);
  blocked=true;h.step(.05);assert.equal(result.reason,'yield',protection);assert.equal(result.shown,false);assert.equal(h.takeover.active(),false);
  preparation.resolve(true);await settled();assert.equal(shown,0);assert.equal(factory.instances[0].disposeCount,1);
 }
});

test('a refused native pane exposes the exact prepared in-game paper once, without a replacement asset',async()=>{
 const preparation=deferred(),factory=paperFactory(preparation);let shown=0,nativeCalls=0,hidden=0,received;
 const h=host({createPaperSurface:factory.create,showNativePane:async(id,options)=>{nativeCalls++;received={id,options};return false;},hideNativePane:()=>hidden++});
 h.takeover.begin('paper-close',{mode:'native',name:'Fixture',onShown:()=>shown++});assert.equal(nativeCalls,0);
 preparation.resolve(true);await settled();
 assert.equal(nativeCalls,1);assert.equal(received.id,'paper-close');assert.equal(received.options.name,'Fixture');
 assert.equal(shown,1);assert.equal(h.takeover.view().preparing,false);assert.equal(factory.instances.length,1);
 h.takeover.cancel();assert.equal(hidden,0);
});

test('a late native acknowledgement cannot appear after cancellation or hide a newer owner',async()=>{
 const preparation=deferred(),native=deferred(),factory=paperFactory(preparation);let shown=0,hidden=0;
 const h=host({createPaperSurface:factory.create,showNativePane:()=>native.promise,hideNativePane:()=>hidden++});
 h.takeover.begin('paper-close',{mode:'native',onShown:()=>shown++});preparation.resolve(true);await settled();
 assert.equal(h.takeover.view().preparing,true);h.takeover.cancel('yield');
 assert.equal(h.takeover.active(),true,'late native work retains the cancellation fence');
 assert.equal(h.takeover.begin('clouds'),false,'a newer owner must not reuse the pending native surface');
 native.resolve(true);await settled();assert.equal(hidden,1);assert.equal(shown,0);assert.equal(h.takeover.active(),false);
 assert.equal(h.takeover.begin('clouds'),true);h.takeover.cancel();assert.equal(hidden,1);
});

test('failed or stalled paper preparation ends unshown, and a retry can succeed',async()=>{
 const failed=deferred(),factory=paperFactory(failed);let shown=0,result=null;
 const h=host({createPaperSurface:factory.create});
 h.takeover.begin('paper-close',{onShown:()=>shown++,onDone:r=>result=r});failed.reject(Error('fixture bake unavailable'));await settled();
 assert.equal(result.reason,'media-unavailable');assert.equal(result.shown,false);assert.equal(h.takeover.active(),false);assert.equal(shown,0);
 const stalled=deferred(),second=paperFactory(stalled);const timeout=host({createPaperSurface:second.create});let timed=null;
 timeout.takeover.begin('paper-close',{onDone:r=>timed=r});timeout.step(8.1);
 assert.equal(timed.reason,'media-unavailable');assert.equal(timed.shown,false);assert.equal(second.instances[0].disposeCount,1);
 stalled.resolve(true);await settled();assert.equal(timeout.takeover.active(),false);
});

// Isolated module graph: paths.js samples the native environment at import.
// This exercises the real director's refused-native branch, without an OS pane.
test('the native-only director failure restores its transaction and never starts a second browser host',()=>{
 const moduleUrl=new URL('../src/platform/window-choreography.js',import.meta.url).href;
 const script=`globalThis.window={__TAURI_INTERNALS__:{}};
 const {createWindowChoreographyDirector}=await import(${JSON.stringify(moduleUrl)});
 const events=[],plans=[],calls=[];
 const director=createWindowChoreographyDirector({documentApi:null,
 runtimeApi:{invoke:async(command)=>{calls.push(command);return command==='chunk_window_metrics'?{fullscreen:false,native_fullscreen:false,borderless_fullscreen:false}:true;}},
 effects:{showComposition:async(plan)=>{plans.push(plan);return false;},hideComposition:async()=>true,hidePanes:async()=>true},
 getCompositionContext:()=>({introduced:true}),getSourceIdentity:()=>({operatorName:'Fixture',permitted:false}),onState:event=>events.push(event)});
 const result=await director.showTakeoverPane('paper-close');
 process.stdout.write(JSON.stringify({result,calls,simulated:events.filter(e=>e.simulated).length,name:plans[0]?.surfaces[0].content.name||null,transaction:director.debug().transaction}));`;
 const value=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'}));
 assert.equal(value.result,false);assert.equal(value.simulated,0);assert.equal(value.name,null,'identity permission remains authoritative');
 assert.equal(value.transaction,null);assert.ok(value.calls.includes('chunk_window_choreography_restore'));
});

test('a late native paper acknowledgement and its cleanup cannot restore a newer battle composition',()=>{
 const moduleUrl=new URL('../src/platform/window-choreography.js',import.meta.url).href;
 const script=`globalThis.window={__TAURI_INTERNALS__:{}};
 const {createWindowChoreographyDirector}=await import(${JSON.stringify(moduleUrl)});
 const calls=[];let acknowledge,entered;
 const assigned=new Promise(resolve=>entered=resolve),pending=new Promise(resolve=>acknowledge=resolve);
 const director=createWindowChoreographyDirector({documentApi:null,waitFn:async()=>{},
 runtimeApi:{invoke:async(command)=>{calls.push(command);return command==='chunk_window_metrics'?{fullscreen:false,native_fullscreen:false,borderless_fullscreen:false}:true;}},
 effects:{showComposition:async()=>{entered();return pending;},showPanes:async()=>true,hideComposition:async()=>true,hidePanes:async()=>true},
 getCompositionContext:()=>({introduced:true})});
 const paper=director.showTakeoverPane('paper-close');await assigned;
 director.prepareBattle({battleId:'natatorium'});
 const battle=director.fireballCast({battleId:'natatorium'});
 const firstCleanup=await director.hideTakeoverPane();
 acknowledge(true);const paperResult=await paper;await battle;
 const lateCleanup=await director.hideTakeoverPane(),snapshot=director.debug();
 process.stdout.write(JSON.stringify({firstCleanup,lateCleanup,paperResult,battle:snapshot.battle,transaction:snapshot.transaction,restores:calls.filter(c=>c==='chunk_window_choreography_restore').length,executed:calls.includes('chunk_window_choreography_execute')}));`;
 const value=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'}));
 assert.equal(value.firstCleanup,false);assert.equal(value.lateCleanup,false);assert.equal(value.paperResult,false);
 assert.equal(value.restores,0,'neither early nor late paper cleanup restores the battle transaction');
 assert.equal(value.battle.battleId,'natatorium');assert.equal(value.battle.breached,true);
 assert.ok(value.transaction);assert.equal(value.executed,true,'the actual subsequent battle plan still executes');
});

test('narrow native cleanup restores its own exact transaction once',()=>{
 const moduleUrl=new URL('../src/platform/window-choreography.js',import.meta.url).href;
 const script=`globalThis.window={__TAURI_INTERNALS__:{}};
 const {createWindowChoreographyDirector}=await import(${JSON.stringify(moduleUrl)});const calls=[];
 const director=createWindowChoreographyDirector({documentApi:null,
 runtimeApi:{invoke:async(command)=>{calls.push(command);return command==='chunk_window_metrics'?{fullscreen:false,native_fullscreen:false,borderless_fullscreen:false}:true;}},
 effects:{showComposition:async()=>true,hideComposition:async()=>true,hidePanes:async()=>true},getCompositionContext:()=>({introduced:true})});
 const shown=await director.showTakeoverPane('paper-close'),first=await director.hideTakeoverPane(),second=await director.hideTakeoverPane();
 process.stdout.write(JSON.stringify({shown,first,second,transaction:director.debug().transaction,restores:calls.filter(c=>c==='chunk_window_choreography_restore').length}));`;
 const value=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'}));
 assert.equal(value.shown,true);assert.equal(value.first,true);assert.equal(value.second,false);assert.equal(value.restores,1);assert.equal(value.transaction,null);
});

test('paper cleanup also refuses a later unrelated composition that reuses the exact native transaction',()=>{
 const moduleUrl=new URL('../src/platform/window-choreography.js',import.meta.url).href;
 const script=`globalThis.window={__TAURI_INTERNALS__:{}};
 const {createWindowChoreographyDirector,compileTakeoverPanePlan}=await import(${JSON.stringify(moduleUrl)});const calls=[];let activeCue=null;
 const director=createWindowChoreographyDirector({documentApi:null,
 runtimeApi:{invoke:async(command)=>{calls.push(command);return command==='chunk_window_metrics'?{fullscreen:false,native_fullscreen:false,borderless_fullscreen:false}:true;}},
 effects:{showComposition:async(plan)=>{activeCue=plan.cueId;return true;},hideComposition:async()=>true,hidePanes:async()=>true,debug:()=>({activeCompositionCue:activeCue})},getCompositionContext:()=>({introduced:true})});
 const shown=await director.showTakeoverPane('paper-close'),original=director.debug().transaction;
 const next=await director.runPlan(compileTakeoverPanePlan({mediaId:'clouds'}));
 const sameTransaction=director.debug().transaction.token===original.token,hidden=await director.hideTakeoverPane();
 process.stdout.write(JSON.stringify({shown,nextNative:next.native,sameTransaction,hidden,transaction:director.debug().transaction,restores:calls.filter(c=>c==='chunk_window_choreography_restore').length}));`;
 const value=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'}));
 assert.equal(value.shown,true);assert.equal(value.nextNative,true);assert.equal(value.sameTransaction,true);
 assert.equal(value.hidden,false);assert.equal(value.restores,0);assert.ok(value.transaction,'same token alone does not grant ownership over a replacement composition');
});
