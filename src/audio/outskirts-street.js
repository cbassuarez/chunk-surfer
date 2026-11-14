// The repeating street has physical sources, not a second score. All output
// goes through the supplied world SFX bus, so the game's volume, mute, glass
// occlusion and HUSH processing retain ownership. No voices are synthesized.
import { assetUrl } from '../platform/paths.js';

const clamp=(value,low,high)=>Math.max(low,Math.min(high,Number(value)||0));
const BED_KINDS=new Set(['bus','lodge','car','body']);
const EVENT_KINDS=new Set(['bus-air','bus-door','bus-load','bus-exit','bus-woman-notice','bus-woman-pass','bus-entry-shut','bus-strip','bus-door-stuck','bus-body-open','bus-body-step','bus-body-expel','coat-rustle','footstep','hatch-impact','glass-knock','phone-ring','paper','pen','post-letter','ticket','fold-cloth','fold-pressure','fold-contact','fold-strain','fold-effort','woman-traction']);
const VAN_CRASH_CUES={
  'van-crash-approach':{gain:1.06,parts:[
    {tone:86,toneEnd:49,frequency:500,seconds:1.58,level:.44,attack:.23},
    {tone:176,toneEnd:100,frequency:840,seconds:1.55,level:.32,attack:.30},
    {frequency:400,filterEnd:1360,q:.77,seconds:1.59,level:.79,attack:1.12},
    {frequency:2000,filterEnd:650,q:1.4,seconds:.84,level:.23,delay:.71,attack:.40},
  ]},
  'van-crash-impact':{gain:1.42,parts:[
    {tone:105,toneEnd:42,frequency:900,seconds:.24,level:.62,attack:.006},
    {frequency:195,filterEnd:95,q:.65,seconds:.45,level:.82,attack:.004},
    {frequency:1620,filterEnd:460,q:1.8,seconds:.34,level:.70,attack:.004},
    {frequency:4050,filterEnd:2130,q:2.8,seconds:.25,level:.46,delay:.032,attack:.004},
    {frequency:790,filterEnd:380,seconds:.37,level:.36,delay:.12,attack:.013},
    {tone:217,toneEnd:170,frequency:530,seconds:.32,level:.18,delay:.15,attack:.010},
  ]},
  'van-crash-settle':{gain:.54,parts:[
    {frequency:2300,filterEnd:750,q:2.7,seconds:.22,level:.42,attack:.007},
    {tone:474,toneEnd:181,frequency:640,seconds:.43,level:.31,delay:.045,attack:.13},
    {frequency:540,filterEnd:220,seconds:.19,level:.53,delay:.38,attack:.013},
  ]},
  'van-crash-spill':{gain:.87,parts:[
    {lowpass:true,frequency:170,seconds:.65,level:.86,attack:.004},
    {frequency:1300,filterEnd:415,q:1,seconds:1.8,level:.85,attack:.23},
    {frequency:3700,filterEnd:1950,q:1.7,seconds:1.9,level:.60,delay:.13,attack:.23},
    {frequency:1100,filterEnd:900,q:3.8,seconds:.20,level:.58,delay:.47,attack:.013},
    {frequency:1530,filterEnd:850,q:2.9,seconds:.18,level:.39,delay:.91,attack:.01},
    {frequency:2210,filterEnd:950,q:3.6,seconds:.18,level:.26,delay:1.42,attack:.012},
  ]},
};
export const FOLD_SAMPLE_IDS=Object.freeze(['fold-effort-a','fold-effort-b','fold-effort-c','fold-effort-d','fold-catch','fold-cloth-a','fold-cloth-b','fold-cloth-c']);
async function loadFoldSample(id,context){
  const response=await fetch(assetUrl(`assets/audio/outskirts/${id}.wav`));
  if(!response.ok)throw new Error(`fold sample ${id}: ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export function outskirtsStreetPlacement(source={},listener={}){
  const dx=(Number(source.x)||0)-(Number(listener.x)||0);
  const dz=(Number(source.z)||0)-(Number(listener.z)||0);
  const dy=Number.isFinite(source.y)&&Number.isFinite(listener.y)?source.y-listener.y:0;
  const distance=Math.hypot(dx,dy,dz),yaw=Number(listener.yaw)||0;
  return {
    distance,
    pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(1,distance),-.92,.92),
    gain:distance>=64?0:1/(1+(distance/5.5)**1.65),
  };
}

export function createOutskirtsStreetAudio({getAudio=()=>null,loadSample=loadFoldSample}={}){
  let ctx=null,destination=null,noiseBuffer=null,disposed=false,paused=false,listener={},fallingVan=null;
  let sampleEpoch=0,sampleRequested=false,sampleFailures=0;
  const samples=new Map();
  const beds=new Map(),voices=new Set(),seen=new Set();
  function disconnect(node){try{node?.disconnect();}catch(_){}}
  function release(record){
    if(!record||record.dead)return;
    record.dead=true;
    for(const source of record.sources){source.onended=null;try{source.stop(ctx?.currentTime||0);}catch(_){}}
    for(const node of record.nodes)disconnect(node);
    voices.delete(record);
    if(fallingVan===record)fallingVan=null;
  }
  function clear(){for(const record of [...voices])release(record);beds.clear();}
  function audio(){
    const next=getAudio?.();
    if(!next?.ctx||!next.destination||next.ctx.state==='closed')return false;
    if(ctx!==next.ctx||destination!==next.destination){clear();noiseBuffer=null;ctx=next.ctx;destination=next.destination;sampleEpoch++;sampleRequested=false;sampleFailures=0;samples.clear();}
    return typeof ctx.createBufferSource==='function'&&typeof ctx.createGain==='function';
  }
  function preloadFold(){
    if(sampleRequested||typeof ctx?.decodeAudioData!=='function')return;
    sampleRequested=true;
    const epoch=sampleEpoch,context=ctx;
    for(const id of FOLD_SAMPLE_IDS){
      Promise.resolve().then(()=>loadSample(id,context)).then(buffer=>{
        if(!disposed&&epoch===sampleEpoch&&buffer)samples.set(id,buffer);
      }).catch(()=>{if(!disposed&&epoch===sampleEpoch)sampleFailures++;});
    }
  }
  function noise(){
    if(noiseBuffer)return noiseBuffer;
    const rate=Number(ctx.sampleRate)||48000,length=Math.floor(rate*1.91);
    noiseBuffer=ctx.createBuffer(1,length,rate);
    const data=noiseBuffer.getChannelData(0);let seed=0x19884417,previous=0;
    for(let i=0;i<length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      previous=previous*.35+((seed/0xffffffff)*2-1)*.65;
      data[i]=previous*Math.max(0,Math.min(1,i/(rate*.008),(length-i-1)/(rate*.008)));
    }
    return noiseBuffer;
  }
  function recordAt(place,level){
    const record={place:{x:Number(place.x)||0,y:place.y,z:Number(place.z)||0},level,sources:[],nodes:[],dead:false};
    const own=node=>{record.nodes.push(node);return node;};
    record.own=own;record.amp=own(ctx.createGain());
    record.pan=typeof ctx.createStereoPanner==='function'?own(ctx.createStereoPanner()):null;
    if(record.pan){record.amp.connect(record.pan);record.pan.connect(destination);}
    else record.amp.connect(destination);
    voices.add(record);position(record,true);
    return record;
  }
  function position(record,immediate=false){
    const place=outskirtsStreetPlacement(record.place,listener),at=ctx.currentTime;
    const gain=paused?0:record.level*place.gain;
    const set=(param,value)=>{
      if(!immediate&&typeof param.setTargetAtTime==='function')param.setTargetAtTime(value,at,.07);
      else param.setValueAtTime(value,at);
    };
    set(record.amp.gain,gain);if(record.pan)set(record.pan.pan,place.pan);
  }
  function layer(record,{tone=null,toneEnd=null,frequency=500,filterEnd=null,q=.7,level=1,seconds=null,delay=0,attack=.008,lowpass=false}={}){
    const own=record.own,source=own(tone===null?ctx.createBufferSource():ctx.createOscillator());
    record.sources.push(source);
    if(tone===null){source.buffer=noise();source.loop=seconds===null;}
    else{source.type='sine';source.frequency.value=tone;}
    const filter=own(ctx.createBiquadFilter());filter.type=tone===null&&!lowpass?'bandpass':'lowpass';filter.frequency.value=frequency;filter.Q.value=q;
    const amp=own(ctx.createGain()),at=ctx.currentTime+delay;
    amp.gain.setValueAtTime(seconds===null?level:0,ctx.currentTime);
    if(seconds!==null){
      if(toneEnd!==null){
        source.frequency.setValueAtTime(tone,at);
        source.frequency.linearRampToValueAtTime(toneEnd,at+seconds);
      }
      if(filterEnd!==null){
        filter.frequency.setValueAtTime(frequency,at);
        filter.frequency.linearRampToValueAtTime(filterEnd,at+seconds);
      }
      amp.gain.setValueAtTime(0,at);amp.gain.linearRampToValueAtTime(level,at+attack);
      amp.gain.linearRampToValueAtTime(0,at+Math.max(attack+.003,seconds));
    }
    source.connect(filter);filter.connect(amp);amp.connect(record.amp);source.start(at);
    if(seconds!==null)source.stop(at+seconds+.015);
    return source;
  }
  function bed(spec){
    const record=recordAt(spec,clamp(spec.gain,0,1)*.055);
    record.kind=spec.kind;record.next=ctx.currentTime+1;
    if(spec.kind==='lodge'){
      layer(record,{tone:100,frequency:550,level:.22});
      layer(record,{frequency:340,level:.12});
    }else if(spec.kind==='body'){
      layer(record,{frequency:120,level:.12});
      layer(record,{frequency:480,level:.035});
    }else if(spec.kind==='bus'){
      // Its engine is off: air settling in the body, not an idling motor.
      layer(record,{frequency:175,level:.16});
      layer(record,{tone:72,frequency:250,level:.07});
    }else{
      // The parked car is cooling. Its radio has a muffled carrier; the clock
      // uses nonverbal pips until a real speaking-clock recording is supplied.
      layer(record,{frequency:850,level:.15});
    }
    return record;
  }
  function finite(place,level,parts){
    if(voices.size>=48)return false;
    const record=recordAt(place,level),sources=parts.map(part=>layer(record,part));
    let remaining=sources.length;
    for(const source of sources)source.onended=()=>{if(--remaining===0)release(record);};
    return record;
  }
  function recorded(place,level,id,{rate=1,lowpass=4800}={}){
    const buffer=samples.get(id);
    if(!buffer||voices.size>=48)return false;
    const record=recordAt(place,level),own=record.own;
    const source=own(ctx.createBufferSource()),filter=own(ctx.createBiquadFilter());
    source.buffer=buffer;source.loop=false;
    if(source.playbackRate)source.playbackRate.value=rate;
    filter.type='lowpass';filter.frequency.value=lowpass;filter.Q.value=.6;
    source.connect(filter);filter.connect(record.amp);record.sources.push(source);
    source.onended=()=>release(record);source.start(ctx.currentTime);
    source.stop(ctx.currentTime+buffer.duration/rate+.025);
    return true;
  }
  function foldSound(spec,level){
    let seed=2166136261;for(const c of String(spec.id||''))seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;
    const variant=Number.isFinite(spec.variant)?Math.abs(Math.trunc(spec.variant)):seed;
    const cloth=`fold-cloth-${['a','b','c'][variant%3]}`;
    const clothPlayed=recorded(spec,level*.62,cloth,{rate:.82+(variant%3)*.055,lowpass:3600});
    if(spec.cue==='fold-pressure')recorded(spec,level*.30,'fold-catch',{rate:.92,lowpass:2600});
    if(spec.cue==='fold-strain'||spec.cue==='fold-effort'){
      recorded(spec,level*.72,`fold-effort-${['a','b','c','d'][variant%4]}`,{rate:.92+(variant%3)*.025,lowpass:3300});
    }
    if(spec.cue==='fold-contact')finite(spec,level*.46,[{frequency:230,seconds:.16,level:.4,attack:.005},{tone:118,frequency:1300,seconds:.22,level:.13,attack:.004}]);
    if(!clothPlayed)finite(spec,level*.18,[{frequency:780,seconds:.44,level:.22,attack:.04}]);
    return true;
  }
  function event(spec){
    const crash=Object.hasOwn(VAN_CRASH_CUES,spec.cue)?VAN_CRASH_CUES[spec.cue]:null;
    if(crash){
      const voice=finite(spec,crash.gain*clamp(spec.strength??1,0,1),crash.parts);
      if(voice&&spec.cue==='van-crash-approach')fallingVan=voice;
      return !!voice;
    }
    if(!EVENT_KINDS.has(spec.cue))return false;
    const level=clamp(spec.strength??1,0,1)*.13;
    if(spec.cue==='woman-traction'){
      // The woman has no borrowed effort voice. This is a quiet recorded
      // sleeve/body-weight movement, spatially attached to her actual action.
      const pull=spec.variant===1;
      return recorded(spec,level,pull?'fold-cloth-c':'fold-cloth-b',{
        rate:pull?.88:.96,lowpass:pull?2500:3200,
      });
    }
    if(spec.cue.startsWith('fold-'))return foldSound(spec,level);
    const burst=(frequency,seconds,gain=1,delay=0)=>({frequency,seconds,level:gain,delay,attack:.003});
    const tone=(hz,seconds,gain=1,delay=0)=>({tone:hz,frequency:2200,seconds,level:gain,delay,attack:.004});
    let parts;
    switch(spec.cue){
      case 'bus-air':parts=[burst(1400,.8,.55),burst(320,.3,.28)];break;
      case 'bus-door':parts=[burst(1180,.64,.36),burst(190,.18,.42,.38),tone(82,.16,.12,.40)];break;
      case 'bus-load':parts=[burst(260,.46,.30),tone(104,.58,.11),burst(930,.28,.14,.19)];break;
      case 'bus-exit':parts=[burst(180,.22,.34),burst(1400,.09,.13,.07)];break;
      case 'bus-entry-shut':parts=[burst(1200,.37,.24),burst(140,.22,.64,.30),burst(2300,.045,.20,.47)];break;
      case 'bus-strip':parts=[burst(2600,.055,.13),burst(470,.075,.07,.05)];break;
      case 'bus-door-stuck':
        parts=[burst(870,.18,.19,.30),... [.46,.78,1.08].flatMap(delay=>[burst(210,.12,.40,delay),burst(1600,.045,.24,delay+.035)])];break;
      case 'bus-body-open':
        recorded(spec,level*.72,'fold-cloth-c',{rate:.55,lowpass:2300});
        parts=[burst(240,.70,.20,.25),burst(490,.68,.24,.95),burst(170,.48,.30,1.78),burst(1100,.28,.14,2.45)];break;
      // The accepted player contact owns the sole and wet tissue layer through
      // roomtone's shared footstep renderer. Keep this narrative event spent,
      // without adding a second synthetic footfall on the same contact.
      case 'bus-body-step':return false;
      case 'bus-body-expel':
        recorded(spec,level*.54,'fold-cloth-b',{rate:.70,lowpass:2100});
        parts=[burst(530,.46,.39),burst(170,.22,.48,.24),burst(1600,.13,.15,.31)];break;
      case 'bus-woman-notice':
        recorded(spec,level*.64,'fold-cloth-b',{rate:.82,lowpass:2900});
        parts=[burst(720,.42,.15),burst(170,.17,.10,.24)];break;
      case 'bus-woman-pass':
        recorded(spec,level*.78,'fold-cloth-c',{rate:.72,lowpass:2700});
        parts=[burst(310,.31,.27),burst(1320,.08,.16,.09)];break;
      case 'coat-rustle':parts=[burst(900,.32,.45),burst(1800,.2,.18,.12)];break;
      case 'footstep':parts=[burst(210,.17,.65),burst(1350,.09,.2,.035)];break;
      case 'hatch-impact':parts=[burst(160,.26,.8),tone(87,.22,.3),burst(1300,.035,.32)];break;
      case 'glass-knock':parts=[burst(1400,.045,.55),tone(740,.09,.3),burst(1400,.04,.4,.17)];break;
      case 'phone-ring':parts=[tone(760,.42,.25),tone(990,.42,.17),tone(760,.42,.25,.64),tone(990,.42,.17,.64)];break;
      case 'pen':parts=[burst(2000,.25,.12),burst(1600,.15,.09,.3)];break;
      case 'post-letter':parts=[burst(900,.21,.2),burst(240,.11,.35,.55)];break;
      case 'ticket':parts=[burst(1450,.17,.2),burst(1000,.15,.15,.12)];break;
      default:parts=[burst(1200,.28,.22),burst(1900,.19,.12,.16)];break;
    }
    return finite(spec,level,parts);
  }
  function remember(id){
    if(!id)return true;
    if(seen.has(id))return false;
    seen.add(id);
    // This is an audio delivery guard, not narrative persistence. Runtime owns
    // event history; retain a bounded tail across pause and context recovery.
    if(seen.size>256)seen.delete(seen.values().next().value);
    return true;
  }
  function update(frame={},options={}){
    if(disposed)return false;
    listener=options.listener||listener;
    if(options.paused===true){pause();return false;}
    if(paused)resume();
    if(!audio()){clear();return false;}
    preloadFold();
    try{
      const active=new Set();
      for(const spec of (frame?.beds||[]).slice(0,8)){
        if(!spec?.id||!BED_KINDS.has(spec.kind)||!(Number(spec.gain)>0)||outskirtsStreetPlacement(spec,listener).gain===0)continue;
        active.add(spec.id);
        let record=beds.get(spec.id);
        if(record&&record.kind!==spec.kind){release(record);beds.delete(spec.id);record=null;}
        if(!record){record=bed(spec);beds.set(spec.id,record);}
        record.place={x:Number(spec.x)||0,z:Number(spec.z)||0};record.level=clamp(spec.gain,0,1)*.055;
        if(spec.kind==='car'&&ctx.currentTime>=record.next){
          const at=ctx.currentTime;
          record.next=at+8;
          finite(spec,clamp(spec.gain,0,1)*.045,[{frequency:2200,seconds:.025,level:.28,attack:.002}]);
          finite(spec,clamp(spec.gain,0,1)*.025,[0,.4,.8].map(delay=>({tone:1000,frequency:1400,seconds:.06,level:.5,delay,attack:.005})));
        }
      }
      for(const [id,record] of beds)if(!active.has(id)){release(record);beds.delete(id);}
      for(const spec of frame?.events||[])if(remember(spec?.id))event(spec||{});
      const van=frame.vanCrash;
      if(fallingVan&&Number.isFinite(van?.worldY))fallingVan.place={x:van.x,y:van.worldY,z:van.z};
      for(const record of voices)position(record);
      return true;
    }catch(_){clear();return false;}
  }
  function pause(){if(disposed||paused)return;paused=true;clear();}
  function rebase({x=0,z=0}={}){
    if(disposed||!Number.isFinite(x)||!Number.isFinite(z))return false;
    listener={...listener,x:(Number(listener.x)||0)+x,z:(Number(listener.z)||0)+z};
    for(const record of voices)record.place={...record.place,x:record.place.x+x,z:record.place.z+z};
    // Gains, phases, scheduled cooling pips and delivery history are retained.
    return true;
  }
  function resume(){if(!disposed)paused=false;}
  function stop(){clear();seen.clear();noiseBuffer=null;}
  function destroy(){stop();disposed=true;sampleEpoch++;samples.clear();ctx=null;destination=null;}
  return {update,pause,resume,stop,destroy,rebase,snapshot:()=>({beds:beds.size,voices:voices.size,paused,disposed,samplesReady:samples.size,sampleFailures})};
}
