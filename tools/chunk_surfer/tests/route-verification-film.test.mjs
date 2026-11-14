import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {startRouteFilm,stopRouteFilm} from '../route-verification-film.mjs';
function fixture({withAudio=true,constructorFails=false,badHeader=false}={}){
 const stats={tap:0,disposed:0,drawn:[],cancelled:0,recorders:[]};let clock=1000;
 const track=kind=>({kind,readyState:'live',stops:0,stop(){this.stops++;this.readyState='ended';}}),video=track('video'),audio=track('audio');
 class Stream{constructor(rows=[]){this.rows=rows;}addTrack(t){this.rows.push(t);}getTracks(){return this.rows;}getVideoTracks(){return this.rows.filter(t=>t.kind==='video');}getAudioTracks(){return this.rows.filter(t=>t.kind==='audio');}}
 const wrap={style:{zIndex:'auto'},querySelectorAll:()=>sources},parent={parentElement:wrap,style:{zIndex:'0'}},hidden={parentElement:wrap,style:{display:'none'}};
 const layer=(id,z,parentElement=parent)=>({id,className:id,width:640,height:400,parentElement,style:{zIndex:String(z)},getBoundingClientRect:()=>({left:0,top:0,right:640,bottom:400,width:640,height:400})});
 const sources=[layer('world',0),layer('text',3),layer('glass',1),layer('hidden',5,hidden)];
 const painter={fillRect(){},drawImage(c){stats.drawn.push(c.id);}};
 const canvas={width:0,height:0,getContext:()=>painter,captureStream:fps=>{assert.equal(fps,24);return new Stream([video]);}};
 class Recorder{static isTypeSupported=t=>t==='video/webm;codecs=vp8,opus';constructor(stream,options){if(constructorFails)throw Error('constructor failed');this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';stats.recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob([Uint8Array.from(badHeader?[0,0,0,0]:[0x1a,0x45,0xdf,0xa3,0x80])],{type:this.mimeType})});this.onstop?.();});}}
 class Reader{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result=`data:${blob.type};base64,${Buffer.from(b).toString('base64')}`;this.onload?.();},e=>this.onerror?.(e));}}
 const sandbox={window:{__probe:{stationFieldCaptureAudio(){stats.tap++;return withAudio?{stream:new Stream([audio]),dispose(){stats.disposed++;audio.stop();}}:null;}}},document:{querySelector:selector=>selector==='#wrap'?wrap:null,createElement:()=>canvas},
  innerWidth:640,innerHeight:400,MediaRecorder:Recorder,FileReader:Reader,Blob,setTimeout,clearTimeout,performance:{now:()=>clock},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>stats.cancelled++,
  getComputedStyle:e=>({display:'block',visibility:'visible',opacity:'1',zIndex:'auto',mixBlendMode:'normal',filter:'none',...e.style})};
 vm.createContext(sandbox);return{stats,video,audio,sandbox,time:v=>clock=v,page:{evaluate:async fn=>vm.runInContext(`(${fn.toString()})()`,sandbox)}};
}
async function temporary(fn){const dir=await mkdtemp(join(tmpdir(),'route-film-helper-'));try{await fn(join(dir,'route.webm'));}finally{await rm(dir,{recursive:true,force:true});}}
test('visible final world and text canvases follow actual z order and output audio is disposed once',()=>temporary(async file=>{
 const h=fixture(),started=await startRouteFilm(h.page);assert.deepEqual(Array.from(started.layers,r=>r.id),['world','glass','text']);assert.deepEqual(h.stats.drawn,['world','glass','text']);assert.equal(started.audioTracks,1);assert.equal(started.microphone,false);assert.match(started.audioSource,/post-master/);
 await assert.rejects(startRouteFilm(h.page),/already owns/);assert.equal(h.stats.tap,1);h.time(1600);const stopped=await stopRouteFilm(h.page,file),bytes=await readFile(file);assert.equal(bytes.subarray(0,4).toString('hex'),'1a45dfa3');assert.equal(stopped.bytes,bytes.length);assert.equal(stopped.seconds,.6);assert.equal(stopped.ebml,true);assert.equal(h.stats.disposed,1);assert.equal(h.video.stops,1);assert.equal(h.audio.stops,1);assert.equal(h.sandbox.window.__routeVerificationFilm,undefined);
}));
test('missing output tap remains an explicitly silent video, never a microphone substitute',()=>temporary(async file=>{
 const h=fixture({withAudio:false}),started=await startRouteFilm(h.page);assert.equal(started.audioSource,null);assert.equal(started.audioTracks,0);assert.match(started.audioFallback,/Video only/);const stopped=await stopRouteFilm(h.page,file);assert.equal(stopped.microphone,false);assert.equal(h.video.stops,1);
}));
test('failed recorder acquisition releases its own video and output tap and leaves no page owner',async()=>{
 const h=fixture({constructorFails:true});await assert.rejects(startRouteFilm(h.page),/constructor failed/);assert.equal(h.stats.disposed,1);assert.equal(h.video.stops,1);assert.equal(h.audio.stops,1);assert.equal(h.sandbox.window.__routeVerificationFilm,undefined);
});
test('recorder errors use the same cleanup and refuse to write a misleading successful movie',()=>temporary(async file=>{
 const h=fixture();await startRouteFilm(h.page);h.stats.recorders[0].onerror({error:Error('encode failed')});await assert.rejects(stopRouteFilm(h.page,file),/encode failed/);await assert.rejects(access(file));assert.equal(h.stats.disposed,1);assert.equal(h.video.stops,1);assert.equal(h.audio.stops,1);assert.equal(h.sandbox.window.__routeVerificationFilm,undefined);
}));
test('binary output is checked for actual EBML instead of trusting a WebM MIME label',()=>temporary(async file=>{
 const h=fixture({badHeader:true});await startRouteFilm(h.page);await assert.rejects(stopRouteFilm(h.page,file),/EBML\/length/);await assert.rejects(access(file));assert.equal(h.stats.disposed,1);assert.equal(h.video.stops,1);assert.equal(h.sandbox.window.__routeVerificationFilm,undefined);
}));
