import {assetUrl} from '../platform/paths.js';

export const BOOTH_TV=Object.freeze({mesh:'yard_booth_tv_screen',path:'video/booth-night-road.mp4',anchor:Object.freeze([24,1.9,14]),range:24,uploadHz:15});

// One silent decoder near the actual lodge. New decoded frames only: no pixel
// readback, screenshots, independent scheduler or background animation loop.
export function createBoothTelevision({createVideo=()=>document.createElement('video'),upload=()=>false,visible=()=>!document.hidden,url=assetUrl(BOOTH_TV.path)}={}){
  let video=null,playing=false,wanted=false,disposed=false,lastUpload=-Infinity,lastMediaTime=-1,uploads=0,error=null,playPending=false,lastAttempt=-Infinity,failedUploadAt=-Infinity;
  function ensure(){
    if(video||disposed)return video;
    video=createVideo();video.muted=true;video.volume=0;video.loop=true;video.playsInline=true;video.preload='none';
    video.setAttribute?.('playsinline','');video.setAttribute?.('aria-hidden','true');video.src=url;
    video.addEventListener?.('error',()=>{error='The lodge television programme could not be decoded.';});
    return video;
  }
  function suspend(){wanted=false;if(video&&!video.paused)video.pause();playing=false;}
  function update({eye=[Infinity,Infinity,Infinity],now=0,active=true}={}){
    const near=Math.hypot(eye[0]-BOOTH_TV.anchor[0],eye[1]-BOOTH_TV.anchor[1],eye[2]-BOOTH_TV.anchor[2])<=BOOTH_TV.range;
    if(disposed||!active||!near||!visible()){suspend();return false;}
    wanted=true;const v=ensure();if(!v)return false;
    if(v.paused&&!playPending&&now-lastAttempt>=2){
      lastAttempt=now;playPending=true;
      try{Promise.resolve(v.play()).then(()=>{playing=!disposed&&wanted;if(!playing)v.pause();},e=>{error=String(e?.message||e);playing=false;}).finally(()=>{playPending=false;});}
      catch(e){error=String(e?.message||e);playPending=false;}
    }
    if(v.readyState<2||!v.videoWidth||!v.videoHeight||v.currentTime===lastMediaTime||now-lastUpload<1/BOOTH_TV.uploadHz)return false;
    if(now-failedUploadAt<2)return false;
    try{if(!upload(BOOTH_TV.mesh,v))return false;}catch(e){failedUploadAt=now;error=String(e?.message||e);return false;}
    lastUpload=now;lastMediaTime=v.currentTime;uploads++;error=null;return true;
  }
  const onVisibility=()=>{if(!visible())suspend();};
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisibility);
  function dispose(){if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisibility);disposed=true;suspend();if(video){video.removeAttribute?.('src');video.load?.();video=null;}}
  return{update,suspend,dispose,snapshot:()=>({ready:!!video&&video.readyState>=2,playing,uploads,mediaTime:lastMediaTime,decodedFrames:video?.getVideoPlaybackQuality?.()?.totalVideoFrames??video?.webkitDecodedFrameCount??null,error,disposed,path:BOOTH_TV.path})};
}
