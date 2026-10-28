import {assetUrl} from '../platform/paths.js';
import {DOOR_AUDIO_ASSETS,DOOR_AUDIO_FAMILIES} from '../data/door-audio-assets.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
// Mechanism identity is explicit. Authored Source, van and ending doors keep
// their own performances; this schedule concerns ordinary building leaves.
export const DOOR_SOUND_FAMILY=Object.freeze({
  'public-glazed-pair':'heritage-glazed','bay-goods-pair':'metal',
  'hall-acoustic-pair':'acoustic','chapel-oak-pair':'timber',
  'practice-acoustic-single':'acoustic','staff-half-glazed':'timber',
  'tower-service-single':'timber','academic-wired-glass':'timber',
  'service-fire-single':'pushbar','service-wired-pair':'metal',
  'pool-fire-single':'pushbar','pool-glazed-pair':'glazed',
});

export function doorSoundSpatial(listener={},anchor={},occlusionDb=0){
  const dx=(anchor.x||0)-(listener.x||0),dz=(anchor.z||0)-(listener.z||0);
  const distance=Math.hypot(dx,dz,(anchor.y||0)-(listener.y||0)),yaw=Number(listener.yaw)||0;
  const loss=clamp(occlusionDb,0,42);
  return{distance,pan:clamp((dx*Math.cos(yaw)+dz*Math.sin(yaw))/Math.max(1.4,Math.hypot(dx,dz)),-.94,.94),
    gain:Math.pow(10,-loss/20)/(1+Math.max(0,distance-1.2)*.28),
    cutoff:18000*Math.pow(10,-loss/30)};
}

// Real performances, without synthetic pitch jitter. A bag belongs to a door
// and action; its boundary cannot immediately repeat the previous take.
export function createDoorTakeSelector(random=Math.random){
  const bags=new Map();
  return{next(key,ids){
    if(!ids?.length)return null;
    let bag=bags.get(key);
    if(!bag||bag.signature!==ids.join('|'))bag={signature:ids.join('|'),remaining:[],last:null};
    if(!bag.remaining.length){
      bag.remaining=[...ids];
      for(let i=bag.remaining.length-1;i>0;i--){const j=Math.floor(clamp(random(),0,.999999)*(i+1));[bag.remaining[i],bag.remaining[j]]=[bag.remaining[j],bag.remaining[i]];}
      if(bag.remaining.length>1&&bag.remaining.at(-1)===bag.last)[bag.remaining[0],bag.remaining[bag.remaining.length-1]]=[bag.remaining.at(-1),bag.remaining[0]];
    }
    const id=bag.remaining.pop();bag.last=id;bags.set(key,bag);return id;
  },reset(){bags.clear();}};
}

export function createDoorAudio({getAudio=()=>null,fetchImpl=(...a)=>fetch(...a),random=Math.random,
  assets=DOOR_AUDIO_ASSETS,families=DOOR_AUDIO_FAMILIES}={}){
  let ctx=null,destination=null,epoch=0,disposed=false,input=null,reason='idle',serial=0;
  const buffers=new Map(),loading=new Map(),errors=new Map(),voices=new Set(),queued=[];
  const selector=createDoorTakeSelector(random),history=[];
  function trace(row){history.push({...row,time:ctx?.currentTime||0});if(history.length>96)history.shift();}
  function release(v){
    if(!voices.delete(v))return;
    const now=v.context.currentTime;
    try{v.gain.gain.cancelScheduledValues(now);v.gain.gain.setValueAtTime(v.gain.gain.value,now);
      v.gain.gain.linearRampToValueAtTime?.(0,now+.022);v.source.stop(now+.025);}catch{}
    // Disconnect only once the short release has reached silence.
    v.source.onended=()=>{for(const n of v.nodes)try{n.disconnect();}catch{}};
  }
  function pause(why='paused'){epoch++;queued.length=0;for(const v of [...voices])release(v);input=null;reason=why;}
  function load(id){
    if(buffers.has(id))return Promise.resolve(buffers.get(id));
    if(loading.has(id))return loading.get(id);
    const asset=assets[id],context=ctx;if(!asset||!context)return Promise.resolve(null);
    // Decoding only warms a cache. It never schedules a source, so a completed
    // network request cannot resurrect a door after pause or a scene change.
    const task=Promise.resolve().then(()=>fetchImpl(assetUrl(asset.url))).then(r=>{if(!r?.ok)throw Error(`door ${id} HTTP ${r?.status}`);return r.arrayBuffer();})
      .then(b=>context.decodeAudioData(b)).then(b=>{if(!disposed&&context===ctx){buffers.set(id,b);errors.delete(id);}return b;})
      .catch(e=>{errors.set(id,String(e?.message||e));return null;}).finally(()=>{if(loading.get(id)===task)loading.delete(id);});
    loading.set(id,task);return task;
  }
  function idsFor(event){
    const family=DOOR_SOUND_FAMILY[event.portal?.definition?.archetype||event.portal?.archetype];
    const action=event.type==='bell'?'bell':event.type==='opening-start'?'open':event.type==='movement'&&event.started&&event.direction<0?'motionClose':event.type==='closed'?'close':null;
    let ids=action==='bell'?families.bell?.bell:families[family]?.[action]||families.legacy?.[action];
    // At the Lyric, the frame bell supplies the opening's physical transient.
    // Keep its recorded detail clear rather than masking it with the inherited
    // closing sample that formerly stood in for every opening.
    if(action==='open'&&['pub-west-entry','pub-east-entry'].includes(event.portal.id)&&ids?.every(id=>id==='legacy-open'))ids=[];
    return{family:action==='bell'?'bell':family,action,ids};
  }
  function position(v){
    const mix=doorSoundSpatial(input.listener,v.anchor,input.occlusion?.(v.portal)||0),now=ctx.currentTime;
    v.gain.gain.setTargetAtTime(mix.gain*v.level,now,.018);v.filter.frequency.setTargetAtTime(Math.max(280,mix.cutoff),now,.03);
    v.pan?.pan.setTargetAtTime(mix.pan,now,.025);v.mix=mix;
  }
  function play(item){
    const buffer=buffers.get(item.id);if(!buffer||!input)return false;
    if(voices.size>=12)release(voices.values().next().value);
    const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createStereoPanner?.();
    source.buffer=buffer;source.playbackRate.value=1;gain.gain.value=0;filter.type='lowpass';filter.Q.value=.5;
    source.connect(filter);filter.connect(gain);if(pan){gain.connect(pan);pan.connect(destination);}else gain.connect(destination);
    // A released/blocked closer resumes at its current travel phase. Replaying
    // the beginning would invent another handle or hinge act on each hold.
    const offset=item.action==='motionClose'?Math.min(Math.max(0,buffer.duration-.015),buffer.duration*(1-clamp(item.fraction,0,1))):0;
    const v={context:ctx,source,gain,filter,pan,nodes:[source,gain,filter,...(pan?[pan]:[])],portal:item.portal,anchor:item.anchor,
      level:Math.pow(10,(Number(assets[item.id].gainDb)||0)/20),id:item.id,action:item.action,ends:ctx.currentTime+buffer.duration-offset};
    voices.add(v);source.onended=()=>{voices.delete(v);for(const n of v.nodes)try{n.disconnect();}catch{}};position(v);source.start(0,offset);
    trace({event:'played',doorId:item.portal.id,clip:item.id,action:item.action,offset,latency:ctx.currentTime-item.at,mix:v.mix});return true;
  }
  function update(next={}){
    if(disposed)return snapshot();
    const audio=getAudio();
    if(!next.active||next.paused||next.blurred||!audio?.ctx||audio.ctx.state!=='running'||!audio.destination){
      if(input||voices.size||queued.length)pause(next.blurred?'blurred':next.paused?'paused':'inactive');return snapshot();
    }
    if(ctx!==audio.ctx){pause('context-replaced');ctx=audio.ctx;buffers.clear();loading.clear();errors.clear();}
    if(destination!==audio.destination){pause('destination-replaced');destination=audio.destination;}
    input=next;reason='ready';
    for(const p of next.nearDoors||[]){
      const family=DOOR_SOUND_FAMILY[p.definition?.archetype||p.archetype];
      for(const ids of Object.values(families[family]||families.legacy||{}))for(const id of ids)if(!errors.has(id))void load(id);
      if(p.keyId)for(const id of families.legacy?.key||[])if(!errors.has(id))void load(id);
      if(p.id==='pub-west-entry'||p.id==='pub-east-entry')for(const id of families.bell?.bell||[])if(!errors.has(id))void load(id);
    }
    for(const v of [...voices]){if(v.ends<=ctx.currentTime)release(v);else position(v);}
    for(let i=queued.length-1;i>=0;i--){
      const item=queued[i];
      if(item.epoch!==epoch||ctx.currentTime-item.at>.14){trace({event:'missed',doorId:item.portal.id,clip:item.id,reason:'deadline'});queued.splice(i,1);}
      else if(buffers.has(item.id)){play(item);queued.splice(i,1);}
    }
    return snapshot();
  }
  function event(e,anchor){
    if(!input||disposed)return false;
    if(e.type==='movement-stop'||e.type==='opened'||e.type==='closed'||e.type==='opening-start'){
      const cancelOpen=e.type==='opened'||e.type==='movement-stop'||e.type==='closed';
      for(const v of [...voices])if(v.portal.id===e.portal.id&&(v.action==='motionClose'||cancelOpen&&v.action==='open'))release(v);
      for(let i=queued.length-1;i>=0;i--)if(queued[i].portal.id===e.portal.id&&(queued[i].action==='motionClose'||cancelOpen&&queued[i].action==='open'))queued.splice(i,1);
    }
    if(e.type==='closing-start'){
      for(const v of [...voices])if(v.portal.id===e.portal.id&&v.action==='open')release(v);
      for(let i=queued.length-1;i>=0;i--)if(queued[i].portal.id===e.portal.id&&queued[i].action==='open')queued.splice(i,1);
    }
    const choices=[idsFor(e)];
    if(e.type==='opening-start'&&e.fromClosed&&e.portal.keyId)choices.push({action:'key',ids:families.legacy?.key});
    let accepted=false;
    for(const choice of choices){
    if(!choice.ids?.length)continue;
    const id=selector.next(`${e.portal.id}:${choice.action}`,choice.ids),item={id,portal:e.portal,anchor,action:choice.action,fraction:e.fraction,at:ctx.currentTime,epoch,serial:++serial};
    trace({event:'triggered',doorId:e.portal.id,clip:id,action:choice.action,fraction:e.fraction});
    if(!play(item)){void load(id);queued.push(item);}accepted=true;
    }return accepted;
  }
  function snapshot(){return{reason,voices:voices.size,queued:queued.length,ready:[...buffers.keys()],loading:[...loading.keys()],errors:Object.fromEntries(errors),history:[...history],
    active:[...voices].map(v=>({doorId:v.portal.id,clip:v.id,action:v.action,...v.mix}))};}
  function holdMotion(){
    for(const v of [...voices])if(v.action==='open'||v.action==='motionClose')release(v);
    for(let i=queued.length-1;i>=0;i--)if(queued[i].action==='open'||queued[i].action==='motionClose')queued.splice(i,1);
  }
  return{update,event,pause,holdMotion,stop:pause,reset(why='reset'){pause(why);selector.reset();history.length=0;},snapshot,
    whenReady:()=>Promise.all([...loading.values()]),dispose(){pause('disposed');disposed=true;buffers.clear();loading.clear();}};
}
