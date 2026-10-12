import * as P from '/src/render/props3d.js';
import productionShaders from './production-shaders.json' with {type:'json'};
import { PIXEL_MESH_FRAG } from '/src/render/pixel-mesh/shader.js';
import { getLookProfile } from '/src/render/look-profiles.js';
import { screenUniforms } from '/src/render/pixel-mesh/screens.js';
import { PRESSURE_FINISH_FRAG } from '/src/render/pressure-composite.js';
import { pressureInstances } from '/src/render/pressure-volume.js';
import { normalizePressurePresentation } from '/src/game/pressure-performance.js';
import { packShadowFrames, unpackShadowFrames, shadowFrameAt } from '/src/causal/tape.js';
const $=id=>document.getElementById(id),canvas=$('scene'),status=$('status'),gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
const look=getLookProfile('explore'),durations={pressure_hold:1,pressure_idle:9.6,pressure_approach:2.4,pressure_limp:3.4,pressure_listen:4.8,pressure_load:.50,pressure_advance:.72,pressure_pivot:.72,pressure_arrest:1};
const controls=Object.fromEntries(['clip','time','cue','cue-time','stage','orbit','distance','height','light','strength','occluder','reduced','replay-time'].map(id=>[id,$(id)]));
let ready=false,playing=false,lastClock=0,frame=0,handle=0,post,pixel,packStage,copy,volume,screenVao,sceneTarget,encodedTarget,finishedTarget,empty,noise,shaderReady=false,loadMessage='Not loaded',loadError=null;
let recording=false,recordClock=0,lastRecorded=-1,frames=[],fixture=null,replaying=false,replayClock=0;
const worldLight=()=>controls.light.value==='dark'?.16:1.1;
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1&2),(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

const copyFragment=`#version 300 es
precision highp float;uniform sampler2D uSrc;uniform vec2 uRes;uniform float uShadow;out vec4 o;
void main(){vec4 c=texture(uSrc,gl_FragCoord.xy/uRes);if(uShadow>.5){float d=c.r;float z=(2.0*.05*64.0)/(64.0+.05-(d*2.0-1.0)*(64.0-.05));c=vec4(vec3(exp(-z*.16)),1.0);}o=vec4(c.rgb,1.0);}`;
function showError(error){loadError=String(error?.stack||error);status.classList.add('error');status.textContent=loadError;playing=false;$('play').textContent='Play';$('play').setAttribute('aria-pressed','false');$('frame-label').textContent='Review failed · see diagnostic below';}
function compile(fragment,label){
  const compileShader=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(`${label} shader: ${gl.getShaderInfoLog(shader)}`);return shader;};
  const program=gl.createProgram();gl.attachShader(program,compileShader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compileShader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`${label} link: ${gl.getProgramInfoLog(program)}`);return program;
}
function texture(w,h,data=null,{repeat=false}={}){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);return t;}
function target(w,h){const tex=texture(w,h),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('review finish framebuffer incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null);return{tex,fbo};}
function resize(){
  if(!gl)return;const dpr=Math.min(1.5,devicePixelRatio||1),w=Math.max(160,Math.round(canvas.clientWidth*dpr)),h=Math.max(160,Math.round(canvas.clientHeight*dpr));
  if(canvas.width===w&&canvas.height===h&&sceneTarget)return;canvas.width=w;canvas.height=h;P.props3dResize(w,h,{shadowMapSize:1024});
  for(const t of[sceneTarget,encodedTarget,finishedTarget])if(t){gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fbo);}sceneTarget=target(w,h);encodedTarget=target(w,h);finishedTarget=target(w,h);if(ready)render();
}
const locations=new WeakMap();
function U(program,name){let map=locations.get(program);if(!map){map=new Map();locations.set(program,map);}if(!map.has(name))map.set(name,gl.getUniformLocation(program,name));return map.get(name);}
function one(program,name,value){gl.uniform1f(U(program,name),value??0);}
function tex(program,name,unit,value){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,value);gl.uniform1i(U(program,name),unit);}
function fullscreen(program,fbo=null){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.useProgram(program);gl.bindVertexArray(screenVao);gl.uniform2f(U(program,'uRes'),canvas.width,canvas.height);}
function finish(source,depth,camera,time){
  fullscreen(packStage,sceneTarget.fbo);tex(packStage,'uProps',0,source);tex(packStage,'uDepth',1,depth);tex(packStage,'uReflection',2,empty);tex(packStage,'uOpeningMask',3,empty);
  gl.uniform2f(U(packStage,'uNearFar'),.05,90);one(packStage,'uPitch',camera.reflection?-camera.pitch:camera.pitch);one(packStage,'uYaw',camera.yaw);one(packStage,'uTime',time);gl.uniform4f(U(packStage,'uTorch'),worldLight(),.88,.94,3.4);gl.uniform3f(U(packStage,'uEyeCells'),camera.eye[0]*2,(camera.reflection?-camera.eye[1]:camera.eye[1])*2,camera.eye[2]*2);gl.uniform3f(U(packStage,'uEyeGround'),camera.eye[0],camera.eye[2],camera.eye[1]);
  const wet=false;gl.uniform4f(U(packStage,'uReflectEye'),camera.eye[0],camera.eye[2],camera.eye[1],wet?1:0);gl.uniform4f(U(packStage,'uPuddle'),0,-1.6,8,wet?1:0);one(packStage,'uReduceMotionOptical',1);one(packStage,'uOpticalEffects',1);gl.drawArrays(gl.TRIANGLES,0,3);let input=sceneTarget.tex;
  {
    fullscreen(pixel,encodedTarget.fbo);tex(pixel,'uSrc',0,input);tex(pixel,'uDepth',1,input);tex(pixel,'uPrev',2,empty);tex(pixel,'uMarks',3,empty);tex(pixel,'uNoise',4,noise);
    gl.uniform2f(U(pixel,'uNoiseSize'),64,64);gl.uniform4f(U(pixel,'uGrade'),0,1,1,0);gl.uniform2f(U(pixel,'uGradePlate'),0,1);gl.uniform3fv(U(pixel,'uCam'),camera.eye);one(pixel,'uYaw',camera.yaw);one(pixel,'uPitch',camera.pitch);one(pixel,'uCellMeters',.5);one(pixel,'uTime',time);one(pixel,'uDt',1/60);
    const map={BlackPoint:'blackPoint',WhitePoint:'whitePoint',ToneGamma:'toneGamma',LineAmount:'lineAmount',ToneAmount:'toneAmount',CellPx:'cellPx',BaseRetention:'baseRetention',PaletteAmount:'paletteAmount',PaletteChroma:'paletteChroma',ShadowLift:'shadowLift',SignalAmount:'signalGain',EdgeGain:'edgeGain',Coverage:'coverage',GlowAmount:'glow',Aperture:'aperture',AmberAmount:'amber'};
    for(const[name,key]of Object.entries(map))one(pixel,`u${name}`,look.vfd[key]);
    one(pixel,'uPersistenceMs',16);one(pixel,'uReduceFlash',1);one(pixel,'uReduceMotion',1);one(pixel,'uRecordingExposure',1);
    const recording={CaptureMix:'captureMix',PatternScale:'patternScale',BlackFloor:'blackFloor',DensityGamma:'densityGamma',ThresholdNoise:'thresholdNoise',Irregularity:'thresholdIrregularity',TemporalHz:'temporalHz',TemporalSmear:'temporalSmear',ScenePinning:'scenePinning',FearGain:'fearGain',AudioGain:'audioGain'};
    for(const[name,key]of Object.entries(recording))one(pixel,`uRecording${name}`,look.recording[key]);
    const screen=screenUniforms(look.vfd.screen);gl.uniform1i(U(pixel,'uScreenKind'),screen.kind);one(pixel,'uScreenPeriodPx',screen.periodPx);gl.uniform3fv(U(pixel,'uScreenAngles'),screen.angles);gl.uniform2fv(U(pixel,'uScreenBands'),screen.bands);one(pixel,'uScreenSharpness',screen.sharpness);one(pixel,'uScreenGrainFollow',screen.grainFollow);one(pixel,'uScreenJitter',screen.jitter);
    one(pixel,'uCellPx',look.vfd.cellPx*Math.min(1.5,devicePixelRatio||1));one(pixel,'uMarkDensityGain',1);one(pixel,'uMarkGrainGain',1);gl.uniform4f(U(pixel,'uHushBodyPost'),0,0,0,0);gl.drawArrays(gl.TRIANGLES,0,3);input=encodedTarget.tex;
  }
  input=finishVolume(input,depth);
  fullscreen(post);tex(post,'uSrc',0,input);tex(post,'uUnravellingScene',1,input);one(post,'uTimeP',time);one(post,'uReduceFlash',1);one(post,'uReduceMotion',1);
  const mask=P.pressureTargets();tex(post,'uPressureGeometry',2,mask.color||empty);tex(post,'uPressureScene',3,sceneTarget.tex);tex(post,'uPressurePropsDepth',4,depth);gl.uniform2f(U(post,'uPressureNearFar'),.05,90);one(post,'uPressureReady',controls.stage.value==='final'&&mask.draws>0?1:0);one(post,'uPressureSceneDepthReady',0);
  for(const[name,key]of Object.entries({Strength:'strength',Fringe:'fringe',Bloom:'bloom',Grain:'grain'}))one(post,`uGlass${name}`,look.glass[key]);
  for(const[name,key]of Object.entries({PostGrain:'postGrain',LumaGrain:'lumaGrain',TemporalHz:'temporalHz',TemporalSmear:'temporalSmear'}))one(post,`uRecording${name}`,look.recording[key]);
  gl.drawArrays(gl.TRIANGLES,0,3);
}

const geometryFragment=`#version 300 es
precision highp float;uniform sampler2D uSrc;uniform vec2 uRes;out vec4 o;
void main(){vec4 g=texture(uSrc,gl_FragCoord.xy/uRes);float relief=mod(floor(g.b*255.0+.5),64.0)/63.0;vec3 c=vec3(.008,.014,.014);c=mix(c,vec3(.14,.23,.23)+relief*vec3(.48,.58,.56),g.a);o=vec4(c,1.0);}`;
let geometry;
function finishVolume(input,depth){
  const mask=P.pressureTargets();
  if(controls.stage.value!=='final'||!mask.ready||!mask.draws)return input;
  fullscreen(volume,finishedTarget.fbo);tex(volume,'uSrc',0,input);tex(volume,'uGeometry',1,mask.color);tex(volume,'uScene',2,sceneTarget.tex);tex(volume,'uPropsDepth',3,depth);
  gl.uniform2f(U(volume,'uPressureRes'),mask.width,mask.height);gl.uniform2f(U(volume,'uNearFar'),.05,90);
  // SourceVoid transports coverage in alpha. Only the actual props depth is
  // authoritative here; decoding that coverage as physical depth hides bodies.
  one(volume,'uSceneDepthReady',0);gl.drawArrays(gl.TRIANGLES,0,3);return finishedTarget.tex;
}
function currentPerformance(){
  if(replaying){const pose=shadowFrameAt({shadowFrames:fixture?.shadowFrames||[]},replayClock*1000);return normalizePressurePresentation(pose?.pressurePresentation);}
  const reduced=controls.reduced.checked;
  return normalizePressurePresentation({version:1,clock:recording?recordClock:Number(controls.time.value),primary:{
    id:'review-pressure',x:-.5,y:-.5,floorH:0,strength:Number(controls.strength.value),heightM:2.18,widthM:.68,radiusM:6.4,
    performance:{version:1,role:'live-pressure',heading:0,clip:reduced?'pressure_hold':controls.clip.value,
      time:reduced?0:Number(controls.time.value),loop:!reduced&&controls.clip.value!=='pressure_hold',seed:4417,manifestation:1,motion:controls.clip.value==='pressure_approach'?'hunt':controls.clip.value==='pressure_limp'?'limp':controls.clip.value==='pressure_listen'?'listen':'idle',
      cue:controls.cue.value?{name:controls.cue.value,elapsed:Number(controls['cue-time'].value)}:null,reducedMotion:reduced}},secondary:null});
}
function cameraFrame(){
  const angle=Number(controls.orbit.value)*Math.PI/180,r=Number(controls.distance.value),eye=[Math.sin(angle)*r,Number(controls.height.value),Math.cos(angle)*r];
  const dx=-eye[0],dy=1.04-eye[1],dz=-eye[2];return{eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),angle};
}
function worldInstances(angle){
  const result=[{id:'review-ground',mesh:'outskirts_road',x:0,y:-.05,z:0,yaw:Math.PI/2}];
  if(controls.occluder.checked)result.push({id:'review-depth-wall',mesh:'outskirts_boundary_wall_6',
    x:Math.sin(angle)*1+Math.cos(angle)*.24,y:0,z:Math.cos(angle)*1-Math.sin(angle)*.24,
    yaw:Math.PI/2-angle,scaleY:1.45,scaleZ:.11});
  return result;
}
function render(){
  if(!ready||document.hidden)return;
  try{
    const camera=cameraFrame(),performance=currentPerformance(),time=performance?.clock??0,light=worldLight();
    P.setPropInstances(worldInstances(camera.angle));P.setDynamicPropInstances([]);
    P.setPressureInstances(pressureInstances(performance?.primary,performance?.secondary,{mode:'live',reducedMotion:controls.reduced.checked,reduceFlash:true}));
    const args={camX:camera.eye[0],camY:camera.eye[1],camZ:camera.eye[2],yaw:camera.yaw,pitch:camera.pitch,timeSec:time,
      light:2.6*light,maxDistance:50,reducedMotion:controls.reduced.checked,zoneTints:new Float32Array(63).fill(1),
      ambientColor:[.66,.73,.80],ambientIntensity:.10*light,torch:{color:[.94,.96,1],reach:3.4,coneInner:.88,coneOuter:.94,spill:.12},
      localLightCount:1,localLightPositions:new Float32Array([camera.eye[0]-1,camera.eye[1]+2,camera.eye[2]-1,6]),
      localLightColors:new Float32Array([.80,.86,.91,.30*light]),localLightPenetrations:new Float32Array([1]),localLightEmergency:new Float32Array([0])};
    P.prepareCharacterFrame(++frame);P.preparePropShadowPass(args);P.renderPropPass({...args,shadowPrepared:true});P.renderPressurePass(args);
    const targets=P.propTargets(),mask=P.pressureTargets();
    if(controls.stage.value==='geometry'){fullscreen(geometry);tex(geometry,'uSrc',0,mask.color||empty);gl.drawArrays(gl.TRIANGLES,0,3);}
    else finish(targets.color,targets.depth,camera,time);
    gl.bindVertexArray(null);const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL error 0x${error.toString(16)}`);
    const actor=performance?.primary;
    const gait=actor?.performance.gait;
    if(replaying&&durations[actor?.performance.clip]){
      controls.clip.value=actor.performance.clip;
      controls.time.max=durations[actor.performance.clip];
      controls.time.value=actor.performance.time;
    }
    $('frame-label').textContent=`${replaying?'CAPTURE':'LIVE'} · ${gait?`${gait.phase.toUpperCase()} · `:''}${actor?.performance.clip||'absent'} ${(actor?.performance.time||0).toFixed(2)} s`;
    const bearing=Number(controls.orbit.value);$('camera-label').textContent=`${bearing}° · ${Number(controls.distance.value).toFixed(2)} m`;
    $('stage-tag').textContent=controls.stage.value==='final'?'FINAL · PRODUCTION SHADERS':controls.stage.value==='geometry'?'RAW · ACTUAL SURFACE RELIEF':'WORLD · BODY EXCLUDED';
    for(const id of['time','cue-time','orbit','distance','height','strength','replay-time'])$(`${id}-value`).textContent=`${Number(controls[id].value).toFixed(id==='orbit'?0:2)}${id==='orbit'?'°':['time','cue-time','replay-time'].includes(id)?' s':['distance','height'].includes(id)?' m':''}`;
    status.classList.toggle('error',!!loadError);status.textContent=`${loadMessage}${loadError?`\n${loadError}`:''}\n${mask.draws} geometry draws · Source world / VFD / Pressure volume / shared POST${replaying?' · recorded authority':''}`;
    $('diagnostics').textContent=JSON.stringify({shaderReady,productionShaderSha256:productionShaders.r3dSha256,loadMessage,pressure:{...mask,color:!!mask.color,depth:!!mask.depth},characters:P.characterStats(),capture:{recording,frames:frames.length,replaying,seconds:fixture?.seconds||0},descriptor:performance,renderer:gl.getParameter(gl.RENDERER)},null,2);
  }catch(error){showError(error);}
}
function setPlaying(value){playing=!!value;lastClock=0;cancelAnimationFrame(handle);$('play').textContent=playing?'Pause':'Play';$('play').setAttribute('aria-pressed',String(playing));$('replay').setAttribute('aria-pressed',String(playing&&replaying));if(playing)handle=requestAnimationFrame(tick);}
function captureSample(force=false){
  if(!recording||(!force&&recordClock-lastRecorded<.099))return;
  recordClock=Math.min(90,recordClock);
  const camera=cameraFrame();const pose={t:Math.round(recordClock*1000),x:camera.eye[0]*2-.5,y:camera.eye[2]*2-.5,floorH:0,yaw:camera.yaw,pitch:camera.pitch,spaceId:'conservatory',roomId:'pressure-review',pressurePresentation:currentPerformance()};
  if(frames.at(-1)?.t===pose.t)frames[frames.length-1]=pose;else frames.push(pose);lastRecorded=recordClock;
  if((frames.length>=900||recordClock>=90)&&!force)stopRecording();
}
function setFixture(value){fixture=value;const seconds=value?.seconds||0;controls['replay-time'].max=seconds;controls['replay-time'].value=0;controls['replay-time'].disabled=!value;$('export').disabled=!value;$('replay').disabled=!value;}
function stopRecording(){
  if(!recording)return;captureSample(true);recording=false;$('record').textContent='Record performance';$('record').setAttribute('aria-pressed','false');
  setFixture({schema:1,kind:'pressure-character-review',seconds:recordClock,shadowFrames:packShadowFrames(frames)});setPlaying(false);render();
}
function tick(clock){
  if(!playing||document.hidden||!document.hasFocus())return;
  const dt=Math.min(.1,lastClock?(clock-lastClock)/1000:0);lastClock=clock;
  if(replaying){replayClock=Math.min(fixture.seconds,replayClock+dt);controls['replay-time'].value=replayClock;if(replayClock>=fixture.seconds)setPlaying(false);}
  else{const duration=durations[controls.clip.value];controls.time.value=(Number(controls.time.value)+dt)%duration;if(controls.cue.value)controls['cue-time'].value=Math.min(5,Number(controls['cue-time'].value)+dt);if(recording){recordClock+=dt;captureSample();}}
  render();if(playing)handle=requestAnimationFrame(tick);
}
function liveControls(value){for(const id of['clip','time','cue','cue-time','strength'])controls[id].disabled=!value;}
async function load(){
  setPlaying(false);if(recording)stopRecording();loadError=null;status.textContent='Loading actual Pressure character GLB…';
  try{const loaded=await P.addCharacterPack(`/assets/pressure-character.glb?review=${Date.now()}`);loadMessage=`Loaded ${loaded.meshes.join(', ')}\nClips: ${loaded.clips.join(', ')}`;for(const option of controls.clip.options)option.disabled=!loaded.clips.includes(option.value);if(!loaded.clips.includes(controls.clip.value))controls.clip.value='pressure_hold';controls.time.max=durations[controls.clip.value];if(!loaded.meshes.includes('pressure_body'))throw new Error('pressure_body mesh absent');}
  catch(error){loadMessage='Pressure asset rejected; ordinary world remains loaded.';loadError=String(error?.message||error);}
  ready=true;render();
}
for(const [id,control]of Object.entries(controls))control.addEventListener('input',()=>{
  if(id==='clip'){controls.time.max=durations[control.value];controls.time.value=Math.min(Number(controls.time.value),Number(controls.time.max));}
  if(id==='replay-time'){replayClock=Number(control.value);setPlaying(false);}
  captureSample(true);render();
});
$('play').onclick=()=>setPlaying(!playing);
$('arrested').onclick=async()=>{
  try{
    setPlaying(false);if(recording)stopRecording();
    const response=await fetch('./arrested-performance.json',{cache:'no-store'});if(!response.ok)throw new Error('Arrested hunt capture is unavailable');
    const value=await response.json();if(value.kind!=='pressure-character-review'||value.schema!==1||!Array.isArray(value.shadowFrames))throw new Error('Invalid Arrested hunt capture');
    setFixture(value);replaying=true;replayClock=0;liveControls(false);controls.orbit.value=180;controls.distance.value=1.8;controls.height.value=1.55;controls.occluder.checked=false;render();setPlaying(true);
  }catch(error){showError(error);}
};
$('start').onclick=()=>{controls.time.value=0;captureSample(true);render();};$('end').onclick=()=>{controls.time.value=durations[controls.clip.value]/2;captureSample(true);render();};
for(const[id,angle]of[['front',180],['side',90],['rear',0]])$(id).onclick=()=>{controls.orbit.value=angle;render();};
$('reset').onclick=()=>{controls.orbit.value=180;controls.distance.value=2.65;controls.height.value=1.55;controls.light.value='dark';controls.occluder.checked=false;render();};$('reload').onclick=load;
$('record').onclick=()=>{if(recording){stopRecording();return;}replaying=false;liveControls(true);frames=[];recordClock=0;lastRecorded=-1;recording=true;$('record').textContent='Stop recording';$('record').setAttribute('aria-pressed','true');captureSample(true);setPlaying(true);};
$('export').onclick=()=>{if(!fixture)return;const blob=new Blob([JSON.stringify(fixture,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='pressure-performance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import-button').onclick=()=>$('import').click();$('import').onchange=async()=>{
  try{const file=$('import').files[0];if(!file)return;if(file.size>2_000_000)throw new Error('Capture exceeds 2 MB review limit');const value=JSON.parse(await file.text());if(value.kind!=='pressure-character-review'||value.schema!==1||!Array.isArray(value.shadowFrames))throw new Error('Not a Pressure review capture');const decoded=unpackShadowFrames(value.shadowFrames).slice(0,900);if(!decoded.length)throw new Error('Capture has no frames');const seconds=decoded.at(-1).t/1000;if(seconds>90)throw new Error('Capture exceeds 90 second review limit');stopRecording();setPlaying(false);frames=decoded;setFixture({schema:1,kind:value.kind,seconds,shadowFrames:packShadowFrames(decoded)});replaying=true;replayClock=0;liveControls(false);render();}
  catch(error){showError(error);}finally{$('import').value='';}
};
$('replay').onclick=()=>{if(!fixture)return;if(recording)stopRecording();replaying=true;liveControls(false);if(replayClock>=fixture.seconds)replayClock=0;setPlaying(true);render();};
$('live').onclick=()=>{setPlaying(false);replaying=false;liveControls(true);render();};
function suspend(){if(recording)stopRecording();setPlaying(false);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else render();});window.addEventListener('blur',suspend);
try{
  if(!gl)throw new Error('WebGL 2 unavailable');P.props3dInit(gl);post=compile(productionShaders.shaders.post,'production POST');pixel=compile(PIXEL_MESH_FRAG,'production VFD');packStage=compile(productionShaders.shaders.sourceVoidPhysical,'production Source world');volume=compile(PRESSURE_FINISH_FRAG,'production Pressure volume');geometry=compile(geometryFragment,'geometry inspection');copy=compile(copyFragment,'target display');screenVao=gl.createVertexArray();empty=texture(1,1,new Uint8Array([0,0,0,0]));noise=texture(1,1,new Uint8Array([128,128,128,255]),{repeat:true});
  const image=new Image();image.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,noise);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,image);render();};image.src='/assets/blue-noise-64.png';
  shaderReady=true;resize();await P.loadPropPack('/assets/conservatory-props.glb');await load();new ResizeObserver(resize).observe(canvas);
}catch(error){showError(error);}
