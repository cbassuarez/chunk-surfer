import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import mediaManifest from '../content/media/window-media.media.json' with { type: 'json' };
import { WINDOW_SURFACE_LOOK_GLSL } from './render/window-surface-look.js';
import {sourceRestOwnedFramesValid} from './render/source-rest-apertures.js';
import {createWindowMediaArchitecture,windowArchitectureCueAllowed} from './render/window-media-architecture.js';
import {
  WINDOW_MEDIA_PROTOCOL,
  createWindowMediaClock,
  createWindowVideoClock,
  scoreTimeAt,
  validatePaneScoreEnvelope,
  windowMediaContentId,
} from './platform/window-composition.js';
import { physicalPrintPixels } from './render/physical-source-print.js';
import { worldLetteringFont, worldLetteringFontsStatus, ensureWorldLetteringFonts } from './render/world-lettering-fonts.js';
import { fitWorldLetteringLine } from './render/world-lettering-layout.js';

const canvas=document.getElementById('media');
const fallback=document.getElementById('fallback');
const grip=document.getElementById('grip');
const assetById=new Map((mediaManifest.assets||[]).map((asset)=>[asset.id,asset]));
const BLUE_NOISE_SIZE=64;
let envelope=null,assignment=null,source=null,video=null,poster=null;
let gl=null,program=null,texture=null,staleTexture=null,outgoingTexture=null,blueNoiseTexture=null,nameTexture=null,paperTexture=null,raf=0;
let nameReady=false,nameCanvas=null,paperReady=false,paperSerial=0;
let frontEndNegative=0;
let frozen=false,scoreSuspended=false,lastSeekAt=0,lastStaleAt=0,staleReady=false,assignmentSerial=0;
let pendingPlay=null,failedMedia=null,faultRunState=null;
let ownedFrameRevision=0,ownedFrameLoad=0,ownedFrameReady=null,ownedFramePending=null;
let architecture=null,architectureBackground=null,architectureMediaAnchor=null,mediaQuadVao=null;
let scoreClock=createWindowMediaClock(),videoClock=null;
let transition={mode:'cut',startedAt:0,endsAt:0},scoreCycle=-1,executedTimed=new Set(),currentRevision=0,currentSession='';
const eventTimers=new Set();
const pendingScoreEvents=[];

const vertex=`#version 300 es
in vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;in vec2 uv;out vec4 outColor;uniform sampler2D image;uniform sampler2D staleImage;uniform sampler2D outgoingImage;uniform sampler2D blueNoise;uniform sampler2D nameTexture;uniform sampler2D paperTexture;uniform vec4 crop;uniform vec2 desktopOrigin;uniform vec2 framebufferSize;uniform vec2 blueNoiseSize;uniform float dpr;uniform float time;uniform int procedural;uniform float nameEnabled;uniform float paperEnabled;uniform float coherence;uniform float faultIntensity;uniform float faultTick;uniform float faultSeed;uniform int flashMode;uniform int nvme;uniform int terminal;uniform int transitionMode;uniform float transitionProgress;uniform float negative;uniform vec4 terminalGrid;uniform vec3 faultRun;uniform float terminalTick;uniform float terminalReduced;
float blueNoiseRank(vec2 at){vec2 cell=mod(floor(at),blueNoiseSize);return texture(blueNoise,(cell+.5)/blueNoiseSize).r;}
float hash21(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
// UNDERWATER, LOOKING UP AT THE SURFACE. Bright is the lit surface and the
// shafts that fall through it; dark is the depth; a few bubbles rise. time is
// seconds and q is crop-space, so the surface sits in the upper band of the pane.
float underwaterSurface(vec2 q){
  float t=time;
  float surfaceY=.18+.05*sin(q.x*9.+t*.6)+.035*sin(q.x*23.-t*.9);
  float surface=1.-smoothstep(0.,.16,abs(q.y-surfaceY));
  float shafts=0.;
  for(int i=0;i<4;i++){float fi=float(i);float x=.20+.17*fi+.07*sin(t*.5+fi*1.9);float beam=exp(-pow((q.x-x)/.055,2.));beam*=exp(-q.y*2.8);beam*=1.-smoothstep(.08,.26,q.y);shafts+=beam;}
  float caustic=hash21(floor(q*vec2(17.,26.)+vec2(t*2.2,t*1.4)));caustic*=1.-smoothstep(0.,.9,q.y);
  float bubbles=0.;
  for(int i=0;i<6;i++){float fi=float(i);vec2 b=vec2(fract(sin(fi*71.3)*.5+.5),fract(fi*.619+t*(.045+.013*fi)+.02*sin(t+fi*2.7)));float r=.009+.005*fi;bubbles+=1.-smoothstep(0.,r,distance(q,b));}
  float base=.02+.05*(1.-q.y);
  return clamp(base+surface*.9+shafts*.65+caustic*.12+bubbles*.5,0.,1.);
}
float paperClose(vec2 q){
  float a=.12*sin(time*.6);
  vec2 p=q-.5;p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
  float sheet=(1.-smoothstep(.30,.34,abs(p.x)))*(1.-smoothstep(.38,.42,abs(p.y)));
  float ruled=0.;
  for(int i=0;i<5;i++){
    float y=-.28+float(i)*.14;
    ruled=max(ruled,smoothstep(.008,0.,abs(p.y-y-.02*sin(p.x*12.+float(i)*2.3))));
  }
  float head=smoothstep(.01,0.,abs(p.y-.30-.015*sin(p.x*12.)));
  float ink=1.-.5*ruled-.42*head;
  if(nameEnabled>.5){float nm=texture(nameTexture,vec2(q.x*.92+.04,q.y)).r;ink=min(ink,1.-nm*.88);}
  return clamp(sheet*ink,0.,1.);
}
float form(vec2 q){vec2 c=q*2.-1.;if(procedural==1){float iris=1.-smoothstep(.20,.72,length(vec2(c.x,c.y*1.35)));float pupil=1.-smoothstep(.08,.20,length(c));return max(iris*.62,pupil);}if(procedural==2)return 1.-smoothstep(.012,.028,length(c));if(procedural==3)return .025;if(procedural==5)return underwaterSurface(q);if(procedural==6)return paperEnabled>.5?texture(paperTexture,q).r:paperClose(q);return .10+.08*sin((q.x+q.y)*30.);}
vec3 mediaAt(vec2 q,bool stale){if(procedural>0)return vec3(form(q));return stale?texture(staleImage,q).rgb:texture(image,q).rgb;}
// A TERMINAL FAILS IN ROWS AND CELLS, NEVER IN PIXELS. The world's bad-sector
// run (game/source-faults.js) crosses this pane as it crosses its lane: rows
// the head has passed keep an older frame or drop out, the head itself writes
// a partial block twice, a whole number of cells over. Every displacement is
// a multiple of the stderr grid (terminalGrid: origin u, origin v from the
// top, cell u, row v), so the glyphs stay whole and readable.
vec3 terminalFault(vec2 uv){
  vec2 q=crop.xy+uv*crop.zw;
  vec3 ground=texture(image,vec2(.004,.996)).rgb;
  float f=clamp(faultIntensity,0.,1.),live=1.-terminalReduced;
  float rowV=max(.01,terminalGrid.w),cellU=max(.004,terminalGrid.z);
  float row=floor((1.-q.y-terminalGrid.y)/rowV),col=floor((q.x-terminalGrid.x)/cellU);
  float rows=max(2.,floor((1.-2.*terminalGrid.y)/rowV));
  float tick=terminalTick+faultSeed*.013;
  float head=-99.;
  if(faultRun.x>=0.){float t=clamp(faultRun.x/max(.1,faultRun.y),0.,1.);head=(faultRun.z<0.?1.-t:t)*(rows+3.)-1.5;}
  float d=row-head;
  bool running=faultRun.x>=0.&&faultRun.x<=faultRun.y;
  bool atHead=running&&abs(d)<=1.5;
  bool crossed=faultRun.x>=0.&&!atHead&&(faultRun.z<0.?d>0.:d<0.);
  float rh=hash21(vec2(row+7.,tick)),rs=hash21(vec2(row*1.31+2.,floor(tick*.5)+3.));
  float c0=floor(hash21(vec2(row,tick+11.))*30.),cw=4.+floor(hash21(vec2(row+3.,tick+5.))*18.);
  bool inBlock=col>=c0&&col<c0+cw;
  vec2 s=q;bool hold=false,drop=false,twice=false;
  if(atHead&&inBlock){s.x-=floor((rs-.5)*12.)*cellU*live;twice=live>.5;}
  else if(crossed){hold=rh<.62*f;drop=rs>1.-.10*f;}
  if(!atHead&&inBlock&&live>.5&&rh>1.-.22*f)s.x-=(rs<.5?-1.:1.)*(1.+floor(rs*5.))*cellU;
  if(s.x<crop.x||s.x>crop.x+crop.z)return ground;
  vec3 rgb=hold?texture(staleImage,s).rgb:texture(image,s).rgb;
  if(twice)rgb=min(rgb,texture(image,s+vec2(cellU,0.)).rgb);
  return drop?ground:rgb;
}
${WINDOW_SURFACE_LOOK_GLSL}
void main(){
  // A terminal is already rasterised at the correct column pitch. The media
  // dither lattice erased character stems and made real stderr unreadable.
  if(terminal==1){outColor=vec4(faultIntensity>0.?terminalFault(uv):texture(image,crop.xy+uv*crop.zw).rgb,1.);return;}
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
function renderName(name){
  if(!gl||!nameTexture)return;
  const text=String(name||'').slice(0,32).trim();
  if(!text){nameReady=false;return;}
  if(!nameCanvas){nameCanvas=document.createElement('canvas');nameCanvas.width=256;nameCanvas.height=64;}
  const ctx=nameCanvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,256,64);ctx.fillStyle='#000';ctx.fillRect(0,0,256,64);
  ctx.fillStyle='#fff';ctx.font='700 22px "Courier New", monospace';ctx.textBaseline='middle';
  ctx.fillText(text,14,32);
  gl.bindTexture(gl.TEXTURE_2D,nameTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,gl.RED,gl.UNSIGNED_BYTE,nameCanvas);
  nameReady=true;
}
// The name goes onto the page in the world's own hand, in the source print's
// A note he finds on the ground: the operator's name, then a question that any
// of his possible voices could ask. No instruction -- just the address and the
// question, in the world's own hand.
function paintHaystackNote(c,m,name){
  const ink='#445a46',inkStrong='#2f4232',rule='#70816b';
  const text=(str,x,y,size,role='serif',colour=inkStrong)=>{
    c.font=m.font=worldLetteringFont(size,role);
    c.fillStyle=colour;m.fillStyle='#fff';
    c.textBaseline=m.textBaseline='alphabetic';c.textAlign=m.textAlign='left';c.fontKerning='none';
    c.fillText(str,x,y);m.fillText(str,x,y);
  };
  const ruleAt=(y,h=1,colour=rule)=>{c.fillStyle=colour;m.fillStyle='#fff';c.fillRect(40,y,432,h);m.fillRect(40,y,432,h);};
  text((name||'you')+'\u2009\u2014',40,86,27,'serif',inkStrong);
  ruleAt(108,1);
  text('this isn\u2019t going well',40,196,32,'serif',inkStrong);
  text('is it?',40,244,32,'serif',inkStrong);
  ruleAt(272,1);
}
// Bake a real source page -- the same physical-print pipeline as the in-Source
// paper: stock, crease/bleed finish, the authored source lines with syntax
// colours, and the name inked into the margin.
async function bakePaper(name){
  const serial=++paperSerial;
  paperReady=false;
  const text=String(name||'').slice(0,32).trim();
  try{
    if(!worldLetteringFontsStatus().ready)await ensureWorldLetteringFonts({});
    const bitmap=physicalPrintPixels({width:512,height:512,ground:'#d6d9d0',pigmentOnly:true,
      finish:{profile:'paper',widthM:0.2,heightM:0.2,seed:'haystack-paper',repeat:false},
      draw(c,m){paintHaystackNote(c,m,text);}});
    if(serial!==paperSerial||!gl||!paperTexture)return;
    gl.bindTexture(gl.TEXTURE_2D,paperTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,bitmap.width,bitmap.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bitmap.pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    paperReady=true;
  }catch(_){/* print pipeline unavailable: the synthetic sheet stays */}
}
function initGl(){
  gl=canvas.getContext('webgl2',{alpha:false,depth:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl)return false;
  program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))return false;
  const buffer=gl.createBuffer();mediaQuadVao=gl.createVertexArray();gl.bindVertexArray(mediaQuadVao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  texture=makeMediaTexture();staleTexture=makeMediaTexture();outgoingTexture=makeMediaTexture();blueNoiseTexture=makeBlueNoiseTexture();nameTexture=makeMediaTexture();paperTexture=makeMediaTexture();return true;
}
function assetUrl(path){return new URL(`./${String(path||'').replace(/^\/+/, '')}`,document.baseURI||location.href).href;}
function clearEventTimers(){for(const timer of eventTimers)clearTimeout(timer);eventTimers.clear();pendingScoreEvents.length=0;}
function destroySource(){if(video){video.pause();video.removeAttribute('src');for(const item of video.querySelectorAll?.('source')||[])item.removeAttribute('src');video.load();}video=null;pendingPlay=null;failedMedia=null;poster=null;source=null;staleReady=false;lastStaleAt=0;assignmentSerial+=1;}
function desiredSeconds(){
  const score=envelope?.score||{epochMs:Date.now(),durationMs:12000,loop:true};
  const asset=assetById.get(assignment?.content?.assetId);
  const durationSeconds=Math.max(.1,Number(video?.duration)||Number(asset?.trim?.durationSeconds)||Number(score.durationMs)/1000||12);
  return videoClock?.time(Date.now(),{durationSeconds})||0;
}
function currentVideoPosition(){return video&&video.readyState>=2&&Number.isFinite(video.duration)
  ?{currentTimeSeconds:Number(video.currentTime)||0,durationSeconds:video.duration}:{};}
function mayPlayVideo(){return !!video&&video!==failedMedia&&!frozen&&!scoreSuspended&&!envelope?.reducedMotion&&assignment?.content?.playback!=='reverse';}
function syncVideoPlayback(){
  if(!video)return;
  if(!mayPlayVideo()){pendingPlay=null;video.pause();return;}
  const media=video,serial=assignmentSerial;
  // Let a decoder finish its selected phase. Replacing the target on every
  // frame can keep a locally buffered video forever at HAVE_METADATA.
  if(!media.seeking&&media.readyState>=1){
    const desired=Math.min(Math.max(0,desiredSeconds()),Math.max(0,(Number(media.duration)||0)-.04));
    try{if(Math.abs((Number(media.currentTime)||0)-desired)>.08)media.currentTime=desired;}catch(_){}
  }
  if(pendingPlay?.media===media)return;
  const request={media};pendingPlay=request;
  try{Promise.resolve(media.play()).then(()=>{
    if(pendingPlay===request)pendingPlay=null;
    if(video!==media||serial!==assignmentSerial||!mayPlayVideo())media.pause();
  },()=>{if(pendingPlay===request)pendingPlay=null;});}catch(_){if(pendingPlay===request)pendingPlay=null;}
}
function loadImage(url,serial){const image=new Image();image.decoding='async';image.onload=()=>{if(serial!==assignmentSerial)return;if(!video||video.readyState<2)source=image;fallback.src=url;};image.onerror=()=>{};image.src=url;return image;}
function captureOutgoing(){if(!gl||!outgoingTexture||!canvas.width||!canvas.height)return false;try{gl.bindTexture(gl.TEXTURE_2D,outgoingTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);return true;}catch(_){return false;}}
function beginTransition(mode='cut',durationMs=0){
  const duration=Math.max(0,Math.min(300,Number(durationMs)||0));
  if(mode==='cut'||!duration||!captureOutgoing()){transition={mode:'cut',startedAt:0,endsAt:0};return;}
  const now=scoreClock.now(Date.now());transition={mode,startedAt:now,endsAt:now+duration};
}
function loadAssignment(next,{transition:mode='cut',durationMs=0}={}){
  if(!next?.content)return;
  cancelOwnedDecode();ownedFrameLoad++;ownedFrameReady=null;
  beginTransition(mode,durationMs);destroySource();assignment=next;
  videoClock?.assign(next,Date.now());
  const serial=assignmentSerial,content=assignment.content||{};
  renderName(content.name||null);
  if(content.preset==='paper-close')void bakePaper(content.name||null);
  document.documentElement.dataset.contentId=windowMediaContentId(content);
  if(content.kind==='snapshot'){
    const initialToken=envelope?.score?.initial?.content?.token;
    const data=envelope?.snapshotFrames?.[content.token]||(content.token===initialToken?envelope?.snapshotData:null);
    if(data)poster=loadImage(data,serial);
    return;
  }
  if(content.kind==='text'){
    const plate=document.createElement('canvas');plate.width=640;plate.height=360;
    const ctx=plate.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#171743';ctx.fillRect(0,0,640,360);ctx.fillStyle='#e1e4e8';ctx.font='48px monospace';
    const text=String(content.text||'');const size=Math.min(48,48*584/Math.max(1,ctx.measureText(text).width));
    ctx.font=`${size}px monospace`;ctx.textAlign='center';ctx.fillText(text,320,196);
    poster=loadImage(plate.toDataURL('image/png'),serial);return;
  }
  if(content.kind==='image'){
    const asset=assetById.get(content.assetId),path=asset?.derivatives?.poster?.path||asset?.path;
    if(path)poster=loadImage(assetUrl(path),serial);return;
  }
  if(content.kind!=='video')return;
  const asset=assetById.get(content.assetId);if(!asset)return;
  poster=loadImage(assetUrl(asset.derivatives?.poster?.path),serial);
  const media=document.createElement('video'),owner=serial;video=media;
  const candidates=['webm','mp4'].map(kind=>asset.derivatives?.[kind]?.path).filter(Boolean).map(assetUrl),attempted=new Set();
  media.muted=true;media.defaultMuted=true;media.volume=0;media.playsInline=true;media.preload='auto';media.loop=assignment.clockMode==='source'||!!envelope?.score?.loop;media.disablePictureInPicture=true;
  for(const kind of ['webm','mp4']){const derivative=asset.derivatives?.[kind];if(!derivative)continue;const item=document.createElement('source');item.src=assetUrl(derivative.path);item.type=kind==='webm'?'video/webm':'video/mp4';media.append(item);}
  media.addEventListener('loadeddata',()=>{
    if(video!==media||owner!==assignmentSerial)return;
    const mediaSeconds=Number.isFinite(media.duration)&&media.duration>0?media.duration:Number(asset.trim?.durationSeconds)||12;
    const target=Math.min(Math.max(0,desiredSeconds()),Math.max(0,mediaSeconds-.04));
    // A reduced still at a nonzero phase must not briefly display frame zero
    // while its decoder seeks. Its poster owns that loading interval.
    const waitingForStill=envelope?.reducedMotion&&Math.abs((Number(media.currentTime)||0)-target)>.001;
    source=waitingForStill?poster:media;media.currentTime=target;
    if(content.playback!=='reverse'){
      try{media.playbackRate=Math.max(.0625,Math.min(16,videoClock?.playbackRate({durationSeconds:mediaSeconds})||1));}catch(_){media.playbackRate=1;}
    }
    syncVideoPlayback();
  });
  media.addEventListener('seeked',()=>{if(video===media&&owner===assignmentSerial&&media.readyState>=2)source=media;});
  media.addEventListener('error',()=>{
    if(video!==media||owner!==assignmentSerial)return;
    source=poster;
    // Source-list negotiation does not recover a codec that fails *after*
    // metadata/first-frame acceptance. Retry each packaged format at most once.
    attempted.add(media.currentSrc||media.src||candidates[0]);
    const next=candidates.find(path=>!attempted.has(path));
    if(!next){failedMedia=media;pendingPlay=null;media.pause();return;}
    attempted.add(next);pendingPlay=null;media.pause();media.src=next;media.load();
  });media.load();
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
    videoClock?.freeze(!!action.frozen,Date.now(),currentVideoPosition());frozen=!!action.frozen;architecture?.hold(frozen||scoreSuspended);syncVideoPlayback();
  }else if(action.type==='seek'){
    videoClock?.seek(action.seekMs,Date.now(),{durationSeconds:Number(video?.duration)||Number(assetById.get(assignment?.content?.assetId)?.trim?.durationSeconds)||12});
    if(video){try{video.currentTime=Math.min(desiredSeconds(),Math.max(0,(Number(video.duration)||0)-.04));}catch(_){}}
  }else if(action.type==='shader'){
    if(action.coherent!==null)envelope={...envelope,coherent:!!action.coherent};
    if(action.intensity!==null)envelope={...envelope,fault:{...envelope.fault,intensity:Math.max(0,Math.min(1,Number(action.intensity)||0))}};
    // A scored bad-sector run starts its head from this moment; clearing the
    // intensity ends it. Older envelopes carry no run and stay as they were.
    if(!(Number(envelope?.fault?.intensity)>0))faultRunState=null;
    else if(action.run)faultRunState={startedAt:scoreClock.now(Date.now()),durationMs:Math.max(100,Number(action.run.durationMs)||1500),direction:Number(action.run.direction)<0?-1:1};
  }else if(action.type==='visible'){
    document.documentElement.style.visibility=action.visible?'visible':'hidden';reportScoreAction(action,cueId);
  }else if(action.type==='geometry')reportScoreAction(action,cueId);
}
function resetScoreCycle(cycle){
  scoreCycle=cycle;executedTimed=new Set();document.documentElement.style.visibility='visible';frozen=false;
  videoClock?.freeze(false,Date.now());
  loadAssignment(envelope.score.initial,{transition:'cut',durationMs:0});
}
function advanceScore(){
  if(scoreSuspended)return;
  const score=envelope?.score;if(!score)return;
  const now=scoreClock.now(Date.now()),raw=Math.max(0,now-Number(score.epochMs||0)),duration=Math.max(1,Number(score.durationMs)||1);
  const cycle=score.loop?Math.floor(raw/duration):0;
  if(cycle!==scoreCycle)resetScoreCycle(cycle);
  const elapsed=scoreTimeAt(score,now);
  document.documentElement.dataset.scoreTime=String(Math.round(elapsed));
  for(const cue of score.cues||[]){
    if(!Object.hasOwn(cue,'atMs')||executedTimed.has(cue.id)||cue.atMs+cue.delayMs>elapsed)continue;
    executedTimed.add(cue.id);executeAction(cue.action,cue.id);
  }
  for(let index=0;index<pendingScoreEvents.length;){
    const event=pendingScoreEvents[index];
    if(event.atMs>now){index++;continue;}
    pendingScoreEvents.splice(index,1);executeAction(event.action,event.cueId);
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
  if(video&&video!==failedMedia&&!video.seeking&&video.readyState>=2&&!frozen&&!scoreSuspended&&!envelope?.reducedMotion){
    const desired=desiredSeconds(),drift=Math.abs((Number(video.currentTime)||0)-desired);
    if((assignment?.content?.playback==='reverse'||drift>.08)&&at-lastSeekAt>(assignment?.content?.playback==='reverse'?55:180)){lastSeekAt=at;try{video.currentTime=Math.min(desired,Math.max(0,video.duration-.04));}catch(_){}}
  }
  if(gl&&program){
    gl.bindVertexArray(mediaQuadVao);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
    const clockNow=scoreClock.now(Date.now());
    uploadTo(texture);const cadence=Math.max(90,Number(envelope?.fault?.cadenceMs)||420);if(!staleReady||clockNow-lastStaleAt>=cadence){staleReady=uploadTo(staleTexture);lastStaleAt=clockNow;}
    const transitionState=transitionUniform(clockNow);
    gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,'image'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,staleTexture);gl.uniform1i(gl.getUniformLocation(program,'staleImage'),1);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,outgoingTexture);gl.uniform1i(gl.getUniformLocation(program,'outgoingImage'),2);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,blueNoiseTexture);gl.uniform1i(gl.getUniformLocation(program,'blueNoise'),3);
    gl.uniform4f(gl.getUniformLocation(program,'crop'),Number(assignment?.crop?.x)||0,Number(assignment?.crop?.y)||0,Number(assignment?.crop?.w)||1,Number(assignment?.crop?.h)||1);gl.uniform2f(gl.getUniformLocation(program,'desktopOrigin'),Number(envelope?.desktopOrigin?.x)||0,Number(envelope?.desktopOrigin?.y)||0);gl.uniform2f(gl.getUniformLocation(program,'framebufferSize'),w,h);gl.uniform2f(gl.getUniformLocation(program,'blueNoiseSize'),BLUE_NOISE_SIZE,BLUE_NOISE_SIZE);gl.uniform1f(gl.getUniformLocation(program,'dpr'),dpr);gl.uniform1f(gl.getUniformLocation(program,'negative'),frontEndNegative);
    const preset=assignment?.content?.preset,mode=envelope?.fault?.flashMode;gl.uniform1i(gl.getUniformLocation(program,'procedural'),preset==='iris-abstraction'?1:preset==='distant-dot'?2:preset==='empty-field'?3:preset==='underwater-surface'?5:preset==='paper-close'?6:assignment?.content?.kind==='procedural'?4:0);gl.uniform1f(gl.getUniformLocation(program,'time'),(envelope?.reducedMotion?Number(envelope?.score?.epochMs)||0:clockNow)/1000);gl.uniform1f(gl.getUniformLocation(program,'nameEnabled'),nameReady?1:0);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,nameTexture);gl.uniform1i(gl.getUniformLocation(program,'nameTexture'),4);gl.uniform1f(gl.getUniformLocation(program,'paperEnabled'),paperReady?1:0);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,paperTexture);gl.uniform1i(gl.getUniformLocation(program,'paperTexture'),5);gl.uniform1f(gl.getUniformLocation(program,'coherence'),envelope?.coherent?1:0);gl.uniform1f(gl.getUniformLocation(program,'faultIntensity'),Math.max(0,Math.min(1,Number(envelope?.fault?.intensity)||0)));gl.uniform1f(gl.getUniformLocation(program,'faultTick'),Math.floor((envelope?.reducedMotion?Number(envelope?.score?.epochMs)||0:clockNow)/cadence));gl.uniform1f(gl.getUniformLocation(program,'faultSeed'),Number(envelope?.fault?.seed)||0);gl.uniform1i(gl.getUniformLocation(program,'flashMode'),mode==='off'?2:mode==='reduced'?1:0);gl.uniform1i(gl.getUniformLocation(program,'nvme'),envelope?.shader==='nvme-sector'?1:0);gl.uniform1i(gl.getUniformLocation(program,'terminal'),envelope?.shader==='terminal'?1:0);const grid=envelope?.fault?.grid;gl.uniform4f(gl.getUniformLocation(program,'terminalGrid'),Number(grid?.originU)||.02,Number(grid?.originV)||.03,Number(grid?.cellU)||.0216,Number(grid?.rowV)||.0764);gl.uniform3f(gl.getUniformLocation(program,'faultRun'),faultRunState?(clockNow-faultRunState.startedAt)/1000:-1,faultRunState?faultRunState.durationMs/1000:1,faultRunState?.direction||1);gl.uniform1f(gl.getUniformLocation(program,'terminalTick'),envelope?.reducedMotion?0:Math.floor(clockNow/90));gl.uniform1f(gl.getUniformLocation(program,'terminalReduced'),envelope?.reducedMotion||envelope?.fault?.flashMode==='off'?1:0);gl.uniform1i(gl.getUniformLocation(program,'transitionMode'),transitionState.mode);gl.uniform1f(gl.getUniformLocation(program,'transitionProgress'),transitionState.progress);gl.drawArrays(gl.TRIANGLES,0,6);
    architecture?.draw({width:w,height:h,dpr,desktopOrigin:envelope?.desktopOrigin||{x:0,y:0},blueNoiseTexture,coherence:envelope?.coherent?1:0,negative:frontEndNegative});
  }else if(source?.src){fallback.style.display='block';fallback.src=source.src;}
  raf=requestAnimationFrame(draw);
}

function currentLabel(){try{return String(getCurrentWindow()?.label||'');}catch(_){return'browser-preview';}}
async function announceReady(){try{await emit('window-media-ready',{protocol:WINDOW_MEDIA_PROTOCOL,label:currentLabel()});}catch(_){}}
async function acceptEnvelope(payload){
  const label=currentLabel(),validation=validatePaneScoreEnvelope(payload,{targetLabel:label,currentSession,currentRevision});
  if(!validation.ok)return false;
  architecture?.dispose();architecture=null;architectureBackground=null;architectureMediaAnchor=null;
  cancelOwnedDecode();ownedFrameRevision=0;ownedFrameLoad++;ownedFrameReady=null;
  clearEventTimers();scoreSuspended=false;faultRunState=null;envelope={...payload,desktopOrigin:payload.desktopOrigin||{x:0,y:0}};currentRevision=Number(payload.revision);currentSession=String(payload.sessionToken);
  scoreClock=createWindowMediaClock({epochMs:payload.score.epochMs,nowMs:Date.now()});
  videoClock=createWindowVideoClock({score:payload.score,assignment:payload.score.initial,nowMs:Date.now(),reducedMotion:!!payload.reducedMotion});
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
function cancelOwnedDecode(){
  if(ownedFramePending){ownedFramePending.onload=null;ownedFramePending.onerror=null;ownedFramePending.removeAttribute?.('src');ownedFramePending=null;}
}
function commitOwnedFrame(){
  const ready=ownedFrameReady;if(!ready||scoreSuspended||frozen)return false;
  const{payload,image,load}=ready;ownedFrameReady=null;
  if(load!==ownedFrameLoad||!matchesActiveScore(payload))return false;
  destroySource();assignment={content:{kind:'snapshot',token:payload.token},crop:{x:0,y:0,w:1,h:1},clockMode:'source',phaseOffsetMs:0};
  source=poster=image;envelope={...envelope,snapshotData:null,snapshotFrames:{[payload.token]:payload.dataUrl}};fallback.src=payload.dataUrl;
  document.documentElement.dataset.contentId=windowMediaContentId(assignment);document.documentElement.dataset.ownedFrameRevision=String(ownedFrameRevision);return true;
}
function acceptOwnedFrame(payload){
  if(!matchesActiveScore(payload)||!String(envelope.cueId).startsWith('source-rest:apertures:')||!['rest:source','rest:answer'].includes(envelope.paneId)||scoreSuspended||frozen||!Number.isSafeInteger(payload.frameRevision)||payload.frameRevision<=ownedFrameRevision
    ||envelope.reducedMotion&&ownedFrameRevision>0||!sourceRestOwnedFramesValid([{surfaceId:payload.paneId,dataUrl:payload.dataUrl}],[envelope.paneId]))return false;
  architecture?.dispose();architecture=null;architectureBackground=null;architectureMediaAnchor=null;
  cancelOwnedDecode();ownedFrameRevision=payload.frameRevision;const load=++ownedFrameLoad,image=new Image();ownedFramePending=image;image.decoding='async';
  image.onload=()=>{
    if(load!==ownedFrameLoad||!matchesActiveScore(payload))return;
    if(ownedFramePending===image)ownedFramePending=null;
    ownedFrameReady={payload,image,load};commitOwnedFrame();
  };
  image.src=payload.dataUrl;return true;
}
function syncArchitectureBackground(pane){
  const background=pane.background;
  if(background){
    if(architectureBackground!==background.assetId){
      const elapsed=scoreClock.now(Date.now())-Number(envelope?.score?.epochMs||0);
      loadAssignment({content:{kind:'video',assetId:background.assetId,playback:'forward'},crop:{x:0,y:0,w:1,h:1},clockMode:'source',phaseOffsetMs:background.mediaTime*1000-elapsed});
      architectureBackground=background.assetId;architectureMediaAnchor=null;
    }
    const at=Date.now(),durationSeconds=Number(video?.duration)||Number(assetById.get(background.assetId)?.trim?.durationSeconds)||12;
    videoClock?.seek(background.mediaTime*1000,at,{durationSeconds});
    if(architectureMediaAnchor&&at>architectureMediaAnchor.at+8){const measured=(background.mediaTime-architectureMediaAnchor.time)/((at-architectureMediaAnchor.at)/1000);
      if(measured>.03&&measured<4&&video)try{video.playbackRate=Math.max(.0625,Math.min(4,architectureMediaAnchor.rate*.75+measured*.25));}catch(_){}
    }
    architectureMediaAnchor={at,time:background.mediaTime,rate:Number(video?.playbackRate)||1};
  }else if(architectureBackground){
    loadAssignment({content:{kind:'procedural',preset:'empty-field'},crop:{x:0,y:0,w:1,h:1},clockMode:'source',phaseOffsetMs:0});architectureBackground=null;architectureMediaAnchor=null;
  }
}
function acceptArchitecture(payload){
  if(!matchesActiveScore(payload)||!windowArchitectureCueAllowed(envelope.cueId)||!['rest:source','rest:answer'].includes(envelope.paneId)||scoreSuspended||frozen)return false;
  architecture??=createWindowMediaArchitecture({gl,surfaceId:envelope.paneId,reducedMotion:!!envelope.reducedMotion});
  if(!architecture.update(payload.packet,{revision:payload.architectureRevision}))return false;
  cancelOwnedDecode();ownedFrameLoad++;ownedFrameReady=null;
  const pane=payload.packet.panes.find(p=>p.surfaceId===envelope.paneId);
  if(Number.isFinite(pane.desktopOrigin?.x)&&Number.isFinite(pane.desktopOrigin?.y))envelope={...envelope,desktopOrigin:pane.desktopOrigin};
  syncArchitectureBackground(pane);
  document.documentElement.dataset.architectureRevision=String(payload.architectureRevision);return true;
}
function clearMediaScore(payload){
  if(String(payload?.sessionToken)!==currentSession||Number(payload?.revision)!==currentRevision)return false;
  architecture?.dispose();architecture=null;architectureBackground=null;architectureMediaAnchor=null;
  clearEventTimers();destroySource();cancelOwnedDecode();ownedFrameReady=null;ownedFrameLoad++;envelope=null;assignment=null;scoreSuspended=true;executedTimed.clear();
  videoClock=null;
  fallback.removeAttribute('src');document.documentElement.style.visibility='hidden';
  if(gl)for(const tex of [texture,staleTexture,outgoingTexture])if(tex){
    gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
  }
  return true;
}
function holdScore(payload){
  if(!matchesActiveScore(payload))return false;
  const held=payload.held!==false,now=Date.now();
  videoClock?.hold(held,now,currentVideoPosition());scoreClock.hold(held,now);scoreSuspended=held;
  architecture?.hold(held||frozen);architectureMediaAnchor=null;
  document.documentElement.dataset.scoreHeld=String(held);syncVideoPlayback();
  if(!held)commitOwnedFrame();
  return true;
}
function triggerEvent(payload){
  if(!matchesActiveScore(payload))return false;
  const raw=Date.now(),event=String(payload.event||''),lead=Math.max(0,(Number(payload.effectiveAtMs)||raw)-raw);
  for(const cue of envelope.score?.cues||[]){
    if(cue.event!==event)continue;
    pendingScoreEvents.push({atMs:scoreClock.now(raw)+lead+Math.max(0,Number(cue.delayMs)||0),action:cue.action,cueId:cue.id});
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
  globalThis.__chunkMediaArchitectureStatus=()=>({...(architecture?.snapshot()||{active:false}),session:currentSession,scoreRevision:currentRevision,cueId:envelope?.cueId||null,paneId:envelope?.paneId||null,gl:!!gl,glError:gl?.getError?.()??null,background:architectureBackground,videoReady:Number(video?.readyState)||0,videoTime:Number(video?.currentTime)||0});
  try{const ready=initGl();canvas.dataset.renderer=ready?'webgl2':'fallback';if(!ready)fallback.style.display='block';}
  catch(error){canvas.dataset.renderer='shader-error';fallback.style.display='block';console.error('window media shader unavailable',error);}
  try{await listen('window-media-score',({payload})=>{void acceptEnvelope(payload);});}catch(_){}
  try{await listen('window-media-owned-frame',({payload})=>acceptOwnedFrame(payload));}catch(_){}
  try{await listen('window-media-architecture',({payload})=>acceptArchitecture(payload));}catch(_){}
  try{await listen('window-media-trigger',({payload})=>triggerEvent(payload));}catch(_){}
  try{await listen('window-media-score-hold',({payload})=>holdScore(payload));}catch(_){}
  try{await listen('window-media-clear',({payload})=>clearMediaScore(payload));}catch(_){}
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
      scoreClock=createWindowMediaClock({epochMs:envelope.score.epochMs,nowMs:Date.now()});
      videoClock=createWindowVideoClock({score:envelope.score,assignment:envelope.score.initial,nowMs:Date.now()});
      resetScoreCycle(0);
    }
  }
  raf=requestAnimationFrame(draw);
}
void boot();
addEventListener('blur',()=>{try{const win=getCurrentWindow();void emit('window-media-focus-left',{label:win.label,cueId:String(envelope?.cueId||'')}).catch(()=>{});}catch(_){}});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();architecture?.setGl(null);gl=null;program=null;mediaQuadVao=null;});
canvas.addEventListener('webglcontextrestored',()=>{try{if(initGl()){architecture?.setGl(gl);fallback.style.display='none';}}catch(_){fallback.style.display='block';}});
addEventListener('beforeunload',()=>{cancelAnimationFrame(raf);clearEventTimers();architecture?.dispose();cancelOwnedDecode();destroySource();});
