import mediaManifest from '../../content/media/window-media.media.json' with { type: 'json' };

export const MAX_MEDIA_SURFACES=8;
export const WINDOW_MEDIA_PROTOCOL=2;
export const WINDOW_MEDIA_SURFACE_LABELS=Object.freeze(
  Array.from({length:MAX_MEDIA_SURFACES},(_,index)=>`window-media-${index+1}`),
);
export const WINDOW_COMPOSITION_PURPOSES=Object.freeze(['title','death','ending','puzzle','return','sector']);
export const WINDOW_MEDIA_CONTENT_KINDS=Object.freeze(['video','image','snapshot','text','procedural']);
export const WINDOW_MEDIA_PROCEDURAL_PRESETS=Object.freeze(['iris-abstraction','distant-dot','empty-field','game-fragment']);
export const WINDOW_MEDIA_SHADER_PROFILES=Object.freeze(['violet-dither','nvme-sector']);
export const WINDOW_COMPOSITION_FLASH_MODES=Object.freeze(['full','reduced','off']);
export const WINDOW_SCORE_OPERATIONS=Object.freeze([
  'assign','clone','echo','mosaic','swap','relay','ripple',
  'freeze','resume','seek','shader','show','hide','geometry',
]);
export const WINDOW_SCORE_TRANSITIONS=Object.freeze(['cut','dissolve','dip-black']);

const ASSETS=new Map((mediaManifest.assets||[]).map((asset)=>[asset.id,Object.freeze(asset)]));
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));
const stableId=(value='')=>String(value||'').replace(/[^a-z0-9:_-]/giu,'-').slice(0,96);
const unique=(values)=>[...new Set(values)];
const freeze=(value)=>Object.freeze(value);

function normalizePoint(point={},fallback={x:.5,y:.5}){
  return freeze({x:clamp(point.x??point.anchorX??fallback.x,.02,.98),y:clamp(point.y??point.anchorY??fallback.y,.02,.98)});
}
function normalizeCrop(crop={}){
  return freeze({x:clamp(crop.x),y:clamp(crop.y),w:clamp(crop.w??1,.05,1),h:clamp(crop.h??1,.05,1)});
}
function normalizeFlashMode(value='full'){
  const mode=String(value||'full');
  return WINDOW_COMPOSITION_FLASH_MODES.includes(mode)?mode:'full';
}
function normalizeTransition(value='cut',reducedMotion=false){
  if(reducedMotion)return'cut';
  const transition=String(value||'cut');
  return WINDOW_SCORE_TRANSITIONS.includes(transition)?transition:'cut';
}
function normalizeFault(fault={},flashMode='full'){
  const profile=WINDOW_MEDIA_SHADER_PROFILES.includes(fault.profile)?fault.profile:'nvme-sector';
  return freeze({
    profile,
    intensity:clamp(fault.intensity??0),
    seed:Math.max(0,Math.floor(Number(fault.seed)||0)),
    cadenceMs:Math.max(90,Math.min(1800,Math.round(Number(fault.cadenceMs)||420))),
    flashMode:normalizeFlashMode(fault.flashMode??flashMode),
  });
}

export function windowMediaAsset(id=''){return ASSETS.get(String(id||''))||null;}
export function windowMediaManifest(){return mediaManifest;}

export function normalizeWindowMediaContent(content={}){
  const kind=String(content.kind||'');
  if(!WINDOW_MEDIA_CONTENT_KINDS.includes(kind))throw new Error(`invalid composition content kind: ${kind}`);
  if(kind==='video'||kind==='image'){
    const asset=windowMediaAsset(content.assetId);
    if(!asset||asset.kind!==(kind==='image'?'image':'video'))throw new Error(`unknown composition asset: ${content.assetId}`);
    return freeze({kind,assetId:asset.id,playback:content.playback==='reverse'?'reverse':'forward'});
  }
  if(kind==='snapshot'){
    const token=stableId(content.token);
    if(!token.startsWith('snapshot-'))throw new Error('invalid snapshot token');
    return freeze({kind,token});
  }
  if(kind==='text')return freeze({kind,text:String(content.text||'').slice(0,80)});
  const preset=String(content.preset||'');
  if(!WINDOW_MEDIA_PROCEDURAL_PRESETS.includes(preset))throw new Error(`invalid procedural preset: ${preset}`);
  return freeze({kind,preset});
}

export function normalizeWindowMediaAssignment(value={}){
  const source=value.assignment||value;
  const content=normalizeWindowMediaContent(source.content||source);
  return freeze({
    content,
    crop:normalizeCrop(source.crop),
    phaseOffsetMs:Math.max(0,Math.round(Number(source.phaseOffsetMs)||0)),
  });
}

export function windowMediaContentId(value={}){
  const content=value.content||value;
  if(content.kind==='video'||content.kind==='image')return`${content.kind}:${content.assetId}`;
  if(content.kind==='snapshot')return`snapshot:${content.token}`;
  if(content.kind==='procedural')return`procedural:${content.preset}`;
  if(content.kind==='text')return`text:${content.text}`;
  return'unknown';
}

function normalizeSurface(surface,index,compositionId){
  const width=Math.round(Math.max(160,Math.min(320,Number(surface.width)||240)));
  const height=Math.round(Math.max(96,Math.min(320,Number(surface.height)||Math.round(width*.75))));
  const initial=normalizePoint(surface.initial??surface,{x:.5,y:.5});
  const assignment=normalizeWindowMediaAssignment(surface.initialAssignment||surface);
  return freeze({
    id:stableId(surface.id||`${compositionId}:pane:${index}`),index,
    content:assignment.content,assignment,crop:assignment.crop,phaseOffsetMs:assignment.phaseOffsetMs,
    shader:WINDOW_MEDIA_SHADER_PROFILES.includes(surface.shader)?surface.shader:'nvme-sector',
    entry:normalizePoint(surface.entry,initial),initial,
    target:surface.target?freeze({
      anchorX:clamp(surface.target.anchorX??surface.target.x??.5),anchorY:clamp(surface.target.anchorY??surface.target.y??.5),
      offsetX:Number(surface.target.offsetX)||0,offsetY:Number(surface.target.offsetY)||0,
    }):null,
    width,height,draggable:surface.draggable===true,
    description:String(surface.description||'').slice(0,180),
    sensitivity:['none','clinical'].includes(surface.sensitivity)?surface.sensitivity:'none',
    faultScale:clamp(surface.faultScale??1,.1,1.5),
    z:Math.max(0,Math.min(20,Math.floor(Number(surface.z)||index))),
  });
}

function normalizeTargets(value,surfaceIds,{allowEmpty=false}={}){
  const raw=Array.isArray(value)?value:[value];
  const targets=unique(raw.map(stableId).filter(Boolean));
  for(const id of targets)if(!surfaceIds.has(id))throw new Error(`unknown composition target: ${id}`);
  if(!allowEmpty&&!targets.length)throw new Error('score operation has no targets');
  return freeze(targets);
}

function normalizeSource(source,surfaceIds){
  const paneId=stableId(typeof source==='string'?source:source?.paneId);
  if(paneId){
    if(!surfaceIds.has(paneId))throw new Error(`unknown composition source: ${paneId}`);
    return freeze({paneId});
  }
  return freeze({assignment:normalizeWindowMediaAssignment(source||{})});
}

function normalizeOperation(operation,surfaces,reducedMotion,{nested=false}={}){
  const type=String(operation?.type||'');
  if(!WINDOW_SCORE_OPERATIONS.includes(type))throw new Error(`invalid score operation: ${type}`);
  const surfaceIds=new Set(surfaces.map((surface)=>surface.id));
  const common={
    type,
    transition:normalizeTransition(operation.transition,reducedMotion),
    durationMs:reducedMotion?0:Math.max(0,Math.min(300,Math.round(Number(operation.durationMs)||0))),
  };
  if(type==='assign'){
    const assignments={};
    for(const [rawId,value] of Object.entries(operation.assignments||{})){
      const id=stableId(rawId);if(!surfaceIds.has(id))throw new Error(`unknown composition target: ${id}`);
      assignments[id]=normalizeWindowMediaAssignment(value);
    }
    const targets=normalizeTargets(operation.targets||Object.keys(assignments),surfaceIds);
    if(targets.some((id)=>!assignments[id]))throw new Error('assign operation omits a target assignment');
    return freeze({...common,targets,assignments:freeze(assignments)});
  }
  if(['clone','echo','mosaic'].includes(type)){
    return freeze({...common,targets:normalizeTargets(operation.targets,surfaceIds),source:normalizeSource(operation.source,surfaceIds),
      stepMs:type==='echo'?Math.max(0,Math.min(4000,Math.round(Number(operation.stepMs)||0))):0,
      layout:type==='mosaic'?(operation.layout==='spatial'?'spatial':'grid'):null});
  }
  if(type==='swap'){
    const mapping={};
    for(const [rawTarget,rawSource] of Object.entries(operation.mapping||{})){
      const target=stableId(rawTarget),source=stableId(rawSource);
      if(!surfaceIds.has(target)||!surfaceIds.has(source))throw new Error('swap operation has an unknown pane');
      mapping[target]=source;
    }
    return freeze({...common,targets:normalizeTargets(operation.targets||Object.keys(mapping),surfaceIds),mapping:freeze(mapping)});
  }
  if(type==='relay'){
    const sourcePane=stableId(operation.sourcePane),targetPane=stableId(operation.targetPane);
    if(!surfaceIds.has(sourcePane)||!surfaceIds.has(targetPane))throw new Error('relay operation has an unknown pane');
    return freeze({...common,targets:freeze([sourcePane,targetPane]),sourcePane,targetPane,hideSource:!!operation.hideSource});
  }
  if(type==='ripple'){
    if(nested)throw new Error('nested ripple operations are not supported');
    const targets=normalizeTargets(operation.targets,surfaceIds);
    const explicit=Array.isArray(operation.order)?normalizeTargets(operation.order,surfaceIds):null;
    if(explicit&&explicit.length!==targets.length)throw new Error('ripple order must contain every target');
    return freeze({...common,targets,order:explicit||String(operation.order||'left-to-right'),
      intervalMs:Math.max(0,Math.min(1000,Math.round(Number(operation.intervalMs)||80))),
      operation:normalizeOperation({...operation.operation,targets:operation.operation?.targets||targets},surfaces,reducedMotion,{nested:true})});
  }
  const targets=normalizeTargets(operation.targets,surfaceIds);
  if(type==='seek')return freeze({...common,targets,seekMs:Math.max(0,Math.round(Number(operation.seekMs)||0))});
  if(type==='shader')return freeze({...common,targets,coherent:Object.hasOwn(operation,'coherent')?!!operation.coherent:null,
    intensity:Object.hasOwn(operation,'intensity')?clamp(operation.intensity):null});
  if(type==='geometry')return freeze({...common,targets,geometry:freeze({
    anchorX:clamp(operation.geometry?.anchorX??operation.geometry?.x??.5),anchorY:clamp(operation.geometry?.anchorY??operation.geometry?.y??.5),
    offsetX:Number(operation.geometry?.offsetX)||0,offsetY:Number(operation.geometry?.offsetY)||0,
    force:!!operation.geometry?.force,
  })});
  return freeze({...common,targets});
}

function normalizeCue(cue,index,surfaces,reducedMotion,durationMs){
  const event=stableId(cue.event);
  const hasAt=Number.isFinite(Number(cue.atMs));
  if((event&&hasAt)||(!event&&!hasAt))throw new Error('score cue must have exactly one trigger');
  const operations=(cue.operations||cue.ops||[]).map((operation)=>normalizeOperation(operation,surfaces,reducedMotion));
  if(!operations.length)throw new Error('score cue has no operations');
  return freeze({
    id:stableId(cue.id||`cue-${index}`),
    ...(event?{event}:{atMs:Math.max(0,Math.min(durationMs,Math.round(Number(cue.atMs)||0)))}),
    operations:freeze(operations),
  });
}

function normalizeScore(score={},surfaces,reducedMotion,loopDurationMs){
  const durationMs=Math.max(1000,Math.min(120000,Math.round(Number(score.durationMs)||Number(loopDurationMs)||12000)));
  const cues=(score.cues||[]).map((cue,index)=>normalizeCue(cue,index,surfaces,reducedMotion,durationMs));
  return freeze({schema:1,durationMs,loop:!!score.loop,cues:freeze(cues)});
}

export function validateWindowCompositionPlan(plan={}){
  const errors=[];
  if(![1,2].includes(plan.schema)||plan.kind!=='composition')errors.push('schema');
  if(!stableId(plan.compositionId)||!stableId(plan.sceneId)||!stableId(plan.cueId))errors.push('ids');
  if(!WINDOW_COMPOSITION_PURPOSES.includes(plan.purpose))errors.push('purpose');
  if(!Array.isArray(plan.surfaces)||plan.surfaces.length<1||plan.surfaces.length>MAX_MEDIA_SURFACES)errors.push('surfaces');
  for(const surface of plan.surfaces||[]){
    if(!surface.id||!surface.content||surface.width<160||surface.width>320||surface.height<96||surface.height>320)errors.push(`surface:${surface.id}`);
  }
  if(plan.schema===2&&(!plan.score||plan.score.schema!==1))errors.push('score');
  if(plan.purpose==='puzzle'&&!plan.constraints?.length)errors.push('puzzle.constraints');
  return freeze({ok:errors.length===0,errors:freeze(errors)});
}

export function compileWindowCompositionPlan({
  compositionId,sceneId,cueId=compositionId,purpose,surfaces=[],constraints=[],score=null,
  epochMs=Date.now(),loopDurationMs=12000,completion={mode:'nonblocking'},
  reducedMotion=false,simulate=false,foldDurationMs=450,flashMode='full',fault={},formation={},
}={}){
  if(!Array.isArray(surfaces)||surfaces.length<1||surfaces.length>MAX_MEDIA_SURFACES)throw new Error('invalid composition surface count');
  const id=stableId(compositionId),normalizedSurfaces=surfaces.map((surface,index)=>normalizeSurface(surface,index,id));
  const plan=freeze({
    schema:2,kind:'composition',compositionId:id,sceneId:stableId(sceneId),cueId:stableId(cueId),
    purpose:String(purpose||''),epochMs:Math.max(0,Number(epochMs)||Date.now()),
    loopDurationMs:Math.max(1000,Math.min(120000,Number(loopDurationMs)||12000)),
    surfaces:freeze(normalizedSurfaces),score:normalizeScore(score||{durationMs:loopDurationMs,loop:false,cues:[]},normalizedSurfaces,!!reducedMotion,loopDurationMs),
    constraints:freeze((constraints||[]).map((constraint)=>freeze({...constraint,tolerance:Math.max(0,Number(constraint.tolerance)||0)}))),
    completion:freeze({mode:String(completion?.mode||'nonblocking'),holdMs:Math.max(0,Number(completion?.holdMs)||0)}),
    reducedMotion:!!reducedMotion,simulate:!!simulate,foldDurationMs:Math.max(0,Math.min(1200,Number(foldDurationMs)||450)),
    flashMode:normalizeFlashMode(flashMode),fault:normalizeFault(fault,flashMode),
    formation:freeze({
      mode:String(formation.mode||'unfold'),
      delayMs:Math.max(0,Math.min(1200,Math.round(Number(formation.delayMs)||0))),
      durationMs:reducedMotion?0:Math.max(0,Math.min(600,Math.round(Number(formation.durationMs)||Number(foldDurationMs)||450))),
      staggerMs:reducedMotion?0:Math.max(0,Math.min(180,Math.round(Number(formation.staggerMs)||0))),
    }),
  });
  const validation=validateWindowCompositionPlan(plan);
  if(!validation.ok)throw new Error(`invalid window composition plan: ${validation.errors.join(', ')}`);
  return plan;
}

function pane(state,id){return state?.[id]||null;}
function edge(rect,side){
  if(side==='left')return rect.x-rect.width/2;
  if(side==='right')return rect.x+rect.width/2;
  if(side==='top')return rect.y-rect.height/2;
  return rect.y+rect.height/2;
}
export function evaluateCompositionConstraints(plan,state={}){
  const results=[];
  for(const constraint of plan?.constraints||[]){
    const a=pane(state,constraint.a),b=pane(state,constraint.b),c=pane(state,constraint.c);
    let error=Infinity;
    const sameMonitor=!a?.monitor||!b?.monitor||a.monitor===b.monitor;
    if(constraint.type==='edge-share'&&a&&b&&sameMonitor)error=Math.abs(edge(a,constraint.aEdge||'right')-edge(b,constraint.bEdge||'left'));
    else if(constraint.type==='align-center-y'&&a&&b&&sameMonitor)error=Math.abs(a.y-b.y);
    else if(constraint.type==='align-center-x'&&a&&b&&sameMonitor)error=Math.abs(a.x-b.x);
    else if(constraint.type==='center-on-seam-x'&&a&&b&&c&&sameMonitor&&(!c.monitor||c.monitor===a.monitor)){
      const seam=(edge(a,constraint.aEdge||'right')+edge(b,constraint.bEdge||'left'))*.5;
      error=Math.abs(c.x-seam);
    }else if(constraint.type==='vertical-touch'&&a&&b&&sameMonitor)error=Math.abs(edge(a,constraint.aEdge||'bottom')-edge(b,constraint.bEdge||'top'));
    results.push(freeze({id:String(constraint.id||constraint.type),error,ok:error<=constraint.tolerance}));
  }
  return freeze({ok:results.length>0&&results.every((result)=>result.ok),results:freeze(results),maxError:Math.max(0,...results.map((result)=>Number.isFinite(result.error)?result.error:1e9))});
}

function resolveSourceAssignment(plan,source){
  if(source?.assignment)return source.assignment;
  return plan.surfaces.find((surface)=>surface.id===source?.paneId)?.assignment||null;
}
function orderedTargets(plan,operation){
  const targets=[...operation.targets];
  if(Array.isArray(operation.order))return[...operation.order];
  const surface=(id)=>plan.surfaces.find((entry)=>entry.id===id);
  if(operation.order==='radial')return targets.sort((a,b)=>{
    const aa=surface(a)?.initial||{},bb=surface(b)?.initial||{};
    return Math.hypot((aa.x||0)-.5,(aa.y||0)-.5)-Math.hypot((bb.x||0)-.5,(bb.y||0)-.5);
  });
  if(operation.order==='spatial')return targets.sort((a,b)=>{
    const aa=surface(a)?.initial||{},bb=surface(b)?.initial||{};return(aa.y-bb.y)||(aa.x-bb.x);
  });
  return targets.sort((a,b)=>(surface(a)?.initial.x||0)-(surface(b)?.initial.x||0));
}
function mosaicAssignments(plan,operation){
  const source=resolveSourceAssignment(plan,operation.source),targets=orderedTargets(plan,{...operation,order:operation.layout==='spatial'?'spatial':operation.targets});
  const cols=Math.ceil(Math.sqrt(targets.length)),rows=Math.ceil(targets.length/cols),out={};
  targets.forEach((id,index)=>{out[id]=freeze({...source,crop:freeze({x:(index%cols)/cols,y:Math.floor(index/cols)/rows,w:1/cols,h:1/rows}),phaseOffsetMs:source.phaseOffsetMs});});
  return out;
}
function operationAction(plan,operation,paneId){
  if(!operation.targets.includes(paneId))return null;
  if(operation.type==='assign')return freeze({type:'assignment',assignment:operation.assignments[paneId],transition:operation.transition,durationMs:operation.durationMs});
  if(operation.type==='clone')return freeze({type:'assignment',assignment:resolveSourceAssignment(plan,operation.source),transition:operation.transition,durationMs:operation.durationMs});
  if(operation.type==='echo'){
    const base=resolveSourceAssignment(plan,operation.source),index=operation.targets.indexOf(paneId);
    return freeze({type:'assignment',assignment:freeze({...base,phaseOffsetMs:base.phaseOffsetMs+index*operation.stepMs}),transition:operation.transition,durationMs:operation.durationMs});
  }
  if(operation.type==='mosaic')return freeze({type:'assignment',assignment:mosaicAssignments(plan,operation)[paneId],transition:operation.transition,durationMs:operation.durationMs});
  if(operation.type==='swap'){
    const source=plan.surfaces.find((surface)=>surface.id===operation.mapping[paneId]);
    return source?freeze({type:'assignment',assignment:source.assignment,transition:operation.transition,durationMs:operation.durationMs}):null;
  }
  if(operation.type==='relay'){
    if(paneId===operation.targetPane){
      const source=plan.surfaces.find((surface)=>surface.id===operation.sourcePane);
      return source?freeze({type:'assignment',assignment:source.assignment,transition:operation.transition,durationMs:operation.durationMs,handoffFrom:operation.sourcePane}):null;
    }
    return operation.hideSource?freeze({type:'visible',visible:false}):null;
  }
  if(operation.type==='freeze'||operation.type==='resume')return freeze({type:'frozen',frozen:operation.type==='freeze'});
  if(operation.type==='seek')return freeze({type:'seek',seekMs:operation.seekMs});
  if(operation.type==='shader')return freeze({type:'shader',coherent:operation.coherent,intensity:operation.intensity});
  if(operation.type==='show'||operation.type==='hide')return freeze({type:'visible',visible:operation.type==='show'});
  if(operation.type==='geometry')return freeze({type:'geometry',geometry:operation.geometry,durationMs:operation.durationMs});
  return null;
}
function expandOperation(plan,cue,operation,paneId,baseDelay=0){
  if(operation.type==='ripple'){
    const order=orderedTargets(plan,operation),index=order.indexOf(paneId);
    if(index<0)return[];
    return expandOperation(plan,cue,operation.operation,paneId,baseDelay+index*operation.intervalMs);
  }
  const action=operationAction(plan,operation,paneId);
  return action?[freeze({id:`${cue.id}:${paneId}:${baseDelay}`,...(Object.hasOwn(cue,'event')?{event:cue.event}:{atMs:cue.atMs}),delayMs:baseDelay,action})]:[];
}

export function compilePaneScore(plan,paneId){
  const surface=plan?.surfaces?.find((entry)=>entry.id===paneId);
  if(!surface)throw new Error(`unknown composition pane: ${paneId}`);
  const cues=[];
  for(const cue of plan.score?.cues||[])for(const operation of cue.operations)cues.push(...expandOperation(plan,cue,operation,paneId));
  cues.sort((a,b)=>((a.atMs??Infinity)+a.delayMs)-((b.atMs??Infinity)+b.delayMs)||a.id.localeCompare(b.id));
  return freeze({schema:1,paneId,epochMs:plan.epochMs,durationMs:plan.score.durationMs,loop:plan.score.loop,
    initial:surface.assignment,cues:freeze(cues)});
}

export function scoreTimeAt(score,nowMs){
  const elapsed=Math.max(0,Number(nowMs)-Number(score?.epochMs||0)),duration=Math.max(1,Number(score?.durationMs)||1);
  return score?.loop?elapsed%duration:Math.min(duration,elapsed);
}

export function paneScoreStateAt(score,{nowMs=score?.epochMs||0,events=[]}={}){
  const state={assignment:score.initial,visible:true,frozen:false,shader:null,seekMs:null,geometry:null};
  const elapsed=scoreTimeAt(score,nowMs),eventSet=new Set(events.map(stableId));
  const apply=(action)=>{
    if(action.type==='assignment')state.assignment=action.assignment;
    else if(action.type==='visible')state.visible=action.visible;
    else if(action.type==='frozen')state.frozen=action.frozen;
    else if(action.type==='shader')state.shader={coherent:action.coherent,intensity:action.intensity};
    else if(action.type==='seek')state.seekMs=action.seekMs;
    else if(action.type==='geometry')state.geometry=action.geometry;
  };
  for(const cue of score.cues){
    if(Object.hasOwn(cue,'atMs')&&cue.atMs+cue.delayMs<=elapsed)apply(cue.action);
    else if(cue.event&&eventSet.has(cue.event))apply(cue.action);
  }
  return freeze(state);
}

export function createPaneScoreEnvelope(plan,paneId,{targetLabel,sessionToken,revision,snapshotData=null}={}){
  const surface=plan.surfaces.find((entry)=>entry.id===paneId);
  if(!surface)throw new Error(`unknown composition pane: ${paneId}`);
  return freeze({
    protocol:WINDOW_MEDIA_PROTOCOL,targetLabel:String(targetLabel||''),sessionToken:stableId(sessionToken),revision:Math.max(1,Math.floor(Number(revision)||1)),
    cueId:plan.cueId,paneId:surface.id,score:compilePaneScore(plan,surface.id),snapshotData,
    description:surface.description,draggable:surface.draggable,desktopOrigin:{x:0,y:0},coherent:false,shader:surface.shader,
    fault:{...plan.fault,seed:(Number(plan.fault?.seed)||0)+surface.index*19,intensity:Math.max(0,Math.min(1,Number(plan.fault?.intensity)*Number(surface.faultScale||1)))},
  });
}

export function validatePaneScoreEnvelope(payload,{targetLabel,currentSession='',currentRevision=0}={}){
  if(Number(payload?.protocol)!==WINDOW_MEDIA_PROTOCOL)return freeze({ok:false,reason:'protocol'});
  if(String(payload?.targetLabel||'')!==String(targetLabel||''))return freeze({ok:false,reason:'target'});
  if(!payload?.sessionToken||!payload?.cueId||!payload?.paneId||!payload?.score)return freeze({ok:false,reason:'identity'});
  if(Number(payload.revision)<=Number(currentRevision||0))return freeze({ok:false,reason:currentSession&&String(payload.sessionToken)!==String(currentSession)?'session':'stale'});
  return freeze({ok:true,reason:null});
}

const video=(id,options={})=>({content:{kind:'video',assetId:id,playback:options.playback},width:options.width||240,height:options.height||160,
  entry:options.entry||options.initial||{x:.5,y:.5},initial:options.initial||{x:.5,y:.5},target:options.target||null,crop:options.crop||{x:0,y:0,w:1,h:1},draggable:options.draggable===true,
  shader:options.shader||'nvme-sector',faultScale:options.faultScale??1,
  description:options.description||id,sensitivity:options.sensitivity||windowMediaAsset(id)?.sensitivity||'none',phaseOffsetMs:options.phaseOffsetMs||0,z:options.z||0});
const procedural=(preset,options={})=>({content:{kind:'procedural',preset},width:options.width||240,height:options.height||160,
  entry:options.entry||options.initial||{x:.5,y:.5},initial:options.initial||{x:.5,y:.5},target:options.target||null,crop:options.crop||{x:0,y:0,w:1,h:1},draggable:options.draggable===true,
  shader:options.shader||'nvme-sector',faultScale:options.faultScale??1,description:options.description||preset,sensitivity:'none',phaseOffsetMs:options.phaseOffsetMs||0,z:options.z||0});
const rawAssignment=(surface)=>({content:surface.content,crop:surface.crop||{x:0,y:0,w:1,h:1},phaseOffsetMs:surface.phaseOffsetMs||0});
const assignmentMap=(surfaces)=>Object.fromEntries(surfaces.map((surface)=>[surface.id,rawAssignment(surface)]));
const ripple=(id,targets,operation,options={})=>({id,...(options.event?{event:options.event}:{atMs:options.atMs}),operations:[{type:'ripple',targets,order:options.order||targets,intervalMs:options.intervalMs??80,operation}]});

function seededUnit(seed=1){
  let value=(Math.floor(Number(seed)||1)>>>0)||1;
  return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
}
function circularSurfaceOrder(surfaces=[]){
  return[...surfaces].sort((a,b)=>{
    const aa=Math.atan2((a.initial?.y??.5)-.5,(a.initial?.x??.5)-.5);
    const bb=Math.atan2((b.initial?.y??.5)-.5,(b.initial?.x??.5)-.5);
    return aa-bb||String(a.id).localeCompare(String(b.id));
  });
}
function circularMapping(order,shift=1){
  const count=order.length;
  return Object.fromEntries(order.map((surface,index)=>[surface.id,order[(index-shift+count)%count].id]));
}
function circularGeometry(order,shift=1,durationMs=260){
  const count=order.length;
  return order.map((surface,index)=>{
    const destination=order[(index+shift)%count];
    return{type:'geometry',targets:[surface.id],geometry:{anchorX:destination.initial?.x??.5,anchorY:destination.initial?.y??.5},durationMs};
  });
}

// Authored compositions use a deterministic score generator instead of a
// random runtime. It gives every pane one semantic source at a time, but cuts,
// phase offsets, mosaics and physical positions can travel around the ring.
// A seed changes the edit; reloading the same cue does not.
export function proceduralMediaScore({
  id='media-score',surfaces=[],seed=1,durationMs=20000,loop=true,reducedMotion=false,
}={}){
  if(!Array.isArray(surfaces)||surfaces.length<2||surfaces.length>MAX_MEDIA_SURFACES)throw new Error('procedural score requires 2-8 surfaces');
  const order=circularSurfaceOrder(surfaces),targets=order.map((surface)=>surface.id),original=assignmentMap(surfaces),random=seededUnit(seed);
  const echoSource=order[Math.floor(random()*order.length)].id;
  const mosaicSource=order[Math.floor(random()*order.length)].id;
  const cutShifts=unique([1+Math.floor(random()*Math.max(1,order.length-1)),1+Math.floor(random()*Math.max(1,order.length-1)),order.length-1]);
  const cueAt=(ratio)=>Math.round(Math.max(0,Math.min(1,ratio))*durationMs);
  const circle=(name,ratio,shift)=>({
    id:`${id}-${name}`,atMs:cueAt(ratio),operations:[
      {type:'swap',targets,mapping:circularMapping(order,shift),transition:'dissolve',durationMs:reducedMotion?0:220},
      ...(!reducedMotion?circularGeometry(order,shift,280):[]),
    ],
  });
  const cues=[
    ripple(`${id}-phase-ripple`,targets,{type:'echo',targets,source:{paneId:echoSource},stepMs:220+Math.floor(random()*180),transition:'dip-black',durationMs:reducedMotion?0:110},
      {atMs:cueAt(.10),order:targets,intervalMs:reducedMotion?45:85}),
    circle('circle-one',.22,1),
  ];
  const cutBase=.34,cutStep=.018;
  cutShifts.forEach((shift,index)=>cues.push({id:`${id}-quick-cut-${index+1}`,atMs:cueAt(cutBase+index*cutStep),operations:[
    {type:'swap',targets,mapping:circularMapping(order,shift),transition:'cut',durationMs:0},
  ]}));
  cues.push(
    circle('circle-two',.43,2%order.length||1),
    ripple(`${id}-reverse-ripple`,targets,{type:'echo',targets,source:{paneId:order[(order.indexOf(order.find((surface)=>surface.id===echoSource))+1)%order.length].id},stepMs:150+Math.floor(random()*220),transition:'cut',durationMs:0},
      {atMs:cueAt(.55),order:[...targets].reverse(),intervalMs:reducedMotion?45:72}),
    {id:`${id}-mosaic-breath`,atMs:cueAt(.66),operations:[{type:'mosaic',targets,source:{paneId:mosaicSource},layout:'spatial',transition:'dissolve',durationMs:reducedMotion?0:260}]},
    {id:`${id}-mosaic-freeze`,atMs:cueAt(.69),operations:[{type:'freeze',targets}]},
    {id:`${id}-mosaic-release`,atMs:cueAt(.72),operations:[{type:'resume',targets}]},
    circle('circle-three',.78,3%order.length||1),
    ripple(`${id}-restore`,targets,{type:'assign',assignments:original,transition:'dissolve',durationMs:reducedMotion?0:190},
      {atMs:cueAt(.90),order:targets,intervalMs:reducedMotion?45:88}),
    {id:`${id}-geometry-home`,atMs:cueAt(.94),operations:circularGeometry(order,0,reducedMotion?0:260)},
  );
  return freeze({durationMs:Math.max(1000,Math.round(durationMs)),loop:!!loop,cues:freeze(cues)});
}

export function titleMemoryAsset(endingId=''){
  const id=String(endingId||'');
  if(id==='tower-lost')return'bellringers-datamosh';
  if(id==='tower-won')return'cathedral';
  if(id==='surfaced'||id==='helped')return'pollination';
  if(id==='inversion'||id==='drugged')return'demolition';
  if(id.startsWith('contact')||id==='sacrifice')return'sunflower-datamosh';
  return'cathedral';
}

export function titleCompositionPlan({endingId='',epochMs=Date.now(),reducedMotion=false,flashMode='full'}={}){
  const ids=['clouds','eclipse','flowers-seb',titleMemoryAsset(endingId)];
  const starts=[{x:.10,y:.24},{x:.87,y:.25},{x:.14,y:.76},{x:.86,y:.73}];
  const folds=[{anchorX:.5,anchorY:.5,offsetX:-30,offsetY:-20},{anchorX:.5,anchorY:.5,offsetX:30,offsetY:-20},
    {anchorX:.5,anchorY:.5,offsetX:-30,offsetY:20},{anchorX:.5,anchorY:.5,offsetX:30,offsetY:20}];
  const surfaces=ids.map((id,index)=>({id:`title:${index}`,...video(id,{entry:folds[index],initial:starts[index],target:folds[index],phaseOffsetMs:index*740,description:`Silent return fragment: ${id}`,faultScale:.7+index*.08})}));
  const targets=surfaces.map((surface)=>surface.id);
  const generated=proceduralMediaScore({id:'title',surfaces,seed:1701+String(endingId||'').length*31,durationMs:20000,loop:true,reducedMotion});
  const score={...generated,cues:[...generated.cues,
    ripple('title-selection',targets,{type:'seek',seekMs:0},{event:'title:selection',order:'left-to-right',intervalMs:55}),
  ]};
  return compileWindowCompositionPlan({compositionId:'title:return-collage',sceneId:'title',purpose:'title',epochMs,reducedMotion,surfaces,score,
    completion:{mode:'nonblocking'},foldDurationMs:450,flashMode,
    fault:{profile:'nvme-sector',intensity:.26,seed:17,cadenceMs:620},formation:{mode:'memory-unfold',durationMs:450,staggerMs:55}});
}

const DEATH_MEDIA=freeze({natatorium:'demolition',hall:'cathedral',practice:'flowers-seb',chapel:'bellringers-datamosh','source-final':'eye-s3'});
export function deathCompositionPlan({battleId='',snapshotToken='',reduceDread=false,epochMs=Date.now(),reducedMotion=false,flashMode='full'}={}){
  const clinical=battleId==='source-final';
  const observer=reduceDread?procedural('iris-abstraction',{description:'Abstract iris'}):video('eye-s5',{sensitivity:'clinical',description:'Clinical observer'});
  const encounter=clinical&&reduceDread?procedural('game-fragment'):video(DEATH_MEDIA[battleId]||'demolition',{sensitivity:clinical?'clinical':'none'});
  const positions=[{x:.22,y:.25},{x:.77,y:.24},{x:.24,y:.72},{x:.78,y:.75}];
  const crops=[{x:0,y:0,w:.5,h:.5},{x:.5,y:0,w:.5,h:.5},{x:0,y:.5,w:.5,h:.5},{x:.5,y:.5,w:.5,h:.5}];
  const surfaces=positions.map((initial,index)=>({id:['death:frame','death:observer','death:encounter','death:eclipse'][index],content:{kind:'snapshot',token:snapshotToken},crop:crops[index],width:index===0?300:240,height:index===0?188:160,
    entry:{x:.5+(index%2?1:-1)*.035,y:.5+(index<2?-1:1)*.035},initial,shader:'nvme-sector',faultScale:index===0?1.25:1,
    sensitivity:!reduceDread&&(index===1||(clinical&&index===2))?'clinical':'none',description:'Final rendered frame fragment'}));
  const revealed={
    'death:frame':rawAssignment(surfaces[0]),
    'death:observer':rawAssignment(observer),
    'death:encounter':rawAssignment(encounter),
    'death:eclipse':rawAssignment(video('eclipse')),
  };
  const score={durationMs:5200,loop:true,cues:[
    {id:'death-reveal-observer',atMs:180,operations:[{type:'assign',assignments:{'death:observer':revealed['death:observer']},transition:'dip-black',durationMs:100}]},
    {id:'death-reveal-encounter',atMs:300,operations:[{type:'assign',assignments:{'death:encounter':revealed['death:encounter']},transition:'dip-black',durationMs:100}]},
    {id:'death-reveal-eclipse',atMs:420,operations:[{type:'assign',assignments:{'death:eclipse':revealed['death:eclipse']},transition:'dip-black',durationMs:100}]},
    {id:'death-autopsy-swap',atMs:2500,operations:[{type:'swap',mapping:{'death:observer':'death:encounter','death:encounter':'death:observer'},transition:'dissolve',durationMs:220}]},
    ripple('death-autopsy-restore',Object.keys(revealed),{type:'assign',assignments:revealed,transition:'dissolve',durationMs:160},{atMs:4000,order:Object.keys(revealed),intervalMs:70}),
  ]};
  return compileWindowCompositionPlan({compositionId:`death:${stableId(battleId)}`,sceneId:`battle:${stableId(battleId)}`,purpose:'death',epochMs,
    surfaces,score,completion:{mode:'nonblocking'},reducedMotion,flashMode,
    fault:{profile:'nvme-sector',intensity:.68,seed:41,cadenceMs:260},formation:{mode:'impact-scatter',durationMs:360,staggerMs:35}});
}

// THE RETURN, SPREAD ACROSS THE SURFACES.
//
// The night's account does not fit on one pane and should not: each part of it
// is its own surface, thrown out and settling into a row while the transport
// reads the whole thing back in the main window.
//
// WHY SNAPSHOTS AND NOT TEXT PANES. `content.kind:'text'` is legal and
// normalizeWindowMediaContent accepts it — but window-media-surface.js is a
// WebGL shader whose mediaAt() only samples an image texture or a procedural
// form. There is NO text path. The in-canvas simulation does render text (a
// <span>, see mediaChild), so a text pane would work in-frame and come up black
// on the desktop, which is exactly backwards.
//
// So the caller rasterises each section to a data URL and registers it, and the
// panes take snapshot tokens. That reuses the whole pipeline untouched on both
// sides — and it means the report inherits the composition's own nvme-sector
// fault, so the phosphor degrades along with everything else in the shot.
export function returnCompositionPlan({
  sections=[], snapshotTokens=[], epochMs=Date.now(), reducedMotion=false, flashMode='full',
}={}){
  // Two to eight, because that is what a composition is; a single-pane return
  // is the transport on its own and does not need the desktop at all.
  const count=Math.max(2,Math.min(MAX_MEDIA_SURFACES,snapshotTokens.length));
  const tokens=Array.from({length:count},(_,index)=>snapshotTokens[index]||snapshotTokens[snapshotTokens.length-1]);
  // Thrown wide, then filed into a row across the middle: the gesture is a
  // stack of papers being squared up, not an explosion.
  const scatter=[{x:.13,y:.20},{x:.84,y:.24},{x:.20,y:.78},{x:.78,y:.74},
    {x:.50,y:.14},{x:.50,y:.86},{x:.08,y:.52},{x:.90,y:.50}];
  const filed=(index)=>({anchorX:(index+0.5)/count,anchorY:.5,offsetY:(index%2?1:-1)*8});
  const surfaces=tokens.map((token,index)=>({
    id:`return:${index}`,
    content:{kind:'snapshot',token},
    width:260,height:170,
    entry:scatter[index%scatter.length],
    initial:scatter[index%scatter.length],
    target:filed(index),
    shader:'nvme-sector',
    faultScale:.72+(index%3)*.10,
    description:`Return section: ${String(sections[index]||index)}`,
  }));
  const targets=surfaces.map((surface)=>surface.id);
  const score={durationMs:9000,loop:false,cues:[
    // They arrive in order, left to right, the way a list is read.
    ripple('return-file',targets,{type:'shader',coherent:true},
      {atMs:200,order:'left-to-right',intervalMs:reducedMotion?40:150}),
    // One settle, and then they hold. A return is filed once.
    {id:'return-settle',atMs:reducedMotion?600:2600,operations:[
      {type:'geometry',targets,transition:'dissolve',durationMs:reducedMotion?0:420},
      {type:'shader',targets,coherent:true},
    ]},
    {id:'return-hold',atMs:reducedMotion?900:4200,operations:[{type:'freeze',targets}]},
  ]};
  return compileWindowCompositionPlan({
    compositionId:'return:account',sceneId:'return',purpose:'return',epochMs,reducedMotion,flashMode,
    surfaces,score,completion:{mode:'nonblocking'},
    // Quieter than the death composition and much quieter than the aperture:
    // this is the calmest thing the surfaces ever do, because the night is over.
    fault:{profile:'nvme-sector',intensity:.22,seed:53,cadenceMs:720},
    formation:{mode:'memory-unfold',durationMs:520,staggerMs:60},
  });
}

// ONE PANE FALLING OFF THE DISK, INSIDE SOMEBODY ELSE'S COMPOSITION.
//
// Baked as an EVENT cue rather than applied at runtime, because that is the only
// road there is: the simulation exposes show/snap/coherence/freeze/trigger/hide
// and the native effects layer exposes triggerComposition — neither has a public
// "assign this pane now". Both DO fire named event cues, which is what
// compositionEvent() already rides.
//
// So the token has to exist when the plan is compiled. The director registers
// the scroll phases once at first use and hands one in here, and from then on
// any composition carrying this cue can drop a pane into the failure without
// rasterising anything.
export const SECTOR_INTRUSION_EVENT='sector:intrude';
export function sectorIntrusionCue(targets=[],token=''){
  const panes=(Array.isArray(targets)?targets:[]).filter(Boolean);
  if(!panes.length||!String(token||'').startsWith('snapshot-'))return [];
  return panes.map((paneId,index)=>({
    id:`sector-intrusion-${index}`,
    event:SECTOR_INTRUSION_EVENT,
    operations:[{
      type:'assign',
      assignments:{[paneId]:{content:{kind:'snapshot',token}}},
      transition:'cut',durationMs:0,
    }],
  }));
}

// THE DISK, FAILING, ON ITS OWN SCREEN.
//
// An ntfsclone run that cannot read the volume. `phases` are pre-baked scroll
// frames as data URLs (render/sector-error.js) registered as snapshots, because
// a pane has no glyph path and a `text` pane comes up black on the desktop.
// Motion is a CUT between stills, which is also what a terminal does — it does
// not tween, it redraws.
export function sectorErrorCompositionPlan({
  phaseTokens=[], epochMs=Date.now(), reducedMotion=false, flashMode='full',
}={}){
  const tokens=(Array.isArray(phaseTokens)?phaseTokens:[]).filter(Boolean);
  if(tokens.length<1)return null;
  // Four panes reading the same failing disk at different points in the scroll,
  // which is what a machine with several terminals open on one job looks like.
  const seats=[{x:.20,y:.24},{x:.78,y:.22},{x:.24,y:.76},{x:.80,y:.74}];
  const surfaces=seats.map((initial,index)=>({
    id:`sector:${index}`,
    content:{kind:'snapshot',token:tokens[index%tokens.length]},
    width:300,height:200,
    entry:initial,initial,
    target:{anchorX:.5,anchorY:.5,offsetX:(index%2?1:-1)*150,offsetY:(index<2?-1:1)*96},
    shader:'nvme-sector',
    faultScale:1.15+(index%3)*.12,
    description:'Bad sector readout',
  }));
  const targets=surfaces.map((surface)=>surface.id);
  // The scroll. One cut per phase, staggered per pane so the four terminals are
  // not in lockstep, looping for as long as the screen is up.
  const stepMs=reducedMotion?420:140;
  const cues=[];
  tokens.forEach((token,phase)=>{
    surfaces.forEach((surface,index)=>{
      cues.push({
        id:`sector-scroll-${phase}-${index}`,
        atMs:phase*stepMs+index*Math.round(stepMs/4),
        operations:[{
          type:'assign',
          assignments:{[surface.id]:{content:{kind:'snapshot',token:tokens[(phase+index)%tokens.length]}}},
          transition:'cut',durationMs:0,
        }],
      });
    });
  });
  return compileWindowCompositionPlan({
    compositionId:'sector:unreadable',sceneId:'sector',purpose:'sector',epochMs,reducedMotion,flashMode,
    surfaces,score:{durationMs:Math.max(1000,tokens.length*stepMs),loop:true,cues},
    completion:{mode:'nonblocking'},
    // The hardest fault in the game: this IS the bad sector, not a surface with
    // one under it.
    fault:{profile:'nvme-sector',intensity:.92,seed:29,cadenceMs:150},
    formation:{mode:'impact-scatter',durationMs:280,staggerMs:30},
  });
}

export function apertureCompositionPlan({reduceDread=false,epochMs=Date.now(),reducedMotion=false,flashMode='full'}={}){
  const eye=(id,initial,target,side)=>reduceDread
    ?procedural('iris-abstraction',{entry:{x:.5,y:.5},initial,target,width:240,height:180,description:`Abstract ${side} iris`,faultScale:1.15,draggable:true})
    :video(id,{entry:{x:.5,y:.5},initial,target,width:240,height:180,crop:side==='left'?{x:.06,y:.08,w:.82,h:.82}:{x:.12,y:.08,w:.82,h:.82},sensitivity:'clinical',description:`Clinical ${side} iris`,faultScale:1.15,draggable:true});
  const surfaces=[
    {id:'aperture:left',...eye('eye-s3',{x:.12,y:.70},{anchorX:.5,anchorY:.5,offsetX:-120},'left')},
    {id:'aperture:right',...eye('eye-s5',{x:.84,y:.23},{anchorX:.5,anchorY:.5,offsetX:120},'right')},
    {id:'aperture:eclipse',...video('eclipse',{entry:{x:.5,y:.5},initial:{x:.72,y:.77},target:{anchorX:.5,anchorY:.5,offsetY:-180},width:240,height:180,description:'Eclipse lid',draggable:true})},
    {id:'aperture:nave',...video('cathedral',{entry:{x:.5,y:.5},initial:{x:.27,y:.18},target:{anchorX:.5,anchorY:.5,offsetY:180},width:240,height:180,crop:{x:.22,y:0,w:.56,h:1},description:'Cathedral path',draggable:true})},
  ];
  const targets=surfaces.map((surface)=>surface.id);
  const constraints=[
    {id:'irises-touch',type:'edge-share',a:'aperture:left',aEdge:'right',b:'aperture:right',bEdge:'left',tolerance:12},
    {id:'irises-level',type:'align-center-y',a:'aperture:left',b:'aperture:right',tolerance:12},
    {id:'eclipse-centred',type:'center-on-seam-x',a:'aperture:left',b:'aperture:right',c:'aperture:eclipse',tolerance:16},
    {id:'eclipse-touches',type:'vertical-touch',a:'aperture:eclipse',aEdge:'bottom',b:'aperture:left',bEdge:'top',tolerance:24},
    {id:'nave-centred',type:'center-on-seam-x',a:'aperture:left',b:'aperture:right',c:'aperture:nave',tolerance:16},
    {id:'nave-touches',type:'vertical-touch',a:'aperture:left',aEdge:'bottom',b:'aperture:nave',bEdge:'top',tolerance:24},
  ];
  const score={durationMs:60000,loop:false,cues:[
    ripple('aperture-near',targets,{type:'shader',coherent:true},{event:'aperture:near',order:'radial',intervalMs:55}),
    ripple('aperture-hint',targets,{type:'seek',seekMs:0},{event:'aperture:hint',order:['aperture:left','aperture:right','aperture:eclipse','aperture:nave'],intervalMs:90}),
    {id:'aperture-complete',event:'aperture:complete',operations:[{type:'freeze',targets},{type:'shader',targets,coherent:true}]},
  ]};
  return compileWindowCompositionPlan({compositionId:'source:aperture',sceneId:'source:proper',purpose:'puzzle',epochMs,reducedMotion,flashMode,surfaces,constraints,score,completion:{mode:'constraints',holdMs:650},
    fault:{profile:'nvme-sector',intensity:.86,seed:73,cadenceMs:180},formation:{mode:'aperture-breach',durationMs:520,staggerMs:45}});
}

const endingSurface=(id,asset,initial,index,options={})=>({id:`ending:${id}:${index}`,...video(asset,{initial,phaseOffsetMs:index*430,...options})});
function endingScore(id,surfaces){
  const targets=surfaces.map((surface)=>surface.id),at=(event,operations)=>({id:event.replace(/:/g,'-'),event,operations});
  const assignAsset=(target,asset,options={})=>({type:'assign',assignments:{[target]:{content:asset.startsWith('procedural:')?{kind:'procedural',preset:asset.slice(11)}:{kind:'video',assetId:asset,playback:options.playback},phaseOffsetMs:options.phaseOffsetMs||0}},transition:options.transition||'dissolve',durationMs:options.durationMs??220});
  if(id==='sacrifice')return{durationMs:16000,loop:false,cues:[
    at('ending:beat:first-machine-strike',[{type:'echo',targets,source:{paneId:targets[0]},stepMs:220,transition:'dip-black',durationMs:140}]),
    at('ending:beat:chapel-span',[{type:'ripple',targets,order:'radial',intervalMs:75,operation:{type:'clone',targets,source:{paneId:targets[0]},transition:'dissolve',durationMs:180}}]),
    at('ending:beat:view-extinguished',[{type:'clone',targets,source:{content:{kind:'procedural',preset:'empty-field'}},transition:'dip-black',durationMs:260}]),
  ]};
  if(id==='helped')return{durationMs:14000,loop:false,cues:[
    at('ending:beat:booth-pour',[{type:'relay',sourcePane:targets[0],targetPane:targets[1],transition:'dissolve',durationMs:220}]),
    at('ending:beat:present-impact',[{type:'swap',mapping:Object.fromEntries(targets.map((target,index)=>[target,targets[(index+1)%targets.length]])),transition:'dip-black',durationMs:160}]),
    at('ending:beat:booth-handoff',[{type:'echo',targets,source:{content:{kind:'video',assetId:'pollination'}},stepMs:180,transition:'dissolve',durationMs:180}]),
    at('ending:beat:first-strike-cuts-memory',[{type:'clone',targets,source:{content:{kind:'procedural',preset:'empty-field'}},transition:'dip-black',durationMs:260}]),
  ]};
  if(id==='inversion')return{durationMs:14000,loop:false,cues:[
    at('ending:beat:cross-front-doors',[{type:'echo',targets,source:{content:{kind:'video',assetId:'demolition',playback:'reverse'}},stepMs:260,transition:'dissolve',durationMs:220}]),
    at('ending:beat:sodium-off',[{type:'swap',mapping:Object.fromEntries(targets.map((target,index)=>[target,targets[targets.length-1-index]])),transition:'dip-black',durationMs:140}]),
    at('ending:beat:birds-and-bus',[{type:'ripple',targets,order:'left-to-right',intervalMs:90,operation:{type:'clone',targets,source:{content:{kind:'video',assetId:'clouds'}},transition:'dissolve',durationMs:220}}]),
  ]};
  if(id==='drugged')return{durationMs:60000,loop:false,cues:[
    at('ending:beat:inspect-kit',[assignAsset(targets[0],'demolition')]),
    at('ending:beat:inspect-cup',[assignAsset(targets[1]||targets[0],'eclipse')]),
    at('ending:beat:inspect-recorder',[assignAsset(targets[2]||targets[0],'procedural:empty-field')]),
    at('ending:beat:remove-headphones',[{type:'ripple',targets,order:'spatial',intervalMs:100,operation:{type:'clone',targets,source:{content:{kind:'procedural',preset:'empty-field'}},transition:'dissolve',durationMs:260}}]),
  ]};
  if(id==='surfaced')return{durationMs:120000,loop:false,cues:[
    at('ending:beat:service-road',[{type:'echo',targets,source:{content:{kind:'video',assetId:'pollination'}},stepMs:180,transition:'dissolve',durationMs:180}]),
    at('ending:beat:write-player-name',[{type:'relay',sourcePane:targets[2],targetPane:targets[0],hideSource:true,transition:'dissolve',durationMs:220}]),
    at('ending:beat:write-alan-name',[{type:'relay',sourcePane:targets[3],targetPane:targets[1],hideSource:true,transition:'dissolve',durationMs:220}]),
  ]};
  if(id==='contact-won')return{durationMs:16000,loop:false,cues:[
    at('ending:beat:source-collapse',[{type:'swap',mapping:{[targets[0]]:targets[1],[targets[1]]:targets[0]},transition:'dip-black',durationMs:160}]),
    at('ending:beat:look-at-failing-hands',[{type:'ripple',targets,order:'radial',intervalMs:70,operation:{type:'clone',targets,source:{content:{kind:'video',assetId:'sunflower-datamosh'}},transition:'dissolve',durationMs:200}}]),
    at('ending:beat:final-radio',[{type:'relay',sourcePane:targets[targets.length-1],targetPane:targets[0],hideSource:true,transition:'dip-black',durationMs:180}]),
    at('ending:beat:open-channel-death',[{type:'ripple',targets:targets.slice(1),order:'spatial',intervalMs:70,operation:{type:'hide',targets:targets.slice(1)}}]),
  ]};
  if(id==='contact-lost'){
    const beats=['first-pullback','architecture-repeats','carrier-persists','no-return-wide'];
    return{durationMs:18000,loop:false,cues:[
      at('ending:beat:camera-detaches',[{type:'echo',targets,source:{paneId:targets[0]},stepMs:430,transition:'dip-black',durationMs:140}]),
      ...beats.map((beat,index)=>{
        const active=targets.slice(0,Math.max(1,targets.length-index*2));
        if(index===beats.length-1)return at(`ending:beat:${beat}`,[{type:'clone',targets:active,source:{content:{kind:'procedural',preset:'distant-dot'}},transition:'dissolve',durationMs:180}]);
        return at(`ending:beat:${beat}`,[{type:'relay',sourcePane:active[0],targetPane:active[Math.min(1,active.length-1)],hideSource:active.length>1,transition:'dissolve',durationMs:180}]);
      }),
    ]};
  }
  if(id==='tower-won')return{durationMs:120000,loop:false,cues:[
    at('ending:beat:drag-through-nave',[{type:'mosaic',targets,source:{content:{kind:'video',assetId:'cathedral'}},layout:'spatial',transition:'dissolve',durationMs:220}]),
    at('ending:beat:west-threshold',[{type:'ripple',targets,order:'left-to-right',intervalMs:80,operation:{type:'clone',targets,source:{content:{kind:'video',assetId:'clouds'}},transition:'dissolve',durationMs:220}}]),
    at('ending:beat:open-west-doors',[{type:'echo',targets,source:{content:{kind:'video',assetId:'clouds'}},stepMs:180,transition:'dissolve',durationMs:260},{type:'shader',targets,coherent:true}]),
  ]};
  if(id==='tower-lost')return{durationMs:12000,loop:false,cues:Array.from({length:6},(_,index)=>at(`ending:beat:strike-${['one-breath','two-hands','three-posture','four-look','five-movement','six-full-peal'][index]}`,[
    {type:'echo',targets:targets.slice(0,index+1),source:{content:{kind:'video',assetId:'bellringers-datamosh'}},stepMs:145,transition:'dip-black',durationMs:120},
    ...(index===5?[{type:'freeze',targets},{type:'shader',targets,coherent:true}]:[]),
  ]))};
  return{durationMs:12000,loop:false,cues:[]};
}

export function endingCompositionPlan(endingId,{epochMs=Date.now(),reduceDread=false,reducedMotion=false,flashMode='full',intrusionToken=''}={}){
  const id=String(endingId||'');
  const eye=(asset,initial,index)=>reduceDread?{id:`ending:${id}:${index}`,...procedural('iris-abstraction',{initial})}:endingSurface(id,asset,initial,index,{sensitivity:'clinical'});
  const ring=[{x:.15,y:.25},{x:.39,y:.16},{x:.66,y:.18},{x:.86,y:.34},{x:.75,y:.75},{x:.49,y:.84},{x:.20,y:.72},{x:.08,y:.50}];
  let surfaces=[];
  if(id==='sacrifice')surfaces=[eye('eye-s5',ring[0],0),endingSurface(id,'eclipse',ring[2],1),endingSurface(id,'flowers-seb',ring[5],2),endingSurface(id,'sunflower-datamosh',ring[7],3)];
  else if(id==='helped')surfaces=[endingSurface(id,'pollination',ring[0],0),endingSurface(id,'flowers-seb',ring[3],1),endingSurface(id,'pollination',ring[5],2),endingSurface(id,'flowers-seb',ring[7],3)];
  else if(id==='inversion')surfaces=[endingSurface(id,'demolition',ring[0],0,{playback:'reverse'}),endingSurface(id,'clouds',ring[2],1),endingSurface(id,'eclipse',ring[5],2),endingSurface(id,'demolition',ring[7],3,{playback:'reverse'})];
  else if(id==='drugged')surfaces=[endingSurface(id,'eclipse',ring[1],0),endingSurface(id,'demolition',ring[4],1),{id:`ending:${id}:2`,...procedural('empty-field',{initial:ring[6],description:'Bleached field'})}];
  else if(id==='surfaced')surfaces=[endingSurface(id,'clouds',ring[1],0),endingSurface(id,'pollination',ring[3],1),endingSurface(id,'clouds',ring[5],2),endingSurface(id,'pollination',ring[7],3)];
  else if(id==='contact-won')surfaces=[eye('eye-s3',ring[0],0),eye('eye-s5',ring[2],1),endingSurface(id,'sunflower-datamosh',ring[4],2),endingSurface(id,'sunflower-datamosh',ring[6],3)];
  else if(id==='contact-lost')surfaces=ring.map((at,index)=>index%3===0?eye(index%2?'eye-s3':'eye-s5',at,index):index%3===1?endingSurface(id,'eclipse',at,index):{id:`ending:${id}:${index}`,...procedural('distant-dot',{initial:at,width:160,height:120})});
  else if(id==='tower-won')surfaces=ring.filter((_,index)=>index%2===0).map((at,index)=>endingSurface(id,'cathedral',at,index,{crop:{x:(index%2)*.5,y:Math.floor(index/2)*.5,w:.5,h:.5}}));
  else if(id==='tower-lost')surfaces=ring.slice(0,6).map((at,index)=>endingSurface(id,index%2?'bellringers-datamosh':'cathedral',at,index));
  else surfaces=[endingSurface(id,'eclipse',ring[0],0)];
  const inward=surfaces.map((_,index)=>({anchorX:.5,anchorY:.5,offsetX:(index%2?1:-1)*(18+index*4),offsetY:(index<2?-1:1)*(14+(index%3)*5)}));
  let targets=inward;
  if(id==='inversion')targets=surfaces.map((surface)=>({anchorX:1-surface.initial.x,anchorY:1-surface.initial.y}));
  else if(id==='drugged')targets=surfaces.map((_,index)=>({anchorX:.84,anchorY:.78,offsetX:index*10,offsetY:index*8}));
  else if(id==='surfaced')targets=surfaces.map((_,index)=>({anchorX:index%2?.85:.15,anchorY:.5,offsetY:index<2?-12:12}));
  else if(id==='contact-lost')targets=surfaces.map((_,index)=>({anchorX:.88,anchorY:.82,offsetX:index*7,offsetY:index*5}));
  else if(id==='tower-won')targets=[{anchorX:.06,anchorY:.20},{anchorX:.94,anchorY:.20},{anchorX:.94,anchorY:.80},{anchorX:.06,anchorY:.80}];
  else if(id==='tower-lost')targets=surfaces.map((_,index)=>({anchorX:[.30,.50,.70][index%3],anchorY:index<3?.34:.66}));
  surfaces=surfaces.map((surface,index)=>({...surface,entry:targets[index]||inward[index],target:targets[index]||inward[index],faultScale:.75+(index%3)*.14}));
  const loss=id.endsWith('lost')||id==='drugged'||id==='sacrifice';
  const endingCues=endingScore(id,surfaces);
  // The last image belongs to the world. Native panes are already outside the
  // game frame, but the complete Simulate path shares its canvas; unfold the
  // residue to the authored perimeter before the physical final hold so media
  // can frame the booth/body/door without replacing it.
  const finalHold={id:'ending-final-hold',event:'ending:final-hold',operations:surfaces.map((surface)=>({
    type:'geometry',targets:[surface.id],
    geometry:{anchorX:surface.initial.x,anchorY:surface.initial.y,force:true},
    durationMs:reducedMotion?0:300,
  }))};
  const intrusion=sectorIntrusionCue(surfaces.map((surface)=>surface.id),intrusionToken);
  return compileWindowCompositionPlan({compositionId:`ending:${stableId(id)}`,sceneId:`ending:${stableId(id)}`,purpose:'ending',epochMs,reducedMotion,surfaces,
    score:{...endingCues,cues:[...endingCues.cues,finalHold,...intrusion]},
    completion:{mode:'ending-owned'},flashMode,
    fault:{profile:'nvme-sector',intensity:loss?.72:.42,seed:101+id.length,cadenceMs:loss?220:440},
    formation:{mode:loss?'failed-resolution':'resolved-bloom',durationMs:560,staggerMs:48}});
}

export function compositionAssetIds(plan){
  const ids=[];
  for(const surface of plan?.surfaces||[])if(surface.content?.assetId)ids.push(surface.content.assetId);
  for(const pane of plan?.surfaces||[])for(const cue of compilePaneScore(plan,pane.id).cues||[]){
    const id=cue.action?.assignment?.content?.assetId;if(id)ids.push(id);
  }
  return freeze(unique(ids));
}
