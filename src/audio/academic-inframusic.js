import {assetUrl} from '../platform/paths.js';

export const ACADEMIC_INFRAMUSIC_URL=assetUrl('audio/academic-inframusic.mp3');
export const ACADEMIC_INFRAMUSIC_SOURCE=Object.freeze({x:81.5,y:11.25,z:5.0});
const levels=Object.freeze({off:0,low:.055,house:.14});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

// Floor is the actual physical height, not a floor number or render-group
// shortcut: the second-floor landing is +4.8, the top landing is +10m.
export function academicInframusicFrame({eligible=false,listener={},onStair=false,
  roomMuffle=0,danger=false,dialogue=false,paused=false,hidden=false,focused=true,
  source=ACADEMIC_INFRAMUSIC_SOURCE,level='house'}={}){
  const floor=Number(listener.floor),third=listener.group==='academic'&&floor>=9.6&&floor<=10.55;
  const stair=onStair===true&&Number.isFinite(floor)&&floor>4.85&&floor<=10.55;
  if(!eligible||paused||hidden||focused===false||!Number.isFinite(floor)||(!third&&!stair))
    return{audible:false,gain:0,cutoff:600,pan:0,reason:paused?'paused':hidden?'hidden':focused===false?'unfocused':'outside'};
  const rise=third?1:smooth(4.85,9.6,floor),muffle=clamp(roomMuffle),duck=danger?.16:dialogue?.42:1;
  const dx=Number.isFinite(listener.x)?source.x-listener.x:0,dz=Number.isFinite(listener.z)?source.z-listener.z:0;
  const distance=Math.hypot(dx,dz),yaw=Number(listener.yaw)||0;
  const gain=(levels[level]??levels.house)*rise*(1-muffle*.70)*duck/(1+distance/55);
  return{audible:gain>0,gain,cutoff:Math.min((third?7600:600+rise*3200)*(1-muffle*.88),danger?900:dialogue?3200:20000),
    pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(3,distance),-.65,.65),distance,rise,
    reason:level==='off'?'off':danger?'danger-duck':dialogue?'dialogue-duck':third?'society':'stairs'};
}

// One decoded asset, one live source, no timers, input lease or context resume.
// The caller owns the music-settings bus and calls update outside world gates.
export function createAcademicInframusic({getAudio=()=>null,fetchImpl=(...args)=>fetch(...args)}={}){
  let level='house',buffer=null,pending=null,voice=null,offset=0,disposed=false,error=null,retryAt=0,retryCtx=null;
  let latest={},frame={audible:false,gain:0,cutoff:600,pan:0,reason:'idle'},generation=0;
  const position=()=>buffer?.duration?((offset+(voice?Math.max(0,voice.ctx.currentTime-voice.started):0))%buffer.duration):offset;
  function pause(reason='paused'){
    if(voice){offset=position();const old=voice;voice=null;
      try{old.gain.gain.cancelScheduledValues(old.ctx.currentTime);old.gain.gain.setValueAtTime(0,old.ctx.currentTime);}catch{}
      try{old.source.stop();}catch{}for(const node of old.nodes)try{node.disconnect();}catch{}
    }
    frame={...frame,audible:false,gain:0,reason};return state();
  }
  function preload(){
    if(disposed)return Promise.resolve(null);if(buffer)return Promise.resolve(buffer);if(pending)return pending;
    const audio=getAudio();if(!audio?.ctx||audio.ctx.state==='closed'||audio.ctx===retryCtx&&audio.ctx.currentTime<retryAt)return Promise.resolve(null);
    const token=generation,ctx=audio.ctx;
    pending=Promise.resolve().then(()=>fetchImpl(ACADEMIC_INFRAMUSIC_URL)).then(response=>{
      if(!response?.ok)throw new Error(`inframusic HTTP ${response?.status}`);return response.arrayBuffer();
    }).then(bytes=>disposed||token!==generation?null:ctx.decodeAudioData(bytes)).then(decoded=>{
      if(decoded&&!disposed&&token===generation){buffer=decoded;error=null;return decoded;}return null;
    }).catch(cause=>{if(!disposed){error=String(cause?.message||cause);retryCtx=ctx;retryAt=ctx.currentTime+5;}return null;})
      .finally(()=>{pending=null;});
    return pending;
  }
  function update(input={}){
    if(disposed)return state();latest={...input};
    // Saved amplifier state and the current lifecycle snapshot are one update;
    // never briefly replay the previous eligible snapshot during a load/blur.
    if(Object.hasOwn(levels,input.level))level=input.level;
    const audio=getAudio();frame=academicInframusicFrame({...input,level});
    if(!frame.audible||!audio?.ctx||!audio.destination||audio.ctx.state!=='running'){
      pause(!frame.audible?frame.reason:'context-inactive');return state();
    }
    if(voice&&(voice.ctx!==audio.ctx||voice.destination!==audio.destination))pause('context-replaced');
    if(!buffer){void preload();frame={...frame,audible:false,gain:0,reason:'loading'};return state();}
    if(!voice){
      const ctx=audio.ctx,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),pan=ctx.createStereoPanner?.();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.Q.value=.5;gain.gain.value=0;
      source.connect(filter);filter.connect(gain);if(pan){gain.connect(pan);pan.connect(audio.destination);}else gain.connect(audio.destination);
      voice={ctx,destination:audio.destination,source,filter,gain,pan,started:ctx.currentTime,nodes:[source,filter,gain,...(pan?[pan]:[])]};
      source.start(0,offset%buffer.duration);
    }
    frame=academicInframusicFrame({...input,level});const t=voice.ctx.currentTime;
    voice.gain.gain.setTargetAtTime(frame.gain,t,input.danger?.06:.25);
    voice.filter.frequency.setTargetAtTime(frame.cutoff,t,.12);voice.pan?.pan.setTargetAtTime(frame.pan,t,.2);
    return state();
  }
  function state(){return{level,active:!!voice,voices:voice?1:0,ready:!!buffer,loading:!!pending,
    duration:buffer?.duration||0,offsetSec:position(),gain:voice?frame.gain:0,cutoff:frame.cutoff,pan:frame.pan,reason:frame.reason,error,disposed};}
  return Object.freeze({update,preload,state,snapshot:state,pause,
    setLevel(next){if(!Object.hasOwn(levels,next)||next===level)return state();level=next;if(next==='off')pause('off');else update(latest);return state();},
    stop(){pause('stopped');offset=0;return state();},
    dispose(){pause('disposed');disposed=true;generation++;buffer=null;return state();},
  });
}
