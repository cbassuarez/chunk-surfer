// One quiet note transmitted through the Lyric's cellar pipe. This is an
// honest procedural hammered-string approximation, not a sampled performance,
// musical phrase, sequencer, horror sting, echo or reverb layer. It has no
// gameplay/noise/speech authority. The host owns when this beat is permitted.
import {PUB_ROOM_SOUND_ANCHORS} from './pub-room.js';
import {EXTERIOR_PUB} from '../data/exterior-pub.js';

export const PUB_PRESSURE=Object.freeze({frequencyHz:220,durationSeconds:2,lowpassHz:750,peakGain:.035,
  attackSeconds:.018,maximumVoices:1,maximumNodes:5,
  synthesis:'Procedural hammered-string approximation; no sampled piano asset.'});
export const PUB_PRESSURE_ANCHOR=Object.freeze({...PUB_ROOM_SOUND_ANCHORS.glass,y:EXTERIOR_PUB.floor-.45});
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&(p.y==null||Number.isFinite(p.y));
const smooth=n=>{const x=clamp(n,0,1);return x*x*(3-2*x);};

export function pubPressureSpatial(listener={},anchor=PUB_PRESSURE_ANCHOR){
  const dx=finite(anchor.x,PUB_PRESSURE_ANCHOR.x)-finite(listener.x),dz=finite(anchor.z,PUB_PRESSURE_ANCHOR.z)-finite(listener.z),dy=finite(anchor.y,PUB_PRESSURE_ANCHOR.y)-finite(listener.y,EXTERIOR_PUB.floor+1.62);
  const distance=Math.hypot(dx,dy,dz),horizontal=Math.hypot(dx,dz),yaw=finite(listener.yaw);
  return{distance,pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(2,horizontal),-.85,.85),
    gain:1/(1+distance*.18),cutoff:PUB_PRESSURE.lowpassHz};
}

// The fixed A220 fundamental relates by octave to the retained A440 reference.
// A small string-stiffness term and quicker upper-partial decay suggest a
// struck old piano string. The whole sound remains on one pitch, at the real
// context sample rate; there is no sample-rate reduction or amplitude crushing.
export function createPubPressureBuffer(ctx){
  const rate=ctx?.sampleRate;if(!Number.isFinite(rate)||rate<8000||rate>192000)return null;
  const size=Math.ceil(rate*PUB_PRESSURE.durationSeconds),buffer=ctx.createBuffer(1,size,rate),samples=buffer.getChannelData(0);
  const weights=[1,.37,.18,.085,.042,.019],stiffness=.00028;let peak=0,seed=0x19570a;
  for(let i=0;i<size;i++){
    const time=i/rate,attack=smooth(time/.006),release=smooth((PUB_PRESSURE.durationSeconds-time)/.08);let sample=0;
    for(let partial=1;partial<=weights.length;partial++){
      const frequency=PUB_PRESSURE.frequencyHz*partial*Math.sqrt((1+stiffness*partial*partial)/(1+stiffness));
      sample+=Math.sin(2*Math.PI*frequency*time)*weights[partial-1]*Math.exp(-time*(1.5+partial*.7));
    }
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    sample+=(seed/2147483648-1)*.014*Math.exp(-time/.007);
    samples[i]=sample*attack*release;peak=Math.max(peak,Math.abs(samples[i]));
  }
  const scale=peak>.000001?.82/peak:0;for(let i=0;i<samples.length;i++)samples[i]*=scale;
  return buffer;
}

export function createPubPressureAudio({getAudio=()=>null}={}){
  const played=new Set();let voice=null,cached=null,disposed=false,created=0,peakVoices=0,lastReason='idle',lastError=null,lastId=null,lastFrame=null;
  function silence(param,ctx){try{param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(0,ctx.currentTime);param.value=0;}catch{try{param.value=0;}catch{}}}
  function disconnect(v,{stopSource=true}={}){
    if(!v||v.stopped)return;v.stopped=true;v.source.onended=null;silence(v.envelope.gain,v.ctx);silence(v.spatial.gain,v.ctx);
    if(stopSource)try{v.source.stop();}catch{}
    for(const node of v.nodes)try{node.disconnect();}catch{}
    if(voice===v)voice=null;
  }
  function stop(reason='stopped'){disconnect(voice);voice=null;cached=null;lastFrame=null;lastReason=reason;}
  function audioPair(){try{return getAudio()||{};}catch(error){lastError=String(error?.message||error);return{};}}
  function ready(pair){const ctx=pair.ctx||pair.context;return ctx&&ctx.state==='running'&&pair.destination
    &&typeof ctx.createBuffer==='function'&&typeof ctx.createBufferSource==='function'&&typeof ctx.createGain==='function'
    &&typeof ctx.createBiquadFilter==='function'?{ctx,destination:pair.destination}:null;}
  function gate({active=true,inPub=true,paused=false,blurred=false,source=false,busy=false,recording=false}={}){
    return source?'source':paused?'paused':blurred?'blurred':!active||!inPub?'outside':busy||recording?'busy':null;
  }
  function position(v,listener){
    const frame=pubPressureSpatial(listener,v.anchor),now=v.ctx.currentTime;
    v.spatial.gain.setTargetAtTime(frame.gain,now,.035);v.panner.pan?.setTargetAtTime(frame.pan,now,.035);
    lastFrame={...frame,anchor:{...v.anchor}};return frame;
  }
  const api={
    play(input={}){
      if(disposed)return false;
      const blocked=gate(input);if(blocked){stop(blocked);return false;}
      const pair=ready(audioPair());if(!pair){stop('audio-unready');return false;}
      if(voice&&(voice.ctx!==pair.ctx||voice.destination!==pair.destination))stop('context-replaced');
      if(voice&&voice.ends<=pair.ctx.currentTime)disconnect(voice);
      const id=typeof input.id==='string'?input.id.trim():'';
      if(!id||!validPoint(input.listener)||!validPoint(input.anchor||PUB_PRESSURE_ANCHOR)){lastReason='invalid-event';return false;}
      if(played.has(id)){lastReason='already-played';return false;}
      if(voice){lastReason='voice-busy';return false;}
      const {ctx,destination}=pair,nodes=[];let v=null;
      try{
        if(!cached||cached.ctx!==ctx){const buffer=createPubPressureBuffer(ctx);if(!buffer){lastReason='unsupported-sample-rate';return false;}cached={ctx,buffer};}
        const source=ctx.createBufferSource();nodes.push(source);
        const filter=ctx.createBiquadFilter();nodes.push(filter);
        const envelope=ctx.createGain();nodes.push(envelope);envelope.gain.value=0;
        const spatial=ctx.createGain();nodes.push(spatial);spatial.gain.value=0;
        const panner=ctx.createStereoPanner?.()||ctx.createGain();nodes.push(panner);
        source.buffer=cached.buffer;source.loop=false;filter.type='lowpass';filter.frequency.value=PUB_PRESSURE.lowpassHz;if(filter.Q)filter.Q.value=.45;
        source.connect(filter);filter.connect(envelope);envelope.connect(spatial);spatial.connect(panner);panner.connect(destination);
        const now=ctx.currentTime;v={ctx,destination,source,filter,envelope,spatial,panner,nodes,anchor:{...(input.anchor||PUB_PRESSURE_ANCHOR)},ends:now+PUB_PRESSURE.durationSeconds,stopped:false};
        source.onended=()=>{disconnect(v,{stopSource:false});if(!voice)lastReason='ended';};
        // Both gains are zero before connecting and starting. Only this soft,
        // finite envelope can admit a source; there is no unity-gain transient.
        source.start(now);
        envelope.gain.setValueAtTime(0,now);
        envelope.gain.linearRampToValueAtTime(PUB_PRESSURE.peakGain,now+PUB_PRESSURE.attackSeconds);
        envelope.gain.exponentialRampToValueAtTime(.00001,now+PUB_PRESSURE.durationSeconds-.04);
        envelope.gain.linearRampToValueAtTime(0,now+PUB_PRESSURE.durationSeconds);
        position(v,input.listener);source.stop(v.ends);
        voice=v;played.add(id);lastId=id;created++;peakVoices=Math.max(peakVoices,1);lastReason='playing';lastError=null;return true;
      }catch(error){
        lastError=String(error?.message||error);
        if(v)disconnect(v);else for(const node of nodes){try{node.stop?.();}catch{}try{node.disconnect();}catch{}}
        voice=null;lastFrame=null;lastReason='start-failed';return false;
      }
    },
    update(input={}){
      if(disposed)return false;
      const blocked=gate(input);if(blocked){stop(blocked);return false;}
      if(!voice)return false; // An unready or interrupted event is never queued.
      const pair=ready(audioPair());
      if(!pair||pair.ctx!==voice.ctx||pair.destination!==voice.destination){stop(pair?'context-replaced':'audio-unready');return false;}
      if(voice.ends<=voice.ctx.currentTime){disconnect(voice);lastReason='ended';return false;}
      if(!validPoint(input.listener)){stop('invalid-listener');return false;}
      try{position(voice,input.listener);return true;}catch(error){lastError=String(error?.message||error);stop('spatial-failed');return false;}
    },
    pause(){stop('paused');},stop,
    snapshot:()=>({active:!!voice,voices:voice?1:0,nodes:voice?voice.nodes.length:0,created,peakVoices,playedIds:[...played],
      lastId,reason:lastReason,error:lastError,cachedBuffers:cached?1:0,pending:false,disposed,
      frame:lastFrame?{...lastFrame,anchor:{...lastFrame.anchor}}:null,frequencyHz:PUB_PRESSURE.frequencyHz,durationSeconds:PUB_PRESSURE.durationSeconds,synthesis:PUB_PRESSURE.synthesis}),
    dispose(){stop('disposed');played.clear();disposed=true;},
  };
  return api;
}
