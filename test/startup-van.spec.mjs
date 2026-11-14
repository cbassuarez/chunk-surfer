import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/startup-van.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const metadata={durationSeconds:3.4,stages:[{name:'arrival',atSeconds:0},{name:'brake',atSeconds:.95},
  {name:'settle',atSeconds:1.27},{name:'departure',atSeconds:1.55}],weather:{rain:true}};
const settle=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};

function fixture({reduced=false,hidden=false,fetchNever=false,fetchFails=false,metadataFails=false,playFails=false,posterReady=true,decodedFrames=true,size=12000}={}){
  const timers=new Map(),listeners=new Map(),mediaListeners=new Map(),posterListeners=new Map(),callbacks=new Map(),events=[],requests=[],revoked=[];
  let serial=0;
  const video={currentTime:0,paused:true,hidden:true,playbackRate:1,
    addEventListener:(type,fn)=>mediaListeners.set(type,fn),
    removeEventListener:type=>mediaListeners.delete(type),
    hasAttribute(name){return name in this;},
    setAttribute(name,value){this[name]=value;},
    removeAttribute(name){delete this[name];},
    play(){if(playFails)return Promise.reject(Error('Playback failed'));this.paused=false;return Promise.resolve();},
    pause(){this.paused=true;},load(){this.currentTime=0;},
  };
  if(decodedFrames){
    video.requestVideoFrameCallback=fn=>(callbacks.set(++serial,fn),serial);
    video.cancelVideoFrameCallback=id=>callbacks.delete(id);
  }
  const poster={hidden:true,complete:posterReady,naturalWidth:posterReady?128:0,
    addEventListener:(type,fn)=>posterListeners.set(type,fn),
    removeEventListener:type=>posterListeners.delete(type),
    setAttribute(name,value){this[name]=value;},hasAttribute(name){return name in this;},removeAttribute(name){delete this[name];},
    offset:16,getBoundingClientRect(){return{left:this.offset,right:this.offset+128};},
    parentElement:{getBoundingClientRect:()=>({left:0,right:128})},
    style:{setProperty(name,value){this[name]=value;},removeProperty(name){delete this[name];}},
  };
  const media={matches:reduced,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
  const window={AbortController,Blob,matchMedia:()=>media,
    getComputedStyle:element=>({transform:`matrix(1, 0, 0, 1, ${element.offset}, 0)`}),
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),dispatchEvent:event=>events.push(event),
    setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id),
    fetch(url,{signal}){
      requests.push({url,signal});
      if(url.endsWith('.json'))return Promise.resolve({ok:!metadataFails,json:()=>Promise.resolve(metadata)});
      if(fetchFails)return Promise.resolve({ok:false});
      if(fetchNever)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
      return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(size))});
    }};
  class MediaURL extends URL {
    static createObjectURL(blob){assert.equal(blob.type,'video/mp4');return 'blob:startup-van';}
    static revokeObjectURL(url){revoked.push(url);}
  }
  const document={baseURI:'https://game.invalid/nested/index.html',currentScript:{src:'https://game.invalid/nested/startup-van.js'},hidden,
    getElementById:id=>id==='startupVanVideo'?video:id==='startupVanPoster'?poster:null,
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
  runInNewContext(source,{window,document,URL:MediaURL});
  return{api:window.__chunkStartupVan,video,poster,timers,requests,events,revoked,listeners,mediaListeners,posterListeners,callbacks,
    playing(){mediaListeners.get('playing')();},
    frame(time){video.currentTime=time;for(const [id,fn]of [...callbacks]){callbacks.delete(id);fn(0,{mediaTime:time});}mediaListeners.get('timeupdate')?.();},
    fire(mediaEvent,event){mediaListeners.get(mediaEvent)?.(event);},
    posterExit(animationName){posterListeners.get('animationend')?.({animationName});},
    tick(delay){for(const [id,{fn,ms}] of [...timers])if(delay===undefined||delay===ms){timers.delete(id);fn();}},
    hide(value){document.hidden=value;listeners.get('visibilitychange')();},
  };
}

test('muted video drives in and out through repeated cycles and speeds up the empty ends and settle',async()=>{
  assert.match(html,/<video id="startupVanVideo" muted playsinline loop preload="auto" hidden>/);
  const f=fixture();
  assert.ok(f.requests.some(({url})=>url==='https://game.invalid/nested/app-icon/van-startup.mp4'));
  assert.equal(f.poster.hidden,true);
  await settle();f.playing();
  assert.equal(f.video.muted,true);assert.equal(f.video.src,'blob:startup-van');
  assert.equal(f.poster.hidden,true);
  for(let cycle=0;cycle<3;cycle++){
    for(const [time,rate,stage] of [[0,4,'arrival'],[.48,1,'arrival'],[1.05,1,'brake'],[1.31,4,'settle'],[1.68,1,'departure'],[2.72,4,'offscreen'],[3.33,4,'offscreen']]){
      f.frame(time);assert.equal(f.api.status().position,time);assert.equal(f.api.status().visualStage,stage);
      assert.equal(f.api.status().phase,'playing');assert.equal(f.video.playbackRate,rate);assert.equal(f.video.paused,false);
    }
  }
  assert.equal(f.events.length,0);
});

test('readiness cancels pending video and plays a decoded poster through the crop',async()=>{
  const f=fixture({fetchNever:true});let retired=0;
  assert.equal(f.api.canReveal(),true);assert.equal(f.api.reveal(()=>retired++),true);await settle();
  assert.equal(f.requests.at(-1).signal.aborted,true);assert.equal(f.video.src,undefined);
  assert.equal(f.api.status().phase,'departing');assert.equal(f.poster['data-departing'],'pass');assert.equal(retired,0);
  f.posterExit('startup-van-poster-pass');
  assert.equal(f.api.status().phase,'revealed');assert.equal(f.events.length,1);assert.equal(retired,1);
});

test('readiness gives the visible van its remaining drive, then retires media once',async()=>{
  const f=fixture(),audio=[];f.api.setAudio(event=>audio.push(event));
  let retired=0;
  await settle();f.playing();f.frame(2.2);assert.equal(f.api.reveal(()=>retired++),true);
  assert.equal(f.video.paused,false);assert.equal(f.video.currentTime,2.2);assert.equal(f.video.loop,true);
  assert.equal(f.video.playbackRate,1);assert.equal(f.video['data-departing'],'');
  assert.equal(f.video.hidden,false);assert.equal(f.api.status().elapsed,2.2);
  assert.equal(f.api.status().departure,'video');assert.equal(retired,0);
  assert.equal(audio.at(-1).reason,'revealed');
  f.frame(2.6);assert.equal(f.api.status().phase,'departing');
  f.frame(2.7);assert.equal(f.video.src,undefined);assert.deepEqual(f.revoked,['blob:startup-van']);
  assert.equal(f.callbacks.size,0);assert.equal(f.timers.size,0);assert.equal(retired,1);
  f.playing();assert.equal(f.api.status().phase,'revealed');
});

test('readiness between cycles preserves the offscreen seam and never starts a new pass',async()=>{
  for(const at of [0,.32,2.75,3.36]){
    const f=fixture();await settle();f.playing();f.frame(.45);f.frame(2.9);f.frame(at);
    assert.equal(f.api.reveal(),false);assert.equal(f.api.status().phase,'revealed');
    assert.equal(f.video.hidden,true);assert.equal(f.video.src,undefined);assert.equal(f.timers.size,0);
  }
  const absent=fixture({fetchNever:true,posterReady:false});assert.equal(absent.api.reveal(),false);
  assert.equal(absent.api.status().phase,'revealed');assert.equal(absent.timers.size,0);
});

test('readiness on the first visible paint handles the decoder clock running ahead of the callback',async()=>{
  const f=fixture();await settle();f.playing();f.frame(.324);f.video.currentTime=.405;
  assert.equal(f.api.reveal(),true);assert.equal(f.api.status().departure,'video');assert.equal(f.api.status().position,.405);
  f.fire('animationend',{animationName:'startup-van-exit'});assert.equal(f.api.status().phase,'revealed');
});

test('an unresponsive first frame falls back only while visible, then exits from its current position',async()=>{
  const f=fixture({fetchNever:true});assert.equal(f.timers.size,1);
  f.hide(true);f.tick(1200);assert.equal(f.api.status().phase,'loading');
  f.hide(false);f.tick(1200);await settle();
  assert.equal(f.api.status().phase,'finished');assert.equal(f.poster['data-repeating'],'');
  assert.equal(f.requests.at(-1).signal.aborted,true);
  f.poster.offset=-30;assert.equal(f.api.reveal(),true);
  assert.equal(f.poster['data-departing'],'exit');
  assert.equal(f.poster.style['--startup-van-translate'],'matrix(1, 0, 0, 1, -30, 0)');
  f.posterExit('startup-van-exit');assert.equal(f.api.status().phase,'revealed');
  assert.equal(f.poster.style['--startup-van-translate'],undefined);
  const offscreen=fixture({fetchNever:true});offscreen.tick(1200);offscreen.poster.offset=128;
  assert.equal(offscreen.api.reveal(),false);assert.equal(offscreen.api.status().phase,'revealed');
});

test('timeupdate covers decoders without video-frame callbacks and waiting has a bounded moving fallback',async()=>{
  const f=fixture({decodedFrames:false});await settle();f.playing();f.frame(.82);
  assert.equal(f.video.playbackRate,1);f.fire('waiting');f.frame(.9);f.tick(400);
  assert.equal(f.api.status().phase,'playing','a resumed frame cancels the stall');
  f.fire('waiting');f.fire('stalled');f.tick(400);
  assert.equal(f.video.src,undefined);assert.equal(f.poster['data-repeating'],'');
  assert.equal(f.api.reveal(),true);assert.equal(f.poster['data-departing'],'exit');
  f.tick(480);assert.equal(f.api.status().phase,'revealed');assert.equal(f.timers.size,0);
  const late=fixture();await settle();late.playing();late.frame(.8);late.api.reveal();late.fire('waiting');late.tick(400);
  assert.equal(late.api.status().phase,'departing','the CSS exit moves independently of the stopped decoder');
  late.fire('animationend',{animationName:'startup-van-exit'});
  assert.equal(late.api.status().phase,'revealed');assert.equal(late.events[0].detail.reason,'revealed');
});

test('optional sound stops after one pass even while the picture loops',async()=>{
  const f=fixture(),audio=[];f.api.setAudio(event=>audio.push(event));
  await settle();f.playing();f.video.currentTime=.8;f.tick();
  f.video.currentTime=.1;f.tick();
  assert.equal(audio.at(-1).progress,1);assert.equal(f.timers.size,0);
  assert.equal(f.api.status().phase,'playing');assert.equal(f.video.paused,false);
  f.api.reveal();assert.equal(audio.at(-1).type,'stop');
});

test('hidden documents pause playback and resume it in place',async()=>{
  const f=fixture({hidden:true});
  assert.equal(f.requests.length,0);f.hide(false);await settle();f.playing();
  f.video.currentTime=1.1;f.hide(true);assert.equal(f.video.paused,true);
  f.hide(false);assert.equal(f.video.paused,false);assert.equal(f.video.currentTime,1.1);
  assert.equal(f.api.status().stage,'brake');
});

test('Reduced Motion, missing video, oversized video and denied playback preserve the still',async()=>{
  for(const options of[{reduced:true},{fetchFails:true},{playFails:true},{size:140000}]){
    const f=fixture(options);await settle();
    assert.equal(f.api.status().phase,'finished');
    assert.equal(f.poster.hidden,false);assert.equal(f.video.paused,true);
  }
  const saved=fixture();await settle();saved.playing();saved.api.setVisualSettings({reducedMotion:true});
  assert.equal(saved.api.status().phase,'finished');assert.equal(saved.poster.hidden,false);
  assert.deepEqual(saved.revoked,['blob:startup-van']);
});

test('missing sound metadata leaves the picture running and disposal cancels media',async()=>{
  const f=fixture({metadataFails:true});await settle();f.playing();
  assert.equal(f.api.status().phase,'playing');assert.equal(f.video.paused,false);
  f.api.reveal();f.api.dispose();
  assert.equal(f.api.status().phase,'disposed');assert.equal(f.video.src,undefined);
  assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.mediaListeners.size,0);
});
