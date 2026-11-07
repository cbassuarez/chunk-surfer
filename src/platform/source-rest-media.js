import {compileWindowCompositionPlan} from './window-composition.js';
import {createSourceRestWindowArchitectureComposer} from '../render/source-rest-window-architecture.js';
import {sourceRestAperturePairAsync,encodeSourceRestAperturePairAsync,SOURCE_REST_APERTURES} from '../render/source-rest-apertures.js';

// These are the existing silent media, not additional documentary memories.
// Their changing relationships follow the same performance as the world.
export const SOURCE_REST_MEDIA_BEATS=Object.freeze([
  {id:'funeral',at:0,assets:['bellringers-datamosh','cathedral']},
  {id:'making',at:.14,assets:['performance-capture','pollination']},
  {id:'room',at:.29,assets:['cathedral','clouds']},
  {id:'return',at:.45,assets:['performance-capture','mimosa-response']},
  {id:'weather',at:.61,assets:['clouds','eclipse']},
  {id:'failing',at:.77,assets:['sunflower-datamosh','flowers-seb']},
  // The end gives way: the evidence dissolves into pure symbol, then disperses.
  {id:'dissolution',at:.87,assets:['orion-nebula-flythrough','sea-nettle-jellyfish']},
  {id:'dispersal',at:.95,assets:['starling-murmuration','orion-nebula-flythrough']},
].map(value=>Object.freeze({...value,assets:Object.freeze(value.assets)})));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
export function sourceRestMediaBeat({phase,music={},rest={}}={}){
  if(!['wrong-return','catch'].includes(phase)||!['sitting','seated'].includes(rest.mode)
    ||rest.presentation?.suppressPeripheral||rest.narrativeProgress>=.95||music.failed)return null;
  const ratio=Math.max(0,Math.min(1,finite(music.currentTime)/Math.max(1,finite(music.duration,phase==='catch'?843.157:716.4))));
  // The world wins over a generic chapter edit: a returning practice room,
  // case electronics or the actual bounded flood should have an answer beside
  // it, even when a late arrival has shifted the conversation's musical place.
  const worldBeat=rest.weather?.stormAge>=0&&rest.weather.stormAge<54?'weather'
    :rest.memory?.drive>.1?'weather':rest.memory?.listener?'making'
    :rest.memory?.ellery>.1?'room':phase==='catch'&&music.revoicing?.electronic>.65?'failing':null;
  if(worldBeat)return SOURCE_REST_MEDIA_BEATS.find(beat=>beat.id===worldBeat);
  let index=0;for(let n=1;n<SOURCE_REST_MEDIA_BEATS.length;n++)if(ratio>=SOURCE_REST_MEDIA_BEATS[n].at)index=n;
  return SOURCE_REST_MEDIA_BEATS[index];
}
export function sourceRestMediaPlan({phase,initial='funeral',reducedMotion=false,flashMode='full'}={}){
  if(!['wrong-return','catch'].includes(phase))throw Error('Unknown listening performance.');
  const first=SOURCE_REST_MEDIA_BEATS.find(beat=>beat.id===initial)||SOURCE_REST_MEDIA_BEATS[0];
  const ids=['rest:source','rest:answer'];
  const assets=beat=>phase==='catch'&&beat.id==='return'
    ?['performance-capture','sunflower-datamosh']:beat.assets;
  return compileWindowCompositionPlan({compositionId:`source-rest:${phase}`,sceneId:'source:continuation',purpose:'source-study',
    epochMs:0,reducedMotion,flashMode,foldDurationMs:1,
    surfaces:ids.map((id,index)=>({id,content:{kind:'video',assetId:assets(first)[index]},clockMode:'source',
      initial:{x:index?.90:.10,y:index?.29:.18},entry:{x:index?.90:.10,y:index?.29:.18},
      width:index?220:260,height:index?150:176,shader:'violet-dither',draggable:false,sensitivity:'none',
      description:index?'A filmed response to the visible world':'A silent fragment beside the listening place'})),
    score:{durationMs:3600000,loop:false,cues:SOURCE_REST_MEDIA_BEATS.map(beat=>({id:`rest-${beat.id}`,event:`rest:${beat.id}`,
      operations:[{type:'assign',transition:reducedMotion?'cut':'dissolve',durationMs:reducedMotion?0:850,
        assignments:Object.fromEntries(ids.map((id,index)=>[id,{content:{kind:'video',assetId:assets(beat)[index]},clockMode:'source'}]))}]}))},
    completion:{mode:'nonblocking'},formation:{mode:'study',durationMs:1,staggerMs:0},
    fault:{profile:'violet-dither',intensity:0,seed:219,cadenceMs:900},
  });
}

// One composition lease spans the sitting. Beat changes are semantic events,
// never new fullscreen transactions or a queue of missed past footage.
function createLegacySourceRestMediaPresentation({director,beforeBegin=async()=>{},getSettings=()=>({}),onTrace=()=>{}}={}){
  let owner=null,phase=null,latest=null,presented=false,beat=null,key=null,held=false,version=0,tail=Promise.resolve();
  const trace=value=>{try{onTrace(value);}catch{}};
  function end(reason='rest-ended'){
    if(!owner)return tail;
    const oldKey=key;version++;owner=phase=latest=beat=key=null;presented=false;held=false;
    tail=tail.then(()=>director?.endStudy?.(oldKey)).catch(error=>trace({type:'error',reason,message:String(error)}));
    return tail;
  }
  function update({owner:nextOwner=null,phase:nextPhase=null,rest=null,music=null,held:nextHeld=false}={}){
    const wanted=sourceRestMediaBeat({phase:nextPhase,rest:rest||{},music:music||{}});
    if(!nextOwner||!wanted){if(owner)void end();return;}
    latest={phase:nextPhase,rest,music};held=!!nextHeld;
    if(owner!==nextOwner||phase!==nextPhase){
      if(owner)void end('owner-changed');
      owner=nextOwner;phase=nextPhase;beat=wanted.id;key=`source-rest-media:${++version}`;
      const epoch=version,current=()=>epoch===version&&owner===nextOwner;
      tail=tail.then(async()=>{
        await beforeBegin();if(!current())return;
        const settings=getSettings()||{},initial=sourceRestMediaBeat(latest);
        if(!initial)return;
        const report=await director?.beginStudy?.(sourceRestMediaPlan({phase:nextPhase,initial:initial.id,...settings}),{key,isCurrent:current});
        if(!current())return;
        presented=!!report;beat=initial.id;director?.holdComposition?.(held);
        const now=sourceRestMediaBeat(latest);
        if(now&&now.id!==beat){director?.compositionEvent?.(`rest:${now.id}`);beat=now.id;}
        trace({type:'presented',phase:nextPhase,beat,native:!!report?.native,available:presented});
      }).catch(error=>trace({type:'error',message:String(error)}));
    }else if(presented){
      director?.holdComposition?.(held);
      if(!held&&wanted.id!==beat){director?.compositionEvent?.(`rest:${wanted.id}`);beat=wanted.id;}
    }
  }
  return{update,stop:end,whenIdle:()=>tail,snapshot:()=>({owner,phase,beat,presented,held,key})};
}

export function sourceRestAperturePlan({phase,reducedMotion=false,flashMode='full'}={}){
  if(!['wrong-return','catch'].includes(phase))throw Error('Unknown listening performance.');
  const ids=['rest:source','rest:answer'],responses={making:'performance-capture',room:'cathedral',weather:'clouds'};
  return compileWindowCompositionPlan({compositionId:`source-rest:apertures:${phase}`,sceneId:'source:continuation',purpose:'source-study',epochMs:0,reducedMotion,flashMode,
    surfaces:ids.map((id,index)=>({id,content:{kind:'procedural',preset:'empty-field'},clockMode:'source',initial:{x:index?.90:.10,y:index?.30:.18},entry:{x:index?.90:.10,y:index?.30:.18},
      width:240,height:160,shader:'violet-dither',draggable:false,sensitivity:'none',description:'An impossible aperture into the same listening place'})),
    score:{durationMs:3600000,loop:false,cues:Object.entries(responses).map(([id,assetId])=>({id:'aperture-'+id,event:'aperture:'+id,operations:[{type:'assign',transition:reducedMotion?'cut':'dissolve',durationMs:reducedMotion?0:220,
      assignments:{'rest:answer':{content:{kind:'video',assetId},clockMode:'source'}}}]}))},
    completion:{mode:'nonblocking'},formation:{mode:'study',durationMs:0,staggerMs:0},fault:{profile:'violet-dither',intensity:0,seed:219,cadenceMs:900}});
}
const canonicalArrayIds=new WeakMap();let nextCanonicalArrayId=0;
function arrayIdentity(value){
  if(!value||typeof value!=='object')return 0;
  if(!canonicalArrayIds.has(value))canonicalArrayIds.set(value,++nextCanonicalArrayId);
  return canonicalArrayIds.get(value);
}
function fingerprint(frame){
  let hash=2166136261;const add=v=>{const s=String(v);for(let n=0;n<s.length;n++)hash=Math.imul(hash^s.charCodeAt(n),16777619);};
  add(frame.phase);for(const v of [...(frame.eye||[]),...(frame.basis?.right||[]),...(frame.basis?.up||[])])add(Math.round(v*10000));
  add(frame.revision);
  // Canonical arrays are immutable and reused by the renderer. Deforming
  // providers increment frame/mesh revision instead of rescanning vertices
  // in the synchronous game update; replacement arrays retain their identity.
  for(const g of(frame.geometry||[]).slice(0,24)){add(g.id);add(g.revision);for(const v of(g.matrix||[]))add(Math.round(v*10000));for(const v of(g.base||[]))add(Math.round(v*1000));add(arrayIdentity(g.p));add(arrayIdentity(g.i));add(g.p?.length);add(g.i?.length);}
  return String(hash>>>0);
}
/** Runtime defaults to owned architecture. Legacy film plans are available
 * only through the explicit diagnostic option, never as missing-frame filler. */
function createSampledSourceRestMediaPresentation({director,beforeBegin=async()=>{},getSettings=()=>({}),getFrame=()=>null,
  renderPair=sourceRestAperturePairAsync,encodePair=encodeSourceRestAperturePairAsync,documentApi=globalThis.document,
  now=()=>globalThis.performance?.now?.()??Date.now(),onTrace=()=>{},diagnosticLegacy=false}={}){
  if(diagnosticLegacy)return createLegacySourceRestMediaPresentation({director,beforeBegin,getSettings,onTrace});
  let owner=null,phase=null,key=null,version=0,revision=0,presented=false,delivered=false,held=false,response=null,lastFingerprint='',lastSent=-Infinity,tail=Promise.resolve(),publishing=false,diagnostics=null,unavailableOwner=null;
  const trace=value=>{try{onTrace(value);}catch{}};
  function stop(reason='rest-ended'){
    const old=key;unavailableOwner=['presentation-unavailable','frame-delivery-failed','frame-acquisition-unavailable','frame-acquisition-error'].includes(reason)?owner:null;
    version++;owner=phase=key=null;presented=delivered=false;publishing=false;lastFingerprint='';response=null;revision=0;
    if(old)tail=tail.then(()=>director?.endStudy?.(old)).catch(error=>trace({type:'aperture-error',reason,message:String(error)}));return tail;
  }
  function update(value={}){
    const rest=value.rest||{},music=value.music||{},settings=getSettings()||{},eligible=!!value.owner&&['wrong-return','catch'].includes(value.phase)&&['sitting','seated'].includes(rest.mode)
      &&!rest.presentation?.suppressPeripheral&&Number(rest.narrativeProgress||0)<.95&&!music.failed&&!settings.reduceDread&&settings.effectsMode!=='off';
    if(!eligible){unavailableOwner=null;if(owner)void stop();return;}
    if(unavailableOwner===value.owner)return;
    const wasHeld=held;held=!!value.held;
    if(owner&&owner!==value.owner||phase&&phase!==value.phase)void stop('owner-changed');
    if(owner){director?.holdComposition?.(held);if(wasHeld&&!held)lastFingerprint='';}
    if(held||publishing)return;
    if(settings.reducedMotion&&delivered)return;
    if(presented&&now()-lastSent<SOURCE_REST_APERTURES.intervalMs)return;
    let frame;try{frame=getFrame();}catch{return;}
    if(!frame||frame.phase!==value.phase||!frame.geometry?.length)return;
    const currentResponse=rest.weather?.stormAge>=0&&rest.weather.stormAge<54||rest.memory?.drive>.1?'weather':rest.memory?.listener?'making':rest.memory?.ellery>.1?'room':null,
      signature=fingerprint(frame)+':'+(currentResponse||'aperture');
    if(signature===lastFingerprint)return;
    if(!owner){owner=value.owner;phase=value.phase;key=`source-rest-aperture:${++version}`;revision=0;lastSent=-Infinity;}
    const epoch=version,currentKey=key,current=()=>version===epoch&&key===currentKey&&owner===value.owner;
    publishing=true;
    tail=tail.then(async()=>{
      if(!current())return;
      const pair=await renderPair(frame,{width:240,height:160,isCurrent:()=>current()&&!held});if(!current()||held)return;
      const frames=await encodePair(pair,{documentApi,isCurrent:()=>current()&&!held});if(!current()||held)return;if(!frames?.length){void stop('frame-acquisition-unavailable');return;}diagnostics=pair?.diagnostics||null;
      if(!presented){await beforeBegin();if(!current())return;const report=await director?.beginStudy?.(sourceRestAperturePlan({phase:value.phase,...settings}),{key:currentKey,isCurrent:current});if(!current())return;presented=!!report;if(!presented){void stop('presentation-unavailable');return;}director?.holdComposition?.(held);}
      if(held||!current())return;
      if(currentResponse&&response!==currentResponse)director?.compositionEvent?.('aperture:'+currentResponse);
      response=currentResponse;
      const owned=frames.filter(frame=>!response||frame.surfaceId!=='rest:answer'),accepted=await director?.updateStudyFrames?.({key:currentKey,frames:owned,revision:++revision});
      if(!current())return;
      if(accepted){delivered=true;lastFingerprint=signature;lastSent=now();trace({type:'aperture-frame',phase:value.phase,revision,sourceSeconds:frame.mediaTime,...diagnostics});}
      else if(!held){trace({type:'aperture-unavailable',phase:value.phase});void stop('frame-delivery-failed');}
    }).catch(error=>{trace({type:'aperture-error',message:String(error)});if(current())void stop('frame-acquisition-error');}).finally(()=>{if(current())publishing=false;});
  }
  return{update,stop,whenIdle:()=>tail,snapshot:()=>({owner,phase,key,presented,held,revision,response,diagnostics})};
}


// The production path sends canonical geometry once and current poses at a
// bounded cadence. Each pane renders locally between updates; no raster readback,
// PNG encoding, window movement or new performance clock occurs in this loop.
export function createSourceRestMediaPresentation(options={}){
  if(options.diagnosticLegacy||!options.director?.updateStudyArchitecture)
    return createSampledSourceRestMediaPresentation(options);
  return createArchitecturalSourceRestMediaPresentation(options);
}
export function createArchitecturalSourceRestMediaPresentation({director,beforeBegin=async()=>{},getSettings=()=>({}),
  getFrame=()=>null,now=()=>globalThis.performance?.now?.()??Date.now(),onTrace=()=>{},
  composer=createSourceRestWindowArchitectureComposer()}={}){
  let owner=null,phase=null,key=null,version=0,revision=0,presented=false,held=false,publishing=false,delivered=false,
    lastSent=-Infinity,lastLayout=-Infinity,layout=null,latest=null,unavailableOwner=null,tail=Promise.resolve(),diagnostics=null,lastReason=null;
  const trace=value=>{try{onTrace(value);}catch{}};
  const unavailable=new Set(['presentation-unavailable','architecture-unavailable','architecture-delivery-failed']);
  function stop(reason='rest-ended'){
    const previous=key;lastReason=reason;unavailableOwner=unavailable.has(reason)?owner:null;
    version++;owner=phase=key=null;presented=delivered=publishing=false;revision=0;layout=null;latest=null;lastSent=lastLayout=-Infinity;
    composer.reset();
    if(previous)tail=tail.then(()=>director?.endStudy?.(previous)).catch(error=>trace({type:'architecture-error',reason,message:String(error)}));
    return tail;
  }
  function update(value={}){
    const rest=value.rest||{},music=value.music||{},settings=getSettings()||{},eligible=!!value.owner
      &&['wrong-return','catch'].includes(value.phase)&&['sitting','seated'].includes(rest.mode)
      &&!rest.presentation?.suppressPeripheral&&Number(rest.narrativeProgress||0)<.95&&!music.failed
      &&!settings.reduceDread&&settings.effectsMode!=='off';
    if(!eligible){unavailableOwner=null;if(owner)void stop();return;}
    if(unavailableOwner===value.owner)return;
    if(owner&&(owner!==value.owner||phase!==value.phase))void stop('owner-changed');
    const wasHeld=held;held=!!value.held;latest=value;
    if(owner&&(held!==wasHeld||!presented))director?.holdComposition?.(held);
    if(wasHeld&&!held)lastSent=-Infinity;
    if(held||publishing||settings.reducedMotion&&delivered||now()-lastSent<1000/30)return;
    let first;try{first=getFrame();}catch{return;}
    if(!first?.geometry?.length||first.phase!==value.phase)return;
    if(!owner){owner=value.owner;phase=value.phase;key=`source-rest-architecture:${++version}`;composer.reset();}
    const epoch=version,currentKey=key,current=()=>version===epoch&&key===currentKey&&owner===value.owner;
    publishing=true;lastSent=now();
    tail=tail.then(async()=>{
      if(!current()||held)return;
      if(!presented){
        await beforeBegin();if(!current()||held)return;
        const report=await director.beginStudy(sourceRestArchitecturalPlan({phase:value.phase,...settings}),{key:currentKey,isCurrent:current});
        if(!current())return;
        presented=!!report;if(!presented){void stop('presentation-unavailable');return;}
        director.holdComposition?.(held);
      }
      if(held||!current())return;
      if(!layout||now()-lastLayout>=1000){
        const measured=await director.layoutStudyArchitecture?.({key:currentKey});if(!current()||held)return;
        if(measured)layout=measured;lastLayout=now();
      }
      let frame;try{frame=getFrame();}catch{return;}
      if(!current()||held||frame?.phase!==value.phase||!frame?.geometry?.length)return;
      const rest=latest?.rest||{},filmBySurface={};
      const film=rest.weather?.stormAge>=0&&rest.weather.stormAge<54||rest.memory?.drive>.1?'clouds'
        :rest.memory?.listener?'performance-capture':rest.memory?.ellery>.1?'cathedral':null;
      if(film)filmBySurface['rest:answer']={assetId:film,mediaTime:Number(frame.mediaTime)||0};
      else if(Number(rest.narrativeProgress||0)>.16)filmBySurface['rest:answer']={assetId:'ferrocell-fields',mediaTime:Number(frame.mediaTime)||0};
      const packet=composer.compose(frame,{layout,filmBySurface,reducedMotion:!!settings.reducedMotion});
      if(!packet){void stop('architecture-unavailable');return;}
      const started=now(),accepted=await director.updateStudyArchitecture({key:currentKey,revision:++revision,packet});
      if(!current())return;
      if(accepted){delivered=true;diagnostics={mode:'local-gpu-architecture',sourceSeconds:packet.sourceSeconds,meshRevision:packet.meshRevision,
        panes:packet.panes.map(p=>({surfaceId:p.surfaceId,layers:p.layers?.length||1,instances:p.instances?.length||0})),transportMs:now()-started,layoutRevision:layout?.revision};
        trace({type:'architecture-pose',phase:value.phase,revision,...diagnostics});}
      else if(!held){trace({type:'architecture-unavailable',phase:value.phase});void stop('architecture-delivery-failed');}
    }).catch(error=>{trace({type:'architecture-error',message:String(error)});if(current())void stop('architecture-unavailable');})
      .finally(()=>{if(current())publishing=false;});
  }
  return{update,stop,whenIdle:()=>tail,snapshot:()=>({owner,phase,key,presented,held,revision,delivered,diagnostics,layout,lastReason,unavailable:!!unavailableOwner})};
}
export function sourceRestArchitecturalPlan({phase,reducedMotion=false,flashMode='full'}={}){
  if(!['wrong-return','catch'].includes(phase))throw Error('Unknown listening performance.');
  return compileWindowCompositionPlan({compositionId:`source-rest:architecture:${phase}`,sceneId:'source:continuation',purpose:'source-study',epochMs:0,reducedMotion,flashMode,
    surfaces:['rest:source','rest:answer'].map((id,index)=>({id,content:{kind:'procedural',preset:'empty-field'},clockMode:'source',
      initial:{x:index?.9:.1,y:index?.30:.18},entry:{x:index?.9:.1,y:index?.30:.18},width:288,height:192,
      shader:'violet-dither',draggable:false,sensitivity:'none',description:'A continuation of the listening architecture'})),
    score:{durationMs:3600000,loop:false,cues:[]},completion:{mode:'nonblocking'},formation:{mode:'study',durationMs:0,staggerMs:0},
    fault:{profile:'violet-dither',intensity:0,seed:219,cadenceMs:900}});
}
