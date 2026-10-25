import {assetUrl} from '../platform/paths.js';
import {EXTERIOR_PUB,pubWorldFromLocal} from '../data/exterior-pub.js';
import {PUB_INTERIOR_LAYOUT} from '../data/exterior-pub-furnishings.js';

export const PUB_ROOM_FILES=Object.freeze({
  music:assetUrl('audio/pub-room/29-bar-radio.mp3'),
  company:assetUrl('audio/pub-room/company.mp3'),
  rain:assetUrl('audio/pub-room/rain-window.mp3'),
});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const point=id=>pubWorldFromLocal(PUB_INTERIOR_LAYOUT.furniture.find(f=>f.id===id));
export const PUB_ROOM_BED_ANCHORS=Object.freeze({music:Object.freeze(point('pub-backbar')),company:Object.freeze(point('pub-snug-table-1'))});
const bearing=(listener,anchor)=>{
  const dx=anchor.x-(Number(listener.x)||0),dz=anchor.z-(Number(listener.z)||0),distance=Math.hypot(dx,dz),yaw=Number(listener.yaw)||0;
  return{distance,pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(2,distance),-.8,.8)};
};
// Rain is transmitted at actual facade apertures, never placed around the head
// or restarted as a second outdoor storm. Opening a leaf admits a brighter,
// local path; shut glass still transmits quieter high-frequency patter.
export function pubRoomBedFrame({listener={},inPub=false,nearPub=false,doorOpen=false,openDoorIds=null,busy=false,recording=false}={}){
  const quiet={gain:0,cutoff:300,pan:0};
  if(!inPub&&!nearPub)return{music:{...quiet},company:{...quiet},rain:{...quiet},reason:'outside'};
  busy=busy||recording;
  const open=EXTERIOR_PUB.doors.filter(d=>Array.isArray(openDoorIds)?openDoorIds.includes(d.id):doorOpen);
  const door=open.reduce((a,d)=>!a||bearing(listener,d).distance<bearing(listener,a).distance?d:a,null);
  const room=(kind,level,cutoff)=>{
    const at=bearing(listener,inPub?PUB_ROOM_BED_ANCHORS[kind]:door||EXTERIOR_PUB.doors.reduce((a,d)=>bearing(listener,d).distance<bearing(listener,a).distance?d:a));
    return{...at,gain:level*(inPub?1:door?.18:.025)*(busy?.25:1)/(1+at.distance*.09),cutoff:inPub?cutoff:door?1500:220};
  };
  const music=room('music',.25,5200),company=room('company',.075,2400);
  let rain={...quiet};
  if(inPub){
    const paths=EXTERIOR_PUB.windows.map(w=>{
      const at=bearing(listener,{x:clamp(listener.x,w.x-w.width/2,w.x+w.width/2),z:EXTERIOR_PUB.frontWorldZ});
      return{...at,gain:.085/(1+at.distance*.50),cutoff:1150};
    });
    for(const d of open){const at=bearing(listener,d);paths.push({...at,gain:.16/(1+at.distance*.65),cutoff:4300});}
    // One strongest transmission avoids summing four copies of the same rain.
    rain=paths.reduce((a,p)=>p.gain>a.gain?p:a,rain);
    rain={...rain,gain:rain.gain*(busy?.48:1)};
  }
  return{music,company,rain,reason:inPub?'inside':door?'open-door-leak':'closed-door-leak'};
}

// Three persistent file voices at most; no timers and no autonomous context
// resume. Only update may start playback, so completed fetches cannot sound
// after pause, blur, Source entry or shutdown.
export function createPubRoomBed({getAudio=()=>null,fetchImpl=(...args)=>fetch(...args)}={}){
  let disposed=false,ctx=null,destination=null,musicDestination=null,epoch=0,reason='idle';
  const buffers=new Map(),pending=new Map(),errors=new Map(),retryAt=new Map(),voices=new Map(),offsets=new Map();
  const release=(kind)=>{
    const v=voices.get(kind);if(!v)return;
    offsets.set(kind,(v.offset+Math.max(0,v.ctx.currentTime-v.started))%v.source.buffer.duration);voices.delete(kind);
    try{v.gain.gain.cancelScheduledValues(v.ctx.currentTime);v.gain.gain.setValueAtTime(0,v.ctx.currentTime);}catch{}
    try{v.source.stop();}catch{}for(const n of v.nodes)try{n.disconnect();}catch{}
  };
  function pause(why='paused'){for(const kind of [...voices.keys()])release(kind);reason=why;return snapshot();}
  function load(kind){
    if(buffers.has(kind)||pending.has(kind)||!ctx?.decodeAudioData||typeof fetchImpl!=='function'||ctx.currentTime<(retryAt.get(kind)||0))return;
    const context=ctx,token=epoch;
    const task=Promise.resolve().then(()=>fetchImpl(PUB_ROOM_FILES[kind])).then(r=>{
      if(!r?.ok)throw Error(`pub ${kind} HTTP ${r?.status}`);return r.arrayBuffer();
    }).then(b=>context.decodeAudioData(b)).then(b=>{
      if(!disposed&&token===epoch&&b?.duration>0){buffers.set(kind,b);errors.delete(kind);}
    }).catch(e=>{if(!disposed&&token===epoch){errors.set(kind,String(e?.message||e));retryAt.set(kind,context.currentTime+10);}})
      .finally(()=>{if(pending.get(kind)===task)pending.delete(kind);});
    pending.set(kind,task);
  }
  function update(input={}){
    if(disposed)return snapshot();
    const a=getAudio(),frame=pubRoomBedFrame(input);
    if(input.paused||input.blurred||input.source||(!input.inPub&&!input.nearPub)||!a?.ctx||a.ctx.state!=='running'||!a.destination)
      return pause(input.source?'source':input.blurred?'blurred':input.paused?'paused':'outside');
    if(ctx!==a.ctx){pause('context-replaced');ctx=a.ctx;buffers.clear();pending.clear();retryAt.clear();epoch++;}
    if(destination!==a.destination||musicDestination!==(a.musicDestination||a.destination))pause('destination-replaced');
    destination=a.destination;musicDestination=a.musicDestination||a.destination;reason=frame.reason;
    for(const kind of Object.keys(PUB_ROOM_FILES)){
      const mix=frame[kind];if(!mix.gain){release(kind);continue;}
      if(!buffers.has(kind)){load(kind);continue;}
      let v=voices.get(kind);
      if(!v){
        const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),pan=ctx.createStereoPanner?.();
        source.buffer=buffers.get(kind);source.loop=true;filter.type='lowpass';filter.Q.value=.5;gain.gain.value=0;
        source.connect(filter);filter.connect(gain);const sink=kind==='music'?musicDestination:destination;
        if(pan){gain.connect(pan);pan.connect(sink);}else gain.connect(sink);
        const offset=(offsets.get(kind)||0)%source.buffer.duration;
        v={ctx,source,filter,gain,pan,offset,started:ctx.currentTime,nodes:[source,filter,gain,...(pan?[pan]:[])]};voices.set(kind,v);source.start(0,offset);
      }
      v.filter.frequency.setTargetAtTime(mix.cutoff,ctx.currentTime,.16);v.gain.gain.setTargetAtTime(mix.gain,ctx.currentTime,input.busy?.07:.35);v.pan?.pan.setTargetAtTime(mix.pan,ctx.currentTime,.2);v.mix=mix;
    }
    return snapshot();
  }
  function snapshot(){return{active:!!voices.size,voices:voices.size,nodes:[...voices.values()].reduce((n,v)=>n+v.nodes.length,0),ready:[...buffers.keys()],loading:[...pending.keys()],errors:Object.fromEntries(errors),reason,layers:Object.fromEntries([...voices].map(([k,v])=>[k,{...v.mix,offset:(v.offset+Math.max(0,v.ctx.currentTime-v.started))%v.source.buffer.duration}]))};}
  return{update,pause,stop(){pause('stopped');offsets.clear();},snapshot,whenReady:()=>Promise.all([...pending.values()]),dispose(){pause('disposed');disposed=true;epoch++;buffers.clear();pending.clear();offsets.clear();}};
}
