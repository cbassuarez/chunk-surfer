import {assetUrl} from '../platform/paths.js';
import {sourceAcousticCoordinates} from './source-surroundings.js';

// One finite apparatus, through its owner's existing SFX destination. The
// controller emits actual release/contact/settle/voice edges; no scare timer,
// camera, gameplay noise, threat, recording or progression dispatcher lives here.
export const THRESHOLD_GAG_AUDIO=Object.freeze({
  maxVoices:4,maxEncodedBytes:80000,maxDecodedSeconds:1.6,
  clips:Object.freeze({release:'hinge.wav',stop:'wood-stop.wav',rattle:'settle.wav',boo:'boo.wav?v=human-short-heavy-room-4'}),
  gain:Object.freeze({release:.42,stop:.60,rattle:.68,'speaker-click':.055,boo:.54}),
  speakerClickSeconds:.014,nearMetres:3.2,cutoffHz:6200,
});
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const point=v=>v&&['x','y','z'].every(k=>Number.isFinite(Number(v[k])))?{x:Number(v.x),y:Number(v.y),z:Number(v.z)}:null;
const typeOf=e=>String(e?.type||e?.kind||'').replace(/^threshold-gag-/,'');
const anchorFor=kind=>kind==='boo'||kind==='speaker-click'?'speaker':kind==='stop'||kind==='rattle'?'contact':'mount';

export function thresholdGagAudioPlacement(position,state={},acousticFrame=null,chartId=finite(state.chartId)){
  const {relativeXYZ,distance,source}=sourceAcousticCoordinates(position,state,acousticFrame,{chartId});
  return{relativeXYZ,distance,source,
    pan:clamp(relativeXYZ[0]/Math.max(1,Math.hypot(relativeXYZ[0],relativeXYZ[2])),-1,1),
    gain:source?1/(1+(distance/THRESHOLD_GAG_AUDIO.nearMetres)**1.4):0,
    cutoff:clamp(THRESHOLD_GAG_AUDIO.cutoffHz/(1+distance/22),1100,THRESHOLD_GAG_AUDIO.cutoffHz)};
}

export function createThresholdGagAudio({getAudio=()=>null,protectedAudio=()=>false,
  fetcher=(...args)=>globalThis.fetch(...args),urlFor=file=>assetUrl('audio/threshold-gag/'+file),onTrace=()=>{}}={}){
  let ctx=null,destination=null,disposed=false,paused=false,cancelled=false,generation=0;
  let loading=null,loadAttempted=false,ready=false,error=null,abort=null,listener={},acousticFrame=null,poses={},runId=null;
  let played=0,skipped=0,clickBuffer=null;
  const buffers=new Map(),voices=new Set(),seen=new Set(),history=[];
  const protectedNow=()=>{try{return!!protectedAudio();}catch{return true;}};
  const trace=item=>{history.push(item);if(history.length>32)history.shift();try{onTrace(item);}catch{}};
  const parameter=(p,v,immediate=false)=>{if(!p)return;if(!immediate&&p.setTargetAtTime)p.setTargetAtTime(v,ctx.currentTime,.018);else if(p.setValueAtTime)p.setValueAtTime(v,ctx.currentTime);else p.value=v;};
  function release(v){
    if(!voices.has(v))return;voices.delete(v);v.source.onended=null;try{v.source.stop();}catch{}
    for(const node of v.nodes)try{node.disconnect();}catch{}
  }
  function clear(){for(const v of [...voices])release(v);}
  function invalidate(){generation++;abort?.abort();abort=null;loading=null;}
  function acquire({preload=false}={}){
    if(disposed||paused||(!preload&&protectedNow()))return null;
    let pair;try{pair=getAudio();}catch{return null;}
    const context=pair?.ctx||pair?.context,out=pair?.destination||pair?.output;
    if(!context||!out||context.state==='closed'||(!preload&&context.state&&context.state!=='running'))return null;
    if(!context.createBufferSource||!context.createGain||!context.createBiquadFilter)return null;
    if(ctx!==context||destination!==out){
      const changed=ctx!==context;clear();if(changed)invalidate();ctx=context;destination=out;
      if(changed){buffers.clear();ready=false;loadAttempted=false;error=null;clickBuffer=null;}
    }
    return{ctx,destination};
  }
  function prepare(){
    if(!acquire({preload:true}))return Promise.resolve(false);
    if(ready)return Promise.resolve(true);if(loading)return loading;if(loadAttempted)return Promise.resolve(false);
    loadAttempted=true;const ticket=generation,context=ctx;
    const controller=typeof AbortController==='function'?new AbortController():null;abort=controller;
    const job=(async()=>{
      const next=new Map();let bytes=0,seconds=0;
      for(const[kind,file]of Object.entries(THRESHOLD_GAG_AUDIO.clips)){
        if(disposed||ticket!==generation)return false;
        const response=await fetcher(urlFor(file),{signal:controller?.signal});
        if(!response?.ok)throw Error(`Threshold gag ${kind} unavailable: ${response?.status??'no response'}`);
        const encoded=await response.arrayBuffer();bytes+=encoded.byteLength;
        if(bytes>THRESHOLD_GAG_AUDIO.maxEncodedBytes)throw Error('Threshold gag encoded budget exceeded');
        const buffer=await context.decodeAudioData(encoded);seconds+=finite(buffer?.duration,Infinity);
        if(!buffer||buffer.duration<=0||seconds>THRESHOLD_GAG_AUDIO.maxDecodedSeconds)throw Error('Threshold gag decoded budget exceeded');
        next.set(kind,buffer);
      }
      if(disposed||ticket!==generation||context!==ctx)return false;
      for(const[kind,buffer]of next)buffers.set(kind,buffer);ready=true;error=null;trace({type:'prepared',bytes,seconds,clips:{...THRESHOLD_GAG_AUDIO.clips}});return true;
    })().catch(e=>{if(!disposed&&ticket===generation){error=String(e?.message||e);trace({type:'load-error',error});}return false;})
      .finally(()=>{if(loading===job)loading=null;if(abort===controller)abort=null;});
    loading=job;return job;
  }
  function place(v,immediate=false){
    const posed=point(poses[v.anchor]);if(posed)v.position=posed;
    const mix=thresholdGagAudioPlacement(v.position,listener,acousticFrame,v.chartId);v.mix=mix;
    parameter(v.spatial.gain,v.level*mix.gain,immediate);parameter(v.filter.frequency,mix.cutoff,immediate);
    if(v.hrtf){if(v.pan.positionX){parameter(v.pan.positionX,mix.relativeXYZ[0],immediate);parameter(v.pan.positionY,mix.relativeXYZ[1],immediate);parameter(v.pan.positionZ,mix.relativeXYZ[2],immediate);}else v.pan.setPosition?.(...mix.relativeXYZ);}
    else parameter(v.pan?.pan,mix.pan,immediate);
  }
  function relayClick(){
    if(clickBuffer)return clickBuffer;
    const rate=finite(ctx.sampleRate,48000),length=Math.max(4,Math.round(rate*THRESHOLD_GAG_AUDIO.speakerClickSeconds));
    clickBuffer=ctx.createBuffer(1,length,rate);const samples=clickBuffer.getChannelData(0);
    // Finite bipolar contact: never a substitute for the spoken word.
    for(let i=0;i<length;i++){const t=i/rate;samples[i]=Math.sin(t*Math.PI*2*1830)*Math.exp(-t*490)*(i<3?i/3:1);}
    return clickBuffer;
  }
  function play(kind,position,chartId){
    if(!acquire()||!ready||cancelled)return false;
    const buffer=kind==='speaker-click'?relayClick():buffers.get(kind);if(!buffer)return false;
    while(voices.size>=THRESHOLD_GAG_AUDIO.maxVoices)release(voices.values().next().value);
    const nodes=[],own=n=>(nodes.push(n),n);let source,v;
    try{
      source=own(ctx.createBufferSource());source.buffer=buffer;source.loop=false;source.playbackRate.value=1;
      const envelope=own(ctx.createGain()),filter=own(ctx.createBiquadFilter()),spatial=own(ctx.createGain());
      const hrtf=ctx.createPanner?own(ctx.createPanner()):null,pan=hrtf||(ctx.createStereoPanner?own(ctx.createStereoPanner()):null);
      if(hrtf){hrtf.panningModel='HRTF';hrtf.distanceModel='inverse';hrtf.refDistance=1;hrtf.rolloffFactor=0;hrtf.maxDistance=1000;}
      filter.type='lowpass';filter.Q.value=.5;source.connect(filter).connect(envelope).connect(spatial);
      if(pan)spatial.connect(pan).connect(destination);else spatial.connect(destination);
      v={source,nodes,spatial,filter,pan,hrtf:!!hrtf,position:{...position},anchor:anchorFor(kind),chartId,kind,level:THRESHOLD_GAG_AUDIO.gain[kind]};voices.add(v);place(v,true);
      const start=ctx.currentTime,duration=buffer.duration,attack=Math.min(.004,duration*.1),fade=Math.min(.028,duration*.2);
      envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(1,start+attack);
      envelope.gain.setValueAtTime(1,start+duration-fade);envelope.gain.linearRampToValueAtTime(0,start+duration);
      source.onended=()=>release(v);source.start(start,0,duration);source.stop(start+duration+.002);
      played++;trace({type:'played',kind,position:{...position},chartId,start,duration});return true;
    }catch(e){if(v)release(v);else for(const node of nodes)try{node.disconnect();}catch{}error=String(e?.message||e);return false;}
  }
  function adoptRun(state){
    const nextRun=String(state?.runId??'run');if(runId!==null&&runId!==nextRun){clear();seen.clear();cancelled=false;}runId=nextRun;
  }
  function event(e,state=listener,presentedFrame=acousticFrame){
    const kind=typeOf(e);
    if(kind==='cancel'||Object.hasOwn(THRESHOLD_GAG_AUDIO.gain,kind))adoptRun(state);
    if(kind==='cancel'){cancel(e.reason||'priority');return true;}
    if(!Object.hasOwn(THRESHOLD_GAG_AUDIO.gain,kind))return false;
    listener=state||{};acousticFrame=presentedFrame;
    const key=String(listener.runId??runId??'run')+':'+String(e?.id||'apparatus')+':'+kind;
    if(seen.has(key))return false;seen.add(key);
    const position=point(e?.position)||point(poses[anchorFor(kind)]);
    if(disposed||paused||cancelled||protectedNow()||!position||!play(kind,position,finite(e?.chartId,finite(listener.chartId)))){
      skipped++;trace({type:'skipped',kind,reason:disposed?'disposed':paused?'paused':cancelled?'cancelled':protectedNow()?'protected':!position?'position':'not-ready'});return false;
    }
    return true;
  }
  function update(state,presentedFrame=null,positions=null){
    if(disposed)return false;
    adoptRun(state);
    listener=state||{};acousticFrame=presentedFrame;if(positions)poses={...positions};
    if(paused||protectedNow()){clear();return false;}
    if(!acquire())return false;
    for(const v of voices)place(v);return true;
  }
  function cancel(reason='priority'){cancelled=true;clear();trace({type:'cancelled',reason});}
  function pause(){if(disposed||paused)return false;paused=true;clear();return true;}
  function resume(){if(disposed)return false;paused=false;return true;}
  function stop(){cancel('stop');}
  function dispose(){if(disposed)return;disposed=true;invalidate();clear();buffers.clear();ready=false;clickBuffer=null;}
  const snapshot=()=>({ready,loading:!!loading,error,disposed,paused,cancelled,played,skipped,voices:voices.size,
    nodes:[...voices].reduce((sum,v)=>sum+v.nodes.length,0),layers:[...voices].map(v=>({kind:v.kind,position:{...v.position},chartId:v.chartId,hrtf:v.hrtf,mix:v.mix})),history:history.map(v=>({...v}))});
  return{prepare,whenReady:()=>loading||Promise.resolve(ready),event,update,cancel,pause,resume,stop,dispose,snapshot};
}
