// This player deliberately has no imports, WebGL or audio context. It must
// remain usable when the game's module graph or graphics initialization fails.
(function(window,document){
  'use strict';
  if(window.__chunkStartupVan)return;
  var video=document.getElementById('startupVanVideo');
  var poster=document.getElementById('startupVanPoster');
  var script=document.currentScript;
  var base=script&&script.src||document.baseURI;
  var metadata=null,started=false,soundComplete=false;
  var phase='loading',elapsed=0,position=0,audioTimer=0;
  var loadToken=0,requestController=null,videoUrl=null,frameRequest=0,departureTimer=0,stallTimer=0,initialTimer=0;
  var departure=null,onDeparted=null;
  var announced=false,completeSent=false,disposed=false,audio=null;
  var media=null,reduced=false,forcedReduced=false,error=null;
  var defaults={durationSeconds:3.4,stages:null};
  // The 42-frame source shows the van from .40s until its last body pixels
  // clear at 2.64s. The parked interval and empty ends use a faster clock.
  var VISIBLE_AT=.40,REST_AT=1.27,DRIVE_AT=1.55,CLEAR_AT=2.68;
  var DEPARTURE_LIMIT_MS=480,INITIAL_VIDEO_LIMIT_MS=1200;
  function asset(name){return new URL('app-icon/'+name,base).href;}
  function stage(time){
    if(phase==='loading')return'loading';
    if(phase==='finished'||phase==='disposed')return'parked';
    var m=metadata||defaults;
    if(time>=CLEAR_AT)return'offscreen';
    if(m.stages){var name='arrival';for(var i=0;i<m.stages.length;i++)if(time>=m.stages[i].atSeconds)name=m.stages[i].name;return name;}
    return time<.95?'arrival':time<REST_AT?'brake':time<DRIVE_AT?'settle':time<CLEAR_AT?'departure':'offscreen';
  }
  function snapshot(){
    var duration=(metadata||defaults).durationSeconds;
    return{phase:phase,elapsed:elapsed,position:position,duration:duration,progress:Math.min(1,elapsed/duration),stage:stage(elapsed),visualStage:stage(position),reduced:reduced,
      departure:departure,
      hidden:!!document.hidden,complete:phase==='finished'||phase==='revealed'||phase==='disposed',error:error,
      reduceFlash:true,weather:metadata&&metadata.weather||null};
  }
  function sendTo(handler,type,reason){
    if(typeof handler!=='function')return;
    var event=snapshot();event.type=type;if(reason)event.reason=reason;
    try{var pending=handler(event);if(pending&&typeof pending.catch==='function')pending.catch(function(){});}catch(_){}
  }
  function send(type,reason){sendTo(audio,type,reason);}
  function stopAudioTicks(){
    if(audioTimer){window.clearTimeout(audioTimer);audioTimer=0;}
  }
  function cancelLoading(){
    loadToken++;
    if(requestController){requestController.abort();requestController=null;}
  }
  function sampleTime(){
    if(!started||!metadata||soundComplete)return;
    var time=video.currentTime;
    if(time<elapsed||time>=metadata.durationSeconds*.98){
      soundComplete=true;elapsed=metadata.durationSeconds;
    }else elapsed=time;
  }
  function releaseVideo(){
    if(!video)return;
    clearStall();
    if(frameRequest){video.cancelVideoFrameCallback?.(frameRequest);frameRequest=0;}
    video.pause();video.hidden=true;
    video.removeAttribute('data-departing');video.removeAttribute('src');video.load();
    if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null;}
  }
  function clearInitialTimer(){
    if(initialTimer){window.clearTimeout(initialTimer);initialTimer=0;}
  }
  function watchInitialVideo(){
    if(phase!=='loading'||document.hidden||initialTimer)return;
    initialTimer=window.setTimeout(function(){
      initialTimer=0;error='Startup van video did not produce its first frame.';
      useMovingPoster('first-frame-timeout');
    },INITIAL_VIDEO_LIMIT_MS);
  }
  function useMovingPoster(reason){
    finish(reason);
    if(!reduced&&poster)poster.setAttribute('data-repeating','');
  }
  function completeEvent(reason){
    if(completeSent)return;completeSent=true;
    try{window.dispatchEvent(new window.CustomEvent('chunk-startup-van-complete',{detail:{reason:reason,status:snapshot()}}));}catch(_){}
  }
  function finish(reason){
    if(phase==='finished'||phase==='revealed'||phase==='disposed')return true;
    if(phase==='departing'){completeDeparture(reason);return true;}
    stopAudioTicks();cancelLoading();clearInitialTimer();releaseVideo();
    if(poster)poster.hidden=false;
    phase='finished';send('stop',reason||'finished');completeEvent(reason||'finished');return true;
  }
  function completeDeparture(reason){
    if(departureTimer){window.clearTimeout(departureTimer);departureTimer=0;}
    releaseVideo();
    if(poster){poster.hidden=true;poster.removeAttribute('data-departing');poster.removeAttribute('data-repeating');
      poster.style.removeProperty('--startup-van-translate');}
    departure=null;phase='revealed';completeEvent(reason||'revealed');
    var callback=onDeparted;onDeparted=null;if(callback)callback();
  }
  function clearStall(){
    if(stallTimer){window.clearTimeout(stallTimer);stallTimer=0;}
  }
  function updateVideoClock(time){
    clearStall();
    position=time;
    if(phase==='departing'&&departure==='video'&&(time<VISIBLE_AT||time>=CLEAR_AT)){completeDeparture();return;}
    if(phase!=='playing')return;
    var fast=time<VISIBLE_AT||time>=CLEAR_AT||(time>=REST_AT&&time<DRIVE_AT);
    var rate=fast?4:1;
    if(video.playbackRate!==rate)video.playbackRate=rate;
  }
  function watchVideo(){
    if(!video.requestVideoFrameCallback||frameRequest||!['playing','departing'].includes(phase))return;
    frameRequest=video.requestVideoFrameCallback(function(_,frame){
      frameRequest=0;
      updateVideoClock(frame.mediaTime);watchVideo();
    });
  }
  function onTimeUpdate(){
    if(!video.requestVideoFrameCallback&&['playing','departing'].includes(phase))updateVideoClock(video.currentTime);
  }
  function onEnded(){if(phase==='departing'&&departure==='video')completeDeparture();}
  function onStall(){
    if(document.hidden||stallTimer||phase!=='playing')return;
    stallTimer=window.setTimeout(function(){
      stallTimer=0;error='Startup van video stopped advancing.';
      useMovingPoster('media-stalled');
    },400);
  }
  function onDepartureEnd(event){
    if(phase==='departing'&&(event.animationName==='startup-van-exit'||event.animationName==='startup-van-poster-pass'))completeDeparture();
  }
  function reveal(callback){
    if(phase==='revealed'||phase==='disposed')return false;
    if(phase==='departing')return true;
    // Readiness releases input immediately. Only the visible decoration stays
    // long enough to cross out of the crop, with no fresh pass once ready.
    sampleTime();stopAudioTicks();cancelLoading();clearStall();clearInitialTimer();
    var playable=phase==='playing'&&started&&!video.hidden;
    // Other callbacks can deliver the first visible frame and readiness in the
    // same paint, just before this player's presentation callback runs.
    if(playable&&position<VISIBLE_AT&&video.currentTime>=VISIBLE_AT&&video.currentTime<CLEAR_AT)
      position=video.currentTime;
    var visibleVideo=playable&&position>=VISIBLE_AT&&position<CLEAR_AT;
    var posterReady=poster&&poster.complete&&poster.naturalWidth>0;
    var repeatingPoster=posterReady&&poster.hasAttribute('data-repeating');
    var visiblePoster=posterReady&&!poster.hidden&&!repeatingPoster;
    if(repeatingPoster){
      var bounds=poster.getBoundingClientRect();
      var crop=poster.parentElement.getBoundingClientRect();
      if(bounds.right>crop.left&&bounds.left<crop.right){
        var transform=window.getComputedStyle(poster).transform;
        poster.style.setProperty('--startup-van-translate',transform);
        visiblePoster=true;
      }
    }
    phase='departing';send('stop','revealed');
    if(reduced||document.hidden||(!visibleVideo&&!visiblePoster&&(started||repeatingPoster||!posterReady))){
      completeDeparture();return false;
    }
    onDeparted=typeof callback==='function'?callback:null;
    if(visibleVideo){
      // The existing take keeps moving inside the crop when the decoder can
      // deliver frames. Move the crop itself so decoding cannot stall the exit.
      departure='video';video.setAttribute('data-departing','');
    }else{
      departure='poster';releaseVideo();poster.hidden=false;poster.removeAttribute('data-repeating');
      poster.setAttribute('data-departing',visiblePoster?'exit':'pass');
    }
    departureTimer=window.setTimeout(function(){completeDeparture('departure-timeout');},DEPARTURE_LIMIT_MS);
    return true;
  }
  function scheduleAudioTick(){
    if(!audio||phase!=='playing'||!metadata||document.hidden||audioTimer||soundComplete)return;
    audioTimer=window.setTimeout(function(){
      audioTimer=0;if(phase!=='playing'||document.hidden)return;
      sampleTime();send('tick');scheduleAudioTick();
    },80);
  }
  function resume(){
    if(document.hidden)return;
    var token=loadToken;
    video.play().catch(function(failure){
      if(token!==loadToken||document.hidden||failure?.name==='AbortError'||phase==='revealed'||phase==='finished'||phase==='disposed')return;
      error=String(failure&&failure.message||failure);useMovingPoster('media-failed');
    });
  }
  function onPlaying(){
    if(document.hidden||phase==='revealed'||phase==='finished'||phase==='disposed')return;
    if(phase==='departing'){watchVideo();return;}
    clearInitialTimer();phase='playing';started=true;video.hidden=false;if(poster)poster.hidden=true;
    updateVideoClock(video.currentTime);watchVideo();
    sampleTime();
    if(metadata){send(announced?'resume':'start');announced=true;scheduleAudioTick();}
  }
  function onMediaError(){
    if(!videoUrl||phase==='revealed'||phase==='finished'||phase==='disposed')return;
    error=video.error?.message||'Startup van video unavailable.';
    if(phase==='departing')return;
    useMovingPoster('media-failed');
  }
  function visibility(){
    if(phase==='departing'){if(document.hidden)completeDeparture('hidden');return;}
    if(phase!=='playing'&&phase!=='loading')return;
    if(document.hidden){video.pause();sampleTime();stopAudioTicks();clearStall();clearInitialTimer();send('pause','hidden');}
    else if(video.hasAttribute('src')){watchInitialVideo();resume();}
    else loadVideo();
  }
  function motionChanged(){
    reduced=forcedReduced||!!(media&&media.matches);
    if(reduced){poster?.removeAttribute('data-repeating');finish('reduced-motion');}
  }
  function setVisualSettings(settings){
    if(!settings||typeof settings!=='object')return;
    forcedReduced=!!settings.reducedMotion;motionChanged();
  }
  function readMetadata(value){
    var duration=Number(value?.durationSeconds);
    if(!Number.isFinite(duration)||duration<.1||duration>12)return null;
    var stages=Array.isArray(value.stages)?value.stages.filter(function(stage){
      return stage&&Number.isFinite(stage.atSeconds)&&stage.atSeconds>=0&&stage.atSeconds<=duration&&typeof stage.name==='string';
    }).sort(function(a,b){return a.atSeconds-b.atSeconds;}):[];
    return{durationSeconds:duration,stages:stages.length?stages:null,weather:{rain:value.weather?.rain===true}};
  }
  async function loadVideo(){
    if(disposed||phase!=='loading'||document.hidden)return;
    watchInitialVideo();
    if(requestController)return;
    var token=++loadToken,controller=new window.AbortController();
    requestController=controller;
    var options={signal:controller.signal};
    // A small in-memory URL gives the native media decoder byte-range access
    // even when the app's custom document protocol serves whole files.
    var soundTiming=window.fetch(asset('van-startup.json'),options).then(function(response){
      return response.ok?response.json():null;
    }).catch(function(){return null;});
    try{
      var response=await window.fetch(asset('van-startup.mp4'),options);
      if(!response.ok)throw Error('Startup van video unavailable.');
      var bytes=await response.arrayBuffer();
      if(token!==loadToken)return;
      if(!bytes.byteLength||bytes.byteLength>128*1024)throw Error('Startup van video exceeds its loading budget.');
      videoUrl=URL.createObjectURL(new window.Blob([bytes],{type:'video/mp4'}));
      video.src=videoUrl;
      resume();
      var data=await soundTiming;
      if(token!==loadToken)return;
      metadata=readMetadata(data);
      if(metadata&&started&&!document.hidden){sampleTime();send('start');announced=true;scheduleAudioTick();}
    }catch(failure){
      if(token!==loadToken)return;
      error=String(failure&&failure.message||failure);useMovingPoster('media-failed');
    }finally{if(requestController===controller)requestController=null;}
  }
  // Compatibility for an older guard: optional artwork never holds readiness.
  function canReveal(){return true;}
  function setAudio(handler){
    var next=typeof handler==='function'?handler:null;
    if(audio===next)return;
    stopAudioTicks();if(audio)sendTo(audio,'stop','handler-replaced');audio=next;
    if(!audio)return;
    if(phase==='playing'&&metadata){sampleTime();send(document.hidden?'pause':'start','attached');scheduleAudioTick();}
    else if(phase==='finished'||phase==='revealed'||phase==='disposed')send('stop','attached-after-complete');
  }
  function dispose(){
    if(disposed)return;finish('disposed');disposed=true;phase='disposed';audio=null;
    document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',dispose);
    if(media&&media.removeEventListener)media.removeEventListener('change',motionChanged);else if(media&&media.removeListener)media.removeListener(motionChanged);
    if(video){video.removeEventListener('playing',onPlaying);video.removeEventListener('error',onMediaError);
      video.removeEventListener('timeupdate',onTimeUpdate);video.removeEventListener('ended',onEnded);
      video.removeEventListener('waiting',onStall);video.removeEventListener('stalled',onStall);
      video.removeEventListener('animationend',onDepartureEnd);}
    poster?.removeEventListener('animationend',onDepartureEnd);
  }
  window.__chunkStartupVan={canReveal:canReveal,reveal:reveal,finish:finish,status:function(){if(phase==='playing')sampleTime();return snapshot();},setAudio:setAudio,setVisualSettings:setVisualSettings,dispose:dispose};
  try{media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');reduced=!!(media&&media.matches);}catch(_){}
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',dispose);
  poster?.addEventListener('animationend',onDepartureEnd);
  if(media&&media.addEventListener)media.addEventListener('change',motionChanged);else if(media&&media.addListener)media.addListener(motionChanged);
  if(reduced){finish('reduced-motion');return;}
  if(!video||!video.play||!window.fetch||!window.AbortController||!window.Blob||!URL.createObjectURL){finish('animation-unavailable');return;}
  video.muted=true;video.loop=true;video.addEventListener('playing',onPlaying);video.addEventListener('error',onMediaError);
  video.addEventListener('timeupdate',onTimeUpdate);video.addEventListener('ended',onEnded);
  video.addEventListener('waiting',onStall);video.addEventListener('stalled',onStall);
  video.addEventListener('animationend',onDepartureEnd);
  loadVideo();
})(window,document);
