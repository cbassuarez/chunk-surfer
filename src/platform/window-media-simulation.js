import {assetUrl} from './paths.js';
import {compilePaneScore, createWindowMediaClock, createWindowVideoClock, windowMediaAsset} from './window-composition.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));
const point=value=>({anchorX:Number(value?.anchorX??value?.x??.5),anchorY:Number(value?.anchorY??value?.y??.5),offsetX:Number(value?.offsetX)||0,offsetY:Number(value?.offsetY)||0});
const mixPoint=(a,b,t)=>Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+(b[key]-a[key])*t]));

// Browser fallback for the same authored score used by the native surfaces.
// One application clock and one RAF own cues, movement, fades and transports.
export function createWindowMediaSimulation({documentApi=globalThis.document,effects={},now=Date.now,requestFrame,cancelFrame}={}){
  const view=documentApi?.defaultView||globalThis;
  const request=requestFrame||view.requestAnimationFrame?.bind(view);
  const cancel=cancelFrame||view.cancelAnimationFrame?.bind(view);
  let root=null,plan=null,clock=null,frame=null,generation=0,held=false,forcedFrozen=false;
  let queue=[],controls=[],sequence=0,scheduledCycle=-1,lastLogical=0;
  const panes=new Map();
  const stamp=value=>Number.isFinite(Number(value))?Number(value):now();
  const logical=at=>clock?.now(stamp(at))??stamp(at);
  const localUrl=path=>{const resolved=assetUrl(path);try{return new URL(resolved,documentApi?.baseURI).href;}catch(_){return resolved;}};
  const ensure=()=>{
    if(root)return root;
    if(!documentApi?.createElement)return null;
    root=documentApi.createElement('div');root.className='window-choreography-sim composition';
    root.setAttribute('aria-hidden','true');root.style.pointerEvents='none';
    (documentApi.querySelector?.('#wrap')||documentApi.body)?.append?.(root);return root;
  };
  function dispatch(type,detail){
    const Event=view.CustomEvent||globalThis.CustomEvent;
    if(Event)view.dispatchEvent?.(new Event(type,{detail}));
  }
  function report(entry){
    if(!plan||!root)return;
    const host=root.getBoundingClientRect(),rect=entry.pane.getBoundingClientRect();
    dispatch('chunk-surfer:window-media-moved',{cueId:plan.cueId,paneId:entry.surface.id,label:'simulate',placement:{shown:entry.visible,scale:1,
      origin:{x:rect.left,y:rect.top},center:{x:rect.left-host.left+rect.width/2,y:rect.top-host.top+rect.height/2},
      normalized:{x:(rect.left-host.left+rect.width/2)/Math.max(1,host.width),y:(rect.top-host.top+rect.height/2)/Math.max(1,host.height)},
      width:rect.width,height:rect.height,workWidth:host.width,workHeight:host.height}});
  }
  function positionAt(entry,at){
    if(!entry.motion)return entry.position;
    const {from,to,start,end}=entry.motion,t=clamp((at-start)/Math.max(1,end-start));
    return mixPoint(from,to,1-Math.pow(1-t,3));
  }
  function renderPosition(entry,at){
    if(entry.pane.dataset.manual)return;
    const p=positionAt(entry,at);
    if(plan.purpose==='source-study'){
      const host=root.getBoundingClientRect(),width=Math.min(entry.surface.width,Math.max(1,host.width*.28));
      const height=entry.surface.height*width/Math.max(1,entry.surface.width),halfW=width/2,halfH=height/2;
      const x=clamp(p.anchorX*host.width+p.offsetX,halfW+8,Math.max(halfW+8,host.width-halfW-8));
      const y=clamp(p.anchorY*host.height+p.offsetY,halfH+8,Math.max(halfH+8,host.height-halfH-8));
      entry.pane.style.width=`${width}px`;entry.pane.style.height=`${height}px`;
      entry.pane.style.left=`${x}px`;entry.pane.style.top=`${y}px`;
      entry.rendered={x,y,width,height};
    }else{
      entry.pane.style.left=`calc(${p.anchorX*100}% + ${p.offsetX}px)`;
      entry.pane.style.top=`calc(${p.anchorY*100}% + ${p.offsetY}px)`;
    }
    if(entry.motion&&at>=entry.motion.end){entry.position=entry.motion.to;entry.motion=null;report(entry);}
  }
  const mediaDuration=entry=>Number.isFinite(entry.media?.child?.duration)&&entry.media.child.duration>0
    ?entry.media.child.duration:Number(windowMediaAsset(entry.assignment?.content?.assetId)?.trim?.durationSeconds)||entry.score.durationMs/1000;
  const clockOptions=entry=>({durationSeconds:mediaDuration(entry)});
  function disposeMedia(media){
    if(!media)return;
    media.disposed=true;
    for(const [name,handler] of media.listeners||[])media.child.removeEventListener?.(name,handler);
    if(media.kind==='video'){
      media.child.pause?.();media.child.removeAttribute?.('src');
      for(const source of media.child.querySelectorAll?.('source')||[])source.removeAttribute?.('src');
      media.child.replaceChildren?.();media.child.load?.();
    }else if(media.kind==='image'||media.kind==='snapshot')media.child.removeAttribute?.('src');
    media.child.remove?.();
  }
  function clearTransition(entry){
    disposeMedia(entry.outgoing);entry.outgoing=null;entry.transition=null;
    entry.pane.classList.remove('transition-dissolve','transition-dip-black');
    if(entry.media)entry.media.child.style.opacity='1';
  }
  function syncVideo(entry,at,{forceSeek=false}={}){
    const media=entry.media;if(media?.kind!=='video'||media.disposed||media.failed)return;
    const video=media.child,options=clockOptions(entry),duration=options.durationSeconds;
    const desired=Math.min(entry.transport.time(at,options),Math.max(0,duration-.001));
    const stopped=held||forcedFrozen||entry.frozen||plan?.reducedMotion||entry.assignment.content.playback==='reverse'||!entry.visible;
    if(stopped)video.pause?.();
    if(Number(video.readyState)<1)return;
    const rate=entry.transport.playbackRate(options);
    if(entry.assignment.content.playback!=='reverse')video.playbackRate=clamp(rate,.0625,16);
    const difference=Math.abs((Number(video.currentTime)||0)-desired);
    const driftCorrection=Number(video.readyState)>=2&&!media.playPending
      &&at-(media.lastSeekAt??-Infinity)>=180&&difference>.08;
    // A metadata-only video may still be decoding its requested phase. Replacing
    // that seek every frame prevents it ever reaching HAVE_CURRENT_DATA.
    if(!video.seeking&&(!media.phasePlaced||forceSeek||stopped||driftCorrection)){
      try{if(difference>.001){
        if(plan.reducedMotion){media.awaitingSeek=true;video.style.visibility='hidden';}
        video.currentTime=desired;media.lastSeekAt=at;
      }media.phasePlaced=true;}catch(_){}
    }
    // play() is also the browser's request to buffer/decode. Waiting for a
    // decoded frame before issuing it can strand metadata-ready sources.
    if(stopped||media.playPending||video.paused===false)return;
    const owner=generation,loadRevision=media.loadRevision;
    try{
      media.playPending=true;
      Promise.resolve(video.play?.()).then(()=>{
        if(loadRevision!==media.loadRevision)return;
        media.playPending=false;
        if(owner!==generation||entry.media!==media||media.disposed||held||forcedFrozen||entry.frozen||plan?.reducedMotion||!entry.visible)video.pause?.();
      },()=>{if(loadRevision===media.loadRevision)media.playPending=false;});
    }catch(_){media.playPending=false;}
  }
  function cropMedia(child,crop={}){
    const w=Math.max(.05,Number(crop.w)||1),h=Math.max(.05,Number(crop.h)||1);
    child.style.position='absolute';child.style.maxWidth='none';child.style.maxHeight='none';
    child.style.width=`${100/w}%`;child.style.height=`${100/h}%`;
    child.style.left=`${-100*(Number(crop.x)||0)/w}%`;child.style.top=`${-100*(Number(crop.y)||0)/h}%`;
  }
  function makeMedia(entry,assignment){
    const content=assignment.content,owner=generation;
    let child,kind=content.kind;const formats=[];
    if(kind==='video'){
      child=documentApi.createElement('video');const asset=windowMediaAsset(content.assetId);
      child.muted=true;child.defaultMuted=true;child.volume=0;child.autoplay=false;child.playsInline=true;child.preload='auto';
      child.loop=assignment.clockMode==='source'||entry.score.loop;child.disablePictureInPicture=true;
      if(plan.reducedMotion)child.style.visibility='hidden';
      // Reduced motion uses the decoded authored phase, never a different poster frame.
      if(!plan.reducedMotion&&asset?.derivatives?.poster?.path)child.poster=localUrl(asset.derivatives.poster.path);
      for(const format of ['webm','mp4']){
        const path=asset?.derivatives?.[format]?.path;if(!path)continue;
        const source=documentApi.createElement('source');source.src=localUrl(path);source.type=format==='webm'?'video/webm':'video/mp4';child.append(source);
        formats.push({format,url:source.src});
      }
    }else if(kind==='image'||kind==='snapshot'){
      child=documentApi.createElement('img');child.alt=entry.surface.description||'';
      if(kind==='image'){const asset=windowMediaAsset(content.assetId);child.src=localUrl(asset?.derivatives?.poster?.path||asset?.path||'');}
    }else if(kind==='text'){child=documentApi.createElement('span');child.textContent=content.text||'';}
    else{child=documentApi.createElement('div');child.className=`window-composition-procedural preset-${content.preset||'game-fragment'}`;}
    child.dataset.contentId=content.assetId||content.preset||kind;child.style.animation='none';child.style.pointerEvents='none';
    if(['video','image','snapshot'].includes(kind)){
      cropMedia(child,assignment.crop);
      // Normalized crops must select the same pixels as the native UV pass.
      // CSS cover would silently take a second, aspect-dependent crop.
      child.style.objectFit=entry.surface.shader==='terminal'?'contain':'fill';
    }
    const media={child,kind,disposed:false,listeners:[],formats,triedFormats:new Set(),loadRevision:0,failed:false};
    if(kind==='video'){
      const valid=()=>owner===generation&&entry.media===media&&!media.disposed;
      const selected=()=>media.selectedFormat||formats.find(item=>item.url===(child.currentSrc||child.src))?.format||formats[0]?.format;
      const reveal=()=>{if(valid()&&plan.reducedMotion&&!media.awaitingSeek&&!child.seeking&&Number(child.readyState)>=2)child.style.visibility='visible';};
      const ready=()=>{if(!valid()||media.failed)return;const format=selected();if(format)media.triedFormats.add(format);child.dataset.mediaFormat=format||'';syncVideo(entry,logical(now()));reveal();};
      for(const event of ['loadedmetadata','loadeddata']){child.addEventListener?.(event,ready);media.listeners.push([event,ready]);}
      const seeked=()=>{if(!valid())return;const desired=entry.transport.time(logical(now()),clockOptions(entry));if(Math.abs((Number(child.currentTime)||0)-desired)<.05)media.awaitingSeek=false;syncVideo(entry,logical(now()));reveal();};
      child.addEventListener?.('seeked',seeked);media.listeners.push(['seeked',seeked]);
      const error=()=>{
        if(!valid()||media.failed)return;
        const failed=selected();if(failed)media.triedFormats.add(failed);
        const alternate=formats.find(item=>!media.triedFormats.has(item.format));
        child.pause?.();
        if(!alternate){media.failed=true;child.dataset.mediaError='bundled-formats-exhausted';return;}
        // Reload the same owned transport, not its timeline. The next metadata
        // event rejoins the current logical phase, including frozen/held stills.
        media.loadRevision++;media.playPending=false;media.phasePlaced=false;media.awaitingSeek=false;media.lastSeekAt=-Infinity;
        media.selectedFormat=alternate.format;media.triedFormats.add(alternate.format);
        child.dataset.mediaFormat=alternate.format;child.dataset.mediaFallbacks=String(media.loadRevision);
        if(plan.reducedMotion)child.style.visibility='hidden';
        child.removeAttribute?.('src');
        for(const source of child.querySelectorAll?.('source')||[])source.removeAttribute?.('src');
        child.replaceChildren?.();child.src=alternate.url;child.load?.();
      };
      child.addEventListener?.('error',error);media.listeners.push(['error',error]);
    }else if(kind==='snapshot'){
      let data;try{data=effects?.snapshotData?.(content.token);}catch(_){}
      if(data?.then)Promise.resolve(data).then(value=>{if(owner===generation&&entry.media===media&&!media.disposed&&typeof value==='string')child.src=value;},()=>{});
      else if(typeof data==='string')child.src=data;
    }
    return media;
  }
  function assign(entry,assignment,at,action={}){
    clearTransition(entry);
    const previous=entry.media;
    entry.assignment=assignment;entry.transport.assign(assignment,at);
    const next=makeMedia(entry,assignment);entry.media=next;entry.pane.dataset.contentId=next.child.dataset.contentId;
    entry.pane.append(next.child);
    const duration=plan.reducedMotion?0:Math.max(0,Number(action.durationMs)||0),mode=action.transition||'cut';
    if(previous&&duration&&mode!=='cut'){
      if(previous.kind==='video')previous.child.pause?.();
      entry.outgoing=previous;entry.transition={mode,start:at,end:at+duration};
      entry.pane.classList.add(`transition-${mode}`);
    }else disposeMedia(previous);
    if(next.kind==='video')next.child.load?.();
    syncVideo(entry,at,{forceSeek:true});
  }
  function renderTransition(entry,at){
    const transition=entry.transition;if(!transition)return;
    if(at>=transition.end){clearTransition(entry);return;}
    const t=clamp((at-transition.start)/Math.max(1,transition.end-transition.start));
    if(transition.mode==='dissolve'){
      if(entry.outgoing)entry.outgoing.child.style.opacity=String(1-t);
      if(entry.media)entry.media.child.style.opacity=String(t);
    }else{
      if(entry.outgoing)entry.outgoing.child.style.opacity=String(t<.5?1-t*2:0);
      if(entry.media)entry.media.child.style.opacity=String(t<.5?0:(t-.5)*2);
    }
  }
  function apply(entry,action,at,cueId=''){
    entry.pane.dataset.lastScoreCue=cueId;
    if(action.type==='assignment')assign(entry,action.assignment,at,action);
    else if(action.type==='visible'){entry.visible=!!action.visible;entry.pane.style.display=entry.visible?'block':'none';report(entry);}
    else if(action.type==='frozen'){entry.frozen=!!action.frozen;entry.transport.freeze(forcedFrozen||entry.frozen,at,clockOptions(entry));}
    else if(action.type==='seek')entry.transport.seek(action.seekMs,at,clockOptions(entry));
    else if(action.type==='shader'){
      if(action.coherent!==null)entry.pane.classList.toggle('coherent',!!action.coherent);
      if(action.intensity!==null)entry.pane.style.setProperty('--fault-intensity',String(action.intensity));
    }else if(action.type==='geometry'&&(!entry.pane.dataset.manual||action.geometry.force)){
      delete entry.pane.dataset.manual;
      entry.position=positionAt(entry,at);
      entry.motion={from:entry.position,to:point(action.geometry),start:at,end:at+(plan.reducedMotion?0:Number(action.durationMs)||0)};
    }
  }
  function scheduleThrough(at){
    const duration=Math.max(1,Number(plan.score.durationMs)||1),elapsed=Math.max(0,at-plan.epochMs);
    const cycle=plan.score.loop?Math.floor(elapsed/duration):0;
    for(let n=scheduledCycle+1;n<=cycle;n++){
      const epoch=plan.epochMs+n*duration;
      for(const entry of panes.values()){
        if(n>0)queue.push({at:epoch,entry,reset:true,order:sequence++});
        for(const cue of entry.score.cues){
          if(!Object.hasOwn(cue,'atMs'))continue;
          queue.push({at:epoch+cue.atMs+cue.delayMs,entry,action:cue.action,cueId:cue.id,order:sequence++});
        }
      }
    }
    scheduledCycle=cycle;
  }
  function advance(raw){
    if(!plan)return;
    const at=logical(raw);lastLogical=at;
    if(!held){
      scheduleThrough(at);queue.sort((a,b)=>a.at-b.at||a.order-b.order);
      while(queue.length&&queue[0].at<=at){
        const cue=queue.shift();
        if(cue.reset){cue.entry.visible=true;cue.entry.pane.style.display='block';cue.entry.frozen=false;cue.entry.transport.freeze(forcedFrozen,cue.at,clockOptions(cue.entry));assign(cue.entry,cue.entry.score.initial,cue.at);}
        else apply(cue.entry,cue.action,cue.at,cue.cueId);
      }
    }
    if(root)root.dataset.scoreTime=String(Math.round(Math.max(0,at-plan.epochMs)));
    for(const entry of panes.values()){renderPosition(entry,at);renderTransition(entry,at);syncVideo(entry,at);}
  }
  function setHeld(value,raw){
    advance(raw);const at=logical(raw);
    held=!!value;clock.hold(held,raw);
    for(const entry of panes.values()){entry.transport.hold(held,at,clockOptions(entry));syncVideo(entry,at,{forceSeek:true});}
    root.dataset.scoreHeld=String(held);
    if(!held)advance(raw);
  }
  function arm(){
    if(!plan||!request)return;
    const owner=generation;
    frame=request(()=>{if(owner===generation)pump();});
  }
  function pump(){
    frame=null;if(!plan)return;
    const raw=now();controls.sort((a,b)=>a.at-b.at||a.order-b.order);
    while(controls.length&&controls[0].at<=raw){const control=controls.shift();setHeld(control.value,control.at);}
    advance(raw);
    arm();
  }
  function hide(){
    generation++;if(frame!==null)cancel?.(frame);frame=null;
    for(const entry of panes.values()){
      for(const [event,handler] of entry.listeners)entry.pane.removeEventListener?.(event,handler);
      disposeMedia(entry.media);disposeMedia(entry.outgoing);
    }
    panes.clear();plan=null;clock=null;queue=[];controls=[];scheduledCycle=-1;held=false;forcedFrozen=false;
    root?.classList.remove('active');root?.replaceChildren();return true;
  }
  function attachDrag(entry){
    if(!entry.surface.draggable)return;
    let drag=null;const pane=entry.pane;
    const listen=(event,handler)=>{pane.addEventListener?.(event,handler);entry.listeners.push([event,handler]);};
    listen('pointerdown',event=>{event.preventDefault?.();event.stopPropagation?.();pane.dataset.manual='true';drag={x:event.clientX,y:event.clientY,left:pane.offsetLeft,top:pane.offsetTop};pane.setPointerCapture?.(event.pointerId);});
    listen('pointermove',event=>{if(!drag)return;pane.style.left=`${drag.left+event.clientX-drag.x}px`;pane.style.top=`${drag.top+event.clientY-drag.y}px`;});
    const end=event=>{if(!drag)return;drag=null;pane.releasePointerCapture?.(event.pointerId);report(entry);};
    listen('pointerup',end);listen('pointercancel',end);
  }
  function show(next){
    hide();if(next?.kind!=='composition'||!ensure())return false;
    plan=next;const raw=now();clock=createWindowMediaClock({epochMs:plan.epochMs,nowMs:raw});
    root.dataset.cue=plan.cueId;root.dataset.scoreHeld='false';root.classList.add('active');
    const at=logical(raw);
    for(const surface of plan.surfaces){
      const pane=documentApi.createElement('div');pane.className='window-choreography-sim-pane window-composition-pane';
      pane.style.width=`${surface.width}px`;pane.style.height=`${surface.height}px`;pane.style.zIndex=String(surface.z);
      pane.style.pointerEvents=surface.draggable?'auto':'none';pane.style.cursor=surface.draggable?'grab':'default';pane.style.transition='none';
      pane.dataset.paneId=surface.id;pane.dataset.shader=surface.shader;
      pane.style.setProperty('--fault-intensity',String(clamp((plan.fault?.intensity||0)*(surface.faultScale||1))));
      pane.classList.toggle('flash-reduced',plan.fault?.flashMode==='reduced');pane.classList.toggle('flash-off',plan.fault?.flashMode==='off');
      const score=compilePaneScore(plan,surface.id),start=plan.epochMs+(plan.formation?.delayMs||0)+surface.index*(plan.formation?.staggerMs||0);
      const entry={surface,pane,score,assignment:score.initial,media:null,outgoing:null,transition:null,visible:true,frozen:false,listeners:[],position:point(surface.entry),
        motion:{from:point(surface.entry),to:point(surface.initial),start,end:start+(plan.reducedMotion?0:plan.formation?.durationMs||0)},
        transport:createWindowVideoClock({score,assignment:score.initial,nowMs:at,reducedMotion:!!plan.reducedMotion})};
      panes.set(surface.id,entry);root.append(pane);attachDrag(entry);assign(entry,score.initial,at);
    }
    advance(raw);arm();return true;
  }
  function trigger(owner,event,{effectiveAtMs}={}){
    if(owner!==plan||!plan)return false;
    const raw=now(),at=logical(raw)+Math.max(0,stamp(effectiveAtMs)-raw);let matched=false;
    for(const entry of panes.values())for(const cue of entry.score.cues){
      if(cue.event!==event)continue;matched=true;
      queue.push({at:at+Math.max(0,cue.delayMs||0),entry,action:cue.action,cueId:cue.id,event:true,order:sequence++});
    }
    if(!held)advance(raw);return matched;
  }
  function hold(value=true,{effectiveAtMs}={}){
    if(!plan)return false;
    const raw=now(),at=stamp(effectiveAtMs);
    if(at>raw)controls.push({at,value:!!value,order:sequence++});else setHeld(value,raw);
    return true;
  }
  function freeze(value=true){
    if(!plan)return false;
    const at=logical(now());forcedFrozen=!!value;
    for(const entry of panes.values()){entry.transport.freeze(forcedFrozen||entry.frozen,at,clockOptions(entry));syncVideo(entry,at,{forceSeek:true});}
    return true;
  }
  function coherence(value=true){for(const entry of panes.values())entry.pane.classList.toggle('coherent',!!value);return !!plan;}
  function snap(owner,{coherent=false}={}){
    if(owner!==plan||!root)return false;
    for(const entry of panes.values()){
      if(!entry.surface.target)continue;
      delete entry.pane.dataset.manual;entry.position=point(entry.surface.target);entry.motion=null;entry.pane.classList.toggle('coherent',!!coherent);renderPosition(entry,logical(now()));report(entry);
    }
    return true;
  }
  return {show,snap,coherence,freeze,trigger,hold,hide,active:()=>!!plan,
    debug:()=>({active:!!plan,cueId:plan?.cueId||null,held,frozen:forcedFrozen,frameScheduled:frame!==null,logicalTimeMs:clock?.now(now())??null,pendingEvents:queue.filter(q=>q.event).length,pendingTimed:queue.filter(q=>!q.event&&q.at>lastLogical).length,pendingControls:controls.length,
      panes:[...panes.values()].map(entry=>({id:entry.surface.id,assignment:entry.assignment,visible:entry.visible,frozen:entry.frozen||forcedFrozen,mediaTimeSeconds:entry.transport.time(logical(now()),clockOptions(entry)),mediaFormat:entry.media?.child?.dataset?.mediaFormat||null,mediaFallbacks:entry.media?.loadRevision||0,mediaFailed:!!entry.media?.failed,position:positionAt(entry,logical(now())),rendered:entry.rendered?{...entry.rendered}:null,transition:entry.transition?{...entry.transition}:null,lastCue:entry.pane.dataset.lastScoreCue||null}))})};
}
