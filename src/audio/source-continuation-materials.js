import {assetUrl} from '../platform/paths.js';
import {continuationSolids} from '../data/source-continuation.js';
import {sourceAcousticCoordinates} from './source-surroundings.js';

// Existing CC0 recordings, retained at their original pitch. These are local
// timber/stone contacts, not purported recordings of a giant impossible room.
export const CONTINUATION_MATERIALS = Object.freeze({
  maxVoices: 5, maxDecodedSeconds: 8, maxEncodedBytes: 160000,
  maxLoadAttempts: 3, retrySeconds: 3,
  clips: Object.freeze([
    {id:'timber',file:'restraint.mp3',seconds:2.25},
    {id:'joint',file:'joint-fracture.mp3',seconds:2.65},
    {id:'stone',file:'stone-spall.mp3',seconds:2},
  ]),
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const finite=(x,d=0)=>Number.isFinite(Number(x))?Number(x):d;
const cache=new WeakMap();
const loadPolicies=new WeakMap();
const atBody=s=>({x:finite(s?.x),y:finite(s?.feet)+1.62,z:finite(s?.z)});

function intersects(a,b,box){
  let lo=.03,hi=.97;
  for(const axis of ['x','y','z']){
    const min=box['min'+axis.toUpperCase()],max=box['max'+axis.toUpperCase()];
    if(!Number.isFinite(min)||!Number.isFinite(max))return false;
    const d=b[axis]-a[axis];
    if(Math.abs(d)<1e-8){if(a[axis]<min||a[axis]>max)return false;}
    else{const p=(min-a[axis])/d,q=(max-a[axis])/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>hi)return false;}
  }
  return true;
}

export function continuationAcousticPlacement(source,state={},solids=continuationSolids(state),acousticFrame=null,chartId=finite(state.chartId)){
  const listener=atBody(state),coordinates=sourceAcousticCoordinates(source,state,acousticFrame,{chartId,includePitch:false}),[right,,back]=coordinates.relativeXYZ;
  const distance=coordinates.distance,horizontal=Math.hypot(right,back);
  // Local solid tests have meaning only within the emitter's chart. A visible
  // neighbor is projected through its real aperture by the acoustic frame.
  const blocked=chartId===finite(state.chartId)&&solids.some(s=>s.role!=='rail'&&s.maxY-s.minY>1.7&&intersects(listener,source,s));
  const cabinet=state.phase==='catch';
  return{distance,blocked,arrival:Math.min(1.1,distance/343),
    pan:clamp(right/Math.max(2,horizontal)*.88,-.88,.88),
    gain:coordinates.source?(1+distance/18)**-1.12*(blocked?.38:1):0,
    cutoff:blocked?780:Math.max(1200,8500/(1+distance/36)),
    wet:cabinet?.24:.065,domain:cabinet?'retaining-case':'open-underside'};
}

// Authored sparse reflection approximation. No measured room response is held.
// Distinct arrival groups make a near wooden enclosure differ from open void;
// this remains a design model to compare against the dry recorded material.
export function continuationReflectionBuffer(ctx,domain){
  const enclosed=domain==='retaining-case',seconds=enclosed?1.35:.52;
  const buffer=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate);
  const taps=enclosed?[[.043,.29],[.081,.21],[.139,.15],[.251,.10],[.427,.06],[.731,.025],[1.19,.009]]
    :[[.119,.21],[.271,.08],[.449,.025]];
  for(let channel=0;channel<2;channel++)for(const[delay,gain]of taps){
    const index=Math.min(buffer.length-1,Math.round((delay+channel*.007)*ctx.sampleRate));
    const data=buffer.getChannelData(channel);
    // A tiny distributed reflection, rather than a digital single-sample click.
    for(let k=0;k<Math.ceil(ctx.sampleRate*.002);k++)if(index+k<data.length)data[index+k]+=gain*Math.exp(-k/(ctx.sampleRate*.00045))*(k%2?-.42:1);
  }
  return buffer;
}

export function createContinuationMaterialAudio({getAudio=()=>null,fetcher=globalThis.fetch,
  urlFor=file=>assetUrl('audio/source-demolition/'+file),protectedAudio=()=>false}={}){
  let ctx=null,destination=null,bank=null,loading=null,generation=0,disposed=false;
  let ready=false,failed=null,listener={},previous=null,travel=0,upperHeard=false,acousticFrame=null;
  let played=0,skipped=0,lastDomain=null,runId=null;
  const voices=new Set();
  function release(v){if(v.dead)return;v.dead=true;v.source.onended=null;try{v.source.stop();}catch{}for(const n of v.nodes)try{n.disconnect();}catch{}voices.delete(v);}
  function stop(){for(const v of [...voices])release(v);previous=null;travel=0;acousticFrame=null;}
  function prepare(){
    if(disposed||protectedAudio()) {stop();return false;}
    let pair;try{pair=getAudio();}catch{stop();return false;}
    if(!pair?.ctx||pair.ctx.state!=='running'||!pair.destination){stop();return false;}
    if(typeof pair.ctx.decodeAudioData!=='function'||typeof fetcher!=='function')return false;
    if(ctx!==pair.ctx||destination!==pair.destination){
      stop();generation++;ctx=pair.ctx;destination=pair.destination;ready=false;failed=null;bank=null;loading=null;
    }
    let held=cache.get(ctx);
    if(!held){
      let policy=loadPolicies.get(ctx);
      if(!policy){policy={attempts:0,nextRetryAt:0,lastError:null};loadPolicies.set(ctx,policy);}
      if(policy.attempts>=CONTINUATION_MATERIALS.maxLoadAttempts||ctx.currentTime<policy.nextRetryAt){failed=policy.lastError;return false;}
      const decodeContext=ctx;
      policy.attempts++;
      held={buffers:new Map(),reflections:new Map(),promise:null};cache.set(ctx,held);
        held.promise=(async()=>{
          let bytes=0;
          for(const row of CONTINUATION_MATERIALS.clips){
            const response=await fetcher(urlFor(row.file));if(!response.ok)throw Error('Source material unavailable: '+row.id);
            const data=await response.arrayBuffer();bytes+=data.byteLength;
            if(bytes>CONTINUATION_MATERIALS.maxEncodedBytes)throw Error('Source material byte budget exceeded');
            const decoded=await decodeContext.decodeAudioData(data);
            if(Math.abs(decoded.duration-row.seconds)>.09)throw Error('Source material duration changed: '+row.id);
            held.buffers.set(row.id,decoded);
          }
          if([...held.buffers.values()].reduce((n,b)=>n+b.duration,0)>CONTINUATION_MATERIALS.maxDecodedSeconds)throw Error('Source decoded budget exceeded');
          policy.lastError=null;policy.nextRetryAt=0;
          return held;
        })().catch(error=>{
          // A rejected shared promise must not poison later scene owners.
          // The separate context policy bounds retries without hot fetching.
          if(cache.get(decodeContext)===held)cache.delete(decodeContext);
          policy.lastError=String(error.message||error);
          policy.nextRetryAt=decodeContext.currentTime+CONTINUATION_MATERIALS.retrySeconds;
          throw error;
        });
    }
    if(bank!==held){
      bank=held;ready=false;failed=null;const current=generation;
      loading=held.promise.then(()=>{const valid=current===generation&&!disposed;if(valid){ready=true;loading=null;}return valid;})
        .catch(error=>{if(current===generation){failed=String(error.message||error);loading=null;}return false;});
    }
    return ready;
  }
  function place(v){
    const mix=continuationAcousticPlacement(v.position,listener,continuationSolids(listener),acousticFrame,v.chartId);v.mix=mix;
    const target=(p,value)=>{if(p.setTargetAtTime)p.setTargetAtTime(value,ctx.currentTime,.06);else p.value=value;};
    target(v.gain.gain,v.level*mix.gain);target(v.filter.frequency,mix.cutoff);
    if(v.pan)target(v.pan.pan,mix.pan);target(v.wet.gain,mix.wet);
  }
  function play(id,position,level=.08,{offset=0,seconds=1.5,kind=id,chartId=finite(listener.chartId)}={}){
    if(!prepare()||voices.size>=CONTINUATION_MATERIALS.maxVoices){skipped++;return false;}
    const buffer=bank.buffers.get(id);if(!buffer)return false;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain(),gain=ctx.createGain(),pan=ctx.createStereoPanner?.();
    const wet=ctx.createGain(),nodes=[source,filter,envelope,gain,wet],v={source,filter,gain,pan,wet,nodes,position:{...position},chartId,level,kind,dead:false};
    source.buffer=buffer;source.playbackRate.value=1;filter.type='lowpass';filter.Q.value=.35;
    source.connect(filter).connect(envelope).connect(gain);if(pan){nodes.push(pan);gain.connect(pan).connect(destination);}else gain.connect(destination);
    const domain=listener.phase==='catch'?'retaining-case':'open-underside';lastDomain=domain;
    if(ctx.createConvolver){
      const convolver=ctx.createConvolver();nodes.push(convolver);
      if(!bank.reflections.has(domain))bank.reflections.set(domain,continuationReflectionBuffer(ctx,domain));
      convolver.normalize=false;convolver.buffer=bank.reflections.get(domain);
      (pan||gain).connect(wet).connect(convolver).connect(destination);
    }
    voices.add(v);place(v);
    const duration=Math.max(.03,Math.min(seconds,buffer.duration-offset));
    const start=ctx.currentTime+v.mix.arrival,fade=Math.min(.12,duration*.2);
    v.until=start+duration+(domain==='retaining-case'?1.35:.52);
    envelope.gain.setValueAtTime(0,start);
    if(envelope.gain.linearRampToValueAtTime){
      envelope.gain.linearRampToValueAtTime(1,start+Math.min(.012,duration*.1));
      envelope.gain.setValueAtTime(1,start+duration-fade);
      envelope.gain.linearRampToValueAtTime(0,start+duration);
    }else envelope.gain.setValueAtTime(1,start);
    const voiceContext=ctx;
    source.onended=()=>{source.onended=null;v.until=voiceContext.currentTime+(domain==='retaining-case'?1.35:.52);};
    source.start(start,offset,duration);
    played++;return true;
  }
  function event(e,state=listener,presentedFrame=acousticFrame){
    if(!['wrong-return','catch'].includes(state?.phase)||!prepare())return false;
    listener=state;acousticFrame=presentedFrame;const pos=e.position||{x:finite(state.x),y:finite(state.feet),z:finite(state.z)};
    if(e.type==='corridor-strain')return play('timber',pos,.065,{offset:.3,seconds:1.8,kind:'corridor-strain'});
    if(e.type==='corridor-warning')return play('joint',pos,.065,{offset:.16,seconds:1,kind:'corridor-warning'});
    if(e.type==='corridor-settled')return play('joint',pos,.08,{offset:1.15,seconds:.65,kind:'corridor-settled'});
    if(e.type==='land')return play('stone',pos,.09,{offset:.12,seconds:.75,kind:'loaded-landing'});
    if(e.type==='capture')return play('timber',pos,.12,{seconds:1.6,kind:'lining-takes-weight'});
    if(e.type==='recovered')return play('timber',pos,.045,{offset:.85,seconds:.9,kind:'lining-releases-weight'});
    if(/^counterweight-(lands|warning|lowering-warning|strain|release)$/.test(e.type))return play('joint',e.position||{x:state.counterweight?.x||0,y:state.counterweight?.y||0,z:state.counterweight?.z||0},.10,{offset:.16,seconds:1.7,kind:'actual-load-contact',chartId:0});
    if(e.type==='phase')return play('timber',pos,.065,{offset:.3,seconds:1.8,kind:'case-throat'});
    if(e.type==='closure-warning')return play('joint',pos,.055,{seconds:1.8,kind:'return-bearing',chartId:0});
    return false;
  }
  // Tail-only maintenance during score isolation: no preparation, fetching,
  // remnant emission or moving-counterweight contacts may start here.
  function maintain(state,presentedFrame=null){
    if(disposed||protectedAudio()||!['wrong-return','catch'].includes(state?.phase)){stop();return false;}
    if(!voices.size)return false;
    let pair;try{pair=getAudio();}catch{stop();return false;}
    if(!pair?.ctx||pair.ctx!==ctx||pair.destination!==destination||ctx.state!=='running'){stop();return false;}
    listener=state;acousticFrame=presentedFrame;
    for(const v of [...voices]){
      if(!/^corridor-(?:strain|warning|settled)$/.test(v.kind)||v.until<=ctx.currentTime)release(v);
      else place(v);
    }
    return true;
  }
  function update(state,presentedFrame=null){
    if(!['wrong-return','catch'].includes(state?.phase)||!prepare()){stop();return false;}
    if(runId!==state.runId){stop();runId=state.runId;upperHeard=false;}
    listener=state;acousticFrame=presentedFrame;for(const v of [...voices]){if(v.until<=ctx.currentTime)release(v);else place(v);}
    // The first audible remnant belongs to the same ruined upper world. It is
    // a one-time contact heard from above, never a repeating ambience timer.
    if(!upperHeard&&state.phase==='wrong-return'&&state.elapsed>7){
      upperHeard=play('stone',{x:0,y:100,z:45.5},.22,{offset:.2,seconds:1.15,kind:'upper-ruin-settle',chartId:0});
    }
    const w=state.counterweight,moving=w?.active&&['walking','falling','hoisting','traversing','lowering','returning'].includes(w.mode);
    if(moving&&previous&&previous.phase===state.phase){
      const distance=Math.hypot(w.x-previous.x,w.y-previous.y,w.z-previous.z);
      if(distance<2)travel+=distance;else travel=0;
      if(travel>1.8){travel%=1.8;play('timber',{x:w.x,y:w.y,z:w.z},.045,{offset:.45,seconds:1.3,kind:'loaded-frame-travel',chartId:0});}
    }else travel=0;
    previous=w?{...w,phase:state.phase}:null;return true;
  }
  return{update,event,maintain,stop,prepare,whenReady:()=>loading||Promise.resolve(ready),
    dispose(){stop();disposed=true;generation++;bank=null;loading=null;ready=false;ctx=null;destination=null;},
    snapshot:()=>({ready,loading:!!loading,error:failed,voices:voices.size,played,skipped,lastDomain,
      loadAttempts:ctx?loadPolicies.get(ctx)?.attempts||0:0,
      retryCount:ctx?Math.max(0,(loadPolicies.get(ctx)?.attempts||0)-1):0,
      nextRetryAt:ctx?loadPolicies.get(ctx)?.nextRetryAt||0:0,
      reflectionModel:'authored sparse early reflections; no measured IR',
      layers:[...voices].map(v=>({kind:v.kind,position:v.position,chartId:v.chartId,mix:v.mix}))})};
}
