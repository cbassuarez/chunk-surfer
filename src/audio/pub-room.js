import {createPubRoomBed} from './pub-room-bed.js';
import {pubWorldFromLocal} from '../data/exterior-pub.js';
import {PUB_INTERIOR_LAYOUT} from '../data/exterior-pub-furnishings.js';
const point=id=>{const f=PUB_INTERIOR_LAYOUT.furniture.find(f=>f.id===id);return Object.freeze(pubWorldFromLocal(f));};
export const PUB_ROOM_SOUND_ANCHORS=Object.freeze({stove:point('pub-snug-stove'),glass:point('pub-counter'),crockery:point('pub-snug-table-0'),domino:point('pub-snug-table-1')});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
export function pubRoomSpatial(listener={},anchor=PUB_ROOM_SOUND_ANCHORS.stove,{inPub=true,doorOpen=false,busy=false}={}){
  const dx=anchor.x-(Number(listener.x)||0),dz=anchor.z-(Number(listener.z)||0),distance=Math.hypot(dx,dz),yaw=Number(listener.yaw)||0;
  return{distance,pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(2,distance),-.9,.9),
    gain:(inPub?1:doorOpen?.15:.028)*(busy?.28:1)/(1+distance*.11),cutoff:inPub?760:doorOpen?420:180};
}

// Furniture contacts remain sparse; the dedicated file layer supplies room
// company, the user’s quiet backbar music and transmitted exterior rain.
export function createPubRoomAudio({getAudio=()=>null,fetchImpl}={}){
  const roomBed=createPubRoomBed({getAudio,...(fetchImpl?{fetchImpl}:{})});
  let owner=null,bed=null,elapsed=0,nextAt=5.2,cursor=0,lastReason='idle',disposed=false;
  const contacts=new Set(),buffers=new Map();let createdContacts=0,peakVoices=0;
  const disconnect=voice=>{if(!voice||voice.stopped)return;voice.stopped=true;try{voice.source.stop();}catch{}for(const node of voice.nodes)try{node.disconnect();}catch{}contacts.delete(voice);};
  function stop(reason='stopped'){
    roomBed.pause(reason);disconnect(bed);bed=null;for(const voice of [...contacts])disconnect(voice);owner=null;buffers.clear();elapsed=0;nextAt=5.2;cursor=0;lastReason=reason;
  }
  function buffer(kind){
    if(buffers.has(kind))return buffers.get(kind);
    const ctx=owner.ctx,duration=kind==='stove'?5.7:kind==='glass'?.22:kind==='crockery'?.17:.10,size=Math.max(1,Math.ceil(ctx.sampleRate*duration)),b=ctx.createBuffer(1,size,ctx.sampleRate),data=b.getChannelData(0);let seed=19088743,brown=0;
    for(let i=0;i<size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/ctx.sampleRate;
      if(kind==='stove'){brown=brown*.985+noise*.015;data[i]=brown*.65;}
      else{const f=kind==='glass'?1730:kind==='crockery'?670:320,decay=Math.exp(-t*(kind==='domino'?65:kind==='glass'?23:32));data[i]=(Math.sin(t*f*Math.PI*2)*.52+Math.sin(t*f*1.47*Math.PI*2)*.22+noise*.23)*decay*Math.min(1,t/.0015);}
    }
    buffers.set(kind,b);return b;
  }
  function voice(kind,loop=false){
    const ctx=owner.ctx,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),panner=ctx.createStereoPanner?.()||ctx.createGain();
    source.buffer=buffer(kind);source.loop=loop;filter.type='lowpass';source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(owner.destination);
    const v={kind,source,filter,gain,panner,nodes:[source,filter,gain,panner],stopped:false,ends:ctx.currentTime+(loop?Infinity:source.buffer.duration)};
    if(!loop){contacts.add(v);source.onended=()=>disconnect(v);createdContacts++;}source.start();peakVoices=Math.max(peakVoices,(bed?1:0)+contacts.size+roomBed.snapshot().voices);return v;
  }
  function position(v,listener,options){const frame=pubRoomSpatial(listener,PUB_ROOM_SOUND_ANCHORS[v.kind],options),t=owner.ctx.currentTime;
    v.filter.frequency.setTargetAtTime(frame.cutoff,t,.04);v.gain.gain.setTargetAtTime(frame.gain*(v.kind==='stove'?.052:v.kind==='domino'?.035:.027),t,.05);v.panner.pan?.setTargetAtTime(frame.pan,t,.05);return frame;}
  const api={
    update({dt=0,listener={},inPub=false,nearPub=false,doorOpen=false,openDoorIds=null,busy=false,recording=false,paused=false,source=false,blurred=false}={}){
      if(disposed)return false;
      const audio=getAudio();
      if(paused||blurred||source||(!inPub&&!nearPub)||!audio?.ctx||!audio.destination||['closed','suspended'].includes(audio.ctx.state)){stop(source?'source':paused?'paused':blurred?'blurred':'outside');return false;}
      if(owner&&(owner.ctx!==audio.ctx||owner.destination!==audio.destination))stop('context-replaced');
      if(!owner){owner={ctx:audio.ctx,destination:audio.destination};bed=voice('stove',true);lastReason='playing';}
      roomBed.update({listener,inPub,nearPub,doorOpen,openDoorIds,busy,recording,paused,source,blurred});
      peakVoices=Math.max(peakVoices,(bed?1:0)+contacts.size+roomBed.snapshot().voices);
      const options={inPub,doorOpen,busy:busy||recording};position(bed,listener,options);
      for(const v of [...contacts]){if(v.ends<=owner.ctx.currentTime)disconnect(v);else position(v,listener,options);}
      elapsed+=clamp(dt,0,.25);
      if(busy||recording||!inPub){nextAt=Math.max(nextAt,elapsed+4);return true;}
      if(elapsed>=nextAt){
        if(contacts.size<2){const kind=['glass','domino','crockery','domino'][cursor++%4];position(voice(kind),listener,options);}
        nextAt=elapsed+6.5+(cursor%3)*2.1;
      }
      return true;
    },
    pause(){stop('paused');},stop,
    snapshot:()=>({active:!!bed,voices:(bed?1:0)+contacts.size+roomBed.snapshot().voices,nodes:(bed?4:0)+contacts.size*4+roomBed.snapshot().nodes,room:roomBed.snapshot(),contacts:contacts.size,createdContacts,peakVoices,elapsed,nextAt,reason:lastReason,cachedBuffers:buffers.size}),
    dispose(){stop('disposed');roomBed.dispose();disposed=true;},
  };
  return api;
}
