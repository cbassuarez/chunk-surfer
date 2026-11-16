import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/startup-van.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const metadata={motionVersion:'albion-maneuver-1',durationSeconds:3.4,frameCount:84,columns:8,rows:11,cell:128,atlas:'van-startup.png',weather:{rain:true},motionFrames:Array.from({length:84},()=>({speed:1,slipping:false}))};
function fixture({reduced=false,fetchNever=false,fetchDeferred=false,fetchFails=false,imageFails=false,width=1024,nativeElapsed=null,nativeLatency=0,nativeReadyAt=null,version=metadata.motionVersion}={}){
 let ms=0,serial=0;
 let resolveFetch=null;
 const timers=new Map(),frames=new Map(),listeners=new Map(),events=[],requests=[],draws=[],calls=[];
 const canvas={hidden:true,getContext(kind){assert.equal(kind,'2d');return{clearRect(){},drawImage(...args){draws.push(args.slice(1));}};}};
 const poster={hidden:true},media={matches:reduced,addEventListener:(type,fn)=>listeners.set('media:'+type,fn),removeEventListener:type=>listeners.delete('media:'+type)};
 const window={performance:{now:()=>ms},AbortController,
  Image:class{constructor(){this.naturalWidth=width;this.naturalHeight=1408;}set src(value){this.value=value;if(value)queueMicrotask(()=>imageFails?this.onerror?.():this.onload?.());}},
  matchMedia:()=>media,requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout(fn,delay){timers.set(++serial,{fn,delay});return serial;},clearTimeout:id=>timers.delete(id),
  fetch(url,{signal}){requests.push({url,signal});if(fetchNever)return new Promise(()=>{});if(fetchDeferred)return new Promise(resolve=>{resolveFetch=()=>resolve({ok:true,json:async()=>metadata});});return Promise.resolve({ok:!fetchFails,json:async()=>metadata});},
  addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),dispatchEvent:event=>events.push(event),
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 if(nativeElapsed!==null)window.__TAURI_INTERNALS__={invoke(name){calls.push(name);if(calls.length===1)ms+=nativeLatency;return Promise.resolve({motionVersion:version,elapsed:nativeElapsed+ms/1000,readyAt:nativeReadyAt});}};
 const document={hidden:false,baseURI:'https://game.invalid/index.html',currentScript:{src:'https://game.invalid/startup-van.js'},
  getElementById:id=>id==='startupVanCanvas'?canvas:id==='startupVanPoster'?poster:null,
  addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
 runInNewContext(source,{window,document,URL,Promise,Number});
 return{api:window.__chunkStartupVan,resolveFetch:()=>resolveFetch(),canvas,poster,frames,timers,draws,events,requests,calls,listeners,
  frame(at){ms=at*1000;for(const[id,fn]of [...frames]){frames.delete(id);fn(ms);}},
  tick(delay){for(const[id,item]of [...timers])if(item.delay===delay){timers.delete(id);item.fn();}},
  hide(value){document.hidden=value;listeners.get('visibilitychange')();},
  focus(value){listeners.get(value?'focus':'blur')();}};
}
test('a decoded atlas paints the authored cells once and holds without a busy idle loop',async()=>{
 const f=fixture();await settle();f.frame(.5);assert.equal(f.api.status().phase,'playing');assert.equal(f.api.status().frame,12);
 assert.deepEqual(f.draws.at(-1),[512,128,128,128,0,0,128,128]);
 f.frame(2);assert.equal(f.api.status().phase,'holding');assert.equal(f.api.status().position,1.94);assert.equal(f.frames.size,0);
 assert.equal(f.poster.hidden,true);assert.equal(f.api.status().slipping,false);
 assert.equal(f.events[0].detail.reason,'settled');
});
test('readiness during arrival immediately retires artwork, aborts pending work and never holds input',async()=>{
 for(const options of[{}, {fetchNever:true}]){const f=fixture(options);await settle();f.frame(.9);let retired=0;
  assert.equal(f.api.canReveal(),true);assert.equal(f.api.reveal(()=>retired++),false);
  assert.equal(f.api.status().readyAt,.9);
  assert.equal(f.api.status().phase,'revealed');assert.equal(f.canvas.hidden,true);assert.equal(f.poster.hidden,true);
  assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(retired,0);
 }
});
test('a ready settled vehicle continues forward while input is already live, then releases resources once',async()=>{
 const f=fixture();await settle();f.frame(2.1);let retired=0;
 assert.equal(f.api.reveal(()=>retired++),true);assert.equal(f.api.status().departure,'atlas');
 f.frame(2.6);assert.ok(Math.abs(f.api.status().position-2.44)<1e-10);
 f.frame(3.6);assert.equal(f.api.status().phase,'revealed');assert.equal(retired,1);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
 f.api.finish();assert.equal(retired,1);
});
test('the departure has a bounded timeout even if browser painting stops',async()=>{
 const f=fixture();await settle();f.frame(2);let retired=0;f.api.reveal(()=>retired++);f.tick(1580);
 assert.equal(f.api.status().phase,'revealed');assert.equal(retired,1);
});
test('native elapsed time joins a late webview without restarting, and rejects a different motion version',async()=>{
 const late=fixture({nativeElapsed:1.1});await settle();late.frame(0);
 assert.equal(late.api.status().clock,'native');assert.equal(late.api.status().position,1.1);assert.equal(late.api.status().frame,26);
 const held=fixture({nativeElapsed:3});await settle();held.frame(0);assert.equal(held.api.status().phase,'holding');assert.equal(held.api.status().position,1.94);
 held.api.reveal();assert.ok(held.calls.includes('chunk_launch_animation_ready'));
 const mismatch=fixture({nativeElapsed:3,version:'wrong'});await settle();mismatch.frame(.2);assert.equal(mismatch.api.status().clock,'web');assert.equal(mismatch.api.status().position,.2);
});
test('visibility and focus suspend painting but never pause the shared clock or replay missed frames',async()=>{
 const f=fixture();await settle();f.frame(.4);f.hide(true);assert.equal(f.frames.size,0);
 f.frame(1.3);f.hide(false);await settle();f.frame(1.4);assert.equal(f.api.status().position,1.4);
 f.focus(false);assert.equal(f.frames.size,0);f.frame(2.3);f.focus(true);await settle();f.frame(2.4);
 assert.equal(f.api.status().phase,'holding');assert.equal(f.api.status().position,1.94);
 f.api.reveal();f.focus(false);assert.equal(f.api.status().phase,'revealed');
});
test('a slow initial clock response is discarded and a fresh bounded sample refines the launch offset',async()=>{
 const f=fixture({nativeElapsed:1.1,nativeLatency:150});await settle();f.frame(.15);
 assert.ok(f.calls.filter(name=>name==='chunk_launch_animation_state').length>=2);
 assert.equal(f.api.status().clock,'native');assert.equal(f.api.status().clockUncertaintyMs,0);
 assert.ok(Math.abs(f.api.status().position-1.25)<1e-10);
});
test('a late replacement webview never replays a launch that was already ready',async()=>{
 const f=fixture({nativeElapsed:3,nativeReadyAt:2.1});await settle();f.frame(0);
 assert.equal(f.api.status().phase,'revealed');assert.equal(f.api.status().readyAt,2.1);
 assert.equal(f.api.reveal(),false);assert.equal(f.draws.length,0);assert.equal(f.frames.size,0);
});
test('decode failure, incorrect dimensions and timeout retain a stationary still until readiness',async()=>{
 for(const options of[{fetchFails:true},{imageFails:true},{width:4},{fetchNever:true}]){
  const f=fixture(options);await settle();if(options.fetchNever){f.tick(1500);assert.equal(f.api.status().phase,'loading');assert.equal(f.poster.hidden,false);f.tick(8000);}
  assert.equal(f.api.status().phase,'finished');assert.equal(f.poster.hidden,false);assert.equal(f.draws.length,0);
  assert.equal(f.api.reveal(),false);assert.equal(f.poster.hidden,true);assert.equal(f.timers.size,0);
 }
});
test('a slow atlas shows the still, keeps loading, and plays its arrival from the first frame',async()=>{
 const f=fixture({fetchDeferred:true});await settle();f.frame(1.5);f.tick(1500);
 assert.equal(f.api.status().phase,'loading');assert.equal(f.poster.hidden,false);assert.equal(f.requests[0].signal.aborted,false);
 f.frame(2.5);f.resolveFetch();await settle();f.frame(2.5);
 assert.equal(f.api.status().phase,'playing');assert.equal(f.api.status().position,0);assert.equal(f.poster.hidden,true);assert.equal(f.api.status().error,null);
 f.frame(3);assert.equal(f.api.status().position,.5);assert.equal(f.timers.size,0);
 f.frame(4.5);assert.equal(f.api.status().phase,'holding');assert.equal(f.api.reveal(),true);
});
test('a delayed atlas joins the native clock without replaying an arrival already shown in the Dock',async()=>{
 const f=fixture({fetchDeferred:true,nativeElapsed:.4});await settle();
 f.frame(1.5);f.tick(1500);f.frame(2.5);f.resolveFetch();await settle();f.frame(2.5);
 assert.equal(f.api.status().clock,'native');assert.equal(f.api.status().launchElapsed,2.9);
 assert.equal(f.api.status().phase,'holding');assert.equal(f.api.status().position,1.94);
 assert.equal(f.api.status().frame,47);assert.equal(f.frames.size,0);
});
test('Reduced Motion allocates no atlas and live settings cancel playback without restarting',async()=>{
 const still=fixture({reduced:true});assert.equal(still.requests.length,0);assert.equal(still.poster.hidden,false);
 const f=fixture();await settle();f.frame(.4);f.api.setVisualSettings({reducedMotion:true});
 assert.equal(f.api.status().phase,'finished');assert.equal(f.poster.hidden,false);assert.equal(f.frames.size,0);
 f.api.setVisualSettings({reducedMotion:false});assert.equal(f.api.status().phase,'finished');
});
test('audio joins current motion, has no tyre slip, stops at settling, and disposal clears every listener',async()=>{
 const f=fixture(),audio=[];await settle();f.frame(.5);f.api.setAudio(event=>audio.push(event));
 assert.equal(audio.at(-1).position,.5);assert.equal(audio.at(-1).slipping,false);
 f.frame(2);assert.equal(audio.at(-1).type,'stop');f.api.dispose();assert.equal(f.listeners.size,0);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});
test('the player contains neither a media-decoder dependency nor a translated poster/video',()=>{
 assert.match(html,/<canvas id="startupVanCanvas" width="128" height="128" hidden>/);
 assert.doesNotMatch(source,/requestVideoFrameCallback|video\.play|\.mp4|data-repeating|data-departing|translateX/);
 assert.doesNotMatch(html,/startup-van-(?:poster-pass|exit)|<video id="startupVanVideo"/);
});
