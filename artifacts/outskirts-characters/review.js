import * as P from '/src/render/props3d.js';
import { r3dPostShader, r3dSourceVoidPhysicalShader } from '/src/render/r3d.js';
import { PIXEL_MESH_FRAG } from '/src/render/pixel-mesh/shader.js';
import { getLookProfile } from '/src/render/look-profiles.js';
import { screenUniforms } from '/src/render/pixel-mesh/screens.js';
import { OUTSKIRT_FOLD_ENCOUNTER, outskirtsPassLayout } from '/src/data/source-outskirts-arrival.js';

const $=id=>document.getElementById(id),canvas=$('scene'),status=$('status'),gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
const look=getLookProfile('explore'),controls=Object.fromEntries(['body','clip','time','stage','finish','orbit','distance','height','light'].map(id=>[id,$(id)]));
let ready=false,playing=false,lastClock=0,frame=0,handle=0,post,pixel,packStage,copy,screenVao,sceneTarget,encodedTarget,empty,noise,shaderReady=false,loadMessage='Not loaded',loadError=null,reflectionDiagnostic=null;
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1&2),(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

const copyFragment=`#version 300 es
precision highp float;uniform sampler2D uSrc;uniform vec2 uRes;uniform float uShadow;out vec4 o;
void main(){vec4 c=texture(uSrc,gl_FragCoord.xy/uRes);if(uShadow>.5){float d=c.r;float z=(2.0*.05*64.0)/(64.0+.05-(d*2.0-1.0)*(64.0-.05));c=vec4(vec3(exp(-z*.16)),1.0);}o=vec4(c.rgb,1.0);}`;
function showError(error){loadError=String(error?.stack||error);status.classList.add('error');status.textContent=loadError;playing=false;$('play').textContent='Play';$('frame-label').textContent='Review failed · see diagnostic below';}
function compile(fragment,label){
  const compileShader=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(`${label} shader: ${gl.getShaderInfoLog(shader)}`);return shader;};
  const program=gl.createProgram();gl.attachShader(program,compileShader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compileShader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`${label} link: ${gl.getProgramInfoLog(program)}`);return program;
}
function texture(w,h,data=null,{repeat=false}={}){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);return t;}
function target(w,h){const tex=texture(w,h),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('review finish framebuffer incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null);return{tex,fbo};}
function resize(){
  if(!gl)return;const dpr=Math.min(1.5,devicePixelRatio||1),w=Math.max(160,Math.round(canvas.clientWidth*dpr)),h=Math.max(160,Math.round(canvas.clientHeight*dpr));
  if(canvas.width===w&&canvas.height===h&&sceneTarget)return;canvas.width=w;canvas.height=h;P.props3dResize(w,h,{shadowMapSize:1024});
  for(const t of[sceneTarget,encodedTarget])if(t){gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fbo);}sceneTarget=target(w,h);encodedTarget=target(w,h);if(ready)render();
}
const locations=new WeakMap();
function U(program,name){let map=locations.get(program);if(!map){map=new Map();locations.set(program,map);}if(!map.has(name))map.set(name,gl.getUniformLocation(program,name));return map.get(name);}
function one(program,name,value){gl.uniform1f(U(program,name),value??0);}
function tex(program,name,unit,value){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,value);gl.uniform1i(U(program,name),unit);}
function fullscreen(program,fbo=null){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.useProgram(program);gl.bindVertexArray(screenVao);gl.uniform2f(U(program,'uRes'),canvas.width,canvas.height);}
function finish(source,depth,camera,time){
  fullscreen(packStage,sceneTarget.fbo);tex(packStage,'uProps',0,source);tex(packStage,'uDepth',1,depth);tex(packStage,'uReflection',2,P.reflectionTargets().color);tex(packStage,'uOpeningMask',3,empty);
  gl.uniform2f(U(packStage,'uNearFar'),.05,90);one(packStage,'uPitch',camera.reflection?-camera.pitch:camera.pitch);one(packStage,'uYaw',camera.yaw);one(packStage,'uTime',time);gl.uniform4f(U(packStage,'uTorch'),Number(controls.light.value),.88,.94,3.4);gl.uniform3f(U(packStage,'uEyeCells'),camera.eye[0]*2,(camera.reflection?-camera.eye[1]:camera.eye[1])*2,camera.eye[2]*2);gl.uniform3f(U(packStage,'uEyeGround'),camera.eye[0],camera.eye[2],camera.eye[1]);
  const wet=controls.body.value==='overprint'&&!camera.reflection;gl.uniform4f(U(packStage,'uReflectEye'),camera.eye[0],camera.eye[2],camera.eye[1],wet?1:0);gl.uniform4f(U(packStage,'uPuddle'),0,-1.6,8,wet?1:0);one(packStage,'uReduceMotionOptical',1);one(packStage,'uOpticalEffects',1);gl.drawArrays(gl.TRIANGLES,0,3);let input=sceneTarget.tex;
  if(controls.finish.value==='full'){
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
  fullscreen(post);tex(post,'uSrc',0,input);tex(post,'uUnravellingScene',1,input);one(post,'uTimeP',time);one(post,'uReduceFlash',1);one(post,'uReduceMotion',1);
  for(const[name,key]of Object.entries({Strength:'strength',Fringe:'fringe',Bloom:'bloom',Grain:'grain'}))one(post,`uGlass${name}`,look.glass[key]);
  for(const[name,key]of Object.entries({PostGrain:'postGrain',LumaGrain:'lumaGrain',TemporalHz:'temporalHz',TemporalSmear:'temporalSmear'}))one(post,`uRecording${name}`,look.recording[key]);
  gl.drawArrays(gl.TRIANGLES,0,3);
}
function sceneInstances(){
  const time=Number(controls.time.value),clip=controls.clip.value,loop=clip!=='fold',fold=controls.body.value==='fold';
  const pieces=outskirtsPassLayout(OUTSKIRT_FOLD_ENCOUNTER.pass).map(p=>({...p,key:p.id})),lodge=pieces.find(p=>p.key==='booth'),c=Math.cos(lodge.yaw),s=Math.sin(lodge.yaw);
  const local=p=>{const dx=p.across-lodge.across,dz=lodge.along-p.along;return{...p,id:`review-${p.key}`,x:dx*c-dz*s,y:p.y-lodge.y,z:dx*s+dz*c,yaw:p.yaw-lodge.yaw};};
  const actor=local(pieces.find(p=>p.key===OUTSKIRT_FOLD_ENCOUNTER.guardKey));
  P.setPropInstances(fold?pieces.filter(p=>p.key==='road'||p.key.startsWith('booth')&&p.key!==OUTSKIRT_FOLD_ENCOUNTER.guardKey).map(local):[{id:'review-road',mesh:'outskirts_road',x:0,y:-.015,z:0,yaw:0,noReflection:true}]);
  P.setDynamicPropInstances(fold?[{...actor,character:{clip,time,loop}}]:[-.22,0,.22].map((offset,i)=>({id:`review-overprint-${i}`,mesh:'outskirts_overprint_body',x:(i-1)*.035,y:0,z:-1.6,character:{clip,time:Math.max(0,time+offset),loop},reflectionOnly:true,noShadow:true})));
  // A reflection is inspected by looking at its virtual torso below the road.
  // Looking at the absent physical torso points the mirror camera past it.
  return fold?[actor.x,actor.y+.80,actor.z-.10]:[0,-.95,-1.6];
}
function render(){
  if(!ready||document.hidden)return;
  try{
    const center=sceneInstances(),angle=Number(controls.orbit.value)*Math.PI/180,r=Number(controls.distance.value),eye=[center[0]+Math.sin(angle)*r,Number(controls.height.value),center[2]+Math.cos(angle)*r],dx=center[0]-eye[0],dy=center[1]-eye[1],dz=center[2]-eye[2],yaw=Math.atan2(dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),time=Number(controls.time.value),light=Number(controls.light.value);
    const args={camX:eye[0],camY:eye[1],camZ:eye[2],yaw,pitch,timeSec:time,light:2.6*light,maxDistance:50,reducedMotion:false,zoneTints:new Float32Array(21*3).fill(1),ambientColor:[.66,.73,.80],ambientIntensity:.19*light,torch:{color:[.94,.96,1],reach:3.4,coneInner:.88,coneOuter:.94,spill:.12},localLightCount:2,localLightPositions:new Float32Array([eye[0]-60,eye[1]+80,eye[2]-36,260,eye[0]+45,eye[1]+18,eye[2]+20,180]),localLightColors:new Float32Array([.80,.86,.91,1.25,.92,.81,.64,.28]),localLightPenetrations:new Float32Array([1,1]),localLightEmergency:new Float32Array([0,0]),streetTextures:true};
    P.prepareCharacterFrame(++frame);P.preparePropShadowPass(args);
    const reflection=controls.stage.value==='reflection';
    if(reflection||controls.body.value==='overprint')P.renderPropPass({...args,camY:-eye[1],pitch:-pitch,reflection:true,shadowPrepared:true});
    P.renderPropPass({...args,shadowPrepared:true});const targets=P.propTargets();
    if(controls.stage.value==='shadow'||controls.stage.value==='raw'){fullscreen(copy);tex(copy,'uSrc',0,controls.stage.value==='shadow'?targets.shadow:targets.color);one(copy,'uShadow',controls.stage.value==='shadow'?1:0);gl.drawArrays(gl.TRIANGLES,0,3);}
    else {const reflected=P.reflectionTargets();finish(reflection?reflected.color:targets.color,reflection?reflected.depth:targets.depth,{eye,yaw,pitch,reflection},time);}
    gl.bindVertexArray(null);const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL error 0x${error.toString(16)}`);
    if(!playing)reflectionDiagnostic=P.reflectionStats();
    const stats=P.characterStats();$('diagnostics').textContent=JSON.stringify({shaderReady,loadMessage,characters:stats,props:P.propPackStats(),reflection:reflectionDiagnostic,context:{renderer:gl.getParameter(gl.RENDERER),maxVertexUniforms:gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)}},null,2);
    status.classList.toggle('error',!!loadError);status.textContent=`Production main + shadow + Source world composite + VFD + POST shaders linked.\n${loadMessage}${loadError?`\n${loadError}`:''}`;
    $('frame-label').textContent=`${controls.body.selectedOptions[0].text} · ${controls.clip.value} ${time.toFixed(2)} s · ${controls.stage.selectedOptions[0].text}`;
    for(const id of['time','orbit','distance','height','light'])$(`${id}-value`).textContent=`${Number(controls[id].value).toFixed(id==='orbit'?0:id==='time'?2:1)}${id==='orbit'?'°':id==='time'?' s':['distance','height'].includes(id)?' m':''}`;
  }catch(error){showError(error);}
}
async function load(){
  status.textContent='Loading actual character GLB…';loadError=null;
  try{const loaded=await P.addCharacterPack(`/assets/outskirts-characters.glb?review=${Date.now()}`);loadMessage=`Loaded ${loaded.meshes.join(', ')}\nClips: ${loaded.clips.join(', ')}`;for(const option of controls.clip.options)option.disabled=!loaded.clips.includes(option.value);}
  catch(error){loadMessage='Character pack was rejected. Architecture remains loaded.';loadError=String(error?.message||error);}
  ready=true;render();
}
function tick(clock){if(!playing||document.hidden)return;const elapsed=lastClock?(clock-lastClock)/1000:0;lastClock=clock;let time=Number(controls.time.value)+elapsed;if(time>Number(controls.time.max)){if(controls.clip.value==='fold'){controls.clip.value='writhe';controls.time.max=24;time-=12;}else time%=Number(controls.time.max);}controls.time.value=time;render();handle=requestAnimationFrame(tick);}
for(const control of Object.values(controls))control.addEventListener('input',()=>{if(control===controls.clip){controls.time.max={fold:12,writhe:24,idle:4,walk:1.1,turn:1.2}[control.value]||12;controls.time.value=Math.min(Number(controls.time.value),Number(controls.time.max));}if(control===controls.body){controls.clip.value=control.value==='fold'?'fold':'walk';controls.stage.value=control.value==='fold'?'finished':'reflection';controls.time.max=control.value==='fold'?12:1.1;controls.time.value=control.value==='fold'?0:.55;camera();}else render();});
$('play').onclick=()=>{playing=!playing;lastClock=0;$('play').textContent=playing?'Pause':'Play';if(playing)handle=requestAnimationFrame(tick);else cancelAnimationFrame(handle);};
for(const[id,time]of[['force-start',1.1],['force-end',2.55]])$(id).onclick=()=>{controls.clip.value='fold';controls.time.max=12;controls.time.value=time;render();};
function camera(reference=false){const fold=controls.body.value==='fold';controls.orbit.value=fold?180:150;controls.distance.value=reference&&fold?1.8:2.15;controls.height.value=reference&&fold?1.15:1.6;controls.light.value=.75;render();}
$('reload').onclick=load;$('reset').onclick=()=>camera();$('reference').onclick=()=>camera(true);
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;$('play').textContent='Play';cancelAnimationFrame(handle);}else render();});
window.__characterReview={render,stats:()=>({characters:P.characterStats(),props:P.propPackStats(),shaderReady,loadMessage,loadError}),set:values=>{for(const[k,v]of Object.entries(values))if(controls[k])controls[k].value=v;render();},canvas};
try{
  if(!gl)throw new Error('WebGL 2 unavailable');P.props3dInit(gl);post=compile(r3dPostShader(),'actual POST_FRAG');pixel=compile(PIXEL_MESH_FRAG,'actual PIXEL_MESH_FRAG');packStage=compile(r3dSourceVoidPhysicalShader(),'actual SOURCE_VOID_PHYSICAL_FRAG');copy=compile(copyFragment,'review target display');screenVao=gl.createVertexArray();empty=texture(1,1,new Uint8Array([0,0,0,0]));noise=texture(1,1,new Uint8Array([128,128,128,255]),{repeat:true});
  const image=new Image();image.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,noise);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,image);render();};image.src='/assets/blue-noise-64.png';
  shaderReady=true;resize();status.textContent='Production shaders linked. Loading actual world architecture…';
  await P.loadPropPack('/assets/conservatory-props.glb');await P.addPropPack('/assets/opening-street.glb');await P.addPropPack('/assets/source-structures.glb');await load();new ResizeObserver(resize).observe(canvas);
}catch(error){showError(error);}
