// Codec-independent, dependency-free playback. Never creates a WebGL/audio
// context or participates in the game's readiness barrier.
(function(window,document){
 'use strict';
 if(window.__chunkStartupVan)return;
 var canvas=document.getElementById('startupVanCanvas'),poster=document.getElementById('startupVanPoster');
 var base=document.currentScript&&document.currentScript.src||document.baseURI;
 var VERSION='albion-maneuver-1',DURATION=3.4,SETTLED=1.94;
 var phase='loading',metadata=null,image=null,ctx=null,raf=0,initialTimer=0,departureTimer=0,audioTimer=0;
 var audio=null,announced=false,completeSent=false,disposed=false,focused=true,reduced=false,forcedReduced=false,media=null,error=null;
 var origin=window.performance.now(),lastLaunch=0,position=0,frameIndex=-1,readyAt=null,onDeparted=null;
 var clock='web',uncertainty=null,bestRoundTrip=Infinity,loadToken=0,controller=null;
 function asset(name){return new URL('app-icon/'+name,base).href;}
 function now(){return window.performance.now();}
 function hidden(){return !!document.hidden||!focused;}
 function launchTime(){lastLaunch=Math.max(lastLaunch,(now()-origin)/1000);return lastLaunch;}
 function stage(){if(phase==='loading')return'loading';if(phase==='holding'||phase==='finished')return'parked';
  return position<.88?'arrival':position<1.42?'brake':position<SETTLED?'settle':'departure';}
 function snapshot(){
  var frames=metadata&&metadata.motionFrames,sample=frames&&frames[Math.max(0,frameIndex)];
  return{phase:phase,elapsed:position,position:position,duration:DURATION,progress:Math.min(1,position/DURATION),stage:stage(),visualStage:stage(),
   motionVersion:VERSION,frame:frameIndex,launchElapsed:launchTime(),clock:clock,clockUncertaintyMs:uncertainty,
   readyAt:readyAt,departure:phase==='departing'?'atlas':null,reduced:reduced,hidden:hidden(),
   complete:phase==='revealed'||phase==='finished'||phase==='disposed',error:error,slipping:false,speed:sample?sample.speed:0,
   reduceFlash:true,weather:metadata&&metadata.weather||null};
 }
 function sendTo(handler,type,reason){if(typeof handler!=='function')return;var event=snapshot();event.type=type;if(reason)event.reason=reason;
  try{var pending=handler(event);pending&&pending.catch&&pending.catch(function(){});}catch(_){} }
 function send(type,reason){sendTo(audio,type,reason);}
 function nativeCall(name){try{var invoke=window.__TAURI_INTERNALS__&&window.__TAURI_INTERNALS__.invoke;return invoke?Promise.resolve(invoke(name)):Promise.resolve(null);}catch(_){return Promise.resolve(null);}}
 function syncClock(){
  if(disposed||phase==='revealed'||phase==='departing')return Promise.resolve();
  var sent=now();return nativeCall('chunk_launch_animation_state').then(function(state){
   if(disposed||phase==='revealed'||phase==='departing'||!state||state.motionVersion!==VERSION||!Number.isFinite(state.elapsed)||state.elapsed<0)return;
   var received=now(),roundTrip=received-sent;
   // Refuse a less certain estimate. launchTime() prevents backwards frames.
   if(roundTrip<=100&&roundTrip<bestRoundTrip){bestRoundTrip=roundTrip;uncertainty=roundTrip/2;origin=(sent+received)/2-state.elapsed*1000;clock='native';}
   // A replacement/late webview must not replay a launch already retired by
   // the first ready event. Its own game boot still owns the readiness barrier.
   if(Number.isFinite(state.readyAt)){readyAt=state.readyAt;retire('launch-already-ready');return;}
   if(phase==='playing'||phase==='holding')schedule();
  }).catch(function(){});
 }
 function stopTicks(){if(audioTimer){window.clearTimeout(audioTimer);audioTimer=0;}}
 function stopPainting(){if(raf){window.cancelAnimationFrame(raf);raf=0;}}
 function clearInitial(){if(initialTimer){window.clearTimeout(initialTimer);initialTimer=0;}}
 function release(){stopPainting();loadToken++;controller&&controller.abort();controller=null;
  if(image){image.onload=image.onerror=null;image.src='';image=null;}if(canvas)canvas.hidden=true;}
 function completeEvent(reason){if(completeSent)return;completeSent=true;
  try{window.dispatchEvent(new window.CustomEvent('chunk-startup-van-complete',{detail:{reason:reason,status:snapshot()}}));}catch(_){} }
 function retire(reason){
  if(departureTimer){window.clearTimeout(departureTimer);departureTimer=0;}
  clearInitial();stopTicks();release();if(poster)poster.hidden=true;phase='revealed';send('stop',reason||'revealed');completeEvent(reason||'revealed');
  var callback=onDeparted;onDeparted=null;if(callback)callback();
 }
 function finish(reason){
  if(phase==='revealed'||phase==='disposed'||phase==='finished')return true;
  if(phase==='departing'){retire(reason);return true;}
  clearInitial();stopTicks();release();if(poster)poster.hidden=false;phase='finished';send('stop',reason||'finished');completeEvent(reason||'finished');return true;
 }
 function paint(time){
  if(!image||!ctx||!metadata)return;
  position=Math.max(0,Math.min(DURATION,time));
  var index=Math.min(metadata.frameCount-1,Math.floor(position/DURATION*(metadata.frameCount-1)));
  if(index===frameIndex)return;
  frameIndex=index;ctx.clearRect(0,0,128,128);
  ctx.drawImage(image,index%metadata.columns*128,Math.floor(index/metadata.columns)*128,128,128,0,0,128,128);
  canvas.hidden=false;if(poster)poster.hidden=true;
 }
 function schedule(){if(!raf&&!hidden()&&!reduced&&!disposed&&['playing','holding','departing'].includes(phase))raf=window.requestAnimationFrame(frame);}
 function frame(){
  raf=0;if(hidden()||reduced||disposed)return;
  var elapsed=launchTime();
  if(phase==='departing'){
   var time=SETTLED+elapsed-readyAt;if(time>=DURATION){retire();return;}paint(time);schedule();return;
  }
  if(phase!=='playing'&&phase!=='holding')return;
  paint(Math.min(elapsed,SETTLED));
  if(elapsed>=SETTLED){
   if(phase!=='holding'){phase='holding';stopTicks();send('stop','settled');completeEvent('settled');}
   return;
  }
  if(!announced&&metadata){send('start');announced=true;tickAudio();}
  schedule();
 }
 function tickAudio(){if(!audio||audioTimer||phase!=='playing'||hidden())return;
  audioTimer=window.setTimeout(function(){audioTimer=0;if(phase==='playing'&&!hidden()){send('tick');tickAudio();}},80);
 }
 function reveal(callback){
  if(phase==='revealed'||phase==='disposed')return false;if(phase==='departing')return true;
  var elapsed=launchTime();readyAt=elapsed;nativeCall('chunk_launch_animation_ready').catch(function(){});
  clearInitial();stopTicks();send('stop','revealed');
  // Readiness always releases input now. Only a settled, decoded vehicle can
  // continue its forward take on the non-interactive decoration layer.
  if(reduced||hidden()||!image||!metadata||elapsed<SETTLED||!['playing','holding'].includes(phase)){retire();return false;}
  phase='departing';onDeparted=typeof callback==='function'?callback:null;
  departureTimer=window.setTimeout(function(){retire('departure-timeout');},Math.ceil((DURATION-SETTLED)*1000)+120);
  schedule();return true;
 }
 function visibility(){
  if(phase==='departing'&&hidden()){retire('hidden');return;}
  if(hidden()){stopPainting();stopTicks();send('pause','hidden');}
  else{syncClock();if(phase==='playing')send(announced?'resume':'start');schedule();tickAudio();}
 }
 function blur(){focused=false;visibility();}function focus(){focused=true;visibility();}
 function motionChanged(){reduced=forcedReduced||!!(media&&media.matches);if(reduced)finish('reduced-motion');}
 function setVisualSettings(settings){if(settings&&typeof settings==='object'){forcedReduced=!!settings.reducedMotion;motionChanged();}}
 function setAudio(handler){var next=typeof handler==='function'?handler:null;if(audio===next)return;
  stopTicks();if(audio)sendTo(audio,'stop','handler-replaced');audio=next;if(!audio)return;
  if(phase==='playing'){send(hidden()?'pause':'start','attached');announced=true;tickAudio();}
  else if(['holding','finished','revealed','disposed'].includes(phase))send('stop','attached-after-complete');
 }
 function validate(data){
  if(!data||data.motionVersion!==VERSION||data.durationSeconds!==DURATION||data.frameCount!==84||data.cell!==128||data.columns!==8||data.rows!==11||data.atlas!=='van-startup.png')throw Error('Startup van atlas metadata is invalid.');
  return data;
 }
 async function load(){
  var token=++loadToken;controller=new window.AbortController();
  initialTimer=window.setTimeout(function(){error='Startup van atlas did not decode in time.';finish('first-frame-timeout');},1500);
  try{
   var response=await window.fetch(asset('van-startup.json'),{signal:controller.signal});if(!response.ok)throw Error('Startup van metadata unavailable.');
   var data=validate(await response.json());if(token!==loadToken)return;metadata=data;
   image=new window.Image();image.decoding='async';
   await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(Error('Startup van atlas unavailable.'));};image.src=asset(data.atlas);});
   if(token!==loadToken)return;
   if(image.naturalWidth!==1024||image.naturalHeight!==1408)throw Error('Startup van atlas dimensions are invalid.');
   clearInitial();controller=null;phase='playing';schedule();
  }catch(failure){if(token!==loadToken)return;error=String(failure&&failure.message||failure);finish('atlas-failed');}
 }
 function dispose(){if(disposed)return;finish('disposed');disposed=true;phase='disposed';audio=null;
  document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',dispose);
  window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);
  if(media&&media.removeEventListener)media.removeEventListener('change',motionChanged);
 }
 window.__chunkStartupVan={canReveal:function(){return true;},reveal:reveal,finish:finish,status:snapshot,setAudio:setAudio,setVisualSettings:setVisualSettings,dispose:dispose};
 try{media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');reduced=!!(media&&media.matches);}catch(_){}
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',dispose);window.addEventListener('blur',blur);window.addEventListener('focus',focus);
 if(media&&media.addEventListener)media.addEventListener('change',motionChanged);
 if(reduced){finish('reduced-motion');return;}
 try{ctx=canvas&&canvas.getContext('2d',{alpha:true});}catch(_){}
 if(!ctx||!window.fetch||!window.Image||!window.AbortController){finish('animation-unavailable');return;}
 // A busy first response must not establish an uncertain launch offset.
 // Refinement is asynchronous and never sits on the readiness path.
 syncClock().then(syncClock).then(syncClock);load();
})(window,document);
