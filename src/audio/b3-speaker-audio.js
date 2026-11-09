import {assetUrl} from '../platform/paths.js';
import {B3_SPEAKER_SOURCE} from '../game/b3-speaker-disturbance.js';

import {B3_SPEAKER_MUSIC,B3_SPEAKER_LEGACY_MUSIC} from '../data/b3-speaker-source.js';

// A real performance, reduced to the single cabinet's mono programme. Missing
// media stays silent; unrelated noises must never masquerade as the puzzle.
export const B3_SPEAKER_AUDIO_URL=assetUrl(B3_SPEAKER_MUSIC.asset);
const LEGACY_MUSIC_URL=assetUrl(B3_SPEAKER_LEGACY_MUSIC.asset);
const LEGACY_STEPS_URL=assetUrl('audio/game/bunch-of-footsteps-sounds.mp3');
export const B3_SPEAKER_TAPE_PREFIX='b3.speaker.';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(Number(n))?Number(n):a));
export function b3SpeakerAudioFrame({active=false,intensity=0,listener={},source=B3_SPEAKER_SOURCE,
  muffle=0,occlusionDb=null,paused=false,hidden=false,focused=true,enabled=true}={}){
  if(!active||paused||hidden||!focused||!enabled||listener.group!=='basement'||Math.abs((Number(listener.floor)||0)-source.floor)>.3)
    return{audible:false,gain:0,cutoff:700,pan:0,reason:!active?'silent':paused?'paused':hidden?'hidden':!focused?'unfocused':!enabled?'disabled':'outside'};
  const dx=source.x-(Number(listener.x)||0),dz=source.z-(Number(listener.z)||0);
  const distance=Math.hypot(dx,dz),yaw=Number(listener.yaw)||0,occlusion=clamp(muffle),amount=clamp(intensity);
  // Glass/soundproofing acts in decibels, rather than stopping at a shallow
  // 55-percent volume cut. The host supplies the actual side of the window.
  const loss=clamp(occlusionDb==null?24*occlusion:occlusionDb,0,72);
  const gain=.52*amount/(1+distance/12)*10**(-loss/20);
  return{audible:gain>.0001,gain,cutoff:Math.max(180,6500*10**(-loss/28)),occlusionDb:loss,
    pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(2,distance),-.8,.8),distance,reason:'speaker'};
}
function fallback(ctx){
  const rate=ctx.sampleRate||48000,length=Math.max(2,Math.floor(rate*4)),buffer=ctx.createBuffer(1,length,rate),a=buffer.getChannelData(0);
  let seed=0x1e73a5,low=0;
  for(let i=0;i<length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=(seed/0xffffffff)*2-1;low=low*.985+noise*.015;
    const t=i/rate,breath=(.32+.18*Math.sin(t*1.9))*low+.025*noise;
    const edge=Math.min(1,i/(rate*.03),(length-1-i)/(rate*.03));a[i]=breath*Math.max(0,edge);
  }
  return buffer;
}
function softened(ctx,buffer){
  // Preserve the recording and eliminate a click on each loop boundary.
  if(!ctx.createBuffer||!buffer?.length||!buffer.getChannelData)return buffer;
  const out=ctx.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  const ramp=Math.max(1,Math.floor(buffer.sampleRate*.025));
  for(let c=0;c<buffer.numberOfChannels;c++){
    const from=buffer.getChannelData(c),to=out.getChannelData(c);
    for(let i=0;i<from.length;i++)to[i]=from[i]*Math.min(1,i/ramp,(from.length-1-i)/ramp);
  }
  return out;
}
export function createB3SpeakerAudio({getAudio=()=>null,fetchImpl=(...args)=>fetch(...args)}={}){
  let loaded=null,pending=null,voice=null,offset=0,disposed=false,error=null,frame={audible:false,gain:0,cutoff:700,pan:0,reason:'idle'};
  let fallbackBuffer=null,legacySteps=null,legacyPending=null,legacyMusic=null,legacyMusicPending=null,kind=null,generation=0,retryAt=0,retryCtx=null;
  const position=()=>voice?.buffer?.duration?((offset+Math.max(0,voice.ctx.currentTime-voice.started))%voice.buffer.duration):offset;
  function stopVoice(){
    if(!voice)return;
    const old=voice;offset=position();voice=null;
    try{old.gain.gain.cancelScheduledValues(old.ctx.currentTime);old.gain.gain.setTargetAtTime(0,old.ctx.currentTime,.02);}catch{}
    const disconnect=()=>{for(const node of old.nodes)try{node.disconnect();}catch{}};
    old.source.onended=disconnect;
    try{old.source.stop(old.ctx.currentTime+.12);}catch{try{old.source.stop();}catch{disconnect();}}
  }
  function preload(){
    if(disposed)return Promise.resolve(null);if(loaded)return Promise.resolve(loaded);if(pending)return pending;
    const audio=getAudio();if(!audio?.ctx||audio.ctx.state==='closed'||audio.ctx===retryCtx&&audio.ctx.currentTime<retryAt)return Promise.resolve(null);
    const token=generation,ctx=audio.ctx;
    pending=Promise.resolve().then(()=>fetchImpl(B3_SPEAKER_AUDIO_URL)).then(r=>{
      if(!r?.ok)throw Error(`B3 speaker HTTP ${r?.status}`);return r.arrayBuffer();
    }).then(bytes=>ctx.decodeAudioData(bytes)).then(buffer=>{
      if(!disposed&&token===generation){loaded=softened(ctx,buffer);error=null;return loaded;}return null;
    }).catch(e=>{if(!disposed){error=String(e?.message||e);retryCtx=ctx;retryAt=ctx.currentTime+5;}return null;}).finally(()=>{pending=null;});
    return pending;
  }
  function update(input={}){
    if(disposed)return state();frame=b3SpeakerAudioFrame(input);
    const audio=getAudio();
    if(!frame.audible||!audio?.ctx||!audio.destination||audio.ctx.state!=='running'){
      stopVoice();return state();
    }
    if(voice&&(voice.ctx!==audio.ctx||voice.destination!==audio.destination))stopVoice();
    if(!loaded){
      if(!pending)void preload();stopVoice();frame={...frame,audible:false,gain:0,reason:error?'asset-error':'loading'};return state();
    }
    const buffer=loaded,newKind='chamber-music';
    if(voice&&kind!==newKind)stopVoice();
    if(!voice){
      const ctx=audio.ctx,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),pan=ctx.createStereoPanner?.();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.Q.value=.5;gain.gain.value=0;
      source.connect(filter);filter.connect(gain);if(pan){gain.connect(pan);pan.connect(audio.destination);}else gain.connect(audio.destination);
      voice={ctx,destination:audio.destination,source,filter,gain,pan,started:ctx.currentTime,buffer,nodes:[source,filter,gain,...(pan?[pan]:[])]};kind=newKind;
      source.start(0,buffer.duration?offset%buffer.duration:0);
    }
    const t=voice.ctx.currentTime;
    voice.gain.gain.setTargetAtTime(frame.gain,t,.075);
    voice.filter.frequency.setTargetAtTime(frame.cutoff,t,.12);voice.pan?.pan.setTargetAtTime(frame.pan,t,.12);
    return state();
  }
  function state(){return{...frame,active:!!voice,kind:voice?kind:null,ready:!!loaded,loading:!!pending,offsetSec:position(),error,disposed};}
  // Capture short chunks of the actual source and its offset, not a generic
  // recorder cue. The host records one once per second while the B3 mic rolls.
  function tapeCue(){
    if(!voice||!frame.audible)return null;
    const tag=B3_SPEAKER_MUSIC.cueTag;
    return{cueId:`${B3_SPEAKER_TAPE_PREFIX}${tag}.${Math.max(0,Math.round(position()*10))}`,
      gain:frame.gain,pan:frame.pan,provenance:{system:'b3-speaker',cutoff:frame.cutoff}};
  }
  // Replay the same source, including the fallback actually heard. The take
  // owns cancellation; loading after a restart never creates a late burst.
  function scheduleTapeCue(cueId,when,{gain=1,pan=0,output,nodes=[],duration=1,cutoff=3200}={}){
    const match=new RegExp(`^b3\\.speaker\\.(biber|music|steps|noise)\\.(\\d+)$`).exec(String(cueId));
    if(!match)return false;
    const audio=getAudio(),ctx=audio?.ctx;if(!ctx||!output)return false;
    let alive=true,source=null;
    const handle={stop(){alive=false;try{source?.stop();}catch{}}};nodes.push(handle);
    const begin=buffer=>{
      if(!alive||!buffer)return;
      const late=Math.max(0,ctx.currentTime-when),remaining=clamp(duration,0,1)-late;
      if(remaining<=.05)return;
      const start=Math.max(ctx.currentTime,when),offset=((Number(match[2])/10+late)%buffer.duration);
      const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain(),p=ctx.createStereoPanner?.();source=src;
      filter.type='lowpass';filter.frequency.value=clamp(cutoff,180,6500);filter.Q.value=.5;
      src.buffer=buffer;src.loop=true;g.gain.setValueAtTime(0,start);
      g.gain.linearRampToValueAtTime(Math.max(0,Number(gain)||0),start+.025);
      g.gain.setValueAtTime(Math.max(0,Number(gain)||0),Math.max(start+.025,start+remaining-.025));
      g.gain.linearRampToValueAtTime(0,start+remaining);
      src.connect(filter);filter.connect(g);if(p){p.pan.value=clamp(pan,-1,1);g.connect(p);p.connect(output);}else g.connect(output);
      nodes.push(src,filter,g,...(p?[p]:[]));src.start(start,offset);src.stop(start+remaining);
    };
    if(match[1]==='noise'){
      if(!fallbackBuffer)fallbackBuffer=fallback(ctx);begin(fallbackBuffer);
    }else if(match[1]==='steps'){
      // Existing saves retain the old captured source; only new B3 takes use
      // Biber. This compatibility path never enters live-room playback.
      if(legacySteps)begin(legacySteps);
      else {
        legacyPending||=Promise.resolve().then(()=>fetchImpl(LEGACY_STEPS_URL)).then(r=>{
          if(!r?.ok)throw Error('legacy B3 audio unavailable');return r.arrayBuffer();
        }).then(b=>ctx.decodeAudioData(b)).then(b=>legacySteps=b).catch(()=>null).finally(()=>legacyPending=null);
        void legacyPending.then(begin);
      }
    }else if(match[1]==='music'){
      // Unversioned music cues were Corelli. Never relabel a saved take with
      // the newly installed programme; new cues carry the Biber identity.
      if(legacyMusic)begin(legacyMusic);
      else {
        legacyMusicPending||=Promise.resolve().then(()=>fetchImpl(LEGACY_MUSIC_URL)).then(r=>{
          if(!r?.ok)throw Error('archived B3 music unavailable');return r.arrayBuffer();
        }).then(b=>ctx.decodeAudioData(b)).then(b=>legacyMusic=b).catch(()=>null).finally(()=>legacyMusicPending=null);
        void legacyMusicPending.then(begin);
      }
    }else if(loaded)begin(loaded);
    else void preload().then(begin);
    return true;
  }
  return Object.freeze({preload,update,state,snapshot:state,tapeCue,scheduleTapeCue,pause(){stopVoice();return state();},
    stop(){stopVoice();offset=0;return state();},dispose(){stopVoice();disposed=true;generation++;loaded=null;fallbackBuffer=null;legacySteps=null;legacyMusic=null;return state();}});
}
