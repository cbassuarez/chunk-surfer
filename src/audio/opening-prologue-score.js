import {assetUrl} from '../platform/paths.js';
import {OPENING_PROLOGUE_SCORE} from '../data/opening-prologue-score.js';

export const OPENING_PROLOGUE_SCORE_PHASES=Object.freeze(['road','recognition','ellery','personal','return']);
const rank=phase=>OPENING_PROLOGUE_SCORE_PHASES.indexOf(phase);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

// Reading requests a semantic change. The score completes a nearby measured
// release candidate, or uses a short explicit release. No familiar passage
// loops and no elapsed-film timer changes a station behind the conversation.
export function createOpeningPrologueScore({getAudio=()=>null,fetcher=globalThis.fetch,urlFor=assetUrl,onError=()=>{},
  manifest=OPENING_PROLOGUE_SCORE,roadOnlySeconds=16,maxTransitionSeconds=2.4}={}){
  let ctx=null,destination=null,output=null,disposed=false,epoch=0,preparing=null,settled=false,errors=[],loadAbort=null,
    phase='road',requestedPhase='road',elapsed=0,active=null,cursor=0,holding=false,held=false,holdReason=null,
    pending=null,serial=0;
  const buffers=new Map(),history=[];
  const record=row=>{history.push({...row,at:ctx?.currentTime||0});if(history.length>48)history.shift();};
  const now=()=>finite(ctx?.currentTime);
  const position=()=>active?Math.min(active.duration,Math.max(0,active.offset+now()-active.startedAt)):cursor;
  function acquire(){
    let pair;try{pair=getAudio();}catch{return false;}
    const context=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain;
    if(!context||!out)return false;
    if(ctx!==context||destination!==out){
      pauseVoice();try{output?.disconnect();}catch{}
      ctx=context;destination=out;output=ctx.createGain();output.gain.value=1;output.connect(out);
    }
    return true;
  }
  function fail(error){
    const message=String(error?.message||error);if(!errors.includes(message)){errors.push(message);try{onError(error);}catch{}}
  }
  function prepare(){
    if(disposed)return Promise.resolve(false);
    if(settled)return Promise.resolve(errors.length===0);
    if(preparing)return preparing;
    if(!acquire())return Promise.resolve(false);
    const generation=epoch,context=ctx;loadAbort=typeof AbortController==='function'?new AbortController():null;
    preparing=Promise.all(Object.entries(manifest.phases).map(async([id,clip])=>{
      try{
        const response=await fetcher(urlFor(clip.asset),loadAbort?{signal:loadAbort.signal}:undefined);
        if(disposed||epoch!==generation)return;
        if(!response?.ok)throw Error('Opening score '+id+' unavailable'+(response?.status?' ('+response.status+')':''));
        const bytes=await response.arrayBuffer();if(disposed||epoch!==generation)return;
        const buffer=await context.decodeAudioData(bytes);
        if(disposed||epoch!==generation)return;
        if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Invalid opening score '+id);
        buffers.set(id,buffer);
      }catch(error){if(!disposed&&epoch===generation)fail(error);}
    })).then(()=>{
      if(disposed||epoch!==generation)return false;
      settled=true;record({type:'prepared',clips:buffers.size,errors:errors.length});return errors.length===0;
    });
    return preparing;
  }
  function retire(voice,{fade=0}={}){
    if(!voice)return;
    const at=now();voice.retired=true;
    try{voice.gain.gain.cancelScheduledValues(at);voice.gain.gain.setValueAtTime(fade?voice.gain.gain.value:0,at);
      if(fade)voice.gain.gain.linearRampToValueAtTime(0,at+fade);voice.source.stop(at+fade+.005);}catch{}
    if(fade){setTimeout(()=>{try{voice.source.disconnect();voice.gain.disconnect();}catch{}},(fade+.04)*1000);}
    else try{voice.source.disconnect();voice.gain.disconnect();}catch{}
  }
  function pauseVoice(){
    if(active){cursor=position();const voice=active;active=null;retire(voice);}
    if(pending?.at!=null){pending.remaining=Math.max(0,pending.at-now());pending.at=null;}
  }
  function startVoice(offset=0,{resume=false}={}){
    const buffer=buffers.get(phase),clip=manifest.phases[phase];
    if(!buffer||!clip){holding=phase!=='road';return false;}
    cursor=Math.min(buffer.duration,Math.max(0,offset));
    if(cursor>=buffer.duration-.005){holding=true;return false;}
    const source=ctx.createBufferSource(),gain=ctx.createGain(),at=now(),duration=buffer.duration,
      remaining=duration-cursor,fadeIn=Math.min(resume?.12:.7,remaining/3),tail=Math.min(.9,remaining/3),level=finite(clip.gain,1);
    source.buffer=buffer;source.loop=false;gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(level,at+fadeIn);
    gain.gain.setValueAtTime(level,at+remaining-tail);gain.gain.linearRampToValueAtTime(0,at+remaining);
    source.connect(gain);gain.connect(output);
    const voice={source,gain,phase,serial:++serial,offset:cursor,startedAt:at,duration,retired:false};
    active=voice;holding=false;
    source.onended=()=>{
      if(disposed||voice.retired||active!==voice)return;
      cursor=Math.min(duration,Math.max(cursor,voice.offset+now()-voice.startedAt));active=null;holding=true;
      try{source.disconnect();gain.disconnect();}catch{}record({type:'quiet-hold',phase});
    };
    source.start(at,cursor,remaining);record({type:resume?'resume':'statement',phase,offset:cursor});return true;
  }
  function enter(next){
    const old=active;active=null;retire(old);pending=null;phase=next;cursor=0;holding=false;
    record({type:'phase',phase});if(phase!=='road')startVoice();
  }
  function requestPhase(next){
    if(disposed||rank(next)<0||rank(next)<rank(requestedPhase))return false;
    if(next===requestedPhase)return true;
    requestedPhase=next;record({type:'request',phase:next});return true;
  }
  function scheduleRelease(){
    if(!active||pending)return;
    const pos=position(),clip=manifest.phases[phase],candidate=clip?.exitCandidates?.find(mark=>mark.at>pos+.2&&mark.at<=pos+maxTransitionSeconds),
      remaining=active.duration-pos,
      delay=Math.min(remaining,Math.max(.2,candidate?candidate.at-pos:.85),maxTransitionSeconds);
    pending={at:now()+delay,remaining:delay,kind:candidate?'waveform-candidate':'bounded-release'};
    applyRelease();record({type:'release',phase,kind:pending.kind,seconds:delay});
  }
  function applyRelease(){
    if(!active||!pending)return;
    if(pending.at==null)pending.at=now()+pending.remaining;
    const at=now(),end=pending.at,fade=Math.min(.85,Math.max(.02,end-at)),param=active.gain.gain;
    try{param.cancelScheduledValues(at);param.setValueAtTime(Math.max(0,finite(param.value,1)),at);
      param.setValueAtTime(Math.max(0,finite(param.value,1)),Math.max(at,end-fade));param.linearRampToValueAtTime(0,end);}catch{}
  }
  function update({dt=0,paused=false,ready=true,protectedAudio=false}={}){
    if(disposed)return snapshot();
    if(!acquire())return snapshot();
    if(!settled&&!preparing)void prepare();
    let protection;try{protection=typeof protectedAudio==='function'?!!protectedAudio():!!protectedAudio;}catch{protection=true;}
    const reason=paused?'paused':!ready?'presentation':protection?'recording':ctx.state&&ctx.state!=='running'?'context':null;
    if(reason){if(!held)pauseVoice();held=true;holdReason=reason;return snapshot();}
    if(held){held=false;holdReason=null;if(phase!=='road'&&!holding)startVoice(cursor,{resume:true});if(pending)applyRelease();}
    // The ordinary road starts with the picture, not a preload. An unavailable
    // section settles to a quiet hold so it cannot deadlock the game's route.
    elapsed+=Math.max(0,Math.min(.25,finite(dt)));
    if(active&&position()>=active.duration-.005){cursor=active.duration;const voice=active;active=null;retire(voice);holding=true;}
    if(!settled||elapsed<roadOnlySeconds)return snapshot();
    if(rank(requestedPhase)>rank(phase)){
      if(!active||pending&&pending.at!=null&&now()>=pending.at)enter(requestedPhase);
      else if(!pending)scheduleRelease();
    }
    return snapshot();
  }
  function snapshot(){
    let decodedBytes=0;for(const buffer of buffers.values())decodedBytes+=(buffer.length||Math.round(buffer.duration*(buffer.sampleRate||manifest.sampleRate)))*(buffer.numberOfChannels||manifest.channels||1)*4;
    return {ready:settled&&errors.length===0,settled,loading:!disposed&&!!preparing&&!settled,error:errors[0]||null,errors:[...errors],disposed,
      phase,requestedPhase,segment:phase==='road'?null:phase,playing:!!active&&!held&&(!ctx.state||ctx.state==='running'),holding:!!holding,held,holdReason,
      transitioning:!!pending,release:pending?{kind:pending.kind,secondsRemaining:pending.at==null?pending.remaining:Math.max(0,pending.at-now())}:null,
      positionSeconds:position(),duration:buffers.get(phase)?.duration||manifest.phases[phase]?.duration||0,elapsed,
      loaded:[...buffers.keys()],decodedBytes,loop:false,history:history.map(row=>({...row}))};
  }
  function dispose({fade=.12}={}){
    if(disposed)return;disposed=true;epoch++;pending=null;loadAbort?.abort();loadAbort=null;
    const voice=active;active=null;retire(voice,{fade:Math.max(0,Math.min(.3,finite(fade)))});
    const node=output;output=null;buffers.clear();if(node)setTimeout(()=>{try{node.disconnect();}catch{}},350);
  }
  return Object.freeze({prepare,status:snapshot,requestPhase,update,dispose,snapshot});
}
