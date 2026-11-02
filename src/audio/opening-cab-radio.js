import {assetUrl} from '../platform/paths.js';
import {OPENING_CAB_RADIO_SOURCE} from '../data/opening-cab-radio-source.js';
import {RADIO_SCRATCH_CLIPS} from '../game/source-drive/radio-programmes.js';

const LINK=RADIO_SCRATCH_CLIPS['music-link'];
export const OPENING_CAB_RADIO_MIX=Object.freeze({
  station:'EVENING MUSIC',programmeGain:.44,linkGain:.4,duck:.28,
  highpassHz:180,lowpassHz:4700,reflectionSeconds:[.017,.037],reflectionGains:[.045,.025],
  linkAt:1.2,linkSeconds:LINK.durationSeconds,defaultVolume:.65,
});
const C=OPENING_CAB_RADIO_MIX,clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const modulo=(value,duration)=>duration>0?((value%duration)+duration)%duration:Math.max(0,value);
function stationList(stations,programmeSource){
  const rows=stations??[{id:programmeSource.id||'evening-music',label:C.station,source:programmeSource}];
  const ids=new Set();return rows.flatMap((row,index)=>{
    const source=row?.source||row?.programmeSource||row,path=source?.path||row?.sourcePath;
    const id=row?.id||source?.id||`station-${index+1}`;
    if(row?.available===false||typeof path!=='string'||!path.trim()||/^(?:[a-z]+:|\/\/)|(?:^|\/)\.\.(?:\/|$)/i.test(path)||ids.has(id))return[];
    ids.add(id);const link=row.link===null?null:row.link??{...LINK,path:LINK.url,at:C.linkAt};
    return[Object.freeze({id,label:row.label||C.station,source:Object.freeze({...source,path}),
      link:link&&Object.freeze({...link,id:link.id||`${id}-link`,path:link.path||link.url,
        at:Math.max(0,Number(link.at??C.linkAt)||0),durationSeconds:Number(link.durationSeconds)||C.linkSeconds})})];
  });
}

// One receiver, one streamed programme and one short prerecorded station link.
// This owner never resumes the host context or routes around the game's bus.
export function createOpeningCabRadio({getAudio=()=>null,getState=()=>({}),
  createElement=()=>document.createElement('audio'),fetcher=globalThis.fetch,
  urlFor=assetUrl,onError=()=>{},programmeSource=OPENING_CAB_RADIO_SOURCE,
  stations,initialStationId}={}){
  const choices=stationList(stations,programmeSource),memory=new Map();
  let selected=Math.max(0,choices.findIndex(row=>row.id===initialStationId)),transportSeconds=0,transportAt=null;
  const station=()=>choices[selected]||null,programme=()=>station()?.source,link=()=>station()?.link;
  const sharedTransport=choices.length>1;
  let media=null,context=null,destination=null,nodes=[],listeners=[],duck=null,gate=null,
    desired=false,disposed=false,playing=false,pending=false,buffering=false,held=true,
    on=true,volume=C.defaultVolume,projectionGain=1,needsGesture=false,version=0,playTicket=0,failed=null,errors=[],lastClock=0,
    linkBuffer=null,linkLoading=null,linkAttempted=false,linkVoice=null,linkDone=false,
    linkResume=false,linkStarts=0,linkWindow=null,mediaSources=0,prepared=false;

  const clock=()=>Math.max(0,Number(media?.currentTime)||0);
  const now=()=>Math.max(0,Number(context?.currentTime)||0);
  const broadcastClock=()=>transportSeconds+(transportAt===null?0:Math.max(0,now()-transportAt));
  const stationClock=row=>modulo(broadcastClock(),Number(row?.source.durationSeconds)||0);
  function freezeTransport(){transportSeconds=broadcastClock();transportAt=null;}
  function alignProgramme(){
    if(!media)return;const target=sharedTransport?stationClock(station()):lastClock;
    if(Math.abs(clock()-target)>.12)try{media.currentTime=target;}catch{}
  }
  function report(error,fatal=false){
    const message=String(error?.message||error||'The cab radio could not be played.');
    if(!errors.includes(message)){errors.push(message);try{onError(error instanceof Error?error:Error(message));}catch{}}
    if(fatal){failed=message;hold();}
  }
  function state(extra={}){
    let value;try{value=getState()||{};}catch{return{active:false,paused:true};}
    return{...value,...extra};
  }
  const mayPlay=s=>desired&&!disposed&&!failed&&!needsGesture&&s.active!==false&&!s.paused&&s.focused!==false&&!s.protected&&s.ready!==false;
  function receiverGain(s=state()){
    projectionGain=s.projectionGain===undefined?1:clamp(s.projectionGain);
    return on?volume*projectionGain:0;
  }
  function playFailed(error){
    if(error?.name==='NotAllowedError'){
      // A native/browser gesture policy is not a broken recording. Wait for
      // an explicit start or power-on gesture rather than retrying each frame.
      needsGesture=true;report(error);hold();return;
    }
    report(error,true);
  }
  function parameter(p,value,seconds=0){
    if(!p)return;const at=now();p.cancelScheduledValues?.(at);
    p.setValueAtTime?.(p.value,at);
    if(seconds&&p.linearRampToValueAtTime)p.linearRampToValueAtTime(value,at+seconds);
    else if(p.setValueAtTime)p.setValueAtTime(value,at);else p.value=value;
  }
  function stopLink({resume=false}={}){
    const at=clock(),cue=link();
    if(linkVoice){try{linkVoice.stop();}catch{}try{linkVoice.disconnect();}catch{}linkVoice=null;}
    linkResume=!!(cue&&resume&&!linkDone&&at<cue.at+cue.durationSeconds);
    linkWindow=null;parameter(duck?.gain,C.programmeGain);
  }
  function hold(){
    // Invalidate a pending play before pausing. WebKit may reject that old
    // request after focus has already returned and a newer play has succeeded.
    freezeTransport();playTicket++;pending=false;held=true;playing=false;stopLink({resume:true});parameter(gate?.gain,0);
    try{media?.pause();}catch{}
  }
  function teardown(){
    freezeTransport();
    version++;pending=false;playing=false;buffering=false;stopLink();
    if(media){lastClock=clock();for(const [name,fn]of listeners)media.removeEventListener?.(name,fn);
      try{media.pause();media.removeAttribute?.('src');media.load?.();}catch{}}
    for(const node of nodes)try{node.disconnect();}catch{}
    nodes=[];listeners=[];media=null;context=null;destination=null;duck=null;gate=null;
    linkBuffer=null;linkLoading=null;linkAttempted=false;prepared=false;
  }
  function make(pair){
    const ctx=pair?.ctx||pair?.context,out=pair?.destination||pair?.musicGain||pair?.output;
    if(!ctx||!out||!station())return false;
    if(media&&context===ctx&&destination===out)return true;
    if(media)teardown();
    context=ctx;destination=out;
    try{
      media=createElement();media.preload='auto';media.loop=true;
      media.src=urlFor(programme().path);
      const source=ctx.createMediaElementSource(media);mediaSources++;
      duck=ctx.createGain();duck.gain.value=C.programmeGain;
      const mono=ctx.createGain();mono.channelCount=1;mono.channelCountMode='explicit';mono.channelInterpretation='speakers';
      const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=C.highpassHz;hp.Q.value=Math.SQRT1_2;
      const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=C.lowpassHz;lp.Q.value=Math.SQRT1_2;
      gate=ctx.createGain();gate.gain.value=0;
      nodes.push(source,duck,mono,hp,lp,gate);
      source.connect(duck);duck.connect(mono);mono.connect(hp);hp.connect(lp);lp.connect(gate);gate.connect(out);
      // Quiet early reflections, without a feedback loop or a long reverb tail.
      if(typeof ctx.createDelay==='function')for(let i=0;i<C.reflectionSeconds.length;i++){
        const delay=ctx.createDelay(.1),gain=ctx.createGain();delay.delayTime.value=C.reflectionSeconds[i];gain.gain.value=C.reflectionGains[i];
        lp.connect(delay);delay.connect(gain);gain.connect(gate);nodes.push(delay,gain);
      }
      // The link joins the same little mono loudspeaker, not a clean voice bus.
      media._cabRadioInput=mono;
      if(sharedTransport)lastClock=stationClock(station());
      if(lastClock>0)try{media.currentTime=lastClock;}catch{}
      const listen=(name,fn)=>{media.addEventListener?.(name,fn);listeners.push([name,fn]);};
      listen('loadedmetadata',()=>{if(!playing)alignProgramme();});
      listen('error',()=>report(Error(media?.error?.message||'The cab radio programme could not be loaded.'),true));
      listen('waiting',()=>{buffering=true;stopLink({resume:true});parameter(gate?.gain,0);});
      listen('seeking',()=>{buffering=true;stopLink();parameter(gate?.gain,0);});
      const flow=()=>{buffering=false;const s=state();if(!held&&mayPlay(s)){playing=!media.paused;parameter(gate?.gain,receiverGain(s),.02);scheduleLink();}};
      listen('playing',flow);listen('seeked',flow);
      return true;
    }catch(error){report(error,true);teardown();return false;}
  }
  function ensure(){
    let pair;try{pair=getAudio();}catch(error){report(error,true);return false;}
    return make(pair);
  }
  function loadLink(){
    const cue=link();if(!cue)return Promise.resolve(false);
    if(linkLoading)return linkLoading;
    if(linkBuffer)return Promise.resolve(true);
    if(linkAttempted||!context)return Promise.resolve(false);
    linkAttempted=true;const ctx=context,serial=version;
    linkLoading=(async()=>{
      try{
        const response=await fetcher(urlFor(cue.path));if(!response?.ok)throw Error('The cab station link could not be loaded.');
        const bytes=await response.arrayBuffer();if(bytes.byteLength>512000)throw Error('The cab station link exceeds its small-clip budget.');
        const buffer=await ctx.decodeAudioData(bytes);
        if(disposed||serial!==version||ctx!==context)return false;
        if(!(buffer.duration>0&&buffer.duration<=5))throw Error('The cab station link has an unexpected duration.');
        linkBuffer=buffer;scheduleLink();return true;
      }catch(error){if(!disposed&&serial===version)report(error);return false;}
      finally{if(serial===version)linkLoading=null;}
    })();return linkLoading;
  }
  function scheduleLink(){
    const cue=link();if(!cue||!media||held||buffering||!playing||media.paused||linkDone||linkVoice)return;
    const at=clock(),end=cue.at+cue.durationSeconds;
    if(at>=end){linkDone=true;linkResume=false;return;}
    // A late decode/seek must not suddenly deliver an old announcement. A real
    // hold may resume the remaining words at their original programme offset.
    if(at>cue.at+.12&&!linkResume){linkDone=true;return;}
    if(!linkBuffer)return;
    const start=now()+Math.max(0,cue.at-at),offset=Math.max(0,at-cue.at),length=Math.min(linkBuffer.duration-offset,end-Math.max(at,cue.at));
    if(length<=0){linkDone=true;return;}
    const voice=context.createBufferSource(),gain=context.createGain();voice.buffer=linkBuffer;gain.gain.value=C.linkGain;
    voice.connect(gain);gain.connect(media._cabRadioInput);linkVoice=voice;nodes.push(gain);linkStarts++;linkResume=false;
    linkWindow={start,end:start+length,offset};
    const p=duck.gain;p.cancelScheduledValues?.(now());p.setValueAtTime(C.programmeGain,now());
    const fade=Math.min(.06,Math.max(0,start-now()));p.setValueAtTime(C.programmeGain,start-fade);
    p.linearRampToValueAtTime(C.programmeGain*C.duck,start);
    p.setValueAtTime(C.programmeGain*C.duck,start+length);
    p.linearRampToValueAtTime(C.programmeGain,start+length+.22);
    voice.onended=()=>{try{voice.disconnect();gain.disconnect();}catch{}
      nodes=nodes.filter(node=>node!==gain);if(linkVoice===voice){linkVoice=null;linkWindow=null;linkDone=true;}};
    voice.start(start,offset,length);voice.stop(start+length+.005);
  }
  function reconcile(extra={}){
    const s=state(extra);
    receiverGain(s);
    if(!mayPlay(s)){hold();return false;}
    if(!ensure()||context.state&&context.state!=='running'){hold();return false;}
    held=false;if(transportAt===null)transportAt=now();void loadLink();
    if(playing&&!media.paused){parameter(gate.gain,buffering?0:receiverGain(s),.02);scheduleLink();return true;}
    if(pending)return false;
    if(sharedTransport)alignProgramme();
    const el=media,serial=version,ticket=++playTicket;pending=true;
    let request;try{request=el.play();}catch(error){pending=false;playFailed(error);return false;}
    Promise.resolve(request).then(()=>{
      if(disposed||serial!==version||el!==media||ticket!==playTicket)return;pending=false;
      if(held||!mayPlay(state())){hold();return;}
      if(sharedTransport)alignProgramme();playing=!el.paused;parameter(gate.gain,buffering?0:receiverGain(),.02);scheduleLink();
    }).catch(error=>{
      if(disposed||serial!==version||el!==media||ticket!==playTicket)return;pending=false;
      if(error?.name==='AbortError'&&(held||!mayPlay(state())))return;
      playFailed(error);
    });return true;
  }
  function snapshot(){
    const audible=!!(on&&volume>0&&projectionGain>0&&playing&&!held&&!buffering&&!media?.paused),at=now(),current=station(),cue=link();
    return{on,playing:audible,active:desired&&!disposed,holding:held,buffering,
      station:current?.label||null,stationId:current?.id||null,preset:current?selected+1:null,
      programme:current?`${current.source.composer||''}${current.source.composer?' — ':''}${current.source.title||''}`:null,
      availableStations:choices.map((row,index)=>({id:row.id,preset:index+1,label:row.label,programme:row.source.title||'',composer:row.source.composer||'',
        work:row.source.work||'',performer:row.source.performer||'',duration:row.source.durationSeconds,
        clock:row===current&&media?clock():stationClock(row),selected:row===current})),
      volume,projectionGain,needsGesture,caption:audible&&cue&&linkWindow&&at>=linkWindow.start&&at<linkWindow.end?
        {speaker:cue.speaker||current.label,text:cue.text,cueId:cue.id,temporary:cue.temporary===true}:null,
      clock:media?clock():sharedTransport?stationClock(current):lastClock,
      broadcastClock:broadcastClock(),duration:Number.isFinite(media?.duration)?media.duration:current?.source.durationSeconds||0,
      errors:[...errors],failed,linkStarts,linkDone,mediaSources,disposed};
  }
  return{
    prepare:async()=>{if(disposed||failed||!ensure())return false;if(!prepared){prepared=true;try{media.load?.();}catch{}}
      await loadLink();return !disposed&&!failed&&!!media;},
    start:(extra={})=>{if(disposed)return false;desired=true;needsGesture=false;return reconcile(extra);},
    update:(extra={})=>reconcile(extra),pause:hold,
    action(action={}){if(disposed)return snapshot();if(action.type==='power'){
        on=typeof action.value==='boolean'?action.value:!on;
        if(on&&needsGesture){needsGesture=false;if(desired)reconcile();}
      }
      if(action.type==='volume')volume=clamp(action.value??volume+(Number(action.delta)||0));
      if(action.type==='station'&&choices.length){
        const next=action.id!==undefined?choices.findIndex(row=>row.id===action.id):modulo(selected+Math.trunc(Number(action.delta)||0),choices.length);
        if(next>=0&&next!==selected){memory.set(station().id,{linkDone,linkStarts});teardown();selected=next;
          const saved=memory.get(station().id);linkDone=saved?.linkDone||false;linkStarts=saved?.linkStarts||0;linkResume=false;
          failed=null;needsGesture=false;lastClock=stationClock(station());if(desired)reconcile();}
      }
      parameter(gate?.gain,!held&&!buffering?receiverGain():0,.025);return snapshot();},
    stop(){desired=false;hold();teardown();lastClock=0;linkDone=false;linkResume=false;needsGesture=false;transportSeconds=0;memory.clear();},
    dispose(){if(disposed)return false;desired=false;hold();teardown();disposed=true;return true;},snapshot,
  };
}
