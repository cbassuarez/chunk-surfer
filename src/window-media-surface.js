import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import mediaManifest from '../content/media/window-media.media.json' with { type: 'json' };
import { WINDOW_SURFACE_LOOK_GLSL } from './render/window-surface-look.js';
import {
  WINDOW_MEDIA_PROTOCOL,
  scoreTimeAt,
  validatePaneScoreEnvelope,
  windowMediaContentId,
} from './platform/window-composition.js';

const canvas=document.getElementById('media');
const fallback=document.getElementById('fallback');
const grip=document.getElementById('grip');
const assetById=new Map((mediaManifest.assets||[]).map((asset)=>[asset.id,asset]));
const BLUE_NOISE_SIZE=64;
let envelope=null,assignment=null,source=null,video=null,poster=null;
let gl=null,program=null,texture=null,staleTexture=null,outgoingTexture=null,blueNoiseTexture=null,raf=0;
let frontEndNegative=0;
let frozen=false,scoreSuspended=false,lastSeekAt=0,lastStaleAt=0,staleReady=false,assignmentSerial=0;
let transition={mode:'cut',startedAt:0,endsAt:0},scoreCycle=-1,executedTimed=new Set(),currentRevision=0,currentSession='';
const eventTimers=new Set();

const vertex=`#version 300 es
in vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;in vec2 uv;out vec4 outColor;uniform sampler2D image;uniform sampler2D staleImage;uniform sampler2D outgoingImage;uniform sampler2D blueNoise;uniform vec4 crop;uniform vec2 desktopOrigin;uniform vec2 framebufferSize;uniform vec2 blueNoiseSize;uniform float dpr;uniform int procedural;uniform float coherence;uniform float faultIntensity;uniform float faultTick;uniform float faultSeed;uniform int flashMode;uniform int nvme;uniform int transitionMode;uniform float transitionProgress;uniform float negative;
float blueNoiseRank(vec2 at){vec2 cell=mod(floor(at),blueNoiseSize);return texture(blueNoise,(cell+.5)/blueNoiseSize).r;}
float hash21(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float form(vec2 q){vec2 c=q*2.-1.;if(procedural==1){float iris=1.-smoothstep(.20,.72,length(vec2(c.x,c.y*1.35)));float pupil=1.-smoothstep(.08,.20,length(c));return max(iris*.62,pupil);}if(procedural==2)return 1.-smoothstep(.012,.028,length(c));if(procedural==3)return .025;return .10+.08*sin((q.x+q.y)*30.);}
vec3 mediaAt(vec2 q,bool stale){if(procedural>0)return vec3(form(q));return stale?texture(staleImage,q).rgb:texture(image,q).rgb;}
${WINDOW_SURFACE_LOOK_GLSL}
void main(){
  // THE ONE SPACE EVERY SURFACE AGREES ON: desktop LOGICAL points. gl_FragCoord
  // is device pixels and desktopOrigin arrives from a DOM rect in points, so
  // adding them -- which is what this did -- put every retina window half a
  // lattice out from every other one. Divide first, then place.
  float scale=max(1.,dpr);
  vec2 globalPt=vec2(gl_FragCoord.x,framebufferSize.y-gl_FragCoord.y)/scale+desktopOrigin;

  // THE SHARED LATTICE. Sample the media once per cell, at the cell's centre,
  // so the pixels are pixels rather than a per-fragment shimmer -- and so two
  // windows overlapping the same desktop cell agree about what is in it.
  vec2 cellId=floor(globalPt/CELL_PT);
  vec2 localPx=((cellId+.5)*CELL_PT-desktopOrigin)*scale;
  vec2 cuv=clamp(vec2(localPx.x,framebufferSize.y-localPx.y)/framebufferSize,0.,1.);

  vec2 q=crop.xy+cuv*crop.zw;
  float fault=nvme==1?faultIntensity*mix(1.,.14,coherence):0.;
  vec2 sector=floor(globalPt/SECTOR_PT);
  float cell=hash21(sector+vec2(faultTick*7.1,faultSeed));
  float band=hash21(vec2(floor(globalPt.y/7.),faultTick+faultSeed*.31));
  bool broken=cell>1.-fault*.58;
  bool held=hash21(sector.yx+faultSeed+3.7)>1.-fault*.48;
  if(broken)q.x+=((cell>.5?1.:-1.)*(.025+.14*band))*fault;
  if(band>1.-fault*.32)q.y+=((band-.5)*.075)*fault;
  q=clamp(q,crop.xy,crop.xy+crop.zw);
  vec3 rgb=mediaAt(q,held||broken);
  float dropout=step(1.-fault*.10,hash21(sector+vec2(19.2,faultTick*.37+faultSeed)));
  float hard=step(1.-fault*.035,hash21(sector.yx+vec2(71.3,faultTick+faultSeed)));
  if(dropout>.5)rgb=vec3(.002,.004,.012);
  if(hard>.5&&flashMode==0)rgb=vec3(.94,.97,1.);
  else if(hard>.5&&flashMode==1)rgb=vec3(.08,.12,.28);
  else if(hard>.5&&flashMode==2)rgb=vec3(.002,.004,.012);
  if(transitionMode==1)rgb=mix(texture(outgoingImage,cuv).rgb,rgb,smoothstep(0.,1.,transitionProgress));
  else if(transitionMode==2){float side=step(.5,transitionProgress);vec3 halfImage=mix(texture(outgoingImage,cuv).rgb,rgb,side);rgb=halfImage*(abs(transitionProgress-.5)*2.);}

  // Both masks are keyed to the SHARED cell, not to this window's fragment, so
  // the screen runs continuously across the bezels instead of restarting in
  // each frame. The second is offset so the two dithers do not correlate.
  float rank=blueNoiseRank(cellId);
  float quantRank=blueNoiseRank(cellId+vec2(23.,47.));
  outColor=vec4(windowSurfaceLook(rgb,rank,quantRank,coherence,negative),1.);
}`;

function compile(type,code){const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'shader');return shader;}
function makeMediaTexture(){
  const value=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,value);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));return value;
}
function makeBlueNoiseTexture(){
  const value=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,value);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,1,1,0,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array([128]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  const image=new Image();image.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,value);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,gl.RED,gl.UNSIGNED_BYTE,image);};image.onerror=()=>{};image.src=assetUrl('assets/blue-noise-64.png');return value;
}
function initGl(){
  gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)return false;
  program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))return false;
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  texture=makeMediaTexture();staleTexture=makeMediaTexture();outgoingTexture=makeMediaTexture();blueNoiseTexture=makeBlueNoiseTexture();return true;
}
function assetUrl(path){return new URL(`./${String(path||'').replace(/^\/+/, '')}`,location.href).href;}
function clearEventTimers(){for(const timer of eventTimers)clearTimeout(timer);eventTimers.clear();}
function destroySource(){if(video){video.pause();video.removeAttribute('src');video.load();}video=null;poster=null;source=null;staleReady=false;lastStaleAt=0;assignmentSerial+=1;}
function desiredSeconds(){
  const score=envelope?.score||{epochMs:Date.now(),durationMs:12000,loop:true};
  const loopMs=Math.max(500,Number(score.durationMs)||12000);
  const elapsed=((Date.now()-(Number(score.epochMs)||Date.now())+(Number(assignment?.phaseOffsetMs)||0))%loopMs+loopMs)%loopMs;
  const asset=assetById.get(assignment?.content?.assetId);
  const mediaSeconds=Math.max(.1,Number(video?.duration)||Number(asset?.trim?.durationSeconds)||loopMs/1000);
  const at=(elapsed/loopMs)*mediaSeconds;
  return assignment?.content?.playback==='reverse'?Math.max(0,mediaSeconds-at):at;
}
function loadImage(url,serial){const image=new Image();image.decoding='async';image.onload=()=>{if(serial!==assignmentSerial)return;if(!video||video.readyState<2)source=image;fallback.src=url;};image.onerror=()=>{};image.src=url;return image;}
function captureOutgoing(){if(!gl||!outgoingTexture||!canvas.width||!canvas.height)return false;try{gl.bindTexture(gl.TEXTURE_2D,outgoingTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);return true;}catch(_){return false;}}
function beginTransition(mode='cut',durationMs=0){
  const duration=Math.max(0,Math.min(300,Number(durationMs)||0));
  if(mode==='cut'||!duration||!captureOutgoing()){transition={mode:'cut',startedAt:0,endsAt:0};return;}
  const now=performance.now();transition={mode,startedAt:now,endsAt:now+duration};
}
function loadAssignment(next,{transition:mode='cut',durationMs=0}={}){
  if(!next?.content)return;
  beginTransition(mode,durationMs);destroySource();assignment=next;
  const serial=assignmentSerial,content=assignment.content||{};
  document.documentElement.dataset.contentId=windowMediaContentId(content);
  if(content.kind==='snapshot'&&envelope?.snapshotData){poster=loadImage(envelope.snapshotData,serial);return;}
  if(content.kind==='image'){
    const asset=assetById.get(content.assetId),path=asset?.derivatives?.poster?.path||asset?.path;
    if(path)poster=loadImage(assetUrl(path),serial);return;
  }
  if(content.kind!=='video')return;
  const asset=assetById.get(content.assetId);if(!asset)return;
  poster=loadImage(assetUrl(asset.derivatives?.poster?.path),serial);
  const media=document.createElement('video'),owner=serial;video=media;
  media.muted=true;media.defaultMuted=true;media.volume=0;media.playsInline=true;media.preload='auto';media.loop=true;media.disablePictureInPicture=true;
  for(const kind of ['webm','mp4']){const derivative=asset.derivatives?.[kind];if(!derivative)continue;const item=document.createElement('source');item.src=assetUrl(derivative.path);item.type=kind==='webm'?'video/webm':'video/mp4';media.append(item);}
  media.addEventListener('loadeddata',()=>{
    if(video!==media||owner!==assignmentSerial)return;
    const mediaSeconds=Number.isFinite(media.duration)&&media.duration>0?media.duration:Number(asset.trim?.durationSeconds)||12;
    source=media;media.currentTime=Math.min(Math.max(0,desiredSeconds()),Math.max(0,mediaSeconds-.04));
    if(content.playback!=='reverse'&&!frozen){
      const loopSeconds=Math.max(.5,(Number(envelope?.score?.durationMs)||12000)/1000);
      media.playbackRate=Math.max(.25,Math.min(4,mediaSeconds/loopSeconds));void media.play().catch(()=>{});
    }
  },{once:true});
  media.addEventListener('error',()=>{if(video===media&&owner===assignmentSerial)source=poster;});media.load();
}
function uploadTo(target){if(!source||!gl||!target)return false;try{gl.bindTexture(gl.TEXTURE_2D,target);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);return true;}catch(_){source=poster;return false;}}
function reportScoreAction(action,cueId){
  try{void emit('window-media-score-action',{protocol:WINDOW_MEDIA_PROTOCOL,targetLabel:envelope.targetLabel,sessionToken:envelope.sessionToken,revision:envelope.revision,cueId:envelope.cueId,paneId:envelope.paneId,scoreCueId:cueId,action});}catch(_){}
}
function executeAction(action,cueId=''){
  if(!action)return;
  document.documentElement.dataset.lastEvent=cueId;
  if(action.type==='assignment')loadAssignment(action.assignment,{transition:action.transition,durationMs:action.durationMs});
  else if(action.type==='frozen'){
    frozen=!!action.frozen;if(frozen)video?.pause();else if(video&&assignment?.content?.playback!=='reverse')void video.play().catch(()=>{});
  }else if(action.type==='seek'){
    if(video){const seconds=Math.max(0,Number(action.seekMs)||0)/1000;try{video.currentTime=Math.min(seconds,Math.max(0,(Number(video.duration)||seconds+.04)-.04));}catch(_){}}
  }else if(action.type==='shader'){
    if(action.coherent!==null)envelope={...envelope,coherent:!!action.coherent};
    if(action.intensity!==null)envelope={...envelope,fault:{...envelope.fault,intensity:Math.max(0,Math.min(1,Number(action.intensity)||0))}};
  }else if(action.type==='visible'){
    document.documentElement.style.visibility=action.visible?'visible':'hidden';reportScoreAction(action,cueId);
  }else if(action.type==='geometry')reportScoreAction(action,cueId);
}
function resetScoreCycle(cycle){
  scoreCycle=cycle;executedTimed=new Set();document.documentElement.style.visibility='visible';frozen=false;
  loadAssignment(envelope.score.initial,{transition:'cut',durationMs:0});
}
function advanceScore(){
  if(scoreSuspended)return;
  const score=envelope?.score;if(!score)return;
  const raw=Math.max(0,Date.now()-Number(score.epochMs||0)),duration=Math.max(1,Number(score.durationMs)||1);
  const cycle=score.loop?Math.floor(raw/duration):0;
  if(cycle!==scoreCycle)resetScoreCycle(cycle);
  const elapsed=scoreTimeAt(score,Date.now());
  document.documentElement.dataset.scoreTime=String(Math.round(elapsed));
  for(const cue of score.cues||[]){
    if(!Object.hasOwn(cue,'atMs')||executedTimed.has(cue.id)||cue.atMs+cue.delayMs>elapsed)continue;
    executedTimed.add(cue.id);executeAction(cue.action,cue.id);
  }
}
function transitionUniform(at){
  if(transition.mode==='cut'||at>=transition.endsAt)return{mode:0,progress:1};
  const duration=Math.max(1,transition.endsAt-transition.startedAt);
  return{mode:transition.mode==='dissolve'?1:2,progress:Math.max(0,Math.min(1,(at-transition.startedAt)/duration))};
}
function draw(at){
  advanceScore();
  const dpr=Math.max(1,devicePixelRatio||1),w=Math.max(1,Math.round(innerWidth*dpr)),h=Math.max(1,Math.round(innerHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl?.viewport(0,0,w,h);}
  if(video&&!frozen){
    const desired=desiredSeconds(),drift=Math.abs((Number(video.currentTime)||0)-desired);
    if((assignment?.content?.playback==='reverse'||drift>.08)&&at-lastSeekAt>(assignment?.content?.playback==='reverse'?55:180)){lastSeekAt=at;try{video.currentTime=Math.min(desired,Math.max(0,video.duration-.04));}catch(_){}}
  }
  if(gl&&program){
    uploadTo(texture);const cadence=Math.max(90,Number(envelope?.fault?.cadenceMs)||420);if(!staleReady||at-lastStaleAt>=cadence){staleReady=uploadTo(staleTexture);lastStaleAt=at;}
    const transitionState=transitionUniform(at);
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,'image'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,staleTexture);gl.uniform1i(gl.getUniformLocation(program,'staleImage'),1);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,outgoingTexture);gl.uniform1i(gl.getUniformLocation(program,'outgoingImage'),2);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,blueNoiseTexture);gl.uniform1i(gl.getUniformLocation(program,'blueNoise'),3);
    gl.uniform4f(gl.getUniformLocation(program,'crop'),Number(assignment?.crop?.x)||0,Number(assignment?.crop?.y)||0,Number(assignment?.crop?.w)||1,Number(assignment?.crop?.h)||1);gl.uniform2f(gl.getUniformLocation(program,'desktopOrigin'),Number(envelope?.desktopOrigin?.x)||0,Number(envelope?.desktopOrigin?.y)||0);gl.uniform2f(gl.getUniformLocation(program,'framebufferSize'),w,h);gl.uniform2f(gl.getUniformLocation(program,'blueNoiseSize'),BLUE_NOISE_SIZE,BLUE_NOISE_SIZE);gl.uniform1f(gl.getUniformLocation(program,'dpr'),dpr);gl.uniform1f(gl.getUniformLocation(program,'negative'),frontEndNegative);
    const preset=assignment?.content?.preset,mode=envelope?.fault?.flashMode;gl.uniform1i(gl.getUniformLocation(program,'procedural'),preset==='iris-abstraction'?1:preset==='distant-dot'?2:preset==='empty-field'?3:assignment?.content?.kind==='procedural'?4:0);gl.uniform1f(gl.getUniformLocation(program,'coherence'),envelope?.coherent?1:0);gl.uniform1f(gl.getUniformLocation(program,'faultIntensity'),Math.max(0,Math.min(1,Number(envelope?.fault?.intensity)||0)));gl.uniform1f(gl.getUniformLocation(program,'faultTick'),Math.floor(Date.now()/cadence));gl.uniform1f(gl.getUniformLocation(program,'faultSeed'),Number(envelope?.fault?.seed)||0);gl.uniform1i(gl.getUniformLocation(program,'flashMode'),mode==='off'?2:mode==='reduced'?1:0);gl.uniform1i(gl.getUniformLocation(program,'nvme'),envelope?.shader==='nvme-sector'?1:0);gl.uniform1i(gl.getUniformLocation(program,'transitionMode'),transitionState.mode);gl.uniform1f(gl.getUniformLocation(program,'transitionProgress'),transitionState.progress);gl.drawArrays(gl.TRIANGLES,0,6);
  }else if(source?.src){fallback.style.display='block';fallback.src=source.src;}
  raf=requestAnimationFrame(draw);
}

function currentLabel(){try{return String(getCurrentWindow()?.label||'');}catch(_){return'browser-preview';}}
async function announceReady(){try{await emit('window-media-ready',{protocol:WINDOW_MEDIA_PROTOCOL,label:currentLabel()});}catch(_){}}
async function acceptEnvelope(payload){
  const label=currentLabel(),validation=validatePaneScoreEnvelope(payload,{targetLabel:label,currentSession,currentRevision});
  if(!validation.ok)return false;
  clearEventTimers();scoreSuspended=false;envelope={...payload,desktopOrigin:payload.desktopOrigin||{x:0,y:0}};currentRevision=Number(payload.revision);currentSession=String(payload.sessionToken);
  scoreCycle=-1;executedTimed.clear();document.documentElement.dataset.windowLabel=label;document.documentElement.dataset.revision=String(currentRevision);document.body.setAttribute('aria-label',String(payload.description||'Game-owned media fragment'));
  resetScoreCycle(0);document.documentElement.dataset.scoreHeld='false';
  try{await emit('window-media-accepted',{protocol:WINDOW_MEDIA_PROTOCOL,label,targetLabel:payload.targetLabel,sessionToken:payload.sessionToken,revision:payload.revision,cueId:payload.cueId,paneId:payload.paneId,contentId:windowMediaContentId(payload.score.initial)});}catch(_){}
  return true;
}
function matchesActiveScore(payload){
  return !!envelope
    && Number(payload?.protocol)===WINDOW_MEDIA_PROTOCOL
    && String(payload?.targetLabel||'')===currentLabel()
    && String(payload?.sessionToken||'')===currentSession
    && Number(payload?.revision)===currentRevision
    && String(payload?.cueId||'')===String(envelope.cueId||'')
    && String(payload?.paneId||'')===String(envelope.paneId||'');
}
function holdScore(payload){
  if(!matchesActiveScore(payload))return false;
  scoreSuspended=true;clearEventTimers();document.documentElement.dataset.scoreHeld='true';
  return true;
}
function triggerEvent(payload){
  if(!matchesActiveScore(payload))return false;
  const event=String(payload.event||''),lead=Math.max(0,Number(payload.effectiveAtMs)||Date.now())-Date.now();
  for(const cue of envelope.score?.cues||[]){
    if(cue.event!==event)continue;
    const timer=setTimeout(()=>{eventTimers.delete(timer);executeAction(cue.action,cue.id);},Math.max(0,lead+Number(cue.delayMs||0)));eventTimers.add(timer);
  }
  try{void emit('window-media-triggered',{protocol:WINDOW_MEDIA_PROTOCOL,label:currentLabel(),sessionToken:currentSession,revision:currentRevision,cueId:envelope.cueId,paneId:envelope.paneId,event});}catch(_){}
  return true;
}
async function drag(){
  if(!envelope?.draggable)return;const win=getCurrentWindow();
  try{await win.startDragging();await emit('window-media-drag-ended',{label:win.label,cueId:String(envelope.cueId||''),paneId:String(envelope.paneId||'')});}catch(_){}
}
grip.addEventListener('pointerdown',(event)=>{event.preventDefault();event.stopPropagation();void drag();},{capture:true});
canvas.addEventListener('pointerdown',()=>{void emit('window-media-pane-action',{cueId:String(envelope?.cueId||''),paneId:String(envelope?.paneId||''),action:'activate'});});
addEventListener('keydown',(event)=>{if(event.key==='Escape')void emit('window-media-pane-action',{cueId:String(envelope?.cueId||''),paneId:String(envelope?.paneId||''),action:'escape'});});
async function boot(){
  try{const ready=initGl();canvas.dataset.renderer=ready?'webgl2':'fallback';if(!ready)fallback.style.display='block';}
  catch(error){canvas.dataset.renderer='shader-error';fallback.style.display='block';console.error('window media shader unavailable',error);}
  try{await listen('window-media-score',({payload})=>{void acceptEnvelope(payload);});}catch(_){}
  try{await listen('window-media-trigger',({payload})=>triggerEvent(payload));}catch(_){}
  try{await listen('window-media-score-hold',({payload})=>holdScore(payload));}catch(_){}
  try{await listen('window-media-probe',()=>{void announceReady();});}catch(_){}
  try{await listen('window-media-freeze',({payload})=>{if(!envelope||payload?.cueId!==envelope.cueId)return;executeAction({type:'frozen',frozen:!!payload.frozen},'external-freeze');});}catch(_){}
  try{await listen('window-media-origin',({payload})=>{if(!envelope||payload?.cueId!==envelope.cueId)return;envelope={...envelope,desktopOrigin:payload.desktopOrigin||envelope.desktopOrigin};});}catch(_){}
  try{await listen('window-media-coherence',({payload})=>{if(!envelope||payload?.cueId!==envelope.cueId)return;envelope={...envelope,coherent:!!payload.coherent};});}catch(_){}
  // THE PLATE THE FRONT END IS WEARING. Broadcast to every surface rather than
  // addressed to one composition, because it is a property of the screen behind
  // them and not of any cue: while the opening and menu are up the desktop is a
  // negative, and four violet fragments unfolding onto it belong to a different
  // picture. It crossfades, so the surfaces turn with the background instead of
  // snapping at the boundary.
  try{await listen('window-media-plate',({payload})=>{frontEndNegative=Math.max(0,Math.min(1,Number(payload?.negative)||0));});}catch(_){}
  await announceReady();
  if(import.meta.env.DEV){
    const params=new URLSearchParams(location.search);
    const preview=params.get('preview');
    // `origin` places the preview on the desktop lattice, so two previews can be
    // checked for the thing the surfaces are supposed to have: cells that agree
    // across the bezel rather than each window starting its own grid.
    const originX=Number(params.get('originX'))||0,originY=Number(params.get('originY'))||0;
    frontEndNegative=Math.max(0,Math.min(1,Number(params.get('negative'))||0));
    if(assetById.has(preview)){
      envelope={cueId:'dev:preview',paneId:'dev:preview',score:{epochMs:Date.now(),durationMs:12000,loop:true,cues:[],initial:{content:{kind:'video',assetId:preview},crop:{x:0,y:0,w:1,h:1},phaseOffsetMs:0}},fault:{},desktopOrigin:{x:originX,y:originY},coherent:true,shader:'violet-dither'};
      resetScoreCycle(0);
    }
  }
  raf=requestAnimationFrame(draw);
}
void boot();
addEventListener('blur',()=>{try{const win=getCurrentWindow();void emit('window-media-focus-left',{label:win.label,cueId:String(envelope?.cueId||'')}).catch(()=>{});}catch(_){}});
addEventListener('beforeunload',()=>{cancelAnimationFrame(raf);clearEventTimers();destroySource();});
