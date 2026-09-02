import { isTauriRuntime } from './detect.js';
import { logWarn } from './diagnostics/diagnostics.js';
import {
  apertureCompositionPlan,
  compilePaneScore,
  deathCompositionPlan,
  endingCompositionPlan,
  evaluateCompositionConstraints,
  titleCompositionPlan,
  windowMediaAsset,
} from './window-composition.js';

export const WINDOW_CHOREOGRAPHY_PRIMITIVES=Object.freeze([
  'Frame','Glide','Cinch','Bloom','Dock','Breach','Restore','Split','Cast',
  'Handoff','Orbit','Swarm','Recenter','Simulate',
]);

const BATTLE_PROFILES=Object.freeze({
  natatorium:Object.freeze({
    battleId:'natatorium',intensity:.18,activity:.18,intro:'rise',formation:'rise-drift',
    introFrom:{x:.50,y:1.12},damageAxis:'vertical',primitives:['Breach','Glide','Split','Cast'],
  }),
  hall:Object.freeze({
    battleId:'hall',intensity:.36,activity:.34,intro:'take-seat',formation:'seat-align',
    introFrom:{x:.78,y:.80},damageAxis:'lateral',primitives:['Breach','Dock','Glide','Split','Cast'],
  }),
  practice:Object.freeze({
    battleId:'practice',intensity:.52,activity:.52,intro:'rewind',formation:'retake-loop',
    introFrom:{x:.18,y:.50},damageAxis:'rewind',primitives:['Breach','Handoff','Glide','Split','Cast'],
  }),
  chapel:Object.freeze({
    battleId:'chapel',intensity:.78,activity:.82,intro:'descend',formation:'orbit-cross',
    introFrom:{x:.50,y:-.15},damageAxis:'constrict',primitives:['Breach','Dock','Orbit','Cinch','Split','Cast'],
  }),
  'source-final':Object.freeze({
    battleId:'source-final',intensity:1,activity:1,intro:'assemble',formation:'swarm-recombine',
    introFrom:{x:.50,y:.50},damageAxis:'unstable',primitives:['Handoff','Orbit','Cinch','Swarm','Split','Cast'],
  }),
});

const ENDING_PROFILES=Object.freeze({
  sacrifice:{primitive:'Cinch',resolution:'containment'},
  helped:{primitive:'Cinch',resolution:'containment'},
  inversion:{primitive:'Bloom',resolution:'ordinary-exterior'},
  drugged:{primitive:'Dock',resolution:'van-inert'},
  surfaced:{primitive:'Handoff',resolution:'two-names-returned'},
  'contact-won':{primitive:'Cinch',resolution:'failing-body-recorder'},
  'contact-lost':{primitive:'Handoff',resolution:'distant-dot'},
  'tower-won':{primitive:'Bloom',resolution:'exterior-doors'},
  'tower-lost':{primitive:'Swarm',resolution:'completed-peal'},
});

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));
const safe=(task)=>Promise.resolve().then(task).catch(()=>null);
const stableId=(value='')=>String(value||'').replace(/[^a-z0-9:_-]/giu,'-').slice(0,96);
const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

export function battleChoreographyProfile(battleId=''){
  return BATTLE_PROFILES[String(battleId||'')]||null;
}

export function endingChoreographyProfile(endingId=''){
  const profile=ENDING_PROFILES[String(endingId||'')];
  return profile?Object.freeze({endingId:String(endingId),...profile}):null;
}

export function windowChoreographyPolicy(sceneId=''){
  const id=String(sceneId||'');
  if(BATTLE_PROFILES[id]||id.startsWith('battle:'))return 'battle-only';
  if(id==='source:white-crossing'||id==='source:proper'||id==='source-final')return 'source-leakage';
  if(id.startsWith('ending:')||ENDING_PROFILES[id])return 'ending-resolution';
  if(id==='credits')return 'credits-restoration';
  return 'stable';
}

// The FOH threshold is the firewall. Progress, elapsed time and emergency-red
// metadata are deliberately ignored until the Source runtime says the body is
// physically in the approach. This keeps the page, both HUSH planes, Scene Dock
// and the real FOH door out of the compositor's state machine.
export function sourceLeakStage(frame={}){
  if(frame?.sourcePhase===false||String(frame?.phase||'').toLowerCase()==='horizon')return Object.freeze({id:'sealed',active:false,progress:0,red:0});
  if(frame?.complete)return Object.freeze({id:'proper',active:true,progress:1,red:clamp(frame.redProgress??1)});
  if(!frame?.approach)return Object.freeze({id:'sealed',active:false,progress:0,red:0});
  const elapsed=Math.max(0,Number(frame.elapsedSeconds)||0);
  const progress=clamp(frame.progress);
  const red=clamp(frame.redProgress);
  if(elapsed<10)return Object.freeze({id:'white',active:true,progress,red:0});
  if(progress<2/3)return Object.freeze({id:'red',active:true,progress,red});
  if(progress<.92)return Object.freeze({id:'swarm',active:true,progress,red});
  return Object.freeze({id:'proper',active:true,progress,red});
}

export function validateWindowChoreographyPlan(plan={}){
  const errors=[];
  if(plan.schema!==1)errors.push('schema');
  if(!stableId(plan.cueId))errors.push('cueId');
  if(!stableId(plan.sceneId))errors.push('sceneId');
  if(!Array.isArray(plan.primitives)||!plan.primitives.length)errors.push('primitives');
  else for(const primitive of plan.primitives)if(!WINDOW_CHOREOGRAPHY_PRIMITIVES.includes(primitive))errors.push(`primitive:${primitive}`);
  if(!Array.isArray(plan.mainFrame))errors.push('mainFrame');
  if(!Array.isArray(plan.surfaces)||plan.surfaces.length>4)errors.push('surfaces');
  for(const surface of plan.surfaces||[]){
    if(!stableId(surface.id))errors.push('surface.id');
    if(!Number.isFinite(Number(surface.x))||!Number.isFinite(Number(surface.y)))errors.push(`surface.position:${surface.id}`);
    if(!Number.isFinite(Number(surface.size))||Number(surface.size)<64||Number(surface.size)>320)errors.push(`surface.size:${surface.id}`);
  }
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});
}

export function compileWindowChoreographyPlan({
  cueId,sceneId,primitives=['Frame'],mainFrame=[],surfaces=[],content='game-authored',
  focus='main',input='none',easing='out-cubic',interruptible=true,reducedMotion=false,
  fallback='simulate',restore='transaction',scope='battle',narrativeBlocking=false,nonblocking=true,
}={}){
  if(!Array.isArray(surfaces)||surfaces.length>4)throw new Error('invalid window choreography plan: surfaces');
  const plan=Object.freeze({
    schema:1,cueId:stableId(cueId),sceneId:stableId(sceneId),
    primitives:Object.freeze([...new Set(primitives)]),
    mainFrame:Object.freeze(mainFrame.map((keyframe)=>Object.freeze({
      dx:Number(keyframe.dx)||0,dy:Number(keyframe.dy)||0,
      scaleX:clamp(keyframe.scaleX??1,.55,1.35),scaleY:clamp(keyframe.scaleY??1,.55,1.35),
      durationMs:Math.max(0,Math.min(2200,Number(keyframe.durationMs)||0)),
      easing:String(keyframe.easing||easing),dock:String(keyframe.dock||'center'),
    }))),
    surfaces:Object.freeze(surfaces.slice(0,4).map((surface,index)=>Object.freeze({
      id:stableId(surface.id||`${cueId}:${index}`),index,
      x:clamp(surface.x,.02,.98),y:clamp(surface.y,.02,.98),
      size:Math.max(64,Math.min(320,Math.round(Number(surface.size)||160))),
      mode:String(surface.mode||'fragment'),title:String(surface.title||'').slice(0,48),
      text:String(surface.text||'').slice(0,320),palette:String(surface.palette||'black'),
      interactive:!!surface.interactive,
    }))),
    content,focus,input,easing,interruptible:!!interruptible,reducedMotion:!!reducedMotion,
    fallback,restore,scope,narrativeBlocking:!!narrativeBlocking,nonblocking:!!nonblocking,
  });
  const validation=validateWindowChoreographyPlan(plan);
  if(!validation.ok)throw new Error(`invalid window choreography plan: ${validation.errors.join(', ')}`);
  return plan;
}

function battleIntroPlan(profile,{sequence=0,reducedMotion=false}={}){
  const offset=profile.battleId==='natatorium'?{dx:0,dy:-18}
    :profile.battleId==='hall'?{dx:42,dy:0}
      :profile.battleId==='practice'?{dx:-30,dy:0}
        :profile.battleId==='chapel'?{dx:0,dy:28}:{dx:18,dy:-12};
  const surfaces=Array.from({length:profile.battleId==='source-final'?3:1},(_,index)=>({
    id:`${profile.battleId}:invader:${sequence}:${index}`,
    x:clamp(profile.introFrom.x+(index-1)*.16,.08,.92),
    y:clamp(profile.introFrom.y+(index-1)*.12,.08,.92),size:176,
    mode:'boss',palette:profile.battleId==='natatorium'?'water':'black',
    text:profile.intro.toUpperCase(),interactive:false,
  }));
  return compileWindowChoreographyPlan({
    cueId:`${profile.battleId}:invade:${sequence}`,sceneId:`battle:${profile.battleId}`,
    primitives:profile.primitives,scope:'battle',reducedMotion,
    mainFrame:reducedMotion?[]:[{...offset,durationMs:320+profile.intensity*260,easing:'out-cubic'}],surfaces,
  });
}

function battleDamagePlan(profile,{grade='light',origin={x:.5,y:.5},sequence=0,reducedMotion=false}={}){
  const heavy=grade==='heavy'||grade==='phase';
  const phase=grade==='phase';
  const x=clamp(origin?.x),y=clamp(origin?.y);
  const dx=profile.damageAxis==='lateral'?(x<.5?24:-24):profile.damageAxis==='rewind'?-18:(x-.5)*-28;
  const dy=profile.damageAxis==='vertical'?(y<.5?16:-16):(y-.5)*-18;
  const scale=phase?.86:heavy?.92:1;
  return compileWindowChoreographyPlan({
    cueId:`${profile.battleId}:damage:${sequence}`,sceneId:`battle:${profile.battleId}`,
    primitives:phase?['Dock','Cinch']:heavy?['Cinch']:['Glide'],scope:'battle',reducedMotion,
    mainFrame:reducedMotion?[]:[
      {dx,dy,scaleX:scale,scaleY:scale,durationMs:heavy?260:110,easing:'out-cubic'},
      {dx:0,dy:0,scaleX:1,scaleY:1,durationMs:heavy?360:160,easing:'in-out-cubic'},
    ],surfaces:[],
  });
}

function defeatPlan(battleId,sequence=0,reducedMotion=false){
  const fragments=Array.from({length:4},(_,index)=>({
    id:`${battleId}:defeat:${sequence}:${index}`,x:.2+index*.2,y:.34+(index%2)*.24,size:150,
    mode:'shatter',palette:'black',text:'',interactive:false,
  }));
  return compileWindowChoreographyPlan({
    cueId:`${battleId}:defeat:${sequence}`,sceneId:`battle:${battleId}`,
    primitives:['Split','Glide','Recenter'],scope:'battle',reducedMotion,
    mainFrame:reducedMotion?[]:[{dx:0,dy:34,scaleX:.94,scaleY:.94,durationMs:360}],surfaces:fragments,
  });
}

function sourcePlan(stage,sequence=0,reducedMotion=false){
  const counts={white:1,red:2,swarm:4,proper:3};
  const count=counts[stage.id]||0;
  const drift=(index)=>Math.sin((sequence+1)*(index+2)*1.71);
  const surfaces=Array.from({length:count},(_,index)=>({
    id:`source:${stage.id}:${sequence}:${index}`,
    x:clamp(.16+(index*.23)+(stage.id==='swarm'?drift(index)*.08:drift(index)*.025),.08,.92),
    y:clamp(.28+((index*37)%3)*.22+(stage.id==='swarm'?drift(index+4)*.06:0),.12,.88),
    size:stage.id==='proper'&&index===0?190:128+(index%2)*24,
    mode:stage.id==='proper'&&index===0?'narrative':'fragment',
    palette:stage.red>0?'red':'white',
    text:stage.id==='proper'&&index===0?'ENTER THE RETURN PATH':'',
    interactive:stage.id==='proper'&&index===0,
  }));
  const motion=stage.id==='white'||reducedMotion?[]
    :stage.id==='red'?[{dx:sequence%2?6:-5,dy:sequence%3?-3:2,scaleX:.99,scaleY:.99,durationMs:520}]
      :stage.id==='swarm'?[{dx:sequence%2?-18:21,dy:sequence%3?8:-6,scaleX:.95,scaleY:.95,durationMs:620}]
        :[{dx:24,dy:-12,scaleX:.91,scaleY:.91,durationMs:680}];
  return compileWindowChoreographyPlan({
    cueId:`source:${stage.id}:${sequence}`,sceneId:'source:white-crossing',
    primitives:stage.id==='white'?['Split']:stage.id==='red'?['Split','Glide','Cinch']
      :stage.id==='swarm'?['Split','Swarm','Handoff','Glide']:['Split','Handoff','Cinch'],
    scope:'source',reducedMotion,mainFrame:motion,surfaces,
    input:stage.id==='proper'?'pointer-or-main':'none',focus:'main',nonblocking:true,
  });
}

function endingPlan(profile,sequence=0,reducedMotion=false){
  const persistent=0;
  return compileWindowChoreographyPlan({
    cueId:`ending:${profile.endingId}:${sequence}`,sceneId:`ending:${profile.endingId}`,
    primitives:[profile.primitive],scope:'ending',reducedMotion,
    mainFrame:reducedMotion?[]:[{
      dx:profile.primitive==='Dock'?120:profile.primitive==='Handoff'?-36:0,dy:profile.primitive==='Dock'?80:0,
      scaleX:profile.primitive==='Cinch'?.72:profile.endingId==='contact-lost'?.65:profile.primitive==='Bloom'?1.08:1,
      scaleY:profile.primitive==='Cinch'?.72:profile.endingId==='contact-lost'?.65:profile.primitive==='Bloom'?1.08:1,
      durationMs:900,easing:'in-out-cubic',
    }],
    surfaces:Array.from({length:persistent},(_,index)=>({
      id:`ending:${profile.endingId}:${index}`,x:.28+index*.18,y:.54+(index%2)*.12,size:132,
      mode:'ending',palette:'black',text:profile.resolution.toUpperCase(),interactive:false,
    })),
  });
}

function createSimulation(documentApi,effects){
  let root=null;
  const panes=new Map();
  const formationTimers=new Set();
  const scoreTimers=new Set();
  let activePlan=null;
  const ensure=()=>{
    if(root||!documentApi?.createElement)return root;
    root=documentApi.createElement('div');
    root.className='window-choreography-sim';
    root.setAttribute('aria-hidden','true');
    (documentApi.querySelector?.('#wrap')||documentApi.body)?.append?.(root);
    return root;
  };
  const clear=()=>{
    for(const timer of formationTimers)clearTimeout(timer);formationTimers.clear();
    for(const timer of scoreTimers)clearTimeout(timer);scoreTimers.clear();
    panes.clear();activePlan=null;if(root)root.replaceChildren();
  };
  const dispatch=(event,detail)=>{
    const CustomEventCtor=documentApi?.defaultView?.CustomEvent||globalThis.CustomEvent;
    if(CustomEventCtor)documentApi?.defaultView?.dispatchEvent?.(new CustomEventCtor(event,{detail}));
  };
  function report(plan,surface,pane){
    const hostRect=root.getBoundingClientRect(),rect=pane.getBoundingClientRect();
    dispatch('chunk-surfer:window-media-moved',{cueId:plan.cueId,paneId:surface.id,label:'simulate',placement:{shown:true,scale:1,
      origin:{x:rect.left,y:rect.top},center:{x:rect.left-hostRect.left+rect.width/2,y:rect.top-hostRect.top+rect.height/2},
      normalized:{x:(rect.left-hostRect.left+rect.width/2)/Math.max(1,hostRect.width),y:(rect.top-hostRect.top+rect.height/2)/Math.max(1,hostRect.height)},
      width:rect.width,height:rect.height,workWidth:hostRect.width,workHeight:hostRect.height}});
  }
  function mediaChild(plan,surface,assignment=surface.assignment||surface){
    const content=assignment.content||{};
    let child=null;
    if(content.kind==='video'){
      const asset=windowMediaAsset(content.assetId),poster=asset?.derivatives?.poster?.path;
      if(plan.reducedMotion){const img=documentApi.createElement('img');img.src=poster||'';img.alt=surface.description||'';child=img;}
      else{
      const video=documentApi.createElement('video');video.muted=true;video.defaultMuted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='auto';
      if(poster)video.poster=poster;
      for(const kind of ['webm','mp4']){const path=asset?.derivatives?.[kind]?.path;if(!path)continue;const source=documentApi.createElement('source');source.src=path;source.type=kind==='webm'?'video/webm':'video/mp4';video.append(source);}
      void video.play?.().catch?.(()=>{});child=video;
      }
    }
    else if(content.kind==='snapshot'){
      const img=documentApi.createElement('img');img.src=effects?.snapshotData?.(content.token)||'';img.alt=surface.description||'';child=img;
    }
    else if(content.kind==='text'){const span=documentApi.createElement('span');span.textContent=content.text||'';child=span;}
    else{const field=documentApi.createElement('div');field.className=`window-composition-procedural preset-${content.preset||'game-fragment'}`;child=field;}
    const crop=assignment.crop||{x:0,y:0,w:1,h:1};
    child.dataset.contentId=content.assetId||content.preset||content.kind||'unknown';
    if(['video','image','snapshot'].includes(content.kind)){
      child.style.position='absolute';child.style.maxWidth='none';child.style.maxHeight='none';
      child.style.width=`${100/Math.max(.05,crop.w||1)}%`;child.style.height=`${100/Math.max(.05,crop.h||1)}%`;
      child.style.left=`${-100*(crop.x||0)/Math.max(.05,crop.w||1)}%`;child.style.top=`${-100*(crop.y||0)/Math.max(.05,crop.h||1)}%`;
    }
    return child;
  }
  function replaceMedia(plan,surface,pane,assignment,action={}){
    const next=mediaChild(plan,surface,assignment),old=pane.firstElementChild;
    if(old&&action.transition!=='cut'&&action.durationMs){pane.classList.add(`transition-${action.transition}`);setTimeout(()=>pane.classList.remove(`transition-${action.transition}`),action.durationMs);}
    pane.replaceChildren(next);pane.dataset.contentId=next.dataset.contentId||'';
  }
  function applyScoreAction(plan,surface,pane,action,cueId=''){
    if(!pane||!action)return;
    pane.dataset.lastScoreCue=cueId;
    if(action.type==='assignment')replaceMedia(plan,surface,pane,action.assignment,action);
    else if(action.type==='visible')pane.style.display=action.visible?'block':'none';
    else if(action.type==='frozen')for(const video of pane.querySelectorAll?.('video')||[]){if(action.frozen)video.pause?.();else void video.play?.().catch?.(()=>{});}
    else if(action.type==='seek')for(const video of pane.querySelectorAll?.('video')||[]){try{video.currentTime=Math.max(0,Number(action.seekMs)||0)/1000;}catch(_){}}
    else if(action.type==='shader'){
      if(action.coherent!==null)pane.classList.toggle('coherent',!!action.coherent);
      if(action.intensity!==null)pane.style.setProperty('--fault-intensity',String(action.intensity));
    }else if(action.type==='geometry'&&(!pane.dataset.manual||action.geometry?.force)){
      pane.style.left=`${action.geometry.anchorX*100}%`;pane.style.top=`${action.geometry.anchorY*100}%`;
    }
  }
  function schedulePaneScore(plan,surface,pane){
    const score=compilePaneScore(plan,surface.id);
    const runCycle=()=>{
      if(activePlan!==plan)return;
      replaceMedia(plan,surface,pane,score.initial);pane.style.display='block';
      const duration=Math.max(1,score.durationMs),raw=Math.max(0,Date.now()-score.epochMs),elapsed=score.loop?raw%duration:Math.min(duration,raw);
      for(const cue of score.cues){
        if(!Object.hasOwn(cue,'atMs'))continue;
        const due=cue.atMs+cue.delayMs;
        if(due<=elapsed)applyScoreAction(plan,surface,pane,cue.action,cue.id);
        else{const timer=setTimeout(()=>{scoreTimers.delete(timer);if(activePlan===plan)applyScoreAction(plan,surface,pane,cue.action,cue.id);},due-elapsed);scoreTimers.add(timer);}
      }
      if(score.loop){const timer=setTimeout(()=>{scoreTimers.delete(timer);runCycle();},Math.max(1,duration-elapsed));scoreTimers.add(timer);}
    };
    runCycle();
  }
  function show(plan){
    const host=ensure();if(!host)return false;
    clear();activePlan=plan;host.dataset.cue=plan.cueId;host.classList.add('active');
    host.classList.toggle('composition',plan.kind==='composition');
    for(const surface of plan.surfaces){
      const pane=documentApi.createElement('div');
      pane.className=plan.kind==='composition'?'window-choreography-sim-pane window-composition-pane':`window-choreography-sim-pane palette-${surface.palette}`;
      const x=plan.kind==='composition'?surface.entry.x:surface.x,y=plan.kind==='composition'?surface.entry.y:surface.y;
      pane.style.left=`${x*100}%`;pane.style.top=`${y*100}%`;
      pane.style.width=`${plan.kind==='composition'?surface.width:surface.size}px`;pane.style.height=`${plan.kind==='composition'?surface.height:surface.size}px`;
      if(plan.kind==='composition'){
        pane.style.zIndex=String(surface.z);
        pane.dataset.shader=surface.shader;
        pane.style.setProperty('--fault-intensity',String(Math.min(1,(plan.fault?.intensity||0)*(surface.faultScale||1))));
        pane.classList.toggle('flash-reduced',plan.fault?.flashMode==='reduced');
        pane.classList.toggle('flash-off',plan.fault?.flashMode==='off');
      }
      pane.dataset.paneId=surface.id;panes.set(surface.id,pane);
      if(plan.kind==='composition'){
        pane.append(mediaChild(plan,surface));
        if(surface.draggable){
          pane.style.pointerEvents='auto';let drag=null;
          pane.addEventListener?.('pointerdown',(event)=>{event.preventDefault?.();event.stopPropagation?.();pane.dataset.manual='true';drag={x:event.clientX,y:event.clientY,left:pane.offsetLeft,top:pane.offsetTop};pane.setPointerCapture?.(event.pointerId);});
          pane.addEventListener?.('pointermove',(event)=>{if(!drag)return;pane.style.left=`${drag.left+event.clientX-drag.x}px`;pane.style.top=`${drag.top+event.clientY-drag.y}px`;});
          const end=(event)=>{if(!drag)return;drag=null;pane.releasePointerCapture?.(event.pointerId);report(plan,surface,pane);};
          pane.addEventListener?.('pointerup',end);pane.addEventListener?.('pointercancel',end);
        }
      }
      if(surface.interactive){
        pane.style.pointerEvents='auto';
        pane.addEventListener?.('pointerdown',(event)=>{
          event.preventDefault?.();event.stopPropagation?.();
          dispatch('chunk-surfer:window-pane-action',{cueId:plan.cueId,paneId:surface.id,action:'enter'});
        });
      }
      if(plan.kind!=='composition')pane.textContent=surface.text||'';host.append(pane);
      if(plan.kind==='composition'){
        const delay=(plan.formation?.delayMs||0)+surface.index*(plan.formation?.staggerMs||0);
        const duration=plan.formation?.durationMs||0;
        const timer=setTimeout(()=>{
          formationTimers.delete(timer);
          pane.style.transition=duration?`left ${duration}ms cubic-bezier(.22,.75,.18,1), top ${duration}ms cubic-bezier(.22,.75,.18,1)`:'none';
          pane.style.left=`${surface.initial.x*100}%`;pane.style.top=`${surface.initial.y*100}%`;
          const reportTimer=setTimeout(()=>{formationTimers.delete(reportTimer);report(plan,surface,pane);},duration);
          formationTimers.add(reportTimer);
        },delay);
        formationTimers.add(timer);
        schedulePaneScore(plan,surface,pane);
      }
    }
    return true;
  }
  function snap(plan,{coherent=false}={}){
    const host=ensure();if(!host)return false;
    const bounds=host.getBoundingClientRect();
    for(const surface of plan.surfaces){const pane=panes.get(surface.id);if(!pane||!surface.target)continue;
      pane.style.left=`${surface.target.anchorX*bounds.width+surface.target.offsetX}px`;
      pane.style.top=`${surface.target.anchorY*bounds.height+surface.target.offsetY}px`;
      pane.classList.toggle('coherent',!!coherent);report(plan,surface,pane);}return true;
  }
  function coherence(value=true){for(const pane of panes.values())pane.classList.toggle('coherent',!!value);}
  function freeze(value=true){for(const pane of panes.values())for(const video of pane.querySelectorAll?.('video')||[]){if(value)video.pause?.();else void video.play?.().catch?.(()=>{});}}
  function trigger(plan,eventName){
    if(activePlan!==plan)return false;
    let matched=false;
    for(const surface of plan.surfaces){
      const pane=panes.get(surface.id),score=compilePaneScore(plan,surface.id);
      for(const cue of score.cues){
        if(cue.event!==eventName)continue;matched=true;
        const timer=setTimeout(()=>{scoreTimers.delete(timer);if(activePlan===plan)applyScoreAction(plan,surface,pane,cue.action,cue.id);},cue.delayMs||0);scoreTimers.add(timer);
      }
    }
    return matched;
  }
  function hide(){if(root){root.classList.remove('active');clear();}}
  return{show,snap,coherence,freeze,trigger,hide,active:()=>!!root?.classList?.contains('active')};
}

export function createWindowChoreographyDirector({
  effects=null,runtimeApi=null,documentApi=globalThis.document,
  getEnabled=()=>true,getDisplayMode=()=> 'windowed',getReducedMotion=()=>false,
  getCompositionContext=()=>({introduced:false,lastEndingId:'',reduceDread:false}),
  isApertureComplete=()=>false,onFirstBreach=()=>{},onPuzzleState=()=>{},onApertureComplete=()=>{},
  tokenFactory=()=>`window-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  waitFn=wait,onState=()=>{},onGeometryMotion=()=>{},
}={}){
  let api=runtimeApi;
  let transaction=null;
  let battle=null;
  let source={stage:'sealed',sequence:0,bucket:-1};
  let ending=null;
  let composition=null;
  let sequence=0;
  let epoch=0;
  let planTail=Promise.resolve();
  let lastEscapeAt=-Infinity;
  let titleGeneration=0;
  let frontEndLease=null;
  let frontEndReady=Promise.resolve(null);
  const simulation=createSimulation(documentApi,effects);

  const reduced=()=>!!getReducedMotion();
  const compositionContext=()=>{
    const context=getCompositionContext()||{};
    return{...context,flashMode:['full','reduced','off'].includes(context.flashMode)?context.flashMode:'full'};
  };
  // WINDOW CHOREOGRAPHY is the authority for whether desktop windows exist.
  // Reduced motion removes travel and dissolves in the compiled plans; it must
  // not silently replace the feature with an in-frame simulation after the
  // player explicitly left choreography enabled.
  const nativeDesired=()=>!!getEnabled()&&isTauriRuntime();
  async function loadApi(){
    if(api)return api;
    if(!nativeDesired())return null;
    try{api=await import('@tauri-apps/api/core');}catch(_){api=null;}
    return api;
  }
  // Is the window covering the screen by ANY route — game mode, a macOS Space,
  // or a frame someone dragged out to the edges? Any of the three has to be
  // left before an authored cue can move the window or open a surface beside
  // it, and only the first of them is anything the app knows it did.
  async function measuredFullscreen(nativeApi){
    if(nativeApi?.invoke){
      const metrics=await safe(()=>nativeApi.invoke('chunk_window_metrics'));
      if(metrics&&typeof metrics==='object'){
        return !!(metrics.native_fullscreen||metrics.simple_fullscreen||metrics.fills_screen);
      }
    }
    return getDisplayMode()==='game-mode';
  }

  async function beginTransaction(sceneId,{forceSimulate=false}={}){
    if(transaction)return transaction;
    const token=stableId(tokenFactory());
    if(forceSimulate){transaction={token,sceneId,native:false,restoreGameMode:false,cancelled:false};onState({type:'begin',...transaction});return transaction;}
    const nativeApi=await loadApi();
    // ASK THE WINDOW, DO NOT ASK THE SETTINGS FILE.
    //
    // This was `getDisplayMode()==='game-mode'` — a persisted settings string.
    // It never asked the OS, so every fullscreen the app did not itself put the
    // player into was invisible to it. The common one is macOS NATIVE
    // fullscreen: the window is decorated and resizable, so the green
    // traffic-light button and Cmd+Ctrl+F are live and produce a real Space.
    // The setting still read 'windowed', restore_game_mode:false went to Rust,
    // the exit was skipped — and then base_center refused to place any surface
    // at all, because nothing can be composited over a Space. From the outside:
    // authored window motion simply never happened, and windowing the app by
    // hand fixed it.
    //
    // The metrics call is the truth now (display_policy.rs reports native,
    // simple and measured fills-screen separately). The setting is only the
    // fallback for when the probe itself fails.
    const restoreGameMode=await measuredFullscreen(nativeApi);
    let native=false;
    if(nativeApi?.invoke){
      const result=await safe(()=>nativeApi.invoke('chunk_window_choreography_begin',{request:{token,sceneId,restoreGameMode}}));
      native=!!result;
      // A begin that fails leaves the cue as an in-frame simulation, which is a
      // legitimate fallback and used to be a completely silent one — the only
      // realistic error is "fullscreen exit did not settle" and nobody ever saw
      // it. Say so.
      if(!native)void logWarn('window choreography transaction refused',`scene ${sceneId} played in frame; leaving fullscreen was ${restoreGameMode?'required':'not required'}`);
    }
    // THE AUTHORED POLICY, WHICH WAS WRITTEN DOWN AND NEVER CONSULTED.
    //
    // windowChoreographyPolicy() is the per-scene display opinion — battle-only,
    // source-leakage, ending-resolution, credits-restoration, stable — and until
    // now its only consumer was a test. It is the closest thing this codebase has
    // to authored framing, and it was decorative. Carrying it on the transaction
    // means a scene's declared policy travels with the cue and is reported to
    // onState, so anything downstream can act on it and a reader can tell it is
    // in effect.
    const policy=windowChoreographyPolicy(sceneId);
    transaction={token,sceneId,native,restoreGameMode,policy,cancelled:false};
    onState({type:'begin',...transaction});
    return transaction;
  }

  async function performPlan(plan,{forceSimulate=false,compositionMode='cold',handoffDurationMs=260}={}){
    const active=await beginTransaction(plan.sceneId,{forceSimulate});
    const useNative=active.native&&!forceSimulate;
    let nativeMoved=false,nativePanes=false;
    if(plan.kind==='composition'){
      if(useNative)nativePanes=!!await safe(()=>effects?.showComposition?.(plan,{
        token:effects?.sessionToken?.(),mode:compositionMode,handoffDurationMs,
      }));
      const simulated=forceSimulate||!useNative||!nativePanes;
      if(simulated)simulation.show(plan);else simulation.hide();
      onState({type:'composition',plan,native:useNative&&!simulated,simulated});
      return{plan,native:useNative&&!simulated,simulated};
    }
    if(useNative&&api?.invoke&&plan.mainFrame.length){
      onGeometryMotion(true);
      try{
        nativeMoved=!!await safe(()=>api.invoke('chunk_window_choreography_execute',{request:{
          token:active.token,cueId:plan.cueId,keyframes:plan.mainFrame,interruptible:plan.interruptible,
        }}));
      }finally{onGeometryMotion(false);}
    }
    if(useNative&&plan.surfaces.length){
      nativePanes=!!await safe(()=>effects?.showPanes?.(plan.surfaces,{token:effects?.sessionToken?.(),cueId:plan.cueId}));
    }else if(!plan.surfaces.length){
      await safe(()=>effects?.hidePanes?.());
      nativePanes=true;
    }
    const simulated=forceSimulate||!useNative||(plan.surfaces.length&&!nativePanes)||(plan.mainFrame.length&&!nativeMoved);
    if(simulated)simulation.show(plan);else simulation.hide();
    onState({type:'plan',plan,native:useNative&&!simulated,simulated});
    return{plan,native:useNative&&!simulated,simulated};
  }

  function runPlan(plan,options={}){
    const owner=epoch;
    const task=planTail.then(()=>owner===epoch?performPlan(plan,options):null);
    planTail=task.catch(()=>null);
    return task;
  }

  function compositionEvent(name,payload={}){
    const plan=composition?.plan,event=stableId(name);
    if(!plan||!event||!plan.score?.cues?.some((cue)=>cue.event===event))return false;
    if(!composition.presented){composition.pendingEvents?.add(event);onState({type:'composition-event-queued',plan,event});return true;}
    const effectiveAtMs=Math.max(Date.now()+32,Number(payload?.effectiveAtMs)||Date.now()+64);
    simulation.trigger(plan,event);
    void safe(()=>effects?.triggerComposition?.(plan,event,{effectiveAtMs}));
    onState({type:'composition-event',plan,event});
    return true;
  }
  function markCompositionPresented(active){
    if(composition!==active)return false;
    active.presented=true;
    const pending=[...(active.pendingEvents||[])];active.pendingEvents?.clear();
    for(const event of pending)compositionEvent(event);
    return true;
  }

  function clearCompositionTimers(){
    if(composition?.holdTimer)clearTimeout(composition.holdTimer);
    if(composition?.hintTimer)clearTimeout(composition.hintTimer);
    composition=null;
  }
  async function restore(reason='restore',{closePool=false,preserveComposition=false}={}){
    epoch+=1;
    titleGeneration+=1;
    const active=transaction;
    const puzzleWasActive=composition?.purpose==='puzzle'&&!composition.completed;
    transaction=null;battle=null;ending=null;source={stage:'sealed',sequence:0,bucket:-1};frontEndLease=null;frontEndReady=Promise.resolve(null);
    if(!preserveComposition){clearCompositionTimers();simulation.hide();await safe(()=>effects?.hideComposition?.());if(puzzleWasActive)onPuzzleState(false);}
    onGeometryMotion(false);
    await safe(()=>effects?.hidePanes?.());
    if(active?.native&&api?.invoke)await safe(()=>api.invoke('chunk_window_choreography_restore',{token:active.token}));
    if(closePool)await safe(()=>effects?.emergencyRestore?.({notify:false}));
    onState({type:'restore',reason,token:active?.token||null,policy:active?.policy||null});
    return true;
  }

  function prepareBattle({battleId='',encounterId='',reducedMotion=false}={}){
    if(composition?.purpose==='death'){
      void safe(()=>effects?.hideComposition?.());simulation.hide();clearCompositionTimers();
    }
    const profile=battleChoreographyProfile(battleId);
    battle=profile?{battleId:profile.battleId,encounterId,profile,sequence:0,damageCount:0,breached:false,reducedMotion:!!reducedMotion}:null;
    return battle;
  }

  async function fireballCast({battleId='',castId='',windowLock=false}={}){
    const profile=battle?.profile||battleChoreographyProfile(battleId);
    if(!profile)return null;
    if(!battle)battle={battleId:profile.battleId,encounterId:battleId,profile,sequence:0,damageCount:0,breached:false,reducedMotion:reduced()};
    // The first actual cast is the first breach. Merely entering a fight only
    // prewarms surfaces and never changes the desktop.
    if(battle.breached)return null;
    battle.breached=true;
    if(profile.battleId==='natatorium')onFirstBreach({battleId:profile.battleId,castId:String(castId||'')});
    const result=await runPlan(battleIntroPlan(profile,{sequence:battle.sequence++,reducedMotion:reduced()||battle.reducedMotion||windowLock}));
    await waitFn(reduced()?220:680);
    if(battle?.battleId===profile.battleId){
      await safe(()=>effects?.hidePanes?.());simulation.hide();
      onState({type:'merge',sceneId:`battle:${profile.battleId}`});
    }
    return result;
  }

  async function damage({battleId='',received=0,phase=false,origin=null,windowLock=false}={}){
    const profile=battle?.profile||battleChoreographyProfile(battleId);
    if(!profile||windowLock)return null;
    if(battle)battle.damageCount+=1;
    const count=battle?.damageCount||1;
    const authored=phase||profile.activity>=1
      ||(profile.activity>=.8&&count%5!==0)
      ||(profile.activity>=.5&&count%2===1)
      ||(profile.activity>=.3&&count%3===1)
      ||(profile.activity<.3&&count%5===1);
    if(!authored)return null;
    const grade=phase?'phase':Number(received)>=8?'heavy':'light';
    return runPlan(battleDamagePlan(profile,{grade,origin,sequence:sequence++,reducedMotion:reduced()}));
  }

  async function result({battleId='',result='abort'}={}){
    if(result!=='lose')return null;
    const profile=battle?.profile||battleChoreographyProfile(battleId);
    if(!profile)return null;
    const context=compositionContext();
    const snapshotToken=effects?.captureSnapshot?.()||'snapshot-unavailable';
    const plan=deathCompositionPlan({battleId:profile.battleId,snapshotToken,reduceDread:!!context.reduceDread,reducedMotion:reduced(),flashMode:context.flashMode,epochMs:Date.now()});
    const active={plan,purpose:'death',state:{},completed:false,presented:false,pendingEvents:new Set()};
    composition=active;
    void runPlan(plan).then(()=>markCompositionPresented(active)).catch(()=>null);
    // The result dialogue owns retry timing. A native decoder or surface that
    // is late is allowed to fall back, never to hold this promise open.
    return{plan,scheduled:true};
  }

  async function finishBattle({battleId='',result='abort'}={}){
    // A battle breach is one transaction. Source hands that transaction to its
    // ending; every other result and every abort restores here.
    if((battleId==='source-final'||battle?.battleId==='source-final')&&['win','lose'].includes(result)){
      battle=null;
      onState({type:'handoff',from:'battle:source-final',to:'ending'});
      return true;
    }
    return restore(`battle:${result}`,{preserveComposition:result==='lose'});
  }

  function placementState(detail){
    const value=detail?.placement;if(!value?.center)return null;
    return{x:Number(value.center.x)||0,y:Number(value.center.y)||0,width:Number(value.width)||0,height:Number(value.height)||0,monitor:String(value.monitor||'')};
  }
  async function completeAperture(){
    if(!composition||composition.purpose!=='puzzle'||composition.completed)return false;
    composition.completed=true;
    if(composition.holdTimer)clearTimeout(composition.holdTimer);
    compositionEvent('aperture:complete');
    await safe(()=>effects?.freezeComposition?.(composition.plan.cueId,true));simulation.freeze(true);
    onState({type:'puzzle-complete',plan:composition.plan});
    await waitFn(300);
    await safe(()=>effects?.hideComposition?.());simulation.hide();
    onApertureComplete();onPuzzleState(false);composition=null;
    return true;
  }
  function evaluatePuzzle(){
    if(!composition||composition.purpose!=='puzzle'||composition.completed)return null;
    const result=evaluateCompositionConstraints(composition.plan,composition.state);
    if(result.ok&&!composition.holdTimer&&!composition.settling)void settleAperture();
    else if(!result.ok&&composition.holdTimer){clearTimeout(composition.holdTimer);composition.holdTimer=null;}
    if(!result.ok){
      const tolerances=new Map(composition.plan.constraints.map((constraint)=>[constraint.id,constraint.tolerance]));
      const near=result.results.filter((entry)=>entry.ok||entry.error<=Math.max(24,(tolerances.get(entry.id)||0)*2)).map((entry)=>entry.id).sort().join(':');
      const now=Date.now();
      if(near&&(near!==composition.nearKey||now-(composition.nearAt||0)>900)){
        composition.nearKey=near;composition.nearAt=now;compositionEvent('aperture:near');
      }
    }
    onState({type:'puzzle-progress',result,elapsedMs:Date.now()-composition.startedAt});
    return result;
  }
  async function settleAperture(){
    const active=composition;
    if(!active||active.purpose!=='puzzle'||active.completed||active.settling)return false;
    active.settling=true;
    simulation.snap(active.plan,{coherent:true});
    await safe(()=>effects?.snapComposition?.(active.plan,{coherent:true,durationMs:120}));
    if(composition!==active||active.completed)return false;
    active.settling=false;
    const result=evaluateCompositionConstraints(active.plan,active.state);
    onState({type:'puzzle-settled',plan:active.plan,result});
    if(!result.ok)return false;
    active.holdTimer=setTimeout(()=>{void completeAperture();},active.plan.completion.holdMs||650);
    active.holdTimer.unref?.();
    return true;
  }
  function noteCompositionMove(detail={}){
    if(!composition||String(detail.cueId||'')!==composition.plan.cueId)return false;
    const next=placementState(detail);if(!next)return false;
    composition.state[detail.paneId]=next;evaluatePuzzle();return true;
  }
  function armPuzzleHint(active){
    if(!active||active.purpose!=='puzzle'||active.completed)return;
    const delay=Math.max(0,20000-(Date.now()-active.startedAt));
    active.hintTimer=setTimeout(()=>{
      if(composition!==active||active.completed)return;
      simulation.coherence(true);void safe(()=>effects?.setCompositionCoherence?.(active.plan,true));
      compositionEvent('aperture:hint');
      onState({type:'puzzle-hint',plan:active.plan});
    },delay);
    active.hintTimer.unref?.();
  }
  async function startAperture({forceSimulate=false}={}){
    if(isApertureComplete()||composition?.purpose==='puzzle')return null;
    const context=compositionContext();
    const plan=apertureCompositionPlan({reduceDread:!!context.reduceDread,reducedMotion:reduced(),flashMode:context.flashMode,epochMs:Date.now()});
    const active={plan,purpose:'puzzle',state:{},startedAt:Date.now(),completed:false,settling:false,holdTimer:null,hintTimer:null,presented:false,pendingEvents:new Set()};
    composition=active;
    onPuzzleState(true);onState({type:'puzzle-start',plan});
    armPuzzleHint(composition);
    const result=await runPlan(plan,{forceSimulate});markCompositionPresented(active);return result;
  }
  async function puzzleInteract(){
    if(!composition||composition.purpose!=='puzzle'||composition.completed)return false;
    if(Date.now()-composition.startedAt<45000)return false;
    simulation.snap(composition.plan,{coherent:true});
    await safe(()=>effects?.snapComposition?.(composition.plan,{coherent:true}));
    onState({type:'puzzle-auto-assemble',plan:composition.plan});return true;
  }

  async function sourceFrame(frame={}){
    const stage=sourceLeakStage(frame);
    if(stage.id==='sealed'){
      // A stale Source transaction may exist after a god-menu jump or reload,
      // but the real page/dock/door chain must never inherit it.
      if(source.stage!=='sealed')await restore('source-threshold-exit');
      source={stage:'sealed',sequence:0,bucket:-1};
      return stage;
    }
    const bucket=Math.floor(stage.progress*12);
    if(stage.id===source.stage&&bucket===source.bucket)return stage;
    source.stage=stage.id;
    source.bucket=bucket;
    if(nativeDesired()){
      effects?.ensure?.({intensity:'hostile',fullscreen:getDisplayMode()==='game-mode',reducedMotion:reduced()});
      if(stage.id==='white')void safe(()=>effects?.prepareMedia?.({count:4}));
    }
    if(stage.id==='proper'&&!isApertureComplete()){
      await startAperture();
      return stage;
    }
    await runPlan(sourcePlan(stage,source.sequence++,reduced()));
    return stage;
  }

  function leaveSource(reason='source-exit'){
    const sourceOwned=source.stage!=='sealed'||composition?.purpose==='puzzle'||String(transaction?.sceneId||'').startsWith('source:');
    if(!sourceOwned)return Promise.resolve(false);
    return restore(reason);
  }

  async function beginEnding(endingId=''){
    const profile=endingChoreographyProfile(endingId);
    if(!profile)return null;
    ending=profile;
    if(nativeDesired())effects?.ensure?.({intensity:'hostile',fullscreen:getDisplayMode()==='game-mode',reducedMotion:reduced()});
    const context=compositionContext();
    const plan=endingCompositionPlan(endingId,{epochMs:Date.now(),reduceDread:!!context.reduceDread,reducedMotion:reduced(),flashMode:context.flashMode});
    if(nativeDesired())await safe(()=>effects?.prepareMedia?.({count:plan.surfaces.length}));
    const active={plan,purpose:'ending',state:{},startedAt:Date.now(),completed:false,presented:false,pendingEvents:new Set()};
    composition=active;
    const result=await runPlan(endingPlan(profile,sequence++,reduced()));
    await runPlan(plan);
    markCompositionPresented(active);
    await waitFn(reduced()?80:620);
    if(composition===active){
      simulation.snap(plan,{coherent:true});
      await safe(()=>effects?.snapComposition?.(plan,{coherent:true,durationMs:reduced()?0:600}));
    }
    return result;
  }

  function beginOpening(){
    const generation=(frontEndLease?.generation||0)+1;
    frontEndLease={active:true,owner:'opening',generation,token:null,effectsToken:effects?.sessionToken?.()||null,quiesced:false};
    onState({type:'front-end-window-owner',owner:'opening',generation,token:null});
    frontEndReady=(async()=>{
      const active=await beginTransaction('opening-credits');
      let effectsToken=effects?.sessionToken?.()||null;
      if(nativeDesired()){
        effectsToken=effects?.ensure?.({intensity:'standard',fullscreen:false,reducedMotion:reduced()})||effectsToken;
      }
      if(frontEndLease?.active&&frontEndLease.generation===generation){
        frontEndLease.token=active?.token||null;
        frontEndLease.effectsToken=effectsToken||effects?.sessionToken?.()||null;
      }
      return active;
    })().catch(()=>null);
    return frontEndReady;
  }


  async function beginTitle({handoff=false}={}){
    const context=compositionContext();
    if(!context.introduced)return null;
    const owner=++titleGeneration;
    const canHandoff=!!handoff&&frontEndLease?.active&&frontEndLease.owner==='opening';
    let leaseGeneration=null;
    if(canHandoff){
      frontEndLease.owner='title';
      frontEndLease.generation+=1;
      const handoffGeneration=frontEndLease.generation;
      await frontEndReady;
      if(!frontEndLease?.active||frontEndLease.owner!=='title'||frontEndLease.generation!==handoffGeneration)return null;
      frontEndLease.token=transaction?.token||frontEndLease.token||null;
      frontEndLease.effectsToken=effects?.sessionToken?.()||frontEndLease.effectsToken||null;
      frontEndLease.quiesced=!!await safe(()=>effects?.quiesceComposition?.());
      frontEndLease.effectsToken=effects?.sessionToken?.()||frontEndLease.effectsToken||null;
      leaseGeneration=frontEndLease.generation;
      onState({type:'front-end-window-owner',owner:'title',generation:leaseGeneration,token:frontEndLease.token,handoff:true});
    }
    const plan=titleCompositionPlan({endingId:context.lastEndingId||'',epochMs:Date.now(),reducedMotion:reduced(),flashMode:context.flashMode});
    if(nativeDesired()){
      if(!canHandoff)effects?.ensure?.({intensity:'standard',fullscreen:false,reducedMotion:reduced()});
      await safe(()=>effects?.prepareMedia?.({count:plan.surfaces.length}));
    }
    if(owner!==titleGeneration)return null;
    await waitFn(420);
    if(owner!==titleGeneration)return null;
    if(canHandoff&&(!frontEndLease?.active||frontEndLease.owner!=='title'||frontEndLease.generation!==leaseGeneration))return null;
    const active={plan,purpose:'title',state:{},startedAt:Date.now(),completed:false,presented:false,pendingEvents:new Set()};
    composition=active;
    const result=await runPlan(plan,{compositionMode:canHandoff?'handoff':'cold',handoffDurationMs:reduced()?0:260});
    if(result)markCompositionPresented(active);
    return result;
  }

  async function finishTitle({windowPolicy='none',nextPlan=null}={}){
    titleGeneration+=1;
    if(frontEndLease?.active)frontEndLease.generation+=1;
    const active=composition?.purpose==='title'?composition:null;

    if(windowPolicy==='preserve'){
      if(active){
        await safe(()=>effects?.quiesceComposition?.());
        frontEndLease=frontEndLease||{active:true,token:transaction?.token||null,effectsToken:effects?.sessionToken?.()||null,generation:1};
        frontEndLease.owner='game';frontEndLease.active=true;frontEndLease.quiesced=true;
        onState({type:'front-end-window-owner',owner:'game',generation:frontEndLease.generation,token:frontEndLease.token,windowPolicy});
      }
      return !!active;
    }

    if(windowPolicy==='replace'&&nextPlan){
      if(active)await safe(()=>effects?.quiesceComposition?.());
      frontEndLease=frontEndLease||{active:true,token:transaction?.token||null,effectsToken:effects?.sessionToken?.()||null,generation:1};
      frontEndLease.owner='game';frontEndLease.active=true;frontEndLease.quiesced=false;
      const next={plan:nextPlan,purpose:'game',state:{},startedAt:Date.now(),completed:false,presented:false,pendingEvents:new Set()};
      composition=next;
      const result=await runPlan(nextPlan,{compositionMode:'handoff',handoffDurationMs:reduced()?0:260});
      if(result)markCompositionPresented(next);
      return !!result;
    }

    // Ordinary gameplay currently owns no secondary windows. This is the first
    // front-end boundary allowed to retire visible panes; the native pool stays
    // warm because restore() hides rather than closes it.
    if(active){
      simulation.snap(active.plan);
      await safe(()=>effects?.snapComposition?.(active.plan,{durationMs:360}));
      await waitFn(380);
    }
    return restore('title-exit');
  }

  async function credits(){const result=await restore('credits',{closePool:true});await safe(()=>effects?.end?.());return result;}
  async function emergencyRestore({preservePuzzle=true}={}){
    // Emergency cleanup is an escape hatch, not a combat choice. Forgive the
    // live projectile before its surfaces disappear; otherwise an invisible
    // exchange can keep counting and damage the player after the reset.
    const EventCtor=documentApi?.defaultView?.CustomEvent||globalThis.CustomEvent;
    if(EventCtor)keyTarget?.dispatchEvent?.(new EventCtor('chunk-surfer:fireball-forgive',{detail:{reason:'emergency-restore'}}));
    const puzzle=preservePuzzle&&composition?.purpose==='puzzle'&&!composition.completed
      ?{plan:composition.plan,startedAt:composition.startedAt}:null;
    await restore('emergency',{closePool:true});
    if(!puzzle)return true;
    composition={plan:puzzle.plan,purpose:'puzzle',state:{},startedAt:puzzle.startedAt,completed:false,settling:false,holdTimer:null,hintTimer:null,presented:true,pendingEvents:new Set()};
    armPuzzleHint(composition);
    onPuzzleState(true);return performPlan(puzzle.plan,{forceSimulate:true});
  }
  function suspend(){void safe(()=>effects?.suspendSurfaces?.());return true;}
  function interactSource(){
    if(composition?.purpose==='puzzle'||source.stage!=='proper'||source.interacted)return false;
    source.interacted=true;
    simulation.hide();void safe(()=>effects?.hidePanes?.());
    onState({type:'pane-action',sceneId:'source:white-crossing',action:'enter'});
    return true;
  }

  const keyTarget=documentApi?.defaultView||globalThis.window;
  keyTarget?.addEventListener?.('keydown',(event)=>{
    if(event.key!=='Escape'||event.repeat)return;
    const now=Number(event.timeStamp)||Date.now();
    if(now-lastEscapeAt<=850){lastEscapeAt=-Infinity;void emergencyRestore();}
    else lastEscapeAt=now;
  },true);
  keyTarget?.addEventListener?.('chunk-surfer:window-pane-action',()=>{interactSource();});
  keyTarget?.addEventListener?.('chunk-surfer:window-media-moved',(event)=>{noteCompositionMove(event.detail||{});});
  keyTarget?.addEventListener?.('chunk-surfer:window-media-action',(event)=>{if(event.detail?.action==='escape')void emergencyRestore();});

  return{
    prepareBattle,fireballCast,damage,result,finishBattle,sourceFrame,leaveSource,beginEnding,beginOpening,beginTitle,finishTitle,credits,
    emergencyRestore,suspend,runPlan,compositionEvent,interactSource,puzzleInteract,noteCompositionMove,
    active:()=>!!transaction,
    debug:()=>({transaction:transaction?{...transaction}:null,battle:battle?{battleId:battle.battleId,breached:battle.breached}:null,source:{...source},ending,composition:composition?{purpose:composition.purpose,cueId:composition.plan.cueId,completed:composition.completed}:null,frontEnd:frontEndLease?{...frontEndLease,effectsToken:effects?.sessionToken?.()||frontEndLease.effectsToken||null}:null}),
  };
}
